// modulos/distritos.js — v9.3: Distrito e macroexpansão (Estatuto Art. 5º §5º; Regimento Art. 6-A, 53-D, 126-K a 126-N e 126-P). Toda regra mora no servidor
// (api/shared/distritos.js e distritosDb.js, rota /api/distritos); aqui só se monta a tela, na pílula "Distritos" da aba Expansão. Entra quem tem a permissão
// "distritos": o nível geral e o NIF (Conselho Fiscal) veem todos os Distritos; quem tem acesso de escopo de Distrito, só o dele.
//  - a lista com os sinais (decreto não registrado, sem Pastor Distrital, Dízimo Institucional vencido, balanço atrasado, balanço esperando o NIF);
//  - a ficha: o decreto e os períodos, o território, o CDE, o Dízimo Institucional mês a mês, os balanços e as intervenções, com os atos que o servidor diz que
//    esta pessoa pode fazer (distrito.acoes): ativar e desativar (o nível geral), intervir e encerrar (o Pastor Presidente), enviar o balanço (o Distrito) e
//    analisá-lo (o NIF).
// Todo texto que vem do servidor passa por escaparHtmlEbd; toda resposta confere, depois de cada await, se o login ainda é o mesmo (authToken).

let dstCatalogos = null;
let dstReunioes = [];
let dstReunioesFalhou = false;
let dstFicha = null;           // o Distrito aberto (a resposta de /ficha)
let dstForm = null;            // o formulário de ato aberto: { chave, fixos }
let dstOcupado = false;
let dstConfirmando = false;
let dstPedidoFicha = 0;
let dstPedidoLista = 0;
let dstPedidoOpcoes = 0;
const dstEl = (idEl) => document.getElementById(idEl);
const dstBr = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
const dstMes = (m) => (m ? `${String(m).slice(5, 7)}/${String(m).slice(0, 4)}` : "");
const dstH = (v) => escaparHtmlEbd(v == null ? "" : String(v));
const dstReais = (v) => `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const DST_SEM_CONEXAO = "<p class='subtitle'>Sem conexão com o servidor. Tente de novo.</p>";
const DST_SITUACAO_MES = { REPASSADO: "✅ repassado à Sede", REGISTRADO: "registrado, esperando o repasse", APURAVEL: "todas fecharam: pronto para registrar", ABERTO: "falta fechamento",
  SEM_MOVIMENTO: "sem movimento a apurar" };

async function dstBuscar(caminho) {
  const token = authToken;
  if (!token) return null;
  let res;
  try { res = await fetchProtegido(`${API_BASE}/distritos/${caminho}`); } catch (e) { return authToken === token ? { semConexao: true } : null; }
  const data = await res.json().catch(() => ({ sucesso: false, mensagem: "Resposta inválida do servidor." }));
  return authToken === token ? data : null;
}
async function dstPost(acao, corpo, alvoMsg) {
  if (dstOcupado) { dstMensagem(alvoMsg, "Aguarde: a gravação anterior ainda está em andamento."); return null; }
  dstOcupado = true;
  const token = authToken;
  try {
    let res;
    try { res = await fetchProtegido(`${API_BASE}/distritos/${acao}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }); } catch (e) {
      if (authToken === token) dstMensagem(alvoMsg, "Sem conexão com o servidor. Tente de novo.");
      return null;
    }
    const data = await res.json().catch(() => ({ sucesso: false, mensagem: "Resposta inválida do servidor." }));
    if (authToken !== token) return null;
    return data;
  } finally {
    dstOcupado = false;
  }
}
function dstMensagem(idEl, texto) { const el = dstEl(idEl); if (el) el.textContent = texto || ""; }
// Um catálogo { CODIGO: rótulo } vira a lista de opções.
const dstOpcoesDe = (nome) => Object.entries((dstCatalogos && dstCatalogos[nome]) || {}).map(([codigo, rotulo]) => ({ codigo, rotulo }));

// Troca de login ou saída: nada da sessão anterior fica na página (nem o que foi digitado).
function dstLimparTela() {
  dstCatalogos = null; dstReunioes = []; dstReunioesFalhou = false; dstFicha = null; dstForm = null; dstConfirmando = false;
  dstPedidoFicha++; dstPedidoLista++; dstPedidoOpcoes++;
  for (const idEl of ["dstLista", "dstFicha", "dstMsgLista", "dstMsgFicha"]) { const el = dstEl(idEl); if (el) el.innerHTML = ""; }
  const bloco = dstEl("dstBlocoFicha"); if (bloco) bloco.style.display = "none";
}

