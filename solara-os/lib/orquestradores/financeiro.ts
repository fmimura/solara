import { agente, finalizarOrquestrador, iniciarOrquestrador } from "@/lib/agente";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { diasEntre } from "@/lib/financeiro/casar";

interface TituloAberto {
  cod_titulo: string;
  cod_cliente: string;
  nota_fiscal: string;
  valor: number;
  emissao: string;
  vencimento: string;
  status: string;
}

interface LancamentoRow {
  id: string;
  data: string;
  descricao: string;
  valor: number;
}

interface DivergenciaRow {
  id: string;
  extrato_id: string;
  tipo_inicial: string;
  lancamento_id: string | null;
  cod_titulo: string | null;
  valor_lancamento: number | null;
  valor_titulo: number | null;
}

// Saida esperada do Investigador (prompts/financeiro/investigador.md).
interface HipoteseInvestigador {
  hipotese: string;
  explicacao: string;
  confianca: number;
  acao_sugerida: string;
  cod_titulos_envolvidos: string[];
  valor_a_baixar: number;
  valor_pendente: number;
}

// Saida esperada do Consolidador (prompts/financeiro/consolidador.md).
interface RelatorioConsolidador {
  relatorio_markdown: string;
  acoes: string[];
}

// Saida esperada do Revisor (prompts/financeiro/revisor.md).
interface RevisaoFinanceiro {
  aprovado: boolean;
  motivos: string[];
}

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase();
}

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Candidatos de titulos para uma divergencia (SPEC 5.4, passo 2): do
// mesmo cliente, se identificavel pela descricao, senao por valor
// proximo (+-10%) e vencimento a ate 30 dias.
function buscarTitulosCandidatos(
  divergencia: DivergenciaRow,
  lancamento: LancamentoRow | null,
  titulosAbertos: TituloAberto[],
  clientesPorCodigo: Map<string, string>,
): (TituloAberto & { nome_cliente: string })[] {
  const comNome = (t: TituloAberto) => ({
    ...t,
    nome_cliente: clientesPorCodigo.get(t.cod_cliente) ?? t.cod_cliente,
  });

  if (!lancamento) {
    // vencido_sem_pagamento: a propria divergencia ja aponta o titulo.
    return titulosAbertos.filter((t) => t.cod_titulo === divergencia.cod_titulo).map(comNome);
  }

  const descricaoNormalizada = normalizar(lancamento.descricao);
  const codClienteIdentificado = [...clientesPorCodigo.entries()].find(([, nome]) =>
    descricaoNormalizada.includes(normalizar(nome)),
  )?.[0];

  if (codClienteIdentificado) {
    return titulosAbertos
      .filter((t) => t.cod_cliente === codClienteIdentificado)
      .map(comNome);
  }

  return titulosAbertos
    .filter(
      (t) =>
        Math.abs(t.valor - lancamento.valor) / lancamento.valor <= 0.1 &&
        diasEntre(t.vencimento, lancamento.data) <= 30,
    )
    .map(comNome);
}

