# DOCUMENTACION.md

Sistema de Disponibilidad Docente — documentacion tecnica completa para desarrolladoras con conocimiento de Node.js y HTML basico.

---

## 1. Vision general del sistema

El sistema permite a estudiantes consultar la disponibilidad de docentes universitarios y enviarles tickets de consulta (presencial o escrita). Los docentes gestionan su disponibilidad, responden tickets y definen horarios. Un administrador supervisa todos los usuarios. El backend es un servidor Express que expone una API REST con sesiones de cookie. La base de datos es SQLite embebida en memoria (sql.js) que se persiste en un archivo binario en disco.

```
Navegador (HTML + JS vanilla)
      |
      | fetch() -> JSON (application/json)
      |
      v
Express (server/index.js) — puerto 3000
      |
      | express-session (cookie: connect.sid, 24h, httpOnly)
      |
      +-- /api/auth/*       -> server/routes/auth.js
      +-- /api/docentes/*   -> server/routes/docentes.js
      +-- /api/tickets/*    -> server/routes/tickets.js
      +-- /api/reset/*      -> server/routes/reset.js
      +-- /api/admin/*      -> server/routes/admin.js
      +-- /api/estudiantes/*-> server/routes/estudiantes.js
      |
      v
  sql.js (SQLite en memoria)
      |
      v
  database.sqlite (archivo en disco — persiste entre reinicios)
```

Los archivos estaticos de `public/` se sirven directamente por Express. Cualquier URL que no empiece con `/api/` devuelve `index.html` (SPA-like fallback).

---

## 2. Archivos del proyecto — para que sirve cada uno

### `proyecto/package.json`
**Que hace?** Define las dependencias npm y los scripts de inicio del servidor.
**Por que existe?** Punto de entrada estandar de todo proyecto Node.js.
**Con que se conecta?** npm lo usa para instalar `express`, `bcryptjs`, `better-sqlite3`, `dotenv`, `express-session`, `nodemailer`, `sql.js`. Los scripts `start` y `dev` apuntan a `server/index.js`.

---

### `proyecto/server/index.js`
**Que hace?** Es el punto de entrada del servidor. Configura Express, monta todos los middlewares globales (JSON parser, sesiones, archivos estaticos) y registra todas las rutas de la API. Inicia la base de datos antes de escuchar el puerto.
**Por que existe?** Centraliza la configuracion del servidor en un unico lugar para que sea facil de leer y modificar.
**Con que se conecta?** Importa `db.js` (para `initDb`), todos los archivos en `server/routes/`, y el modulo `express-session`. Es importado por los tests de Playwright como `app`.

---

### `proyecto/server/db.js`
**Que hace?** Inicializa la base de datos SQLite usando `sql.js` (una version de SQLite compilada a WebAssembly que corre en Node). Define todas las tablas, aplica migraciones, y expone un proxy que imita la API de `better-sqlite3` (metodos `prepare`, `run`, `get`, `all`). Siembra datos de ejemplo si la base de datos esta vacia.
**Por que existe?** `sql.js` no tiene API sincronica nativa como `better-sqlite3`, por lo que el proxy adapta su interfaz para que el resto del codigo use la misma API familiar (`.prepare().get()`, `.prepare().all()`, etc.). Ademas, cada vez que se modifica la BD, `saveDb()` escribe el archivo `.sqlite` en disco para no perder datos.
**Con que se conecta?** Todos los archivos de rutas lo importan con `const { db } = require('../db')`. El archivo `.env` define `DB_PATH` para la ubicacion del archivo sqlite.

---

### `proyecto/server/mailer.js`
**Que hace?** Configura un transporte de email con `nodemailer` usando Gmail. Exporta cinco funciones especializadas para enviar distintos tipos de email del sistema.
**Por que existe?** Centraliza toda la logica de email en un unico modulo. Usa lazy initialization (el transporter se crea solo la primera vez que se necesita) para no fallar en entornos sin credenciales de email. Todos los errores de email son no fatales: se capturan y se registra un warning en consola sin interrumpir la respuesta HTTP.
**Con que se conecta?** Lo importan `server/routes/docentes.js`, `server/routes/tickets.js` y `server/routes/reset.js`.

---

### `proyecto/server/middleware/auth.js`
**Que hace?** Exporta dos funciones middleware de autenticacion y autorizacion por rol.
**Por que existe?** Separa la logica de control de acceso del codigo de negocio de las rutas.
**Con que se conecta?** Lo importan `server/routes/auth.js`, `server/routes/docentes.js`, `server/routes/tickets.js`, y `server/routes/estudiantes.js`.

---

### `proyecto/server/routes/auth.js`
**Que hace?** Maneja registro, login, logout, verificacion de sesion activa y actualizacion de nombre. Incluye rate limiting de login por IP (5 intentos cada 15 minutos).
**Por que existe?** Concentra toda la gestion de identidad en un modulo dedicado.
**Con que se conecta?** Usa `db` para leer/escribir la tabla `users`, `bcryptjs` para hashear/comparar contrasenas, y `express-session` (a traves del objeto `req.session`).

---

### `proyecto/server/routes/docentes.js`
**Que hace?** Expone endpoints publicos para listar y filtrar docentes, y endpoints protegidos para que los docentes gestionen su disponibilidad, perfil, horarios y suscripciones.
**Por que existe?** Agrupa toda la logica relacionada con docentes en un modulo cohesivo.
**Con que se conecta?** Usa `db` (tablas `users`, `docentes`, `horarios`, `suscripciones`), el middleware `requireRole`, y `mailer.notifyDocenteDisponible`.

---

### `proyecto/server/routes/tickets.js`
**Que hace?** Permite a estudiantes crear tickets, a estudiantes ver sus propios tickets, a docentes ver los tickets recibidos (agrupados por estado), a docentes responder tickets, y a cualquier usuario autenticado descargar un archivo ICS de calendario para tickets tipo "reunion".
**Por que existe?** Concentra toda la logica del flujo central del sistema (consultas estudiante-docente).
**Con que se conecta?** Usa `db` (tablas `tickets`, `users`, `docentes`, `estudiantes`), `requireRole`, y tres funciones de `mailer`.

---

### `proyecto/server/routes/admin.js`
**Que hace?** Expone endpoints exclusivos para el rol `admin`: listar usuarios, eliminar usuarios (con cascada de datos relacionados), ver estadisticas globales y cambiar el rol de un usuario.
**Por que existe?** Separa las capacidades administrativas del resto de la API.
**Con que se conecta?** Usa `db` (todas las tablas). Define su propio middleware local `requireAdmin` en lugar de usar el compartido.

---

### `proyecto/server/routes/reset.js`
**Que hace?** Implementa el flujo de recuperacion de contrasena en dos pasos: solicitar un token (enviado por email) y confirmar el nuevo password con ese token.
**Por que existe?** Permite a usuarios recuperar el acceso sin necesidad de intervencion del administrador.
**Con que se conecta?** Usa `db` (tablas `users`, `password_resets`), `crypto` de Node para generar el token, `bcryptjs` para hashear la nueva contrasena, y `mailer.sendPasswordReset`.

---

### `proyecto/server/routes/estudiantes.js`
**Que hace?** Permite a los estudiantes leer y actualizar su perfil (carrera y ano academico). Usa upsert: si ya existe el registro lo actualiza, si no lo crea.
**Por que existe?** El perfil del estudiante es opcional y complementa al usuario base de la tabla `users`.
**Con que se conecta?** Usa `db` (tabla `estudiantes`), `requireRole('estudiante')`.

---

### `proyecto/public/index.html`
**Que hace?** Pagina principal (directorio raiz). Muestra un buscador de docentes con filtros y tarjetas de resultados. Incluye dos modales: uno para enviar un ticket y otro para ver el perfil completo de un docente.
**Por que existe?** Es la pagina publica accesible incluso sin iniciar sesion (modo invitado).
**Scripts que carga:** `auth.js`, `shared.js`, `main.js`.

---

### `proyecto/public/login.html`
**Que hace?** Muestra el formulario de login y (al hacer click en "Registrarse") el formulario de registro. Si el usuario ya tiene sesion activa, redirige automaticamente al panel segun su rol.
**Por que existe?** Punto de entrada de autenticacion para usuarios nuevos y recurrentes.
**Scripts que carga:** `auth.js` (contiene toda la logica de este formulario).

---

### `proyecto/public/docente.html`
**Que hace?** Panel privado del docente. Contiene cinco pestanas: Pendientes, Respondidos, Resueltos, Horarios, Mi Perfil. Tiene un toggle para activar/desactivar disponibilidad y un buscador de tickets. Incluye un modal para responder tickets.
**Por que existe?** Interfaz dedicada para la gestion de los docentes de sus consultas y perfil.
**Scripts que carga:** `auth.js`, `docente.js`.

---

### `proyecto/public/estudiante.html`
**Que hace?** Panel privado del estudiante. Cuatro pestanas: Nuevo Ticket (formulario de envio), Mis Tickets (historial), Docentes (buscador con suscripcion), Mi Perfil. Incluye un modal de ticket "rapido" desde la vista de docentes.
**Por que existe?** Interfaz dedicada para que los estudiantes gestionen sus consultas.
**Scripts que carga:** `auth.js`, `shared.js`, `estudiante.js`.

---

### `proyecto/public/admin.html`
**Que hace?** Panel del administrador. Muestra estadisticas del sistema (5 tarjetas numericas) y una tabla de todos los usuarios con botones para cambiar rol y eliminar.
**Por que existe?** Vista de supervision y gestion global del sistema.
**Scripts que carga:** `auth.js`, `admin.js`.

---

### `proyecto/public/reset.html`
**Que hace?** Pagina de recuperacion de contrasena. Si la URL contiene `?token=...`, muestra el formulario de nueva contrasena. Si no, muestra el formulario para solicitar el enlace por email. Toda la logica esta escrita directamente en un `<script>` inline en el HTML.
**Por que existe?** El token viene en la URL del email, por lo que la pagina necesita leer `window.location.search` al cargarse y decidir que formulario mostrar.
**Scripts que carga:** Script inline (no usa archivos .js externos).

---

### `proyecto/public/js/auth.js`
**Que hace?** Modulo compartido de autenticacion disponible en todas las paginas. Contiene `getMe()`, `logout()`, `showAlert()`, `clearAlert()`, `redirectByRole()`, `setupNav()` y `setupPanelNav()`. Tambien contiene toda la logica de los formularios de login y registro cuando se detecta que `#login-form` existe en el DOM.
**Por que existe?** Evita duplicar la logica de sesion y navegacion en cada pagina.
**Con que se conecta?** Llama a `/api/auth/me`, `/api/auth/login`, `/api/auth/register`, `/api/auth/logout`.

---

