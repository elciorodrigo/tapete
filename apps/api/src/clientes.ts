import type { Pool, PoolClient } from "pg";
import { normalizarTelefone } from "./whatsapp/cliente.js";

type Db = Pool | PoolClient;

/** Cliente do pedido. Com telefone, reaproveita o cadastro. Sem telefone, abre uma ficha nova. */
export async function criarClienteDoPedido(db: Db, waId: string, nome: string): Promise<number> {
  const telefone = normalizarTelefone(waId);
  const pessoa = nome.trim() || "Cliente";
  if (telefone) {
    const { rows } = await db.query<{ id: string }>(
      `insert into clientes (wa_id, nome) values ($1, $2)
       on conflict (wa_id) do update
         set nome = coalesce(nullif(excluded.nome, ''), clientes.nome),
             updated_at = now()
       returning id`,
      [telefone, pessoa],
    );
    return Number(rows[0]!.id);
  }
  const { rows } = await db.query<{ id: string }>(`insert into clientes (nome) values ($1) returning id`, [pessoa]);
  return Number(rows[0]!.id);
}

/** Grava o contato do WhatsApp. O nome do perfil substitui o que já estava; nome vazio não apaga. */
export async function salvarCliente(pool: Db, waId: string, nome: string | null): Promise<number | null> {
  const telefone = normalizarTelefone(waId);
  if (!telefone) return null;
  const { rows } = await pool.query<{ id: string }>(
    `insert into clientes (wa_id, nome)
     values ($1, $2)
     on conflict (wa_id) do update
       set nome = coalesce(nullif(excluded.nome, ''), clientes.nome),
           updated_at = now()
     returning id`,
    [telefone, nome?.trim() || null],
  );
  return Number(rows[0]!.id);
}

export async function vincularPedido(pool: Pool, pedidoId: number, waId: string, nome: string | null): Promise<void> {
  const telefone = normalizarTelefone(waId);
  if (!telefone) return;
  const pedido = await pool.query<{ cliente_id: string | null }>("select cliente_id from quotes where id = $1", [pedidoId]);
  if (!pedido.rows[0]) return;
  const atual = pedido.rows[0].cliente_id == null ? null : Number(pedido.rows[0].cliente_id);
  const dono = await pool.query<{ id: string }>("select id from clientes where wa_id = $1", [telefone]);
  const existente = dono.rows[0] ? Number(dono.rows[0].id) : null;
  const pessoa = nome?.trim() || "";

  let clienteId = existente;
  if (existente && atual && existente !== atual) {
    clienteId = existente;
    if (pessoa) {
      await pool.query("update clientes set nome = $2, updated_at = now() where id = $1", [existente, pessoa]);
    }
  } else if (atual) {
    clienteId = atual;
    await pool.query(
      `update clientes
          set wa_id = $2,
              nome = coalesce(nullif($3, ''), nome),
              updated_at = now()
        where id = $1`,
      [atual, telefone, pessoa],
    );
  } else {
    clienteId = await salvarCliente(pool, telefone, pessoa || null);
  }
  if (!clienteId) return;

  await pool.query("update quotes set wa_id = $2, cliente_id = $3, updated_at = now() where id = $1", [pedidoId, telefone, clienteId]);
  if (atual && atual !== clienteId) {
    await pool.query("delete from clientes c where c.id = $1 and not exists (select 1 from quotes q where q.cliente_id = c.id)", [atual]);
  }
  await pool.query(
    `update flow_sessions set wa_id = $2, updated_at = now()
      where quote_id = $1 and wa_id = 'preview'`,
    [pedidoId, telefone],
  );
}

/** Se só existe um pedido recente sem telefone, este contato é quem fez o orçamento. */
export async function vincularPedidoSemTelefone(pool: Pool, waId: string, nome: string | null): Promise<number | null> {
  const { rows } = await pool.query<{ id: string }>(
    `select id from quotes
      where wa_id = 'preview' and cliente_id is null
        and created_at > now() - interval '6 hours'
      order by id desc
      limit 2`,
  );
  if (rows.length !== 1) return null;
  const id = Number(rows[0]!.id);
  await vincularPedido(pool, id, waId, nome);
  return id;
}
