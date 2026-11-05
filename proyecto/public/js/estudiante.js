// estudiante.js — panel estudiante logic

let currentUser = null;
let docentesTabInited = false;
let stopPolling = null;

function estadoBadge(estado) {
  const map = { pendiente: 'badge-warning', respondido: 'badge-info', resuelto: 'badge-success' };
  return `<span class="badge ${map[estado] || 'badge-secondary'}">${escapeHtml(estado)}</span>`;
}

function tipoBadge(tipo) { return `<span class="badge badge-secondary">${escapeHtml(tipo)}</span>`; }

function tipoRespuestaLabel(tipo) {
  return { resuelto: 'Resuelto', respuesta: 'Respuesta', reunion: 'Reunión coordinada' }[tipo] || tipo;
}

function renderTicketItem(t) {
  const fecha = new Date(t.created_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
  const icsLink = t.tipo_respuesta === 'reunion'
    ? `<a href="/api/tickets/${t.id}/ics" class="btn btn-outline btn-sm" style="margin-top:0.5rem" download>&#x1F4C5; Exportar al calendario (.ics)</a>`
    : '';

  let meetingNotice = '';
  if (t.tipo_respuesta === 'reunion' && t.fecha_reunion) {
    const meetDate = new Date(t.fecha_reunion).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
    meetingNotice = `<div style="margin-top:0.3rem;font-weight:600;color:var(--primary)">Cita fijada: ${escapeHtml(meetDate)}</div>`;
  }

  const respuestaHtml = (t.respuesta || t.tipo_respuesta) ? `
    <div class="ticket-respuesta">
      <strong>${escapeHtml(tipoRespuestaLabel(t.tipo_respuesta))}:</strong>
      ${t.respuesta ? `<p style="margin-top:0.3rem">${escapeHtml(t.respuesta)}</p>` : ''}
      ${meetingNotice}
      ${icsLink}
    </div>` : '';

  return `
    <div class="ticket-item">
      <div class="ticket-header">
        <div><strong>${escapeHtml(t.docente_nombre)}</strong><div class="ticket-meta">${escapeHtml(t.carrera || '')} &mdash; ${escapeHtml(t.asignatura || '')}</div></div>
        <div style="display:flex;gap:0.4rem;align-items:center">${tipoBadge(t.tipo)} ${estadoBadge(t.estado)}</div>
      </div>
      <p style="font-size:0.9rem">${t.mensaje ? escapeHtml(t.mensaje) : '<em>Sin mensaje</em>'}</p>
      <div class="ticket-meta" style="margin-top:0.5rem">${escapeHtml(fecha)}</div>
      ${respuestaHtml}
    </div>`;
}

async function loadTickets() {
  const res = await fetch('/api/tickets/mis-tickets');
  if (!res.ok) return;
  const tickets = await res.json();
  const list = document.getElementById('tickets-list');
  const empty = document.getElementById('tickets-empty');
  const loading = document.getElementById('tickets-loading');
  if (loading) loading.style.display = 'none';
  if (!tickets.length) {
    if (list) list.style.display = 'none';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (list) {
    list.style.display = 'flex';
    list.innerHTML = tickets.map(renderTicketItem).join('');
  }
  if (empty) empty.style.display = 'none';
}

async function loadDocenteSelect() {
  const res = await fetch('/api/docentes');
  if (!res.ok) return;
  const docentes = await res.json();
  const sel = document.getElementById('docente-select');
  if (!sel) return;
  // Keep first option
  sel.innerHTML = '<option value="">Selecciona un docente...</option>';
  docentes.forEach(d => {
    const o = document.createElement('option');
    o.value = d.id;
    o.textContent = `${d.nombre} (${d.asignatura || 'Sin asignatura'})`;
    sel.appendChild(o);
  });
}

function openMiniTicket(docenteId, docenteNombre) {
  document.getElementById('mini-ticket-docente-id').value = docenteId;
  document.getElementById('mini-ticket-docente-nombre').value = docenteNombre;
  document.getElementById('mini-ticket-alert').innerHTML = '';
  document.getElementById('mini-ticket-mensaje').value = '';
  document.getElementById('mini-ticket-modal').classList.add('open');
}

function openEstPerfilModal(docenteId) {
  openPerfilModal(docenteId, {
    currentUser,
    onTicketClick: (id, nombre) => {
      openMiniTicket(id, nombre);
      document.getElementById('perfil-modal').classList.remove('open');
    },
  });
}

function initMiniTicketModal() {
  const closeBtn = document.getElementById('close-mini-ticket-modal');
  if (closeBtn) {
    closeBtn.addEventListener('click', () =>
      document.getElementById('mini-ticket-modal').classList.remove('open'));
  }
  const modal = document.getElementById('mini-ticket-modal');
  if (modal) {
    modal.addEventListener('click', e => {
      if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
    });
  }

  const submitBtn = document.getElementById('submit-mini-ticket');
  if (submitBtn) {
    submitBtn.addEventListener('click', () =>
      submitTicket({
        docenteIdEl: 'mini-ticket-docente-id',
        tipoEl: 'mini-ticket-tipo',
        mensajeEl: 'mini-ticket-mensaje',
        alertEl: 'mini-ticket-alert',
        submitBtnEl: 'submit-mini-ticket',
        onSuccess: () => {
          document.getElementById('mini-ticket-alert').innerHTML = '<div class="alert alert-success">Ticket enviado correctamente.</div>';
          setTimeout(() => {
            document.getElementById('mini-ticket-modal').classList.remove('open');
            loadTickets();
          }, 1200);
        },
      }));
  }
}

async function initDocentesTab() {
  if (docentesTabInited) return;
  docentesTabInited = true;
  await initSearchWidget({
    searchId: 'est-search-nombre',
    carreraId: 'est-filter-carrera',
    disponibleId: 'est-filter-disponible',
    gridId: 'est-docentes-grid',
    loadingId: 'est-docentes-loading',
    emptyId: 'est-docentes-empty',
    horariosPrefix: 'est-horarios',
    cardFn: (d) => renderDocenteCard(d, {
      cardIdPrefix: 'est-card',
      horariosIdPrefix: 'est-horarios',
      onCardClick: 'openEstPerfilModal',
      onTicketClick: 'openMiniTicket',
    }),
  });
}

const ticketForm = document.getElementById('ticket-form');
if (ticketForm) {
  ticketForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert('nuevo-alert');
    const docenteId = parseInt(document.getElementById('docente-select').value, 10);
    const tipo = document.getElementById('tipo-select').value;
    const mensaje = document.getElementById('mensaje-input').value.trim();
    if (!docenteId) return showAlert('nuevo-alert', 'Selecciona un docente');
    if (!mensaje) return showAlert('nuevo-alert', 'El mensaje es requerido');

    const submitBtn = ticketForm.querySelector('button[type=submit]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docenteId, tipo, mensaje }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (submitBtn) submitBtn.disabled = false;
        return showAlert('nuevo-alert', data.error);
      }
      showAlert('nuevo-alert', 'Ticket enviado exitosamente.', 'success');
      ticketForm.reset();
      if (submitBtn) submitBtn.disabled = false;

      setTimeout(() => {
        const misTicketsBtn = document.querySelector('.tab-btn[data-tab="mis-tickets"]');
        if (misTicketsBtn) misTicketsBtn.click();
        loadTickets();
      }, 1000);
    } catch (err) {
      if (submitBtn) submitBtn.disabled = false;
      showAlert('nuevo-alert', 'Error al conectar con el servidor');
    }
  });
}

