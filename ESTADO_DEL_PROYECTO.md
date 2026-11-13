# DispoDocente — estado y preparación de la demo

**Revisión:** 13 de noviembre de 2026
**Repositorio:** [Gueremy/para-pima-domi-](https://github.com/Gueremy/para-pima-domi-)
**Estado:** [demo gratuita y desechable publicada](https://dispodocente-demo-9wlz.onrender.com/); apta para mostrar en el portafolio con datos ficticios, sin persistencia garantizada.

## Evidencia disponible

- La suite actual contiene **54 pruebas Playwright**. En una ejecución local con Node.js 22 y Chrome instalado, **54/54 aprobaron**. Esta cifra corresponde a pruebas funcionales, no a cobertura total ni a una auditoría de seguridad exhaustiva.
- `npm ci` completó tras eliminar `better-sqlite3`, dependencia nativa que no usa el código y que impedía instalar el proyecto en Windows sin herramientas de compilación. `npm audit` y `npm audit --omit=dev` informaron **0 vulnerabilidades** en la fecha de esta revisión. Los avisos pueden cambiar con nuevas publicaciones.
- [GitHub Actions](https://github.com/Gueremy/para-pima-domi-/actions/runs/43359084291) aprobó **54/54** en el segundo intento del PR. El primer intento tuvo un tiempo de espera al pulsar un botón del navegador en una prueba de calendario (53/54). El fallo no se reprodujo en el reintento ni en la ejecución local.
- El [último CI del PR](https://github.com/Gueremy/para-pima-domi-/actions/runs/43359978891) aprobó **54/54** antes de fusionarse. El [despliegue gratuito de Render](https://dashboard.render.com/web/srv-dbr8bq59fdbs73dk4u10) quedó activo desde `main`.
- En la URL pública se verificó `/ready` (200), inicio de sesión de estudiante y docente sintéticos (200), rechazo del acceso rápido admin (403), recuperación desactivada sin exposición de token y cookies de sesión `Secure`.

## Seguridad de la demo

- El registro público solo admite estudiantes. El acceso rápido a administrador está deshabilitado en producción. El acceso rápido a estudiante y docente usa cuentas sintéticas concretas, sin seleccionar usuarios reales por rol.
- En `DEMO_MODE=true`, `/api/reset/request` no crea ni devuelve tokens. La interfaz explica que la recuperación está desactivada en la demo. El flujo de recuperación con correo real queda pendiente de probar en un entorno privado con `DEMO_MODE=false`.
- `requireAuth` comprueba el usuario y su rol vigente en la base. Los cambios de rol, bajas y restablecimientos revocan sesiones mediante `sessions.user_id`. Las sesiones anteriores a la migración de esa columna deben considerarse caducadas al desplegar.
- En producción se exige `SESSION_SECRET` y `ADMIN_PASSWORD` único de al menos 16 caracteres. `APP_BASE_URL`, `EMAIL_USER` y `EMAIL_PASS` son obligatorios cuando `DEMO_MODE=false` y la recuperación está activa. El transporte actual usa Gmail. Las credenciales locales del README son solo para desarrollo.

## Persistencia y límites

La aplicación usa `sql.js`: mantiene SQLite en memoria y exporta el archivo tras las escrituras. El archivo temporal y el renombrado reducen el riesgo de dejar un archivo incompleto, pero no convierten el sistema en una base multiinstancia. El **plan gratuito de Render no conserva el archivo entre reinicios o despliegues**. Esta demo usa solo datos ficticios y se restaura desde la siembra inicial. Para persistencia real se necesita un plan con volumen persistente y copias de seguridad verificadas.

## Publicación y próximos pasos

1. Enlazar [la demo](https://dispodocente-demo-9wlz.onrender.com/) desde el portafolio e indicar que los cambios de visitantes pueden desaparecer al reiniciar o redesplegar.
2. Revisar manualmente en la URL pública los flujos de tickets y calendario. La suite los cubre en CI, pero el chequeo HTTP del despliegue solo cubrió autenticación, recuperación y salud.
3. Verificar que la demo vuelve a tener cuentas sintéticas tras un futuro reinicio o despliegue. La siembra inicial no se ha comprobado provocando un reinicio de la instancia pública.
4. Antes de usar datos reales o prometer disponibilidad continua, migrar a una arquitectura con persistencia y copias de seguridad verificadas; probar el correo real en un entorno privado con `DEMO_MODE=false`.

**Alcance:** la demo está publicada para portafolio; este documento no declara el sistema listo para producción con datos reales.
