import { useEffect, useState } from "react";
import { api } from "../api";

type Campo = {
  chave: string;
  rotulo: string;
  tipo: "texto" | "texto_longo" | "numero" | "booleano";
  valor: string | number | boolean;
  ajuda: string;
};

type Grupo = {
  id: string;
  nome: string;
  descricao: string;
  editor: string;
  campos: Campo[];
};

type Etapa = { id?: number; nome: string; mensagem: string };

export function Configuracoes({ podeEditar }: { podeEditar: boolean }) {
  const [grupos, setGrupos] = useState<Grupo[] | null>(null);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [grupoId, setGrupoId] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api("/admin/api/configuracoes")
      .then(async (res) => {
        if (!res.ok) throw new Error("Não foi possível carregar as configurações.");
        const json = (await res.json()) as { grupos: Grupo[]; etapas: Etapa[] };
        setGrupos(json.grupos);
        setEtapas(json.etapas);
        setGrupoId(json.grupos[0]?.id ?? "");
      })
      .catch((e: Error) => setErro(e.message));
  }, []);

  const grupo = grupos?.find((g) => g.id === grupoId) ?? null;

  function mudarCampo(chave: string, valor: string | number | boolean) {
    setGrupos((atual) =>
      atual?.map((g) =>
        g.id === grupoId ? { ...g, campos: g.campos.map((c) => (c.chave === chave ? { ...c, valor } : c)) } : g,
      ) ?? null,
    );
  }

  function alterarEtapa(i: number, campo: keyof Etapa, valor: string) {
    setEtapas((atual) => atual.map((etapa, n) => (n === i ? { ...etapa, [campo]: valor } : etapa)));
  }

  function moverEtapa(i: number, direcao: -1 | 1) {
    setEtapas((atual) => {
      const j = i + direcao;
      if (j < 0 || j >= atual.length) return atual;
      const copia = [...atual];
      const [item] = copia.splice(i, 1);
      copia.splice(j, 0, item!);
      return copia;
    });
  }

  async function salvar() {
    if (!grupo) return;
    setSalvando(true);
    setAviso("");
    const body = grupo.editor === "etapas" ? { etapas } : { valores: Object.fromEntries(grupo.campos.map((c) => [c.chave, c.valor])) };
    const res = await api(`/admin/api/configuracoes/${grupo.id}`, { method: "PUT", body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as { grupos?: Grupo[]; etapas?: Etapa[]; erro?: string };
    setSalvando(false);
    if (!res.ok) {
      setAviso(json.erro || "Não foi possível salvar.");
      return;
    }
    if (json.grupos) setGrupos(json.grupos);
    if (json.etapas) setEtapas(json.etapas);
    setAviso("Seção salva.");
  }

  return (
    <>
      <h1>Configurações</h1>
      {erro && <p className="erro">{erro}</p>}
      {!grupos && !erro && <p>Carregando…</p>}
      {grupos && (
        <div className="config-layout">
          <nav className="config-menu">
            {grupos.map((g) => (
              <button key={g.id} type="button" className={g.id === grupoId ? "ativo" : undefined} onClick={() => { setGrupoId(g.id); setAviso(""); }}>
                {g.nome}
              </button>
            ))}
          </nav>

          {grupo && (
            <section className="bloco">
              <h2>{grupo.nome}</h2>
              {grupo.descricao && <p className="pedido-detalhe">{grupo.descricao}</p>}

              {grupo.editor === "campos" &&
                grupo.campos.map((campo) => (
                  <label key={campo.chave}>
                    {campo.rotulo}
                    {campo.tipo === "booleano" ? (
                      <input
                        type="checkbox"
                        checked={campo.valor === true}
                        disabled={!podeEditar}
                        onChange={(e) => mudarCampo(campo.chave, e.target.checked)}
                      />
                    ) : campo.tipo === "numero" ? (
                      <input
                        type="number"
                        value={typeof campo.valor === "number" ? campo.valor : ""}
                        disabled={!podeEditar}
                        onChange={(e) => mudarCampo(campo.chave, e.target.value === "" ? 0 : Number(e.target.value))}
                      />
                    ) : campo.tipo === "texto_longo" ? (
                      <textarea
                        rows={4}
                        value={typeof campo.valor === "string" ? campo.valor : ""}
                        disabled={!podeEditar}
                        onChange={(e) => mudarCampo(campo.chave, e.target.value)}
                      />
                    ) : (
                      <input
                        value={typeof campo.valor === "string" ? campo.valor : ""}
                        disabled={!podeEditar}
                        onChange={(e) => mudarCampo(campo.chave, e.target.value)}
                      />
                    )}
                    {campo.ajuda && <small className="pedido-detalhe">{campo.ajuda}</small>}
                  </label>
                ))}

              {grupo.editor === "etapas" && (
                <>
                  {etapas.map((etapa, i) => (
                    <div className="etapa-item" key={etapa.id ?? `nova-${i}`}>
                      <label>
                        Nome
                        <input value={etapa.nome} disabled={!podeEditar} onChange={(e) => alterarEtapa(i, "nome", e.target.value)} />
                      </label>
                      <label>
                        Mensagem
                        <textarea rows={2} value={etapa.mensagem} disabled={!podeEditar} onChange={(e) => alterarEtapa(i, "mensagem", e.target.value)} />
                      </label>
                      {podeEditar && (
                        <div className="etapa-comandos">
                          <button type="button" className="botao-secundario" disabled={i === 0} onClick={() => moverEtapa(i, -1)}>Subir</button>
                          <button type="button" className="botao-secundario" disabled={i === etapas.length - 1} onClick={() => moverEtapa(i, 1)}>Descer</button>
                          <button type="button" className="botao-perigo" onClick={() => setEtapas(etapas.filter((_, n) => n !== i))}>Apagar</button>
                        </div>
                      )}
                    </div>
                  ))}
                  {podeEditar && (
                    <button type="button" className="botao-secundario" onClick={() => setEtapas([...etapas, { nome: "", mensagem: "" }])}>
                      Nova etapa
                    </button>
                  )}
                </>
              )}

              {grupo.editor !== "campos" && grupo.editor !== "etapas" && (
                <p>Esta seção chegou do banco, mas esta versão do painel ainda não tem o editor dela.</p>
              )}

              {podeEditar && (grupo.editor === "campos" || grupo.editor === "etapas") && (
                <button type="button" onClick={salvar} disabled={salvando}>
                  {salvando ? "Salvando…" : "Salvar"}
                </button>
              )}
              {aviso && <p className={aviso === "Seção salva." ? "pedido-ok" : "erro"}>{aviso}</p>}
            </section>
          )}
        </div>
      )}
    </>
  );
}
