"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { criarClienteBrowser } from "@/lib/supabase/client";
import {
  COLUNAS_KANBAN_VENDAS,
  type Cliente,
  type PedidoOrcamento,
} from "@/lib/tipos";
import NovoPedidoForm from "@/components/NovoPedidoForm";

function resumoMensagem(mensagem: string): string {
  const texto = mensagem.trim();
  return texto.length > 80 ? `${texto.slice(0, 80)}…` : texto;
}

function dataBr(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : iso;
}

// SPEC 4.1 — kanban de pedidos_orcamento, atualizado por Realtime.
export default function KanbanVendas({
  selecionadoId,
  onSelecionar,
}: {
  selecionadoId: string | null;
  onSelecionar: (pedido: PedidoOrcamento) => void;
}) {
  const [pedidos, setPedidos] = useState<PedidoOrcamento[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [processandoId, setProcessandoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  const carregarPedidos = useCallback(async () => {
    const supabase = criarClienteBrowser();
    const { data } = await supabase
      .from("pedidos_orcamento")
      .select("cod_pedido, data, cod_cliente, canal, mensagem, status")
      .order("data", { ascending: false });
    setPedidos((data as PedidoOrcamento[]) ?? []);
  }, []);

  useEffect(() => {
    carregarPedidos();

    const supabase = criarClienteBrowser();
    supabase
      .from("Clientes")
      .select("cod_cliente, nome, segmento")
      .then(({ data }) => setClientes((data as Cliente[]) ?? []));

    const canal = supabase
      .channel("kanban-vendas")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos_orcamento" },
        () => carregarPedidos(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [carregarPedidos]);

  const nomePorCliente = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const c of clientes) mapa.set(c.cod_cliente, c.nome);
    return mapa;
  }, [clientes]);

  const porStatus = useMemo(() => {
    const mapa = new Map<string, PedidoOrcamento[]>();
    for (const p of pedidos) {
      const lista = mapa.get(p.status) ?? [];
      lista.push(p);
      mapa.set(p.status, lista);
    }
    return mapa;
  }, [pedidos]);

  async function processar(pedido: PedidoOrcamento) {
    setErro(null);
    setProcessandoId(pedido.cod_pedido);
    const resp = await fetch("/api/vendas/processar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cod_pedido: pedido.cod_pedido }),
    });
    const dados = await resp.json();
    setProcessandoId(null);
    if (!resp.ok) {
      setErro(dados.erro ?? "Falha ao processar pedido.");
    }
  }

  return (
    <div>
      <div className="kanban-topo">
        <button onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? "Cancelar" : "Novo pedido"}
        </button>
      </div>

      {mostrarForm && (
        <NovoPedidoForm
          clientes={clientes}
          aoCriar={() => setMostrarForm(false)}
        />
      )}

      {erro && <p className="erro">{erro}</p>}

      <div className="kanban">
        {COLUNAS_KANBAN_VENDAS.map((coluna) => (
          <div key={coluna.chave} className="kanban-coluna">
            <h3>{coluna.titulo}</h3>
            <div className="kanban-cartoes">
              {(porStatus.get(coluna.chave) ?? []).map((pedido) => (
                <div
                  key={pedido.cod_pedido}
                  className={`kanban-cartao${
                    selecionadoId === pedido.cod_pedido ? " selecionado" : ""
                  }`}
                  onClick={() => onSelecionar(pedido)}
                >
                  <div className="kanban-cartao-cabecalho">
                    <strong>{pedido.cod_pedido}</strong>
                    <span>{dataBr(pedido.data)}</span>
                  </div>
                  <div className="kanban-cartao-cliente">
                    {nomePorCliente.get(pedido.cod_cliente) ?? pedido.cod_cliente}
                  </div>
                  <div className="kanban-cartao-canal">{pedido.canal}</div>
                  <p className="kanban-cartao-mensagem">
                    {resumoMensagem(pedido.mensagem)}
                  </p>

                  {coluna.chave === "novo" && (
                    <button
                      disabled={processandoId === pedido.cod_pedido}
                      onClick={(e) => {
                        e.stopPropagation();
                        processar(pedido);
                      }}
                    >
                      {processandoId === pedido.cod_pedido
                        ? "Processando..."
                        : "Processar"}
                    </button>
                  )}
                </div>
              ))}
              {(porStatus.get(coluna.chave) ?? []).length === 0 && (
                <p className="kanban-vazio">—</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
