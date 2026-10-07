// app/modulos/voluntariado.js — módulo extraído do script.js (vD.2, 2026-10-07).
// Script clássico, carregado pelo index.html DEPOIS do script.js e do eventos.js: compartilha o escopo
// global com eles (as funções e constantes abaixo continuam acessíveis pelo nome, como antes). As ações
// que o HTML pede deste módulo são registradas aqui mesmo, no fim do arquivo (registrarAcoes mescla).

// ---- Voluntariado: rodízio, Termo de Adesão e remoção da escala (v7.5) ----
// Telas do back-end GestaoVoluntariado (/api/voluntariado/{acao}): Termo de Adesão (Meu Painel e Habilitação), rodízio por grupos
// com trava de habitualidade e remoção da escala (Escalas de Serviço). Tudo daqui leva o prefixo "vol"; as telas antigas só chamam estas funções.
const volRotuloMotivo = {
  PERDA_CONFIANCA: "Perda de confiança ministerial", MUDANCA: "Mudança", INDISPONIBILIDADE: "Indisponibilidade",
  SAIDA_DA_IGREJA: "Saída da igreja", OUTRO: "Outro"
};
let volCatalogos = null;            // GET voluntariado/catalogos: igual para todos, carrega uma vez
let volCatalogosPendente = null;
let volServicoRodizio = {};         // servicoId -> rodizioId, da última lista de serviços
let volEquipesBase = [];            // equipes ativas da congregação aberta em Escalas de Serviço
let volCongregacaoEscalas = null;
let volRodiziosCarregados = [];
let volResultadoGeracao = {};       // rodizioId -> resposta do último "Gerar" (sobrevive ao recarregar o cartão)
let volEquipesLiderancaDados = [];
let volSeqRodizios = 0, volSeqHabitualidade = 0, volSeqRemocoes = 0, volSeqAdesoes = 0;

// -- utilidades --
function volEl(id) { return document.getElementById(id); }
function volEsc(texto) { return escaparHtmlEbd(texto); }
function volMsgErro(data) { return (data && data.mensagem) || "Não foi possível concluir. Tente de novo."; }

