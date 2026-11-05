com# Reporte de QA — Sistema DispoDocente
**Fecha:** 2026-05-23  
**Tester:** QA Engineer (Claude Sonnet 4.6)  
**Resultado final:** 46/46 tests PASS

---

## Resumen Ejecutivo

Se probaron todas las funcionalidades del sistema DispoDocente de forma sistemática con Playwright + pruebas de API. Se encontraron **2 bugs** durante el proceso (ambos corregidos antes de reportar):

1. **Bug critico (CORREGIDO):** El rate limit del login contaba intentos exitosos, bloqueando usuarios legítimos tras 5 logins correctos. Corregido en `server/routes/auth.js`.
2. **Bug schema (CORREGIDO):** La tabla `users` solo permitía roles `estudiante` y `docente`, bloqueando la creación del usuario admin. Corregido en `server/db.js` con migración.

---

## Tabla de Resultados

| # | Funcionalidad | Estado | Observación |
|---|---------------|--------|-------------|
| **1. AUTENTICACIÓN** | | | |
| 1.1 | Registro con correo inválido (no @universidad.cl) | ✅ PASS | Error inline correcto, sin alert() |
| 1.2 | Registro estudiante → redirect a /estudiante.html | ✅ PASS | Redirect correcto post-registro |
| 1.3 | Registro docente → redirect a /docente.html | ✅ PASS | Redirect correcto post-registro |
| 1.4 | Login con contraseña incorrecta 5 veces → rate limit | ✅ PASS | 429 en intento 6. Bug corregido: contaba logins exitosos |
| 1.5 | Acceso directo a /estudiante.html sin sesión → login | ✅ PASS | Redirect correcto |
| 1.6 | Entrar como invitado → solo ve index.html | ✅ PASS | Nav sin panel de usuario |
| 1.7 | Recuperación de contraseña /reset.html | ✅ PASS | Formulario visible, API devuelve ok:true |
| 1.8 | Registro con email duplicado → error inline (sin alert()) | ✅ PASS | Mensaje en #register-alert, no alert() |
| **2. BÚSQUEDA** | | | |
| 2.1 | Buscar docente por nombre (debounce 300ms) | ✅ PASS | Filtra correctamente |
| 2.2 | Filtro por carrera | ✅ PASS | Opciones cargadas desde API |
| 2.3 | Toggle "Solo disponibles" | ✅ PASS | Reduce resultados al filtrar |
| 2.4 | Click en card → abre modal de perfil | ✅ PASS | Modal con clase `open` |
| 2.5 | Botón "Notificarme" NO visible para invitado | ✅ PASS | Oculto sin sesión |
| 2.6 | Botón "Notificarme" visible con sesión estudiante | ✅ PASS | Visible y funcional |
| **3. DISPONIBILIDAD** | | | |
| 3.1 | Toggle disponibilidad OFF → ON (y ON → OFF) | ✅ PASS | API responde, refleja en lista pública |
| 3.2 | Estudiante no puede cambiar disponibilidad (403) | ✅ PASS | Rol incorrecto rechazado |
| 3.3 | Docente accede a /estudiante.html → redirige a login | ✅ PASS | Protección por rol funciona |
| **4. TICKETS — FLUJO COMPLETO** | | | |
| 4.1 | Estudiante crea ticket tipo "Escrita" | ✅ PASS | Ticket creado, estado pendiente |
| 4.2 | Estudiante crea ticket tipo "Presencial" | ✅ PASS | Ticket creado correctamente |
| 4.3 | Ticket #11 al mismo docente → rechaza (límite 10) | ✅ PASS | HTTP 429 con mensaje correcto |
| 4.4 | Docente ve tickets en Pendientes/Respondidos/Resueltos | ✅ PASS | Estructura correcta en API |
| 4.5 | Docente responde con "Marcar resuelto" | ✅ PASS | Estado cambia a 'resuelto' |
| 4.6 | Docente responde con texto | ✅ PASS | Estado 'respondido', respuesta guardada |
| 4.7 | Docente coordina reunión → genera .ics | ✅ PASS | Content-Type: text/calendar, formato válido |
| 4.8 | Estudiante ve respuesta en Mis Tickets | ✅ PASS | Tickets con estado respondido/resuelto visibles |
| 4.9 | Invitado intenta crear ticket → 401 | ✅ PASS | Sin sesión rechazado correctamente |
| **5. PERFIL DOCENTE** | | | |
| 5.1 | Editar nombre, bio, ramos, certificados, telefono, oficina | ✅ PASS | Todos los campos guardados |
| 5.2 | Agregar slot de horario | ✅ PASS | Horario creado con ID |
| 5.3 | Eliminar slot de horario | ✅ PASS | Eliminado y verificado |
| 5.4 | Horarios aparecen en endpoint público | ✅ PASS | Endpoint /:docenteId/horarios retorna horarios |
| **6. PANEL ADMIN** | | | |
| 6.1 | Admin accede a /admin.html | ✅ PASS | Sin redirect, página carga |
| 6.2 | Admin ve stats globales | ✅ PASS | totalUsers, totalDocentes, totalTickets, etc. |
| 6.3 | Admin ve lista de usuarios | ✅ PASS | Lista completa con todos los roles |
| 6.4 | Estudiante no puede acceder a API admin (403) | ✅ PASS | Acceso denegado correcto |
| 6.5 | Estudiante en /admin.html → redirige a login | ✅ PASS | Protección frontend funciona |
| **7. EDGE CASES** | | | |
| 7.1 | Formulario login con campos vacíos → HTML5 required | ✅ PASS | No navega, validación nativa |
| 7.2 | Formulario registro con campos vacíos → HTML5 required | ✅ PASS | No navega, validación nativa |
| 7.3 | Docente accede a /estudiante.html → redirige a login | ✅ PASS | Protección por rol funciona |
| 7.4 | Token de reset inválido → 400 | ✅ PASS | Error controlado |
| 7.5 | Contraseña menor a 6 chars → rechaza en registro | ✅ PASS | Validación backend correcta |
| 7.6 | ICS generado para ticket tipo reunion | ✅ PASS | BEGIN:VCALENDAR, BEGIN:VEVENT presentes |
| 7.7 | index.html sin errores de JS tras 5s | ✅ PASS | Sin errores de JavaScript |
| 7.8 | Tipo de respuesta inválido → 400 | ✅ PASS | Validación backend correcta |
| **8. SUSCRIPCIONES** | | | |
| 8.1 | Estudiante suscribe y desuscribe a docente | ✅ PASS | Toggle correcto |
| 8.2 | Invitado no puede suscribirse (401) | ✅ PASS | Sin sesión rechazado |
| 8.3 | Marcadores de suscripción correctos en listado | ✅ PASS | Campo suscrito=true en docente suscrito |
| **9. RATE LIMIT** | | | |
| 9.1 | 5+ logins incorrectos → IP bloqueada (429) | ✅ PASS | Rate limit funciona post-fix |

