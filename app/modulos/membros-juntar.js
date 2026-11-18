// app/modulos/membros-juntar.js — FASE 10, v10.1b passo 6 (18/11/2026): JUNTAR FICHAS REPETIDAS, fiel ao desenho aprovado (rodada 8, tela 7, opção 3 — "Só
// o que é diferente": só os campos que não batem, um por cartão, com as duas opções para tocar; os iguais ficam escondidos e só contados), com a escala
// por nível (a local junta as duas da congregação, a área as da área, a Geral entre áreas) e as decisões do responsável: fica SEMPRE a matrícula mais
// antiga, o número que sobra vai para o próximo cadastro, a carteirinha física não sai com pendência e a assembleia geral avisa antes de abrir.
//   - a lista "Fichas repetidas" (mesmo nome e nascimento, ou marcadas), o "conferir duas fichas pelo número" e as junções feitas (desfazer: só a Geral);
//   - a comparação, a prévia do que vai junto e o que impede; "Não são a mesma pessoa" e "Juntar as fichas";
//   - na ficha 360, a faixa das pendências de cadastro (repetida, número a acertar, arrolamento) e "Marcar como repetida".
// No celular, tudo em coluna e os botões no fim da tela, dentro do conteúdo (nada preso embaixo — a regra do sistema). Mesmo escopo global dos outros módulos
// (vD.2); usa as ajudas de modulos/membros.js. Ações pelo registrarAcoes (CSP forte); tudo o que vem do servidor passa por escaparHtmlEbd/argsAttr.

let mjEstado = { itens: [], juncoes: [], podeDesfazerDias: 30, aberto: null, motivo: "", escolhas: {}, verIguais: false, erro: "", seq: 0, a: "", b: "", enviando: false };
const MJ_TIPO_PENDENCIA = { REPETIDA: "Pode ser a mesma pessoa de outra ficha", NUMERO: "Número da matrícula a conferir", ARROLAMENTO: "Arrolamento a completar" };

// o valor como a pessoa lê: os códigos das listas pelo nome (sexo, estado civil, escolaridade, forma de entrada, situação)
function mjValorTela(campo, valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (["sexo", "estadoCivil", "escolaridade", "formaAdmissao"].includes(campo)) return mbTextoDoValor(campo, valor) || String(valor);
  if (campo === "situacaoMembro") return mbTem(MB_SITUACAO, String(valor)) ? MB_SITUACAO[String(valor)] : String(valor);
  if (campo === "status") return mbTem(MB_STATUS_ROTULO, String(valor)) ? MB_STATUS_ROTULO[String(valor)] : String(valor);
  return String(valor);
}
const mjIc = (nome, tam) => (typeof iconeSvg === "function" ? iconeSvg(nome, tam || 18) : "");
function mjDataHora(iso) {
  const d = new Date(String(iso || ""));
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
async function mjLer(url) {
  try {
    const r = await fetchProtegido(url);
    const d = await r.json();
    return d || { sucesso: false, mensagem: "Não deu para ler." };
  } catch (e) { return { sucesso: false, mensagem: "Não deu para ler agora." }; }
}
async function mjEnviar(url, corpo) {
  try {
    const r = await fetchProtegido(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo || {}) });
    const d = await r.json();
    return d || { sucesso: false, mensagem: "Não deu para gravar." };
  } catch (e) { return { sucesso: false, mensagem: "Não deu para gravar agora." }; }
}

