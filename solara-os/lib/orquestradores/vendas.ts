import { agente, finalizarOrquestrador, iniciarOrquestrador } from "@/lib/agente";
import { criarClienteAdmin } from "@/lib/supabase/admin";

// Tipos aceitos pelo Triador que seguem para as proximas etapas do
// pipeline (SPEC 4.2, passo 2). As demais classificacoes vao direto
// para a fila de aprovacao.
const TIPOS_QUE_SEGUEM = new Set(["orcamento", "complemento"]);

// No maximo 2 voltas Redator <-> Revisor quando o Revisor reprovar
// (SPEC 4.2, passo 5).
const MAX_VOLTAS_REVISOR = 2;

// Palavras curtas ou de preenchimento que nao ajudam a achar produto no
// catalogo (SPEC 4.2, passo 3: "ilike com as palavras principais").
const PALAVRAS_IGNORADAS = new Set([
  "de", "da", "do", "das", "dos", "para", "pra", "com", "sem", "uma", "umas",
  "um", "uns", "e", "ou", "a", "o", "os", "as", "se", "no", "na", "nos", "nas",
  "ao", "aos", "por", "que", "tem", "têm", "favor", "cotar", "cotação",
  "cotacao", "orçamento", "orcamento", "gostaríamos", "gostaria", "quero",
  "precisamos", "preciso", "manda", "mande", "enviar", "envie", "pedido",
  "pedimos", "bom", "dia", "boa", "tarde", "ainda", "sobre", "mesma", "até",
  "ate", "lá", "la", "hoje", "amanhã", "amanha", "cedo", "normal", "entrega",
  "prazo", "semana", "urgente", "obra", "cliente", "novo", "antigo", "sempre",
  "como", "somos", "condição", "condicao", "desconto", "validade", "dias",
  "unidades", "unidade", "tudo", "consegue", "vcs", "vendem", "qual", "melhor",
]);

// Saida esperada do Triador (SPEC 4.2, passo 2 / prompts/vendas/triador.md).
export interface TriagemVendas {
  tipo: "orcamento" | "complemento" | "reclamacao" | "fora_do_ramo" | "spam" | "outro";
  itens: {
    descricao_cliente: string;
    quantidade: number | null;
    unidade: string | null;
  }[];
  prazo_desejado: string | null;
  pede_desconto: boolean;
  desconto_pedido_pct: number | null;
  urgencia: "normal" | "alta" | "critica";
  observacoes: string;
}

interface ClienteBasico {
  cod_cliente: string;
  nome: string;
  segmento: string | null;
}

interface ClienteCompleto extends ClienteBasico {
  cidade: string | null;
  prazo_pagamento_dias: number | null;
  desconto_maximo_pct: number | null;
  cliente_desde: string | null;
}

interface ProdutoCandidato {
  cod_produto: string;
  descricao: string;
  unidade: string;
  preco_unitario: number;
  preco_acima_100_un: number;
  estoque: number;
  prazo_reposicao_dias: number;
}

interface CandidatoPorItem {
  descricao_cliente: string;
  candidatos: ProdutoCandidato[];
}

interface PedidoAnterior {
  cod_pedido: string;
  data: string;
  mensagem: string;
  status: string;
}

// Saida esperada do Pesquisador (prompts/vendas/pesquisador.md).
interface ContextoVendas {
  itens: {
    descricao_cliente: string;
    cod_produto: string | null;
    descricao: string | null;
    quantidade: number | null;
    unidade: string | null;
    existe: boolean;
    preco_aplicado: number | null;
    estoque: number | null;
    atende_estoque: boolean | null;
    prazo_reposicao_dias: number | null;
  }[];
  condicao_pagamento_dias: number;
  desconto_maximo_pct: number;
  observacoes: string;
}

// Saida esperada do Redator (prompts/vendas/redator.md).
interface RedacaoVendas {
  resposta: string;
  resumo: string;
}

// Saida esperada do Revisor (prompts/vendas/revisor.md).
interface RevisaoVendas {
  aprovado: boolean;
  motivos: string[];
}

// Extrai as palavras principais de uma descricao livre do cliente, para
// buscar candidatos no catalogo por semelhanca (SPEC 4.2, passo 3).
function palavrasPrincipais(descricao: string): string[] {
  const tokens = descricao.toLowerCase().match(/[\p{L}\d/-]+/gu) ?? [];
  return tokens.filter(
    (t) => t.length >= 3 && !PALAVRAS_IGNORADAS.has(t),
  );
}

