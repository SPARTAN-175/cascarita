const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();
const auth = getAuth();
const REGION = 'us-east1';
const FOUNDER_EMAIL = 'avengers_0077@hotmail.com';

function requireSuperadmin(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Inicia sesión primero.');
  if (request.auth.token.superadmin !== true) throw new HttpsError('permission-denied', 'Solo el superadministrador puede realizar esta operación.');
  return request.auth.uid;
}
function text(v, max = 120) { return String(v ?? '').trim().slice(0, max); }

// Bootstrap protegido: la cuenta fundadora conserva verificación obligatoria.
exports.claimFounderSuperadmin = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Inicia sesión primero.');
  const token = request.auth.token;
  if (String(token.email || '').toLowerCase() !== FOUNDER_EMAIL || token.email_verified !== true) {
    throw new HttpsError('permission-denied', 'La cuenta fundadora debe tener el correo verificado.');
  }
  const user = await auth.getUser(request.auth.uid);
  if (String(user.email || '').toLowerCase() !== FOUNDER_EMAIL || user.emailVerified !== true) {
    throw new HttpsError('permission-denied', 'Verifica el correo de la cuenta fundadora.');
  }
  await auth.setCustomUserClaims(user.uid, { ...(user.customClaims || {}), admin: true, superadmin: true });
  return { ok: true, message: 'Permisos de superadministración asignados.' };
});

exports.adminSaveLeague = onCall({ region: REGION }, async (request) => {
  const uid = requireSuperadmin(request), d = request.data || {};
  const id = text(d.leagueId, 128);
  const allowedStatus = ['draft', 'registration', 'active', 'paused', 'finished', 'archived'];
  const payload = {};
  for (const k of ['name','season','city','branch','category','modality','format','tieBreakers']) if (d[k] !== undefined) payload[k] = text(d[k], 120);
  if (d.status !== undefined) {
    if (!allowedStatus.includes(d.status)) throw new HttpsError('invalid-argument', 'Estado de competición inválido.');
    payload.status = d.status;
  }
  for (const k of ['teamLimit','legs','pointsWin','pointsDraw','pointsLoss']) if (d[k] !== undefined) payload[k] = Number(d[k]);
  if (!id && (!payload.name || !payload.season || !payload.city)) throw new HttpsError('invalid-argument', 'Completa nombre, temporada y municipio.');
  if (payload.teamLimit !== undefined && (!Number.isInteger(payload.teamLimit) || payload.teamLimit < 2 || payload.teamLimit > 64)) throw new HttpsError('invalid-argument', 'El cupo debe estar entre 2 y 64 equipos.');
  if (payload.legs !== undefined && ![1,2].includes(payload.legs)) throw new HttpsError('invalid-argument', 'Selecciona una o dos vueltas.');
  for (const k of ['pointsWin','pointsDraw','pointsLoss']) if (payload[k] !== undefined && (!Number.isInteger(payload[k]) || payload[k] < 0 || payload[k] > 10)) throw new HttpsError('invalid-argument', 'Los puntos deben ser números enteros entre 0 y 10.');
  if (payload.modality && payload.modality !== 'Fútbol 11') throw new HttpsError('invalid-argument', 'Por ahora CASCARITA solo admite Fútbol 11.');
  if (payload.format && payload.format !== 'round_robin') throw new HttpsError('invalid-argument', 'Por ahora solo está disponible todos contra todos.');
  if (id) {
    const ref = db.collection('leagues').doc(id);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref); if (!snap.exists) throw new HttpsError('not-found', 'Competición no encontrada.');
      tx.update(ref, { ...payload, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid });
    });
    return { ok: true, id };
  }
  const ref = await db.collection('leagues').add({ ...payload, modality: payload.modality || 'Fútbol 11', format: payload.format || 'round_robin', teamLimit: payload.teamLimit || 16, legs: payload.legs || 2, pointsWin: payload.pointsWin ?? 3, pointsDraw: payload.pointsDraw ?? 1, pointsLoss: payload.pointsLoss ?? 0, createdBy: uid, createdAt: FieldValue.serverTimestamp(), fixturesGenerated: false });
  return { ok: true, id: ref.id };
});

exports.adminDeleteLeague = onCall({ region: REGION, timeoutSeconds: 540, memory: "1GiB" }, async (request) => {
  const actorUid = requireSuperadmin(request);
  const id = text(request.data?.leagueId, 128);
  if (!id) throw new HttpsError('invalid-argument', 'Falta la competición.');

  const leagueRef = db.collection('leagues').doc(id);
  const leagueSnap = await leagueRef.get();
  if (!leagueSnap.exists) throw new HttpsError('not-found', 'Competición no encontrada.');

  // Una competición es independiente de los clubes, equipos y futbolistas.
  // Al eliminarla solo se desvinculan los equipos y se retiran sus partidos
  // y solicitudes de inscripción. Los equipos, rosters, jugadores y usuarios
  // permanecen intactos para que puedan inscribirse en otra liga.
  const [teamSnap, matchSnap, teamRequestSnap] = await Promise.all([
    db.collection('teams').where('leagueId', '==', id).get(),
    db.collection('matches').where('leagueId', '==', id).get(),
    db.collection('teamRequests').where('leagueId', '==', id).get()
  ]);

  // Quitar únicamente la relación con esta competición. No tocar status,
  // roster, perfiles de players ni documentos de users.
  for (let i = 0; i < teamSnap.docs.length; i += 450) {
    const batch = db.batch();
    teamSnap.docs.slice(i, i + 450).forEach(teamDoc => {
      batch.update(teamDoc.ref, {
        leagueId: FieldValue.delete(),
        leagueName: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp()
      });
    });
    await batch.commit();
  }

  const relatedDocs = [...matchSnap.docs, ...teamRequestSnap.docs];
  for (let i = 0; i < relatedDocs.length; i += 450) {
    const batch = db.batch();
    relatedDocs.slice(i, i + 450).forEach(docSnap => batch.delete(docSnap.ref));
    await batch.commit();
  }

  await leagueRef.delete();
  await db.collection('adminAudit').add({
    action: 'league_deleted_teams_preserved',
    leagueId: id,
    leagueName: text(leagueSnap.data()?.name, 160),
    unlinkedTeams: teamSnap.size,
    deletedMatches: matchSnap.size,
    deletedTeamRequests: teamRequestSnap.size,
    preservedRosters: true,
    preservedPlayers: true,
    actorUid,
    createdAt: FieldValue.serverTimestamp()
  });

  return {
    ok: true,
    message: `Competición eliminada. Se conservaron ${teamSnap.size} equipos con sus plantillas y jugadores. Se retiraron ${matchSnap.size} encuentros y ${teamRequestSnap.size} solicitudes vinculadas a esta competición.`
  };
});

