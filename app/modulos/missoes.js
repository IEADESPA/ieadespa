// modulos/missoes.js — v9.4: Missões (Regimento Art. 23, 24 §2º, 44, 133-C §2º e 134 §6º, I). Toda regra mora no servidor (api/shared/missoes.js e missoesDb.js,
// rota /api/missoes); aqui só se monta a tela, na pílula "Missões" da aba Expansão. Entra quem tem a permissão "missoes" ou compõe a CME; o servidor diz o que cada
// pessoa pode fazer (catalogos.papeis e envio.acoes):
//  - Painel: os números (missionários, sustento comprometido e pago, os meses pagos sem relatório, batismos e conversões) e as pendências;
//  - Envios: a lista, o pedido novo (a SEMIADESPA) e a ficha com os atos (parecer da CME, decisão da CLI, Presidente, relatório, reajuste, encerramento);
//  - Campos: o cadastro (a abrangência é calculada pelo lugar);
//  - Sustento do mês: a prévia (gerado, a gerar, suspenso, impedido) e a geração (a Tesouraria Geral);
//  - Mural: a versão para imprimir e expor (só campos públicos; nomes só com autorização; nenhum valor por pessoa).
// Todo texto que vem do servidor passa por escaparHtmlEbd; toda resposta confere, depois de cada await, se o login ainda é o mesmo.

let misCatalogos = null;
let misReunioes = [];
let misReunioesFalhou = false;
let misSub = "painel";
let misFicha = null;           // o envio aberto (a resposta de /envio)
let misCampos = [];            // a lista dos campos (para editar)
let misPrevia = null;          // a prévia do sustento do mês
let misForm = null;            // o formulário aberto: { chave, fixos, alvo }
let misOcupado = false;
let misConfirmando = false;
let misPedidoFicha = 0;
let misPedidoSub = 0;
let misPedidoOpcoes = 0;
const MIS_SUBS = ["painel", "envios", "campos", "sustento", "mural"];
const misEl = (idEl) => document.getElementById(idEl);
const misBr = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
const misMes = (m) => (m ? `${String(m).slice(5, 7)}/${String(m).slice(0, 4)}` : "");
const misH = (v) => escaparHtmlEbd(v == null ? "" : String(v));
const misReais = (v) => `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MIS_SEM_CONEXAO = "<p class='subtitle'>Sem conexão com o servidor. Tente de novo.</p>";
const MIS_TAMANHO_MAXIMO = 15 * 1024 * 1024;
const MIS_SITUACAO = { GERADO: "✅ gerado", A_GERAR: "a gerar", SUSPENSO: "⏸️ suspenso", IMPEDIDO: "⚠️ impedido" };
const MIS_SAIDA = { APROVADA: "aprovada, a pagar", PAGA: "paga", PENDENTE: "pendente", CANCELADA: "cancelada", REJEITADA: "rejeitada" };

// O dono da resposta: a matrícula e o tipo de sessão (a confirmação reforçada, 428, troca o bilhete no meio do ato).
const misDono = () => (authToken ? `${authMatricula}|${typeof sessaoDeLiderancaNaTela === "function" && sessaoDeLiderancaNaTela() ? "senha" : "pin"}` : null);
async function misBuscar(caminho) {
  const dono = misDono();
  if (!dono) return null;
  let res;
  try { res = await fetchProtegido(`${API_BASE}/missoes/${caminho}`); } catch (e) { return misDono() === dono ? { semConexao: true } : null; }
  const data = await res.json().catch(() => ({ sucesso: false, mensagem: "Resposta inválida do servidor." }));
  return misDono() === dono ? data : null;
}
async function misPost(acao, corpo, alvoMsg) {
  if (misOcupado) { misMensagem(alvoMsg, "Aguarde: a gravação anterior ainda está em andamento."); return null; }
  misOcupado = true;
  const dono = misDono();
  try {
    let res;
    try { res = await fetchProtegido(`${API_BASE}/missoes/${acao}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }); } catch (e) {
      if (misDono() === dono) misMensagem(alvoMsg, "Sem conexão com o servidor. Tente de novo.");
      return null;
    }
    const data = await res.json().catch(() => ({ sucesso: false, mensagem: "Resposta inválida do servidor." }));
    if (misDono() !== dono) return null;
    return data;
  } finally {
    misOcupado = false;
  }
}
function misMensagem(idEl, texto) { const el = misEl(idEl); if (el) el.textContent = texto || ""; }
const misLista = (nome) => (misCatalogos && Array.isArray(misCatalogos[nome]) ? misCatalogos[nome] : []);
const misPapel = (nome) => !!(misCatalogos && misCatalogos.papeis && misCatalogos.papeis[nome]);
const misGere = () => misPapel("geral") || misPapel("semiadespa");
const misMesAtual = () => (typeof calHojeBrasilia === "function" ? String(calHojeBrasilia()).slice(0, 7) : new Date().toISOString().slice(0, 7));

// Troca de login ou saída: nada da sessão anterior fica na página (nem o que foi digitado).
function misLimparTela() {
  misCatalogos = null; misReunioes = []; misReunioesFalhou = false; misFicha = null; misCampos = []; misPrevia = null; misForm = null; misConfirmando = false;
  misPedidoFicha++; misPedidoSub++; misPedidoOpcoes++;
  misSub = "painel";
  for (const idEl of ["misPainel", "misEnvios", "misCamposLista", "misSustento", "misMural", "misFicha", "misFormNovo", "misFormCampo", "misMsgEnvios", "misMsgCampos", "misMsgSustento", "misMsgFicha"]) {
    const el = misEl(idEl); if (el) el.innerHTML = "";
  }
  const bloco = misEl("misBlocoFicha"); if (bloco) bloco.style.display = "none";
  misMarcarSub("painel");
}

// ================================================================ abrir a pílula ================================================================
async function misAbrirAcao() {
  const meu = ++misPedidoOpcoes;
  if (!misCatalogos) {
    const cat = await misBuscar("catalogos");
    if (cat === null || meu !== misPedidoOpcoes) return;
    if (!cat.sucesso) { misEl("misPainel").innerHTML = cat.semConexao ? MIS_SEM_CONEXAO : `<p class='subtitle'>${misH(cat.mensagem)}</p>`; misMarcarSub("painel"); return; }
    misCatalogos = cat;
  }
  // as reuniões da CLI só servem a quem registra a decisão (o nível geral): relidas a cada abertura (quem encerra a reunião em Órgãos Centrais e volta a encontra)
  if (misPapel("geral")) {
    const reu = await misBuscar("reunioes");
    if (reu === null || meu !== misPedidoOpcoes) return;
    misReunioesFalhou = !(reu && reu.sucesso && Array.isArray(reu.reunioes));
    misReunioes = misReunioesFalhou ? [] : reu.reunioes;
  }
  const novo = misEl("btnMisNovoEnvio"); if (novo) novo.style.display = misGere() ? "" : "none";
  const novoCampo = misEl("btnMisNovoCampo"); if (novoCampo) novoCampo.style.display = misGere() ? "" : "none";
  misMostrarSubAcao(misSub);
}
function misMarcarSub(sub) {
  misSub = MIS_SUBS.includes(sub) ? sub : "painel";
  for (const s of MIS_SUBS) {
    const div = misEl(`misSub${capitalize(s)}`); if (div) div.style.display = s === misSub ? "block" : "none";
    const b = misEl(`btnMisSub${capitalize(s)}`); if (b) { b.classList.toggle("ativo", s === misSub); b.setAttribute("aria-pressed", s === misSub ? "true" : "false"); }
  }
}
function misMostrarSubAcao(sub) {
  misMarcarSub(String(sub));
  if (!misCatalogos) return;
  if (misSub === "painel") misCarregarPainelAcao();
  if (misSub === "envios") misCarregarEnviosAcao();
  if (misSub === "campos") misCarregarCamposAcao();
  if (misSub === "sustento") misCarregarSustentoAcao();
  if (misSub === "mural") misCarregarMuralAcao();
}

