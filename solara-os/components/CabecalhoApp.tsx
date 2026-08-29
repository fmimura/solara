import Link from "next/link";
import BotaoSair from "@/components/BotaoSair";

// Cabecalho comum das telas internas: identidade + link de admin + sair.
export default function CabecalhoApp({
  email,
  nome,
  ehAdmin,
}: {
  email: string;
  nome?: string | null;
  ehAdmin?: boolean;
}) {
  return (
    <header className="cabecalho">
      <Link href="/" className="marca">
        Solara OS
      </Link>
      <div className="cabecalho-direita">
        <span className="usuario">{nome ? `${nome} · ${email}` : email}</span>
        {ehAdmin && (
          <Link href="/admin" className="link-admin">
            Admin
          </Link>
        )}
        <BotaoSair />
      </div>
    </header>
  );
}
