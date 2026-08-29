import { createClient } from "@supabase/supabase-js";

// Cliente Supabase com a service role. NUNCA importar em codigo de browser.
// Uso restrito a rotas de API no servidor (ex.: criacao de usuarios pelo admin).
export function criarClienteAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
