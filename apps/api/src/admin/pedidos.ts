import type { FastifyInstance } from "fastify";
import { catalogo } from "../catalogo.js";
import { pool } from "../db.js";
import { listarEtapas, salvarEtapas } from "../etapas.js";
import { avisarEtapa, lerConfirmacao, salvarConfirmacao } from "../whatsapp/avisos.js";
import { whatsappDaApi } from "../whatsapp/registro.js";
import { exigirSessao } from "./auth.js";

type Linha = {
  id: string;
  number: string;
  customer_name: string;
  contato: string | null;
  wa_id: string;
  modality: string;
  payment_method: string | null;
  status: string;
  etapa_id: string | null;
  etapa_nome: string | null;
  total_cents: number;
  items: unknown;
  address: unknown;
  created_at: Date;
};

const TELEFONE = "coalesce(nullif(q.wa_id, 'preview'), c.wa_id, q.wa_id)";

function textoEndereco(address: unknown): string {
  if (!address || typeof address !== "object") return "";
  const a = address as Record<string, unknown>;
  if (typeof a.loja === "string" && a.loja) return a.loja;
  return [a.logradouro, a.numero, a.bairro, a.cidade, a.uf, a.cep]
    .filter((parte): parte is string => typeof parte === "string" && parte.length > 0)
    .join(", ");
}

function medidaTexto(medidas: { formato?: string; largura?: number; comprimento?: number; diametro?: number } | undefined): string {
  const n = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  if (medidas?.formato === "redondo" && typeof medidas.diametro === "number") return `Redondo, Ø ${n(medidas.diametro)} m`;
  if (typeof medidas?.largura === "number" && typeof medidas.comprimento === "number") {
    return `Retangular, ${n(medidas.largura)} × ${n(medidas.comprimento)} m`;
  }
  return "";
}

function itensDetalhe(items: unknown): { nome: string; medidas: string; adicionais: string; valor_cents: number }[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const i = item as {
      tipo_nome?: string;
      valor?: number;
      adicionais_nomes?: string[];
      medidas?: { formato?: string; largura?: number; comprimento?: number; diametro?: number };
    };
    return [
      {
        nome: i.tipo_nome || "Tapete",
        medidas: medidaTexto(i.medidas),
        adicionais: Array.isArray(i.adicionais_nomes) ? i.adicionais_nomes.join(", ") : "",
        valor_cents: typeof i.valor === "number" ? i.valor : 0,
      },
    ];
  });
}

function resumoItens(items: unknown): string {
  if (!Array.isArray(items)) return "";
  return items
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const i = item as {
        tipo_nome?: string;
        medidas?: { formato?: string; largura?: number; comprimento?: number; diametro?: number };
      };
      const nome = i.tipo_nome || "Tapete";
      const m = i.medidas;
      if (m?.formato === "redondo" && typeof m.diametro === "number") return `${nome} Ø ${m.diametro} m`;
      if (typeof m?.largura === "number" && typeof m.comprimento === "number") return `${nome} ${m.largura} × ${m.comprimento} m`;
      return nome;
    })
    .filter(Boolean)
    .join("; ");
}

