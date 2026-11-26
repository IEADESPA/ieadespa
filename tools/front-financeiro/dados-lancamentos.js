// dados-lancamentos.js — a API simulada do lançamento de dízimos e ofertas (financeiro/lancamentos/*), para o navegador.js e as fotos do
// construído. Os dados são os do desenho aprovado (r24-lancamento: Vila Nova, bloco 1.403, quarta 02/12/2026), todos de mentira. A planilha, a
// tira e os totais saem da REGRA DE VERDADE (api/shared/finLancamentos.js: montarPlanilha, tiraDoBloco, totaisDoMes), e o salvar confere cada
// linha com a mesma regra do servidor (validarLinha, excecaoNaPlanilha): o formato e as recusas são os reais.
"use strict";
const path = require("path");
const regra = require(path.join(__dirname, "..", "..", "api", "shared", "finLancamentos.js"));

const HOJE = "2026-12-02";
const MES = "2026-12-01";
const milhar = (n) => Number(n).toLocaleString("pt-BR");

// os membros do cadastro (a procura da Igreja inteira: só o nome, o número e a congregação)
const MEMBROS = [
  { membroId: 700087, nome: "Carlos Eduardo Souza", congregacao: "Vila Nova" },
  { membroId: 700276, nome: "Lídia Martins", congregacao: "Vila Nova" },
  { membroId: 700128, nome: "Maria Oliveira", congregacao: "Vila Nova" },
  { membroId: 700311, nome: "Ana Beatriz Moreira", congregacao: "Cidade Jardim" },
  { membroId: 700390, nome: "Débora Cristina Alves", congregacao: "Vila Nova" },
  { membroId: 700412, nome: "Marta Oliveira Lima", congregacao: "Bela Vista" },
  { membroId: 700455, nome: "Mário Sérgio Costa", congregacao: "Betel" }
];
const nomeDo = (id) => (MEMBROS.find((m) => m.membroId === id) || {}).nome || null;

// as congregações do seletor (a Área 2 do desenho e mais duas áreas), com a situação de agora
const CONGREGACOES = [
  { id: 2, nome: "Vila Nova", area: "Área 2", situacao: { texto: "1 folha do mês posterior sem o nome e o valor", tom: "pend" } },
  { id: 3, nome: "Cidade Jardim", area: "Área 2", situacao: { texto: "em dia", tom: "ok" } },
  { id: 4, nome: "Monte Sião", area: "Área 2", situacao: { texto: "1 folha sem destino", tom: "pend" } },
  { id: 5, nome: "Bela Vista", area: "Área 2", situacao: { texto: "em dia", tom: "ok" } },
  { id: 6, nome: "Jardim das Oliveiras", area: "Área 2", situacao: { texto: "em dia", tom: "ok" } },
  { id: 7, nome: "Nova Esperança", area: "Área 2", situacao: { texto: "em dia", tom: "ok" } },
  { id: 8, nome: "Betel", area: "Área 2", situacao: { texto: "em dia", tom: "ok" } },
  { id: 11, nome: "Central", area: "Área 1", situacao: { texto: "em dia", tom: "ok" } },
  { id: 12, nome: "Boas Novas", area: "Área 3", situacao: { texto: "em dia", tom: "ok" } }
];

