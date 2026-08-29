import { redirect } from "next/navigation";
import { lerPerfilAtual, temServiceRole } from "@/lib/perfil";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import CabecalhoApp from "@/components/CabecalhoApp";
import CriarUsuarioForm from "@/components/CriarUsuarioForm";
import type { Perfil } from "@/lib/perfil";

// SPEC 2.3 — somente papel = admin.
export default async function PaginaAdmin() {
  const perfil = await lerPerfilAtual();
  if (!perfil) redirect("/login");
  if (perfil.papel !== "admin") redirect("/");

  const cabecalho = (
    <CabecalhoApp email={perfil.email} nome={perfil.nome} ehAdmin />
  );

  if (!temServiceRole()) {
    return (
      <>
        {cabecalho}
        <main>
          <h1>Administração de usuários</h1>
          <p className="aviso">
            Defina <code>SUPABASE_SERVICE_ROLE_KEY</code> no <code>.env.local</code>{" "}
            e reinicie o servidor. Ela é necessária para listar e criar usuários.
          </p>
        </main>
      </>
    );
  }

  const admin = criarClienteAdmin();
  const { data: perfis } = await admin
    .from("perfis")
    .select("id, email, nome, papel, areas")
    .order("criado_em", { ascending: true });

  return (
    <>
      {cabecalho}
      <main className="largo">
        <h1>Administração de usuários</h1>

        <table className="tabela">
          <thead>
            <tr>
              <th>E-mail</th>
              <th>Nome</th>
              <th>Papel</th>
              <th>Áreas</th>
            </tr>
          </thead>
          <tbody>
            {(perfis as Perfil[] | null)?.map((p) => (
              <tr key={p.id}>
                <td>{p.email}</td>
                <td>{p.nome ?? "—"}</td>
                <td>{p.papel}</td>
                <td>{p.areas?.length ? p.areas.join(", ") : "—"}</td>
              </tr>
            ))}
            {!perfis?.length && (
              <tr>
                <td colSpan={4}>Nenhum perfil cadastrado.</td>
              </tr>
            )}
          </tbody>
        </table>

        <h2>Criar usuário</h2>
        <CriarUsuarioForm />
      </main>
    </>
  );
}