export async function rotasPedidos(app: FastifyInstance): Promise<void> {
  const whatsapp = whatsappDaApi(app.log);
  app.addHook("onRequest", exigirSessao);

  app.get("/admin/api/configuracoes", async () => ({
    confirmacao: await lerConfirmacao(pool),
    etapas: await listarEtapas(pool),
  }));

  app.put<{ Body: { confirmacao?: unknown; etapas?: unknown } }>("/admin/api/configuracoes", async (req, reply) => {
    if (req.usuario!.role !== "admin") return reply.code(403).send({ erro: "só administradores alteram as configurações" });
    try {
      const confirmacao = await salvarConfirmacao(pool, String(req.body?.confirmacao ?? ""));
      const etapas = await salvarEtapas(pool, req.body?.etapas);
      return { confirmacao, etapas };
    } catch (err) {
      return reply.code(400).send({ erro: err instanceof Error ? err.message : "Configuração inválida" });
    }
  });

  app.patch<{ Params: { id: string }; Body: { etapa_id?: number; cancelar?: boolean } }>("/admin/api/pedidos/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ erro: "Pedido inválido" });

    const atual = await pool.query<{ status: string; number: string; wa_id: string; modality: string; total_cents: number }>(
      `select q.status, q.number, ${TELEFONE} as wa_id, q.modality, q.total_cents
         from quotes q
         left join clientes c on c.id = q.cliente_id
        where q.id = $1`,
      [id],
    );
    const pedido = atual.rows[0];
    if (!pedido) return reply.code(404).send({ erro: "Pedido não encontrado" });

    if (req.body?.cancelar) {
      await pool.query("update quotes set status = 'CANCELADO', updated_at = now() where id = $1", [id]);
      await pool.query(
        `insert into order_events (quote_id, from_status, to_status, user_id, notify, message)
         values ($1, $2, 'CANCELADO', $3, false, 'Cancelado')`,
        [id, pedido.status, req.usuario!.id],
      );
      return { etapa_id: null, etapa: "Cancelado", cancelado: true, aviso: null };
    }

    const etapaId = req.body?.etapa_id;
    if (!Number.isInteger(etapaId)) return reply.code(400).send({ erro: "Escolha uma etapa" });
    const etapa = (await listarEtapas(pool)).find((e) => e.id === etapaId);
    if (!etapa) return reply.code(400).send({ erro: "Essa etapa não existe mais" });

    await pool.query("update quotes set etapa_id = $2, status = $3, updated_at = now() where id = $1", [id, etapa.id, etapa.nome]);
    await pool.query(
      `insert into order_events (quote_id, from_status, to_status, user_id, notify, message)
       values ($1, $2, $3, $4, true, $3)`,
      [id, pedido.status, etapa.nome, req.usuario!.id],
    );

    const aviso = await avisarEtapa(
      pool,
      whatsapp,
      { id, number: pedido.number, waId: pedido.wa_id, modality: pedido.modality, totalCents: pedido.total_cents },
      etapa.mensagem,
    );
    return { etapa_id: etapa.id, etapa: etapa.nome, cancelado: false, aviso };
  });

  app.get<{ Params: { id: string } }>("/admin/api/pedidos/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ erro: "Pedido inválido" });
    const { rows } = await pool.query<
      Linha & { unit_id: string; period: string | null; subtotal_cents: number; delivery_fee_cents: number; minimum_adjust_cents: number }
    >(
      `select q.id, q.number, q.customer_name, c.nome as contato, ${TELEFONE} as wa_id, q.unit_id, q.modality,
              q.address, q.period, q.payment_method, q.items, q.subtotal_cents, q.delivery_fee_cents,
              q.minimum_adjust_cents, q.total_cents, q.status, q.etapa_id, e.nome as etapa_nome, q.created_at
         from quotes q
         left join clientes c on c.id = q.cliente_id
         left join etapas e on e.id = q.etapa_id
        where q.id = $1`,
      [id],
    );
    const pedido = rows[0];
    if (!pedido) return reply.code(404).send({ erro: "Pedido não encontrado" });
    const eventos = await pool.query<{ from_status: string | null; to_status: string; created_at: Date; nome: string | null }>(
      `select e.from_status, e.to_status, e.created_at, u.name as nome
         from order_events e
         left join admin_users u on u.id = e.user_id
        where e.quote_id = $1
        order by e.id`,
      [id],
    );
    const unidade = catalogo().unidades.find((u) => u.id === pedido.unit_id);
    return {
      id: Number(pedido.id),
      numero: pedido.number,
      cliente: pedido.customer_name,
      contato: pedido.contato,
      telefone: pedido.wa_id,
      unidade: unidade?.nome ?? pedido.unit_id,
      modalidade: pedido.modality,
      periodo: pedido.period,
      pagamento: pedido.payment_method,
      endereco: textoEndereco(pedido.address),
      itens: itensDetalhe(pedido.items),
      subtotal_cents: pedido.subtotal_cents,
      taxa_cents: pedido.delivery_fee_cents,
      ajuste_cents: pedido.minimum_adjust_cents,
      total_cents: pedido.total_cents,
      etapa_id: pedido.etapa_id == null ? null : Number(pedido.etapa_id),
      etapa: pedido.status === "CANCELADO" ? "Cancelado" : pedido.etapa_nome || "Novo",
      cancelado: pedido.status === "CANCELADO",
      etapas: await listarEtapas(pool),
      criado_em: pedido.created_at.toISOString(),
      eventos: eventos.rows.map((e) => ({
        de: e.from_status,
        para: e.to_status,
        em: e.created_at.toISOString(),
        por: e.nome,
      })),
    };
  });

  app.get("/admin/api/pedidos", async () => {
    const { rows } = await pool.query<Linha>(
      `select q.id, q.number, q.customer_name, c.nome as contato, ${TELEFONE} as wa_id, q.modality,
              q.payment_method, q.status, q.etapa_id, e.nome as etapa_nome, q.total_cents, q.items, q.address, q.created_at
         from quotes q
         left join clientes c on c.id = q.cliente_id
         left join etapas e on e.id = q.etapa_id
        order by q.id desc
        limit 100`,
    );
    return {
      pedidos: rows.map((r) => ({
        id: Number(r.id),
        numero: r.number,
        cliente: r.customer_name,
        contato: r.contato,
        telefone: r.wa_id,
        modalidade: r.modality,
        pagamento: r.payment_method,
        etapa_id: r.etapa_id == null ? null : Number(r.etapa_id),
        etapa: r.status === "CANCELADO" ? "Cancelado" : r.etapa_nome || "Novo",
        cancelado: r.status === "CANCELADO",
        total_cents: r.total_cents,
        criado_em: r.created_at.toISOString(),
        resumo: resumoItens(r.items),
        endereco: textoEndereco(r.address),
      })),
    };
  });
}
