const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { sendPasswordReset } = require('../mailer');

const router = express.Router();

// POST /api/reset/request — body: { email }
router.post('/request', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  const user = db.prepare('SELECT id, nombre FROM users WHERE email = ?').get(email.trim().toLowerCase());
  // Always 200 to avoid enumeration
  if (!user) return res.json({ ok: true });
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + 3600000; // 1 hour
  db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id);
  db.prepare('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?,?,?)').run(user.id, token, expires);
  const resetUrl = `${req.protocol}://${req.get('host')}/reset.html?token=${token}`;
  sendPasswordReset(email, user.nombre, resetUrl).catch(console.warn);
  res.json({ ok: true });
});

// POST /api/reset/confirm — body: { token, password }
router.post('/confirm', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password || password.length < 6) {
    return res.status(400).json({ error: 'Token o contraseña inválidos' });
  }
  const row = db.prepare('SELECT * FROM password_resets WHERE token = ? AND used = 0').get(token);
  if (!row) return res.status(400).json({ error: 'Token inválido o expirado' });
  if (Date.now() > row.expires_at) return res.status(400).json({ error: 'Token expirado' });
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, row.user_id);
  db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

module.exports = router;