// ================================================================= a lista
async function mjAbrir() {
  const caixa = document.getElementById("subPessoasRepetidas");
  if (!caixa) return;
  const seq = ++mjEstado.seq;
  mjEstado.aberto = null;
  if (!mjEstado.itens.length) caixa.innerHTML = mbTopoHtml("Fichas repetidas", "Carregando…", "");
  const [lista, juncoes] = await Promise.all([mjLer(`${API_BASE}/fichas-repetidas`), mjLer(`${API_BASE}/fichas-repetidas/juncoes`)]);
  if (seq !== mjEstado.seq) return;
  mjEstado.erro = lista.sucesso ? "" : (lista.mensagem || "Não deu para ler a lista.");
  mjEstado.itens = Array.isArray(lista.itens) ? lista.itens : [];
  mjEstado.juncoes = Array.isArray(juncoes.itens) ? juncoes.itens : [];
  mjEstado.podeDesfazerDias = mbNum(juncoes.diasParaDesfazer) || 30;
  mjDesenharLista();
}
function mjSubtituloEscopo() {
  if (mbEhGeral()) return "Igreja toda · a Secretaria Geral junta fichas de qualquer congregação";
  if (typeof authNivel !== "undefined" && authNivel === "AREA") return "Sua área · você junta as fichas das congregações da área; entre áreas, só a Secretaria Geral";
  return "Sua congregação · você junta as fichas daqui; com uma ficha de outra congregação, a área ou a Secretaria Geral";
}
function mjDesenharLista() {
  const caixa = document.getElementById("subPessoasRepetidas");
  if (!caixa) return;
  const pessoa = (p) => `<span class="mj-pessoa"><strong>${escaparHtmlEbd(p.nome || "")}</strong><span class="mb-dica">${mbNum(p.matricula)} · ${escaparHtmlEbd(p.congregacao || "sem congregação")}${p.nascimento ? ` · nasc. ${escaparHtmlEbd(mbDataBr(p.nascimento))}` : ""}</span></span>`;
  const linhas = mjEstado.itens.map((d) => `<div class="mj-linha">
      <span class="mj-dupla">${pessoa(d.pessoas[0])}<span class="mj-e" aria-hidden="true">${mjIc("pessoas", 18)}</span>${pessoa(d.pessoas[1])}</span>
      <span class="mj-motivo"><span class="mb-chip mb-chip-ambar">${escaparHtmlEbd(d.motivo || "")}</span></span>
      <span class="mt-acoes"><button type="button" class="btn-confirmar mb-btn-pequeno" data-on-click="mjCompararAcao" data-args-click="${argsAttr(mbNum(d.a), mbNum(d.b), d.motivo || "")}">Conferir</button></span>
    </div>`).join("");
  const juncoes = mjEstado.juncoes.map((j) => `<div class="mj-linha mj-juncao">
      <span class="mj-pessoa"><strong>${escaparHtmlEbd(j.nome || "")}</strong><span class="mb-dica">ficou a ${mbNum(j.fica)} · a ${mbNum(j.sai)} deixou de existir</span></span>
      <span class="mb-dica">${escaparHtmlEbd(mjDataHora(j.juntadaEm))}${j.juntadaPor ? ` · por ${escaparHtmlEbd(j.juntadaPor)}` : ""} · ${mbFmt(j.registrosMovidos)} ${mbPlural(j.registrosMovidos, "registro", "registros")}</span>
      <span>${j.situacao === "DESFEITA" ? `<span class="mb-chip mb-chip-neutro">desfeita</span>` : `<span class="mb-chip mb-chip-verde">juntadas</span>`}</span>
      <span class="mt-acoes"><button type="button" class="btn-link" data-on-click="mbAbrirFichaAcao" data-args-click="${argsAttr(mbNum(j.fica))}">Ver a ficha</button>
        ${j.podeDesfazer ? `<button type="button" class="btn-confirmar btn-secundario mb-btn-pequeno" data-on-click="mjDesfazerAcao" data-args-click="${argsAttr(mbNum(j.juncaoId))}">Desfazer…</button>` : ""}</span>
    </div>`).join("");
  caixa.innerHTML = `
    ${mbTopoHtml("Fichas repetidas", mjSubtituloEscopo(), "")}
    ${mjEstado.erro ? `<p class="subtitle aviso-recusa">${escaparHtmlEbd(mjEstado.erro)}</p>` : ""}
    <section class="mb-cartao">
      <header class="mb-cartao-cabeca"><h4>${mjIc("alerta")} Possíveis repetidas (${mbFmt(mjEstado.itens.length)})</h4><span class="mb-dica">mesmo nome e mesma data de nascimento, ou marcadas por alguém</span></header>
      ${linhas || "<p class=\"mb-vazio-lista\">Nenhuma ficha repetida encontrada no seu alcance.</p>"}
    </section>
    <section class="mb-cartao mj-manual">
      <header class="mb-cartao-cabeca"><h4>${mjIc("busca")} Conferir duas fichas pelo número</h4><span class="mb-dica">quando a repetição não aparece na lista (nome escrito diferente, nascimento errado)</span></header>
      <div class="mj-manual-campos">
        <label>Matrícula<input type="text" inputmode="numeric" id="mjMatA" maxlength="10" value="${escaparHtmlEbd(mjEstado.a)}" data-on-input="mjNumeroAcao" data-args-input="${argsAttr("a", ARG.valor)}" /></label>
        <label>e a matrícula<input type="text" inputmode="numeric" id="mjMatB" maxlength="10" value="${escaparHtmlEbd(mjEstado.b)}" data-on-input="mjNumeroAcao" data-args-input="${argsAttr("b", ARG.valor)}" /></label>
        <button type="button" class="btn-confirmar btn-secundario mb-btn" data-on-click="mjConferirNumerosAcao">Conferir</button>
      </div>
    </section>
    <section class="mb-cartao">
      <header class="mb-cartao-cabeca"><h4>${mjIc("relogio")} Junções feitas</h4><span class="mb-dica">${mbEhGeral() ? `a Secretaria Geral desfaz em até ${mbFmt(mjEstado.podeDesfazerDias)} dias, se ninguém mexeu na ficha depois` : "para conferir; só a Secretaria Geral desfaz"}</span></header>
      ${juncoes || "<p class=\"mb-vazio-lista\">Nenhuma junção ainda.</p>"}
    </section>`;
}
function mjNumeroAcao(qual, valor) {
  const v = String(valor || "").replace(/\D/g, "").slice(0, 10);
  if (qual === "a") mjEstado.a = v; else if (qual === "b") mjEstado.b = v;
}
function mjConferirNumerosAcao() {
  const a = Number(mjEstado.a), b = Number(mjEstado.b);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a <= 0 || b <= 0) { mostrarToast("Informe as duas matrículas.", "erro"); return; }
  if (a === b) { mostrarToast("Informe duas matrículas diferentes.", "erro"); return; }
  mjCompararAcao(a, b);
}

