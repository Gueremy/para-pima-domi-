const { db } = require('../db');

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  // Live session validation: ensure user still exists and refresh role
  const user = db.prepare('SELECT id, email, nombre, rol FROM users WHERE id = ?').get(req.session.user.id);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'Sesión revocada o usuario inexistente' });
  }

  // Refresh active user role and attributes
  req.session.user.rol = user.rol;
  req.session.user.nombre = user.nombre;
  req.session.user.email = user.email;

  next();
}

function requireRole(role) {
  return (req, res, next) => {
    requireAuth(req, res, () => {
      if (req.session.user.rol !== role) {
        return res.status(403).json({ error: 'Acceso denegado: rol incorrecto' });
      }
      next();
    });
  };
}

module.exports = { requireAuth, requireRole };
