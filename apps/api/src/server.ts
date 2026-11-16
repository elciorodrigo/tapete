import cors from "@fastify/cors";
import Fastify from "fastify";
import { carregarCatalogo, catalogo } from "./catalogo.js";
import { config } from "./config.js";
import { pool } from "./db.js";

const app = Fastify({ logger: true, trustProxy: true, bodyLimit: 1024 * 1024 });

carregarCatalogo(config.precosPath, app.log);

await app.register(cors, {
  origin: config.webOrigins,
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE"],
});

app.get("/", async () => ({ servico: "tapete-api" }));

app.get("/health", async (_req, reply) => {
  const unidades = catalogo().unidades.length;
  try {
    await pool.query("select 1");
    return { status: "ok", db: "ok", unidades, mode: config.flowMode };
  } catch (err) {
    app.log.error(err);
    return reply.code(503).send({ status: "erro", db: "indisponivel", unidades });
  }
});

const shutdown = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

await app.listen({ host: "0.0.0.0", port: config.port });
