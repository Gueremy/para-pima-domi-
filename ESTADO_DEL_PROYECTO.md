# DispoDocente — Reporte de Estado Actual del Proyecto y Análisis de Riesgos Residuales

**Fecha de actualización:** 4 de noviembre de 2026  
**Repositorio:** [GitHub - Gueremy/para-pima-domi-](https://github.com/Gueremy/para-pima-domi-)  
**Rama principal:** `main`  
**Estado General:** **Endurecido y Protegido — 54/54 Pruebas Automatizadas Aprobadas — Auditoría de Producción en 0 Vulnerabilidades**

---

## 1. Resumen Ejecutivo y Distinción Clave

Es fundamental diferenciar entre **"Pruebas funcionales y de regresión aprobadas (100% PASS)"** y **"Aptitud para entorno de producción con alta concurrencia"**:

1. **Aptitud Funcional y de Seguridad para Demostración / Portafolio:** **COMPLETA.** Todas las fallas de acceso, XSS, permisos obsoletos, secuestro de cookies, envenenamiento de cabeceras Host y desbordamiento de sesiones han sido completamente subsanadas y blindadas.
2. **Arquitectura de Persistencia:** Basada en **WebAssembly SQLite (`sql.js`)** con escrituras sincrónicas atómicas (`.tmp` + `fs.renameSync`). Es ideal para despliegues de instancia única en **Render**, **Railway** o **Fly.io** con volumen persistente montado. No está diseñada para escalado horizontal multi-instancia concurrente (para lo cual se requeriría migrar el adaptador `db.js` a PostgreSQL).

```mermaid
flowchart TD
    subgraph Cliente Web
        UI["SPA Vanilla JS (shared.js con escapeHtml)"]
    end

    subgraph Capa de Red y Proxy
        Proxy["Reverse Proxy HTTPS (Render / Railway / Nginx)"]
    end

    subgraph Servidor Express (Node.js 22)
        Middlewares["app.set('trust proxy', 1)<br/>CSP, Nosniff, SameOrigin, Payload Limit 100kb"]
        AuthMiddleware["requireAuth / requireRole<br/>(Validación en vivo con BD, sin permisos obsoletos)"]
        Store["SQLiteSessionStore<br/>(Columna user_id indexada para revocación atómica)"]
    end

    subgraph Persistencia y Correo
        DB[("sql.js WASM SQLite<br/>Escritura atómica .tmp + renameSync")]
        Mailer["Nodemailer<br/>(Modo Sandbox en DEMO_MODE / SMTP real)"]
    end

    UI --> Proxy --> Middlewares --> AuthMiddleware --> Store --> DB
    Middlewares --> Mailer
```

---

## 2. Resolución de Problemas Reales y Riesgos Residuales

A partir de la auditoría profunda de seguridad y arquitectura, se implementaron las siguientes soluciones definitivas:

### 1. Acceso Administrativo Público en Modo Demo y Cuentas Fijas
* **Protección contra destrucción en demo pública:** En `routes/admin.js`, se bloquearon las operaciones destructivas (`DELETE` y `PATCH /rol`) sobre las cuentas base del sistema (`admin@universidad.cl`, `docente@universidad.cl`, `estudiante@universidad.cl`, etc.). Cualquier intento de degradar o eliminar cuentas base en `DEMO_MODE=true` es rechazado con `403 Forbidden`.
* **Restricción de acceso rápido admin sin contraseña:** En `routes/auth.js`, el endpoint `/demo-login` rechaza el inicio de sesión rápido para el rol `admin` si `NODE_ENV === 'production'`, a menos que se configure explícitamente `ALLOW_DEMO_ADMIN=true`. En la interfaz (`login.html`), el botón de acceso rápido para administrador se oculta dinámicamente si no está permitido.
* **Eliminación de credenciales fijas en producción:** En `server/db.js` e `index.js`, si `NODE_ENV === 'production'`, el sistema no utiliza contraseñas por defecto (`Admin123!`), sino que exige la variable de entorno `ADMIN_PASSWORD`.

### 2. Eliminación de Permisos Obsoletos (Stale Session Permissions)
* **Validación en vivo en `requireAuth` y `requireRole`:** El middleware (`server/middleware/auth.js`) ya no confía ciegamente en el rol almacenado en la cookie/sesión. En cada petición autenticada, consulta el estado actual del usuario en la base de datos:
  * Si el usuario fue eliminado por un administrador, la sesión se destruye y responde `401 Unauthorized` de inmediato.
  * Si el rol del usuario fue cambiado (ej. degradado de `docente` a `estudiante`), el rol en la sesión se actualiza al instante y cualquier petición que requiera privilegios docentes es rechazada con `403 Forbidden`.
* **Revocación relacional de sesiones (`sessions.user_id`):** Se añadió la columna `user_id` a la tabla `sessions`. Cuando un usuario es eliminado, degradado o restablece su contraseña, se ejecuta `SQLiteSessionStore.revokeUserSessions(userId)` (`DELETE FROM sessions WHERE user_id = ?`), invalidando de forma confiable e indexada todas las sesiones activas en cualquier dispositivo.

### 3. Recuperación de Contraseña Endurecida y Funcional en Demo
* **Mitigación total de Host Header Injection:** En `routes/reset.js`, la construcción del enlace de recuperación exige `APP_BASE_URL` en producción y utiliza `http://localhost:PORT` en desarrollo local. Se eliminó por completo el fallback hacia `req.get('host')`.
* **Entrega del enlace de recuperación en Modo Demo:** Cuando `DEMO_MODE=true`, la respuesta del endpoint `/api/reset/request` incluye `demoResetUrl`, y la interfaz `reset.html` muestra un acceso directo seguro para que cualquier evaluador de portafolio pueda completar y verificar el flujo de recuperación de contraseña de principio a fin sin requerir acceso a los logs de consola del servidor.
* **Revocación relacional:** Al confirmar una nueva clave, todas las sesiones abiertas del usuario se destruyen mediante `SQLiteSessionStore.revokeUserSessions(userId)`.

### 4. Persistencia, Proxy y Despliegue
* **Soporte de Reverse Proxy para Cookies Seguras:** Se configuró `app.set('trust proxy', 1)` en `server/index.js`. Esto garantiza que los proxies de Render, Railway, Fly.io o Nginx reenvíen `X-Forwarded-Proto: https`, permitiendo que las cookies marcadas con `secure: true` se emitan y persistan correctamente en el navegador.
* **Clarificación de la Persistencia en Documentación:** Se corrigió el `README.md`, eliminando la mención errónea a "modo WAL". Se especifica con rigor técnico que la persistencia utiliza `sql.js` (WebAssembly) con escritura sincrónica atómica mediante archivo temporal (`.tmp`) y reemplazo con `fs.renameSync()`.

### 5. Auditoría de Dependencias (`npm audit`)
* Se actualizaron paquetes críticos:
  * `nodemailer`: actualizado a versión segura sin vulnerabilidades de inyección SMTP ni DoS.
  * `express` & `body-parser` & `qs`: actualizados a `express@4.22.3` con `qs` y `proxy-addr` corregidos.
* **Resultado de auditoría en producción (`npm audit --omit=dev`):** **0 vulnerabilidades.**

---

## 3. Matriz de Pruebas Automatizadas (54 Tests)

La suite de pruebas en Playwright se amplió para cubrir explícitamente los nuevos escenarios de seguridad y mitigación de riesgos:

| Suite / Test | Enfoque de Verificación | Resultado |
| :--- | :--- | :---: |
| **1. Autenticación (8 tests)** | Login, registro estudiante, bloqueo docente/admin, sesiones. |  100% PASS |
| **2. Búsqueda y Filtros (6 tests)** | Debounce, filtrado reactivo, cards, modal de detalle. |  100% PASS |
| **3. Disponibilidad (2 tests)** | Toggle en tiempo real ON/OFF vía API y persistencia. |  100% PASS |
| **4. Tickets y Consultas (9 tests)** | Creación presencial/escrita, respuestas, calendario RFC 5545 (`.ics`). |  100% PASS |
| **5. Gestión de Perfiles (5 tests)** | Edición de ramos, bio, horarios, eliminación de slots. |  100% PASS |
| **6. Panel Administrativo (6 tests)** | Creación de docentes, métricas, protección de cuentas base. |  100% PASS |
| **7. Casos Límite / Edge Cases (4 tests)** | Payloads inválidos, campos obligatorios, fechas de reunión. |  100% PASS |
| **8. Seguridad y Hardening (14 tests)** | XSS, CSP, IDOR, Host Header, rate limiting, no auto-eliminación. |  100% PASS |
| **8.6.1 (SEC-07 Nuevo)** | **Recorrido completo de recuperación de contraseña y cambio efectivo.** |  **100% PASS** |
| **8.6.2 (SEC-08 Nuevo)** | **Sincronización en vivo de rol y revocación inmediata de permisos.** |  **100% PASS** |
| **8.6.3 (SEC-10 Nuevo)** | **Protección de cuentas base contra eliminación/degradación en modo demo.** |  **100% PASS** |
| **9. Rate Limit (1 test)** | Bloqueo por IP tras 5 intentos fallidos consecutivos de login. |  100% PASS |

---

## 4. Checklist para Despliegue en Producción (Hosting)

Para desplegar la aplicación en **Render**, **Railway** o **Fly.io** con total confiabilidad:

1. **Instancia Única:**
   * Desplegar en **1 réplica** (instancia única) debido al uso de SQLite basado en archivo.
2. **Volumen Persistente (Opcional pero Recomendado):**
   * Montar un disco persistente (ej. `/data`) y definir `DB_PATH=/data/database.sqlite` para mantener los cambios entre redespliegues.
3. **Variables de Entorno Mínimas Obligatorias:**
   * `NODE_ENV=production`
   * `PORT=3000` (o el asignado automáticamente por el proveedor)
   * `SESSION_SECRET`: Generar una cadena criptográfica de al menos 64 caracteres.
   * `APP_BASE_URL`: URL canónica del dominio (ej. `https://dispodocente.up.railway.app`).
   * `ADMIN_PASSWORD`: Contraseña segura para el administrador inicial.
   * `DEMO_MODE=true` *(si es instancia de demostración/portafolio con protección de cuentas)*.
   * `ALLOW_DEMO_ADMIN=false` *(por defecto deshabilitado en producción para evitar administración sin clave)*.
