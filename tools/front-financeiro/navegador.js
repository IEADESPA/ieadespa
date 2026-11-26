// navegador.js — a prova das telas do Financeiro novo (Svelte) no Edge sem tela, com a CSP final: a casca de app/ e o build de app/svelte de
// verdade; /api/financeiro/blocos/* responde com dados de mentira nos formatos reais (api/shared/finBlocosDb.js) e grava cada pedido; o resto da
// casca usa a API simulada do equipamento da CSP (tools/csp-e2e: servidor.js, instrumento.js, modelo-respostas.json).
// Incremento 2 (23/11/2026): as abas "Folhas do bloco" e "Livro de entrada e saída" (r17-blocos-folhas e r17-blocos-livro, opção 1).
// Incremento 3 (26/11/2026): "Lançar dízimos e ofertas" (prova-lancamentos.js; a API simulada em dados-lancamentos.js, com a regra do servidor).
//
// Rodar (pelo PowerShell; pelo Bash o Edge sem tela não abre neste notebook):
//   node tools/front-financeiro/navegador.js            (PUPPETEER_CORE = a pasta do puppeteer-core; sem ela, tools/csp-e2e/node_modules)
//   LISTA=1 mostra cada caso aprovado; SO=folhas, SO=desfazer, SO=livro, SO=saida, SO=rastreio, SO=vazios, SO=aviso ou SO=lancamentos roda só uma parte.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const EQUIP = path.join(__dirname, "..", "csp-e2e");
const puppeteer = require(process.env.PUPPETEER_CORE || path.join(EQUIP, "node_modules", "puppeteer-core"));
const { criarServidor } = require(path.join(EQUIP, "servidor.js"));
const { instrumento } = require(path.join(EQUIP, "instrumento.js"));
const modelo = require(path.join(EQUIP, "modelo-respostas.json"));
const { apiLancamentos } = require("./dados-lancamentos.js");
const provarLancamentos = require("./prova-lancamentos.js");
const RAIZ = path.join(__dirname, "..", "..", "app");
const EDGE = process.env.EDGE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const SO = process.env.SO || "";

let total = 0, falhas = 0;
const ok = (c, d, det) => {
  total++;
  if (!c) { falhas++; console.log(`  ✗ ${d}${det !== undefined ? ` — ${JSON.stringify(det).slice(0, 400)}` : ""}`); }
  else if (process.env.LISTA) console.log(`  ✓ ${d}`);
};

// ---- os dados de mentira (os do desenho aprovado; o número do bloco sai da 1ª folha) ----
const ATAQUE = '<img src=x onerror="__xss(1)">';
const ESCOPO = {
  geral: { geral: true, congregacoes: 45, area: null, congregacao: null },
  area: { geral: false, congregacoes: 12, area: "Área 2", congregacao: null },
  local: { geral: false, congregacoes: 1, area: "Área 2", congregacao: "Vila Nova" }
};
const blocoMentira = (id, primeira, cong, situacao, usadas, extra = {}) => ({
  id, numero: Math.floor((primeira - 1) / 50), primeiraFolha: primeira, ultimaFolha: primeira + 49, congregacao: cong ? { id: id + 100, nome: cong } : null,
  situacao, entregueEm: cong ? "2026-11-01" : null, devolvidoEm: null, usadas, livres: 50 - usadas, parcial: false,
  faixa: { primeiraFolha: primeira, ultimaFolha: primeira + 49 }, volta: null, ...extra
});
// bloco 1.401 (70.051 a 70.100): 38 com destino (a 17ª cancelada, a 29ª arrancada, a 36ª extraviada), 12 livres
function folhasDoBloco1401(registradas, desfeitas = []) {
  const f = [];
  for (let i = 1; i <= 38; i++) {
    const destino = i === 17 ? "cancelada" : i === 29 ? "arrancada" : i === 36 ? "extraviada" : "lancada";
    const obs = { cancelada: `Erro no valor ${ATAQUE}`, arrancada: "Rasgou", extraviada: "Não achei a folha no bloco." };
    if (!desfeitas.includes(70050 + i)) f.push({ folha: 70050 + i, destino, observacao: obs[destino] || null });
  }
  for (const r of registradas) f.push(r);
  return f.sort((a, b) => a.folha - b.folha);
}
// o histórico (r30-blocos-desfazer): a 36ª marcada por Vila Nova (e desfeita, se for o caso); a 10ª, lançada depois de uma exceção desfeita
const MARCOU_36 = { tipo: "marcou", quando: "2026-11-12T09:40", nome: "Rute Santos", papel: "tesoureira de Vila Nova", destino: "extraviada", texto: "Não achei a folha no bloco." };
const DESFEZ_36 = { tipo: "desfez", quando: "2026-11-25T11:20", nome: "João da Silva", papel: "Tesouraria Geral", destino: null, texto: "A folha apareceu, estava com os recibos de outubro" };
function historico(folha, desfeitas) {
  if (folha === 70086) return { sucesso: true, folha, bloco: 1401, posicao: 36, itens: desfeitas.includes(70086) ? [MARCOU_36, DESFEZ_36] : [MARCOU_36] };
  if (folha === 70067) return { sucesso: true, folha, bloco: 1401, posicao: 17, itens: [{ ...MARCOU_36, destino: "cancelada", texto: `Erro no valor ${ATAQUE}` }] };
  if (folha === 70060) {
    return { sucesso: true, folha, bloco: 1401, posicao: 10, itens: [{ ...MARCOU_36, destino: "cancelada", texto: "Achei que estava errada" }, { ...DESFEZ_36, texto: `Estava certa ${ATAQUE}` }] };
  }
  // a marca de antes do papel gravado na hora (portão da parte 2, I2): sem papel, o histórico mostra só o nome
  if (folha === 62564) return { sucesso: true, folha, bloco: 1251, posicao: 14, itens: [{ ...MARCOU_36, papel: null, quando: "2026-06-02T15:05", destino: "arrancada", texto: "Tirada do bloco" }] };
  return null;
}
const opcao = (id, numero, congregacao, situacao, extra = {}) => {
  const primeira = numero * 50 + 1;
  return { id, numero, congregacao, situacao, entregueEm: "2026-10-20", devolvidoEm: null, parcial: false, faixa: { primeiraFolha: primeira, ultimaFolha: primeira + 49 }, usadas: 0, ...extra };
};
// o seletor da r30: o em uso, o esperando, o que voltou parcial (na Geral; em Vila Nova, devolvido só com as 35 que ela usou) e o devolvido completo
const OPCOES = [
  opcao(1, 1401, "Vila Nova", "em-uso", { usadas: 38 }), opcao(2, 1402, `Vila Nova ${ATAQUE}`, "esperando", { entregueEm: "2026-11-25" }),
  opcao(5, 1360, "Bela Vista", "fechado", { devolvidoEm: "2026-11-10", usadas: 49 }),
  opcao(8, 1288, null, "na-geral", { parcial: true, faixa: { primeiraFolha: 64436, ultimaFolha: 64450 }, entregueEm: null })
];
const OPCOES_LOCAL = [
  opcao(1, 1401, "Vila Nova", "em-uso", { usadas: 38 }), opcao(2, 1402, "Vila Nova", "esperando", { entregueEm: "2026-11-25" }),
  opcao(8, 1288, "Vila Nova", "fechado", { parcial: true, devolvidoEm: "2026-11-03", entregueEm: "2026-09-08", faixa: { primeiraFolha: 64401, ultimaFolha: 64435 }, usadas: 35 }),
  opcao(9, 1251, "Vila Nova", "fechado", { devolvidoEm: "2026-07-21", entregueEm: "2026-05-12", usadas: 50 })
];
const LIVRO = [
  { id: 5, tipo: "saida", data: "2026-11-17", registradoPor: "João da Silva", bloco: 1402, congregacao: "Vila Nova", pessoa: "Rute Santos", levadoPelaArea: false, contagem: null },
  { id: 4, tipo: "entrada", data: "2026-11-10", registradoPor: "João da Silva", bloco: 1360, congregacao: "Bela Vista", pessoa: "Lia Fontes", levadoPelaArea: false,
    contagem: { lancadas: 49, canceladas: 1, arrancadas: 0, extraviadas: 0, livres: 0 } },
  { id: 3, tipo: "saida", data: "2026-11-03", registradoPor: "João da Silva", bloco: 1395, congregacao: "Monte Sião", pessoa: `Ezequiel Ramos`, levadoPelaArea: true, contagem: null },
  { id: 2, tipo: "cadastro", data: "2026-10-28", registradoPor: "João da Silva", quantidade: 200, lote: { serie: 2026, primeiraFolha: 70001, ultimaFolha: 80000, blocos: 200 } },
  { id: 1, tipo: "entrada", data: "2026-10-21", registradoPor: "João da Silva", bloco: 1352, congregacao: "Sede", pessoa: `Ana Prado ${ATAQUE}`, levadoPelaArea: false,
    contagem: { lancadas: 50, canceladas: 0, arrancadas: 0, extraviadas: 0, livres: 0 } },
  { id: 0, tipo: "chegada", data: "2026-10-20", registradoPor: "João da Silva", quantidade: 100, lote: { serie: 2026, primeiraFolha: 70001, ultimaFolha: 80000, blocos: 200 } },
  { id: -1, tipo: "entrada", data: "2026-10-15", registradoPor: "João da Silva", bloco: 1288, congregacao: "Vila Nova", pessoa: "Rute Santos", levadoPelaArea: false,
    contagem: { lancadas: 34, canceladas: 1, arrancadas: 0, extraviadas: 0, livres: 15 }, parcial: true, usadas: 35, pendentes: 0, faixaLivre: { primeiraFolha: 64436, ultimaFolha: 64450 } }
];
const AGORA = { area: { emUso: 9, esperando: 2, aDevolver: 1 }, local: { emUso: 1, esperando: 1, aDevolver: 0 } };
// a saída (r30-blocos-saida): as congregações ativas com a área e a liderança de cada uma
const PARA_SAIDA = [{ id: 2, nome: "Vila Nova", area: "Área 2" }, { id: 4, nome: "Monte Sião", area: "Área 2" }, { id: 6, nome: "Cidade Jardim", area: "Área 3" },
  { id: 8, nome: `Nova Vida ${ATAQUE}`, area: null }];
const LIDERES = { 2: [{ membroId: 101, nome: "Rute Santos", papel: "Tesoureira" }, { membroId: 102, nome: "Paulo Reis", papel: "Dirigente" }],
  4: [{ membroId: 401, nome: "Ezequiel Ramos", papel: "Dirigente" }], 6: [{ membroId: 601, nome: "Davi Moura", papel: "Tesoureiro" }], 8: [] };
// o instrumento do teste fixa o relógio da página em 04/10/2026 15h (UTC): o "hoje" da tela
const hojeBrasilia = () => "2026-10-04";
const PESSOAS_1360 = [{ membroId: null, nome: "Ezequiel Ramos", papel: "quem levou o bloco" }, { membroId: 301, nome: "Lia Fontes", papel: "Tesoureira" }];
function rastreio(folha) {
  if (folha >= 68001 && folha <= 68050) {
    return { sucesso: true, bloco: blocoMentira(5, 68001, "Bela Vista", "em-uso", 50, { entregueEm: "2026-09-08" }),
      contagem: { lancadas: 49, canceladas: 1, arrancadas: 0, extraviadas: 0, livres: 0 }, pessoas: PESSOAS_1360 };
  }
  if (folha >= 70101 && folha <= 70150) {   // ainda na Tesouraria Geral, sem congregação nem entrega; ainda não chegou da gráfica
    return { sucesso: true, bloco: blocoMentira(9, 70101, null, "na-geral", 0, { chegouEm: null }), contagem: { lancadas: 0, canceladas: 0, arrancadas: 0, extraviadas: 0, livres: 50 }, pessoas: [] };
  }
  if (folha >= 70151 && folha <= 70200) {   // o 1.403: chegou da gráfica em 05/02/2026 e está na Tesouraria Geral, pronto para sair
    return { sucesso: true, bloco: blocoMentira(10, 70151, null, "na-geral", 0, { chegouEm: "2026-02-05" }), contagem: { lancadas: 0, canceladas: 0, arrancadas: 0, extraviadas: 0, livres: 50 },
      primeiraEmBranco: null, pessoas: [], volta: null };
  }
  if (folha >= 64401 && folha <= 64450) {   // o 1.288: voltou parcial de Vila Nova em 03/11, as 35 usadas; as 15 livres (64.436 a 64.450) na Geral
    return { sucesso: true, bloco: blocoMentira(8, 64401, null, "na-geral", 35, { chegouEm: "2026-02-05", entregueEm: null, parcial: true, livres: 15, faixa: { primeiraFolha: 64436, ultimaFolha: 64450 } }),
      contagem: { lancadas: 0, canceladas: 0, arrancadas: 0, extraviadas: 0, livres: 15 }, primeiraEmBranco: null, pessoas: [], volta: { congregacao: "Vila Nova", data: "2026-10-01", usadas: 35 } };
  }
  if (folha >= 66001 && folha <= 66050) {   // o 1.320 com Vila Nova desde 08/09: 35 com destino (a 22ª cancelada) e as 15 últimas em branco
    return { sucesso: true, bloco: blocoMentira(11, 66001, "Vila Nova", "em-uso", 35, { entregueEm: "2026-09-08" }),
      contagem: { lancadas: 34, canceladas: 1, arrancadas: 0, extraviadas: 0, inexistentes: 0, livres: 15 }, primeiraEmBranco: 66036,
      pessoas: [{ membroId: 101, nome: "Rute Santos", papel: "Tesoureira" }], volta: null };
  }
  if (folha >= 66501 && folha <= 66550) {   // o 1.330: 30 lançadas, a 40ª e a 50ª inexistentes (a gráfica não imprimiu), 18 em branco
    return { sucesso: true, bloco: blocoMentira(12, 66501, "Vila Nova", "em-uso", 32, { entregueEm: "2026-09-08" }),
      contagem: { lancadas: 30, canceladas: 0, arrancadas: 0, extraviadas: 0, inexistentes: 2, livres: 18 }, primeiraEmBranco: 66531, inexistentes: [66540, 66550],
      pessoas: [{ membroId: 101, nome: "Rute Santos", papel: "Tesoureira" }], volta: null };
  }
  if (folha >= 66551 && folha <= 66600) {   // o 1.331: 35 lançadas, só a 50ª inexistente, 14 em branco (36ª a 49ª)
    return { sucesso: true, bloco: blocoMentira(13, 66551, "Vila Nova", "em-uso", 36, { entregueEm: "2026-09-08" }),
      contagem: { lancadas: 35, canceladas: 0, arrancadas: 0, extraviadas: 0, inexistentes: 1, livres: 14 }, primeiraEmBranco: 66586, inexistentes: [66600],
      pessoas: [{ membroId: 101, nome: "Rute Santos", papel: "Tesoureira" }], volta: null };
  }
  if (folha >= 67001 && folha <= 67050) {   // já devolvido
    return { sucesso: true, bloco: blocoMentira(7, 67001, "Monte Sião", "fechado", 50, { devolvidoEm: "2026-10-02" }),
      contagem: { lancadas: 50, canceladas: 0, arrancadas: 0, extraviadas: 0, livres: 0 }, pessoas: [] };
  }
  return { status: 422, corpo: { sucesso: false, mensagem: `Nenhum bloco tem a folha ${folha.toLocaleString("pt-BR")}.` } };
}

const PERFIS = {
  geral: { authToken: "tok-geral-simulado", authNome: "João da Silva", authPermissoes: JSON.stringify(modelo.permissoes), authMatricula: "700002", authNivel: "GLOBAL", authGeral: "1" },
  area: { authToken: "tok-local-simulado", authNome: "Marcos Paiva", authPermissoes: JSON.stringify(["financeiro"]), authMatricula: "700102", authNivel: "AREA", authGeral: "0", authPermissoesGerais: "[]" },
  local: { authToken: "tok-local-simulado", authNome: "Rute Santos", authPermissoes: JSON.stringify(["financeiro"]), authMatricula: "700101", authNivel: "CONGREGACAO", authGeral: "0", authPermissoesGerais: "[]" }
};

