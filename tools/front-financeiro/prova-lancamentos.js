// prova-lancamentos.js — a prova da tela "Lançar dízimos e ofertas" (incremento 3, r24-lancamento op. 1 sem "marcada em novembro"; a área é o
// r20LancArea; o seletor comum da r20) no Edge sem tela, com a CSP final. Chamada pelo navegador.js (SO=lancamentos), que passa as ferramentas.
// A API simulada é a de dados-lancamentos.js (a planilha e as recusas saem da regra de verdade do servidor).
"use strict";

module.exports = async function provarLancamentos(f) {
  const { abrir, fechar, ok, calmo, espera, pedidos, esperarPedido, textoTela, clicar } = f;
  const P = "/api/financeiro/lancamentos";

  // ---- as ferramentas desta tela ----
  async function irLancamentos(s, caminho = P) {
    const antes = pedidos(s.api, caminho).length;
    const feito = await s.page.evaluate(() => {
      const b = [...document.querySelectorAll("button, a")].find((x) => x.textContent.replace(/\s+/g, " ").trim() === "Lançamentos");
      if (!b) return false;
      b.click();
      return true;
    });
    await calmo(s.page);
    const pedido = await esperarPedido(s.api, caminho, "GET", antes);
    await calmo(s.page);
    return feito && !!pedido;
  }
  const focar = (page, folha) => page.evaluate((n) => { const e = document.querySelector(`#financeiroRaiz [data-quem="${n}"]`); if (!e) return false; e.focus(); return true; }, folha);
  const foco = (page) => page.evaluate(() => { const e = document.activeElement; return e ? { tag: e.tagName, quem: e.getAttribute("data-quem"), rotulo: e.getAttribute("aria-label"), valor: e.value ?? null } : null; });
  const linha = (page, folha) => page.evaluate((n) => {
    const l = document.querySelector(`#financeiroRaiz [data-folha="${n}"]`);
    if (!l) return null;
    const q = l.querySelector("input[data-quem]"), sel = l.querySelectorAll("select"), v = l.querySelector("input.valor");
    return { classe: l.className, quem: q ? q.value : null, tipo: sel[0] ? sel[0].value : null, forma: sel[1] ? sel[1].value : null, valor: v ? v.value : null, texto: l.innerText.replace(/\s+/g, " ").trim() };
  }, folha);
  const clicarLida = async (page, folha) => {
    await page.evaluate((n) => { const b = document.querySelector(`#financeiroRaiz button[data-folha="${n}"]`); if (b) b.click(); }, folha);
    await calmo(page);
    await espera(150);
  };
  const tecla = async (page, k, vezes = 1) => { for (let i = 0; i < vezes; i++) await page.keyboard.press(k); };
  const escrever = (page, t) => page.keyboard.type(t, { delay: 8 });
  const listaAberta = (page) => page.evaluate(() => [...document.querySelectorAll("#financeiroRaiz [role=listbox][aria-label='Achados no cadastro'] [role=option]")].map((o) => o.innerText.replace(/\s+/g, " ").trim()));
  const esperarLista = async (page, ms = 2000) => { const fim = Date.now() + ms; while (Date.now() < fim) { const l = await listaAberta(page); if (l.length) return l; await espera(40); } return []; };
  const totais = (page) => page.evaluate(() => [...document.querySelectorAll("#financeiroRaiz .totais .tot")].map((t) => t.innerText.replace(/\s+/g, " ").trim()));
  /** digita uma folha inteira pelo teclado, a partir do "Quem deu" com o foco: quem (com a escolha na lista), Tab, tipo, Tab, forma, Tab, valor */
  async function folhaPeloTeclado(page, { quem, escolhe, tipo, forma, valor }) {
    await escrever(page, quem);
    if (escolhe) { await esperarLista(page); await tecla(page, "Enter"); }
    await tecla(page, "Tab"); await escrever(page, tipo);
    await tecla(page, "Tab"); await escrever(page, forma);
    await tecla(page, "Tab"); await escrever(page, valor);
  }

  // ================= a congregação, notebook: a planilha =================
  let s = await abrir("local", "notebook");
  let { page, api } = s;
  ok(await irLancamentos(s), "local: o item \"Lançamentos\" do menu abre a tela");
  let t = await textoTela(page);
  ok(t.includes("Lançar dízimos e ofertas") && t.includes("quarta, 02/12/2026 · Vila Nova · a hora entra sozinha ao salvar"), "local: o título e o subtítulo do desenho", t.slice(0, 160));
  ok(t.includes("A sua congregação Vila Nova"), "local: o cadeado \"A sua congregação\"");
  ok(t.includes("Bloco 1.403") && t.includes("70.151 a 70.200") && t.includes("novembro: 1ª a 10ª, 13ª e 14ª") && t.includes("mês posterior: 11ª e 12ª") && t.includes("dezembro: da 15ª") && t.includes("a próxima: 70.171"),
    "local: a tira do bloco com a legenda do servidor");
  ok(t.includes("Dezembro começa na 70.161, a 1ª folha marcada “mês posterior” em novembro. A 70.161 e a 70.162: nome e valor obrigatórios*"), "local: a faixa do começo do mês");
  ok(!/marcada em novembro/i.test(t), "local: sem \"marcada em novembro\" (a resposta 5)");
  ok(t.includes("referente ao mês anterior") && t.includes("veio sozinha · nada a digitar · somou em novembro") && t.includes("relatório de novembro"), "local: a 70.163 e a 70.164 com a tarja");
  ok(t.includes("Arrancada") && t.includes("motivo: rasgou ao preencher"), "local: a 70.168 arrancada, com o motivo");
  ok(t.includes("Paulo Henrique Dias") && t.includes("nome digitado") && t.includes("Oferta de culto (sem nome)") && t.includes("+ 30,00"), "local: o nome digitado, a oferta sem nome e a voluntária junto");
  const vazia = await page.evaluate(() => { const e = document.querySelector('#financeiroRaiz [data-quem="70171"]'); return e ? e.placeholder : null; });
  ok(vazia === "a próxima folha (Enter)", "local: a última linha é \"a próxima folha (Enter)\"", vazia);
  let tot = await totais(page);
  ok(tot[0] === "Dízimos R$ 1.204,00 com a 70.161 e a 70.162" && tot[4] === "Pré-repasse de dezembro R$ 1.770,50 com R$ 280,00 adiantados", "local: os totais do servidor antes de digitar", tot);

  // a 70.161 (veio marcada): quem, Tab, D, Tab, E, Tab, 250,00 — e os totais contam o que está digitado (o desenho)
  ok(await focar(page, 70161), "local: o \"Quem deu\" da 70.161 recebe o foco");
  await folhaPeloTeclado(page, { quem: "Carl", escolhe: true, tipo: "d", forma: "e", valor: "250,00" });
  let l161 = await linha(page, 70161);
  ok(l161 && l161.quem === "Carlos Eduardo Souza" && l161.tipo === "DIZIMO" && l161.forma === "ESPECIE" && l161.valor === "250,00",
    "local: a 70.161 pelo teclado (Carlos do cadastro, Dízimo, Espécie, 250,00)", l161);
  // o desenho (r24, as medidas): a linha lançada com 28 px (27 + o fio), a ativa com 41, a próxima com 30; na ativa, "Quem deu" é a caixa com o
  // ícone e sem o número; a próxima sem o traço na voluntária; o subtítulo inteiro em 13,5; a planilha cabe na tela com os totais
  const med = await page.evaluate(() => {
    const alt = (s) => { const e = document.querySelector(`#financeiroRaiz ${s}`); return e ? Math.round(e.getBoundingClientRect().height) : null; };
    const ativa = document.querySelector('#financeiroRaiz [data-folha="70161"]');
    const caixa = ativa && ativa.querySelector(".caixa");
    const svg = caixa && caixa.querySelector("svg");
    const num = ativa && ativa.querySelector(".num");
    const vol = document.querySelector('#financeiroRaiz [data-folha="70171"] input.vol');
    const tot = document.querySelector("#financeiroRaiz .totais");
    const sub = document.querySelector("#financeiroRaiz .cab-pag .textos p");
    return { lancada: alt('[data-folha="70165"]'), ativa: alt('[data-folha="70161"]'), proxima: alt('[data-folha="70171"]'),
      borda: caixa ? getComputedStyle(caixa).borderTopColor : null, icone: !!svg && getComputedStyle(svg).display !== "none", numero: !!num && num.offsetParent !== null,
      traco: vol ? vol.placeholder : null, fim: tot ? Math.round(tot.getBoundingClientRect().bottom) : null, altura: innerHeight,
      subInteiro: sub ? sub.scrollWidth <= sub.clientWidth : null, subLetra: sub ? getComputedStyle(sub).fontSize : null };
  });
  ok(med.lancada === 28 && med.ativa === 41 && med.proxima === 30, "local: as alturas do desenho (a lançada 28, a ativa 41, a próxima 30)", med);
  ok(med.borda && med.borda !== "rgba(0, 0, 0, 0)" && med.icone && !med.numero, "local: na linha ativa, \"Quem deu\" é a caixa com o ícone, sem o número (o desenho)", med);
  ok(med.traco === "", "local: a próxima folha sem o traço na voluntária", med.traco);
  ok(med.fim !== null && med.fim <= med.altura, "local: a planilha cabe na tela com os totais (sem rolagem, o desenho)", med);
  ok(med.subInteiro === true && med.subLetra === "13.5px", "local: o subtítulo inteiro, na letra do desenho (13,5)", med);
  tot = await totais(page);
  ok(JSON.stringify(tot) === JSON.stringify(["Dízimos R$ 1.454,00 com a 70.161 e a 70.162", "Oferta de culto R$ 486,50 só quando há", "Oferta voluntária R$ 80,00 1 junto do dízimo, 1 sozinha",
    "Dezembro até aqui R$ 2.020,50 Pix 1.040,00 · espécie 980,50", "Pré-repasse de dezembro R$ 2.020,50 com R$ 530,00 adiantados"]), "local: os totais do desenho com a 70.161 digitada", tot);

  // a lista velha não escolhe: "Mar" abre a lista; "Marta" + Enter na hora espera a procura nova e abre a lista dela
  await tecla(page, "Enter");
  let fo = await foco(page);
  ok(fo && fo.quem === "70171", "local: Enter vai para a 70.171 (a próxima folha)", fo);
  ok(((await linha(page, 70161)) || { texto: "" }).texto.includes("nº 700.087"), "local: fora da linha ativa, o número do membro volta ao lado do nome");
  await escrever(page, "Mar");
  let achados = await esperarLista(page);
  ok(achados.length === 4 && achados[0].startsWith("Maria Oliveira") && achados[3].startsWith("Lídia Martins"), "local: \"Mar\" acha 4 no cadastro (a Igreja inteira; primeiro quem começa por \"Mar\")", achados);
  ok(achados.some((a) => a.includes("Marta Oliveira Lima") && a.includes("Bela Vista")), "local: a procura mostra a congregação de cada um", achados);
  await escrever(page, "ta");
  await tecla(page, "Enter");
  let l171 = await linha(page, 70171);
  ok(l171 && l171.quem === "Marta" && !l171.texto.includes("Maria Oliveira"), "local: o Enter antes da procura nova não escolhe da lista velha", l171);
  achados = await esperarLista(page);
  ok(achados.length === 1 && achados[0].startsWith("Marta Oliveira Lima"), "local: a procura nova volta e abre a lista dela", achados);
  await tecla(page, "Enter");
  l171 = await linha(page, 70171);
  ok(l171 && l171.quem === "Marta Oliveira Lima", "local: Enter escolhe a Marta", l171);
  await tecla(page, "Tab"); await escrever(page, "d"); await tecla(page, "Tab"); await escrever(page, "p"); await tecla(page, "Tab"); await escrever(page, "100,00");

  // 20 lançamentos seguidos só com o teclado (a prova do plano da fase 10): da 70.172 à 70.190, mais a 70.171 acima
  const NOMES = [["Maria", true], ["Fulano de Teste", false], ["Débora", true], ["Ciclano de Teste", false], ["Lídia", true]];
  for (let i = 0; i < 19; i++) {
    await tecla(page, "Enter");
    const [quem, escolhe] = NOMES[i % NOMES.length];
    const tipo = i % 4 === 3 ? "v" : "d", forma = i % 2 ? "p" : "e";
    await folhaPeloTeclado(page, { quem, escolhe, tipo, forma, valor: `${10 + i},50` });
  }
  const l190 = await linha(page, 70190);
  ok(l190 && l190.valor === "28,50" && l190.tipo === "DIZIMO", "local: a 70.190 (a 20ª nova) digitada pelo teclado", l190);
  const s0 = pedidos(api, `${P}/salvar`, "POST").length;
  await page.keyboard.down("Control"); await tecla(page, "s"); await page.keyboard.up("Control");
  const sv = await esperarPedido(api, `${P}/salvar`, "POST", s0);
  const lin = sv ? sv.corpo.linhas : [];
  ok(sv && sv.corpo.congregacaoId === 2 && sv.corpo.dia === "2026-12-02" && lin.length === 21, "local: Ctrl + S manda as 21 folhas de uma vez, com o dia", sv && { n: lin.length, dia: sv.corpo.dia });
  ok(lin[0] && JSON.stringify(lin[0]) === JSON.stringify({ folha: 70161, tipo: "DIZIMO", forma: "ESPECIE", valor: "250,00", pessoa: { membroId: 700087 } }),
    "local: a 70.161 (veio marcada) vai sem o \"Referente a\"", lin[0]);
  ok(lin[3] && lin[3].folha === 70173 && lin[3].referente === "ESTE_MES" && lin[3].pessoa && lin[3].pessoa.nome === "Fulano de Teste", "local: o nome digitado vai como nome", lin[3]);
  ok(lin.every((x) => x.tipo !== "DIZIMO" || !("voluntaria" in x)) && lin.filter((x) => x.tipo === "OFERTA_VOLUNTARIA").length === 4, "local: as ofertas voluntárias sozinhas", lin.map((x) => x.tipo));
  await calmo(page);
  t = await textoTela(page);
  const salva161 = await linha(page, 70161);
  ok(t.includes("a próxima: 70.191") && salva161 && salva161.quem === null && salva161.texto.includes("Carlos Eduardo Souza"), "local: depois de salvar, a planilha volta do servidor (a próxima é a 70.191)", t.slice(0, 120));

  // a recusa do servidor marca a linha: um dízimo sem quem deu
  ok(await focar(page, 70191), "local: o foco na 70.191");
  await tecla(page, "Tab"); await escrever(page, "d"); await tecla(page, "Tab"); await escrever(page, "e"); await tecla(page, "Tab"); await escrever(page, "40,00");
  const s1 = pedidos(api, `${P}/salvar`, "POST").length;
  await clicar(page, "Salvar (Ctrl + S)");
  await esperarPedido(api, `${P}/salvar`, "POST", s1);
  await calmo(page);
  const l191 = await linha(page, 70191);
  t = await textoTela(page);
  ok(l191 && /\berro\b/.test(l191.classe) && t.includes("Folha 70.191: o dízimo precisa de quem deu (do cadastro ou o nome digitado)."), "local: a recusa aparece e a linha recusada fica marcada", { l191, t: t.slice(0, 300) });

  // a folha que não foi usada se marca na própria planilha (a decisão 4 corrigida): Tipo "Arrancada" pede o motivo
  await page.evaluate(() => { const s = document.querySelector('#financeiroRaiz [data-folha="70191"] select'); s.value = "arrancada"; s.dispatchEvent(new Event("change", { bubbles: true })); });
  await calmo(page);
  ok(await focar(page, 70191), "local: o motivo da marcada recebe o foco");
  await escrever(page, "rasgou");
  const s2 = pedidos(api, `${P}/salvar`, "POST").length;
  await clicar(page, "Salvar (Ctrl + S)");
  const sm = await esperarPedido(api, `${P}/salvar`, "POST", s2);
  ok(sm && JSON.stringify(sm.corpo.linhas) === JSON.stringify([{ folha: 70191, excecao: { oQueAconteceu: "arrancada", observacao: "rasgou" } }]), "local: a marca vai só com o motivo", sm && sm.corpo.linhas);
  await calmo(page);
  t = await textoTela(page);
  ok(t.includes("a próxima: 70.192") && t.includes("motivo: rasgou"), "local: a 70.191 volta marcada, com o motivo", t.slice(0, 200));

  // a folha lançada clicada: o histórico e o Corrigir com o motivo
  await clicarLida(page, 70165);
  t = await textoTela(page);
  ok(t.includes("A folha que você clicou") && t.includes("O histórico da linha") && t.includes("Rute Santos lançou no dia 01/12/2026"), "local: a lançada clicada mostra o histórico", t.slice(-600));
  await clicar(page, "Corrigir");
  await page.evaluate(() => { const i = [...document.querySelectorAll("#financeiroRaiz label")].find((l) => l.textContent.trim().startsWith("Valor")).querySelector("input"); i.value = "350,00"; i.dispatchEvent(new Event("input", { bubbles: true })); });
  await clicar(page, "Salvar a correção");
  t = await textoTela(page);
  ok(t.includes("Escreva o motivo da correção."), "local: sem o motivo, a correção não sai");
  await page.evaluate(() => { const i = [...document.querySelectorAll("#financeiroRaiz label")].find((l) => l.textContent.trim().startsWith("Motivo da correção")).querySelector("input"); i.value = "digitei errado"; i.dispatchEvent(new Event("input", { bubbles: true })); });
  const c0 = pedidos(api, `${P}/corrigir`, "POST").length;
  await clicar(page, "Salvar a correção");
  const cr = await esperarPedido(api, `${P}/corrigir`, "POST", c0);
  ok(cr && cr.corpo.folha === 70165 && cr.corpo.valor === "350,00" && cr.corpo.motivo === "digitei errado" && cr.corpo.voluntaria === "30,00" && cr.corpo.pessoa.membroId === 700128,
    "local: o Corrigir manda os campos e o motivo", cr && cr.corpo);
  await calmo(page);
  await espera(200);
  t = await textoTela(page);
  ok(t.includes("corrigiu valor 320,00 → 350,00: “digitei errado”"), "local: o histórico guarda o antes, o depois e o motivo", t.slice(-400));

  // a marcada clicada: o cadeado (só a Tesouraria Geral desfaz)
  await clicarLida(page, 70168);
  t = await textoTela(page);
  ok(t.includes("Marcou errado? Só a Tesouraria Geral desfaz, com o motivo. Fale com ela."), "local: a marcada clicada mostra o cadeado", t.slice(-300));

  // trocar de mês com folha digitada pede para salvar ou descartar
  ok(await focar(page, 70192), "local: o foco na 70.192");
  await escrever(page, "Fulano");
  await page.evaluate(() => { const i = document.querySelector("#financeiroRaiz .tira input[type=date]"); i.value = "2026-11-30"; i.dispatchEvent(new Event("change", { bubbles: true })); });
  await calmo(page);
  t = await textoTela(page);
  ok(t.includes("Há 1 folha digitada e não salva.") && t.includes("Descartar e trocar"), "local: trocar de mês com folha digitada pergunta antes");
  const g0 = pedidos(api, P).length;
  await clicar(page, "Continuar aqui");
  ok(pedidos(api, P).length === g0 && (await linha(page, 70192)).quem === "Fulano", "local: \"Continuar aqui\" não troca e não perde nada");
  await fechar(s, "lançamentos, a congregação (notebook)");

  // ================= a linha de lançar (notebook) =================
  s = await abrir("local", "notebook");
  ({ page, api } = s);
  await irLancamentos(s);
  await clicar(page, "Linha de lançar");
  t = await textoTela(page);
  ok(t.includes("Folha (sozinha) 70.161") && t.includes("1. Valor*") && t.includes("2. Tipo") && t.includes("3. Forma") && t.includes("4. Quem deu* · procura no cadastro")
    && t.includes("5. + Voluntária · se houver") && t.includes("6. Referente a dezembro") && t.includes("Lançar (Enter)"), "linha: os 6 passos do desenho, o 6º travado em dezembro", t.slice(0, 500));
  ok(!/marcada em novembro/i.test(t) && t.includes("Dezembro, a partir da 70.161") && t.includes("a sequência contínua do bloco 1.403"), "linha: sem \"marcada em novembro\"; a sequência do mês");
  fo = await foco(page);
  ok(fo && fo.rotulo === "Valor", "linha: o valor recebe o foco", fo);
  await escrever(page, "250,00"); await escrever(page, "d"); await escrever(page, "e");
  await page.evaluate(() => document.querySelector('#financeiroRaiz [data-quem="70161"]').focus());
  await escrever(page, "Carlos");
  await esperarLista(page);
  await tecla(page, "Enter");
  // o desenho (as medidas): Tipo e Forma numa linha só; "R$ 250,00" junto; o número logo depois do nome; a sequência com 26 px por folha (25 + o
  // fio) e sem folga entre elas; "320,00 + 30,00"; a página cabe na tela
  const ml = await page.evaluate(() => {
    const q = (s) => [...document.querySelectorAll(`#financeiroRaiz ${s}`)];
    const tops = q(".comp .op").map((b) => Math.round(b.getBoundingClientRect().top));
    const rs = q(".comp .caixa-valor .rs")[0], v = q(".comp input.valor:not(.vol)")[0];
    const caixa = q(".comp .quem .caixa")[0], num = q(".comp .quem .num")[0];
    const itens = q(".seq .grade.item").slice(0, 2).map((e) => e.getBoundingClientRect().top);
    const notas = q(".nota-tot, .avisos-nota, [data-aviso=nota]");
    const ult = [...document.querySelectorAll("#financeiroRaiz .lancamentos > *")].pop();
    return { tops: [...new Set(tops)], junto: rs && v ? Math.round(v.getBoundingClientRect().left - rs.getBoundingClientRect().right + parseFloat(getComputedStyle(v).paddingLeft)) : null,
      numDepois: caixa && num ? Math.round(num.getBoundingClientRect().left - caixa.getBoundingClientRect().left) : null,
      passo: itens.length === 2 ? Math.round(itens[1] - itens[0]) : null, fim: ult ? Math.round(ult.getBoundingClientRect().bottom) : null, altura: innerHeight, n: notas.length };
  });
  ok(ml.tops.length === 1, "linha: Tipo e Forma numa linha só (o desenho)", ml.tops);
  ok(ml.junto !== null && ml.junto <= 8, "linha: \"R$ 250,00\" junto, como o desenho", ml.junto);
  ok(ml.numDepois !== null && ml.numDepois <= 260, "linha: o número do membro logo depois do nome", ml.numDepois);
  ok(ml.passo === 26, "linha: a sequência com 26 px por folha, sem folga entre elas", ml.passo);
  ok(ml.fim !== null && ml.fim <= ml.altura, "linha: a página cabe na tela (sem rolagem, o desenho)", ml);
  ok((await textoTela(page)).includes("320,00 + 30,00"), "linha: a voluntária junto com o espaço (\"320,00 + 30,00\")");
  const s3 = pedidos(api, `${P}/salvar`, "POST").length;
  await tecla(page, "Enter");
  const sl = await esperarPedido(api, `${P}/salvar`, "POST", s3);
  ok(sl && JSON.stringify(sl.corpo.linhas) === JSON.stringify([{ folha: 70161, tipo: "DIZIMO", forma: "ESPECIE", valor: "250,00", pessoa: { membroId: 700087 } }]),
    "linha: valor, D, E, quem (Enter escolhe) e Enter lança a folha", sl && sl.corpo.linhas);
  await calmo(page);
  t = await textoTela(page);
  ok(t.includes("Folha (sozinha) 70.171") && t.includes("Este mês") && t.includes("Mês posterior"), "linha: depois, a 70.171 com \"Este mês\" e \"Mês posterior\"", t.slice(0, 300));
  await fechar(s, "lançamentos, a linha de lançar");

  // ================= a Tesouraria Geral: escolhe a congregação =================
  s = await abrir("geral", "notebook");
  ({ page, api } = s);
  await irLancamentos(s);
  t = await textoTela(page);
  ok(t.includes("Escolha a congregação") && t.includes("Lançando por"), "geral: sem congregação, pede para escolher", t.slice(0, 200));
  await page.evaluate(() => document.querySelector("#financeiroRaiz button.troca").click());
  await calmo(page);
  t = await textoTela(page);
  ok(t.includes("procura nas áreas e nas 9 congregações") && t.includes("Área 2"), "geral: o seletor da r20 abre", t.slice(0, 400));
  // o painel do desenho: por cima da tela inteira, à direita (28 px) e a 118 px do alto, mesmo com o botão longe da borda; nada cortado
  const pn = await page.evaluate(() => {
    const p = document.querySelector("#financeiroRaiz .painel");
    if (!p) return null;
    const r = p.getBoundingClientRect();
    const dentro = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && p.contains(e); };
    return { esq: Math.round(r.left), dir: Math.round(innerWidth - r.right), topo: Math.round(r.top), cantoEsq: dentro(r.left + 12, r.top + 12), cantoDir: dentro(r.right - 12, r.bottom - 12) };
  });
  ok(pn && pn.dir === 28 && pn.topo === 118 && pn.esq >= 280 && pn.cantoEsq && pn.cantoDir, "geral: o painel do seletor à direita e a 118 px do alto, inteiro na tela (o desenho)", pn);
  const g1 = pedidos(api, P).length;
  await page.keyboard.type("Vila");
  await calmo(page);
  ok((await textoTela(page)).includes("Vila Nova · Área 2"), "geral: a procura mostra a área de cada uma, com o espaço (\"Vila Nova · Área 2\")");
  await tecla(page, "Enter");
  const gp = await esperarPedido(api, P, "GET", g1);
  ok(gp && gp.busca.congregacaoId === "2", "geral: procurar \"Vila\" e Enter abre a planilha de Vila Nova", gp && gp.busca);
  await calmo(page);
  t = await textoTela(page);
  ok(t.includes("quarta, 02/12/2026 · Vila Nova · fica registrado que a Geral lançou") && t.includes("Lançando por Vila Nova"), "geral: lançando por Vila Nova", t.slice(0, 200));
  await page.evaluate(() => document.querySelector("#financeiroRaiz button.troca").click());
  await calmo(page);
  const primeira = await page.evaluate(() => { const c = document.querySelector("#financeiroRaiz .painel button.cong"); return c ? c.innerText.replace(/\s+/g, " ").trim() : null; });
  ok(primeira && primeira.startsWith("Vila Nova") && primeira.includes("agora"), "geral: no seletor, a congregação de agora vem primeiro (o desenho)", primeira);
  await tecla(page, "Escape");
  await calmo(page);
  await fechar(s, "lançamentos, a Tesouraria Geral");

  // ================= a área acompanha =================
  s = await abrir("area", "notebook");
  ({ page, api } = s);
  ok(await irLancamentos(s, `${P}/area`), "área: o item \"Lançamentos\" abre a área (sem pedir a planilha)");
  ok(!pedidos(api, P).length, "área: sem congregação escolhida, nenhuma planilha é pedida", pedidos(api, P).length);
  t = await textoTela(page);
  ok(t.includes("Lançamentos da área") && t.includes("Área 2 · 7 congregações · novembro de 2026") && t.includes("Quem lança é cada congregação"), "área: o título, o subtítulo e a nota", t.slice(0, 300));
  ok(t.includes("Só o que eu preciso resolver (2)") && t.includes("Monte Sião") && !t.includes("Cidade Jardim"), "área: só o que precisa (2)", t.slice(0, 600));
  await clicar(page, "Tudo da área (7)");
  t = await textoTela(page);
  ok(t.includes("Cidade Jardim") && t.includes("qui 19/11, 16h40") && t.includes("R$ 8.120,00") && t.includes("1.388 · na 69.446") && t.includes("tudo certo"), "área: tudo da área, com o último lançamento e a folha agora", t.slice(0, 900));
  ok(t.includes("7 de 7") && t.includes("R$ 26.440,50") && t.includes("precisam de você"), "área: os números da área");
  const a0 = pedidos(api, P).length;
  await page.evaluate(() => [...document.querySelectorAll("#financeiroRaiz button.fila")].find((b) => b.textContent.includes("Vila Nova")).click());
  const ap = await esperarPedido(api, P, "GET", a0);
  await calmo(page);
  t = await textoTela(page);
  ok(ap && ap.busca.congregacaoId === "2" && t.includes("Lançamentos de Vila Nova") && t.includes("a área acompanha") && !t.includes("Salvar (Ctrl + S)"), "área: Ver abre a planilha só para consultar", t.slice(0, 200));
  const inputs = await page.evaluate(() => document.querySelectorAll("#financeiroRaiz .planilha input, #financeiroRaiz .planilha select").length);
  ok(inputs === 0, "área: a planilha da congregação sem campo para digitar", inputs);
  await fechar(s, "lançamentos, a área");

  // ================= o celular =================
  s = await abrir("local", "celular");
  ({ page, api } = s);
  await irLancamentos(s);
  t = await textoTela(page);
  ok(t.includes("Folha 70.161") && t.includes("Valor*") && t.includes("Quem deu*") && t.includes("Lançar a 70.161") && !/marcada em novembro/i.test(t), "celular: o cartão da 70.161", t.slice(0, 300));
  ok(t.includes("70.162 · Lídia Martins") && t.includes("veio sozinha · nada a digitar · somou em novembro") && t.includes("Depois, as de dezembro. Na próxima folha nova, Referente a:"), "celular: a lista e o recado do fim", t.slice(0, 700));
  const titulo = await page.evaluate(() => (document.getElementById("tituloModulo") || {}).textContent || "");
  ok(titulo === "Lançar", "celular: \"Lançar\" na barra do alto (o desenho)", titulo);
  // o desenho: com a folha que veio marcada no cartão, a lista mostra só as que vieram de novembro (a 70.162, a 70.163 e a 70.164) e depois o
  // recado "Depois, as de dezembro"; o "Quem deu" escolhido em duas linhas, com o número, o tipo e a forma
  const itensCel = await page.evaluate(() => [...document.querySelectorAll("#financeiroRaiz .lista-cel .item-cel")].map((e) => e.innerText.replace(/\s+/g, " ").trim()));
  ok(itensCel.length === 3 && itensCel[0].startsWith("70.162") && itensCel[2].startsWith("70.164"), "celular: a lista só com as que vieram de novembro (o desenho)", itensCel);
  await clicar(page, "Dízimo");
  await clicar(page, "Espécie");
  await page.evaluate(() => document.querySelector('#financeiroRaiz [data-quem="70161"]').focus());
  await escrever(page, "Carl");
  await esperarLista(page);
  await tecla(page, "Enter");
  await page.evaluate(() => { const v = document.querySelector("#financeiroRaiz .cartao input.valor"); if (v) v.focus(); });
  await calmo(page);
  const quemCel = await page.evaluate(() => { const c = document.querySelector("#financeiroRaiz .cartao .quem"); return c ? c.innerText.replace(/\s+/g, " ").trim() : null; });
  ok(quemCel === "Carlos Eduardo Souza nº 700.087 · Dízimo · Espécie" || (quemCel || "").endsWith("nº 700.087 · Dízimo · Espécie"), "celular: quem deu em duas linhas, com o número, o tipo e a forma (o desenho)", quemCel);
  await fechar(s, "lançamentos, o celular");

  // ================= a área no celular =================
  s = await abrir("area", "celular");
  ({ page, api } = s);
  await irLancamentos(s, `${P}/area`);
  t = await textoTela(page);
  ok(t.includes("Vendo As 7 da Área 2") && t.includes("Em dia: 5 de 7"), "área, celular: \"As 7 da Área 2\" no botão (o desenho do celular) e as em dia", t.slice(0, 300));
  await fechar(s, "lançamentos, a área no celular");
};
