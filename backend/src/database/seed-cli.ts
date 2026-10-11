import { assertLocalDatabase } from './local-guard';
import source from './data-source';
import { seedDatabase } from './seed';
async function main() {
  assertLocalDatabase();
  await source.initialize();
  try { console.table(await seedDatabase(source)); }
  finally { await source.destroy(); }
}
void main().catch(() => { console.error('Seed failed; check database configuration and SEED_* environment variables.'); process.exitCode = 1; });
