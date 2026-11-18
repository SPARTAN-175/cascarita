# CASCARITA — actualización del módulo futbolista

## Contenido
- `js/app.js`: acceso con botón mostrar/ocultar contraseña, vista del futbolista, navegación superior, perfil deportivo, equipo, negociaciones y solicitudes.
- `css/styles.css`: estilos adaptables del módulo.
- `assets/player-placeholder.svg` y `assets/club-placeholder.svg`: imágenes genéricas.
- `firestore.rules`: reglas aditivas revisadas para campos de perfil y cancelación de solicitudes.
- `storage.rules`: reglas de imágenes de perfil/jugador y escudos.
- `firebase.json`: declara ambos archivos de reglas.

## Instalar en GitHub
1. Conserva una copia de seguridad del repositorio.
2. Sube el contenido del ZIP a la raíz del repositorio, respetando las carpetas.
3. No reemplaces `js/firebase-config.js`, `.firebaserc` ni `functions/`.
4. Publica GitHub Pages y prueba primero con una cuenta Jugador.

## Reglas Firebase
Las reglas incluidas parten de las reglas que compartió el propietario del proyecto. No se despliegan automáticamente al subir a GitHub. Revisa y publica por separado cuando autorices:
```powershell
firebase.cmd deploy --only firestore:rules,storage --project cascarita-platform
```
Este comando publica reglas; no despliega Cloud Functions ni modifica documentos existentes.

## Comportamiento y límites de esta entrega
- La búsqueda utiliza ligas y equipos existentes con `status` active/approved.
- El envío de solicitudes utiliza la colección existente `transferRequests` y el flujo de revisión `reviewTransferRequest`.
- El límite de cinco solicitudes activas se valida en la interfaz. Para hacerlo inviolable frente a clientes modificados se necesitará una Cloud Function transaccional; no se presenta como protección de servidor.
- La alineación, valoraciones, historial y fichajes solo muestran información si ya existe y está publicada. No se generan estadísticas ficticias.
- La ficha del jugador se guarda en `users/{uid}` y `players/{uid}`; se mantiene compatibilidad con `teams/{teamId}/roster/{uid}`.
- La fecha y la fotografía genérica son visuales; el jugador puede subir su foto desde Mi perfil.
- Las fotos se guardan bajo `profilePhotos/{uid}/...` y las reglas aceptan JPG/PNG/WEBP menores de 5 MB.

## Nota
No se han borrado ni migrado colecciones ni documentos. El módulo requiere que el rol `Jugador` esté aprobado en `users/{uid}.roles`.
