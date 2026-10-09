// app/modulos/meus-dados.js — módulo extraído do script.js (vD.2, 2026-10-07).
// Script clássico, carregado pelo index.html DEPOIS do script.js e do eventos.js: compartilha o escopo
// global com eles (as funções e constantes abaixo continuam acessíveis pelo nome, como antes). As ações
// que o HTML pede deste módulo são registradas aqui mesmo, no fim do arquivo (registrarAcoes mescla).

// ---- MINHA FOTO (v1.10 — autoatendimento, dentro de Meus Dados (LGPD)) ----
// v7.7: quem tem menos de 18 anos não consente sozinho — só vale a autorização do RESPONSÁVEL (Meu Painel → Ministério com menores). Sem ela, o envio nem é oferecido.
let minhaFotoBloqueadaParaMenor = false;
let minhaFotoDono = null;   // de quem é o aviso que está na tela (outra pessoa entrou: o estado dela não vale para esta)
function aplicarEnvioDaMinhaFoto(data) {
  const aviso = document.getElementById("minhaFotoAvisoMenor"), envio = document.getElementById("minhaFotoEnvio");
  const menor = !!(data && data.sucesso && data.menorDeIdade === true);
  const liberada = menor && data.consentimentoConcedido === true;
  minhaFotoBloqueadaParaMenor = menor && !liberada;
  if (envio) envio.style.display = minhaFotoBloqueadaParaMenor ? "none" : "";
  if (!aviso) return;
  aviso.className = minhaFotoBloqueadaParaMenor ? "subtitle psc-aviso" : "subtitle";
  aviso.textContent = minhaFotoBloqueadaParaMenor
    ? "Você tem menos de 18 anos: o seu responsável precisa autorizar o uso da sua imagem antes de você enviar a foto. Peça a ele(a) que entre no sistema e autorize em Meu Painel → Ministério com menores (se ele(a) ainda não consta como seu responsável, a Secretaria da congregação faz esse cadastro). Depois da autorização, o envio da foto fica liberado aqui. Exemplo: a sua mãe entra com a matrícula dela, abre Ministério com menores e toca em \"Ler o texto e autorizar\"."
    : (liberada ? "O seu responsável autorizou o uso da sua imagem: você pode enviar a foto." : "");
}
async function carregarMinhaFoto() {
  const preview = document.getElementById("minhaFotoPreview");
  if (!authMatricula || !preview) return;
  if (minhaFotoDono !== authMatricula) { aplicarEnvioDaMinhaFoto(null); minhaFotoDono = authMatricula; }
  const res = await fetchProtegido(`${API_BASE}/minha-foto/${authMatricula}`);
  const data = await res.json();
  aplicarEnvioDaMinhaFoto(data);
  if (!data.sucesso) { preview.innerHTML = ""; return; }
  preview.innerHTML = data.fotoUrl
    ? `<img src="${urlSegura(data.fotoUrl)}" alt="Minha foto" style="max-width:160px;border-radius:8px;" />`
    : "<span class='subtitle'>Você ainda não tem foto cadastrada.</span>";
}

