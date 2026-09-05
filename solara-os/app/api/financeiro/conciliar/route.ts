import { NextResponse } from "next/server";
import { conciliarExtrato } from "@/lib/orquestradores/financeiro";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";

export const maxDuration = 60;

// SPEC 5.4 — dispara o orquestrador de Financeiro para um extrato.
export async function POST(req: Request) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ erro: "nao autenticado" }, { status: 401 });
  }

  const admin = criarClienteAdmin();
  const { data: perfil } = await admin
    .from("perfis")
    .select("areas")
    .eq("id", user.id)
    .single();
  if (!perfil?.areas?.includes("financeiro")) {
    return NextResponse.json({ erro: "sem acesso a financeiro" }, { status: 403 });
  }

  let corpo: { extrato_id?: string };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "JSON invalido" }, { status: 400 });
  }

  const extratoId = corpo.extrato_id?.trim();
  if (!extratoId) {
    return NextResponse.json({ erro: "extrato_id e obrigatorio" }, { status: 400 });
  }

  try {
    const relatorio = await conciliarExtrato(extratoId);
    return NextResponse.json({ ok: true, relatorio });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
