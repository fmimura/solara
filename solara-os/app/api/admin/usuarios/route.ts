import { NextResponse } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { temServiceRole } from "@/lib/perfil";
import type { Area } from "@/lib/tipos";

// SPEC 2.3 — cria o usuario no Auth e a linha em `perfis`, usando a
// service role. Restrito a papel = admin.
export async function POST(req: Request) {
  if (!temServiceRole()) {
    return NextResponse.json(
      { erro: "SUPABASE_SERVICE_ROLE_KEY nao configurada" },
      { status: 500 },
    );
  }

  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ erro: "nao autenticado" }, { status: 401 });
  }

  const admin = criarClienteAdmin();

  const { data: meuPerfil } = await admin
    .from("perfis")
    .select("papel")
    .eq("id", user.id)
    .single();
  if (meuPerfil?.papel !== "admin") {
    return NextResponse.json({ erro: "somente admin" }, { status: 403 });
  }

  let corpo: {
    email?: string;
    senha?: string;
    nome?: string;
    papel?: string;
    areas?: string[];
  };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "JSON invalido" }, { status: 400 });
  }

  const email = corpo.email?.trim();
  const senha = corpo.senha ?? "";
  const nome = corpo.nome?.trim();
  const papel = corpo.papel === "admin" ? "admin" : "operador";
  const areas = (corpo.areas ?? []).filter(
    (a): a is Area => a === "vendas" || a === "financeiro",
  );

  if (!email || !nome || senha.length < 6) {
    return NextResponse.json(
      { erro: "e-mail, nome e senha (min. 6 caracteres) sao obrigatorios" },
      { status: 400 },
    );
  }

  const { data: criado, error: erroAuth } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });
  if (erroAuth || !criado.user) {
    return NextResponse.json(
      { erro: erroAuth?.message ?? "falha ao criar no Auth" },
      { status: 400 },
    );
  }

  const { error: erroPerfil } = await admin.from("perfis").insert({
    id: criado.user.id,
    email,
    nome,
    papel,
    areas,
  });
  if (erroPerfil) {
    // Evita usuario orfao no Auth se a linha em perfis falhar.
    await admin.auth.admin.deleteUser(criado.user.id);
    return NextResponse.json({ erro: erroPerfil.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: criado.user.id });
}
