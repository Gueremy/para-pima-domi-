// shared.js — utilities used across multiple pages

const DIA_ABREV = { Lunes: 'Lun', Martes: 'Mar', 'Miércoles': 'Mié', Jueves: 'Jue', Viernes: 'Vie' };

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

function getInitials(nombre) {
  if (!nombre) return '?';
  return nombre.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function renderBadges(docente) {
  let html = docente.disponible
    ? '<span class="badge badge-success">Disponible</span> '
    : '<span class="badge badge-secondary">No disponible</span> ';
  if (docente.es_part_time) {
    const tooltip = escapeHtml(docente.descripcion_pt || 'Docente a tiempo parcial');
    html += `<span class="badge badge-info" data-tooltip="${tooltip}">Part-time</span>`;
  }
  return html;
}

// Renders a teacher card with full XSS escaping
function renderDocenteCard(d, options) {
  const {
    cardIdPrefix = 'card',
    horariosIdPrefix = 'horarios-mini',
    onCardClick,
    onTicketClick,
    showSuscribir,
    suscrito,
  } = options || {};

  const cardId = `${cardIdPrefix}-${d.id}`;
  const horariosId = `${horariosIdPrefix}-${d.id}`;
  const clickHandler = onCardClick ? `onclick="${onCardClick}(${d.id})"` : '';

  const safeNombre = escapeHtml(d.nombre);
  const safeCarrera = escapeHtml(d.carrera || '');
  const safeAsignatura = escapeHtml(d.asignatura || '');

  const ticketBtn = (onTicketClick && d.disponible)
    ? `<button class="btn btn-primary btn-sm btn-ticket-trigger" data-id="${d.id}" data-nombre="${safeNombre}" onclick="event.stopPropagation();if(window['${onTicketClick}'])window['${onTicketClick}'](${d.id}, this.dataset.nombre);">Enviar Ticket</button>`
    : '';

  const suscribirBtn = showSuscribir
    ? `<button class="btn ${suscrito ? 'btn-success' : 'btn-outline'} btn-sm" onclick="event.stopPropagation();toggleSuscripcion(${d.id}, this)">${suscrito ? 'Notificándome' : 'Notificarme'}</button>`
    : '';

  return `
    <div class="card" id="${cardId}" style="cursor:pointer" ${clickHandler}>
      <div class="card-header">
        <div class="avatar">${escapeHtml(getInitials(d.nombre))}</div>
        <div class="card-info">
          <div class="card-title">${safeNombre}</div>
          <div class="card-meta">${safeCarrera}</div>
          <div class="card-meta">${safeAsignatura}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
          ${renderBadges(d)}
        </div>
      </div>
      <div id="${horariosId}"></div>
      <div class="card-actions">${suscribirBtn} ${ticketBtn}</div>
    </div>
  `;
}

async function loadHorariosMini(docenteId, containerId) {
  try {
    const res = await fetch(`/api/docentes/${docenteId}/horarios`);
    if (!res.ok) return;
    const horarios = await res.json();
    if (!horarios.length) return;
    const tags = horarios.map(h =>
      `<span class="horario-tag">${escapeHtml(DIA_ABREV[h.dia] || h.dia)} ${escapeHtml(h.hora_inicio)}-${escapeHtml(h.hora_fin)}</span>`
    ).join('');
    const el = document.getElementById(containerId || `horarios-mini-${docenteId}`);
    if (el) el.innerHTML = `<div class="horarios-mini">${tags}</div>`;
  } catch (_) {}
}

// Fills the shared profile modal (#perfil-modal) with data
async function openPerfilModal(docenteId, options) {
  const { currentUser, onTicketClick } = options || {};
  const modal = document.getElementById('perfil-modal');
  if (!modal) return;
  modal.classList.add('open');
  const content = document.getElementById('perfil-modal-content');
  if (content) content.style.opacity = '0.5';

  const [docenteRes, horariosRes] = await Promise.all([
    fetch(`/api/docentes/${docenteId}`),
    fetch(`/api/docentes/${docenteId}/horarios`),
  ]);
  if (!docenteRes.ok) { modal.classList.remove('open'); return; }
  const d = await docenteRes.json();
  const horarios = horariosRes.ok ? await horariosRes.json() : [];

  document.getElementById('perfil-modal-avatar').textContent = getInitials(d.nombre);
  document.getElementById('perfil-modal-nombre').textContent = d.nombre || '';
  document.getElementById('perfil-modal-carrera').textContent = `${d.carrera || ''} — ${d.asignatura || ''}`;

  const badgesEl = document.getElementById('perfil-modal-badges');
  badgesEl.innerHTML = renderBadges(d);

  document.getElementById('perfil-modal-bio').textContent = d.bio || '';

  const ramosEl = document.getElementById('perfil-modal-ramos');
  ramosEl.textContent = d.ramos || 'No especificado';
  document.getElementById('perfil-modal-ramos-section').style.display = d.ramos ? 'block' : 'none';

  const certsEl = document.getElementById('perfil-modal-certs');
  certsEl.textContent = d.certificados || '';
  document.getElementById('perfil-modal-certs-section').style.display = d.certificados ? 'block' : 'none';

  const horariosEl = document.getElementById('perfil-modal-horarios');
  horariosEl.innerHTML = horarios.length
    ? horarios.map(h => `<span class="horario-tag">${escapeHtml(DIA_ABREV[h.dia] || h.dia)} ${escapeHtml(h.hora_inicio)}-${escapeHtml(h.hora_fin)}</span>`).join('')
    : '<span style="color:var(--text-muted);font-size:0.85rem">Sin horarios definidos</span>';
  document.getElementById('perfil-modal-horarios-section').style.display = 'block';

  const parts = [];
  if (d.email) parts.push(`&#x2709; ${escapeHtml(d.email)}`);
  if (d.telefono) parts.push(`&#x1F4DE; ${escapeHtml(d.telefono)}`);
  if (d.oficina) parts.push(`&#x1F3E2; ${escapeHtml(d.oficina)}`);
  document.getElementById('perfil-modal-contacto').innerHTML = parts.join(' &nbsp;&middot;&nbsp; ');

  const actionsEl = document.getElementById('perfil-modal-actions');
  actionsEl.innerHTML = '';
  if (currentUser?.rol === 'estudiante' && d.disponible && onTicketClick) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary btn-sm';
    btn.textContent = 'Enviar Ticket';
    btn.addEventListener('click', () => {
      onTicketClick(d.id, d.nombre);
    });
    actionsEl.appendChild(btn);
  }
  if (d.email) {
    const emailLink = document.createElement('a');
    emailLink.href = `mailto:${encodeURIComponent(d.email)}`;
    emailLink.className = 'btn btn-outline btn-sm';
    emailLink.textContent = 'Enviar Email';
    actionsEl.appendChild(emailLink);
  }

  if (content) content.style.opacity = '1';
}

