import { useEffect, useState } from "react";
import { STATUS_ROTULO, type StatusPedido } from "@tapete/core";
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

const MODALIDADE: Record<string, string> = { coleta: "Coleta", balcao: "Retirada na loja" };
const PAGAMENTO: Record<string, string> = { pix: "Pix", cartao: "Cartão" };

function rotuloStatus(status: string): string {
  return status in STATUS_ROTULO ? STATUS_ROTULO[status as StatusPedido] : status;
}

export function Pedidos() {
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api("/admin/api/pedidos")
      .then(async (res) => {
        if (!res.ok) throw new Error("Não foi possível carregar os pedidos.");
        const json = (await res.json()) as { pedidos: Pedido[] };
        setPedidos(json.pedidos);
      })
      .catch((e: Error) => setErro(e.message));
  }, []);

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
                <th>Status</th>
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
                      {p.telefone === "preview" ? "Teste do editor" : p.telefone}
                      {" · "}
                      {MODALIDADE[p.modalidade] ?? p.modalidade}
                      {p.pagamento ? ` · ${PAGAMENTO[p.pagamento] ?? p.pagamento}` : ""}
                    </small>
                    {p.endereco && <small className="pedido-detalhe">{p.endereco}</small>}
                  </td>
                  <td>{p.resumo || "—"}</td>
                  <td>{centavosBRL(p.total_cents)}</td>
                  <td><span className="pedido-status">{rotuloStatus(p.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
