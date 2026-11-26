// shared/saidaMembro.js (FASE 10, Membros, missão B: a saída com a carta, rodadas 29 e 31, 26/11/2026) — as regras puras da saída do rol e da carta nova.
// Sem banco. A tabela é a SaidasDoRol (migração 189); as rotas leem a ficha, montam a fotografia da carta com estas regras e gravam tudo numa transação,
// ANTES da vacância (shared/vacancia.js zera a função e encerra os cargos).
//
// As regras dele (docs/plano/fase-10-experiencia-design-performance.md, rodadas 29 e 31, e as decisões D1 a D9 do diário):
//  - o destino é só a cidade e o estado, nunca o nome da igreja; em branco, fica Parauapebas - PA;
//  - a situação: o congregado sai "em Paz", nunca em Observação; "em Observação" é só para quem está sem comunhão ou em disciplina, com o tempo e sem o
//    motivo; a ficha em arrolamento (D1) não diz a situação: leva a frase de que o cadastro estava em atualização;
//  - a carta impressa é curta: a última função (com a data da consagração) e o último cargo; com mais de 2 cargos ativos, os ativos do maior grau (D9);
//  - sem assinatura: o QR, o protocolo e os nomes impressos. O QR confere a carta pela impressão digital guardada no dia (com sal: ela não é o hash dos
//    dados, que se apagam) e, sem câmera, pelo código curto do rodapé;
//  - a carta vale 30 dias (a página do QR mostra os dados até o 30º dia, inclusive); depois, vence e os dados se apagam; com 1 ano, o resto da ficha.
// Os casos que esperam a resposta dele voltam como `pendente` (sem texto inventado): a rota recusa até a regra chegar.
const crypto = require("crypto");

const CIDADE_PADRAO = "Parauapebas - PA";
const FRASE_ARROLAMENTO = "O cadastro desta pessoa estava em atualização no sistema da igreja.";
const DIAS_DA_CARTA = 30;
const UFS = new Set(["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR",
  "SC", "SP", "SE", "TO"]);
const MENSAGEM_DESTINO = "Escolha a cidade e o estado da lista (por exemplo, Marabá - PA), sem o nome da igreja. Em branco, fica Parauapebas - PA.";
// o nome de cidade do Brasil: letras (com acento), espaço, apóstrofo, hífen e ponto; até 60
const NOME_DE_CIDADE = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ' .-]{1,59}$/;

// Sem I, O, 0 e 1 (o código é lido no papel e digitado à mão), como os certificados (shared/certificados.js).
const ALFABETO_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TAMANHO_CODIGO = 6;
const TAMANHO_SAL = 16;
const TAMANHO_SELO = 32;

// ---------- datas (texto AAAA-MM-DD, o dia de Brasília que a rota já calculou) ----------
function diaUtc(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso == null ? "" : iso));
  const d = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
  if (!d || d.toISOString().slice(0, 10) !== iso) throw new Error(`data inválida: ${iso}`);
  return d;
}
const isoDe = (d) => d.toISOString().slice(0, 10);
const somarDias = (iso, n) => { const d = diaUtc(iso); d.setUTCDate(d.getUTCDate() + n); return isoDe(d); };
const somarAnos = (iso, n) => { const d = diaUtc(iso); d.setUTCFullYear(d.getUTCFullYear() + n); return isoDe(d); };
const dataBr = (iso) => iso.split("-").reverse().join("/");
const ultimoDiaDoMes = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();

// ---------- o destino ----------
/** o destino da carta: { ok, destino } no formato da lista ("Marabá - PA"), ou { ok: false, mensagem } */
function destinoDaCarta(texto) {
  if (texto === null || texto === undefined) return { ok: true, destino: CIDADE_PADRAO };
  if (typeof texto !== "string") return { ok: false, mensagem: MENSAGEM_DESTINO };
  const limpo = texto.replace(/\s+/g, " ").trim();
  if (!limpo) return { ok: true, destino: CIDADE_PADRAO };
  const m = /^(.+?)\s*[-/]\s*([A-Za-z]{2})$/.exec(limpo);
  if (!m) return { ok: false, mensagem: MENSAGEM_DESTINO };
  const cidade = m[1].trim(), uf = m[2].toUpperCase();
  if (!UFS.has(uf) || !NOME_DE_CIDADE.test(cidade)) return { ok: false, mensagem: MENSAGEM_DESTINO };
  return { ok: true, destino: `${cidade} - ${uf}` };
}

