import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

const N = 16384;
const R = 8;
const P = 1;
const TAMANHO = 64;

function derivar(senha: string, salt: Buffer, opcoes: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(senha.normalize("NFKC"), salt, TAMANHO, opcoes, (err, chave) => (err ? reject(err) : resolve(chave)));
  });
}

export async function gerarHash(senha: string): Promise<string> {
  const salt = randomBytes(16);
  const chave = await derivar(senha, salt, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${chave.toString("base64")}`;
}

export async function conferirSenha(senha: string, hash: string): Promise<boolean> {
  const [alg, n, r, p, salt, chave] = hash.split("$");
  if (alg !== "scrypt" || !salt || !chave) return false;
  const esperado = Buffer.from(chave, "base64");
  const obtido = await derivar(senha, Buffer.from(salt, "base64"), { N: Number(n), r: Number(r), p: Number(p) });
  return obtido.length === esperado.length && timingSafeEqual(obtido, esperado);
}

export function gerarSenhaAleatoria(): string {
  return randomBytes(12).toString("base64url");
}

const HASH_FALSO = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(TAMANHO).toString("base64");

/** Gasta o mesmo tempo de uma conferência real quando o e-mail não existe. */
export async function conferirSenhaFalsa(senha: string): Promise<void> {
  await conferirSenha(senha, HASH_FALSO);
}