exports.reviewTeamRequest = onCall({ region: REGION }, async (request) => {
  const adminUid = requireSuperadmin(request), id = text(request.data?.requestId, 128), status = request.data?.status;
  if (!id || !['approved','rejected'].includes(status)) throw new HttpsError('invalid-argument', 'Solicitud o decisión inválida.');
  const reqRef = db.collection('teamRequests').doc(id);
  let teamId = null;
  await db.runTransaction(async tx => {
    const req = await tx.get(reqRef); if (!req.exists) throw new HttpsError('not-found', 'Solicitud no encontrada.');
    const r = req.data(); if (r.status !== 'pending') throw new HttpsError('failed-precondition', 'Esta solicitud ya fue revisada.');
    if (status === 'rejected') { tx.update(reqRef, { status, reviewedAt: FieldValue.serverTimestamp(), reviewedBy: adminUid }); return; }
    const leagueRef = db.collection('leagues').doc(text(r.leagueId,128));
    const league = await tx.get(leagueRef); if (!league.exists) throw new HttpsError('not-found', 'La competición ya no existe.');
    const l = league.data(); if (!['registration','active'].includes(l.status)) throw new HttpsError('failed-precondition', 'La competición no está recibiendo equipos.');
    const teams = await tx.get(db.collection('teams').where('leagueId','==',leagueRef.id));
    if (teams.size >= Number(l.teamLimit || 16)) throw new HttpsError('resource-exhausted', 'La competición alcanzó su cupo máximo.');
    const teamRef = db.collection('teams').doc(); teamId = teamRef.id;
    tx.create(teamRef, { name: text(r.teamName || r.name,100), teamName: text(r.teamName || r.name,100), leagueId: leagueRef.id, leagueName: l.name, clubId: text(r.clubId,128), clubName: text(r.clubName,120), city: text(r.city || l.city,120), branch: text(r.branch || l.branch,60), category: text(r.category || l.category,80), status: 'active', managerUid: text(r.uid,128), createdBy: text(r.uid,128), createdAt: FieldValue.serverTimestamp(), approvedAt: FieldValue.serverTimestamp() });
    tx.update(reqRef, { status, teamId, reviewedAt: FieldValue.serverTimestamp(), reviewedBy: adminUid });
  });
  return { ok: true, teamId, message: status === 'approved' ? 'Equipo aprobado y agregado a la competición.' : 'Solicitud rechazada.' };
});

exports.setUserAccessStatus = onCall({ region: REGION }, async (request) => {
  const adminUid = requireSuperadmin(request), uid = text(request.data?.uid,128), status = request.data?.status;
  if (!uid || !['active','suspended','deactivated'].includes(status)) throw new HttpsError('invalid-argument', 'Usuario o estado inválido.');
  if (uid === adminUid) throw new HttpsError('failed-precondition', 'No puedes suspender tu propia cuenta.');
  const target = await auth.getUser(uid);
  if (target.customClaims?.superadmin === true) throw new HttpsError('permission-denied', 'No puedes suspender otra cuenta superadministradora.');
  await auth.updateUser(uid, { disabled: status !== 'active' });
  await db.collection('users').doc(uid).set({ status, accessUpdatedAt: FieldValue.serverTimestamp(), accessUpdatedBy: adminUid }, { merge: true });
  await db.collection('adminAudit').add({ action: status === 'active' ? 'user_reactivated' : status === 'deactivated' ? 'user_deactivated' : 'user_suspended', targetUid: uid, actorUid: adminUid, createdAt: FieldValue.serverTimestamp() });
  return { ok: true };
});

exports.reviewRoleRequest = onCall({ region: REGION }, async (request) => {
  const adminUid = requireSuperadmin(request), id = text(request.data?.requestId,128), status = request.data?.status;
  if (!id || !['approved','rejected'].includes(status)) throw new HttpsError('invalid-argument','Solicitud o decisión inválida.');
  const ref = db.collection('roleRequests').doc(id);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref); if (!snap.exists) throw new HttpsError('not-found','Solicitud no encontrada.');
    const r = snap.data(); if (r.status !== 'pending') throw new HttpsError('failed-precondition','La solicitud ya fue revisada.');
    if (status === 'approved') {
      if (!r.uid || !r.role || r.role === 'Superadministrador' || r.role === 'Administrador') throw new HttpsError('permission-denied','Ese rol no puede asignarse desde solicitudes.');
      const userRef = db.collection('users').doc(r.uid), user = await tx.get(userRef);
      if (!user.exists) throw new HttpsError('not-found','Usuario no encontrado.');
      const roles = Array.isArray(user.data().roles) ? user.data().roles : ['Aficionado'];
      if (!roles.includes(r.role)) tx.update(userRef,{ roles: [...roles,r.role], updatedAt: FieldValue.serverTimestamp() });
    }
    tx.update(ref,{ status, reviewedAt: FieldValue.serverTimestamp(), reviewedBy: adminUid });
  });
  return { ok: true };
});

exports.reviewOrganizationRequest = onCall({ region: REGION }, async (request) => {
  const adminUid = requireSuperadmin(request), id = text(request.data?.requestId,128), kind = request.data?.kind, status = request.data?.status;
  if (!id || !['club','organization'].includes(kind) || !['approved','rejected'].includes(status)) throw new HttpsError('invalid-argument','Datos de solicitud inválidos.');
  const collectionName = kind === 'club' ? 'clubRequests' : 'organizationRequests';
  const ref = db.collection(collectionName).doc(id);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref); if (!snap.exists) throw new HttpsError('not-found','Solicitud no encontrada.');
    if (snap.data().status !== 'pending') throw new HttpsError('failed-precondition','La solicitud ya fue revisada.');
    tx.update(ref,{ status, reviewedAt: FieldValue.serverTimestamp(), reviewedBy: adminUid });
  });
  return { ok: true };
});

