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
