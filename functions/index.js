const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

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

exports.adminDeleteLeague = onCall({ region: REGION }, async (request) => {
  requireSuperadmin(request); const id = text(request.data?.leagueId, 128);
  if (!id) throw new HttpsError('invalid-argument', 'Falta la competición.');
  const leagueRef = db.collection('leagues').doc(id);
  await db.runTransaction(async tx => {
    const league = await tx.get(leagueRef); if (!league.exists) throw new HttpsError('not-found', 'Competición no encontrada.');
    const teams = await tx.get(db.collection('teams').where('leagueId', '==', id).limit(1));
    const matches = await tx.get(db.collection('matches').where('leagueId', '==', id).limit(1));
    if (!teams.empty || !matches.empty) throw new HttpsError('failed-precondition', 'No se puede eliminar: la competición ya tiene equipos o encuentros. Archívala en su lugar.');
    tx.delete(leagueRef);
  });
  return { ok: true };
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
    tx.create(teamRef, { name: text(r.teamName || r.name,100), teamName: text(r.teamName || r.name,100), leagueId: leagueRef.id, leagueName: l.name, clubId: text(r.clubId,128), clubName: text(r.clubName,120), city: text(r.city || l.city,120), branch: text(r.branch || l.branch,60), category: text(r.category || l.category,80), status: 'active', createdBy: text(r.uid,128), createdAt: FieldValue.serverTimestamp(), approvedAt: FieldValue.serverTimestamp() });
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
    const existing = await db.collection('matches').where('leagueId','==',id).limit(1).get();
    if (!existing.empty) throw new HttpsError('already-exists','Ya existen partidos; no se regenerará para proteger resultados.');
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