// a API simulada do Financeiro: cada página tem o seu estado (as folhas registradas) e a lista dos pedidos
function apiFinanceiro(nivel, opcoes) {
  const lancamentos = apiLancamentos(nivel);
  const estado = { registradas: [], desfeitas: [], pedidos: [], saidas: [], saiu: [], lancamentos: lancamentos.estado };
  const responder = (metodo, u, corpo) => {
    const p = u.pathname, q = u.searchParams;
    estado.pedidos.push({ metodo, caminho: p, busca: Object.fromEntries(q.entries()), corpo });
    const rl = lancamentos.responder(metodo, u, corpo);
    if (rl) return rl;
    if (p === "/api/financeiro/blocos" && metodo === "GET") {
      if (opcoes.listaFalha) return { status: 500, corpo: { sucesso: false, mensagem: "Falha simulada." } };
      // os vazios da r30: antes do primeiro lote, ou a procura que nada acha (99.999)
      // a pílula "Fechado" com a procura de um bloco em uso: nada vem, mas o bloco existe
      if (opcoes.vazio || (q.get("procura") || "").replace(/\./g, "") === "99999" || (q.get("situacao") === "fechado" && q.get("procura"))) {
        return { corpo: { sucesso: true, blocos: [], total: 0, pagina: 1, porPagina: 40,
          resumo: nivel === "local" ? { tipo: "seus", emUsoOuEsperando: 0, folhasLivres: 0 } : { tipo: "lote", lote: null }, escopo: opcoes.escopo || ESCOPO[nivel] } };
      }
      return { corpo: { sucesso: true, blocos: [blocoMentira(1, 70051, "Vila Nova", "em-uso", 38)], total: 1, pagina: 1, porPagina: 40,
        resumo: nivel === "local" ? { tipo: "seus", emUsoOuEsperando: 2, folhasLivres: 12 } : { tipo: "lote", lote: null }, escopo: ESCOPO[nivel] } };
    }
    if (p === "/api/financeiro/blocos/folhas" && metodo === "GET") {
      if (opcoes.vazio) return { corpo: { sucesso: true, bloco: null, folhas: [], comHistorico: [], opcoes: [], escopo: opcoes.escopo || ESCOPO[nivel] } };
      if (q.get("bloco") === "5") {
        const f = [];
        for (let i = 1; i <= 50; i++) f.push({ folha: 68000 + i, destino: i === 3 ? "cancelada" : i === 49 ? "extraviada" : i === 50 ? "inexistente" : "lancada", observacao: i === 3 || i > 48 ? "Perdida" : null });
        f.splice(45, 1);   // a 46ª ficou livre e o bloco voltou assim
        return { corpo: { sucesso: true, bloco: blocoMentira(5, 68001, "Bela Vista", "fechado", 49, { devolvidoEm: "2026-11-10" }), folhas: f, opcoes: OPCOES, escopo: ESCOPO[nivel] } };
      }
      if (q.get("bloco") === "8" && nivel === "geral") {   // o 1.288 voltou parcial de Vila Nova em 03/11: as 35 usadas e as 15 livres na Geral
        const f = [];
        for (let i = 1; i <= 35; i++) f.push({ folha: 64400 + i, destino: i === 22 ? "cancelada" : "lancada", observacao: i === 22 ? "Errou o valor" : null });
        return { corpo: { sucesso: true, bloco: blocoMentira(8, 64401, null, "na-geral", 0, { entregueEm: null, parcial: true, livres: 15, faixa: { primeiraFolha: 64436, ultimaFolha: 64450 },
          volta: { congregacao: "Vila Nova", data: "2026-11-03", usadas: 35 } }), folhas: f, opcoes: OPCOES, escopo: ESCOPO[nivel] } };
      }
      if (q.get("bloco") === "9" && nivel === "local") {   // o 1.251 voltou completo em 21/07: 49 lançadas e a 14ª arrancada
        const f = [];
        for (let i = 1; i <= 50; i++) f.push({ folha: 62550 + i, destino: i === 14 ? "arrancada" : "lancada", observacao: i === 14 ? "Tirada do bloco" : null });
        return { corpo: { sucesso: true, bloco: blocoMentira(9, 62551, "Vila Nova", "fechado", 50, { devolvidoEm: "2026-07-21" }), folhas: f, comHistorico: [62564], opcoes: OPCOES_LOCAL, escopo: ESCOPO[nivel] } };
      }
      if (q.get("bloco") && !["1", "2"].includes(q.get("bloco"))) return { status: 404, corpo: { sucesso: false, mensagem: "Registro não encontrado." } };
      const reg = estado.registradas, desf = estado.desfeitas;
      return { corpo: { sucesso: true, bloco: blocoMentira(1, 70051, "Vila Nova", "em-uso", 38 + reg.length - desf.length), folhas: folhasDoBloco1401(reg, desf),
        comHistorico: [70060, 70067, 70079, 70086], opcoes: nivel === "local" ? OPCOES_LOCAL : OPCOES, escopo: ESCOPO[nivel] } };
    }
    if (p === "/api/financeiro/blocos/folha" && metodo === "POST") {
      if (corpo && corpo.folha === 70089) return { status: 409, corpo: { sucesso: false, mensagem: "A folha 70.089 já tem destino (cancelada)." } };
      estado.registradas.push({ folha: corpo.folha, destino: corpo.oQueAconteceu, observacao: corpo.observacao });
      return { corpo: { sucesso: true, mensagem: `Folha ${Number(corpo.folha).toLocaleString("pt-BR")} registrada como ${corpo.oQueAconteceu}.` } };
    }
    if (p === "/api/financeiro/blocos/historico" && metodo === "GET") {
      const h = historico(Number(q.get("folha")), estado.desfeitas);
      return h ? { corpo: h } : { status: 404, corpo: { sucesso: false, mensagem: "Registro não encontrado." } };
    }
    if (p === "/api/financeiro/blocos/desfazer-folha" && metodo === "POST") {
      if (nivel !== "geral") return { status: 403, corpo: { sucesso: false, mensagem: "Esta função é da administração geral da igreja." } };
      estado.desfeitas.push(corpo.folha);
      return { corpo: { sucesso: true, mensagem: `A folha ${Number(corpo.folha).toLocaleString("pt-BR")} voltou a ficar livre. O histórico guarda quem marcou, quem desfez e por quê.` } };
    }
    if (p === "/api/financeiro/blocos/livro" && metodo === "GET") {
      const porPagina = Number(q.get("porPagina")) === 3 ? 3 : 5, pagina = Number(q.get("pagina")) || 1;
      if (opcoes.vazio) {
        return { corpo: { sucesso: true, registros: [], total: 0, pagina: 1, porPagina, agora: nivel === "geral" ? null : { emUso: 0, esperando: 0, aDevolver: 0 }, escopo: opcoes.escopo || ESCOPO[nivel] } };
      }
      const lista = nivel === "geral" ? [...estado.saidas, ...LIVRO] : LIVRO.filter((r) => r.tipo === "saida" || r.tipo === "entrada");
      if (opcoes.livroCurto) {
        // 14 registros em páginas de verdade; a página além do fim volta sem registro, com o total certo (como o servidor: revisão de fora, E2)
        const curto = Array.from({ length: 14 }, (_, i) => ({ ...lista[i % lista.length], id: 900 + i }));
        return { corpo: { sucesso: true, registros: curto.slice((pagina - 1) * porPagina, pagina * porPagina), total: curto.length, pagina, porPagina,
          agora: nivel === "geral" ? null : AGORA[nivel], escopo: ESCOPO[nivel] } };
      }
      return { corpo: { sucesso: true, registros: lista.slice(0, porPagina), total: nivel === "geral" ? 412 : 37, pagina, porPagina,
        agora: nivel === "geral" ? null : AGORA[nivel], escopo: ESCOPO[nivel] } };
    }
    if (p === "/api/financeiro/blocos/rastreio" && metodo === "GET") {
      const r = rastreio(Number(q.get("folha")));
      return r.status ? r : { corpo: r };
    }
    if (p === "/api/financeiro/blocos/devolver" && metodo === "POST") {
      // uma recusa do servidor (a tela só mostra a mensagem); a regra dele de 24/11/2026 com a r30 não recusa mais a devolução por folha livre
      if (corpo && corpo.pessoa && corpo.pessoa.nome === "Marta Lima") {
        return { status: 422, corpo: { sucesso: false, mensagem: "O bloco 1.360 já foi devolvido em 03/11/2026." } };
      }
      if (corpo && corpo.parcial) {
        const de = Number(corpo.primeiraEmBranco).toLocaleString("pt-BR");
        estado.saidas.unshift({ id: 200 + estado.saidas.length, tipo: "entrada", data: "2026-10-04", registradoPor: "João da Silva", bloco: 1320, congregacao: "Vila Nova", pessoa: "Rute Santos",
          levadoPelaArea: false, contagem: { lancadas: 34, canceladas: 1, arrancadas: 0, extraviadas: 0, livres: 66050 - corpo.primeiraEmBranco + 1 }, parcial: true,
          usadas: corpo.primeiraEmBranco - 66001, pendentes: 0, faixaLivre: { primeiraFolha: corpo.primeiraEmBranco, ultimaFolha: 66050 } });
        return { corpo: { sucesso: true, mensagem: `Bloco 1.320 de volta, parcial: as folhas ${de} a 66.050 estão livres para outra entrega.` } };
      }
      return { corpo: { sucesso: true, mensagem: "Bloco 1.360 devolvido: está de novo com a Tesouraria Geral." } };
    }
    if (p === "/api/financeiro/blocos/para-saida" && metodo === "GET") {
      if (nivel !== "geral") return { status: 403, corpo: { sucesso: false, mensagem: "Esta função é da administração geral da igreja." } };
      const c = q.get("congregacaoId");
      if (!c) return { corpo: { sucesso: true, congregacoes: PARA_SAIDA } };
      const cong = PARA_SAIDA.find((x) => String(x.id) === c);
      return cong ? { corpo: { sucesso: true, congregacao: cong, pessoas: LIDERES[cong.id] } } : { status: 404, corpo: { sucesso: false, mensagem: "Registro não encontrado." } };
    }
    if (p === "/api/financeiro/blocos/entregar" && metodo === "POST") {
      // o mesmo bloco duas vezes: a corrida de duas pessoas (409)
      if (estado.saiu.includes(corpo.primeiraFolha)) return { status: 409, corpo: { sucesso: false, mensagem: "Este bloco acabou de sair por outra pessoa. Confira o livro." } };
      estado.saiu.push(corpo.primeiraFolha);
      const cong = PARA_SAIDA.find((x) => x.id === corpo.congregacaoId);
      const pessoa = corpo.pessoa.nome || (LIDERES[corpo.congregacaoId] || []).find((x) => x.membroId === corpo.pessoa.membroId).nome;
      const parcial = corpo.primeiraFolha === 64436;
      estado.saidas.unshift({ id: 100 + estado.saidas.length, tipo: "saida", data: corpo.data, registradoPor: "João da Silva", bloco: parcial ? 1288 : 1403, congregacao: cong.nome, pessoa,
        levadoPelaArea: corpo.levadoPelaArea, contagem: null, folhas: parcial ? { primeiraFolha: 64436, ultimaFolha: 64450 } : { primeiraFolha: 70151, ultimaFolha: 70200 },
        blocoPrimeiraFolha: parcial ? 64401 : 70151 });
      return { corpo: { sucesso: true, mensagem: parcial ? `Bloco 1.288 (64.436 a 64.450) entregue a ${cong.nome}. Está no livro.` : `Bloco 1.403 entregue a ${cong.nome}. Está no livro.` } };
    }
    return { status: 404, corpo: { sucesso: false, mensagem: "Ação inválida." } };
  };
  return { estado, responder };
}

let nav, srv;
async function abrir(nivel, disp, opcoes = {}) {
  const [largura, altura] = disp === "notebook" ? [1280, 800] : [390, 796];
  const ctx = await nav.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: largura, height: altura, isMobile: largura < 700, hasTouch: largura < 700 });
  const erros = [];
  page.on("pageerror", (e) => erros.push(String(e.message)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text())) erros.push(m.text()); });
  const api = apiFinanceiro(nivel, opcoes);
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const u = new URL(req.url());
    if (!u.pathname.startsWith("/api/financeiro/")) { req.continue(); return; }
    let corpo = null;
    try { corpo = req.postData() ? JSON.parse(req.postData()) : null; } catch (_) { corpo = req.postData(); }
    const r = api.responder(req.method(), u, corpo);
    req.respond({ status: r.status || 200, contentType: "application/json; charset=utf-8", headers: { "Cache-Control": "no-store" }, body: JSON.stringify(r.corpo) });
  });
  await page.evaluateOnNewDocument(instrumento, { modelo });
  await page.evaluateOnNewDocument((s) => {
    window.__xssChamado = 0;
    window.__xss = () => { window.__xssChamado++; };
    try { localStorage.setItem("ieadespaTema", "claro"); localStorage.setItem("primeiroAcessoVisto", "1"); } catch (e) { }
    if (s && !sessionStorage.getItem("__p")) { for (const k in s) sessionStorage.setItem(k, s[k]); sessionStorage.setItem("__p", "1"); }
  }, PERFIS[nivel]);
  await page.goto(srv.url + "/index.html", { waitUntil: "load" });
  await calmo(page);
  await page.evaluate(() => entrarModulo("financeiro"));
  await calmo(page);
  return { page, ctx, api, erros };
}
const calmo = (page) => page.evaluate(() => window.__reg.esperarCalmo(6000, 80)).catch(() => null);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const pedidos = (api, caminho, metodo = "GET") => api.estado.pedidos.filter((p) => p.caminho === caminho && p.metodo === metodo);
async function esperarPedido(api, caminho, metodo, antes, ms = 3000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { if (pedidos(api, caminho, metodo).length > antes) return pedidos(api, caminho, metodo).slice(-1)[0]; await espera(50); }
  return null;
}
// o texto visível da área do conteúdo (sem o menu da esquerda)
const textoTela = (page) => page.evaluate(() => (document.querySelector("#financeiroRaiz") || document.body).innerText.replace(/\s+/g, " "));
// clica no 1º botão VISÍVEL do conteúdo cujo texto (sem espaços sobrando) é exatamente `texto`
async function clicar(page, texto, seletor = "button") {
  const feito = await page.evaluate((texto, seletor) => {
    const raiz = document.querySelector("#financeiroRaiz") || document.body;
    const el = [...raiz.querySelectorAll(seletor)].find((b) => b.textContent.replace(/\s+/g, " ").trim() === texto && b.offsetParent !== null);
    if (!el) return false;
    el.click();
    return true;
  }, texto, seletor);
  await calmo(page);
  return feito;
}
// o botão de uma folha (o rótulo acessível começa com "Folha 70.090,")
const folha = (page, n) => page.evaluateHandle((n) => [...document.querySelectorAll("#financeiroRaiz button")].find((b) => (b.getAttribute("aria-label") || "").startsWith(`Folha ${n},`)) || null, n);
async function clicarFolha(page, n) { const h = await folha(page, n); const el = h.asElement(); if (!el) return false; await el.click(); await calmo(page); return true; }
const infoFolha = (page, n) => page.evaluate((n) => {
  const b = [...document.querySelectorAll("#financeiroRaiz button")].find((x) => (x.getAttribute("aria-label") || "").startsWith(`Folha ${n},`));
  return b ? { rotulo: b.getAttribute("aria-label"), desligado: b.disabled, marcado: b.getAttribute("aria-pressed") } : null;
}, n);
// o campo (input ou select) pelo texto do rótulo
const campo = (page, rotulo) => page.evaluateHandle((rotulo) => {
  const l = [...document.querySelectorAll("#financeiroRaiz label")].find((x) => x.textContent.replace(/\s+/g, " ").trim().startsWith(rotulo) && x.offsetParent !== null);
  return (l && (l.control || l.querySelector("input, select"))) || null;
}, rotulo);
async function digitar(page, rotulo, texto) { const el = (await campo(page, rotulo)).asElement(); if (!el) return false; await el.click(); await el.evaluate((e) => e.select()); await el.type(texto); return true; }
async function escolher(page, rotulo, valorOuTexto) {
  const el = (await campo(page, rotulo)).asElement();
  if (!el) return false;
  const v = await el.evaluate((s, t) => { const o = [...s.options].find((x) => x.value === t || x.textContent.trim() === t); return o ? o.value : null; }, valorOuTexto);
  if (v === null) return false;
  await el.select(v);
  await calmo(page);
  return true;
}
const opcoesDe = async (page, rotulo) => { const el = (await campo(page, rotulo)).asElement(); return el ? el.evaluate((s) => [...s.options].map((o) => o.textContent.trim())) : null; };
// o seletor de bloco da r30: o botão "Bloco 1.401 · Vila Nova ▾" abre a lista ("Os blocos de Vila Nova"), cada bloco com o título e a linha de baixo
const botaoSeletor = (page) => page.evaluate(() => { const b = [...document.querySelectorAll("#financeiroRaiz button[aria-haspopup=listbox]")].find((x) => x.offsetParent !== null); return b ? b.textContent.replace(/\s+/g, " ").trim() : null; });
async function abrirSeletor(page) {
  const feito = await page.evaluate(() => { const b = [...document.querySelectorAll("#financeiroRaiz button[aria-haspopup=listbox]")].find((x) => x.offsetParent !== null); if (!b) return false; b.click(); return true; });
  await calmo(page);
  if (!feito) return null;
  return page.evaluate(() => {
    const l = document.querySelector("#financeiroRaiz [role=listbox]");
    if (!l) return null;
    return { titulo: (l.getAttribute("aria-label") || ""), itens: [...l.querySelectorAll("[role=option]")].map((o) => ({ texto: o.innerText.replace(/\s+/g, " ").trim(), escolhido: o.getAttribute("aria-selected") === "true" })) };
  });
}
async function escolherNoSeletor(page, comeco) {
  const feito = await page.evaluate((comeco) => { const o = [...document.querySelectorAll("#financeiroRaiz [role=option]")].find((x) => x.textContent.replace(/\s+/g, " ").trim().startsWith(comeco)); if (!o) return false; o.click(); return true; }, comeco);
  await calmo(page);
  return feito;
}
const ultimoAviso = (page) => page.evaluate(() => { const t = [...document.querySelectorAll("#toastContainer .toast")]; return t.length ? t[t.length - 1].textContent : ""; });
async function fechar(s, nome) {
  const reg = await s.page.evaluate(() => ({ csp: window.__reg.csp.slice(), xss: window.__xssChamado, lado: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 }));
  const erros = s.erros.filter((e) => !/Failed to load resource|net::ERR/.test(e));
  ok(!erros.length, `${nome}: nenhum erro de script`, erros.slice(0, 3));
  ok(!reg.csp.length, `${nome}: nenhuma violação de CSP`, reg.csp.slice(0, 2));
  ok(reg.xss === 0, `${nome}: o texto do servidor não vira código (nenhum __xss)`);
  ok(!reg.lado, `${nome}: sem rolagem para o lado`);
  await s.ctx.close();
}

