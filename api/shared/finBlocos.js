// shared/finBlocos.js (FASE 10, Financeiro, incremento 1a, 21/11/2026) — a REGRA PURA dos blocos de recibo (migração 200). As consultas estão em
// shared/finBlocosDb.js. Tela aprovada: rodada 17, "Blocos de recibo" (os blocos, as folhas e o livro), opção 1 de cada.
//
// - O lote da gráfica: a primeira folha, a última e as folhas por bloco (50). O sistema numera os blocos: o número sai da primeira folha
//   (70.051 → bloco 1.401; 68.001 → 1.360), a conta do desenho aprovado. A série nunca repete número de folha.
// - A situação que a tela mostra: "Na Tesouraria Geral" (não foi entregue), "Esperando" (entregue, nenhuma folha usada), "Em uso" (entregue, com
//   folha usada) e "Fechado" (devolvido). Só "na Geral", "entregue" e "devolvido" se guardam; esperando e em uso saem do uso das folhas.
// - A folha tem um destino só: lançada na planilha, cancelada, arrancada, extraviada ou inexistente (as quatro últimas com a observação). A
//   inexistente (decisão dele de 24/11/2026) é a folha que a gráfica não imprimiu: a numeração não pode pular, então ela se cataloga como as outras.

const FOLHAS_POR_BLOCO = 50;
const MAX_BLOCOS_POR_LOTE = 1000;        // 50.000 folhas num lote: a gráfica manda uns 200 blocos por ano
const MAX_FOLHA = 999999999;             // cabe no INT da tabela, com folga
const POR_PAGINA = 40;                   // a lista dos blocos, como no desenho
const SITUACOES_FILTRO = ["todos", "em-uso", "esperando", "fechado", "na-geral"];
const DESTINOS_EXCECAO = { cancelada: "CANCELADA", arrancada: "ARRANCADA", extraviada: "EXTRAVIADA", inexistente: "INEXISTENTE" };

const inteiro = (v) => {
  if (typeof v === "number") return Number.isInteger(v) ? v : null;
  if (typeof v === "string" && /^\d{1,10}$/.test(v.trim())) return Number(v.trim());
  return null;
};

/** o número do bloco pela primeira folha (a conta do desenho aprovado) */
function numeroDoBloco(primeiraFolha, folhasPorBloco = FOLHAS_POR_BLOCO) {
  return Math.floor((primeiraFolha - 1) / folhasPorBloco);
}

/** confere o lote da gráfica e devolve os blocos que ele cria (ou a mensagem do que não confere) */
function blocosDoLote(dados) {
  const d = dados && typeof dados === "object" ? dados : {};
  const serie = inteiro(d.serie);
  const primeira = inteiro(d.primeiraFolha);
  const porBloco = d.folhasPorBloco === undefined || d.folhasPorBloco === null || d.folhasPorBloco === "" ? FOLHAS_POR_BLOCO : inteiro(d.folhasPorBloco);
  const total = inteiro(d.totalFolhas);
  if (serie === null || serie < 2000 || serie > 2100) return { erro: "Informe a série do lote (o ano, por exemplo 2027)." };
  if (primeira === null || primeira < 1 || primeira > MAX_FOLHA) return { erro: "Informe o número da primeira folha do lote." };
  if (porBloco === null || porBloco < 1 || porBloco > 500) return { erro: "O número de folhas por bloco não confere." };
  if (total === null || total < porBloco) return { erro: `Informe quantas folhas vieram no lote (pelo menos um bloco de ${porBloco}).` };
  if (total % porBloco !== 0) return { erro: `O total de folhas tem de ser blocos inteiros de ${porBloco} (por exemplo, ${(porBloco * 200).toLocaleString("pt-BR")} = 200 blocos).` };
  const nBlocos = total / porBloco;
  if (nBlocos > MAX_BLOCOS_POR_LOTE) return { erro: `Um lote tem no máximo ${MAX_BLOCOS_POR_LOTE.toLocaleString("pt-BR")} blocos. Cadastre em partes.` };
  const ultima = primeira + total - 1;
  if (ultima > MAX_FOLHA) return { erro: "O número da última folha passou do limite." };
  const blocos = [];
  for (let i = 0; i < nBlocos; i++) {
    const p = primeira + i * porBloco;
    blocos.push({ numero: numeroDoBloco(p, porBloco), primeiraFolha: p, ultimaFolha: p + porBloco - 1 });
  }
  return { lote: { serie, primeiraFolha: primeira, ultimaFolha: ultima, folhasPorBloco: porBloco, totalFolhas: total }, blocos };
}

