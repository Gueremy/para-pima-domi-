// Script to seed complete synthetic demo dataset for portfolio presentations
// Run ONLY when server is stopped: npm run seed:demo
const path = require('path');

const proyectoDir = path.resolve(__dirname, '..', 'proyecto');
require(path.join(proyectoDir, 'node_modules', 'dotenv')).config({ path: path.join(proyectoDir, '.env') });
const { initDb } = require(path.join(proyectoDir, 'server', 'db'));

async function main() {
  await initDb();
  console.log('[seed-demo] Datos de demostración y cuentas QA listas y persistidas.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed-demo] Error fatal:', err);
  process.exit(1);
});
