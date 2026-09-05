"use client";

import { useEffect, useState } from "react";
import Organograma from "@/components/Organograma";
import FilaAprovacao, { type Decisao } from "@/components/FilaAprovacao";
import LinhaDoTempo from "@/components/LinhaDoTempo";
import ImportarExtrato from "@/components/ImportarExtrato";
import ResultadoConciliacao from "@/components/ResultadoConciliacao";
import { criarClienteBrowser } from "@/lib/supabase/client";
import type { Aprovacao } from "@/lib/tipos";

type Aba = "relatorio" | "aprovacoes" | "linha_do_tempo";

interface RelatorioConsolidador {
  relatorio_markdown: string;
  acoes: string[];
}

// Proposta de Financeiro criada pelo orquestrador (SPEC 5.4, passo 5).
interface PropostaFinanceiro {
  hipotese: { hipotese: string; cod_titulos_envolvidos: string[] };
  divergencia: { cod_titulo: string | null };
}

// Status do titulo apos a decisao, por hipotese (SPEC 5.5: pago,
// pago_parcial ou vencido, conforme a acao).
const STATUS_TITULO_POR_HIPOTESE: Record<string, string | undefined> = {
  pagamento_parcial: "pago_parcial",
  dois_titulos_um_pagamento: "pago",
  duplicidade: "pago",
  diferenca_centavos: "pago",
  atraso_com_juros: "pago",
  vencido_sem_pagamento: "vencido",
  deposito_nao_identificado: "pago",
  outro: "pago",
};

// SPEC 5.2 — tela de Financeiro: organograma da conciliacao corrente,
// importar/limpar/casar, conciliar (agentes) e os resultados.
export default function PainelFinanceiro() {
  const [extratoId, setExtratoId] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("relatorio");
  const [relatorio, setRelatorio] = useState<RelatorioConsolidador | null>(null);
  const [conciliando, setConciliando] = useState(false);
  const [erroConciliar, setErroConciliar] = useState<string | null>(null);

  useEffect(() => {
    const supabase = criarClienteBrowser();
    supabase
      .from("extratos_importados")
      .select("id")
      .order("importado_em", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setExtratoId(data.id);
      });
  }, []);

  async function conciliar() {
    if (!extratoId) return;
    setConciliando(true);
    setErroConciliar(null);
    const resp = await fetch("/api/financeiro/conciliar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ extrato_id: extratoId }),
    });
    const dados = await resp.json();
    setConciliando(false);
    if (!resp.ok) {
      setErroConciliar(dados.erro ?? "Falha ao conciliar.");
      return;
    }
    setRelatorio(dados.relatorio as RelatorioConsolidador);
    setAba("relatorio");
  }

  // SPEC 5.5 — aprovar/editar resolve a divergencia e atualiza o(s)
  // titulo(s); rejeitar volta a divergencia para "nova".
  async function aoDecidirAprovacao(aprovacao: Aprovacao, decisao: Decisao) {
    const supabase = criarClienteBrowser();

    if (decisao === "rejeitada") {
      await supabase.from("divergencias").update({ status: "nova" }).eq("id", aprovacao.item_id);
      return;
    }

    await supabase
      .from("divergencias")
      .update({ status: "resolvida" })
      .eq("id", aprovacao.item_id);

    const proposta = aprovacao.proposta as PropostaFinanceiro | null;
    const hipotese = proposta?.hipotese;
    const codTitulos =
      hipotese?.cod_titulos_envolvidos?.length
        ? hipotese.cod_titulos_envolvidos
        : proposta?.divergencia.cod_titulo
          ? [proposta.divergencia.cod_titulo]
          : [];
    const statusTitulo = hipotese ? STATUS_TITULO_POR_HIPOTESE[hipotese.hipotese] : undefined;

    if (statusTitulo && codTitulos.length > 0) {
      await supabase.from("titulos_receber").update({ status: statusTitulo }).in("cod_titulo", codTitulos);
    }
  }

  return (
    <main className="tela-vendas">
      <h1>Financeiro</h1>

      <section className="organograma-area">
        {extratoId ? (
          <Organograma area="financeiro" itemId={extratoId} />
        ) : (
          <p className="aviso">Importe um extrato para começar.</p>
        )}
      </section>

      <h2>Importar</h2>
      <ImportarExtrato aoImportar={(id) => { setExtratoId(id); setRelatorio(null); }} />

      {extratoId && (
        <>
          <div className="kanban-topo">
            <button onClick={conciliar} disabled={conciliando}>
              {conciliando ? "Conciliando..." : "Conciliar"}
            </button>
          </div>
          {erroConciliar && <p className="erro">{erroConciliar}</p>}

          <ResultadoConciliacao extratoId={extratoId} />

          <nav className="abas">
            <button
              className={aba === "relatorio" ? "aba-ativa" : ""}
              onClick={() => setAba("relatorio")}
            >
              Relatório
            </button>
            <button
              className={aba === "aprovacoes" ? "aba-ativa" : ""}
              onClick={() => setAba("aprovacoes")}
            >
              Aprovações
            </button>
            <button
              className={aba === "linha_do_tempo" ? "aba-ativa" : ""}
              onClick={() => setAba("linha_do_tempo")}
            >
              Linha do tempo
            </button>
          </nav>

          {aba === "relatorio" &&
            (relatorio ? (
              <div className="relatorio">
                <div className="relatorio-markdown">{relatorio.relatorio_markdown}</div>
                {relatorio.acoes.length > 0 && (
                  <>
                    <h4>Ações</h4>
                    <ul>
                      {relatorio.acoes.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            ) : (
              <p className="aviso">Clique em Conciliar para gerar o relatório.</p>
            ))}

          {aba === "aprovacoes" && (
            <FilaAprovacao area="financeiro" aoDecidir={aoDecidirAprovacao} />
          )}

          {aba === "linha_do_tempo" && <LinhaDoTempo itemId={extratoId} />}
        </>
      )}
    </main>
  );
}