/** a posição da folha dentro do bloco (70.090 no bloco 70.051 a 70.100 = 40ª); null se a folha não é do bloco */
function posicaoDaFolha(folha, bloco) {
  const f = inteiro(folha);
  if (f === null || !bloco || f < bloco.primeiraFolha || f > bloco.ultimaFolha) return null;
  return f - bloco.primeiraFolha + 1;
}

/** a situação que a tela mostra, pelo que se guarda e pelo uso das folhas */
function situacaoDoBloco(guardada, usadas) {
  if (guardada === "NA_GERAL") return "na-geral";
  if (guardada === "DEVOLVIDO") return "fechado";
  return Number(usadas) > 0 ? "em-uso" : "esperando";
}

/** o filtro da lista: um dos da tela (todos, em uso, esperando, fechado) ou "na-geral" (só a Tesouraria Geral vê); outro valor vira "todos" */
function filtroDaLista(v) {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return SITUACOES_FILTRO.includes(s) ? s : "todos";
}

/** a procura "Nº do bloco ou de uma folha": só números (o ponto do milhar é aceito); vazio = sem procura */
function procuraDaLista(v) {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/\./g, "");
  if (!s) return null;
  return /^\d{1,9}$/.test(s) ? Number(s) : undefined;   // undefined = procura que não é número (nada acha)
}

/** a página pedida (1, 2, 3...); lixo vira 1 */
function paginaDaLista(v) {
  const n = inteiro(typeof v === "number" ? v : String(v ?? ""));
  return n !== null && n >= 1 && n <= 100000 ? n : 1;
}

/** a exceção de uma folha: o que aconteceu (cancelada, arrancada, extraviada, inexistente) e a observação, obrigatória */
function excecaoDaFolha(dados) {
  const d = dados && typeof dados === "object" ? dados : {};
  const destino = typeof d.oQueAconteceu === "string" ? DESTINOS_EXCECAO[d.oQueAconteceu.trim().toLowerCase()] : undefined;
  if (!destino) return { erro: "Escolha o que aconteceu: cancelada, arrancada, extraviada ou inexistente." };
  const obs = typeof d.observacao === "string" ? d.observacao.trim() : "";
  if (!obs) return { erro: "Escreva a observação: o que aconteceu com a folha." };
  if (obs.length > 300) return { erro: "A observação passou de 300 letras." };
  const folha = inteiro(d.folha);
  if (folha === null || folha < 1 || folha > MAX_FOLHA) return { erro: "Escolha a folha." };   // 2^40 não cabe no INT (o lixo do e2e-201 pegou)
  return { folha, destino, observacao: obs };
}

// ---- incremento 2 (22/11/2026): as folhas de um bloco e o livro de entrada e saída (r17-blocos-folhas e r17-blocos-livro, opção 1) ----

const DESTINO_TELA = { LANCADA: "lancada", CANCELADA: "cancelada", ARRANCADA: "arrancada", EXTRAVIADA: "extraviada", INEXISTENTE: "inexistente" };
/** o livro mostra 5 registros por página no notebook e 3 no celular (o desenho) */
const POR_PAGINA_LIVRO = [5, 3];

/** o destino guardado como a tela o chama (lancada, cancelada, arrancada, extraviada, inexistente); outro valor = null */
const destinoDaTela = (d) => DESTINO_TELA[d] || null;

/** quantas folhas do bloco têm cada destino e quantas estão livres (a lista vem de FinFolhas: [{Destino}] ou [{Destino, N}]) */
function contagemDasFolhas(linhas, totalFolhas) {
  const c = { lancadas: 0, canceladas: 0, arrancadas: 0, extraviadas: 0, inexistentes: 0, livres: 0 };
  const chave = { LANCADA: "lancadas", CANCELADA: "canceladas", ARRANCADA: "arrancadas", EXTRAVIADA: "extraviadas", INEXISTENTE: "inexistentes" };
  let usadas = 0;
  for (const l of linhas || []) {
    const k = chave[l.Destino];
    if (!k) continue;
    const n = l.N === undefined ? 1 : Number(l.N) || 0;
    c[k] += n;
    usadas += n;
  }
  c.livres = Math.max(0, Number(totalFolhas) - usadas);
  return c;
}

