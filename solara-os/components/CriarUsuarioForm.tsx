"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Area } from "@/lib/tipos";

const AREAS: { chave: Area; nome: string }[] = [
  { chave: "vendas", nome: "Vendas" },
  { chave: "financeiro", nome: "Financeiro" },
];

export default function CriarUsuarioForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [papel, setPapel] = useState<"operador" | "admin">("operador");
  const [areas, setAreas] = useState<Area[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [enviando, setEnviando] = useState(false);

  function alternarArea(a: Area) {
    setAreas((atual) =>
      atual.includes(a) ? atual.filter((x) => x !== a) : [...atual, a],
    );
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setOk(false);
    setEnviando(true);

    const resp = await fetch("/api/admin/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, senha, nome, papel, areas }),
    });
    const dados = await resp.json();
    setEnviando(false);

    if (!resp.ok) {
      setErro(dados.erro ?? "Falha ao criar usuário.");
      return;
    }

    setOk(true);
    setEmail("");
    setSenha("");
    setNome("");
    setPapel("operador");
    setAreas([]);
    router.refresh();
  }

  return (
    <form onSubmit={enviar} className="form-usuario">
      <label htmlFor="nu-email">E-mail</label>
      <input
        id="nu-email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />

      <label htmlFor="nu-nome">Nome</label>
      <input
        id="nu-nome"
        type="text"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        required
      />

      <label htmlFor="nu-senha">Senha inicial</label>
      <input
        id="nu-senha"
        type="text"
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        minLength={6}
        required
      />

      <label htmlFor="nu-papel">Papel</label>
      <select
        id="nu-papel"
        value={papel}
        onChange={(e) => setPapel(e.target.value as "operador" | "admin")}
      >
        <option value="operador">operador</option>
        <option value="admin">admin</option>
      </select>

      <fieldset className="areas">
        <legend>Áreas</legend>
        {AREAS.map((a) => (
          <label key={a.chave} className="checkbox">
            <input
              type="checkbox"
              checked={areas.includes(a.chave)}
              onChange={() => alternarArea(a.chave)}
            />
            {a.nome}
          </label>
        ))}
      </fieldset>

      {erro && <p className="erro">{erro}</p>}
      {ok && <p className="sucesso">Usuário criado.</p>}

      <button type="submit" disabled={enviando}>
        {enviando ? "Criando..." : "Criar usuário"}
      </button>
    </form>
  );
}