// ---- Folhas do bloco ----
async function provarFolhas() {
  // Geral, notebook
  let s = await abrir("geral", "notebook");
  let { page, api } = s;
  const antes = pedidos(api, "/api/financeiro/blocos/folhas").length;
  ok(await clicar(page, "Folhas do bloco"), "geral: a aba \"Folhas do bloco\" existe");
  const f1 = await esperarPedido(api, "/api/financeiro/blocos/folhas", "GET", antes);
  ok(f1 && !("bloco" in f1.busca), "geral: abre as folhas do bloco em uso (sem escolher bloco)", f1);
  await calmo(page);
  let t = await textoTela(page);
  ok(t.includes("Sede administrativa · as 45 congregações · as folhas de um bloco"), "geral: o subtítulo da aba", t.slice(0, 200));
  ok(t.includes("A folha que você clicou") && t.includes("só escolha o que aconteceu"), "geral: o quadro do formulário");
  ok(t.includes("As 50 folhas do bloco 1.401") && t.includes("70.051 a 70.100 · 38 com destino · 12 livres"), "geral: o quadro das 50 folhas");
  const n = await page.evaluate(() => [...document.querySelectorAll("#financeiroRaiz button")].filter((b) => /^Folha \d/.test(b.getAttribute("aria-label") || "")).length);
  ok(n === 50, "geral: 50 quadradinhos", n);
  const f17 = await infoFolha(page, "70.067"), f29 = await infoFolha(page, "70.079"), f1x = await infoFolha(page, "70.051"), f39 = await infoFolha(page, "70.089");
  ok(f17 && /17ª/.test(f17.rotulo) && /cancelada/.test(f17.rotulo) && !f17.desligado, "geral: a 17ª é cancelada e se clica (abre o histórico: r30)", f17);
  ok(f29 && /arrancada/.test(f29.rotulo) && !f29.desligado, "geral: a 29ª é arrancada", f29);
  ok(f1x && /lançada na planilha/.test(f1x.rotulo) && f1x.desligado, "geral: a 1ª é lançada na planilha, sem histórico: não se clica (resposta dele)", f1x);
  ok(f39 && /livre/.test(f39.rotulo) && !f39.desligado, "geral: a 39ª é livre e se clica", f39);
  const legenda = await page.evaluate(() => [...document.querySelectorAll("#financeiroRaiz .legenda > span")].map((x) => x.textContent.trim()));
  ok(JSON.stringify(legenda) === JSON.stringify(["lançada na planilha", "cancelada", "arrancada", "extraviada", "inexistente", "livre", "a que você clicou"]),
    "geral: a legenda sempre completa, na mesma ordem (a extraviada e a inexistente mesmo sem nenhuma no bloco)", legenda);
  const chips = await page.evaluate(() => [...document.querySelectorAll("#financeiroRaiz .chips button")].map((b) => b.textContent.trim()));
  ok(JSON.stringify(chips) === JSON.stringify(["Cancelada", "Arrancada", "Extraviada", "Inexistente"]), "geral: as quatro escolhas (a inexistente é a nova)", chips);
  ok(["preenchida errado e anulada", "tirada do bloco", "sumiu, e a congregação não sabe dela", "a gráfica não imprimiu"].every((x) => t.includes(x)),
    "geral: a frase de cada tipo, à vista antes de escolher (decisão dele de 24/11)");
  ok(t.includes("Normalmente é automático:") && t.includes("Ninguém digita número: clique na folha e o sistema sabe a posição"), "geral: a nota do automático");
  // escolher a folha: o número vai ao formulário
  ok(await clicarFolha(page, "70.090"), "geral: clicar na 40ª");
  t = await textoTela(page);
  ok(t.includes("70.090 · 40ª"), "geral: a folha clicada aparece no formulário (\"70.090 · 40ª\")");
  ok((await infoFolha(page, "70.090"))?.marcado === "true", "geral: a 40ª fica marcada");
  ok(t.includes("(70.090 = 40ª do bloco 70.051 a 70.100)"), "geral: a nota mostra a conta da folha clicada");
  // registrar sem o que aconteceu: não manda nada
  const postAntes = pedidos(api, "/api/financeiro/blocos/folha", "POST").length;
  await clicar(page, "Registrar");
  ok(pedidos(api, "/api/financeiro/blocos/folha", "POST").length === postAntes, "geral: sem \"o que aconteceu\" não registra");
  ok((await textoTela(page)).includes("Escolha o que aconteceu: cancelada, arrancada, extraviada ou inexistente."), "geral: diz o que falta (o texto da r30, com a inexistente)");
  ok(await clicar(page, "Arrancada"), "geral: a escolha \"Arrancada\"");
  ok(await page.evaluate(() => [...document.querySelectorAll("#financeiroRaiz button")].some((b) => b.textContent.trim() === "Arrancada" && b.getAttribute("aria-pressed") === "true")), "geral: \"Arrancada\" marcada");
  await clicar(page, "Registrar");
  ok(pedidos(api, "/api/financeiro/blocos/folha", "POST").length === postAntes, "geral: sem a observação não registra");
  ok((await textoTela(page)).includes("Escreva a observação"), "geral: pede a observação");
  ok(await digitar(page, "Observação", "Rasgou na hora de preencher"), "geral: o campo da observação");
  const leituras = pedidos(api, "/api/financeiro/blocos/folhas").length;
  await clicar(page, "Registrar");
  const post = await esperarPedido(api, "/api/financeiro/blocos/folha", "POST", postAntes);
  ok(post && JSON.stringify(post.corpo) === JSON.stringify({ folha: 70090, oQueAconteceu: "arrancada", observacao: "Rasgou na hora de preencher" }), "geral: registra a folha certa, o que aconteceu e a observação", post && post.corpo);
  const releu = await esperarPedido(api, "/api/financeiro/blocos/folhas", "GET", leituras);
  ok(releu && releu.busca.bloco === "1", "geral: depois de registrar, lê de novo o MESMO bloco", releu && releu.busca);
  await calmo(page);
  ok(/registrada como arrancada/.test(await ultimoAviso(page)), "geral: o aviso de sucesso com a mensagem do servidor", await ultimoAviso(page));
  const f40 = await infoFolha(page, "70.090");
  ok(f40 && /arrancada/.test(f40.rotulo) && f40.desligado, "geral: a 40ª agora é arrancada", f40);
  t = await textoTela(page);
  ok(!t.includes("70.090 · 40ª"), "geral: o formulário fica limpo depois de registrar");
  // a recusa do servidor (a folha já tem destino) aparece e a escolha continua
  await clicarFolha(page, "70.089");
  await clicar(page, "Cancelada");
  await digitar(page, "Observação", "Erro no valor");
  await clicar(page, "Registrar");
  await espera(300);
  ok(/já tem destino/.test(await ultimoAviso(page)), "geral: a recusa do servidor aparece", await ultimoAviso(page));
  ok((await textoTela(page)).includes("70.089 · 39ª"), "geral: depois da recusa, a folha continua escolhida");
  // a folha inexistente (a gráfica não imprimiu): registra como as outras exceções
  await clicarFolha(page, "70.091");
  ok(await clicar(page, "Inexistente"), "geral: a escolha \"Inexistente\"");
  await digitar(page, "Observação", "A gráfica não imprimiu");
  const postInex = pedidos(api, "/api/financeiro/blocos/folha", "POST").length;
  await clicar(page, "Registrar");
  const pi = await esperarPedido(api, "/api/financeiro/blocos/folha", "POST", postInex);
  ok(pi && JSON.stringify(pi.corpo) === JSON.stringify({ folha: 70091, oQueAconteceu: "inexistente", observacao: "A gráfica não imprimiu" }), "geral: registra a inexistente", pi && pi.corpo);
  await calmo(page);
  const f41 = await infoFolha(page, "70.091");
  ok(f41 && /41ª: inexistente/.test(f41.rotulo) && f41.desligado, "geral: a 41ª agora é inexistente", f41);
  // o seletor do bloco (r30): um botão que abre a lista
  ok((await botaoSeletor(page)) === "Bloco 1.401 · Vila Nova", "geral: o seletor \"Bloco 1.401 · Vila Nova\"", await botaoSeletor(page));
  const lista = await abrirSeletor(page);
  ok(lista && lista.titulo === "Os blocos das congregações" && lista.itens.length === 4, "geral: a lista dos blocos", lista);
  ok(lista && lista.itens[0].texto === "Bloco 1.401 · Vila Nova em uso · 38 com destino · 12 livres" && lista.itens[0].escolhido, "geral: o em uso, escolhido", lista && lista.itens[0]);
  ok(lista && lista.itens.some((i) => i.texto === "Bloco 1.288 · na Tesouraria Geral parcial · 15 livres"), "geral: o bloco que voltou parcial, na Tesouraria Geral", lista && lista.itens);
  ok(lista && lista.itens.some((i) => i.texto === "Bloco 1.360 · Bela Vista devolvido em 10/11 · completo: só consulta"), "geral: o devolvido, só consulta", lista && lista.itens);
  await page.keyboard.press("Escape");
  await calmo(page);
  ok(await page.evaluate(() => !document.querySelector("#financeiroRaiz [role=listbox]")), "geral: Esc fecha a lista");
  await abrirSeletor(page);
  const l2 = pedidos(api, "/api/financeiro/blocos/folhas").length;
  ok(await escolherNoSeletor(page, "Bloco 1.360"), "geral: escolher o bloco 1.360 (devolvido)");
  const f5 = await esperarPedido(api, "/api/financeiro/blocos/folhas", "GET", l2);
  ok(f5 && f5.busca.bloco === "5", "geral: lê as folhas do bloco escolhido", f5 && f5.busca);
  await calmo(page);
  t = await textoTela(page);
  ok(t.includes("As 50 folhas do bloco 1.360"), "geral: mostra o bloco escolhido");
  const livreDevolvido = await infoFolha(page, "68.046");
  ok(livreDevolvido && livreDevolvido.desligado, "geral: no bloco devolvido nenhuma folha se clica (nem a livre)", livreDevolvido);
  ok(t.includes("O bloco 1.360 voltou completo à Tesouraria Geral em 10/11. As folhas dele não mudam mais: ficam só para consulta."), "geral: o bloco devolvido, só para consulta (o texto da r30)");
  ok(t.includes("68.001 a 68.050 · completo: 46 lançadas, 1 cancelada, 1 extraviada, 1 inexistente"), "geral: a conta do bloco devolvido", t.slice(0, 900));
  ok(!t.includes("Normalmente é automático"), "geral: no bloco devolvido, sem a nota do automático");
  const ext = await infoFolha(page, "68.049"), inex = await infoFolha(page, "68.050");
  ok(ext && /extraviada/.test(ext.rotulo), "geral: a folha extraviada se distingue", ext);
  ok(inex && /: inexistente/.test(inex.rotulo), "geral: a folha inexistente se distingue (o nome dela no rótulo)", inex);
  const cores = await page.evaluate(() => {
    const achar = (n) => [...document.querySelectorAll("#financeiroRaiz button")].find((b) => (b.getAttribute("aria-label") || "").startsWith(`Folha ${n},`));
    const est = (n) => { const c = getComputedStyle(achar(n)); return { fundo: c.backgroundColor, imagem: c.backgroundImage, borda: c.borderTopStyle, cor: c.borderTopColor }; };
    return { ext: est("68.049"), inex: est("68.050"), livre: est("68.046"), lanc: est("68.001") };
  });
  ok(cores.ext.fundo === "rgb(237, 233, 254)" && cores.ext.borda === "dashed" && cores.ext.cor === "rgb(124, 58, 237)", "geral: a extraviada é roxa com a borda tracejada (a cor aprovada na r30)", cores.ext);
  ok(cores.inex.imagem !== "none" && cores.inex.fundo !== cores.livre.fundo && cores.inex.fundo !== cores.lanc.fundo && cores.inex.borda !== "dashed",
    "geral: a inexistente tem cor própria (listrada), que não se confunde com a livre nem com a extraviada", cores.inex);
  // o bloco que voltou parcial e está com a Geral: as usadas com a cor, as 15 livres prontas para sair
  await abrirSeletor(page);
  ok(await escolherNoSeletor(page, "Bloco 1.288"), "geral: escolher o 1.288 (na Tesouraria Geral)");
  t = await textoTela(page);
  ok((await botaoSeletor(page)) === "Bloco 1.288 · na Tesouraria Geral", "geral: o seletor diz onde o bloco está", await botaoSeletor(page));
  ok(t.includes("O bloco 1.288 voltou parcial em 03/11 e está na Tesouraria Geral. As 35 usadas ficam no histórico, com quem usou (Vila Nova); as 15 livres (64.436 a 64.450) estão prontas para outra entrega."),
    "geral: o cartão do bloco parcial (o texto da r30)", t.slice(0, 700));
  ok(t.includes("64.401 a 64.450 · parcial: 35 com destino · 15 livres"), "geral: a conta do bloco parcial");
  const livreNaGeral = await infoFolha(page, "64.440");
  ok(livreNaGeral && /livre/.test(livreNaGeral.rotulo) && livreNaGeral.desligado, "geral: as livres que voltaram não se marcam (o bloco está na Geral)", livreNaGeral);
  ok(await clicar(page, "Registrar saída"), "geral: o botão \"Registrar saída\" do cartão");
  ok((await textoTela(page)).includes("o livro de entrada e saída"), "geral: leva ao livro de entrada e saída");
  await fechar(s, "folhas geral notebook");

  // a lista falhou: a aba das folhas diz sozinha quem está vendo
  s = await abrir("area", "notebook", { listaFalha: true });
  await clicar(s.page, "Folhas do bloco");
  await espera(400);
  ok((await textoTela(s.page)).includes("Área 2 · 12 congregações · as folhas de um bloco"), "área: o subtítulo vem da própria aba das folhas");
  ok((await botaoSeletor(s.page)) !== null, "área: tem o seletor do bloco");
  s.erros.length = 0;   // a falha simulada da lista (500) é de propósito
  await fechar(s, "folhas área notebook");

  // a congregação: sem seletor, o cadeado
  s = await abrir("local", "notebook");
  await clicar(s.page, "Folhas do bloco");
  await espera(300);
  t = await textoTela(s.page);
  ok(t.includes("Congregação Vila Nova · as folhas de um bloco"), "local: o subtítulo");
  ok((await botaoSeletor(s.page)) === "Bloco 1.401 · em uso", "local: o seletor de bloco também na congregação (a r30), sem o nome dela", await botaoSeletor(s.page));
  ok(t.includes("As 50 folhas do bloco 1.401"), "local: as folhas do bloco em uso");
  const listaLocal = await abrirSeletor(s.page);
  ok(listaLocal && listaLocal.titulo === "Os blocos de Vila Nova" && JSON.stringify(listaLocal.itens.map((i) => i.texto)) === JSON.stringify([
    "Bloco 1.401 · em uso 38 com destino · 12 livres", "Bloco 1.402 · esperando recebido em 25/11 · 50 livres",
    "Bloco 1.288 · devolvido em 03/11 parcial: as 35 usadas, só consulta", "Bloco 1.251 · devolvido em 21/07 completo: só consulta"
  ]), "local: a lista do desenho (o em uso, o esperando e os devolvidos)", listaLocal);
  ok(await escolherNoSeletor(s.page, "Bloco 1.251"), "local: escolher o 1.251 (devolvido)");
  t = await textoTela(s.page);
  ok(t.includes("O bloco 1.251 voltou completo à Tesouraria Geral em 21/07. As folhas dele não mudam mais: ficam só para consulta. Clique numa folha para ver o histórico dela."),
    "local: o cartão do bloco devolvido (o texto da r30)", t.slice(0, 600));
  ok(t.includes("62.551 a 62.600 · completo: 49 lançadas, 1 arrancada"), "local: a conta do bloco devolvido (r30)");
  ok((await botaoSeletor(s.page)) === "Bloco 1.251 · devolvido", "local: o seletor do devolvido", await botaoSeletor(s.page));
  await fechar(s, "folhas local notebook");

  // o celular: as 30 primeiras viram uma linha
  s = await abrir("geral", "celular");
  await clicar(s.page, "Folhas do bloco");
  await espera(300);
  t = await textoTela(s.page);
  ok(t.includes("1ª a 35ª: todas com destino"), "celular: as 35 primeiras numa linha (a r30)", t.slice(0, 300));
  const nCel = await s.page.evaluate(() => [...document.querySelectorAll("#financeiroRaiz button")].filter((b) => /^Folha \d/.test(b.getAttribute("aria-label") || "") && b.offsetParent !== null).length);
  ok(nCel === 15, "celular: a grade começa na 36ª (15 folhas)", nCel);
  ok((await botaoSeletor(s.page)) === "Bloco 1.401 · Vila Nova", "celular: o seletor logo abaixo das abas, em todos os níveis (a r30)", await botaoSeletor(s.page));
  const ordem = await s.page.evaluate(() => {
    const raiz = document.querySelector("#financeiroRaiz");
    const abas = raiz.querySelector(".abas-cel"), sel = raiz.querySelector("button[aria-haspopup=listbox]"), grade = raiz.querySelector(".grade"), leg = raiz.querySelector(".legenda");
    const y = (e) => (e ? e.getBoundingClientRect().top : -1);
    return [y(abas), y(sel), y(grade), y(leg)];
  });
  ok(ordem.every((v, i) => v >= 0 && (i === 0 || v > ordem[i - 1])), "celular: as abas, o seletor, a grade e a legenda, nessa ordem", ordem);
  await clicarFolha(s.page, "70.090");
  ok((await textoTela(s.page)).includes("Folha 70.090 · a 40ª"), "celular: o quadro diz a folha clicada");
  await fechar(s, "folhas geral celular");
}

