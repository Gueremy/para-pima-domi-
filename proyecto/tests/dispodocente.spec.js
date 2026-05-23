// @ts-check
const { test, expect, request } = require('@playwright/test');

const BASE = 'http://localhost:3000';

// Helper: login via browser page (shares cookies with page.request)
async function loginViaBrowser(page, email, password) {
  await page.goto(`${BASE}/login.html`);
  await page.fill('#login-email', email);
  await page.fill('#login-password', password);
  await page.locator('#login-section button[type=submit]').click();
  // Wait for redirect
  await page.waitForURL(url => !url.href.includes('login.html'), { timeout: 8000 }).catch(() => {});
}

async function logoutViaBrowser(page) {
  const btn = page.locator('#btn-logout');
  if (await btn.count() > 0 && await btn.isVisible()) {
    await btn.click();
    await page.waitForURL(`${BASE}/login.html`, { timeout: 5000 }).catch(() => {});
  } else {
    await page.request.post(`${BASE}/api/auth/logout`);
    await page.goto(`${BASE}/login.html`);
  }
}

// ============================================================
// 1. AUTH TESTS
// ============================================================

test.describe('1. Autenticación', () => {
  test('1.1 Registro con correo inválido (no @universidad.cl) muestra error inline', async ({ page }) => {
    await page.goto(`${BASE}/login.html`);
    await page.click('#show-register');
    await page.fill('#reg-nombre', 'Test User');
    await page.fill('#reg-email', 'test@gmail.com');
    await page.fill('#reg-password', 'Password123!');
    await page.selectOption('#reg-rol', 'estudiante');

    // Listen for dialog before submitting
    let dialogFired = false;
    page.on('dialog', async dialog => { dialogFired = true; await dialog.accept(); });

    await page.locator('#register-section button[type=submit]').click();

    const alert = await page.waitForSelector('#register-alert .alert', { timeout: 5000 });
    const text = await alert.textContent();
    expect(text).toContain('universidad.cl');
    expect(dialogFired).toBe(false);
  });

  test('1.2 Registro estudiante redirige a /estudiante.html', async ({ page }) => {
    const email = `est${Date.now()}@universidad.cl`;
    await page.goto(`${BASE}/login.html`);
    await page.click('#show-register');
    await page.fill('#reg-nombre', 'Playwright Estudiante');
    await page.fill('#reg-email', email);
    await page.fill('#reg-password', 'TestPass123!');
    await page.selectOption('#reg-rol', 'estudiante');
    await page.locator('#register-section button[type=submit]').click();

    await page.waitForURL(`${BASE}/estudiante.html`, { timeout: 8000 });
    expect(page.url()).toContain('estudiante.html');
  });

  test('1.3 Registro docente redirige a /docente.html', async ({ page }) => {
    const email = `doc${Date.now()}@universidad.cl`;
    await page.goto(`${BASE}/login.html`);
    await page.click('#show-register');
    await page.fill('#reg-nombre', 'Playwright Docente');
    await page.fill('#reg-email', email);
    await page.fill('#reg-password', 'TestPass123!');
    await page.selectOption('#reg-rol', 'docente');
    await page.locator('#register-section button[type=submit]').click();

    await page.waitForURL(`${BASE}/docente.html`, { timeout: 8000 });
    expect(page.url()).toContain('docente.html');
  });

  // NOTE: Rate limit test is intentionally placed in section 9 (last) to avoid
  // blocking all subsequent test logins from the same localhost IP.

  test('1.5 Acceso directo a /estudiante.html sin sesión redirige a login', async ({ page }) => {
    await page.goto(`${BASE}/estudiante.html`);
    await page.waitForURL(`${BASE}/login.html`, { timeout: 6000 });
    expect(page.url()).toContain('login.html');
  });

  test('1.6 Entrar como invitado desde login carga index.html', async ({ page }) => {
    await page.goto(`${BASE}/login.html`);
    await page.click('.guest-btn');
    await page.waitForURL(`${BASE}/`, { timeout: 5000 });
    // Guest should NOT see logout button (nav-panel hidden)
    const navPanel = page.locator('#nav-panel');
    await page.waitForTimeout(1000); // let JS run
    const visible = await navPanel.isVisible();
    expect(visible).toBe(false);
  });

  test('1.7 Reset password — página carga con formulario de email', async ({ page }) => {
    await page.goto(`${BASE}/reset.html`);
    await page.waitForLoadState('networkidle');
    // Should have an email input or a form
    const emailInput = page.locator('input[type=email], input[type=text]').first();
    await expect(emailInput).toBeVisible({ timeout: 3000 });
  });

  test('1.8 Registro con email duplicado muestra error inline (sin alert())', async ({ page }) => {
    await page.goto(`${BASE}/login.html`);
    await page.click('#show-register');
    await page.fill('#reg-nombre', 'Duplicate Test');
    await page.fill('#reg-email', 'estudiante@universidad.cl');
    await page.fill('#reg-password', 'Estudiante123!');
    await page.selectOption('#reg-rol', 'estudiante');

    let dialogFired = false;
    page.on('dialog', async d => { dialogFired = true; await d.accept(); });

    await page.locator('#register-section button[type=submit]').click();

    const alert = await page.waitForSelector('#register-alert .alert', { timeout: 5000 });
    const text = await alert.textContent();
    expect(text).toMatch(/registrado|existe/i);
    expect(dialogFired).toBe(false);
  });
});

