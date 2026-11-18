import type { Pool } from "pg";
import { normalizarTelefone } from "./whatsapp/cliente.js";

/** Grava o contato do WhatsApp. O nome do perfil substitui o que já estava; nome vazio não apaga. */
export async function salvarCliente(pool: Pool, waId: string, nome: string | null): Promise<number | null> {
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
  const clienteId = await salvarCliente(pool, waId, nome);
  const telefone = normalizarTelefone(waId);
  if (!clienteId || !telefone) return;
  await pool.query("update quotes set wa_id = $2, cliente_id = $3, updated_at = now() where id = $1", [pedidoId, telefone, clienteId]);
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
