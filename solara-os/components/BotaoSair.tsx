"use client";

import { useRouter } from "next/navigation";
import { criarClienteBrowser } from "@/lib/supabase/client";

export default function BotaoSair() {
  const router = useRouter();

  async function sair() {
    const supabase = criarClienteBrowser();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return <button onClick={sair}>Sair</button>;
}
