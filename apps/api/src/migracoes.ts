import type { Pool } from "pg";

const MIGRACOES: { id: string; sql: string }[] = [
  {
    id: "001_admin",
    sql: `
      create table admin_users (
        id              bigserial primary key,
        name            text not null,
        email           text not null unique,
        password_hash   text not null,
        role            text not null default 'atendente' check (role in ('admin', 'atendente')),
        active          boolean not null default true,
        failed_attempts int not null default 0,
        locked_until    timestamptz,
        last_login_at   timestamptz,
        created_at      timestamptz not null default now()
      );

      create table admin_sessions (
        token_hash  text primary key,
        user_id     bigint not null references admin_users(id) on delete cascade,
        expires_at  timestamptz not null,
        ip          text,
        user_agent  text,
        created_at  timestamptz not null default now()
      );
      create index admin_sessions_user_id on admin_sessions(user_id);
    `,
  },
];

export async function migrar(pool: Pool): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock(727001)");
    await client.query(
      "create table if not exists schema_migrations (id text primary key, applied_at timestamptz not null default now())",
    );
    const { rows } = await client.query<{ id: string }>("select id from schema_migrations");
    const aplicadas = new Set(rows.map((r) => r.id));
    const novas: string[] = [];
    for (const m of MIGRACOES) {
      if (aplicadas.has(m.id)) continue;
      await client.query("begin");
      try {
        await client.query(m.sql);
        await client.query("insert into schema_migrations (id) values ($1)", [m.id]);
        await client.query("commit");
        novas.push(m.id);
      } catch (err) {
        await client.query("rollback");
        throw err;
      }
    }
    return novas;
  } finally {
    await client.query("select pg_advisory_unlock(727001)").catch(() => {});
    client.release();
  }
}