// ================================================================ abrir a pílula ================================================================
async function dstAbrirAcao() {
  const meu = ++dstPedidoOpcoes;
  if (!dstCatalogos) {
    const cat = await dstBuscar("catalogos");
    if (cat === null || meu !== dstPedidoOpcoes) return;
    if (!cat.sucesso) { dstEl("dstLista").innerHTML = cat.semConexao ? DST_SEM_CONEXAO : `<p class='subtitle'>${dstH(cat.mensagem)}</p>`; return; }
    dstCatalogos = cat;
    // as reuniões da CLI só servem a quem registra os decretos (o nível geral): os demais nem pedem
    if (cat.papeis && cat.papeis.geral) {
      const reu = await dstBuscar("reunioes");
      if (reu === null || meu !== dstPedidoOpcoes) return;
      dstReunioesFalhou = !(reu && reu.sucesso && Array.isArray(reu.reunioes));
      dstReunioes = dstReunioesFalhou ? [] : reu.reunioes;
    }
  }
  await dstCarregarListaAcao();
  if (dstFicha && meu === dstPedidoOpcoes) dstRenderFicha();
}

// ================================================================ a lista com os sinais ================================================================
function dstSinais(s, extra = []) {
  const itens = [];
  if (!s) return itens;
  if (s.semDecreto) itens.push("⚠️ Ativo pelo cadastro antigo, sem o decreto da CLI registrado: o nível geral registra o decreto.");
  if (s.semPastor) itens.push("⚠️ Sem Pastor Distrital: o Pastor Presidente dá o acesso em Liderança (Regimento, Art. 126-L, I).");
  if (s.intervencaoSemInterventorComAcesso) itens.push("⚠️ Intervenção aberta e o Interventor ainda sem o acesso: o Pastor Presidente dá o acesso \"Interventor Distrital\" em Liderança.");
  if (Array.isArray(s.repasseVencido) && s.repasseVencido.length) {
    itens.push(`🚩 Dízimo Institucional vencido sem repasse: ${s.repasseVencido.map(dstMes).join(", ")} — retenção da cota é causa de intervenção (Art. 126-N, III).`);
  }
  if (Array.isArray(s.fechamentoAtrasado) && s.fechamentoAtrasado.length) {
    itens.push(`⏳ Dízimo Institucional ainda sem cálculo (falta o fechamento local de alguma congregação): ${s.fechamentoAtrasado.map(dstMes).join(", ")}.`);
  }
  if (Array.isArray(s.balancoAtrasado) && s.balancoAtrasado.length) itens.push(`🚩 Balanço anual não enviado ao NIF no prazo (31/03): ${s.balancoAtrasado.join(", ")}.`);
  return itens.concat(extra);
}
async function dstCarregarListaAcao() {
  const alvo = dstEl("dstLista");
  if (!alvo) return;
  const meu = ++dstPedidoLista;
  alvo.innerHTML = "<p class='subtitle'>Carregando…</p>";
  const p = await dstBuscar("painel");
  if (p === null || meu !== dstPedidoLista) return;
  if (!p.sucesso) { alvo.innerHTML = p.semConexao ? DST_SEM_CONEXAO : `<p class='subtitle'>${dstH(p.mensagem)}</p>`; return; }
  const l = await dstBuscar("lista");
  if (l === null || meu !== dstPedidoLista) return;
  if (!l.sucesso) { alvo.innerHTML = l.semConexao ? DST_SEM_CONEXAO : `<p class='subtitle'>${dstH(l.mensagem)}</p>`; return; }
  const porId = new Map((Array.isArray(p.distritos) ? p.distritos : []).map((d) => [Number(d.distritoId), d]));
  const lista = Array.isArray(l.distritos) ? l.distritos : [];
  if (!lista.length) {
    alvo.innerHTML = "<p class='subtitle'>Nenhum Distrito cadastrado no seu alcance. O Distrito nasce no cadastro (Catálogos → Distritos, com os Quadrantes, as Regiões e as Áreas) e fica ativo pelo decreto da CLI, registrado aqui.</p>";
    return;
  }
  alvo.innerHTML = `<div class="tabela-rolagem"><table class="tabela-frequencia"><thead><tr><th>Distrito</th><th>Situação</th><th>Congregações</th><th>Pastor Distrital</th><th>Sinais</th><th></th></tr></thead><tbody>${lista.map((d) => {
    const painel = porId.get(Number(d.distritoId));
    const extra = painel && Array.isArray(painel.aguardandoNIF) && painel.aguardandoNIF.length ? [`📨 Balanço esperando o NIF: ${painel.aguardandoNIF.map((b) => b.ano).join(", ")}.`] : [];
    const sinais = dstSinais(painel && painel.sinais, extra);
    const situacao = d.intervencaoAberta ? "🛑 Sob intervenção" : (d.ativo ? `Ativo${d.ativadoEm ? ` desde ${dstH(dstBr(d.ativadoEm))}` : ""}${d.legado ? " (sem o decreto registrado)" : ""}` : "Inativo (só no cadastro)");
    return `<tr><td><strong>${dstH(d.nome)}</strong></td><td>${situacao}</td><td>${dstH(d.congregacoes)}</td><td>${dstH(d.pastor || "—")}</td>
      <td>${sinais.length ? `<ul>${sinais.map((s) => `<li>${dstH(s)}</li>`).join("")}</ul>` : "—"}</td>
      <td><button type="button" class="btn-link" aria-label="Abrir o Distrito ${dstH(d.nome)}" data-on-click="dstAbrirFichaAcao" data-args-click="${argsAttr(Number(d.distritoId))}">Abrir</button></td></tr>`;
  }).join("")}</tbody></table></div>`;
}

