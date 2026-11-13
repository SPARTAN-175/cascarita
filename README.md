# CASCARITA v0.1

**Donde comienza tu historia.**

Fundación inicial de la plataforma deportiva CASCARITA.

## Requisitos
- Node.js 20 o superior recomendado
- npm
- Proyecto Firebase `cascarita-platform`
- Authentication habilitado con correo y contraseña
- Cloud Firestore creado

## Instalación
1. Descomprime el proyecto.
2. Abre una terminal dentro de la carpeta.
3. Ejecuta `npm install`.
4. Copia `.env.example` a `.env.local`.
5. Completa los valores de la aplicación web Firebase.
6. Ejecuta `npm run dev`.

## Compilar
`npm run build`

## Firebase
En Firebase Authentication, habilita el proveedor **Correo electrónico/Contraseña**.

Las reglas iniciales están cerradas por defecto. La colección `users/{uid}` permite que cada usuario gestione únicamente su perfil básico. No se asignan roles desde el cliente.

Para desplegar reglas:
`firebase deploy --only firestore:rules,firestore:indexes,storage`

Necesitas tener Firebase CLI instalado e iniciar sesión, y seleccionar el proyecto `cascarita-platform`.

## Configuración
La configuración web Firebase se lee desde variables `VITE_FIREBASE_*`. No subas `.env.local` al repositorio.

## Alcance de esta versión
- Interfaz responsive y navegación base.
- Registro e inicio de sesión con Firebase Authentication.
- Creación/actualización de perfil básico en Firestore.
- Panel inicial y módulos visuales de navegación.
- Tema claro/oscuro.

Los módulos deportivos todavía son estructura visual; no se presentan como funciones terminadas.