/** a pessoa do livro (quem levou o bloco ou quem o devolveu): alguém do cadastro (membroId) ou o nome escrito */
function pessoaDoLivro(pessoa, rotulo) {
  const p = pessoa && typeof pessoa === "object" && !Array.isArray(pessoa) ? pessoa : {};
  const semMembro = p.membroId == null || p.membroId === "";
  // só número ou texto de dígitos: [1], true e objeto não viram pessoa
  const membroId = semMembro ? null : typeof p.membroId === "number" || typeof p.membroId === "string" ? inteiro(p.membroId) : null;
  const nome = typeof p.nome === "string" ? p.nome.trim() : "";
  if (!semMembro && (!membroId || membroId < 1 || membroId > 2147483647)) return { erro: "A pessoa escolhida não confere." };
  if (membroId === null && !nome) return { erro: rotulo };
  if (nome.length > 200) return { erro: "O nome passou de 200 letras." };
  return { membroId, nome: membroId === null ? nome : null };
}

/** o nome do destino guardado, na frase da tela ("A folha 64.440 já está lançada: …", a r30) */
const NOME_DO_DESTINO = { LANCADA: "lançada", CANCELADA: "cancelada", ARRANCADA: "arrancada", EXTRAVIADA: "extraviada", INEXISTENTE: "inexistente" };
function nomeDoDestino(guardado) {
  return NOME_DO_DESTINO[guardado] || String(guardado || "").toLowerCase();
}

/** quantos registros por página o livro devolve (5 ou 3); outro valor = 5 */
function porPaginaDoLivro(v) {
  const n = inteiro(typeof v === "number" ? v : String(v ?? ""));
  return POR_PAGINA_LIVRO.includes(n) ? n : POR_PAGINA_LIVRO[0];
}

/** os blocos "agora" de quem não é a Geral (o livro da área e da congregação): esperando (nenhuma folha usada), em uso (alguma, mas não todas)
 *  e a devolver (todas as folhas com destino; o bloco volta para a Tesouraria Geral) */
function blocosAgora(linhas) {
  const r = { emUso: 0, esperando: 0, aDevolver: 0 };
  for (const l of linhas || []) {
    const usadas = Number(l.Usadas) || 0, total = Number(l.Total) || 0;
    if (usadas === 0) r.esperando++;
    else if (usadas >= total) r.aDevolver++;
    else r.emUso++;
  }
  return r;
}

// ---- a revisão de 23/11/2026: a regra dele de desfazer a exceção da folha e o "levado pela área" ----

/** "levado pela área" na saída: true = sim; false ou sem o campo = não; qualquer outra coisa (o texto "true", 1...) = null, recusado, para
 *  nunca virar "não" calado */
function levadoPelaArea(v) {
  if (v === undefined || v === null || v === false) return false;
  return v === true ? true : null;
}

/** desfazer a exceção de uma folha (só a Tesouraria Geral, regra dele de 23/11/2026): a folha e o motivo, obrigatório */
function desfazimentoDaFolha(dados) {
  const d = dados && typeof dados === "object" ? dados : {};
  const folha = inteiro(d.folha);
  if (folha === null || folha < 1 || folha > MAX_FOLHA) return { erro: "Escolha a folha." };
  const motivo = typeof d.motivo === "string" ? d.motivo.trim() : "";
  if (!motivo) return { erro: "Escreva o motivo para desfazer." };
  if (motivo.length > 300) return { erro: "O motivo passou de 300 letras." };
  return { folha, motivo };
}

// ---- a regra dele de 24/11/2026 (no lugar da "devolução só de bloco cheio" de 23/11), com o detalhe da r30: a devolução é COMPLETA ou PARCIAL ----
// Completa: o bloco fecha (o recibo ainda não lançado passa normalmente). Parcial: a tesouraria informa a primeira folha em branco (o sistema
// sugere); dela até a última folha do bloco, as folhas voltam livres e o bloco fica na Tesouraria Geral, para sair de novo só com elas. A folha sem
// destino antes da primeira em branco continua com a congregação. Nada se recusa por folha livre.

/** "parcial" na devolução: true = parcial; false ou sem o campo = completa; qualquer outra coisa = null, recusado (nunca vira "completa" calada) */
function devolucaoParcial(v) {
  if (v === undefined || v === null || v === false) return false;
  return v === true ? true : null;
}

const milhar = (x) => Number(x).toLocaleString("pt-BR");
const menosPorExtenso = (menos) => {
  if (!menos || !menos.length) return "";
  if (menos.length === 1) return ` (menos a ${milhar(menos[0])}, inexistente)`;
  return ` (menos as ${menos.slice(0, -1).map(milhar).join(", ")} e ${milhar(menos[menos.length - 1])}, inexistentes)`;
};
const livresPorExtenso = (de, ate, menos) =>
  (Number(de) === Number(ate) ? `a folha ${milhar(de)} está livre` : `as folhas ${milhar(de)} a ${milhar(ate)}${menosPorExtenso(menos)} estão livres`);

