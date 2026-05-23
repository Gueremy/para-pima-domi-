const express = require('express');
const { db } = require('../db');

const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.rol !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  next();
}

// GET /api/admin/usuarios — list all users
router.get('/usuarios', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, email, nombre, rol, created_at FROM users ORDER BY created_at DESC').all();
  res.json(users);
});

// DELETE /api/admin/usuarios/:id
router.delete('/usuarios/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  db.prepare('DELETE FROM tickets WHERE estudiante_id = ? OR docente_id = ?').run(id, id);
  db.prepare('DELETE FROM suscripciones WHERE estudiante_id = ? OR docente_id = ?').run(id, id);
  db.prepare('DELETE FROM docentes WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM estudiantes WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
});

// GET /api/admin/stats
router.get('/stats', requireAdmin, (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) as n FROM users').get().n;
  const totalDocentes = db.prepare("SELECT COUNT(*) as n FROM users WHERE rol='docente'").get().n;
  const totalEstudiantes = db.prepare("SELECT COUNT(*) as n FROM users WHERE rol='estudiante'").get().n;
  const totalTickets = db.prepare('SELECT COUNT(*) as n FROM tickets').get().n;
  const pendingTickets = db.prepare("SELECT COUNT(*) as n FROM tickets WHERE estado='pendiente'").get().n;
  res.json({ totalUsers, totalDocentes, totalEstudiantes, totalTickets, pendingTickets });
});

// PATCH /api/admin/usuarios/:id/rol
router.patch('/usuarios/:id/rol', requireAdmin, (req, res) => {
  const { rol } = req.body;
  if (!['estudiante', 'docente', 'admin'].includes(rol)) {
    return res.status(400).json({ error: 'Rol inválido' });
  }
  db.prepare('UPDATE users SET rol=? WHERE id=?').run(rol, parseInt(req.params.id, 10));
  res.json({ ok: true });
});

module.exports = router;
