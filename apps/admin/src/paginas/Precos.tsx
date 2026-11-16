import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { CampoNumero } from "../CampoNumero";
import { buscarCatalogo, type Catalogo, type ItemPreco, type Unidade, type Versao } from "../catalogo";
import { dataHora, slug } from "../formato";

function copiar<T>(v: T): T {
  return structuredClone(v);
}

function idUnico(base: string, usados: string[]): string {
  const raiz = slug(base) || "item";
  let id = raiz;
  for (let i = 2; usados.includes(id); i++) id = `${raiz}_${i}`;
  return id;
}

/** Preenche ids de itens e unidades novos a partir do nome. */
function completarIds(c: Catalogo): Catalogo {
  const novo = copiar(c);
  const idsUnidades = novo.unidades.map((u) => u.id).filter(Boolean);
  for (const u of novo.unidades) {
    if (!u.id) {
      u.id = idUnico(u.nome, idsUnidades);
      idsUnidades.push(u.id);
    }
    const usados = [...u.tipos, ...u.adicionais].map((i) => i.id).filter(Boolean);
    for (const item of [...u.tipos, ...u.adicionais]) {
      if (!item.id) {
        item.id = idUnico(item.nome, usados);
        usados.push(item.id);
      }
    }
  }
  return novo;
}

