const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

export const centavosBRL = (c: number) => brl.format(c / 100);
export const reaisBRL = (r: number) => brl.format(r);
export const numero = (n: number) => num.format(n);

/** Aceita "1,5", "1.5" ou "1.234,56". Vazio ou inválido vira NaN. */
export function lerNumero(texto: string): number {
  const t = texto.trim();
  if (!t) return Number.NaN;
  const normalizado = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  return Number(normalizado);
}

export function slug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
}

export function dataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
