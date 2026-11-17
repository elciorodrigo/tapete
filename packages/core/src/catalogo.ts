import { z } from "zod";

const cep = z.string().trim().regex(/^\d{5}-?\d{3}$/, "CEP inválido (use 00000-000)");
const faixaCep = z
  .tuple([cep, cep])
  .refine(([a, b]) => a.replace("-", "") <= b.replace("-", ""), "o CEP inicial deve ser menor que o final");

const itemPreco = z.object({
  id: z.string().min(1),
  nome: z.string().min(1),
  preco_m2: z.number().nonnegative(),
});

const unidade = z.object({
  id: z.string().min(1),
  nome: z.string().min(1),
  endereco_loja: z.string().min(1),
  aceita_balcao: z.boolean(),
  ceps: z.array(faixaCep).min(1),
  taxa_coleta: z.number().nonnegative(),
  pedido_minimo: z.number().nonnegative(),
  area_minima_m2: z.number().positive(),
  arredondamento_m: z.number().positive(),
  tipos: z.array(itemPreco).min(1),
  adicionais: z.array(itemPreco),
});

const opcao = z.object({
  id: z.string().min(1),
  nome: z.string().min(1).max(30),
});

export const PERIODOS_PADRAO = [
  { id: "qualquer", nome: "Tanto faz" },
  { id: "manha", nome: "Manhã" },
  { id: "tarde", nome: "Tarde" },
];

export const FORMAS_PAGAMENTO_PADRAO = [
  { id: "pix", nome: "Pix" },
  { id: "cartao", nome: "Cartão de crédito" },
];

export const catalogoSchema = z.object({
  marca: z.string().min(1),
  termos_url: z.url(),
  termos_versao: z.string().trim().min(1).max(40).default("1"),
  periodos: z.array(opcao).min(1).max(20).default(PERIODOS_PADRAO),
  formas_pagamento: z.array(opcao).min(1).max(20).default(FORMAS_PAGAMENTO_PADRAO),
  unidades: z.array(unidade).min(1),
});

export type Catalogo = z.infer<typeof catalogoSchema>;
export type Unidade = z.infer<typeof unidade>;
export type ItemPreco = z.infer<typeof itemPreco>;
export type Opcao = z.infer<typeof opcao>;

function idRepetido(ids: string[]): string | undefined {
  return ids.find((id, i) => ids.indexOf(id) !== i);
}

export function parseCatalogo(input: unknown): Catalogo {
  const catalogo = catalogoSchema.parse(input);
  for (const u of catalogo.unidades) {
    const repetido = idRepetido([...u.tipos, ...u.adicionais].map((i) => i.id));
    if (repetido) throw new Error(`Unidade ${u.id}: id repetido "${repetido}"`);
  }
  const periodo = idRepetido(catalogo.periodos.map((p) => p.id));
  if (periodo) throw new Error(`Períodos: id repetido "${periodo}"`);
  const forma = idRepetido(catalogo.formas_pagamento.map((f) => f.id));
  if (forma) throw new Error(`Formas de pagamento: id repetido "${forma}"`);
  return catalogo;
}
