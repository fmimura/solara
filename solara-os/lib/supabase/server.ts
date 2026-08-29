import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieParaDefinir = { name: string; value: string; options: CookieOptions };

// Cliente Supabase para Server Components / Route Handlers.
// Usa a anon key e a sessao do usuario vinda dos cookies.
export async function criarClienteServidor() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieParaDefinir[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Chamado a partir de um Server Component: pode ser ignorado
            // quando existe middleware atualizando a sessao.
          }
        },
      },
    },
  );
}