// ---- desfazer a exceção da folha e o histórico (r30-blocos-desfazer) ----
const textoHistorico = (page) => page.evaluate(() => { const h = document.querySelector("#financeiroRaiz .historico"); return h ? h.innerText.replace(/\s+/g, " ").trim() : null; });
async function provarDesfazer() {
  // a Tesouraria Geral, notebook: a folha marcada abre o cartão com o motivo e o histórico
  let s = await abrir("geral", "notebook");
  let { page, api } = s;
  await clicar(page, "Folhas do bloco");
  await espera(300);
  const f36 = await infoFolha(page, "70.086");
  ok(f36 && /36ª: extraviada/.test(f36.rotulo) && !f36.desligado, "desfazer geral: a 36ª extraviada se clica", f36);
  let antes = pedidos(api, "/api/financeiro/blocos/historico").length;
  ok(await clicarFolha(page, "70.086"), "desfazer geral: clicar na 36ª");
  const h1 = await esperarPedido(api, "/api/financeiro/blocos/historico", "GET", antes);
  ok(h1 && h1.busca.folha === "70086", "desfazer geral: pede o histórico da folha clicada", h1 && h1.busca);
  await calmo(page);
  let t = await textoTela(page);
  ok(t.includes("A folha que você clicou") && t.includes("desfazer pede o motivo") && t.includes("Folha (bloco 1.401)") && t.includes("70.086 · 36ª") && t.includes("Está como"),
    "desfazer geral: o cartão da folha marcada (o texto da r30)", t.slice(0, 500));
  ok(t.includes("Motivo para desfazer") && t.includes("fica no histórico") && t.includes("Desfazer a marcação"), "desfazer geral: o motivo e o botão");
  ok((await textoHistorico(page)) === "O histórico da folha 12/11 09h40 Rute Santos (tesoureira de Vila Nova) marcou como extraviada: “Não achei a folha no bloco.”",
    "desfazer geral: o histórico (quem marcou, quando e o que escreveu)", await textoHistorico(page));
  ok(!t.includes("Normalmente é automático"), "desfazer geral: sem a nota do automático no cartão da folha marcada");
  ok((await infoFolha(page, "70.086")).rotulo.endsWith(", a que você clicou"), "desfazer geral: a 36ª fica marcada como a clicada");
  const anel = await page.evaluate(() => { const b = [...document.querySelectorAll("#financeiroRaiz button")].find((x) => (x.getAttribute("aria-label") || "").startsWith("Folha 70.086,")); const c = getComputedStyle(b); return { fundo: c.backgroundColor, sombra: c.boxShadow }; });
  ok(anel.fundo === "rgb(237, 233, 254)" && /3px/.test(anel.sombra), "desfazer geral: a clicada marcada guarda a cor dela, com o anel", anel);
  const postAntes = pedidos(api, "/api/financeiro/blocos/desfazer-folha", "POST").length;
  await clicar(page, "Desfazer a marcação");
  ok(pedidos(api, "/api/financeiro/blocos/desfazer-folha", "POST").length === postAntes, "desfazer geral: sem o motivo não desfaz");
  ok((await textoTela(page)).includes("Escreva o motivo para desfazer."), "desfazer geral: pede o motivo (o texto da r30)");
  ok(await digitar(page, "Motivo para desfazer", "A folha apareceu, estava com os recibos de outubro"), "desfazer geral: o campo do motivo");
  const leituras = pedidos(api, "/api/financeiro/blocos/folhas").length;
  antes = pedidos(api, "/api/financeiro/blocos/historico").length;
  await clicar(page, "Desfazer a marcação");
  const post = await esperarPedido(api, "/api/financeiro/blocos/desfazer-folha", "POST", postAntes);
  ok(post && JSON.stringify(post.corpo) === JSON.stringify({ folha: 70086, motivo: "A folha apareceu, estava com os recibos de outubro" }), "desfazer geral: manda a folha e o motivo", post && post.corpo);
  const releu = await esperarPedido(api, "/api/financeiro/blocos/folhas", "GET", leituras);
  ok(releu && releu.busca.bloco === "1", "desfazer geral: lê de novo o mesmo bloco", releu && releu.busca);
  await esperarPedido(api, "/api/financeiro/blocos/historico", "GET", antes);
  await calmo(page);
  ok((await ultimoAviso(page)).includes("A folha 70.086 voltou a ficar livre. O histórico guarda quem marcou, quem desfez e por quê."), "desfazer geral: o aviso da r30", await ultimoAviso(page));
  t = await textoTela(page);
  ok(t.includes("só escolha o que aconteceu") && t.includes("70.086 · 36ª") && t.includes("Cancelada"), "desfazer geral: a folha livre de novo, já no formulário (o \"depois de desfazer\" da r30)", t.slice(0, 500));
  ok((await textoHistorico(page)) === "O histórico da folha 12/11 09h40 Rute Santos (tesoureira de Vila Nova) marcou como extraviada: “Não achei a folha no bloco.” "
    + "25/11 11h20 João da Silva (Tesouraria Geral) desfez: “A folha apareceu, estava com os recibos de outubro.” Voltou a ficar livre.",
    "desfazer geral: o histórico embaixo do formulário, com quem desfez e por quê", await textoHistorico(page));
  const f36b = await infoFolha(page, "70.086");
  ok(f36b && /36ª: livre/.test(f36b.rotulo) && f36b.marcado === "true", "desfazer geral: a 36ª livre e escolhida", f36b);
  ok(t.includes("70.051 a 70.100 · 37 com destino · 13 livres"), "desfazer geral: a conta do quadro (37 com destino · 13 livres)");
  // a lançada com histórico abre o cartão, sem desfazer; a lançada sem histórico não se clica
  ok(await clicarFolha(page, "70.060"), "desfazer geral: a 10ª (lançada, com uma exceção desfeita antes) se clica");
  t = await textoTela(page);
  ok(t.includes("Está como") && t.includes("lançada") && t.includes("A folha lançada se corrige pelo lançamento.") && !t.includes("Desfazer a marcação"),
    "desfazer geral: a lançada mostra o histórico, sem desfazer", t.slice(0, 500));
  ok((await textoHistorico(page) || "").includes("desfez: “Estava certa"), "desfazer geral: o histórico da lançada (o texto do servidor como texto)");
  ok((await infoFolha(page, "70.052")).desligado, "desfazer geral: a lançada sem histórico não se clica");
  await fechar(s, "desfazer geral notebook");

  // a área e a congregação: só o histórico, com o cadeado
  for (const nivel of ["area", "local"]) {
    s = await abrir(nivel, "notebook");
    await clicar(s.page, "Folhas do bloco");
    await espera(300);
    await clicarFolha(s.page, "70.086");
    await espera(200);
    t = await textoTela(s.page);
    ok(t.includes("só a Tesouraria Geral desfaz") && t.includes("Marcou errado? Só a Tesouraria Geral desfaz, com o motivo. Fale com ela."), `desfazer ${nivel}: o cadeado (o texto da r30)`, t.slice(0, 500));
    ok(!t.includes("Motivo para desfazer") && !t.includes("Desfazer a marcação"), `desfazer ${nivel}: sem o motivo nem o botão`);
    ok((await textoHistorico(s.page) || "").startsWith("O histórico da folha 12/11 09h40 Rute Santos"), `desfazer ${nivel}: o histórico`);
    if (nivel === "local") {
      await abrirSeletor(s.page);
      await escolherNoSeletor(s.page, "Bloco 1.251");
      await clicarFolha(s.page, "62.564");
      await espera(200);
      t = await textoTela(s.page);
      ok(t.includes("Está como") && t.includes("arrancada") && t.includes("Só para consulta: a folha já voltou com o bloco.") && (await textoHistorico(s.page) || "").includes("02/06 15h05"),
        "desfazer local: no bloco devolvido, a folha com histórico abre só para consulta", t.slice(0, 600));
      ok((await textoHistorico(s.page)) === "O histórico da folha 02/06 15h05 Rute Santos marcou como arrancada: “Tirada do bloco.”",
        "desfazer local: a marca antiga, sem o papel gravado na hora, mostra só o nome (nunca um papel suposto)", await textoHistorico(s.page));
      ok((await infoFolha(s.page, "62.551")).desligado, "desfazer local: no devolvido, a lançada sem histórico não se clica");
    }
    await fechar(s, `desfazer ${nivel} notebook`);
  }

  // o celular: a congregação vê o cadeado sem "Fale com ela."; a Geral desfaz e vê o cartão da folha livre com o histórico
  s = await abrir("local", "celular");
  await clicar(s.page, "Folhas do bloco");
  await espera(300);
  await clicarFolha(s.page, "70.086");
  await espera(200);
  t = await textoTela(s.page);
  ok(t.includes("Folha 70.086 · a 36ª") && t.includes("Marcou errado? Só a Tesouraria Geral desfaz, com o motivo.") && !t.includes("Fale com ela."), "desfazer local celular: o cartão (o texto da r30)", t.slice(0, 500));
  await fechar(s, "desfazer local celular");
  s = await abrir("geral", "celular");
  ({ page, api } = s);
  await clicar(page, "Folhas do bloco");
  await espera(300);
  await clicarFolha(page, "70.086");
  await espera(200);
  ok(await digitar(page, "Motivo para desfazer", "A folha apareceu, estava com os recibos de outubro"), "desfazer geral celular: o motivo");
  await clicar(page, "Desfazer a marcação");
  await espera(400);
  await calmo(page);
  ok((await ultimoAviso(page)).trim() === "A folha 70.086 voltou a ficar livre.", "desfazer geral celular: o aviso curto da r30", await ultimoAviso(page));
  t = await textoTela(page);
  ok(t.includes("Folha 70.086 · a 36ª") && t.includes("Marcar o que aconteceu") && !t.includes("Cancelada"), "desfazer geral celular: o cartão da folha livre, com o histórico e o botão (o formulário fecha)", t.slice(0, 600));
  ok((await textoHistorico(page) || "").includes("João da Silva (Tesouraria Geral) desfez"), "desfazer geral celular: o histórico");
  ok(await clicar(page, "Marcar o que aconteceu"), "desfazer geral celular: tocar em \"Marcar o que aconteceu\"");
  ok((await textoTela(page)).includes("Cancelada"), "desfazer geral celular: abre o formulário");
  await fechar(s, "desfazer geral celular");
}

