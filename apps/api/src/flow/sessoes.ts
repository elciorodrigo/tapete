import type { Pool } from "pg";
import { estadoInicial, type EstadoFluxo } from "./telas.js";

export class SessaoInvalida extends Error {}

export type Sessao = {
  waId: string;
  estado: EstadoFluxo;
  quoteId: number | null;
};

function estadoDe(valor: unknown): EstadoFluxo {
  if (!valor || typeof valor !== "object" || !Array.isArray((valor as EstadoFluxo).itens)) return estadoInicial();
  return valor as EstadoFluxo;
}

export async function obterOuCriarSessao(pool: Pool, flowToken: string): Promise<Sessao> {
  await pool.query(
    `insert into flow_sessions (flow_token, wa_id, state, expires_at)
     values ($1, 'preview', '{"itens":[]}'::jsonb, now() + interval '7 days')
     on conflict (flow_token) do nothing`,
    [flowToken],
  );
  const { rows } = await pool.query<{ wa_id: string; state: unknown; quote_id: string | null; valida: boolean }>(
    `select wa_id, state, quote_id, expires_at > now() as valida
       from flow_sessions where flow_token = $1`,
    [flowToken],
  );
  const row = rows[0];
  if (!row || !row.valida) throw new SessaoInvalida();
  return { waId: row.wa_id, estado: estadoDe(row.state), quoteId: row.quote_id == null ? null : Number(row.quote_id) };
}

export async function salvarEstado(pool: Pool, flowToken: string, estado: EstadoFluxo): Promise<void> {
  await pool.query("update flow_sessions set state = $2, updated_at = now() where flow_token = $1", [flowToken, estado]);
}

export async function fecharSessao(pool: Pool, flowToken: string, quoteId: number, estado: EstadoFluxo): Promise<void> {
  await pool.query(
    `update flow_sessions
        set state = $3, quote_id = $2, closed_at = now(), updated_at = now()
      where flow_token = $1`,
    [flowToken, quoteId, estado],
  );
}
