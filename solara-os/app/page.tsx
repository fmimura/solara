import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import BotaoSair from "@/components/BotaoSair";

// Pagina inicial protegida. Sem sessao, volta para /login.
export default async function PaginaInicial() {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main>
      <h1>Solara OS</h1>
      <p>{user.email}</p>
      <BotaoSair />
    </main>
  );
}
