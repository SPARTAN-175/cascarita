# CASCARITA — Versión estructural 1.2

Esta versión amplía el panel del director técnico e incorpora el primer panel del superadministrador.

## Roles disponibles
- `team_manager`: perfil público de director técnico. Puede registrarse y entrar a su panel. Sin equipo asignado, las opciones deportivas se muestran en modo pendiente y no administra nada.
- `superadmin`: cuenta privilegiada creada manualmente por el responsable del proyecto. Accede al centro de control.

## Panel del superadministrador
- Revisión de solicitudes de clubes (`clubRequests`).
- Revisión de solicitudes de equipos (`teamRequests`).
- Aprobar o rechazar solicitudes.
- Crear ligas y torneos manualmente en `leagues`.
- Configurar y cambiar desde el panel las imágenes de fondo de cada perfil.
- Las competiciones se crean inicialmente con estado `draft`.

## Flujo acordado
1. El administrador del club solicita la creación de su club.
2. El superadministrador revisa y aprueba o rechaza la solicitud.
3. El administrador del club crea sus equipos.
4. Cada equipo se envía a revisión.
5. El superadministrador aprueba o rechaza cada equipo.
6. Por ahora el superadministrador crea manualmente las ligas/torneos.
7. Más adelante, los equipos aprobados podrán solicitar inscripción en una competición.

La aprobación de club/equipo NO inscribe automáticamente al equipo en una liga.

## Colecciones utilizadas
- `users`
- `teamInvitations`
- `teamStaff`
- `clubRequests`
- `teamRequests`
- `clubs`
- `teams`
- `leagues`
- `teamRoster`
- `platformSettings/profileBackgrounds`

### Esquema mínimo esperado de `clubRequests`
```js
{
  clubId: "id_propuesto",
  clubName: "Club Deportivo Ejemplo",
  organizationType: "club",
  branch: "varonil|femenil|mixta|multiple",
  category: "Libre|juvenil|infantil|multiple",
  description: "Descripción y datos del club",
  requesterUid: "uid",
  requesterName: "Nombre",
  status: "pending",
  createdAt: serverTimestamp()
}
```

### Esquema mínimo esperado de `teamRequests`
```js
{
  teamId: "id_propuesto",
  clubId: "club_aprobado",
  clubName: "Club Deportivo Ejemplo",
  teamName: "FC Ejemplo Varonil",
  branch: "varonil",
  category: "Libre",
  teamType: "football_11",
  requesterUid: "uid_admin_club",
  status: "pending",
  createdAt: serverTimestamp()
}
```

### Esquema de `leagues`
El panel permite capturar nombre, tipo (liga/torneo), rama, categoría, temporada, modalidad y descripción. Se guarda con `status: "draft"`.


## Fondos configurables por perfil (nuevo en 1.2)
En el menú del superadministrador aparece **Fondos por perfil**. Desde ahí puedes seleccionar y cargar un fondo independiente para:
- Superadministrador (`superadmin`)
- Administrador de club (`club_admin`)
- Director técnico (`team_manager`)
- Jugador (`player`)
- Organizador deportivo (`organizer`)

La imagen se carga a Firebase Storage en `platform/profile-backgrounds/{perfil}/` y su URL/ruta se guarda en `platformSettings/profileBackgrounds`. Los dashboards leen esa configuración y aplican el fondo correspondiente según `profileType` (o el primer rol reconocido). Se aceptan JPG, PNG y WEBP de hasta 5 MB. El fondo se puede reemplazar o quitar desde el mismo panel.

**Importante:** esta entrega agrega el administrador central de fondos y la aplicación automática del fondo al dashboard del director técnico y superadministrador, que son los paneles existentes en esta versión. Los perfiles de administrador de club, jugador y organizador quedan preparados para sus futuros paneles; sus fondos se pueden cargar ahora y se aplicarán cuando esos dashboards se integren. La interfaz completa de esos roles no forma parte de esta versión.

### Reglas necesarias para los fondos
Las reglas incluidas agregan lectura de la configuración a cuentas activas y escritura exclusiva del superadministrador en Firestore. En Storage, solo el superadministrador puede subir, reemplazar o borrar fondos; los usuarios activos pueden leerlos. Para que funcione, publica tanto `firestore.rules` como `storage.rules` en el proyecto Firebase.

## Configurar superadministrador
No existe registro público de superadministrador. Después de crear una cuenta normal de Firebase Authentication, un responsable debe crear/ajustar su documento `users/{UID}` desde Firebase Console o un entorno confiable:
```js
{
  uid: "UID_DE_LA_CUENTA",
  email: "correo_del_superadmin",
  displayName: "Superadministrador",
  profileType: "superadmin",
  roles: ["superadmin"],
  accountStatus: "active"
}
```
No concedas este rol desde el navegador ni publiques credenciales administrativas.

## Configuración y despliegue
1. Configura `js/firebase-config.js` con los datos de la aplicación web.
2. Verifica que `storageBucket` corresponda al bucket real del proyecto Firebase.
3. Habilita Email/Password en Firebase Authentication.
4. Crea Firestore y habilita Firebase Storage.
5. Publica `firestore.rules` y `storage.rules`.
6. Ejecuta con servidor HTTPS/localhost.

Las reglas actuales bloquean la creación de solicitudes de clubes y equipos desde el cliente porque esos módulos todavía no existen. En esta etapa las bandejas del superadmin muestran registros que deberán ser creados por la futura parte del administrador del club o por un backend autorizado. No se han desplegado reglas ni hosting.

## Alcance real de esta entrega
El panel del superadministrador, el formulario de creación de ligas y el módulo de fondos por perfil están implementados en la interfaz y conectados a Firestore/Storage. Las bandejas permiten revisar documentos existentes. Aún no existe la interfaz para que el administrador de club cree y envíe esas solicitudes. La gestión deportiva del DT también sigue pendiente hasta que se integre un equipo aprobado y una plantilla real.


## Actualización 1.3 (parche de interfaz y registro)
- El registro permite elegir entre Director técnico, Administrador de club y Jugador.
- Superadministrador y Organizador deportivo no se pueden crear desde el registro público; requieren autorización administrativa.
- Se agregan vistas iniciales diferenciadas para Administrador de club y Jugador; sus módulos operativos aún se desarrollarán por etapas.
- Se agrega control para mostrar/ocultar contraseña en inicio de sesión y registro.
- Se agregan favicon SVG e ICO para evitar el 404 de favicon.
- `firestore.rules` cambia para permitir la creación pública únicamente de los tres perfiles indicados. Publica esta regla actualizada en Firebase Console > Firestore Database > Rules.

Este ZIP es un parche: conserva la estructura existente. Copia los archivos incluidos sobre los mismos archivos del repositorio y agrega los favicons nuevos. No reemplaces otros archivos.