// o bloco 1.403 de Vila Nova (70.151 a 70.200): novembro 70.151 a 70.160; a 70.161 e a 70.162 marcadas "mês posterior" em novembro; a 70.163
// e a 70.164 somaram em novembro; dezembro da 70.165; a 70.168 arrancada
const lanc = (folha, dia, referente, mesSoma, tipo, forma, valor, extra = {}) => ({
  folha, dia, referente, mesSoma, tipo, forma, valor, voluntaria: null, membroId: null, membro: null, nome: null, pelaGeral: false, corrigida: false, ...extra
});
function lancamentosIniciais() {
  const l = [];
  for (let f = 70151; f <= 70160; f++) l.push(lanc(f, "2026-11-20", "ESTE_MES", "2026-11-01", "DIZIMO", "PIX", 10000, { membroId: 700128, membro: "Maria Oliveira" }));
  l.push(lanc(70161, "2026-11-28", "MES_POSTERIOR", MES, null, null, null));
  l.push(lanc(70162, "2026-11-29", "MES_POSTERIOR", MES, "DIZIMO", "PIX", 28000, { membroId: 700276, membro: "Lídia Martins" }));
  l.push(lanc(70163, "2026-11-30", "ESTE_MES", "2026-11-01", "DIZIMO", "ESPECIE", 15000, { membroId: 700390, membro: "Débora Cristina Alves" }));
  l.push(lanc(70164, "2026-11-30", "ESTE_MES", "2026-11-01", "OFERTA_CULTO", "ESPECIE", 9000));
  l.push(lanc(70165, "2026-12-01", "ESTE_MES", MES, "DIZIMO", "PIX", 32000, { voluntaria: 3000, membroId: 700128, membro: "Maria Oliveira" }));
  l.push(lanc(70166, "2026-12-01", "ESTE_MES", MES, "OFERTA_CULTO", "ESPECIE", 48650));
  l.push(lanc(70167, "2026-12-01", "ESTE_MES", MES, "DIZIMO", "PIX", 41000, { membroId: 700311, membro: "Ana Beatriz Moreira" }));
  l.push(lanc(70169, "2026-12-02", "ESTE_MES", MES, "DIZIMO", "ESPECIE", 19400, { membroId: 700390, membro: "Débora Cristina Alves" }));
  l.push(lanc(70170, "2026-12-02", "ESTE_MES", MES, "OFERTA_VOLUNTARIA", "ESPECIE", 5000, { nome: "Paulo Henrique Dias" }));
  return l;
}
const EXCECOES = [{ folha: 70168, destino: "ARRANCADA", observacao: "rasgou ao preencher", dia: "2026-12-01" }];
const FAIXA = { saidaId: 31, blocoId: 1403, bloco: 1403, de: 70151, ate: 70200, aberta: true, blocoDe: 70151, blocoAte: 70200 };

/** a planilha como o servidor responde (finLancamentosDb.planilha), com a regra de verdade */
function planilha(estado, congregacao, podeLancar) {
  const p = regra.montarPlanilha({ faixas: [FAIXA], lancamentos: estado.lancamentos, excecoes: estado.excecoes, lancadasSemDados: [], mes: MES });
  const tira = regra.tiraDoBloco({
    bloco: { blocoId: 1403, numero: 1403, primeiraFolha: 70151, ultimaFolha: 70200 },
    lancamentos: estado.lancamentos, excecoes: estado.excecoes, lancadasSemDados: [], proxima: p.proxima, mes: MES
  });
  delete tira.blocoId;
  const limpa = ({ blocoId, saidaId, ...l }) => l;
  return {
    sucesso: true, congregacao: { id: congregacao.id, nome: congregacao.nome, area: congregacao.area }, mes: MES, hoje: HOJE, podeLancar,
    lancavel: podeLancar, mandouAnterior: false, diaPadrao: HOJE, comeca: p.comeca, proxima: p.proxima ? { folha: p.proxima.folha, bloco: p.proxima.bloco } : null,
    marcadasNoAnterior: p.marcadasNoAnterior, linhas: p.linhas.map(limpa), totais: regra.totaisDoMes(estado.lancamentos, MES), tira
  };
}

/** a área acompanha (finLancamentosDb.area) */
function area() {
  const c = (id, nome, ultimo, lancado, folhas, agora, precisa) => ({ id, nome, ultimoLancamento: ultimo, lancadoNoMes: lancado, folhasNoMes: folhas, agora, precisa });
  const lista = [
    c(2, "Vila Nova", "2026-11-20T14:15:00.000Z", 739050, 38, { bloco: 1401, folha: 70099 }, []),
    c(3, "Cidade Jardim", "2026-11-19T19:40:00.000Z", 812000, 41, { bloco: 1388, folha: 69446 }, []),
    c(4, "Monte Sião", "2026-11-18T13:00:00.000Z", 64000, 6, { bloco: 1395, folha: 69777 }, ["1 folha sem destino"]),
    c(5, "Bela Vista", "2026-11-19T14:30:00.000Z", 395000, 22, { bloco: 1403, folha: 70162 }, ["1 folha do mês posterior sem o nome e o valor"]),
    c(6, "Jardim das Oliveiras", "2026-11-18T21:00:00.000Z", 210000, 15, { bloco: 1377, folha: 68830 }, []),
    c(7, "Nova Esperança", "2026-11-20T11:40:00.000Z", 184000, 12, { bloco: 1380, folha: 68998 }, []),
    c(8, "Betel", "2026-11-14T13:20:00.000Z", 240000, 16, { bloco: 1410, folha: 71214 }, [])
  ];
  return { sucesso: true, mes: "2026-11-01", congregacoes: lista,
    resumo: { congregacoes: lista.length, lancaram: lista.filter((x) => x.folhasNoMes > 0).length, total: lista.reduce((s, x) => s + x.lancadoNoMes, 0), precisam: lista.filter((x) => x.precisa.length).length } };
}

