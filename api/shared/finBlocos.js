// shared/finBlocos.js (FASE 10, Financeiro, incremento 1a, 21/11/2026) — a REGRA PURA dos blocos de recibo (migração 200). As consultas estão em
// shared/finBlocosDb.js. Tela aprovada: rodada 17, "Blocos de recibo" (os blocos, as folhas e o livro), opção 1 de cada.
//
// - O lote da gráfica: a primeira folha, a última e as folhas por bloco (50). O sistema numera os blocos: o número sai da primeira folha
//   (70.051 → bloco 1.401; 68.001 → 1.360), a conta do desenho aprovado. A série nunca repete número de folha.
// - A situação que a tela mostra: "Na Tesouraria Geral" (não foi entregue), "Esperando" (entregue, nenhuma folha usada), "Em uso" (entregue, com
//   folha usada) e "Fechado" (devolvido). Só "na Geral", "entregue" e "devolvido" se guardam; esperando e em uso saem do uso das folhas.
// - A folha tem um destino só: lançada na planilha, cancelada, arrancada ou extraviada (as três últimas com a observação).

const FOLHAS_POR_BLOCO = 50;
const MAX_BLOCOS_POR_LOTE = 1000;        // 50.000 folhas num lote: a gráfica manda uns 200 blocos por ano
const MAX_FOLHA = 999999999;             // cabe no INT da tabela, com folga
const POR_PAGINA = 40;                   // a lista dos blocos, como no desenho
const SITUACOES_FILTRO = ["todos", "em-uso", "esperando", "fechado", "na-geral"];
const DESTINOS_EXCECAO = { cancelada: "CANCELADA", arrancada: "ARRANCADA", extraviada: "EXTRAVIADA" };

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
  if (total % porBloco !== 0) return { erro: `O total de folhas tem de ser blocos inteiros de ${porBloco} (por exemplo, ${porBloco * 200} = 200 blocos).` };
  const nBlocos = total / porBloco;
  if (nBlocos > MAX_BLOCOS_POR_LOTE) return { erro: `Um lote tem no máximo ${MAX_BLOCOS_POR_LOTE} blocos. Cadastre em partes.` };
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

/** a exceção de uma folha: o que aconteceu (cancelada, arrancada, extraviada) e a observação, obrigatória */
function excecaoDaFolha(dados) {
  const d = dados && typeof dados === "object" ? dados : {};
  const destino = typeof d.oQueAconteceu === "string" ? DESTINOS_EXCECAO[d.oQueAconteceu.trim().toLowerCase()] : undefined;
  if (!destino) return { erro: "Escolha o que aconteceu com a folha: cancelada, arrancada ou extraviada." };
  const obs = typeof d.observacao === "string" ? d.observacao.trim() : "";
  if (!obs) return { erro: "Escreva a observação: o que aconteceu com a folha." };
  if (obs.length > 300) return { erro: "A observação passou de 300 letras." };
  const folha = inteiro(d.folha);
  if (folha === null || folha < 1 || folha > MAX_FOLHA) return { erro: "Escolha a folha." };   // 2^40 não cabe no INT (o lixo do e2e-201 pegou)
  return { folha, destino, observacao: obs };
}

// ---- incremento 2 (22/11/2026): as folhas de um bloco e o livro de entrada e saída (r17-blocos-folhas e r17-blocos-livro, opção 1) ----

const DESTINO_TELA = { LANCADA: "lancada", CANCELADA: "cancelada", ARRANCADA: "arrancada", EXTRAVIADA: "extraviada" };
/** o livro mostra 5 registros por página no notebook e 3 no celular (o desenho) */
const POR_PAGINA_LIVRO = [5, 3];

/** o destino guardado como a tela o chama (lancada, cancelada, arrancada, extraviada); outro valor = null */
const destinoDaTela = (d) => DESTINO_TELA[d] || null;

/** quantas folhas do bloco têm cada destino e quantas estão livres (a lista vem de FinFolhas: [{Destino}] ou [{Destino, N}]) */
function contagemDasFolhas(linhas, totalFolhas) {
  const c = { lancadas: 0, canceladas: 0, arrancadas: 0, extraviadas: 0, livres: 0 };
  const chave = { LANCADA: "lancadas", CANCELADA: "canceladas", ARRANCADA: "arrancadas", EXTRAVIADA: "extraviadas" };
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
  if (!motivo) return { erro: "Escreva o motivo: por que a exceção da folha está sendo desfeita." };
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

/** a mensagem da devolução parcial: as folhas que voltam livres, da primeira em branco ao fim do bloco */
function mensagemDaParcial(numero, de, ate) {
  const n = (x) => Number(x).toLocaleString("pt-BR");
  const livres = Number(de) === Number(ate) ? `a folha ${n(de)} está livre` : `as folhas ${n(de)} a ${n(ate)} estão livres`;
  return `Bloco ${n(numero)} de volta, parcial: ${livres} para outra entrega.`;
}

module.exports = {
  FOLHAS_POR_BLOCO, POR_PAGINA, MAX_BLOCOS_POR_LOTE,
  numeroDoBloco, blocosDoLote, posicaoDaFolha, situacaoDoBloco, filtroDaLista, procuraDaLista, paginaDaLista, excecaoDaFolha,
  destinoDaTela, contagemDasFolhas, pessoaDoLivro, porPaginaDoLivro, blocosAgora,
  levadoPelaArea, desfazimentoDaFolha, devolucaoParcial, mensagemDaParcial
};
