# CASCARITA v0.3 — Portal público y base central

## 1. Archivos de GitHub Pages
Descomprime este ZIP sobre la raíz del repositorio y reemplaza `js/app.js` y `css/styles.css`. Sube también los archivos nuevos de configuración y la carpeta `functions`. No reemplaces `js/firebase-config.js`.

## 2. Activar superadministración de la cuenta fundadora
La aplicación no concede el permiso desde el navegador. La función `claimFounderSuperadmin` solo acepta la cuenta `avengers_0077@hotmail.com` cuando Firebase Authentication confirma que el correo está verificado.

Despliegue inicial (una sola vez, desde una computadora con Node.js y Firebase CLI):

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only functions:claimFounderSuperadmin
```

El proyecto ya está fijado en `.firebaserc` como `cascarita-platform`; `firebase.json` limita este despliegue a Functions. Después, inicia sesión en CASCARITA con el correo fundador verificado. En Inicio aparecerá el botón para activar la superadministración. Al pulsarlo, se asignan los custom claims `admin` y `superadmin` desde el servidor.

## 3. Reglas de Firestore y Storage
Los archivos `firestore.rules` y `storage.rules` están incluidos como propuesta para esta versión. Revísalos antes de publicarlos y reemplaza las reglas actuales solo cuando estés listo. No uses reglas abiertas. Las reglas de Firestore protegen la edición de roles y reservan ligas, equipos, noticias y resultados para administradores.

## 4. Funciones incluidas
- Portal público para aficionados y selector de competiciones activas.
- Perfil personal con fotografía en Firebase Storage (JPG/PNG/WEBP, máximo 5 MB).
- Solicitud de roles; aprobación administrativa y activación del rol en el perfil.
- Vistas de panel según los roles habilitados.
- Administración central: creación de ligas/torneos, equipos por liga, vinculación de jugadores por correo, programación de encuentros, captura de resultados y tabla de posiciones calculada.
- Publicación de noticias oficiales.

## 5. Modelo de datos principal
- `users/{uid}`: cuenta, perfil y roles aprobados.
- `leagues/{leagueId}`: cada liga o torneo independiente.
- `teams/{teamId}`: equipo asociado a un `leagueId`.
- `teams/{teamId}/roster/{uid}`: jugadores vinculados al equipo.
- `players/{uid}`: ficha pública del jugador.
- `matches/{matchId}`: encuentros y resultados.
- `news/{newsId}`: noticias publicadas.
- `roleRequests/{requestId}`: solicitudes de roles.

La tabla se calcula con partidos marcados como `final`; todavía no se automatizan actas arbitrales, sanciones, desempates particulares ni validación de resultados por organizadores. Esas reglas se incorporarán en la siguiente fase.
