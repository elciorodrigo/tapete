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

const MENU = [
  {
    grupo: "Atendimento",
    itens: [
      { id: "atendimento", nome: "Conversas" },
      { id: "atendimento/orcamento", nome: "Orçamento manual" },
    ],
  },
  {
    grupo: "Agenda",
    itens: [{ id: "calendario", nome: "Calendário" }],
  },
  {
    grupo: "Pedidos",
    itens: [{ id: "pedidos", nome: "Pedidos" }],
  },
  {
    grupo: "Operação",
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
    grupo: "Cadastros",
    itens: [
      { id: "clientes", nome: "Clientes" },
      { id: "cadastros/origens", nome: "Como conheceu" },
      { id: "cadastros/servicos", nome: "Tipos de serviço" },
      { id: "cadastros/usuarios", nome: "Usuários e permissões" },
      { id: "cadastros/operadores", nome: "Operadores e veículos" },
      { id: "cadastros/rede", nome: "Rede" },
    ],
  },
  {
    grupo: "Análise",
    itens: [{ id: "relatorios", nome: "Relatórios" }],
  },
  {
    grupo: "Sistema",
    itens: [{ id: "configuracoes", nome: "Configurações" }],
  },
] as const;

type Pagina = (typeof MENU)[number]["itens"][number]["id"];

function paginaDaUrl(): Pagina {
  const h = window.location.hash.slice(1);
  if (h === "pedidos" || h.startsWith("pedidos/")) return "pedidos";
  if (h === "clientes" || h.startsWith("clientes/")) return "clientes";
  for (const grupo of MENU) {
    for (const item of grupo.itens) {
      if (item.id === h) return item.id;
    }
  }
  return "pedidos";
}

export function Painel({ usuario, onSair }: { usuario: Usuario; onSair: () => void }) {
  const [pagina, setPagina] = useState<Pagina>(paginaDaUrl);
  const podeEditar = usuario.role === "admin";

  useEffect(() => {
    const ouvir = () => setPagina(paginaDaUrl());
    window.addEventListener("hashchange", ouvir);
    return () => window.removeEventListener("hashchange", ouvir);
  }, []);

  async function sair() {
    await api("/admin/api/logout", { method: "POST" }).catch(() => {});
    onSair();
  }

  return (
    <div className="painel">
      <header className="painel-topo">
        <img src={`${import.meta.env.BASE_URL}logo-claro.png`} alt="Tapetê" height={34} />
        <div className="painel-usuario">
          <span>
            {usuario.name}
            <small>{usuario.role === "admin" ? "Administrador" : "Atendente"}</small>
          </span>
          <button className="botao-sair" onClick={sair}>Sair</button>
        </div>
      </header>

      <div className="painel-corpo">
        <aside className="menu">
          {MENU.map((grupo) => (
            <div key={grupo.grupo}>
              <p className="menu-grupo">{grupo.grupo}</p>
              {grupo.itens.map((item) => (
                <a key={item.id} href={`#${item.id}`} className={pagina === item.id ? "ativo" : undefined}>
                  {item.nome}
                </a>
              ))}
            </div>
          ))}
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
    </div>
  );
}
