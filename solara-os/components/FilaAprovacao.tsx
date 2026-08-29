"use client";

import { useCallback, useEffect, useState } from "react";
import { criarClienteBrowser } from "@/lib/supabase/client";
import type { Aprovacao, Area, StatusAprovacao } from "@/lib/tipos";

type Decisao = "aprovada" | "editada" | "rejeitada";

// SPEC 3.4 — mesma fila usada em Vendas e Financeiro.
export default function FilaAprovacao({
  area,
  aoDecidir,
}: {
  area: Area;
  // Gancho opcional para a area aplicar efeitos no item (SPEC 4.3 / 5.5).
  aoDecidir?: (aprovacao: Aprovacao, decisao: Decisao) => void | Promise<void>;
}) {
  const [itens, setItens] = useState<Aprovacao[]>([]);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState("");
  const [processando, setProcessando] = useState(false);

  const carregar = useCallback(async () => {
    const supabase = criarClienteBrowser();
    const { data } = await supabase
      .from("aprovacoes")
      .select("*")
      .eq("area", area)
      .eq("status", "pendente")
      .order("criado_em", { ascending: true });
    setItens((data as Aprovacao[]) ?? []);
  }, [area]);

  useEffect(() => {
    carregar();

    const supabase = criarClienteBrowser();
    const canal = supabase
      .channel(`aprovacoes:${area}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "aprovacoes",
          filter: `area=eq.${area}`,
        },
        () => carregar(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [area, carregar]);

  function abrir(item: Aprovacao) {
    if (abertoId === item.id) {
      setAbertoId(null);
      return;
    }
    setAbertoId(item.id);
    setRascunho(JSON.stringify(item.proposta, null, 2));
  }

  async function decidir(item: Aprovacao, decisao: Decisao) {
    setProcessando(true);
    const supabase = criarClienteBrowser();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let observacao: string | null = null;
    if (decisao === "rejeitada") {
      observacao = window.prompt("Observação da rejeição:") ?? "";
    }

    const patch: Partial<Aprovacao> = {
      status: decisao as StatusAprovacao,
      decidido_por: user?.id ?? null,
      decidido_em: new Date().toISOString(),
      observacao,
    };

    if (decisao === "editada") {
      try {
        patch.proposta = JSON.parse(rascunho);
      } catch {
        window.alert("O texto editado não é JSON válido.");
        setProcessando(false);
        return;
      }
    }

    const { error } = await supabase
      .from("aprovacoes")
      .update(patch)
      .eq("id", item.id);

    setProcessando(false);

    if (error) {
      window.alert(`Falha ao salvar decisão: ${error.message}`);
      return;
    }

    await aoDecidir?.({ ...item, ...patch } as Aprovacao, decisao);
    setAbertoId(null);
    carregar();
  }

  if (itens.length === 0) {
    return <p className="aviso">Nenhum item pendente de aprovação.</p>;
  }

  return (
    <ul className="fila">
      {itens.map((item) => (
        <li key={item.id} className="fila-item">
          <button className="fila-titulo" onClick={() => abrir(item)}>
            {item.titulo}
          </button>

          {abertoId === item.id && (
            <div className="fila-detalhe">
              <pre className="json">
                {JSON.stringify(item.proposta, null, 2)}
              </pre>

              <label htmlFor={`edit-${item.id}`}>Editar proposta (JSON)</label>
              <textarea
                id={`edit-${item.id}`}
                value={rascunho}
                onChange={(e) => setRascunho(e.target.value)}
                rows={10}
              />

              <div className="fila-acoes">
                <button
                  disabled={processando}
                  onClick={() => decidir(item, "aprovada")}
                >
                  Aprovar
                </button>
                <button
                  disabled={processando}
                  onClick={() => decidir(item, "editada")}
                >
                  Salvar edição e aprovar
                </button>
                <button
                  disabled={processando}
                  className="botao-perigo"
                  onClick={() => decidir(item, "rejeitada")}
                >
                  Rejeitar
                </button>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
