require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const { initDb, db } = require('./db');
const SQLiteSessionStore = require('./session-store');

const authRoutes = require('./routes/auth');
const docentesRoutes = require('./routes/docentes');
const ticketsRoutes = require('./routes/tickets');
const resetRoutes = require('./routes/reset');
const adminRoutes = require('./routes/admin');
const estudiantesRoutes = require('./routes/estudiantes');

const app = express();
const PORT = process.env.PORT || 3000;

// SEC-04: Session secret validation
const sessionSecret = process.env.SESSION_SECRET || 'fallback_secret';
if (process.env.NODE_ENV === 'production') {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'fallback_secret' || process.env.SESSION_SECRET === 'super_secret_key_change_me') {
    console.error('FATAL: Debes configurar un SESSION_SECRET seguro y único en producción.');
    process.exit(1);
  }
}

// SEC-06: Security headers & limits
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'"
  );
  next();
});

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// AUTH-02 & SEC-04: Persistent SQLite session store
const sessionStore = new SQLiteSessionStore();
app.use(session({
  store: sessionStore,
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  },
}));

// OPS-01: Health check endpoints
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/ready', (req, res) => {
  try {
    const row = db.prepare('SELECT 1 as alive').get();
    if (row && row.alive === 1) {
      return res.json({ status: 'ready', database: 'connected' });
    }
    return res.status(503).json({ status: 'not ready', database: 'query failed' });
  } catch (err) {
    return res.status(503).json({ status: 'error', error: err.message });
  }
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/docentes', docentesRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/reset', resetRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/estudiantes', estudiantesRoutes);

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Ruta no encontrada' });
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Graceful server startup
let server = null;
initDb().then(() => {
  server = app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error('Error al inicializar la base de datos:', err);
  process.exit(1);
});

module.exports = app;