// ---- Livro de entrada e saída ----
async function provarLivro() {
  let s = await abrir("geral", "notebook");
  let { page, api } = s;
  const l0 = pedidos(api, "/api/financeiro/blocos/livro").length;
  ok(await clicar(page, "Livro de entrada e saída"), "geral: a aba do livro existe");
  const l1 = await esperarPedido(api, "/api/financeiro/blocos/livro", "GET", l0);
  ok(l1 && l1.busca.porPagina === "5" && (!l1.busca.pagina || l1.busca.pagina === "1"), "geral: o livro em páginas de 5 no notebook", l1 && l1.busca);
  await calmo(page);
  let t = await textoTela(page);
  ok(t.includes("Sede administrativa · as 45 congregações · o livro de entrada e saída"), "geral: o subtítulo do livro");
  ok(t.includes("O livro") && t.includes("entradas, saídas e cadastros"), "geral: o quadro do livro");
  const linhas = [
    ["17/11", "Saída: bloco 1.402 entregue a Rute Santos (Vila Nova)", "registrou João da Silva · Tesouraria Geral"],
    ["10/11", "Entrada: bloco 1.360 devolvido por Bela Vista", "recebeu João da Silva · completo: 49 lançadas, 1 cancelada"],
    ["03/11", "Saída: bloco 1.395 entregue a Ezequiel Ramos (Monte Sião)", "levado pela área, sem ficar com ela"],
    ["28/10", "Cadastro: lote da gráfica, série 2026", "10.000 folhas · 70.001 a 80.000 · 200 blocos"],
    ["21/10", "Entrada: bloco 1.352 devolvido pela congregação Sede", "recebeu João da Silva · completo: 50 lançadas"]
  ];
  for (const [d, tit, sub] of linhas) ok(t.includes(`${d} ${tit} ${sub}`), `geral: a linha "${tit}"`, t.slice(t.indexOf("O livro"), t.indexOf("O livro") + 500));
  ok(t.includes("1 a 5 de 412 registros"), "geral: \"1 a 5 de 412 registros\"");
  const l2 = pedidos(api, "/api/financeiro/blocos/livro").length;
  ok(await clicar(page, "2"), "geral: a página 2");
  const p2 = await esperarPedido(api, "/api/financeiro/blocos/livro", "GET", l2);
  ok(p2 && p2.busca.pagina === "2" && p2.busca.porPagina === "5", "geral: pede a página 2", p2 && p2.busca);
  // os botões e o formulário da entrada
  ok(t.includes("Registrar entrada") && t.includes("Registrar saída"), "geral: os botões \"Registrar entrada\" e \"Registrar saída\"");
  ok(t.includes("o bloco volta para a Tesouraria Geral"), "geral: o formulário da entrada aberto");
  ok(t.includes("João da Silva · Tesouraria Geral (quem está entrando)"), "geral: \"Recebido por\" é quem está entrando");
  const r0 = pedidos(api, "/api/financeiro/blocos/rastreio").length;
  ok(await digitar(page, "Primeira folha do bloco", "68.010"), "geral: o campo da primeira folha");
  const r1 = await esperarPedido(api, "/api/financeiro/blocos/rastreio", "GET", r0);
  ok(r1 && r1.busca.folha === "68010", "geral: o rastreio vem sozinho, só com os números", r1 && r1.busca);
  await calmo(page);
  t = await textoTela(page);
  let cxE = await caixaSaida(page);
  ok(cxE && !cxE.erro && cxE.texto === "Bloco 1.360 (veio sozinho): folhas 68.001 a 68.050 · entregue a Bela Vista em 08/09 · as 50 com destino (49 lançadas, 1 cancelada)",
    "geral: a caixa do bloco na entrada (r30)", cxE);
  ok((await textoTela(page)).includes("A devolução Completa Parcial"), "geral: \"A devolução\", já em \"Completa\"");
  ok(await page.evaluate(() => { const b = [...document.querySelectorAll("#financeiroRaiz button")].find((x) => x.textContent.trim() === "Completa"); return !!b && b.getAttribute("aria-pressed") === "true"; }), "geral: \"Completa\" marcada");
  const opsP = await opcoesDe(page, "Devolvido por");
  ok(opsP && opsP.includes("Ezequiel Ramos · quem levou o bloco") && opsP.includes("Lia Fontes · tesoureira de Bela Vista") && opsP.some((o) => /Outra pessoa/.test(o)), "geral: quem pode devolver", opsP);
  const d0 = pedidos(api, "/api/financeiro/blocos/devolver", "POST").length;
  await clicar(page, "Registrar a entrada");
  ok(pedidos(api, "/api/financeiro/blocos/devolver", "POST").length === d0, "geral: sem quem devolveu não registra");
  ok((await textoTela(page)).includes("Escolha quem trouxe o bloco."), "geral: pede quem trouxe (o texto da r30)");
  ok(await escolher(page, "Devolvido por", "Lia Fontes · tesoureira de Bela Vista"), "geral: escolher a Lia");
  const lv = pedidos(api, "/api/financeiro/blocos/livro").length;
  await clicar(page, "Registrar a entrada");
  const dv = await esperarPedido(api, "/api/financeiro/blocos/devolver", "POST", d0);
  ok(dv && JSON.stringify(dv.corpo) === JSON.stringify({ primeiraFolha: 68001, folha: 68010, pessoa: { membroId: 301 }, parcial: false }), "geral: devolve pela PRIMEIRA folha do bloco (e a digitada junto, para o servidor conferir), a pessoa do cadastro e completa", dv && dv.corpo);
  const relido = await esperarPedido(api, "/api/financeiro/blocos/livro", "GET", lv);
  ok(relido && (!relido.busca.pagina || relido.busca.pagina === "1"), "geral: depois da entrada, o livro volta à 1ª página", relido && relido.busca);
  await calmo(page);
  ok(/devolvido/.test(await ultimoAviso(page)), "geral: o aviso de sucesso", await ultimoAviso(page));
  t = await textoTela(page);
  ok(!(await caixaSaida(page)), "geral: o formulário fica limpo depois da entrada");
  // quem levou, escrito sem cadastro: vai o nome
  await digitar(page, "Primeira folha do bloco", "68001");
  await esperarPedido(api, "/api/financeiro/blocos/rastreio", "GET", pedidos(api, "/api/financeiro/blocos/rastreio").length - 1);
  await espera(600);
  await escolher(page, "Devolvido por", "Ezequiel Ramos · quem levou o bloco");
  let dAntes = pedidos(api, "/api/financeiro/blocos/devolver", "POST").length;
  await clicar(page, "Registrar a entrada");
  let dEz = await esperarPedido(api, "/api/financeiro/blocos/devolver", "POST", dAntes);
  ok(dEz && JSON.stringify(dEz.corpo) === JSON.stringify({ primeiraFolha: 68001, folha: 68001, pessoa: { nome: "Ezequiel Ramos" }, parcial: false }), "geral: quem levou sem cadastro vai pelo nome", dEz && dEz.corpo);
  // outra pessoa: o nome escrito
  await digitar(page, "Primeira folha do bloco", "68001");
  await espera(700);
  await escolher(page, "Devolvido por", "outra");
  ok(await digitar(page, "Nome de quem trouxe", "Marta Lima"), "geral: \"outra pessoa\" abre o campo do nome");
  dAntes = pedidos(api, "/api/financeiro/blocos/devolver", "POST").length;
  await clicar(page, "Registrar a entrada");
  dEz = await esperarPedido(api, "/api/financeiro/blocos/devolver", "POST", dAntes);
  ok(dEz && JSON.stringify(dEz.corpo) === JSON.stringify({ primeiraFolha: 68001, folha: 68001, pessoa: { nome: "Marta Lima" }, parcial: false }), "geral: outra pessoa vai pelo nome escrito", dEz && dEz.corpo);
  await calmo(page);
  ok(/^O bloco 1\.360 já foi devolvido em 03\/11\/2026\.$/.test(await ultimoAviso(page)), "geral: a recusa do bloco que já voltou aparece para a pessoa", await ultimoAviso(page));
  // o bloco que ainda está na Geral e o já devolvido: o rastreio não quebra e não oferece o registro
  await digitar(page, "Primeira folha do bloco", "70101");
  await espera(700);
  t = await textoTela(page);
  cxE = await caixaSaida(page);
  ok(cxE && cxE.erro && cxE.texto === "O bloco 1.402 ainda está na Tesouraria Geral: não saiu para voltar.", "geral: o bloco na Geral: a caixa em vermelho diz que ainda não saiu", cxE);
  ok(await page.evaluate(() => { const b = [...document.querySelectorAll("#financeiroRaiz button")].find((x) => x.textContent.trim() === "Registrar a entrada"); return !!b && b.disabled; }), "geral: o bloco na Geral não se registra");
  await digitar(page, "Primeira folha do bloco", "67001");
  await espera(700);
  t = await textoTela(page);
  cxE = await caixaSaida(page);
  ok(cxE && cxE.erro && cxE.texto === "O bloco 1.340 já foi devolvido em 02/10/2026.", "geral: o bloco devolvido: a caixa em vermelho diz quando voltou", cxE);
  ok(await page.evaluate(() => { const b = [...document.querySelectorAll("#financeiroRaiz button")].find((x) => x.textContent.trim() === "Parcial"); return !!b && b.disabled; }), "geral: sem bloco que volte, as escolhas ficam apagadas");
  await digitar(page, "Primeira folha do bloco", "5");
  await espera(700);
  ok((await textoTela(page)).includes("Nenhum bloco tem a folha 5."), "geral: a folha que nenhum bloco tem");
  // a devolução parcial (r30): a primeira em branco que o sistema traz, a linha do que vai acontecer e a confirmação
  await digitar(page, "Primeira folha do bloco", "66.001");
  await espera(700);
  await calmo(page);
  cxE = await caixaSaida(page);
  ok(cxE && !cxE.erro && cxE.texto === "Bloco 1.320 (veio sozinho): folhas 66.001 a 66.050 · entregue a Vila Nova em 08/09 · 35 com destino, 15 sem destino (36ª a 50ª)",
    "geral: a caixa do bloco com as 15 do fim em branco", cxE);
  ok(!(await textoTela(page)).includes("Primeira folha em branco"), "geral: na completa, sem a primeira em branco");
  await clicar(page, "Parcial");
  t = await textoTela(page);
  ok(t.includes("Primeira folha em branco*") && (await page.evaluate(() => { const l = [...document.querySelectorAll("#financeiroRaiz label")].find((x) => x.textContent.trim().startsWith("Primeira folha em branco")); const i = l && l.querySelector("input"); return i ? i.value : null; })) === "66.036",
    "geral: \"Parcial\" abre a primeira em branco, que o sistema já traz (66.036)");
  ok(t.includes("66.036 · 36ª") || t.includes("· 36ª"), "geral: a posição da primeira em branco", t.slice(t.indexOf("Primeira folha em branco"), t.indexOf("Primeira folha em branco") + 80));
  ok(t.includes("66.036 a 66.050 (15 folhas) voltam a ficar livres. O bloco fica na Tesouraria Geral, para outra entrega só com elas; as 35 usadas ficam no histórico, com Vila Nova."),
    "geral: a linha do que vai acontecer, antes de gravar", t.slice(t.indexOf("voltam"), t.indexOf("voltam") + 200));
  await digitar(page, "Primeira folha em branco", "66.040");
  t = await textoTela(page);
  ok(t.includes("66.040 a 66.050 (11 folhas) voltam a ficar livres.") && t.includes("as 39 usadas") && t.includes("· 40ª"), "geral: dá para mudar a que o sistema trouxe; a linha acompanha");
  await escolher(page, "Devolvido por", "Rute Santos · tesoureira de Vila Nova");
  const dP = pedidos(api, "/api/financeiro/blocos/devolver", "POST").length;
  await clicar(page, "Registrar a entrada");
  const dvP = await esperarPedido(api, "/api/financeiro/blocos/devolver", "POST", dP);
  ok(dvP && JSON.stringify(dvP.corpo) === JSON.stringify({ primeiraFolha: 66001, folha: 66001, pessoa: { membroId: 101 }, parcial: true, primeiraEmBranco: 66040 }), "geral: a parcial vai com a primeira em branco", dvP && dvP.corpo);
  await calmo(page);
  ok((await ultimoAviso(page)) === "Bloco 1.320 de volta, parcial: as folhas 66.040 a 66.050 estão livres para outra entrega.", "geral: a confirmação da parcial", await ultimoAviso(page));
  ok(!(await caixaSaida(page)) && !(await textoTela(page)).includes("Primeira folha em branco"), "geral: o formulário fica limpo, de novo em \"Completa\"");
  ok((await textoTela(page)).includes("04/10 Entrada parcial: bloco 1.320 devolvido por Vila Nova recebeu João da Silva · 39 usadas · livres de novo: 66.040 a 66.050"),
    "geral: a linha da entrada parcial no livro (r30)");
  // a inexistente na parcial (resposta dele, 24/11): a do fim fica fora das que voltam livres; a do meio é dita, como na confirmação do servidor
  await digitar(page, "Primeira folha do bloco", "66.551");
  await espera(700);
  await calmo(page);
  cxE = await caixaSaida(page);
  ok(cxE && cxE.texto === "Bloco 1.331 (veio sozinho): folhas 66.551 a 66.600 · entregue a Vila Nova em 08/09 · 36 com destino, 14 sem destino (36ª a 49ª)",
    "geral: a 50ª inexistente fica fora das posições em branco", cxE);
  await clicar(page, "Parcial");
  t = await textoTela(page);
  ok(t.includes("66.586 a 66.599 (14 folhas) voltam a ficar livres."), "geral: a inexistente do fim não volta livre", t.slice(t.indexOf("voltam") - 60, t.indexOf("voltam") + 40));
  await digitar(page, "Primeira folha do bloco", "66.501");
  await espera(700);
  await calmo(page);
  cxE = await caixaSaida(page);
  ok(cxE && cxE.texto === "Bloco 1.330 (veio sozinho): folhas 66.501 a 66.550 · entregue a Vila Nova em 08/09 · 32 com destino, 18 sem destino", "geral: com a inexistente no meio, sem as posições", cxE);
  await clicar(page, "Parcial");
  t = await textoTela(page);
  ok(t.includes("66.531 a 66.549 (18 folhas, menos a 66.540, inexistente) voltam a ficar livres."), "geral: a inexistente do meio é dita", t.slice(t.indexOf("voltam") - 80, t.indexOf("voltam") + 40));
  await digitar(page, "Primeira folha em branco", "66.549");
  ok((await textoTela(page)).includes("66.549 (1 folha) volta a ficar livre."), "geral: uma folha só: \"volta a ficar livre\"");
  await clicar(page, "Completa");
  // a saída: o formulário da r30 no lugar do aviso
  ok(await clicar(page, "Registrar saída"), "geral: o botão \"Registrar saída\"");
  t = await textoTela(page);
  ok(!/ainda vai ser construíd/.test(t) && t.includes("o bloco vai para uma congregação"), "geral: a saída abre o formulário (sai o aviso de antes)", t.slice(0, 400));
  ok(!t.includes("o bloco volta para a Tesouraria Geral"), "geral: a saída troca o formulário da entrada pelo dela");
  await clicar(page, "Registrar entrada");
  ok((await textoTela(page)).includes("o bloco volta para a Tesouraria Geral"), "geral: \"Registrar entrada\" volta ao formulário");
  // o aviso do lote da gráfica não promete mais "junto com as folhas e o livro"
  await clicar(page, "Blocos");
  await clicar(page, "Cadastrar lote da gráfica");
  t = await textoTela(page);
  ok(/lote da gráfica/.test(t) && !/junto com as folhas do bloco e o livro/.test(t), "geral: o aviso do lote não fala mais das folhas e do livro");
  ok(/O cadastro do lote da gráfica ainda vai ser construído/.test(t) && !/incremento/i.test(t), "geral: o aviso do lote sem a palavra da construção (\"incremento\")", t.slice(t.indexOf("O cadastro"), t.indexOf("O cadastro") + 120));
  await fechar(s, "livro geral notebook");

  // a área: o aviso e os blocos agora, sem formulário
  s = await abrir("area", "notebook");
  await clicar(s.page, "Livro de entrada e saída");
  await espera(300);
  t = await textoTela(s.page);
  ok(t.includes("Entrada e saída de blocos quem registra é a Tesouraria Geral. A área é só intermediária: o bloco nunca fica com a área."), "área: o aviso");
  ok(/Blocos da área agora em uso 9 esperando 2 a devolver 1/.test(t), "área: os blocos da área agora (em uso, esperando, a devolver)", t.slice(t.indexOf("Blocos da área"), t.indexOf("Blocos da área") + 80));
  ok(!t.includes("Registrar entrada") && !t.includes("Primeira folha do bloco"), "área: sem os botões nem o formulário");
  ok(pedidos(s.api, "/api/financeiro/blocos/rastreio").length === 0, "área: nunca pede o rastreio");
  ok(t.includes("Saída: bloco 1.402 entregue a Rute Santos (Vila Nova)"), "área: o livro das suas congregações");
  await fechar(s, "livro área notebook");

  s = await abrir("local", "notebook");
  await clicar(s.page, "Livro de entrada e saída");
  await espera(300);
  t = await textoTela(s.page);
  ok(t.includes("Entrada e saída de blocos quem registra é a Tesouraria Geral. Para pedir um bloco novo, fale com a Tesouraria Geral; a entrega fica registrada aqui."), "local: o aviso");
  ok(/Seus blocos agora em uso 1 esperando 1/.test(t) && !/a devolver/.test(t), "local: seus blocos agora (em uso, esperando)", t.slice(t.indexOf("Seus blocos"), t.indexOf("Seus blocos") + 60));
  ok(t.includes("1 a 5 de 37 registros"), "local: as páginas do livro");
  ok(t.includes("10/11 Entrada: bloco 1.360 devolvido por Lia Fontes recebeu João da Silva · completo: 49 lançadas, 1 cancelada"), "local: a entrada diz quem trouxe, não a própria congregação (r30)",
    t.slice(t.indexOf("O livro"), t.indexOf("O livro") + 400));
  ok(t.includes("15/10 Entrada parcial: bloco 1.288 devolvido por Rute Santos recebeu João da Silva · 35 usadas · as 15 em branco ficaram na Tesouraria Geral"),
    "local: a entrada parcial: as em branco ficaram na Tesouraria Geral (r30)", t.slice(t.indexOf("O livro"), t.indexOf("O livro") + 700));
  ok(t.includes("17/11 Saída: bloco 1.402 entregue a Rute Santos (Vila Nova) registrou João da Silva · Tesouraria Geral"),
    "local: a linha da saída com o nome da congregação, como a 1ª linha do aprovado (portão da parte 2, M6)", t.slice(t.indexOf("O livro"), t.indexOf("O livro") + 300));
  await fechar(s, "livro local notebook");

  // o celular: a Geral com os dois botões (o formulário só ao tocar); a congregação com o aviso
  s = await abrir("geral", "celular");
  const c0 = pedidos(s.api, "/api/financeiro/blocos/livro").length;
  await clicar(s.page, "Livro de entrada e saída");
  const c1 = await esperarPedido(s.api, "/api/financeiro/blocos/livro", "GET", c0);
  ok(c1 && c1.busca.porPagina === "3", "celular: o livro em páginas de 3", c1 && c1.busca);
  await calmo(s.page);
  t = await textoTela(s.page);
  ok(t.includes("Registrar entrada") && t.includes("Registrar saída") && !t.includes("Primeira folha do bloco"), "celular: os dois botões, sem o formulário aberto");
  await clicar(s.page, "Registrar entrada");
  ok((await textoTela(s.page)).includes("Primeira folha do bloco"), "celular: tocar em \"Registrar entrada\" abre o formulário");
  await fechar(s, "livro geral celular");

  // revisão de fora (E2): no celular, na página 5 (os registros 13 e 14, páginas de 3); a tela alarga (o aparelho virou) e as páginas passam a 5:
  // a página 5 já não existe, e a tela volta para a última (a 3, os registros 11 a 14) em vez de mostrar o livro vazio
  s = await abrir("local", "celular", { livroCurto: true });
  await clicar(s.page, "Livro de entrada e saída");
  await calmo(s.page);
  for (let i = 0; i < 4; i++) {
    const n = pedidos(s.api, "/api/financeiro/blocos/livro").length;
    await s.page.evaluate(() => { const b = document.querySelector("#financeiroRaiz button[aria-label='Próxima página']"); if (b) b.click(); });
    await esperarPedido(s.api, "/api/financeiro/blocos/livro", "GET", n);
    await calmo(s.page);
  }
  t = await textoTela(s.page);
  ok(t.includes("13 a 14 de 14 registros"), "livro curto celular: na página 5 (páginas de 3)", t.slice(t.indexOf(" de 14") - 20, t.indexOf(" de 14") + 20));
  const v0 = pedidos(s.api, "/api/financeiro/blocos/livro").length;
  await s.page.setViewport({ width: 1280, height: 800, isMobile: true, hasTouch: true });
  const fim0 = Date.now() + 4000;
  while (Date.now() < fim0 && !(pedidos(s.api, "/api/financeiro/blocos/livro").slice(v0).some((p) => p.busca.pagina === "3"))) await espera(50);
  await calmo(s.page);
  const virou = pedidos(s.api, "/api/financeiro/blocos/livro").slice(v0).map((p) => `${p.busca.pagina || "1"}/${p.busca.porPagina}`);
  ok(virou[0] === "5/5" && virou[virou.length - 1] === "3/5", "livro curto: alargou, pediu a página 5 em páginas de 5 e voltou para a última (a 3)", virou);
  t = await textoTela(s.page);
  ok(t.includes("11 a 14 de 14 registros") && !t.includes("nenhum registro"), "livro curto: mostra a última página (11 a 14), não o livro vazio", t.slice(Math.max(0, t.indexOf(" de 14") - 20), t.indexOf(" de 14") + 20));
  await fechar(s, "livro curto celular que alarga");

  s = await abrir("local", "celular");
  await clicar(s.page, "Livro de entrada e saída");
  await espera(300);
  t = await textoTela(s.page);
  ok(t.includes("Entrada e saída de blocos quem registra é a Tesouraria Geral. Para pedir um bloco novo, fale com a Tesouraria Geral; a entrega fica registrada aqui."),
    "celular local: o aviso aprovado, o mesmo do notebook (r30)", t.slice(0, 400));
  ok(!t.includes("Aqui você vê o livro da sua congregação"), "celular local: sai o aviso antigo");
  await fechar(s, "livro local celular");

  s = await abrir("area", "celular");
  await clicar(s.page, "Livro de entrada e saída");
  await espera(300);
  t = await textoTela(s.page);
  ok(t.includes("Entrada e saída de blocos quem registra é a Tesouraria Geral. A área é só intermediária: o bloco nunca fica com a área."), "celular área: o aviso aprovado (r30)", t.slice(0, 400));
  await fechar(s, "livro área celular");
}

