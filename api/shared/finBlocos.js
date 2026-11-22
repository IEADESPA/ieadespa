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
  if (folha === null || folha < 1) return { erro: "Escolha a folha." };
  return { folha, destino, observacao: obs };
}

module.exports = {
  FOLHAS_POR_BLOCO, POR_PAGINA, MAX_BLOCOS_POR_LOTE,
  numeroDoBloco, blocosDoLote, posicaoDaFolha, situacaoDoBloco, filtroDaLista, procuraDaLista, paginaDaLista, excecaoDaFolha
};
