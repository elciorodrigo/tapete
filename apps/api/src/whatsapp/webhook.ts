import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import { config } from "../config.js";
import { pool } from "../db.js";
import { confirmarPedido } from "./avisos.js";
import type { WhatsApp } from "./cliente.js";
import { whatsappDaApi } from "./registro.js";

type Mensagem = {
  from?: string;
  id?: string;
  type?: string;
  interactive?: { type?: string; nfm_reply?: { response_json?: string } };
};

type Pedido = { id: string; number: string; modality: string; total_cents: number };

function assinaturaOk(raw: Buffer, header: string | undefined): boolean {
  const secret = config.meta.appSecret;
  if (!secret) return true;
  if (!header) return false;
  const esperado = Buffer.from(`sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`);
  const recebido = Buffer.from(header);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

async function concluirFlow(waId: string, responseJson: string | undefined, whatsapp: WhatsApp, log: FastifyBaseLogger): Promise<void> {
  let dados: { flow_token?: string; pedido?: string } = {};
  if (responseJson) {
    try {
      dados = JSON.parse(responseJson) as { flow_token?: string; pedido?: string };
    } catch {
      dados = {};
    }
  }

  let pedido: Pedido | undefined;
  if (dados.pedido) {
    const porNumero = await pool.query<Pedido>("select id, number, modality, total_cents from quotes where number = $1", [dados.pedido]);
    pedido = porNumero.rows[0];
  }
  if (!pedido && dados.flow_token) {
    const porToken = await pool.query<Pedido>(
      `select q.id, q.number, q.modality, q.total_cents
         from quotes q
         join flow_sessions s on s.quote_id = q.id
        where s.flow_token = $1`,
      [dados.flow_token],
    );
    pedido = porToken.rows[0];
  }
  if (!pedido) {
    log.info({ waId }, "flow concluído sem pedido correspondente");
    return;
  }

  await pool.query("update quotes set wa_id = $2, updated_at = now() where id = $1", [pedido.id, waId]);
  if (dados.flow_token) {
    await pool.query("update flow_sessions set wa_id = $2, updated_at = now() where flow_token = $1", [dados.flow_token, waId]);
  }

  const erro = await confirmarPedido(pool, whatsapp, {
    id: Number(pedido.id),
    number: pedido.number,
    waId,
    modality: pedido.modality,
    totalCents: pedido.total_cents,
  });
  if (erro) log.warn({ erro, pedido: pedido.number }, "confirmação não enviada");
}

export async function rotasWebhook(app: FastifyInstance): Promise<void> {
  const whatsapp = whatsappDaApi(app.log);
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });

  app.get("/webhooks/meta", async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const token = config.meta.webhookVerifyToken;
    if (q["hub.mode"] === "subscribe" && token && q["hub.verify_token"] === token) {
      return reply.type("text/plain").send(q["hub.challenge"] ?? "");
    }
    return reply.code(403).send();
  });

  app.post("/webhooks/meta", async (req, reply) => {
    const raw = req.body as Buffer;
    if (!assinaturaOk(raw, req.headers["x-hub-signature-256"] as string | undefined)) return reply.code(401).send();

    let corpo: {
      entry?: { changes?: { value?: { contacts?: { profile?: { name?: string }; wa_id?: string }[]; messages?: Mensagem[] } }[] }[];
    };
    try {
      corpo = JSON.parse(raw.toString("utf8")) as typeof corpo;
    } catch {
      return reply.code(400).send();
    }

    for (const entry of corpo.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        for (const msg of value?.messages ?? []) {
          if (!msg.from || !msg.id) continue;
          const novo = await pool.query(
            `insert into inbound_messages (wamid, wa_id, type) values ($1, $2, $3)
             on conflict (wamid) do nothing returning wamid`,
            [msg.id, msg.from, msg.type ?? "desconhecido"],
          );
          if (novo.rowCount !== 1) continue;

          const nome = value?.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name ?? null;
          await pool.query(
            `insert into contacts (wa_id, profile_name, last_inbound_at)
             values ($1, $2, now())
             on conflict (wa_id) do update
               set profile_name = coalesce(excluded.profile_name, contacts.profile_name),
                   last_inbound_at = now(),
                   updated_at = now()`,
            [msg.from, nome],
          );

          if (msg.interactive?.type === "nfm_reply") {
            await concluirFlow(msg.from, msg.interactive.nfm_reply?.response_json, whatsapp, app.log);
          }
        }
      }
    }

    return reply.code(200).send();
  });
}