function roundRobin(input, legs) {
  const teams = [...input]; if (teams.length % 2) teams.push(null);
  const n = teams.length, rounds = n - 1, half = n / 2, fixtures = [];
  let arr = teams.slice();
  for (let round=0; round<rounds; round++) {
    for (let i=0;i<half;i++) {
      const a=arr[i], b=arr[n-1-i]; if (!a || !b) continue;
      const flip = (round + i) % 2 === 1;
      fixtures.push({ round: round+1, home: flip ? b : a, away: flip ? a : b });
    }
    arr = [arr[0], arr[n-1], ...arr.slice(1,n-1)];
  }
  const first = fixtures.slice();
  if (legs === 2) for (const m of first) fixtures.push({ round: m.round+rounds, home: m.away, away: m.home });
  return fixtures;
}
exports.generateLeagueFixtures = onCall({ region: REGION, timeoutSeconds: 540 }, async (request) => {
  const adminUid = requireSuperadmin(request), id = text(request.data?.leagueId,128);
  if (!id) throw new HttpsError('invalid-argument','Falta la competición.');
  const leagueRef = db.collection('leagues').doc(id);
  const lock = await db.runTransaction(async tx => {
    const l = await tx.get(leagueRef); if (!l.exists) throw new HttpsError('not-found','Competición no encontrada.');
    const x=l.data(); if (x.fixturesGenerated || x.fixturesGenerationStatus === 'generating') throw new HttpsError('already-exists','El calendario ya fue generado o está en proceso.');
    if (!['registration','active'].includes(x.status)) throw new HttpsError('failed-precondition','Abre las inscripciones o activa la competición antes de generar el calendario.');
    tx.update(leagueRef,{ fixturesGenerationStatus:'generating', fixturesGenerationStartedAt:FieldValue.serverTimestamp(), fixturesGenerationBy:adminUid });
    return x;
  });
  try {
    const teamSnap = await db.collection('teams').where('leagueId','==',id).where('status','==','active').get();
    const teams = teamSnap.docs.map(d=>({id:d.id,name:text(d.data().name || d.data().teamName,100)}));
    if (teams.length < 2) throw new HttpsError('failed-precondition','Se necesitan al menos dos equipos aprobados.');
    if (teams.length > Number(lock.teamLimit || 16)) throw new HttpsError('failed-precondition','Hay más equipos que el cupo configurado.');
    const existing = await db.collection('matches').where('leagueId','==',id).get();
    if (!existing.empty) {
      const docs = existing.docs;
      const legacyTestCalendar = docs.every(d => d.data().isTestData === true && !!d.data().testBatchId && d.data().approvalStatus === 'approved');
      if (legacyTestCalendar) {
        const rounds = new Set(docs.map(d => Number(d.data().round)||0));
        for (let i=0;i<docs.length;i+=400) {
          const b=db.batch();
          docs.slice(i,i+400).forEach(d=>{
            const current=String(d.data().status||'').toLowerCase();
            if (!['final','completed','finished'].includes(current)) b.update(d.ref,{status:'scheduled',updatedAt:FieldValue.serverTimestamp()});
          });
          await b.commit();
        }
        await leagueRef.update({ fixturesGenerated:true, fixturesGenerationStatus:'complete', fixturesGeneratedAt:FieldValue.serverTimestamp(), fixturesCount:docs.length, fixturesReusedFromTestImport:true });
        return { ok:true, count:docs.length, reused:true, message:`Se recuperó el calendario existente del lote aprobado: ${docs.length} encuentros en ${rounds.size} jornadas. No se duplicaron partidos.` };
      }
      throw new HttpsError('already-exists','Ya existen partidos; no se regenerará para proteger resultados. Consulta el calendario existente.');
    }
    const fixtures = roundRobin(teams, Number(lock.legs || 2));
    for (let i=0;i<fixtures.length;i+=400) {
      const batch=db.batch();
      fixtures.slice(i,i+400).forEach(m=>{const ref=db.collection('matches').doc();batch.create(ref,{leagueId:id,leagueName:lock.name,homeTeam:m.home.name,awayTeam:m.away.name,homeTeamId:m.home.id,awayTeamId:m.away.id,round:m.round,status:'scheduled',kickoff:null,homeGoals:null,awayGoals:null,createdBy:adminUid,createdAt:FieldValue.serverTimestamp(),generated:true});});
      await batch.commit();
    }
    await leagueRef.update({ fixturesGenerated:true, fixturesGenerationStatus:'complete', fixturesGeneratedAt:FieldValue.serverTimestamp(), fixturesCount:fixtures.length });
    return { ok:true, count:fixtures.length, message:`Calendario generado: ${fixtures.length} encuentros en ${Math.max(...fixtures.map(x=>x.round))} jornadas.` };
  } catch (e) {
    await leagueRef.set({fixturesGenerationStatus:'failed',fixturesGenerationError:text(e.message,300)}, {merge:true});
    throw e instanceof HttpsError ? e : new HttpsError('internal',e.message || 'No se pudo generar el calendario.');
  }
});