// Variacoes de singular/plural de uma palavra, para o ilike pegar tanto
// "parafusos" quanto "parafuso", "protetores" quanto "protetor" etc.
function variacoes(palavra: string): string[] {
  const formas = new Set([palavra]);
  if (palavra.endsWith("es") && palavra.length > 5) {
    formas.add(palavra.slice(0, -2));
  }
  if (palavra.endsWith("s") && palavra.length > 4) {
    formas.add(palavra.slice(0, -1));
  }
  return [...formas];
}

// Consulta 1 (em codigo, sem modelo): candidatos do catalogo por item,
// buscando por semelhanca de descricao (SPEC 4.2, passo 3).
async function buscarCandidatosCatalogo(
  admin: ReturnType<typeof criarClienteAdmin>,
  itens: TriagemVendas["itens"],
): Promise<CandidatoPorItem[]> {
  return Promise.all(
    itens.map(async (item) => {
      const termos = palavrasPrincipais(item.descricao_cliente).flatMap(variacoes);
      if (termos.length === 0) {
        return { descricao_cliente: item.descricao_cliente, candidatos: [] };
      }

      const filtro = termos.map((t) => `descricao.ilike.%${t}%`).join(",");
      const { data } = await admin
        .from("Produtos")
        .select(
          "cod_produto, descricao, unidade, preco_unitario, preco_acima_100_un, estoque, prazo_reposicao_dias",
        )
        .or(filtro)
        .limit(8);

      return {
        descricao_cliente: item.descricao_cliente,
        candidatos: (data as ProdutoCandidato[]) ?? [],
      };
    }),
  );
}

// Consulta 2 (em codigo, sem modelo): linha de clientes + pedidos
// anteriores do mesmo cliente nos ultimos 30 dias (SPEC 4.2, passo 3).
async function buscarContextoCliente(
  admin: ReturnType<typeof criarClienteAdmin>,
  codCliente: string,
  dataPedidoAtual: string,
  codPedidoAtual: string,
): Promise<{ cliente: ClienteCompleto; pedidos_anteriores: PedidoAnterior[] }> {
  const cutoff = new Date(dataPedidoAtual);
  cutoff.setDate(cutoff.getDate() - 30);
  const dataCorte = cutoff.toISOString().slice(0, 10);

  const [{ data: cliente }, { data: pedidosAnteriores }] = await Promise.all([
    admin
      .from("Clientes")
      .select("cod_cliente, nome, cidade, segmento, prazo_pagamento_dias, desconto_maximo_pct, cliente_desde")
      .eq("cod_cliente", codCliente)
      .single(),
    admin
      .from("pedidos_orcamento")
      .select("cod_pedido, data, mensagem, status")
      .eq("cod_cliente", codCliente)
      .neq("cod_pedido", codPedidoAtual)
      .gte("data", dataCorte)
      .lte("data", dataPedidoAtual)
      .order("data", { ascending: false }),
  ]);

  if (!cliente) {
    throw new Error(`Cliente ${codCliente} nao encontrado`);
  }

  return {
    cliente: cliente as ClienteCompleto,
    pedidos_anteriores: (pedidosAnteriores as PedidoAnterior[]) ?? [],
  };
}

