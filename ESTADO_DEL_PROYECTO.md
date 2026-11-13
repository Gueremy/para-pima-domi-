# DispoDocente — estado y preparación de la demo

**Revisión:** 13 de noviembre de 2026
**Repositorio:** [Gueremy/para-pima-domi-](https://github.com/Gueremy/para-pima-domi-)
**Estado:** cambios de seguridad y documentación preparados; despliegue público pendiente de validar.

## Evidencia disponible

- La suite actual contiene **54 pruebas Playwright**. En una ejecución local con Node.js 22 y Chrome instalado, **54/54 aprobaron**. Esta cifra corresponde a pruebas funcionales, no a cobertura total ni a una auditoría de seguridad exhaustiva.
- `npm ci` completó tras eliminar `better-sqlite3`, dependencia nativa que no usa el código y que impedía instalar el proyecto en Windows sin herramientas de compilación. `npm audit` y `npm audit --omit=dev` informaron **0 vulnerabilidades** en la fecha de esta revisión. Los avisos pueden cambiar con nuevas publicaciones.
- La última CI remota citada en el reporte anterior aprobó **51/51** en el commit `11f2ad6`. Los cambios recientes requieren una nueva corrida de GitHub Actions; el resultado local no sustituye esa comprobación.

## Seguridad de la demo

- El registro público solo admite estudiantes. El acceso rápido a administrador está deshabilitado en producción. El acceso rápido a estudiante y docente usa cuentas sintéticas concretas, sin seleccionar usuarios reales por rol.
- En `DEMO_MODE=true`, `/api/reset/request` no crea ni devuelve tokens. La interfaz explica que la recuperación está desactivada en la demo. El flujo de recuperación con correo real queda pendiente de probar en un entorno privado con `DEMO_MODE=false`.
- `requireAuth` comprueba el usuario y su rol vigente en la base. Los cambios de rol, bajas y restablecimientos revocan sesiones mediante `sessions.user_id`. Las sesiones anteriores a la migración de esa columna deben considerarse caducadas al desplegar.
- En producción se exige `SESSION_SECRET` y `ADMIN_PASSWORD` único de al menos 16 caracteres. `APP_BASE_URL`, `EMAIL_USER` y `EMAIL_PASS` son obligatorios cuando `DEMO_MODE=false` y la recuperación está activa. El transporte actual usa Gmail. Las credenciales locales del README son solo para desarrollo.

## Persistencia y límites

La aplicación usa `sql.js`: mantiene SQLite en memoria y exporta el archivo tras las escrituras. El archivo temporal y el renombrado reducen el riesgo de dejar un archivo incompleto, pero no convierten el sistema en una base multiinstancia ni garantizan durabilidad ante todos los fallos de energía. Debe desplegarse en **una sola réplica**, con un volumen persistente que permita escribir el archivo de base y los temporales. Debe probarse la restauración de una copia de seguridad.

## Pasos para publicar la demo de portafolio

1. Desplegar desde `proyecto/` en Node.js 22 con `npm ci --omit=dev` y `npm start`. Montar un volumen persistente y definir `DB_PATH` como ruta absoluta dentro de él.
2. Configurar `NODE_ENV=production`, `SESSION_SECRET` aleatorio, `ADMIN_PASSWORD` único y `DEMO_MODE=true`. La contraseña inicial no cambia automáticamente una cuenta admin ya existente; rotarla antes de publicar una base previa.
3. Verificar en la URL pública `/ready`, cookies seguras detrás del proxy HTTPS, acceso rápido de estudiante y docente, rechazo del acceso rápido admin, rechazo de recuperación en demo, tickets y calendario. Reiniciar la instancia y comprobar que los datos persisten.
4. Revisar el resultado de GitHub Actions en el commit de despliegue, realizar una copia de seguridad y probar su restauración. Solo entonces enlazar la demo desde el portafolio.

**Pendiente:** no hay evidencia aquí de una instancia pública desplegada ni de una prueba del correo real. Por tanto, este documento no declara «listo para producción».