exports.adminUpdateLeagueMatch = onCall({ region: REGION }, async (request) => {
  const adminUid = requireSuperadmin(request);
  const matchId = text(request.data?.matchId, 128);
  const kickoffIso = text(request.data?.kickoffIso, 40);
  const venue = text(request.data?.venue, 120);
  const homeRaw = request.data?.homeGoals;
  const awayRaw = request.data?.awayGoals;
  if (!matchId) throw new HttpsError('invalid-argument', 'Falta el encuentro.');
  if (kickoffIso && !/^\d{4}-\d{2}-\d{2}T/.test(kickoffIso)) throw new HttpsError('invalid-argument', 'Fecha y hora inválidas.');
  const hasHome = homeRaw !== '' && homeRaw !== null && homeRaw !== undefined;
  const hasAway = awayRaw !== '' && awayRaw !== null && awayRaw !== undefined;
  if (hasHome !== hasAway) throw new HttpsError('invalid-argument', 'Captura los goles de ambos equipos o deja ambos campos vacíos.');
  let homeGoals = null, awayGoals = null;
  if (hasHome && hasAway) {
    homeGoals = Number(homeRaw); awayGoals = Number(awayRaw);
    if (!Number.isInteger(homeGoals) || !Number.isInteger(awayGoals) || homeGoals < 0 || awayGoals < 0 || homeGoals > 99 || awayGoals > 99) {
      throw new HttpsError('invalid-argument', 'Los marcadores deben ser números enteros entre 0 y 99.');
    }
  }
  const matchRef = db.collection('matches').doc(matchId);
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) throw new HttpsError('not-found', 'Encuentro no encontrado.');
  const match = matchSnap.data();
  const payload = { venue, updatedAt: FieldValue.serverTimestamp(), updatedBy: adminUid };
  if (kickoffIso) {
    const kickoff = new Date(kickoffIso);
    if (!Number.isFinite(kickoff.getTime())) throw new HttpsError('invalid-argument', 'No se pudo interpretar la fecha y hora.');
    payload.kickoff = Timestamp.fromDate(kickoff);
  }
  if (hasHome && hasAway) {
    payload.homeGoals = homeGoals; payload.awayGoals = awayGoals;
    payload.status = 'final'; payload.completedAt = FieldValue.serverTimestamp(); payload.resultEnteredBy = adminUid;
  } else if (match.status === 'final' || match.status === 'completed' || match.status === 'finished') {
    payload.homeGoals = null; payload.awayGoals = null; payload.status = 'scheduled';
    payload.completedAt = FieldValue.delete(); payload.resultEnteredBy = FieldValue.delete();
  }
  await matchRef.update(payload);
  return { ok: true, message: hasHome ? 'Resultado guardado y clasificación actualizada.' : 'Programación del encuentro actualizada.' };
});


// Importación masiva y limpieza selectiva del laboratorio de pruebas CASCARITA.
// No crea cuentas de Firebase Authentication ni elimina usuarios/competiciones.
function safeDocId(value, max=100) { return String(value ?? '').replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,max); }
function makeRoundRobin(teamList, legs=2) {
  const arr0=[...teamList]; if(arr0.length%2)arr0.push(null);
  const n=arr0.length, rounds=n-1, half=n/2, first=[]; let arr=arr0.slice();
  for(let round=0;round<rounds;round++){
    for(let i=0;i<half;i++){const a=arr[i],b=arr[n-1-i];if(!a||!b)continue;const flip=(round+i)%2===1;first.push({round:round+1,home:flip?b:a,away:flip?a:b});}
    arr=[arr[0],arr[n-1],...arr.slice(1,n-1)];
  }
  return legs===2?[...first,...first.map(m=>({round:m.round+rounds,home:m.away,away:m.home}))]:first;
}

function assertTeamManager(uid, team) {
  if (!team || ![team.managerUid, team.createdBy, team.ownerUid, team.managerId].includes(uid)) {
    throw new HttpsError('permission-denied', 'No tienes autorización para administrar este equipo.');
  }
}


exports.managerAddPlayerByEmail = onCall({ region: REGION, cors: ['https://spartan-175.github.io'] }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Inicia sesión primero.');
  const uid=request.auth.uid, teamId=text(request.data?.teamId,128), email=text(request.data?.email,160).toLowerCase();
  if(!teamId||!email) throw new HttpsError('invalid-argument','Indica el equipo y el correo del jugador.');
  const teamSnap=await db.collection('teams').doc(teamId).get();
  if(!teamSnap.exists) throw new HttpsError('not-found','El equipo no existe.');
  assertTeamManager(uid,teamSnap.data());
  let authUser;
  try{authUser=await auth.getUserByEmail(email)}catch(e){throw new HttpsError('not-found','No encontramos una cuenta con ese correo. El jugador debe registrarse primero.');}
  const userSnap=await db.collection('users').doc(authUser.uid).get();
  if(!userSnap.exists) throw new HttpsError('failed-precondition','La cuenta del jugador aún no tiene perfil CASCARITA.');
  const user=userSnap.data(), position=text(request.data?.position,60), number=Number(request.data?.number||0);
  if(!Number.isInteger(number)||number<0||number>99) throw new HttpsError('invalid-argument','Dorsal inválido.');
  const rosterRef=db.collection('teams').doc(teamId).collection('roster').doc(authUser.uid);
  await db.runTransaction(async tx=>{
    const existing=await tx.get(rosterRef);
    if(existing.exists) throw new HttpsError('already-exists','Este jugador ya está en la plantilla.');
    tx.set(rosterRef,{uid:authUser.uid,email:text(user.email||authUser.email,160),displayName:text(user.displayName||authUser.displayName,100),position,number,status:'active',joinedAt:FieldValue.serverTimestamp()});
    tx.set(db.collection('players').doc(authUser.uid),{uid:authUser.uid,displayName:text(user.displayName||authUser.displayName,100),position,teamId,teamName:text(teamSnap.data().name||teamSnap.data().teamName,100),visibility:'public',updatedAt:FieldValue.serverTimestamp()},{merge:true});
  });
  return {ok:true,message:'Jugador agregado a la plantilla.'};
});

