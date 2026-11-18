import { useEffect, useState } from "react";
import { api } from "../api";
import { centavosBRL, dataHora } from "../formato";

type Pedido = {
  id: number;
  numero: string;
  cliente: string;
  contato: string | null;
  telefone: string;
  modalidade: string;
  pagamento: string | null;
  status: string;
  total_cents: number;
  criado_em: string;
  resumo: string;
  endereco: string;
  etapa_id: number | null;
  etapa: string;
  cancelado: boolean;
};

type Etapa = { id: number; nome: string; mensagem: string };

type ItemPedido = { nome: string; medidas: string; adicionais: string; valor_cents: number };

type EventoPedido = { de: string | null; para: string; em: string; por: string | null };

type Detalhe = Pedido & {
  unidade: string;
  periodo: string | null;
  itens: ItemPedido[];
  subtotal_cents: number;
  taxa_cents: number;
  ajuste_cents: number;
  eventos: EventoPedido[];
  etapas: Etapa[];
};

const MODALIDADE: Record<string, string> = { coleta: "Coleta", balcao: "Retirada na loja" };
const PAGAMENTO: Record<string, string> = { pix: "Pix", cartao: "Cartão" };
const PERIODO: Record<string, string> = { qualquer: "Tanto faz", manha: "Manhã", tarde: "Tarde" };
const ANTIGOS: Record<string, string> = {
  NOVO: "Novo",
  CONFIRMADO: "Confirmado",
  COLETA_AGENDADA: "Coleta agendada",
  COLETADO: "Coletado",
  EM_LAVAGEM: "Em lavagem",
  EM_SECAGEM: "Em secagem",
  PRONTO: "Pronto",
  EM_ROTA: "Em rota de entrega",
  ENTREGUE: "Entregue",
  CANCELADO: "Cancelado",
};

