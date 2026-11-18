import type { FastifyBaseLogger } from "fastify";
import { config } from "../config.js";
import { pool } from "../db.js";
import { criarWhatsApp, type RegistroEnvio, type WhatsApp } from "./cliente.js";

async function registrarEnvio(r: RegistroEnvio): Promise<number> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into outbound_messages (quote_id, wa_id, kind, content, wamid, status, error)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [r.quote_id, r.wa_id, r.kind, JSON.stringify(r.content), r.wamid, r.status, r.error],
  );
  return Number(rows[0]!.id);
}

export function whatsappDaApi(log: FastifyBaseLogger): WhatsApp {
  return criarWhatsApp(
    {
      accessToken: config.meta.accessToken,
      phoneNumberId: config.meta.phoneNumberId,
      graphVersion: config.meta.graphVersion,
      flowId: config.meta.flowId,
      flowMode: config.flowMode,
    },
    registrarEnvio,
    log,
  );
}
