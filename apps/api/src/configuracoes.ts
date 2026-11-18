import type { Pool } from "pg";

export type CampoConfig = {
  chave: string;
  rotulo: string;
  tipo: "texto" | "texto_longo" | "numero" | "booleano";
  valor: string | number | boolean;
  ajuda: string;
};

export type GrupoConfig = {
  id: string;
  nome: string;
  descricao: string;
  editor: string;
  campos: CampoConfig[];
};

const TIPOS = new Set(["texto", "texto_longo", "numero", "booleano"]);

function valorDe(tipo: string, bruto: unknown): string | number | boolean {
  if (tipo === "numero") return typeof bruto === "number" && Number.isFinite(bruto) ? bruto : Number(bruto) || 0;
  if (tipo === "booleano") return bruto === true;
  return typeof bruto === "string" ? bruto : "";
}

export async function listarGrupos(pool: Pool): Promise<GrupoConfig[]> {
  const grupos = await pool.query<{ id: string; nome: string; descricao: string; editor: string }>(
    "select id, nome, descricao, editor from configuracao_grupos order by posicao, id",
  );
  const campos = await pool.query<{ chave: string; grupo: string; rotulo: string; tipo: string; valor: unknown; ajuda: string }>(
    "select chave, grupo, rotulo, tipo, valor, ajuda from configuracoes order by posicao, chave",
  );
  return grupos.rows.map((grupo) => ({
    id: grupo.id,
    nome: grupo.nome,
    descricao: grupo.descricao,
    editor: grupo.editor,
    campos: campos.rows
      .filter((c) => c.grupo === grupo.id && TIPOS.has(c.tipo))
      .map((c) => ({
        chave: c.chave,
        rotulo: c.rotulo,
        tipo: c.tipo as CampoConfig["tipo"],
        valor: valorDe(c.tipo, c.valor),
        ajuda: c.ajuda,
      })),
  }));
}

export async function lerConfiguracao(pool: Pool, chave: string): Promise<string> {
  const { rows } = await pool.query<{ valor: unknown }>("select valor from configuracoes where chave = $1", [chave]);
  const valor = rows[0]?.valor;
  if (typeof valor === "string") return valor;
  if (valor == null) {
    const antigo = await pool.query<{ body: string }>("select body from message_templates where key = $1", [chave]);
    return antigo.rows[0]?.body ?? "";
  }
  return String(valor);
}

export async function salvarCampos(pool: Pool, grupo: string, entrada: unknown): Promise<void> {
  const valores = entrada && typeof entrada === "object" && !Array.isArray(entrada) ? (entrada as Record<string, unknown>) : {};
  const { rows } = await pool.query<{ chave: string; tipo: string }>(
    "select chave, tipo from configuracoes where grupo = $1",
    [grupo],
  );
  if (!rows.length) throw new Error("Este grupo não tem campos para salvar.");
  for (const campo of rows) {
    const bruto = valores[campo.chave];
    if (campo.tipo === "texto" || campo.tipo === "texto_longo") {
      const texto = typeof bruto === "string" ? bruto.trim() : "";
      const limite = campo.tipo === "texto_longo" ? 1000 : 200;
      if (campo.chave === "confirmacao" && !texto) throw new Error("A confirmação do orçamento precisa ter texto.");
      if (texto.length > limite) throw new Error(`O campo passou de ${limite} caracteres.`);
      await pool.query("update configuracoes set valor = $2::jsonb, updated_at = now() where chave = $1", [
        campo.chave,
        JSON.stringify(texto),
      ]);
      continue;
    }
    if (campo.tipo === "numero") {
      const n = typeof bruto === "number" ? bruto : Number(bruto);
      if (!Number.isFinite(n)) throw new Error("Informe um número válido.");
      await pool.query("update configuracoes set valor = $2::jsonb, updated_at = now() where chave = $1", [
        campo.chave,
        JSON.stringify(n),
      ]);
      continue;
    }
    await pool.query("update configuracoes set valor = $2::jsonb, updated_at = now() where chave = $1", [
      campo.chave,
      JSON.stringify(bruto === true),
    ]);
  }
}
