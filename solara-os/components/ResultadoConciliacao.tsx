"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { criarClienteBrowser } from "@/lib/supabase/client";
import { COLUNAS_KANBAN_DIVERGENCIAS, type Divergencia, type Lancamento } from "@/lib/tipos";

function moeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// SPEC 5.2 — resultado em tres listas: Bateram, Divergencias (kanban) e
// Ignorados, atualizado por Realtime.
export default function ResultadoConciliacao({ extratoId }: { extratoId: string }) {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [divergencias, setDivergencias] = useState<Divergencia[]>([]);

  const carregar = useCallback(async () => {
    const supabase = criarClienteBrowser();
    const [{ data: lancs }, { data: divs }] = await Promise.all([
      supabase.from("lancamentos").select("*").eq("extrato_id", extratoId),
      supabase.from("divergencias").select("*").eq("extrato_id", extratoId),
    ]);
    setLancamentos((lancs as Lancamento[]) ?? []);
    setDivergencias((divs as Divergencia[]) ?? []);
  }, [extratoId]);

  useEffect(() => {
    carregar();

    const supabase = criarClienteBrowser();
    const canal = supabase
      .channel(`conciliacao:${extratoId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lancamentos", filter: `extrato_id=eq.${extratoId}` },
        () => carregar(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "divergencias", filter: `extrato_id=eq.${extratoId}` },
        () => carregar(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [extratoId, carregar]);

  const lancamentosPorId = useMemo(() => {
    const mapa = new Map<string, Lancamento>();
    for (const l of lancamentos) mapa.set(l.id, l);
    return mapa;
  }, [lancamentos]);

  const bateram = lancamentos.filter((l) => l.situacao === "casado");
  const ignorados = lancamentos.filter((l) => l.situacao === "ignorado");
  const porStatus = useMemo(() => {
    const mapa = new Map<string, Divergencia[]>();
    for (const d of divergencias) {
      const lista = mapa.get(d.status) ?? [];
      lista.push(d);
      mapa.set(d.status, lista);
    }
    return mapa;
  }, [divergencias]);

  return (
    <div className="resultado-conciliacao">
      <div className="resultado-coluna">
        <h3>Bateram ({bateram.length})</h3>
        <ul className="lista-simples lista-verde">
          {bateram.map((l) => (
            <li key={l.id}>
              <strong>{l.descricao}</strong>
              <span>
                {moeda(l.valor)} · {l.cod_titulo_casado}
              </span>
            </li>
          ))}
          {bateram.length === 0 && <li className="kanban-vazio">—</li>}
        </ul>

        <h3>Ignorados ({ignorados.length})</h3>
        <ul className="lista-simples">
          {ignorados.map((l) => (
            <li key={l.id}>
              <strong>{l.descricao}</strong>
              <span>{moeda(l.valor)}</span>
            </li>
          ))}
          {ignorados.length === 0 && <li className="kanban-vazio">—</li>}
        </ul>
      </div>

      <div className="resultado-divergencias">
        <h3>Divergências ({divergencias.length})</h3>
        <div className="kanban">
          {COLUNAS_KANBAN_DIVERGENCIAS.map((coluna) => (
            <div key={coluna.chave} className="kanban-coluna">
              <h4>{coluna.titulo}</h4>
              <div className="kanban-cartoes">
                {(porStatus.get(coluna.chave) ?? []).map((d) => {
                  const lancamento = d.lancamento_id ? lancamentosPorId.get(d.lancamento_id) : null;
                  const valor = d.valor_lancamento ?? d.valor_titulo ?? 0;
                  return (
                    <div key={d.id} className="kanban-cartao">
                      <div className="kanban-cartao-cabecalho">
                        <strong>{d.tipo_inicial}</strong>
                      </div>
                      <div className="kanban-cartao-cliente">
                        {lancamento?.descricao ?? d.cod_titulo ?? "—"}
                      </div>
                      <p className="kanban-cartao-mensagem">{moeda(valor)}</p>
                    </div>
                  );
                })}
                {(porStatus.get(coluna.chave) ?? []).length === 0 && (
                  <p className="kanban-vazio">—</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
