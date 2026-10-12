import source from './data-source';
export function assertTestDatabase() {
  if (process.env.TEST_DATABASE !== 'true' || source.options.type !== 'postgres' || !['localhost', '127.0.0.1', '::1'].includes(String(source.options.host)) || source.options.port === 5433 || !/^taskboard_test_[a-z0-9_]+$/.test(String(source.options.database))) {
    throw new Error('Tests require TEST_DATABASE=true and a disposable local taskboard_test_* database outside development port 5433');
  }
}
export function assertLocalDatabase() {
  if (process.env.TEST_DATABASE === 'true') return assertTestDatabase();
  if (source.options.type !== 'postgres' || !['localhost', '127.0.0.1', '::1'].includes(String(source.options.host)) || source.options.port !== 5433 || source.options.database !== 'taskboard') {
    throw new Error('This command only permits local taskboard PostgreSQL on port 5433');
  }
}