### `proyecto/public/js/shared.js`
**Que hace?** Utilidades compartidas entre `main.js` y `estudiante.js`: renderizado de tarjetas de docentes, carga de horarios en formato mini, apertura del modal de perfil docente, envio generico de tickets y widget de busqueda con debounce. Tambien exporta `startPolling()`.
**Por que existe?** Tanto `index.html` como `estudiante.html` muestran tarjetas de docentes con busqueda y perfil. `shared.js` implementa esto una sola vez.
**Con que se conecta?** Llama a `/api/docentes`, `/api/docentes/opciones`, `/api/docentes/:id`, `/api/docentes/:id/horarios`, `/api/tickets`.

---

### `proyecto/public/js/main.js`
**Que hace?** Logica especifica de `index.html`. Inicializa la navegacion, el widget de busqueda, el modal de ticket, el modal de perfil y la funcion `toggleSuscripcion`.
**Por que existe?** Separa el codigo especifico de la pagina principal de las utilidades compartidas.
**Con que se conecta?** Llama a `setupNav()` (auth.js), funciones de `shared.js`, y directamente a `/api/docentes/suscribir/:id`.

---

### `proyecto/public/js/docente.js`
**Que hace?** Logica del panel docente (`docente.html`). Maneja disponibilidad, carga de tickets (con polling cada 30 segundos), respuesta a tickets, gestion de horarios, edicion de perfil y busqueda de tickets en el DOM.
**Por que existe?** Toda la funcionalidad del panel docente esta encapsulada en este archivo.
**Con que se conecta?** Llama a `/api/tickets/recibidos`, `/api/tickets/:id/responder`, `/api/docentes/mi-perfil`, `/api/docentes/disponibilidad`, `/api/docentes/perfil`, `/api/docentes/horarios`, `/api/auth/me`, `/api/auth/nombre`.

---

### `proyecto/public/js/estudiante.js`
**Que hace?** Logica del panel estudiante (`estudiante.html`). Carga tickets propios (con polling cada 30 segundos via `startPolling`), formulario de nuevo ticket, buscador de docentes con modal de ticket rapido, y edicion de perfil de estudiante.
**Por que existe?** Encapsula toda la funcionalidad del panel del estudiante.
**Con que se conecta?** Llama a `/api/tickets/mis-tickets`, `/api/tickets`, `/api/docentes`, `/api/estudiantes/perfil`, y utilidades de `shared.js`.

---

### `proyecto/public/js/admin.js`
**Que hace?** Logica del panel admin (`admin.html`). Carga estadisticas, renderiza la tabla de usuarios, y permite cambiar rol (con `prompt()`) o eliminar usuarios (con `confirm()`).
**Por que existe?** Encapsula toda la funcionalidad de administracion.
**Con que se conecta?** Llama a `/api/admin/stats`, `/api/admin/usuarios`, `/api/admin/usuarios/:id/rol`, `/api/admin/usuarios/:id` (DELETE).

---

### `proyecto/public/css/styles.css`
**Que hace?** Hoja de estilos unica del proyecto. Define variables CSS (colores, sombras, radio de borde), y estilos para: navbar, contenedor, tarjetas, badges, botones, formularios, tabs, modales, alertas, tickets, toggle switch, avatares, horarios y estados vacios.
**Por que existe?** Centraliza todo el diseno visual del sistema. Al usar variables CSS en `:root`, cambiar el color primario es una sola linea.
**Con que se conecta?** Referenciada desde todos los archivos HTML con `<link rel="stylesheet" href="/css/styles.css">`.

---

### `scripts/seed-admin.js`
**Que hace?** Script de utilidad (se ejecuta manualmente, con el servidor detenido) para insertar un usuario admin (`admin@universidad.cl` / `Admin123!`) en la base de datos. Tambien migra la tabla `users` si es necesario para incluir el rol `admin` en el CHECK constraint.
**Por que existe?** El registro normal no permite crear cuentas `admin` (solo `estudiante` y `docente`). Este script es la forma oficial de crear el primer admin.
**Con que se conecta?** Lee y escribe directamente en `proyecto/database.sqlite`.

---

### `proyecto/playwright.config.js`
**Que hace?** Configuracion de los tests end-to-end con Playwright. Apunta al servidor en `localhost:3000`, usa headless Chromium, un solo worker (tests secuenciales), y guarda resultados en `test-results.json`.
**Por que existe?** Permite correr pruebas automatizadas de la UI completa.
**Con que se conecta?** Los tests en `proyecto/tests/` usan esta configuracion.

---

### `proyecto/.env` (archivo real, no .env.example)
**Que hace?** Contiene las variables de entorno del proyecto: secreto de sesion, credenciales de email, dominio institucional, email del admin, y ruta de la BD.
**Por que existe?** Mantiene los secretos fuera del codigo fuente. Cargado por `dotenv` en `db.js`, `mailer.js` y `server/routes/auth.js`.
**Con que se conecta?** No se incluye en git (listado en `.gitignore`).

---

## 3. Base de datos — tablas y columnas explicadas

La base de datos es SQLite, manejada por `sql.js`. El archivo fisico es `proyecto/database.sqlite`. Cada vez que se escribe algo, el metodo `saveDb()` serializa la BD en memoria y la escribe en disco.

---

### Tabla: `users`
**Para que sirve?** Almacena todos los usuarios del sistema independientemente del rol.

| Columna | Tipo | Para que sirve? |
|---------|------|-----------------|
| id | INTEGER | Clave primaria, autoincrementada |
| email | TEXT UNIQUE | Correo institucional. Debe terminar en el dominio configurado (ej. `@universidad.cl`) |
| password | TEXT | Hash bcrypt de la contrasena (10 rounds) |
| nombre | TEXT | Nombre completo del usuario |
| rol | TEXT | Uno de: `estudiante`, `docente`, `admin` (CHECK constraint) |
| created_at | DATETIME | Fecha y hora de creacion, automatica |

**Con que se relaciona?** Es la tabla central. `docentes`, `estudiantes`, `suscripciones`, `tickets` y `password_resets` referencian esta tabla via `user_id` o `estudiante_id`/`docente_id`.

**Donde se usa en el frontend?** La sesion activa del usuario es un subset de esta tabla (`id`, `email`, `nombre`, `rol`). El panel admin la muestra en la tabla de usuarios (`admin.js` -> `GET /api/admin/usuarios`). El formulario de login y registro la crea/lee (`auth.js` -> `POST /api/auth/login`).

---

### Tabla: `docentes`
**Para que sirve?** Almacena el perfil profesional del docente. Es un registro complementario a `users` para los usuarios con `rol = 'docente'`.

| Columna | Tipo | Para que sirve? |
|---------|------|-----------------|
| id | INTEGER | Clave primaria |
| user_id | INTEGER UNIQUE | Referencia a `users.id`. Uno a uno. |
| carrera | TEXT | Carrera a la que pertenece el docente |
| asignatura | TEXT | Asignatura principal que imparte |
| es_part_time | BOOLEAN | 1 si es docente a tiempo parcial |
| disponible | BOOLEAN | 1 si actualmente acepta tickets |
| descripcion_pt | TEXT | Descripcion opcional para docentes part-time |
| bio | TEXT | Biografia profesional (columna agregada por migracion) |
| ramos | TEXT | Lista de ramos que imparte (texto libre) |
| certificados | TEXT | Titulos y certificaciones (texto libre) |
| telefono | TEXT | Numero de contacto |
| oficina | TEXT | Ubicacion de la oficina |

**Con que se relaciona?** `user_id` referencia `users.id`. La tabla `suscripciones` y `tickets` referencian `users.id` del docente (no `docentes.id`).

**Donde se usa en el frontend?** El toggle de disponibilidad en `docente.html` (`docente.js` -> `PATCH /api/docentes/disponibilidad`). Las tarjetas de docentes en `index.html` y `estudiante.html`. El formulario de perfil en `docente.html` (`docente.js` -> `PATCH /api/docentes/perfil`).

---

### Tabla: `estudiantes`
**Para que sirve?** Almacena datos academicos opcionales del estudiante (carrera y ano). Es un registro complementario a `users` para usuarios con `rol = 'estudiante'`.

| Columna | Tipo | Para que sirve? |
|---------|------|-----------------|
| id | INTEGER | Clave primaria |
| user_id | INTEGER UNIQUE | Referencia a `users.id`. Uno a uno. |
| carrera | TEXT | Carrera que estudia |
| anio | TEXT | Ano academico en curso (texto libre, ej. "3") |

**Con que se relaciona?** `user_id` referencia `users.id`. La vista de tickets del docente hace un LEFT JOIN con esta tabla para mostrar la carrera y ano del estudiante en cada ticket.

**Donde se usa en el frontend?** Formulario "Mi Perfil" en `estudiante.html` (`estudiante.js` -> `GET /api/estudiantes/perfil` y `PATCH /api/estudiantes/perfil`). Los tickets del docente muestran `estudiante_carrera` y `estudiante_anio` si existen.

---

### Tabla: `suscripciones`
**Para que sirve?** Registra que estudiantes quieren recibir notificaciones por email cuando un docente especifico se marque como disponible.

| Columna | Tipo | Para que sirve? |
|---------|------|-----------------|
| id | INTEGER | Clave primaria |
| estudiante_id | INTEGER | Referencia a `users.id` del estudiante |
| docente_id | INTEGER | Referencia a `users.id` del docente |
| — | UNIQUE(estudiante_id, docente_id) | Evita duplicados |

**Con que se relaciona?** Ambas columnas referencian `users.id`.

**Donde se usa en el frontend?** Boton "Notificarme/Notificandome" en las tarjetas de docentes (`main.js` -> `toggleSuscripcion()` -> `POST /api/docentes/suscribir/:docenteId`). La lista de docentes incluye `suscrito: true/false` si el usuario es estudiante.

---

### Tabla: `tickets`
**Para que sirve?** Registro de cada consulta enviada por un estudiante a un docente. Es la tabla central del flujo de negocio.

| Columna | Tipo | Para que sirve? |
|---------|------|-----------------|
| id | INTEGER | Clave primaria |
| estudiante_id | INTEGER | Referencia a `users.id` del estudiante |
| docente_id | INTEGER | Referencia a `users.id` del docente |
| tipo | TEXT | `presencial` o `escrita` |
| mensaje | TEXT | Texto de la consulta |
| estado | TEXT | `pendiente` (default), `respondido`, o `resuelto` |
| respuesta | TEXT | Texto de respuesta del docente (nullable) |
| tipo_respuesta | TEXT | `resuelto`, `respuesta` o `reunion` (nullable) |
| created_at | DATETIME | Fecha de creacion |
| updated_at | DATETIME | Fecha de ultima actualizacion |

**Con que se relaciona?** `estudiante_id` y `docente_id` referencian `users.id`.

**Donde se usa en el frontend?**
- Estudiante: crea tickets (`ticket-form` en `estudiante.html`), ve sus tickets en "Mis Tickets" (`loadTickets()` -> `GET /api/tickets/mis-tickets`). Puede descargar archivo ICS para tickets tipo "reunion".
- Docente: ve tickets agrupados por estado (`loadTickets()` -> `GET /api/tickets/recibidos`), responde tickets (`PATCH /api/tickets/:id/responder`).