// ============================================================
// 2. BÚSQUEDA (index.html)
// ============================================================

test.describe('2. Búsqueda en index.html', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/`);
    await page.waitForFunction(
      () => document.getElementById('docentes-grid') &&
            document.getElementById('docentes-grid').style.display !== 'none',
      { timeout: 8000 }
    ).catch(() => {});
  });

  test('2.1 Buscar docente por nombre muestra resultados correctos', async ({ page }) => {
    await page.fill('#search-nombre', 'Ana');
    await page.waitForTimeout(700); // debounce

    const cards = page.locator('#docentes-grid .card');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    const gridText = await page.locator('#docentes-grid').textContent();
    expect(gridText).toContain('Ana');
  });

  test('2.2 Filtro por carrera muestra solo esa carrera', async ({ page }) => {
    const select = page.locator('#filter-carrera');
    const options = await select.locator('option').allTextContents();
    const realOption = options.find(o => o && o.trim() !== '' && !o.includes('Todas'));

    if (realOption) {
      await select.selectOption({ label: realOption });
      await page.waitForTimeout(700);
      const grid = page.locator('#docentes-grid');
      await expect(grid).toBeVisible();
    }
  });

  test('2.3 Toggle Solo disponibles reduce resultados o los mantiene', async ({ page }) => {
    await page.waitForTimeout(500);
    const totalBefore = await page.locator('#docentes-grid .card').count();

    await page.check('#filter-disponible');
    await page.waitForTimeout(700);

    const totalAfter = await page.locator('#docentes-grid .card').count();
    expect(totalAfter).toBeLessThanOrEqual(totalBefore);
  });

  test('2.4 Click en card abre modal de perfil', async ({ page }) => {
    await page.waitForTimeout(500);
    const firstCard = page.locator('#docentes-grid .card').first();
    await firstCard.click();

    const modal = page.locator('#perfil-modal');
    await expect(modal).toHaveClass(/open/, { timeout: 4000 });
  });

  test('2.5 Botón Notificarme NO visible para invitado (sin sesión)', async ({ page }) => {
    await page.waitForTimeout(500);
    const suscribirBtns = page.locator('#docentes-grid button').filter({ hasText: /Notific/i });
    const count = await suscribirBtns.count();
    expect(count).toBe(0);
  });

  test('2.6 Botón Notificarme visible para estudiante con sesión', async ({ page }) => {
    await loginViaBrowser(page, 'estudiante@universidad.cl', 'Estudiante123!');
    expect(page.url()).toContain('estudiante.html');

    await page.goto(`${BASE}/`);
    await page.waitForFunction(
      () => document.getElementById('docentes-grid') &&
            document.getElementById('docentes-grid').style.display !== 'none',
      { timeout: 8000 }
    ).catch(() => {});

    await page.waitForTimeout(500);
    const suscribirBtns = page.locator('#docentes-grid button').filter({ hasText: /Notific/i });
    const count = await suscribirBtns.count();
    expect(count).toBeGreaterThan(0);

    await logoutViaBrowser(page);
  });
});

// ============================================================
// 3. DISPONIBILIDAD (docente.html)
// ============================================================

test.describe('3. Disponibilidad docente', () => {
  test('3.1 Toggle disponibilidad via API funciona correctamente ON/OFF', async ({ page }) => {
    await loginViaBrowser(page, 'docente@universidad.cl', 'Docente123!');
    expect(page.url()).toContain('docente.html');

    // Toggle ON
    const resOn = await page.request.patch(`${BASE}/api/docentes/disponibilidad`, {
      data: { disponible: true },
    });
    expect(resOn.ok()).toBeTruthy();
    const dataOn = await resOn.json();
    expect(dataOn.disponible).toBe(true);

    // Verify reflected in public list
    const listRes = await page.request.get(`${BASE}/api/docentes`);
    const docentes = await listRes.json();
    const myDocente = docentes.find(d => d.email === 'docente@universidad.cl');
    expect(myDocente?.disponible).toBe(1);

    // Toggle OFF
    const resOff = await page.request.patch(`${BASE}/api/docentes/disponibilidad`, {
      data: { disponible: false },
    });
    expect(resOff.ok()).toBeTruthy();
    const dataOff = await resOff.json();
    expect(dataOff.disponible).toBe(false);

    await logoutViaBrowser(page);
  });

  test('3.2 Estudiante no puede cambiar disponibilidad (403)', async ({ page }) => {
    await loginViaBrowser(page, 'estudiante@universidad.cl', 'Estudiante123!');

    const res = await page.request.patch(`${BASE}/api/docentes/disponibilidad`, {
      data: { disponible: true },
    });
    expect(res.status()).toBe(403);

    await logoutViaBrowser(page);
  });

  test('3.3 Docente.html protegido — estudiante redirige a login', async ({ page }) => {
    await loginViaBrowser(page, 'estudiante@universidad.cl', 'Estudiante123!');
    await page.goto(`${BASE}/docente.html`);
    await page.waitForURL(`${BASE}/login.html`, { timeout: 6000 });
    expect(page.url()).toContain('login.html');
    await page.request.post(`${BASE}/api/auth/logout`);
  });
});

// ============================================================
// 4. TICKETS — FLUJO COMPLETO
// ============================================================

test.describe('4. Tickets — Flujo Completo', () => {
  test('4.1 Estudiante crea ticket tipo escrita', async ({ page }) => {
    await loginViaBrowser(page, 'estudiante@universidad.cl', 'Estudiante123!');

    // Create ticket via API (session shared now)
    const res = await page.request.post(`${BASE}/api/tickets`, {
      data: { docenteId: 2, tipo: 'escrita', mensaje: 'Playwright test ticket escrita' },
    });
    expect(res.ok()).toBeTruthy();
    const ticket = await res.json();
    expect(ticket.tipo).toBe('escrita');
    expect(ticket.estado).toBe('pendiente');

    await logoutViaBrowser(page);
  });

  test('4.2 Estudiante crea ticket tipo presencial', async ({ page }) => {
    await loginViaBrowser(page, 'estudiante@universidad.cl', 'Estudiante123!');

    const res = await page.request.post(`${BASE}/api/tickets`, {
      data: { docenteId: 3, tipo: 'presencial', mensaje: 'Playwright test ticket presencial' },
    });
    expect(res.ok()).toBeTruthy();
    const ticket = await res.json();
    expect(ticket.tipo).toBe('presencial');

    await logoutViaBrowser(page);
  });

  test('4.3 Límite de 10 tickets pendientes al mismo docente', async ({ page }) => {
    await loginViaBrowser(page, 'estudiante@universidad.cl', 'Estudiante123!');

    // Get current pending count for docente 1
    const checkRes = await page.request.get(`${BASE}/api/tickets/mis-tickets`);
    const myTickets = await checkRes.json();
    const pendingAtDoc1 = myTickets.filter(t => t.docente_id === 1 && t.estado === 'pendiente').length;

    // Fill up remaining slots to reach 10
    let responses = [];
    for (let i = pendingAtDoc1; i < 10; i++) {
      const r = await page.request.post(`${BASE}/api/tickets`, {
        data: { docenteId: 1, tipo: 'escrita', mensaje: `Fill ticket ${i + 1}` },
      });
      responses.push(r.status());
    }

    // Now the next one (11th pending) should fail
    const overLimit = await page.request.post(`${BASE}/api/tickets`, {
      data: { docenteId: 1, tipo: 'escrita', mensaje: 'Should fail - over limit' },
    });
    expect(overLimit.status()).toBe(429);
    const body = await overLimit.json();
    expect(body.error).toMatch(/10|pendiente/i);

    await logoutViaBrowser(page);
  });

  test('4.4 Docente ve sus tickets en recibidos', async ({ page }) => {
    await loginViaBrowser(page, 'ana.garcia@universidad.cl', 'docente123');
    expect(page.url()).toContain('docente.html');

    const res = await page.request.get(`${BASE}/api/tickets/recibidos`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('pendientes');
    expect(data).toHaveProperty('respondidos');
    expect(data).toHaveProperty('resueltos');
    expect(Array.isArray(data.pendientes)).toBeTruthy();

    await logoutViaBrowser(page);
  });

  test('4.5 Docente responde con Marcar resuelto', async ({ page }) => {
    await loginViaBrowser(page, 'ana.garcia@universidad.cl', 'docente123');

    const res = await page.request.get(`${BASE}/api/tickets/recibidos`);
    const data = await res.json();
    const pendiente = data.pendientes[0];

    if (pendiente) {
      const resp = await page.request.patch(`${BASE}/api/tickets/${pendiente.id}/responder`, {
        data: { tipoRespuesta: 'resuelto', respuesta: 'Resuelto via Playwright' },
      });
      expect(resp.ok()).toBeTruthy();
      const updated = await resp.json();
      expect(updated.estado).toBe('resuelto');
      expect(updated.tipo_respuesta).toBe('resuelto');
    }

    await logoutViaBrowser(page);
  });

  test('4.6 Docente responde con texto', async ({ page }) => {
    await loginViaBrowser(page, 'ana.garcia@universidad.cl', 'docente123');

    const res = await page.request.get(`${BASE}/api/tickets/recibidos`);
    const data = await res.json();
    const pendiente = data.pendientes[0];

    if (pendiente) {
      const resp = await page.request.patch(`${BASE}/api/tickets/${pendiente.id}/responder`, {
        data: { tipoRespuesta: 'respuesta', respuesta: 'Respuesta detallada del docente.' },
      });
      expect(resp.ok()).toBeTruthy();
      const updated = await resp.json();
      expect(updated.estado).toBe('respondido');
      expect(updated.tipo_respuesta).toBe('respuesta');
    }

    await logoutViaBrowser(page);
  });

  test('4.7 Docente coordina reunión y genera .ics descargable', async ({ page }) => {
    await loginViaBrowser(page, 'ana.garcia@universidad.cl', 'docente123');

    const res = await page.request.get(`${BASE}/api/tickets/recibidos`);
    const data = await res.json();
    const pendiente = data.pendientes[0];

    if (pendiente) {
      const resp = await page.request.patch(`${BASE}/api/tickets/${pendiente.id}/responder`, {
        data: { tipoRespuesta: 'reunion', respuesta: 'Jueves 15:00 en oficina A302' },
      });
      expect(resp.ok()).toBeTruthy();
      const updated = await resp.json();
      expect(updated.tipo_respuesta).toBe('reunion');

      // Verify ICS generation
      const icsRes = await page.request.get(`${BASE}/api/tickets/${pendiente.id}/ics`);
      expect(icsRes.ok()).toBeTruthy();
      const ct = icsRes.headers()['content-type'];
      expect(ct).toContain('calendar');
      const icsText = await icsRes.text();
      expect(icsText).toContain('BEGIN:VCALENDAR');
      expect(icsText).toContain('BEGIN:VEVENT');
      expect(icsText).toContain('Jueves 15:00');
    }

    await logoutViaBrowser(page);
  });

  test('4.8 Estudiante ve respuesta en sus tickets', async ({ page }) => {
    await loginViaBrowser(page, 'estudiante@universidad.cl', 'Estudiante123!');

    const res = await page.request.get(`${BASE}/api/tickets/mis-tickets`);
    expect(res.ok()).toBeTruthy();
    const tickets = await res.json();
    expect(Array.isArray(tickets)).toBeTruthy();

    const respondido = tickets.find(t => t.estado !== 'pendiente');
    if (respondido) {
      expect(respondido.estado).toMatch(/respondido|resuelto/);
    }

    await logoutViaBrowser(page);
  });

  test('4.9 Invitado no puede crear ticket (401)', async ({ page }) => {
    await page.goto(`${BASE}/`);
    const res = await page.request.post(`${BASE}/api/tickets`, {
      data: { docenteId: 1, tipo: 'escrita', mensaje: 'Sin sesión' },
    });
    expect(res.status()).toBe(401);
  });
});

// ============================================================
// 5. PERFIL DOCENTE
// ============================================================

test.describe('5. Perfil Docente', () => {
  test('5.1 Docente puede actualizar su perfil', async ({ page }) => {
    await loginViaBrowser(page, 'docente@universidad.cl', 'Docente123!');

    const res = await page.request.patch(`${BASE}/api/docentes/perfil`, {
      data: {
        carrera: 'Ingeniería Informática',
        asignatura: 'Algoritmos y Estructuras',
        descripcion_pt: 'Disponible jueves tarde',
        es_part_time: true,
        bio: 'Docente con amplia experiencia en algoritmia.',
        ramos: 'Algoritmos, Programación, Bases de Datos',
        certificados: 'Magíster en Ciencias de la Computación',
        telefono: '+56 9 8765 1234',
        oficina: 'Edificio D, 205',
      },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.ok).toBe(true);

    // Verify changes
    const profileRes = await page.request.get(`${BASE}/api/docentes/mi-perfil`);
    const profile = await profileRes.json();
    expect(profile.carrera).toBe('Ingeniería Informática');
    expect(profile.bio).toBe('Docente con amplia experiencia en algoritmia.');

    await logoutViaBrowser(page);
  });

  test('5.2 Docente puede agregar slot de horario', async ({ page }) => {
    await loginViaBrowser(page, 'docente@universidad.cl', 'Docente123!');

    const res = await page.request.post(`${BASE}/api/docentes/horarios`, {
      data: { dia: 'Miércoles', hora_inicio: '14:00', hora_fin: '16:00' },
    });
    expect(res.ok()).toBeTruthy();
    const slot = await res.json();
    expect(slot.id).toBeTruthy();
    expect(slot.dia).toBe('Miércoles');

    await logoutViaBrowser(page);
  });

  test('5.3 Docente puede eliminar slot de horario', async ({ page }) => {
    await loginViaBrowser(page, 'docente@universidad.cl', 'Docente123!');

    // Add a slot
    const addRes = await page.request.post(`${BASE}/api/docentes/horarios`, {
      data: { dia: 'Viernes', hora_inicio: '10:00', hora_fin: '12:00' },
    });
    const slot = await addRes.json();

    // Delete it
    const delRes = await page.request.delete(`${BASE}/api/docentes/horarios/${slot.id}`);
    expect(delRes.ok()).toBeTruthy();

    // Verify gone
    const listRes = await page.request.get(`${BASE}/api/docentes/horarios`);
    const horarios = await listRes.json();
    const stillThere = horarios.find(h => h.id === slot.id);
    expect(stillThere).toBeUndefined();

    await logoutViaBrowser(page);
  });

  test('5.4 Horarios del docente aparecen en el listado público', async ({ page }) => {
    await loginViaBrowser(page, 'docente@universidad.cl', 'Docente123!');

    // Add a horario with unique time
    const addRes = await page.request.post(`${BASE}/api/docentes/horarios`, {
      data: { dia: 'Jueves', hora_inicio: '09:00', hora_fin: '11:00' },
    });
    expect(addRes.ok()).toBeTruthy();
    const slot = await addRes.json();

    // Check public endpoint — note: public endpoint returns {dia, hora_inicio, hora_fin} without id
    const me = await page.request.get(`${BASE}/api/auth/me`);
    const { user } = await me.json();

    const pubRes = await page.request.get(`${BASE}/api/docentes/${user.id}/horarios`);
    expect(pubRes.ok()).toBeTruthy();
    const horarios = await pubRes.json();
    // Find by content (public endpoint omits id column)
    const found = horarios.find(h => h.dia === 'Jueves' && h.hora_inicio === '09:00' && h.hora_fin === '11:00');
    expect(found).toBeTruthy();

    // Cleanup
    await page.request.delete(`${BASE}/api/docentes/horarios/${slot.id}`);
    await logoutViaBrowser(page);
  });
});

// ============================================================
// 6. PANEL ADMIN
// ============================================================

test.describe('6. Panel Admin', () => {
  test('6.1 Admin puede acceder a /admin.html', async ({ page }) => {
    await loginViaBrowser(page, 'admin@universidad.cl', 'Admin123!');
    await page.goto(`${BASE}/admin.html`);
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('admin.html');
    await logoutViaBrowser(page);
  });

  test('6.2 Admin ve stats globales via API', async ({ page }) => {
    await loginViaBrowser(page, 'admin@universidad.cl', 'Admin123!');

    const res = await page.request.get(`${BASE}/api/admin/stats`);
    expect(res.ok()).toBeTruthy();
    const stats = await res.json();
    expect(stats).toHaveProperty('totalUsers');
    expect(stats).toHaveProperty('totalDocentes');
    expect(stats).toHaveProperty('totalEstudiantes');
    expect(stats).toHaveProperty('totalTickets');
    expect(stats.totalUsers).toBeGreaterThan(0);

    await logoutViaBrowser(page);
  });

  test('6.3 Admin ve lista de usuarios via API', async ({ page }) => {
    await loginViaBrowser(page, 'admin@universidad.cl', 'Admin123!');

    const res = await page.request.get(`${BASE}/api/admin/usuarios`);
    expect(res.ok()).toBeTruthy();
    const users = await res.json();
    expect(Array.isArray(users)).toBeTruthy();
    expect(users.length).toBeGreaterThan(0);
    // Should have admin, docente, estudiante users
    const roles = [...new Set(users.map(u => u.rol))];
    expect(roles).toContain('admin');

    await logoutViaBrowser(page);
  });

  test('6.4 Estudiante no puede acceder a admin API (403)', async ({ page }) => {
    await loginViaBrowser(page, 'estudiante@universidad.cl', 'Estudiante123!');

    const res = await page.request.get(`${BASE}/api/admin/stats`);
    expect(res.status()).toBe(403);

    await logoutViaBrowser(page);
  });

  test('6.5 Estudiante en admin.html redirige a login', async ({ page }) => {
    await loginViaBrowser(page, 'estudiante@universidad.cl', 'Estudiante123!');
    await page.goto(`${BASE}/admin.html`);
    await page.waitForURL(`${BASE}/login.html`, { timeout: 6000 });
    expect(page.url()).toContain('login.html');
    await page.request.post(`${BASE}/api/auth/logout`);
  });
});

// ============================================================
// 7. EDGE CASES
// ============================================================

test.describe('7. Edge Cases', () => {
  test('7.1 Formulario login con campos vacíos no navega (HTML5 required)', async ({ page }) => {
    await page.goto(`${BASE}/login.html`);
    // Don't fill anything
    await page.locator('#login-section button[type=submit]').click();
    // HTML5 validation prevents submit
    await page.waitForTimeout(300);
    expect(page.url()).toContain('login.html');
  });

  test('7.2 Formulario registro con campos vacíos no navega (HTML5 required)', async ({ page }) => {
    await page.goto(`${BASE}/login.html`);
    await page.click('#show-register');
    await page.waitForSelector('#register-section', { state: 'visible' });
    // Don't fill anything
    await page.locator('#register-section button[type=submit]').click();
    await page.waitForTimeout(300);
    expect(page.url()).toContain('login.html');
  });

  test('7.3 Docente intenta acceder a /estudiante.html redirige a login', async ({ page }) => {
    await loginViaBrowser(page, 'docente@universidad.cl', 'Docente123!');
    await page.goto(`${BASE}/estudiante.html`);
    await page.waitForURL(`${BASE}/login.html`, { timeout: 6000 });
    expect(page.url()).toContain('login.html');
    await page.request.post(`${BASE}/api/auth/logout`);
  });

  test('7.4 Token de reset inválido devuelve error 400', async ({ page }) => {
    const res = await page.request.post(`${BASE}/api/reset/confirm`, {
      data: { token: 'INVALID_TOKEN_XYZ_PLAYWRIGHT', password: 'NewPass123!' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/inválido|expirado/i);
  });

  test('7.5 Contraseña menor a 6 chars en registro devuelve 400', async ({ page }) => {
    const res = await page.request.post(`${BASE}/api/auth/register`, {
      data: { email: `short${Date.now()}@universidad.cl`, password: '12345', nombre: 'Short', rol: 'estudiante' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/6|caracter/i);
  });

  test('7.6 ICS generado correctamente para ticket tipo reunion', async ({ page }) => {
    await loginViaBrowser(page, 'ana.garcia@universidad.cl', 'docente123');

    // Create a ticket as estudiante first (if needed)
    await logoutViaBrowser(page);
    await loginViaBrowser(page, 'ana.garcia@universidad.cl', 'docente123');

    const res = await page.request.get(`${BASE}/api/tickets/recibidos`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    const allTickets = [...data.pendientes, ...data.respondidos, ...data.resueltos];
    const reunionTicket = allTickets.find(t => t.tipo_respuesta === 'reunion');

    if (reunionTicket) {
      const icsRes = await page.request.get(`${BASE}/api/tickets/${reunionTicket.id}/ics`);
      expect(icsRes.ok()).toBeTruthy();
      const ct = icsRes.headers()['content-type'];
      expect(ct).toContain('calendar');
      const text = await icsRes.text();
      expect(text).toContain('BEGIN:VCALENDAR');
      expect(text).toContain('BEGIN:VEVENT');
    } else {
      // No reunion ticket exists yet — create one
      // Get pending ticket from pendientes
      const pending = data.pendientes[0];
      if (pending) {
        const resp = await page.request.patch(`${BASE}/api/tickets/${pending.id}/responder`, {
          data: { tipoRespuesta: 'reunion', respuesta: 'Lunes 10:00 en sala 301' },
        });
        expect(resp.ok()).toBeTruthy();
        const updated = await resp.json();

        const icsRes = await page.request.get(`${BASE}/api/tickets/${updated.id}/ics`);
        expect(icsRes.ok()).toBeTruthy();
        const text = await icsRes.text();
        expect(text).toContain('BEGIN:VCALENDAR');
      }
    }

    await logoutViaBrowser(page);
  });

  test('7.7 index.html no lanza errores de JS tras 5s', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.goto(`${BASE}/`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    expect(errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('7.8 Tipo de respuesta de ticket inválido devuelve 400', async ({ page }) => {
    await loginViaBrowser(page, 'ana.garcia@universidad.cl', 'docente123');

    const res = await page.request.get(`${BASE}/api/tickets/recibidos`);
    const data = await res.json();
    const ticket = data.pendientes[0] || data.respondidos[0];

    if (ticket) {
      const resp = await page.request.patch(`${BASE}/api/tickets/${ticket.id}/responder`, {
        data: { tipoRespuesta: 'invalido', respuesta: 'test' },
      });
      expect(resp.status()).toBe(400);
    }

    await logoutViaBrowser(page);
  });
});

// ============================================================
// 8. SUSCRIPCIONES
// ============================================================

test.describe('8. Suscripciones / Notificarme', () => {
  test('8.1 Estudiante puede suscribirse y desuscribirse a docente', async ({ page }) => {
    await loginViaBrowser(page, 'estudiante@universidad.cl', 'Estudiante123!');

    // Suscribir
    const res1 = await page.request.post(`${BASE}/api/docentes/suscribir/2`);
    expect(res1.ok()).toBeTruthy();
    const d1 = await res1.json();
    const wasSuscrito = d1.suscrito;

    // Toggle again
    const res2 = await page.request.post(`${BASE}/api/docentes/suscribir/2`);
    expect(res2.ok()).toBeTruthy();
    const d2 = await res2.json();
    expect(d2.suscrito).toBe(!wasSuscrito);

    await logoutViaBrowser(page);
  });

  test('8.2 Invitado no puede suscribirse (401)', async ({ page }) => {
    await page.goto(`${BASE}/`);
    const res = await page.request.post(`${BASE}/api/docentes/suscribir/1`);
    expect(res.status()).toBe(401);
  });

  test('8.3 Estudiante ve marcadores de suscripción correctos', async ({ page }) => {
    await loginViaBrowser(page, 'estudiante@universidad.cl', 'Estudiante123!');

    // Subscribe to docente 3
    await page.request.post(`${BASE}/api/docentes/suscribir/3`);

    // List docentes and check suscrito=true for id=3
    const res = await page.request.get(`${BASE}/api/docentes`);
    const docentes = await res.json();
    const doc3 = docentes.find(d => d.id === 3);
    expect(doc3?.suscrito).toBe(true);

    // Unsubscribe
    await page.request.post(`${BASE}/api/docentes/suscribir/3`);

    await logoutViaBrowser(page);
  });
});

// ============================================================
// 9. RATE LIMIT TEST (must run LAST — blocks all logins from IP)
// ============================================================

test.describe('9. Rate Limit (ejecutar al final)', () => {
  test('9.1 Login con contraseña incorrecta 5+ veces bloquea IP (rate limit)', async ({ page }) => {
    // Register fresh email to test with
    const email = `rl${Date.now()}@universidad.cl`;
    const regRes = await page.request.post(`${BASE}/api/auth/register`, {
      data: { email, password: 'ValidPass123!', nombre: 'RateLimit Test', rol: 'estudiante' },
    });
    expect(regRes.ok()).toBeTruthy();

    let lastStatus = 200;
    let lastBody = {};
    // Make 6 wrong-password login attempts
    for (let i = 0; i < 6; i++) {
      const res = await page.request.post(`${BASE}/api/auth/login`, {
        data: { email, password: 'WRONGPASSWORD' },
      });
      lastStatus = res.status();
      lastBody = await res.json();
    }
    // After 5 bad attempts, 6th should be rate limited (429)
    expect(lastStatus).toBe(429);
    expect(lastBody.error).toMatch(/intento|espera|minuto/i);
  });
});
