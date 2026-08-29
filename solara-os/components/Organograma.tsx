"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { criarClienteBrowser } from "@/lib/supabase/client";
import {
  AGENTES_POR_AREA,
  duracaoSegundos,
  type Area,
  type ExecucaoAgente,
  type PapelAgente,
} from "@/lib/tipos";

// SPEC 3.3 — organograma em tempo real das execucoes de um item.
export default function Organograma({
  area,
  itemId,
}: {
  area: Area;
  itemId: string;
}) {
  const [execucoes, setExecucoes] = useState<ExecucaoAgente[]>([]);
  const [setaRedatorVermelha, setSetaRedatorVermelha] = useState(false);
  const timerSeta = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = criarClienteBrowser();
    let ativo = true;

    supabase
      .from("execucoes_agentes")
      .select("*")
      .eq("item_id", itemId)
      .order("inicio", { ascending: true })
      .then(({ data }) => {
        if (ativo && data) setExecucoes(data as ExecucaoAgente[]);
      });

    const canal = supabase
      .channel(`organograma:${itemId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "execucoes_agentes",
          filter: `item_id=eq.${itemId}`,
        },
        (payload) => {
          const nova = payload.new as ExecucaoAgente;
          if (!nova?.id) return;

          setExecucoes((prev) => {
            const i = prev.findIndex((e) => e.id === nova.id);
            if (i === -1) return [...prev, nova];
            const copia = [...prev];
            copia[i] = nova;
            return copia;
          });

          // Revisor reprovou: seta revisor -> redator vermelha por 3s.
          const saida = nova.saida as { aprovado?: boolean } | null;
          if (nova.agente === "revisor" && saida?.aprovado === false) {
            setSetaRedatorVermelha(true);
            if (timerSeta.current) clearTimeout(timerSeta.current);
            timerSeta.current = setTimeout(
              () => setSetaRedatorVermelha(false),
              3000,
            );
          }
        },
      )
      .subscribe();

    return () => {
      ativo = false;
      if (timerSeta.current) clearTimeout(timerSeta.current);
      supabase.removeChannel(canal);
    };
  }, [itemId]);

  const porAgente = useMemo(() => {
    const mapa = new Map<string, ExecucaoAgente[]>();
    for (const e of execucoes) {
      const lista = mapa.get(e.agente) ?? [];
      lista.push(e);
      mapa.set(e.agente, lista);
    }
    return mapa;
  }, [execucoes]);

  const raiz = porAgente.get("orquestrador")?.at(-1) ?? null;
  const agentes = AGENTES_POR_AREA[area];

  return (
    <div className="organograma">
      <Cartao rotulo="orquestrador" execucoes={raiz ? [raiz] : []} />

      <div className="organograma-setas">
        {agentes.map((papel) => (
          <span key={papel} className="seta-baixo" aria-hidden>
            ↓
          </span>
        ))}
      </div>

      <div className="organograma-agentes">
        {agentes.map((papel) => (
          <Cartao
            key={papel}
            rotulo={papel}
            execucoes={porAgente.get(papel) ?? []}
            multiplos={area === "financeiro" && papel === "investigador"}
            ligacaoVermelha={papel === "redator" && setaRedatorVermelha}
          />
        ))}
      </div>
    </div>
  );
}

function estadoDoCartao(execucoes: ExecucaoAgente[]) {
  if (execucoes.length === 0) return "vazio" as const;
  if (execucoes.some((e) => e.status === "erro")) return "erro" as const;
  if (execucoes.some((e) => e.status === "rodando")) return "rodando" as const;
  return "ok" as const;
}

function Cartao({
  rotulo,
  execucoes,
  multiplos = false,
  ligacaoVermelha = false,
}: {
  rotulo: PapelAgente | "orquestrador";
  execucoes: ExecucaoAgente[];
  multiplos?: boolean;
  ligacaoVermelha?: boolean;
}) {
  const estado = estadoDoCartao(execucoes);

  const ultima = execucoes.at(-1) ?? null;
  const segundos =
    ultima && estado === "ok" ? duracaoSegundos(ultima) : null;
  const tokens =
    ultima && estado === "ok"
      ? (ultima.tokens_entrada ?? 0) + (ultima.tokens_saida ?? 0)
      : null;

  const rodando = execucoes.filter((e) => e.status === "rodando").length;
  const concluidos = execucoes.filter((e) => e.status === "ok").length;

  return (
    <div
      className={`org-cartao org-${estado}${
        ligacaoVermelha ? " org-ligacao-vermelha" : ""
      }`}
    >
      <span className="org-rotulo">{rotulo}</span>

      {multiplos ? (
        <span className="org-detalhe">
          {rodando} rodando / {concluidos} concluídos
        </span>
      ) : estado === "ok" ? (
        <span className="org-detalhe">
          {segundos !== null ? `${segundos.toFixed(1)}s` : "—"}
          {tokens !== null ? ` · ${tokens} tok` : ""}
        </span>
      ) : estado === "erro" ? (
        <span className="org-detalhe">erro</span>
      ) : estado === "rodando" ? (
        <span className="org-detalhe">rodando…</span>
      ) : (
        <span className="org-detalhe">—</span>
      )}
    </div>
  );
}