// ================================================================ a ficha ================================================================
async function dstAbrirFichaAcao(distritoId) {
  const id = Number(distritoId);
  if (!Number.isInteger(id) || id <= 0) return;
  const meu = ++dstPedidoFicha;
  dstForm = null;
  dstMensagem("dstMsgFicha", "");
  const bloco = dstEl("dstBlocoFicha"); if (bloco) bloco.style.display = "block";
  dstEl("dstFicha").innerHTML = "<p class='subtitle'>Carregando…</p>";
  const r = await dstBuscar(`ficha?distritoId=${encodeURIComponent(id)}`);
  if (r === null || meu !== dstPedidoFicha) return;
  if (!r.sucesso || !r.distrito) { dstFicha = null; dstEl("dstFicha").innerHTML = r.semConexao ? DST_SEM_CONEXAO : `<p class='subtitle'>${dstH(r.mensagem)}</p>`; return; }
  dstFicha = r.distrito;
  dstRenderFicha();
  if (bloco && typeof bloco.scrollIntoView === "function") bloco.scrollIntoView({ behavior: "smooth", block: "start" });
}
function dstFecharFichaAcao() {
  dstPedidoFicha++; dstFicha = null; dstForm = null;
  dstEl("dstFicha").innerHTML = "";
  dstMensagem("dstMsgFicha", "");
  const bloco = dstEl("dstBlocoFicha"); if (bloco) bloco.style.display = "none";
}
const dstBotao = (rotulo, chave, fixos) => `<button type="button" class="btn-confirmar btn-secundario" style="width:auto;margin:2px;" data-on-click="dstAbrirFormAcao" data-args-click="${argsAttr(String(chave), fixos || {})}">${rotulo}</button>`;
const dstPessoas = (lista, vazio) => (Array.isArray(lista) && lista.length ? lista.map((p) => `${dstH(p.nome)} <small>(mat. ${dstH(p.membroId)})</small>`).join(", ") : vazio);

