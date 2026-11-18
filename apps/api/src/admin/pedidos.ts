import type { FastifyInstance } from "fastify";
import { ehStatus, podeMudarStatus } from "@tapete/core";
import { catalogo } from "../catalogo.js";
import { pool } from "../db.js";
import { avisarEtapa, listarMensagens, salvarMensagens } from "../whatsapp/avisos.js";
import { whatsappDaApi } from "../whatsapp/registro.js";
import { exigirSessao } from "./auth.js";

type Linha = {
  id: string;
  number: string;
  customer_name: string;
  wa_id: string;
  modality: string;
  payment_method: string | null;
  status: string;
  total_cents: number;
  items: unknown;
  address: unknown;
  created_at: Date;
};

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

  app.get("/admin/api/mensagens", async () => ({ mensagens: await listarMensagens(pool) }));

  app.put<{ Body: Record<string, unknown> }>("/admin/api/mensagens", async (req, reply) => {
    if (req.usuario!.role !== "admin") return reply.code(403).send({ erro: "só administradores alteram as mensagens" });
    try {
      return { mensagens: await salvarMensagens(pool, req.body ?? {}) };
    } catch (err) {
      return reply.code(400).send({ erro: err instanceof Error ? err.message : "Mensagem inválida" });
    }
  });

  app.patch<{ Params: { id: string }; Body: { status?: string } }>("/admin/api/pedidos/:id", async (req, reply) => {
    const id = Number(req.params.id);
    const destino = req.body?.status;
    if (!Number.isInteger(id) || !ehStatus(destino)) return reply.code(400).send({ erro: "Etapa inválida" });

    const atual = await pool.query<{ status: string; number: string; wa_id: string; modality: string; total_cents: number }>(
      "select status, number, wa_id, modality, total_cents from quotes where id = $1",
      [id],
    );
    const pedido = atual.rows[0];
    if (!pedido) return reply.code(404).send({ erro: "Pedido não encontrado" });
    if (!ehStatus(pedido.status) || !podeMudarStatus(pedido.status, destino)) {
      return reply.code(409).send({ erro: "Essa etapa não é a próxima deste pedido" });
    }

    const { rowCount } = await pool.query(
      "update quotes set status = $2, updated_at = now() where id = $1 and status = $3",
      [id, destino, pedido.status],
    );
    if (rowCount !== 1) return reply.code(409).send({ erro: "O pedido mudou. Atualize a lista." });

    await pool.query(
      `insert into order_events (quote_id, from_status, to_status, user_id, notify, message)
       values ($1, $2, $3, $4, true, $5)`,
      [id, pedido.status, destino, req.usuario!.id, destino],
    );

    const aviso = await avisarEtapa(
      pool,
      whatsapp,
      { id, number: pedido.number, waId: pedido.wa_id, modality: pedido.modality, totalCents: pedido.total_cents },
      destino,
    );
    return { status: destino, aviso };
  });

  app.get<{ Params: { id: string } }>("/admin/api/pedidos/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ erro: "Pedido inválido" });
    const { rows } = await pool.query<Linha & { unit_id: string; period: string | null; subtotal_cents: number; delivery_fee_cents: number; minimum_adjust_cents: number }>(
      `select id, number, customer_name, wa_id, unit_id, modality, address, period, payment_method,
              items, subtotal_cents, delivery_fee_cents, minimum_adjust_cents, total_cents, status, created_at
         from quotes where id = $1`,
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
      status: pedido.status,
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
      `select id, number, customer_name, wa_id, modality, payment_method, status,
              total_cents, items, address, created_at
         from quotes
        order by id desc
        limit 100`,
    );
    return {
      pedidos: rows.map((r) => ({
        id: Number(r.id),
        numero: r.number,
        cliente: r.customer_name,
        telefone: r.wa_id,
        modalidade: r.modality,
        pagamento: r.payment_method,
        status: r.status,
        total_cents: r.total_cents,
        criado_em: r.created_at.toISOString(),
        resumo: resumoItens(r.items),
        endereco: textoEndereco(r.address),
      })),
    };
  });
}
