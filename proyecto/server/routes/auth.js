const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');
require('dotenv').config();

const router = express.Router();
const DOMAIN = process.env.DOMAIN || '@universidad.cl';

const loginAttempts = new Map(); // ip -> { count, resetAt }
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 min

function isRateLimited(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (now > entry.resetAt) {
    loginAttempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailedLogin(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, resetAt: now + WINDOW_MS };
  if (now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count++;
  loginAttempts.set(ip, entry);
}

router.post('/register', async (req, res) => {
  const { email, password, nombre, rol } = req.body;

  if (!email || !password || !nombre || !rol) {
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  }
  if (!email.endsWith(DOMAIN)) {
    return res.status(400).json({ error: `El email debe contener ${DOMAIN}` });
  }
  if (!['estudiante', 'docente'].includes(rol)) {
    if (!(rol === 'admin' && email === process.env.ADMIN_EMAIL)) {
      return res.status(400).json({ error: 'Rol inválido' });
    }
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  try {
    const hashed = await bcrypt.hash(password, 10);
    const stmt = db.prepare('INSERT INTO users (email, password, nombre, rol) VALUES (?, ?, ?, ?)');
    const result = stmt.run(email, hashed, nombre, rol);

    if (rol === 'docente') {
      db.prepare('INSERT INTO docentes (user_id) VALUES (?)').run(result.lastInsertRowid);
    }

    const user = db.prepare('SELECT id, email, nombre, rol FROM users WHERE id = ?').get(result.lastInsertRowid);
    req.session.user = user;
    return res.status(201).json({ user });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'El email ya está registrado' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.post('/login', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos.' });
  }

  const { email, password } = req.body;

  if (!email || !password) {
    recordFailedLogin(ip);
    return res.status(400).json({ error: 'Email y contraseña requeridos' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    recordFailedLogin(ip);
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    recordFailedLogin(ip);
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const sessionUser = { id: user.id, email: user.email, nombre: user.nombre, rol: user.rol };
  req.session.user = sessionUser;
  return res.json({ user: sessionUser });
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Error al cerrar sesión' });
    res.clearCookie('connect.sid');
    return res.json({ message: 'Sesión cerrada' });
  });
});

router.get('/me', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  return res.json({ user: req.session.user });
});

router.patch('/nombre', requireAuth, (req, res) => {
  const { nombre } = req.body;
  if (!nombre || nombre.trim().length < 2) return res.status(400).json({ error: 'Nombre inválido' });
  db.prepare('UPDATE users SET nombre=? WHERE id=?').run(nombre.trim(), req.session.user.id);
  req.session.user.nombre = nombre.trim();
  res.json({ ok: true });
});

module.exports = router;