function dstRenderFicha() {
  const d = dstFicha;
  if (!d) return;
  const digitado = dstForm ? dstCamposDigitados() : null;   // a ficha repintada não apaga o que foi escrito
  const a = d.acoes || {};
  const per = d.periodoAberto;
  const decreto = per
    ? (per.legado ? "<p>Ativo pelo cadastro antigo, <strong>sem o decreto da CLI registrado</strong>.</p>"
      : `<p>Ativo desde <strong>${dstH(dstBr(per.ativadoEm))}</strong> por decreto da CLI — ${dstH(per.gatilhoRotulo)}: ${dstH(per.cidade)}/${dstH(per.uf)}${per.populacao ? `, ${dstH(Number(per.populacao).toLocaleString("pt-BR"))} habitantes (${dstH(per.fontePopulacao)})` : ""}.</p>
         <p class="subtitle">${dstH(per.fundamentacao)}</p>`) + `<p><small>O repasse das congregações do território é do Distrito desde ${dstH(dstMes(per.financeiroDesdeMes))}.</small></p>`
    : "<p>Inativo: só no cadastro. Fica ativo pelo decreto da CLI (Regimento, Art. 126-K §2º).</p>";
  const sinais = dstSinais(d.sinais);
  const terr = d.territorio || {};
  const congs = Array.isArray(terr.congregacoes) ? terr.congregacoes : [];
  const cde = d.cde || {};
  const fin = d.financeiro || {};
  const meses = Array.isArray(fin.meses) ? fin.meses : [];
  const bals = Array.isArray(d.balancos) ? d.balancos : [];
  const ivs = Array.isArray(d.intervencoes) ? d.intervencoes : [];
  const pers = Array.isArray(d.periodos) ? d.periodos : [];
  const botoes = [
    a.ativar ? dstBotao(per && per.legado ? "🏛️ Registrar o decreto da CLI" : "🏛️ Ativar (decreto da CLI)", "ativar") : "",
    a.desativar ? dstBotao("🏛️ Desativar (decreto da CLI)", "desativar") : "",
    a.intervir ? dstBotao("🛑 Decretar intervenção", "intervir") : "",
    a.encerrarIntervencao ? dstBotao("✅ Encerrar a intervenção", "encerrar") : "",
    a.enviarBalanco && Array.isArray(d.anosParaBalanco) && d.anosParaBalanco.length ? dstBotao("📨 Enviar o balanço anual ao NIF", "balanco") : ""
  ].filter(Boolean).join(" ");
  dstEl("dstFicha").innerHTML = `
    <h4>🗺️ ${dstH(d.nome)}</h4>
    ${decreto}
    ${sinais.length ? `<ul>${sinais.map((s) => `<li>${dstH(s)}</li>`).join("")}</ul>` : ""}
    ${botoes ? `<div class="barra-lista">${botoes}</div>` : ""}
    <div id="dstFormAcao"></div>
    <h4>📍 Território (${dstH((terr.quadrantes || []).length)} Quadrante(s), ${dstH((terr.regioes || []).length)} Região(ões))</h4>
    ${congs.length ? `<div class="tabela-rolagem"><table class="tabela-frequencia"><thead><tr><th>Congregação</th><th>Área</th><th>Região</th><th>Quadrante</th></tr></thead><tbody>${congs.map((c) => `
      <tr><td>${dstH(c.nome)}${c.ativa ? "" : " <small>(inativa)</small>"}</td><td>${dstH(c.area)}</td><td>${dstH(c.regiao)}</td><td>${dstH(c.quadrante)}</td></tr>`).join("")}</tbody></table></div>`
      : "<p class='subtitle'>Nenhuma congregação ligada: monte o território em Catálogos (Quadrantes → Regiões → Áreas).</p>"}
    <h4>🧭 CDE — Conselho Distrital Eclesiástico (Regimento, Art. 126-L, II)</h4>
    <ul><li>Pastor Distrital: ${dstPessoas(cde.pastor, "—")}</li>${Array.isArray(cde.interventor) && cde.interventor.length ? `<li>Interventor: ${dstPessoas(cde.interventor, "—")}</li>` : ""}
      <li>Vice-Presidentes de Quadrante: ${dstPessoas(cde.vices, "nenhum")}</li><li>Superintendentes Regionais: ${dstPessoas(cde.superintendentes, "nenhum")}</li></ul>
    <h4>💰 Dízimo Institucional (${dstH(fin.percentual == null ? "" : fin.percentual)}% da arrecadação líquida consolidada — Art. 126-N, I)</h4>
    ${meses.length ? `<div class="tabela-rolagem"><table class="tabela-frequencia"><thead><tr><th>Mês</th><th>Fechamentos</th><th>Soma do Total Final</th><th>Dízimo</th><th>Situação</th><th>Vence</th></tr></thead><tbody>${meses.map((m) => `
      <tr><td>${dstH(dstMes(m.mes))}</td><td>${dstH(m.fechadas)} de ${dstH(m.congregacoes)}${Array.isArray(m.faltam) && m.faltam.length ? `<br><small>falta: ${m.faltam.map((c) => dstH(c.nome)).join(", ")}</small>` : ""}</td>
      <td>${dstH(dstReais(m.soma))}</td><td>${dstH(dstReais(m.valor))}</td><td>${dstH(DST_SITUACAO_MES[m.situacao] || m.situacao)}${m.motivoVencido === "RETENCAO" ? " <strong>🚩 vencido</strong>" : (m.motivoVencido === "FECHAMENTO" ? " <strong>⏳ atrasado</strong>" : "")}</td><td>${dstH(dstBr(m.venceEm))}</td></tr>`).join("")}</tbody></table></div>
      <p class="subtitle">O registro do repasse fica em Financeiro → Repasses Institucionais (origem Distrito): o valor é calculado dos fechamentos, nunca digitado.</p>`
      : "<p class='subtitle'>Sem meses do Distrito ainda.</p>"}
    ${fin.caixa ? `<p><strong>Caixa do Distrito</strong> (o repasse das congregações dele, na conta única da igreja): recebido ${dstH(dstReais(fin.caixa.recebido))}${Number(fin.caixa.pendente) ? `, pendente de conferência ${dstH(dstReais(fin.caixa.pendente))}` : ""};
      Dízimo Institucional repassado ${dstH(dstReais(fin.caixa.dizimoRepassado))}; <strong>saldo ${dstH(dstReais(fin.caixa.saldo))}</strong>. O que o Distrito gasta aparece no balanço anual ao NIF.</p>` : ""}
    <h4>📒 Balanço anual ao NIF (Art. 126-M, II, e 53-D, I)</h4>
    ${bals.length ? `<ul>${bals.map((b) => `<li><strong>${dstH(b.ano)}</strong> (versão ${dstH(b.versao)}) — ${dstH(b.statusRotulo)}: receitas ${dstH(dstReais(b.receitas))}, despesas ${dstH(dstReais(b.despesas))}, saldo ${dstH(dstReais(b.saldoFinal))}
      <small>— enviado por ${dstH(b.enviadoPorNome)} em ${dstH(dstBr(b.enviadoEm))}${b.analisadoPorNome ? `; analisado por ${dstH(b.analisadoPorNome)} em ${dstH(dstBr(b.analisadoEm))}` : ""}</small>
      ${b.observacoes ? `<br><span class="subtitle">${dstH(b.observacoes)}</span>` : ""}${b.motivoDevolucao ? `<br><strong>Devolvido:</strong> ${dstH(b.motivoDevolucao)}` : ""}
      ${a.analisarBalanco && b.status === "ENVIADO" ? `<br>${dstBotao("✅ Aprovar", "analisar", { balancoId: Number(b.balancoId), decisao: "APROVAR", ano: Number(b.ano) })} ${dstBotao("↩️ Devolver", "analisar", { balancoId: Number(b.balancoId), decisao: "DEVOLVER", ano: Number(b.ano) })}` : ""}</li>`).join("")}</ul>`
      : "<p class='subtitle'>Nenhum balanço enviado.</p>"}
    <h4>🛑 Intervenções (Art. 126-N, III, e 126-P, II)</h4>
    ${ivs.length ? `<ul>${ivs.map((i) => `<li><strong>${dstH(i.motivoRotulo)}</strong> — decretada em ${dstH(dstBr(i.decretadaEm))}; Interventor: ${dstH(i.interventor && i.interventor.nome)};
      ${dstH(i.liderancasDestituidas)} acesso(s) da liderança encerrado(s)${i.medidas && i.medidas.length ? `; medidas: ${i.medidas.map(dstH).join("; ")}` : ""}.
      <br><span class="subtitle">${dstH(i.fundamentacao)}</span>${i.aberta ? "<br><strong>Aberta.</strong>" : `<br>Encerrada em ${dstH(dstBr(i.encerradaEm))}: ${dstH(i.resultado)}`}</li>`).join("")}</ul>`
      : "<p class='subtitle'>Nenhuma.</p>"}
    <h4>📜 Períodos de atividade</h4>
    ${pers.length ? `<ul>${pers.map((p) => `<li>${p.legado ? "Ativo pelo cadastro antigo" : `Decreto de ${dstH(dstBr(p.ativadoEm))}`} — repasse do Distrito desde ${dstH(dstMes(p.financeiroDesdeMes))}${p.desativadoEm
      ? `; desativado em ${dstH(dstBr(p.desativadoEm))} (a Sede volta a receber em ${dstH(dstMes(p.financeiroAteMes))}): ${dstH(p.desativacaoMotivo)}` : "; em vigor"}.</li>`).join("")}</ul>` : "<p class='subtitle'>Nunca esteve ativo.</p>"}`;
  if (dstForm) { dstRenderForm(); dstRestaurarCampos(digitado); }
}
function dstCamposDigitados() {
  const esp = dstForm ? dstEspec(dstForm.chave) : null;
  const v = {};
  for (const c of (esp ? esp.campos : [])) { const el = dstEl(`dstCampo_${c.id}`); if (el) v[c.id] = c.tipo === "check" ? !!el.checked : el.value; }
  return v;
}
function dstRestaurarCampos(v) {
  for (const [id, valor] of Object.entries(v || {})) {
    const el = dstEl(`dstCampo_${id}`);
    if (!el) continue;
    if (typeof valor === "boolean") el.checked = valor;
    else if (el.tagName !== "SELECT" || (el.options || []).some((o) => o.value === valor)) el.value = valor;
  }
}

