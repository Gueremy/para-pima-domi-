// Shared auth utilities available on every page

async function getMe() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) return null;
    const data = await res.json();
    return data.user || null;
  } catch {
    return null;
  }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
}

function showAlert(containerId, message, type = 'error') {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
}

function clearAlert(containerId) {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = '';
}

// ---- LOGIN PAGE LOGIC ----
if (document.getElementById('login-form')) {
  (async () => {
    const user = await getMe();
    if (user) redirectByRole(user.rol);
  })();

  document.getElementById('show-register').addEventListener('click', () => {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('register-section').style.display = 'block';
  });

  document.getElementById('show-login').addEventListener('click', () => {
    document.getElementById('register-section').style.display = 'none';
    document.getElementById('login-section').style.display = 'block';
  });

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert('login-alert');
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) return showAlert('login-alert', data.error);
    redirectByRole(data.user.rol);
  });

  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert('register-alert');
    const payload = {
      nombre: document.getElementById('reg-nombre').value.trim(),
      email: document.getElementById('reg-email').value.trim(),
      password: document.getElementById('reg-password').value,
      rol: document.getElementById('reg-rol').value,
    };

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return showAlert('register-alert', data.error);
    redirectByRole(data.user.rol);
  });
}

function redirectByRole(rol) {
  if (rol === 'docente') window.location.href = '/docente.html';
  else if (rol === 'admin') window.location.href = '/admin.html';
  else window.location.href = '/estudiante.html';
}

// ---- SHARED NAV SETUP (index.html) ----
async function setupNav() {
  const user = await getMe();
  const navGuest = document.getElementById('nav-guest-login');
  const navUser = document.getElementById('nav-user');
  const navPanel = document.getElementById('nav-panel');
  const navLogout = document.getElementById('nav-logout');
  const navUsername = document.getElementById('nav-username');
  const navPanelLink = document.getElementById('nav-panel-link');

  if (!navUser) return;

  if (user) {
    if (navGuest) navGuest.style.display = 'none';
    navUser.style.display = 'flex';
    navLogout.style.display = 'flex';
    navPanel.style.display = 'flex';
    navUsername.textContent = user.nombre;
    navPanelLink.textContent = user.rol === 'docente' ? 'Mi Panel Docente' : 'Mis Tickets';
    navPanelLink.href = user.rol === 'docente' ? '/docente.html' : '/estudiante.html';

    document.getElementById('btn-logout').addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });
  }

  return user;
}

// Panel page nav (estudiante / docente / admin)
async function setupPanelNav(requiredRole) {
  const user = await getMe();
  if (!user || user.rol !== requiredRole) {
    window.location.href = '/login.html';
    return null;
  }
  const nameEl = document.getElementById('nav-username');
  if (nameEl) nameEl.textContent = user.nombre;
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => { e.preventDefault(); logout(); });
  }
  return user;
}
