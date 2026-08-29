import { createBrowserClient } from "@supabase/ssr";

// Cliente Supabase para o browser. Usa a anon key (publica).
export function criarClienteBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