exports.managerAddPlayer = onCall({ region: REGION, cors: ['https://spartan-175.github.io'] }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Inicia sesión primero.');
  const uid=request.auth.uid, teamId=text(request.data?.teamId,128), playerUid=text(request.data?.playerUid,128);
  if(!teamId||!playerUid) throw new HttpsError('invalid-argument','Falta el equipo o el jugador.');
  const teamRef=db.collection('teams').doc(teamId), userRef=db.collection('users').doc(playerUid);
  const [teamSnap,userSnap]=await Promise.all([teamRef.get(),userRef.get()]);
  if(!teamSnap.exists) throw new HttpsError('not-found','El equipo no existe.');
  assertTeamManager(uid,teamSnap.data());
  if(!userSnap.exists) throw new HttpsError('not-found','El jugador debe tener una cuenta registrada.');
  const user=userSnap.data(), position=text(request.data?.position,60), number=Number(request.data?.number||0);
  if(!Number.isInteger(number)||number<0||number>99) throw new HttpsError('invalid-argument','Dorsal inválido.');
  const rosterRef=teamRef.collection('roster').doc(playerUid);
  await db.runTransaction(async tx=>{
    const existing=await tx.get(rosterRef);
    if(existing.exists) throw new HttpsError('already-exists','Este jugador ya está en la plantilla.');
    tx.set(rosterRef,{uid:playerUid,email:text(user.email,160),displayName:text(user.displayName,100),position,number,status:'active',joinedAt:FieldValue.serverTimestamp()});
    tx.set(db.collection('players').doc(playerUid),{uid:playerUid,displayName:text(user.displayName,100),position,teamId,teamName:text(teamSnap.data().name||teamSnap.data().teamName,100),visibility:'public',updatedAt:FieldValue.serverTimestamp()},{merge:true});
  });
  return {ok:true,message:'Jugador agregado a la plantilla.'};
});

exports.reviewTransferRequest = onCall({ region: REGION, cors: ['https://spartan-175.github.io'] }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated','Inicia sesión primero.');
  const uid=request.auth.uid, requestId=text(request.data?.requestId,128), accepted=request.data?.accepted===true;
  if(!requestId) throw new HttpsError('invalid-argument','Solicitud inválida.');
  let playerUid='', teamId='';
  await db.runTransaction(async tx=>{
    const reqRef=db.collection('transferRequests').doc(requestId), req=await tx.get(reqRef);
    if(!req.exists) throw new HttpsError('not-found','Solicitud no encontrada.');
    const r=req.data(); teamId=text(r.teamId,128); playerUid=text(r.playerUid,128);
    const teamRef=db.collection('teams').doc(teamId), team=await tx.get(teamRef);
    if(!team.exists) throw new HttpsError('not-found','El equipo ya no existe.');
    assertTeamManager(uid,team.data());
    if(r.status!=='pending') throw new HttpsError('failed-precondition','La solicitud ya fue revisada.');
    if(accepted){
      const userRef=db.collection('users').doc(playerUid), user=await tx.get(userRef);
      if(!user.exists) throw new HttpsError('not-found','La cuenta del jugador ya no existe.');
      tx.set(teamRef.collection('roster').doc(playerUid),{uid:playerUid,email:text(user.data().email||r.playerEmail,160),displayName:text(user.data().displayName||r.playerName,100),position:text(r.position,60),status:'active',joinedAt:FieldValue.serverTimestamp()});
      tx.set(db.collection('players').doc(playerUid),{uid:playerUid,displayName:text(user.data().displayName||r.playerName,100),position:text(r.position,60),teamId,teamName:text(team.data().name||team.data().teamName,100),visibility:'public',updatedAt:FieldValue.serverTimestamp()},{merge:true});
    }
    tx.update(reqRef,{status:accepted?'accepted':'rejected',reviewedBy:uid,reviewedAt:FieldValue.serverTimestamp()});
  });
  return {ok:true,message:accepted?'Solicitud aceptada y jugador incorporado.':'Solicitud rechazada.'};
});

