import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from './config';

export const sql = postgres(config.DATABASE_URL, {
  max: config.DATABASE_POOL_MAX,
  prepare: false,
  ssl: config.DATABASE_SSL === 'require' ? 'require' : false,
  idle_timeout: 20,
  connect_timeout: 10,
  // Per-request actor context must be set transaction-locally by authenticated routes.
  onnotice: () => {},
});

export const db = drizzle(sql);

export async function closeDatabase() {
  await sql.end({ timeout: 5 });
}

export async function asActor<T>(actorId: string | null, action: (tx: any) => Promise<T>) {
  return sql.begin(async (tx) => {
    await tx`select set_config('app.actor_id', ${actorId ?? ''}, true)`;
    return action(tx);
  });
}

export async function asConfiguredOwner<T>(action: (tx: any, actorId: string) => Promise<T>) {
  return sql.begin(async (tx) => {
    const [owner] = await tx`select id from app.users where auth_subject=${config.OWNER_AUTH_SUBJECT} and is_owner and disabled_at is null`;
    if (!owner) throw new Error('Owner belum diprovision.');
    await tx`select set_config('app.actor_id', ${owner.id}, true)`;
    return action(tx, owner.id as string);
  });
}
