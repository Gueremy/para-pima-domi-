const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const dbPath = path.resolve(__dirname, '..', process.env.DB_PATH || './database.sqlite');

let db = null;

function saveDb() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

// Wrap sql.js to mimic better-sqlite3 synchronous API
function prepare(sql) {
  return {
    run(...params) {
      db.run(sql, params);
      const id = db.exec('SELECT last_insert_rowid() as id')[0];
      saveDb();
      return { lastInsertRowid: id ? id.values[0][0] : null, changes: db.getRowsModified() };
    },
    get(...params) {
      const result = db.exec(sql, params);
      if (!result.length || !result[0].values.length) return undefined;
      const { columns, values } = result[0];
      return Object.fromEntries(columns.map((col, i) => [col, values[0][i]]));
    },
    all(...params) {
      const result = db.exec(sql, params);
      if (!result.length) return [];
      const { columns, values } = result[0];
      return values.map((row) => Object.fromEntries(columns.map((col, i) => [col, row[i]])));
    },
  };
}

function exec(sql) {
  db.exec(sql);
  saveDb();
}

async function initDb() {
  const SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  exec(`
    CREATE TABLE IF NOT EXISTS users (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      email     TEXT UNIQUE NOT NULL,
      password  TEXT NOT NULL,
      nombre    TEXT NOT NULL,
      rol       TEXT NOT NULL CHECK(rol IN ('estudiante', 'docente', 'admin')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS docentes (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER UNIQUE REFERENCES users(id),
      carrera         TEXT,
      asignatura      TEXT,
      es_part_time    BOOLEAN DEFAULT 0,
      disponible      BOOLEAN DEFAULT 0,
      descripcion_pt  TEXT
    );

    CREATE TABLE IF NOT EXISTS suscripciones (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      estudiante_id INTEGER REFERENCES users(id),
      docente_id    INTEGER REFERENCES users(id),
      UNIQUE(estudiante_id, docente_id)
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      estudiante_id  INTEGER REFERENCES users(id),
      docente_id     INTEGER REFERENCES users(id),
      tipo           TEXT NOT NULL CHECK(tipo IN ('presencial', 'escrita')),
      mensaje        TEXT,
      estado         TEXT DEFAULT 'pendiente' CHECK(estado IN ('pendiente', 'respondido', 'resuelto')),
      respuesta      TEXT,
      tipo_respuesta TEXT CHECK(tipo_respuesta IN ('resuelto', 'respuesta', 'reunion')),
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS horarios (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      docente_id INTEGER REFERENCES users(id),
      dia        TEXT NOT NULL,
      hora_inicio TEXT NOT NULL,
      hora_fin    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id   INTEGER REFERENCES users(id),
      token     TEXT UNIQUE NOT NULL,
      expires_at INTEGER NOT NULL,
      used      INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS estudiantes (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id   INTEGER UNIQUE REFERENCES users(id),
      carrera   TEXT,
      anio      TEXT
    );
  `);

  // Add new columns if they don't exist (migration)
  const existingCols = db.exec("PRAGMA table_info(docentes)")[0]?.values?.map(r => r[1]) || [];
  if (!existingCols.includes('bio')) {
    db.exec("ALTER TABLE docentes ADD COLUMN bio TEXT");
    db.exec("ALTER TABLE docentes ADD COLUMN ramos TEXT");
    db.exec("ALTER TABLE docentes ADD COLUMN certificados TEXT");
    db.exec("ALTER TABLE docentes ADD COLUMN telefono TEXT");
    db.exec("ALTER TABLE docentes ADD COLUMN oficina TEXT");
    saveDb();
  }

  await seedData();
}

async function seedData() {
  const result = db.exec('SELECT COUNT(*) as cnt FROM users');
  const cnt = result[0]?.values[0][0] || 0;
  if (cnt > 0) return;

  const hash = (pwd) => bcrypt.hashSync(pwd, 10);

  const insUser = prepare('INSERT INTO users (email, password, nombre, rol) VALUES (?, ?, ?, ?)');
  const insDocente = prepare(
    'INSERT INTO docentes (user_id, carrera, asignatura, es_part_time, disponible, descripcion_pt, bio, ramos, certificados, telefono, oficina) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  const d1 = insUser.run('ana.garcia@universidad.cl', hash('docente123'), 'Ana García', 'docente');
  const d2 = insUser.run('carlos.lopez@universidad.cl', hash('docente123'), 'Carlos López', 'docente');
  const d3 = insUser.run('maria.torres@universidad.cl', hash('docente123'), 'María Torres', 'docente');

  insDocente.run(d1.lastInsertRowid, 'Ingeniería Informática', 'Programación Web', 0, 1, null,
    'Docente con 10 años de experiencia en desarrollo web y arquitectura de software.',
    'Programación Web, Desarrollo de Software, Bases de Datos',
    'Magíster en Ingeniería Informática, Certificación AWS Solutions Architect',
    '+56 9 1234 5678', 'Edificio A, Oficina 302');
  insDocente.run(d2.lastInsertRowid, 'Ingeniería Civil', 'Cálculo Diferencial', 1, 0, 'Disponible lunes y miércoles por las tardes',
    'Especialista en matemáticas aplicadas e ingeniería estructural.',
    'Cálculo Diferencial, Álgebra Lineal, Ecuaciones Diferenciales',
    'Doctor en Ciencias de la Ingeniería',
    '+56 9 8765 4321', 'Edificio B, Oficina 115');
  insDocente.run(d3.lastInsertRowid, 'Administración de Empresas', 'Contabilidad General', 0, 1, null,
    'Contadora pública con experiencia en auditoría y finanzas corporativas.',
    'Contabilidad General, Auditoría, Finanzas Empresariales',
    'MBA Finanzas, Contador Público Certificado',
    '+56 9 5555 1234', 'Edificio C, Oficina 210');

  insUser.run('juan.estudiante@universidad.cl', hash('est123'), 'Juan Pérez', 'estudiante');
  insUser.run('sofia.alumna@universidad.cl', hash('est123'), 'Sofía Ramírez', 'estudiante');
}

// Expose a db proxy that uses our wrappers
const dbProxy = {
  prepare,
  exec,
  pragma: () => {},
};

module.exports = { db: dbProxy, initDb };
