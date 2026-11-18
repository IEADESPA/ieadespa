// app/modulos/membros-cadastro.js — FASE 10, v10.1b passo 7a, INCREMENTO 2 (18/11/2026): a ENTRADA de gente nova no módulo Membros, fiel aos desenhos
// aprovados (rodadas 8 a 10 da gestão de membros):
//   - o CADASTRO EM ETAPAS com a prévia "como a ficha vai ficar" (rodada 8, opção 3) e a BARRA DE AVISOS que confere nome, nascimento e CPF enquanto a
//     secretaria digita (decisão dele, 17/11/2026): CPF que já está noutra ficha NÃO deixa concluir — no escopo, o caminho para a ficha; fora dele, "já tem
//     cadastro; o caso foi para a Secretaria Geral" (POST /api/cadastro/conferir, do passo 4). No celular, nada preso embaixo: os botões no fim do formulário;
//   - a FILA DE CADASTROS (rodada 10): no notebook o quadro por quem completa; no celular a esteira com os números e só as pendências. Abrir um pedido mostra o
//     que falta, quem completa, a ficha parecida (no escopo) e os botões de completar, aceitar e descartar (com o motivo) — /api/pre-cadastros do passo 4;
//   - o PRÉ-CADASTRO RÁPIDO (rodada 9: uma tela só), com "os que eu lancei" embaixo. O formulário público do site vem depois.
// Mesmo escopo global dos outros módulos (vD.2); usa as ajudas de modulos/membros.js (mbTem, mbFmt, mbDataBr, mbTextoDoValor...). Ações pelo registrarAcoes.

const MC_ETAPAS = [["pessoais", "Dados pessoais"], ["familia", "Família"], ["contato", "Contato"], ["igreja", "Na igreja"], ["conferir", "Conferir"]];
const MC_ORIGEM = { SITE: "pelo link do site", LIDER: "pela liderança ou professor da EBD", SECRETARIA: "pela secretaria" };
const MC_REPETICAO = ["POSSIVEL_REPETICAO", "CPF_REPETIDO", "CPF_EM_OUTRO_PRECADASTRO"];
// o campo que completa cada pendência (o que não tem campo se resolve com uma confirmação ou na outra ficha)
const MC_CAMPO_DA_PENDENCIA = { FALTA_NOME: "nome", FALTA_CPF: "cpf", FALTA_EMAIL: "email", FALTA_NASCIMENTO: "dataNascimento", FALTA_SEXO: "sexo", FALTA_ESTADO_CIVIL: "estadoCivil", FALTA_CONGREGACAO: "congregacaoId" };

function mcCadVazio() {
  return { etapa: 0, d: { nome: "", dataNascimento: "", sexo: "", estadoCivil: "", cpf: "", escolaridade: "", nomeMae: "", nomePai: "", telefone: "", email: "",
    congregacaoId: "", situacao: "EM_COMUNHAO", formaAdmissao: "BATISMO", dataAdmissao: "", departamentoId: "" }, end: {}, conf: null, confSeq: 0, salvando: false, feito: null, erro: "" };
}
let mcCad = mcCadVazio();
let mcCongs = null;   // as congregações que quem está vendo pode escolher: [{ congregacaoId, nome }]
let mcFila = { itens: [], aceitos: [], casos: [], total: 0, aceitosTotal: 0, aberto: null, erro: "", seq: 0, motivo: "", campos: {}, naoERepeticao: false, responsavelConfirmado: false };
let mcPre = { d: { nome: "", dataNascimento: "", telefone: "", email: "", cpf: "", sexo: "", estadoCivil: "", congregacaoId: "" }, consentimento: false, resultado: null, meus: [], enviando: false };

// as congregações para escolher: a Geral, todas as ativas; os outros, as do seu escopo (as mesmas do painel)
async function mcGarantirCongregacoes() {
  if (mcCongs) return mcCongs;
  if (mbEhGeral()) {
    try {
      const res = await fetchProtegido(`${API_BASE}/congregacoes`);
      const lista = await res.json();
      if (Array.isArray(lista)) mcCongs = lista.filter((c) => c.ativa !== false).map((c) => ({ congregacaoId: c.congregacaoId, nome: c.nome }))
        .sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
    } catch (e) { mcCongs = null; }
  } else {
    if (!(mbPainel.congregacoes || []).length) await mbGarantirCongregacoes();
    mcCongs = (mbPainel.congregacoes || []).map((c) => ({ congregacaoId: c.congregacaoId, nome: c.nome }));
  }
  return mcCongs || [];
}
function mcOpcoesCongregacao(valor) {
  return (mcCongs || []).map((c) => `<option value="${c.congregacaoId}"${String(c.congregacaoId) === String(valor) ? " selected" : ""}>${escaparHtmlEbd(c.nome)}</option>`).join("");
}
function mcOpcoes(mapa, valor, vazio) {
  return `<option value="">${escaparHtmlEbd(vazio)}</option>` + Object.keys(mapa).map((k) => `<option value="${escaparHtmlEbd(k)}"${k === valor ? " selected" : ""}>${escaparHtmlEbd(mapa[k])}</option>`).join("");
}
function mcNomeCongregacao(id) {
  const c = (mcCongs || []).find((x) => String(x.congregacaoId) === String(id));
  return c ? c.nome : "";
}
function mcQuandoFoi(iso) {
  const d = new Date(String(iso || ""));
  if (Number.isNaN(d.getTime())) return "";
  const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
  return dias <= 0 ? "hoje" : dias === 1 ? "ontem" : `há ${dias} dias`;
}

