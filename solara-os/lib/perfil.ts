import { criarClienteServidor } from "@/lib/supabase/server";
import type { Area } from "@/lib/tipos";

export interface Perfil {
  id: string;
  email: string;
  nome: string | null;
  papel: "admin" | "operador";
  areas: Area[];
}

// Perfil do usuario logado (SPEC 2.1). Null se nao houver sessao ou
// se a linha em `perfis` ainda nao existir.
export async function lerPerfilAtual(): Promise<Perfil | null> {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("perfis")
    .select("id, email, nome, papel, areas")
    .eq("id", user.id)
    .single();

  if (!data) {
    // Sem linha em perfis (ou RLS bloqueando): devolve o minimo do Auth.
    return {
      id: user.id,
      email: user.email ?? "",
      nome: null,
      papel: "operador",
      areas: [],
    };
  }

  return {
    id: data.id,
    email: data.email ?? user.email ?? "",
    nome: data.nome,
    papel: data.papel === "admin" ? "admin" : "operador",
    areas: (data.areas ?? []) as Area[],
  };
}

// A service role e obrigatoria para /admin (criar usuarios no Auth).
export function temServiceRole(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}