// ================================================================= a comparação (opção 3: só o que é diferente)
async function mjCompararAcao(a, b, motivo) {
  const na = Number(a), nb = Number(b);
  if (!Number.isInteger(na) || !Number.isInteger(nb)) return;
  if (subAbaPessoasAtual !== "repetidas") mostrarSubAbaPessoas("repetidas");
  const caixa = document.getElementById("subPessoasRepetidas");
  const seq = ++mjEstado.seq;
  const d = await mjLer(`${API_BASE}/fichas-repetidas/comparar?a=${encodeURIComponent(String(na))}&b=${encodeURIComponent(String(nb))}`);
  if (seq !== mjEstado.seq) return;
  if (!d.sucesso) { mostrarToast(d.mensagem || "Fichas não encontradas.", "erro"); if (!mjEstado.itens.length) mjAbrir(); return; }
  mjEstado.aberto = d;
  mjEstado.motivo = typeof motivo === "string" ? motivo.slice(0, 80) : "";
  mjEstado.verIguais = false;
  mjEstado.escolhas = {};
  for (const c of d.campos || []) mjEstado.escolhas[c.campo] = c.pode ? (c.sugerido === "SAI" ? "SAI" : "FICA") : "FICA";
  if (caixa) mjDesenharComparacao();
}
function mjSubtituloDupla(d) {
  // o desenho aprovado (rodada 8, por nível): "Mesmo nome e mesma data de nascimento · as duas são de Vila Nova" / "... Vila Nova e Cidade Jardim: a área junta" /
  // "... de áreas diferentes: só a Secretaria Geral junta"
  const porque = mjEstado.motivo ? mjEstado.motivo.charAt(0).toUpperCase() + mjEstado.motivo.slice(1) : "Conferência pelo número";
  const f = d.fica.congregacao || "sem congregação", s = d.sai.congregacao || "sem congregação";
  if (f === s) return `${porque} · as duas são de ${f} · escolha o que fica em cada campo`;
  return d.papel === "GERAL" ? `${porque} · ${f} e ${s}: a Secretaria Geral junta` : `${porque} · ${f} e ${s}, as duas da sua área: a área junta`;
}
function mjDesenharComparacao() {
  const caixa = document.getElementById("subPessoasRepetidas");
  const d = mjEstado.aberto;
  if (!caixa || !d) return;
  const fica = d.fica, sai = d.sai;
  const opcao = (c, lado) => {
    const escolhido = mjEstado.escolhas[c.campo] === lado;
    const valor = mjValorTela(c.campo, lado === "FICA" ? c.fica : c.sai);
    return `<button type="button" class="mj-opcao${escolhido ? " mj-escolhida" : ""}" role="radio" aria-checked="${escolhido ? "true" : "false"}"${c.pode ? "" : " disabled"}
      data-on-click="mjEscolherAcao" data-args-click="${argsAttr(c.campo, lado)}"><span class="mj-radio" aria-hidden="true"></span>
      <span class="mj-valor">${valor === null || valor === undefined || valor === "" ? "<em>(em branco)</em>" : escaparHtmlEbd(valor)}</span>
      <span class="mb-dica">${mbNum(lado === "FICA" ? fica.matricula : sai.matricula)}</span></button>`;
  };
  const cartoes = (d.campos || []).map((c) => `<div class="mb-cartao mj-campo" role="radiogroup" aria-label="${escaparHtmlEbd(c.rotulo)}">
      <span class="mj-rotulo">${escaparHtmlEbd(c.rotulo)}</span>
      <div class="mj-opcoes">${opcao(c, "FICA")}${opcao(c, "SAI")}</div>
      ${c.pode ? "" : `<p class="mb-dica mj-trava">${mjIc("cadeado", 14)} ${escaparHtmlEbd(c.motivo || "Este campo fica como está na ficha mais antiga.")}</p>`}
    </div>`).join("");
  const previa = (d.previa || []).map((p) => `<li><strong>${mbFmt(p.n)}</strong> ${escaparHtmlEbd(p.rotulo)}</li>`).join("");
  const bloqueios = (d.bloqueios || []).map((b) => `<li>${escaparHtmlEbd(b)}</li>`).join("");
  const nIguais = mbNum(d.iguais);
  caixa.innerHTML = `
    <nav class="mb-trilha" aria-label="Onde você está"><button type="button" class="btn-link" data-on-click="mjVoltarAcao">← Fichas repetidas</button><span>›</span><span>${escaparHtmlEbd(fica.nome || "")}</span></nav>
    ${mbTopoHtml("Juntar fichas repetidas", mjSubtituloDupla(d), "")}
    <div class="mj-resumo">
      <span><strong>${mbFmt((d.campos || []).length)} ${mbPlural((d.campos || []).length, "campo diferente", "campos diferentes")}</strong> · ${mbFmt(nIguais)} ${mbPlural(nIguais, "campo igual nas duas fichas fica", "campos iguais nas duas fichas ficam")} como ${mbPlural(nIguais, "está", "estão")}</span>
      ${nIguais ? `<button type="button" class="btn-link" data-on-click="mjVerIguaisAcao" aria-expanded="${mjEstado.verIguais ? "true" : "false"}">${mjEstado.verIguais ? "(esconder)" : "(ver)"}</button>` : ""}
    </div>
    ${mjEstado.verIguais ? `<div class="mb-cartao mj-iguais"><ul class="mj-lista">${(d.iguaisLista || []).map((x) => `<li><span class="mb-dica">${escaparHtmlEbd(x.rotulo)}:</span> ${escaparHtmlEbd(mjValorTela(x.campo, x.valor) || "(em branco nas duas)")} <span class="mb-dica">· igual</span></li>`).join("")}</ul></div>` : ""}
    <div class="mb-cartao mj-campo mj-campo-fixo">
      <span class="mj-rotulo">Matrícula</span>
      <div class="mj-opcoes">
        <span class="mj-opcao mj-escolhida mj-fixa"><span class="mj-radio" aria-hidden="true"></span><span class="mj-valor">${mbNum(fica.matricula)}</span><span class="mb-dica">fica a mais antiga${fica.criadaEm ? ` · desde ${escaparHtmlEbd(mbDataBr(fica.criadaEm))}` : ""}</span></span>
        <span class="mj-opcao mj-fixa"><span class="mj-radio" aria-hidden="true"></span><span class="mj-valor">${mbNum(sai.matricula)}</span><span class="mb-dica">vai para o próximo cadastro novo</span></span>
      </div>
    </div>
    ${cartoes || "<p class=\"mb-vazio-lista\">As duas fichas têm os mesmos dados: só falta juntar.</p>"}
    <div class="mj-baixo">
      <section class="mb-cartao mj-previa">
        <header class="mb-cartao-cabeca"><h4>${mjIc("pasta")} O que vai junto para a ${mbNum(fica.matricula)}</h4></header>
        ${previa ? `<ul class="mj-lista">${previa}</ul>` : "<p class=\"mb-dica\">A ficha que sai não tem outros registros.</p>"}
        ${mbNum(d.arquivadas) ? `<p class="mb-dica">${mbFmt(d.arquivadas)} ${mbPlural(d.arquivadas, "registro repetido (o mesmo nas duas fichas) fica guardado", "registros repetidos (os mesmos nas duas fichas) ficam guardados")} à parte, para conferir.</p>` : ""}
        ${mbNum(d.descartadas) ? `<p class="mb-dica">${mbFmt(d.descartadas)} ${mbPlural(d.descartadas, "dado de acesso repetido (PIN, aviso) sai", "dados de acesso repetidos (PIN, avisos) saem")}; a pessoa usa o da ficha que fica.</p>` : ""}
      </section>
      ${bloqueios ? `<section class="mb-cartao mj-bloqueios" role="alert"><header class="mb-cartao-cabeca"><h4>${mjIc("alerta")} Antes de juntar</h4></header><ul class="mj-lista">${bloqueios}</ul></section>` : ""}
    </div>
    <div class="mj-rodape">
      <p class="mj-info">${mjIc("ajudaQ", 16)} As duas viram uma só: a <strong>${mbNum(sai.matricula)}</strong> deixa de existir e o histórico das duas fica na <strong>${mbNum(fica.matricula)}</strong>. Fica registrado quem juntou. A credencial que levava a ${mbNum(sai.matricula)} é cancelada.</p>
      <div class="mc-botoes">
        <button type="button" class="btn-confirmar btn-secundario mb-btn" data-on-click="mjNaoSaoAcao">Não são a mesma pessoa</button>
        <button type="button" class="btn-confirmar mb-btn" data-on-click="mjJuntarAcao"${d.podeJuntar && !mjEstado.enviando ? "" : " disabled"}>${mjIc("check", 18)} Juntar as fichas</button>
      </div>
    </div>`;
}
function mjEscolherAcao(campo, lado) {
  const d = mjEstado.aberto;
  if (!d || !["FICA", "SAI"].includes(lado)) return;
  const c = (d.campos || []).find((x) => x.campo === String(campo));
  if (!c || !c.pode) return;
  mjEstado.escolhas[c.campo] = lado;
  mjDesenharComparacao();
}
function mjVerIguaisAcao() { mjEstado.verIguais = !mjEstado.verIguais; mjDesenharComparacao(); }
function mjVoltarAcao() { mjEstado.aberto = null; mjAbrir(); }
async function mjJuntarAcao() {
  const d = mjEstado.aberto;
  if (!d || !d.podeJuntar || mjEstado.enviando) return;
  if (!(await confirmarAcao(`Juntar as fichas ${d.fica.matricula} e ${d.sai.matricula}? A ${d.sai.matricula} deixa de existir e tudo o que era dela passa para a ${d.fica.matricula}.`, "Juntar as fichas"))) return;
  mjEstado.enviando = true;
  mjDesenharComparacao();
  const escolhas = {};
  for (const c of d.campos || []) if (c.pode) escolhas[c.campo] = mjEstado.escolhas[c.campo] === "SAI" ? "SAI" : "FICA";
  const r = await mjEnviar(`${API_BASE}/fichas-repetidas/juntar`, { a: d.fica.matricula, b: d.sai.matricula, escolhas, versao: d.versao });
  mjEstado.enviando = false;
  if (!r.sucesso) {
    mostrarToast(r.mensagem || "Não deu para juntar.", "erro");
    if (/mudaram|confira de novo/i.test(r.mensagem || "")) { mjCompararAcao(d.fica.matricula, d.sai.matricula); return; }
    mjDesenharComparacao();
    return;
  }
  mostrarToast(r.mensagem || "Fichas juntadas.", "sucesso");
  mjEstado.aberto = null;
  mjEstado.itens = [];
  mjAbrir();
}
async function mjNaoSaoAcao() {
  const d = mjEstado.aberto;
  if (!d) return;
  if (!(await confirmarAcao(`As fichas ${d.fica.matricula} e ${d.sai.matricula} são de pessoas diferentes? A dupla sai da lista e não volta a aparecer.`, "Não são a mesma pessoa"))) return;
  const r = await mjEnviar(`${API_BASE}/fichas-repetidas/nao-sao-a-mesma`, { a: d.fica.matricula, b: d.sai.matricula });
  mostrarToast(r.mensagem || (r.sucesso ? "Anotado." : "Não deu para gravar."), r.sucesso ? "sucesso" : "erro");
  if (r.sucesso) { mjEstado.aberto = null; mjEstado.itens = []; mjAbrir(); }
}
async function mjDesfazerAcao(juncaoId) {
  const id = Number(juncaoId);
  if (!Number.isInteger(id) || id <= 0) return;
  const motivo = await pedirTexto("Por que desfazer esta junção?", "Ex.: eram duas pessoas diferentes");
  if (motivo === null) return;
  const r = await mjEnviar(`${API_BASE}/fichas-repetidas/desfazer`, { juncaoId: id, motivo });
  mostrarToast(r.mensagem || (r.sucesso ? "Junção desfeita." : "Não deu para desfazer."), r.sucesso ? "sucesso" : "erro");
  if (r.sucesso) mjAbrir();
}

