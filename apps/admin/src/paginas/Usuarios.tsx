import { useEffect, useState } from "react";
import { api } from "../api";
import { dataHora } from "../formato";

type UsuarioPainel = {
  id: number;
  nome: string;
  email: string;
  papel: string;
  ativo: boolean;
  ultimo_acesso: string | null;
};

export function Usuarios() {
  const [usuarios, setUsuarios] = useState<UsuarioPainel[] | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api("/admin/api/usuarios")
      .then(async (res) => {
        if (!res.ok) throw new Error("Não foi possível carregar os usuários.");
        const json = (await res.json()) as { usuarios: UsuarioPainel[] };
        setUsuarios(json.usuarios);
      })
      .catch((e: Error) => setErro(e.message));
  }, []);

  return (
    <>
      <h1>Usuários e permissões</h1>
      <p className="pedido-detalhe">Quem entra no painel. Administrador altera cadastros e preços. Atendente opera pedidos.</p>
      {erro && <p className="erro">{erro}</p>}
      {usuarios === null && !erro && <p>Carregando…</p>}
      {!!usuarios?.length && (
        <div className="bloco">
          <table className="tabela">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Papel</th>
                <th>Último acesso</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td>{u.nome}{!u.ativo && <small className="pedido-detalhe">Inativo</small>}</td>
                  <td>{u.email}</td>
                  <td>{u.papel}</td>
                  <td>{u.ultimo_acesso ? dataHora(u.ultimo_acesso) : "Nunca entrou"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