async function loadEstudiantePerfil() {
  const res = await fetch('/api/estudiantes/perfil');
  if (!res.ok) return;
  const perfil = await res.json();
  const carreraEl = document.getElementById('est-perfil-carrera');
  const anioEl = document.getElementById('est-perfil-anio');
  if (carreraEl) carreraEl.value = perfil.carrera || '';
  if (anioEl) anioEl.value = perfil.anio || '';
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add('active');
    if (btn.dataset.tab === 'mis-tickets') loadTickets();
    if (btn.dataset.tab === 'docentes') initDocentesTab();
    if (btn.dataset.tab === 'mi-perfil') loadEstudiantePerfil();
  });
});

const estPerfilForm = document.getElementById('est-perfil-form');
if (estPerfilForm) {
  estPerfilForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const carrera = document.getElementById('est-perfil-carrera').value.trim();
    const anio = document.getElementById('est-perfil-anio').value.trim();
    const alertEl = document.getElementById('est-perfil-alert');
    const res = await fetch('/api/estudiantes/perfil', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ carrera: carrera || null, anio: anio || null }),
    });
    if (!res.ok) {
      alertEl.innerHTML = '<div class="alert alert-error">Error al guardar el perfil</div>';
      return;
    }
    alertEl.innerHTML = '<div class="alert alert-success">Perfil actualizado correctamente</div>';
  });
}

(async () => {
  currentUser = await setupPanelNav('estudiante');
  if (!currentUser) return;
  initPerfilModalClose();
  initMiniTicketModal();
  await loadDocenteSelect();
  await loadTickets();
  stopPolling = startPolling(loadTickets, 30000);
})();
