"use client";

import { useState } from "react";
import Organograma from "@/components/Organograma";
import KanbanVendas from "@/components/KanbanVendas";
import FilaAprovacao, { type Decisao } from "@/components/FilaAprovacao";
import LinhaDoTempo from "@/components/LinhaDoTempo";
import { criarClienteBrowser } from "@/lib/supabase/client";
import type { Aprovacao, PedidoOrcamento } from "@/lib/tipos";

type Aba = "kanban" | "aprovacoes";

// SPEC 4.1 — tela de Vendas: organograma do pedido selecionado, kanban,
// aba de aprovacoes e painel lateral com a linha do tempo.
export default function PainelVendas() {
  const [aba, setAba] = useState<Aba>("kanban");
  const [selecionado, setSelecionado] = useState<PedidoOrcamento | null>(null);

  function selecionar(pedido: PedidoOrcamento) {
    setSelecionado((atual) =>
      atual?.cod_pedido === pedido.cod_pedido ? null : pedido,
    );
  }

  // SPEC 4.3 — aprovar ou editar leva o pedido para "respondido";
  // rejeitar leva para "rejeitado".
  async function aoDecidirAprovacao(aprovacao: Aprovacao, decisao: Decisao) {
    const supabase = criarClienteBrowser();
    const status = decisao === "rejeitada" ? "rejeitado" : "respondido";
    await supabase
      .from("pedidos_orcamento")
      .update({ status })
      .eq("cod_pedido", aprovacao.item_id);
  }

  return (
    <main className="tela-vendas">
      <h1>Vendas</h1>

      <section className="organograma-area">
        {selecionado ? (
          <Organograma area="vendas" itemId={selecionado.cod_pedido} />
        ) : (
          <p className="aviso">
            Selecione um pedido no kanban para ver o organograma.
          </p>
        )}
      </section>

      <nav className="abas">
        <button
          className={aba === "kanban" ? "aba-ativa" : ""}
          onClick={() => setAba("kanban")}
        >
          Kanban
        </button>
        <button
          className={aba === "aprovacoes" ? "aba-ativa" : ""}
          onClick={() => setAba("aprovacoes")}
        >
          Aprovações
        </button>
      </nav>

      {aba === "kanban" ? (
        <KanbanVendas
          selecionadoId={selecionado?.cod_pedido ?? null}
          onSelecionar={selecionar}
        />
      ) : (
        <FilaAprovacao area="vendas" aoDecidir={aoDecidirAprovacao} />
      )}

      {selecionado && (
        <>
          <div className="painel-fundo" onClick={() => setSelecionado(null)} />
          <aside className="painel-lateral">
            <div className="painel-lateral-cabecalho">
              <strong>{selecionado.cod_pedido}</strong>
              <button
                className="botao-fechar"
                onClick={() => setSelecionado(null)}
              >
                Fechar
              </button>
            </div>
            <LinhaDoTempo itemId={selecionado.cod_pedido} />
          </aside>
        </>
      )}
    </main>
  );
}
