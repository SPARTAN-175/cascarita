const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
initializeApp();

// Bootstrap de una sola cuenta fundadora. El correo debe estar verificado en Firebase Auth.
const FOUNDER_EMAIL = 'avengers_0077@hotmail.com';
exports.claimFounderSuperadmin = onCall({ region: 'us-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Inicia sesión primero.');
  const token = request.auth.token;
  if (String(token.email || '').toLowerCase() !== FOUNDER_EMAIL || token.email_verified !== true) {
    throw new HttpsError('permission-denied', 'Esta cuenta no está autorizada para la activación inicial.');
  }
  const user = await getAuth().getUser(request.auth.uid);
  if (String(user.email || '').toLowerCase() !== FOUNDER_EMAIL || user.emailVerified !== true) {
    throw new HttpsError('permission-denied', 'Verifica el correo de la cuenta fundadora.');
  }
  await getAuth().setCustomUserClaims(user.uid, { ...(user.customClaims || {}), admin: true, superadmin: true });
  return { ok: true, message: 'Permisos de superadministración asignados.' };
});