exports.importTestLeague = onCall({ region: REGION, cors: ['https://spartan-175.github.io'], timeoutSeconds: 540, memory: '1GiB' }, async (request) => {
  const adminUid=requireSuperadmin(request), leagueId=text(request.data?.leagueId,128), payload=request.data?.payload;
  if(!leagueId||!payload||payload.schema!=='cascarita.test-data'||payload.schemaVersion!==1)throw new HttpsError('invalid-argument','Archivo o competición inválidos.');
  if(payload.safety?.isTestData!==true||payload.safety?.noFirebaseAuthAccounts!==true)throw new HttpsError('invalid-argument','El archivo no está marcado como datos de prueba seguros.');
  const teams=payload.teams, players=payload.players, batchId=text(payload.batchId,100);
  if(!batchId||!Array.isArray(teams)||teams.length!==16||!Array.isArray(players)||players.length!==320)throw new HttpsError('invalid-argument','El archivo debe contener exactamente 16 equipos y 320 jugadores.');
  const leagueRef=db.collection('leagues').doc(leagueId), batchRef=db.collection('testImportBatches').doc(safeDocId(batchId));
  const leagueSnap=await leagueRef.get(); if(!leagueSnap.exists)throw new HttpsError('not-found','La competición seleccionada no existe.');
  const league=leagueSnap.data(); if(!['draft','registration','active'].includes(league.status))throw new HttpsError('failed-precondition','La competición debe estar en preparación, inscripción o activa.');
  if(teams.length>Number(league.teamLimit||16))throw new HttpsError('resource-exhausted','El cupo de la competición es menor que los 16 equipos del archivo.');
  if(String(league.branch||'').toLowerCase()!==String(payload.competition.branch||'').toLowerCase())throw new HttpsError('failed-precondition','La rama del archivo no coincide con la competición.');
  const existingBatch=await batchRef.get(); if(existingBatch.exists)throw new HttpsError('already-exists','Este lote ya fue importado. Primero limpia el lote anterior.');
  const currentTeams=await db.collection('teams').where('leagueId','==',leagueId).limit(1).get(); if(!currentTeams.empty)throw new HttpsError('failed-precondition','La competición ya tiene equipos. Para evitar mezclar datos, importa en una competición vacía.');
  const teamIds=new Set(teams.map(t=>String(t.id))); if(teamIds.size!==16)throw new HttpsError('invalid-argument','Hay identificadores de equipo duplicados.');
  const playerIds=new Set(players.map(p=>String(p.id))); if(playerIds.size!==320)throw new HttpsError('invalid-argument','Hay identificadores de jugador duplicados.');
  const playerCounts=new Map(); for(const p of players){if(!teamIds.has(String(p.teamId)))throw new HttpsError('invalid-argument','Hay jugadores asociados a un equipo inexistente.');playerCounts.set(p.teamId,(playerCounts.get(p.teamId)||0)+1);if(!p.name||!p.position)throw new HttpsError('invalid-argument','Cada jugador debe tener nombre y posición.');}
  if(teams.some(t=>playerCounts.get(t.id)!==20))throw new HttpsError('invalid-argument','Cada equipo debe tener exactamente 20 jugadores.');
  await db.runTransaction(async tx=>{const b=await tx.get(batchRef);if(b.exists)throw new HttpsError('already-exists','El lote ya existe.');tx.create(batchRef,{batchId,leagueId,leagueName:text(league.name,120),status:'importing',approvalStatus:'pending',teamCount:16,playerCount:320,createdBy:adminUid,createdAt:FieldValue.serverTimestamp(),isTestData:true});});
  try{
    const teamDocIds=new Map(); teams.forEach(t=>teamDocIds.set(t.id,`${safeDocId(batchId,40)}_${safeDocId(t.id,60)}`));
    const playerDocIds=new Map(); players.forEach(p=>playerDocIds.set(p.id,`${safeDocId(batchId,40)}_${safeDocId(p.id,60)}`));
    const writes=[];
    for(const t of teams){const id=teamDocIds.get(t.id), rosterIds=players.filter(p=>p.teamId===t.id).map(p=>playerDocIds.get(p.id));writes.push({ref:db.collection('teams').doc(id),data:{...t,id,sourceId:t.id,roster:rosterIds,leagueId,leagueName:league.name,leagueStatus:'pending',status:'pending_approval',approvalStatus:'pending',managerUid:adminUid,createdBy:adminUid,isTestData:true,testBatchId:batchId,createdAt:FieldValue.serverTimestamp()}});}
    for(const p of players){const id=playerDocIds.get(p.id), teamId=teamDocIds.get(p.teamId), teamName=teams.find(t=>t.id===p.teamId).name;writes.push({ref:db.collection('players').doc(id),data:{...p,id,sourceId:p.id,teamId,teamName,leagueId,visibility:'pending',isTestData:true,testBatchId:batchId,createdAt:FieldValue.serverTimestamp()}});writes.push({ref:db.collection('teams').doc(teamId).collection('roster').doc(id),data:{playerId:id,sourceId:p.id,displayName:text(p.name,100),position:text(p.position,60),number:Number(p.number||p.jerseyNumber||0),status:'active',isTestData:true,testBatchId:batchId,joinedAt:FieldValue.serverTimestamp()}});}
    // El calendario NO se crea durante la importación: primero se aprueban los equipos.
    // Después el superadministrador genera el calendario desde la ficha de la competición.
    for(let i=0;i<writes.length;i+=400){const batch=db.batch();for(const w of writes.slice(i,i+400))batch.create(w.ref,w.data);await batch.commit();}
    await batchRef.update({status:'awaiting_approval',approvalStatus:'pending',fixtureCount:0,roundCount:0,completedAt:FieldValue.serverTimestamp()});
    await leagueRef.set({testDataImported:true,testDataBatchId:batchId},{merge:true});
    return {ok:true,teams:16,players:320,matches:0,message:'Importación completada: 16 equipos y 320 jugadores quedaron pendientes de aprobación. El calendario se generará después de aprobarlos.'};
  }catch(e){await batchRef.set({status:'failed',error:text(e.message,300),failedAt:FieldValue.serverTimestamp()},{merge:true});throw e instanceof HttpsError?e:new HttpsError('internal',e.message||'Falló la importación. Puedes limpiar el lote parcial desde el laboratorio.');}
});

