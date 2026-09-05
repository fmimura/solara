"use client";

import { useState } from "react";
import { criarClienteBrowser } from "@/lib/supabase/client";
import type { Cliente } from "@/lib/tipos";

const CANAIS = ["e-mail", "whatsapp", "telefone"];

// Gera o proximo cod_pedido sequencial (PED031, PED032...) a partir do
// maior codigo existente (SPEC 4.1).
async function proximoCodPedido(): Promise<string> {
  const supabase = criarClienteBrowser();
  const { data } = await supabase
    .from("pedidos_orcamento")
    .select("cod_pedido")
    .order("cod_pedido", { ascending: false })
    .limit(1)
    .maybeSingle();

  const numeroAtual = data?.cod_pedido ? Number(data.cod_pedido.replace(/\D/g, "")) : 0;
  return `PED${String(numeroAtual + 1).padStart(3, "0")}`;
}

// SPEC 4.1 — formulario de "Novo pedido": cliente, canal, mensagem.
export default function NovoPedidoForm({
  clientes,
  aoCriar,
}: {
  clientes: Cliente[];
  aoCriar?: () => void;
}) {
  const [codCliente, setCodCliente] = useState("");
  const [canal, setCanal] = useState(CANAIS[0]);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);

    const supabase = criarClienteBrowser();
    const codPedido = await proximoCodPedido();

    const { error } = await supabase.from("pedidos_orcamento").insert({
      cod_pedido: codPedido,
      data: new Date().toISOString().slice(0, 10),
      cod_cliente: codCliente,
      canal,
      mensagem,
      status: "novo",
    });

    setEnviando(false);

    if (error) {
      setErro(`Falha ao criar pedido: ${error.message}`);
      return;
    }

    setCodCliente("");
    setMensagem("");
    aoCriar?.();
  }

  return (
    <form onSubmit={enviar} className="form-pedido">
      <label htmlFor="np-cliente">Cliente</label>
      <select
        id="np-cliente"
        value={codCliente}
        onChange={(e) => setCodCliente(e.target.value)}
        required
      >
        <option value="" disabled>
          Selecione...
        </option>
        {clientes.map((c) => (
          <option key={c.cod_cliente} value={c.cod_cliente}>
            {c.nome}
          </option>
        ))}
      </select>

      <label htmlFor="np-canal">Canal</label>
      <select id="np-canal" value={canal} onChange={(e) => setCanal(e.target.value)}>
        {CANAIS.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <label htmlFor="np-mensagem">Mensagem</label>
      <textarea
        id="np-mensagem"
        value={mensagem}
        onChange={(e) => setMensagem(e.target.value)}
        rows={4}
        required
      />

      {erro && <p className="erro">{erro}</p>}

      <button type="submit" disabled={enviando}>
        {enviando ? "Criando..." : "Criar pedido"}
      </button>
    </form>
  );
}