// Orquestrador de Vendas (SPEC 4.2): Triador -> Pesquisador -> Redator ->
// Revisor, com ate 2 voltas Redator/Revisor quando o Revisor reprovar.
export async function processarPedidoVendas(codPedido: string): Promise<void> {
  const admin = criarClienteAdmin();

  const { data: pedido, error: erroPedido } = await admin
    .from("pedidos_orcamento")
    .select("cod_pedido, data, mensagem, canal, cod_cliente")
    .eq("cod_pedido", codPedido)
    .single();
  if (erroPedido || !pedido) {
    throw new Error(`Pedido ${codPedido} nao encontrado`);
  }

  const { data: cliente, error: erroCliente } = await admin
    .from("Clientes")
    .select("cod_cliente, nome, segmento")
    .eq("cod_cliente", pedido.cod_cliente)
    .single();
  if (erroCliente || !cliente) {
    throw new Error(`Cliente ${pedido.cod_cliente} nao encontrado`);
  }
  const clienteBasico = cliente as ClienteBasico;

  await admin
    .from("pedidos_orcamento")
    .update({ status: "processando" })
    .eq("cod_pedido", codPedido);

  const raizId = await iniciarOrquestrador({
    area: "vendas",
    item_tipo: "pedido",
    item_id: codPedido,
  });
  const ctxAgente = {
    area: "vendas" as const,
    item_tipo: "pedido" as const,
    item_id: codPedido,
    chamado_por: raizId,
  };

  try {
    const { saida: triagem } = await agente<TriagemVendas>(
      "triador",
      {
        mensagem: pedido.mensagem,
        canal: pedido.canal,
        cliente: clienteBasico,
      },
      ctxAgente,
    );

    if (!TIPOS_QUE_SEGUEM.has(triagem.tipo)) {
      // SPEC 4.2: tipo fora de orcamento/complemento encerra o pipeline
      // aqui e vai direto para a fila de aprovacao.
      await admin.from("aprovacoes").insert({
        area: "vendas",
        item_tipo: "pedido",
        item_id: codPedido,
        titulo: `Não é orçamento: ${triagem.tipo}`,
        proposta: triagem,
        status: "pendente",
      });
      await admin
        .from("pedidos_orcamento")
        .update({ status: "aguardando_aprovacao" })
        .eq("cod_pedido", codPedido);
      await finalizarOrquestrador(raizId, "ok");
      return;
    }

    // Passo 3 — Pesquisador: duas consultas em paralelo, feitas em
    // codigo, e depois o agente casa cada item a um produto.
    const [candidatosCatalogo, { cliente: clienteCompleto, pedidos_anteriores }] =
      await Promise.all([
        buscarCandidatosCatalogo(admin, triagem.itens),
        buscarContextoCliente(admin, pedido.cod_cliente, pedido.data, codPedido),
      ]);

    const { saida: contexto } = await agente<ContextoVendas>(
      "pesquisador",
      {
        itens_pedidos: triagem.itens,
        candidatos_catalogo: candidatosCatalogo,
        cliente: clienteCompleto,
        pedidos_anteriores,
      },
      ctxAgente,
    );

    // Passos 4 e 5 — Redator e Revisor, com ate 2 voltas quando reprovar.
    let entradaRedator: {
      triagem: TriagemVendas;
      contexto: ContextoVendas;
      cliente: ClienteBasico;
      ajustes?: string[];
    } = { triagem, contexto, cliente: { cod_cliente: clienteBasico.cod_cliente, nome: clienteBasico.nome, segmento: clienteBasico.segmento } };

    let redacao = (await agente<RedacaoVendas>("redator", entradaRedator, ctxAgente)).saida;
    let revisao = (
      await agente<RevisaoVendas>("revisor", { resposta: redacao.resposta, contexto }, ctxAgente)
    ).saida;

    let voltas = 0;
    while (!revisao.aprovado && voltas < MAX_VOLTAS_REVISOR) {
      voltas++;
      entradaRedator = { ...entradaRedator, ajustes: revisao.motivos };
      redacao = (await agente<RedacaoVendas>("redator", entradaRedator, ctxAgente)).saida;
      revisao = (
        await agente<RevisaoVendas>("revisor", { resposta: redacao.resposta, contexto }, ctxAgente)
      ).saida;
    }

    // Passo 6 — fila de aprovacao, aprovado ou nao pelo Revisor (os
    // motivos, se houver, vao anexados dentro de `revisao`).
    await admin.from("aprovacoes").insert({
      area: "vendas",
      item_tipo: "pedido",
      item_id: codPedido,
      titulo: `${clienteBasico.nome} · ${redacao.resumo}`,
      proposta: { resposta: redacao.resposta, triagem, contexto, revisao },
      status: "pendente",
    });
    await admin
      .from("pedidos_orcamento")
      .update({ status: "aguardando_aprovacao" })
      .eq("cod_pedido", codPedido);

    await finalizarOrquestrador(raizId, "ok");
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await finalizarOrquestrador(raizId, "erro", mensagem);
    await admin
      .from("pedidos_orcamento")
      .update({ status: "novo" })
      .eq("cod_pedido", codPedido);
    throw erro;
  }
}
