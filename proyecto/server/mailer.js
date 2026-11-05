const nodemailer = require('nodemailer');
require('dotenv').config();

let transporter = null;

function escapeHtml(str) {
  if (typeof str !== 'string') return str == null ? '' : String(str);
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[m]));
}

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.EMAIL_USER || process.env.DEMO_MODE === 'true') {
    // Return a mock transporter that logs for demo / testing
    transporter = {
      sendMail: async (opts) => {
        if (process.env.NODE_ENV !== 'test') {
          console.log(`[mailer sandbox] To: ${opts.to} | Subject: "${opts.subject}"`);
        }
        return { messageId: `demo-${Date.now()}` };
      },
    };
    return transporter;
  }

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
      from: `"DispoDocente" <${process.env.EMAIL_USER || 'no-reply@universidad.cl'}>`,
      to,
      subject,
      html,
    });
  } catch (err) {
    console.warn('[mailer] Email send failed (non-fatal):', err.message);
  }
}

async function notifyDocenteDisponible(docenteNombre, suscriptores) {
  const safeDocente = escapeHtml(docenteNombre);
  const promises = suscriptores.map((s) =>
    sendMail({
      to: s.email,
      subject: `El docente ${safeDocente} está disponible`,
      html: `<p>Hola ${escapeHtml(s.nombre)},</p><p>El docente <strong>${safeDocente}</strong> acaba de marcar su disponibilidad. ¡Puedes enviarle un ticket ahora!</p>`,
    })
  );
  await Promise.allSettled(promises);
}

async function notifyDocenteNuevoTicket(docenteEmail, estudianteNombre, tipo) {
  await sendMail({
    to: docenteEmail,
    subject: 'Nuevo ticket de consulta recibido',
    html: `<p>Has recibido un nuevo ticket de consulta de tipo <strong>${escapeHtml(tipo)}</strong> de parte de <strong>${escapeHtml(estudianteNombre)}</strong>.</p>`,
  });
}

async function sendTicketConfirmacionEstudiante(to, estudianteNombre, docenteNombre, tipo, mensaje) {
  const safeEst = escapeHtml(estudianteNombre);
  const safeDoc = escapeHtml(docenteNombre);
  const safeTipo = escapeHtml(tipo);
  const safeMsg = escapeHtml(mensaje);

  await sendMail({
    to,
    subject: `Ticket enviado a ${safeDoc}`,
    html: `<p>Hola ${safeEst},</p>
           <p>Tu consulta <strong>(${safeTipo})</strong> ha sido enviada al/la docente <strong>${safeDoc}</strong>.</p>
           <p><em>"${safeMsg}"</em></p>
           <p>Recibirás una notificación cuando sea respondida.</p>`,
  });
}

async function sendTicketRespuestaEstudiante(to, estudianteNombre, docenteNombre, tipoRespuesta, respuesta) {
  const safeEst = escapeHtml(estudianteNombre);
  const safeDoc = escapeHtml(docenteNombre);
  const safeTipo = escapeHtml(tipoRespuesta);
  const safeResp = escapeHtml(respuesta || '');

  await sendMail({
    to,
    subject: `Tu ticket ha sido respondido por ${safeDoc}`,
    html: `<p>Hola ${safeEst},</p>
           <p>El/la docente <strong>${safeDoc}</strong> ha respondido tu consulta.</p>
           <p><strong>Tipo de respuesta:</strong> ${safeTipo}</p>
           ${safeResp ? `<p><em>"${safeResp}"</em></p>` : ''}
           <p>Ingresa a tu panel para ver los detalles.</p>`,
  });
}

async function sendPasswordReset(to, nombre, resetUrl) {
  const safeNombre = escapeHtml(nombre);
  await sendMail({
    to,
    subject: 'Recuperación de contraseña — DispoDocente',
    html: `<p>Hola ${safeNombre},</p>
           <p>Haz click en el siguiente enlace para restablecer tu contraseña (válido por 1 hora):</p>
           <p><a href="${resetUrl}">${resetUrl}</a></p>
           <p>Si no lo solicitaste tú, puedes ignorar este mensaje con seguridad.</p>`,
  });
}

module.exports = {
  sendMail,
  notifyDocenteDisponible,
  notifyDocenteNuevoTicket,
  sendTicketConfirmacionEstudiante,
  sendTicketRespuestaEstudiante,
  sendPasswordReset,
};
