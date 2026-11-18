import { useEffect, useState } from "react";
import { api } from "../api";

type Origem = { id: number; nome: string; ativo: boolean };

export function Origens({ podeEditar }: { podeEditar: boolean }) {
  const [origens, setOrigens] = useState<Origem[] | null>(null);
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");

  function carregar() {
    api("/admin/api/origens")
      .then(async (res) => {
        if (!res.ok) throw new Error("Não foi possível carregar as origens.");
        const json = (await res.json()) as { origens: Origem[] };
        setOrigens(json.origens);
      })
      .catch((e: Error) => setErro(e.message));
  }

  useEffect(() => {
    carregar();
  }, []);

  async function adicionar() {
    setErro("");
    const res = await api("/admin/api/origens", { method: "POST", body: JSON.stringify({ nome }) });
    const json = (await res.json().catch(() => ({}))) as { erro?: string };
    if (!res.ok) {
      setErro(json.erro || "Não foi possível incluir.");
      return;
    }
    setNome("");
    carregar();
  }

  async function alternar(origem: Origem) {
    await api(`/admin/api/origens/${origem.id}`, { method: "PATCH", body: JSON.stringify({ ativo: !origem.ativo }) });
    carregar();
  }

  return (
    <>
      <h1>Como conheceu</h1>
      <p className="pedido-detalhe">Origens perguntadas no orçamento, no site e no atendimento.</p>
      {podeEditar && (
        <div className="linha-busca">
          <input value={nome} placeholder="Nova origem" onChange={(e) => setNome(e.target.value)} />
          <button type="button" onClick={adicionar}>Incluir</button>
        </div>
      )}
      {erro && <p className="erro">{erro}</p>}
      {origens === null && !erro && <p>Carregando…</p>}
      {origens?.length === 0 && <p>Nenhuma origem cadastrada.</p>}
      {!!origens?.length && (
        <div className="bloco">
          <table className="tabela">
            <thead>
              <tr>
                <th>Origem</th>
                <th>Situação</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {origens.map((o) => (
                <tr key={o.id}>
                  <td>{o.nome}</td>
                  <td>{o.ativo ? "Ativa" : "Inativa"}</td>
                  <td>
                    {podeEditar && (
                      <button type="button" className="botao-secundario" onClick={() => alternar(o)}>
                        {o.ativo ? "Desativar" : "Ativar"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
