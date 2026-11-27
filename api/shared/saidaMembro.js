// shared/saidaMembro.js (FASE 10, Membros, missão B: a saída com a carta, rodadas 29 e 31, 26/11/2026) — as regras puras da saída do rol e da carta nova.
// Sem banco. A tabela é a SaidasDoRol (migração 189); as rotas leem a ficha, montam a fotografia da carta com estas regras e gravam tudo numa transação,
// ANTES da vacância (shared/vacancia.js zera a função e encerra os cargos).
//
// As regras dele (docs/plano/fase-10-experiencia-design-performance.md, rodadas 29 e 31, e as decisões D1 a D9 do diário):
//  - o destino é só a cidade e o estado, nunca o nome da igreja; em branco, fica Parauapebas - PA;
//  - a situação: o congregado (e o novo convertido) sai "em Paz", nunca em Observação; "em Observação" é só para quem está sem comunhão ou em disciplina,
//    com o tempo e sem o motivo (as respostas dele de 26/11: o processo em andamento, a disciplina sem data para terminar, "sem comunhão desde"); a ficha
//    em arrolamento (D1) não diz a situação: leva a frase de que o cadastro estava em atualização;
//  - o tratamento: todo adulto é "o irmão" ou "a irmã" (membro, congregado ou em arrolamento); o menor de 18, "o menor" ou "a menor" (26/11);
//  - a carta impressa é curta: a última função (com a data da consagração) e o último cargo; com mais de 2 cargos ativos, os ativos do maior grau (D9);
//  - sem assinatura: o QR, o protocolo e os nomes impressos. O QR confere a carta pela impressão digital guardada no dia (com sal: ela não é o hash dos
//    dados, que se apagam) e, sem câmera, pelo código curto do rodapé;
//  - a carta vale 30 dias (a página do QR mostra os dados até o 30º dia, inclusive); depois, vence e os dados se apagam; com 1 ano, o resto da ficha.
// O que a carta não sabe dizer volta como `pendente` (sem texto inventado): a rota recusa, com a mensagem de MENSAGENS_PENDENTES.
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

