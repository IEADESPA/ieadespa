import type { jsPDF } from "jspdf";

const OURO: [number, number, number] = [217, 179, 79];
const MARINHO: [number, number, number] = [15, 27, 51];
const CINZA: [number, number, number] = [90, 98, 112];

/**
 * Crachá configurável (v7.13). O evento escolhe (`eventos.cracha_config`, aba Dados do painel do evento) o que vai no crachá além do
 * nome: o TIPO de participante (Participante, Preletor, Equipe, Imprensa, Convidado — o organizador muda na lista de inscritos), a
 * IGREJA/CONGREGAÇÃO e a CIDADE (cada uma tirada da resposta a uma pergunta do evento) e o QR DO CREDENCIAMENTO (o mesmo conteúdo do
 * QR de `/qrcode/<slug>/`: "<evento>:<código>", que a tela de check-in já lê). Sem configuração, o crachá é o de sempre (só o nome).
 */
export interface ConfigCracha {
  tipo: boolean;
  igreja: boolean;
  cidade: boolean;
  qr: boolean;
  pergunta_igreja: number | null;
  pergunta_cidade: number | null;
}

export const TIPOS_PARTICIPANTE = ["Participante", "Preletor", "Equipe", "Imprensa", "Convidado"] as const;

const idPergunta = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** A configuração do evento, sempre completa (o que falta = desligado). Igreja/cidade sem pergunta escolhida ficam desligadas. */
export function normalizarConfigCracha(bruto: unknown): ConfigCracha {
  let c: unknown = bruto;
  if (typeof c === "string") {
    try {
      c = JSON.parse(c);
    } catch {
      c = null;
    }
  }
  const o = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
  const perguntaIgreja = idPergunta(o.pergunta_igreja);
  const perguntaCidade = idPergunta(o.pergunta_cidade);
  return {
    tipo: o.tipo === true,
    igreja: o.igreja === true && perguntaIgreja != null,
    cidade: o.cidade === true && perguntaCidade != null,
    qr: o.qr === true,
    pergunta_igreja: perguntaIgreja,
    pergunta_cidade: perguntaCidade,
  };
}

export interface DadosCracha {
  nome: string;
  codigo?: string | null;
  tipo?: string | null;
  igreja?: string | null;
  cidade?: string | null;
}

/**
 * O que de fato vai no crachá desta pessoa, seguindo a configuração: `{ nome, tipo, linhas, qr }` (`linhas` = igreja e cidade que
 * existirem; `qr` = o texto do QR, ou null). Campo ligado sem dado (a pessoa não respondeu) simplesmente não aparece.
 */
export function camposDoCracha(config: ConfigCracha, dados: DadosCracha, eventoId: number | string | null) {
  const limpo = (v: unknown, max = 60) => {
    const t = String(v ?? "").replace(/\s+/g, " ").trim();
    return t ? t.slice(0, max) : null;
  };
  const linhas = [config.igreja ? limpo(dados.igreja) : null, config.cidade ? limpo(dados.cidade) : null].filter((l): l is string => Boolean(l));
  const codigo = limpo(dados.codigo, 20);
  return {
    nome: limpo(dados.nome, 120) ?? "",
    tipo: config.tipo ? limpo(dados.tipo, 30) ?? "Participante" : null,
    linhas,
    qr: config.qr && codigo && eventoId != null ? `${eventoId}:${codigo}` : null,
  };
}

/**
 * Qual resposta vai para o crachá (revisão de 22/10/2026) — a MESMA regra de `api/src/lib/cracha.js`: `respostas_inscricao` tem criação
 * pública (a pesquisa pós-evento), então só vale a resposta MAIS ANTIGA (menor id), de pergunta do evento feita na inscrição (momento
 * diferente de "pos_evento"), criada até 10 minutos depois da inscrição (resposta antiga, sem `date_created`, vale).
 */
export const JANELA_RESPOSTA_CRACHA_MS = 10 * 60 * 1000;

