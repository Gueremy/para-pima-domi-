// main.js — index.html page logic

let currentUser = null;

function renderCard(docente) {
  return renderDocenteCard(docente, {
    cardIdPrefix: 'card-docente',
    horariosIdPrefix: 'horarios-mini',
    onCardClick: 'openIndexPerfilModal',
    onTicketClick: docente.disponible ? 'openTicketModal' : null,
    showSuscribir: currentUser?.rol === 'estudiante',
    suscrito: docente.suscrito,
  });
}

function openIndexPerfilModal(docenteId) {
  openPerfilModal(docenteId, {
    currentUser,
    onTicketClick: (id, nombre) => {
      openTicketModal(id, nombre);
      document.getElementById('perfil-modal').classList.remove('open');
    },
  });
}

function openTicketModal(docenteId, docenteNombre) {
  document.getElementById('ticket-docente-id').value = docenteId;
  document.getElementById('ticket-docente-nombre').value = docenteNombre;
  document.getElementById('ticket-form-alert').innerHTML = '';
  document.getElementById('ticket-mensaje').value = '';
  document.getElementById('ticket-modal').classList.add('open');
}

function initTicketModal() {
  document.getElementById('close-ticket-modal').addEventListener('click', () =>
    document.getElementById('ticket-modal').classList.remove('open'));
  document.getElementById('ticket-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
  });
  document.getElementById('submit-ticket').addEventListener('click', () =>
    submitTicket({
      docenteIdEl: 'ticket-docente-id',
      tipoEl: 'ticket-tipo',
      mensajeEl: 'ticket-mensaje',
      alertEl: 'ticket-form-alert',
      onSuccess: () => {
        document.getElementById('ticket-form-alert').innerHTML = '<div class="alert alert-success">Ticket enviado correctamente.</div>';
        setTimeout(() => { document.getElementById('ticket-modal').classList.remove('open'); }, 1500);
      },
    }));
}

async function toggleSuscripcion(docenteId, btn) {
  const res = await fetch(`/api/docentes/suscribir/${docenteId}`, { method: 'POST' });
  if (!res.ok) return;
  const data = await res.json();
  btn.textContent = data.suscrito ? 'Notificandome' : 'Notificarme';
  btn.className = `btn ${data.suscrito ? 'btn-success' : 'btn-outline'} btn-sm`;
}

(async () => {
  currentUser = await setupNav();
  initPerfilModalClose();
  initTicketModal();
  await initSearchWidget({
    searchId: 'search-nombre',
    carreraId: 'filter-carrera',
    asignaturaId: 'filter-asignatura',
    disponibleId: 'filter-disponible',
    gridId: 'docentes-grid',
    loadingId: 'loading',
    emptyId: 'empty',
    horariosPrefix: 'horarios-mini',
    cardFn: renderCard,
  });
})();
