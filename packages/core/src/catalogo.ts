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

export const catalogoSchema = z.object({
  marca: z.string().min(1),
  termos_url: z.url(),
  unidades: z.array(unidade).min(1),
});

export type Catalogo = z.infer<typeof catalogoSchema>;
export type Unidade = z.infer<typeof unidade>;
export type ItemPreco = z.infer<typeof itemPreco>;

export function parseCatalogo(input: unknown): Catalogo {
  const catalogo = catalogoSchema.parse(input);
  for (const u of catalogo.unidades) {
    const ids = [...u.tipos, ...u.adicionais].map((i) => i.id);
    const repetido = ids.find((id, i) => ids.indexOf(id) !== i);
    if (repetido) throw new Error(`Unidade ${u.id}: id repetido "${repetido}"`);
  }
  return catalogo;
}
