const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { requireRole } = require('../middleware/auth');
const SQLiteSessionStore = require('../session-store');

const router = express.Router();
const DOMAIN = process.env.DOMAIN || '@universidad.cl';
const requireAdmin = requireRole('admin');

const CORE_DEMO_EMAILS = [
  'admin@universidad.cl',
  'docente@universidad.cl',
  'estudiante@universidad.cl',
  'ana.garcia@universidad.cl',
  'carlos.lopez@universidad.cl',
  'maria.torres@universidad.cl',
];

// GET /api/admin/usuarios — list all users
router.get('/usuarios', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, email, nombre, rol, created_at FROM users ORDER BY created_at DESC').all();
  res.json(users);
});

// DELETE /api/admin/usuarios/:id (DATA-02 & SEC Safety)
router.delete('/usuarios/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

  if (id === req.session.user.id) {
    return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta de administrador activa' });
  }

  const targetUser = db.prepare('SELECT id, email, rol FROM users WHERE id = ?').get(id);
  if (!targetUser) return res.status(404).json({ error: 'Usuario no encontrado' });

  if (process.env.DEMO_MODE === 'true' && CORE_DEMO_EMAILS.includes(targetUser.email)) {
    return res.status(403).json({ error: 'En modo demo, las cuentas base del sistema están protegidas contra eliminación.' });
  }

  if (targetUser.rol === 'admin') {
    const adminCount = db.prepare("SELECT COUNT(*) as n FROM users WHERE rol = 'admin'").get().n;
    if (adminCount <= 1) {
      return res.status(400).json({ error: 'No puedes eliminar al único administrador del sistema' });
    }
  }

  const deleteTx = db.transaction((userId) => {
    db.prepare('DELETE FROM tickets WHERE estudiante_id = ? OR docente_id = ?').run(userId, userId);
    db.prepare('DELETE FROM suscripciones WHERE estudiante_id = ? OR docente_id = ?').run(userId, userId);
    db.prepare('DELETE FROM horarios WHERE docente_id = ?').run(userId);
    db.prepare('DELETE FROM docentes WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM estudiantes WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId);
    SQLiteSessionStore.revokeUserSessions(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  });

  try {
    deleteTx(id);
    return res.json({ ok: true, message: 'Usuario y registros relacionados eliminados correctamente' });
  } catch (err) {
    console.error('Error al eliminar usuario:', err);
    return res.status(500).json({ error: 'Error interno al eliminar el usuario' });
  }
});

// GET /api/admin/stats
router.get('/stats', requireAdmin, (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) as n FROM users').get().n;
  const totalDocentes = db.prepare("SELECT COUNT(*) as n FROM users WHERE rol='docente'").get().n;
  const totalEstudiantes = db.prepare("SELECT COUNT(*) as n FROM users WHERE rol='estudiante'").get().n;
  const totalTickets = db.prepare('SELECT COUNT(*) as n FROM tickets').get().n;
  const pendingTickets = db.prepare("SELECT COUNT(*) as n FROM tickets WHERE estado='pendiente'").get().n;
  res.json({ totalUsers, totalDocentes, totalEstudiantes, totalTickets, pendingTickets });
});

// PATCH /api/admin/usuarios/:id/rol (DATA-04: Role sync in transaction)
router.patch('/usuarios/:id/rol', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { rol } = req.body;

  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
  if (!['estudiante', 'docente', 'admin'].includes(rol)) {
    return res.status(400).json({ error: 'Rol inválido' });
  }

  const user = db.prepare('SELECT id, email, rol FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  if (process.env.DEMO_MODE === 'true' && CORE_DEMO_EMAILS.includes(user.email)) {
    return res.status(403).json({ error: 'En modo demo, las cuentas base del sistema están protegidas contra cambio de rol.' });
  }

  // Prevent demoting the last admin
  if (user.rol === 'admin' && rol !== 'admin') {
    const adminCount = db.prepare("SELECT COUNT(*) as n FROM users WHERE rol = 'admin'").get().n;
    if (adminCount <= 1) {
      return res.status(400).json({ error: 'No se puede revocar el rol al único administrador del sistema' });
    }
  }

  const updateRoleTx = db.transaction((userId, newRole) => {
    db.prepare('UPDATE users SET rol = ? WHERE id = ?').run(newRole, userId);

    if (newRole === 'docente') {
      const exists = db.prepare('SELECT id FROM docentes WHERE user_id = ?').get(userId);
      if (!exists) {
        db.prepare('INSERT INTO docentes (user_id) VALUES (?)').run(userId);
      }
    } else if (newRole === 'estudiante') {
      const exists = db.prepare('SELECT id FROM estudiantes WHERE user_id = ?').get(userId);
      if (!exists) {
        db.prepare('INSERT INTO estudiantes (user_id) VALUES (?)').run(userId);
      }
    }
    SQLiteSessionStore.revokeUserSessions(userId);
  });

  try {
    updateRoleTx(id, rol);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Error al actualizar rol:', err);
    return res.status(500).json({ error: 'Error al cambiar rol' });
  }
});

// POST /api/admin/docentes (SEC-02: Authorized teacher provisioning)
router.post('/docentes', requireAdmin, async (req, res) => {
  const { email, nombre, carrera, asignatura, password } = req.body;

  if (!email || !nombre || !password) {
    return res.status(400).json({ error: 'Email, nombre y contraseña son requeridos' });
  }
  if (!email.endsWith(DOMAIN)) {
    return res.status(400).json({ error: `El correo debe contener ${DOMAIN}` });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  const createDocenteTx = db.transaction((hashedPassword) => {
    const userRes = db.prepare('INSERT INTO users (email, password, nombre, rol) VALUES (?, ?, ?, ?)').run(
      email.trim().toLowerCase(),
      hashedPassword,
      nombre.trim(),
      'docente'
    );
    const userId = userRes.lastInsertRowid;

    db.prepare('INSERT INTO docentes (user_id, carrera, asignatura) VALUES (?, ?, ?)').run(
      userId,
      carrera ? carrera.trim() : null,
      asignatura ? asignatura.trim() : null
    );

    return { id: userId, email: email.trim().toLowerCase(), nombre: nombre.trim(), rol: 'docente' };
  });

  try {
    const hashed = await bcrypt.hash(password, 10);
    const createdUser = createDocenteTx(hashed);
    return res.status(201).json({ user: createdUser });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'El correo ya está registrado' });
    }
    console.error('Error al crear docente:', err);
    return res.status(500).json({ error: 'Error al registrar docente' });
  }
});

module.exports = router;