// ---------- os textos que esperam a resposta dele (UM lugar só) ----------
// Enquanto a regra não chega (perguntas 1 e 3 da missão B, 26/11: a Observação sem data de fim e o tratamento do adulto congregado ou em arrolamento), a
// carta desses casos não sai e a rota responde com a mensagem daqui. Quando a resposta chegar, o texto entra em situacaoDaCarta/tratamentoDaCarta e a
// chave sai desta lista. SITUACAO_DESCONHECIDA é regra (resposta de 26/11): a carta recusa até a secretaria pôr uma das situações conhecidas.
const AINDA_SEM_TEXTO = "A carta desta situação ainda não pode sair pelo sistema. Procure a secretaria da sua congregação.";
const MENSAGENS_PENDENTES = Object.freeze({
  SITUACAO_DESCONHECIDA: "A situação desta pessoa na ficha não é uma das que a carta conhece. A secretaria precisa pôr Membro em comunhão, Congregado ou " +
    "Membro sem comunhão antes de a carta sair.",
  DISCIPLINA_SEM_PRAZO: AINDA_SEM_TEXTO,
  DISCIPLINA_NAO_JULGADA: AINDA_SEM_TEXTO,
  SEM_COMUNHAO: AINDA_SEM_TEXTO,
  TRATAMENTO: AINDA_SEM_TEXTO
});

// ---------- a situação ----------
// O prazo da disciplina por extenso: meses inteiros quando o dia bate (o fim do mês conta como mês inteiro), senão em dias.
function duracaoPorExtenso(inicio, ate) {
  const a = diaUtc(inicio), b = diaUtc(ate);
  let meses = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  const diaBate = a.getUTCDate() === b.getUTCDate() || (a.getUTCDate() > b.getUTCDate() && b.getUTCDate() === ultimoDiaDoMes(b));
  if (meses > 0 && diaBate) return meses === 1 ? "1 mês" : `${meses} meses`;
  const dias = Math.round((b - a) / 86400000);
  return dias === 1 ? "1 dia" : `${dias} dias`;
}

/**
 * A situação na carta. `disciplina`: o processo disciplinar ativo (shared/disciplina.js), { julgado, inicio, ate } ou null.
 * Devolve { codigo, membro, texto } (membro: a caixa marcada, true = Membro, false = Congregado, null = nenhuma) ou { pendente } enquanto a regra não chegou.
 */
function situacaoDaCarta({ situacaoMembro, disciplina = null } = {}) {
  // o novo convertido (não batizado) sai como congregado (resposta de 26/11)
  if (situacaoMembro === "CONGREGADO" || situacaoMembro === "NOVO_CONVERTIDO") return { codigo: "PAZ", membro: false, texto: "em Paz" };
  if (situacaoMembro === "ARROLAMENTO") return { codigo: "ARROLAMENTO", membro: null, texto: null, frase: FRASE_ARROLAMENTO };
  if (situacaoMembro !== "EM_COMUNHAO" && situacaoMembro !== "SEM_COMUNHAO") return { pendente: "SITUACAO_DESCONHECIDA" };
  if (disciplina) {
    if (!disciplina.julgado) return { pendente: "DISCIPLINA_NAO_JULGADA" };
    if (!disciplina.ate || !disciplina.inicio) return { pendente: "DISCIPLINA_SEM_PRAZO" };
    return { codigo: "OBSERVACAO", membro: true, texto: `em Observação (em disciplina por ${duracaoPorExtenso(disciplina.inicio, disciplina.ate)}, até ${dataBr(disciplina.ate)})` };
  }
  if (situacaoMembro === "SEM_COMUNHAO") return { pendente: "SEM_COMUNHAO" };
  return { codigo: "COMUNHAO", membro: true, texto: "em Comunhão" };
}

/** "o irmão", "a irmã", "o menor", "a menor"; sem o sexo na ficha, as duas formas; o adulto congregado e o em arrolamento: null (espera a regra) */
function tratamentoDaCarta({ sexo, menor, codigo }) {
  if (menor) return sexo === "M" ? "o menor" : sexo === "F" ? "a menor" : "o(a) menor";
  if (codigo !== "COMUNHAO" && codigo !== "OBSERVACAO") return null;
  return sexo === "M" ? "o irmão" : sexo === "F" ? "a irmã" : "o(a) irmão(ã)";
}

// ---------- a carta curta ----------
// do mais recente ao mais antigo pelo campo; o empate se desfaz pelo nome (a carta sai sempre igual)
const maisRecentePor = (campo) => (x, y) => String(y[campo] || "").localeCompare(String(x[campo] || "")) || String(x.nome).localeCompare(String(y.nome), "pt-BR");