// ================================================================= o CADASTRO EM ETAPAS
async function mcAbrirCadastro() {
  const caixa = document.getElementById("mbCadastro");
  if (!caixa) return;
  if (!mcCongs) caixa.innerHTML = "<p class=\"subtitle\">Carregando…</p>";
  await mcGarantirCongregacoes();
  if (!mcCad.d.congregacaoId && (mcCongs || []).length === 1) mcCad.d.congregacaoId = String(mcCongs[0].congregacaoId);
  if (typeof carregarOpcoesFormPessoa === "function" && !(window._departamentosCache || []).length) carregarOpcoesFormPessoa();
  await mbGarantirBairros();   // o endereço em linhas, na etapa do contato (as sobras do passo 7a)
  mcDesenharCadastro();
}
function mcCampoTexto(campo, rotulo, tipo, extra) {
  const v = mcCad.d[campo] || "";
  const conferir = ["nome", "dataNascimento", "cpf"].includes(campo) ? ` data-on-change="mcConferirAcao"` : "";
  return `<div class="mc-campo"><label for="mcCad_${escaparHtmlEbd(campo)}">${escaparHtmlEbd(rotulo)}</label>
    <input type="${escaparHtmlEbd(tipo)}" id="mcCad_${escaparHtmlEbd(campo)}" value="${escaparHtmlEbd(v)}" ${extra || ""}
      data-on-input="mcCampoAcao" data-args-input="${argsAttr(campo, ARG.valor)}"${conferir} /></div>`;
}
function mcCampoLista(campo, rotulo, mapa, vazio) {
  return `<div class="mc-campo"><label for="mcCad_${escaparHtmlEbd(campo)}">${escaparHtmlEbd(rotulo)}</label>
    <select id="mcCad_${escaparHtmlEbd(campo)}" data-on-change="mcCampoAcao" data-args-change="${argsAttr(campo, ARG.valor)}">${mcOpcoes(mapa, mcCad.d[campo], vazio)}</select></div>`;
}
function mcChips(campo, mapa) {
  return `<div class="mc-chips" role="group">${Object.keys(mapa).map((k) => `<button type="button" class="chip-filtro ${mcCad.d[campo] === k ? "ativo" : ""}"
    data-on-click="mcEscolherAcao" data-args-click="${argsAttr(campo, k)}" aria-pressed="${mcCad.d[campo] === k ? "true" : "false"}">${escaparHtmlEbd(mapa[k])}</button>`).join("")}</div>`;
}
const MC_SITUACAO_NOVA = { EM_COMUNHAO: "Membro (em comunhão)", CONGREGADO: "Congregado (ainda não é membro)" };
function mcFormEtapa() {
  const d = mcCad.d;
  const etapa = MC_ETAPAS[mcCad.etapa][0];
  if (etapa === "pessoais") {
    return `<div class="mc-grade">${mcCampoTexto("nome", "Nome completo *", "text", "maxlength=\"200\" autocomplete=\"off\"")}
      ${mcCampoTexto("dataNascimento", "Data de nascimento *", "date", "")}
      ${mcCampoLista("sexo", "Sexo *", MB_SEXO, "— escolha —")}
      ${mcCampoLista("estadoCivil", "Estado civil", MB_ESTADO_CIVIL, "— não informado —")}
      ${mcCampoTexto("cpf", "CPF (evita ficha repetida)", "text", "inputmode=\"numeric\" maxlength=\"14\" placeholder=\"000.000.000-00\" autocomplete=\"off\"")}
      ${mcCampoLista("escolaridade", "Escolaridade", MB_ESCOLARIDADE, "— não informada —")}</div>`;
  }
  if (etapa === "familia") {
    return `<div class="mc-grade">${mcCampoTexto("nomeMae", "Nome da mãe", "text", "maxlength=\"200\"")}${mcCampoTexto("nomePai", "Nome do pai", "text", "maxlength=\"200\"")}</div>
      <p class="mb-dica">O cônjuge e os filhos entram depois, na ficha (parte "Família"), ligando as fichas.</p>`;
  }
  if (etapa === "contato") {
    return `<div class="mc-grade">${mcCampoTexto("telefone", "Celular", "tel", "inputmode=\"tel\" maxlength=\"20\" placeholder=\"(91) 90000-0000\"")}
      ${mcCampoTexto("email", "E-mail (é por onde a pessoa cria a senha)", "email", "maxlength=\"150\"")}</div>
      <div class="mc-campo"><span class="mc-rotulo">Endereço</span>${mbEnderecoCamposHtml("mcEnd", mcCad.end)}</div>`;
  }
  if (etapa === "igreja") {
    const deps = (window._departamentosCache || []).filter((x) => x.ativo !== false);
    const membro = d.situacao === "EM_COMUNHAO";
    return `<div class="mc-grade">
      <div class="mc-campo"><label for="mcCad_congregacaoId">Congregação *</label>
        <select id="mcCad_congregacaoId" data-on-change="mcCampoAcao" data-args-change="${argsAttr("congregacaoId", ARG.valor)}"><option value="">— escolha —</option>${mcOpcoesCongregacao(d.congregacaoId)}</select></div>
      <div class="mc-campo"><label for="mcCad_departamentoId">Departamento</label>
        <select id="mcCad_departamentoId" data-on-change="mcCampoAcao" data-args-change="${argsAttr("departamentoId", ARG.valor)}"><option value="">— sem departamento —</option>
        ${deps.map((x) => `<option value="${x.departamentoId}"${String(x.departamentoId) === String(d.departamentoId) ? " selected" : ""}>${escaparHtmlEbd(x.nome)}</option>`).join("")}</select></div>
      </div>
      <div class="mc-campo"><span class="mc-rotulo">Situação *</span>${mcChips("situacao", MC_SITUACAO_NOVA)}</div>
      ${membro ? `<div class="mc-campo"><span class="mc-rotulo">Como entrou *</span>${mcChips("formaAdmissao", MB_FORMA_ADMISSAO)}</div>
        <div class="mc-grade">${mcCampoTexto("dataAdmissao", "Data de entrada (admissão) *", "date", "")}</div>` : "<p class=\"mb-dica\">O congregado vira membro depois, pela ficha, quando for recebido (batismo, carta, reconciliação ou aclamação).</p>"}`;
  }
  // conferir: tudo numa olhada, com o caminho para mudar cada parte
  const linha = (rotulo, valor) => `<div class="mb-campo"><span class="mb-campo-rotulo">${escaparHtmlEbd(rotulo)}</span><span class="mb-campo-valor">${valor ? escaparHtmlEbd(valor) : "<em class=\"mb-vazio\">não informado</em>"}</span><span></span></div>`;
  const parte = (i, titulo, corpo) => `<section class="mc-conferir-parte"><header class="mb-cartao-cabeca"><h4>${escaparHtmlEbd(titulo)}</h4>
    <button type="button" class="btn-link" data-on-click="mcIrEtapaAcao" data-args-click="${argsAttr(i)}">mudar</button></header>${corpo}</section>`;
  return `<div class="mc-conferir">
    ${parte(0, "Dados pessoais", linha("Nome", d.nome) + linha("Nascimento", mbDataBr(d.dataNascimento)) + linha("Sexo", mbTextoDoValor("sexo", d.sexo)) + linha("Estado civil", mbTextoDoValor("estadoCivil", d.estadoCivil)) + linha("CPF", d.cpf) + linha("Escolaridade", mbTextoDoValor("escolaridade", d.escolaridade)))}
    ${parte(1, "Família", linha("Mãe", d.nomeMae) + linha("Pai", d.nomePai))}
    ${parte(2, "Contato", linha("Celular", d.telefone) + linha("E-mail", d.email))}
    ${parte(3, "Na igreja", linha("Congregação", mcNomeCongregacao(d.congregacaoId)) + linha("Situação", MC_SITUACAO_NOVA[d.situacao] || "") + (d.situacao === "EM_COMUNHAO" ? linha("Como entrou", mbTextoDoValor("formaAdmissao", d.formaAdmissao)) + linha("Entrada", mbDataBr(d.dataAdmissao)) : "") + linha("Departamento", d.departamentoId ? mbTextoDoValor("departamentoId", d.departamentoId) : ""))}
  </div>`;
}
function mcPreviaHtml() {
  const d = mcCad.d;
  const idade = mbIdade(d.dataNascimento);
  const linha = (rotulo, valor) => `<div class="mc-previa-linha"><span>${escaparHtmlEbd(rotulo)}</span><strong>${valor ? escaparHtmlEbd(valor) : "—"}</strong></div>`;
  const filiacao = [d.nomeMae, d.nomePai].filter(Boolean).join(" e ");
  return `<p class="mb-ficha-menu-rotulo">Como a ficha vai ficar</p>
    <div class="mc-previa-quem"><span class="mb-avatar" aria-hidden="true">${escaparHtmlEbd(mbIniciais(d.nome || "?"))}</span>
      <span><strong>${escaparHtmlEbd(d.nome || "Nome da pessoa")}</strong><span class="mb-dica">a matrícula sai ao salvar</span></span></div>
    ${linha("Nascimento", d.dataNascimento ? `${mbDataBr(d.dataNascimento)}${idade !== null ? ` · ${idade} anos` : ""}` : "")}
    ${linha("Filiação", filiacao)}
    ${linha("Celular", d.telefone)}
    ${linha("Congregação", mcNomeCongregacao(d.congregacaoId))}
    ${linha("Situação", MC_SITUACAO_NOVA[d.situacao] || "")}
    ${linha("Departamento", d.departamentoId ? mbTextoDoValor("departamentoId", d.departamentoId) : "")}
    <p class="mb-dica">Muda enquanto você preenche.</p>`;
}
// a barra de avisos: o que a conferência achou (o CPF primeiro: ele bloqueia)
function mcBarraHtml() {
  const c = mcCad.conf;
  if (!c) return "";
  const itens = [];
  const cpf = c.cpf || {};
  if (c.erro) itens.push(`<div class="mc-aviso mc-aviso-info">${mbIc("ajudaQ")} ${escaparHtmlEbd(c.erro)}</div>`);
  if (cpf.situacao === "INVALIDO") itens.push(`<div class="mc-aviso mc-aviso-erro">${mbIc("alerta")} ${escaparHtmlEbd(cpf.mensagem || "CPF inválido.")}</div>`);
  if (cpf.situacao === "NO_ESCOPO") {
    itens.push(`<div class="mc-aviso mc-aviso-erro">${mbIc("cadeado")} ${escaparHtmlEbd(cpf.mensagem || "Este CPF já está noutra ficha.")}
      <button type="button" class="btn-link" data-on-click="mbAbrirFichaAcao" data-args-click="${argsAttr(mbNum(cpf.matricula))}">Ir para a ficha ${mbNum(cpf.matricula)} ›</button>
      <span class="mc-aviso-nota">Este cadastro não pode ser concluído com esse CPF.</span></div>`);
  }
  if (cpf.situacao === "FORA_DO_ESCOPO") itens.push(`<div class="mc-aviso mc-aviso-erro">${mbIc("cadeado")} ${escaparHtmlEbd(cpf.mensagem || "Este CPF já tem cadastro.")} <span class="mc-aviso-nota">Este cadastro não pode ser concluído com esse CPF.</span></div>`);
  if (cpf.situacao === "LIVRE") itens.push("<div class=\"mc-aviso mc-aviso-ok\">" + mbIc("check") + " CPF conferido: não está em nenhuma outra ficha.</div>");
  const parecidos = Array.isArray(c.parecidos) ? c.parecidos : [];
  if (parecidos.length) {
    itens.push(`<div class="mc-aviso mc-aviso-atencao">${mbIc("alerta")} Nome e nascimento parecidos com quem já está no cadastro — confira se não é a mesma pessoa:
      ${parecidos.map((p) => `<button type="button" class="btn-link" data-on-click="mbAbrirFichaAcao" data-args-click="${argsAttr(mbNum(p.matricula))}">${escaparHtmlEbd(p.nome)} (${mbNum(p.matricula)}${p.congregacao ? ` · ${escaparHtmlEbd(p.congregacao)}` : ""}) ›</button>`).join(" ")}</div>`);
  }
  return itens.join("");
}
function mcDesenharCadastro() {
  const caixa = document.getElementById("mbCadastro");
  if (!caixa) return;
  if (mcCad.feito) {
    caixa.innerHTML = `${mbTopoHtml("Cadastrar pessoa", "Cadastro concluído", "")}
      <div class="mb-cartao mc-feito"><p class="mc-feito-titulo">${mbIc("check")} ${escaparHtmlEbd(mcCad.feito.mensagem)}</p>
        <div class="mc-botoes">${mcCad.feito.matricula ? `<button type="button" class="btn-confirmar mb-btn" data-on-click="mbAbrirFichaAcao" data-args-click="${argsAttr(mcCad.feito.matricula)}">Abrir a ficha</button>` : ""}
        <button type="button" class="btn-confirmar btn-secundario mb-btn" data-on-click="mcNovoCadastroAcao">Cadastrar outra pessoa</button></div></div>`;
    return;
  }
  const i = mcCad.etapa;
  const ultima = i === MC_ETAPAS.length - 1;
  const bloqueia = !!(mcCad.conf && mcCad.conf.bloqueia);
  const passos = MC_ETAPAS.map(([, rotulo], n) => `<button type="button" class="mc-passo${n === i ? " atual" : n < i ? " feito" : ""}"${n < i ? "" : " disabled"}
      data-on-click="mcIrEtapaAcao" data-args-click="${argsAttr(n)}"${n === i ? " aria-current=\"step\"" : ""}><span class="mc-passo-num">${n < i ? "✓" : n + 1}</span><span class="mc-passo-rotulo">${escaparHtmlEbd(rotulo)}</span></button>`).join("");
  caixa.innerHTML = `
    ${mbTopoHtml("Cadastrar pessoa", `Etapa ${i + 1} de ${MC_ETAPAS.length} · ${MC_ETAPAS[i][1]} · os campos com * são obrigatórios`, "")}
    <nav class="mc-passos" aria-label="Etapas do cadastro">${passos}</nav>
    <div id="mcBarra" class="mc-barra" role="status" aria-live="polite">${mcBarraHtml()}</div>
    <div class="mc-cadastro">
      <form class="mb-cartao mc-form" data-on-submit="mcProximoAcao" data-prevent="submit">
        ${mcFormEtapa()}
        ${mcCad.erro ? `<p class="mb-campo-erro" role="alert">${mbIc("alerta")} ${escaparHtmlEbd(mcCad.erro)}</p>` : ""}
        <div class="mc-botoes">
          ${i > 0 ? "<button type=\"button\" class=\"btn-confirmar btn-secundario mb-btn\" data-on-click=\"mcVoltarAcao\">Voltar</button>" : ""}
          <button type="submit" class="btn-confirmar mb-btn"${(ultima && bloqueia) || mcCad.salvando ? " disabled" : ""}>${ultima ? (mcCad.salvando ? "Salvando…" : "Salvar o cadastro") : `Próximo: ${escaparHtmlEbd(MC_ETAPAS[i + 1][1])}`}</button>
        </div>
        <p class="mb-dica">O que já foi preenchido fica guardado enquanto o sistema estiver aberto.</p>
      </form>
      <aside class="mb-cartao mc-previa" id="mcPrevia" aria-label="Como a ficha vai ficar">${mcPreviaHtml()}</aside>
    </div>
    <p class="mb-dica mc-antigo">Precisa do formulário completo de antes (matrícula escolhida à mão, cargo, extensão, endereço)?
      <button type="button" class="btn-link" data-on-click="mcFormAntigoAcao">Abrir o formulário completo</button></p>`;
}
function mcCampoAcao(campo, valor) {
  if (!mbTem(mcCad.d, campo)) return;
  mcCad.d[campo] = String(valor == null ? "" : valor);
  const previa = document.getElementById("mcPrevia");
  if (previa) previa.innerHTML = mcPreviaHtml();
}
function mcEscolherAcao(campo, valor) {
  if (!mbTem(mcCad.d, campo)) return;
  mcCad.d[campo] = String(valor);
  mcDesenharCadastro();
}
// confere nome + nascimento + CPF no servidor (escopo, limite por pessoa); o último pedido é o que vale
async function mcConferirAcao() {
  const d = mcCad.d;
  if (!d.cpf.trim() && !(d.nome.trim().length >= 2 && d.dataNascimento)) { mcCad.conf = null; mcAtualizarBarra(); return; }
  const seq = ++mcCad.confSeq;
  let data = null, status = 0;
  try {
    const res = await fetchProtegido(`${API_BASE}/cadastro/conferir`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cpf: d.cpf.trim() || null, nome: d.nome.trim() || null, dataNascimento: d.dataNascimento || null, congregacaoId: d.congregacaoId ? Number(d.congregacaoId) : null }) });
    status = res.status;
    data = await res.json();
  } catch (e) { data = null; }
  if (seq !== mcCad.confSeq) return;
  if (status === 429) mcCad.conf = { erro: (data && data.mensagem) || "Muitas conferências seguidas. Espere um minuto.", bloqueia: !!(mcCad.conf && mcCad.conf.bloqueia), cpf: mcCad.conf && mcCad.conf.cpf, parecidos: mcCad.conf && mcCad.conf.parecidos };
  else if (data && data.sucesso) mcCad.conf = { cpf: data.cpf, parecidos: data.parecidos, bloqueia: !!data.bloqueia };
  else mcCad.conf = { erro: "Não deu para conferir agora; a conferência é feita de novo ao salvar." };
  mcAtualizarBarra();
}
function mcAtualizarBarra() {
  const barra = document.getElementById("mcBarra");
  if (barra) barra.innerHTML = mcBarraHtml();
  // o botão de salvar acompanha o bloqueio
  if (mcCad.etapa === MC_ETAPAS.length - 1) mcDesenharCadastro();
}
function mcValidarEtapa(i) {
  const d = mcCad.d;
  const etapa = MC_ETAPAS[i][0];
  if (etapa === "pessoais") {
    if (d.nome.trim().split(/\s+/).filter(Boolean).length < 2) return "Escreva o nome completo (nome e sobrenome).";
    if (!d.dataNascimento) return "Informe a data de nascimento.";
    if (!d.sexo) return "Escolha o sexo.";
    if (d.cpf.trim() && d.cpf.replace(/\D/g, "").length !== 11) return "O CPF tem 11 números.";
  }
  if (etapa === "contato" && d.email.trim() && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(d.email.trim())) return "O e-mail não parece certo.";
  if (etapa === "igreja") {
    if (!d.congregacaoId) return "Escolha a congregação.";
    if (d.situacao === "EM_COMUNHAO" && !d.dataAdmissao) return "Informe a data de entrada (admissão).";
  }
  return "";
}
async function mcProximoAcao() {
  const erro = mcValidarEtapa(mcCad.etapa);
  mcCad.erro = erro;
  if (erro) { mcDesenharCadastro(); return; }
  if (mcCad.etapa < MC_ETAPAS.length - 1) {
    mcCad.etapa += 1;
    mcDesenharCadastro();
    if (MC_ETAPAS[mcCad.etapa][0] === "conferir") mcConferirAcao();
    const primeiro = document.querySelector("#mbCadastro .mc-form input, #mbCadastro .mc-form select");
    if (primeiro) primeiro.focus();
    return;
  }
  await mcSalvar();
}
function mcVoltarAcao() { if (mcCad.etapa > 0) { mcCad.etapa -= 1; mcCad.erro = ""; mcDesenharCadastro(); } }
function mcIrEtapaAcao(n) {
  const i = Number(n);
  if (!Number.isInteger(i) || i < 0 || i > mcCad.etapa) return;
  mcCad.etapa = i;
  mcCad.erro = "";
  mcDesenharCadastro();
}
async function mcSalvar() {
  for (let i = 0; i < MC_ETAPAS.length - 1; i++) {
    const erro = mcValidarEtapa(i);
    if (erro) { mcCad.etapa = i; mcCad.erro = erro; mcDesenharCadastro(); return; }
  }
  if (mcCad.conf && mcCad.conf.bloqueia) return;
  const d = mcCad.d;
  const corpo = { gerarMatricula: true, nome: d.nome.trim(), dataNascimento: d.dataNascimento, sexo: d.sexo, estadoCivil: d.estadoCivil || null,
    escolaridade: d.escolaridade || null, telefone: d.telefone.trim() || null, email: d.email.trim() || null, congregacaoId: Number(d.congregacaoId),
    departamentoId: d.departamentoId ? Number(d.departamentoId) : null, situacaoMembro: d.situacao, status: "ATIVO" };
  if (d.cpf.trim()) corpo.cpf = d.cpf.trim();
  if (d.nomeMae.trim()) corpo.nomeMae = d.nomeMae.trim();
  if (d.nomePai.trim()) corpo.nomePai = d.nomePai.trim();
  if (d.situacao === "EM_COMUNHAO") { corpo.formaAdmissao = d.formaAdmissao; corpo.dataAdmissao = d.dataAdmissao; }
  mcCad.salvando = true;
  mcDesenharCadastro();
  let data = null;
  try {
    const res = await fetchProtegido(`${API_BASE}/pessoas`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    data = await res.json();
  } catch (e) { data = null; }
  mcCad.salvando = false;
  if (data && data.sucesso) {
    const m = /matr[íi]cula (\d+)/i.exec(String(data.mensagem || ""));
    const matricula = data.membro && data.membro.membroId ? mbNum(data.membro.membroId) : m ? Number(m[1]) : null;
    mcCad = Object.assign(mcCadVazio(), { feito: { mensagem: data.mensagem || "Pessoa cadastrada.", matricula } });
    if (mbPainel.dados) mbPainel.dados = Object.assign({}, mbPainel.dados, { velho: true });
    mcDesenharCadastro();
    return;
  }
  if (data && data.cpfRepetido) {
    mcCad.conf = { cpf: { situacao: data.cpfRepetido, mensagem: data.mensagem, matricula: data.matricula || null }, parecidos: (mcCad.conf && mcCad.conf.parecidos) || [], bloqueia: true };
    mcCad.erro = "";
  } else {
    mcCad.erro = (data && data.mensagem) || "Não deu para salvar agora. Confira a internet e tente de novo.";
  }
  mcDesenharCadastro();
}
function mcNovoCadastroAcao() {
  mcCad = mcCadVazio();
  if ((mcCongs || []).length === 1) mcCad.d.congregacaoId = String(mcCongs[0].congregacaoId);
  mcDesenharCadastro();
}
function mcFormAntigoAcao() {
  const antigo = document.getElementById("mcFormAntigo");
  if (!antigo) return;
  const abrir = antigo.style.display === "none";
  antigo.style.display = abrir ? "block" : "none";
  if (abrir && antigo.scrollIntoView) antigo.scrollIntoView({ block: "start", behavior: "smooth" });
}

// ================================================================= a FILA DE CADASTROS
async function mcAbrirFila() {
  const caixa = document.getElementById("subPessoasFila");
  if (!caixa) return;
  const seq = ++mcFila.seq;
  if (!mcFila.itens.length && !mcFila.erro) caixa.innerHTML = `${mbTopoHtml("Fila de cadastros", "Carregando…", "")}`;
  const ler = async (url) => {
    try { const res = await fetchProtegido(url); const d = await res.json(); return res.ok ? d : { erro: (d && d.mensagem) || "Não deu para ler a fila." }; } catch (e) { return { erro: "Não deu para ler a fila agora." }; }
  };
  const [fila, aceitos, casos] = await Promise.all([
    ler(`${API_BASE}/pre-cadastros?caixa=fila&porPagina=100`),
    ler(`${API_BASE}/pre-cadastros?caixa=aceitos&porPagina=30`),
    mbEhGeral() ? ler(`${API_BASE}/cadastro/casos?situacao=ABERTO`) : Promise.resolve(null)
  ]);
  if (seq !== mcFila.seq) return;
  mcFila.erro = fila && fila.erro ? fila.erro : "";
  mcFila.itens = fila && Array.isArray(fila.itens) ? fila.itens : [];
  mcFila.total = fila && !fila.erro ? mbNum(fila.total) : 0;
  mcFila.aceitos = aceitos && Array.isArray(aceitos.itens) ? aceitos.itens : [];
  mcFila.aceitosTotal = aceitos && !aceitos.erro ? mbNum(aceitos.total) : 0;
  mcFila.casos = casos && Array.isArray(casos.casos) ? casos.casos : casos && Array.isArray(casos.itens) ? casos.itens : [];
  if (mcFila.aberto && !mcFila.itens.some((p) => p.preCadastroId === mcFila.aberto)) mcFila.aberto = null;
  mcDesenharFila();
}
function mcEhRepeticao(p) { return (p.pendencias || []).some((x) => MC_REPETICAO.includes(x.codigo)) || !!p.repetido; }
function mcCartaoFila(p) {
  const pend = (p.pendencias || []).slice(0, 2).map((x) => `<span class="mc-pend">${escaparHtmlEbd(x.rotulo)}</span>`).join("");
  const varias = (mbPainel.congregacoes || []).length > 1 || mbEhGeral();
  return `<button type="button" class="mc-cartao" data-on-click="mcAbrirPedidoAcao" data-args-click="${argsAttr(p.preCadastroId)}">
    <span class="mc-cartao-nome">${escaparHtmlEbd(p.nome || "Sem nome")}</span>
    <span class="mb-dica">${escaparHtmlEbd(MC_ORIGEM[p.origem] || "")}${varias && p.congregacao ? ` · ${escaparHtmlEbd(p.congregacao)}` : ""} · ${escaparHtmlEbd(mcQuandoFoi(p.criadoEm))}</span>
    ${pend}</button>`;
}
function mcColuna(titulo, cor, itens, vazio) {
  return `<section class="mc-coluna"><header class="mc-coluna-cabeca"><span class="mc-bolinha ${cor}"></span><strong>${escaparHtmlEbd(titulo)}</strong><span class="mb-contador">${mbFmt(itens.length)}</span></header>
    <div class="mc-coluna-lista">${itens.length ? itens.join("") : `<p class="mb-dica">${escaparHtmlEbd(vazio)}</p>`}</div></section>`;
}
function mcDesenharFila() {
  const caixa = document.getElementById("subPessoasFila");
  if (!caixa) return;
  if (mcFila.aberto) { mcDesenharPedido(); return; }
  const itens = mcFila.itens;
  const repeticao = itens.filter(mcEhRepeticao);
  const meus = itens.filter((p) => !mcEhRepeticao(p) && p.podeResolver);
  const outros = itens.filter((p) => !mcEhRepeticao(p) && !p.podeResolver);
  const hoje = mcFila.aceitos.filter((p) => mcQuandoFoi(p.decididoEm || p.criadoEm) === "hoje");
  const aceitosCartoes = mcFila.aceitos.slice(0, 6).map((p) => `<button type="button" class="mc-cartao mc-cartao-aceito" data-on-click="mbAbrirFichaAcao" data-args-click="${argsAttr(mbNum(p.matricula))}"${p.matricula ? "" : " disabled"}>
      <span class="mc-cartao-nome">✓ ${escaparHtmlEbd(p.nome || "")}</span><span class="mb-dica">${escaparHtmlEbd(MC_ORIGEM[p.origem] || "")} · matrícula ${mbNum(p.matricula)}</span></button>`);
  const casos = mcFila.casos.length ? `<section class="mb-cartao mc-casos"><header class="mb-cartao-cabeca"><h4>${mbIc("balanca")} CPF repetido fora do escopo de quem cadastrou</h4><span class="mb-dica">só a Secretaria Geral</span></header>
    ${mcFila.casos.map((k) => `<div class="mc-caso"><span><strong>${escaparHtmlEbd(k.nomeInformado || "")}</strong> <span class="mb-dica">tentou entrar com o CPF da ficha</span>
      <button type="button" class="btn-link" data-on-click="mbAbrirFichaAcao" data-args-click="${argsAttr(mbNum(k.fichaExistente && k.fichaExistente.matricula))}">${escaparHtmlEbd((k.fichaExistente && k.fichaExistente.nome) || "")} (${mbNum(k.fichaExistente && k.fichaExistente.matricula)}) ›</button></span>
      <button type="button" class="btn-confirmar btn-secundario mb-btn-pequeno" data-on-click="mcResolverCasoAcao" data-args-click="${argsAttr(k.casoId)}">Dar por resolvido</button></div>`).join("")}</section>` : "";
  caixa.innerHTML = `
    ${mbTopoHtml("Fila de cadastros", `${mbTextoEscopo(mbPainel.dados || {}, "")} · hoje: ${mbFmt(hoje.length)} ${mbPlural(hoje.length, "entrou sozinho", "entraram sozinhos")} · ${mbFmt(mcFila.total)} com pendência`,
      `<button type="button" class="btn-confirmar mb-btn" data-on-click="mostrarSubAbaPessoas" data-args-click="${argsAttr("precadastro")}">${mbIc("mais")} Pré-cadastro rápido</button>`)}
    ${mcFila.erro ? `<p class="subtitle aviso-recusa">${mbIc("alerta")} ${escaparHtmlEbd(mcFila.erro)}</p>` : ""}
    <div class="mc-numeros">
      <div class="mb-cartao mb-numero"><span class="mb-numero-rotulo">Entraram sozinhos</span><strong class="mb-numero-valor mb-cor-verde">${mbFmt(hoje.length)}</strong><span class="mb-numero-detalhe">hoje</span></div>
      <div class="mb-cartao mb-numero"><span class="mb-numero-rotulo">Com pendência</span><strong class="mb-numero-valor mc-cor-ambar">${mbFmt(mcFila.total)}</strong><span class="mb-numero-detalhe">${mbFmt(meus.length)} esperando você</span></div>
    </div>
    <p class="mc-regra">✓ <strong>Entra sozinho</strong> quem chega com o mínimo (nome, CPF, e-mail, nascimento, sexo, estado civil e congregação) e não é parecido com ninguém: a matrícula nasce na hora e a pessoa recebe o e-mail para criar a senha. Na fila só fica quem tem pendência.</p>
    <div class="mc-quadro">
      ${mcColuna("Falta dado: você completa", "mc-bolinha-laranja", meus.map(mcCartaoFila), "ninguém agora")}
      ${mcColuna("Parecida com outra ficha", "mc-bolinha-vermelha", repeticao.map(mcCartaoFila), "ninguém agora")}
      ${mcColuna(mbEhGeral() ? "Esperando a congregação" : "Outra secretaria completa", "mc-bolinha-azul", outros.map(mcCartaoFila), "ninguém agora")}
      <div class="mc-so-notebook">${mcColuna("Entraram sozinhos", "mc-bolinha-verde", aceitosCartoes, "ninguém ainda")}</div>
    </div>
    ${casos}`;
}
function mcDesenharPedido() {
  const caixa = document.getElementById("subPessoasFila");
  const p = mcFila.itens.find((x) => x.preCadastroId === mcFila.aberto);
  if (!caixa || !p) return;
  const codigos = (p.pendencias || []).map((x) => x.codigo);
  const linha = (rotulo, valor) => `<div class="mb-campo"><span class="mb-campo-rotulo">${escaparHtmlEbd(rotulo)}</span><span class="mb-campo-valor">${valor ? escaparHtmlEbd(valor) : "<em class=\"mb-vazio\">falta</em>"}</span><span></span></div>`;
  const campoFalta = (codigo) => {
    const campo = MC_CAMPO_DA_PENDENCIA[codigo];
    if (!campo || !p.podeResolver) return "";
    const v = mcFila.campos[campo] || "";
    const entrada = campo === "sexo" ? `<select id="mcPed_${campo}" data-on-change="mcPedidoCampoAcao" data-args-change="${argsAttr(campo, ARG.valor)}">${mcOpcoes(MB_SEXO, v, "— escolha —")}</select>`
      : campo === "estadoCivil" ? `<select id="mcPed_${campo}" data-on-change="mcPedidoCampoAcao" data-args-change="${argsAttr(campo, ARG.valor)}">${mcOpcoes(MB_ESTADO_CIVIL, v, "— escolha —")}</select>`
        : campo === "congregacaoId" ? `<select id="mcPed_${campo}" data-on-change="mcPedidoCampoAcao" data-args-change="${argsAttr(campo, ARG.valor)}"><option value="">— escolha —</option>${mcOpcoesCongregacao(v)}</select>`
          : `<input type="${campo === "dataNascimento" ? "date" : campo === "email" ? "email" : "text"}" id="mcPed_${campo}" value="${escaparHtmlEbd(v)}" data-on-input="mcPedidoCampoAcao" data-args-input="${argsAttr(campo, ARG.valor)}" />`;
    return `<div class="mc-campo"><label for="mcPed_${campo}">${escaparHtmlEbd((p.pendencias.find((x) => x.codigo === codigo) || {}).rotulo || campo)}</label>${entrada}</div>`;
  };
  const r = p.repetido;
  const repetidoHtml = r ? (r.matricula
    ? `<div class="mc-aviso mc-aviso-erro">${mbIc("cadeado")} Este CPF já está na ficha de ${escaparHtmlEbd(r.nome || "")} (matrícula ${mbNum(r.matricula)}${r.congregacao ? ` · ${escaparHtmlEbd(r.congregacao)}` : ""}).
        <button type="button" class="btn-link" data-on-click="mbAbrirFichaAcao" data-args-click="${argsAttr(mbNum(r.matricula))}">Ir para a ficha ›</button>
        <span class="mc-aviso-nota">Corrija junto com o cadastro mais antigo: se for a mesma pessoa, descarte este pedido.</span></div>`
    : r.foraDoEscopo ? `<div class="mc-aviso mc-aviso-erro">${mbIc("cadeado")} ${escaparHtmlEbd(r.mensagem || "")}</div>` : "<div class=\"mc-aviso mc-aviso-atencao\">" + mbIc("alerta") + " Este CPF está noutro pré-cadastro aberto: resolva primeiro o mais antigo.</div>") : "";
  caixa.innerHTML = `
    <nav class="mb-trilha"><button type="button" class="btn-link" data-on-click="mcFecharPedidoAcao">← Fila de cadastros</button><span>›</span><span>${escaparHtmlEbd(p.nome || "Pedido")}</span></nav>
    <div class="mc-pedido">
      <section class="mb-cartao"><header class="mb-cartao-cabeca"><h4>${escaparHtmlEbd(p.nome || "Sem nome")}</h4><span class="mb-dica">chegou ${escaparHtmlEbd(MC_ORIGEM[p.origem] || "")} · ${escaparHtmlEbd(mcQuandoFoi(p.criadoEm))}</span></header>
        ${linha("Nascimento", mbDataBr(p.dataNascimento))}${linha("CPF", p.cpfMascarado)}${linha("E-mail", p.email)}${linha("Celular", p.telefone)}
        ${linha("Sexo", mbTextoDoValor("sexo", p.sexo))}${linha("Estado civil", mbTextoDoValor("estadoCivil", p.estadoCivil))}${linha("Congregação", p.congregacao)}
      </section>
      <section class="mb-cartao"><header class="mb-cartao-cabeca"><h4>O que falta</h4><span class="mb-dica">e quem completa</span></header>
        <ul class="mc-pendencias">${(p.pendencias || []).map((x) => `<li><strong>${escaparHtmlEbd(x.rotulo)}</strong><span class="mb-dica">quem completa: ${escaparHtmlEbd(x.quem)}</span></li>`).join("") || "<li>Nada: pode aceitar.</li>"}</ul>
        ${repetidoHtml}
        ${p.podeResolver ? `<form class="mc-resolver" data-on-submit="mcCompletarAcao" data-prevent="submit">
          <div class="mc-grade">${codigos.map(campoFalta).join("")}</div>
          ${codigos.includes("POSSIVEL_REPETICAO") ? `<label class="mc-confirmar"><input type="checkbox" data-on-change="mcPedidoConfirmarAcao" data-args-change="${argsAttr("naoERepeticao", ARG.marcado)}"${mcFila.naoERepeticao ? " checked" : ""} /> Conferi: não é a mesma pessoa da ficha parecida</label>` : ""}
          ${codigos.includes("MENOR_DE_IDADE") ? `<label class="mc-confirmar"><input type="checkbox" data-on-change="mcPedidoConfirmarAcao" data-args-change="${argsAttr("responsavelConfirmado", ARG.marcado)}"${mcFila.responsavelConfirmado ? " checked" : ""} /> O responsável autorizou o cadastro (menor de 18 anos)</label>` : ""}
          <div class="mc-botoes"><button type="submit" class="btn-confirmar mb-btn">Completar e aceitar</button></div>
        </form>
        <details class="mc-descartar"><summary>Descartar este pedido</summary>
          <label for="mcMotivoDescarte">Motivo (fica registrado)</label>
          <textarea id="mcMotivoDescarte" maxlength="300" rows="2" data-on-input="mcPedidoMotivoAcao" data-args-input="${argsAttr(ARG.valor)}">${escaparHtmlEbd(mcFila.motivo)}</textarea>
          <button type="button" class="btn-confirmar btn-perigo mb-btn-pequeno" data-on-click="mcDescartarAcao">Descartar</button></details>`
    : "<p class=\"mb-dica\">Quem completa, aceita ou descarta é a secretaria da congregação (ou a Secretaria Geral). Você acompanha.</p>"}
        ${mcFila.erroPedido ? `<p class="mb-campo-erro" role="alert">${mbIc("alerta")} ${escaparHtmlEbd(mcFila.erroPedido)}</p>` : ""}
      </section>
    </div>`;
}
function mcAbrirPedidoAcao(id) {
  mcFila.aberto = Number(id);
  mcFila.campos = {};
  mcFila.motivo = "";
  mcFila.naoERepeticao = false;
  mcFila.responsavelConfirmado = false;
  mcFila.erroPedido = "";
  mcDesenharFila();
}
function mcFecharPedidoAcao() { mcFila.aberto = null; mcDesenharFila(); }
function mcPedidoCampoAcao(campo, valor) { if (Object.values(MC_CAMPO_DA_PENDENCIA).includes(campo)) mcFila.campos[campo] = String(valor || ""); }
function mcPedidoConfirmarAcao(qual, marcado) { if (qual === "naoERepeticao" || qual === "responsavelConfirmado") mcFila[qual] = marcado === true; }
function mcPedidoMotivoAcao(valor) { mcFila.motivo = String(valor || "").slice(0, 300); }
async function mcPedidoEnviar(acao, corpo) {
  const p = mcFila.itens.find((x) => x.preCadastroId === mcFila.aberto);
  if (!p) return;
  let data = null, status = 0;
  try {
    const res = await fetchProtegido(`${API_BASE}/pre-cadastros/${encodeURIComponent(String(p.preCadastroId))}/${acao}`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ versao: p.versao == null ? null : String(p.versao) }, corpo)) });
    status = res.status;
    data = await res.json();
  } catch (e) { data = null; }
  if (data && data.sucesso) {
    mostrarToast(data.situacao === "ACEITO" ? `Cadastro aceito: matrícula ${mbNum(data.matricula)}.` : acao === "descartar" ? "Pedido descartado." : "Dados completados; ainda falta o que está na lista.", "sucesso");
    if (data.situacao === "ACEITO" || acao === "descartar") mcFila.aberto = null;
    await mcAbrirFila();
    return;
  }
  mcFila.erroPedido = (data && data.mensagem) || "Não deu para salvar agora.";
  if (status === 409) { await mcAbrirFila(); return; }
  if (data && data.preCadastro) { const i = mcFila.itens.findIndex((x) => x.preCadastroId === p.preCadastroId); if (i >= 0) mcFila.itens[i] = data.preCadastro; }
  mcDesenharFila();
}
function mcCompletarAcao() {
  const campos = {};
  for (const [k, v] of Object.entries(mcFila.campos)) if (String(v).trim()) campos[k] = k === "congregacaoId" ? Number(v) : String(v).trim();
  const confirma = { naoERepeticao: mcFila.naoERepeticao, responsavelConfirmado: mcFila.responsavelConfirmado };
  return Object.keys(campos).length ? mcPedidoEnviar("completar", Object.assign({ campos }, confirma)) : mcPedidoEnviar("aceitar", confirma);
}
async function mcDescartarAcao() {
  if (mcFila.motivo.trim().length < 3) { mcFila.erroPedido = "Escreva o motivo do descarte."; mcDesenharFila(); return; }
  if (!(await confirmarAcao("Descartar este pedido de cadastro? O motivo fica registrado.", "Descartar"))) return;
  await mcPedidoEnviar("descartar", { motivo: mcFila.motivo.trim() });
}
async function mcResolverCasoAcao(casoId) {
  const nota = window.prompt("Como o caso foi resolvido? (fica registrado)", "");
  if (!nota || nota.trim().length < 3) return;
  try {
    const res = await fetchProtegido(`${API_BASE}/cadastro/resolver-caso/${encodeURIComponent(String(casoId))}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nota: nota.trim() }) });
    const data = await res.json();
    mostrarToast((data && data.mensagem) || (data && data.sucesso ? "Caso resolvido." : "Não deu para resolver."), data && data.sucesso ? "sucesso" : "erro");
  } catch (e) { mostrarToast("Não deu para resolver agora.", "erro"); }
  mcAbrirFila();
}

// ================================================================= o PRÉ-CADASTRO RÁPIDO (uma tela só)
async function mcAbrirPreCadastro() {
  const caixa = document.getElementById("subPessoasPreCadastro");
  if (!caixa) return;
  await mcGarantirCongregacoes();
  if (!mcPre.d.congregacaoId && (mcCongs || []).length === 1) mcPre.d.congregacaoId = String(mcCongs[0].congregacaoId);
  try {
    const res = await fetchProtegido(`${API_BASE}/pre-cadastros?caixa=meus`);
    const data = await res.json();
    mcPre.meus = data && Array.isArray(data.itens) ? data.itens : [];
  } catch (e) { mcPre.meus = []; }
  mcDesenharPreCadastro();
}
const MC_SITUACAO_PRE = { ACEITO: ["mb-chip mb-chip-verde", "aceito"], NA_FILA: ["mb-chip mb-chip-ambar", "na fila"], DESCARTADO: ["mb-chip mb-chip-neutro", "descartado"] };
function mcDesenharPreCadastro() {
  const caixa = document.getElementById("subPessoasPreCadastro");
  if (!caixa) return;
  const d = mcPre.d;
  const campo = (c, rotulo, tipo, extra) => `<div class="mc-campo"><label for="mcPre_${c}">${escaparHtmlEbd(rotulo)}</label>
    <input type="${escaparHtmlEbd(tipo)}" id="mcPre_${c}" value="${escaparHtmlEbd(d[c] || "")}" ${extra || ""} data-on-input="mcPreCampoAcao" data-args-input="${argsAttr(c, ARG.valor)}" /></div>`;
  const lista = (c, rotulo, mapa) => `<div class="mc-campo"><label for="mcPre_${c}">${escaparHtmlEbd(rotulo)}</label>
    <select id="mcPre_${c}" data-on-change="mcPreCampoAcao" data-args-change="${argsAttr(c, ARG.valor)}">${mcOpcoes(mapa, d[c], "— se souber —")}</select></div>`;
  const r = mcPre.resultado;
  const resultado = r ? (r.situacao === "ACEITO"
    ? `<div class="mc-aviso mc-aviso-ok">${mbIc("check")} Entrou sozinho: matrícula ${mbNum(r.matricula)}. <button type="button" class="btn-link" data-on-click="mbAbrirFichaAcao" data-args-click="${argsAttr(mbNum(r.matricula))}">Abrir a ficha ›</button></div>`
    : r.situacao ? `<div class="mc-aviso mc-aviso-atencao">${mbIc("doc")} Foi para a fila de cadastros: ${escaparHtmlEbd(((r.preCadastro && r.preCadastro.pendencias) || []).map((x) => x.rotulo).join("; ") || "a secretaria confere")}.
      <button type="button" class="btn-link" data-on-click="mostrarSubAbaPessoas" data-args-click="${argsAttr("fila")}">Ver a fila ›</button></div>`
      : `<div class="mc-aviso mc-aviso-erro">${mbIc("alerta")} ${escaparHtmlEbd(r.mensagem || "Não deu para enviar.")}</div>`) : "";
  caixa.innerHTML = `
    ${mbTopoHtml("Pré-cadastro rápido", "Uma tela só: o mínimo para a pessoa não se perder. Completo, entra sozinho; faltando algo, vai para a fila.", "")}
    <div class="mc-pre">
      <form class="mb-cartao mc-form" data-on-submit="mcPreEnviarAcao" data-prevent="submit">
        <div class="mc-grade">
          ${campo("nome", "Nome completo *", "text", "maxlength=\"200\" autocomplete=\"off\"")}
          ${campo("dataNascimento", "Nascimento", "date", "")}
          ${campo("telefone", "Celular", "tel", "inputmode=\"tel\" maxlength=\"20\" placeholder=\"(91) 90000-0000\"")}
          ${campo("email", "E-mail (para criar a senha)", "email", "maxlength=\"150\"")}
          ${campo("cpf", "CPF", "text", "inputmode=\"numeric\" maxlength=\"14\" placeholder=\"000.000.000-00\" autocomplete=\"off\"")}
          ${lista("sexo", "Sexo", MB_SEXO)}
          ${lista("estadoCivil", "Estado civil", MB_ESTADO_CIVIL)}
          <div class="mc-campo"><label for="mcPre_congregacaoId">Congregação *</label>
            <select id="mcPre_congregacaoId" data-on-change="mcPreCampoAcao" data-args-change="${argsAttr("congregacaoId", ARG.valor)}"><option value="">— escolha —</option>${mcOpcoesCongregacao(d.congregacaoId)}</select></div>
        </div>
        <label class="mc-confirmar"><input type="checkbox" data-on-change="mcPreConsentimentoAcao" data-args-change="${argsAttr(ARG.marcado)}"${mcPre.consentimento ? " checked" : ""} />
          A pessoa autorizou a Igreja a guardar estes dados no cadastro de membros.</label>
        <div class="mc-botoes"><button type="submit" class="btn-confirmar mb-btn"${mcPre.enviando ? " disabled" : ""}>${mcPre.enviando ? "Enviando…" : "Enviar para a secretaria"}</button></div>
        ${resultado}
      </form>
      <section class="mb-cartao"><header class="mb-cartao-cabeca"><h4>Os que eu lancei</h4><span class="mb-dica">os 50 mais novos</span></header>
        ${mcPre.meus.length ? `<ul class="mc-meus">${mcPre.meus.slice(0, 12).map((m) => { const s = MC_SITUACAO_PRE[m.situacao] || MC_SITUACAO_PRE.NA_FILA; return `<li><span>${escaparHtmlEbd(m.nome || "")}<span class="mb-dica"> · ${escaparHtmlEbd(m.congregacao || "")} · ${escaparHtmlEbd(mcQuandoFoi(m.criadoEm))}</span></span><span class="${escaparHtmlEbd(s[0])}">${escaparHtmlEbd(s[1])}</span></li>`; }).join("")}</ul>` : "<p class=\"mb-dica\">Nenhum ainda.</p>"}
      </section>
    </div>`;
}
function mcPreCampoAcao(campo, valor) { if (mbTem(mcPre.d, campo)) mcPre.d[campo] = String(valor == null ? "" : valor); }
function mcPreConsentimentoAcao(marcado) { mcPre.consentimento = marcado === true; }
async function mcPreEnviarAcao() {
  const d = mcPre.d;
  if (d.nome.trim().length < 2) { mcPre.resultado = { mensagem: "Escreva o nome completo." }; mcDesenharPreCadastro(); return; }
  if (!d.congregacaoId) { mcPre.resultado = { mensagem: "Escolha a congregação." }; mcDesenharPreCadastro(); return; }
  if (!mcPre.consentimento) { mcPre.resultado = { mensagem: "Confirme que a pessoa autorizou guardar os dados." }; mcDesenharPreCadastro(); return; }
  const corpo = { nome: d.nome.trim(), congregacaoId: Number(d.congregacaoId), consentimentoDaPessoa: true };
  for (const k of ["dataNascimento", "telefone", "email", "cpf", "sexo", "estadoCivil"]) if (String(d[k] || "").trim()) corpo[k] = String(d[k]).trim();
  mcPre.enviando = true;
  mcDesenharPreCadastro();
  let data = null;
  try {
    const res = await fetchProtegido(`${API_BASE}/pre-cadastros`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    data = await res.json();
  } catch (e) { data = null; }
  mcPre.enviando = false;
  if (data && (data.sucesso || data.situacao)) {
    mcPre.resultado = data;
    const cong = mcPre.d.congregacaoId;
    mcPre.d = { nome: "", dataNascimento: "", telefone: "", email: "", cpf: "", sexo: "", estadoCivil: "", congregacaoId: cong };
    mcPre.consentimento = false;
    mcAbrirPreCadastro();
    return;
  }
  mcPre.resultado = { mensagem: (data && data.mensagem) || "Não deu para enviar agora. Confira a internet e tente de novo." };
  mcDesenharPreCadastro();
}

registrarAcoes({
  mcCampoAcao, mcCompletarAcao, mcConferirAcao, mcDescartarAcao, mcEscolherAcao, mcFecharPedidoAcao, mcFormAntigoAcao, mcIrEtapaAcao, mcNovoCadastroAcao,
  mcAbrirPedidoAcao, mcPedidoCampoAcao, mcPedidoConfirmarAcao, mcPedidoMotivoAcao, mcPreCampoAcao, mcPreConsentimentoAcao, mcPreEnviarAcao, mcProximoAcao,
  mcResolverCasoAcao, mcVoltarAcao
});
