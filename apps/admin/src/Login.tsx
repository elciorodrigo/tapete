import { useState, type FormEvent } from "react";
import { api } from "./api";

export function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const res = await api("/admin/api/login", { method: "POST", body: JSON.stringify({ email, senha }) });
      if (res.status === 404) setErro("O login ainda não está disponível nesta versão.");
      else if (!res.ok) setErro("E-mail ou senha inválidos.");
    } catch {
      setErro("Não foi possível conectar ao servidor.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="login">
      <form className="cartao" onSubmit={entrar}>
        <img className="logo" src={`${import.meta.env.BASE_URL}logo.png`} alt="Tapetê" width={168} height={60} />
        <p className="sub">Área da equipe</p>
        <label>
          E-mail
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Senha
          <input type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
        </label>
        {erro && <p className="erro">{erro}</p>}
        <button type="submit" disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>
      <a className="voltar" href="/">← Voltar para o site</a>
    </main>
  );
}