function initPerfilModalClose() {
  const modal = document.getElementById('perfil-modal');
  if (!modal) return;
  const closeBtn = document.getElementById('close-perfil-modal');
  if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.remove('open'));
  modal.addEventListener('click', e => { if (e.target === e.currentTarget) modal.classList.remove('open'); });
}

// Generic ticket submit with anti double-click protection
async function submitTicket({ docenteIdEl, tipoEl, mensajeEl, alertEl, submitBtnEl, onSuccess }) {
  const docenteId = parseInt(document.getElementById(docenteIdEl).value, 10);
  const tipo = document.getElementById(tipoEl).value;
  const mensaje = document.getElementById(mensajeEl).value.trim();
  const alertContainer = document.getElementById(alertEl);
  const btn = submitBtnEl ? document.getElementById(submitBtnEl) : null;

  if (!mensaje) {
    alertContainer.innerHTML = '<div class="alert alert-error">El mensaje es requerido</div>';
    return;
  }

  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docenteId, tipo, mensaje }),
    });
    const data = await res.json();
    if (!res.ok) {
      alertContainer.innerHTML = `<div class="alert alert-error">${escapeHtml(data.error)}</div>`;
      if (btn) btn.disabled = false;
      return;
    }
    if (btn) btn.disabled = false;
    if (onSuccess) onSuccess();
  } catch (err) {
    if (btn) btn.disabled = false;
    alertContainer.innerHTML = '<div class="alert alert-error">Error al conectar con el servidor</div>';
  }
}