// ================================================================ painel ================================================================
const misItemEnvio = (e, texto) => `<li><strong>${misH(e.missionario)}</strong> — campo ${misH(e.campo)}${texto ? ` — ${texto}` : ""}
  <button type="button" class="btn-link" aria-label="Abrir o envio de ${misH(e.missionario)}" data-on-click="misAbrirFichaAcao" data-args-click="${argsAttr(Number(e.envioId))}">Abrir</button></li>`;
const misBloco = (titulo, itens, vazio) => `<h4>${titulo}</h4>${itens.length ? `<ul>${itens.join("")}</ul>` : `<p class='subtitle'>${vazio}</p>`}`;
async function misCarregarPainelAcao() {
  const alvo = misEl("misPainel");
  if (!alvo) return;
  const meu = ++misPedidoSub;
  alvo.innerHTML = "<p class='subtitle'>Carregando…</p>";
  const p = await misBuscar("painel");
  if (p === null || meu !== misPedidoSub) return;
  if (!p.sucesso) { alvo.innerHTML = p.semConexao ? MIS_SEM_CONEXAO : `<p class='subtitle'>${misH(p.mensagem)}</p>`; return; }
  const t = p.totais || {};
  const arr = (x) => (Array.isArray(x) ? x : []);
  alvo.innerHTML = `
    ${p.semSecretario ? "<p>⚠️ Ninguém com o papel de Secretário de Missões (ou de Líder Geral da SEMIADESPA) em vigor: a CME fica sem ele (Regimento, Art. 23, I). Dê o acesso em Liderança.</p>" : ""}
    <div class="rolagem-tabela"><table class="tabela-frequencia"><tbody>
      <tr><th>Campos ativos</th><td>${misH(t.camposAtivos)}</td><th>Missionários no campo</th><td>${misH(t.missionariosAtivos)}</td></tr>
      <tr><th>Sustento mensal comprometido</th><td>${misH(misReais(t.sustentoComprometido))}</td><th>Sustento pago em ${misH(p.ano)}</th><td>${misH(misReais(t.pagoNoAno))}</td></tr>
      <tr><th>Gerado e ainda não pago</th><td>${misH(misReais(t.geradoNaoPago))}</td><th>Meses pagos sem relatório recebido</th><td><strong>${misH(t.mesesPagosSemRelatorio)}</strong> (${misH(misReais(t.valorPagoSemRelatorio))})</td></tr>
      <tr><th>Batismos em ${misH(p.ano)}</th><td>${misH(t.batismos)}</td><th>Conversões em ${misH(p.ano)}</th><td>${misH(t.conversoes)} <small>(em discipulado: ${misH(t.discipulado)})</small></td></tr>
    </tbody></table></div>
    <p class="subtitle">Campos por abrangência: ${arr(p.porAbrangencia).map((a) => `${misH(a.rotulo)}: ${misH(a.campos)}`).join(" · ")}</p>
    ${misBloco("⏰ Parecer da CME vencido (15 dias)", arr(p.parecerVencido).map((e) => misItemEnvio(e, `venceu em ${misH(misBr(e.prazo))}`)), "Nenhum.")}
    ${misBloco("🧭 Aguardando o parecer da CME", arr(p.emParecer).map((e) => misItemEnvio(e, `até ${misH(misBr(e.prazo))}`)), "Nenhum.")}
    ${misBloco("🏛️ Aguardando a decisão da CLI", arr(p.aguardandoCLI).map((e) => misItemEnvio(e)), "Nenhum.")}
    ${misBloco("✍️ Aguardando o Pastor Presidente", arr(p.aguardandoPresidente).map((e) => misItemEnvio(e)), "Nenhum.")}
    ${misBloco("📨 Relatórios de campo vencidos", arr(p.relatoriosAtrasados).map((e) => misItemEnvio(e, arr(e.periodos).map((x) => `${misH(misMes(x.inicio))}${x.fim !== x.inicio ? ` a ${misH(misMes(x.fim))}` : ""} (venceu em ${misH(misBr(x.prazo))})`).join(", "))), "Nenhum: todos em dia.")}
    ${misBloco("⏸️ Sustento suspenso (relatório vencido)", arr(p.suspensos).map((e) => misItemEnvio(e)), "Nenhum.")}
    ${misBloco("🚩 Sustento pago sem relatório recebido", arr(p.pagosSemRelatorio).map((e) => misItemEnvio(e, `${arr(e.meses).map(misMes).map(misH).join(", ")} (${misH(misReais(e.valor))})`)), "Nenhum.")}`;
}

// ================================================================ envios ================================================================
async function misCarregarEnviosAcao() {
  const alvo = misEl("misEnvios");
  if (!alvo) return;
  const meu = ++misPedidoSub;
  alvo.innerHTML = "<p class='subtitle'>Carregando…</p>";
  const r = await misBuscar("envios");
  if (r === null || meu !== misPedidoSub) return;
  if (!r.sucesso) { alvo.innerHTML = r.semConexao ? MIS_SEM_CONEXAO : `<p class='subtitle'>${misH(r.mensagem)}</p>`; return; }
  const lista = Array.isArray(r.envios) ? r.envios : [];
  if (!lista.length) { alvo.innerHTML = "<p class='subtitle'>Nenhum envio registrado ainda.</p>"; return; }
  alvo.innerHTML = `<div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr><th>Missionário</th><th>Campo</th><th>Situação</th><th>Sustento</th><th>Relatórios</th></tr></thead><tbody>${lista.map((e) => `
    <tr><td><button type="button" class="btn-link" id="misAbrir_${Number(e.envioId)}" aria-label="Abrir o envio de ${misH(e.missionario && e.missionario.nome)}" data-on-click="misAbrirFichaAcao" data-args-click="${argsAttr(Number(e.envioId))}"><strong>${misH(e.missionario && e.missionario.nome)}</strong></button></td>
    <td>${misH(e.campo && e.campo.nome)} <small>(${misH(e.campo && e.campo.lugar)})</small></td><td>${misH(e.statusRotulo)}${e.suspenso ? " <strong>⏸️ sustento suspenso</strong>" : ""}</td>
    <td>${e.sustentoVigente == null ? misH(misReais(e.sustentoProposto)) + " <small>(proposto)</small>" : misH(misReais(e.sustentoVigente))}</td>
    <td>${Number(e.relatoriosVencidos) ? `<strong>${misH(e.relatoriosVencidos)} vencido(s)</strong>` : "em dia"}</td></tr>`).join("")}</tbody></table></div>`;
}
function misNovoEnvioAcao() {
  if (!misGere()) return;
  misAbrirFormEm("envio", {}, "misFormNovo");
}

