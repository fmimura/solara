import { NextResponse } from "next/server";
import { limparExtrato, lerTitulosArquivo, type TituloArquivo } from "@/lib/financeiro/limpar";
import { casarLancamentos } from "@/lib/financeiro/casar";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";

// SPEC 5.2/5.3 — upload do extrato (+ titulos opcional), limpeza e
// casamento em codigo. Devolve o antes/depois e o resumo para a tela.
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

  const formData = await req.formData();
  const extratoFile = formData.get("extrato");
  if (!(extratoFile instanceof File)) {
    return NextResponse.json({ erro: "arquivo de extrato e obrigatorio" }, { status: 400 });
  }
  const titulosFile = formData.get("titulos");

  const { linhas, antes, depois } = await limparExtrato(extratoFile);
  if (linhas.length === 0) {
    return NextResponse.json(
      { erro: "nao foi possivel ler nenhuma linha do extrato" },
      { status: 400 },
    );
  }

  let titulosAbertos: TituloArquivo[];
  if (titulosFile instanceof File) {
    titulosAbertos = (await lerTitulosArquivo(titulosFile)).filter((t) => t.status === "aberto");
  } else {
    const { data } = await admin
      .from("titulos_receber")
      .select("cod_titulo, cod_cliente, nota_fiscal, valor, emissao, vencimento, status")
      .eq("status", "aberto");
    titulosAbertos = (data as TituloArquivo[]) ?? [];
  }

  const resultado = casarLancamentos(linhas, titulosAbertos);

  const totalCreditos = resultado.lancamentos.filter((l) => l.tipo === "credito").length;
  const { data: extrato, error: erroExtrato } = await admin
    .from("extratos_importados")
    .insert({
      nome_arquivo: extratoFile.name,
      importado_por: user.id,
      total_linhas: linhas.length,
      total_creditos: totalCreditos,
    })
    .select("id")
    .single();
  if (erroExtrato || !extrato) {
    return NextResponse.json(
      { erro: `falha ao registrar extrato: ${erroExtrato?.message ?? "sem retorno"}` },
      { status: 500 },
    );
  }
  const extratoId: string = extrato.id;

  // Insere um a um para garantir o mapeamento indice -> id, usado para
  // ligar cada divergencia ao seu lancamento.
  const idsLancamentos: string[] = [];
  for (const lancamento of resultado.lancamentos) {
    const { data: linha, error } = await admin
      .from("lancamentos")
      .insert({
        extrato_id: extratoId,
        data: lancamento.data,
        descricao: lancamento.descricao,
        valor: lancamento.valor,
        tipo: lancamento.tipo,
        cod_titulo_casado: lancamento.cod_titulo_casado,
        situacao: lancamento.situacao,
      })
      .select("id")
      .single();
    if (error || !linha) {
      return NextResponse.json(
        { erro: `falha ao gravar lancamento: ${error?.message ?? "sem retorno"}` },
        { status: 500 },
      );
    }
    idsLancamentos.push(linha.id);
  }

  if (resultado.divergenciasIniciais.length > 0) {
    const { error: erroDivergencias } = await admin.from("divergencias").insert(
      resultado.divergenciasIniciais.map((d) => ({
        extrato_id: extratoId,
        tipo_inicial: d.tipo_inicial,
        lancamento_id: d.lancamentoIndex !== null ? idsLancamentos[d.lancamentoIndex] : null,
        cod_titulo: d.cod_titulo,
        valor_lancamento: d.valor_lancamento,
        valor_titulo: d.valor_titulo,
        status: "nova",
      })),
    );
    if (erroDivergencias) {
      return NextResponse.json(
        { erro: `falha ao gravar divergencias: ${erroDivergencias.message}` },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    extrato_id: extratoId,
    antes,
    depois,
    resumo: resultado.resumo,
  });
}