---

## Bugs Encontrados y Corregidos

### BUG-1: Rate limit contaba logins exitosos (CRITICO)
**Archivo:** `proyecto/server/routes/auth.js`  
**Descripción:** La función `checkRateLimit` incrementaba el contador para CADA intento de login (exitoso o fallido). Después de 5 logins correctos desde localhost, todos los logins siguientes eran bloqueados con HTTP 429. Esto haría que los usuarios legítimos quedaran bloqueados después de 5 sesiones normales.  
**Corrección:** Se separó la lógica en `isRateLimited()` (solo verifica) y `recordFailedLogin()` (solo incrementa en caso de fallo). El contador ahora solo crece con logins fallidos.

### BUG-2: Schema de DB rechazaba rol 'admin' (FUNCIONAL)
**Archivo:** `proyecto/server/db.js`  
**Descripción:** La tabla `users` tenía `CHECK(rol IN ('estudiante', 'docente'))`, impidiendo insertar usuarios con rol 'admin'. El admin panel existía pero era inutilizable porque ningún usuario podía tener el rol requerido.  
**Corrección:** Se migró la tabla para incluir `'admin'` en el CHECK constraint y se creó el usuario de prueba `admin@universidad.cl`.

---

## Observaciones Adicionales

**Email (Nodemailer):** Las notificaciones de email están configuradas para Gmail pero sin credenciales en `.env`. Los errores de envío son no-fatales (capturados con `.catch(console.warn)`). La funcionalidad de tickets y disponibilidad funciona correctamente independientemente del email.

**Endpoint público de horarios:** `GET /api/docentes/:docenteId/horarios` retorna `{dia, hora_inicio, hora_fin}` pero NO incluye el campo `id`. Esto es correcto para el frontend pero podría confundir a integradores de API.

**Rate limit en tests:** El rate limit usa memoria in-process. Si se ejecutan los tests en una sola sesión de servidor, el test de rate limit (sección 9) bloquea la IP para runs posteriores. Reiniciar el servidor entre ejecuciones de tests es requerido.

**ICS (reunion):** El archivo .ics se genera con `DTSTART` = `DTEND` = hora de respuesta. No usa la hora propuesta en el texto de la respuesta. Mejora recomendada: parsear fecha/hora de la respuesta del docente.

---

## Archivos Creados/Modificados

- `tests/test-report.md` — este reporte
- `tests/dispodocente.spec.js` — suite completa de Playwright (46 tests)
- `tests/playwright.config.js` — configuración del runner
- `proyecto/tests/dispodocente.spec.js` — copia ejecutable (playwright está en proyecto/)
- `proyecto/playwright.config.js` — config ejecutable
- `proyecto/server/routes/auth.js` — corrección del rate limit
- `proyecto/server/db.js` — corrección del schema CHECK constraint
- `scripts/seed-admin.js` — script auxiliar de migración DB
