import { existsSync, readFileSync } from "node:fs";
import type { FastifyBaseLogger } from "fastify";
import { parseCatalogo, type Catalogo } from "@tapete/core";
import { pool } from "./db.js";

export type Versao = { id: number; atualizado_em: string; atualizado_por: string | null };

let atual: { catalogo: Catalogo; versao: Versao } | null = null;

async function lerUltima() {
  const { rows } = await pool.query<{ id: number; data: unknown; created_at: Date; nome: string | null }>(
    `select v.id, v.data, v.created_at, u.name as nome
       from catalog_versions v left join admin_users u on u.id = v.created_by
      order by v.id desc limit 1`,
  );
  const r = rows[0];
  if (!r) return null;
  return {
    catalogo: parseCatalogo(r.data),
    versao: { id: Number(r.id), atualizado_em: r.created_at.toISOString(), atualizado_por: r.nome },
  };
}

/** Carrega a versão mais recente do banco; na primeira vez, importa o precos.json. */
export async function carregarCatalogo(seedPath: string, log: FastifyBaseLogger): Promise<void> {
  atual = await lerUltima();
  if (!atual) {
    if (!existsSync(seedPath)) throw new Error(`Sem catálogo no banco e sem ${seedPath} para importar`);
    const inicial = parseCatalogo(JSON.parse(readFileSync(seedPath, "utf8")));
    await pool.query("insert into catalog_versions (data) values ($1)", [inicial]);
    atual = await lerUltima();
    log.info({ seedPath }, "catálogo importado do arquivo");
  }
  log.info({ unidades: atual!.catalogo.unidades.length, versao: atual!.versao.id }, "catálogo carregado");
}

export async function salvarCatalogo(entrada: unknown, userId: number): Promise<{ catalogo: Catalogo; versao: Versao }> {
  const catalogo = parseCatalogo(entrada);
  await pool.query("insert into catalog_versions (data, created_by) values ($1, $2)", [catalogo, userId]);
  atual = await lerUltima();
  return atual!;
}

export function catalogo(): Catalogo {
  if (!atual) throw new Error("Catálogo não carregado");
  return atual.catalogo;
}

export function catalogoComVersao() {
  if (!atual) throw new Error("Catálogo não carregado");
  return atual;
}