// Generic search + filter widget
async function initSearchWidget(config) {
  const { searchId, carreraId, asignaturaId, disponibleId, gridId, loadingId, emptyId, cardFn } = config;

  const opRes = await fetch('/api/docentes/opciones');
  if (opRes.ok) {
    const { carreras, asignaturas } = await opRes.json();
    const carreraEl = document.getElementById(carreraId);
    if (carreraEl) {
      carreras.forEach(c => {
        const o = document.createElement('option');
        o.value = c; o.textContent = c;
        carreraEl.appendChild(o);
      });
    }
    if (asignaturaId) {
      const asigEl = document.getElementById(asignaturaId);
      if (asigEl) {
        asignaturas.forEach(a => {
          const o = document.createElement('option');
          o.value = a; o.textContent = a;
          asigEl.appendChild(o);
        });
      }
    }
  }

  async function doSearch() {
    const nombre = document.getElementById(searchId)?.value.trim() || '';
    const carrera = document.getElementById(carreraId)?.value || '';
    const asignatura = asignaturaId ? document.getElementById(asignaturaId)?.value || '' : '';

    const params = new URLSearchParams();
    if (nombre) params.set('nombre', nombre);
    if (carrera) params.set('carrera', carrera);
    if (asignatura) params.set('asignatura', asignatura);
    if (disponibleId && document.getElementById(disponibleId)?.checked) params.set('disponible', '1');

    const loadingEl = document.getElementById(loadingId);
    const gridEl = document.getElementById(gridId);
    const emptyEl = document.getElementById(emptyId);

    if (loadingEl) loadingEl.style.display = 'block';
    if (gridEl) gridEl.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'none';

    const res = await fetch(`/api/docentes?${params}`);
    if (!res.ok) { if (loadingEl) loadingEl.style.display = 'none'; return; }
    const docentes = await res.json();

    if (loadingEl) loadingEl.style.display = 'none';
    if (!docentes.length) { if (emptyEl) emptyEl.style.display = 'block'; return; }

    if (gridEl) {
      gridEl.style.display = 'grid';
      gridEl.innerHTML = docentes.map(cardFn).join('');
    }

    const prefix = config.horariosPrefix || 'horarios-mini';
    docentes.filter(d => d.disponible).forEach(d => loadHorariosMini(d.id, `${prefix}-${d.id}`));
  }

  let debTimer = null;
  const searchEl = document.getElementById(searchId);
  if (searchEl) searchEl.addEventListener('input', () => { clearTimeout(debTimer); debTimer = setTimeout(doSearch, 300); });
  const carreraEl = document.getElementById(carreraId);
  if (carreraEl) carreraEl.addEventListener('change', doSearch);
  if (asignaturaId) {
    const asigEl = document.getElementById(asignaturaId);
    if (asigEl) asigEl.addEventListener('change', doSearch);
  }
  if (disponibleId) {
    const dispEl = document.getElementById(disponibleId);
    if (dispEl) dispEl.addEventListener('change', doSearch);
  }

  await doSearch();
  return { reload: doSearch };
}

function startPolling(fn, intervalMs) {
  const id = setInterval(fn, intervalMs || 30000);
  return () => clearInterval(id);
}
