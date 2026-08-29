import { promises as fs } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { Area, ItemTipo, PapelAgente } from "@/lib/tipos";

// Modelo fixado pela stack do projeto (CLAUDE.md) — nao trocar.
const MODELO = "claude-sonnet-4-6";
const MAX_TOKENS = 2000;

export interface ContextoAgente {
  area: Area;
  item_tipo: ItemTipo;
  item_id: string;
  chamado_por?: string | null;
}

export interface ResultadoAgente<T = unknown> {
  saida: T;
  execucao_id: string;
}

// Lancada quando a resposta do modelo nao e JSON valido. O registro
// da execucao ja foi marcado como "erro" antes de propagar.
export class ErroParseAgente extends Error {
  constructor(
    public papel: PapelAgente,
    public textoBruto: string,
  ) {
    super(`Agente ${papel} nao devolveu JSON valido`);
    this.name = "ErroParseAgente";
  }
}

// Le o system prompt de prompts/<area>/<papel>.md (SPEC 3.2, passo 2).
async function lerPrompt(area: Area, papel: PapelAgente): Promise<string> {
  const caminho = path.join(process.cwd(), "prompts", area, `${papel}.md`);
  return fs.readFile(caminho, "utf-8");
}

// Remove cercas ```json ... ``` caso o modelo as inclua, antes do parse.
function limparJson(texto: string): string {
  const t = texto.trim();
  const cerca = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (cerca ? cerca[1] : t).trim();
}

/**
 * agente(papel, entrada, contexto) — SPEC 3.2.
 * Registra a execucao, chama a API da Anthropic, faz JSON.parse da
 * resposta e atualiza o registro. Devolve { saida, execucao_id }.
 * Toda chamada a API da Anthropic passa por aqui (CLAUDE.md).
 */
export async function agente<T = unknown>(
  papel: PapelAgente,
  entrada: unknown,
  contexto: ContextoAgente,
): Promise<ResultadoAgente<T>> {
  const supabase = criarClienteAdmin();

  const { data: registro, error: erroInsert } = await supabase
    .from("execucoes_agentes")
    .insert({
      area: contexto.area,
      item_tipo: contexto.item_tipo,
      item_id: contexto.item_id,
      agente: papel,
      chamado_por: contexto.chamado_por ?? null,
      status: "rodando",
      entrada,
      inicio: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (erroInsert || !registro) {
    throw new Error(
      `Falha ao registrar execucao do agente ${papel}: ${erroInsert?.message ?? "sem retorno"}`,
    );
  }

  const execucaoId: string = registro.id;

  try {
    const systemPrompt = await lerPrompt(contexto.area, papel);

    const anthropic = new Anthropic();
    const resposta = await anthropic.messages.create({
      model: MODELO,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: JSON.stringify(entrada) }],
    });

    const texto = resposta.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    let saida: T;
    try {
      saida = JSON.parse(limparJson(texto)) as T;
    } catch {
      throw new ErroParseAgente(papel, texto);
    }

    await supabase
      .from("execucoes_agentes")
      .update({
        status: "ok",
        saida,
        tokens_entrada: resposta.usage.input_tokens,
        tokens_saida: resposta.usage.output_tokens,
        fim: new Date().toISOString(),
      })
      .eq("id", execucaoId);

    return { saida, execucao_id: execucaoId };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await supabase
      .from("execucoes_agentes")
      .update({ status: "erro", erro: mensagem, fim: new Date().toISOString() })
      .eq("id", execucaoId);
    throw erro;
  }
}

/**
 * Cria a linha raiz do organograma (agente = "orquestrador"), para
 * que todos os agentes disparados tenham um pai comum (SPEC 3.2).
 * Devolve o id, que deve ser passado como `chamado_por`.
 */
export async function iniciarOrquestrador(
  contexto: Omit<ContextoAgente, "chamado_por">,
): Promise<string> {
  const supabase = criarClienteAdmin();
  const { data, error } = await supabase
    .from("execucoes_agentes")
    .insert({
      area: contexto.area,
      item_tipo: contexto.item_tipo,
      item_id: contexto.item_id,
      agente: "orquestrador",
      chamado_por: null,
      status: "rodando",
      inicio: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Falha ao iniciar orquestrador: ${error?.message ?? "sem retorno"}`);
  }
  return data.id;
}

// Fecha a linha raiz do organograma.
export async function finalizarOrquestrador(
  execucaoId: string,
  status: "ok" | "erro" = "ok",
  erro?: string,
): Promise<void> {
  const supabase = criarClienteAdmin();
  await supabase
    .from("execucoes_agentes")
    .update({ status, erro: erro ?? null, fim: new Date().toISOString() })
    .eq("id", execucaoId);
}
