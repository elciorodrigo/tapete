import { useEffect, useState } from "react";
import { api, type Usuario } from "./api";
import { Login } from "./Login";
import { Painel } from "./Painel";

export function App() {
  const [usuario, setUsuario] = useState<Usuario | null | undefined>(undefined);

  useEffect(() => {
    api("/admin/api/me")
      .then(async (res) => setUsuario(res.ok ? ((await res.json()) as Usuario) : null))
      .catch(() => setUsuario(null));
  }, []);

  if (usuario === undefined) return null;
  if (!usuario) return <Login onEntrar={setUsuario} />;
  return <Painel usuario={usuario} onSair={() => setUsuario(null)} />;
}