// Orquestrador de Financeiro (SPEC 5.4): Investigador (um por
// divergencia, em paralelo) -> Consolidador -> Revisor, com uma unica
// refeitura do Consolidador se o Revisor reprovar.
export async function conciliarExtrato(extratoId: string): Promise<RelatorioConsolidador> {
  const admin = criarClienteAdmin();

  const { data: divergenciasNovas, error: erroDivergencias } = await admin
    .from("divergencias")
    .select("id, extrato_id, tipo_inicial, lancamento_id, cod_titulo, valor_lancamento, valor_titulo")
    .eq("extrato_id", extratoId)
    .eq("status", "nova");
  if (erroDivergencias) {
    throw new Error(`Falha ao buscar divergencias: ${erroDivergencias.message}`);
  }
  const divergencias = (divergenciasNovas ?? []) as DivergenciaRow[];
  if (divergencias.length === 0) {
    throw new Error("Nao ha divergencias novas para conciliar neste extrato");
  }

  const idsDivergencias = divergencias.map((d) => d.id);
  await admin.from("divergencias").update({ status: "investigando" }).in("id", idsDivergencias);

  const raizId = await iniciarOrquestrador({
    area: "financeiro",
    item_tipo: "divergencia",
    item_id: extratoId,
  });
  const ctxAgente = {
    area: "financeiro" as const,
    item_tipo: "divergencia" as const,
    item_id: extratoId,
    chamado_por: raizId,
  };

  try {
    const [{ data: clientes }, { data: titulosAbertosData }, { data: lancamentosData }] =
      await Promise.all([
        admin.from("Clientes").select("cod_cliente, nome"),
        admin
          .from("titulos_receber")
          .select("cod_titulo, cod_cliente, nota_fiscal, valor, emissao, vencimento, status")
          .eq("status", "aberto"),
        admin
          .from("lancamentos")
          .select("id, data, descricao, valor")
          .in(
            "id",
            divergencias.map((d) => d.lancamento_id).filter((id): id is string => id !== null),
          ),
      ]);

    const clientesPorCodigo = new Map(
      (clientes as { cod_cliente: string; nome: string }[] | null ?? []).map((c) => [
        c.cod_cliente,
        c.nome,
      ]),
    );
    const titulosAbertos = (titulosAbertosData as TituloAberto[]) ?? [];
    const lancamentosPorId = new Map(
      (lancamentosData as LancamentoRow[] | null ?? []).map((l) => [l.id, l]),
    );

    // Passo 2 — um Investigador por divergencia, todos em paralelo.
    const investigacoes = await Promise.all(
      divergencias.map(async (divergencia) => {
        const lancamento = divergencia.lancamento_id
          ? lancamentosPorId.get(divergencia.lancamento_id) ?? null
          : null;
        const titulosCandidatos = buscarTitulosCandidatos(
          divergencia,
          lancamento,
          titulosAbertos,
          clientesPorCodigo,
        );

        const { saida } = await agente<HipoteseInvestigador>(
          "investigador",
          {
            divergencia: {
              tipo_inicial: divergencia.tipo_inicial,
              valor_lancamento: divergencia.valor_lancamento,
              valor_titulo: divergencia.valor_titulo,
            },
            lancamento: lancamento
              ? { data: lancamento.data, descricao: lancamento.descricao, valor: lancamento.valor }
              : null,
            titulos_candidatos: titulosCandidatos,
          },
          ctxAgente,
        );

        await admin.from("divergencias").update({ hipotese: saida }).eq("id", divergencia.id);

        return { divergencia, lancamento, saida };
      }),
    );

    // Passo 3 — Consolidador, com o resumo do casamento do extrato.
    const [{ data: todosLancamentos }, { data: todasDivergencias }] = await Promise.all([
      admin.from("lancamentos").select("valor, situacao, data").eq("extrato_id", extratoId),
      admin
        .from("divergencias")
        .select("valor_lancamento, valor_titulo")
        .eq("extrato_id", extratoId),
    ]);
    const casados = (todosLancamentos ?? []).filter((l) => l.situacao === "casado");
    const datas = (todosLancamentos ?? []).map((l) => l.data as string);
    const periodo =
      datas.length > 0 ? `${datas.reduce((a, b) => (b < a ? b : a))} a ${datas.reduce((a, b) => (b > a ? b : a))}` : "";

    const resumoCasamento = {
      qtd_casados: casados.length,
      valor_casado: casados.reduce((s, l) => s + Number(l.valor), 0),
      qtd_divergencias: (todasDivergencias ?? []).length,
      valor_divergente: (todasDivergencias ?? []).reduce(
        (s, d) => s + Number(d.valor_lancamento ?? d.valor_titulo ?? 0),
        0,
      ),
      periodo,
    };

    const entradaConsolidador = {
      resumo_casamento: resumoCasamento,
      hipoteses: investigacoes.map((i) => i.saida),
    };
    let { saida: relatorio } = await agente<RelatorioConsolidador>(
      "consolidador",
      entradaConsolidador,
      ctxAgente,
    );

    // Passo 4 — Revisor. Se reprovar, refaz so o Consolidador, uma vez.
    const titulosAbertosParaRevisor = titulosAbertos.map((t) => ({
      cod_titulo: t.cod_titulo,
      valor: t.valor,
      cod_cliente: t.cod_cliente,
      vencimento: t.vencimento,
    }));

    const { saida: revisao } = await agente<RevisaoFinanceiro>(
      "revisor",
      {
        hipoteses: investigacoes.map((i) => i.saida),
        titulos_abertos: titulosAbertosParaRevisor,
        relatorio,
      },
      ctxAgente,
    );

    if (!revisao.aprovado) {
      const { saida: relatorioCorrigido } = await agente<RelatorioConsolidador>(
        "consolidador",
        { ...entradaConsolidador, ajustes: revisao.motivos },
        ctxAgente,
      );
      relatorio = relatorioCorrigido;
    }

    // Passo 5 — cada hipotese vira um item em aprovacoes; divergencias
    // vao para aguardando_aprovacao.
    for (const { divergencia, lancamento, saida } of investigacoes) {
      const codTituloPrincipal = saida.cod_titulos_envolvidos[0] ?? divergencia.cod_titulo ?? null;
      const clienteOuDescricao =
        (codTituloPrincipal &&
          clientesPorCodigo.get(
            titulosAbertos.find((t) => t.cod_titulo === codTituloPrincipal)?.cod_cliente ?? "",
          )) ??
        lancamento?.descricao ??
        codTituloPrincipal ??
        "sem identificacao";

      const valor = saida.valor_a_baixar || divergencia.valor_lancamento || divergencia.valor_titulo || 0;

      await admin.from("aprovacoes").insert({
        area: "financeiro",
        item_tipo: "divergencia",
        item_id: divergencia.id,
        titulo: `${saida.hipotese} · ${clienteOuDescricao} · ${formatarMoeda(valor)}`,
        proposta: {
          hipotese: saida,
          divergencia: {
            tipo_inicial: divergencia.tipo_inicial,
            valor_lancamento: divergencia.valor_lancamento,
            valor_titulo: divergencia.valor_titulo,
            cod_titulo: divergencia.cod_titulo,
          },
          lancamento,
          relatorio,
        },
        status: "pendente",
      });

      await admin
        .from("divergencias")
        .update({ status: "aguardando_aprovacao" })
        .eq("id", divergencia.id);
    }

    await finalizarOrquestrador(raizId, "ok");
    return relatorio;
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await finalizarOrquestrador(raizId, "erro", mensagem);
    await admin.from("divergencias").update({ status: "nova" }).in("id", idsDivergencias);
    throw erro;
  }
}
