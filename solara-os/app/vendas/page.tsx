import { redirect } from "next/navigation";
import { lerPerfilAtual } from "@/lib/perfil";
import CabecalhoApp from "@/components/CabecalhoApp";
import PainelVendas from "@/components/PainelVendas";

// SPEC 4 — so para usuarios com "vendas" em perfis.areas.
export default async function PaginaVendas() {
  const perfil = await lerPerfilAtual();
  if (!perfil) redirect("/login");
  if (!perfil.areas.includes("vendas")) redirect("/");

  return (
    <>
      <CabecalhoApp
        email={perfil.email}
        nome={perfil.nome}
        ehAdmin={perfil.papel === "admin"}
      />
      <PainelVendas />
    </>
  );
}
