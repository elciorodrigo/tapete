import { useEffect, useState } from "react";
import { api } from "../api";

type Etapa = { id?: number; nome: string; mensagem: string };

export function Configuracoes({ podeEditar }: { podeEditar: boolean }) {
  const [confirmacao, setConfirmacao] = useState("");
  const [etapas, setEtapas] = useState<Etapa[] | null>(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api("/admin/api/configuracoes")
      .then(async (res) => {
        if (!res.ok) throw new Error("Não foi possível carregar as configurações.");
        const json = (await res.json()) as { confirmacao: string; etapas: Etapa[] };
        setConfirmacao(json.confirmacao);
        setEtapas(json.etapas);
      })
      .catch((e: Error) => setErro(e.message));
  }, []);

  function alterar(i: number, campo: keyof Etapa, valor: string) {
    setEtapas((atual) => atual?.map((etapa, n) => (n === i ? { ...etapa, [campo]: valor } : etapa)) ?? null);
  }

  function mover(i: number, direcao: -1 | 1) {
    setEtapas((atual) => {
      if (!atual) return atual;
      const j = i + direcao;
      if (j < 0 || j >= atual.length) return atual;
      const copia = [...atual];
      const [item] = copia.splice(i, 1);
      copia.splice(j, 0, item!);
      return copia;
    });
  }

  async function salvar() {
    if (!etapas) return;
    setSalvando(true);
    setAviso("");
    const res = await api("/admin/api/configuracoes", {
      method: "PUT",
      body: JSON.stringify({ confirmacao, etapas }),
    });
    const json = (await res.json().catch(() => ({}))) as { confirmacao?: string; etapas?: Etapa[]; erro?: string };
    setSalvando(false);
    if (!res.ok) {
      setAviso(json.erro || "Não foi possível salvar.");
      return;
    }
    if (json.confirmacao != null) setConfirmacao(json.confirmacao);
    if (json.etapas) setEtapas(json.etapas);
    setAviso("Configurações salvas.");
  }

  return (
    <>
      <h1>Configurações</h1>
      {erro && <p className="erro">{erro}</p>}
      {!etapas && !erro && <p>Carregando…</p>}
      {etapas && (
        <>
          <div className="bloco">
            <h2>Confirmação do orçamento</h2>
            <p className="pedido-detalhe">
              Enviada quando o cliente termina o Flow. Use {"{numero}"} e {"{total}"}.
            </p>
            <textarea rows={3} value={confirmacao} disabled={!podeEditar} onChange={(e) => setConfirmacao(e.target.value)} />
          </div>

          <div className="bloco">
            <h2>Etapas do pedido</h2>
            <p className="pedido-detalhe">
              A ordem daqui é a trilha do pedido. Cada etapa pode ter a mensagem que o cliente recebe. Sem texto, a etapa muda e nada é enviado.
            </p>
            {etapas.map((etapa, i) => (
              <div className="etapa-item" key={etapa.id ?? `nova-${i}`}>
                <label>
                  Nome
                  <input value={etapa.nome} disabled={!podeEditar} onChange={(e) => alterar(i, "nome", e.target.value)} />
                </label>
                <label>
                  Mensagem
                  <textarea rows={2} value={etapa.mensagem} disabled={!podeEditar} onChange={(e) => alterar(i, "mensagem", e.target.value)} />
                </label>
                {podeEditar && (
                  <div className="etapa-comandos">
                    <button type="button" className="botao-secundario" disabled={i === 0} onClick={() => mover(i, -1)}>Subir</button>
                    <button type="button" className="botao-secundario" disabled={i === etapas.length - 1} onClick={() => mover(i, 1)}>Descer</button>
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
          </div>

          {podeEditar && (
            <button type="button" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          )}
          {aviso && <p className={aviso === "Configurações salvas." ? "pedido-ok" : "erro"}>{aviso}</p>}
        </>
      )}
    </>
  );
}