// As especificações de cada ato. Campos: id, rotulo, tipo (texto, area, select, check, reuniaoCLI), max, obrigatorio. `conferir(corpo)`: o que a tela já sabe que o
// servidor recusaria (dito antes da pergunta); `confirmar(corpo)`: a pergunta do ato que não se desfaz.
function dstEspec(chave) {
  const d = dstFicha || {};
  const fixos = (dstForm && dstForm.fixos) || {};
  const nome = d.nome || "";
  switch (chave) {
    case "ativar": {
      const legado = !!(d.periodoAberto && d.periodoAberto.legado);
      return { titulo: `${legado ? "Registrar o decreto da CLI" : "Ativar"} — ${nome}`, acao: "ativar", campos: [
        { id: "sessaoId", rotulo: "Reunião da CLI que decretou (já realizada e encerrada)", tipo: "reuniaoCLI", obrigatorio: true },
        { id: "gatilho", rotulo: "Gatilho (Regimento, Art. 126-K §2º)", tipo: "select", opcoes: dstOpcoesDe("gatilhos"), obrigatorio: true },
        { id: "cidade", rotulo: "Cidade (2 a 150)", tipo: "texto", max: 150, obrigatorio: true },
        { id: "uf", rotulo: "UF", tipo: "select", opcoes: ((dstCatalogos && dstCatalogos.ufs) || []).map((u) => ({ codigo: u, rotulo: u })), obrigatorio: true },
        { id: "populacao", rotulo: "População (habitantes; obrigatória no gatilho b)", tipo: "texto", max: 13 },
        { id: "fontePopulacao", rotulo: "Fonte da população (ex.: IBGE, Censo 2022; obrigatória quando há população)", tipo: "texto", max: 200 },
        { id: "fundamentacao", rotulo: "Fundamentação do decreto (10 a 2.000)", tipo: "area", max: 2000, obrigatorio: true }],
        aviso: legado ? "O Distrito já estava ativo pelo cadastro antigo: o decreto só fica registrado (o mês do repasse não muda)."
          : "O território é o que o cadastro liga ao Distrito. A partir deste mês, o repasse das congregações dele vai para o Distrito (não entra no Rateio Geral da Sede).",
        conferir: (c) => (c.gatilho === "MILHAO" && !(Number(String(c.populacao || "").replace(/[.\s]/g, "")) > 1000000) ? "No gatilho (b), informe a população: mais de 1.000.000 de habitantes." : null),
        confirmar: () => (legado ? `Registrar o decreto da CLI para o Distrito "${nome}"?`
          : `Ativar o Distrito "${nome}" pelo decreto da CLI? A partir deste mês o repasse das congregações do território vai para o Distrito, que repassa só o Dízimo Institucional à Sede.`) };
    }
    case "desativar": return { titulo: `Desativar — ${nome}`, acao: "desativar", campos: [
      { id: "sessaoId", rotulo: "Reunião da CLI que decretou (já realizada e encerrada)", tipo: "reuniaoCLI", obrigatorio: true },
      { id: "motivo", rotulo: "Motivo (10 a 2.000)", tipo: "area", max: 2000, obrigatorio: true }],
      confirmar: () => `Desativar o Distrito "${nome}"? O acesso de toda a liderança de escopo do Distrito termina, as sessões dela caem e, a partir deste mês, o repasse das congregações volta para a Sede.` };
    case "intervir": return { titulo: `Intervenção imediata — ${nome}`, acao: "intervir", campos: [
      { id: "motivo", rotulo: "Motivo", tipo: "select", opcoes: dstOpcoesDe("motivos"), obrigatorio: true },
      { id: "fundamentacao", rotulo: "Fundamentação: o que aconteceu (20 a 4.000)", tipo: "area", max: 4000, obrigatorio: true },
      { id: "interventorMembroId", rotulo: "Matrícula do Interventor (membro ativo, em comunhão, de fora da liderança do Distrito)", tipo: "texto", max: 10, obrigatorio: true },
      ...dstOpcoesDe("medidas").map((m) => ({ id: m.codigo, rotulo: `Determinar: ${m.rotulo}`, tipo: "check" }))],
      aviso: "Ato do Pastor Presidente (Regimento, Art. 126-N, III, e Art. 126-P, II). As medidas marcadas ficam registradas; a execução delas (banco, cartório, polícia, Justiça) é feita por gente.",
      conferir: (c) => (/^[1-9][0-9]{0,9}$/.test(c.interventorMembroId) ? null : "A matrícula do Interventor é um número."),
      confirmar: () => `Decretar a intervenção no Distrito "${nome}"? Na mesma hora o acesso de toda a liderança do Distrito termina (o Pastor Distrital, quem tem escopo do Distrito, os Vice-Presidentes de Quadrante e os Superintendentes Regionais do território), as delegações deles são canceladas e as sessões caem. Isto não se desfaz.` };
    case "encerrar": return { titulo: `Encerrar a intervenção — ${nome}`, acao: "encerrar", campos: [
      { id: "resultado", rotulo: "Resultado da intervenção (10 a 2.000)", tipo: "area", max: 2000, obrigatorio: true }],
      confirmar: () => `Encerrar a intervenção no Distrito "${nome}"? O acesso do Interventor termina; o novo Pastor Distrital recebe o acesso em Liderança.` };
    case "balanco": return { titulo: `Balanço anual ao NIF — ${nome}`, acao: "balanco", campos: [
      { id: "ano", rotulo: "Ano", tipo: "select", opcoes: (Array.isArray(d.anosParaBalanco) ? d.anosParaBalanco : []).map((x) => ({ codigo: String(x), rotulo: String(x) })), obrigatorio: true },
      { id: "receitas", rotulo: "Receitas do ano (R$)", tipo: "texto", max: 20, obrigatorio: true },
      { id: "despesas", rotulo: "Despesas do ano (R$)", tipo: "texto", max: 20, obrigatorio: true },
      { id: "saldoFinal", rotulo: "Saldo em 31/12 (R$; pode ser negativo)", tipo: "texto", max: 20, obrigatorio: true },
      { id: "observacoes", rotulo: "Observações (até 2.000)", tipo: "area", max: 2000 }],
      aviso: "O Distrito envia só o Balanço Consolidado da metrópole (Regimento, Art. 126-M, II), até 31/03 do ano seguinte. Valores com vírgula ou ponto (ex.: 1.234,56).",
      confirmar: (c) => `Enviar ao NIF o balanço de ${c.ano} do Distrito "${nome}"? Depois de enviado, só muda se o NIF devolver.` };
    case "analisar": {
      const devolver = fixos.decisao === "DEVOLVER";
      return { titulo: `${devolver ? "Devolver" : "Aprovar"} o balanço de ${fixos.ano || ""} — ${nome}`, acao: "analisar",
        campos: devolver ? [{ id: "motivo", rotulo: "Motivo da devolução: o que falta ou está errado (10 a 2.000)", tipo: "area", max: 2000, obrigatorio: true }] : [],
        confirmar: () => (devolver ? `Devolver ao Distrito o balanço de ${fixos.ano}? Ele corrige e reenvia.` : `Aprovar o balanço de ${fixos.ano} do Distrito "${nome}"? A aprovação não se desfaz.`) };
    }
    default: return null;
  }
}
function dstAbrirFormAcao(chave, fixos) {
  if (!dstFicha || !dstEspec(String(chave))) return;
  dstForm = { chave: String(chave), fixos: fixos && typeof fixos === "object" ? fixos : {} };
  dstRenderForm();
  const alvo = dstEl("dstFormAcao");
  if (alvo && typeof alvo.scrollIntoView === "function") alvo.scrollIntoView({ behavior: "smooth", block: "start" });
  const esp = dstEspec(dstForm.chave);
  const primeiro = esp.campos[0] ? dstEl(`dstCampo_${esp.campos[0].id}`) : null;
  if (primeiro && typeof primeiro.focus === "function") primeiro.focus();
}
function dstOpcoesReuniao() {
  if (dstReunioesFalhou) return "<option value=\"\">Não foi possível carregar as reuniões da CLI — saia da aba e entre de novo</option>";
  if (!dstReunioes.length) return "<option value=\"\">Nenhuma reunião da CLI encerrada — registre-a em Órgãos Centrais</option>";
  return `<option value="">— escolha —</option>${dstReunioes.map((s) => `<option value="${dstH(s.sessaoId)}">${dstH(dstBr(s.data))} — ${dstH(s.descricao || "reunião")}</option>`).join("")}`;
}
function dstRenderForm() {
  const alvo = dstEl("dstFormAcao");
  if (!alvo || !dstForm) return;
  const esp = dstEspec(dstForm.chave);
  if (!esp) { alvo.innerHTML = ""; return; }
  const campo = (c) => {
    const idEl = `dstCampo_${c.id}`;
    const max = Number(c.max) > 0 ? ` maxlength="${Number(c.max)}"` : "";
    if (c.tipo === "check") return `<div class="input-group"><label><input type="checkbox" id="${idEl}" /> ${dstH(c.rotulo)}</label></div>`;
    let entrada;
    if (c.tipo === "area") entrada = `<textarea id="${idEl}" rows="3" style="width:100%;"${max}></textarea>`;
    else if (c.tipo === "select") entrada = `<select id="${idEl}"><option value="">— escolha —</option>${(c.opcoes || []).map((o) => `<option value="${dstH(o.codigo)}">${dstH(o.rotulo)}</option>`).join("")}</select>`;
    else if (c.tipo === "reuniaoCLI") entrada = `<select id="${idEl}">${dstOpcoesReuniao()}</select>`;
    else entrada = `<input type="text" id="${idEl}"${max} />`;
    return `<div class="input-group"><label for="${idEl}">${dstH(c.rotulo)}</label>${entrada}</div>`;
  };
  alvo.innerHTML = `<div class="cartao-perfil ent-form">
    <h4>${dstH(esp.titulo)}</h4>${esp.aviso ? `<p class="subtitle">${dstH(esp.aviso)}</p>` : ""}
    ${esp.campos.map(campo).join("")}
    <p id="dstMsgForm" class="subtitle" role="status" aria-live="polite"></p>
    <div class="barra-lista"><button type="button" class="btn-confirmar" style="width:auto;" data-on-click="dstEnviarFormAcao">Salvar</button>
    <button type="button" class="btn-confirmar btn-secundario" style="width:auto;" data-on-click="dstCancelarFormAcao">Cancelar</button></div></div>`;
}
function dstCancelarFormAcao() { dstForm = null; const alvo = dstEl("dstFormAcao"); if (alvo) alvo.innerHTML = ""; }
async function dstEnviarFormAcao() {
  if (!dstForm || !dstFicha) return;
  const esp = dstEspec(dstForm.chave);
  if (!esp) return;
  const fixos = dstForm.fixos || {};
  const corpo = esp.acao === "analisar" ? { balancoId: Number(fixos.balancoId), decisao: fixos.decisao } : { distritoId: Number(dstFicha.distritoId) };
  for (const c of esp.campos) {
    const el = dstEl(`dstCampo_${c.id}`);
    if (!el) continue;
    corpo[c.id] = c.tipo === "check" ? !!el.checked : String(el.value || "").trim();
  }
  const faltando = esp.campos.filter((c) => c.obrigatorio && !corpo[c.id]).map((c) => c.rotulo.replace(/ \(.*$/, "").replace(/:.*$/, ""));
  const problema = faltando.length ? `Preencha: ${faltando.join("; ")}.` : (typeof esp.conferir === "function" ? esp.conferir(corpo) : null);
  if (problema) { dstMensagem("dstMsgForm", problema); return; }
  if (corpo.populacao === "") delete corpo.populacao;
  if (corpo.fontePopulacao === "") delete corpo.fontePopulacao;
  const pergunta = typeof esp.confirmar === "function" ? esp.confirmar(corpo) : null;
  const ficha = dstPedidoFicha;
  if (pergunta) {
    if (dstConfirmando) return;
    dstConfirmando = true;
    let sim;
    try { sim = await confirmarAcao(pergunta, "Confirmar"); } finally { dstConfirmando = false; }
    if (!sim) return;
  }
  if (ficha !== dstPedidoFicha || !dstForm) return;   // trocou de ficha (ou saiu) enquanto a pergunta estava aberta
  const distritoId = dstFicha.distritoId;
  const r = await dstPost(esp.acao, corpo, "dstMsgForm");
  if (!r) return;
  if (ficha !== dstPedidoFicha) {
    // trocou de ficha durante a gravação: nada vai para a ficha de agora; o que foi gravado aparece num aviso e a lista se atualiza
    if (r.sucesso && authToken) { mostrarToast(r.mensagem || "Feito.", "sucesso"); dstCarregarListaAcao(); }
    return;
  }
  const msg = r.mensagem || (r.sucesso ? "Feito." : "Não foi possível.");
  if (!r.sucesso) {
    dstMensagem("dstMsgForm", msg);
    const el = dstEl("dstMsgForm"); if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  dstForm = null;
  await dstAbrirFichaAcao(distritoId);
  if (!authToken) return;   // saiu enquanto relia a ficha
  if (dstFicha && Number(dstFicha.distritoId) === Number(distritoId)) {
    dstMensagem("dstMsgFicha", msg);
    const m = dstEl("dstMsgFicha"); if (m && typeof m.focus === "function") m.focus();   // o formulário sumiu: o foco vai para o resultado
  }
  dstCarregarListaAcao();
}

// ================================================================ Meus Dados ================================================================
// Os balanços que a pessoa enviou ao NIF e as intervenções em que teve a função de Interventor (LGPD Art. 18). Sem nada, o cartão não aparece.
function dstCartaoMeusDados(t) {
  const x = t && t.distritos;
  const bals = x && Array.isArray(x.balancosEnviados) ? x.balancosEnviados : [];
  const ivs = x && Array.isArray(x.intervencoesComoInterventor) ? x.intervencoesComoInterventor : [];
  if (!bals.length && !ivs.length) return "";
  return `<div class="cartao-perfil"><p class="linha-perfil"><strong>🗺️ Distritos</strong></p>
    ${bals.map((b) => `<p class="linha-perfil">Balanço de ${dstH(b.ano)} do ${dstH(b.distrito)} (versão ${dstH(b.versao)}) — ${dstH(b.status)}, enviado em ${dstH(dstBr(b.enviadoEm))}</p>`).join("")}
    ${ivs.map((i) => `<p class="linha-perfil">Interventor no ${dstH(i.distrito)} desde ${dstH(dstBr(i.decretadaEm))}${i.encerradaEm ? ` até ${dstH(dstBr(i.encerradaEm))}` : " (em curso)"}</p>`).join("")}</div>`;
}

registrarAcoes({ dstAbrirFichaAcao, dstFecharFichaAcao, dstAbrirFormAcao, dstCancelarFormAcao, dstEnviarFormAcao, dstCarregarListaAcao });
