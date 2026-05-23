const express = require('express');
const { db } = require('../db');
const { requireRole } = require('../middleware/auth');
const { notifyDocenteDisponible } = require('../mailer');

const router = express.Router();

router.get('/', (req, res) => {
  const { nombre, carrera, asignatura } = req.query;
  let query = `
    SELECT u.id, u.nombre, u.email, d.carrera, d.asignatura,
           d.disponible, d.es_part_time, d.descripcion_pt, d.id as docente_id,
           d.bio, d.ramos, d.certificados, d.telefono, d.oficina
    FROM users u JOIN docentes d ON u.id = d.user_id WHERE 1=1
  `;
  const params = [];

  if (nombre) { query += ' AND u.nombre LIKE ?'; params.push(`%${nombre}%`); }
  if (carrera) { query += ' AND d.carrera LIKE ?'; params.push(`%${carrera}%`); }
  if (asignatura) { query += ' AND d.asignatura LIKE ?'; params.push(`%${asignatura}%`); }
  if (req.query.disponible === '1') { query += ' AND d.disponible = 1'; }

  const docentes = db.prepare(query).all(...params);

  if (req.session && req.session.user && req.session.user.rol === 'estudiante') {
    const subs = db.prepare('SELECT docente_id FROM suscripciones WHERE estudiante_id = ?')
      .all(req.session.user.id)
      .map((s) => s.docente_id);
    return res.json(docentes.map((d) => ({ ...d, suscrito: subs.includes(d.id) })));
  }

  return res.json(docentes.map((d) => ({ ...d, suscrito: false })));
});

router.get('/opciones', (req, res) => {
  const carreras = db.prepare('SELECT DISTINCT carrera FROM docentes WHERE carrera IS NOT NULL ORDER BY carrera').all().map(r => r.carrera);
  const asignaturas = db.prepare('SELECT DISTINCT asignatura FROM docentes WHERE asignatura IS NOT NULL ORDER BY asignatura').all().map(r => r.asignatura);
  res.json({ carreras, asignaturas });
});

router.patch('/disponibilidad', requireRole('docente'), (req, res) => {
  const { disponible } = req.body;
  if (typeof disponible !== 'boolean') {
    return res.status(400).json({ error: 'El campo disponible debe ser booleano' });
  }

  const userId = req.session.user.id;
  db.prepare('UPDATE docentes SET disponible = ? WHERE user_id = ?').run(disponible ? 1 : 0, userId);

  if (disponible) {
    const suscriptores = db.prepare(`
      SELECT u.email, u.nombre
      FROM suscripciones s
      JOIN users u ON s.estudiante_id = u.id
      WHERE s.docente_id = ?
    `).all(userId);

    if (suscriptores.length > 0) {
      notifyDocenteDisponible(req.session.user.nombre, suscriptores).catch(console.warn);
    }
  }

  return res.json({ disponible });
});

router.get('/mi-perfil', requireRole('docente'), (req, res) => {
  const docente = db.prepare('SELECT * FROM docentes WHERE user_id = ?').get(req.session.user.id);
  return res.json(docente);
});

router.patch('/perfil', requireRole('docente'), (req, res) => {
  const { carrera, asignatura, descripcion_pt, es_part_time, bio, ramos, certificados, telefono, oficina } = req.body;
  db.prepare(`UPDATE docentes SET carrera=?, asignatura=?, descripcion_pt=?, es_part_time=?,
    bio=?, ramos=?, certificados=?, telefono=?, oficina=? WHERE user_id=?`)
    .run(carrera||null, asignatura||null, descripcion_pt||null, es_part_time?1:0,
         bio||null, ramos||null, certificados||null, telefono||null, oficina||null,
         req.session.user.id);
  res.json({ ok: true });
});

// Horarios — own (docente)
router.get('/horarios', requireRole('docente'), (req, res) => {
  const horarios = db.prepare('SELECT * FROM horarios WHERE docente_id = ? ORDER BY dia, hora_inicio').all(req.session.user.id);
  res.json(horarios);
});

router.post('/horarios', requireRole('docente'), (req, res) => {
  const { dia, hora_inicio, hora_fin } = req.body;
  const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
  if (!dias.includes(dia)) return res.status(400).json({ error: 'Día inválido' });
  if (!hora_inicio || !hora_fin) return res.status(400).json({ error: 'Horas requeridas' });
  const result = db.prepare('INSERT INTO horarios (docente_id, dia, hora_inicio, hora_fin) VALUES (?,?,?,?)').run(req.session.user.id, dia, hora_inicio, hora_fin);
  res.status(201).json({ id: result.lastInsertRowid, dia, hora_inicio, hora_fin });
});

router.delete('/horarios/:id', requireRole('docente'), (req, res) => {
  db.prepare('DELETE FROM horarios WHERE id = ? AND docente_id = ?').run(parseInt(req.params.id, 10), req.session.user.id);
  res.json({ ok: true });
});

// Horarios — public (by docenteId)
router.get('/:docenteId/horarios', (req, res) => {
  const horarios = db.prepare('SELECT dia, hora_inicio, hora_fin FROM horarios WHERE docente_id = ? ORDER BY dia, hora_inicio').all(parseInt(req.params.docenteId, 10));
  res.json(horarios);
});

router.get('/:docenteId', (req, res, next) => {
  const id = parseInt(req.params.docenteId, 10);
  if (isNaN(id)) return next();
  const row = db.prepare(`
    SELECT u.id, u.nombre, u.email, d.carrera, d.asignatura,
           d.disponible, d.es_part_time, d.descripcion_pt,
           d.bio, d.ramos, d.certificados, d.telefono, d.oficina
    FROM users u JOIN docentes d ON u.id = d.user_id
    WHERE u.id = ?
  `).get(id);
  if (!row) return res.status(404).json({ error: 'Docente no encontrado' });
  res.json(row);
});

router.post('/suscribir/:docenteId', requireRole('estudiante'), (req, res) => {
  const docenteId = parseInt(req.params.docenteId, 10);
  const estudianteId = req.session.user.id;

  if (isNaN(docenteId)) return res.status(400).json({ error: 'ID de docente inválido' });

  const docenteUser = db.prepare('SELECT id FROM users WHERE id = ? AND rol = ?').get(docenteId, 'docente');
  if (!docenteUser) return res.status(404).json({ error: 'Docente no encontrado' });

  const existing = db.prepare(
    'SELECT id FROM suscripciones WHERE estudiante_id = ? AND docente_id = ?'
  ).get(estudianteId, docenteId);

  if (existing) {
    db.prepare('DELETE FROM suscripciones WHERE estudiante_id = ? AND docente_id = ?').run(estudianteId, docenteId);
    return res.json({ suscrito: false });
  } else {
    db.prepare('INSERT INTO suscripciones (estudiante_id, docente_id) VALUES (?, ?)').run(estudianteId, docenteId);
    return res.json({ suscrito: true });
  }
});

module.exports = router;
