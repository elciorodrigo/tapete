import type { Pool } from "pg";
import { calcularOrcamento, formatarBRL, formatarCep, type Catalogo, type Unidade } from "@tapete/core";
import type { PedidoFluxo } from "./telas.js";

export async function gravarPedido(
  pool: Pool,
  pedido: PedidoFluxo,
  catalogo: Catalogo,
  versaoId: number,
  waId: string,
): Promise<{ id: number; number: string; total: string }> {
  const unidade = catalogo.unidades.find((u) => u.id === pedido.unidadeId) as Unidade;
  const orc = calcularOrcamento(
    pedido.itens.map((item) =>
      item.formato === "redondo"
        ? { tipo: item.tipo, medidas: { formato: "redondo" as const, diametro: item.diametro ?? 0 }, adicionais: item.adicionais }
        : {
            tipo: item.tipo,
            medidas: { formato: "retangular" as const, largura: item.largura ?? 0, comprimento: item.comprimento ?? 0 },
            adicionais: item.adicionais,
          },
    ),
    unidade,
    pedido.modalidade,
  );

  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query<{ id: string; number: string }>(
      `insert into quotes (
         wa_id, customer_name, unit_id, modality, address, period, payment_method,
         items, subtotal_cents, delivery_fee_cents, minimum_adjust_cents, total_cents,
         catalog_version_id, terms_version, terms_url, terms_accepted_at
       ) values (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11, $12,
         $13, $14, $15, now()
       ) returning id, number`,
      [
        waId,
        pedido.nome,
        pedido.unidadeId,
        pedido.modalidade,
        pedido.endereco
          ? { cep: formatarCep(pedido.cep), ...pedido.endereco }
          : { cep: formatarCep(pedido.cep), loja: unidade.endereco_loja },
        pedido.periodo,
        pedido.pagamento,
        orc.itens,
        orc.subtotal,
        orc.taxa_coleta,
        orc.ajuste_minimo,
        orc.total,
        versaoId,
        catalogo.termos_versao,
        catalogo.termos_url,
      ],
    );
    const gravado = rows[0]!;
    await client.query(
      `insert into order_events (quote_id, to_status, notify, message)
       values ($1, 'NOVO', false, 'Pedido criado no WhatsApp Flow')`,
      [gravado.id],
    );
    await client.query("commit");
    return { id: Number(gravado.id), number: gravado.number, total: formatarBRL(orc.total) };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