// Revisión de equipos/lotes del laboratorio. Solo modifica datos marcados explícitamente como prueba.
exports.adminReviewTestData = onCall({ region: REGION, cors: ['https://spartan-175.github.io'], timeoutSeconds: 540, memory: '1GiB' }, async (request) => {
  const adminUid = requireSuperadmin(request);
  const batchId = text(request.data?.batchId, 100);
  const teamId = text(request.data?.teamId, 128);
  const action = request.data?.action;
  if (!['pending', 'approved', 'rejected'].includes(action) || (!!batchId === !!teamId)) {
    throw new HttpsError('invalid-argument', 'Indica un lote o equipo de prueba y una decisión válida.');
  }
  let batchIdResolved = batchId;
  let teams = [];
  if (batchId) {
    const batchRef = db.collection('testImportBatches').doc(safeDocId(batchId));
    const batchSnap = await batchRef.get();
    if (!batchSnap.exists || batchSnap.data().isTestData !== true) throw new HttpsError('not-found', 'No existe un lote de prueba válido.');
    const teamSnap = await db.collection('teams').where('testBatchId', '==', batchId).get();
    teams = teamSnap.docs;
    if (!teams.length) throw new HttpsError('failed-precondition', 'El lote no contiene equipos para revisar.');
  } else {
    const teamRef = db.collection('teams').doc(teamId);
    const teamSnap = await teamRef.get();
    if (!teamSnap.exists) throw new HttpsError('not-found', 'Equipo no encontrado.');
    const team = teamSnap.data();
    if (team.isTestData !== true || !team.testBatchId) throw new HttpsError('failed-precondition', 'Esta acción solo está disponible para equipos marcados como datos de prueba.');
    batchIdResolved = team.testBatchId;
    teams = [teamSnap];
  }
  const teamIds = new Set(teams.map(d => d.id));
  const status = action === 'approved' ? 'active' : action === 'pending' ? 'pending_approval' : 'rejected';
  const approvalFields = action === 'approved'
    ? { approvalStatus: 'approved', leagueStatus: 'approved', status, approvedAt: FieldValue.serverTimestamp(), approvedBy: adminUid, rejectedAt: FieldValue.delete() }
    : action === 'pending'
      ? { approvalStatus: 'pending', leagueStatus: 'pending', status, approvalRequestedAt: FieldValue.serverTimestamp(), approvedAt: FieldValue.delete(), rejectedAt: FieldValue.delete() }
      : { approvalStatus: 'rejected', leagueStatus: 'rejected', status, rejectedAt: FieldValue.serverTimestamp(), rejectedBy: adminUid, approvedAt: FieldValue.delete() };
  for (let i = 0; i < teams.length; i += 400) {
    const batch = db.batch();
    teams.slice(i, i + 400).forEach(d => batch.update(d.ref, { ...approvalFields, reviewedAt: FieldValue.serverTimestamp(), reviewedBy: adminUid, updatedAt: FieldValue.serverTimestamp() }));
    await batch.commit();
  }
  const players = batchId
    ? await db.collection('players').where('testBatchId', '==', batchIdResolved).get()
    : await db.collection('players').where('teamId', '==', teamId).where('testBatchId', '==', batchIdResolved).get();
  for (let i = 0; i < players.docs.length; i += 400) {
    const batch = db.batch();
    players.docs.slice(i, i + 400).forEach(d => {
      if (batchId || teamIds.has(String(d.data().teamId))) batch.update(d.ref, { visibility: action === 'approved' ? 'public' : 'pending', approvalStatus: action, updatedAt: FieldValue.serverTimestamp() });
    });
    await batch.commit();
  }
  const matchSnap = await db.collection('matches').where('testBatchId', '==', batchIdResolved).get();
  const approvedTeams = new Set();
  const allBatchTeams = await db.collection('teams').where('testBatchId', '==', batchIdResolved).get();
  allBatchTeams.docs.forEach(d => {
    const next = teamIds.has(d.id) ? action : (d.data().approvalStatus || (d.data().status === 'active' ? 'approved' : 'pending'));
    if (next === 'approved') approvedTeams.add(d.id);
  });
  for (let i = 0; i < matchSnap.docs.length; i += 400) {
    const batch = db.batch();
    matchSnap.docs.slice(i, i + 400).forEach(d => {
      const m = d.data();
      const bothApproved = approvedTeams.has(String(m.homeTeamId)) && approvedTeams.has(String(m.awayTeamId));
      const nextMatchStatus = bothApproved ? (['final','completed','finished'].includes(String(m.status||'').toLowerCase()) ? m.status : 'scheduled') : 'pending_approval';
      batch.update(d.ref, { approvalStatus: bothApproved ? 'approved' : 'pending', status: nextMatchStatus, updatedAt: FieldValue.serverTimestamp() });
    });
    await batch.commit();
  }
  if (batchId) {
    await db.collection('testImportBatches').doc(safeDocId(batchId)).set({ approvalStatus: action, reviewedAt: FieldValue.serverTimestamp(), reviewedBy: adminUid }, { merge: true });
  } else {
    const approvedCount = approvedTeams.size;
    await db.collection('testImportBatches').doc(safeDocId(batchIdResolved)).set({ approvalStatus: approvedCount === allBatchTeams.size ? 'approved' : approvedCount === 0 ? action : 'partial', reviewedAt: FieldValue.serverTimestamp(), reviewedBy: adminUid }, { merge: true });
  }
  await db.collection('adminAudit').add({ action: 'test_data_reviewed', decision: action, batchId: batchIdResolved, teamIds: [...teamIds], actorUid: adminUid, createdAt: FieldValue.serverTimestamp() });
  return { ok: true, teams: teams.length, players: players.size, message: action === 'approved' ? `Se aprobaron ${teams.length} equipo(s). Los jugadores quedaron visibles y los encuentros entre equipos aprobados se habilitaron.` : action === 'pending' ? `${teams.length} equipo(s) quedaron pendientes de aprobación. Sus jugadores y encuentros permanecen ocultos al público.` : `${teams.length} equipo(s) fueron rechazados. Los datos se conservaron para revisión; no se eliminó nada.` };
});

exports.cleanupTestImport = onCall({ region: REGION, cors: ['https://spartan-175.github.io'], timeoutSeconds: 540, memory: '1GiB' }, async (request) => {
  const adminUid=requireSuperadmin(request), batchId=text(request.data?.batchId,100); if(!batchId)throw new HttpsError('invalid-argument','Falta el identificador del lote.');
  const batchRef=db.collection('testImportBatches').doc(safeDocId(batchId)); const meta=await batchRef.get(); if(!meta.exists)throw new HttpsError('not-found','No existe ese lote de pruebas.');
  if(meta.data().isTestData!==true||meta.data().createdBy!==adminUid)throw new HttpsError('permission-denied','Solo puedes limpiar lotes de prueba creados por este superadministrador.');
  await batchRef.set({status:'cleaning',cleanupStartedAt:FieldValue.serverTimestamp()},{merge:true});
  let removed=0;
  try{
    const rosterSnap=await db.collectionGroup('roster').where('testBatchId','==',batchId).get();
    for(let i=0;i<rosterSnap.docs.length;i+=400){const b=db.batch();const part=rosterSnap.docs.slice(i,i+400);part.forEach(d=>b.delete(d.ref));await b.commit();removed+=part.length;}
    for(const col of ['matches','players','teams']){
      while(true){const snap=await db.collection(col).where('testBatchId','==',batchId).limit(400).get();if(snap.empty)break;const b=db.batch();snap.docs.forEach(d=>b.delete(d.ref));await b.commit();removed+=snap.size;}
    }
    await batchRef.delete();
    const leagueId=meta.data().leagueId;if(leagueId)await db.collection('leagues').doc(leagueId).set({testDataImported:false,testDataBatchId:FieldValue.delete()},{merge:true});
    return {ok:true,removed,message:`Lote limpiado. Se eliminaron ${removed} documentos de prueba; usuarios y competición permanecen intactos.`};
  }catch(e){await batchRef.set({status:'cleanup_failed',cleanupError:text(e.message,300)},{merge:true});throw new HttpsError('internal',e.message||'No se pudo completar la limpieza.');}
});


