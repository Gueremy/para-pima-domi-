const express = require('express');
const { db } = require('../db');
const { requireRole } = require('../middleware/auth');
const { notifyDocenteNuevoTicket, sendTicketConfirmacionEstudiante, sendTicketRespuestaEstudiante } = require('../mailer');

const router = express.Router();

router.post('/', requireRole('estudiante'), (req, res) => {
  const { docenteId, tipo, mensaje } = req.body;
  const estudianteId = req.session.user.id;

  if (!docenteId || !tipo) {
    return res.status(400).json({ error: 'docenteId y tipo son requeridos' });
  }
  if (!['presencial', 'escrita'].includes(tipo)) {
    return res.status(400).json({ error: 'Tipo inválido' });
  }

  const docenteUser = db.prepare('SELECT u.email, u.nombre FROM users u WHERE u.id = ? AND u.rol = ?')
    .get(docenteId, 'docente');
  if (!docenteUser) return res.status(404).json({ error: 'Docente no encontrado' });

  const MAX_PENDING = 10;
  const pendingCount = db.prepare(
    "SELECT COUNT(*) as cnt FROM tickets WHERE docente_id = ? AND estado = 'pendiente'"
  ).get(docenteId).cnt;
  if (pendingCount >= MAX_PENDING) {
    return res.status(429).json({ error: `El docente tiene ${MAX_PENDING} consultas pendientes. Intenta más tarde.` });
  }

  const result = db.prepare(
    'INSERT INTO tickets (estudiante_id, docente_id, tipo, mensaje) VALUES (?, ?, ?, ?)'
  ).run(estudianteId, docenteId, tipo, mensaje || '');

  notifyDocenteNuevoTicket(docenteUser.email, req.session.user.nombre, tipo).catch(console.warn);
  sendTicketConfirmacionEstudiante(
    req.session.user.email,
    req.session.user.nombre,
    docenteUser.nombre,
    tipo,
    mensaje || ''
  ).catch(console.warn);

  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(result.lastInsertRowid);
  return res.status(201).json(ticket);
});

router.get('/mis-tickets', requireRole('estudiante'), (req, res) => {
  const estudianteId = req.session.user.id;
  const tickets = db.prepare(`
    SELECT t.*, u.nombre as docente_nombre, u.email as docente_email,
           d.carrera, d.asignatura
    FROM tickets t
    JOIN users u ON t.docente_id = u.id
    JOIN docentes d ON u.id = d.user_id
    WHERE t.estudiante_id = ?
    ORDER BY t.created_at DESC
  `).all(estudianteId);
  return res.json(tickets);
});

router.get('/recibidos', requireRole('docente'), (req, res) => {
  const docenteId = req.session.user.id;
  const tickets = db.prepare(`
    SELECT t.*, u.nombre as estudiante_nombre, u.email as estudiante_email,
           e.carrera as estudiante_carrera, e.anio as estudiante_anio
    FROM tickets t
    JOIN users u ON t.estudiante_id = u.id
    LEFT JOIN estudiantes e ON t.estudiante_id = e.user_id
    WHERE t.docente_id = ?
    ORDER BY t.created_at DESC
  `).all(docenteId);

  const pendientes = tickets.filter((t) => t.estado === 'pendiente');
  const respondidos = tickets.filter((t) => t.estado === 'respondido');
  const resueltos = tickets.filter((t) => t.estado === 'resuelto');

  return res.json({ pendientes, respondidos, resueltos });
});

router.patch('/:id/responder', requireRole('docente'), (req, res) => {
  const ticketId = parseInt(req.params.id, 10);
  const docenteId = req.session.user.id;
  const { tipoRespuesta, respuesta } = req.body;

  if (isNaN(ticketId)) return res.status(400).json({ error: 'ID inválido' });
  if (!['resuelto', 'respuesta', 'reunion'].includes(tipoRespuesta)) {
    return res.status(400).json({ error: 'tipoRespuesta inválido' });
  }

  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ? AND docente_id = ?').get(ticketId, docenteId);
  if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });

  const nuevoEstado = tipoRespuesta === 'resuelto' ? 'resuelto' : 'respondido';

  db.prepare(`
    UPDATE tickets
    SET estado = ?, respuesta = ?, tipo_respuesta = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(nuevoEstado, respuesta || null, tipoRespuesta, ticketId);

  const estudianteRow = db.prepare(
    'SELECT u.email, u.nombre FROM users u JOIN tickets t ON t.estudiante_id = u.id WHERE t.id = ?'
  ).get(ticketId);
  if (estudianteRow) {
    sendTicketRespuestaEstudiante(
      estudianteRow.email,
      estudianteRow.nombre,
      req.session.user.nombre,
      tipoRespuesta,
      respuesta || null
    ).catch(console.warn);
  }

  const updated = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
  return res.json(updated);
});

router.get('/:id/ics', (req, res) => {
  const ticket = db.prepare(`
    SELECT t.*, u_est.nombre as estudiante_nombre, u_doc.nombre as docente_nombre, t.respuesta
    FROM tickets t
    JOIN users u_est ON t.estudiante_id = u_est.id
    JOIN users u_doc ON t.docente_id = u_doc.id
    WHERE t.id = ? AND t.tipo_respuesta = 'reunion'
  `).get(parseInt(req.params.id, 10));
  if (!ticket) return res.status(404).json({ error: 'No encontrado' });
  const now = new Date();
  const dtStamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DisponibilidadDocente//ES',
    'BEGIN:VEVENT',
    `DTSTART:${dtStamp}`,
    `DTEND:${dtStamp}`,
    `SUMMARY:Reunion con ${ticket.docente_nombre}`,
    `DESCRIPTION:${(ticket.respuesta || '').replace(/\n/g, '\\n')}`,
    `ORGANIZER:CN=${ticket.docente_nombre}`,
    `ATTENDEE:CN=${ticket.estudiante_nombre}`,
    `UID:ticket-${ticket.id}@disponibilidad-docente`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  res.setHeader('Content-Type', 'text/calendar');
  res.setHeader('Content-Disposition', `attachment; filename="reunion-${ticket.id}.ics"`);
  res.send(ics);
});

module.exports = router;
