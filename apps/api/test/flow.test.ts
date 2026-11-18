import { createCipheriv, createDecipheriv, constants, generateKeyPairSync, publicEncrypt, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCatalogo } from "@tapete/core";
import { chaveDePem, cifrarResposta, decifrarPedido, pemDoAmbiente } from "../src/flow/cripto.ts";
import { estadoInicial, tratarFluxo, type EnderecoViaCep } from "../src/flow/telas.ts";

const catalogo = parseCatalogo(JSON.parse(readFileSync(new URL("../../../config/precos.json", import.meta.url), "utf8")));
const semCep = async (): Promise<EnderecoViaCep | null> => null;

function cifrarComoMeta(json: unknown, publicKey: ReturnType<typeof generateKeyPairSync>["publicKey"]) {
  const aesKey = randomBytes(16);
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-128-gcm", aesKey, iv);
  const corpo = Buffer.concat([cipher.update(JSON.stringify(json), "utf8"), cipher.final(), cipher.getAuthTag()]);
  return {
    aesKey,
    iv,
    envelope: {
      encrypted_flow_data: corpo.toString("base64"),
      encrypted_aes_key: publicEncrypt(
        { key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
        aesKey,
      ).toString("base64"),
      initial_vector: iv.toString("base64"),
    },
  };
}

describe("chave no ambiente", () => {
  it("monta o PEM quando o .env guarda quebras como \\n", () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs1", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    const pem = privateKey as string;
    const chave = chaveDePem(pem.trim().replace(/\n/g, "\\n"), "");
    assert.equal(chave.type, "private");
    assert.ok(pemDoAmbiente(pem).includes("BEGIN"));
  });
});

describe("criptografia do Flow", () => {
  it("decifra o ping e devolve a resposta com o IV invertido", () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const { aesKey, iv, envelope } = cifrarComoMeta({ version: "3.0", action: "ping" }, publicKey);
    const dec = decifrarPedido(envelope, privateKey);
    assert.deepEqual(dec.json, { version: "3.0", action: "ping" });

    const resposta = cifrarResposta({ data: { status: "active" } }, dec.aesKey, dec.iv);
    const invertido = Buffer.from(iv.map((b) => b ^ 0xff));
    const buf = Buffer.from(resposta, "base64");
    const decipher = createDecipheriv("aes-128-gcm", aesKey, invertido);
    decipher.setAuthTag(buf.subarray(buf.length - 16));
    const texto = Buffer.concat([decipher.update(buf.subarray(0, buf.length - 16)), decipher.final()]).toString("utf8");
    assert.deepEqual(JSON.parse(texto), { data: { status: "active" } });
  });
});