// ---- a saída (r30-blocos-saida): a Tesouraria Geral entrega um bloco a uma congregação ----
const dataDe = (page, rotulo) => page.evaluate((rotulo) => {
  const l = [...document.querySelectorAll("#financeiroRaiz label")].find((x) => x.textContent.replace(/\s+/g, " ").trim().startsWith(rotulo) && x.offsetParent !== null);
  const i = l && (l.control || l.querySelector("input"));
  return i ? i.value : null;
}, rotulo);
async function definirData(page, rotulo, iso) {
  const feito = await page.evaluate((rotulo, iso) => {
    const l = [...document.querySelectorAll("#financeiroRaiz label")].find((x) => x.textContent.replace(/\s+/g, " ").trim().startsWith(rotulo) && x.offsetParent !== null);
    const i = l && (l.control || l.querySelector("input"));
    if (!i) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, iso);
    i.dispatchEvent(new Event("input", { bubbles: true }));
    i.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, rotulo, iso);
  await calmo(page);
  return feito;
}
const chave = (page) => page.evaluate(() => { const b = document.querySelector("#financeiroRaiz [role=switch]"); return b ? { ligada: b.getAttribute("aria-checked"), texto: b.textContent.replace(/\s+/g, " ").trim() } : null; });
async function virarChave(page) { await page.evaluate(() => document.querySelector("#financeiroRaiz [role=switch]").click()); await calmo(page); }
const classeDoBotao = (page, texto) => page.evaluate((texto) => { const b = [...document.querySelectorAll("#financeiroRaiz button")].find((x) => x.textContent.replace(/\s+/g, " ").trim() === texto && x.offsetParent !== null); return b ? b.className : null; }, texto);
const caixaSaida = (page) => page.evaluate(() => { const c = document.querySelector("#financeiroRaiz .caixa-bloco"); return c ? { texto: c.innerText.replace(/\s+/g, " ").trim(), erro: c.classList.contains("erro") } : null; });
async function folhaDaSaida(page, api, texto) {
  const antes = pedidos(api, "/api/financeiro/blocos/rastreio").length;
  await digitar(page, "Primeira folha do bloco", texto);
  const r = await esperarPedido(api, "/api/financeiro/blocos/rastreio", "GET", antes);
  await calmo(page);
  return r;
}
// as listas vazias da r30 ("r30-blocos-vazios"): cada nível com o seu texto, o nome da área e da congregação vindos de quem está vendo
async function provarVazios() {
  const tem = (t, frase) => t.includes(frase);
  // a Geral no notebook, antes do primeiro lote: a aba Blocos, as Folhas (com o caminho para o livro) e o livro
  let s = await abrir("geral", "notebook", { vazio: true });
  let t = await textoTela(s.page);
  ok(tem(t, "Nenhum bloco ainda. Os blocos aparecem quando o lote da gráfica chega. Comece em “Cadastrar lote da gráfica”."), "geral: a aba Blocos antes do primeiro lote", t.slice(0, 400));
  ok(!tem(t, "0 blocos") && !tem(t, "Congregação Situação"), "geral: sem a tabela e sem as páginas vazias", t.slice(0, 400));
  ok(tem(t, "Nenhum lote da gráfica cadastrado ainda. Use o botão “Cadastrar lote da gráfica”, no alto."), "geral: o quadro do lote aponta para o botão");
  // o botão do lote dourado, como na r30 (o desenho mais novo vale; decisão de 26/11)
  const botaoLote = await s.page.evaluate(() => {
    const b = [...document.querySelectorAll("#financeiroRaiz button")].find((x) => x.textContent.trim() === "Cadastrar lote da gráfica");
    if (!b) return null;
    const cs = getComputedStyle(b);
    return { fundo: cs.backgroundColor, cor: cs.color, alt: Math.round(b.getBoundingClientRect().height) };
  });
  ok(botaoLote && botaoLote.fundo === "rgb(255, 184, 0)" && botaoLote.cor === "rgb(10, 35, 66)" && botaoLote.alt === 40, "geral: o botão do lote dourado, de 40 px (r30)", botaoLote);
  // a pílula sem bloco (texto dado em 26/11, "para conferir")
  const v0 = pedidos(s.api, "/api/financeiro/blocos").length;
  await clicar(s.page, "Em uso");
  await esperarPedido(s.api, "/api/financeiro/blocos", "GET", v0, 3000);
  await calmo(s.page);
  t = await textoTela(s.page);
  ok(tem(t, "Nenhum bloco nesta situação.") && !tem(t, "Nenhum bloco ainda") && !tem(t, "Nenhum bloco com essa procura"), "geral: a pílula sem bloco", t.slice(0, 400));
  await clicar(s.page, "Todos");
  await calmo(s.page);
  await clicar(s.page, "Folhas do bloco");
  t = await textoTela(s.page);
  ok(tem(t, "Nenhum bloco saiu para as congregações ainda. Para entregar um bloco, use “Registrar saída”, no livro de entrada e saída."), "geral: as folhas sem bloco", t.slice(0, 400));
  const l0 = pedidos(s.api, "/api/financeiro/blocos/livro").length;
  ok(await clicar(s.page, "Ir ao livro de entrada e saída"), "geral: o botão que leva ao livro");
  ok(await esperarPedido(s.api, "/api/financeiro/blocos/livro", "GET", l0), "geral: o botão abre o livro");
  await calmo(s.page);
  t = await textoTela(s.page);
  ok(tem(t, "O livro ainda está vazio. O primeiro registro aparece quando a Tesouraria Geral cadastra o lote da gráfica, na aba Blocos."), "geral: o livro vazio", t.slice(0, 600));
  ok(!tem(t, "nenhum registro"), "geral: o livro vazio sem as páginas");
  await fechar(s, "vazios geral notebook");
  // a Geral no celular: a frase não aponta para o botão (o celular não tem o cadastro do lote)
  s = await abrir("geral", "celular", { vazio: true });
  t = await textoTela(s.page);
  ok(tem(t, "Nenhum bloco ainda. Os blocos aparecem quando o lote da gráfica chega.") && !tem(t, "Comece em") && !tem(t, "nenhum bloco"), "geral celular: a aba Blocos vazia", t.slice(0, 400));
  // a procura no celular, entre as abas e as pílulas (r30; decisão de 26/11)
  const ordem = await s.page.evaluate(() => {
    const i = [...document.querySelectorAll("#financeiroRaiz input[type=search]")].find((x) => x.offsetParent !== null);
    const p = [...document.querySelectorAll("#financeiroRaiz .pilulas button")].find((x) => x.textContent.trim() === "Todos");
    if (!i || !p) return null;
    const ri = i.closest("label").getBoundingClientRect();
    return { busca: Math.round(ri.top), pilulas: Math.round(p.getBoundingClientRect().top), larg: Math.round(ri.width), alt: Math.round(ri.height) };
  });
  ok(ordem && ordem.busca < ordem.pilulas && ordem.larg >= 356 && ordem.alt >= 40, "geral celular: a procura largura inteira, acima das pílulas", ordem);
  const c0 = pedidos(s.api, "/api/financeiro/blocos").length;
  await digitar(s.page, "Procurar pelo número", "99.999");
  ok(await esperarPedido(s.api, "/api/financeiro/blocos", "GET", c0, 3000), "geral celular: a procura pede a lista");
  await calmo(s.page);
  t = await textoTela(s.page);
  ok(tem(t, "Nenhum bloco tem o número 99.999. Confira o número do bloco ou da folha."), "geral celular: a procura sem resultado", t.slice(0, 400));
  await fechar(s, "vazios geral celular");
  // a área: o nome dela, sem o botão do livro; o quadro do lote sem apontar para o botão que ela não tem
  s = await abrir("area", "notebook", { vazio: true });
  t = await textoTela(s.page);
  ok(tem(t, "Nenhum lote da gráfica cadastrado ainda.") && !tem(t, "Use o botão"), "área: o quadro do lote sem o botão");
  ok(tem(t, "Nenhum bloco com as congregações da área.") && !tem(t, "Nenhum bloco com essa procura"), "área: a aba Blocos sem bloco", t.slice(0, 400));
  await clicar(s.page, "Folhas do bloco");
  t = await textoTela(s.page);
  ok(tem(t, "Nenhuma congregação da Área 2 está com bloco agora. Os blocos saem da Tesouraria Geral. Quando um chegar a uma congregação da área, as folhas dele aparecem aqui."),
    "área: as folhas sem bloco", t.slice(0, 400));
  ok(!tem(t, "Ir ao livro"), "área: sem o botão do livro");
  await clicar(s.page, "Livro de entrada e saída");
  t = await textoTela(s.page);
  ok(tem(t, "Nenhum bloco saiu para as congregações da Área 2 ainda. Quando a Tesouraria Geral entregar um bloco a uma delas, a saída fica registrada aqui."), "área: o livro vazio", t.slice(0, 600));
  await fechar(s, "vazios área notebook");
  // a congregação no celular
  s = await abrir("local", "celular", { vazio: true });
  t = await textoTela(s.page);
  ok(tem(t, "Nenhum bloco com a sua congregação.") && !tem(t, "Nenhum bloco com essa procura"), "local celular: a aba Blocos sem bloco", t.slice(0, 400));
  await clicar(s.page, "Folhas do bloco");
  t = await textoTela(s.page);
  ok(tem(t, "Vila Nova está sem bloco de recibo agora. Para receber um bloco, fale com a Tesouraria Geral. Quando ele chegar, as folhas aparecem aqui."), "local celular: as folhas sem bloco", t.slice(0, 400));
  await clicar(s.page, "Livro de entrada e saída");
  t = await textoTela(s.page);
  ok(tem(t, "Nenhum bloco saiu para Vila Nova ainda. Quando a Tesouraria Geral entregar um bloco a vocês, a saída fica registrada aqui."), "local celular: o livro vazio", t.slice(0, 600));
  await fechar(s, "vazios local celular");
  // a congregação Sede não se confunde com a Sede administrativa (regra dele, 17/11)
  s = await abrir("local", "notebook", { vazio: true, escopo: { geral: false, congregacoes: 1, area: "Área 1", congregacao: "Sede" } });
  await clicar(s.page, "Folhas do bloco");
  ok(tem(await textoTela(s.page), "A congregação Sede está sem bloco de recibo agora."), "local: a congregação Sede nas folhas");
  await clicar(s.page, "Livro de entrada e saída");
  ok(tem(await textoTela(s.page), "Nenhum bloco saiu para a congregação Sede ainda."), "local: a congregação Sede no livro");
  await fechar(s, "vazios Sede");
  // a procura sem resultado, no lugar da tabela
  s = await abrir("geral", "notebook");
  const b0 = pedidos(s.api, "/api/financeiro/blocos").length;
  await digitar(s.page, "Procurar pelo número", "99.999");
  ok(await esperarPedido(s.api, "/api/financeiro/blocos", "GET", b0, 3000), "geral: a procura pede a lista");
  await calmo(s.page);
  t = await textoTela(s.page);
  ok(tem(t, "Nenhum bloco tem o número 99.999. Confira o número do bloco ou da folha.") && !tem(t, "Nenhum bloco com essa procura"), "geral: a procura sem resultado (r30)", t.slice(0, 500));
  // com uma pílula, o bloco pode existir em outra situação: a frase da r30 ("Nenhum bloco tem o número") seria falsa
  const b1 = pedidos(s.api, "/api/financeiro/blocos").length;
  await clicar(s.page, "Fechado");
  await esperarPedido(s.api, "/api/financeiro/blocos", "GET", b1, 3000);
  const b2 = pedidos(s.api, "/api/financeiro/blocos").length;
  await digitar(s.page, "Procurar pelo número", "1.401");
  await esperarPedido(s.api, "/api/financeiro/blocos", "GET", b2, 3000);
  await calmo(s.page);
  t = await textoTela(s.page);
  ok(!tem(t, "Nenhum bloco tem o número") && tem(t, "Nenhum bloco nesta situação com esse número.") && !tem(t, "Nenhum bloco com essa procura"),
    "geral: a pílula com a procura não diz que o número não existe", t.slice(0, 500));
  await fechar(s, "procura sem resultado");
  // o livro no celular: até 3 números de página (o desenho da r30)
  s = await abrir("geral", "celular");
  await clicar(s.page, "Livro de entrada e saída");
  const nums = await s.page.evaluate(() => [...document.querySelectorAll("#financeiroRaiz nav.paginas button")].filter((b) => /^\d+$/.test(b.textContent.trim())).map((b) => b.textContent.trim()));
  ok(JSON.stringify(nums) === JSON.stringify(["1", "2", "3"]), "geral celular: o livro com 3 números de página", nums);
  await fechar(s, "livro celular páginas");
}