export function perguntasDoCracha(perguntas: { id: number; evento?: number | string | null; momento?: string | null }[], eventoId: number | string | null): Set<number> {
  return new Set(perguntas.filter((p) => (p.evento == null || eventoId == null || String(p.evento) === String(eventoId)) && p.momento !== "pos_evento").map((p) => Number(p.id)));
}

export function respostaParaCracha(
  respostas: { id: number; pergunta: number; valor: string | null; date_created?: string | null }[],
  perguntaId: number | null,
  { perguntasValidas, inscricaoCriadaEm = null }: { perguntasValidas: Set<number>; inscricaoCriadaEm?: string | null },
): string | null {
  if (!perguntaId || !perguntasValidas.has(Number(perguntaId))) return null;
  const limite = inscricaoCriadaEm ? Date.parse(inscricaoCriadaEm) + JANELA_RESPOSTA_CRACHA_MS : null;
  const candidatas = respostas
    .filter((r) => Number(r.pergunta) === Number(perguntaId))
    .filter((r) => !r.date_created || limite == null || Number.isNaN(limite) || Date.parse(r.date_created) <= limite)
    .sort((a, b) => Number(a.id) - Number(b.id));
  const valor = candidatas.length ? candidatas[0].valor : null;
  return valor == null || String(valor).trim() === "" ? null : String(valor);
}

/** A matriz do QR (módulos escuros), no formato que `desenharCracha` desenha. Quem chama gera com a biblioteca do site (`/vendor/qrcode-generator`). */
export interface MatrizQr {
  tamanho: number;
  escuro: (linha: number, coluna: number) => boolean;
}

/** Gera a matriz com a biblioteca `qrcode-generator` carregada na página (`window.qrcode`); null se ela não estiver lá. */
export function matrizQr(texto: string | null): MatrizQr | null {
  const gerador = (globalThis as unknown as { qrcode?: (tipo: number, correcao: string) => { addData(t: string): void; make(): void; getModuleCount(): number; isDark(l: number, c: number): boolean } }).qrcode;
  if (!texto || typeof gerador !== "function") return null;
  const qr = gerador(0, "M");
  qr.addData(texto);
  qr.make();
  return { tamanho: qr.getModuleCount(), escuro: (l, c) => qr.isDark(l, c) };
}

/**
 * Desenha um crachá dentro do retângulo dado (x, y, largura, altura) —
 * permite montar 1 por página (autoatendimento) ou 4 por página em lote
 * (2x2, com linha de corte), do mesmo jeito que a igreja já imprime hoje.
 * v7.13: `extras` opcional com o tipo (faixa colorida no topo da caixa do nome), as linhas de igreja/cidade e o QR do credenciamento.
 */