---

### Tabla: `horarios`
**Para que sirve?** Almacena los bloques de horario de disponibilidad que cada docente define (dia + hora inicio + hora fin).

| Columna | Tipo | Para que sirve? |
|---------|------|-----------------|
| id | INTEGER | Clave primaria |
| docente_id | INTEGER | Referencia a `users.id` del docente |
| dia | TEXT | Nombre del dia: `Lunes`, `Martes`, `Miercoles`, `Jueves`, `Viernes` |
| hora_inicio | TEXT | Hora en formato HH:MM |
| hora_fin | TEXT | Hora en formato HH:MM |

**Con que se relaciona?** `docente_id` referencia `users.id`.

**Donde se usa en el frontend?** Pestana "Horarios" en `docente.html` para gestion. Las tarjetas de docentes muestran horarios en formato mini (`loadHorariosMini()` en `shared.js` -> `GET /api/docentes/:id/horarios`). El modal de perfil del docente tambien los muestra.

---

### Tabla: `password_resets`
**Para que sirve?** Almacena tokens temporales de recuperacion de contrasena.

| Columna | Tipo | Para que sirve? |
|---------|------|-----------------|
| id | INTEGER | Clave primaria |
| user_id | INTEGER | Referencia a `users.id` |
| token | TEXT UNIQUE | Token aleatorio de 32 bytes en hex (64 caracteres) |
| expires_at | INTEGER | Timestamp Unix en ms: token valido por 1 hora |
| used | INTEGER | 0 = valido, 1 = ya fue usado (un token se invalida al usarse) |

**Con que se relaciona?** `user_id` referencia `users.id`. Al solicitar un nuevo reset, el anterior se elimina (`DELETE WHERE user_id = ?` antes del INSERT).

**Donde se usa en el frontend?** `reset.html` — el formulario de solicitud llama a `POST /api/reset/request` y el formulario de nueva contrasena llama a `POST /api/reset/confirm`.

---

## 4. Backend — cada ruta explicada

### `POST /api/auth/register`
**Que hace?** Crea una nueva cuenta de usuario en la tabla `users`. Si el rol es `docente`, tambien crea un registro en `docentes`. Inicia sesion automaticamente al registrarse.
**Quien puede usarla?** Cualquier visitante (sin sesion).
**Parametros que recibe:**
```json
{
  "email": "string — debe terminar en el dominio configurado (ej. @universidad.cl)",
  "password": "string — minimo 6 caracteres",
  "nombre": "string — nombre completo",
  "rol": "string — 'estudiante' o 'docente' (admin solo si email coincide con ADMIN_EMAIL)"
}
```
**Lo que devuelve:**
```json
{ "user": { "id": "number", "email": "string", "nombre": "string", "rol": "string" } }
```
**Que hace con la base de datos?** INSERT en `users`. INSERT en `docentes` si rol es docente.
**Que pagina HTML la llama?** `login.html` — formulario `#register-form` en `auth.js`.
**Envia algun email?** No.
**Errores posibles:**
- `400` — campos faltantes, dominio incorrecto, rol invalido, contrasena corta
- `409` — email ya registrado (UNIQUE constraint)
- `500` — error interno

---

### `POST /api/auth/login`
**Que hace?** Verifica credenciales con bcrypt y, si son correctas, crea una sesion (`req.session.user`). Incluye proteccion de rate limiting: despues de 5 intentos fallidos desde la misma IP, bloquea por 15 minutos.
**Quien puede usarla?** Cualquier visitante.
**Parametros que recibe:**
```json
{ "email": "string", "password": "string" }
```
**Lo que devuelve:**
```json
{ "user": { "id": "number", "email": "string", "nombre": "string", "rol": "string" } }
```
**Que hace con la base de datos?** SELECT en `users` por email.
**Que pagina HTML la llama?** `login.html` — formulario `#login-form` en `auth.js`.
**Envia algun email?** No.
**Errores posibles:**
- `400` — campos faltantes
- `401` — credenciales invalidas (mismo mensaje para email no encontrado y password incorrecto, para no revelar si el email existe)
- `429` — rate limit superado

---

### `POST /api/auth/logout`
**Que hace?** Destruye la sesion del servidor y limpia la cookie `connect.sid`.
**Quien puede usarla?** Cualquier usuario con sesion activa.
**Parametros que recibe:** Ninguno (usa la sesion).
**Lo que devuelve:**
```json
{ "message": "Sesion cerrada" }
```
**Que hace con la base de datos?** Nada (la sesion es en memoria de Express).
**Que pagina HTML la llama?** Cualquier pagina que tenga `#btn-logout` — `auth.js` funcion `logout()`.
**Envia algun email?** No.
**Errores posibles:** `500` — error al destruir sesion.

---

### `GET /api/auth/me`
**Que hace?** Devuelve el usuario de la sesion activa, o 401 si no hay sesion.
**Quien puede usarla?** Cualquier visitante (para verificar si tiene sesion).
**Parametros que recibe:** Ninguno.
**Lo que devuelve:**
```json
{ "user": { "id": "number", "email": "string", "nombre": "string", "rol": "string" } }
```
**Que hace con la base de datos?** Nada (lee `req.session.user`).
**Que pagina HTML la llama?** Todas las paginas al cargarse — `auth.js` funcion `getMe()`, `setupNav()`, `setupPanelNav()`.
**Envia algun email?** No.
**Errores posibles:** `401` — no autenticado.

---

### `PATCH /api/auth/nombre`
**Que hace?** Actualiza el nombre del usuario autenticado en la tabla `users` y en la sesion activa.
**Quien puede usarla?** Cualquier usuario autenticado.
**Parametros que recibe:**
```json
{ "nombre": "string — minimo 2 caracteres" }
```
**Lo que devuelve:**
```json
{ "ok": true }
```
**Que hace con la base de datos?** UPDATE en `users` WHERE id = sesion.user.id.
**Que pagina HTML la llama?** `docente.html` — formulario de perfil en `docente.js` (enviado en paralelo con `PATCH /api/docentes/perfil`).
**Envia algun email?** No.
**Errores posibles:** `400` — nombre invalido, `401` — no autenticado.

---

### `GET /api/docentes`
**Que hace?** Devuelve la lista de todos los docentes con sus datos de perfil. Acepta filtros opcionales por nombre, carrera, asignatura y disponibilidad. Si el usuario es un estudiante autenticado, agrega `suscrito: true/false` a cada docente.
**Quien puede usarla?** Cualquier visitante (invitado, estudiante, docente, admin).
**Parametros que recibe (query string):**
```
nombre=string (busqueda parcial, LIKE %nombre%)
carrera=string (busqueda parcial)
asignatura=string (busqueda parcial)
disponible=1 (filtra solo disponibles)
```
**Lo que devuelve:**
```json
[{
  "id": "number", "nombre": "string", "email": "string",
  "carrera": "string", "asignatura": "string",
  "disponible": "0|1", "es_part_time": "0|1", "descripcion_pt": "string|null",
  "docente_id": "number", "bio": "string|null", "ramos": "string|null",
  "certificados": "string|null", "telefono": "string|null", "oficina": "string|null",
  "suscrito": "boolean"
}]
```
**Que hace con la base de datos?** SELECT con JOIN entre `users` y `docentes`. Si hay sesion de estudiante, SELECT adicional en `suscripciones`.
**Que pagina HTML la llama?**
- `index.html` via `initSearchWidget()` en `shared.js`
- `estudiante.html` via `loadDocenteSelect()` y `initDocentesTab()` en `estudiante.js`
**Envia algun email?** No.
**Errores posibles:** Sin errores esperados.

---

### `GET /api/docentes/opciones`
**Que hace?** Devuelve las listas de carreras y asignaturas unicas de todos los docentes, para poblar los dropdowns de busqueda.
**Quien puede usarla?** Cualquier visitante.
**Parametros que recibe:** Ninguno.
**Lo que devuelve:**
```json
{ "carreras": ["string"], "asignaturas": ["string"] }
```
**Que hace con la base de datos?** SELECT DISTINCT en `docentes`.
**Que pagina HTML la llama?** `index.html` y `estudiante.html` via `initSearchWidget()` en `shared.js`.
**Envia algun email?** No.

---

### `PATCH /api/docentes/disponibilidad`
**Que hace?** Actualiza el campo `disponible` del docente autenticado. Si se activa la disponibilidad (true), busca todos los estudiantes suscritos y les envia email de notificacion.
**Quien puede usarla?** Solo docentes autenticados.
**Parametros que recibe:**
```json
{ "disponible": "boolean" }
```
**Lo que devuelve:**
```json
{ "disponible": "boolean" }
```
**Que hace con la base de datos?** UPDATE en `docentes`. Si disponible=true, SELECT en `suscripciones` JOIN `users` para obtener emails de suscriptores.
**Que pagina HTML la llama?** `docente.html` — toggle `#disponibilidad-toggle` en `docente.js`.
**Envia algun email?** Si, a todos los estudiantes suscritos al docente cuando se activa. Llama a `notifyDocenteDisponible()`.
**Errores posibles:** `400` — campo no booleano, `401`/`403` — sin sesion o rol incorrecto.

---

### `GET /api/docentes/mi-perfil`
**Que hace?** Devuelve todos los datos del perfil del docente autenticado desde la tabla `docentes`.
**Quien puede usarla?** Solo docentes autenticados.
**Parametros que recibe:** Ninguno.
**Lo que devuelve:**
```json
{
  "id": "number", "user_id": "number", "carrera": "string", "asignatura": "string",
  "es_part_time": "0|1", "disponible": "0|1", "descripcion_pt": "string|null",
  "bio": "string|null", "ramos": "string|null", "certificados": "string|null",
  "telefono": "string|null", "oficina": "string|null"
}
```
**Que hace con la base de datos?** SELECT en `docentes` WHERE user_id = sesion.user.id.
**Que pagina HTML la llama?** `docente.html` — `loadDisponibilidad()` y `loadPerfil()` en `docente.js`.

---

### `PATCH /api/docentes/perfil`
**Que hace?** Actualiza todos los campos del perfil profesional del docente autenticado.
**Quien puede usarla?** Solo docentes autenticados.
**Parametros que recibe:**
```json
{
  "carrera": "string|null", "asignatura": "string|null", "descripcion_pt": "string|null",
  "es_part_time": "boolean", "bio": "string|null", "ramos": "string|null",
  "certificados": "string|null", "telefono": "string|null", "oficina": "string|null"
}
```
**Lo que devuelve:**
```json
{ "ok": true }
```
**Que hace con la base de datos?** UPDATE en `docentes` WHERE user_id = sesion.user.id.
**Que pagina HTML la llama?** `docente.html` — formulario `#perfil-form` en `docente.js` (en paralelo con `PATCH /api/auth/nombre`).