describe("telas do Flow", () => {
  it("responde active no ping e abre o LOCAL no INIT", async () => {
    const ping = await tratarFluxo({ action: "ping" }, estadoInicial(), catalogo, "t", semCep);
    assert.equal(ping.tipo, "protocolo");
    assert.deepEqual(ping.resposta, { data: { status: "active" } });

    const init = await tratarFluxo({ action: "INIT" }, estadoInicial(), catalogo, "t", semCep);
    assert.equal(init.tipo, "tela");
    if (init.tipo !== "tela") return;
    assert.equal((init.resposta as { screen: string }).screen, "LOCAL");
  });

  it("manda para fora da área quando o CEP não tem unidade", async () => {
    const efeito = await tratarFluxo(
      { action: "data_exchange", data: { step: "CEP", cep: "01310-100" } },
      estadoInicial(),
      catalogo,
      "t",
      semCep,
    );
    assert.equal(efeito.tipo, "tela");
    if (efeito.tipo !== "tela") return;
    assert.equal((efeito.resposta as { screen: string }).screen, "FORA_AREA");
  });

  it("recusa medida faltando, aceita o tapete e deixa adicionar outro", async () => {
    const comCep = await tratarFluxo(
      { action: "data_exchange", data: { step: "CEP", cep: "04001-000" } },
      estadoInicial(),
      catalogo,
      "t",
      semCep,
    );
    assert.equal(comCep.tipo, "tela");
    if (comCep.tipo !== "tela") return;
    assert.equal((comCep.resposta as { screen: string }).screen, "TAPETE");

    const semMedida = await tratarFluxo(
      { action: "data_exchange", data: { step: "TAPETE_ADD", tipo: "tap_sint", formato: "retangular", adicionais: [] } },
      comCep.estado,
      catalogo,
      "t",
      semCep,
    );
    assert.equal(semMedida.tipo, "tela");
    if (semMedida.tipo !== "tela") return;
    const aviso = semMedida.resposta as { screen: string; data: { error_message?: string } };
    assert.equal(aviso.screen, "TAPETE");
    assert.match(aviso.data.error_message ?? "", /largura/);

    const ok = await tratarFluxo(
      {
        action: "data_exchange",
        data: { step: "TAPETE_ADD", tipo: "tap_sint", formato: "retangular", largura: "2,00", comprimento: "3", adicionais: ["impermeabilizacao"] },
      },
      comCep.estado,
      catalogo,
      "t",
      semCep,
    );
    assert.equal(ok.tipo, "tela");
    if (ok.tipo !== "tela") return;
    assert.equal((ok.resposta as { screen: string }).screen, "ITENS");
    assert.equal(ok.estado.itens.length, 1);

    const outro = await tratarFluxo(
      { action: "data_exchange", data: { step: "ITENS", proximo: "adicionar" } },
      ok.estado,
      catalogo,
      "t",
      semCep,
    );
    assert.equal(outro.tipo, "tela");
    if (outro.tipo !== "tela") return;
    assert.equal((outro.resposta as { screen: string }).screen, "TAPETE");
    assert.equal(outro.estado.itens.length, 1);
  });

  it("balcão vai para a proposta e a coleta pede o endereço", async () => {
    let estado = estadoInicial();
    const cep = await tratarFluxo(
      { action: "data_exchange", data: { step: "CEP", cep: "04534-011" } },
      estado,
      catalogo,
      "t",
      semCep,
    );
    if (cep.tipo !== "tela") return;
    estado = cep.estado;
    const item = await tratarFluxo(
      {
        action: "data_exchange",
        data: { step: "TAPETE_ADD", tipo: "tap_sint", formato: "redondo", diametro: "1,5", adicionais: [] },
      },
      estado,
      catalogo,
      "t",
      semCep,
    );
    if (item.tipo !== "tela") return;
    const entrega = await tratarFluxo(
      { action: "data_exchange", data: { step: "ITENS", proximo: "continuar" } },
      item.estado,
      catalogo,
      "t",
      semCep,
    );
    if (entrega.tipo !== "tela") return;
    assert.equal((entrega.resposta as { data: { show_cupom: boolean } }).data.show_cupom, false);

    const balcao = await tratarFluxo(
      { action: "data_exchange", data: { step: "ENTREGA", nome: "Maria", modalidade: "balcao", periodo: "manha", cupom: "" } },
      entrega.estado,
      catalogo,
      "tok",
      semCep,
    );
    assert.equal(balcao.tipo, "tela");
    if (balcao.tipo !== "tela") return;
    assert.equal((balcao.resposta as { screen: string }).screen, "PROPOSTA");

    const coleta = await tratarFluxo(
      { action: "data_exchange", data: { step: "ENTREGA", nome: "Maria", modalidade: "coleta", periodo: "tarde" } },
      entrega.estado,
      catalogo,
      "tok",
      async () => ({ logradouro: "Rua Joaquim Floriano", bairro: "Itaim Bibi", localidade: "São Paulo", uf: "SP" }),
    );
    assert.equal(coleta.tipo, "tela");
    if (coleta.tipo !== "tela") return;
    assert.equal((coleta.resposta as { screen: string }).screen, "ENDERECO");
    assert.match((coleta.resposta as { data: { cep_texto: string } }).data.cep_texto, /São Paulo/);
  });

  it("CONFIRMAR sem os termos devolve a proposta e, aceito, pede para gravar", async () => {
    const base = {
      ...estadoInicial(),
      nome: "Maria",
      cep: "04001000",
      unidadeId: "moema",
      modalidade: "balcao" as const,
      periodo: "manha",
      itens: [{ tipo: "tap_sint", formato: "retangular" as const, largura: 2, comprimento: 3, adicionais: [] }],
    };
    const sem = await tratarFluxo(
      { action: "data_exchange", screen: "PROPOSTA", data: { step: "CONFIRMAR", pagamento: "pix", termos: false } },
      base,
      catalogo,
      "tok",
      semCep,
    );
    assert.equal(sem.tipo, "tela");
    if (sem.tipo !== "tela") return;
    assert.match((sem.resposta as { data: { error_message?: string } }).data.error_message ?? "", /termos/);

    const com = await tratarFluxo(
      { action: "data_exchange", data: { step: "CONFIRMAR", pagamento: "pix", termos: true } },
      base,
      catalogo,
      "tok",
      semCep,
    );
    assert.equal(com.tipo, "gravar");
    if (com.tipo !== "gravar") return;
    const resposta = com.resposta("TP-000123") as { screen: string; data: { extension_message_response: { params: { pedido: string } } } };
    assert.equal(resposta.screen, "SUCCESS");
    assert.equal(resposta.data.extension_message_response.params.pedido, "TP-000123");
  });
});
