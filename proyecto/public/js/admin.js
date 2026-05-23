// admin.js — panel admin logic

(async () => {
  const user = await setupPanelNav('admin');
  if (!user) return;
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
  tbody.innerHTML = users.map(u => `
    <tr style="border-bottom:1px solid var(--border)">
      <td style="padding:0.6rem 0.75rem;font-weight:500">${u.nombre}</td>
      <td style="padding:0.6rem 0.75rem;color:var(--text-muted);font-size:0.85rem">${u.email}</td>
      <td style="padding:0.6rem 0.75rem"><span class="badge badge-secondary">${u.rol}</span></td>
      <td style="padding:0.6rem 0.75rem;color:var(--text-muted);font-size:0.8rem">${new Date(u.created_at).toLocaleDateString('es-CL')}</td>
      <td style="padding:0.6rem 0.75rem;display:flex;gap:0.4rem">
        <button class="btn btn-outline btn-sm" onclick="cambiarRol(${u.id}, '${u.rol}')">Cambiar rol</button>
        <button class="btn btn-sm" style="background:var(--danger,#e53e3e);color:#fff" onclick="eliminarUsuario(${u.id}, '${u.nombre.replace(/'/g, "\\'")}')">Eliminar</button>
      </td>
    </tr>
  `).join('');
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
  if (res.ok) await loadUsuarios();
}

async function eliminarUsuario(id, nombre) {
  if (!confirm(`Eliminar usuario ${nombre}? Esto borrara todos sus tickets y datos.`)) return;
  const res = await fetch(`/api/admin/usuarios/${id}`, { method: 'DELETE' });
  if (res.ok) { await loadUsuarios(); await loadStats(); }
}
