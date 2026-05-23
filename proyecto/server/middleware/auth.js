function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }
    if (req.session.user.rol !== role) {
      return res.status(403).json({ error: 'Acceso denegado: rol incorrecto' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
