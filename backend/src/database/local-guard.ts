import source from './data-source';
export function assertLocalDatabase() {
  if (source.options.type !== 'postgres' || !['localhost', '127.0.0.1', '::1'].includes(String(source.options.host)) || source.options.port !== 5433 || source.options.database !== 'taskboard') {
    throw new Error('This command only permits local taskboard PostgreSQL on port 5433');
  }
}
