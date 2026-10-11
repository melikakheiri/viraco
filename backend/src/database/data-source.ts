import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { resolve } from 'node:path';
import { User } from './entities/user.entity';
import { Task } from './entities/task.entity';
import { RefreshSession } from './entities/refresh-session.entity';
config({ path: resolve(__dirname, '../../.env') });
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
export const entities = [User, Task, RefreshSession];
export default new DataSource({
  type: 'postgres', installExtensions: false, host: required('DATABASE_HOST'), port: Number(required('DATABASE_PORT')),
  username: required('DATABASE_USER'), password: required('DATABASE_PASSWORD'), database: required('DATABASE_NAME'),
  entities, migrations: [resolve(__dirname, 'migrations/*{.ts,.js}')], synchronize: false,
});
