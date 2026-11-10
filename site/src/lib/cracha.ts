/**
 * Crachá configurável (v7.13). O evento escolhe (`eventos.cracha_config`, aba "Crachá e certificado" do painel do evento — que também guarda ali a aparência e o certificado, desde 10/11/2026) o que vai no crachá além do
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

// O DESENHO do crachá (e do certificado) mudou em 10/11/2026 para `src/lib/arteEvento.ts` (canvas, com a fonte do site e a logo inteira):
// aqui ficam só as regras do que vai no crachá (a configuração, os campos e qual resposta vale).
