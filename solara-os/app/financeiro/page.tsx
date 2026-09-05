import { redirect } from "next/navigation";
import { lerPerfilAtual } from "@/lib/perfil";
import CabecalhoApp from "@/components/CabecalhoApp";
import PainelFinanceiro from "@/components/PainelFinanceiro";

// SPEC 5 — so para usuarios com "financeiro" em perfis.areas.
export default async function PaginaFinanceiro() {
  const perfil = await lerPerfilAtual();
  if (!perfil) redirect("/login");
  if (!perfil.areas.includes("financeiro")) redirect("/");

  return (
    <>
      <CabecalhoApp
        email={perfil.email}
        nome={perfil.nome}
        ehAdmin={perfil.papel === "admin"}
      />
      <PainelFinanceiro />
    </>
  );
}
