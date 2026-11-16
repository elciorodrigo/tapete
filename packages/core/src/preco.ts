import type { Unidade } from "./catalogo.js";
import { paraCentavos, type Centavos } from "./dinheiro.js";

export type Medidas =
  | { formato: "retangular"; largura: number; comprimento: number }
  | { formato: "redondo"; diametro: number };

export type ItemPedido = {
  tipo: string;
  medidas: Medidas;
  adicionais: string[];
};

export type ItemCalculado = ItemPedido & {
  tipo_nome: string;
  adicionais_nomes: string[];
  area_m2: number;
  preco_m2: Centavos;
  valor: Centavos;
};

export type Modalidade = "coleta" | "balcao";

export type Orcamento = {
  itens: ItemCalculado[];
  subtotal: Centavos;
  taxa_coleta: Centavos;
  ajuste_minimo: Centavos;
  total: Centavos;
};

export class ErroOrcamento extends Error {}

const MEDIDA_MAXIMA_M = 20;

function arredondarPraCima(valor: number, passo: number): number {
  return Math.ceil(valor / passo - 1e-9) * passo;
}

function medidaValida(valor: number): boolean {
  return Number.isFinite(valor) && valor > 0 && valor <= MEDIDA_MAXIMA_M;
}

export function areaM2(medidas: Medidas, unidade: Unidade): number {
  const passo = unidade.arredondamento_m;
  let area: number;
  if (medidas.formato === "redondo") {
    if (!medidaValida(medidas.diametro)) throw new ErroOrcamento("Diâmetro inválido");
    const d = arredondarPraCima(medidas.diametro, passo);
    area = Math.PI * (d / 2) ** 2;
  } else {
    if (!medidaValida(medidas.largura) || !medidaValida(medidas.comprimento)) {
      throw new ErroOrcamento("Medidas inválidas");
    }
    area = arredondarPraCima(medidas.largura, passo) * arredondarPraCima(medidas.comprimento, passo);
  }
  const arredondada = Math.round(area * 100) / 100;
  return Math.max(arredondada, unidade.area_minima_m2);
}

export function calcularItem(item: ItemPedido, unidade: Unidade): ItemCalculado {
  const tipo = unidade.tipos.find((t) => t.id === item.tipo);
  if (!tipo) throw new ErroOrcamento(`Tipo de tapete desconhecido: ${item.tipo}`);

  const adicionais = [...new Set(item.adicionais)].map((id) => {
    const adicional = unidade.adicionais.find((a) => a.id === id);
    if (!adicional) throw new ErroOrcamento(`Adicional desconhecido: ${id}`);
    return adicional;
  });

  const area = areaM2(item.medidas, unidade);
  const precoM2 = paraCentavos(tipo.preco_m2) + adicionais.reduce((s, a) => s + paraCentavos(a.preco_m2), 0);

  return {
    ...item,
    adicionais: adicionais.map((a) => a.id),
    tipo_nome: tipo.nome,
    adicionais_nomes: adicionais.map((a) => a.nome),
    area_m2: area,
    preco_m2: precoM2,
    valor: Math.round(area * precoM2),
  };
}

export function calcularOrcamento(itens: ItemPedido[], unidade: Unidade, modalidade: Modalidade): Orcamento {
  if (itens.length === 0) throw new ErroOrcamento("Nenhum tapete no pedido");
  if (modalidade === "balcao" && !unidade.aceita_balcao) {
    throw new ErroOrcamento("Esta unidade não atende no balcão");
  }

  const calculados = itens.map((i) => calcularItem(i, unidade));
  const subtotal = calculados.reduce((s, i) => s + i.valor, 0);
  const taxa = modalidade === "coleta" ? paraCentavos(unidade.taxa_coleta) : 0;
  const minimo = paraCentavos(unidade.pedido_minimo);
  const ajuste = Math.max(0, minimo - (subtotal + taxa));

  return {
    itens: calculados,
    subtotal,
    taxa_coleta: taxa,
    ajuste_minimo: ajuste,
    total: subtotal + taxa + ajuste,
  };
}
