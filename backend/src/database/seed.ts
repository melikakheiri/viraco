import { DataSource, EntityManager } from 'typeorm';
import { hash } from 'bcryptjs';
import { User, UserRole } from './entities/user.entity';

export interface SeedAccount { email: string; password: string; role: UserRole }
export function seedAccounts(env: NodeJS.ProcessEnv = process.env): SeedAccount[] {
  if (env.NODE_ENV === 'production') throw new Error('Development seed is disabled in production');
  return Object.values(UserRole).map(role => {
    const email = env[`SEED_${role}_EMAIL`]?.trim().toLowerCase();
    const password = env[`SEED_${role}_PASSWORD`];
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error(`Invalid SEED_${role}_EMAIL`);
    if (!password || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) throw new Error(`SEED_${role}_PASSWORD must be 12+ characters and at most 72 UTF-8 bytes`);
    return { email, password, role };
  });
}
export async function seedUsers(manager: EntityManager, accounts: SeedAccount[]) {
  if (new Set(accounts.map(account => account.email)).size !== accounts.length) throw new Error('Seed emails must be distinct');
  const results: { email: string; role: UserRole; created: boolean }[] = [];
  for (const account of accounts) {
    const existing = await manager.findOneBy(User, { email: account.email });
    if (existing) {
      results.push({ email: existing.email, role: existing.role, created: false });
      continue;
    }
    const result = await manager.createQueryBuilder().insert().into(User).values({
      email: account.email, passwordHash: await hash(account.password, 12), role: account.role, isActive: true,
    }).onConflict('("email") DO NOTHING').returning('id').execute();
    const saved = await manager.findOneByOrFail(User, { email: account.email });
    results.push({ email: saved.email, role: saved.role, created: (result.raw as unknown[]).length > 0 });
  }
  return results;
}
export async function seedDatabase(source: DataSource) {
  const accounts = seedAccounts();
  return source.transaction(manager => seedUsers(manager, accounts));
}
