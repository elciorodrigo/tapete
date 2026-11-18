import { useEffect, useState } from "react";
import { buscarCatalogo, type Unidade } from "../catalogo";

export function Rede() {
  const [unidades, setUnidades] = useState<Unidade[] | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    buscarCatalogo()
      .then((r) => setUnidades(r.catalogo.unidades))
      .catch((e: Error) => setErro(e.message));
  }, []);

  return (
    <>
      <h1>Rede</h1>
      <p className="pedido-detalhe">Unidades que atendem o cliente. Preço, cobertura e endereço ficam em Tipos de serviço.</p>
      {erro && <p className="erro">{erro}</p>}
      {unidades === null && !erro && <p>Carregando…</p>}
      <div className="grade-rede">
        {unidades?.map((u) => (
          <section className="bloco" key={u.id}>
            <h2>{u.nome}</h2>
            <p className="pedido-linha"><span>Loja</span>{u.endereco_loja || "Sem endereço"}</p>
            <p className="pedido-linha"><span>Balcão</span>{u.aceita_balcao ? "O cliente pode retirar na loja" : "Só coleta"}</p>
            <p className="pedido-linha">
              <span>Cobertura</span>
              {u.ceps.map(([ini, fim]) => `${ini} até ${fim}`).join(" · ") || "Sem faixa de CEP"}
            </p>
          </section>
        ))}
      </div>
      <a className="ver-pedido" href="#cadastros/servicos">Editar unidades e preços</a>
    </>
  );
}
