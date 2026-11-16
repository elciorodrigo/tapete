import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { pool } from "../db.js";
import { conferirSenha, conferirSenhaFalsa } from "./senha.js";

const COOKIE = "tapete_sessao";
const SESSAO_HORAS = 12;
const MAX_TENTATIVAS = 5;
const BLOQUEIO_MINUTOS = 15;

export type Usuario = { id: number; name: string; email: string; role: "admin" | "atendente" };

declare module "fastify" {
  interface FastifyRequest {
    usuario?: Usuario;
  }
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function gravarCookie(reply: FastifyReply, token: string) {
  reply.setCookie(COOKIE, token, {
    path: "/admin/api",
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax",
    maxAge: SESSAO_HORAS * 3600,
  });
}

export async function exigirSessao(req: FastifyRequest, reply: FastifyReply) {
  const token = req.cookies[COOKIE];
  if (!token) return reply.code(401).send({ erro: "não autenticado" });

  const { rows } = await pool.query<Usuario>(
    `update admin_sessions s
        set expires_at = now() + make_interval(hours => $2)
       from admin_users u
      where s.token_hash = $1 and s.user_id = u.id and s.expires_at > now() and u.active
      returning u.id, u.name, u.email, u.role`,
    [hashToken(token), SESSAO_HORAS],
  );
  if (!rows[0]) {
    reply.clearCookie(COOKIE, { path: "/admin/api" });
    return reply.code(401).send({ erro: "sessão expirada" });
  }
  gravarCookie(reply, token);
  req.usuario = rows[0];
}

export async function rotasAuth(app: FastifyInstance) {
  app.post<{ Body: { email: string; senha: string } }>(
    "/admin/api/login",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "senha"],
          additionalProperties: false,
          properties: {
            email: { type: "string", minLength: 3, maxLength: 200 },
            senha: { type: "string", minLength: 1, maxLength: 200 },
          },
        },
      },
    },
    async (req, reply) => {
      const email = req.body.email.trim().toLowerCase();
      const { rows } = await pool.query<{
        id: number;
        name: string;
        email: string;
        role: Usuario["role"];
        password_hash: string;
        active: boolean;
        bloqueado: boolean;
      }>(
        `select id, name, email, role, password_hash, active, coalesce(locked_until > now(), false) as bloqueado
           from admin_users where email = $1`,
        [email],
      );
      const u = rows[0];

      if (!u || !u.active) {
        await conferirSenhaFalsa(req.body.senha);
        return reply.code(401).send({ erro: "credenciais inválidas" });
      }
      if (u.bloqueado) {
        return reply.code(429).send({ erro: "muitas tentativas" });
      }
      if (!(await conferirSenha(req.body.senha, u.password_hash))) {
        await pool.query(
          `update admin_users
              set failed_attempts = case when failed_attempts + 1 >= $2 then 0 else failed_attempts + 1 end,
                  locked_until    = case when failed_attempts + 1 >= $2 then now() + make_interval(mins => $3) else locked_until end
            where id = $1`,
          [u.id, MAX_TENTATIVAS, BLOQUEIO_MINUTOS],
        );
        req.log.warn({ email }, "login recusado");
        return reply.code(401).send({ erro: "credenciais inválidas" });
      }

      const token = randomBytes(32).toString("base64url");
      await pool.query(
        `insert into admin_sessions (token_hash, user_id, expires_at, ip, user_agent)
         values ($1, $2, now() + make_interval(hours => $3), $4, $5)`,
        [hashToken(token), u.id, SESSAO_HORAS, req.ip, req.headers["user-agent"]?.slice(0, 300) ?? null],
      );
      await pool.query(
        "update admin_users set failed_attempts = 0, locked_until = null, last_login_at = now() where id = $1",
        [u.id],
      );
      gravarCookie(reply, token);
      req.log.info({ userId: u.id }, "login");
      return { id: u.id, name: u.name, email: u.email, role: u.role };
    },
  );

  app.post("/admin/api/logout", async (req, reply) => {
    const token = req.cookies[COOKIE];
    if (token) await pool.query("delete from admin_sessions where token_hash = $1", [hashToken(token)]);
    reply.clearCookie(COOKIE, { path: "/admin/api" });
    return { ok: true };
  });

  app.get("/admin/api/me", { preHandler: exigirSessao }, async (req) => req.usuario);
}