// ---- a ficha ----
async function misAbrirFichaAcao(envioId) {
  const id = Number(envioId);
  if (!Number.isInteger(id) || id <= 0) return;
  if (misSub !== "envios") { misMarcarSub("envios"); misCarregarEnviosAcao(); }
  const meu = ++misPedidoFicha;
  if (misForm && misForm.alvo === "misFormAcao") misForm = null;
  misMensagem("misMsgFicha", "");
  const bloco = misEl("misBlocoFicha"); if (bloco) bloco.style.display = "block";
  misEl("misFicha").innerHTML = "<p class='subtitle'>Carregando…</p>";
  const r = await misBuscar(`envio?envioId=${encodeURIComponent(id)}`);
  if (r === null || meu !== misPedidoFicha) return;
  if (!r.sucesso || !r.envio) { misFicha = null; misEl("misFicha").innerHTML = r.semConexao ? MIS_SEM_CONEXAO : `<p class='subtitle'>${misH(r.mensagem)}</p>`; return; }
  misFicha = r.envio;
  misRenderFicha();
  if (bloco && typeof bloco.scrollIntoView === "function") bloco.scrollIntoView({ behavior: "smooth", block: "start" });
  const titulo = misEl("misFichaTitulo"); if (titulo && typeof titulo.focus === "function") titulo.focus();
}
function misFecharFichaAcao() {
  const aberto = misFicha ? Number(misFicha.envioId) : null;
  misPedidoFicha++; misFicha = null;
  if (misForm && misForm.alvo === "misFormAcao") misForm = null;
  misEl("misFicha").innerHTML = "";
  misMensagem("misMsgFicha", "");
  const bloco = misEl("misBlocoFicha"); if (bloco) bloco.style.display = "none";
  const volta = aberto ? misEl(`misAbrir_${aberto}`) : null; if (volta && typeof volta.focus === "function") volta.focus();
}
const misBotao = (rotulo, chave, fixos) => `<button type="button" class="btn-confirmar btn-secundario" style="width:auto;margin:2px;" data-on-click="misAbrirFormAcao" data-args-click="${argsAttr(String(chave), fixos || {})}">${rotulo}</button>`;
function misCaminho(et) {
  const passos = ["pedido da SEMIADESPA"];
  if (et.cme) passos.push("parecer da CME");
  if (et.cli) passos.push("decisão da CLI");
  if (et.presidente) passos.push("concordância do Pastor Presidente");
  return passos.join(" → ");
}
function misRenderFicha() {
  const e = misFicha;
  if (!e) return;
  const digitado = misForm && misForm.alvo === "misFormAcao" ? misCamposDigitados() : null;
  const a = e.acoes || {};
  const arr = (x) => (Array.isArray(x) ? x : []);
  const pendentes = arr(e.periodos).filter((p) => !p.entregue);
  const botoes = [
    a.parecer ? misBotao("🧭 Dar o parecer da CME", "parecer") : "",
    a.decidir ? misBotao("🏛️ Registrar a decisão da CLI", "decidir") : "",
    a.presidente ? misBotao("✍️ Concordar ou recusar (Pastor Presidente)", "presidente") : "",
    a.relatorio && pendentes.length ? misBotao("📨 Lançar relatório de campo", "relatorio") : "",
    a.reajustar ? misBotao("💵 Reajustar o sustento", "reajustar") : "",
    a.encerrar ? misBotao("🏁 Encerrar o envio", "encerrar") : "",
    a.desistir ? misBotao("↩️ Registrar a desistência", "desistir") : ""
  ].filter(Boolean).join(" ");
  const sustento = e.sustentoVigente == null ? `${misH(misReais(e.sustentoProposto))} <small>(proposto)</small>` : `${misH(misReais(e.sustentoVigente))} <small>(vigente neste mês)</small>`;
  misEl("misFicha").innerHTML = `
    <h4 id="misFichaTitulo" tabindex="-1">🧭 ${misH(e.missionario && e.missionario.nome)} <small>(mat. ${misH(e.missionario && e.missionario.membroId)})</small></h4>
    <p><strong>${misH(e.statusRotulo)}</strong>${e.suspenso ? " — <strong>⏸️ sustento suspenso: há relatório de campo vencido</strong>" : ""}</p>
    <p>Campo <strong>${misH(e.campo && e.campo.nome)}</strong> — ${misH(e.campo && e.campo.lugar)} (${misH(e.campo && e.campo.abrangenciaRotulo)})</p>
    <p class="subtitle">Caminho deste envio: ${misH(misCaminho(e.etapas || {}))}.</p>
    <ul>
      <li>Sustento mensal: ${sustento}${e.fonteRotulo ? ` — ${misH(e.fonteRotulo)}${e.congregacaoFonte ? ` (${misH(e.congregacaoFonte.nome)})` : ""}` : ""}${e.recebedor ? `; recebe: ${misH(e.recebedor.nome)} (${misH(e.recebedor.tipo)})` : ""}</li>
      <li>Relatório de campo: ${misH(e.periodicidadeRotulo)}, vence no dia ${misH((misCatalogos && misCatalogos.diaPrazoRelatorio) || 10)} do mês seguinte ao fim do período</li>
      <li>Nome no mural: ${e.divulgarNome ? "autorizado" : "não autorizado (só a contagem)"}</li>
      ${e.documentoUrl ? `<li><a href="${urlSegura(e.documentoUrl)}" target="_blank" rel="noopener">📎 Documento do envio (termo de compromisso)</a></li>` : (e.temDocumento ? "<li>📎 Documento do envio anexado</li>" : "")}
      <li>Pedido por ${misH(e.solicitanteNome)} em ${misH(misBr(e.solicitadoEm))}${e.prazoParecer && e.status === "EM_PARECER" ? `; o parecer da CME vence em ${misH(misBr(e.prazoParecer))}${e.parecerVencido ? " <strong>(vencido)</strong>" : ""}` : ""}</li>
      ${e.parecer ? `<li>Parecer da CME: <strong>${misH(e.parecer.rotulo)}</strong> (${misH(e.parecer.porNome)}, ${misH(misBr(e.parecer.em))}) — ${misH(e.parecer.fundamentacao)}</li>` : ""}
      ${e.decisao ? `<li>CLI: <strong>${misH(e.decisao.rotulo)}</strong> na reunião de ${misH(misBr(e.decisao.em))}${e.decisao.urgencia ? " (regime de urgência)" : ""}${e.decisao.motivo ? ` — ${misH(e.decisao.motivo)}` : ""}</li>` : ""}
      ${e.presidente ? `<li>Pastor Presidente: <strong>${misH(e.presidente.rotulo)}</strong> em ${misH(misBr(e.presidente.em))}${e.presidente.motivo ? ` — ${misH(e.presidente.motivo)}` : ""}</li>` : ""}
      ${e.ativadoEm ? `<li>Ativo desde ${misH(misBr(e.ativadoEm))} (sustento e relatório desde ${misH(misMes(e.inicioMes))})</li>` : ""}
      ${e.encerradoEm ? `<li>Encerrado em ${misH(misBr(e.encerradoEm))}; último mês de sustento ${misH(misMes(e.fimMes))} — ${misH(e.motivoEncerramento)}</li>` : ""}
      ${e.desistencia ? `<li>Desistência em ${misH(misBr(e.desistencia.em))} — ${misH(e.desistencia.motivo)}</li>` : ""}
    </ul>
    <p class="subtitle">${misH(e.justificativa)}</p>
    ${botoes ? `<div class="barra-lista">${botoes}</div>` : ""}
    <div id="misFormAcao"></div>
    ${arr(e.periodos).length ? `<h4>📨 Relatórios de campo</h4><div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr><th>Período</th><th>Prazo</th><th>Situação</th></tr></thead><tbody>${arr(e.periodos).map((p) => `
      <tr><td>${misH(misMes(p.inicio))}${p.fim !== p.inicio ? ` a ${misH(misMes(p.fim))}` : ""}</td><td>${misH(misBr(p.prazo))}</td><td>${p.entregue ? "✅ recebido" : (p.vencido ? "<strong>🚩 vencido</strong>" : "em aberto")}</td></tr>`).join("")}</tbody></table></div>` : ""}
    ${arr(e.relatorios).length ? `<ul>${arr(e.relatorios).map((r) => `<li><strong>${misH(misMes(r.periodoInicio))}</strong>: ${misH(r.batismos)} batismo(s), ${misH(r.conversoes)} conversão(ões), ${misH(r.discipulado)} em discipulado
      <small>— recebido em ${misH(misBr(r.recebidoEm))} (${misH(r.registradoPorNome)})${r.retificadoEm ? `, corrigido em ${misH(misBr(r.retificadoEm))}` : ""}</small>
      <br><span class="subtitle">${misH(r.atividades)}</span>${r.pedidos ? `<br><small>Pedidos: ${misH(r.pedidos)}</small>` : ""}
      ${r.anexoUrl ? `<br><a href="${urlSegura(r.anexoUrl)}" target="_blank" rel="noopener">📎 Anexo</a>` : ""}
      ${a.relatorio ? `<br>${misBotao("✏️ Corrigir", "relatorio-corrigir", { relatorioId: Number(r.relatorioId) })}` : ""}</li>`).join("")}</ul>` : ""}
    ${arr(e.valores).length ? `<h4>💵 Sustento: valor e reajustes</h4><ul>${arr(e.valores).map((v) => `<li>Desde ${misH(misMes(v.desdeMes))}: <strong>${misH(misReais(v.valor))}</strong>${v.fonteRotulo ? ` — ${misH(v.fonteRotulo)}${v.congregacaoFonte ? ` (${misH(v.congregacaoFonte)})` : ""}` : ""}${v.recebedor ? `; recebe ${misH(v.recebedor)}` : ""}${v.motivo ? ` <small>— ${misH(v.motivo)}</small>` : ""}</li>`).join("")}</ul>` : ""}
    ${arr(e.geracoes).length ? `<h4>🧾 Pagamentos gerados (Contas a Pagar)</h4><div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr><th>Mês</th><th>Valor</th><th>Saída</th><th>Relatório</th></tr></thead><tbody>${arr(e.geracoes).map((g) => `
      <tr><td>${misH(misMes(g.mes))}</td><td>${misH(misReais(g.valor))}</td><td>nº ${misH(g.saidaId)} — ${misH(MIS_SAIDA[g.saidaStatus] || g.saidaStatus)}</td><td>${g.semRelatorio ? "<strong>🚩 sem relatório</strong>" : "✅"}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
  if (misForm && misForm.alvo === "misFormAcao") { misRenderForm(); misRestaurarCampos(digitado); }
}

// ================================================================ campos ================================================================
async function misCarregarCamposAcao() {
  const alvo = misEl("misCamposLista");
  if (!alvo) return;
  const meu = ++misPedidoSub;
  alvo.innerHTML = "<p class='subtitle'>Carregando…</p>";
  const todos = misEl("misCamposTodos") && misEl("misCamposTodos").checked ? "?todos=1" : "";
  const r = await misBuscar(`campos${todos}`);
  if (r === null || meu !== misPedidoSub) return;
  if (!r.sucesso) { alvo.innerHTML = r.semConexao ? MIS_SEM_CONEXAO : `<p class='subtitle'>${misH(r.mensagem)}</p>`; return; }
  misCampos = Array.isArray(r.campos) ? r.campos : [];
  if (!misCampos.length) { alvo.innerHTML = "<p class='subtitle'>Nenhum campo cadastrado.</p>"; return; }
  alvo.innerHTML = `<div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr><th>Campo</th><th>Onde</th><th>Abrangência</th><th>Divulgação</th><th>Missionários</th><th></th></tr></thead><tbody>${misCampos.map((c) => `
    <tr><td><strong>${misH(c.nome)}</strong>${c.status !== "ATIVO" ? ` <small>(encerrado em ${misH(misBr(c.encerradoEm))})</small>` : ""}${c.mantenedora ? `<br><small>mantenedora: ${misH(c.mantenedora.nome)}</small>` : ""}</td>
    <td>${misH(c.lugar)}</td><td>${misH(c.abrangenciaRotulo)}</td><td>${misH(c.divulgacaoRotulo)}</td><td>${misH(c.enviosAtivos)}</td>
    <td>${c.podeEditar ? `${misBotaoCampo("✏️ Editar", "campo-editar", c.campoId)} ${c.enviosVivos ? "" : misBotaoCampo("🏁 Encerrar", "campo-encerrar", c.campoId)}` : ""}</td></tr>`).join("")}</tbody></table></div>`;
}
const misBotaoCampo = (rotulo, chave, campoId) => `<button type="button" class="btn-confirmar btn-secundario" style="width:auto;margin:2px;" data-on-click="misAbrirFormCampoAcao" data-args-click="${argsAttr(String(chave), Number(campoId))}">${rotulo}</button>`;
function misNovoCampoAcao() { if (misGere()) misAbrirFormEm("campo", {}, "misFormCampo"); }
function misAbrirFormCampoAcao(chave, campoId) {
  const c = misCampos.find((x) => Number(x.campoId) === Number(campoId));
  if (!c || !misGere()) return;
  misAbrirFormEm(String(chave), { campoId: Number(c.campoId), nomeCampo: c.nome }, "misFormCampo",
    String(chave) === "campo-editar" ? { nome: c.nome, pais: c.pais, uf: c.uf || "", cidade: c.cidade || "", zonaRural: !!c.zonaRural,
      congregacaoMantenedoraId: c.mantenedora ? String(c.mantenedora.congregacaoId) : "", divulgacao: c.divulgacao, descricao: c.descricao || "" } : null);
}

// ================================================================ sustento do mês ================================================================
async function misCarregarSustentoAcao() {
  const alvo = misEl("misSustento");
  if (!alvo) return;
  const mesEl = misEl("misSustentoMes");
  if (mesEl && !mesEl.value) mesEl.value = misMesAtual();
  const mes = mesEl && /^\d{4}-\d{2}$/.test(mesEl.value) ? mesEl.value : misMesAtual();
  const meu = ++misPedidoSub;
  misMensagem("misMsgSustento", "");
  alvo.innerHTML = "<p class='subtitle'>Carregando…</p>";
  const r = await misBuscar(`sustento?mes=${encodeURIComponent(mes)}`);
  if (r === null || meu !== misPedidoSub) return;
  if (!r.sucesso) { misPrevia = null; alvo.innerHTML = r.semConexao ? MIS_SEM_CONEXAO : `<p class='subtitle'>${misH(r.mensagem)}</p>`; return; }
  misPrevia = r;
  const linhas = Array.isArray(r.linhas) ? r.linhas : [];
  const t = r.totais || {};
  const aGerar = linhas.filter((l) => l.situacao === "A_GERAR").length;
  alvo.innerHTML = `
    <p>Em ${misH(misMes(r.mes))}: a gerar ${misH(misReais(t.aGerar))} · já gerado ${misH(misReais(t.gerado))} · suspenso ${misH(misReais(t.suspenso))} · impedido ${misH(misReais(t.impedido))}.</p>
    ${linhas.length ? `<div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr><th>Missionário</th><th>Campo</th><th>Valor</th><th>De onde / quem recebe</th><th>Situação</th></tr></thead><tbody>${linhas.map((l) => `
      <tr><td>${misH(l.missionario)}</td><td>${misH(l.campo)}</td><td>${misH(misReais(l.valor))}</td>
      <td>${l.fonteRotulo ? misH(l.fonteRotulo) : ""}${l.congregacaoFonte ? ` (${misH(l.congregacaoFonte.nome)})` : ""}${l.recebedor ? `<br><small>${misH(l.recebedor.nome)} (${misH(l.recebedor.tipo)})</small>` : ""}</td>
      <td>${misH(MIS_SITUACAO[l.situacao] || l.situacao)}${l.saidaId ? ` <small>(Saída nº ${misH(l.saidaId)}, ${misH(MIS_SAIDA[l.saidaStatus] || l.saidaStatus)})</small>` : ""}${l.motivo ? `<br><small>${misH(l.motivo)}</small>` : ""}</td></tr>`).join("")}</tbody></table></div>`
      : "<p class='subtitle'>Nenhum envio com sustento neste mês.</p>"}
    ${r.podeGerar && aGerar ? `<div class="barra-lista"><button type="button" class="btn-confirmar" style="width:auto;" data-on-click="misGerarSustentoAcao">💵 Gerar o sustento de ${misH(misMes(r.mes))} (${aGerar} pagamento(s))</button></div>` : ""}
    ${!r.podeGerar ? "<p class='subtitle'>A geração é da Tesouraria Geral (a permissão \"financeiro\" do nível geral).</p>" : ""}`;
}
async function misGerarSustentoAcao() {
  if (!misPrevia || !misPrevia.podeGerar) return;
  const mes = misPrevia.mes;
  const aGerar = (misPrevia.linhas || []).filter((l) => l.situacao === "A_GERAR");
  if (!aGerar.length || misConfirmando) return;
  const total = aGerar.reduce((s, l) => s + Number(l.valor || 0), 0);
  misConfirmando = true;
  let sim;
  try {
    sim = await confirmarAcao(`Gerar o sustento de ${misMes(mes)}: ${aGerar.length} pagamento(s), ${misReais(total)}? Cada um vira uma Saída já aprovada no Contas a Pagar (a decisão do envio é a autorização). Os suspensos e impedidos ficam de fora.`, "Gerar");
  } finally { misConfirmando = false; }
  if (!sim) return;
  const r = await misPost("gerar", { mesReferencia: mes }, "misMsgSustento");
  if (!r) return;
  await misCarregarSustentoAcao();
  if (!authToken) return;
  misMensagem("misMsgSustento", r.mensagem || (r.sucesso ? "Feito." : "Não foi possível."));
}

// ================================================================ mural ================================================================
async function misCarregarMuralAcao() {
  const alvo = misEl("misMural");
  if (!alvo) return;
  const meu = ++misPedidoSub;
  alvo.innerHTML = "<p class='subtitle'>Carregando…</p>";
  const r = await misBuscar("mural");
  if (r === null || meu !== misPedidoSub) return;
  if (!r.sucesso) { alvo.innerHTML = r.semConexao ? MIS_SEM_CONEXAO : `<p class='subtitle'>${misH(r.mensagem)}</p>`; return; }
  const t = r.totais || {};
  const campos = Array.isArray(r.campos) ? r.campos : [];
  alvo.innerHTML = `
    <div class="barra-lista"><button type="button" class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="misImprimirMuralAcao">🖨️ Imprimir o mural</button></div>
    <div id="misMuralImprimivel" class="cartao-perfil">
      <h3>🌍 Missões IEADESPA — ${misH(r.ano)}</h3>
      <p><strong>${misH(t.missionarios)}</strong> missionário(s) em <strong>${misH(t.campos)}</strong> campo(s) · ${misH(t.batismos)} batismo(s) · ${misH(t.conversoes)} conversão(ões) · ${misH(t.discipulado)} pessoa(s) em discipulado</p>
      <p>Investido no sustento missionário em ${misH(r.ano)}: <strong>${misH(misReais(t.investidoNoAno))}</strong></p>
      ${campos.length ? campos.map((c) => `<div class="mis-mural-campo"><h4>${misH(c.nome)} <small>— ${misH(c.lugar)}</small></h4>
        <p>${c.missionarios.length ? `Missionário(s): ${c.missionarios.map(misH).join(", ")}${c.outrosMissionarios ? ` e mais ${misH(c.outrosMissionarios)}` : ""}` : (c.outrosMissionarios ? `${misH(c.outrosMissionarios)} missionário(s)` : "Frente sem missionário enviado")}</p>
        <p><small>${misH(c.batismos)} batismo(s) · ${misH(c.conversoes)} conversão(ões) · ${misH(c.discipulado)} em discipulado</small></p></div>`).join("") : "<p class='subtitle'>Nenhum campo de divulgação pública.</p>"}
      ${Number(r.camposRestritos) ? `<p><small>E mais ${misH(r.camposRestritos)} campo(s) de acesso restrito, com ${misH(r.missionariosRestritos)} missionário(s). Ore por eles.</small></p>` : ""}
    </div>`;
}
// A classe .mis-imprimindo (só o mural na folha) vale até o navegador dizer que acabou de imprimir (afterprint), como no boletim de oração.
function misImprimirMuralAcao() {
  const classes = document.body && document.body.classList;
  if (classes) classes.add("mis-imprimindo");
  const comEvento = typeof window.addEventListener === "function";
  try { window.print(); } finally { if (!comEvento && classes) classes.remove("mis-imprimindo"); }
}
function misDepoisDeImprimir() { const c = document.body && document.body.classList; if (c) c.remove("mis-imprimindo"); }
if (typeof window !== "undefined" && typeof window.addEventListener === "function") window.addEventListener("afterprint", misDepoisDeImprimir);

// ================================================================ formulários ================================================================
const misOpcoes = (nome) => misLista(nome).map((o) => ({ codigo: o.codigo, rotulo: o.rotulo }));
const misOpcoesCongregacoes = () => misLista("congregacoes").map((c) => ({ codigo: String(c.congregacaoId), rotulo: c.nome }));
const misOpcoesFornecedores = () => misLista("fornecedores").map((f) => ({ codigo: String(f.fornecedorId), rotulo: `${f.nome} (${f.tipo === "PJ" ? "pessoa jurídica — convênio externo" : "pessoa física"})${f.confirmado ? "" : " — dados bancários a confirmar"}` }));
const MIS_CAMPOS_DINHEIRO = () => [
  { id: "sustento", rotulo: "Sustento mensal (R$; 0 = sem sustento)", tipo: "texto", max: 12 },
  { id: "fonte", rotulo: "De onde sai o sustento", tipo: "select", opcoes: misOpcoes("fontes") },
  { id: "congregacaoFonteId", rotulo: "Congregação mantenedora que paga (quando sai do caixa local)", tipo: "select", opcoes: misOpcoesCongregacoes() },
  { id: "fornecedorId", rotulo: "Quem recebe (fornecedor do Contas a Pagar)", tipo: "select", opcoes: misOpcoesFornecedores() }
];
const misValorOk = (v) => /^\d{1,9}([.,]\d{1,2})?$/.test(String(v || "0").trim());
const misNumero = (v) => Number(String(v || "0").trim().replace(",", "."));
function misConferirDinheiro(c) {
  if (!misValorOk(c.sustento)) return "O sustento é um valor em reais (ex.: 1500,00), sem ponto de milhar.";
  if (misNumero(c.sustento) > 0) {
    if (!c.fonte) return "Com sustento, escolha de onde ele sai.";
    if (c.fonte === "CONGREGACAO" && !c.congregacaoFonteId) return "Escolha a congregação mantenedora que paga.";
    if (!c.fornecedorId) return "Com sustento, escolha quem recebe.";
  }
  return null;
}
// As especificações de cada ato. Campos: id, rotulo, tipo (texto, area, select, check, reuniaoCLI, mes, arquivo), max, obrigatorio.
function misEspec(chave) {
  const e = misFicha || {};
  const fixos = (misForm && misForm.fixos) || {};
  const quem = e.missionario ? e.missionario.nome : "";
  switch (chave) {
    case "campo":
    case "campo-editar": return { titulo: chave === "campo" ? "Novo campo missionário" : `Editar o campo ${fixos.nomeCampo || ""}`, acao: chave, campos: [
      { id: "nome", rotulo: "Nome do campo (2 a 150)", tipo: "texto", max: 150, obrigatorio: true },
      { id: "pais", rotulo: "País (em branco = Brasil)", tipo: "texto", max: 80 },
      { id: "uf", rotulo: "UF (no Brasil)", tipo: "select", opcoes: misLista("ufs").map((u) => ({ codigo: u, rotulo: u })) },
      { id: "cidade", rotulo: "Cidade (obrigatória no Brasil)", tipo: "texto", max: 150 },
      { id: "zonaRural", rotulo: "Zona rural adjacente a Parauapebas (no Pará)", tipo: "check" },
      { id: "congregacaoMantenedoraId", rotulo: "Congregação mantenedora (opcional)", tipo: "select", opcoes: misOpcoesCongregacoes() },
      { id: "divulgacao", rotulo: "Divulgação no mural", tipo: "select", opcoes: misOpcoes("divulgacoes"), obrigatorio: true },
      { id: "descricao", rotulo: "Descrição (até 1.000)", tipo: "area", max: 1000 }],
      aviso: "A abrangência sai do lugar: Parauapebas ou a zona rural adjacente é Local (a SEMIADESPA abre com autonomia — Regimento, Art. 44 §1º); outra cidade do Pará, Estadual; outro Estado, Nacional; outro país, Transcultural. Ela decide por onde o envio passa.",
      valoresIniciais: chave === "campo" ? { divulgacao: "RESTRITA" } : null };
    case "campo-encerrar": return { titulo: `Encerrar o campo ${fixos.nomeCampo || ""}`, acao: "campo-encerrar", campos: [
      { id: "motivo", rotulo: "Motivo (5 a 1.000)", tipo: "area", max: 1000, obrigatorio: true }],
      confirmar: () => `Encerrar o campo "${fixos.nomeCampo || ""}"? Ele sai da lista e do mural.` };
    case "envio": return { titulo: "Novo envio de missionário", acao: "envio", campos: [
      { id: "campoId", rotulo: "Campo", tipo: "select", opcoes: misLista("campos").map((c) => ({ codigo: String(c.campoId), rotulo: `${c.nome} — ${c.lugar}` })), obrigatorio: true },
      { id: "membroId", rotulo: "Matrícula do missionário (membro ativo, em comunhão)", tipo: "texto", max: 10, obrigatorio: true },
      ...MIS_CAMPOS_DINHEIRO(),
      { id: "documento", rotulo: "Documento do envio — o termo de compromisso assinado (PDF, JPG ou PNG; obrigatório com sustento)", tipo: "arquivo" },
      { id: "periodicidade", rotulo: "Relatório de campo", tipo: "select", opcoes: misOpcoes("periodicidades"), obrigatorio: true },
      { id: "divulgarNome", rotulo: "O missionário autorizou divulgar o nome no mural", tipo: "check" },
      { id: "justificativa", rotulo: "Justificativa: a obra, o público e como será sustentada (10 a 2.000)", tipo: "area", max: 2000, obrigatorio: true }],
      aviso: "Campo Local sem sustento fica ativo na hora. Com sustento, passa pelo Pastor Presidente (Art. 134 §6º, I). Fora do município, ou com convênio externo, passa pela CME e pela CLI (Art. 23, II); outro Estado ou país passa sempre pelo Presidente (Art. 44 §2º).",
      valoresIniciais: { sustento: "0", periodicidade: "MENSAL" },
      conferir: (c) => {
        if (!/^[1-9][0-9]{0,9}$/.test(c.membroId)) return "A matrícula do missionário é um número.";
        const p = misConferirDinheiro(c); if (p) return p;
        if (misNumero(c.sustento) > 0 && !c.documento) return "Com sustento, anexe o documento do envio (ele acompanha cada pagamento).";
        return null;
      },
      confirmar: () => "Registrar o pedido de envio? Ele segue as etapas do caso (a tela mostra o caminho na ficha)." };
    case "parecer": return { titulo: `Parecer da CME — ${quem}`, acao: "parecer", campos: [
      { id: "parecer", rotulo: "Parecer", tipo: "select", opcoes: misOpcoes("pareceres"), obrigatorio: true },
      { id: "fundamentacao", rotulo: "Fundamentação: a viabilidade estratégica (10 a 2.000)", tipo: "area", max: 2000, obrigatorio: true }],
      confirmar: () => `Registrar o parecer da CME sobre o envio de ${quem}? Depois dele, decide a CLI.` };
    case "decidir": return { titulo: `Decisão da CLI — ${quem}`, acao: "decidir", campos: [
      { id: "sessaoId", rotulo: "Reunião da CLI que decidiu (já realizada e encerrada)", tipo: "reuniaoCLI", obrigatorio: true },
      { id: "resultado", rotulo: "Resultado", tipo: "select", opcoes: misOpcoes("resultados"), obrigatorio: true },
      ...(e.status === "EM_PARECER" ? [{ id: "urgencia", rotulo: "Decidido em regime de urgência por 2/3 do Plenário, sem o parecer da CME (Regimento, Art. 24 §2º)", tipo: "check" }] : []),
      { id: "motivo", rotulo: "Motivo (obrigatório na recusa; até 1.000)", tipo: "area", max: 1000 }],
      conferir: (c) => (c.resultado === "REJEITADO" && String(c.motivo || "").length < 5 ? "Na recusa, informe o motivo." : (e.status === "EM_PARECER" && !c.urgencia ? "Sem o parecer da CME, a CLI só decide em regime de urgência por 2/3: marque a urgência se foi assim." : null)),
      confirmar: (c) => (c.resultado === "REJEITADO" ? `Registrar a recusa da CLI ao envio de ${quem}?` : `Registrar a aprovação da CLI ao envio de ${quem}?${e.etapas && e.etapas.presidente ? " Depois, falta a concordância do Pastor Presidente." : " O envio fica ativo."}`) };
    case "presidente": return { titulo: `Pastor Presidente — ${quem}`, acao: "presidente", campos: [
      { id: "resultado", rotulo: "Decisão", tipo: "select", opcoes: misOpcoes("resultadosPresidente"), obrigatorio: true },
      { id: "motivo", rotulo: "Motivo (obrigatório na recusa; até 1.000)", tipo: "area", max: 1000 }],
      aviso: `Sustento proposto: ${misReais(e.sustentoProposto)}${e.recebedor ? `, para ${e.recebedor.nome} (${e.recebedor.tipo})` : ""}. A concordância é a determinação expressa do sustento (Regimento, Art. 134 §6º, I) e ativa o envio.`,
      conferir: (c) => (c.resultado === "RECUSA" && String(c.motivo || "").length < 5 ? "Na recusa, informe o motivo." : null),
      confirmar: (c) => (c.resultado === "RECUSA" ? `Recusar o envio de ${quem}?` : `Concordar com o envio de ${quem}? O envio fica ativo e o sustento passa a ser gerado todo mês.`) };
    case "desistir": return { titulo: `Desistência — ${quem}`, acao: "desistir", campos: [
      { id: "motivo", rotulo: "Motivo (5 a 1.000)", tipo: "area", max: 1000, obrigatorio: true }],
      confirmar: () => `Registrar a desistência do envio de ${quem}? Não se desfaz.` };
    case "encerrar": return { titulo: `Encerrar o envio — ${quem}`, acao: "encerrar", campos: [
      { id: "ultimoMes", rotulo: "Último mês de sustento", tipo: "mes", obrigatorio: true },
      { id: "motivo", rotulo: "Motivo: o retorno, a troca de campo (5 a 1.000)", tipo: "area", max: 1000, obrigatorio: true }],
      valoresIniciais: { ultimoMes: misMesAtual() },
      confirmar: (c) => `Encerrar o envio de ${quem}? O último mês de sustento é ${misMes(c.ultimoMes)}.` };
    case "reajustar": return { titulo: `Reajustar o sustento — ${quem}`, acao: "reajustar", campos: [
      { id: "desdeMes", rotulo: "Vale a partir de", tipo: "mes", obrigatorio: true },
      ...MIS_CAMPOS_DINHEIRO(),
      { id: "documento", rotulo: "Novo documento (opcional; obrigatório se o envio ainda não tem)", tipo: "arquivo" },
      { id: "motivo", rotulo: "Motivo (5 a 1.000)", tipo: "area", max: 1000, obrigatorio: true }],
      aviso: "O reajuste vale do mês escolhido em diante (nunca para trás, nem num mês já gerado).",
      valoresIniciais: { desdeMes: misMesAtual(), sustento: e.sustentoVigente == null ? "" : String(e.sustentoVigente).replace(".", ",") },
      conferir: misConferirDinheiro,
      confirmar: (c) => `Reajustar o sustento de ${quem} para ${misReais(misNumero(c.sustento))} a partir de ${misMes(c.desdeMes)}?` };
    case "relatorio":
    case "relatorio-corrigir": {
      const rel = chave === "relatorio-corrigir" ? (Array.isArray(e.relatorios) ? e.relatorios : []).find((r) => Number(r.relatorioId) === Number(fixos.relatorioId)) : null;
      const pendentes = (Array.isArray(e.periodos) ? e.periodos : []).filter((p) => !p.entregue);
      return { titulo: rel ? `Corrigir o relatório de ${misMes(rel.periodoInicio)} — ${quem}` : `Relatório de campo — ${quem}`, acao: chave, campos: [
        ...(rel ? [] : [{ id: "periodoInicio", rotulo: "Período", tipo: "select", opcoes: pendentes.map((p) => ({ codigo: p.inicio, rotulo: `${misMes(p.inicio)}${p.fim !== p.inicio ? ` a ${misMes(p.fim)}` : ""}${p.vencido ? " (vencido)" : ""}` })), obrigatorio: true }]),
        { id: "batismos", rotulo: "Batismos no período", tipo: "texto", max: 6 },
        { id: "conversoes", rotulo: "Conversões no período", tipo: "texto", max: 6 },
        { id: "discipulado", rotulo: "Pessoas em discipulado", tipo: "texto", max: 6 },
        { id: "atividades", rotulo: "Atividades do período (10 a 4.000)", tipo: "area", max: 4000, obrigatorio: true },
        { id: "pedidos", rotulo: "Pedidos e necessidades (até 2.000)", tipo: "area", max: 2000 },
        { id: "anexo", rotulo: rel ? "Trocar o anexo (opcional; PDF, JPG ou PNG)" : "Anexo (opcional; PDF, JPG ou PNG)", tipo: "arquivo" }],
        valoresIniciais: rel ? { batismos: String(rel.batismos), conversoes: String(rel.conversoes), discipulado: String(rel.discipulado), atividades: rel.atividades || "", pedidos: rel.pedidos || "" }
          : { batismos: "0", conversoes: "0", discipulado: "0" },
        conferir: (c) => (["batismos", "conversoes", "discipulado"].some((k) => !/^\d{1,6}$/.test(String(c[k] || "0").trim())) ? "Os números são inteiros (0 ou mais)." : null) };
    }
    default: return null;
  }
}
function misAbrirFormAcao(chave, fixos) {
  if (!misFicha) return;
  misAbrirFormEm(String(chave), fixos && typeof fixos === "object" ? fixos : {}, "misFormAcao");
}
function misAbrirFormEm(chave, fixos, alvo, valores) {
  misForm = { chave, fixos: fixos || {}, alvo };
  const esp = misEspec(chave);
  if (!esp) { misForm = null; return; }
  for (const outro of ["misFormNovo", "misFormCampo", "misFormAcao"]) { if (outro !== alvo) { const el = misEl(outro); if (el) el.innerHTML = ""; } }
  misRenderForm();
  misRestaurarCampos(valores || esp.valoresIniciais || {});
  const el = misEl(alvo);
  if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior: "smooth", block: "start" });
  const primeiro = esp.campos[0] ? misEl(`misCampo_${esp.campos[0].id}`) : null;
  if (primeiro && typeof primeiro.focus === "function") primeiro.focus();
}
function misCamposDigitados() {
  const esp = misForm ? misEspec(misForm.chave) : null;
  const v = {};
  for (const c of (esp ? esp.campos : [])) { if (c.tipo === "arquivo") continue; const el = misEl(`misCampo_${c.id}`); if (el) v[c.id] = c.tipo === "check" ? !!el.checked : el.value; }
  return v;
}
function misRestaurarCampos(v) {
  for (const [id, valor] of Object.entries(v || {})) {
    const el = misEl(`misCampo_${id}`);
    if (!el || el.type === "file") continue;
    if (typeof valor === "boolean") el.checked = valor;
    else if (el.tagName !== "SELECT" || Array.from(el.options || []).some((o) => o.value === String(valor))) el.value = valor == null ? "" : String(valor);
  }
}
function misOpcoesReuniao() {
  if (misReunioesFalhou) return "<option value=\"\">Não foi possível carregar as reuniões da CLI — saia da aba e entre de novo</option>";
  if (!misReunioes.length) return "<option value=\"\">Nenhuma reunião da CLI encerrada — registre-a em Órgãos Centrais</option>";
  return `<option value="">— escolha —</option>${misReunioes.map((s) => `<option value="${misH(s.sessaoId)}">${misH(misBr(s.data))} — ${misH(s.descricao || "reunião")}</option>`).join("")}`;
}
function misRenderForm() {
  if (!misForm) return;
  const alvo = misEl(misForm.alvo);
  if (!alvo) return;
  const esp = misEspec(misForm.chave);
  if (!esp) { alvo.innerHTML = ""; return; }
  const campo = (c) => {
    const idEl = `misCampo_${c.id}`;
    const max = Number(c.max) > 0 ? ` maxlength="${Number(c.max)}"` : "";
    if (c.tipo === "check") return `<div class="input-group"><label><input type="checkbox" id="${idEl}" /> ${misH(c.rotulo)}</label></div>`;
    let entrada;
    if (c.tipo === "area") entrada = `<textarea id="${idEl}" rows="3" style="width:100%;"${max}></textarea>`;
    else if (c.tipo === "select") entrada = `<select id="${idEl}"><option value="">— escolha —</option>${(c.opcoes || []).map((o) => `<option value="${misH(o.codigo)}">${misH(o.rotulo)}</option>`).join("")}</select>`;
    else if (c.tipo === "reuniaoCLI") entrada = `<select id="${idEl}">${misOpcoesReuniao()}</select>`;
    else if (c.tipo === "mes") entrada = `<input type="month" id="${idEl}" />`;
    else if (c.tipo === "arquivo") entrada = `<input type="file" id="${idEl}" accept="application/pdf,image/jpeg,image/png" />`;
    else entrada = `<input type="text" id="${idEl}"${max} />`;
    return `<div class="input-group"><label for="${idEl}">${misH(c.rotulo)}</label>${entrada}</div>`;
  };
  alvo.innerHTML = `<div class="cartao-perfil ent-form">
    <h4>${misH(esp.titulo)}</h4>${esp.aviso ? `<p class="subtitle">${misH(esp.aviso)}</p>` : ""}
    ${esp.campos.map(campo).join("")}
    <p id="misMsgForm" class="subtitle" role="status" aria-live="polite"></p>
    <div class="barra-lista"><button type="button" class="btn-confirmar" style="width:auto;" data-on-click="misEnviarFormAcao">Salvar</button>
    <button type="button" class="btn-confirmar btn-secundario" style="width:auto;" data-on-click="misCancelarFormAcao">Cancelar</button></div></div>`;
}
function misCancelarFormAcao() { if (misForm) { const el = misEl(misForm.alvo); if (el) el.innerHTML = ""; } misForm = null; }
async function misLerArquivo(idCampo) {
  const el = misEl(`misCampo_${idCampo}`);
  const arquivo = el && el.files && el.files[0];
  if (!arquivo) return { nada: true };
  if (!["application/pdf", "image/jpeg", "image/png"].includes(arquivo.type)) return { erro: "O arquivo é PDF, JPG ou PNG." };
  if (arquivo.size > MIS_TAMANHO_MAXIMO) return { erro: "O arquivo passa de 15 MB." };
  try { return { base64: await lerArquivoComoBase64(arquivo), mime: arquivo.type }; } catch (e) { return { erro: "Não foi possível ler o arquivo." }; }
}
async function misEnviarFormAcao() {
  if (!misForm) return;
  const form = misForm;
  const esp = misEspec(form.chave);
  if (!esp) return;
  const fixos = form.fixos || {};
  const corpo = {};
  if (form.chave === "campo-editar" || form.chave === "campo-encerrar") corpo.campoId = Number(fixos.campoId);
  else if (form.chave === "relatorio-corrigir") corpo.relatorioId = Number(fixos.relatorioId);
  else if (form.alvo === "misFormAcao" && misFicha) corpo.envioId = Number(misFicha.envioId);
  const arquivos = [];
  for (const c of esp.campos) {
    const el = misEl(`misCampo_${c.id}`);
    if (!el) continue;
    if (c.tipo === "arquivo") { arquivos.push(c.id); corpo[c.id] = !!(el.files && el.files[0]); continue; }
    corpo[c.id] = c.tipo === "check" ? !!el.checked : String(el.value || "").trim();
  }
  const faltando = esp.campos.filter((c) => c.obrigatorio && !corpo[c.id]).map((c) => c.rotulo.replace(/ \(.*$/, "").replace(/:.*$/, ""));
  const problema = faltando.length ? `Preencha: ${faltando.join("; ")}.` : (typeof esp.conferir === "function" ? esp.conferir(corpo) : null);
  if (problema) { misMensagem("misMsgForm", problema); return; }
  // os arquivos viram base64 só agora (o servidor confere de novo o tipo e o tamanho)
  for (const id of arquivos) {
    delete corpo[id];
    const lido = await misLerArquivo(id);
    if (misForm !== form) return;
    if (lido.erro) { misMensagem("misMsgForm", lido.erro); return; }
    if (lido.nada) continue;
    const prefixo = id === "anexo" ? "anexo" : "documento";
    corpo[`${prefixo}Base64`] = lido.base64; corpo[`${prefixo}Mime`] = lido.mime;
  }
  for (const k of ["sustento", "batismos", "conversoes", "discipulado"]) if (typeof corpo[k] === "string") corpo[k] = corpo[k].replace(",", ".");
  for (const k of ["fonte", "congregacaoFonteId", "fornecedorId", "congregacaoMantenedoraId", "uf", "cidade", "pais", "pedidos", "descricao", "motivo"]) if (corpo[k] === "") delete corpo[k];
  const pergunta = typeof esp.confirmar === "function" ? esp.confirmar(corpo) : null;
  const ficha = misPedidoFicha;
  if (pergunta) {
    if (misConfirmando) return;
    misConfirmando = true;
    let sim;
    try { sim = await confirmarAcao(pergunta, "Confirmar"); } finally { misConfirmando = false; }
    if (!sim) return;
  }
  if (misForm !== form) return;   // o formulário fechou (ou trocou) enquanto a pergunta estava aberta
  if (form.alvo === "misFormAcao" && ficha !== misPedidoFicha) return;
  const envioId = misFicha ? misFicha.envioId : null;
  const r = await misPost(esp.acao, corpo, "misMsgForm");
  if (!r) return;
  const msg = r.mensagem || (r.sucesso ? "Feito." : "Não foi possível.");
  if (form.alvo === "misFormAcao" && ficha !== misPedidoFicha) {
    if (r.sucesso && authToken) { mostrarToast(msg, "sucesso"); misCarregarEnviosAcao(); }
    return;
  }
  if (!r.sucesso) {
    if (misForm === form) {
      misMensagem("misMsgForm", msg);
      const el = misEl("misMsgForm"); if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior: "smooth", block: "center" });
    } else mostrarToast(msg, "erro");
    return;
  }
  if (misForm === form) { const el = misEl(form.alvo); if (el) el.innerHTML = ""; misForm = null; }
  if (form.alvo === "misFormCampo") {
    misMensagem("misMsgCampos", msg);
    misCatalogos = null; await misRecarregarCatalogos();
    if (misSub === "campos") misCarregarCamposAcao();
    return;
  }
  if (form.alvo === "misFormNovo") {
    misMensagem("misMsgEnvios", msg);
    await misCarregarEnviosAcao();
    if (r.envioId && authToken) await misAbrirFichaAcao(r.envioId);
    return;
  }
  await misAbrirFichaAcao(envioId);
  if (!authToken) return;
  if (misFicha && Number(misFicha.envioId) === Number(envioId)) {
    misMensagem("misMsgFicha", msg);
    const m = misEl("misMsgFicha"); if (m && typeof m.focus === "function") m.focus();
  } else mostrarToast(msg, "sucesso");
  misCarregarEnviosAcao();
}
// O catálogo relido depois de mexer nos campos (a lista de campos do pedido de envio muda).
async function misRecarregarCatalogos() {
  const meu = ++misPedidoOpcoes;
  const cat = await misBuscar("catalogos");
  if (cat === null || meu !== misPedidoOpcoes) return;
  if (cat.sucesso) misCatalogos = cat;
}

// ================================================================ Meus Dados ================================================================
// Os envios da pessoa como missionária e os atos dela nos envios (LGPD Art. 18). Sem nada, o cartão não aparece.
function misCartaoMeusDados(t) {
  const envios = t && Array.isArray(t.missoes) ? t.missoes : [];
  const atos = t && Array.isArray(t.missoesAtos) ? t.missoesAtos : [];
  if (!envios.length && !atos.length) return "";
  return `<div class="cartao-perfil"><p class="linha-perfil"><strong>🌍 Missões</strong></p>
    ${envios.map((e) => `<p class="linha-perfil">Envio ao campo ${misH(e.campo)} — ${misH(e.status)}${e.inicio ? `, desde ${misH(misMes(e.inicio))}` : ""}${e.fim ? ` até ${misH(misMes(e.fim))}` : ""};
      relatório ${misH(String(e.periodicidade || "").toLowerCase())}, ${misH(e.relatoriosRecebidos)} recebido(s); nome no mural ${e.autorizouDivulgarNome ? "autorizado" : "não autorizado"}
      ${Array.isArray(e.sustento) && e.sustento.length ? `<br><small>Sustento: ${e.sustento.map((s) => `${misH(misReais(s.valor))} desde ${misH(misMes(s.desde))}`).join("; ")}</small>` : ""}</p>`).join("")}
    ${atos.map((x) => `<p class="linha-perfil">${misH(x.envio)} (${misH(misBr(x.em))}) — ${misH((Array.isArray(x.papeis) ? x.papeis : []).join(", "))}</p>`).join("")}</div>`;
}

registrarAcoes({
  misMostrarSubAcao, misCarregarPainelAcao, misCarregarEnviosAcao, misNovoEnvioAcao, misAbrirFichaAcao, misFecharFichaAcao, misAbrirFormAcao, misCarregarCamposAcao,
  misNovoCampoAcao, misAbrirFormCampoAcao, misCarregarSustentoAcao, misGerarSustentoAcao, misImprimirMuralAcao, misCancelarFormAcao, misEnviarFormAcao
});
