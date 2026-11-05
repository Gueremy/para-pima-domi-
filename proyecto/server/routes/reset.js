const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { sendPasswordReset } = require('../mailer');
require('dotenv').config();

const router = express.Router();

const resetAttempts = new Map(); // ip -> { count, resetAt }
const MAX_RESET_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function isResetRateLimited(ip) {
  const now = Date.now();
  const entry = resetAttempts.get(ip);
  if (!entry) return false;
  if (now > entry.resetAt) {
    resetAttempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_RESET_ATTEMPTS;
}

function recordResetAttempt(ip) {
  const now = Date.now();
  const entry = resetAttempts.get(ip) || { count: 0, resetAt: now + WINDOW_MS };
  if (now > entry.resetAt) {
    resetAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count++;
  resetAttempts.set(ip, entry);
}

// POST /api/reset/request — body: { email }
router.post('/request', async (req, res) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  if (isResetRateLimited(ip)) {
    return res.status(429).json({ error: 'Demasiadas solicitudes de recuperación. Intenta más tarde.' });
  }
  recordResetAttempt(ip);

  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerido' });

  const cleanEmail = email.trim().toLowerCase();
  const user = db.prepare('SELECT id, nombre FROM users WHERE email = ?').get(cleanEmail);

  // Always return 200 to avoid account enumeration
  if (!user) return res.json({ ok: true });

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expires = Date.now() + 3600000; // 1 hour

  db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id);
  db.prepare('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, tokenHash, expires);

  // AUTH-01: Use trusted APP_BASE_URL to prevent Host Header injection
  const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
  const resetUrl = `${baseUrl.replace(/\/$/, '')}/reset.html?token=${rawToken}`;

  sendPasswordReset(cleanEmail, user.nombre, resetUrl).catch(console.warn);
  res.json({ ok: true });
});

// POST /api/reset/confirm — body: { token, password }
router.post('/confirm', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password || password.length < 6) {
    return res.status(400).json({ error: 'Token inválido o contraseña menor a 6 caracteres' });
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  // Check against either hashed token or legacy raw token
  const row = db.prepare('SELECT * FROM password_resets WHERE (token = ? OR token = ?) AND used = 0').get(tokenHash, token);

  if (!row) return res.status(400).json({ error: 'Token inválido o ya utilizado' });
  if (Date.now() > row.expires_at) return res.status(400).json({ error: 'El token ha expirado. Solicita uno nuevo.' });

  const hash = bcrypt.hashSync(password, 10);

  const resetTx = db.transaction((userId, resetId, newHash) => {
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(newHash, userId);
    db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(resetId);
    // Invalidate any active sessions for this user across devices
    try {
      db.prepare("DELETE FROM sessions WHERE sess LIKE ?").run(`%"id":${userId}%`);
    } catch (_) {}
  });

  try {
    resetTx(row.user_id, row.id, hash);
    return res.json({ ok: true, message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    console.error('Error al restablecer contraseña:', err);
    return res.status(500).json({ error: 'Error al actualizar contraseña' });
  }
});

module.exports = router;