/** as folhas que voltam livres na devolução parcial (resposta dele, 24/11/2026: a primeira em branco é procurada ignorando as inexistentes): da
 *  primeira em branco ao fim do bloco, sem as inexistentes do fim ("as folhas 40 a 49 voltam livres e a 50ª continua inexistente"); as do meio
 *  vão em `menos`, para a mensagem dizer quais não estão livres. A primeira em branco nunca é inexistente (a devolução recusa antes). */
function faixaLivre(de, ate, inexistentes) {
  const fora = new Set((inexistentes || []).map(Number));
  let fim = Number(ate);
  while (fim > Number(de) && fora.has(fim)) fim--;
  const menos = [...fora].filter((f) => f >= Number(de) && f < fim).sort((a, b) => a - b);
  return { de: Number(de), ate: fim, menos };
}

/** a mensagem da devolução parcial: as folhas que voltam livres, da primeira em branco ao fim do bloco (menos as inexistentes) */
function mensagemDaParcial(numero, de, ate, menos) {
  return `Bloco ${milhar(numero)} de volta, parcial: ${livresPorExtenso(de, ate, menos)} para outra entrega.`;
}

/** a recusa da devolução do bloco que já voltou em parte e está na Geral (revisão m3): ele só volta de novo depois de sair; data em aaaa-mm-dd */
function mensagemJaVoltouParcial(numero, data, de, ate, menos) {
  const dia = String(data).slice(0, 10).split("-").reverse().join("/");
  return `O bloco ${milhar(numero)} já voltou, parcial, em ${dia}: ${livresPorExtenso(de, ate, menos)} na Tesouraria Geral para outra entrega.`;
}

// ---- o histórico da folha (r30-blocos-desfazer): quem marcou, quem desfez, quando e por quê ----

/** a hora do histórico em Brasília (UTC-3, sem horário de verão; o banco guarda UTC): "aaaa-mm-ddThh:mm" (a tela escreve "12/11 09h40") */
function horaBrasilia(d) {
  if (!d) return null;
  return new Date(new Date(d).getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

/** quem marcou, entre parênteses no histórico: o papel da liderança da pessoa (uma por pessoa) na congregação ("tesoureiro de Vila Nova") ou na
 *  área ("tesoureiro da Área 2"); fora delas, quem marca é a Tesouraria Geral */
function papelNoHistorico({ escopoTipo, papel, congregacao, area } = {}) {
  const nome = papel ? String(papel).toLowerCase() : "liderança";
  if (escopoTipo === "CONGREGACAO" && congregacao) return `${nome} de ${congregacao}`;
  if (escopoTipo === "AREA" && area) return `${nome} da ${area}`;
  return "Tesouraria Geral";
}

// ---- a folha digitada (portão da parte 2, I1): a saída e a entrada vão pela primeira folha do bloco, e a tela manda junto a folha que a pessoa
// digitou. Se ela não é do bloco que a primeira folha aponta, a tela estava com a resposta de um número anterior: o servidor recusa e diz por quê ----

/** a folha digitada que vem no pedido: ausente (pedido antigo) não muda nada; presente, só número inteiro positivo */
function folhaDigitada(v) {
  if (v === undefined || v === null || v === "") return { folha: null, erro: null };
  if (typeof v !== "number" || !Number.isInteger(v) || v <= 0 || v > 2147483647) return { folha: null, erro: "A folha digitada não confere." };
  return { folha: v, erro: null };
}

/** a recusa quando a folha digitada não é do bloco ({numero, primeiraFolha, ultimaFolha}); null quando é (ou quando não veio) */
function folhaForaDoBloco(folha, { numero, primeiraFolha, ultimaFolha }) {
  if (folha === null || folha === undefined) return null;
  if (folha >= Number(primeiraFolha) && folha <= Number(ultimaFolha)) return null;
  return `A folha ${milhar(folha)} não é do bloco ${milhar(numero)}: confira o número.`;
}

module.exports = {
  FOLHAS_POR_BLOCO, POR_PAGINA, MAX_BLOCOS_POR_LOTE,
  numeroDoBloco, blocosDoLote, posicaoDaFolha, situacaoDoBloco, filtroDaLista, procuraDaLista, paginaDaLista, excecaoDaFolha,
  destinoDaTela, contagemDasFolhas, pessoaDoLivro, nomeDoDestino, porPaginaDoLivro, blocosAgora,
  levadoPelaArea, desfazimentoDaFolha, devolucaoParcial, faixaLivre, mensagemDaParcial, mensagemJaVoltouParcial, horaBrasilia, papelNoHistorico,
  folhaDigitada, folhaForaDoBloco
};
