import { redirect } from "next/navigation";
import Link from "next/link";
import { lerPerfilAtual } from "@/lib/perfil";
import CabecalhoApp from "@/components/CabecalhoApp";
import type { Area } from "@/lib/tipos";

// Menu de areas (SPEC 2.2).
const AREAS_ATIVAS: { chave: Area; nome: string }[] = [
  { chave: "vendas", nome: "Vendas" },
  { chave: "financeiro", nome: "Financeiro" },
];
const AREAS_EM_BREVE = ["RH", "Jurídico", "Operações"];

export default async function PaginaInicial() {
  const perfil = await lerPerfilAtual();
  if (!perfil) redirect("/login");

  const ativas = AREAS_ATIVAS.filter((a) => perfil.areas.includes(a.chave));

  return (
    <>
      <CabecalhoApp
        email={perfil.email}
        nome={perfil.nome}
        ehAdmin={perfil.papel === "admin"}
      />
      <main>
        <h1>Áreas</h1>

        <div className="cartoes">
          {ativas.map((a) => (
            <Link key={a.chave} href={`/${a.chave}`} className="cartao">
              <strong>{a.nome}</strong>
            </Link>
          ))}

          {AREAS_EM_BREVE.map((nome) => (
            <div key={nome} className="cartao desativado">
              <strong>{nome}</strong>
              <span className="tag">em breve</span>
            </div>
          ))}
        </div>

        {ativas.length === 0 && (
          <p className="aviso">
            Seu perfil ainda não tem áreas liberadas. Fale com um administrador.
          </p>
        )}
      </main>
    </>
  );
}
