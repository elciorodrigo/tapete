import type { Pool } from "pg";
import { formatarBRL } from "@tapete/core";
import { lerConfiguracao } from "../configuracoes.js";
import { normalizarTelefone, type WhatsApp } from "./cliente.js";

export function aplicarMensagem(body: string, campos: { numero: string; total?: string }): string {
  return body.replaceAll("{numero}", campos.numero).replaceAll("{total}", campos.total ?? "");
}

export async function lerConfirmacao(pool: Pool): Promise<string> {
  return (await lerConfiguracao(pool, "confirmacao")).trim();
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
  const texto = aplicarMensagem((await lerConfirmacao(pool)).trim(), {
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

export async function avisarEtapa(pool: Pool, whatsapp: WhatsApp, pedido: PedidoAviso, mensagem: string): Promise<string | null> {
  const texto = aplicarMensagem(mensagem.trim(), { numero: pedido.number, total: formatarBRL(pedido.totalCents) });
  if (!texto) return null;
  const telefone = normalizarTelefone(pedido.waId);
  if (!telefone) return "Pedido sem número de WhatsApp. A etapa foi salva, mas a mensagem não foi enviada.";
  const resultado = await whatsapp.enviarTexto(telefone, texto, pedido.id);
  return resultado.ok ? null : resultado.erro;
}
