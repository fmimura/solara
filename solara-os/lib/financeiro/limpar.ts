// SPEC 5.3 — limpeza do extrato, em codigo, sem modelo.

export interface LancamentoLimpo {
  data: string; // ISO yyyy-mm-dd
  descricao: string;
  valor: number;
  tipo: "credito" | "debito";
}

export interface TituloArquivo {
  cod_titulo: string;
  cod_cliente: string;
  nota_fiscal: string;
  valor: number;
  emissao: string;
  vencimento: string;
  status: string;
}

export interface ResultadoLimpezaExtrato {
  linhas: LancamentoLimpo[];
  antes: string[]; // 6 primeiras linhas do arquivo, como vieram
  depois: string[]; // 6 primeiras linhas normalizadas
}

// Decodifica o arquivo tentando UTF-8; cai para latin-1 se falhar
// ("ler latin-1 se utf-8 falhar", SPEC 5.3).
async function decodificarArquivo(arquivo: File): Promise<string> {
  const buffer = Buffer.from(await arquivo.arrayBuffer());
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return buffer.toString("latin1");
  }
}

// Parser simples de uma linha CSV com suporte a campos entre aspas.
function dividirLinhaCsv(linha: string, separador: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let dentroDeAspas = false;

  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (dentroDeAspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else {
        dentroDeAspas = !dentroDeAspas;
      }
    } else if (c === separador && !dentroDeAspas) {
      campos.push(atual);
      atual = "";
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos.map((c) => c.trim());
}

// "1.250,00" -> 1250.00 ; "-45,90" -> -45.9 (SPEC 5.3).
function converterValorBr(valor: string): number {
  const limpo = valor.trim().replace(/\./g, "").replace(",", ".");
  return Number.parseFloat(limpo);
}

// "25/07/2026" -> "2026-07-25" (SPEC 5.3).
function converterDataBr(data: string): string {
  const [dia, mes, ano] = data.trim().split("/");
  return `${ano}-${mes}-${dia}`;
}

const REGEX_DATA_BR = /^\d{2}\/\d{2}\/\d{4}$/;

// Extrato ja limpo: cabecalho "cod_lancamento,data,descricao,valor,tipo".
function ehExtratoLimpo(primeiraLinha: string): boolean {
  return primeiraLinha.toLowerCase().replace(/\s/g, "").startsWith("cod_lancamento,");
}

function limparLinhasExtratoLimpo(linhas: string[]): LancamentoLimpo[] {
  const resultado: LancamentoLimpo[] = [];
  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i].trim();
    if (!linha) continue;
    const [, data, descricao, valor, tipo] = dividirLinhaCsv(linha, ",");
    if (!data) continue;
    resultado.push({
      data,
      descricao,
      valor: Number.parseFloat(valor),
      tipo: tipo?.trim() === "debito" ? "debito" : "credito",
    });
  }
  return resultado;
}

function limparLinhasExtratoBruto(linhas: string[]): LancamentoLimpo[] {
  // Pula linhas ate a que comeca com "Data" (SPEC 5.3).
  const indiceHeader = linhas.findIndex((l) => l.trim().toLowerCase().startsWith("data"));
  if (indiceHeader === -1) return [];

  const separador = linhas[indiceHeader].includes(";") ? ";" : ",";
  const resultado: LancamentoLimpo[] = [];

  for (let i = indiceHeader + 1; i < linhas.length; i++) {
    const linha = linhas[i].trim();
    if (!linha) continue;

    const campos = dividirLinhaCsv(linha, separador);
    const [dataBr, historico, valorBr] = campos;
    // Descarta linhas sem data valida (rodape, linhas soltas) e linhas
    // de SALDO (SPEC 5.3).
    if (!dataBr || !REGEX_DATA_BR.test(dataBr)) continue;
    if (!historico || /saldo/i.test(historico)) continue;
    if (!valorBr) continue;

    const valor = converterValorBr(valorBr);
    if (Number.isNaN(valor)) continue;

    resultado.push({
      data: converterDataBr(dataBr),
      descricao: historico.trim(),
      valor,
      tipo: valor < 0 ? "debito" : "credito",
    });
  }

  return resultado;
}

// Formata uma linha normalizada para o "depois" da comparacao visual.
function formatarLinhaNormalizada(l: LancamentoLimpo): string {
  return `${l.data},${l.descricao},${l.valor.toFixed(2)},${l.tipo}`;
}

export async function limparExtrato(arquivo: File): Promise<ResultadoLimpezaExtrato> {
  const texto = await decodificarArquivo(arquivo);
  const todasLinhas = texto.split(/\r\n|\n/);
  const antes = todasLinhas.slice(0, 6);

  const linhas = ehExtratoLimpo(todasLinhas[0] ?? "")
    ? limparLinhasExtratoLimpo(todasLinhas)
    : limparLinhasExtratoBruto(todasLinhas);

  const depois = linhas.slice(0, 6).map(formatarLinhaNormalizada);

  return { linhas, antes, depois };
}

// Titulos enviados pelo usuario (SPEC 5.3): mesmo formato de
// titulos_receber, sem limpeza especial descrita no SPEC.
export async function lerTitulosArquivo(arquivo: File): Promise<TituloArquivo[]> {
  const texto = await decodificarArquivo(arquivo);
  const linhas = texto.split(/\r\n|\n/).filter((l) => l.trim());
  const resultado: TituloArquivo[] = [];

  for (let i = 1; i < linhas.length; i++) {
    const [cod_titulo, cod_cliente, nota_fiscal, valor, emissao, vencimento, status] =
      dividirLinhaCsv(linhas[i], ",");
    if (!cod_titulo) continue;
    resultado.push({
      cod_titulo,
      cod_cliente,
      nota_fiscal,
      // Mesmo formato de titulos_receber (ponto decimal), sem
      // formatacao BR — diferente do extrato bancario.
      valor: Number.parseFloat(valor),
      emissao,
      vencimento,
      status: status?.trim() || "aberto",
    });
  }

  return resultado;
}
