import type { FastifyInstance } from "fastify";
import { z, ZodError } from "zod";
import { ErroOrcamento, calcularOrcamento, type Modalidade } from "@tapete/core";
import { catalogo, catalogoComVersao, salvarCatalogo } from "../catalogo.js";
import { exigirSessao } from "./auth.js";

z.config(z.locales.pt());

const CAMPOS: Record<string, string> = {
  marca: "Nome da marca",
  termos_url: "Link dos termos",
  nome: "Nome",
  endereco_loja: "Endereço da loja",
  taxa_coleta: "Taxa de coleta",
  pedido_minimo: "Pedido mínimo",
  area_minima_m2: "Área mínima",
  arredondamento_m: "Arredondamento",
  preco_m2: "Preço por m²",
  ceps: "Faixas de CEP",
  tipos: "Tipos de tapete",
  adicionais: "Adicionais",
};

function caminho(path: PropertyKey[]): string {
  const partes: string[] = [];
  for (let i = 0; i < path.length; i++) {
    const p = String(path[i]);
    const prox = path[i + 1];
    if (p === "unidades" && typeof prox === "number") partes.push(`Unidade ${prox + 1}`), i++;
    else if (p === "tipos" && typeof prox === "number") partes.push(`Tipo ${prox + 1}`), i++;
    else if (p === "adicionais" && typeof prox === "number") partes.push(`Adicional ${prox + 1}`), i++;
    else if (p === "ceps" && typeof prox === "number") partes.push(`Faixa de CEP ${prox + 1}`), (i += 2);
    else partes.push(CAMPOS[p] ?? p);
  }
  return partes.join(" › ") || "Catálogo";
}

function errosDeValidacao(err: unknown): string[] | null {
  if (err instanceof ZodError) {
    return err.issues.map((i) => `${caminho(i.path)}: ${i.message}`);
  }
  if (err instanceof Error && /repetido/.test(err.message)) return [err.message];
  return null;
}

type Simulacao = { unidade_id: string; modalidade: Modalidade; itens: unknown[] };

export async function rotasPrecos(app: FastifyInstance) {
  app.addHook("onRequest", exigirSessao);

  app.get("/admin/api/catalogo", async () => catalogoComVersao());

  app.put("/admin/api/catalogo", async (req, reply) => {
    if (req.usuario!.role !== "admin") return reply.code(403).send({ erro: "só administradores alteram preços" });
    try {
      const salvo = await salvarCatalogo(req.body, Number(req.usuario!.id));
      req.log.info({ userId: req.usuario!.id, versao: salvo.versao.id }, "catálogo alterado");
      return salvo;
    } catch (err) {
      const erros = errosDeValidacao(err);
      if (erros) return reply.code(400).send({ erro: "dados inválidos", detalhes: erros });
      throw err;
    }
  });

  app.post<{ Body: Simulacao }>(
    "/admin/api/simular",
    {
      schema: {
        body: {
          type: "object",
          required: ["unidade_id", "modalidade", "itens"],
          properties: {
            unidade_id: { type: "string" },
            modalidade: { type: "string", enum: ["coleta", "balcao"] },
            itens: { type: "array", maxItems: 50 },
          },
        },
      },
    },
    async (req, reply) => {
      const unidade = catalogo().unidades.find((u) => u.id === req.body.unidade_id);
      if (!unidade) return reply.code(400).send({ erro: "Unidade não encontrada" });
      try {
        return calcularOrcamento(req.body.itens, unidade, req.body.modalidade);
      } catch (err) {
        if (err instanceof ErroOrcamento) return reply.code(400).send({ erro: err.message });
        throw err;
      }
    },
  );
}
