const express = require('express');
const { db } = require('../db');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/estudiantes/perfil
router.get('/perfil', requireRole('estudiante'), (req, res) => {
  const perfil = db.prepare('SELECT carrera, anio FROM estudiantes WHERE user_id = ?').get(req.session.user.id);
  res.json(perfil || { carrera: null, anio: null });
});

// PATCH /api/estudiantes/perfil
router.patch('/perfil', requireRole('estudiante'), (req, res) => {
  const { carrera, anio } = req.body;
  const existing = db.prepare('SELECT id FROM estudiantes WHERE user_id = ?').get(req.session.user.id);
  if (existing) {
    db.prepare('UPDATE estudiantes SET carrera=?, anio=? WHERE user_id=?').run(carrera || null, anio || null, req.session.user.id);
  } else {
    db.prepare('INSERT INTO estudiantes (user_id, carrera, anio) VALUES (?,?,?)').run(req.session.user.id, carrera || null, anio || null);
  }
  res.json({ ok: true });
});

module.exports = router;
