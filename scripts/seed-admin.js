// Script to seed admin user securely into the database
// Run ONLY when server is stopped: npm run seed:admin
const path = require('path');

const proyectoDir = path.resolve(__dirname, '..', 'proyecto');
require(path.join(proyectoDir, 'node_modules', 'dotenv')).config({ path: path.join(proyectoDir, '.env') });
const { initDb } = require(path.join(proyectoDir, 'server', 'db'));

const adminEmail = process.env.ADMIN_EMAIL || 'admin@universidad.cl';

async function main() {
  await initDb();
  console.log(`[seed-admin] Base de datos inicializada y usuario admin verificado: ${adminEmail}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed-admin] Error fatal:', err);
  process.exit(1);
});
