export function Area({ titulo, texto, colunas }: { titulo: string; texto: string; colunas: string[] }) {
  return (
    <>
      <h1>{titulo}</h1>
      <p className="pedido-detalhe">{texto}</p>
      <div className="bloco">
        <table className="tabela">
          <thead>
            <tr>
              {colunas.map((coluna) => (
                <th key={coluna}>{coluna}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="celula-vazia" colSpan={colunas.length}>Nenhum registro.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

const RELATORIOS = [
  ["Agendamentos", "Coletas, entregas e caminhão no período."],
  ["Atendimentos", "Conversas, orçamentos e ocorrências."],
  ["Produção", "Peças por etapa da usina e relavagem."],
  ["Itens", "Etiquetas por situação, atraso e ocorrência."],
];

export function Relatorios() {
  return (
    <>
      <h1>Relatórios</h1>
      <div className="grade-rede">
        {RELATORIOS.map(([nome, texto]) => (
          <section className="bloco" key={nome}>
            <h2>{nome}</h2>
            <p className="pedido-detalhe">{texto}</p>
            <p>Sem movimento para consolidar.</p>
          </section>
        ))}
      </div>
    </>
  );
}