/**
 * A API de financeiro/lancamentos para uma página: `nivel` (geral, area, local), `opcoes` ({ semPreencher }). Devolve { estado, responder }:
 * responder(metodo, URL, corpo) → { status?, corpo } ou null (não é desta rota).
 */
function apiLancamentos(nivel) {
  const estado = { lancamentos: lancamentosIniciais(), excecoes: EXCECOES.map((x) => ({ ...x })), correcoes: {}, salvos: [] };
  const lanca = nivel !== "area";
  const responder = (metodo, u, corpo) => {
    const p = u.pathname, q = u.searchParams;
    if (!p.startsWith("/api/financeiro/lancamentos")) return null;
    if (p === "/api/financeiro/lancamentos/congregacoes" && metodo === "GET") {
      const lista = nivel === "geral" ? CONGREGACOES : nivel === "area" ? CONGREGACOES.filter((c) => c.area === "Área 2") : CONGREGACOES.filter((c) => c.id === 2);
      return { corpo: { sucesso: true, congregacoes: lista } };
    }
    if (p === "/api/financeiro/lancamentos/membros" && metodo === "GET") {
      const t = (q.get("procura") || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
      const digitos = t.replace(/\./g, "");
      if (!/^\d+$/.test(digitos) && t.length < 2) return { corpo: { sucesso: true, membros: [] } };
      const sem = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      // a mesma ordem do servidor (procurarMembros): primeiro quem começa pelo que se digitou, depois o resto, cada parte pelo nome
      const comeca = (m) => (sem(m.nome).startsWith(t) ? 0 : 1);
      const achados = MEMBROS.filter((m) => (/^\d+$/.test(digitos) ? String(m.membroId).startsWith(digitos) : sem(m.nome).includes(t)))
        .sort((a, b) => comeca(a) - comeca(b) || a.nome.localeCompare(b.nome, "pt-BR"))
        .slice(0, 8);
      return { corpo: { sucesso: true, membros: achados } };
    }
    if (p === "/api/financeiro/lancamentos/area" && metodo === "GET") return { corpo: area() };
    if (p === "/api/financeiro/lancamentos" && metodo === "GET") {
      const id = q.get("congregacaoId") ? Number(q.get("congregacaoId")) : nivel === "local" ? 2 : null;
      if (id === null) return { corpo: { sucesso: true, congregacao: null, mes: MES, podeLancar: lanca } };
      const c = CONGREGACOES.find((x) => x.id === id);
      if (!c || (nivel === "local" && id !== 2) || (nivel === "area" && c.area !== "Área 2")) return { status: 404, corpo: { sucesso: false, mensagem: "Congregação não encontrada." } };
      return { corpo: planilha(estado, c, lanca) };
    }
    if (p === "/api/financeiro/lancamentos/historico" && metodo === "GET") {
      const f = Number(q.get("folha"));
      const l = estado.lancamentos.find((x) => x.folha === f);
      if (!l) return { status: 404, corpo: { sucesso: false, mensagem: "Registro não encontrado." } };
      return { corpo: { sucesso: true, folha: f, lancamento: { dia: l.dia, referente: l.referente, mesSoma: l.mesSoma, pelaGeral: l.pelaGeral,
        registradoPor: "Rute Santos", registradoEm: `${l.dia}T12:40:00.000Z`, preenchidoPor: null, preenchidoEm: null }, correcoes: estado.correcoes[f] || [] } };
    }
    if (p === "/api/financeiro/lancamentos/salvar" && metodo === "POST") {
      if (!lanca) return { status: 403, corpo: { sucesso: false, mensagem: "Quem lança é a congregação ou a Tesouraria Geral por ela; a área acompanha." } };
      estado.salvos.push(corpo);
      const d = regra.diaDoLancamento(corpo.dia, HOJE, false);
      if (!d.ok) return { status: 422, corpo: { sucesso: false, mensagem: d.mensagem } };
      const linhas = [...corpo.linhas].sort((a, b) => a.folha - b.folha);
      const novos = [], marcas = [];
      for (const l of linhas) {
        const existente = estado.lancamentos.find((x) => x.folha === l.folha);
        if (estado.excecoes.some((x) => x.folha === l.folha)) return { status: 409, corpo: { sucesso: false, mensagem: `A folha ${milhar(l.folha)} está marcada como arrancada.`, folha: l.folha } };
        if (existente && existente.valor !== null) return { status: 409, corpo: { sucesso: false, mensagem: `A folha ${milhar(l.folha)} já foi lançada: para mudar, use Corrigir.`, folha: l.folha } };
        if (l.excecao !== undefined) {
          const v = regra.excecaoNaPlanilha(l);
          if (!v.ok) return { status: 422, corpo: { sucesso: false, mensagem: v.mensagem, folha: l.folha } };
          marcas.push({ folha: l.folha, destino: v.excecao.destino, observacao: v.excecao.observacao, dia: HOJE });
          continue;
        }
        const v = regra.validarLinha(l, { preencher: !!existente });
        if (!v.ok) return { status: 422, corpo: { sucesso: false, mensagem: v.mensagem, folha: l.folha } };
        novos.push({ ...v.linha, existente });
      }
      for (const n of novos) {
        const membro = n.membroId ? nomeDo(n.membroId) : null;
        if (n.existente) Object.assign(n.existente, { tipo: n.tipo, forma: n.forma, valor: n.valor, voluntaria: n.voluntaria, membroId: n.membroId, membro, nome: n.nome });
        else estado.lancamentos.push(lanc(n.folha, d.dia, n.referente, regra.mesSoma(d.dia, n.referente), n.tipo, n.forma, n.valor,
          { voluntaria: n.voluntaria, membroId: n.membroId, membro, nome: n.nome, pelaGeral: nivel === "geral" }));
      }
      estado.excecoes.push(...marcas);
      const todas = [...novos.map((n) => n.folha), ...marcas.map((m) => m.folha)].sort((a, b) => a - b);
      const mensagem = todas.length > 1 ? `${todas.length} folhas salvas (${milhar(todas[0])} a ${milhar(todas[todas.length - 1])}).`
        : marcas.length ? `Folha ${milhar(todas[0])} marcada como ${marcas[0].destino.toLowerCase()}.` : `Folha ${milhar(todas[0])} salva.`;
      return { corpo: { sucesso: true, mensagem, folhas: todas } };
    }
    if (p === "/api/financeiro/lancamentos/corrigir" && metodo === "POST") {
      if (!lanca) return { status: 403, corpo: { sucesso: false, mensagem: "Quem lança é a congregação ou a Tesouraria Geral por ela; a área acompanha." } };
      const l = estado.lancamentos.find((x) => x.folha === corpo.folha);
      if (!l) return { status: 404, corpo: { sucesso: false, mensagem: "Registro não encontrado." } };
      const v = regra.validarCorrecao(corpo);
      if (!v.ok) return { status: 422, corpo: { sucesso: false, mensagem: v.mensagem } };
      if (!regra.mudancas(l, v.campos).length) return { status: 422, corpo: { sucesso: false, mensagem: "Nada mudou: confira os campos." } };
      const lado = (x, quem) => ({ tipo: x.tipo, forma: x.forma, valor: x.valor, voluntaria: x.voluntaria, membroId: x.membroId, quem });
      const antes = lado(l, l.membro || l.nome);
      Object.assign(l, v.campos, { membro: v.campos.membroId ? nomeDo(v.campos.membroId) : null, corrigida: true });
      (estado.correcoes[l.folha] = estado.correcoes[l.folha] || []).push({ antes, depois: lado(l, l.membro || l.nome), motivo: v.motivo, por: "Rute Santos", em: "2026-12-02T13:05:00.000Z" });
      return { corpo: { sucesso: true, mensagem: `Folha ${milhar(l.folha)} corrigida.` } };
    }
    return { status: 404, corpo: { sucesso: false, mensagem: "Ação inválida." } };
  };
  return { estado, responder };
}

module.exports = { apiLancamentos, MEMBROS, HOJE };
