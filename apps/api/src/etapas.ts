import type { Pool, PoolClient } from "pg";

export type Etapa = { id: number; nome: string; mensagem: string; posicao: number };

type Entrada = { id?: number; nome?: unknown; mensagem?: unknown };

export async function listarEtapas(pool: Pool | PoolClient): Promise<Etapa[]> {
  const { rows } = await pool.query<{ id: string; nome: string; mensagem: string; posicao: number }>(
    "select id, nome, mensagem, posicao from etapas order by posicao, id",
  );
  return rows.map((r) => ({ id: Number(r.id), nome: r.nome, mensagem: r.mensagem, posicao: r.posicao }));
}

export async function salvarEtapas(pool: Pool, entrada: unknown): Promise<Etapa[]> {
  if (!Array.isArray(entrada) || entrada.length === 0) throw new Error("Cadastre ao menos uma etapa.");
  const lista = entrada.map((item, i) => {
    const bruto = item as Entrada;
    const nome = typeof bruto.nome === "string" ? bruto.nome.trim() : "";
    const mensagem = typeof bruto.mensagem === "string" ? bruto.mensagem.trim() : "";
    if (!nome) throw new Error(`A etapa ${i + 1} precisa de um nome.`);
    if (nome.length > 80) throw new Error(`O nome da etapa ${i + 1} passou de 80 caracteres.`);
    if (mensagem.length > 1000) throw new Error(`A mensagem da etapa ${i + 1} passou de 1000 caracteres.`);
    const id = typeof bruto.id === "number" && Number.isInteger(bruto.id) ? bruto.id : undefined;
    return { id, nome, mensagem };
  });

  const idsMantidos = lista.flatMap((e) => (e.id ? [e.id] : []));
  const filtro = idsMantidos.length ? idsMantidos : [0];
  const emUso = await pool.query<{ nome: string }>(
    `select nome from etapas
      where not (id = any($1::bigint[]))
        and exists (select 1 from quotes where etapa_id = etapas.id)`,
    [filtro],
  );
  if (emUso.rows.length) {
    throw new Error(`Não dá para apagar a etapa "${emUso.rows[0]!.nome}" porque já existe pedido nela.`);
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("delete from etapas where not (id = any($1::bigint[]))", [filtro]);
    for (let i = 0; i < lista.length; i++) {
      const etapa = lista[i]!;
      const posicao = i + 1;
      const atualizado = etapa.id
        ? await client.query("update etapas set nome = $2, mensagem = $3, posicao = $4 where id = $1", [
            etapa.id,
            etapa.nome,
            etapa.mensagem,
            posicao,
          ])
        : { rowCount: 0 };
      if (atualizado.rowCount !== 1) {
        await client.query("insert into etapas (nome, mensagem, posicao) values ($1, $2, $3)", [etapa.nome, etapa.mensagem, posicao]);
      }
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
  return listarEtapas(pool);
}
