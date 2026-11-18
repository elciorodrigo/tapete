import { useEffect, useState } from "react";
import { STATUS_ROTULO, proximosStatus, type StatusPedido } from "@tapete/core";
import { api } from "../api";
import { centavosBRL, dataHora } from "../formato";

type Pedido = {
  id: number;
  numero: string;
  cliente: string;
  telefone: string;
  modalidade: string;
  pagamento: string | null;
  status: string;
  total_cents: number;
  criado_em: string;
  resumo: string;
  endereco: string;
};

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
};

type ChaveMensagem = "confirmacao" | "coleta" | "lavagem" | "secagem" | "rota";

const ROTULO_MENSAGEM: Record<ChaveMensagem, string> = {
  confirmacao: "Confirmação do orçamento",
  coleta: "Selecionado para coleta",
  lavagem: "Entrou em lavagem",
  secagem: "Entrou em secagem",
  rota: "Em rota de entrega",
};

const MODALIDADE: Record<string, string> = { coleta: "Coleta", balcao: "Retirada na loja" };
const PAGAMENTO: Record<string, string> = { pix: "Pix", cartao: "Cartão" };
const PERIODO: Record<string, string> = { qualquer: "Tanto faz", manha: "Manhã", tarde: "Tarde" };
const MENSAGEM_DA_ETAPA: Partial<Record<StatusPedido, ChaveMensagem>> = {
  COLETA_AGENDADA: "coleta",
  EM_LAVAGEM: "lavagem",
  EM_SECAGEM: "secagem",
  EM_ROTA: "rota",
};