export function desenharCracha(
  doc: jsPDF,
  rect: { x: number; y: number; largura: number; altura: number },
  params: { nome: string; eventoTitulo: string; tema: string | null; logo: string | null },
  extras: { tipo?: string | null; linhas?: string[]; qr?: MatrizQr | null } = {},
) {
  const { x, y, largura, altura } = rect;
  const { nome, eventoTitulo, tema, logo } = params;
  const margemInterna = 14;
  const linhasExtras = extras.linhas ?? [];
  const qr = extras.qr ?? null;

  doc.setDrawColor(...MARINHO);
  doc.setLineWidth(0.5);
  doc.rect(x, y, largura, altura);

  // Cabeçalho.
  const alturaCabecalho = 34;
  doc.setFillColor(...MARINHO);
  doc.rect(x, y, largura, alturaCabecalho, "F");
  if (logo) doc.addImage(logo, "PNG", x + margemInterna, y + 5, 22, 22);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("IEADESPA", x + margemInterna + (logo ? 28 : 0), y + 15, { maxWidth: largura - margemInterna * 2 - (logo ? 28 : 0) });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text("Igreja Evangélica Assembleia de Deus", x + margemInterna + (logo ? 28 : 0), y + 24, {
    maxWidth: largura - margemInterna * 2 - (logo ? 28 : 0),
  });

  let cursorY = y + alturaCabecalho + 16;

  doc.setTextColor(...MARINHO);
  doc.setFont("times", "bold");
  doc.setFontSize(13);
  const linhasTitulo = doc.splitTextToSize(eventoTitulo, largura - margemInterna * 2);
  doc.text(linhasTitulo, x + largura / 2, cursorY, { align: "center" });
  cursorY += linhasTitulo.length * 14 + 4;

  // Com QR e linhas extras o espaço é disputado: o tema (descrição do evento) só entra se couber.
  const precisaEspaco = Boolean(qr) || linhasExtras.length > 0;
  if (tema && !precisaEspaco) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...CINZA);
    const linhasTema = doc.splitTextToSize(tema, largura - margemInterna * 2);
    doc.text(linhasTema, x + largura / 2, cursorY, { align: "center" });
    cursorY += linhasTema.length * 10 + 8;
  }

  // Caixa de identificação — já vem com o nome, sem precisar escrever à mão.
  // Posicionada por volta de 60% da altura da célula, não colada no rodapé,
  // pra não sobrar um vão vazio grande no meio do crachá (com QR/linhas extras, sobe para caber tudo).
  const alturaRodape = 12;
  const tamanhoQr = qr ? Math.min(largura * 0.32, altura * 0.24) : 0;
  const espacoAbaixo = (linhasExtras.length ? linhasExtras.length * 11 + 6 : 0) + (qr ? tamanhoQr + 10 : 0);
  const caixaAltura = 34;
  const caixaY = Math.min(Math.max(cursorY + 24, y + altura * (precisaEspaco ? 0.36 : 0.58)), y + altura - alturaRodape - espacoAbaixo - caixaAltura - 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...CINZA);
  if (!extras.tipo) doc.text("IDENTIFICAÇÃO", x + largura / 2, caixaY - 8, { align: "center" });
  else {
    // O tipo em destaque: faixa dourada acima da caixa do nome.
    doc.setFillColor(...OURO);
    doc.rect(x + margemInterna, caixaY - 16, largura - margemInterna * 2, 12, "F");
    doc.setTextColor(...MARINHO);
    doc.text(extras.tipo.toUpperCase(), x + largura / 2, caixaY - 7.5, { align: "center" });
  }
  doc.setDrawColor(...MARINHO);
  doc.setLineWidth(0.75);
  doc.roundedRect(x + margemInterna, caixaY, largura - margemInterna * 2, caixaAltura, 3, 3);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...MARINHO);
  const nomeAjustado = doc.splitTextToSize(nome.toUpperCase(), largura - margemInterna * 2 - 10);
  doc.text(nomeAjustado.slice(0, 2), x + largura / 2, caixaY + caixaAltura / 2 + (nomeAjustado.length > 1 ? -3 : 4), {
    align: "center",
  });

  let abaixoY = caixaY + caixaAltura + 14;
  if (linhasExtras.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...CINZA);
    for (const linha of linhasExtras) {
      doc.text(doc.splitTextToSize(linha, largura - margemInterna * 2)[0] ?? "", x + largura / 2, abaixoY, { align: "center" });
      abaixoY += 11;
    }
  }
  if (qr) {
    const modulo = tamanhoQr / qr.tamanho;
    const qx = x + (largura - tamanhoQr) / 2;
    const qy = abaixoY;
    doc.setFillColor(0, 0, 0);
    for (let l = 0; l < qr.tamanho; l += 1) {
      for (let c = 0; c < qr.tamanho; c += 1) {
        if (qr.escuro(l, c)) doc.rect(qx + c * modulo, qy + l * modulo, modulo + 0.05, modulo + 0.05, "F");
      }
    }
  }

  // Rodapé decorativo.
  doc.setFillColor(...OURO);
  doc.rect(x, y + altura - alturaRodape, largura, alturaRodape, "F");
}