---

### `GET /api/docentes/horarios`
**Que hace?** Devuelve los horarios de disponibilidad del docente autenticado, ordenados por dia y hora.
**Quien puede usarla?** Solo docentes autenticados.
**Lo que devuelve:**
```json
[{ "id": "number", "docente_id": "number", "dia": "string", "hora_inicio": "string", "hora_fin": "string" }]
```
**Que pagina HTML la llama?** `docente.html` — `loadHorarios()` en `docente.js`.

---

### `POST /api/docentes/horarios`
**Que hace?** Crea un nuevo bloque de horario para el docente autenticado.
**Quien puede usarla?** Solo docentes autenticados.
**Parametros que recibe:**
```json
{ "dia": "string (Lunes|Martes|Miercoles|Jueves|Viernes)", "hora_inicio": "string HH:MM", "hora_fin": "string HH:MM" }
```
**Lo que devuelve:**
```json
{ "id": "number", "dia": "string", "hora_inicio": "string", "hora_fin": "string" }
```
**Que hace con la base de datos?** INSERT en `horarios`.
**Que pagina HTML la llama?** `docente.html` — boton `#btn-add-horario` en `docente.js`.

---

### `DELETE /api/docentes/horarios/:id`
**Que hace?** Elimina un horario especifico del docente autenticado. El filtro incluye `docente_id = sesion.user.id` para que un docente no pueda borrar horarios ajenos.
**Quien puede usarla?** Solo docentes autenticados.
**Lo que devuelve:**
```json
{ "ok": true }
```
**Que hace con la base de datos?** DELETE en `horarios` WHERE id = ? AND docente_id = ?.
**Que pagina HTML la llama?** `docente.html` — boton `&times;` en cada horario-tag, `deleteHorario()` en `docente.js`.

---

### `GET /api/docentes/:docenteId/horarios`
**Que hace?** Devuelve los horarios publicos de cualquier docente por su `user_id`. Solo devuelve dia, hora inicio y hora fin (sin IDs internos).
**Quien puede usarla?** Cualquier visitante.
**Lo que devuelve:**
```json
[{ "dia": "string", "hora_inicio": "string", "hora_fin": "string" }]
```
**Que pagina HTML la llama?** Tarjetas de docentes en `index.html` y `estudiante.html` via `loadHorariosMini()` en `shared.js`. Modal de perfil via `openPerfilModal()`.

---

### `GET /api/docentes/:docenteId`
**Que hace?** Devuelve el perfil completo de un docente especifico por su `user_id`.
**Quien puede usarla?** Cualquier visitante.
**Lo que devuelve:** Objeto con todos los campos de perfil del docente (similar a `GET /api/docentes` pero para uno solo).
**Que pagina HTML la llama?** Modal de perfil en `index.html` y `estudiante.html` via `openPerfilModal()` en `shared.js`.

---

### `POST /api/docentes/suscribir/:docenteId`
**Que hace?** Toggle de suscripcion: si ya existe la suscripcion la elimina, si no existe la crea.
**Quien puede usarla?** Solo estudiantes autenticados.
**Lo que devuelve:**
```json
{ "suscrito": "boolean" }
```
**Que hace con la base de datos?** SELECT, luego DELETE o INSERT en `suscripciones`.
**Que pagina HTML la llama?** `index.html` — `toggleSuscripcion()` en `main.js`. Boton "Notificarme/Notificandome" en tarjetas de docentes.

---

### `POST /api/tickets`
**Que hace?** Crea un nuevo ticket de consulta. Verifica que el docente exista y que no tenga mas de 10 tickets pendientes. Envia email al docente y al estudiante.
**Quien puede usarla?** Solo estudiantes autenticados.
**Parametros que recibe:**
```json
{
  "docenteId": "number",
  "tipo": "string ('presencial' o 'escrita')",
  "mensaje": "string"
}
```
**Lo que devuelve:** El ticket recien creado (todos los campos de la tabla `tickets`).
**Que hace con la base de datos?** SELECT en `users` (verificar docente), SELECT COUNT en `tickets` (limite pendientes), INSERT en `tickets`.
**Que pagina HTML la llama?**
- `index.html` — modal de ticket, `submitTicket()` en `shared.js`
- `estudiante.html` — formulario "Nuevo Ticket" (directo en `estudiante.js`) y modal rapido (via `submitTicket()`)
**Envia algun email?** Si: email al docente (`notifyDocenteNuevoTicket`) y email de confirmacion al estudiante (`sendTicketConfirmacionEstudiante`).
**Errores posibles:**
- `400` — campos faltantes o tipo invalido
- `404` — docente no encontrado
- `429` — docente con 10 o mas tickets pendientes

---

### `GET /api/tickets/mis-tickets`
**Que hace?** Devuelve todos los tickets del estudiante autenticado, con datos del docente y su carrera/asignatura, ordenados del mas reciente al mas antiguo.
**Quien puede usarla?** Solo estudiantes autenticados.
**Lo que devuelve:**
```json
[{
  "id": "number", "tipo": "string", "mensaje": "string", "estado": "string",
  "respuesta": "string|null", "tipo_respuesta": "string|null",
  "created_at": "string", "updated_at": "string",
  "docente_nombre": "string", "docente_email": "string",
  "carrera": "string", "asignatura": "string"
}]
```
**Que hace con la base de datos?** SELECT en `tickets` JOIN `users` JOIN `docentes`.
**Que pagina HTML la llama?** `estudiante.html` — `loadTickets()` en `estudiante.js`. Se llama al cargar la pagina y cada 30 segundos via polling.

---

### `GET /api/tickets/recibidos`
**Que hace?** Devuelve los tickets recibidos por el docente autenticado, agrupados en tres arrays: `pendientes`, `respondidos`, `resueltos`. Incluye datos del estudiante (nombre, email, carrera, ano).
**Quien puede usarla?** Solo docentes autenticados.
**Lo que devuelve:**
```json
{
  "pendientes": [{ "id": "number", "estudiante_nombre": "string", "estudiante_email": "string",
    "estudiante_carrera": "string|null", "estudiante_anio": "string|null", "..." }],
  "respondidos": ["...igual"],
  "resueltos": ["...igual"]
}
```
**Que hace con la base de datos?** SELECT en `tickets` JOIN `users` LEFT JOIN `estudiantes`.
**Que pagina HTML la llama?** `docente.html` — `loadTickets()` en `docente.js`. Se llama al cargar la pagina y cada 30 segundos con `setInterval`.

---

### `PATCH /api/tickets/:id/responder`
**Que hace?** Permite al docente responder un ticket. Cambia el estado a `respondido` o `resuelto` segun el tipo de respuesta. Envia email de notificacion al estudiante.
**Quien puede usarla?** Solo docentes autenticados. Solo pueden responder sus propios tickets.
**Parametros que recibe:**
```json
{
  "tipoRespuesta": "string ('resuelto' | 'respuesta' | 'reunion')",
  "respuesta": "string|null (requerido si tipoRespuesta != 'resuelto')"
}
```
**Lo que devuelve:** El ticket actualizado con todos sus campos.
**Que hace con la base de datos?** SELECT en `tickets` (verificar propiedad), UPDATE en `tickets` (estado, respuesta, tipo_respuesta, updated_at), SELECT en `users` (obtener email del estudiante).
**Que pagina HTML la llama?** `docente.html` — modal de respuesta, boton `#submit-respuesta` en `docente.js`.
**Envia algun email?** Si: email al estudiante notificando la respuesta (`sendTicketRespuestaEstudiante`).
**Errores posibles:** `400` — ID o tipoRespuesta invalidos, `404` — ticket no encontrado o no pertenece al docente.

---

### `GET /api/tickets/:id/ics`
**Que hace?** Genera y descarga un archivo de calendario ICS (formato iCalendar) para un ticket cuyo `tipo_respuesta` es `reunion`. El archivo puede importarse en Google Calendar, Outlook, etc.
**Quien puede usarla?** Cualquier usuario autenticado (el endpoint no verifica sesion, solo verifica que el ticket exista y sea de tipo reunion).
**Parametros que recibe:** `:id` en la URL.
**Lo que devuelve:** Archivo de texto con Content-Type `text/calendar` y header de descarga.
**Que hace con la base de datos?** SELECT en `tickets` JOIN `users` (dos veces: estudiante y docente).
**Que pagina HTML la llama?** `estudiante.html` — enlace "Exportar al calendario" en `renderTicketItem()` de `estudiante.js`.
**Errores posibles:** `404` — ticket no encontrado o no es de tipo reunion.

---

### `POST /api/reset/request`
**Que hace?** Solicita un enlace de recuperacion de contrasena. Genera un token aleatorio de 32 bytes (hex), lo guarda en `password_resets` con expiracion de 1 hora, y envia el enlace por email. Siempre devuelve 200 (incluso si el email no existe) para evitar enumeracion de usuarios.
**Quien puede usarla?** Cualquier visitante.
**Parametros que recibe:**
```json
{ "email": "string" }
```
**Lo que devuelve:**
```json
{ "ok": true }
```
**Que hace con la base de datos?** SELECT en `users`, DELETE tokens anteriores del usuario, INSERT en `password_resets`.
**Que pagina HTML la llama?** `reset.html` — formulario `#request-form` (script inline).
**Envia algun email?** Si: enlace de recuperacion al email solicitado. Llama a `sendPasswordReset()`.

---

### `POST /api/reset/confirm`
**Que hace?** Confirma el cambio de contrasena usando el token del enlace de email. Verifica que el token exista, no haya sido usado y no haya expirado. Actualiza el hash de la contrasena y marca el token como usado.
**Quien puede usarla?** Cualquier visitante con un token valido.
**Parametros que recibe:**
```json
{ "token": "string — 64 caracteres hex", "password": "string — minimo 6 caracteres" }
```
**Lo que devuelve:**
```json
{ "ok": true }
```
**Que hace con la base de datos?** SELECT en `password_resets`, UPDATE en `users` (nueva contrasena), UPDATE en `password_resets` (used = 1).
**Que pagina HTML la llama?** `reset.html` — formulario `#confirm-form` (script inline, activo cuando la URL contiene `?token=`).
**Envia algun email?** No.
**Errores posibles:** `400` — token/password invalidos o token expirado.

---

### `GET /api/admin/usuarios`
**Que hace?** Devuelve la lista completa de todos los usuarios del sistema, ordenada del mas reciente al mas antiguo.
**Quien puede usarla?** Solo administradores.
**Lo que devuelve:**
```json
[{ "id": "number", "email": "string", "nombre": "string", "rol": "string", "created_at": "string" }]
```
**Que hace con la base de datos?** SELECT en `users` ORDER BY created_at DESC.
**Que pagina HTML la llama?** `admin.html` — `loadUsuarios()` en `admin.js`.

---

