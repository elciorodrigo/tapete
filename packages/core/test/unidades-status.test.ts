import { describe, expect, it } from "vitest";
import {
  STATUS,
  STATUS_ROTULO,
  ehStatus,
  mensagemStatus,
  parseCatalogo,
  podeMudarStatus,
  proximosStatus,
  unidadePorCep,
} from "../src/index.js";

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

describe("parseCatalogo (campos do Flow)", () => {
  it("preenche períodos, formas de pagamento e versão dos termos em catálogos antigos", () => {
    expect(catalogo.termos_versao).toBe("1");
    expect(catalogo.periodos.map((p) => p.id)).toEqual(["qualquer", "manha", "tarde"]);
    expect(catalogo.formas_pagamento.map((f) => f.id)).toEqual(["pix", "cartao"]);
  });

  it("recusa período repetido", () => {
    expect(() =>
      parseCatalogo({ ...catalogo, periodos: [{ id: "manha", nome: "Manhã" }, { id: "manha", nome: "Cedo" }] }),
    ).toThrow(/Períodos/);
  });
});

describe("status", () => {
  it("segue o fluxo do pedido", () => {
    expect(proximosStatus("NOVO")).toEqual(["COLETA_AGENDADA", "CANCELADO"]);
    expect(podeMudarStatus("COLETA_AGENDADA", "EM_LAVAGEM")).toBe(true);
    expect(podeMudarStatus("EM_ROTA", "ENTREGUE")).toBe(true);
    expect(podeMudarStatus("ENTREGUE", "NOVO")).toBe(false);
  });

  it("passa pela secagem e segue para a rota de entrega", () => {
    expect(proximosStatus("EM_LAVAGEM")).toEqual(["EM_SECAGEM"]);
    expect(proximosStatus("EM_SECAGEM")).toEqual(["EM_ROTA"]);
    expect(podeMudarStatus("EM_LAVAGEM", "EM_ROTA")).toBe(false);
    expect(STATUS_ROTULO.EM_SECAGEM).toBe("Em secagem");
  });

  it("tem mensagem padrão com o número do pedido para cada status", () => {
    expect(mensagemStatus("EM_LAVAGEM", "TP-000123")).toBe("Seu pedido TP-000123 está em lavagem.");
    expect(mensagemStatus("EM_SECAGEM", "TP-000123")).toBe("Seu pedido TP-000123 está em secagem.");
    for (const s of STATUS) expect(mensagemStatus(s, "TP-000001")).toContain("TP-000001");
  });

  it("reconhece status válidos", () => {
    expect(ehStatus("EM_SECAGEM")).toBe(true);
    expect(ehStatus("LAVANDO")).toBe(false);
  });
});