/**
 * Os cargos da carta impressa. `cargos`: [{ nome, grau, inicio, fim, ativo }] (grau: shared/nivelDoCargo.js::ordemDoCargo; ativo: até a saída).
 * Sem ativo: o último que terminou. Com 1 ou 2 ativos: um só, o de maior grau (no empate, o mais recente). Com mais de 2: todos os ativos do maior grau.
 */
function cargosDaCartaCurta(cargos) {
  const lista = Array.isArray(cargos) ? cargos.slice() : [];
  if (lista.length === 0) return [];
  const ativos = lista.filter((c) => c.ativo);
  if (ativos.length === 0) return [lista.sort(maisRecentePor("fim"))[0]];
  const maior = Math.max(...ativos.map((c) => Number(c.grau) || 0));
  const doMaior = ativos.filter((c) => (Number(c.grau) || 0) === maior).sort(maisRecentePor("inicio"));
  return ativos.length > 2 ? doMaior : [doMaior[0]];
}

/** a função da carta impressa: a última consagração { nome, data }, ou null */
function funcaoDaCartaCurta(consagracoes) {
  const lista = Array.isArray(consagracoes) ? consagracoes.slice() : [];
  return lista.length ? lista.sort(maisRecentePor("data"))[0] : null;
}

// ---------- o código curto e a impressão digital ----------
function gerarCodigoCurto() {
  let codigo = "";
  for (let i = 0; i < TAMANHO_CODIGO; i++) codigo += ALFABETO_CODIGO[crypto.randomInt(ALFABETO_CODIGO.length)];
  return codigo;
}
const normalizarCodigoCurto = (texto) => (typeof texto === "string" ? texto.toUpperCase().replace(/[^A-Z0-9]/g, "") : "");
function codigoCurtoValido(texto) {
  const c = normalizarCodigoCurto(texto);
  return c.length === TAMANHO_CODIGO && [...c].every((x) => ALFABETO_CODIGO.includes(x));
}
const formatarCodigoCurto = (texto) => { const c = normalizarCodigoCurto(texto); return `${c.slice(0, 3)}-${c.slice(3)}`; };

