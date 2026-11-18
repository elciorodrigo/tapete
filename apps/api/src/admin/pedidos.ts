import type { FastifyInstance } from "fastify";
import { pool } from "../db.js";
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
  app.addHook("onRequest", exigirSessao);

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