// Lê o corpo como JSON; o que não for JSON, ou vier com status de erro, vira { sucesso:false, mensagem }.
async function volLer(res) {
  let data = null;
  try { data = await res.json(); } catch (_) { data = null; }
  if (!data || typeof data !== "object") return { sucesso: false, mensagem: "Não foi possível ler a resposta do servidor." };
  if (!res.ok && data.sucesso !== false) data.sucesso = false;
  return data;
}
// Nunca lança: falha de rede e sessão expirada já foram avisadas por fetchProtegido, e quem chama só olha "sucesso".
async function volRequisitar(caminho, opcoes) {
  try { return await volLer(await fetchProtegido(`${API_BASE}/${caminho}`, opcoes)); }
  catch (_) { return { sucesso: false, falhaDeRede: true, mensagem: "Sem conexão com o servidor." }; }
}
function volObter(caminho) { return volRequisitar(caminho); }
function volEnviar(caminho, corpo) {
  return volRequisitar(caminho, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
}
function volAvisarErro(data) { if (!data.falhaDeRede) mostrarToast(volMsgErro(data), "erro"); }

async function volProtegerBotao(botao, tarefa) {
  if (botao) botao.disabled = true;
  try { return await tarefa(); } finally { if (botao) botao.disabled = false; }
}

// Data e hora de serviço de escala: o servidor guarda a hora que a congregação vive "como se fosse UTC", então sempre timeZone UTC.
function volDataHora(valor) {
  if (!valor) return "—";
  if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)) return `${volData(valor)} ${escaparHtmlEbd(valor.slice(11, 16))}`;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("pt-BR", { timeZone: "UTC" })} ${d.toLocaleTimeString("pt-BR", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" })}`;
}
function volDataParede(valor) {
  const d = new Date(valor);
  return !valor || Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}
// Momento real (por exemplo, quando a remoção foi registrada), na hora do Brasil.
function volDataInstante(valor) {
  const d = new Date(valor);
  return !valor || Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
// Data pura (AAAA-MM-DD): fatia a string, nunca new Date().
function volData(valor) { return volEsc(formatarDataEbd(valor)); }
function volDiaDaSemana(dataIso) {
  const [a, m, d] = String(dataIso).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}
// "1021, 1033 1048" -> { ids:[1021,1033,1048] }; algo que não seja matrícula -> { erro }.
function volLerMatriculas(texto) {
  const ids = [];
  for (const parte of String(texto || "").split(/[\s,;]+/).filter(Boolean)) {
    if (!/^\d+$/.test(parte) || Number(parte) < 1) return { erro: `"${parte}" não é uma matrícula válida.` };
    ids.push(Number(parte));
  }
  return { ids: [...new Set(ids)] };
}
function volPreencherSelect(sel, opcoes, valorAtual) {
  if (!sel) return;
  sel.innerHTML = opcoes.map(o => `<option value="${volEsc(o.valor)}">${volEsc(o.rotulo)}</option>`).join("");
  if (valorAtual != null && opcoes.some(o => String(o.valor) === String(valorAtual))) sel.value = String(valorAtual);
}
function volGarantirCatalogos() {
  if (volCatalogos) return Promise.resolve(volCatalogos);
  if (!authToken) return Promise.resolve(null);
  if (!volCatalogosPendente) {
    volCatalogosPendente = volObter("voluntariado/catalogos").then(data => {
      volCatalogosPendente = null;
      if (data.sucesso !== false) volCatalogos = data;
      return volCatalogos;
    });
  }
  return volCatalogosPendente;
}
function volRegras() { return (volCatalogos && volCatalogos.regras) || {}; }

// -- Meu Painel > Minha Habilitação: Termo de Adesão ao Serviço Voluntário --
function volMontarTermo(d) {
  const t = d.termo || {};
  const itens = (t.itens || []).map(i => `<li>${volEsc(i.texto)}<br /><small class="vol-base">${volEsc(i.base)}</small></li>`).join("");
  const texto = `<ol class="vol-termo-itens">${itens}</ol>`;
  let corpo;
  if (d.aderiu) {
    const a = d.adesao || {};
    corpo = `<p class="vol-selo-ok">✅ Você aderiu${a.dataAceite ? ` em ${volData(a.dataAceite)}` : ""}${a.rotuloForma ? ` — ${volEsc(a.rotuloForma)}` : ""}${a.responsavelNome ? `, assinado por ${volEsc(a.responsavelNome)} (${volEsc(a.rotuloVinculo || "responsável")})` : ""}</p>
      <details><summary>Ver o texto do Termo</summary>${texto}</details>`;
  } else if (d.podeAderirDigital === false) {
    // Menor de 18 anos (ou cadastro sem data de nascimento) não adere sozinho: o aceite digital fica fechado e a tela diz o que fazer e quem é o responsável cadastrado.
    const resp = (d.suspensa ? `<p class="vol-aviso">${volEsc(d.mensagemSuspensa || "")}</p>` : "") + (d.menorDeIdade
      ? ((d.meusResponsaveis || []).length
        ? `<p class="subtitle">Responsável cadastrado: ${(d.meusResponsaveis || []).map(r => `${volEsc(r.nome)} (${volEsc(r.rotuloVinculo)})`).join(", ")}. Ele(a) autoriza o seu serviço no Meu Painel dele(a).</p>`
        : `<p class="subtitle">Ainda não há responsável cadastrado para você. Peça ao seu pai, mãe ou responsável legal para procurar a Secretaria com um documento.</p>`)
      : "");
    corpo = `<p class="vol-aviso">${volEsc(d.motivoSemAdesaoDigital || "O aceite digital não está disponível para o seu cadastro. Procure a Secretaria.")}</p>${resp}
      <details><summary>Ver o texto do Termo</summary>${texto}</details>`;
  } else {
    // `renovar`: a adesão que a pessoa tinha foi dada pelo responsável, quando ela era menor; ao completar 18 anos ela confirma a própria.
    corpo = `${d.renovar ? `<p class="vol-aviso">A sua adesão foi dada pelo seu responsável, quando você era menor de idade. Agora que você tem 18 anos ou mais, confirme a sua própria.</p>` : ""}${texto}
      <label class="opcao-checkbox vol-aceite"><input type="checkbox" id="volTermoAceite" data-on-change="volAtualizarBotaoTermoAcao" /> ${volEsc(t.aceite)}</label>
      <div class="vol-acoes"><button type="button" class="btn-confirmar" id="volTermoBotao" style="width:auto;margin:0;" disabled data-on-click="volAderirTermoAcao">✍️ Aderir ao Termo</button></div>
      <p class="subtitle" id="volTermoResultado"></p>`;
  }
  return `<div class="vol-cartao"><h4>${volEsc(t.titulo)}</h4><p class="subtitle">Versão ${volEsc(t.versao)}</p>${corpo}</div>${volMontarMenoresResponsavel(d)}`;
}

// Para quem é responsável legal de menor (cadastrado pela Secretaria): os menores dele, a Autorização e o botão de autorizar. A adesão fica no nome do menor, com a
// matrícula, o IP, a data e a hora de quem autorizou.
function volMontarMenoresResponsavel(d) {
  const lista = d.menoresSobMinhaResponsabilidade || [];
  if (!lista.length) return "";
  const t = d.termoMenor || {};
  const itens = (t.itens || []).map(i => `<li>${volEsc(i.texto)}<br /><small class="vol-base">${volEsc(i.base)}</small></li>`).join("");
  const cartoes = lista.map(m => {
    const id = Number(m.menorId);
    let estado;
    if (!m.aindaMenor) estado = `<p class="vol-aviso">${volEsc(m.nome)} já tem 18 anos ou mais: ele(a) mesmo(a) adere ao Termo, no Meu Painel dele(a).</p>`;
    else if (m.aderiu) estado = `<p class="vol-selo-ok">✅ Autorizado${m.dataAceite ? ` em ${volData(m.dataAceite)}` : ""}${m.rotuloForma ? ` — ${volEsc(m.rotuloForma)}` : ""}</p>`;
    else estado = `${m.suspensa ? `<p class="vol-aviso">A autorização anterior está suspensa: houve um período em que ${volEsc(m.nome)} ficou sem responsável ativo. Autorize de novo para que ele(a) volte a ser escalado(a).</p>` : ""}<details><summary>Ler a autorização e autorizar</summary>
        <ol class="vol-termo-itens">${itens}</ol>
        <label class="opcao-checkbox vol-aceite"><input type="checkbox" id="volMenorAceite${id}" data-on-change="volAtualizarBotaoMenorAcao" data-args-change="${argsAttr(id)}" /> ${volEsc(t.aceite)}</label>
        <div class="vol-acoes"><button type="button" class="btn-confirmar" id="volMenorBotao${id}" style="width:auto;margin:0;" disabled data-on-click="volAutorizarMenorAcao" data-args-click="${argsAttr(id, ARG.elemento)}">✍️ Autorizar ${volEsc(m.nome)}</button></div>
        <p class="subtitle" id="volMenorResultado${id}"></p></details>`;
    return `<div class="vol-cartao"><h4>${volEsc(m.nome)} <span class="vol-matricula">${volEsc(m.rotuloVinculo)}${m.idade != null ? ` · ${Number(m.idade)} anos` : ""}</span></h4>${estado}</div>`;
  }).join("");
  return `<h4 style="margin-top:16px;">👨‍👩‍👧 Menores sob a minha responsabilidade</h4>
    <p class="subtitle">${volEsc(t.titulo || "")} — versão ${volEsc(t.versao || "")}. Você foi cadastrado(a) pela Secretaria como responsável legal; ao autorizar, fica registrado o seu aceite, com o seu IP, a data e a hora.</p>${cartoes}`;
}
function volAtualizarBotaoMenorAcao(id) {
  const caixa = volEl(`volMenorAceite${id}`), botao = volEl(`volMenorBotao${id}`);
  if (caixa && botao) botao.disabled = !caixa.checked;
}
async function volAutorizarMenorAcao(menorId, botao) {
  const caixa = volEl(`volMenorAceite${menorId}`), aviso = volEl(`volMenorResultado${menorId}`);
  if (!caixa || !caixa.checked) { if (aviso) aviso.textContent = "Marque a caixa para autorizar."; return; }
  await volProtegerBotao(botao, async () => {
    const data = await volEnviar("voluntariado/aceitar-termo-menor", { menorId: Number(menorId), aceito: true });
    if (data.sucesso === false) {
      if (aviso) aviso.textContent = volMsgErro(data);
      volAvisarErro(data);
      return;
    }
    mostrarToast(data.mensagem || "✅ Autorização registrada.", "sucesso");
    await volCarregarTermoAcao();
  });
}
async function volCarregarTermoAcao() {
  const cx = volEl("volTermoMeuPainel");
  if (!cx || !authToken) return;
  const data = await volObter("voluntariado/meu-painel");
  if (data.sucesso === false) { cx.innerHTML = `<p class="subtitle">${volEsc(volMsgErro(data))}</p>`; return; }
  cx.innerHTML = volMontarTermo(data);
}
function volAtualizarBotaoTermoAcao() {
  const caixa = volEl("volTermoAceite"), botao = volEl("volTermoBotao");
  if (caixa && botao) botao.disabled = !caixa.checked;
}
async function volAderirTermoAcao() {
  const caixa = volEl("volTermoAceite"), botao = volEl("volTermoBotao"), aviso = volEl("volTermoResultado");
  if (!caixa || !caixa.checked) { if (aviso) aviso.textContent = "Marque a caixa para aderir ao Termo."; return; }
  await volProtegerBotao(botao, async () => {
    const data = await volEnviar("voluntariado/aceitar-termo", { aceito: true });
    if (data.sucesso === false) {
      if (aviso) aviso.textContent = volMsgErro(data);
      volAvisarErro(data);
      return;
    }
    mostrarToast(data.mensagem || "✅ Adesão registrada.", "sucesso");
    await volCarregarTermoAcao();
  });
}

// -- Meu Painel > Minhas Escalas: faixa do Termo, meus rodízios e equipes que eu lidero --
function volCarregarMinhasEscalasAcao() {
  if (!authToken) return;
  const resultado = volEl("volResultadoLider");
  if (resultado) resultado.innerHTML = "";
  volCarregarPainelEscalasAcao();
  volCarregarEquipesLideradasAcao();
}
async function volCarregarPainelEscalasAcao() {
  const aviso = volEl("volAvisoTermo"), cx = volEl("volMeusRodizios");
  if (!aviso || !cx) return;
  const data = await volObter("voluntariado/meu-painel");
  if (data.sucesso === false) { aviso.innerHTML = ""; cx.innerHTML = ""; return; }   // não bloqueia a tela
  aviso.innerHTML = data.aderiu ? "" : `<div class="vol-aviso">
      <span>Você ainda não aderiu ao Termo de Adesão ao Serviço Voluntário.</span>
      <button type="button" class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="mostrarSubAbaMeupainel" data-args-click="${argsAttr("minhahabilitacao")}">Ver e aderir ao Termo</button>
    </div>`;
  const rodizios = Array.isArray(data.rodizios) ? data.rodizios : [];
  cx.innerHTML = rodizios.length ? `<hr /><h4>Meus rodízios</h4>${rodizios.map(volMontarRodizioMeu).join("")}` : "";
}
function volMontarRodizioMeu(r) {
  const datas = (r.proximasDatas || []).map(d => `<span class="vol-etiqueta">${volData(d)}</span>`).join(" ");
  const grupo = r.grupoNome
    ? `Você está no <strong>${volEsc(r.grupoNome)}</strong> (1 de ${Number(r.totalGrupos)} grupos que se alternam)`
    : `${Number(r.totalGrupos)} grupos se alternam`;
  return `<div class="vol-cartao">
    <h5>${volEsc(r.rodizioNome)} <span class="vol-etiqueta">${volEsc(r.equipeNome)}</span></h5>
    <p class="vol-meta">${volEsc(r.rotuloDia)} às ${volEsc(r.hora)}</p>
    <p>${grupo}</p>
    <p>${datas ? `Suas próximas datas: ${datas}` : "Ainda não há datas previstas para o seu grupo."}</p>
  </div>`;
}

async function volCarregarEquipesLideradasAcao() {
  const secao = volEl("volSecaoLider"), cx = volEl("volEquipesLideradas");
  if (!secao || !cx) return;
  const data = await volObter("voluntariado/minhas-equipes");
  volEquipesLiderancaDados = data.sucesso === false || !Array.isArray(data.equipes) ? [] : data.equipes;
  secao.hidden = volEquipesLiderancaDados.length === 0;
  cx.innerHTML = volEquipesLiderancaDados.map(volMontarEquipeLiderada).join("");
}
function volMontarEquipeLiderada(e) {
  const equipeId = Number(e.equipeId);
  const membros = (e.membros || []).map(m => {
    const euMesmo = String(m.membroId) === String(authMatricula);
    const acao = euMesmo ? '<span class="vol-matricula">(você)</span>'
      : `<button type="button" class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="volRemoverLiderAcao" data-args-click="${argsAttr(equipeId, Number(m.membroId))}">🚪 Remover da escala</button>`;
    return `<tr><td>${volEsc(m.nome)} <span class="vol-matricula">matrícula ${Number(m.membroId)}</span></td><td>${acao}</td></tr>`;
  }).join("");
  const remocoes = e.remocoes || [];
  return `<div class="vol-cartao">
    <h5>${volEsc(e.nome)} <span class="vol-etiqueta">${volEsc(e.rotuloNatureza || e.natureza)}</span> <span class="vol-matricula">${volEsc(e.congregacaoNome)}</span></h5>
    ${membros
      ? `<div class="rolagem-tabela"><table class="tabela-frequencia vol-tabela-estreita"><thead><tr><th>Voluntário</th><th></th></tr></thead><tbody>${membros}</tbody></table></div>`
      : "<p class='subtitle'>Nenhum voluntário ativo nesta equipe.</p>"}
    ${remocoes.length ? `<p class="vol-sub">Remoções desta equipe</p>${volMontarTabelaRemocoes(remocoes, "lider", false)}` : ""}
  </div>`;
}
async function volRemoverLiderAcao(equipeId, membroId) {
  const equipe = volEquipesLiderancaDados.find(e => Number(e.equipeId) === equipeId);
  const membro = equipe && (equipe.membros || []).find(m => Number(m.membroId) === membroId);
  if (!equipe || !membro) return;
  const motivo = prompt(`Remover ${membro.nome} da escala da equipe ${equipe.nome}.\n\nQual o motivo? (de 5 a 300 caracteres; fica só na ficha do voluntário, não é processo disciplinar)`);
  if (motivo === null) return;
  const texto = motivo.trim();
  if (texto.length < 5 || texto.length > 300) { mostrarToast("Informe o motivo com 5 a 300 caracteres.", "erro"); return; }
  const data = await volEnviar("voluntariado/remover-da-escala", { membroId, equipeId, motivo: texto });
  if (data.sucesso === false) { volAvisarErro(data); return; }
  mostrarToast(data.mensagem, "sucesso");
  const resultado = volEl("volResultadoLider");
  if (resultado) resultado.innerHTML = volMontarResultadoRemocao(data);
  volCarregarEquipesLideradasAcao();
}
async function volReintegrarAcao(desligamentoId, origem) {
  const observacao = prompt("Observação sobre a volta à equipe (opcional, até 300 caracteres):");
  if (observacao === null) return;
  const corpo = { desligamentoId: Number(desligamentoId) };
  if (observacao.trim()) corpo.observacao = observacao.trim();
  const data = await volEnviar("voluntariado/reintegrar", corpo);
  if (data.sucesso === false) { volAvisarErro(data); return; }
  mostrarToast(data.mensagem, "sucesso");
  if (origem === "lider") volCarregarEquipesLideradasAcao(); else volCarregarRemocoesAcao();
}

// Resposta de "remover-da-escala": a mensagem e, por equipe, as vagas que ficaram abertas.
function volMontarResultadoRemocao(resp) {
  const linhas = (resp.equipes || []).map(e => {
    const vagas = e.vagasAbertas || [];
    return `<li><strong>${volEsc(e.nome)}</strong>: ${vagas.length ? vagas.map(v => volEsc(volDataHora(v.dataHora))).join("; ") : "nenhuma escala futura marcada"}</li>`;
  }).join("");
  return `<div class="vol-resultado"><p>${volEsc(resp.mensagem)}</p>${linhas ? `<p class="vol-sub">Vagas abertas</p><ul class="vol-lista">${linhas}</ul>` : ""}</div>`;
}
function volMontarTabelaRemocoes(remocoes, origem, comEquipe) {
  const linhas = remocoes.map(r => {
    const situacao = r.podeReintegrar
      ? "Removido(a)"
      : `Reintegrado(a) em ${volDataInstante(r.reintegradoEm)}${r.reintegracaoObs ? ` — ${volEsc(r.reintegracaoObs)}` : ""}`;
    const acao = r.podeReintegrar
      ? `<button type="button" class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="volReintegrarAcao" data-args-click="${argsAttr(Number(r.desligamentoId), String(origem))}">↩️ Reintegrar</button>` : "";
    return `<tr><td>${volDataInstante(r.desligadoEm)}</td><td>${volEsc(r.membroNome)} <span class="vol-matricula">matrícula ${Number(r.membroId)}</span></td>
      ${comEquipe ? `<td>${volEsc(r.equipeNome)}</td>` : ""}<td>${volEsc(volRotuloMotivo[r.tipoMotivo] || r.tipoMotivo)}</td><td>${volEsc(r.motivo)}</td>
      <td>${Number(r.alocacoesCanceladas)}</td><td>${situacao}</td><td>${acao}</td></tr>`;
  }).join("");
  return `<div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr><th>Data</th><th>Voluntário</th>${comEquipe ? "<th>Equipe</th>" : ""}<th>Tipo</th><th>Motivo</th><th>Escalas canceladas</th><th>Situação</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`;
}

// -- Escalas de Serviço: natureza da equipe --
function volCelulaNatureza(e) {
  const naturezas = volCatalogos && Array.isArray(volCatalogos.naturezas) ? volCatalogos.naturezas : [];
  if (!naturezas.length) return volEsc(e.natureza || "—");
  const atual = naturezas.find(n => n.codigo === e.natureza);
  return `<select class="vol-select-natureza" aria-label="Natureza da equipe ${volEsc(e.nome)}" data-on-change="volMudarNaturezaAcao" data-args-change="${argsAttr(Number(e.equipeId), ARG.elemento)}">
      ${naturezas.map(n => `<option value="${volEsc(n.codigo)}"${n.codigo === e.natureza ? " selected" : ""}>${volEsc(n.rotulo)}</option>`).join("")}
    </select>${atual && atual.exigeRevezamento ? ' <span class="vol-etiqueta vol-etiqueta-alerta">revezamento obrigatório</span>' : ""}`;
}
async function volMudarNaturezaAcao(equipeId, select) {
  select.disabled = true;
  const data = await volEnviar("voluntariado/equipe-natureza", { equipeId, natureza: select.value });
  if (data.sucesso === false) volAvisarErro(data); else mostrarToast(data.mensagem, "sucesso");
  await carregarEquipesAcao();   // redesenha a partir do que o servidor guardou (e atualiza os avisos de rodízio)
  select.disabled = false;
}

// -- Escalas de Serviço: carrega as seções novas quando a congregação é aberta --
async function volCarregarEscalasAcao(equipes) {
  if (!authToken || !_esCongregacaoAtual) return;
  volEquipesBase = Array.isArray(equipes) ? equipes.filter(e => e.ativa) : [];
  if (volCongregacaoEscalas !== _esCongregacaoAtual) {   // outra congregação: some o que era da anterior
    volCongregacaoEscalas = _esCongregacaoAtual;
    volResultadoGeracao = {};
    volEl("volResultadoRemocao").innerHTML = "";
    volEl("volResultadoRodizios").hidden = true;
  }
  await volGarantirCatalogos();
  volPrepararFormulariosEscalas();
  volCarregarRodiziosAcao();
  volCarregarHabitualidadeAcao();
  volCarregarRemocoesAcao();
}
function volPrepararFormulariosEscalas() {
  const cat = volCatalogos || {};
  const selDia = volEl("volRodizioDia");
  volPreencherSelect(selDia, (cat.diasSemana || []).map(d => ({ valor: d.codigo, rotulo: d.rotulo })), selDia.value);
  const codigos = Array.isArray(cat.tiposMotivoRemocao) ? cat.tiposMotivoRemocao.map(t => t.codigo) : Object.keys(volRotuloMotivo);
  const selTipo = volEl("volRemoverTipo");
  volPreencherSelect(selTipo, codigos.map(c => ({ valor: c, rotulo: volRotuloMotivo[c] || c })), selTipo.value || "PERDA_CONFIANCA");
  const selEquipe = volEl("volRemoverEquipe");
  volPreencherSelect(selEquipe, [{ valor: "", rotulo: "Todas as equipes que eu alcanço" }, ...volEquipesBase.map(e => ({ valor: e.equipeId, rotulo: e.nome }))], selEquipe.value);
}

// -- Escalas de Serviço: rodízios voluntários --
async function volCarregarRodiziosAcao() {
  const painel = volEl("volPainelRodizios"), avisos = volEl("volAvisosSemRodizio");
  if (!painel || !avisos || !_esCongregacaoAtual) return;
  const seq = ++volSeqRodizios;
  const data = await volObter(`voluntariado/rodizios?congregacaoId=${encodeURIComponent(_esCongregacaoAtual)}`);
  if (seq !== volSeqRodizios) return;   // chegou resposta mais nova
  if (data.sucesso === false) { avisos.innerHTML = ""; painel.innerHTML = `<p class="subtitle">${volEsc(volMsgErro(data))}</p>`; return; }
  volRodiziosCarregados = Array.isArray(data.rodizios) ? data.rodizios : [];
  avisos.innerHTML = (data.equipesSemRodizio || []).map(e =>
    `<p class="vol-aviso">⚠️ A equipe <strong>${volEsc(e.nome)}</strong> (${volEsc(e.rotuloNatureza)}) ainda não tem rodízio — nesta natureza o revezamento é obrigatório.</p>`).join("");
  const selEquipe = volEl("volRodizioEquipe");
  volPreencherSelect(selEquipe, (data.equipes || []).filter(e => e.ativa).map(e => ({ valor: e.equipeId, rotulo: `${e.nome} (${e.rotuloNatureza})` })), selEquipe.value);
  if (volRodiziosCarregados.length === 0) volEl("volFormRodizio").open = true;   // primeiro rodízio: já mostra o formulário
  painel.innerHTML = volRodiziosCarregados.length
    ? volRodiziosCarregados.map(volMontarRodizio).join("")
    : "<p class='subtitle'>Nenhum rodízio cadastrado nesta congregação ainda.</p>";
}
function volMontarGrupo(g, ativo) {
  const gid = Number(g.grupoId);
  const membros = (g.membros || []).map(m => `<li>${volEsc(m.nome)} <span class="vol-matricula">matrícula ${Number(m.membroId)}</span>
      <button type="button" class="btn-link btn-link-perigo" title="Retirar do grupo" aria-label="Retirar ${volEsc(m.nome)} do ${volEsc(g.nome)}" data-on-click="volRetirarDoGrupoAcao" data-args-click="${argsAttr(gid, Number(m.membroId))}">✕</button></li>`).join("");
  return `<div class="vol-grupo">
    <div class="vol-grupo-topo"><strong>${volEsc(g.nome)}</strong> <span class="vol-matricula">${(g.membros || []).length} voluntário(s)</span>
      ${ativo ? `<button type="button" class="btn-link btn-link-perigo" data-on-click="volDesativarGrupoAcao" data-args-click="${argsAttr(gid)}">Desativar grupo</button>` : ""}</div>
    ${membros ? `<ul class="vol-lista">${membros}</ul>` : "<p class='subtitle'>Nenhum voluntário neste grupo ainda.</p>"}
    ${ativo ? `<div class="vol-adicionar">
      <input type="number" id="volMatricula${gid}" min="1" placeholder="Matrícula" aria-label="Matrícula do voluntário a incluir no ${volEsc(g.nome)}" />
      <button type="button" class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="volAdicionarAoGrupoAcao" data-args-click="${argsAttr(gid)}">➕ Adicionar ao grupo</button>
    </div>` : ""}
  </div>`;
}
function volMontarResultadoGeracao(d) {
  const sem = d.semCobertura || [];
  const tabela = sem.length ? `<p class="vol-sub">Vagas sem cobertura</p>
    <div class="rolagem-tabela"><table class="tabela-frequencia vol-tabela-estreita"><thead><tr><th>Data</th><th>Grupo</th><th>Voluntário</th><th>Motivo</th></tr></thead><tbody>
      ${sem.map(s => `<tr><td>${volData(s.dataIso)}</td><td>${volEsc(s.grupoNome)}</td><td>${volEsc(s.nome)}</td><td>${volEsc(s.motivo)}</td></tr>`).join("")}
    </tbody></table></div>` : "";
  return `<div class="vol-resultado"><p><strong>Última geração:</strong> ${volEsc(d.mensagem)}</p>${tabela}</div>`;
}
function volMontarRodizio(r) {
  const rid = Number(r.rodizioId);
  const intervalo = Number(r.intervaloSemanas) || 1;
  const regras = volRegras();
  const aviso = r.composicao && r.composicao.valido === false ? `<p class="vol-erro">⚠️ ${volEsc(r.composicao.mensagem)}</p>` : "";
  const proximas = (r.proximas || []).map(p =>
    `<li>${volData(p.dataIso)} — ${volEsc(p.grupoNome)}${p.gerada ? ' <span class="vol-etiqueta vol-etiqueta-ok">já gerada</span>' : ""}</li>`).join("");
  return `<div class="vol-cartao${r.ativo ? "" : " vol-inativo"}">
    <h5>${volEsc(r.nome)} <span class="vol-etiqueta ${r.ativo ? "vol-etiqueta-ok" : "vol-etiqueta-neutra"}">${r.ativo ? "Ativo" : "Desativado"}</span></h5>
    <p class="vol-meta">Equipe <strong>${volEsc(r.equipeNome)}</strong> (${volEsc(r.rotuloNatureza)}) · ${volEsc(r.rotuloDia)} ${volEsc(r.hora)} · a cada ${intervalo} semana${intervalo === 1 ? "" : "s"}</p>
    <p class="vol-sub">Grupos</p>
    ${(r.grupos || []).map(g => volMontarGrupo(g, r.ativo)).join("") || "<p class='subtitle'>Nenhum grupo ainda: crie pelo menos dois.</p>"}
    ${aviso}
    ${r.ativo ? `<details class="vol-form">
      <summary>➕ Novo grupo</summary>
      <div class="vol-grade">
        <div class="vol-campo"><label for="volNovoGrupoNome${rid}">Nome do grupo</label><input type="text" id="volNovoGrupoNome${rid}" maxlength="60" placeholder="Ex.: Grupo A" /></div>
        <div class="vol-campo"><label for="volNovoGrupoMatriculas${rid}">Matrículas dos voluntários (separadas por vírgula)</label><input type="text" id="volNovoGrupoMatriculas${rid}" placeholder="Ex.: 1021, 1033" /></div>
      </div>
      <div class="vol-acoes"><button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="volCriarGrupoAcao" data-args-click="${argsAttr(rid)}">➕ Criar grupo</button></div>
    </details>` : ""}
    <p class="vol-sub">Próximas datas</p>
    ${proximas ? `<ul class="vol-lista">${proximas}</ul>` : "<p class='subtitle'>Sem datas previstas: o rodízio precisa de grupos com voluntários.</p>"}
    <div class="vol-acoes">
      <label class="vol-inline" for="volSemanas${rid}">Semanas à frente</label>
      <input type="number" class="vol-numero" id="volSemanas${rid}" min="1" max="${Number(regras.maxSemanas) || 26}" value="${Number(regras.semanasPadrao) || 8}" />
      <label class="vol-check"><input type="checkbox" id="volPublicar${rid}" /> Publicar já e avisar os voluntários</label>
    </div>
    <div class="vol-acoes">
      <button type="button" class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="volPreviaRodizioAcao" data-args-click="${argsAttr(rid)}">🔍 Ver prévia</button>
      <button type="button" class="btn-confirmar" style="width:auto;margin:0;"${r.ativo ? "" : " disabled"} data-on-click="volGerarRodizioAcao" data-args-click="${argsAttr(rid, ARG.elemento)}">⚙️ Gerar</button>
      <button type="button" class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="volCancelarFuturosAcao" data-args-click="${argsAttr(rid)}">🗑️ Cancelar futuros em rascunho</button>
      <button type="button" class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="volAlternarRodizioAcao" data-args-click="${argsAttr(rid, r.ativo ? false : true)}">${r.ativo ? "⏸️ Desativar rodízio" : "▶️ Reativar rodízio"}</button>
    </div>
    <div id="volPrevia${rid}"></div>
    ${volResultadoGeracao[rid] ? volMontarResultadoGeracao(volResultadoGeracao[rid]) : ""}
  </div>`;
}

// Ação simples sobre o rodízio ou seus grupos: avisa o resultado e redesenha a seção.
async function volAcaoRodizio(caminho, corpo) {
  volEl("volResultadoRodizios").hidden = true;
  const data = await volEnviar(`voluntariado/${caminho}`, corpo);
  if (data.sucesso === false) { volAvisarErro(data); return null; }
  mostrarToast(data.mensagem || "✅ Pronto.", "sucesso");
  volResultadoGeracao = {};
  await volCarregarRodiziosAcao();
  return data;
}
async function volCriarRodizioAcao(botao) {
  const nome = volEl("volRodizioNome").value.trim();
  const equipeId = Number(volEl("volRodizioEquipe").value);
  const diaSemana = volEl("volRodizioDia").value;
  const hora = volEl("volRodizioHora").value;
  const intervaloSemanas = Number(volEl("volRodizioIntervalo").value);
  const dataAncora = volEl("volRodizioAncora").value;
  if (nome.length < 3 || nome.length > 100) { mostrarToast("Dê um nome ao rodízio (de 3 a 100 caracteres), por exemplo: Limpeza do templo.", "erro"); return; }
  if (!equipeId) { mostrarToast("Escolha a equipe do rodízio.", "erro"); return; }
  if (diaSemana === "") { mostrarToast("Escolha o dia da semana.", "erro"); return; }
  if (!hora) { mostrarToast("Informe a hora.", "erro"); return; }
  if (!dataAncora) { mostrarToast("Informe a data da primeira escala do primeiro grupo.", "erro"); return; }
  if (volDiaDaSemana(dataAncora) !== Number(diaSemana)) {
    const nomeDia = (volCatalogos && volCatalogos.diasSemana || []).find(d => String(d.codigo) === diaSemana);
    mostrarToast(`A data da primeira escala precisa cair no dia da semana escolhido${nomeDia ? ` (${nomeDia.rotulo})` : ""}.`, "erro");
    return;
  }
  await volProtegerBotao(botao, async () => {
    const data = await volAcaoRodizio("rodizios", { congregacaoId: Number(_esCongregacaoAtual), nome, equipeId, diaSemana: Number(diaSemana), hora, intervaloSemanas, dataAncora });
    if (!data) return;
    volEl("volRodizioNome").value = "";
    volEl("volRodizioAncora").value = "";
    volEl("volFormRodizio").open = false;
  });
}
function volAlternarRodizioAcao(rodizioId, ativo) {
  if (!ativo && !confirm("Desativar este rodízio? Os serviços já gerados continuam; nada novo será gerado.")) return;
  return volAcaoRodizio("rodizio-ativo", { rodizioId, ativo });
}
async function volCriarGrupoAcao(rodizioId) {
  const nome = volEl(`volNovoGrupoNome${rodizioId}`).value.trim();
  const lista = volLerMatriculas(volEl(`volNovoGrupoMatriculas${rodizioId}`).value);
  if (!nome) { mostrarToast("Dê um nome ao grupo, por exemplo: Grupo A.", "erro"); return; }
  if (lista.erro) { mostrarToast(lista.erro, "erro"); return; }
  const data = await volAcaoRodizio("grupos", { rodizioId, nome, membroIds: lista.ids });
  if (data && Array.isArray(data.recusados) && data.recusados.length) {
    const cx = volEl("volResultadoRodizios");
    cx.innerHTML = `<p><strong>Não entraram no grupo:</strong></p><ul class="vol-lista">${data.recusados.map(r => `<li>Matrícula ${Number(r.membroId)}: ${volEsc(r.mensagem)}</li>`).join("")}</ul>`;
    cx.hidden = false;
  }
}
function volAdicionarAoGrupoAcao(grupoId) {
  const membroId = Number(volEl(`volMatricula${grupoId}`).value);
  if (!Number.isInteger(membroId) || membroId < 1) { mostrarToast("Informe a matrícula do voluntário.", "erro"); return; }
  return volAcaoRodizio("grupo-membro", { grupoId, membroId });
}
function volRetirarDoGrupoAcao(grupoId, membroId) {
  return volAcaoRodizio("grupo-membro-remover", { grupoId, membroId });
}
function volDesativarGrupoAcao(grupoId) {
  let nome = "";
  for (const r of volRodiziosCarregados) {
    const g = (r.grupos || []).find(x => Number(x.grupoId) === grupoId);
    if (g) nome = g.nome;
  }
  if (!confirm(`Desativar o grupo ${nome}? Os voluntários saem do grupo e ele deixa de entrar no revezamento.`)) return;
  return volAcaoRodizio("grupo-desativar", { grupoId });
}

// Semanas à frente do cartão do rodízio (1 a 26); 0 se o valor não serve.
function volLerSemanas(rodizioId) {
  const maximo = Number(volRegras().maxSemanas) || 26;
  const semanas = Number(volEl(`volSemanas${rodizioId}`).value);
  if (!Number.isInteger(semanas) || semanas < 1 || semanas > maximo) { mostrarToast(`Informe de 1 a ${maximo} semanas.`, "erro"); return 0; }
  return semanas;
}
async function volPreviaRodizioAcao(rodizioId) {
  const semanas = volLerSemanas(rodizioId);
  if (!semanas) return;
  const data = await volObter(`voluntariado/rodizio-previa?rodizioId=${rodizioId}&semanas=${semanas}`);
  if (data.sucesso === false) { volAvisarErro(data); return; }
  const novas = data.ocorrencias || [];
  const existentes = (data.jaExistem || []).map(volData).join(", ");
  volEl(`volPrevia${rodizioId}`).innerHTML = `<div class="vol-resultado">
    <p><strong>Prévia</strong> (de ${volData(data.de)} até ${volData(data.ate)}): ${novas.length ? `seriam criados ${novas.length} serviço(s).` : "nada novo para criar neste período."}</p>
    ${novas.length ? `<ul class="vol-lista">${novas.map(o => `<li>${volEsc(volDataHora(o.dataHora))} — ${volEsc(o.grupoNome)}</li>`).join("")}</ul>` : ""}
    ${existentes ? `<p class="subtitle">Já existem serviços nestas datas, que não serão repetidos: ${volEsc(existentes)}.</p>` : ""}
  </div>`;
}
async function volGerarRodizioAcao(rodizioId, botao) {
  const semanas = volLerSemanas(rodizioId);
  if (!semanas) return;
  const publicar = volEl(`volPublicar${rodizioId}`).checked;
  if (publicar && !confirm("Publicar já? Os voluntários dos grupos da vez são avisados na hora.")) return;
  await volProtegerBotao(botao, async () => {
    const data = await volEnviar("voluntariado/gerar", { rodizioId, semanas, publicar });
    if (data.sucesso === false) { volAvisarErro(data); return; }
    mostrarToast(data.mensagem, "sucesso");
    volResultadoGeracao = {};
    volResultadoGeracao[rodizioId] = data;
    await volCarregarRodiziosAcao();
    carregarServicosAcao();   // os serviços novos entram na lista de serviços
  });
}
async function volCancelarFuturosAcao(rodizioId) {
  if (!confirm("Cancelar os serviços futuros deste rodízio que ainda estão em rascunho? Serve para ajustar os grupos e gerar de novo.")) return;
  const data = await volAcaoRodizio("cancelar-futuros", { rodizioId });
  if (data) carregarServicosAcao();
}

// -- Escalas de Serviço: trava de habitualidade --
async function volCarregarHabitualidadeAcao() {
  const cx = volEl("volPainelHabitualidade");
  if (!cx || !_esCongregacaoAtual) return;
  const seq = ++volSeqHabitualidade;
  const data = await volObter(`voluntariado/habitualidade?congregacaoId=${encodeURIComponent(_esCongregacaoAtual)}`);
  if (seq !== volSeqHabitualidade) return;
  if (data.sucesso === false) { cx.innerHTML = `<p class="subtitle">${volEsc(volMsgErro(data))}</p>`; return; }
  const alertas = data.alertas || [];
  if (!alertas.length) { cx.innerHTML = '<p class="vol-selo-ok">✅ Nenhum voluntário servindo escala após escala.</p>'; return; }
  cx.innerHTML = alertas.map(a => `<div class="vol-cartao vol-cartao-alerta">
    <h5>${volEsc(a.equipeNome)} <span class="vol-etiqueta">${volEsc(a.rotuloNatureza || a.natureza)}</span></h5>
    <ul class="vol-lista">${(a.itens || []).map(i => `<li>${volEsc(i.nome)} — ${Number(i.sequencia)} escalas seguidas (${volDataParede(i.desde)} a ${volDataParede(i.ate)})</li>`).join("")}</ul>
    <p class="subtitle">O Regimento Art. 135 §1º, II quer o revezamento para ninguém servir de forma contínua e habitual. ${a.temRodizio ? "Confira os grupos do rodízio." : "Crie um rodízio para esta equipe."} O alerta aparece a partir de ${Number(a.limite)} escalas seguidas.</p>
  </div>`).join("");
}

// -- Escalas de Serviço: remoções da escala --
async function volCarregarRemocoesAcao() {
  const cx = volEl("volPainelRemocoes");
  if (!cx || !_esCongregacaoAtual) return;
  const seq = ++volSeqRemocoes;
  const data = await volObter(`voluntariado/remocoes?congregacaoId=${encodeURIComponent(_esCongregacaoAtual)}`);
  if (seq !== volSeqRemocoes) return;
  if (data.sucesso === false) { cx.innerHTML = `<p class="subtitle">${volEsc(volMsgErro(data))}</p>`; return; }
  cx.innerHTML = (data.remocoes || []).length
    ? volMontarTabelaRemocoes(data.remocoes, "escalas", true)
    : "<p class='subtitle'>Nenhuma remoção da escala registrada nesta congregação.</p>";
}
async function volRemoverDaEscalaAcao(botao) {
  const membroId = Number(volEl("volRemoverMatricula").value);
  const selEquipe = volEl("volRemoverEquipe");
  const equipeId = selEquipe.value;
  const tipoMotivo = volEl("volRemoverTipo").value;
  const motivo = volEl("volRemoverMotivo").value.trim();
  if (!Number.isInteger(membroId) || membroId < 1) { mostrarToast("Informe a matrícula do voluntário.", "erro"); return; }
  if (motivo.length < 5 || motivo.length > 300) { mostrarToast("Registre o motivo com 5 a 300 caracteres.", "erro"); return; }
  const onde = equipeId ? `da equipe ${selEquipe.options[selEquipe.selectedIndex].text}` : "de todas as equipes que você alcança";
  if (!confirm(`Remover a matrícula ${membroId} da escala ${onde}? As escalas futuras dela são canceladas na hora e a pessoa é avisada.`)) return;
  await volProtegerBotao(botao, async () => {
    const corpo = { membroId, motivo };
    if (tipoMotivo) corpo.tipoMotivo = tipoMotivo;
    if (equipeId) corpo.equipeId = Number(equipeId);
    const data = await volEnviar("voluntariado/remover-da-escala", corpo);
    if (data.sucesso === false) { volAvisarErro(data); return; }
    mostrarToast(data.mensagem, "sucesso");
    volEl("volResultadoRemocao").innerHTML = volMontarResultadoRemocao(data);
    volEl("volRemoverMatricula").value = "";
    volEl("volRemoverMotivo").value = "";
    await volCarregarRemocoesAcao();
  });
}

// -- Habilitação de Voluntários: Termo de Adesão e Lista de Ouro --
async function volCarregarHabilitacaoAcao() {
  if (!authToken || !_hvCongregacaoAtual) return;
  await volGarantirCatalogos();
  volPrepararFormulariosHabilitacao();
  volCarregarAdesoesAcao();
  volCarregarRatificacoesAcao();
}
function volPrepararFormulariosHabilitacao() {
  const frase = volEl("volFraseRatificacao");
  if (!volCatalogos) {
    frase.innerHTML = "<p class='subtitle'>Não foi possível carregar o texto da ratificação. Abra a congregação de novo para tentar outra vez.</p>";
    return;
  }
  const cat = volCatalogos;
  const selForma = volEl("volAdesaoForma"), selCanal = volEl("volAdesaoCanal"), selOrigem = volEl("volRatOrigem");
  volPreencherSelect(selForma, (cat.formasRegistroManual || []).map(f => ({ valor: f.codigo, rotulo: f.rotulo })), selForma.value);
  volPreencherSelect(selCanal, (cat.canaisMensageria || []).map(c => ({ valor: c.codigo, rotulo: c.rotulo })), selCanal.value);
  volPreencherSelect(selOrigem, (cat.origensRatificacao || []).map(o => ({ valor: o.codigo, rotulo: o.rotulo })), selOrigem.value);
  const selVinculo = volEl("volAdesaoVinculo");
  volPreencherSelect(selVinculo, (cat.vinculosResponsavel || []).map(x => ({ valor: x.codigo, rotulo: x.rotulo })), selVinculo.value);
  const selVinculoResp = volEl("volRespVinculo");
  volPreencherSelect(selVinculoResp, (cat.vinculosResponsavel || []).map(x => ({ valor: x.codigo, rotulo: x.rotulo })), selVinculoResp.value);
  volAlternarFormaAdesaoAcao();
  volAlternarOrigemRatificacaoAcao();
  const r = cat.ratificacao || {};
  frase.innerHTML = `<div class="vol-frase-caixa">
    <blockquote class="vol-frase" id="volFraseTexto">${volEsc(r.texto)}</blockquote>
    <div class="vol-acoes">
      <button type="button" class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="volCopiarFraseAcao">📋 Copiar</button>
      <span class="vol-matricula">Versão ${volEsc(r.versao)} do texto</span>
    </div>
  </div>`;
}
function volAlternarFormaAdesaoAcao() {
  volEl("volAdesaoCampoCanal").hidden = volEl("volAdesaoForma").value !== "MENSAGERIA";
}
function volAlternarOrigemRatificacaoAcao() {
  const escala = volEl("volRatOrigem").value === "ESCALA_SERVICO";
  volEl("volRatCampoSessao").hidden = escala;
  volEl("volRatCampoServico").hidden = !escala;
}
async function volCopiarFraseAcao() {
  const bloco = volEl("volFraseTexto");
  if (!bloco) return;
  try {
    await navigator.clipboard.writeText(bloco.textContent);
    mostrarToast("Frase copiada. É só colar no cabeçalho da lista.", "sucesso");
    return;
  } catch (_) { /* sem permissão para a área de transferência: cai na seleção do texto */ }
  const faixa = document.createRange();
  faixa.selectNodeContents(bloco);
  const selecao = window.getSelection();
  selecao.removeAllRanges();
  selecao.addRange(faixa);
  mostrarToast("Selecionei a frase: use Ctrl+C (ou toque e segure) para copiar.", "sucesso");
}

async function volCarregarAdesoesAcao() {
  const resumo = volEl("volResumoAdesoes"), painel = volEl("volPainelAdesoes");
  if (!resumo || !painel || !_hvCongregacaoAtual) return;
  const seq = ++volSeqAdesoes;
  const data = await volObter(`voluntariado/adesoes?congregacaoId=${encodeURIComponent(_hvCongregacaoAtual)}`);
  if (seq !== volSeqAdesoes) return;
  if (data.sucesso === false) { resumo.innerHTML = ""; painel.innerHTML = `<p class="subtitle">${volEsc(volMsgErro(data))}</p>`; return; }
  const lista = data.voluntarios || [];
  resumo.innerHTML = `<p class="vol-resumo"><strong>${Number(data.comTermo)} de ${Number(data.total)}</strong> voluntários já aderiram${Number(data.semTermo) ? ` — faltam ${Number(data.semTermo)}` : ""}.</p>`;
  painel.innerHTML = lista.length
    ? `<div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr><th>Voluntário</th><th>Equipes</th><th>Aderiu</th><th>Forma e data</th><th>Referência</th></tr></thead><tbody>
        ${lista.map(v => `<tr><td>${volEsc(v.nome)} <span class="vol-matricula">matrícula ${Number(v.membroId)}</span>${v.menor ? ` <span class="vol-etiqueta" title="Menor de 18 anos: a adesão é dada pelo responsável legal (aceite dele no sistema) ou pela ficha assinada por ele">menor de 18</span> <span class="vol-etiqueta ${Number(v.responsaveis) ? "vol-etiqueta-ok" : "vol-etiqueta-alerta"}" title="Responsável legal cadastrado pela Secretaria">${Number(v.responsaveis) ? "responsável cadastrado" : "sem responsável cadastrado"}</span>` : ""}${v.renovar ? ` <span class="vol-etiqueta vol-etiqueta-alerta" title="A adesão foi dada pelo responsável e a pessoa já tem 18 anos: ela precisa confirmar a própria">renovar (18 anos)</span>` : ""}${v.suspensa ? ` <span class="vol-etiqueta vol-etiqueta-alerta" title="${volEsc(v.mensagemSuspensa || "")}">${volEsc(v.mensagemSuspensa || "adesão suspensa")}</span>` : ""}</td><td>${volEsc(v.equipes || "")}</td><td>${v.aderiu ? "✅" : "❌"}</td>
          <td>${v.aderiu ? `${volEsc(v.rotuloForma || "")} — ${volData(v.dataAceite)}` : "—"}</td><td>${volEsc(v.referencia || "")}</td></tr>`).join("")}
      </tbody></table></div>`
    : "<p class='subtitle'>Nenhum voluntário ativo nas equipes desta congregação.</p>";
  // 03/10/2026: escalas futuras já marcadas de menor sem adesão que valha (nunca dada, ou suspensa por falta de responsável ativo) — a Secretaria decide.
  const sinal = data.escalasFuturasSemAdesao || [];
  if (sinal.length) painel.innerHTML += `<p class="vol-sub">⚠️ Escalas futuras de menores sem adesão que valha (eles não aceitam nem confirmam até a nova adesão)</p>
    <div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr><th>Menor</th><th>Quando</th><th>Equipe</th><th>Situação</th><th>Motivo</th></tr></thead><tbody>
      ${sinal.map(e => `<tr><td>${volEsc(e.nome)} <span class="vol-matricula">matrícula ${Number(e.membroId)}</span></td><td>${volEsc(e.dataHora ? new Date(e.dataHora).toLocaleString("pt-BR") : "")}</td><td>${volEsc(e.equipe || "")}</td><td>${volEsc(e.status || "")}</td><td>${volEsc(e.motivo || "")}</td></tr>`).join("")}
    </tbody></table></div><p class="subtitle">Remova o(a) menor em “Remover da escala” ou peça ao responsável a nova adesão antes da data.</p>`;
}
async function volRegistrarAdesaoAcao(botao) {
  const membroId = Number(volEl("volAdesaoMatricula").value);
  const forma = volEl("volAdesaoForma").value;
  const dataAceite = volEl("volAdesaoData").value;
  const canal = volEl("volAdesaoCanal").value;
  const referencia = volEl("volAdesaoReferencia").value.trim();
  const responsavelNome = volEl("volAdesaoResponsavel").value.trim();
  const responsavelVinculo = volEl("volAdesaoVinculo").value;
  if (!Number.isInteger(membroId) || membroId < 1) { mostrarToast("Informe a matrícula do voluntário.", "erro"); return; }
  if (!forma) { mostrarToast("Escolha como a adesão foi dada.", "erro"); return; }
  if (!dataAceite) { mostrarToast("Informe a data da assinatura ou da resposta.", "erro"); return; }
  if (forma === "MENSAGERIA" && !canal) { mostrarToast("Escolha o canal: e-mail ou WhatsApp.", "erro"); return; }
  if (referencia.length < 3 || referencia.length > 200) { mostrarToast("Diga onde está a ficha ou onde a conversa foi arquivada (de 3 a 200 caracteres).", "erro"); return; }
  await volProtegerBotao(botao, async () => {
    const corpo = { membroId, forma, dataAceite, referencia };
    if (forma === "MENSAGERIA") corpo.canal = canal;
    // Só vai quando preenchido; o servidor exige para menor de 18 anos (e descarta para maior de idade).
    if (responsavelNome) { corpo.responsavelNome = responsavelNome; corpo.responsavelVinculo = responsavelVinculo; }
    const data = await volEnviar("voluntariado/adesao", corpo);
    if (data.sucesso === false) { volAvisarErro(data); return; }
    mostrarToast(data.mensagem, "sucesso");
    volEl("volAdesaoMatricula").value = "";
    volEl("volAdesaoReferencia").value = "";
    volEl("volAdesaoResponsavel").value = "";
    await volCarregarAdesoesAcao();
  });
}

// Secretaria: cadastrar, listar e revogar o responsável legal de um menor.
async function volCadastrarResponsavelAcao(botao) {
  const menorId = Number(volEl("volRespMenor").value), responsavelId = Number(volEl("volRespResponsavel").value);
  const vinculo = volEl("volRespVinculo").value, documento = volEl("volRespDocumento").value.trim();
  if (!Number.isInteger(menorId) || menorId < 1) { mostrarToast("Informe a matrícula do menor.", "erro"); return; }
  if (!Number.isInteger(responsavelId) || responsavelId < 1) { mostrarToast("Informe a matrícula do responsável.", "erro"); return; }
  if (!vinculo) { mostrarToast("Escolha o vínculo do responsável.", "erro"); return; }
  if (documento.length < 3 || documento.length > 200) { mostrarToast("Descreva o documento conferido (de 3 a 200 caracteres).", "erro"); return; }
  await volProtegerBotao(botao, async () => {
    const data = await volEnviar("voluntariado/responsavel", { menorId, responsavelId, vinculo, documento });
    if (data.sucesso === false) { volAvisarErro(data); return; }
    mostrarToast(data.mensagem, "sucesso");
    volEl("volRespResponsavel").value = "";
    volEl("volRespDocumento").value = "";
    await volVerResponsaveisAcao();
    await volCarregarAdesoesAcao();
  });
}
async function volVerResponsaveisAcao() {
  const cx = volEl("volRespLista");
  const menorId = Number(volEl("volRespMenor").value);
  if (!cx) return;
  if (!Number.isInteger(menorId) || menorId < 1) { cx.innerHTML = ""; mostrarToast("Informe a matrícula do menor.", "erro"); return; }
  const data = await volObter(`voluntariado/responsaveis?menorId=${encodeURIComponent(menorId)}`);
  if (data.sucesso === false) { cx.innerHTML = `<p class="vol-erro">${volEsc(volMsgErro(data))}</p>`; return; }
  const lista = data.responsaveis || [];
  cx.innerHTML = lista.length
    ? `<p class="subtitle">Responsáveis de ${volEsc(data.menor.nome)}:</p><div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr><th>Responsável</th><th>Vínculo</th><th>Documento conferido</th><th>Situação</th><th></th></tr></thead><tbody>
        ${lista.map(r => `<tr><td>${volEsc(r.nome)} <span class="vol-matricula">matrícula ${Number(r.membroId)}</span></td><td>${volEsc(r.rotuloVinculo)}</td><td>${volEsc(r.documento)}</td>
          <td>${r.ativo ? "✅ ativo" : `revogado em ${volDataInstante(r.revogadoEm)}`}</td>
          <td>${r.ativo ? `<button class="btn-link btn-link-perigo" data-on-click="volRevogarResponsavelAcao" data-args-click="${argsAttr(Number(r.responsavelId))}">Revogar</button>` : ""}</td></tr>`).join("")}
      </tbody></table></div>`
    : `<p class="subtitle">Nenhum responsável cadastrado para ${volEsc(data.menor.nome)}.</p>`;
}
async function volRevogarResponsavelAcao(responsavelId) {
  if (!(await confirmarAcao("Revogar este responsável? Ele(a) deixa de poder autorizar. Se era o ÚLTIMO responsável ativo, a adesão dada por ele no sistema fica SUSPENSA (continua guardada como prova): o(a) menor não é mais escalado(a) nem confirma escala até um responsável ativo dar nova adesão.", "Revogar"))) return;
  const data = await volEnviar("voluntariado/responsavel-revogar", { responsavelId: Number(responsavelId) });
  if (data.sucesso === false) { volAvisarErro(data); return; }
  mostrarToast(data.mensagem, (data.escalasFuturas || []).length || data.adesaoSuspensa ? "erro" : "sucesso");
  await volVerResponsaveisAcao();
  await volCarregarAdesoesAcao();
}

async function volRatificarAcao(botao) {
  const origem = volEl("volRatOrigem").value;
  const escala = origem === "ESCALA_SERVICO";
  const refId = Number(volEl(escala ? "volRatServico" : "volRatSessao").value);
  const descricao = volEl("volRatDescricao").value.trim();
  const dataLista = volEl("volRatData").value;
  const lista = volLerMatriculas(volEl("volRatMatriculas").value);
  const maximo = Number(volRegras().maxSignatariosManuais) || 500;
  if (!origem) { mostrarToast("Escolha a origem da lista.", "erro"); return; }
  if (!Number.isInteger(refId) || refId < 1) { mostrarToast(escala ? "Informe o número do serviço (a escala)." : "Informe o número da sessão (assembleia ou reunião).", "erro"); return; }
  if (descricao.length < 5 || descricao.length > 200) { mostrarToast("Descreva a lista (de 5 a 200 caracteres).", "erro"); return; }
  if (!dataLista) { mostrarToast("Informe a data da lista.", "erro"); return; }
  if (lista.erro) { mostrarToast(lista.erro, "erro"); return; }
  if (lista.ids.length > maximo) { mostrarToast(`Informe até ${maximo} matrículas avulsas por registro.`, "erro"); return; }
  if (!volEl("volRatCabecalho").checked) { mostrarToast("Marque a confirmação do cabeçalho da lista: sem a menção expressa à ratificação, ela não vale.", "erro"); return; }
  await volProtegerBotao(botao, async () => {
    const corpo = { origem, descricao, dataLista, cabecalhoConfirmado: true };
    if (escala) corpo.servicoId = refId; else corpo.sessaoId = refId;
    if (lista.ids.length) corpo.membroIds = lista.ids;
    const data = await volEnviar("voluntariado/ratificar", corpo);
    const cx = volEl("volResultadoRatificacao");
    if (data.sucesso === false) {
      cx.innerHTML = `<p class="vol-erro">${volEsc(volMsgErro(data))}</p>`;   // inclui a recusa por escopo (403)
      volAvisarErro(data);
      return;
    }
    mostrarToast(data.mensagem, "sucesso");
    const ignoradas = data.matriculasIgnoradas || [];
    cx.innerHTML = `<div class="vol-resultado"><p>${volEsc(data.mensagem)}</p><ul class="vol-lista">
      <li>Signatários: ${Number(data.totalSignatarios)}</li><li>Novas adesões: ${Number(data.novasAdesoes)}</li><li>Já aderiam: ${Number(data.jaAderiam)}</li>
      ${ignoradas.length ? `<li>Matrículas ignoradas (não existem no cadastro): ${ignoradas.map(Number).join(", ")}</li>` : ""}
      ${Number(data.menoresIgnorados) ? `<li>Menores de 18 anos que ficaram de fora: ${Number(data.menoresIgnorados)} — a adesão deles é pela ficha assinada pelo responsável</li>` : ""}</ul></div>`;
    ["volRatSessao", "volRatServico", "volRatDescricao", "volRatData", "volRatMatriculas"].forEach(id => { volEl(id).value = ""; });
    volEl("volRatCabecalho").checked = false;
    await Promise.all([volCarregarAdesoesAcao(), volCarregarRatificacoesAcao()]);
  });
}
async function volCarregarRatificacoesAcao() {
  const cx = volEl("volPainelRatificacoes");
  if (!cx) return;
  const data = await volObter("voluntariado/ratificacoes");
  if (data.sucesso === false) { cx.innerHTML = `<p class="subtitle">${volEsc(volMsgErro(data))}</p>`; return; }
  const lista = data.ratificacoes || [];
  cx.innerHTML = lista.length
    ? `<div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr><th>Data da lista</th><th>Origem</th><th>Descrição</th><th>Signatários</th><th>Novas adesões</th><th>Registrada em</th></tr></thead><tbody>
        ${lista.map(r => `<tr><td>${volData(r.dataLista)}</td><td>${volEsc(r.rotuloOrigem)}</td><td>${volEsc(r.descricao)}</td><td>${Number(r.totalSignatarios)}</td><td>${Number(r.novasAdesoes)}</td><td>${volDataInstante(r.registradoEm)}</td></tr>`).join("")}
      </tbody></table></div>`
    : "<p class='subtitle'>Nenhuma lista registrada ainda.</p>";
}

registrarAcoes({
  volAderirTermoAcao, volAdicionarAoGrupoAcao, volAlternarFormaAdesaoAcao, volAlternarOrigemRatificacaoAcao, volAlternarRodizioAcao,
  volAtualizarBotaoMenorAcao, volAtualizarBotaoTermoAcao, volAutorizarMenorAcao, volCadastrarResponsavelAcao, volCancelarFuturosAcao,
  volCopiarFraseAcao, volCriarGrupoAcao, volCriarRodizioAcao, volDesativarGrupoAcao, volGerarRodizioAcao, volMudarNaturezaAcao, volPreviaRodizioAcao,
  volRatificarAcao, volRegistrarAdesaoAcao, volReintegrarAcao, volRemoverDaEscalaAcao, volRemoverLiderAcao, volRetirarDoGrupoAcao,
  volRevogarResponsavelAcao, volVerResponsaveisAcao
});
