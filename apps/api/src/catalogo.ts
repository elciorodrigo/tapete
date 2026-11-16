import { readFileSync, watchFile } from "node:fs";
import type { FastifyBaseLogger } from "fastify";
import { parseCatalogo, type Catalogo } from "@tapete/core";

let atual: Catalogo | null = null;

function ler(path: string): Catalogo {
  return parseCatalogo(JSON.parse(readFileSync(path, "utf8")));
}

export function carregarCatalogo(path: string, log: FastifyBaseLogger): void {
  atual = ler(path);
  log.info({ unidades: atual.unidades.length }, "catálogo carregado");

  watchFile(path, { interval: 2000 }, () => {
    try {
      atual = ler(path);
      log.info({ unidades: atual.unidades.length }, "catálogo recarregado");
    } catch (err) {
      log.error({ err }, "precos.json inválido; mantendo a versão anterior");
    }
  });
}

export function catalogo(): Catalogo {
  if (!atual) throw new Error("Catálogo não carregado");
  return atual;
}