async function enviarMinhaFotoAcao() {
  const input = document.getElementById("minhaFotoArquivo");
  const msg = document.getElementById("resultadoMinhaFoto");
  if (minhaFotoBloqueadaParaMenor) { msg.textContent = "O seu responsável precisa autorizar o uso da sua imagem antes do envio da foto."; return; }
  if (!authMatricula || !input.files[0]) {
    msg.textContent = "Escolha um arquivo de imagem.";
    return;
  }
  const recorte = await abrirRecorteFoto(input.files[0]);
  if (!recorte) return;
  const res = await fetchProtegido(`${API_BASE}/minha-foto/${authMatricula}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fotoBase64: recorte.base64, mimeType: recorte.mimeType })
  });
  const data = await res.json();
  avisarResultado(data); // toast — falha (ex: sem consentimento) não pode passar batido só num texto discreto
  msg.textContent = data.mensagem;
  if (data.sucesso) {
    input.value = "";
    carregarMinhaFoto();
  }
}

// ---- ATUALIZAR MEUS DADOS (v1.11 — campos editáveis direto, sem aprovação) ----
const ROTULO_ESTADO_CIVIL_MEUPAINEL = { SOLTEIRO: "Solteiro(a)", CASADO: "Casado(a)", VIUVO: "Viúvo(a)", DIVORCIADO: "Divorciado(a)", UNIAO_ESTAVEL: "União Estável" };
const ROTULO_FORMA_ADMISSAO_MEUPAINEL = { BATISMO: "Batismo nas águas", CARTA_MUDANCA: "Carta de Mudança", RECONCILIACAO: "Reconciliação", ACLAMACAO: "Aclamação" };

async function carregarMeusDadosForm() {
  if (!authMatricula) return;
  const res = await fetchProtegido(`${API_BASE}/meus-dados/${authMatricula}`);
  const data = await res.json();
  if (!data.sucesso) return;
  const d = data.dados;
  document.getElementById("meuTelefone").value = d.telefone || "";
  document.getElementById("meuEmail").value = d.email || "";
  document.getElementById("meuEndereco").value = d.endereco || "";
  document.getElementById("meuEstadoCivil").value = d.estadoCivil || "";

  const partes = [
    `Nascimento: ${d.dataNascimento || "-"}`,
    `Admissão: ${d.dataAdmissao || "-"}`,
    `Batismo: ${d.dataBatismo || "-"}`,
    `Forma de Admissão: ${ROTULO_FORMA_ADMISSAO_MEUPAINEL[d.formaAdmissao] || "-"}`,
    `Origem: ${d.origem || "-"}`,
    `Igreja Anterior: ${d.igrejaAnterior || "-"}`,
    `Rito: ${d.dataRitoRecebimento || "-"}`
  ];
  document.getElementById("dadosAtuaisReferencia").textContent = "Como está hoje — " + partes.join(" · ");
}

async function salvarMeusDadosAcao() {
  if (!authMatricula) return;
  const msg = document.getElementById("resultadoMeusDados");
  const telefone = document.getElementById("meuTelefone").value.trim();
  const email = document.getElementById("meuEmail").value.trim();
  const endereco = document.getElementById("meuEndereco").value.trim();
  const estadoCivil = document.getElementById("meuEstadoCivil").value;

  const res = await fetchProtegido(`${API_BASE}/meus-dados/${authMatricula}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telefone, email, endereco, estadoCivil })
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.mensagem;
}

// ---- MEUS VÍNCULOS FAMILIARES (v1.11 — autoatendimento) ----
async function carregarOpcoesMeuVinculoTipo() {
  const select = document.getElementById("meuVinculoTipo");
  const res = await fetchProtegido(`${API_BASE}/catalogos/tiposVinculoFamiliar`);
  const tipos = await jsonDaTela(res, select, "objeto");
  if (tipos === null) return;
  select.innerHTML = tipos.filter(t => t.ativo !== false).map(t => `<option value="${t.tipoVinculoId}">${escaparHtmlEbd(t.rotuloDireto)}</option>`).join("");
}

