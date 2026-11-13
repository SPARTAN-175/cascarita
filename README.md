# CASCARITA v0.1 — GitHub Pages

**Donde comienza tu historia.**

Este proyecto está preparado para publicarse directamente desde GitHub Pages. No requiere Node.js, Vite, npm, GitHub Actions ni Firebase Hosting.

## Publicación
1. Descomprime este ZIP.
2. Sube **todos los archivos y carpetas** a la raíz del repositorio `SPARTAN-175/cascarita`.
3. En GitHub entra a Settings → Pages.
4. En Build and deployment selecciona:
   - Source: Deploy from a branch
   - Branch: `main`
   - Folder: `/ (root)`
5. Guarda y espera a que GitHub publique el sitio.

URL esperada: https://spartan-175.github.io/cascarita/

## Firebase conectado
El archivo `js/firebase-config.js` contiene la configuración web del proyecto `cascarita-platform`.
Servicios inicializados:
- Firebase Authentication
- Cloud Firestore
- Firebase Storage

La aplicación incluye:
- Registro e inicio de sesión con correo y contraseña.
- Creación/sincronización de perfil básico en `users/{uid}` cuando las reglas de Firestore lo permiten.
- Panel principal y navegación base.
- Tema claro y oscuro.

## Configuración necesaria en Firebase
En Authentication → Settings → Authorized domains, agrega:
`spartan-175.github.io`

Asegúrate de que el proveedor Correo electrónico/Contraseña esté habilitado.

## Seguridad y alcance
- El SDK web usa configuración pública; no contiene credenciales administrativas.
- Las reglas de Firestore y Storage deben proteger los datos. Este frontend no reemplaza esas reglas.
- Las reglas de Storage compartidas por el usuario deniegan todas las operaciones (`allow read, write: if false`), por lo que las cargas/descargas de archivos no funcionarán hasta definir reglas específicas.
- No se incluyen operaciones de carga de archivos en esta primera versión.
- Los módulos Jugadores, Clubes, Competiciones, Directorio y Credenciales son espacios visuales de la siguiente etapa; no simulan datos reales.
- No publicar información personal ni datos reales de menores en este repositorio.

## Nota
Si el repositorio es privado en GitHub Free, GitHub Pages puede requerir cambiar su visibilidad o un plan compatible. El código debe subirse a la raíz, no dentro de una carpeta anidada.
