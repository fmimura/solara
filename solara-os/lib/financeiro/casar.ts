// SPEC 5.3 — casamento de creditos com titulos, em codigo, sem modelo.
import type { LancamentoLimpo, TituloArquivo } from "@/lib/financeiro/limpar";

const TOLERANCIA_VALOR = 0.01;

export interface LancamentoCasado extends LancamentoLimpo {
  situacao: "casado" | "divergente" | "ignorado";
  cod_titulo_casado: string | null;
}

export interface DivergenciaInicial {
  tipo_inicial:
    | "valor_diferente_mesma_nf"
    | "sem_titulo_correspondente"
    | "possivel_soma"
    | "duplicado"
    | "vencido_sem_pagamento";
  // Indice em `lancamentos` (o array devolvido), null para
  // vencido_sem_pagamento, que nao tem lancamento associado.
  lancamentoIndex: number | null;
  cod_titulo: string | null;
  valor_lancamento: number | null;
  valor_titulo: number | null;
}

export interface ResultadoCasamento {
  lancamentos: LancamentoCasado[];
  divergenciasIniciais: DivergenciaInicial[];
  resumo: {
    qtd_casados: number;
    valor_casado: number;
    qtd_divergencias: number;
    valor_divergente: number;
  };
}

function extrairNF(descricao: string): string | null {
  const m = descricao.match(/NF-?\s*(\d+)/i);
  return m ? `NF-${m[1]}` : null;
}

export function diasEntre(dataA: string, dataB: string): number {
  const ms = Math.abs(new Date(dataA).getTime() - new Date(dataB).getTime());
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

// Valor do lancamento e igual a soma de exatamente dois titulos do
// mesmo cliente (SPEC 5.3, tipo "possivel_soma").
function existeParDeSoma(titulos: TituloArquivo[], valorAlvo: number): boolean {
  for (let i = 0; i < titulos.length; i++) {
    for (let j = i + 1; j < titulos.length; j++) {
      if (titulos[i].cod_cliente !== titulos[j].cod_cliente) continue;
      if (Math.abs(titulos[i].valor + titulos[j].valor - valorAlvo) < TOLERANCIA_VALOR) {
        return true;
      }
    }
  }
  return false;
}

export function casarLancamentos(
  lancamentos: LancamentoLimpo[],
  titulosAbertos: TituloArquivo[],
): ResultadoCasamento {
  const titulosCasados = new Set<string>();
  const resultado: LancamentoCasado[] = [];
  const divergencias: DivergenciaInicial[] = [];

  lancamentos.forEach((lancamento, indice) => {
    if (lancamento.tipo === "debito") {
      resultado.push({ ...lancamento, situacao: "ignorado", cod_titulo_casado: null });
      return;
    }

    // Passo 1 — NF na descricao com titulo de mesma nota e mesmo valor.
    const nf = extrairNF(lancamento.descricao);
    const tituloPorNf = nf
      ? titulosAbertos.find((t) => t.nota_fiscal.toUpperCase() === nf.toUpperCase())
      : undefined;

    let titulo: TituloArquivo | undefined;
    let tipoInicial: DivergenciaInicial["tipo_inicial"] | null = null;

    if (tituloPorNf) {
      if (Math.abs(tituloPorNf.valor - lancamento.valor) < TOLERANCIA_VALOR) {
        titulo = tituloPorNf;
      } else {
        tipoInicial = "valor_diferente_mesma_nf";
      }
    }

    // Passo 2 — exatamente um titulo aberto com mesmo valor e
    // vencimento a ate 5 dias da data do lancamento.
    if (!titulo && !tipoInicial) {
      const candidatos = titulosAbertos.filter(
        (t) =>
          Math.abs(t.valor - lancamento.valor) < TOLERANCIA_VALOR &&
          diasEntre(t.vencimento, lancamento.data) <= 5,
      );
      if (candidatos.length === 1) {
        titulo = candidatos[0];
      }
    }

    // Duplicado: o titulo encontrado ja foi usado por outro lancamento
    // deste mesmo extrato.
    if (titulo && titulosCasados.has(titulo.cod_titulo)) {
      tipoInicial = "duplicado";
      divergencias.push({
        tipo_inicial: "duplicado",
        lancamentoIndex: indice,
        cod_titulo: titulo.cod_titulo,
        valor_lancamento: lancamento.valor,
        valor_titulo: titulo.valor,
      });
      resultado.push({ ...lancamento, situacao: "divergente", cod_titulo_casado: null });
      return;
    }

    if (titulo) {
      titulosCasados.add(titulo.cod_titulo);
      resultado.push({
        ...lancamento,
        situacao: "casado",
        cod_titulo_casado: titulo.cod_titulo,
      });
      return;
    }

    // Passo 3 — divergente.
    if (!tipoInicial) {
      const existeMesmoValor = titulosAbertos.some(
        (t) => Math.abs(t.valor - lancamento.valor) < TOLERANCIA_VALOR,
      );
      if (!existeMesmoValor && existeParDeSoma(titulosAbertos, lancamento.valor)) {
        tipoInicial = "possivel_soma";
      } else {
        tipoInicial = "sem_titulo_correspondente";
      }
    }

    divergencias.push({
      tipo_inicial: tipoInicial,
      lancamentoIndex: indice,
      cod_titulo: tituloPorNf?.cod_titulo ?? null,
      valor_lancamento: lancamento.valor,
      valor_titulo: tituloPorNf?.valor ?? null,
    });
    resultado.push({ ...lancamento, situacao: "divergente", cod_titulo_casado: null });
  });

  // Depois do casamento: titulo em aberto com vencimento antes da data
  // final do extrato e sem lancamento casado -> vencido_sem_pagamento.
  if (lancamentos.length > 0) {
    const dataFinal = lancamentos.reduce((max, l) => (l.data > max ? l.data : max), lancamentos[0].data);
    for (const titulo of titulosAbertos) {
      if (titulosCasados.has(titulo.cod_titulo)) continue;
      if (titulo.vencimento < dataFinal) {
        divergencias.push({
          tipo_inicial: "vencido_sem_pagamento",
          lancamentoIndex: null,
          cod_titulo: titulo.cod_titulo,
          valor_lancamento: null,
          valor_titulo: titulo.valor,
        });
      }
    }
  }

  const casados = resultado.filter((l) => l.situacao === "casado");
  const valorDivergente = divergencias.reduce(
    (soma, d) => soma + (d.valor_lancamento ?? d.valor_titulo ?? 0),
    0,
  );

  return {
    lancamentos: resultado,
    divergenciasIniciais: divergencias,
    resumo: {
      qtd_casados: casados.length,
      valor_casado: casados.reduce((s, l) => s + l.valor, 0),
      qtd_divergencias: divergencias.length,
      valor_divergente: valorDivergente,
    },
  };
}