async function carregarMeusVinculos() {
  if (!authMatricula) return;
  const container = document.getElementById("resultadoListaMeusVinculos");
  const res = await fetchProtegido(`${API_BASE}/meus-vinculos/${authMatricula}`);
  const vinculos = await jsonDaTela(res, container, "lista");
  if (vinculos === null) return;
  if (!Array.isArray(vinculos) || vinculos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum vínculo familiar cadastrado ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Parentesco</th><th>Pessoa</th><th></th></tr></thead><tbody>`;
  vinculos.forEach(v => {
    html += `<tr>
      <td>${escaparHtmlEbd(v.rotulo)}</td>
      <td>${escaparHtmlEbd(v.outraPessoaNome)} (${v.outraPessoaId})${v.outraPessoaEhResponsavel ? ' <span class="badge-status badge-ativo">Responsável Legal</span>' : ""}</td>
      <td class="acoes-inline"><button class="btn-link btn-link-perigo" data-on-click="removerMeuVinculoAcao" data-args-click="${argsAttr(v.vinculoId)}">Remover</button></td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function salvarMeuVinculoAcao() {
  if (!authMatricula) return;
  const tipoVinculoId = document.getElementById("meuVinculoTipo").value;
  const membroParenteId = document.getElementById("meuVinculoMatriculaParente").value;
  const responsavelLegal = document.getElementById("meuVinculoResponsavelLegal").checked;
  if (!tipoVinculoId || !membroParenteId) {
    mostrarToast("Informe o tipo de vínculo e a matrícula da outra pessoa.", "erro");
    return;
  }
  const res = await fetchProtegido(`${API_BASE}/meus-vinculos/${authMatricula}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroParenteId, tipoVinculoId, responsavelLegal })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) {
    document.getElementById("meuVinculoMatriculaParente").value = "";
    document.getElementById("meuVinculoResponsavelLegal").checked = false;
    carregarMeusVinculos();
  }
}

async function removerMeuVinculoAcao(vinculoId) {
  if (!(await confirmarAcao("Remover este vínculo familiar?", "Remover"))) return;
  const res = await fetchProtegido(`${API_BASE}/meus-vinculos/${authMatricula}/${vinculoId}`, { method: "DELETE" });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarMeusVinculos();
}

// ---- SOLICITAR EDIÇÃO SUJEITA A APROVAÇÃO (v1.11) ----
const ROTULO_STATUS_SOLICITACAO_EDICAO = { PENDENTE: "Pendente", APROVADO: "Aprovado", REJEITADO: "Rejeitado" };

async function enviarSolicitacaoEdicaoAcao() {
  if (!authMatricula) return;
  const msg = document.getElementById("resultadoSolicitacaoEdicao");
  const campos = {};
  const lerSeInformado = (id, chave) => {
    const valor = document.getElementById(id).value;
    if (valor) campos[chave] = valor.trim ? valor.trim() : valor;
  };
  lerSeInformado("solEdicaoDataNascimento", "dataNascimento");
  lerSeInformado("solEdicaoDataAdmissao", "dataAdmissao");
  lerSeInformado("solEdicaoDataBatismo", "dataBatismo");
  lerSeInformado("solEdicaoFormaAdmissao", "formaAdmissao");
  lerSeInformado("solEdicaoOrigem", "origem");
  lerSeInformado("solEdicaoIgrejaAnterior", "igrejaAnterior");
  lerSeInformado("solEdicaoDataRitoRecebimento", "dataRitoRecebimento");
  lerSeInformado("solEdicaoNomeLidoRito", "nomeLidoRito");
  lerSeInformado("solEdicaoMinistranteRito", "ministranteRito");

  if (Object.keys(campos).length === 0) {
    msg.textContent = "Preencha ao menos um campo pra solicitar correção.";
    return;
  }

  const res = await fetchProtegido(`${API_BASE}/solicitacoes-edicao/${authMatricula}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ campos })
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.mensagem;
  if (data.sucesso) {
    ["solEdicaoDataNascimento", "solEdicaoDataAdmissao", "solEdicaoDataBatismo", "solEdicaoFormaAdmissao",
      "solEdicaoOrigem", "solEdicaoIgrejaAnterior", "solEdicaoDataRitoRecebimento", "solEdicaoNomeLidoRito", "solEdicaoMinistranteRito"
    ].forEach(id => { document.getElementById(id).value = ""; });
    carregarMinhasSolicitacoesEdicao();
  }
}

async function carregarMinhasSolicitacoesEdicao() {
  if (!authMatricula) return;
  const container = document.getElementById("resultadoListaSolicitacoesEdicao");
  const res = await fetchProtegido(`${API_BASE}/solicitacoes-edicao/${authMatricula}`);
  const solicitacoes = await jsonDaTela(res, container, "lista");
  if (solicitacoes === null) return;
  if (!Array.isArray(solicitacoes) || solicitacoes.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma solicitação enviada ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Data</th><th>Campo</th><th>Valor Anterior</th><th>Valor Proposto</th><th>Status</th></tr></thead><tbody>`;
  solicitacoes.forEach(s => {
    s.campos.forEach((c, i) => {
      html += `<tr>
        ${i === 0 ? `<td rowspan="${s.campos.length}">${new Date(s.dataSolicitacao).toLocaleDateString("pt-BR")}</td>` : ""}
        <td>${escaparHtmlEbd(c.nomeCampo)}</td>
        <td>${escaparHtmlEbd(c.valorAnterior) || "-"}</td>
        <td>${escaparHtmlEbd(c.valorProposto)}</td>
        <td>${ROTULO_STATUS_SOLICITACAO_EDICAO[c.status] || escaparHtmlEbd(c.status)}</td>
      </tr>`;
    });
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

function mostrarAbaSecretaria(aba) {
  chaveAjudaAtual = aba;
  NOMES_ABAS.forEach(nome => {
    const podeVer = nome === "meupainel" || nome === "documentos" || nome === "ouvidoria" || temPermissaoDaAba(nome);
    const divAba = document.getElementById(`aba${capitalize(nome)}`);
    const mostrar = nome === aba && podeVer;
    divAba.style.display = mostrar ? "block" : "none";
    const btn = document.getElementById(`btnAba${capitalize(nome)}`);
    if (btn) btn.classList.toggle("ativo", nome === aba);
  });
  if (aba === "meupainel") {
    mostrarSubAbaMeupainel(subAbaMeupainelAtual);
    return;
  }
  if (aba === "financeiro") {
    mostrarSubAbaFinanceiro(subAbaFinanceiroAtual);
    return;
  }
  document.getElementById("tituloModulo").textContent = TITULOS_MODULOS[aba] || "Governança";
  if (aba === "reunioes") {
    if (moduloAtual === "orgaosRegionais") montarSubmenuOrgaosRegionais(); else montarSubmenuOrgaosCentrais();
    carregarElegiveisAssembleia();
  }
  if (aba === "pessoas") { carregarOpcoesFormPessoa().then(() => mostrarSubAbaPessoas(subAbaPessoasAtual)); carregarPessoas(); }
  if (aba === "cartas") { carregarCartas(); processarSaidasCartas(); }
  if (aba === "orgaos") { carregarOrgaos(); carregarAssentos(); montarOrgaosLocais(); }
  if (aba === "estrutura") montarEstrutura();
  if (aba === "catalogos") montarCatalogos();
  if (aba === "permissoes") { carregarOpcoesEscopoPermissao(); carregarPermissoes(); carregarNotificacaoRegras(); }
  if (aba === "consagracoes") { carregarTiposConsagracao(); carregarConsagracoes(); carregarTurmasBatismo(); carregarCandidatosBatismo(); }
  if (aba === "enquetes") { ajustarFormEnquetePorNivel(); carregarEnquetes(); }
  if (aba === "arquivos") { carregarOpcoesFormDocumentos(); carregarDocumentos(); carregarPoliticasRetencao(); carregarTextoMestre(); }
  if (aba === "disciplina") { carregarOpcoesFormDisciplina(); carregarProcessosDisciplinares(); }
  if (aba === "abandono") { carregarRadarAbandono(); carregarOpcoesTentativaContato(); carregarRadarAbandonoDigital(); carregarProcedimentosAbandono(); }
  if (aba === "auditoria") {
    carregarAuditoria(); carregarIndicadoresAcao(); carregarAlertasComplianceAcao(); carregarCongregacoesPrestacaoAcao(); carregarPrestacoesContasAcao();
    carregarRecertificacoesAcao(); verificarCadeiaAuditoriaAcao(); carregarAncoragensAcao(); carregarAuditoriasNiveisAcao();
    carregarPareceresConselhoAcao(); carregarSinalizacoesNifAcao(); carregarComunicacoesCoafAcao();
    carregarOpcoesCongregacoesFinanceiro();
    carregarDoacoesAcao(); carregarPoliticasAcao(); carregarDueDiligenceAcao(); carregarConflitosInteresseAcao();
  }
  if (aba === "protecaodedados") { carregarSolicitacoesDPO(); carregarPoliticasRetencao("resultadoListaPoliticasRetencaoDpo"); carregarRopa(); carregarRipd(); }
  if (aba === "ouvidoria") carregarPainelOuvidoria();
  if (aba === "mediacao") carregarMediacoes();
  if (aba === "relatoriosdepto") carregarOpcoesRelatorioDepto();
  if (aba === "escalas") carregarOpcoesEscalasAcao();
  if (aba === "habilitacao") carregarOpcoesHabilitacaoAcao();
  if (aba === "menores") carregarOpcoesMenoresAcao();
  if (aba === "assistenciasocial") { carregarOpcoesAssistenciaSocialAcao(); carregarProfissionaisAssistenciaAcao(); }
  if (aba === "ebd") {
    const modoProfessor = !authPermissoes.includes("ebd_gestao");
    document.getElementById("abaEbd").classList.toggle("ebd-modo-professor", modoProfessor);
    carregarOpcoesChamadaEbdAcao();
    preencherTurmasSalaEbd();
    if (modoProfessor) renderPainelProfessorEbd();
    else { carregarOpcoesEbdAcao(); carregarVisaoAgrupadaEbdAcao(); carregarOpcoesFinanceiroEbdAcao(); carregarOpcoesCadernetaEbdAcao(); carregarOpcoesPlanosEbdAcao(); }
  }
  if (aba === "conquistas") { carregarTiposEventoConquistaAcao(); carregarCatalogoConquistaAdminAcao(); }
  if (aba === "trilhas") carregarOpcoesTrilhasAcao();
  if (aba === "psc") carregarOpcoesPscAcao();
  if (aba === "calendario") carregarOpcoesCalendarioAcao();
  if (aba === "canais") carregarOpcoesCanaisAcao();
  if (aba === "eventos") carregarOpcoesEventosAcao();
  if (aba === "setores") carregarOpcoesSetoresAcao();
  if (aba === "vistoria") carregarOpcoesVistoriaAcao();
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function alternarSidebar() {
  document.getElementById("sidebar").classList.toggle("recolhido");
}

// vD.6 (07/10/2026) — gaveta do menu no celular (≤ 640 px): o ☰ do cabeçalho abre/fecha; escolher uma aba
// ou tocar no fundo escurecido fecha. Só mexe em classes; a largura e a posição vêm do CSS (@media).
function alternarMenuCelular(forcar) {
  const sidebar = document.getElementById("sidebar");
  const fundo = document.getElementById("fundoMenuCelular");
  const botao = document.getElementById("btnMenuCelular");
  if (!sidebar) return;
  const abrir = typeof forcar === "boolean" ? forcar : !sidebar.classList.contains("aberto-celular");
  sidebar.classList.toggle("aberto-celular", abrir);
  if (fundo) fundo.classList.toggle("visivel", abrir);
  if (botao) botao.setAttribute("aria-expanded", abrir ? "true" : "false");
}
document.addEventListener("DOMContentLoaded", () => {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;
  sidebar.addEventListener("click", (e) => {
    if (window.innerWidth <= 640 && e.target.closest(".btn-aba, .btn-subaba, .link-secretaria")) alternarMenuCelular(false);
  });
});
const TITULOS_MODULOS = {
  meupainel: "Meu Painel", financeiro: "Financeiro", reunioes: "Reuniões",
  pessoas: "Pessoas", cartas: "Cartas de Trânsito", congregacoes: "Congregações",
  orgaos: "Órgãos", estrutura: "Estrutura", catalogos: "Catálogos",
  permissoes: "Permissões", consagracoes: "Consagrações", disciplina: "Processo Disciplinar",
  abandono: "Perda de Membresia",
  auditoria: "Auditoria", protecaodedados: "Proteção de Dados", ouvidoria: "Ouvidoria", documentos: "Documentos",
  mediacao: "Mediação e Arbitragem", relatoriosdepto: "Relatórios de Departamentos",
  escalas: "Escalas de Serviço", habilitacao: "Habilitação de Voluntários", menores: "Ministério com Menores",
  assistenciasocial: "Assistência Social", ebd: "EBD (Escola Bíblica Dominical)",
  conquistas: "Conquistas e Gamificação", trilhas: "Formação e Certificação",
  psc: "Saúde Congregacional (PSC)", calendario: "Calendário Oficial", canais: "Canais e Comunicação", eventos: "Eventos e Congressos",
  setores: "Setores Técnicos", vistoria: "Vistoria de Antecedentes"
};

registrarAcoes({
  alternarMenuCelular, alternarSidebar, enviarMinhaFotoAcao, enviarSolicitacaoEdicaoAcao, mostrarAbaSecretaria, removerMeuVinculoAcao,
  salvarMeusDadosAcao, salvarMeuVinculoAcao
});
