const nodemailer = require('nodemailer');
require('dotenv').config();

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  return transporter;
}

async function sendMail({ to, subject, html }) {
  try {
    const t = getTransporter();
    await t.sendMail({
      from: `"Sistema Docente" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
  } catch (err) {
    console.warn('[mailer] Email send failed (non-fatal):', err.message);
  }
}

async function notifyDocenteDisponible(docenteNombre, suscriptores) {
  const promises = suscriptores.map((s) =>
    sendMail({
      to: s.email,
      subject: `El docente ${docenteNombre} está disponible`,
      html: `<p>Hola ${s.nombre},</p><p>El docente <strong>${docenteNombre}</strong> acaba de marcar su disponibilidad. ¡Puedes enviarle un ticket ahora!</p>`,
    })
  );
  await Promise.allSettled(promises);
}

async function notifyDocenteNuevoTicket(docenteEmail, estudianteNombre, tipo) {
  await sendMail({
    to: docenteEmail,
    subject: 'Nuevo ticket de consulta recibido',
    html: `<p>Has recibido un nuevo ticket de consulta de tipo <strong>${tipo}</strong> de parte de <strong>${estudianteNombre}</strong>.</p>`,
  });
}

async function sendTicketConfirmacionEstudiante(to, estudianteNombre, docenteNombre, tipo, mensaje) {
  if (!transporter) return;
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject: `Ticket enviado a ${docenteNombre}`,
      html: `<p>Hola ${estudianteNombre},</p>
             <p>Tu consulta <strong>(${tipo})</strong> ha sido enviada al/la docente <strong>${docenteNombre}</strong>.</p>
             <p><em>"${mensaje}"</em></p>
             <p>Recibirás una notificación cuando sea respondida.</p>`,
    });
  } catch (e) { console.warn('[mailer] confirmación estudiante:', e.message); }
}

async function sendTicketRespuestaEstudiante(to, estudianteNombre, docenteNombre, tipoRespuesta, respuesta) {
  if (!transporter) return;
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject: `Tu ticket ha sido respondido por ${docenteNombre}`,
      html: `<p>Hola ${estudianteNombre},</p>
             <p>El/la docente <strong>${docenteNombre}</strong> ha respondido tu consulta.</p>
             <p><strong>Tipo de respuesta:</strong> ${tipoRespuesta}</p>
             ${respuesta ? `<p><em>"${respuesta}"</em></p>` : ''}
             <p>Ingresa a tu panel para ver los detalles.</p>`,
    });
  } catch (e) { console.warn('[mailer] respuesta estudiante:', e.message); }
}

async function sendPasswordReset(to, nombre, resetUrl) {
  if (!transporter) return;
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject: 'Recuperación de contraseña — Disponibilidad Docente',
      html: `<p>Hola ${nombre},</p>
             <p>Haz click para restablecer tu contraseña (válido 1 hora):</p>
             <p><a href="${resetUrl}">${resetUrl}</a></p>
             <p>Si no lo solicitaste, ignora este mensaje.</p>`,
    });
  } catch (e) { console.warn('[mailer] reset:', e.message); }
}

module.exports = {
  sendMail,
  notifyDocenteDisponible,
  notifyDocenteNuevoTicket,
  sendTicketConfirmacionEstudiante,
  sendTicketRespuestaEstudiante,
  sendPasswordReset,
};
