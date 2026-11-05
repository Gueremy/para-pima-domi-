// Script to seed admin user securely into the database
// Run ONLY when server is stopped: npm run seed:admin
const path = require('path');
const fs = require('fs');

const proyectoDir = path.resolve(__dirname, '..', 'proyecto');
require(path.join(proyectoDir, 'node_modules', 'dotenv')).config({ path: path.join(proyectoDir, '.env') });
const initSqlJs = require(path.join(proyectoDir, 'node_modules', 'sql.js'));
const bcrypt = require(path.join(proyectoDir, 'node_modules', 'bcryptjs'));

const dbPath = path.resolve(proyectoDir, process.env.DB_PATH || 'database.sqlite');
const adminEmail = process.env.ADMIN_EMAIL || 'admin@universidad.cl';
const adminPass = process.env.ADMIN_PASSWORD || 'Admin123!';
const adminName = process.env.ADMIN_NAME || 'Administrador General';

async function main() {
  const SQL = await initSqlJs();
  let db;

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Ensure users table exists with admin role
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      email     TEXT UNIQUE NOT NULL,
      password  TEXT NOT NULL,
      nombre    TEXT NOT NULL,
      rol       TEXT NOT NULL CHECK(rol IN ('estudiante', 'docente', 'admin')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const existing = db.exec("SELECT id FROM users WHERE email = '" + adminEmail.replace(/'/g, "''") + "'");
  if (existing.length > 0 && existing[0].values.length > 0) {
    console.log(`[seed-admin] El usuario admin (${adminEmail}) ya existe. Saltando.`);
    db.close();
    return;
  }

  const hash = bcrypt.hashSync(adminPass, 10);
  db.run('INSERT INTO users (email, password, nombre, rol) VALUES (?, ?, ?, ?)', [
    adminEmail,
    hash,
    adminName,
    'admin',
  ]);

  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
  console.log(`[seed-admin] Usuario administrador creado exitosamente: ${adminEmail}`);
  db.close();
}

main().catch(console.error);
