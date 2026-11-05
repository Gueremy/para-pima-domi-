const express = require('express');
const { db } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
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
  if (mensaje && mensaje.length > 2000) {
    return res.status(400).json({ error: 'El mensaje no puede exceder los 2000 caracteres' });
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
  ).run(estudianteId, docenteId, tipo, (mensaje || '').trim());

  notifyDocenteNuevoTicket(docenteUser.email, req.session.user.nombre, tipo).catch(console.warn);
  sendTicketConfirmacionEstudiante(
    req.session.user.email,
    req.session.user.nombre,
    docenteUser.nombre,
    tipo,
    (mensaje || '').trim()
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
  const { tipoRespuesta, respuesta, fechaReunion } = req.body;

  if (isNaN(ticketId)) return res.status(400).json({ error: 'ID inválido' });
  if (!['resuelto', 'respuesta', 'reunion'].includes(tipoRespuesta)) {
    return res.status(400).json({ error: 'tipoRespuesta inválido' });
  }

  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ? AND docente_id = ?').get(ticketId, docenteId);
  if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });

  const nuevoEstado = tipoRespuesta === 'resuelto' ? 'resuelto' : 'respondido';
  const meetingDate = (tipoRespuesta === 'reunion' && fechaReunion) ? fechaReunion : null;

  db.prepare(`
    UPDATE tickets
    SET estado = ?, respuesta = ?, tipo_respuesta = ?, fecha_reunion = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(nuevoEstado, respuesta ? respuesta.trim() : null, tipoRespuesta, meetingDate, ticketId);

  const estudianteRow = db.prepare(
    'SELECT u.email, u.nombre FROM users u JOIN tickets t ON t.estudiante_id = u.id WHERE t.id = ?'
  ).get(ticketId);
  if (estudianteRow) {
    sendTicketRespuestaEstudiante(
      estudianteRow.email,
      estudianteRow.nombre,
      req.session.user.nombre,
      tipoRespuesta,
      respuesta ? respuesta.trim() : null
    ).catch(console.warn);
  }

  const updated = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
  return res.json(updated);
});

// SEC-05 & BUS-01: Protected and realistic ICS generation
router.get('/:id/ics', requireAuth, (req, res) => {
  const ticketId = parseInt(req.params.id, 10);
  if (isNaN(ticketId)) return res.status(400).json({ error: 'ID inválido' });

  const ticket = db.prepare(`
    SELECT t.*, u_est.nombre as estudiante_nombre, u_est.email as estudiante_email,
           u_doc.nombre as docente_nombre, u_doc.email as docente_email, t.respuesta
    FROM tickets t
    JOIN users u_est ON t.estudiante_id = u_est.id
    JOIN users u_doc ON t.docente_id = u_doc.id
    WHERE t.id = ? AND t.tipo_respuesta = 'reunion'
  `).get(ticketId);

  if (!ticket) return res.status(404).json({ error: 'Ticket de reunión no encontrado' });

  // Ownership verification
  const currentUserId = req.session.user.id;
  if (currentUserId !== ticket.estudiante_id && currentUserId !== ticket.docente_id && req.session.user.rol !== 'admin') {
    return res.status(403).json({ error: 'No autorizado para acceder a este calendario' });
  }

  let startDate = new Date();
  if (ticket.fecha_reunion) {
    const parsed = new Date(ticket.fecha_reunion);
    if (!isNaN(parsed.getTime())) startDate = parsed;
  } else {
    // Tomorrow at 10:00 AM local if no date was recorded
    startDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    startDate.setHours(10, 0, 0, 0);
  }
  const endDate = new Date(startDate.getTime() + 45 * 60 * 1000); // 45 minutes

  const formatIcsDate = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const dtStamp = formatIcsDate(new Date());
  const dtStart = formatIcsDate(startDate);
  const dtEnd = formatIcsDate(endDate);

  const escapeIcs = (str) => (str || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DispoDocente//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:ticket-${ticket.id}@dispodocente.universidad.cl`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:Reunión con ${escapeIcs(ticket.docente_nombre)}`,
    `DESCRIPTION:${escapeIcs(ticket.respuesta || 'Reunión coordinada mediante DispoDocente.')}`,
    `ORGANIZER;CN=${escapeIcs(ticket.docente_nombre)}:MAILTO:${ticket.docente_email}`,
    `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=${escapeIcs(ticket.estudiante_nombre)}:MAILTO:${ticket.estudiante_email}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="reunion-${ticket.id}.ics"`);
  res.send(ics);
});

module.exports = router;
