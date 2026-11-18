import { useEffect, useState } from "react";
import { api, type Usuario } from "./api";
import { Area, Relatorios } from "./paginas/Area";
import { Calcular } from "./paginas/Calcular";
import { Clientes } from "./paginas/Clientes";
import { Configuracoes } from "./paginas/Configuracoes";
import { Origens } from "./paginas/Origens";
import { Pedidos } from "./paginas/Pedidos";
import { Precos } from "./paginas/Precos";
import { Rede } from "./paginas/Rede";
import { Usuarios } from "./paginas/Usuarios";

const DIRETOS = [{ id: "pedidos", nome: "Pedidos" }] as const;

const GRUPOS = [
  {
    id: "atendimento",
    nome: "Atendimento",
    itens: [
      { id: "atendimento", nome: "Conversas" },
      { id: "atendimento/orcamento", nome: "Orçamento manual" },
    ],
  },
  {
    id: "operacao",
    nome: "Operação",
    itens: [
      { id: "operacao/receber", nome: "Receber itens" },
      { id: "operacao/confirmar", nome: "Confirmar pedidos" },
      { id: "operacao/catalogar", nome: "Catalogar itens" },
      { id: "operacao/producao", nome: "Produção" },
      { id: "operacao/expedicao", nome: "Expedição" },
      { id: "operacao/rotas", nome: "Rotas" },
      { id: "operacao/historico", nome: "Histórico do item" },
    ],
  },
  {
    id: "cadastros",
    nome: "Cadastros",
    itens: [
      { id: "clientes", nome: "Clientes" },
      { id: "cadastros/origens", nome: "Como conheceu" },
      { id: "cadastros/servicos", nome: "Tipos de serviço" },
      { id: "cadastros/usuarios", nome: "Usuários e permissões" },
      { id: "cadastros/operadores", nome: "Operadores e veículos" },
      { id: "cadastros/rede", nome: "Rede" },
    ],
  },
] as const;

const APOIO = [
  { id: "calendario", nome: "Calendário" },
  { id: "relatorios", nome: "Relatórios" },
  { id: "configuracoes", nome: "Configurações" },
] as const;

type Pagina = (typeof DIRETOS)[number]["id"] | (typeof GRUPOS)[number]["itens"][number]["id"] | (typeof APOIO)[number]["id"];

function paginaDaUrl(): Pagina {
  const h = window.location.hash.slice(1);
  if (h === "pedidos" || h.startsWith("pedidos/")) return "pedidos";
  if (h === "clientes" || h.startsWith("clientes/")) return "clientes";
  const ids = new Set<string>([...DIRETOS, ...APOIO].map((item) => item.id));
  for (const grupo of GRUPOS) {
    for (const item of grupo.itens) ids.add(item.id);
  }
  return ids.has(h) ? (h as Pagina) : "pedidos";
}

function grupoDaPagina(pagina: Pagina): string | null {
  return GRUPOS.find((grupo) => grupo.itens.some((item) => item.id === pagina))?.id ?? null;
}

