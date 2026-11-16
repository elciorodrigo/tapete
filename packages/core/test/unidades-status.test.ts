import { describe, expect, it } from "vitest";
import { parseCatalogo, podeMudarStatus, proximosStatus, unidadePorCep } from "../src/index.js";

const catalogo = parseCatalogo({
  marca: "Tapetê",
  termos_url: "https://tapete.solucoesdigitais.io/termos",
  unidades: [
    {
      id: "moema",
      nome: "Tapetê – Moema",
      endereco_loja: "Av. Ibirapuera, 1000",
      aceita_balcao: true,
      ceps: [["04000-000", "04099-999"], ["04500-000", "04599-999"]],
      taxa_coleta: 20,
      pedido_minimo: 80,
      area_minima_m2: 1,
      arredondamento_m: 0.1,
      tipos: [{ id: "tap_sint", nome: "Sintético", preco_m2: 25 }],
      adicionais: [],
    },
  ],
});

describe("unidadePorCep", () => {
  it("acha a unidade pela faixa, com ou sem hífen", () => {
    expect(unidadePorCep(catalogo, "04538-132")?.id).toBe("moema");
    expect(unidadePorCep(catalogo, "04000000")?.id).toBe("moema");
    expect(unidadePorCep(catalogo, "04099-999")?.id).toBe("moema");
  });

  it("devolve null fora da área ou com CEP inválido", () => {
    expect(unidadePorCep(catalogo, "01310-100")).toBeNull();
    expect(unidadePorCep(catalogo, "0453")).toBeNull();
  });
});

describe("parseCatalogo", () => {
  it("recusa ids repetidos na unidade", () => {
    const u = catalogo.unidades[0]!;
    expect(() =>
      parseCatalogo({ ...catalogo, unidades: [{ ...u, adicionais: [{ id: "tap_sint", nome: "X", preco_m2: 1 }] }] }),
    ).toThrow(/repetido/);
  });
});

describe("status", () => {
  it("segue o fluxo do pedido", () => {
    expect(proximosStatus("NOVO")).toEqual(["CONFIRMADO", "CANCELADO"]);
    expect(podeMudarStatus("COLETADO", "EM_LAVAGEM")).toBe(true);
    expect(podeMudarStatus("COLETADO", "CANCELADO")).toBe(false);
    expect(podeMudarStatus("ENTREGUE", "NOVO")).toBe(false);
  });
});
