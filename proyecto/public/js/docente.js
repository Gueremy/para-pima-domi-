// Docente panel logic

function getInitials(n) {
  return n.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function estadoBadge(estado) {
  const map = { pendiente: 'badge-warning', respondido: 'badge-info', resuelto: 'badge-success' };
  return `<span class="badge ${map[estado] || 'badge-secondary'}">${estado}</span>`;
}

function tipoBadge(tipo) {
  return `<span class="badge badge-secondary">${tipo}</span>`;
}

function renderTicket(t, showActions) {
  const fecha = new Date(t.created_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
  const actionsHtml = showActions
    ? `<div class="card-actions" style="margin-top:0.75rem">
        <button class="btn btn-primary btn-sm" onclick="openRespuestaModal(${t.id})">Responder</button>
       </div>`
    : '';
  const respuestaHtml = t.respuesta
    ? `<div class="ticket-respuesta"><strong>Tu respuesta:</strong> <p style="margin-top:0.3rem">${t.respuesta}</p></div>`
    : '';

  const perfilExtra = (t.estudiante_carrera || t.estudiante_anio)
    ? `<div class="ticket-meta">${[t.estudiante_carrera, t.estudiante_anio ? `${t.estudiante_anio} año` : ''].filter(Boolean).join(' — ')}</div>`
    : '';

  return `
    <div class="ticket-item">
      <div class="ticket-header">
        <div>
          <strong>${t.estudiante_nombre}</strong>
          <div class="ticket-meta">${t.estudiante_email}</div>
          ${perfilExtra}
        </div>
        <div style="display:flex;gap:0.4rem;align-items:center">
          ${tipoBadge(t.tipo)}
          ${estadoBadge(t.estado)}
        </div>
      </div>
      <p style="font-size:0.9rem">${t.mensaje || '<em>Sin mensaje</em>'}</p>
      <div class="ticket-meta" style="margin-top:0.5rem">${fecha}</div>
      ${respuestaHtml}
      ${actionsHtml}
    </div>
  `;
}

function renderSection(listId, emptyId, tickets, showActions) {
  const list = document.getElementById(listId);
  const empty = document.getElementById(emptyId);
  if (!list) return;
  if (!tickets.length) {
    list.style.display = 'none';
    if (empty) empty.style.display = 'block';
    return;
  }
  list.style.display = 'flex';
  if (empty) empty.style.display = 'none';
  list.innerHTML = tickets.map((t) => renderTicket(t, showActions)).join('');
}

function filterTickets() {
  const searchEl = document.getElementById('ticket-search');
  if (!searchEl) return;
  const q = searchEl.value.toLowerCase();
  document.querySelectorAll('.ticket-item').forEach(item => {
    item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

async function loadTickets() {
  const res = await fetch('/api/tickets/recibidos');
  if (!res.ok) return;
  const data = await res.json();

  const pendientesCount = data.pendientes.length;
  document.getElementById('pendientes-count').textContent = pendientesCount;
  document.getElementById('tab-pendientes-count').textContent = pendientesCount;

  const loadingEl = document.getElementById('pendientes-loading');
  if (loadingEl) loadingEl.style.display = 'none';

  renderSection('pendientes-list', 'pendientes-empty', data.pendientes, true);
  renderSection('respondidos-list', 'respondidos-empty', data.respondidos, false);
  renderSection('resueltos-list', 'resueltos-empty', data.resueltos, false);
}

async function loadDisponibilidad() {
  const res = await fetch('/api/docentes/mi-perfil');
  if (!res.ok) return;
  const docente = await res.json();
  const toggle = document.getElementById('disponibilidad-toggle');
  const label = document.getElementById('disponibilidad-label');
  toggle.checked = !!docente.disponible;
  label.textContent = docente.disponible ? 'Disponible' : 'No disponible';
}

async function loadPerfil() {
  const [docenteRes, authRes] = await Promise.all([
    fetch('/api/docentes/mi-perfil'),
    fetch('/api/auth/me'),
  ]);
  if (!docenteRes.ok || !authRes.ok) return;
  const docente = await docenteRes.json();
  const { user } = await authRes.json();

  document.getElementById('perfil-nombre').value = user.nombre || '';
  document.getElementById('perfil-carrera').value = docente.carrera || '';
  document.getElementById('perfil-asignatura').value = docente.asignatura || '';
  document.getElementById('perfil-descripcion').value = docente.descripcion_pt || '';
  document.getElementById('perfil-bio').value = docente.bio || '';
  document.getElementById('perfil-ramos').value = docente.ramos || '';
  document.getElementById('perfil-certificados').value = docente.certificados || '';
  document.getElementById('perfil-telefono').value = docente.telefono || '';
  document.getElementById('perfil-oficina').value = docente.oficina || '';
  document.getElementById('perfil-part-time').checked = !!docente.es_part_time;
}

async function loadHorarios() {
  const res = await fetch('/api/docentes/horarios');
  if (!res.ok) return;
  const horarios = await res.json();
  const container = document.getElementById('horarios-list');

  if (!horarios.length) {
    container.innerHTML = '<p style="color:var(--text-muted)">No tienes horarios definidos aún.</p>';
    return;
  }

  const tags = horarios.map(h =>
    `<span class="horario-tag">
      ${h.dia} ${h.hora_inicio}-${h.hora_fin}
      <button class="del-btn" onclick="deleteHorario(${h.id})" title="Eliminar">&times;</button>
    </span>`
  ).join('');
  container.innerHTML = `<div class="horarios-mini">${tags}</div>`;
}

async function deleteHorario(id) {
  const res = await fetch(`/api/docentes/horarios/${id}`, { method: 'DELETE' });
  if (res.ok) await loadHorarios();
}

document.getElementById('btn-add-horario').addEventListener('click', async () => {
  const dia = document.getElementById('horario-dia').value;
  const hora_inicio = document.getElementById('horario-inicio').value;
  const hora_fin = document.getElementById('horario-fin').value;
  const alertEl = document.getElementById('horarios-alert');

  const res = await fetch('/api/docentes/horarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dia, hora_inicio, hora_fin }),
  });

  if (!res.ok) {
    const data = await res.json();
    alertEl.innerHTML = `<div class="alert alert-error">${data.error}</div>`;
    return;
  }
  alertEl.innerHTML = '';
  await loadHorarios();
});

document.getElementById('perfil-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const alertEl = document.getElementById('perfil-alert');
  const nombre = document.getElementById('perfil-nombre').value.trim();
  const carrera = document.getElementById('perfil-carrera').value.trim();
  const asignatura = document.getElementById('perfil-asignatura').value.trim();
  const descripcion_pt = document.getElementById('perfil-descripcion').value.trim();
  const bio = document.getElementById('perfil-bio').value.trim();
  const ramos = document.getElementById('perfil-ramos').value.trim();
  const certificados = document.getElementById('perfil-certificados').value.trim();
  const telefono = document.getElementById('perfil-telefono').value.trim();
  const oficina = document.getElementById('perfil-oficina').value.trim();
  const es_part_time = document.getElementById('perfil-part-time').checked;

  const [r1, r2] = await Promise.all([
    fetch('/api/docentes/perfil', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ carrera, asignatura, descripcion_pt, es_part_time, bio, ramos, certificados, telefono, oficina }),
    }),
    fetch('/api/auth/nombre', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre }),
    }),
  ]);

  if (!r1.ok || !r2.ok) {
    alertEl.innerHTML = '<div class="alert alert-error">Error al guardar los cambios</div>';
    return;
  }
  alertEl.innerHTML = '<div class="alert alert-success">Perfil actualizado correctamente</div>';
  document.getElementById('nav-username').textContent = nombre;
});

