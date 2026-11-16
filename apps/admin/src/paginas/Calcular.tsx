import { useEffect, useState } from "react";
import { api } from "../api";
import { buscarCatalogo, type Catalogo, type Orcamento } from "../catalogo";
import { centavosBRL, lerNumero, numero, reaisBRL } from "../formato";

type Linha = {
  tipo: string;
  formato: "retangular" | "redondo";
  largura: string;
  comprimento: string;
  diametro: string;
  adicionais: string[];
};

const linhaVazia = (tipo: string): Linha => ({
  tipo,
  formato: "retangular",
  largura: "",
  comprimento: "",
  diametro: "",
  adicionais: [],
});

function paraItem(l: Linha) {
  return {
    tipo: l.tipo,
    adicionais: l.adicionais,
    medidas:
      l.formato === "redondo"
        ? { formato: "redondo" as const, diametro: lerNumero(l.diametro) }
        : { formato: "retangular" as const, largura: lerNumero(l.largura), comprimento: lerNumero(l.comprimento) },
  };
}

function preenchida(l: Linha) {
  return l.formato === "redondo" ? !!l.diametro.trim() : !!l.largura.trim() && !!l.comprimento.trim();
}

export function Calcular() {
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [unidadeId, setUnidadeId] = useState("");
  const [modalidade, setModalidade] = useState<"coleta" | "balcao">("coleta");
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [resultado, setResultado] = useState<Orcamento | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    buscarCatalogo()
      .then(({ catalogo }) => {
        const u = catalogo.unidades[0]!;
        setCatalogo(catalogo);
        setUnidadeId(u.id);
        setLinhas([linhaVazia(u.tipos[0]!.id)]);
      })
      .catch((e: Error) => setErro(e.message));
  }, []);

  const unidade = catalogo?.unidades.find((u) => u.id === unidadeId);

  useEffect(() => {
    if (!unidade) return;
    const completas = linhas.filter(preenchida);
    if (completas.length === 0) {
      setResultado(null);
      setErro(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await api("/admin/api/simular", {
          method: "POST",
          body: JSON.stringify({ unidade_id: unidade.id, modalidade, itens: completas.map(paraItem) }),
        });
        const corpo = await res.json();
        if (res.ok) {
          setResultado(corpo);
          setErro(null);
        } else {
          setResultado(null);
          setErro(corpo.erro ?? "Não foi possível calcular.");
        }
      } catch {
        setErro("Não foi possível conectar ao servidor.");
      }
    }, 250);
    return () => clearTimeout(t);
  }, [linhas, modalidade, unidade]);

  if (!catalogo || !unidade) {
    return (
      <>
        <h1>Calcular preço</h1>
        {erro && <p className="erro">{erro}</p>}
      </>
    );
  }

  function mudar(i: number, campos: Partial<Linha>) {
    setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...campos } : l)));
  }

  function trocarUnidade(id: string) {
    const u = catalogo!.unidades.find((x) => x.id === id)!;
    setUnidadeId(id);
    setLinhas([linhaVazia(u.tipos[0]!.id)]);
    if (!u.aceita_balcao) setModalidade("coleta");
  }

  return (
    <div className="calcular">
      <h1>Calcular preço</h1>
      <p className="descricao">Mesmo cálculo usado no WhatsApp e no site, com os preços salvos agora.</p>

      <div className="calcular-grade">
        <div>
          <section className="bloco">
            <div className="grade-campos">
              <label>
                Unidade
                <select value={unidadeId} onChange={(e) => trocarUnidade(e.target.value)}>
                  {catalogo.unidades.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="opcoes">
                <legend>Entrega</legend>
                <label className="check">
                  <input type="radio" checked={modalidade === "coleta"} onChange={() => setModalidade("coleta")} />
                  Coleta em casa ({reaisBRL(unidade.taxa_coleta)})
                </label>
                {unidade.aceita_balcao && (
                  <label className="check">
                    <input type="radio" checked={modalidade === "balcao"} onChange={() => setModalidade("balcao")} />
                    Leva e retira na loja
                  </label>
                )}
              </fieldset>
            </div>
          </section>

          {linhas.map((l, i) => (
            <section className="bloco tapete" key={i}>
              <div className="tapete-topo">
                <h2>Tapete {i + 1}</h2>
                {linhas.length > 1 && (
                  <button className="remover" aria-label="Remover tapete" onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}>
                    ×
                  </button>
                )}
              </div>
              <div className="grade-campos">
                <label>
                  Tipo
                  <select value={l.tipo} onChange={(e) => mudar(i, { tipo: e.target.value })}>
                    {unidade.tipos.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nome} · {reaisBRL(t.preco_m2)}/m²
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset className="opcoes">
                  <legend>Formato</legend>
                  <label className="check">
                    <input type="radio" checked={l.formato === "retangular"} onChange={() => mudar(i, { formato: "retangular" })} />
                    Retangular
                  </label>
                  <label className="check">
                    <input type="radio" checked={l.formato === "redondo"} onChange={() => mudar(i, { formato: "redondo" })} />
                    Redondo
                  </label>
                </fieldset>
                {l.formato === "retangular" ? (
                  <>
                    <label>
                      Largura (m)
                      <input inputMode="decimal" placeholder="2,00" value={l.largura} onChange={(e) => mudar(i, { largura: e.target.value })} />
                    </label>
                    <label>
                      Comprimento (m)
                      <input inputMode="decimal" placeholder="3,00" value={l.comprimento} onChange={(e) => mudar(i, { comprimento: e.target.value })} />
                    </label>
                  </>
                ) : (
                  <label>
                    Diâmetro (m)
                    <input inputMode="decimal" placeholder="1,50" value={l.diametro} onChange={(e) => mudar(i, { diametro: e.target.value })} />
                  </label>
                )}
              </div>
              {unidade.adicionais.length > 0 && (
                <fieldset className="opcoes opcoes-linha">
                  <legend>Adicionais</legend>
                  {unidade.adicionais.map((a) => (
                    <label className="check" key={a.id}>
                      <input
                        type="checkbox"
                        checked={l.adicionais.includes(a.id)}
                        onChange={(e) =>
                          mudar(i, {
                            adicionais: e.target.checked ? [...l.adicionais, a.id] : l.adicionais.filter((x) => x !== a.id),
                          })
                        }
                      />
                      {a.nome} (+{reaisBRL(a.preco_m2)}/m²)
                    </label>
                  ))}
                </fieldset>
              )}
            </section>
          ))}

          <button className="botao-link" onClick={() => setLinhas((ls) => [...ls, linhaVazia(unidade.tipos[0]!.id)])}>
            + Adicionar outro tapete
          </button>
        </div>

        <aside className="bloco resumo">
          <h2>Orçamento</h2>
          {erro && <p className="erro">{erro}</p>}
          {!resultado && !erro && <p className="descricao">Preencha as medidas para ver o valor.</p>}
          {resultado && (
            <>
              <ul className="resumo-itens">
                {resultado.itens.map((it, i) => (
                  <li key={i}>
                    <div>
                      <strong>{it.tipo_nome}</strong>
                      <span>
                        {it.medidas.formato === "redondo"
                          ? `Ø ${numero(it.medidas.diametro)} m`
                          : `${numero(it.medidas.largura)} × ${numero(it.medidas.comprimento)} m`}
                        {" · "}
                        {numero(it.area_m2)} m² × {centavosBRL(it.preco_m2)}
                      </span>
                      {it.adicionais_nomes.length > 0 && <span>+ {it.adicionais_nomes.join(", ")}</span>}
                    </div>
                    <b>{centavosBRL(it.valor)}</b>
                  </li>
                ))}
              </ul>
              <dl className="resumo-totais">
                <dt>Subtotal</dt>
                <dd>{centavosBRL(resultado.subtotal)}</dd>
                <dt>Taxa de coleta</dt>
                <dd>{resultado.taxa_coleta ? centavosBRL(resultado.taxa_coleta) : "—"}</dd>
                {resultado.ajuste_minimo > 0 && (
                  <>
                    <dt>Complemento do pedido mínimo</dt>
                    <dd>{centavosBRL(resultado.ajuste_minimo)}</dd>
                  </>
                )}
                <dt className="total">Total</dt>
                <dd className="total">{centavosBRL(resultado.total)}</dd>
              </dl>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