// ---------- as recusas da carta (UM lugar só) ----------
// SITUACAO_DESCONHECIDA é regra dele (26/11): a carta recusa até a secretaria pôr uma das situações conhecidas. As outras duas não são casos dele e ficam
// recusadas, sem texto inventado (decisão da construção, 27/11, "para conferir"): a exclusão julgada que ainda vale (a pessoa já está fora do rol) e a
// disciplina julgada sem a data do julgamento (o "por quanto tempo" não sai sem o começo, e "sem data para terminar" seria falso com o fim gravado).
const SO_A_SECRETARIA = "A carta desta situação não sai pelo sistema. Procure a secretaria da sua congregação.";
const MENSAGENS_PENDENTES = Object.freeze({
  SITUACAO_DESCONHECIDA: "A situação desta pessoa na ficha não é uma das que a carta conhece. A secretaria precisa pôr Membro em comunhão, Congregado ou " +
    "Membro sem comunhão antes de a carta sair.",
  EXCLUSAO: SO_A_SECRETARIA,
  DISCIPLINA_SEM_INICIO: SO_A_SECRETARIA
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
 * A situação na carta. `disciplina`: o processo disciplinar ativo (shared/disciplina.js, sem a exclusão de antes da readmissão), { julgado, exclusao, inicio,
 * ate } ou null — `ate` nulo é a disciplina sem data para terminar (a Disciplina Rigorosa, o prazo indeterminado). `semComunhaoDesde`: a data do afastamento
 * da ficha (MembroReferencia.DataAfastamento), ou null.
 * Devolve { codigo, membro, texto } (membro: a caixa marcada, true = Membro, false = Congregado, null = nenhuma) ou { pendente } (MENSAGENS_PENDENTES).
 */
function situacaoDaCarta({ situacaoMembro, disciplina = null, semComunhaoDesde = null } = {}) {
  // o novo convertido (não batizado) sai como congregado (resposta de 26/11)
  if (situacaoMembro === "CONGREGADO" || situacaoMembro === "NOVO_CONVERTIDO") return { codigo: "PAZ", membro: false, texto: "em Paz" };
  if (situacaoMembro === "ARROLAMENTO") return { codigo: "ARROLAMENTO", membro: null, texto: null, frase: FRASE_ARROLAMENTO };
  if (situacaoMembro !== "EM_COMUNHAO" && situacaoMembro !== "SEM_COMUNHAO") return { pendente: "SITUACAO_DESCONHECIDA" };
  const observacao = (texto) => ({ codigo: "OBSERVACAO", membro: true, texto: `em Observação (${texto})` });
  if (disciplina) {
    if (disciplina.exclusao) return { pendente: "EXCLUSAO" };
    // o processo ainda não julgado: em andamento ou no afastamento cautelar (Art. 100), resposta de 26/11
    if (!disciplina.julgado) return observacao("processo em andamento");
    if (!disciplina.ate) return observacao("em disciplina, sem data para terminar");
    if (!disciplina.inicio) return { pendente: "DISCIPLINA_SEM_INICIO" };
    return observacao(`em disciplina por ${duracaoPorExtenso(disciplina.inicio, disciplina.ate)}, até ${dataBr(disciplina.ate)}`);
  }
  // sem comunhão sem processo (26/11): desde a data do afastamento da ficha. Sem ela, não se inventa uma (nem hoje, nem a saída, nem o dia em que a
  // secretaria completou o arrolamento): a carta diz só "sem comunhão" (D1: só os dados que existem; decisão da construção, 27/11, "para conferir")
  if (situacaoMembro === "SEM_COMUNHAO") return observacao(semComunhaoDesde ? `sem comunhão desde ${dataBr(semComunhaoDesde)}` : "sem comunhão");
  return { codigo: "COMUNHAO", membro: true, texto: "em Comunhão" };
}

/** "o irmão", "a irmã", "o menor", "a menor" (todo adulto, seja membro, congregado ou em arrolamento: resposta de 26/11); sem o sexo na ficha, as duas formas */
function tratamentoDaCarta({ sexo, menor }) {
  if (menor) return sexo === "M" ? "o menor" : sexo === "F" ? "a menor" : "o(a) menor";
  return sexo === "M" ? "o irmão" : sexo === "F" ? "a irmã" : "o(a) irmão(ã)";
}

// ---------- o rodapé ----------
// Sem linha de assinatura (r29 e r31): os nomes do pastor e da secretária impressos, como no desenho aprovado ("Pr. Abel Nogueira · pastor da congregação",
// "Débora Lima · secretária"). Quem são (resposta de 26/11) é lido em UM lugar só, shared/saidaRolDb.js::lerAssinaturasDaCarta, o ponto a trocar quando a
// diretoria da Estrutura existir. Sem ninguém no cargo, só o cargo. O "Pr." vem da função de Pastor na ficha (decisão da construção, 27/11, "para conferir").
const ROTULO_PASTOR = "pastor da congregação";
/** `lidas`: { pastor: { nome, sexo, cargoMinisterial } | null, secretaria: { nome, sexo } | null } → { pastor: { nome, rotulo }, secretaria: { nome, rotulo } } */
function assinaturasDaCarta({ pastor = null, secretaria = null } = {}) {
  const nomeDe = (p) => (p && typeof p.nome === "string" && p.nome.trim() ? p.nome.trim() : null);
  const nomePastor = nomeDe(pastor), nomeSecretaria = nomeDe(secretaria);
  return {
    pastor: { nome: nomePastor && pastor.cargoMinisterial === "PASTOR" ? `Pr. ${nomePastor}` : nomePastor, rotulo: ROTULO_PASTOR },
    secretaria: { nome: nomeSecretaria,
      rotulo: !nomeSecretaria ? "secretaria" : secretaria.sexo === "F" ? "secretária" : secretaria.sexo === "M" ? "secretário" : "secretário(a)" }
  };
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
 * vacância. `fontes`: shared/saidaRolDb.js::lerFontesDaCarta. Devolve { pendente } quando a carta não sabe dizer a situação (MENSAGENS_PENDENTES).
 * Só o que a carta mostra: nada de nascimento, contato ou número interno (o conteúdo se apaga aos 30 dias, mas até lá vai à página pública).
 */
function montarConteudoDaCarta(fontes, { dia, destino, protocolo, codigo, pedido, junto, assinaturas }) {
  const m = fontes.membro;
  const idade = idadeNoDia(m.nascimento, dia);
  const menor = idade !== null && idade < 18;
  const situacao = situacaoDaCarta({ situacaoMembro: m.situacaoMembro, disciplina: fontes.disciplina, semComunhaoDesde: m.semComunhaoDesde || null });
  if (situacao.pendente) return { pendente: situacao.pendente };
  const tratamento = tratamentoDaCarta({ sexo: m.sexo, menor });
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
    junto: junto || null, pedido: pedido || null, assinaturas: assinaturasDaCarta(assinaturas || undefined)
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
  destinoDaCarta, situacaoDaCarta, tratamentoDaCarta, assinaturasDaCarta, cargosDaCartaCurta, funcaoDaCartaCurta, montarConteudoDaCarta, idadeNoDia,
  gerarCodigoCurto, normalizarCodigoCurto, codigoCurtoValido, formatarCodigoCurto,
  gerarSal, impressaoDigital, seloDoQr, conferirSelo, canonico,
  ultimoDiaDaCarta, cartaVencida, etapaDevida, dataBr
};
