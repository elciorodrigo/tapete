import { api, type Usuario } from "./api";

export function Painel({ usuario, onSair }: { usuario: Usuario; onSair: () => void }) {
  async function sair() {
    await api("/admin/api/logout", { method: "POST" }).catch(() => {});
    onSair();
  }

  return (
    <div className="painel">
      <header className="painel-topo">
        <img src={`${import.meta.env.BASE_URL}logo-claro.png`} alt="Tapetê" height={34} />
        <nav>
          <a className="ativo" href="#pedidos">Pedidos</a>
        </nav>
        <div className="painel-usuario">
          <span>{usuario.name}</span>
          <button className="botao-sair" onClick={sair}>Sair</button>
        </div>
      </header>

      <main className="painel-conteudo" id="pedidos">
        <h1>Pedidos</h1>
        <div className="vazio">
          <p className="vazio-titulo">Nenhum pedido ainda</p>
          <p>Os orçamentos confirmados pelo WhatsApp e pelo site vão aparecer aqui, com o status de cada um.</p>
        </div>
      </main>
    </div>
  );
}