export function Painel({ usuario, onSair }: { usuario: Usuario; onSair: () => void }) {
  const [pagina, setPagina] = useState<Pagina>(paginaDaUrl);
  const [aberto, setAberto] = useState<string | null>(grupoDaPagina(paginaDaUrl()));
  const [menuAberto, setMenuAberto] = useState(false);
  const podeEditar = usuario.role === "admin";

  useEffect(() => {
    const ouvir = () => {
      const proxima = paginaDaUrl();
      setPagina(proxima);
      setAberto(grupoDaPagina(proxima));
      setMenuAberto(false);
    };
    window.addEventListener("hashchange", ouvir);
    return () => window.removeEventListener("hashchange", ouvir);
  }, []);

  async function sair() {
    await api("/admin/api/logout", { method: "POST" }).catch(() => {});
    onSair();
  }

  function link(item: { id: string; nome: string }) {
    return (
      <a key={item.id} href={`#${item.id}`} className={pagina === item.id ? "ativo" : undefined}>
        {item.nome}
      </a>
    );
  }

  return (
    <div className="painel">
      <aside className={menuAberto ? "menu aberto" : "menu"}>
        <div className="menu-marca">
          <img src={`${import.meta.env.BASE_URL}logo-claro.png`} alt="Tapetê" />
          <button type="button" className="menu-alternar" onClick={() => setMenuAberto((v) => !v)}>
            {menuAberto ? "Fechar" : "Menu"}
          </button>
        </div>
        <nav>
          {DIRETOS.map(link)}
          {GRUPOS.map((grupo) => (
            <div key={grupo.id} className="menu-secao">
              <button
                type="button"
                aria-expanded={aberto === grupo.id}
                onClick={() => setAberto((atual) => (atual === grupo.id ? null : grupo.id))}
              >
                {grupo.nome}
                <span aria-hidden="true">{aberto === grupo.id ? "–" : "+"}</span>
              </button>
              {aberto === grupo.id && <div className="menu-sub">{grupo.itens.map(link)}</div>}
            </div>
          ))}
          <div className="menu-apoio">{APOIO.map(link)}</div>
        </nav>
        <div className="menu-usuario">
          <strong>{usuario.name}</strong>
          <small>{usuario.role === "admin" ? "Administrador" : "Atendente"}</small>
          <button className="botao-sair" onClick={sair}>Sair</button>
        </div>
      </aside>

      <main className="painel-conteudo">
          {pagina === "atendimento" && (
            <Area
              titulo="Conversas"
              texto="Caixa do WhatsApp oficial. A conversa fica com a central ou com a unidade do pedido."
              colunas={["Cliente", "Última mensagem", "Fila", "Situação"]}
            />
          )}
          {pagina === "atendimento/orcamento" && <Calcular />}
          {pagina === "calendario" && (
            <Area
              titulo="Calendário"
              texto="Coletas, entregas, passagem do caminhão e capacidade da usina no mesmo quadro."
              colunas={["Quando", "Tipo", "Cliente ou unidade", "Situação"]}
            />
          )}
          {pagina === "pedidos" && <Pedidos />}
          {pagina === "operacao/receber" && (
            <Area titulo="Receber itens" texto="Conferência do que chegou da coleta, do balcão ou do caminhão." colunas={["Etiqueta", "Pedido", "Origem", "Conferido"]} />
          )}
          {pagina === "operacao/confirmar" && (
            <Area titulo="Confirmar pedidos" texto="A unidade confirma o pedido e vincula uma etiqueta por peça antes da rota." colunas={["Pedido", "Peças", "Etiquetas", "Situação"]} />
          )}
          {pagina === "operacao/catalogar" && (
            <Area titulo="Catalogar itens" texto="Triagem na usina: material, estado e o roteiro de lavagem de cada peça." colunas={["Etiqueta", "Material", "Estado", "Roteiro"]} />
          )}
          {pagina === "operacao/producao" && (
            <Area titulo="Produção" texto="Quadro da usina, da triagem até a inspeção e a relavagem." colunas={["Etiqueta", "Etapa", "Desde", "Unidade"]} />
          )}
          {pagina === "operacao/expedicao" && (
            <Area titulo="Expedição" texto="Manifesto de volta para a unidade e saída para a entrega." colunas={["Manifesto", "Destino", "Itens", "Situação"]} />
          )}
          {pagina === "operacao/rotas" && (
            <Area titulo="Rotas" texto="Coleta, entrega e transferência entre unidade e usina." colunas={["Data", "Tipo", "Paradas", "Operador"]} />
          )}
          {pagina === "operacao/historico" && (
            <Area titulo="Histórico do item" texto="Linha do tempo da peça, da etiqueta na coleta até a devolução." colunas={["Etiqueta", "Pedido", "Cliente", "Último evento"]} />
          )}
          {pagina === "clientes" && <Clientes />}
          {pagina === "cadastros/origens" && <Origens podeEditar={podeEditar} />}
          {pagina === "cadastros/servicos" && <Precos podeEditar={podeEditar} />}
          {pagina === "cadastros/usuarios" && <Usuarios />}
          {pagina === "cadastros/operadores" && (
            <Area titulo="Operadores e veículos" texto="Quem roda a coleta, a entrega e o caminhão, e com qual veículo." colunas={["Nome", "Função", "Veículo", "Situação"]} />
          )}
          {pagina === "cadastros/rede" && <Rede />}
          {pagina === "relatorios" && <Relatorios />}
          {pagina === "configuracoes" && <Configuracoes podeEditar={podeEditar} />}
        </main>
    </div>
  );
}
