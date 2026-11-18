import type { Pool } from "pg";
import { formatarBRL, type StatusPedido } from "@tapete/core";
import { normalizarTelefone, type WhatsApp } from "./cliente.js";

export const CHAVES_MENSAGEM = ["confirmacao", "coleta", "lavagem", "secagem", "rota"] as const;
export type ChaveMensagem = (typeof CHAVES_MENSAGEM)[number];

export const ROTULO_MENSAGEM: Record<ChaveMensagem, string> = {
  confirmacao: "Confirmação do orçamento",
  coleta: "Selecionado para coleta",
  lavagem: "Entrou em lavagem",
  secagem: "Entrou em secagem",
  rota: "Em rota de entrega",
};

const CHAVE_POR_STATUS: Partial<Record<StatusPedido, ChaveMensagem>> = {
  COLETA_AGENDADA: "coleta",
  EM_LAVAGEM: "lavagem",
  EM_SECAGEM: "secagem",
  EM_ROTA: "rota",
};

export function chaveDaEtapa(status: string): ChaveMensagem | null {
  return CHAVE_POR_STATUS[status as StatusPedido] ?? null;
}

export function aplicarMensagem(body: string, campos: { numero: string; total?: string }): string {
  return body.replaceAll("{numero}", campos.numero).replaceAll("{total}", campos.total ?? "");
}

export async function listarMensagens(pool: Pool): Promise<Record<ChaveMensagem, string>> {
  const { rows } = await pool.query<{ key: string; body: string }>("select key, body from message_templates");
  const salvas = new Map(rows.map((r) => [r.key, r.body]));
  const texto = (chave: ChaveMensagem) => salvas.get(chave) ?? "";
  return {
    confirmacao: texto("confirmacao"),
    coleta: texto("coleta"),
    lavagem: texto("lavagem"),
    secagem: texto("secagem"),
    rota: texto("rota"),
  };
}

export async function salvarMensagens(pool: Pool, entrada: Record<string, unknown>): Promise<Record<ChaveMensagem, string>> {
  for (const chave of CHAVES_MENSAGEM) {
    const body = typeof entrada[chave] === "string" ? entrada[chave].trim() : "";
    if (!body || body.length > 1000) throw new Error(`A mensagem de ${ROTULO_MENSAGEM[chave]} precisa ter texto.`);
    await pool.query(
      `insert into message_templates (key, body) values ($1, $2)
       on conflict (key) do update set body = excluded.body, updated_at = now()`,
      [chave, body],
    );
  }
  return listarMensagens(pool);
}

async function textoDaEtapa(pool: Pool, status: string, numero: string): Promise<string | null> {
  const chave = chaveDaEtapa(status);
  if (!chave) return null;
  const mensagens = await listarMensagens(pool);
  const texto = mensagens[chave].trim();
  return texto ? aplicarMensagem(texto, { numero }) : null;
}

type PedidoAviso = {
  id: number;
  number: string;
  waId: string;
  modality: string;
  totalCents: number;
};

async function reservarConfirmacao(pool: Pool, id: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    "update quotes set confirmation_sent_at = now() where id = $1 and confirmation_sent_at is null",
    [id],
  );
  return rowCount === 1;
}

export async function confirmarPedido(pool: Pool, whatsapp: WhatsApp, pedido: PedidoAviso): Promise<string | null> {
  const telefone = normalizarTelefone(pedido.waId);
  if (!telefone) return null;
  const mensagens = await listarMensagens(pool);
  const texto = aplicarMensagem(mensagens.confirmacao.trim(), {
    numero: pedido.number,
    total: formatarBRL(pedido.totalCents),
  });
  if (!texto) return "Cadastre a mensagem de confirmação no painel.";
  if (!(await reservarConfirmacao(pool, pedido.id))) return null;
  const resultado = await whatsapp.enviarTexto(telefone, texto, pedido.id);
  if (!resultado.ok) {
    await pool.query("update quotes set confirmation_sent_at = null where id = $1", [pedido.id]);
    return resultado.erro;
  }
  return null;
}

export async function avisarEtapa(pool: Pool, whatsapp: WhatsApp, pedido: PedidoAviso, status: string): Promise<string | null> {
  if (!chaveDaEtapa(status)) return null;
  const texto = await textoDaEtapa(pool, status, pedido.number);
  if (!texto) return "Cadastre a mensagem desta etapa no painel.";
  const telefone = normalizarTelefone(pedido.waId);
  if (!telefone) return "Pedido sem número de WhatsApp. A etapa foi salva, mas a mensagem não foi enviada.";
  const resultado = await whatsapp.enviarTexto(telefone, texto, pedido.id);
  return resultado.ok ? null : resultado.erro;
}
