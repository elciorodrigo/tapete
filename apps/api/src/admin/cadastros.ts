import type { FastifyInstance } from "fastify";
import { pool } from "../db.js";
import { normalizarTelefone } from "../whatsapp/cliente.js";
import { exigirSessao } from "./auth.js";

function telefoneOuNulo(valor: unknown): string | null {
  if (typeof valor !== "string" || !valor.trim()) return null;
  const telefone = normalizarTelefone(valor);
  if (!telefone) throw new Error("WhatsApp inválido. Use o DDD e o número.");
  return telefone;
}

function nomeDe(valor: unknown): string {
  const nome = typeof valor === "string" ? valor.trim() : "";
  if (nome.length < 2) throw new Error("Informe o nome do cliente.");
  if (nome.length > 120) throw new Error("O nome passou de 120 caracteres.");
  return nome;
}

export async function rotasCadastros(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", exigirSessao);

  app.get<{ Querystring: { q?: string } }>("/admin/api/clientes", async (req) => {
    const q = req.query.q?.trim() ?? "";
    const { rows } = await pool.query<{
      id: string;
      nome: string | null;
      wa_id: string | null;
      created_at: Date;
      pedidos: number;
      ultimo_pedido: Date | null;
    }>(
      `select c.id, c.nome, c.wa_id, c.created_at,
              count(q.id)::int as pedidos,
              max(q.created_at) as ultimo_pedido
         from clientes c
         left join quotes q on q.cliente_id = c.id
        where $1 = ''
           or c.nome ilike '%' || $1 || '%'
           or coalesce(c.wa_id, '') like '%' || $1 || '%'
        group by c.id
        order by coalesce(max(q.created_at), c.created_at) desc
        limit 200`,
      [q.replace(/\D/g, "").length >= 8 ? q.replace(/\D/g, "") : q],
    );
    return {
      clientes: rows.map((r) => ({
        id: Number(r.id),
        nome: r.nome || "Cliente",
        telefone: r.wa_id,
        pedidos: r.pedidos,
        ultimo_pedido: r.ultimo_pedido?.toISOString() ?? null,
        criado_em: r.created_at.toISOString(),
      })),
    };
  });

  app.get<{ Params: { id: string } }>("/admin/api/clientes/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ erro: "Cliente inválido" });
    const cliente = await pool.query<{ id: string; nome: string | null; wa_id: string | null; created_at: Date }>(
      "select id, nome, wa_id, created_at from clientes where id = $1",
      [id],
    );
    const row = cliente.rows[0];
    if (!row) return reply.code(404).send({ erro: "Cliente não encontrado" });
    const pedidos = await pool.query<{
      id: string;
      number: string;
      status: string;
      etapa: string | null;
      total_cents: number;
      modality: string;
      created_at: Date;
    }>(
      `select q.id, q.number, q.status, e.nome as etapa, q.total_cents, q.modality, q.created_at
         from quotes q
         left join etapas e on e.id = q.etapa_id
        where q.cliente_id = $1
        order by q.id desc`,
      [id],
    );
    return {
      id: Number(row.id),
      nome: row.nome || "Cliente",
      telefone: row.wa_id,
      criado_em: row.created_at.toISOString(),
      pedidos: pedidos.rows.map((p) => ({
        id: Number(p.id),
        numero: p.number,
        etapa: p.status === "CANCELADO" ? "Cancelado" : p.etapa || "Novo",
        total_cents: p.total_cents,
        modalidade: p.modality,
        criado_em: p.created_at.toISOString(),
      })),
    };
  });

  app.post<{ Body: { nome?: unknown; telefone?: unknown } }>("/admin/api/clientes", async (req, reply) => {
    try {
      const nome = nomeDe(req.body?.nome);
      const telefone = telefoneOuNulo(req.body?.telefone);
      const { rows } = await pool.query<{ id: string }>(
        "insert into clientes (nome, wa_id) values ($1, $2) returning id",
        [nome, telefone],
      );
      return reply.code(201).send({ id: Number(rows[0]!.id) });
    } catch (err) {
      const codigo = err && typeof err === "object" && "code" in err ? String(err.code) : "";
      if (codigo === "23505") return reply.code(409).send({ erro: "Já existe um cliente com esse WhatsApp." });
      return reply.code(400).send({ erro: err instanceof Error ? err.message : "Não foi possível cadastrar." });
    }
  });

  app.patch<{ Params: { id: string }; Body: { nome?: unknown; telefone?: unknown } }>("/admin/api/clientes/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ erro: "Cliente inválido" });
    try {
      const nome = nomeDe(req.body?.nome);
      const telefone = telefoneOuNulo(req.body?.telefone);
      const { rowCount } = await pool.query("update clientes set nome = $2, wa_id = $3, updated_at = now() where id = $1", [
        id,
        nome,
        telefone,
      ]);
      if (rowCount !== 1) return reply.code(404).send({ erro: "Cliente não encontrado" });
      if (telefone) await pool.query("update quotes set wa_id = $2, updated_at = now() where cliente_id = $1", [id, telefone]);
      return { id, nome, telefone };
    } catch (err) {
      const codigo = err && typeof err === "object" && "code" in err ? String(err.code) : "";
      if (codigo === "23505") return reply.code(409).send({ erro: "Já existe um cliente com esse WhatsApp." });
      return reply.code(400).send({ erro: err instanceof Error ? err.message : "Não foi possível salvar." });
    }
  });

  app.get("/admin/api/origens", async () => {
    const { rows } = await pool.query<{ id: string; nome: string; ativo: boolean }>(
      "select id, nome, ativo from origens order by nome",
    );
    return { origens: rows.map((r) => ({ id: Number(r.id), nome: r.nome, ativo: r.ativo })) };
  });

  app.post<{ Body: { nome?: unknown } }>("/admin/api/origens", async (req, reply) => {
    if (req.usuario!.role !== "admin") return reply.code(403).send({ erro: "só administradores alteram o cadastro" });
    const nome = typeof req.body?.nome === "string" ? req.body.nome.trim() : "";
    if (nome.length < 2) return reply.code(400).send({ erro: "Informe a origem." });
    try {
      const { rows } = await pool.query<{ id: string }>("insert into origens (nome) values ($1) returning id", [nome]);
      return reply.code(201).send({ id: Number(rows[0]!.id), nome, ativo: true });
    } catch {
      return reply.code(409).send({ erro: "Essa origem já existe." });
    }
  });

  app.patch<{ Params: { id: string }; Body: { ativo?: boolean } }>("/admin/api/origens/:id", async (req, reply) => {
    if (req.usuario!.role !== "admin") return reply.code(403).send({ erro: "só administradores alteram o cadastro" });
    const id = Number(req.params.id);
    const { rowCount } = await pool.query("update origens set ativo = $2 where id = $1", [id, req.body?.ativo === true]);
    if (rowCount !== 1) return reply.code(404).send({ erro: "Origem não encontrada" });
    return { id, ativo: req.body?.ativo === true };
  });

  app.get("/admin/api/usuarios", async () => {
    const { rows } = await pool.query<{ id: string; name: string; email: string; role: string; active: boolean; last_login_at: Date | null }>(
      "select id, name, email, role, active, last_login_at from admin_users order by name",
    );
    return {
      usuarios: rows.map((r) => ({
        id: Number(r.id),
        nome: r.name,
        email: r.email,
        papel: r.role === "admin" ? "Administrador" : "Atendente",
        ativo: r.active,
        ultimo_acesso: r.last_login_at?.toISOString() ?? null,
      })),
    };
  });
}