// o aviso (toast) das telas novas: embaixo, no meio do conteúdo, verde-água com o ✓ (o "r30Toast" do desenho; decisão de 26/11, peça comum de
// Membros e Finanças). Fora das telas novas, o aviso continua no alto, à direita, como no resto do sistema
async function provarAviso() {
  const medir = (page) => page.evaluate(() => {
    const c = document.getElementById("toastContainer");
    const ts = [...c.querySelectorAll(".toast")];
    const t = ts[ts.length - 1];
    if (!t) return null;
    const r = t.getBoundingClientRect(), sb = document.querySelector(".sidebar").getBoundingClientRect(), cs = getComputedStyle(t);
    return {
      embaixo: c.classList.contains("toast-embaixo"), esq: Math.round(r.left), dir: Math.round(r.right), topo: Math.round(r.top), baixo: Math.round(innerHeight - r.bottom),
      meio: Math.round((r.left + r.right) / 2), meioConteudo: Math.round(innerWidth > 640 ? (sb.right + innerWidth) / 2 : innerWidth / 2), larg: innerWidth,
      fundo: cs.backgroundColor, cor: cs.color, letra: cs.fontSize, icone: !!t.querySelector("svg"), texto: t.textContent
    };
  });
  // um aviso de cada vez (os anteriores ficam 4,2 s e empurrariam a medida)
  const limpar = (page) => page.evaluate(() => document.querySelectorAll("#toastContainer .toast").forEach((t) => t.remove()));
  const aviso = async (page, contexto, texto, tipo) => {
    await limpar(page);
    await page.evaluate((c, x, t) => ponteSvelteCasca(c).avisar(x, t), contexto, texto, tipo);
    await espera(400);   // a entrada (sobe 8 px) termina
    return medir(page);
  };
  const FEITO = "Bloco 1.403 entregue a Vila Nova. Está no livro.";
  // Finanças no notebook
  let s = await abrir("geral", "notebook");
  let m = await aviso(s.page, "financeiro", FEITO, "sucesso");
  ok(m && m.embaixo && Math.abs(m.meio - m.meioConteudo) <= 2 && Math.abs(m.baixo - 20) <= 2, "notebook: o aviso embaixo, no meio do conteúdo", m);
  ok(m && m.fundo === "rgb(15, 118, 110)" && m.cor === "rgb(255, 255, 255)" && m.letra === "13.5px" && m.icone && m.texto === FEITO, "notebook: verde-água, letra branca, o ✓ e o texto inteiro", m);
  m = await aviso(s.page, "financeiro", "Falha simulada.", "erro");
  ok(m && m.embaixo && m.fundo === "rgb(185, 28, 28)" && m.icone && m.texto === "Falha simulada.", "notebook: o aviso de erro em vermelho, no mesmo lugar", m);
  // com o menu recolhido, o meio do conteúdo muda
  await s.page.evaluate(() => ponteSvelteCasca("financeiro").menuRecolhido(true));
  m = await aviso(s.page, "financeiro", FEITO, "sucesso");
  ok(m && Math.abs(m.meio - m.meioConteudo) <= 2, "notebook: com o menu recolhido, no meio do conteúdo", m);
  await s.page.evaluate(() => ponteSvelteCasca("financeiro").menuRecolhido(null));
  // fora das telas novas: no alto, à direita, sem mudança
  await s.page.evaluate(() => sairDoModulo());
  await calmo(s.page);
  await limpar(s.page);
  await s.page.evaluate(() => mostrarToast("Fora das telas novas.", "sucesso"));
  await espera(400);
  m = await medir(s.page);
  ok(m && !m.embaixo && m.topo < 40 && m.dir > m.larg - 40 && !m.icone && m.texto === "Fora das telas novas.", "fora das telas novas: o aviso no alto, à direita, como antes", m);
  // Membros: a mesma peça
  await s.page.evaluate(() => entrarModulo("membresia"));
  const montou = await s.page.waitForFunction(() => typeof membrosSvelteMontado !== "undefined" && membrosSvelteMontado === true, { timeout: 10000 }).then(() => true, () => false);
  ok(montou, "Membros: as telas novas montaram");
  m = await aviso(s.page, "membresia", "Cadastro salvo.", "sucesso");
  ok(m && m.embaixo && Math.abs(m.meio - m.meioConteudo) <= 2 && Math.abs(m.baixo - 20) <= 2 && m.fundo === "rgb(15, 118, 110)" && m.icone, "Membros: o aviso embaixo, no meio, verde-água", m);
  await s.ctx.close();
  // o celular: 16 px de cada lado, como o aprovado (portão da parte 2, M5), logo acima da barra do telefone
  s = await abrir("local", "celular");
  m = await aviso(s.page, "financeiro", FEITO, "sucesso");
  ok(m && m.embaixo && Math.abs(m.esq - 16) <= 1 && Math.abs(m.larg - m.dir - 16) <= 1 && Math.abs(m.baixo - 20) <= 2 && m.letra === "13px", "celular: o aviso embaixo, 16 px de cada lado (M5)", m);
  await fechar(s, "aviso celular");
}

async function provarSaida() {
  let s = await abrir("geral", "notebook");
  let { page, api } = s;
  await clicar(page, "Livro de entrada e saída");
  await calmo(page);
  ok(/\bouro\b/.test(await classeDoBotao(page, "Registrar entrada")) && /linha-botao/.test(await classeDoBotao(page, "Registrar saída")), "geral: a entrada é a dourada antes de escolher");
  const ps0 = pedidos(api, "/api/financeiro/blocos/para-saida").length;
  ok(await clicar(page, "Registrar saída"), "geral: o botão \"Registrar saída\"");
  const ps1 = await esperarPedido(api, "/api/financeiro/blocos/para-saida", "GET", ps0);
  ok(ps1 && !ps1.busca.congregacaoId, "geral: pede as congregações ativas", ps1 && ps1.busca);
  await calmo(page);
  let t = await textoTela(page);
  ok(/\bouro\b/.test(await classeDoBotao(page, "Registrar saída")) && /linha-botao/.test(await classeDoBotao(page, "Registrar entrada")), "geral: com a saída aberta, a saída é a dourada (r30Botoes)");
  ok(t.includes("Registrar saída o bloco vai para uma congregação"), "geral: o quadro \"Registrar saída\" com a nota", t.slice(0, 600));
  ok(t.includes("Congregação* · só as ativas") && t.includes("Data da entrega*") && t.includes("Entregue a* · a liderança dela ou outra pessoa"), "geral: os rótulos do notebook", t.slice(0, 900));
  ok(t.includes("Entregue por João da Silva · Tesouraria Geral (quem está entrando)"), "geral: \"Entregue por\" é quem está entrando");
  const ops = await opcoesDe(page, "Congregação");
  ok(ops && JSON.stringify(ops) === JSON.stringify(["Escolha", "Vila Nova", "Monte Sião", "Cidade Jardim", `Nova Vida ${ATAQUE}`]), "geral: a lista só com as ativas (o nome vai como texto)", ops);
  ok(JSON.stringify(await opcoesDe(page, "Entregue a")) === JSON.stringify(["primeiro, a congregação"]), "geral: \"Entregue a\" espera a congregação", await opcoesDe(page, "Entregue a"));
  let ch = await chave(page);
  ok(ch && ch.ligada === "false" && ch.texto === "Levado pela área Marque se a área da congregação vai levar o bloco.", "geral: \"Levado pela área\" desligado, a frase sem congregação", ch);
  ok((await dataDe(page, "Data da entrega")) === hojeBrasilia(), "geral: a data já vem com hoje", await dataDe(page, "Data da entrega"));
  ok(await classeDoBotao(page, "Registrar a saída") !== null, "geral: o botão \"Registrar a saída\" (dourado, mesmo vazio)");
  // o que o sistema confere antes de gravar, cada mensagem embaixo do seu campo
  const e0 = pedidos(api, "/api/financeiro/blocos/entregar", "POST").length;
  await clicar(page, "Registrar a saída");
  t = await textoTela(page);
  ok(t.includes("Informe a primeira folha do bloco.") && t.includes("Escolha a congregação.") && t.includes("Escolha quem recebeu o bloco."), "geral: vazio, as três mensagens", t.slice(0, 900));
  ok(pedidos(api, "/api/financeiro/blocos/entregar", "POST").length === e0, "geral: vazio não grava");
  const r1 = await folhaDaSaida(page, api, "70.160");
  ok(r1 && r1.busca.folha === "70160", "geral: qualquer folha do bloco puxa o bloco (o rastreio, só com os números)", r1 && r1.busca);
  let cx = await caixaSaida(page);
  ok(cx && !cx.erro && cx.texto === "Bloco 1.403 (veio sozinho): folhas 70.151 a 70.200 · chegou em 05/02/2026 · está na Tesouraria Geral", "geral: a caixa do bloco (verde-água)", cx);
  ok(!(await textoTela(page)).includes("Informe a primeira folha do bloco."), "geral: a mensagem da folha some quando a pessoa digita");
  const pc0 = pedidos(api, "/api/financeiro/blocos/para-saida").length;
  ok(await escolher(page, "Congregação", "Vila Nova"), "geral: escolher Vila Nova");
  const pc1 = await esperarPedido(api, "/api/financeiro/blocos/para-saida", "GET", pc0);
  ok(pc1 && pc1.busca.congregacaoId === "2", "geral: pede a liderança de Vila Nova", pc1 && pc1.busca);
  await calmo(page);
  const opsP = await opcoesDe(page, "Entregue a");
  ok(opsP && JSON.stringify(opsP) === JSON.stringify(["Escolha quem recebe o bloco", "Rute Santos · tesoureira de Vila Nova", "Paulo Reis · dirigente de Vila Nova", "Outra pessoa (escrever o nome)"]),
    "geral: \"Entregue a\" com a liderança de Vila Nova e \"Outra pessoa\"", opsP);
  ch = await chave(page);
  ok(ch && ch.texto === "Levado pela área Marque se a Área 2 vai levar o bloco até Vila Nova.", "geral: a frase com a área e a congregação", ch);
  await definirData(page, "Data da entrega", "2026-01-25");
  await escolher(page, "Entregue a", "Rute Santos · tesoureira de Vila Nova");
  await clicar(page, "Registrar a saída");
  t = await textoTela(page);
  ok(t.includes("Antes da chegada do bloco (05/02/2026).") && pedidos(api, "/api/financeiro/blocos/entregar", "POST").length === e0, "geral: a data antes da chegada (o 11 virou 01)", t.slice(0, 900));
  ok(await page.evaluate(() => { const i = [...document.querySelectorAll("#financeiroRaiz input[type=date]")].find((x) => x.offsetParent !== null); return !!i && i.getAttribute("aria-invalid") === "true"; }), "geral: o campo da data fica marcado");
  await definirData(page, "Data da entrega", "2099-01-02");
  await clicar(page, "Registrar a saída");
  ok((await textoTela(page)).includes("Depois de hoje: confira a data."), "geral: a data depois de hoje");
  await definirData(page, "Data da entrega", hojeBrasilia());
  const lv = pedidos(api, "/api/financeiro/blocos/livro").length;
  await clicar(page, "Registrar a saída");
  const ent = await esperarPedido(api, "/api/financeiro/blocos/entregar", "POST", e0);
  ok(ent && JSON.stringify(ent.corpo) === JSON.stringify({ primeiraFolha: 70151, folha: 70160, congregacaoId: 2, pessoa: { membroId: 101 }, levadoPelaArea: false, data: hojeBrasilia() }),
    "geral: a saída vai pela PRIMEIRA folha do bloco, com a pessoa do cadastro, sem a área e a data", ent && ent.corpo);
  const relido = await esperarPedido(api, "/api/financeiro/blocos/livro", "GET", lv);
  ok(relido && (!relido.busca.pagina || relido.busca.pagina === "1"), "geral: o livro volta à 1ª página", relido && relido.busca);
  await calmo(page);
  ok((await ultimoAviso(page)) === "Bloco 1.403 entregue a Vila Nova. Está no livro.", "geral: a confirmação da r30", await ultimoAviso(page));
  t = await textoTela(page);
  ok(t.includes(`${hojeBrasilia().slice(8, 10)}/${hojeBrasilia().slice(5, 7)} Saída: bloco 1.403 entregue a Rute Santos (Vila Nova) registrou João da Silva · Tesouraria Geral`), "geral: a linha nova no alto do livro", t.slice(t.indexOf("O livro"), t.indexOf("O livro") + 300));
  ok(t.includes("o bloco vai para uma congregação") && !(await caixaSaida(page)) && (await dataDe(page, "Data da entrega")) === hojeBrasilia()
    && (await page.evaluate(() => { const i = [...document.querySelectorAll("#financeiroRaiz input")].find((x) => x.offsetParent !== null && x.inputMode === "numeric"); return i ? i.value : null; })) === "",
    "geral: o formulário fica aberto e limpo, com a data de hoje (para o próximo bloco)");
  ok(JSON.stringify(await opcoesDe(page, "Entregue a")) === JSON.stringify(["primeiro, a congregação"]), "geral: \"Entregue a\" volta a esperar a congregação");
  // levado pela área e a corrida (o mesmo bloco, um instante depois)
  await folhaDaSaida(page, api, "70151");
  await escolher(page, "Congregação", "Monte Sião");
  await espera(300);
  await escolher(page, "Entregue a", "Ezequiel Ramos · dirigente de Monte Sião");
  await virarChave(page);
  ch = await chave(page);
  ok(ch && ch.ligada === "true" && ch.texto === "Levado pela área A Área 2 leva até Monte Sião; o bloco não fica com ela.", "geral: \"Levado pela área\" ligado: o bloco não fica com a área", ch);
  const e1 = pedidos(api, "/api/financeiro/blocos/entregar", "POST").length;
  await clicar(page, "Registrar a saída");
  const ent2 = await esperarPedido(api, "/api/financeiro/blocos/entregar", "POST", e1);
  ok(ent2 && ent2.corpo.levadoPelaArea === true && JSON.stringify(ent2.corpo.pessoa) === JSON.stringify({ membroId: 401 }) && ent2.corpo.congregacaoId === 4, "geral: vai a marca \"levado pela área\" e a pessoa de Monte Sião", ent2 && ent2.corpo);
  await calmo(page);
  ok((await ultimoAviso(page)) === "Este bloco acabou de sair por outra pessoa. Confira o livro.", "geral: a corrida: a mensagem do servidor (409)", await ultimoAviso(page));
  ok(!!(await caixaSaida(page)), "geral: a recusa não limpa o formulário");
  // outra pessoa
  await escolher(page, "Entregue a", "outra");
  ok(await campo(page, "Nome de quem recebeu").then((h) => !!h.asElement()), "geral: \"Outra pessoa\" abre o campo do nome");
  const e2 = pedidos(api, "/api/financeiro/blocos/entregar", "POST").length;
  await clicar(page, "Registrar a saída");
  ok((await textoTela(page)).includes("Escreva o nome de quem recebeu o bloco.") && pedidos(api, "/api/financeiro/blocos/entregar", "POST").length === e2, "geral: sem o nome, a mensagem e nada grava");
  // a caixa em vermelho: o que não pode sair
  for (const [folhaT, msg, desc] of [["70101", "O bloco 1.402 ainda não chegou da gráfica.", "o que não chegou"], ["68010", "O bloco 1.360 já saiu: está com Bela Vista desde 08/09/2026.", "o que já saiu"],
    ["67001", "O bloco 1.340 voltou completo em 02/10/2026: não tem folha livre para sair.", "o que voltou completo"], ["5", "Nenhum bloco tem a folha 5.", "a folha que nenhum bloco tem"]]) {
    await folhaDaSaida(page, api, folhaT);
    cx = await caixaSaida(page);
    ok(cx && cx.erro && cx.texto === msg, `geral: a caixa em vermelho: ${desc}`, cx);
    const n = pedidos(api, "/api/financeiro/blocos/entregar", "POST").length;
    await clicar(page, "Registrar a saída");
    ok(pedidos(api, "/api/financeiro/blocos/entregar", "POST").length === n, `geral: ${desc} não grava`);
  }
  // o bloco que voltou parcial: saem só as livres, pela primeira livre
  await folhaDaSaida(page, api, "64.401");
  cx = await caixaSaida(page);
  ok(cx && !cx.erro && cx.texto === "Bloco 1.288, parcial (veio sozinho): saem só as 15 livres, 64.436 a 64.450 (36ª a 50ª) · voltou de Vila Nova em 01/10 · está na Tesouraria Geral. As 35 usadas ficam no histórico, com Vila Nova.",
    "geral: a caixa do bloco parcial", cx);
  await escolher(page, "Congregação", "Cidade Jardim");
  await espera(300);
  await escolher(page, "Entregue a", "Davi Moura · tesoureiro de Cidade Jardim");
  if ((await chave(page)).ligada === "true") await virarChave(page);
  await definirData(page, "Data da entrega", "2026-09-25");
  const e3 = pedidos(api, "/api/financeiro/blocos/entregar", "POST").length;
  await clicar(page, "Registrar a saída");
  ok((await textoTela(page)).includes("Antes da volta do bloco (01/10/2026).") && pedidos(api, "/api/financeiro/blocos/entregar", "POST").length === e3, "geral: no parcial, a data não vem antes da volta");
  await definirData(page, "Data da entrega", hojeBrasilia());
  await clicar(page, "Registrar a saída");
  const ent3 = await esperarPedido(api, "/api/financeiro/blocos/entregar", "POST", e3);
  ok(ent3 && ent3.corpo.primeiraFolha === 64436 && ent3.corpo.congregacaoId === 6, "geral: o parcial sai pela primeira livre (64.436), não pela digitada", ent3 && ent3.corpo);
  await calmo(page);
  ok((await ultimoAviso(page)) === "Bloco 1.288 (64.436 a 64.450) entregue a Cidade Jardim. Está no livro.", "geral: a confirmação do parcial diz as folhas", await ultimoAviso(page));
  t = await textoTela(page);
  ok(t.includes("Saída: bloco 1.288, parcial, entregue a Davi Moura (Cidade Jardim) só as folhas 64.436 a 64.450 (36ª a 50ª) · registrou João da Silva"), "geral: a linha do livro da saída parcial", t.slice(t.indexOf("O livro"), t.indexOf("O livro") + 300));
  await fechar(s, "saída geral notebook");

  // da aba Folhas: o bloco parcial na Geral abre a saída já com ele
  s = await abrir("geral", "notebook");
  ({ page, api } = s);
  await clicar(page, "Folhas do bloco");
  await abrirSeletor(page);
  await escolherNoSeletor(page, "Bloco 1.288");
  const rs0 = pedidos(api, "/api/financeiro/blocos/rastreio").length;
  ok(await clicar(page, "Registrar saída"), "estoque: o botão \"Registrar saída\" do bloco parcial");
  const rs1 = await esperarPedido(api, "/api/financeiro/blocos/rastreio", "GET", rs0);
  ok(rs1 && rs1.busca.folha === "64436", "estoque: o livro abre a saída já com a primeira livre", rs1 && rs1.busca);
  await calmo(page);
  cx = await caixaSaida(page);
  ok(cx && /^Bloco 1\.288, parcial/.test(cx.texto), "estoque: a caixa do parcial aparece sozinha", cx);
  await fechar(s, "saída estoque notebook");

  // a área e a congregação não registram saída
  for (const nivel of ["area", "local"]) {
    s = await abrir(nivel, "notebook");
    await clicar(s.page, "Livro de entrada e saída");
    await espera(300);
    t = await textoTela(s.page);
    ok(!t.includes("Registrar saída") && pedidos(s.api, "/api/financeiro/blocos/para-saida").length === 0, `${nivel}: sem o formulário da saída e sem pedir as congregações`);
    await fechar(s, `saída ${nivel} notebook`);
  }

  // o celular: o formulário no lugar dos botões e do livro, com o X; depois de registrar, o livro e a saída dourada
  s = await abrir("geral", "celular");
  ({ page, api } = s);
  await clicar(page, "Livro de entrada e saída");
  await calmo(page);
  await clicar(page, "Registrar saída");
  await calmo(page);
  t = await textoTela(page);
  ok(t.includes("Registrar saída") && !t.includes("O livro") && !t.includes("Registrar entrada"), "celular: o formulário fica no lugar dos botões e do livro", t.slice(0, 500));
  ok(t.includes("Congregação*") && !t.includes("só as ativas") && t.includes("Data*") && !t.includes("Data da entrega") && !t.includes("a liderança dela ou outra pessoa"), "celular: os rótulos curtos", t.slice(0, 700));
  ok(t.includes("Entregue por João da Silva (quem está entrando).") && !t.includes("Tesouraria Geral (quem está entrando)"), "celular: \"Entregue por\" é a linha embaixo do botão");
  await folhaDaSaida(page, api, "70151");
  cx = await caixaSaida(page);
  ok(cx && cx.texto === "Bloco 1.403 (veio sozinho): folhas 70.151 a 70.200 · chegou em 05/02/2026 · na Tesouraria Geral", "celular: a caixa curta", cx);
  await escolher(page, "Congregação", "Vila Nova");
  await espera(300);
  ch = await chave(page);
  ok(ch && ch.texto === "Levado pela área Marque se a Área 2 vai levar.", "celular: a frase curta do \"Levado pela área\"", ch);
  await definirData(page, "Data", "2026-01-25");
  await escolher(page, "Entregue a", "Rute Santos · tesoureira de Vila Nova");
  await clicar(page, "Registrar a saída");
  ok((await textoTela(page)).includes("Antes da chegada (05/02/2026)."), "celular: a mensagem curta da data");
  await definirData(page, "Data", hojeBrasilia());
  await clicar(page, "Registrar a saída");
  await calmo(page);
  t = await textoTela(page);
  ok(t.includes("O livro") && t.includes("Registrar entrada") && !t.includes("Primeira folha do bloco"), "celular: depois de registrar, o formulário fecha e o livro volta", t.slice(0, 500));
  ok(/\bouro\b/.test(await classeDoBotao(page, "Registrar saída")), "celular: a saída fica dourada (r30Botoes)");
  ok((await ultimoAviso(page)) === "Bloco 1.403 entregue a Vila Nova. Está no livro.", "celular: a confirmação", await ultimoAviso(page));
  await clicar(page, "Registrar saída");
  ok(await page.evaluate(() => { const b = document.querySelector("#financeiroRaiz button[aria-label=Fechar]"); if (!b) return false; b.click(); return true; }), "celular: o X do formulário");
  await calmo(page);
  t = await textoTela(page);
  ok(t.includes("O livro") && !t.includes("Primeira folha do bloco"), "celular: o X fecha o formulário");
  await clicar(page, "Registrar entrada");
  t = await textoTela(page);
  ok(t.includes("Primeira folha do bloco") && !t.includes("O livro") && await page.evaluate(() => !!document.querySelector("#financeiroRaiz button[aria-label=Fechar]")), "celular: a entrada também fica no lugar do livro, com o X (r30)");
  await fechar(s, "saída geral celular");
}