// ================================================================= a faixa das pendências na ficha 360
async function mjPendenciasDaFicha(membroId) {
  const alvo = document.getElementById("mbFichaPendencias");
  if (!alvo) return;
  const id = Number(membroId);
  alvo.innerHTML = "";
  const d = await mjLer(`${API_BASE}/fichas-repetidas/pendencias?membroId=${encodeURIComponent(String(id))}`);
  if (!d.sucesso || Number(mbFicha.membroId) !== id) return;
  const itens = (d.pendencias || []).map((p) => {
    const outra = p.outra && p.outra.matricula ? p.outra : null;
    const acao = p.tipo === "REPETIDA" && outra ? `<button type="button" class="btn-link" data-on-click="mjCompararAcao" data-args-click="${argsAttr(id, mbNum(outra.matricula), "marcada como repetida")}">Conferir com a ${mbNum(outra.matricula)}</button>`
      : p.tipo === "NUMERO" ? `<button type="button" class="btn-link" data-on-click="mjConferirNumeroAcao" data-args-click="${argsAttr(mbNum(p.id))}">Número conferido…</button>` : "";
    const detalhe = p.tipo === "REPETIDA" ? (outra ? `${outra.nome ? escaparHtmlEbd(outra.nome) + " · " : ""}matrícula ${mbNum(outra.matricula)}` : "a outra ficha é de fora do seu alcance: a Secretaria Geral confere")
      : escaparHtmlEbd(p.detalhe || (p.tipo === "ARROLAMENTO" ? "a situação, a data e a forma de entrada a completar" : ""));
    return `<li><span class="mb-chip mb-chip-ambar">${escaparHtmlEbd(MJ_TIPO_PENDENCIA[p.tipo] || p.tipo)}</span> <span class="mb-dica">${detalhe}</span> ${acao}</li>`;
  }).join("");
  alvo.innerHTML = `<div class="mb-cartao mj-pendencias">
      ${itens ? `<ul class="mj-lista">${itens}</ul>` : ""}
      ${d.impressaoFisicaBloqueada ? `<p class="mb-dica">${mjIc("cadeado", 14)} A carteirinha física desta ficha não é impressa enquanto houver ficha repetida ou número a conferir.</p>` : ""}
      <button type="button" class="btn-link" data-on-click="mjMarcarAcao" data-args-click="${argsAttr(id)}">${itens ? "Marcar outra ficha repetida…" : "Esta pessoa tem outra ficha? Marcar como repetida…"}</button>
    </div>`;
}
async function mjMarcarAcao(membroId) {
  const id = Number(membroId);
  const outra = await pedirTexto("Qual é a matrícula da outra ficha desta pessoa?", "Ex.: 700981");
  if (outra === null) return;
  const n = Number(String(outra).replace(/\D/g, ""));
  if (!Number.isInteger(n) || n <= 0 || n === id) { mostrarToast("Informe a matrícula da outra ficha.", "erro"); return; }
  const r = await mjEnviar(`${API_BASE}/fichas-repetidas/marcar`, { a: id, b: n });
  mostrarToast(r.mensagem || (r.sucesso ? "Marcada." : "Não deu para marcar."), r.sucesso ? "sucesso" : "erro");
  if (r.sucesso) mjPendenciasDaFicha(id);
}
async function mjConferirNumeroAcao(pendenciaId) {
  const id = Number(pendenciaId);
  const nota = await pedirTexto("O que foi conferido no número desta ficha?", "Ex.: conferido com a ficha de papel");
  if (nota === null) return;
  const r = await mjEnviar(`${API_BASE}/fichas-repetidas/conferir-numero`, { pendenciaId: id, nota });
  mostrarToast(r.mensagem || (r.sucesso ? "Conferido." : "Não deu para gravar."), r.sucesso ? "sucesso" : "erro");
  if (r.sucesso && mbFicha.membroId) mjPendenciasDaFicha(mbFicha.membroId);
}

registrarAcoes({ mjCompararAcao, mjEscolherAcao, mjVerIguaisAcao, mjVoltarAcao, mjJuntarAcao, mjNaoSaoAcao, mjDesfazerAcao, mjNumeroAcao, mjConferirNumerosAcao,
  mjMarcarAcao, mjConferirNumeroAcao });