export function Precos({ podeEditar }: { podeEditar: boolean }) {
  const [original, setOriginal] = useState<Catalogo | null>(null);
  const [rascunho, setRascunho] = useState<Catalogo | null>(null);
  const [versao, setVersao] = useState<Versao | null>(null);
  const [idx, setIdx] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string; detalhes?: string[] } | null>(null);

  useEffect(() => {
    buscarCatalogo()
      .then((r) => {
        setOriginal(r.catalogo);
        setRascunho(copiar(r.catalogo));
        setVersao(r.versao);
      })
      .catch((e: Error) => setAviso({ tipo: "erro", texto: e.message }));
  }, []);

  const alterado = useMemo(
    () => !!original && !!rascunho && JSON.stringify(original) !== JSON.stringify(rascunho),
    [original, rascunho],
  );

  if (!rascunho) {
    return (
      <>
        <h1>Preços e configurações</h1>
        {aviso && <p className="erro">{aviso.texto}</p>}
      </>
    );
  }

  const unidade = rascunho.unidades[idx] ?? rascunho.unidades[0]!;
  const travado = !podeEditar;

  function mudarCatalogo(f: (c: Catalogo) => void) {
    setRascunho((atual) => {
      const novo = copiar(atual!);
      f(novo);
      return novo;
    });
    setAviso(null);
  }

  function mudarUnidade(f: (u: Unidade) => void) {
    mudarCatalogo((c) => f(c.unidades[idx]!));
  }

  function novaUnidade() {
    mudarCatalogo((c) => {
      c.unidades.push({
        ...copiar(unidade),
        id: "",
        nome: "Tapetê – Nova unidade",
        endereco_loja: "",
        ceps: [["", ""]],
      });
    });
    setIdx(rascunho!.unidades.length);
  }

  function removerUnidade() {
    if (!confirm(`Remover a unidade "${unidade.nome}"?`)) return;
    mudarCatalogo((c) => {
      c.unidades.splice(idx, 1);
    });
    setIdx(0);
  }

  async function salvar() {
    setSalvando(true);
    setAviso(null);
    try {
      const res = await api("/admin/api/catalogo", { method: "PUT", body: JSON.stringify(completarIds(rascunho!)) });
      const corpo = await res.json();
      if (!res.ok) {
        setAviso({ tipo: "erro", texto: "Não foi possível salvar. Confira os campos:", detalhes: corpo.detalhes ?? [corpo.erro] });
        return;
      }
      setOriginal(corpo.catalogo);
      setRascunho(copiar(corpo.catalogo));
      setVersao(corpo.versao);
      setAviso({ tipo: "ok", texto: "Preços salvos. O WhatsApp e o site já usam os valores novos." });
    } catch {
      setAviso({ tipo: "erro", texto: "Não foi possível conectar ao servidor." });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="precos">
      <div className="titulo-linha">
        <h1>Preços e configurações</h1>
        {versao && (
          <p className="versao">
            Última alteração: {dataHora(versao.atualizado_em)}
            {versao.atualizado_por ? ` por ${versao.atualizado_por}` : " (importado do arquivo inicial)"}
          </p>
        )}
      </div>
      {travado && <p className="info">Somente administradores podem alterar os preços.</p>}

      <div className="abas-unidades">
        {rascunho.unidades.map((u, i) => (
          <button key={i} className={i === idx ? "aba ativa" : "aba"} onClick={() => setIdx(i)}>
            {u.nome || "Sem nome"}
          </button>
        ))}
        {!travado && (
          <button className="aba aba-nova" onClick={novaUnidade}>
            + Nova unidade
          </button>
        )}
      </div>

      <section className="bloco">
        <h2>Unidade</h2>
        <div className="grade-campos">
          <label>
            Nome
            <input value={unidade.nome} disabled={travado} onChange={(e) => mudarUnidade((u) => void (u.nome = e.target.value))} />
          </label>
          <label>
            Endereço da loja
            <input
              value={unidade.endereco_loja}
              disabled={travado}
              onChange={(e) => mudarUnidade((u) => void (u.endereco_loja = e.target.value))}
            />
          </label>
          <label>
            Taxa de coleta e entrega
            <CampoNumero prefixo="R$" valor={unidade.taxa_coleta} disabled={travado} onChange={(n) => mudarUnidade((u) => void (u.taxa_coleta = n))} />
          </label>
          <label>
            Pedido mínimo
            <CampoNumero prefixo="R$" valor={unidade.pedido_minimo} disabled={travado} onChange={(n) => mudarUnidade((u) => void (u.pedido_minimo = n))} />
          </label>
          <label>
            Área mínima cobrada por tapete
            <CampoNumero sufixo="m²" valor={unidade.area_minima_m2} disabled={travado} onChange={(n) => mudarUnidade((u) => void (u.area_minima_m2 = n))} />
          </label>
          <label>
            Arredondar medidas para cima a cada
            <CampoNumero sufixo="m" valor={unidade.arredondamento_m} disabled={travado} onChange={(n) => mudarUnidade((u) => void (u.arredondamento_m = n))} />
          </label>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={unidade.aceita_balcao}
            disabled={travado}
            onChange={(e) => mudarUnidade((u) => void (u.aceita_balcao = e.target.checked))}
          />
          O cliente pode levar e retirar na loja (sem taxa de coleta)
        </label>
      </section>

      <TabelaItens
        titulo="Tipos de tapete"
        descricao="Preço por m² de cada tipo. Aparecem na lista do WhatsApp e do site."
        itens={unidade.tipos}
        travado={travado}
        onChange={(itens) => mudarUnidade((u) => void (u.tipos = itens))}
        rotuloNovo="tipo de tapete"
      />

      <TabelaItens
        titulo="Adicionais"
        descricao="Somados ao preço do m² quando o cliente marca o adicional."
        itens={unidade.adicionais}
        travado={travado}
        onChange={(itens) => mudarUnidade((u) => void (u.adicionais = itens))}
        rotuloNovo="adicional"
      />

      <section className="bloco">
        <h2>Área atendida (faixas de CEP)</h2>
        <p className="descricao">CEPs dentro destas faixas são atendidos por esta unidade.</p>
        {unidade.ceps.map(([ini, fim], i) => (
          <div className="linha-cep" key={i}>
            <input
              value={ini}
              placeholder="00000-000"
              aria-label="CEP inicial"
              disabled={travado}
              onChange={(e) => mudarUnidade((u) => void (u.ceps[i]![0] = e.target.value))}
            />
            <span>até</span>
            <input
              value={fim}
              placeholder="00000-000"
              aria-label="CEP final"
              disabled={travado}
              onChange={(e) => mudarUnidade((u) => void (u.ceps[i]![1] = e.target.value))}
            />
            {!travado && unidade.ceps.length > 1 && (
              <button className="remover" onClick={() => mudarUnidade((u) => void u.ceps.splice(i, 1))} aria-label="Remover faixa">
                ×
              </button>
            )}
          </div>
        ))}
        {!travado && (
          <button className="botao-link" onClick={() => mudarUnidade((u) => void u.ceps.push(["", ""]))}>
            + Adicionar faixa de CEP
          </button>
        )}
      </section>

      <section className="bloco">
        <h2>Geral</h2>
        <div className="grade-campos">
          <label>
            Nome da marca
            <input value={rascunho.marca} disabled={travado} onChange={(e) => mudarCatalogo((c) => void (c.marca = e.target.value))} />
          </label>
          <label>
            Link dos termos de serviço
            <input
              value={rascunho.termos_url}
              disabled={travado}
              onChange={(e) => mudarCatalogo((c) => void (c.termos_url = e.target.value))}
            />
          </label>
        </div>
        {!travado && rascunho.unidades.length > 1 && (
          <button className="botao-perigo" onClick={removerUnidade}>
            Remover a unidade “{unidade.nome}”
          </button>
        )}
      </section>

      {aviso && (
        <div className={aviso.tipo === "ok" ? "aviso aviso-ok" : "aviso aviso-erro"}>
          <p>{aviso.texto}</p>
          {aviso.detalhes && (
            <ul>
              {aviso.detalhes.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!travado && alterado && (
        <div className="barra-salvar">
          <span>Há alterações não salvas</span>
          <button className="botao-secundario" onClick={() => setRascunho(copiar(original!))} disabled={salvando}>
            Descartar
          </button>
          <button onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar alterações"}
          </button>
        </div>
      )}
    </div>
  );
}

function TabelaItens(props: {
  titulo: string;
  descricao: string;
  itens: ItemPreco[];
  travado: boolean;
  rotuloNovo: string;
  onChange: (itens: ItemPreco[]) => void;
}) {
  const { itens, travado, onChange } = props;

  function mudar(i: number, campo: "nome" | "preco_m2", valor: string | number) {
    const novos = itens.map((it, j) => (j === i ? { ...it, [campo]: valor } : it));
    onChange(novos);
  }

  return (
    <section className="bloco">
      <h2>{props.titulo}</h2>
      <p className="descricao">{props.descricao}</p>
      <table className="tabela">
        <thead>
          <tr>
            <th>Nome</th>
            <th className="col-preco">Preço por m²</th>
            <th aria-label="Ações" />
          </tr>
        </thead>
        <tbody>
          {itens.map((it, i) => (
            <tr key={i}>
              <td>
                <input value={it.nome} disabled={travado} aria-label="Nome" onChange={(e) => mudar(i, "nome", e.target.value)} />
                {it.id && <small className="id">código: {it.id}</small>}
              </td>
              <td>
                <CampoNumero prefixo="R$" valor={it.preco_m2} disabled={travado} ariaLabel="Preço por m²" onChange={(n) => mudar(i, "preco_m2", n)} />
              </td>
              <td className="col-acao">
                {!travado && (
                  <button className="remover" aria-label="Remover" onClick={() => onChange(itens.filter((_, j) => j !== i))}>
                    ×
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!travado && (
        <button className="botao-link" onClick={() => onChange([...itens, { id: "", nome: "", preco_m2: 0 }])}>
          + Adicionar {props.rotuloNovo}
        </button>
      )}
    </section>
  );
}
