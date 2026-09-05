import { NextResponse } from "next/server";
import { processarPedidoVendas } from "@/lib/orquestradores/vendas";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";

export const maxDuration = 60;

// SPEC 4.2 — dispara o orquestrador de Vendas para um pedido.
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
  if (!perfil?.areas?.includes("vendas")) {
    return NextResponse.json({ erro: "sem acesso a vendas" }, { status: 403 });
  }

  let corpo: { cod_pedido?: string };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "JSON invalido" }, { status: 400 });
  }

  const codPedido = corpo.cod_pedido?.trim();
  if (!codPedido) {
    return NextResponse.json({ erro: "cod_pedido e obrigatorio" }, { status: 400 });
  }

  try {
    await processarPedidoVendas(codPedido);
    return NextResponse.json({ ok: true });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
