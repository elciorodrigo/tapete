import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ErroOrcamento,
  calcularItem,
  calcularOrcamento,
  formatarBRL,
  parseCatalogo,
  type ItemPedido,
  type Unidade,
} from "../src/index.js";

const unidade: Unidade = {
  id: "moema",
  nome: "Tapetê – Moema",
  endereco_loja: "Av. Ibirapuera, 1000",
  aceita_balcao: true,
  ceps: [["04000-000", "04099-999"]],
  taxa_coleta: 20,
  pedido_minimo: 80,
  area_minima_m2: 1,
  arredondamento_m: 0.1,
  tipos: [
    { id: "tap_sint", nome: "Sintético", preco_m2: 25 },
    { id: "tap_persa", nome: "Persa", preco_m2: 55 },
  ],
  adicionais: [
    { id: "impermeabilizacao", nome: "Impermeabilização", preco_m2: 12 },
    { id: "antiacaro", nome: "Antiácaro", preco_m2: 6 },
  ],
};

const ret = (largura: number, comprimento: number, tipo = "tap_sint", adicionais: string[] = []): ItemPedido => ({
  tipo,
  medidas: { formato: "retangular", largura, comprimento },
  adicionais,
});

describe("calcularItem", () => {
  it("retangular: largura × comprimento × preço do tipo", () => {
    const item = calcularItem(ret(2, 3), unidade);
    expect(item.area_m2).toBe(6);
    expect(item.valor).toBe(15000);
  });

  it("redondo: π × (d/2)², área com 2 casas", () => {
    const item = calcularItem({ tipo: "tap_sint", medidas: { formato: "redondo", diametro: 1.5 }, adicionais: [] }, unidade);
    expect(item.area_m2).toBe(1.77);
    expect(item.valor).toBe(4425);
  });

  it("arredonda cada medida para cima no passo da unidade", () => {
    expect(calcularItem(ret(1.95, 2.01), unidade).area_m2).toBe(4.2);
    expect(calcularItem(ret(2.0, 3.0), unidade).area_m2).toBe(6);
  });

  it("aplica a área mínima", () => {
    expect(calcularItem(ret(0.5, 0.5), unidade).area_m2).toBe(1);
  });

  it("soma os adicionais por m² e ignora repetidos", () => {
    const item = calcularItem(ret(2, 3, "tap_sint", ["impermeabilizacao", "antiacaro", "antiacaro"]), unidade);
    expect(item.preco_m2).toBe(4300);
    expect(item.valor).toBe(25800);
    expect(item.adicionais_nomes).toEqual(["Impermeabilização", "Antiácaro"]);
  });

  it("recusa tipo, adicional ou medida inválidos", () => {
    expect(() => calcularItem(ret(2, 3, "x"), unidade)).toThrow(ErroOrcamento);
    expect(() => calcularItem(ret(2, 3, "tap_sint", ["x"]), unidade)).toThrow(ErroOrcamento);
    expect(() => calcularItem(ret(0, 3), unidade)).toThrow(ErroOrcamento);
    expect(() => calcularItem(ret(2, Number.NaN), unidade)).toThrow(ErroOrcamento);
    expect(() => calcularItem(ret(2, 50), unidade)).toThrow(ErroOrcamento);
  });
});

describe("calcularOrcamento", () => {
  it("coleta soma a taxa", () => {
    const o = calcularOrcamento([ret(2, 3), ret(1, 2, "tap_persa")], unidade, "coleta");
    expect(o.subtotal).toBe(15000 + 11000);
    expect(o.taxa_coleta).toBe(2000);
    expect(o.ajuste_minimo).toBe(0);
    expect(o.total).toBe(28000);
  });

  it("balcão não cobra taxa", () => {
    const o = calcularOrcamento([ret(2, 3)], unidade, "balcao");
    expect(o.taxa_coleta).toBe(0);
    expect(o.total).toBe(15000);
  });

  it("completa até o pedido mínimo", () => {
    const o = calcularOrcamento([ret(1, 1)], unidade, "coleta");
    expect(o.subtotal + o.taxa_coleta).toBe(4500);
    expect(o.ajuste_minimo).toBe(3500);
    expect(o.total).toBe(8000);
  });

  it("recusa pedido vazio e balcão em unidade sem balcão", () => {
    expect(() => calcularOrcamento([], unidade, "coleta")).toThrow(ErroOrcamento);
    expect(() => calcularOrcamento([ret(2, 3)], { ...unidade, aceita_balcao: false }, "balcao")).toThrow(ErroOrcamento);
  });
});

describe("formatarBRL", () => {
  it("formata em reais", () => {
    expect(formatarBRL(15000)).toBe("R$ 150,00");
    expect(formatarBRL(123456)).toBe("R$ 1.234,56");
  });
});

describe("config/precos.json", () => {
  it("é um catálogo válido", () => {
    const raw = JSON.parse(readFileSync(new URL("../../../config/precos.json", import.meta.url), "utf8"));
    expect(parseCatalogo(raw).unidades.length).toBeGreaterThan(0);
  });
});