// ---- o rastreio velho (portão da parte 2, I1): a pessoa troca o número e clica antes de o rastreio do número novo voltar. O botão fica parado até
// o bloco do número digitado chegar; a caixa do bloco anterior some; o que vai ao servidor é o bloco do número digitado, com o número do bloco ----
// troca o número e, no mesmo instante (antes dos 400 ms do rastreio), lê o botão e a caixa e clica
async function trocarEClicar(page, rotulo, texto, botao) {
  const el = (await campo(page, rotulo)).asElement();
  if (!el) return null;
  await el.click();
  await el.evaluate((e) => e.select());
  await el.type(texto);
  return page.evaluate((botao) => {
    const raiz = document.querySelector("#financeiroRaiz");
    const b = [...raiz.querySelectorAll("button")].find((x) => x.textContent.replace(/\s+/g, " ").trim() === botao && x.offsetParent !== null);
    const c = raiz.querySelector(".caixa-bloco");
    const r = { desligado: !!b && b.disabled, caixa: c ? c.innerText.replace(/\s+/g, " ").trim() : null };
    if (b) b.click();
    return r;
  }, botao);
}
async function provarRastreioVelho() {
  // a saída: 70.160 (o 1.403) com Vila Nova e a Rute, troca para 64.436 (o 1.288, as livres do que voltou em parte) e clica na hora
  let s = await abrir("geral", "notebook");
  let { page, api } = s;
  await clicar(page, "Livro de entrada e saída");
  const ps0 = pedidos(api, "/api/financeiro/blocos/para-saida").length;
  await clicar(page, "Registrar saída");
  await esperarPedido(api, "/api/financeiro/blocos/para-saida", "GET", ps0);
  await calmo(page);
  await folhaDaSaida(page, api, "70.160");
  const pc0 = pedidos(api, "/api/financeiro/blocos/para-saida").length;
  await escolher(page, "Congregação", "Vila Nova");
  await esperarPedido(api, "/api/financeiro/blocos/para-saida", "GET", pc0);
  await calmo(page);
  await escolher(page, "Entregue a", "Rute Santos · tesoureira de Vila Nova");
  const e0 = pedidos(api, "/api/financeiro/blocos/entregar", "POST").length;
  const r0 = pedidos(api, "/api/financeiro/blocos/rastreio").length;
  let v = await trocarEClicar(page, "Primeira folha do bloco", "64.436", "Registrar a saída");
  ok(v && v.desligado, "saída: trocou o número, o botão fica parado até o bloco novo chegar", v);
  ok(v && !(v.caixa || "").includes("1.403"), "saída: a caixa do bloco anterior some na troca", v);
  await espera(250);
  ok(pedidos(api, "/api/financeiro/blocos/entregar", "POST").length === e0, "saída: o clique antes do rastreio novo não grava o bloco anterior",
    pedidos(api, "/api/financeiro/blocos/entregar", "POST").slice(e0).map((p) => p.corpo));
  const rn = await esperarPedido(api, "/api/financeiro/blocos/rastreio", "GET", r0);
  ok(rn && rn.busca.folha === "64436", "saída: o rastreio do número novo", rn && rn.busca);
  await calmo(page);
  const cx = await caixaSaida(page);
  ok(cx && !cx.erro && cx.texto.startsWith("Bloco 1.288"), "saída: com o bloco novo, a caixa dele", cx);
  await clicar(page, "Registrar a saída");
  const ent = await esperarPedido(api, "/api/financeiro/blocos/entregar", "POST", e0);
  ok(ent && ent.corpo.primeiraFolha === 64436 && ent.corpo.folha === 64436, "saída: grava o bloco do número digitado, com a folha digitada junto", ent && ent.corpo);
  await fechar(s, "rastreio velho na saída");
  // a entrada: 68.010 (o 1.360, de Bela Vista) com a Lia, troca para 66.001 (o 1.320, de Vila Nova) e clica na hora
  s = await abrir("geral", "notebook");
  ({ page, api } = s);
  await clicar(page, "Livro de entrada e saída");
  await folhaDaSaida(page, api, "68.010");
  await escolher(page, "Devolvido por", "Lia Fontes · tesoureira de Bela Vista");
  const d0 = pedidos(api, "/api/financeiro/blocos/devolver", "POST").length;
  const r1 = pedidos(api, "/api/financeiro/blocos/rastreio").length;
  v = await trocarEClicar(page, "Primeira folha do bloco", "66.001", "Registrar a entrada");
  ok(v && v.desligado, "entrada: trocou o número, o botão fica parado até o bloco novo chegar", v);
  ok(v && !(v.caixa || "").includes("1.360"), "entrada: a caixa do bloco anterior some na troca", v);
  await espera(250);
  ok(pedidos(api, "/api/financeiro/blocos/devolver", "POST").length === d0, "entrada: o clique antes do rastreio novo não devolve o bloco anterior",
    pedidos(api, "/api/financeiro/blocos/devolver", "POST").slice(d0).map((p) => p.corpo));
  const rn2 = await esperarPedido(api, "/api/financeiro/blocos/rastreio", "GET", r1);
  ok(rn2 && rn2.busca.folha === "66001", "entrada: o rastreio do número novo", rn2 && rn2.busca);
  await calmo(page);
  const cx2 = await caixaSaida(page);
  ok(cx2 && !cx2.erro && cx2.texto.startsWith("Bloco 1.320"), "entrada: com o bloco novo, a caixa dele", cx2);
  await escolher(page, "Devolvido por", "Rute Santos · tesoureira de Vila Nova");
  await clicar(page, "Registrar a entrada");
  const dv = await esperarPedido(api, "/api/financeiro/blocos/devolver", "POST", d0);
  ok(dv && JSON.stringify(dv.corpo) === JSON.stringify({ primeiraFolha: 66001, folha: 66001, pessoa: { membroId: 101 }, parcial: false }),
    "entrada: devolve o bloco do número digitado, com a folha digitada junto", dv && dv.corpo);
  await fechar(s, "rastreio velho na entrada");
}

(async () => {
  srv = await criarServidor({ raiz: RAIZ, csp: true, permissoes: modelo.permissoes });
  nav = await puppeteer.launch({
    executablePath: EDGE, headless: true, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), "edge-front-financeiro-")),
    args: ["--disable-gpu", "--no-first-run", "--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1"]
  });
  try {
    if (!SO || SO === "folhas") { console.log("Folhas do bloco"); await provarFolhas(); }
    if (!SO || SO === "desfazer") { console.log("Desfazer e o histórico da folha"); await provarDesfazer(); }
    if (!SO || SO === "livro") { console.log("Livro de entrada e saída"); await provarLivro(); }
    if (!SO || SO === "saida") { console.log("Registrar saída"); await provarSaida(); }
    if (!SO || SO === "rastreio") { console.log("O rastreio velho (trocar o número e clicar na hora)"); await provarRastreioVelho(); }
    if (!SO || SO === "vazios") { console.log("As listas vazias"); await provarVazios(); }
    if (!SO || SO === "aviso") { console.log("O aviso das telas novas"); await provarAviso(); }
    if (!SO || SO === "lancamentos") {
      console.log("Lançar dízimos e ofertas");
      await provarLancamentos({ abrir, fechar, ok, calmo, espera, pedidos, esperarPedido, textoTela, clicar });
    }
  } finally {
    await nav.close();
    await srv.fechar();
  }
  console.log(`${total - falhas}/${total} casos`);
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