document.getElementById('disponibilidad-toggle').addEventListener('change', async (e) => {
  const disponible = e.target.checked;
  const label = document.getElementById('disponibilidad-label');
  const res = await fetch('/api/docentes/disponibilidad', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ disponible }),
  });
  if (res.ok) {
    label.textContent = disponible ? 'Disponible' : 'No disponible';
  } else {
    e.target.checked = !disponible;
  }
});

function openRespuestaModal(ticketId) {
  document.getElementById('ticket-id-respuesta').value = ticketId;
  document.getElementById('respuesta-alert').innerHTML = '';
  document.getElementById('respuesta-texto').value = '';
  document.getElementById('tipo-respuesta').value = 'resuelto';
  updateRespuestaForm('resuelto');
  document.getElementById('respuesta-modal').classList.add('open');
}

function updateRespuestaForm(tipo) {
  const group = document.getElementById('respuesta-text-group');
  const label = document.getElementById('respuesta-text-label');
  if (tipo === 'resuelto') {
    group.style.display = 'none';
  } else {
    group.style.display = 'block';
    label.textContent = tipo === 'reunion' ? 'Propuesta de reunion' : 'Respuesta';
  }
}

document.getElementById('tipo-respuesta').addEventListener('change', (e) => {
  updateRespuestaForm(e.target.value);
});

document.getElementById('close-respuesta-modal').addEventListener('click', () => {
  document.getElementById('respuesta-modal').classList.remove('open');
});

document.getElementById('respuesta-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
});

document.getElementById('submit-respuesta').addEventListener('click', async () => {
  const ticketId = document.getElementById('ticket-id-respuesta').value;
  const tipoRespuesta = document.getElementById('tipo-respuesta').value;
  const respuesta = document.getElementById('respuesta-texto').value.trim();
  const alertEl = document.getElementById('respuesta-alert');

  if (tipoRespuesta !== 'resuelto' && !respuesta) {
    alertEl.innerHTML = '<div class="alert alert-error">El texto de respuesta es requerido</div>';
    return;
  }

  const res = await fetch(`/api/tickets/${ticketId}/responder`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipoRespuesta, respuesta: respuesta || null }),
  });

  if (!res.ok) {
    const data = await res.json();
    alertEl.innerHTML = `<div class="alert alert-error">${data.error}</div>`;
    return;
  }

  document.getElementById('respuesta-modal').classList.remove('open');
  await loadTickets();
});

// Tabs
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    const pane = document.getElementById(`tab-${btn.dataset.tab}`);
    if (pane) pane.classList.add('active');
    if (btn.dataset.tab === 'horarios') loadHorarios();
    if (btn.dataset.tab === 'perfil') loadPerfil();
  });
});

(async () => {
  const user = await setupPanelNav('docente');
  if (!user) return;
  const avatarEl = document.getElementById('docente-avatar');
  if (avatarEl) avatarEl.textContent = getInitials(user.nombre);
  await loadDisponibilidad();
  await loadTickets();
  await loadHorarios();
  await loadPerfil();
  setInterval(loadTickets, 30000);
  const searchEl = document.getElementById('ticket-search');
  if (searchEl) searchEl.addEventListener('input', filterTickets);
})();