### `DELETE /api/admin/usuarios/:id`
**Que hace?** Elimina un usuario y todos sus datos relacionados en cascada: tickets (como estudiante o docente), suscripciones, registro en docentes o estudiantes, tokens de reset.
**Quien puede usarla?** Solo administradores.
**Lo que devuelve:**
```json
{ "ok": true }
```
**Que hace con la base de datos?** DELETE en cascada: `tickets`, `suscripciones`, `docentes`, `estudiantes`, `password_resets`, `users`.
**Que pagina HTML la llama?** `admin.html` — boton "Eliminar" en la tabla de usuarios, `eliminarUsuario()` en `admin.js`.

---

### `GET /api/admin/stats`
**Que hace?** Devuelve contadores del sistema: total de usuarios, docentes, estudiantes, tickets y tickets pendientes.
**Quien puede usarla?** Solo administradores.
**Lo que devuelve:**
```json
{
  "totalUsers": "number", "totalDocentes": "number", "totalEstudiantes": "number",
  "totalTickets": "number", "pendingTickets": "number"
}
```
**Que hace con la base de datos?** 5 consultas SELECT COUNT(*) en `users` y `tickets`.
**Que pagina HTML la llama?** `admin.html` — `loadStats()` en `admin.js`.

---

### `PATCH /api/admin/usuarios/:id/rol`
**Que hace?** Cambia el rol de un usuario a cualquiera de los tres roles validos.
**Quien puede usarla?** Solo administradores.
**Parametros que recibe:**
```json
{ "rol": "string ('estudiante' | 'docente' | 'admin')" }
```
**Lo que devuelve:**
```json
{ "ok": true }
```
**Que hace con la base de datos?** UPDATE en `users` SET rol = ? WHERE id = ?.
**Que pagina HTML la llama?** `admin.html` — boton "Cambiar rol" que abre un `prompt()` del navegador, `cambiarRol()` en `admin.js`.

---

### `GET /api/estudiantes/perfil`
**Que hace?** Devuelve carrera y ano del estudiante autenticado desde la tabla `estudiantes`. Si el estudiante no tiene registro en esa tabla, devuelve `{ carrera: null, anio: null }`.
**Quien puede usarla?** Solo estudiantes autenticados.
**Lo que devuelve:**
```json
{ "carrera": "string|null", "anio": "string|null" }
```
**Que hace con la base de datos?** SELECT en `estudiantes` WHERE user_id = sesion.user.id.
**Que pagina HTML la llama?** `estudiante.html` — `loadEstudiantePerfil()` en `estudiante.js`.

---

### `PATCH /api/estudiantes/perfil`
**Que hace?** Actualiza carrera y ano del estudiante. Usa upsert: si ya existe el registro lo actualiza, si no lo crea (INSERT).
**Quien puede usarla?** Solo estudiantes autenticados.
**Parametros que recibe:**
```json
{ "carrera": "string|null", "anio": "string|null" }
```
**Lo que devuelve:**
```json
{ "ok": true }
```
**Que hace con la base de datos?** SELECT (verificar existencia), luego UPDATE o INSERT en `estudiantes`.
**Que pagina HTML la llama?** `estudiante.html` — formulario `#est-perfil-form` en `estudiante.js`.

---

## 5. Middleware — que protege cada pagina

### `requireAuth`
**Que hace?** Verifica que `req.session.user` exista. Si no existe, devuelve 401.
**En que rutas se usa?** `PATCH /api/auth/nombre`.
**Que pasa si falla?** Devuelve `{ "error": "No autenticado" }` con HTTP 401.
**Ejemplo de uso:**
```javascript
router.patch('/nombre', requireAuth, (req, res) => {
  // solo llega aqui si hay sesion activa
});
```

---

### `requireRole(role)`
**Que hace?** Factory que retorna un middleware. Verifica que haya sesion activa Y que `req.session.user.rol` sea exactamente el rol especificado.
**En que rutas se usa?**
- `requireRole('docente')`: PATCH disponibilidad, GET/POST/DELETE horarios, GET mi-perfil, PATCH perfil, GET/PATCH tickets recibidos/responder
- `requireRole('estudiante')`: POST tickets, GET mis-tickets, POST suscribir, GET/PATCH perfil estudiante
**Que pasa si falla?**
- Sin sesion: `{ "error": "No autenticado" }` con HTTP 401
- Sesion con rol diferente: `{ "error": "Acceso denegado: rol incorrecto" }` con HTTP 403
**Ejemplo de uso:**
```javascript
router.patch('/disponibilidad', requireRole('docente'), (req, res) => {
  // solo llega aqui si hay sesion de docente
});
```

---

### `requireAdmin` (local en admin.js)
**Que hace?** Middleware definido localmente en `server/routes/admin.js`. Verifica que `req.session.user` exista y que `rol === 'admin'`.
**En que rutas se usa?** Todas las rutas bajo `/api/admin/*`.
**Que pasa si falla?** Devuelve `{ "error": "Acceso denegado" }` con HTTP 403.

---

### `setupPanelNav(requiredRole)` (frontend — auth.js)
**Que hace?** En el frontend, llama a `GET /api/auth/me`. Si no hay sesion o el rol no coincide con el requerido, redirige a `/login.html`. Si todo esta bien, actualiza el nombre en la navbar y conecta el boton de logout.
**Donde se usa?** `docente.js`, `estudiante.js`, `admin.js` — todos llaman `setupPanelNav('docente'|'estudiante'|'admin')` al inicializar.
**Que pasa si falla?** `window.location.href = '/login.html'` — redireccion inmediata.

---

## 6. Sistema de emails — cuando y por que se envian

### Email: Notificacion de docente disponible
**Cuando se envia?** Cuando un docente activa su disponibilidad (toggle ON) y tiene al menos un estudiante suscrito.
**A quien va?** A cada estudiante que haya hecho clic en "Notificarme" para ese docente.
**Que contiene?**
- Asunto: `El docente {nombre} esta disponible`
- Cuerpo: Saludo con nombre del estudiante, nombre del docente, invitacion a enviar un ticket.
**En que ruta se llama?** `PATCH /api/docentes/disponibilidad` en `server/routes/docentes.js`.
**Por que existe?** Permite a los estudiantes saber en tiempo real cuando un docente esta disponible, sin tener que revisar manualmente la plataforma.

---

### Email: Nuevo ticket recibido (al docente)
**Cuando se envia?** Cuando un estudiante envia un nuevo ticket.
**A quien va?** Al docente destinatario del ticket.
**Que contiene?**
- Asunto: `Nuevo ticket de consulta recibido`
- Cuerpo: Nombre del estudiante y tipo de consulta (presencial/escrita).
**En que ruta se llama?** `POST /api/tickets` en `server/routes/tickets.js`.
**Por que existe?** El docente puede estar fuera de la plataforma; el email le avisa sin necesidad de que haga polling.

---

### Email: Confirmacion de ticket enviado (al estudiante)
**Cuando se envia?** Inmediatamente despues de que el estudiante envia un ticket.
**A quien va?** Al estudiante que envio el ticket.
**Que contiene?**
- Asunto: `Ticket enviado a {nombre del docente}`
- Cuerpo: Saludo, tipo de consulta, texto del mensaje enviado, aviso de notificacion al responder.
**En que ruta se llama?** `POST /api/tickets` en `server/routes/tickets.js`.
**Por que existe?** Confirma al estudiante que su consulta fue recibida y le sirve de registro en su email.

---

### Email: Ticket respondido (al estudiante)
**Cuando se envia?** Cuando el docente responde un ticket (cualquier tipo de respuesta).
**A quien va?** Al estudiante dueno del ticket.
**Que contiene?**
- Asunto: `Tu ticket ha sido respondido por {nombre del docente}`
- Cuerpo: Nombre del docente, tipo de respuesta, texto de respuesta (si existe), invitacion a ver el panel.
**En que ruta se llama?** `PATCH /api/tickets/:id/responder` en `server/routes/tickets.js`.
**Por que existe?** El estudiante puede no tener el panel abierto; el email le notifica sin depender del polling.

---

### Email: Recuperacion de contrasena
**Cuando se envia?** Cuando alguien solicita recuperar su contrasena con un email registrado.
**A quien va?** Al email solicitante.
**Que contiene?**
- Asunto: `Recuperacion de contrasena — Disponibilidad Docente`
- Cuerpo: Saludo con nombre, enlace de reset valido por 1 hora (`/reset.html?token=...`), aviso si no lo solicito.
**En que ruta se llama?** `POST /api/reset/request` en `server/routes/reset.js`.
**Por que existe?** Permite a los usuarios recuperar el acceso de forma autonoma y segura.

---

**Nota sobre el transporter:** Las funciones `sendTicketConfirmacionEstudiante`, `sendTicketRespuestaEstudiante` y `sendPasswordReset` verifican que `transporter !== null` antes de intentar enviar. Si `EMAIL_USER` y `EMAIL_PASS` no estan en `.env`, el transporter nunca se crea y estas funciones no hacen nada (sin error). `notifyDocenteDisponible` y `notifyDocenteNuevoTicket` usan `getTransporter()` que crea el transporter aunque las credenciales sean invalidas — el error se captura y se registra como warning no fatal.

---

## 7. Frontend — cada pagina HTML explicada

### `index.html`
**Para quien es?** Cualquier visitante, autenticado o no (modo invitado).
**Que ve el usuario?** Barra de navegacion con su nombre y links al panel segun rol (si esta autenticado). Buscador de docentes con tres filtros (nombre, carrera, asignatura) y checkbox de solo disponibles. Grid de tarjetas de docentes con badge de disponibilidad, horarios mini, boton de suscripcion y boton de enviar ticket. Modal de ticket y modal de perfil completo del docente.
**Archivos JS que usa:** `auth.js`, `shared.js`, `main.js`.
**APIs que consume:** `GET /api/auth/me`, `GET /api/docentes`, `GET /api/docentes/opciones`, `GET /api/docentes/:id`, `GET /api/docentes/:id/horarios`, `POST /api/tickets`, `POST /api/docentes/suscribir/:id`, `POST /api/auth/logout`.

#### `getMe()` — auth.js
**Que hace?** Hace fetch a `/api/auth/me` y retorna el objeto usuario o null.
**Cuando se llama?** Al cargar cualquier pagina, desde `setupNav()` o `setupPanelNav()`.
**Que endpoint llama?** `GET /api/auth/me`.
**Que muestra en pantalla?** Nada directamente; su resultado decide si se muestran los items de nav de usuario autenticado.

#### `setupNav()` — auth.js
**Que hace?** Llama a `getMe()` y si hay usuario muestra su nombre en la navbar, el link a su panel y el boton de logout. Si no hay usuario, muestra el link de login.
**Cuando se llama?** Al inicio de `main.js` (IIFE).
**Que endpoint llama?** Indirectamente via `getMe()`.
**Que muestra en pantalla?** Muestra/oculta los items `#nav-user`, `#nav-panel`, `#nav-logout`, `#nav-guest-login`.

