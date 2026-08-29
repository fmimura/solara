"use client";

import { useCallback, useEffect, useState } from "react";
import { criarClienteBrowser } from "@/lib/supabase/client";
import { duracaoSegundos, type ExecucaoAgente } from "@/lib/tipos";

// SPEC 3.5 — execucoes de um item em ordem, com entrada/saida ao expandir.
export default function LinhaDoTempo({ itemId }: { itemId: string }) {
  const [execucoes, setExecucoes] = useState<ExecucaoAgente[]>([]);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const supabase = criarClienteBrowser();
    const { data } = await supabase
      .from("execucoes_agentes")
      .select("*")
      .eq("item_id", itemId)
      .order("inicio", { ascending: true });
    setExecucoes((data as ExecucaoAgente[]) ?? []);
  }, [itemId]);

  useEffect(() => {
    carregar();

    const supabase = criarClienteBrowser();
    const canal = supabase
      .channel(`linha-do-tempo:${itemId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "execucoes_agentes",
          filter: `item_id=eq.${itemId}`,
        },
        () => carregar(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [itemId, carregar]);

  if (execucoes.length === 0) {
    return <p className="aviso">Sem execuções para este item.</p>;
  }

  return (
    <ol className="linha-tempo">
      {execucoes.map((e) => {
        const s = duracaoSegundos(e);
        const tokens = (e.tokens_entrada ?? 0) + (e.tokens_saida ?? 0);
        return (
          <li key={e.id} className={`lt-item lt-${e.status}`}>
            <button
              className="lt-cabecalho"
              onClick={() =>
                setExpandidoId((atual) => (atual === e.id ? null : e.id))
              }
            >
              <span className="lt-agente">{e.agente}</span>
              <span className="lt-status">{e.status}</span>
              <span className="lt-meta">
                {s !== null ? `${s.toFixed(1)}s` : "—"}
                {e.status === "ok" ? ` · ${tokens} tok` : ""}
              </span>
            </button>

            {expandidoId === e.id && (
              <div className="lt-detalhe">
                <h4>entrada</h4>
                <pre className="json">
                  {JSON.stringify(e.entrada, null, 2)}
                </pre>
                <h4>saída</h4>
                <pre className="json">
                  {e.erro
                    ? e.erro
                    : JSON.stringify(e.saida, null, 2)}
                </pre>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
