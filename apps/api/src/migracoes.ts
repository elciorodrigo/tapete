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
  {
    id: "002_catalogo",
    sql: `
      create table catalog_versions (
        id          bigserial primary key,
        data        jsonb not null,
        created_by  bigint references admin_users(id) on delete set null,
        created_at  timestamptz not null default now()
      );
    `,
  },
  {
    id: "003_pedidos_whatsapp",
    sql: `
      create table contacts (
        wa_id            text primary key,
        profile_name     text,
        last_inbound_at  timestamptz,
        created_at       timestamptz not null default now(),
        updated_at       timestamptz not null default now()
      );

      create table inbound_messages (
        wamid       text primary key,
        wa_id       text not null,
        type        text not null,
        created_at  timestamptz not null default now()
      );

      create table quotes (
        id                    bigserial primary key,
        number                text generated always as ('TP-' || lpad(id::text, 6, '0')) stored unique,
        channel               text not null default 'WHATSAPP',
        wa_id                 text not null,
        customer_name         text not null,
        unit_id               text not null,
        modality              text not null check (modality in ('coleta', 'balcao')),
        address               jsonb,
        period                text,
        payment_method        text,
        items                 jsonb not null,
        subtotal_cents        int not null,
        delivery_fee_cents    int not null,
        minimum_adjust_cents  int not null,
        total_cents           int not null,
        catalog_version_id    bigint references catalog_versions(id),
        terms_version         text not null,
        terms_url             text not null,
        terms_accepted_at     timestamptz not null,
        status                text not null default 'NOVO',
        created_at            timestamptz not null default now(),
        updated_at            timestamptz not null default now()
      );
      create index quotes_status on quotes(status);
      create index quotes_wa_id on quotes(wa_id);

      create table flow_sessions (
        id          bigserial primary key,
        flow_token  text not null unique,
        wa_id       text not null,
        state       jsonb not null default '{"itens": []}',
        quote_id    bigint references quotes(id),
        expires_at  timestamptz not null,
        closed_at   timestamptz,
        created_at  timestamptz not null default now(),
        updated_at  timestamptz not null default now()
      );

      create table order_events (
        id           bigserial primary key,
        quote_id     bigint not null references quotes(id) on delete cascade,
        from_status  text,
        to_status    text not null,
        user_id      bigint references admin_users(id) on delete set null,
        notify       boolean not null default false,
        message      text,
        created_at   timestamptz not null default now()
      );
      create index order_events_quote_id on order_events(quote_id);

      create table outbound_messages (
        id          bigserial primary key,
        quote_id    bigint references quotes(id) on delete set null,
        wa_id       text not null,
        kind        text not null check (kind in ('text', 'template', 'interactive')),
        content     jsonb not null,
        wamid       text unique,
        status      text not null check (status in ('sent', 'delivered', 'read', 'failed')),
        error       text,
        created_at  timestamptz not null default now(),
        updated_at  timestamptz not null default now()
      );
      create index outbound_messages_quote_id on outbound_messages(quote_id);
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
