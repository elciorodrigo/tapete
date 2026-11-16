// Cria ou redefine um usuário do painel. Sem senha informada, gera uma aleatória.
//   node apps/api/dist/cli/criar-admin.js <email> "<nome>" [admin|atendente]
import { gerarHash, gerarSenhaAleatoria } from "../admin/senha.js";
import { pool } from "../db.js";
import { migrar } from "../migracoes.js";

const [email, nome, perfil = "admin"] = process.argv.slice(2);

if (!email || !nome || !["admin", "atendente"].includes(perfil)) {
  console.error('Uso: criar-admin <email> "<nome>" [admin|atendente]');
  process.exit(1);
}

await migrar(pool);
const senha = process.env.ADMIN_SENHA || gerarSenhaAleatoria();
const { rows } = await pool.query<{ criado: boolean }>(
  `insert into admin_users (name, email, password_hash, role)
   values ($1, $2, $3, $4)
   on conflict (email) do update
     set name = excluded.name, password_hash = excluded.password_hash, role = excluded.role,
         active = true, failed_attempts = 0, locked_until = null
   returning (xmax = 0) as criado`,
  [nome, email.trim().toLowerCase(), await gerarHash(senha), perfil],
);
await pool.query(
  "delete from admin_sessions where user_id = (select id from admin_users where email = $1)",
  [email.trim().toLowerCase()],
);

console.log(rows[0]?.criado ? "Usuário criado." : "Usuário já existia: senha redefinida.");
console.log(`E-mail: ${email.trim().toLowerCase()}`);
console.log(`Senha:  ${senha}`);
console.log(`Perfil: ${perfil}`);
await pool.end();
