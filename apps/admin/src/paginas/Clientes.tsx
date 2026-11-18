import { useEffect, useState } from "react";
import { api } from "../api";
import { centavosBRL, dataHora } from "../formato";

type Cliente = {
  id: number;
  nome: string;
  telefone: string | null;
  pedidos: number;
  ultimo_pedido: string | null;
  criado_em: string;
};

type PedidoCliente = {
  id: number;
  numero: string;
  etapa: string;
  total_cents: number;
  modalidade: string;
  criado_em: string;
};

type Ficha = {
  id: number;
  nome: string;
  telefone: string | null;
  criado_em: string;
  pedidos: PedidoCliente[];
};

function idDaUrl(): number | null {
  const id = Number(window.location.hash.match(/^#clientes\/(\d+)$/)?.[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function telefoneVisivel(telefone: string | null): string {
  if (!telefone) return "Sem WhatsApp";
  const d = telefone.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12 && d.startsWith("55")) return `+55 (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return telefone;
}

export function Clientes() {
  const [clienteId, setClienteId] = useState<number | null>(idDaUrl);

  useEffect(() => {
    const ouvir = () => setClienteId(idDaUrl());
    window.addEventListener("hashchange", ouvir);
    return () => window.removeEventListener("hashchange", ouvir);
  }, []);

  if (clienteId) return <FichaCliente id={clienteId} />;
  return <ListaClientes />;
}

function ListaClientes() {
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [busca, setBusca] = useState("");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  function carregar(q = busca) {
    const url = q.trim() ? `/admin/api/clientes?q=${encodeURIComponent(q.trim())}` : "/admin/api/clientes";
    api(url)
      .then(async (res) => {
        if (!res.ok) throw new Error("Não foi possível carregar os clientes.");
        const json = (await res.json()) as { clientes: Cliente[] };
        setClientes(json.clientes);
        setErro("");
      })
      .catch((e: Error) => setErro(e.message));
  }

  useEffect(() => {
    carregar("");
  }, []);

  async function cadastrar() {
    setAviso("");
    const res = await api("/admin/api/clientes", { method: "POST", body: JSON.stringify({ nome, telefone }) });
    const json = (await res.json().catch(() => ({}))) as { id?: number; erro?: string };
    if (!res.ok || !json.id) {
      setAviso(json.erro || "Não foi possível cadastrar.");
      return;
    }
    window.location.hash = `clientes/${json.id}`;
  }

  return (
    <>
      <h1>Clientes</h1>
      <div className="bloco">
        <h2>Novo cliente</h2>
        <div className="grade-campos">
          <label>
            Nome
            <input value={nome} onChange={(e) => setNome(e.target.value)} />
          </label>
          <label>
            WhatsApp
            <input value={telefone} placeholder="DDD e número" onChange={(e) => setTelefone(e.target.value)} />
          </label>
        </div>
        <button type="button" onClick={cadastrar}>Cadastrar</button>
        {aviso && <p className="erro">{aviso}</p>}
      </div>

      <div className="linha-busca">
        <input
          value={busca}
          placeholder="Buscar por nome ou WhatsApp"
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") carregar();
          }}
        />
        <button type="button" className="botao-secundario" onClick={() => carregar()}>Buscar</button>
      </div>

      {erro && <p className="erro">{erro}</p>}
      {clientes === null && !erro && <p>Carregando…</p>}
      {clientes?.length === 0 && <p>Nenhum cliente encontrado.</p>}
      {!!clientes?.length && (
        <div className="bloco">
          <table className="tabela">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>WhatsApp</th>
                <th>Pedidos</th>
                <th>Último pedido</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.nome}</strong>
                    <small className="pedido-detalhe">Desde {dataHora(c.criado_em)}</small>
                  </td>
                  <td>{telefoneVisivel(c.telefone)}</td>
                  <td>{c.pedidos}</td>
                  <td>{c.ultimo_pedido ? dataHora(c.ultimo_pedido) : "—"}</td>
                  <td><a className="ver-pedido" href={`#clientes/${c.id}`}>Abrir</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function FichaCliente({ id }: { id: number }) {
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    api(`/admin/api/clientes/${id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Cliente não encontrado.");
        const json = (await res.json()) as Ficha;
        setFicha(json);
        setNome(json.nome);
        setTelefone(json.telefone ?? "");
      })
      .catch((e: Error) => setErro(e.message));
  }, [id]);

  async function salvar() {
    setAviso("");
    const res = await api(`/admin/api/clientes/${id}`, { method: "PATCH", body: JSON.stringify({ nome, telefone }) });
    const json = (await res.json().catch(() => ({}))) as { erro?: string };
    if (!res.ok) {
      setAviso(json.erro || "Não foi possível salvar.");
      return;
    }
    setAviso("Ficha salva.");
  }

  if (erro) {
    return (
      <>
        <a className="pedido-voltar" href="#clientes">Clientes</a>
        <h1>Cliente</h1>
        <p className="erro">{erro}</p>
      </>
    );
  }
  if (!ficha) return <p>Carregando…</p>;

  return (
    <div className="pedido-pagina">
      <a className="pedido-voltar" href="#clientes">Clientes</a>
      <header className="pedido-topo">
        <div>
          <p className="pedido-kicker">Cliente desde {dataHora(ficha.criado_em)}</p>
          <h1>{nome || ficha.nome}</h1>
        </div>
      </header>

      <div className="pedido-grade">
        <section className="bloco">
          <h2>Pedidos</h2>
          {ficha.pedidos.length === 0 && <p>Este cliente ainda não tem pedido.</p>}
          {ficha.pedidos.length > 0 && (
            <table className="tabela">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Etapa</th>
                  <th>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {ficha.pedidos.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.numero}</strong>
                      <small className="pedido-detalhe">{dataHora(p.criado_em)} · {p.modalidade === "coleta" ? "Coleta" : "Retirada na loja"}</small>
                    </td>
                    <td><span className="pedido-status">{p.etapa}</span></td>
                    <td>{centavosBRL(p.total_cents)}</td>
                    <td><a className="ver-pedido" href={`#pedidos/${p.id}`}>Abrir</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="bloco">
          <h2>Ficha</h2>
          <label>
            Nome
            <input value={nome} onChange={(e) => setNome(e.target.value)} />
          </label>
          <label>
            WhatsApp
            <input value={telefone} placeholder="DDD e número" onChange={(e) => setTelefone(e.target.value)} />
          </label>
          <button type="button" onClick={salvar}>Salvar ficha</button>
          {aviso && <p className={aviso === "Ficha salva." ? "pedido-ok" : "erro"}>{aviso}</p>}
        </section>
      </div>
    </div>
  );
}
