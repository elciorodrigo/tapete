import { createHmac, timingSafeEqual, type KeyObject } from "node:crypto";
import { existsSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { catalogo, catalogoComVersao } from "../catalogo.js";
import { config } from "../config.js";
import { pool } from "../db.js";
import { confirmarPedido } from "../whatsapp/avisos.js";
import { normalizarTelefone } from "../whatsapp/cliente.js";
import { whatsappDaApi } from "../whatsapp/registro.js";
import { carregarChavePrivada, chaveDePem, cifrarResposta, decifrarPedido } from "./cripto.js";
import { gravarPedido } from "./pedidos.js";
import { SessaoInvalida, fecharSessao, obterOuCriarSessao, salvarEstado } from "./sessoes.js";
import { consultarViaCep, estadoInicial, tratarFluxo, type EstadoFluxo } from "./telas.js";

let chaveCache: KeyObject | null = null;

function chavePrivada(): KeyObject {
  if (chaveCache) return chaveCache;
  chaveCache = config.flowPrivateKeyPem
    ? chaveDePem(config.flowPrivateKeyPem, config.flowPrivateKeyPassphrase)
    : carregarChavePrivada(config.flowPrivateKeyPath, config.flowPrivateKeyPassphrase);
  return chaveCache;
}

function assinaturaOk(raw: Buffer, header: string | undefined): boolean {
  const secret = config.meta.appSecret;
  if (!secret || !header) return true;
  const esperado = Buffer.from(`sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`);
  const recebido = Buffer.from(header);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

function telefoneNoPedido(body: Record<string, unknown>, flowToken: string): string | null {
  const candidatos: unknown[] = [flowToken, body.from, body.wa_id];
  const data = body.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const campos = data as Record<string, unknown>;
    candidatos.push(campos.wa_id, campos.phone, campos.from);
  }
  for (const candidato of candidatos) {
    if (typeof candidato !== "string") continue;
    const telefone = normalizarTelefone(candidato);
    if (telefone) return telefone;
  }
  return null;
}

export async function rotasFlow(app: FastifyInstance): Promise<void> {
  const chavePresente = Boolean(config.flowPrivateKeyPem) || existsSync(config.flowPrivateKeyPath);
  app.log.info({ origem: config.flowPrivateKeyPem ? "env" : "arquivo", presente: chavePresente }, "chave do Flow");
  if (!chavePresente) {
    app.log.warn("Sem a chave privada do Flow. A Meta não consegue verificar o endpoint até o arquivo existir.");
  }

  const whatsapp = whatsappDaApi(app.log);

  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });

  app.post("/flow", async (req, reply) => {
    const raw = req.body as Buffer;
    if (!assinaturaOk(raw, req.headers["x-hub-signature-256"] as string | undefined)) {
      return reply.code(432).send();
    }

    let chave: KeyObject;
    try {
      chave = chavePrivada();
    } catch (err) {
      app.log.error({ err }, "chave privada do Flow indisponível");
      return reply.code(421).send();
    }

    let decifrado: ReturnType<typeof decifrarPedido>;
    try {
      const envelope = JSON.parse(raw.toString("utf8")) as unknown;
      decifrado = decifrarPedido(envelope, chave);
    } catch (err) {
      app.log.warn({ err }, "pedido do Flow não decifrado");
      return reply.code(421).send();
    }

    const body = (decifrado.json ?? {}) as {
      action?: string;
      screen?: string;
      data?: unknown;
      flow_token?: string;
    };
    const responder = (resposta: unknown) => reply.type("text/plain").send(cifrarResposta(resposta, decifrado.aesKey, decifrado.iv));

    if (body.action === "ping" || (body.data && typeof body.data === "object" && "error" in body.data && body.data.error)) {
      const efeito = await tratarFluxo(body, estadoInicial(), catalogo(), body.flow_token ?? "", consultarViaCep);
      return responder(efeito.resposta);
    }

    const flowToken = body.flow_token?.trim() ?? "";
    if (!flowToken) return reply.code(427).send();

    let sessao;
    try {
      sessao = await obterOuCriarSessao(pool, flowToken, telefoneNoPedido(body, flowToken) ?? "preview");
    } catch (err) {
      if (err instanceof SessaoInvalida) return reply.code(427).send();
      throw err;
    }

    const efeito = await tratarFluxo(body, sessao.estado, catalogo(), flowToken, consultarViaCep);
    if (efeito.tipo === "protocolo" || efeito.tipo === "tela") {
      if (efeito.tipo === "tela") await salvarEstado(pool, flowToken, efeito.estado);
      return responder(efeito.resposta);
    }

    const gravado = await gravarPedido(pool, efeito.pedido, catalogo(), catalogoComVersao().versao.id, sessao.waId);
    const estado: EstadoFluxo = { ...efeito.estado, pedidoNumero: gravado.number, pagamento: efeito.pedido.pagamento };
    await fecharSessao(pool, flowToken, gravado.id, estado);

    void confirmarPedido(pool, whatsapp, {
      id: gravado.id,
      number: gravado.number,
      waId: sessao.waId,
      modality: efeito.pedido.modalidade,
      totalCents: gravado.totalCents,
    }).catch((err) => app.log.error({ err }, "confirmação não enviada"));

    return responder(efeito.resposta(gravado.number));
  });
}