function idDaUrl(): number | null {
  const id = Number(window.location.hash.match(/^#pedidos\/(\d+)$/)?.[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function previaMensagem(texto: string, numero: string, total: string): string {
  return texto.replaceAll("{numero}", numero).replaceAll("{total}", total);
}

function rotuloStatus(status: string): string {
  return status in STATUS_ROTULO ? STATUS_ROTULO[status as StatusPedido] : status;
}

function proximas(status: string): StatusPedido[] {
  return status in STATUS_ROTULO ? proximosStatus(status as StatusPedido) : [];
}

export function Pedidos({ podeEditar }: { podeEditar: boolean }) {
  const [pedidoId, setPedidoId] = useState<number | null>(idDaUrl);
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  const [erro, setErro] = useState("");
  const [mensagens, setMensagens] = useState<Record<ChaveMensagem, string> | null>(null);
  const [salvandoMensagens, setSalvandoMensagens] = useState(false);
  const [avisoMensagens, setAvisoMensagens] = useState("");

  useEffect(() => {
    const ouvir = () => setPedidoId(idDaUrl());
    window.addEventListener("hashchange", ouvir);
    return () => window.removeEventListener("hashchange", ouvir);
  }, []);

  useEffect(() => {
    api("/admin/api/pedidos")
      .then(async (res) => {
        if (!res.ok) throw new Error("Não foi possível carregar os pedidos.");
        const json = (await res.json()) as { pedidos: Pedido[] };
        setPedidos(json.pedidos);
      })
      .catch((e: Error) => setErro(e.message));

    api("/admin/api/mensagens")
      .then(async (res) => {
        if (!res.ok) return;
        const json = (await res.json()) as { mensagens: Record<ChaveMensagem, string> };
        setMensagens(json.mensagens);
      })
      .catch(() => {});
  }, []);

  async function salvarMensagens() {
    if (!mensagens) return;
    setSalvandoMensagens(true);
    setAvisoMensagens("");
    const res = await api("/admin/api/mensagens", { method: "PUT", body: JSON.stringify(mensagens) });
    const json = (await res.json().catch(() => ({}))) as { mensagens?: Record<ChaveMensagem, string>; erro?: string };
    setSalvandoMensagens(false);
    if (!res.ok) {
      setAvisoMensagens(json.erro || "Não foi possível salvar as mensagens.");
      return;
    }
    if (json.mensagens) setMensagens(json.mensagens);
    setAvisoMensagens("Mensagens salvas.");
  }

  if (pedidoId) {
    return (
      <DetalhePedido
        id={pedidoId}
        mensagens={mensagens}
        onAtualizado={(status) => setPedidos((atual) => atual?.map((p) => (p.id === pedidoId ? { ...p, status } : p)) ?? null)}
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
                    {p.cliente}
                    <small className="pedido-detalhe">
                      {p.telefone === "preview" ? "Aguardando o número do WhatsApp" : p.telefone}
                    </small>
                  </td>
                  <td>{p.resumo || "—"}</td>
                  <td>{centavosBRL(p.total_cents)}</td>
                  <td><span className="pedido-status">{rotuloStatus(p.status)}</span></td>
                  <td><a className="ver-pedido" href={`#pedidos/${p.id}`}>Ver</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mensagens && (
        <div className="bloco">
          <h2>Mensagens das etapas</h2>
          <p className="pedido-detalhe">
            O WhatsApp envia o texto salvo aqui. Use {"{numero}"} para o número do pedido e {"{total}"} para o valor.
          </p>
          {(Object.keys(ROTULO_MENSAGEM) as ChaveMensagem[]).map((chave) => (
            <label key={chave}>
              {ROTULO_MENSAGEM[chave]}
              <textarea
                rows={2}
                value={mensagens[chave]}
                disabled={!podeEditar}
                onChange={(e) => setMensagens({ ...mensagens, [chave]: e.target.value })}
              />
            </label>
          ))}
          {podeEditar && (
            <button type="button" onClick={salvarMensagens} disabled={salvandoMensagens}>
              {salvandoMensagens ? "Salvando…" : "Salvar mensagens"}
            </button>
          )}
          {avisoMensagens && <p className={avisoMensagens === "Mensagens salvas." ? "pedido-detalhe" : "erro"}>{avisoMensagens}</p>}
        </div>
      )}
    </>
  );
}

function DetalhePedido({
  id,
  mensagens,
  onAtualizado,
}: {
  id: number;
  mensagens: Record<ChaveMensagem, string> | null;
  onAtualizado: (status: string) => void;
}) {
  const [pedido, setPedido] = useState<Detalhe | null>(null);
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
        if (ativo) setPedido(json);
      })
      .catch((e: Error) => {
        if (ativo) setErro(e.message);
      });
    return () => {
      ativo = false;
    };
  }, [id]);

  async function mudarEtapa(status: StatusPedido) {
    if (!pedido) return;
    setMudando(true);
    setAviso("");
    const res = await api(`/admin/api/pedidos/${pedido.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    const json = (await res.json().catch(() => ({}))) as { status?: string; aviso?: string | null; erro?: string };
    setMudando(false);
    if (!res.ok) {
      setAvisoOk(false);
      setAviso(json.erro || "Não foi possível mudar a etapa.");
      return;
    }
    const novo = json.status ?? status;
    setPedido({
      ...pedido,
      status: novo,
      eventos: [...pedido.eventos, { de: pedido.status, para: novo, em: new Date().toISOString(), por: null }],
    });
    onAtualizado(novo);
    setAvisoOk(!json.aviso);
    setAviso(json.aviso || (MENSAGEM_DA_ETAPA[status] ? "Cliente avisado no WhatsApp." : "Etapa atualizada."));
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
  const proximasEtapas = proximas(pedido.status);

  return (
    <>
      <a className="ver-pedido" href="#pedidos">Voltar para a lista</a>
      <h1>{pedido.numero}</h1>
      <span className="pedido-status">{rotuloStatus(pedido.status)}</span>

      <div className="bloco">
        <h2>Cliente</h2>
        <dl className="ficha">
          <dt>Nome</dt>
          <dd>{pedido.cliente}</dd>
          <dt>WhatsApp</dt>
          <dd>{pedido.telefone === "preview" ? "Aguardando o número" : pedido.telefone}</dd>
          <dt>Unidade</dt>
          <dd>{pedido.unidade}</dd>
          <dt>Entrega</dt>
          <dd>
            {MODALIDADE[pedido.modalidade] ?? pedido.modalidade}
            {pedido.periodo ? ` · ${PERIODO[pedido.periodo] ?? pedido.periodo}` : ""}
          </dd>
          <dt>Pagamento</dt>
          <dd>{pedido.pagamento ? PAGAMENTO[pedido.pagamento] ?? pedido.pagamento : "—"}</dd>
          <dt>Endereço</dt>
          <dd>{pedido.endereco || "—"}</dd>
          <dt>Aberto em</dt>
          <dd>{dataHora(pedido.criado_em)}</dd>
        </dl>
      </div>

      <div className="bloco">
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
        <dl className="ficha">
          <dt>Subtotal</dt>
          <dd>{centavosBRL(pedido.subtotal_cents)}</dd>
          {pedido.taxa_cents > 0 && (
            <>
              <dt>Coleta</dt>
              <dd>{centavosBRL(pedido.taxa_cents)}</dd>
            </>
          )}
          {pedido.ajuste_cents > 0 && (
            <>
              <dt>Pedido mínimo</dt>
              <dd>{centavosBRL(pedido.ajuste_cents)}</dd>
            </>
          )}
          <dt>Total</dt>
          <dd>{total}</dd>
        </dl>
      </div>

      <div className="bloco">
        <h2>Andamento</h2>
        <p className="pedido-detalhe">Mudar a etapa avisa o cliente no WhatsApp de onde o pedido está.</p>
        {proximasEtapas.length === 0 && <p>Este pedido não tem próxima etapa.</p>}
        <div className="acoes-pedido">
          {proximasEtapas.map((status) => {
            const chave = MENSAGEM_DA_ETAPA[status];
            const texto = chave && mensagens?.[chave] ? previaMensagem(mensagens[chave], pedido.numero, total) : "";
            return (
              <button
                key={status}
                type="button"
                className={status === "CANCELADO" ? "botao-perigo" : undefined}
                disabled={mudando}
                onClick={() => mudarEtapa(status)}
                title={texto || undefined}
              >
                {status === "CANCELADO" ? "Cancelar" : `Avisar: ${rotuloStatus(status)}`}
              </button>
            );
          })}
        </div>
        {proximasEtapas.map((status) => {
          const chave = MENSAGEM_DA_ETAPA[status];
          const texto = chave && mensagens?.[chave] ? previaMensagem(mensagens[chave], pedido.numero, total) : "";
          if (!texto) return null;
          return (
            <p key={status} className="pedido-detalhe">
              {rotuloStatus(status)}: {texto}
            </p>
          );
        })}
        {aviso && <p className={avisoOk ? "pedido-detalhe" : "erro"}>{aviso}</p>}
        {pedido.eventos.length > 0 && (
          <ul>
            {pedido.eventos.map((evento, i) => (
              <li key={`${evento.em}-${i}`}>
                {rotuloStatus(evento.para)}
                <small className="pedido-detalhe">
                  {dataHora(evento.em)}
                  {evento.por ? ` · ${evento.por}` : ""}
                </small>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
