import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../infra/keys");
const privada = resolve(dir, "flow_private.pem");
const publica = resolve(dir, "flow_public.pem");

if (existsSync(privada) && existsSync(publica)) {
  console.log(`As chaves já existem em ${dir}. Não gerei outro par.`);
  console.log("Chave pública para colar na Meta:\n");
  console.log(readFileSync(publica, "utf8"));
  process.exit(0);
}

mkdirSync(dir, { recursive: true });
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
writeFileSync(privada, privateKey, { mode: 0o600 });
writeFileSync(publica, publicKey, { mode: 0o644 });
console.log(`Par gerado em ${dir}.`);
console.log("Chave pública para colar na Meta (número do WhatsApp, criptografia):\n");
console.log(publicKey);