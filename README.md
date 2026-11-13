# DispoDocente — Sistema de Disponibilidad Docente y Consultas Universitarias

[![CI](https://github.com/Gueremy/para-pima-domi-/actions/workflows/ci.yml/badge.svg)](https://github.com/Gueremy/para-pima-domi-/actions)
[![Node.js](https://img.shields.io/badge/Node.js-v22-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Plataforma full stack diseñada para optimizar la comunicación entre estudiantes y docentes universitarios. Permite consultar la disponibilidad de profesores en tiempo real, filtrar por carrera y asignatura, solicitar atención presencial o escrita mediante un sistema de tickets, y coordinar reuniones con exportación automática a calendarios estándar (`.ics`).

> **Aviso de Portafolio:** Proyecto de demostración técnica independiente con fines profesionales y académicos. Utiliza personas, universidades y datos sintéticos.

---

## 🚀 Arquitectura y Tecnologías

```
[ Navegador Web ] (HTML5 semántico, CSS3 adaptable 360px+, Vanilla JS seguro)
        │  HTTPS / Fetch API
        ▼
[ Servidor Express.js ] (Node.js)
   ├── Endurecimiento HTTP: CSP, Nosniff, X-Frame-Options, Rate Limiting
   ├── Autenticación: bcrypt (salt 10), Express-Session persistente, regeneración de SID
   ├── Control de Acceso: RBAC por rol + Autorización por recurso (Ownership/IDOR)
   ├── Observabilidad: /health, /ready, logs limpios sin credenciales ni tokens
   ▼
[ Base de Datos SQLite ]
   ├── Almacén de Sesiones en tabla `sessions` persistente entre reinicios
   ├── Transacciones ACID atómicas para operaciones críticas
   └── Persistencia atómica (.tmp + renameSync) con sql.js WebAssembly
```

### Stack Técnico
- **Backend:** Node.js, Express.js.
- **Frontend:** HTML5, CSS3 responsive (Grid/Flexbox), JavaScript ES6+ modular sin dependencias externas.
- **Base de Datos & Sesiones:** SQLite relacional con almacén persistente de sesiones (`SQLiteSessionStore`).
- **Seguridad:** bcryptjs, crypto SHA-256 para tokens de un solo uso, saneamiento anti-XSS integral (`escapeHtml`), validación estricta de dominios institucionales.
- **Notificaciones & Calendario:** Nodemailer con modo Sandbox/Demo y generador compatible con RFC 5545 (`.ics`).
- **Pruebas Automatizadas:** Playwright E2E & API test suite con integración continua en GitHub Actions.

---

## 🛡️ Medidas de Seguridad Implementadas (P0 / P1)

1. **Prevención de Suplantación y Auto-elevación (SEC-01 & SEC-02):** El registro público está restringido estrictamente al rol `estudiante`. Cualquier solicitud con rol `admin` o `docente` es rechazada con HTTP 400. Las cuentas docentes son provistas exclusivamente por la administración (`POST /api/admin/docentes`), y la administración general se aprovisiona fuera de la web mediante script CLI.
2. **Erradicación de Cross-Site Scripting (SEC-03):** Se eliminó la concatenación insegura de cadenas en `innerHTML` y atributos `onclick` con inyección de variables. Todas las variables de usuario pasan por escapado HTML seguro y listeners de eventos mediante delegación en el DOM.
3. **Gestión Segura de Sesiones (SEC-04 & AUTH-02):** Sesiones respaldadas en base de datos SQLite (sobreviven reinicios de servidor), cookies `httpOnly`, `sameSite: 'lax'`, validación forzada de `SESSION_SECRET` en producción y rotación de identificador de sesión (`req.session.regenerate`) al autenticar para mitigar Session Fixation.
4. **Autorización a Nivel de Recurso (SEC-05):** Rutas de tickets y descarga de calendarios `.ics` verifican explícitamente que el usuario solicitante sea el estudiante emisor o el docente receptor del recurso.
5. **Recuperación de Contraseñas Robusta (AUTH-01):** Utiliza tokens criptográficamente seguros hasheados con SHA-256 en la base de datos, enlaces basados en `APP_BASE_URL` configurada (previene Host Header Poisoning) e invalidación total de sesiones previas tras el cambio de clave.
6. **Modo Demo & Sandbox de Correo (EMAIL-01):** Modo `DEMO_MODE=true` configurable para evaluar el sistema de forma segura sin realizar envíos involuntarios a correos de personas reales.

---

## 📦 Puesta en Marcha Local

### Requisitos
- Node.js 22 LTS
- npm (>= 9.x)

### 1. Clonar e Instalar
```bash
git clone https://github.com/Gueremy/para-pima-domi-.git
cd para-pima-domi-/proyecto
npm install
```

### 2. Configuración de Entorno
```bash
cp .env.example .env
```
Edita `.env` con tus preferencias (por defecto viene listo para pruebas locales con `DEMO_MODE=true`).

### 3. Aprovisionamiento de Usuarios Demo
```bash
# Crea las cuentas de prueba iniciales (Docente, Estudiante, Administrador)
npm run seed:admin
npm run seed:demo
```

### 4. Iniciar el Servidor
```bash
npm run dev
```
La aplicación estará disponible en `http://localhost:3000`.

---

## 👥 Cuentas de Demostración

| Rol | Correo | Contraseña | Capacidades |
|---|---|---|---|
| **Estudiante** | `juan.estudiante@universidad.cl` | `est123` | Búsqueda con filtros, envío de tickets, seguimiento de respuestas, suscripciones. |
| **Docente** | `ana.garcia@universidad.cl` | `docente123` | Conmutador de disponibilidad, atención de tickets, propuesta de reuniones presenciales. |
| **Administrador local** | `admin@universidad.cl` | `Admin123!` | Solo para desarrollo local; en producción define `ADMIN_PASSWORD` único. |

> **Evaluación en 1 clic:** En `http://localhost:3000/login.html` se incluye acceso rápido a los roles de prueba. En producción, el acceso rápido al administrador está deshabilitado por defecto.

---

## 🧪 Pruebas Automatizadas (Playwright)

El proyecto cuenta con una suite completa de pruebas funcionales y de seguridad de extremo a extremo:

```bash
# Ejecutar todas las pruebas (levanta y apaga el servidor automáticamente)
npm test
```

### Casos Cubiertos
- **Autenticación & Seguridad:** Rechazo de roles no autorizados en registro (SEC-01/02), rate limiting de fuerza bruta (5 intentos erróneos -> 429), protección contra inyecciones XSS (SEC-03), acceso denegado sin sesión (401/403).
- **Flujo de Tickets:** Creación de ticket presencial y escrito, límite de tickets pendientes por docente, respuesta del docente, exportación segura de calendario iCal (`.ics`).
- **Disponibilidad & Perfil:** Actualización reactiva de badges, edición de horarios y perfil docente, persistencia tras reinicio.
- **Panel Administrativo:** Consulta de estadísticas, cambio de roles con sincronización de esquemas, y protección contra auto-eliminación de cuentas admin.

## Demo pública

`DEMO_MODE=true` permite entrar como estudiante o docente de prueba sin contraseña. En producción, el acceso rápido al administrador está deshabilitado. Los botones usan únicamente las cuentas sintéticas previstas para la demo.

La recuperación de contraseña está deshabilitada en modo demo. Nunca se devuelve un token de recuperación al navegador. Para probar ese flujo, usa un entorno privado con `DEMO_MODE=false` y correo transaccional configurado.

## Despliegue de una sola instancia

El archivo `render.yaml` prepara un servicio Render con disco persistente. **Requiere un plan de cómputo de pago y almacenamiento facturable**; revisa el plan y sus cargos antes de aprobarlo.

1. Ejecuta el servidor desde `proyecto/` con `npm ci --omit=dev` y `npm start` en Node.js 22.
2. Usa **una réplica** y monta un volumen persistente. Define `DB_PATH` como una ruta absoluta dentro del volumen, por ejemplo `/data/database.sqlite`. El proceso necesita permiso de escritura en ese directorio para crear el archivo temporal y reemplazar la base.
3. Configura `NODE_ENV=production`, `SESSION_SECRET` aleatorio, `ADMIN_PASSWORD` único de al menos 16 caracteres y `DEMO_MODE=true`. Si desactivas el modo demo para habilitar recuperación de contraseña, configura también `APP_BASE_URL` con la URL HTTPS pública y `EMAIL_USER`/`EMAIL_PASS` de una cuenta Gmail compatible con el transporte actual. La contraseña inicial solo se aplica cuando se crea la cuenta admin: si ya existe una base, cámbiala mediante un procedimiento privado antes de publicar.
4. Comprueba `/ready`, el inicio de sesión y los flujos de estudiante y docente desde la URL pública. Reinicia la instancia y verifica que tickets y sesiones persisten. Realiza y prueba una copia de seguridad del volumen.

La aplicación usa `sql.js` en memoria y exporta el archivo SQLite después de cada escritura. No admite varias réplicas compartiendo el mismo archivo. Las pruebas de CI se ejecutan localmente y no sustituyen estas comprobaciones de hosting.
