import type { Catalogo, Unidade } from "./catalogo.js";

export function normalizarCep(cep: string): string | null {
  const digitos = cep.replace(/\D/g, "");
  return digitos.length === 8 ? digitos : null;
}

export function formatarCep(cep: string): string {
  return `${cep.slice(0, 5)}-${cep.slice(5)}`;
}

export function unidadePorCep(catalogo: Catalogo, cep: string): Unidade | null {
  const alvo = normalizarCep(cep);
  if (!alvo) return null;
  for (const u of catalogo.unidades) {
    for (const [inicio, fim] of u.ceps) {
      const a = normalizarCep(inicio);
      const b = normalizarCep(fim);
      if (a && b && alvo >= a && alvo <= b) return u;
    }
  }
  return null;
}