// JSON com as chaves em ordem: a mesma carta dá sempre o mesmo texto
function canonico(v) {
  if (Array.isArray(v)) return `[${v.map(canonico).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonico(v[k])}`).join(",")}}`;
  return JSON.stringify(v === undefined ? null : v);
}
// o sal: 16 bytes aleatórios, guardados na linha em hex minúsculo (32), o mesmo jeito da impressão (texto: passa igual pela API e pelo banco)
const gerarSal = () => crypto.randomBytes(TAMANHO_SAL).toString("hex");
const SAL_VALIDO = /^[0-9a-f]{32}$/;

/** a impressão digital da carta (64 hex): sha256 do sal (16 bytes, guardado na linha) com o conteúdo canônico */
function impressaoDigital(conteudo, sal) {
  if (typeof sal !== "string" || !SAL_VALIDO.test(sal)) throw new Error("impressaoDigital: o sal precisa ter 16 bytes (32 hex minúsculos)");
  return crypto.createHash("sha256").update(Buffer.from(sal, "hex")).update(canonico(conteudo), "utf8").digest("hex");
}
/** o que o QR leva: o começo da impressão (128 bits) */
const seloDoQr = (impressao) => String(impressao).slice(0, TAMANHO_SELO);
/** o selo lido no QR confere com a impressão guardada? (comparação de tempo constante) */
function conferirSelo(impressaoGuardada, selo) {
  if (typeof impressaoGuardada !== "string" || typeof selo !== "string" || selo.length !== TAMANHO_SELO) return false;
  const a = Buffer.from(seloDoQr(impressaoGuardada).toLowerCase()), b = Buffer.from(selo.toLowerCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- a fotografia da carta ----------
/** a idade completa no dia (texto AAAA-MM-DD); null sem a data */
function idadeNoDia(nascimento, dia) {
  if (!nascimento) return null;
  const n = diaUtc(nascimento), d = diaUtc(dia);
  let idade = d.getUTCFullYear() - n.getUTCFullYear();
  if (d.getUTCMonth() < n.getUTCMonth() || (d.getUTCMonth() === n.getUTCMonth() && d.getUTCDate() < n.getUTCDate())) idade--;
  return idade;
}
const porData = (campo) => (x, y) => (x[campo] ? (y[campo] ? x[campo].localeCompare(y[campo]) : -1) : (y[campo] ? 1 : 0)) || String(x.nome).localeCompare(String(y.nome), "pt-BR");

/**
 * O conteúdo guardado da carta (SaidasDoRol.Conteudo): os dados de hoje, o histórico inteiro (a página do QR) e a seleção curta (o papel), tirado ANTES da
 * vacância. `fontes`: shared/saidaRolDb.js::lerFontesDaCarta. Devolve { pendente } quando a situação ou o tratamento ainda não têm regra.
 * Só o que a carta mostra: nada de nascimento, contato ou número interno (o conteúdo se apaga aos 30 dias, mas até lá vai à página pública).
 */
function montarConteudoDaCarta(fontes, { dia, destino, protocolo, codigo, pedido, junto, assinaturas }) {
  const m = fontes.membro;
  const idade = idadeNoDia(m.nascimento, dia);
  const menor = idade !== null && idade < 18;
  const situacao = situacaoDaCarta({ situacaoMembro: m.situacaoMembro, disciplina: fontes.disciplina });
  if (situacao.pendente) return { pendente: situacao.pendente };
  const tratamento = tratamentoDaCarta({ sexo: m.sexo, menor, codigo: situacao.codigo });
  if (!tratamento) return { pendente: "TRATAMENTO" };
  const arrolamento = situacao.codigo === "ARROLAMENTO";
  const cargos = (fontes.cargos || []).map((c) => ({ nome: c.nome, grau: Number(c.grau) || 0, inicio: c.inicio || null, fim: c.ativo ? dia : c.fim || null, ativo: !!c.ativo }));
  const consagracoes = (fontes.consagracoes || []).map((c) => ({ nome: c.nome, data: c.data || null })).sort(porData("data"));
  return {
    v: 1, documento: "CARTA_MUDANCA", protocolo, codigo: formatarCodigoCurto(codigo), emitidaEm: dia,
    pessoa: { nome: m.nome, matricula: m.membroId, sexo: m.sexo, menor },
    tratamento, situacao, congregacao: m.congregacao, area: m.area, destino,
    historico: {
      // a data de entrada de quem está em arrolamento veio do sistema pago, com sentido desconhecido: não vai (D1, "sem inventar o que a ficha não tem")
      chegada: !arrolamento && m.dataAdmissao ? { data: m.dataAdmissao, forma: m.formaAdmissao, congregacao: fontes.chegadaCongregacao } : null,
      batismoAguas: m.dataBatismo ? { data: m.dataBatismo, local: fontes.localBatismo || null } : null,
      batismoEspirito: fontes.espiritoSanto && fontes.espiritoSanto.data ? { data: fontes.espiritoSanto.data, aproximada: !!fontes.espiritoSanto.aproximada } : null,
      consagracoes,
      cargos: cargos.slice().sort(porData("inicio")),
      estadoCivil: m.estadoCivil,
      saida: { dia }
    },
    curto: { funcao: funcaoDaCartaCurta(consagracoes), cargos: cargosDaCartaCurta(cargos) },
    junto: junto || null, pedido: pedido || null, assinaturas: assinaturas || null
  };
}

// ---------- os prazos ----------
/** o último dia em que a carta vale (e a página do QR mostra os dados): o 30º dia depois da saída */
const ultimoDiaDaCarta = (diaSaida) => somarDias(diaSaida, DIAS_DA_CARTA);
/** a carta venceu? (hoje: o dia de Brasília) */
function cartaVencida(diaSaida, hoje) {
  diaUtc(hoje);
  return hoje > ultimoDiaDaCarta(diaSaida);
}
/** a etapa do apagamento que já devia ter rodado: 0 nada; 1 a dos 30 dias (cargos, escalas, contatos, família e a carta); 2 a de 1 ano (o resto) */
function etapaDevida(diaSaida, hoje) {
  diaUtc(hoje);
  if (hoje > somarAnos(diaSaida, 1)) return 2;
  return hoje > ultimoDiaDaCarta(diaSaida) ? 1 : 0;
}

module.exports = {
  CIDADE_PADRAO, FRASE_ARROLAMENTO, DIAS_DA_CARTA, ALFABETO_CODIGO, TAMANHO_CODIGO, MENSAGENS_PENDENTES,
  destinoDaCarta, situacaoDaCarta, tratamentoDaCarta, cargosDaCartaCurta, funcaoDaCartaCurta, montarConteudoDaCarta, idadeNoDia,
  gerarCodigoCurto, normalizarCodigoCurto, codigoCurtoValido, formatarCodigoCurto,
  gerarSal, impressaoDigital, seloDoQr, conferirSelo, canonico,
  ultimoDiaDaCarta, cartaVencida, etapaDevida, dataBr
};
