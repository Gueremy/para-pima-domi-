// admin.js — panel admin logic

(async () => {
  const user = await setupPanelNav('admin');
  if (!user) return;
  initDocenteModal();
  await loadStats();
  await loadUsuarios();
})();

async function loadStats() {
  const res = await fetch('/api/admin/stats');
  if (!res.ok) return;
  const s = await res.json();
  document.getElementById('stat-users').textContent = s.totalUsers;
  document.getElementById('stat-docentes').textContent = s.totalDocentes;
  document.getElementById('stat-estudiantes').textContent = s.totalEstudiantes;
  document.getElementById('stat-tickets').textContent = s.totalTickets;
  document.getElementById('stat-pending').textContent = s.pendingTickets;
}

async function loadUsuarios() {
  const res = await fetch('/api/admin/usuarios');
  if (!res.ok) return;
  const users = await res.json();
  const tbody = document.getElementById('usuarios-tbody');
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="padding:1rem;text-align:center;color:var(--text-muted)">No hay usuarios</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  users.forEach(u => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border)';

    const tdNombre = document.createElement('td');
    tdNombre.style.padding = '0.6rem 0.75rem';
    tdNombre.style.fontWeight = '500';
    tdNombre.textContent = u.nombre;

    const tdEmail = document.createElement('td');
    tdEmail.style.padding = '0.6rem 0.75rem';
    tdEmail.style.color = 'var(--text-muted)';
    tdEmail.style.fontSize = '0.85rem';
    tdEmail.textContent = u.email;

    const tdRol = document.createElement('td');
    tdRol.style.padding = '0.6rem 0.75rem';
    const badge = document.createElement('span');
    badge.className = 'badge badge-secondary';
    badge.textContent = u.rol;
    tdRol.appendChild(badge);

    const tdFecha = document.createElement('td');
    tdFecha.style.padding = '0.6rem 0.75rem';
    tdFecha.style.color = 'var(--text-muted)';
    tdFecha.style.fontSize = '0.8rem';
    tdFecha.textContent = new Date(u.created_at).toLocaleDateString('es-CL');

    const tdAcciones = document.createElement('td');
    tdAcciones.style.padding = '0.6rem 0.75rem';
    tdAcciones.style.display = 'flex';
    tdAcciones.style.gap = '0.4rem';

    const btnRol = document.createElement('button');
    btnRol.className = 'btn btn-outline btn-sm';
    btnRol.textContent = 'Cambiar rol';
    btnRol.addEventListener('click', () => cambiarRol(u.id, u.rol));

    const btnDel = document.createElement('button');
    btnDel.className = 'btn btn-sm';
    btnDel.style.background = 'var(--danger,#e53e3e)';
    btnDel.style.color = '#fff';
    btnDel.textContent = 'Eliminar';
    btnDel.addEventListener('click', () => eliminarUsuario(u.id, u.nombre));

    tdAcciones.appendChild(btnRol);
    tdAcciones.appendChild(btnDel);

    tr.appendChild(tdNombre);
    tr.appendChild(tdEmail);
    tr.appendChild(tdRol);
    tr.appendChild(tdFecha);
    tr.appendChild(tdAcciones);

    tbody.appendChild(tr);
  });
}

async function cambiarRol(id, rolActual) {
  const roles = ['estudiante', 'docente', 'admin'].filter(r => r !== rolActual);
  const nuevoRol = prompt(`Cambiar rol (${rolActual}) a: ${roles.join(' / ')}`);
  if (!nuevoRol || !roles.includes(nuevoRol)) return;
  const res = await fetch(`/api/admin/usuarios/${id}/rol`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rol: nuevoRol }),
  });
  if (res.ok) {
    await loadUsuarios();
    await loadStats();
  } else {
    const data = await res.json();
    alert(data.error || 'No se pudo cambiar el rol');
  }
}

async function eliminarUsuario(id, nombre) {
  if (!confirm(`¿Eliminar usuario "${nombre}"? Esto borrará sus tickets y registros relacionados.`)) return;
  const res = await fetch(`/api/admin/usuarios/${id}`, { method: 'DELETE' });
  if (res.ok) {
    await loadUsuarios();
    await loadStats();
  } else {
    const data = await res.json();
    alert(data.error || 'No se pudo eliminar el usuario');
  }
}

function initDocenteModal() {
  const modal = document.getElementById('docente-modal');
  const btnOpen = document.getElementById('btn-open-docente-modal');
  const btnClose = document.getElementById('close-docente-modal');
  const form = document.getElementById('nuevo-docente-form');
  const alertEl = document.getElementById('docente-modal-alert');

  if (!modal || !btnOpen || !form) return;

  btnOpen.addEventListener('click', () => {
    alertEl.innerHTML = '';
    form.reset();
    modal.classList.add('open');
  });

  if (btnClose) {
    btnClose.addEventListener('click', () => modal.classList.remove('open'));
  }
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('open');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertEl.innerHTML = '';

    const payload = {
      nombre: document.getElementById('doc-nombre').value.trim(),
      email: document.getElementById('doc-email').value.trim(),
      carrera: document.getElementById('doc-carrera').value.trim(),
      asignatura: document.getElementById('doc-asignatura').value.trim(),
      password: document.getElementById('doc-password').value,
    };

    const submitBtn = document.getElementById('btn-save-docente');
    submitBtn.disabled = true;

    try {
      const res = await fetch('/api/admin/docentes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        alertEl.innerHTML = `<div class="alert alert-error">${escapeHtml(data.error || 'Error al crear docente')}</div>`;
        submitBtn.disabled = false;
        return;
      }

      alertEl.innerHTML = '<div class="alert alert-success">Docente registrado exitosamente</div>';
      form.reset();
      submitBtn.disabled = false;

      setTimeout(async () => {
        modal.classList.remove('open');
        await loadUsuarios();
        await loadStats();
      }, 1000);
    } catch (err) {
      alertEl.innerHTML = '<div class="alert alert-error">Error al conectar con el servidor</div>';
      submitBtn.disabled = false;
    }
  });
}