#### `initSearchWidget(config)` — shared.js
**Que hace?** Inicializa el buscador completo: carga opciones de filtro, ejecuta la busqueda inicial y registra listeners para busqueda con debounce (300ms) y cambios en dropdowns.
**Cuando se llama?** Al inicio de `main.js` (IIFE) y en `estudiante.js` al activar la pestana Docentes.
**Que endpoint llama?** `GET /api/docentes/opciones` y `GET /api/docentes?{params}`.
**Que muestra en pantalla?** Puebla los selects de carrera/asignatura y rellena el grid `#docentes-grid`.

#### `renderCard(docente)` — main.js
**Que hace?** Genera el HTML de una tarjeta de docente. Solo muestra el boton de ticket si el docente esta disponible. Solo muestra el boton de suscripcion si el usuario es estudiante.
**Cuando se llama?** Como funcion `cardFn` del widget de busqueda, por cada docente en los resultados.
**Que endpoint llama?** Ninguno directamente.
**Que muestra en pantalla?** Una `.card` con avatar, nombre, carrera, asignatura, badges de disponibilidad, horarios mini y botones de accion.

#### `openTicketModal(docenteId, docenteNombre)` — main.js
**Que hace?** Rellena el modal con el ID y nombre del docente y lo abre.
**Cuando se llama?** Al hacer clic en "Enviar Ticket" en una tarjeta o en el modal de perfil.
**Que endpoint llama?** Ninguno (solo manipula el DOM).
**Que muestra en pantalla?** Abre `.modal-overlay#ticket-modal`.

#### `submitTicket(config)` — shared.js
**Que hace?** Valida que el mensaje no este vacio, luego hace POST a `/api/tickets` y llama `onSuccess` si fue exitoso.
**Cuando se llama?** Al hacer clic en "Enviar Ticket" en el modal.
**Que endpoint llama?** `POST /api/tickets`.
**Que muestra en pantalla?** Mensaje de exito o error en el contenedor de alerta del modal.

#### `toggleSuscripcion(docenteId, btn)` — main.js
**Que hace?** Alterna la suscripcion al docente y actualiza el texto y estilo del boton.
**Cuando se llama?** Al hacer clic en el boton "Notificarme/Notificandome".
**Que endpoint llama?** `POST /api/docentes/suscribir/:docenteId`.
**Que muestra en pantalla?** Cambia el texto y clase CSS del boton.

#### `openPerfilModal(docenteId, options)` — shared.js
**Que hace?** Carga en paralelo el perfil del docente y sus horarios, luego rellena y abre el modal de perfil.
**Cuando se llama?** Al hacer clic en cualquier tarjeta de docente.
**Que endpoint llama?** `GET /api/docentes/:id` y `GET /api/docentes/:id/horarios` en paralelo.
**Que muestra en pantalla?** Rellena `#perfil-modal` con nombre, carrera, badges, bio, ramos, certificados, horarios y contacto del docente.

---

### `login.html`
**Para quien es?** Usuarios no autenticados que quieren registrarse o iniciar sesion.
**Que ve el usuario?** Formulario de login con link a registro. Formulario de registro (oculto inicialmente). Boton de "Entrar como invitado". Link a recuperacion de contrasena.
**Archivos JS que usa:** `auth.js`.
**APIs que consume:** `GET /api/auth/me`, `POST /api/auth/login`, `POST /api/auth/register`.

#### Logica de login-form — auth.js
**Que hace?** Al cargar la pagina verifica si ya hay sesion activa (redirige al panel si la hay). Al enviar el form hace POST a `/api/auth/login` y redirige al panel segun el rol del usuario.
**Que endpoint llama?** `POST /api/auth/login`.
**Que muestra en pantalla?** Mensaje de error en `#login-alert` si falla. Redireccion si tiene exito.

#### Logica de register-form — auth.js
**Que hace?** Al enviar el form hace POST a `/api/auth/register` con los datos del formulario. Si tiene exito, redirige al panel segun el rol.
**Que endpoint llama?** `POST /api/auth/register`.
**Que muestra en pantalla?** Mensaje de error en `#register-alert` si falla.

#### `redirectByRole(rol)` — auth.js
**Que hace?** Redirige al usuario a la URL correcta segun su rol: docente -> `/docente.html`, admin -> `/admin.html`, estudiante -> `/estudiante.html`.
**Cuando se llama?** Despues de login o registro exitoso.

---

### `docente.html`
**Para quien es?** Usuarios con rol `docente`. Redirige a login si no hay sesion de docente.
**Que ve el usuario?** Navbar con contador de tickets pendientes y avatar. Toggle de disponibilidad. Buscador de tickets. Cinco pestanas: Pendientes, Respondidos, Resueltos, Horarios, Mi Perfil. Modal de respuesta a tickets.
**Archivos JS que usa:** `auth.js`, `docente.js`.
**APIs que consume:** `GET /api/auth/me`, `GET /api/docentes/mi-perfil`, `PATCH /api/docentes/disponibilidad`, `GET /api/tickets/recibidos`, `PATCH /api/tickets/:id/responder`, `GET /api/docentes/horarios`, `POST /api/docentes/horarios`, `DELETE /api/docentes/horarios/:id`, `PATCH /api/docentes/perfil`, `PATCH /api/auth/nombre`.

#### `loadTickets()` — docente.js
**Que hace?** Carga los tickets agrupados del docente, actualiza el contador en la navbar, y renderiza las tres listas (pendientes, respondidos, resueltos).
**Cuando se llama?** Al inicio y cada 30 segundos con `setInterval(loadTickets, 30000)`.
**Que endpoint llama?** `GET /api/tickets/recibidos`.
**Que muestra en pantalla?** Rellena `#pendientes-list`, `#respondidos-list`, `#resueltos-list`. Actualiza `#pendientes-count` y `#tab-pendientes-count`.

#### `loadDisponibilidad()` — docente.js
**Que hace?** Lee el estado de disponibilidad del docente y sincroniza el toggle y su etiqueta.
**Cuando se llama?** Al inicio de la pagina.
**Que endpoint llama?** `GET /api/docentes/mi-perfil`.
**Que muestra en pantalla?** Sincroniza `#disponibilidad-toggle` (checked/unchecked) y `#disponibilidad-label`.

#### `loadPerfil()` — docente.js
**Que hace?** Carga el perfil del docente y el nombre del usuario, y rellena todos los campos del formulario de perfil.
**Cuando se llama?** Al inicio y al activar la pestana "Mi Perfil".
**Que endpoint llama?** `GET /api/docentes/mi-perfil` y `GET /api/auth/me` en paralelo.
**Que muestra en pantalla?** Rellena todos los inputs de `#perfil-form`.

#### `loadHorarios()` — docente.js
**Que hace?** Carga los horarios del docente y los renderiza como horario-tags con boton de eliminar.
**Cuando se llama?** Al inicio y al activar la pestana "Horarios".
**Que endpoint llama?** `GET /api/docentes/horarios`.
**Que muestra en pantalla?** Rellena `#horarios-list` con chips de horario.

#### `openRespuestaModal(ticketId)` — docente.js
**Que hace?** Guarda el ID del ticket y abre el modal de respuesta, reseteando el formulario.
**Cuando se llama?** Al hacer clic en "Responder" en un ticket pendiente.
**Que endpoint llama?** Ninguno (solo manipula el DOM).

#### `updateRespuestaForm(tipo)` — docente.js
**Que hace?** Muestra u oculta el campo de texto de respuesta segun el tipo seleccionado. Si es "resuelto" lo oculta; si es "respuesta" o "reunion" lo muestra con la etiqueta correcta.
**Cuando se llama?** Al cambiar el select `#tipo-respuesta` en el modal.

#### Listener de `#submit-respuesta` — docente.js
**Que hace?** Envia el PATCH con tipoRespuesta y respuesta, cierra el modal y recarga los tickets.
**Cuando se llama?** Al hacer clic en "Enviar Respuesta".
**Que endpoint llama?** `PATCH /api/tickets/:id/responder`.

#### `filterTickets()` — docente.js
**Que hace?** Busqueda en el DOM sin llamar al servidor: itera todos los `.ticket-item` y oculta los que no contienen el texto buscado (busqueda case-insensitive sobre todo el textContent).
**Cuando se llama?** Al escribir en `#ticket-search` (evento `input`).

---

### `estudiante.html`
**Para quien es?** Usuarios con rol `estudiante`. Redirige a login si no hay sesion de estudiante.
**Que ve el usuario?** Navbar con nombre. Cuatro pestanas: Nuevo Ticket (formulario), Mis Tickets (historial con polling), Docentes (buscador), Mi Perfil.
**Archivos JS que usa:** `auth.js`, `shared.js`, `estudiante.js`.
**APIs que consume:** `GET /api/auth/me`, `GET /api/docentes`, `POST /api/tickets`, `GET /api/tickets/mis-tickets`, `GET /api/estudiantes/perfil`, `PATCH /api/estudiantes/perfil`, y todas las de busqueda de docentes.

#### `loadTickets()` — estudiante.js
**Que hace?** Carga los tickets del estudiante y los renderiza como lista. Muestra el estado, respuesta y (si aplica) el link de descarga del ICS.
**Cuando se llama?** Al cargar la pagina, al cambiar a la pestana "Mis Tickets", y cada 30 segundos via `startPolling()`.
**Que endpoint llama?** `GET /api/tickets/mis-tickets`.

#### `renderTicketItem(t)` — estudiante.js
**Que hace?** Genera el HTML de un ticket para el estudiante. Si `tipo_respuesta === 'reunion'`, incluye un enlace `<a download>` al endpoint ICS.
**Cuando se llama?** Por cada ticket en `loadTickets()`.

#### `loadDocenteSelect()` — estudiante.js
**Que hace?** Carga todos los docentes y los inserta como `<option>` en el select del formulario de nuevo ticket.
**Cuando se llama?** Al inicio de la pagina.
**Que endpoint llama?** `GET /api/docentes`.

#### `openMiniTicket(docenteId, docenteNombre)` — estudiante.js
**Que hace?** Rellena el modal de ticket rapido con el docente seleccionado y lo abre.
**Cuando se llama?** Al hacer clic en "Enviar Ticket" en una tarjeta de la pestana Docentes.

#### `initDocentesTab()` — estudiante.js
**Que hace?** Inicializa el buscador de docentes de la pestana "Docentes" usando `initSearchWidget`. Solo se llama una vez (flag `docentesTabInited`).
**Cuando se llama?** La primera vez que el usuario activa la pestana "Docentes".

#### `loadEstudiantePerfil()` — estudiante.js
**Que hace?** Carga los datos del perfil del estudiante y rellena los campos del formulario.
**Cuando se llama?** Al activar la pestana "Mi Perfil".
**Que endpoint llama?** `GET /api/estudiantes/perfil`.

