// Tipos compartilhados do Motor (SPEC secao 3).

export type Area = "vendas" | "financeiro";
export type ItemTipo = "pedido" | "divergencia";
export type StatusExecucao = "rodando" | "ok" | "erro";
export type StatusAprovacao = "pendente" | "aprovada" | "editada" | "rejeitada";

export type PapelAgente =
  | "triador"
  | "pesquisador"
  | "redator"
  | "revisor"
  | "investigador"
  | "consolidador";

// "orquestrador" e a raiz do organograma; nao chama o modelo.
export type NoOrganograma = PapelAgente | "orquestrador";

export interface ExecucaoAgente {
  id: string;
  area: Area;
  item_tipo: ItemTipo;
  item_id: string;
  agente: NoOrganograma;
  chamado_por: string | null;
  status: StatusExecucao;
  entrada: unknown;
  saida: unknown;
  erro: string | null;
  tokens_entrada: number | null;
  tokens_saida: number | null;
  inicio: string;
  fim: string | null;
}

export interface Aprovacao {
  id: string;
  area: Area;
  item_tipo: ItemTipo;
  item_id: string;
  titulo: string;
  proposta: unknown;
  status: StatusAprovacao;
  decidido_por: string | null;
  decidido_em: string | null;
  observacao: string | null;
  criado_em: string;
}

// Agentes desenhados no organograma de cada area (SPEC 3.3).
export const AGENTES_POR_AREA: Record<Area, PapelAgente[]> = {
  vendas: ["triador", "pesquisador", "redator", "revisor"],
  financeiro: ["investigador", "consolidador", "revisor"],
};

// Duracao de uma execucao em segundos (null enquanto nao terminou).
export function duracaoSegundos(e: ExecucaoAgente): number | null {
  if (!e.fim) return null;
  return (new Date(e.fim).getTime() - new Date(e.inicio).getTime()) / 1000;
}

// ---------------------------------------------------------------
// Vendas (SPEC secao 4)
// ---------------------------------------------------------------

export type StatusPedido =
  | "novo"
  | "processando"
  | "aguardando_aprovacao"
  | "respondido"
  | "rejeitado";

export interface PedidoOrcamento {
  cod_pedido: string;
  data: string;
  cod_cliente: string;
  canal: string;
  mensagem: string;
  status: StatusPedido;
}

// Colunas do ERP (tabela `Clientes`). So os campos usados nesta versao.
export interface Cliente {
  cod_cliente: string;
  nome: string;
  segmento: string | null;
}

export const COLUNAS_KANBAN_VENDAS: { chave: StatusPedido; titulo: string }[] = [
  { chave: "novo", titulo: "Novo" },
  { chave: "processando", titulo: "Processando" },
  { chave: "aguardando_aprovacao", titulo: "Aguardando aprovação" },
  { chave: "respondido", titulo: "Respondido" },
  { chave: "rejeitado", titulo: "Rejeitado" },
];

// ---------------------------------------------------------------
// Financeiro (SPEC secao 5)
// ---------------------------------------------------------------

export type SituacaoLancamento = "casado" | "divergente" | "ignorado";
export type StatusDivergencia =
  | "nova"
  | "investigando"
  | "aguardando_aprovacao"
  | "resolvida";

export interface ExtratoImportado {
  id: string;
  nome_arquivo: string;
  importado_em: string;
  importado_por: string | null;
  total_linhas: number;
  total_creditos: number;
}

export interface Lancamento {
  id: string;
  extrato_id: string;
  data: string;
  descricao: string;
  valor: number;
  tipo: "credito" | "debito";
  cod_titulo_casado: string | null;
  situacao: SituacaoLancamento;
}

export interface Divergencia {
  id: string;
  extrato_id: string;
  tipo_inicial: string;
  lancamento_id: string | null;
  cod_titulo: string | null;
  valor_lancamento: number | null;
  valor_titulo: number | null;
  status: StatusDivergencia;
  hipotese: unknown;
  criado_em: string;
}

export const COLUNAS_KANBAN_DIVERGENCIAS: { chave: StatusDivergencia; titulo: string }[] = [
  { chave: "nova", titulo: "Nova" },
  { chave: "investigando", titulo: "Investigando" },
  { chave: "aguardando_aprovacao", titulo: "Aguardando aprovação" },
  { chave: "resolvida", titulo: "Resolvida" },
];
