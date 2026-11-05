// Script to seed complete synthetic demo dataset for portfolio presentations
// Run ONLY when server is stopped: npm run seed:demo
const path = require('path');
const fs = require('fs');

const proyectoDir = path.resolve(__dirname, '..', 'proyecto');
require(path.join(proyectoDir, 'node_modules', 'dotenv')).config({ path: path.join(proyectoDir, '.env') });
const initSqlJs = require(path.join(proyectoDir, 'node_modules', 'sql.js'));
const bcrypt = require(path.join(proyectoDir, 'node_modules', 'bcryptjs'));

const dbPath = path.resolve(proyectoDir, process.env.DB_PATH || 'database.sqlite');

async function main() {
  const SQL = await initSqlJs();
  let db;

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  const hash = (pwd) => bcrypt.hashSync(pwd, 10);

  // Insert or ignore Admin
  const adminRow = db.exec("SELECT id FROM users WHERE email='admin@universidad.cl'");
  if (!adminRow.length || !adminRow[0].values.length) {
    db.run("INSERT INTO users (email, password, nombre, rol) VALUES (?, ?, ?, ?)", [
      'admin@universidad.cl',
      hash('Admin123!'),
      'Administrador Demo',
      'admin',
    ]);
    console.log('Admin demo creado: admin@universidad.cl / Admin123!');
  }

  // Insert or ignore Docentes
  const d1 = db.exec("SELECT id FROM users WHERE email='ana.garcia@universidad.cl'");
  if (!d1.length || !d1[0].values.length) {
    db.run("INSERT INTO users (email, password, nombre, rol) VALUES (?, ?, ?, ?)", [
      'ana.garcia@universidad.cl',
      hash('docente123'),
      'Ana García',
      'docente',
    ]);
    const id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
    db.run(`INSERT INTO docentes (user_id, carrera, asignatura, es_part_time, disponible, descripcion_pt, bio, ramos, certificados, telefono, oficina)
            VALUES (?, ?, ?, 0, 1, null, ?, ?, ?, ?, ?)`, [
      id,
      'Ingeniería Informática',
      'Programación Web',
      'Docente e investigadora en arquitecturas web distribuidas y seguridad de aplicaciones.',
      'Programación Web, Seguridad Informática, Bases de Datos',
      'Magíster en Ciencias de la Computación, Certificación AWS Solutions Architect',
      '+56 9 1234 5678',
      'Edificio Central, Oficina 302',
    ]);
    console.log('Docente demo creada: ana.garcia@universidad.cl / docente123');
  }

  // Insert or ignore Estudiante
  const e1 = db.exec("SELECT id FROM users WHERE email='juan.estudiante@universidad.cl'");
  if (!e1.length || !e1[0].values.length) {
    db.run("INSERT INTO users (email, password, nombre, rol) VALUES (?, ?, ?, ?)", [
      'juan.estudiante@universidad.cl',
      hash('est123'),
      'Juan Pérez',
      'estudiante',
    ]);
    const id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
    db.run("INSERT INTO estudiantes (user_id, carrera, anio) VALUES (?, ?, ?)", [
      id,
      'Ingeniería Informática',
      '3er',
    ]);
    console.log('Estudiante demo creado: juan.estudiante@universidad.cl / est123');
  }

  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
  console.log('[seed-demo] Datos de demostración listos y persistidos.');
  db.close();
}

main().catch(console.error);
