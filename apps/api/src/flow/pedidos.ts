import type { Pool } from "pg";
import { ErroOrcamento, calcularOrcamento, formatarBRL, formatarCep, type Catalogo } from "@tapete/core";
import { criarClienteDoPedido } from "../clientes.js";
import type { EstadoFluxo, PedidoFluxo } from "./telas.js";

export async function gravarPedido(
  pool: Pool,
  pedido: PedidoFluxo,
  catalogo: Catalogo,
  versaoId: number,
  waId: string,
  sessao: { flowToken: string; estado: EstadoFluxo },
): Promise<{ id: number; number: string; total: string; totalCents: number }> {
  const unidade = catalogo.unidades.find((u) => u.id === pedido.unidadeId);
  if (!unidade) throw new ErroOrcamento("A unidade deste orçamento não está mais cadastrada.");
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
         $1, $2, $3, $4, $5::jsonb, $6, $7,
         $8::jsonb, $9, $10, $11, $12,
         $13, $14, $15, now()
       ) returning id, number`,
      [
        waId,
        pedido.nome,
        pedido.unidadeId,
        pedido.modalidade,
        JSON.stringify(
          pedido.endereco
            ? { cep: formatarCep(pedido.cep), ...pedido.endereco }
            : { cep: formatarCep(pedido.cep), loja: unidade.endereco_loja },
        ),
        pedido.periodo,
        pedido.pagamento,
        JSON.stringify(orc.itens),
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
    const clienteId = await criarClienteDoPedido(client, waId, pedido.nome);
    await client.query("update quotes set cliente_id = $2 where id = $1", [gravado.id, clienteId]);
    await client.query(
      `insert into order_events (quote_id, to_status, notify, message)
       values ($1, 'NOVO', false, 'Pedido criado no WhatsApp Flow')`,
      [gravado.id],
    );
    const estado: EstadoFluxo = { ...sessao.estado, pedidoNumero: gravado.number, pagamento: pedido.pagamento };
    await client.query(
      `update flow_sessions
          set state = $3::jsonb, quote_id = $2, closed_at = now(), updated_at = now()
        where flow_token = $1`,
      [sessao.flowToken, gravado.id, JSON.stringify(estado)],
    );
    await client.query("commit");
    return { id: Number(gravado.id), number: gravado.number, total: formatarBRL(orc.total), totalCents: orc.total };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
