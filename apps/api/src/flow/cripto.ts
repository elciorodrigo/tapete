import { readFileSync } from "node:fs";
import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  privateDecrypt,
  constants,
  type KeyObject,
} from "node:crypto";

export class ErroCriptografia extends Error {}

export function carregarChavePrivada(caminho: string, passphrase: string): KeyObject {
  return createPrivateKey({
    key: readFileSync(caminho),
    passphrase: passphrase || undefined,
  });
}

type Envelope = {
  encrypted_flow_data: string;
  encrypted_aes_key: string;
  initial_vector: string;
};

function envelope(body: unknown): Envelope {
  if (!body || typeof body !== "object") throw new ErroCriptografia("corpo inválido");
  const e = body as Record<string, unknown>;
  if (
    typeof e.encrypted_flow_data !== "string" ||
    typeof e.encrypted_aes_key !== "string" ||
    typeof e.initial_vector !== "string"
  ) {
    throw new ErroCriptografia("corpo inválido");
  }
  return e as Envelope;
}

/** Decifra o pedido da Meta: RSA-OAEP SHA-256 na chave AES e AES-128-GCM nos dados. */
export function decifrarPedido(body: unknown, chave: KeyObject): { json: unknown; aesKey: Buffer; iv: Buffer } {
  const e = envelope(body);
  let aesKey: Buffer;
  try {
    aesKey = privateDecrypt(
      { key: chave, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
      Buffer.from(e.encrypted_aes_key, "base64"),
    );
  } catch {
    throw new ErroCriptografia("falha ao decifrar a chave");
  }

  try {
    const dados = Buffer.from(e.encrypted_flow_data, "base64");
    const iv = Buffer.from(e.initial_vector, "base64");
    const tag = dados.subarray(dados.length - 16);
    const cifra = dados.subarray(0, dados.length - 16);
    const decipher = createDecipheriv("aes-128-gcm", aesKey, iv);
    decipher.setAuthTag(tag);
    const json = JSON.parse(Buffer.concat([decipher.update(cifra), decipher.final()]).toString("utf8")) as unknown;
    return { json, aesKey, iv };
  } catch (err) {
    if (err instanceof ErroCriptografia) throw err;
    throw new ErroCriptografia("falha ao decifrar os dados");
  }
}

/** Cifra a resposta com a mesma chave AES e o IV com os bits invertidos. Devolve base64. */
export function cifrarResposta(resposta: unknown, aesKey: Buffer, iv: Buffer): string {
  const invertido = Buffer.alloc(iv.length);
  for (let i = 0; i < iv.length; i++) invertido[i] = iv[i]! ^ 0xff;
  const cipher = createCipheriv("aes-128-gcm", aesKey, invertido);
  const corpo = Buffer.concat([
    cipher.update(JSON.stringify(resposta), "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return corpo.toString("base64");
}
