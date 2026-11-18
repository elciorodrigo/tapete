import { useEffect, useState } from "react";
import { api, type Usuario } from "./api";
import { Calcular } from "./paginas/Calcular";
import { Pedidos } from "./paginas/Pedidos";
import { Precos } from "./paginas/Precos";

const PAGINAS = [
  { id: "pedidos", nome: "Pedidos" },
  { id: "precos", nome: "Preços e configurações" },
  { id: "calcular", nome: "Calcular preço" },
] as const;

type Pagina = (typeof PAGINAS)[number]["id"];

function paginaDaUrl(): Pagina {
  const h = window.location.hash.slice(1);
  return PAGINAS.some((p) => p.id === h) ? (h as Pagina) : "pedidos";
}

export function Painel({ usuario, onSair }: { usuario: Usuario; onSair: () => void }) {
  const [pagina, setPagina] = useState<Pagina>(paginaDaUrl);

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
        <nav>
          {PAGINAS.map((p) => (
            <a key={p.id} href={`#${p.id}`} className={pagina === p.id ? "ativo" : undefined}>
              {p.nome}
            </a>
          ))}
        </nav>
        <div className="painel-usuario">
          <span>
            {usuario.name}
            <small>{usuario.role === "admin" ? "Administrador" : "Atendente"}</small>
          </span>
          <button className="botao-sair" onClick={sair}>Sair</button>
        </div>
      </header>

      <main className="painel-conteudo">
        {pagina === "pedidos" && <Pedidos podeEditar={usuario.role === "admin"} />}
        {pagina === "precos" && <Precos podeEditar={usuario.role === "admin"} />}
        {pagina === "calcular" && <Calcular />}
      </main>
    </div>
  );
}