#### `startPolling(fn, intervalMs)` — shared.js
**Que hace?** Envuelve `setInterval` y retorna una funcion que detiene el polling. El intervalo por defecto es 30000ms (30 segundos).
**Cuando se llama?** En `estudiante.js` al inicializar: `stopPolling = startPolling(loadTickets, 30000)`.

---

### `admin.html`
**Para quien es?** Usuarios con rol `admin`. Redirige a login si no hay sesion de admin.
**Que ve el usuario?** Cinco tarjetas de estadisticas. Tabla de todos los usuarios con acciones.
**Archivos JS que usa:** `auth.js`, `admin.js`.
**APIs que consume:** `GET /api/auth/me`, `GET /api/admin/stats`, `GET /api/admin/usuarios`, `PATCH /api/admin/usuarios/:id/rol`, `DELETE /api/admin/usuarios/:id`.

#### `loadStats()` — admin.js
**Que hace?** Carga las estadisticas del sistema y rellena los cinco contadores.
**Que endpoint llama?** `GET /api/admin/stats`.
**Que muestra en pantalla?** Actualiza `#stat-users`, `#stat-docentes`, `#stat-estudiantes`, `#stat-tickets`, `#stat-pending`.

#### `loadUsuarios()` — admin.js
**Que hace?** Carga todos los usuarios y renderiza la tabla con botones de accion.
**Que endpoint llama?** `GET /api/admin/usuarios`.

#### `cambiarRol(id, rolActual)` — admin.js
**Que hace?** Usa `prompt()` del navegador para pedir el nuevo rol. Si el input es valido, hace PATCH y recarga la tabla.
**Que endpoint llama?** `PATCH /api/admin/usuarios/:id/rol`.

#### `eliminarUsuario(id, nombre)` — admin.js
**Que hace?** Usa `confirm()` del navegador para confirmar. Si se acepta, hace DELETE y recarga tabla y estadisticas.
**Que endpoint llama?** `DELETE /api/admin/usuarios/:id`.

---

### `reset.html`
**Para quien es?** Cualquier usuario que quiera recuperar su contrasena.
**Que ve el usuario?** Formulario de solicitud de enlace (si no hay token en URL) o formulario de nueva contrasena (si hay `?token=` en la URL).
**Archivos JS que usa:** Script inline en el HTML (no tiene archivo .js externo).
**APIs que consume:** `POST /api/reset/request`, `POST /api/reset/confirm`.

El script lee `window.location.search` al cargar. Si encuentra `token`, muestra el formulario de nueva contrasena. Al confirmar, redirige a `/login.html` despues de 1.5 segundos si fue exitoso.

---

## 8. Flujos completos — de click a base de datos

### Flujo 1: Estudiante envia un ticket

1. El estudiante esta en `index.html` y hace clic en "Enviar Ticket" en la tarjeta de un docente.
2. `openTicketModal(docenteId, docenteNombre)` en `main.js` rellena el hidden input y abre `#ticket-modal`.
3. El estudiante escribe el mensaje y hace clic en "Enviar Ticket".
4. `submitTicket()` en `shared.js` valida el mensaje, luego llama `POST /api/tickets` con `{ docenteId, tipo, mensaje }`.
5. En `server/routes/tickets.js`:
   - Verifica que el docente exista en `users` (rol docente).
   - Cuenta los tickets pendientes del docente: si son 10 o mas, retorna 429.
   - INSERT en `tickets`.
   - Llama en paralelo (sin await): `notifyDocenteNuevoTicket(docente.email, ...)` y `sendTicketConfirmacionEstudiante(estudiante.email, ...)`.
6. La respuesta es el ticket recien creado (201).
7. `shared.js` llama `onSuccess()`: muestra "Ticket enviado correctamente" y cierra el modal 1.5 segundos despues.

---

### Flujo 2: Docente activa disponibilidad

1. El docente esta en `docente.html` y activa el toggle `#disponibilidad-toggle`.
2. El evento `change` en `docente.js` detecta el nuevo estado y llama `PATCH /api/docentes/disponibilidad` con `{ disponible: true }`.
3. En `server/routes/docentes.js`:
   - UPDATE en `docentes` SET disponible = 1 WHERE user_id = sesion.user.id.
   - Como `disponible = true`, busca todos los suscriptores: SELECT en `suscripciones` JOIN `users` WHERE docente_id = user.id.
   - Si hay suscriptores, llama `notifyDocenteDisponible(nombre, suscriptores)` que envia un email a cada uno.
4. La respuesta es `{ disponible: true }`.
5. El label `#disponibilidad-label` cambia a "Disponible".

---

### Flujo 3: Estudiante se registra

1. El estudiante va a `login.html`, hace clic en "Registrarse".
2. `auth.js` oculta `#login-section` y muestra `#register-section`.
3. El estudiante llena el form y hace submit.
4. `auth.js` llama `POST /api/auth/register` con `{ nombre, email, password, rol: 'estudiante' }`.
5. En `server/routes/auth.js`:
   - Valida que el email termine en `DOMAIN` (ej. `@universidad.cl`).
   - Valida que el rol sea `estudiante` o `docente`.
   - Hashea la contrasena con bcrypt (10 rounds).
   - INSERT en `users`.
   - Como el rol es `estudiante`, NO inserta en `docentes` (eso solo pasa para docentes).
   - Crea sesion: `req.session.user = { id, email, nombre, rol }`.
6. La respuesta es `{ user: {...} }` con status 201.
7. `auth.js` llama `redirectByRole('estudiante')` -> `window.location.href = '/estudiante.html'`.

---

### Flujo 4: Login y redireccion por rol

1. El usuario va a `login.html`. `auth.js` llama primero `getMe()` — si ya hay sesion activa redirige inmediatamente.
2. Si no hay sesion, el usuario llena el form de login y hace submit.
3. `auth.js` llama `POST /api/auth/login` con `{ email, password }`.
4. El servidor verifica rate limit por IP. Si no hay bloqueo:
   - Busca el usuario por email.
   - Compara password con bcrypt.
   - Si es valido, crea sesion y devuelve `{ user }`.
   - Si es invalido, llama `recordFailedLogin(ip)` y devuelve 401.
5. `auth.js` llama `redirectByRole(data.user.rol)`:
   - `docente` -> `/docente.html`
   - `admin` -> `/admin.html`
   - cualquier otro (estudiante) -> `/estudiante.html`

---

### Flujo 5: Docente responde ticket

1. El docente esta en `docente.html`, pestana "Pendientes".
2. Hace clic en "Responder" en un ticket. `openRespuestaModal(ticketId)` en `docente.js` guarda el ID y abre el modal.
3. El docente selecciona el tipo de respuesta. Si elige "Marcar como resuelto", el textarea se oculta. Si elige "Responder consulta" o "Coordinar reunion", el textarea aparece.
4. Hace clic en "Enviar Respuesta". El listener de `#submit-respuesta` valida y llama `PATCH /api/tickets/:id/responder`.
5. En `server/routes/tickets.js`:
   - Verifica que el ticket exista y pertenezca al docente autenticado.
   - Calcula el nuevo estado: `resuelto` si tipo es "resuelto", `respondido` en otro caso.
   - UPDATE en `tickets` (estado, respuesta, tipo_respuesta, updated_at).
   - Busca el email del estudiante y llama `sendTicketRespuestaEstudiante(...)`.
6. La respuesta es el ticket actualizado.
7. El modal se cierra y se llama `loadTickets()` para refrescar las listas.

---

### Flujo 6: Estudiante recupera contrasena

1. El estudiante va a `login.html` y hace clic en "Olvidaste tu contrasena?".
2. Es redirigido a `reset.html`. El script detecta que no hay `?token=` en la URL y muestra `#request-section`.
3. El estudiante ingresa su email y hace submit.
4. El script inline llama `POST /api/reset/request` con `{ email }`.
5. En el servidor:
   - Busca el usuario por email (normalizado a minusculas). Si no existe, devuelve 200 igual (anti-enumeracion).
   - Genera un token con `crypto.randomBytes(32).toString('hex')` (64 caracteres).
   - Elimina tokens anteriores del usuario, inserta el nuevo con expiracion de 1 hora.
   - Llama `sendPasswordReset(email, nombre, resetUrl)` donde `resetUrl = http://host/reset.html?token=TOKEN`.
6. El estudiante recibe el email, hace clic en el enlace.
7. `reset.html` se carga con `?token=TOKEN`. El script detecta el token y muestra `#confirm-section`.
8. El estudiante ingresa su nueva contrasena (minimo 6 caracteres) y hace submit.
9. El script llama `POST /api/reset/confirm` con `{ token, password }`.
10. El servidor verifica el token, actualiza el hash en `users` y marca el token como usado.
11. El script muestra "Contrasena restablecida" y redirige a `/login.html` tras 1.5 segundos.

---

### Flujo 7: Polling de 30 segundos

El panel del docente y el panel del estudiante actualizan automaticamente los tickets sin que el usuario haga nada.

**Docente (`docente.js`):**
```javascript
setInterval(loadTickets, 30000);
```
Cada 30 segundos se llama `GET /api/tickets/recibidos` y se re-renderizan las tres listas y el contador de pendientes.

**Estudiante (`estudiante.js`):**
```javascript
stopPolling = startPolling(loadTickets, 30000);
```
`startPolling` en `shared.js` envuelve `setInterval` y retorna una funcion para detenerlo. Cada 30 segundos se llama `GET /api/tickets/mis-tickets` y se re-renderiza la lista de tickets del estudiante.

El proposito es que si el docente responde un ticket mientras el estudiante tiene el panel abierto, el estudiante vea la respuesta en un maximo de 30 segundos sin recargar la pagina.

---

### Flujo 8: Admin gestiona usuarios

1. El admin inicia sesion (requiere que haya sido creado con `scripts/seed-admin.js` o que el email coincida con `ADMIN_EMAIL` en `.env`).
2. Es redirigido a `admin.html`.
3. `admin.js` llama en paralelo `setupPanelNav('admin')` (que verifica sesion), `loadStats()` y `loadUsuarios()`.
4. La tabla muestra todos los usuarios con dos botones por fila:
   - **Cambiar rol:** `cambiarRol(id, rolActual)` abre un `prompt()` del navegador con los roles disponibles. Si el input es valido, llama `PATCH /api/admin/usuarios/:id/rol` y recarga la tabla.
   - **Eliminar:** `eliminarUsuario(id, nombre)` abre un `confirm()`. Si se acepta, llama `DELETE /api/admin/usuarios/:id` que borra el usuario y todos sus datos relacionados en cascada, luego recarga tabla y estadisticas.

---

## 9. Variables de entorno — para que sirve cada una

El archivo `.env` debe estar en `proyecto/` (mismo nivel que `package.json`). No existe `.env.example` en el repositorio, pero estas son las variables que usa el sistema:

| Variable | Ejemplo | Para que sirve? | Que pasa si no esta? |
|----------|---------|-----------------|----------------------|
| `PORT` | `3000` | Puerto en que escucha el servidor Express | Usa el valor por defecto `3000` |
| `SESSION_SECRET` | `mi_secreto_super_seguro_123` | Clave para firmar la cookie de sesion. Si cambia, todas las sesiones activas se invalidan | Usa el fallback `'fallback_secret'` — inseguro en produccion |
| `DB_PATH` | `./database.sqlite` | Ruta al archivo SQLite relativa a la carpeta `proyecto/` | Usa `./database.sqlite` en la carpeta del proyecto |
| `EMAIL_USER` | `miemail@gmail.com` | Cuenta de Gmail para enviar emails via nodemailer | Los emails no se envian (transporter no se crea correctamente) |
| `EMAIL_PASS` | `abcd efgh ijkl mnop` | Contrasena de aplicacion de Gmail (no la contrasena normal) | Los emails no se envian |
| `DOMAIN` | `@universidad.cl` | Dominio institucional que deben tener los emails de registro | Usa `@universidad.cl` por defecto |
| `ADMIN_EMAIL` | `admin@universidad.cl` | El unico email autorizado a registrarse con rol `admin` directamente | Sin este valor, nadie puede registrarse como admin por el formulario |

**Nota sobre `EMAIL_PASS`:** Gmail requiere una "Contrasena de aplicacion" (App Password), no la contrasena normal de la cuenta. Se genera en: Cuenta de Google > Seguridad > Verificacion en dos pasos > Contrasenas de aplicacion.

---

## 10. Guia de problemas frecuentes

### Problema: `Error: EADDRINUSE: address already in use :::3000`
**Por que pasa?** El puerto 3000 ya esta siendo usado por otro proceso (otra instancia del servidor, otra aplicacion).
**Como se soluciona?**
1. Encontrar el proceso: en Windows, `netstat -ano | findstr :3000`, anotar el PID.
2. Terminar el proceso: `taskkill /PID <numero> /F`.
3. O cambiar el puerto en `.env`: `PORT=3001` y reiniciar.

---

### Problema: Los emails no llegan
**Por que pasa?** Las variables `EMAIL_USER` y `EMAIL_PASS` no estan configuradas, o la contrasena de aplicacion de Gmail es incorrecta, o Gmail bloqueo la cuenta.
**Como se soluciona?**
1. Verificar que `.env` tenga `EMAIL_USER` y `EMAIL_PASS` con valores reales.
2. `EMAIL_PASS` debe ser una Contrasena de Aplicacion de Gmail (16 caracteres), no la contrasena normal.
3. Activar verificacion en dos pasos en Gmail, luego ir a Seguridad > Contrasenas de aplicacion > Generar.
4. Revisar la consola del servidor: los errores de email se muestran como `[mailer] Email send failed (non-fatal): ...`.
5. El sistema NO falla si el email no se puede enviar — solo registra un warning.

---

### Problema: `Error al inicializar la base de datos`
**Por que pasa?** `sql.js` no pudo cargar su archivo WASM, o el archivo `database.sqlite` esta corrupto.
**Como se soluciona?**
1. Asegurarse de que `npm install` se ejecuto correctamente en la carpeta `proyecto/`.
2. Si el archivo `database.sqlite` esta corrupto, eliminarlo: el servidor lo recreara con datos de ejemplo al iniciar.
3. Verificar que la variable `DB_PATH` en `.env` sea una ruta valida.
4. El servidor termina el proceso con `process.exit(1)` si la BD falla — esto es intencional.

---

### Problema: La sesion expira y el usuario es redirigido a login
**Por que pasa?** La cookie de sesion dura 24 horas (`maxAge: 24 * 60 * 60 * 1000`). Despues de ese tiempo, `req.session.user` es undefined y el middleware `requireAuth`/`requireRole` devuelve 401.
**Como se soluciona?**
- En el frontend, cualquier respuesta 401 no se maneja automaticamente — el usuario vera un error o la pagina no cargara datos. Se resuelve iniciando sesion nuevamente.
- Si se quiere sesion mas larga, aumentar `maxAge` en `server/index.js`.
- Si el `SESSION_SECRET` cambia entre reinicios, las sesiones activas se invalidan aunque no haya expirado el tiempo.

---

### Problema: CORS — el frontend no puede llamar al backend desde otro puerto
**Por que pasa?** Express sirve los archivos estaticos del mismo servidor, por lo que normalmente no hay CORS. El problema aparece si se intenta usar el frontend desde un servidor diferente (ej. Live Server de VS Code en el puerto 5500 mientras el backend corre en 3000).
**Como se soluciona?**
- No usar Live Server para el frontend. Siempre abrir el navegador en `http://localhost:3000` donde Express sirve los archivos estaticos.
- Si se necesita CORS por alguna razon, instalar `npm install cors` y agregar `app.use(require('cors')({ origin: 'http://localhost:5500', credentials: true }))` en `server/index.js`.

---

### Problema: Las variables de entorno no se cargan
**Por que pasa?** El archivo `.env` no existe, esta en la carpeta equivocada, o tiene errores de formato.
**Como se soluciona?**
1. El archivo `.env` debe estar en `proyecto/` (misma carpeta que `package.json`).
2. Formato correcto: `VARIABLE=valor` sin espacios alrededor del `=` y sin comillas (a menos que el valor tenga espacios).
3. Verificar que `dotenv` este instalado: `npm install dotenv`.
4. Recordar que `dotenv` solo carga el `.env` si se llama `require('dotenv').config()`, lo que ya ocurre en `server/index.js`, `db.js` y `mailer.js`.

---

### Problema: No puedo registrarme como admin
**Por que pasa?** El registro normal solo permite roles `estudiante` y `docente`. El rol `admin` solo se puede registrar si el email coincide exactamente con `ADMIN_EMAIL` en `.env`. Pero es mas facil usar el script de seed.
**Como se soluciona?**
1. Detener el servidor.
2. Desde la raiz del proyecto (donde esta la carpeta `scripts/`): `node scripts/seed-admin.js`
3. Iniciar el servidor nuevamente.
4. Hacer login con `admin@universidad.cl` / `Admin123!` y cambiar la contrasena inmediatamente.

---

### Problema: `Cannot find module 'sql.js'` o similar
**Por que pasa?** Las dependencias no estan instaladas.
**Como se soluciona?**
1. Ir a la carpeta correcta: `cd proyecto/`
2. Ejecutar: `npm install`
3. Iniciar: `npm start`

---

### Problema: El toggle de disponibilidad vuelve a su estado anterior
**Por que pasa?** La llamada a `PATCH /api/docentes/disponibilidad` fallo (401, 403 o 500). El codigo en `docente.js` revierte el toggle si `!res.ok`.
**Como se soluciona?** Revisar la consola del navegador y del servidor para ver el error especifico. Lo mas comun es que la sesion haya expirado (401) — en ese caso, hacer login de nuevo.

---

## 11. Glosario

### Middleware
Funcion que se ejecuta entre que Express recibe la peticion HTTP y que la ruta la maneja. Puede modificar `req` y `res`, llamar a `next()` para continuar, o terminar la cadena devolviendo una respuesta. En este proyecto, `requireAuth` y `requireRole` son middlewares que cortan la cadena si el usuario no esta autenticado o no tiene el rol correcto.

### Endpoint
URL especifica de la API que acepta peticiones HTTP con un metodo determinado (GET, POST, PATCH, DELETE). Por ejemplo, `POST /api/tickets` es el endpoint para crear tickets. Cada endpoint tiene parametros de entrada esperados y un formato de respuesta definido.

### Session
Mecanismo para mantener el estado del usuario entre peticiones HTTP (que son sin estado por naturaleza). Express-session guarda los datos de sesion en memoria del servidor y envia al navegador una cookie con un ID unico (`connect.sid`). En cada peticion siguiente, el navegador envia la cookie, Express recupera los datos del servidor y los expone en `req.session`. En este proyecto se almacena `req.session.user` con `{ id, email, nombre, rol }`.

### Debounce
Tecnica para evitar que una funcion se ejecute demasiado seguido. En `shared.js`, el campo de busqueda usa debounce de 300ms: cada vez que el usuario escribe una letra, se cancela el timer anterior y se programa uno nuevo. La busqueda solo se ejecuta cuando el usuario deja de escribir por 300ms. Sin debounce, cada keystroke haria una peticion al servidor.

### Polling
Tecnica de consultar periodicamente al servidor para obtener datos actualizados. En este proyecto, el panel del docente y del estudiante llaman a sus endpoints de tickets cada 30 segundos con `setInterval`. Es una alternativa simple a WebSockets cuando las actualizaciones en tiempo real no necesitan ser instantaneas.

### Rate Limiting
Limitacion del numero de peticiones que un cliente puede hacer en un periodo de tiempo. En `server/routes/auth.js`, el endpoint de login permite maximo 5 intentos fallidos por IP en 15 minutos. Si se supera, responde 429 (Too Many Requests). Previene ataques de fuerza bruta a las contrasenas.

### Hash (bcrypt)
Transformacion unidireccional de una contrasena en un string irreversible. bcrypt agrega "salt" (dato aleatorio) antes de hashear para que dos usuarios con la misma contrasena tengan hashes diferentes, y hace la operacion computacionalmente costosa (10 rounds) para dificultar ataques de diccionario. Al verificar login, se hashea la contrasena ingresada y se compara con el hash guardado.

### Token (reset password)
Cadena aleatoria de 64 caracteres hexadecimales generada con `crypto.randomBytes(32)`. Se guarda en la tabla `password_resets` con una fecha de expiracion (1 hora). Se envia al usuario por email como parte de una URL. Cuando el usuario hace clic en el enlace, presenta el token para demostrar que tiene acceso al email registrado, y puede cambiar su contrasena. El token es de un solo uso.

### ICS (calendario)
Formato de archivo estandar (iCalendar, RFC 5545) para compartir eventos de calendario. Los archivos `.ics` pueden importarse en Google Calendar, Apple Calendar, Outlook y la mayoria de clientes de calendario. En este proyecto, cuando un docente responde un ticket con "Coordinar reunion", el estudiante puede descargar un `.ics` generado por el servidor con los detalles de la reunion.

### sql.js
Puerto de SQLite a WebAssembly que permite correr SQLite completo en Node.js (o en el navegador) sin dependencias nativas compiladas. A diferencia de `better-sqlite3`, su API es asincronica en la inicializacion y no tiene metodos preparados directamente; por eso `db.js` implementa un proxy con metodos `prepare`/`run`/`get`/`all` que imitan la interfaz de `better-sqlite3`. Cada operacion de escritura llama a `saveDb()` para persistir en disco.

### SPA-like fallback
Patron donde el servidor devuelve `index.html` para cualquier URL que no sea de la API ni un archivo estatico. En `server/index.js`:
```javascript
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Ruta no encontrada' });
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});
```
Esto permite que si el usuario navega directamente a `/docente.html`, el servidor sirve el HTML correctamente aunque la ruta no este explicitamente definida en Express.
