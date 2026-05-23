# DispoDocente

Sistema web universitario que permite a estudiantes consultar la disponibilidad de docentes y enviarles tickets de consulta (presencial o escrita). Los docentes gestionan su disponibilidad, horarios y responden tickets. Un administrador supervisa todos los usuarios.

![Demo](demo.png)

## Stack

| Tecnologia | Version |
|------------|---------|
| Node.js | >= 18 |
| Express | ^4.18.0 |
| SQLite (sql.js) | ^1.14.1 |
| better-sqlite3 | ^9.6.0 |
| Nodemailer | ^6.9.0 |
| bcryptjs | ^3.0.3 |
| express-session | ^1.17.0 |
| nodemon (dev) | ^3.0.0 |

## Instalacion

1. Clonar el repositorio:
   ```bash
   git clone https://github.com/Gueremy/para-pima-domi-
   cd "para-pima-domi-/proyecto"
   ```

2. Instalar dependencias:
   ```bash
   npm install
   ```

3. Copiar el archivo de variables de entorno:
   ```bash
   cp .env.example .env
   ```

4. Completar las variables en `.env`:
   ```env
   SESSION_SECRET=una_clave_secreta_larga
   EMAIL_USER=tu_correo@gmail.com
   EMAIL_PASS=tu_app_password_de_gmail
   DOMAIN=@universidad.cl
   ADMIN_EMAIL=admin@universidad.cl
   DB_PATH=./database.sqlite
   PORT=3000
   ```

5. Iniciar el servidor en modo desarrollo:
   ```bash
   npm run dev
   ```

   El sistema queda disponible en `http://localhost:3000`.

> Para crear el primer usuario admin (despues de que el servidor haya corrido al menos una vez):
> ```bash
> node ../scripts/seed-admin.js
> ```

## Usuarios de prueba

Estos usuarios se insertan automaticamente al iniciar el servidor por primera vez (base de datos vacia).

| Email | Contrasena | Rol |
|-------|-----------|-----|
| ana.garcia@universidad.cl | docente123 | docente |
| carlos.lopez@universidad.cl | docente123 | docente |
| maria.torres@universidad.cl | docente123 | docente |
| juan.estudiante@universidad.cl | est123 | estudiante |
| sofia.alumna@universidad.cl | est123 | estudiante |
| admin@universidad.cl | Admin123! | admin (crear con seed-admin.js) |

## Paginas

| Ruta URL | Descripcion | Quien accede |
|----------|-------------|--------------|
| `/` | Buscador publico de docentes con filtros y envio de tickets | Cualquier visitante / estudiante |
| `/login.html` | Formulario de login y registro | Visitante sin sesion |
| `/docente.html` | Panel del docente: tickets, horarios, perfil, disponibilidad | Docente autenticado |
| `/estudiante.html` | Panel del estudiante: tickets, buscador de docentes, perfil | Estudiante autenticado |
| `/admin.html` | Panel admin: estadisticas y gestion de usuarios | Admin autenticado |
| `/reset.html` | Solicitud y confirmacion de recuperacion de contrasena | Cualquier visitante |

---

Para documentacion tecnica completa ver [DOCUMENTACION.md](DOCUMENTACION.md)
