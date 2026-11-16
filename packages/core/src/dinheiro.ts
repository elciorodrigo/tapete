export type Centavos = number;

export function paraCentavos(reais: number): Centavos {
  return Math.round(reais * 100);
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatarBRL(centavos: Centavos): string {
  return brl.format(centavos / 100).replace(/\u00a0/g, " ");
}