function idDaUrl(): number | null {
  const id = Number(window.location.hash.match(/^#pedidos\/(\d+)$/)?.[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function previaMensagem(texto: string, numero: string, total: string): string {
  return texto.replaceAll("{numero}", numero).replaceAll("{total}", total);
}

function nomeEvento(status: string): string {
  return ANTIGOS[status] ?? status;
}

function telefoneVisivel(telefone: string): string {
  const d = telefone.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12 && d.startsWith("55")) return `+55 (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return telefone;
}

export function Pedidos() {
  const [pedidoId, setPedidoId] = useState<number | null>(idDaUrl);
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    const ouvir = () => setPedidoId(idDaUrl());
    window.addEventListener("hashchange", ouvir);
    return () => window.removeEventListener("hashchange", ouvir);
  }, []);

  useEffect(() => {
    if (pedidoId) return;
    let ativo = true;
    async function carregar() {
      try {
        const res = await api("/admin/api/pedidos");
        if (!res.ok) throw new Error("Não foi possível carregar os pedidos.");
        const json = (await res.json()) as { pedidos: Pedido[] };
        if (!ativo) return;
        setPedidos(json.pedidos);
        setErro("");
      } catch (e) {
        if (ativo) setErro(e instanceof Error ? e.message : "Não foi possível carregar os pedidos.");
      }
    }
    void carregar();
    const timer = window.setInterval(() => void carregar(), 10000);
    window.addEventListener("focus", carregar);
    return () => {
      ativo = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", carregar);
    };
  }, [pedidoId]);

  if (pedidoId) {
    return (
      <DetalhePedido
        id={pedidoId}
        onAtualizado={(info) => setPedidos((atual) => atual?.map((p) => (p.id === pedidoId ? { ...p, ...info } : p)) ?? null)}
      />
    );
  }

  return (
    <>
      <h1>Pedidos</h1>
      {erro && <p className="erro">{erro}</p>}
      {pedidos === null && !erro && <p>Carregando…</p>}
      {pedidos?.length === 0 && (
        <div className="vazio">
          <p className="vazio-titulo">Nenhum pedido ainda</p>
          <p>Os orçamentos confirmados no WhatsApp aparecem aqui.</p>
        </div>
      )}
      {!!pedidos?.length && (
        <div className="bloco">
          <table className="tabela">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Itens</th>
                <th>Total</th>
                <th>Etapa</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.numero}</strong>
                    <small className="pedido-detalhe">{dataHora(p.criado_em)}</small>
                  </td>
                  <td>
                    {p.contato || p.cliente}
                    <small className="pedido-detalhe">
                      {p.telefone === "preview" ? "Aguardando o número do WhatsApp" : p.telefone}
                    </small>
                  </td>
                  <td>{p.resumo || "—"}</td>
                  <td>{centavosBRL(p.total_cents)}</td>
                  <td><span className="pedido-status">{p.etapa}</span></td>
                  <td><a className="ver-pedido" href={`#pedidos/${p.id}`}>Ver</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function DetalhePedido({
  id,
  onAtualizado,
}: {
  id: number;
  onAtualizado: (info: { etapa_id: number | null; etapa: string; cancelado: boolean }) => void;
}) {
  const [pedido, setPedido] = useState<Detalhe | null>(null);
  const [escolha, setEscolha] = useState<number | "">("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [avisoOk, setAvisoOk] = useState(true);
  const [mudando, setMudando] = useState(false);

  useEffect(() => {
    let ativo = true;
    setPedido(null);
    setErro("");
    setAviso("");
    api(`/admin/api/pedidos/${id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Pedido não encontrado.");
        const json = (await res.json()) as Detalhe;
        if (!ativo) return;
        setPedido(json);
        const indice = json.etapas.findIndex((e) => e.id === json.etapa_id);
        const seguinte = json.etapas[indice + 1] ?? json.etapas[0];
        setEscolha(seguinte && seguinte.id !== json.etapa_id ? seguinte.id : "");
      })
      .catch((e: Error) => {
        if (ativo) setErro(e.message);
      });
    return () => {
      ativo = false;
    };
  }, [id]);

  async function mudarEtapa(corpo: { etapa_id: number } | { cancelar: true }) {
    if (!pedido) return;
    setMudando(true);
    setAviso("");
    const res = await api(`/admin/api/pedidos/${pedido.id}`, { method: "PATCH", body: JSON.stringify(corpo) });
    const json = (await res.json().catch(() => ({}))) as {
      etapa_id?: number | null;
      etapa?: string;
      cancelado?: boolean;
      aviso?: string | null;
      erro?: string;
    };
    setMudando(false);
    if (!res.ok || json.etapa == null || json.cancelado == null) {
      setAvisoOk(false);
      setAviso(json.erro || "Não foi possível mudar a etapa.");
      return;
    }
    const info = { etapa_id: json.etapa_id ?? null, etapa: json.etapa, cancelado: json.cancelado };
    setPedido({
      ...pedido,
      ...info,
      eventos: [...pedido.eventos, { de: pedido.etapa, para: info.etapa, em: new Date().toISOString(), por: null }],
    });
    onAtualizado(info);
    const escolhida = "etapa_id" in corpo ? pedido.etapas.find((e) => e.id === corpo.etapa_id) : undefined;
    setAvisoOk(!json.aviso);
    setAviso(json.aviso || (escolhida?.mensagem.trim() ? "Cliente avisado no WhatsApp." : "Etapa atualizada."));
  }

  if (erro) {
    return (
      <>
        <a className="ver-pedido" href="#pedidos">Voltar para a lista</a>
        <h1>Pedido</h1>
        <p className="erro">{erro}</p>
      </>
    );
  }

  if (!pedido) return <p>Carregando…</p>;

  const total = centavosBRL(pedido.total_cents);
  const indiceAtual = pedido.etapas.findIndex((e) => e.id === pedido.etapa_id);
  const escolhida = pedido.etapas.find((e) => e.id === escolha);
  const textoAviso = escolhida?.mensagem.trim() ? previaMensagem(escolhida.mensagem, pedido.numero, total) : "";
  const nome = pedido.contato || pedido.cliente;
  const telefone = pedido.telefone === "preview" ? "" : telefoneVisivel(pedido.telefone);

  return (
    <div className="pedido-pagina">
      <a className="pedido-voltar" href="#pedidos">Pedidos</a>

      <header className="pedido-topo">
        <div>
          <p className="pedido-kicker">{dataHora(pedido.criado_em)} · {pedido.unidade}</p>
          <h1>{pedido.numero}</h1>
          <p className="pedido-sub">
            {MODALIDADE[pedido.modalidade] ?? pedido.modalidade}
            {pedido.periodo ? ` · ${PERIODO[pedido.periodo] ?? pedido.periodo}` : ""}
            {pedido.pagamento ? ` · ${PAGAMENTO[pedido.pagamento] ?? pedido.pagamento}` : ""}
          </p>
        </div>
        <div className="pedido-topo-valor">
          <span>Total</span>
          <strong>{total}</strong>
          <span className="pedido-status">{pedido.etapa}</span>
        </div>
      </header>

      {pedido.cancelado ? (
        <p className="pedido-cancelado">Pedido cancelado</p>
      ) : (
        <ol className="trilha">
          <li className={pedido.etapa_id ? "feita" : "atual"}>Recebido</li>
          {pedido.etapas.map((etapa, i) => (
            <li key={etapa.id} className={i < indiceAtual ? "feita" : i === indiceAtual ? "atual" : undefined}>
              {etapa.nome}
            </li>
          ))}
        </ol>
      )}

      <div className="pedido-grade">
        <section className="bloco">
          <h2>Tapetes</h2>
          <table className="tabela">
            <thead>
              <tr>
                <th>Item</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {pedido.itens.map((item, i) => (
                <tr key={`${item.nome}-${i}`}>
                  <td>
                    {item.nome}
                    {item.medidas && <small className="pedido-detalhe">{item.medidas}</small>}
                    {item.adicionais && <small className="pedido-detalhe">{item.adicionais}</small>}
                  </td>
                  <td>{centavosBRL(item.valor_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="totais">
            <div><span>Subtotal</span><span>{centavosBRL(pedido.subtotal_cents)}</span></div>
            {pedido.taxa_cents > 0 && <div><span>Coleta</span><span>{centavosBRL(pedido.taxa_cents)}</span></div>}
            {pedido.ajuste_cents > 0 && <div><span>Pedido mínimo</span><span>{centavosBRL(pedido.ajuste_cents)}</span></div>}
            <div className="total"><span>Total</span><span>{total}</span></div>
          </div>
        </section>

        <aside className="pedido-lateral">
          <section className="bloco">
            <h2>Cliente</h2>
            <p className="pedido-pessoa">{nome}</p>
            {pedido.contato && pedido.contato !== pedido.cliente && <p className="pedido-linha"><span>Nome no pedido</span>{pedido.cliente}</p>}
            <p className="pedido-linha">
              <span>WhatsApp</span>
              {telefone || "O número chega quando o WhatsApp confirmar o contato"}
            </p>
            <p className="pedido-linha"><span>Endereço</span>{pedido.endereco || "Retirada na loja"}</p>
          </section>

          <section className="bloco pedido-acao">
            <h2>Mover etapa</h2>
            {pedido.etapas.length > 0 && (
              <label>
                Etapa
                <select value={escolha} onChange={(e) => setEscolha(e.target.value ? Number(e.target.value) : "")}>
                  <option value="">Escolha</option>
                  {pedido.etapas.map((etapa) => (
                    <option key={etapa.id} value={etapa.id}>{etapa.nome}</option>
                  ))}
                </select>
              </label>
            )}
            {textoAviso && (
              <div className="aviso-whats">
                <small>Mensagem para {nome}</small>
                <p>{textoAviso}</p>
              </div>
            )}
            {escolhida && !textoAviso && <p className="pedido-detalhe">Essa etapa não envia mensagem.</p>}
            <button type="button" disabled={mudando || !escolhida} onClick={() => escolhida && mudarEtapa({ etapa_id: escolhida.id })}>
              {mudando ? "Salvando…" : "Atualizar etapa"}
            </button>
            {aviso && <p className={avisoOk ? "pedido-ok" : "erro"}>{aviso}</p>}
            {!pedido.cancelado && (
              <button type="button" className="botao-perigo" disabled={mudando} onClick={() => mudarEtapa({ cancelar: true })}>
                Cancelar pedido
              </button>
            )}
            {pedido.eventos.length > 0 && (
              <ul className="historico">
                {pedido.eventos.map((evento, i) => (
                  <li key={`${evento.em}-${i}`}>
                    <span>{nomeEvento(evento.para)}</span>
                    <small>{dataHora(evento.em)}{evento.por ? ` · ${evento.por}` : ""}</small>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
