import source from './data-source';
import { assertLocalDatabase } from './local-guard';
async function main() {
  assertLocalDatabase();
  await source.initialize();
  try {
    console.table(await source.query("SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public'"));
    console.log('Applied migrations:', (await source.runMigrations({ transaction: 'all' })).map(migration => migration.name));
  } finally { await source.destroy(); }
}
void main().catch(() => { console.error('Migration failed; inspect configuration and schema before retrying.'); process.exitCode = 1; });
