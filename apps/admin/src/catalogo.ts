import type { Catalogo, Orcamento, Unidade } from "@tapete/core";
import { api } from "./api";

export type { Catalogo, Orcamento, Unidade };
export type ItemPreco = Unidade["tipos"][number];
export type Versao = { id: number; atualizado_em: string; atualizado_por: string | null };
export type CatalogoComVersao = { catalogo: Catalogo; versao: Versao };

export async function buscarCatalogo(): Promise<CatalogoComVersao> {
  const res = await api("/admin/api/catalogo");
  if (!res.ok) throw new Error("Não foi possível carregar os preços.");
  return res.json();
}