exports.adminDeleteTestTeam = onCall({ region: REGION, timeoutSeconds: 540, memory: '1GiB' }, async (request) => {
  const adminUid = requireSuperadmin(request);
  const teamId = text(request.data?.teamId, 128);
  if (!teamId) throw new HttpsError('invalid-argument', 'Falta el identificador del equipo.');
  const teamRef = db.collection('teams').doc(teamId);
  const teamSnap = await teamRef.get();
  if (!teamSnap.exists) throw new HttpsError('not-found', 'Equipo no encontrado.');
  const team = teamSnap.data();
  if (team.isTestData !== true || !team.testBatchId) {
    throw new HttpsError('failed-precondition', 'Por seguridad, la eliminación individual solo está disponible para equipos marcados como datos de prueba.');
  }
  const batchId = team.testBatchId;
  const [playerSnap, matchHome, matchAway, transferSnap] = await Promise.all([
    db.collection('players').where('teamId', '==', teamId).where('testBatchId', '==', batchId).get(),
    db.collection('matches').where('homeTeamId', '==', teamId).where('testBatchId', '==', batchId).get(),
    db.collection('matches').where('awayTeamId', '==', teamId).where('testBatchId', '==', batchId).get(),
    db.collection('transferRequests').where('teamId', '==', teamId).get()
  ]);
  await db.recursiveDelete(teamRef);
  const docs = [...playerSnap.docs, ...matchHome.docs, ...matchAway.docs, ...transferSnap.docs];
  const unique = new Map(docs.map(d => [d.ref.path, d]));
  const list = [...unique.values()];
  for (let i = 0; i < list.length; i += 450) {
    const batch = db.batch();
    list.slice(i, i + 450).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
  await db.collection('adminAudit').add({
    action: 'test_team_individually_deleted',
    teamId,
    teamName: text(team.name || team.teamName, 120),
    testBatchId: batchId,
    deletedTestPlayers: playerSnap.size,
    deletedMatches: unique.size - transferSnap.size - playerSnap.size,
    deletedTransferRequests: transferSnap.size,
    actorUid: adminUid,
    createdAt: FieldValue.serverTimestamp()
  });
  return {
    ok: true,
    message: `Equipo eliminado. Se quitaron ${playerSnap.size} jugadores de prueba, sus encuentros y solicitudes vinculadas. Las cuentas de usuario se conservaron.`
  };
});

// Eliminación administrativa de un equipo, sea de prueba o registrado manualmente.
// Conserva perfiles/cuentas reales: los jugadores no ficticios solo se desvinculan.
exports.adminDeleteTeam = onCall({ region: REGION, timeoutSeconds: 540, memory: '1GiB' }, async (request) => {
  const adminUid = requireSuperadmin(request);
  const teamId = text(request.data?.teamId, 128);
  if (!teamId) throw new HttpsError('invalid-argument', 'Falta el identificador del equipo.');
  const teamRef = db.collection('teams').doc(teamId);
  const teamSnap = await teamRef.get();
  if (!teamSnap.exists) throw new HttpsError('not-found', 'Equipo no encontrado.');
  const team = teamSnap.data();
  const [players, homeMatches, awayMatches, teamIdMatches, transfers, requests, usersByTeam, usersByCurrent, usersByManaged] = await Promise.all([
    db.collection('players').where('teamId', '==', teamId).get(),
    db.collection('matches').where('homeTeamId', '==', teamId).get(),
    db.collection('matches').where('awayTeamId', '==', teamId).get(),
    db.collection('matches').where('teamIds', 'array-contains', teamId).get(),
    db.collection('transferRequests').where('teamId', '==', teamId).get(),
    db.collection('teamRequests').where('teamId', '==', teamId).get(),
    db.collection('users').where('teamId', '==', teamId).get(),
    db.collection('users').where('currentTeamId', '==', teamId).get(),
    db.collection('users').where('managedTeamId', '==', teamId).get()
  ]);
  const matchMap = new Map([...homeMatches.docs, ...awayMatches.docs, ...teamIdMatches.docs].map(d => [d.ref.path, d]));
  const testPlayerDocs = [];
  const realPlayerDocs = [];
  players.docs.forEach(d => {
    const p = d.data();
    if (team.isTestData === true && p.isTestData === true && team.testBatchId && p.testBatchId === team.testBatchId) testPlayerDocs.push(d);
    else realPlayerDocs.push(d);
  });
  // Remove references from real player profiles without deleting their identities or history.
  for (let i=0;i<realPlayerDocs.length;i+=400) {
    const b=db.batch();
    realPlayerDocs.slice(i,i+400).forEach(d=>b.update(d.ref,{teamId:FieldValue.delete(),teamName:FieldValue.delete(),leagueId:FieldValue.delete(),updatedAt:FieldValue.serverTimestamp()}));
    await b.commit();
  }
  const userMap = new Map([...usersByTeam.docs,...usersByCurrent.docs,...usersByManaged.docs].map(d=>[d.ref.path,d]));
  for (const u of userMap.values()) {
    const data=u.data(), patch={updatedAt:FieldValue.serverTimestamp()};
    if(data.teamId===teamId)patch.teamId=FieldValue.delete();
    if(data.currentTeamId===teamId)patch.currentTeamId=FieldValue.delete();
    if(data.managedTeamId===teamId)patch.managedTeamId=FieldValue.delete();
    await u.ref.update(patch);
  }
  const deleteDocs = [...matchMap.values(),...transfers.docs,...requests.docs,...testPlayerDocs];
  const unique = new Map(deleteDocs.map(d=>[d.ref.path,d]));
  const docs=[...unique.values()];
  for(let i=0;i<docs.length;i+=400){const b=db.batch();docs.slice(i,i+400).forEach(d=>b.delete(d.ref));await b.commit();}
  // recursiveDelete also removes teams/{teamId}/roster and any other team subcollections.
  await db.recursiveDelete(teamRef);
  await db.collection('adminAudit').add({
    action:'admin_team_deleted', teamId, teamName:text(team.name||team.teamName,120),
    wasTestData:team.isTestData===true, deletedTestPlayers:testPlayerDocs.length,
    preservedAndUnlinkedPlayers:realPlayerDocs.length, deletedMatches:matchMap.size,
    deletedTransferRequests:transfers.size, deletedTeamRequests:requests.size,
    actorUid:adminUid, createdAt:FieldValue.serverTimestamp()
  });
  return {ok:true,message:`Equipo eliminado. Se quitaron ${matchMap.size} encuentros y sus solicitudes. ${testPlayerDocs.length} jugadores ficticios de prueba fueron retirados; ${realPlayerDocs.length} perfiles de jugadores y todas las cuentas de usuario se conservaron y quedaron desvinculados.`};
});

