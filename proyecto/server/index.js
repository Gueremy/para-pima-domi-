require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const { initDb } = require('./db');

const authRoutes = require('./routes/auth');
const docentesRoutes = require('./routes/docentes');
const ticketsRoutes = require('./routes/tickets');
const resetRoutes = require('./routes/reset');
const adminRoutes = require('./routes/admin');
const estudiantesRoutes = require('./routes/estudiantes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
  },
}));

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

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error('Error al inicializar la base de datos:', err);
  process.exit(1);
});

module.exports = app;
