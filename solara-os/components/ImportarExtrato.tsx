"use client";

import { useState } from "react";

interface ResultadoImportacao {
  extrato_id: string;
  antes: string[];
  depois: string[];
  resumo: {
    qtd_casados: number;
    valor_casado: number;
    qtd_divergencias: number;
    valor_divergente: number;
  };
}

// SPEC 5.2 — upload do extrato (obrigatorio) + titulos (opcional), com
// comparacao antes/depois da limpeza.
export default function ImportarExtrato({
  aoImportar,
}: {
  aoImportar: (extratoId: string) => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);

    const form = new FormData(e.currentTarget);
    const resp = await fetch("/api/financeiro/importar", { method: "POST", body: form });
    const dados = await resp.json();
    setEnviando(false);

    if (!resp.ok) {
      setErro(dados.erro ?? "Falha ao importar extrato.");
      return;
    }

    setResultado(dados as ResultadoImportacao);
    aoImportar(dados.extrato_id);
  }

  return (
    <div className="importar-bloco">
      <form onSubmit={enviar} className="form-importar">
        <label htmlFor="fin-extrato">Extrato bancário (CSV limpo ou bruto)</label>
        <input id="fin-extrato" name="extrato" type="file" accept=".csv,text/csv" required />

        <label htmlFor="fin-titulos">Títulos (opcional — senão usa titulos_receber)</label>
        <input id="fin-titulos" name="titulos" type="file" accept=".csv,text/csv" />

        {erro && <p className="erro">{erro}</p>}

        <button type="submit" disabled={enviando}>
          {enviando ? "Importando..." : "Importar"}
        </button>
      </form>

      {resultado && (
        <div className="antes-depois">
          <div>
            <h4>Antes (como veio)</h4>
            <pre className="json">{resultado.antes.join("\n")}</pre>
          </div>
          <div>
            <h4>Depois (normalizado)</h4>
            <pre className="json">{resultado.depois.join("\n")}</pre>
          </div>
          <p className="aviso">
            {resultado.resumo.qtd_casados} lançamento(s) bateram (
            {resultado.resumo.valor_casado.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}
            ) · {resultado.resumo.qtd_divergencias} divergência(s) (
            {resultado.resumo.valor_divergente.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}
            )
          </p>
        </div>
      )}
    </div>
  );
}
