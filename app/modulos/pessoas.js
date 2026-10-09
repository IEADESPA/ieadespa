// app/modulos/pessoas.js — módulo extraído do script.js (vD.2, 2026-10-07).
// Script clássico, carregado pelo index.html DEPOIS do script.js e do eventos.js: compartilha o escopo
// global com eles (as funções e constantes abaixo continuam acessíveis pelo nome, como antes). As ações
// que o HTML pede deste módulo são registradas aqui mesmo, no fim do arquivo (registrarAcoes mescla).

// ---- SECRETARIA / ABA PESSOAS ----
// Fallback defensivo: se o catálogo de status ainda não existir no banco (migração
// 016 não rodou), o formulário continua usável com os status semeados.
const STATUS_DEFAULT = [
  { sigla: "ATIVO", nome: "ATIVO", ativa: true },
  { sigla: "LICENÇA", nome: "LICENÇA", ativa: true },
  { sigla: "INATIVO", nome: "INATIVO", ativa: true },
  { sigla: "DESLIGADO", nome: "DESLIGADO", ativa: true }
];

async function carregarOpcoesFormPessoa() {
  const [resCong, resDepto, resCargo, resExt, resStatus, resSituacoes] = await Promise.all([
    fetchProtegido(`${API_BASE}/congregacoes`),
    fetchProtegido(`${API_BASE}/catalogos/departamentos`),
    fetchProtegido(`${API_BASE}/catalogos/cargosMinisteriais`),
    fetchProtegido(`${API_BASE}/catalogos/extensoes`),
    fetchProtegido(`${API_BASE}/catalogos/statuses`),
    fetchProtegido(`${API_BASE}/catalogos/situacoes`)
  ]);
  const congregacoes = await listaDaApi(resCong);
  const departamentos = await listaDaApi(resDepto);
  const cargos = await listaDaApi(resCargo);
  const extensoes = await listaDaApi(resExt);
  const statusesRaw = await resStatus.json();
  const statuses = Array.isArray(statusesRaw) ? statusesRaw : STATUS_DEFAULT;
  const situacoesRaw = await resSituacoes.json();
  const situacoes = Array.isArray(situacoesRaw) ? situacoesRaw : [];

  // Cacheados pra resolver nome (não só sigla/id) na aba Dados do Perfil.
  window._departamentosCache = departamentos;
  window._cargosCache = cargos;

  const selectCong = document.getElementById("pessoaCongregacao");
  selectCong.innerHTML = congregacoes.filter(c => c.ativa).map(c => `<option value="${c.congregacaoId}">${escaparHtmlEbd(c.nome)}</option>`).join("");

  const selectFiltroCong = document.getElementById("pessoasFiltroCongregacao");
  if (selectFiltroCong) {
    selectFiltroCong.innerHTML = `<option value="">Todas as congregações</option>` +
      congregacoes.map(c => `<option value="${c.congregacaoId}">${escaparHtmlEbd(c.nome)}</option>`).join("");
  }
  const selectFiltroSituacao = document.getElementById("pessoasFiltroSituacao");
  if (selectFiltroSituacao) {
    selectFiltroSituacao.innerHTML = `<option value="">Todas as situações</option>` +
      situacoes.filter(s => s.ativa !== false).map(s => `<option value="${escaparHtmlEbd(s.sigla)}">${escaparHtmlEbd(s.nome)}</option>`).join("");
  }

  const selectExt = document.getElementById("pessoaExtensao");
  const nomeCongPorId = Object.fromEntries(congregacoes.map(c => [String(c.congregacaoId), c.nome]));
  selectExt.innerHTML = `<option value="">Não se aplica (fica só na Congregação)</option>` +
    extensoes.filter(e => e.ativa).map(e => `<option value="${e.extensaoId}">${escaparHtmlEbd(e.nome)} (${escaparHtmlEbd(nomeCongPorId[String(e.congregacaoMaeId)]) || "?"})</option>`).join("");

  const selectDepto = document.getElementById("pessoaDepartamento");
  const deptosAtivos = departamentos.filter(d => d.ativo);
  const opcaoDepto = d => `<option value="${d.departamentoId}">${escaparHtmlEbd(d.nome)}</option>`;
  const grupoDepto = (rotulo, itens) => itens.length ? `<optgroup label="${rotulo}">${itens.map(opcaoDepto).join("")}</optgroup>` : "";
  selectDepto.innerHTML = `<option value="">Não informado</option>` +
    grupoDepto("Departamentos", deptosAtivos.filter(d => d.tipo === "DEPARTAMENTO")) +
    grupoDepto("Secretarias Adjuntas", deptosAtivos.filter(d => d.tipo === "SECRETARIA_ADJUNTA")) +
    grupoDepto("Outros", deptosAtivos.filter(d => d.tipo !== "DEPARTAMENTO" && d.tipo !== "SECRETARIA_ADJUNTA"));

  const selectCargo = document.getElementById("pessoaCargoMinisterial");
  selectCargo.innerHTML = `<option value="">Não informado</option>` +
    cargos.filter(c => c.ativo).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)).map(c => `<option value="${escaparHtmlEbd(c.sigla)}">${escaparHtmlEbd(c.nome)}</option>`).join("");

  const selectStatus = document.getElementById("pessoaStatus");
  selectStatus.innerHTML = statuses
    .filter(s => s.ativa !== false)
    .map(s => `<option value="${escaparHtmlEbd(s.sigla)}">${escaparHtmlEbd(s.nome)}</option>`).join("");
}

async function salvarPessoa() {
  const membroId = document.getElementById("pessoaMatricula").value;
  const nome = document.getElementById("pessoaNome").value;
  const congregacaoId = document.getElementById("pessoaCongregacao").value;
  const status = document.getElementById("pessoaStatus").value;
  const dataNascimento = document.getElementById("pessoaDataNascimento").value || null;
  const dataAdmissao = document.getElementById("pessoaDataAdmissao").value || null;
  const formaAdmissao = document.getElementById("pessoaFormaAdmissao").value || null;
  const dataBatismo = document.getElementById("pessoaDataBatismo").value || null;
  const origem = document.getElementById("pessoaOrigem").value.trim() || null;
  const igrejaAnterior = document.getElementById("pessoaIgrejaAnterior").value.trim() || null;
  const dataRitoRecebimento = document.getElementById("pessoaDataRitoRecebimento").value || null;
  const nomeLidoRito = document.getElementById("pessoaNomeLidoRito").value.trim() || null;
  const ministranteRito = document.getElementById("pessoaMinistranteRito").value.trim() || null;
  const situacaoMembro = document.getElementById("pessoaSituacao").value;
  const estadoCivil = document.getElementById("pessoaEstadoCivil").value || null;
  const dataAfastamento = document.getElementById("pessoaDataAfastamento").value || null;
  const motivoSaida = document.getElementById("pessoaMotivoSaida").value || null;
  const dizimistaSelect = document.getElementById("pessoaDizimista").value;
  const dizimistaFiel = dizimistaSelect === "" ? null : dizimistaSelect === "true";
  const departamentoId = document.getElementById("pessoaDepartamento").value || null;
  const cargoMinisterial = document.getElementById("pessoaCargoMinisterial").value || null;
  const telefone = document.getElementById("pessoaTelefone").value.trim() || null;
  const email = document.getElementById("pessoaEmail").value.trim() || null;
  const endereco = document.getElementById("pessoaEndereco").value.trim() || null;
  const extensaoId = document.getElementById("pessoaExtensao").value || null;
  const msg = document.getElementById("resultadoPessoa");

  if (!membroId || !nome) {
    msg.textContent = "Informe matrícula e nome.";
    return;
  }

  const res = await fetchProtegido(`${API_BASE}/pessoas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      membroId, nome, congregacaoId, status, dataNascimento, dataAdmissao, situacaoMembro, dizimistaFiel,
      departamentoId, cargoMinisterial, telefone, email, endereco, extensaoId,
      formaAdmissao, dataBatismo, origem, igrejaAnterior, dataRitoRecebimento, nomeLidoRito, ministranteRito,
      estadoCivil, dataAfastamento, motivoSaida
    })
  });
  const data = await res.json();
  msg.textContent = data.mensagem;
  if (!data.sucesso) return;

  await carregarPessoas();

  // Editando dentro do Perfil (aba Editar) — mantém onde está, só atualiza o
  // cabeçalho. Cadastrando pessoa nova — limpa o formulário e oferece o Perfil.
  const emPerfil = document.getElementById("subPessoasPerfil").style.display !== "none";
  if (emPerfil) {
    const pessoa = (window._pessoasCache || []).find(p => p.membroId === Number(membroId));
    if (pessoa) {
      document.getElementById("perfilPessoaNome").textContent = pessoa.nome;
      document.getElementById("perfilPessoaSubtitulo").textContent = `Matrícula ${pessoa.membroId} · ${pessoa.congregacao || "sem congregação"}`;
    }
  } else {
    const idSalvo = Number(membroId);
    const mensagemSucesso = data.mensagem;
    limparFormPessoa(); // limpa inclusive resultadoPessoa/linkPerfilAposCadastro — restaura os dois abaixo
    msg.textContent = mensagemSucesso;
    document.getElementById("linkPerfilAposCadastro").innerHTML =
      `<button class="btn-link" data-on-click="abrirPerfilPessoa" data-args-click="${argsAttr(idSalvo)}">→ Ver perfil desta pessoa</button>`;
  }
}

// ---- NAVEGAÇÃO DA ABA PESSOAS (v1.10 — submenu Cadastrar/Buscar + Perfil) ----

let subAbaPessoasAtual = "cadastrar";

function limparFormPessoa() {
  ["pessoaMatricula", "pessoaNome", "pessoaOrigem", "pessoaIgrejaAnterior", "pessoaNomeLidoRito",
    "pessoaMinistranteRito", "pessoaTelefone", "pessoaEmail", "pessoaEndereco"].forEach(id => {
    document.getElementById(id).value = "";
  });
  ["pessoaDataNascimento", "pessoaDataAdmissao", "pessoaDataBatismo", "pessoaDataRitoRecebimento",
    "pessoaDataAfastamento"].forEach(id => { document.getElementById(id).value = ""; });
  document.getElementById("pessoaCargoMinisterial").value = "";
  document.getElementById("pessoaCongregacao").selectedIndex = 0;
  document.getElementById("pessoaDepartamento").value = "";
  document.getElementById("pessoaExtensao").value = "";
  document.getElementById("pessoaStatus").selectedIndex = 0;
  document.getElementById("pessoaFormaAdmissao").value = "";
  document.getElementById("pessoaSituacao").value = "EM_COMUNHAO";
  document.getElementById("pessoaEstadoCivil").value = "";
  document.getElementById("pessoaDizimista").value = "";
  document.getElementById("pessoaMotivoSaida").value = "";
  document.getElementById("resultadoPessoa").textContent = "";
  document.getElementById("linkPerfilAposCadastro").innerHTML = "";
}

// O <form> de cadastro/edição é um único elemento no DOM — move (não clona) entre
// o slot de "Cadastrar" e o slot de "Editar" (dentro do Perfil) conforme o
// contexto, pra não duplicar ~25 campos com ids repetidos.
function moverFormPessoaPara(slotId) {
  const bloco = document.getElementById("blocoFormPessoa");
  bloco.style.display = "block";
  document.getElementById(slotId).appendChild(bloco);
}

const TITULOS_SUB_PESSOAS = { cadastrar: "Cadastrar Pessoa", buscar: "Buscar Pessoas", aprovacoes: "Fila de Aprovações" };

function mostrarSubAbaPessoas(sub) {
  subAbaPessoasAtual = sub;
  document.getElementById("subPessoasCadastrar").style.display = sub === "cadastrar" ? "block" : "none";
  document.getElementById("subPessoasBuscar").style.display = sub === "buscar" ? "block" : "none";
  document.getElementById("subPessoasAprovacoes").style.display = sub === "aprovacoes" ? "block" : "none";
  document.getElementById("subPessoasPerfil").style.display = "none";
  document.getElementById("btnSubPessoasCadastrar").classList.toggle("ativo", sub === "cadastrar");
  document.getElementById("btnSubPessoasBuscar").classList.toggle("ativo", sub === "buscar");
  document.getElementById("btnSubPessoasAprovacoes").classList.toggle("ativo", sub === "aprovacoes");
  document.getElementById("tituloModulo").textContent = `Pessoas — ${TITULOS_SUB_PESSOAS[sub]}`;
  if (sub === "cadastrar") {
    moverFormPessoaPara("slotFormPessoaCadastrar");
    limparFormPessoa();
  }
  if (sub === "aprovacoes") carregarFilaAprovacoes();
}

function voltarBuscaPessoas() {
  mostrarSubAbaPessoas("buscar");
}

function abrirPerfilPessoa(membroId) {
  const pessoa = (window._pessoasCache || []).find(p => p.membroId === membroId);
  if (!pessoa) return;

  // Mesma pessoa alimenta todas as abas do Perfil — substitui os `_membroXAtual`
  // soltos que cada bloco (Foto/Histórico/Casamentos/Licença/Vínculos) já usava.
  window._membroPerfilAtual = membroId;
  window._membroFotoAtual = membroId;
  window._membroHistoricoAtual = membroId;
  window._membroCasamentosAtual = membroId;
  window._membroApresentacoesAtual = membroId;
  window._membroLicencasAtual = membroId;
  window._membroFamiliaAtual = membroId;

  document.getElementById("subPessoasCadastrar").style.display = "none";
  document.getElementById("subPessoasBuscar").style.display = "none";
  document.getElementById("subPessoasPerfil").style.display = "block";
  document.getElementById("btnSubPessoasCadastrar").classList.remove("ativo");
  document.getElementById("btnSubPessoasBuscar").classList.add("ativo");
  document.getElementById("perfilPessoaNome").textContent = pessoa.nome;
  document.getElementById("perfilPessoaSubtitulo").textContent = `Matrícula ${pessoa.membroId} · ${pessoa.congregacao || "sem congregação"}`;
  document.getElementById("btnDesligarPerfil").style.display = pessoa.status === "DESLIGADO" ? "none" : "inline-block";
  document.getElementById("tituloModulo").textContent = `Pessoas — Perfil de ${pessoa.nome}`;
  mostrarAbaPerfil("dados");
}

const ABAS_PERFIL = ["dados", "editar", "historico", "foto", "casamentos", "apresentacoes", "licenca", "vinculos"];

function mostrarAbaPerfil(aba) {
  const membroId = window._membroPerfilAtual;
  ABAS_PERFIL.forEach(a => {
    document.getElementById(`tabPerfil${capitalize(a)}`).style.display = a === aba ? "block" : "none";
    document.getElementById(`btnTabPerfil${capitalize(a)}`).classList.toggle("ativo", a === aba);
  });
  if (aba === "dados") renderizarDadosPerfil(membroId);
  if (aba === "editar") {
    moverFormPessoaPara("slotFormPessoaEditar");
    document.getElementById("linkPerfilAposCadastro").innerHTML = "";
    document.getElementById("resultadoPessoa").textContent = "";
    editarPessoa(membroId);
  }
  if (aba === "historico") carregarHistoricoMembro(membroId);
  if (aba === "foto") carregarAbaFoto(membroId);
  if (aba === "casamentos") carregarCasamentos(membroId);
  if (aba === "apresentacoes") carregarApresentacoesCrianca(membroId);
  if (aba === "licenca") carregarLicencasCandidatura(membroId);
  if (aba === "vinculos") carregarAbaVinculos(membroId);
}

function nomeDepartamentoPorId(id) {
  if (id == null) return null;
  const d = (window._departamentosCache || []).find(x => String(x.departamentoId) === String(id));
  return d ? d.nome : null;
}
function nomeCargoPorSigla(sigla) {
  if (!sigla) return null;
  const c = (window._cargosCache || []).find(x => x.sigla === sigla);
  return c ? c.nome : sigla;
}
const ROTULO_ESTADO_CIVIL = { SOLTEIRO: "Solteiro(a)", CASADO: "Casado(a)", VIUVO: "Viúvo(a)", DIVORCIADO: "Divorciado(a)", UNIAO_ESTAVEL: "União Estável" };

// Leitura formatada de tudo que o sistema tem da pessoa — reaproveita
// linhaLgpd/formatarValorLgpd (criadas pra "Meus Dados" LGPD): rótulo em
// português, datas formatadas, "-" no lugar de null. Nada de JSON, nada de
// coluna de banco aparecendo em tela.
function renderizarDadosPerfil(membroId) {
  const p = (window._pessoasCache || []).find(x => x.membroId === membroId);
  const container = document.getElementById("tabPerfilDados");
  if (!p) { container.innerHTML = "<p class='subtitle'>Pessoa não encontrada.</p>"; return; }

  const saidaHtml = (p.status === "DESLIGADO" || p.status === "FALECIDO" || p.motivoSaida) ? `
    <div class="cartao-perfil" style="margin-top:12px;">
      <h4 style="margin:0 0 8px; color: var(--cor-primaria);">Perda de Membresia</h4>
      ${linhaLgpd("Data do Afastamento", p.dataAfastamento, "data")}
      ${linhaLgpd("Data da Saída", p.dataSaida, "data")}
      ${linhaLgpd("Causa da Saída", p.motivoSaida)}
    </div>` : "";

  container.innerHTML = `
    <div class="cartao-perfil">
      ${p.fotoUrl ? `<img src="${urlSegura(p.fotoUrl)}" alt="Foto" style="max-width:120px;border-radius:8px;margin-bottom:8px;" />` : ""}
      ${linhaLgpd("Nome", p.nome)}
      ${linhaLgpd("Congregação", p.congregacao)}
      ${linhaLgpd("Extensão da Tenda", p.extensao)}
      ${linhaLgpd("Status", p.status)}
      ${linhaLgpd("Situação", p.situacaoMembro)}
      ${linhaLgpd("Categoria", p.capacidade && p.capacidade.categoria)}
      ${linhaLgpd("Data de Nascimento", p.dataNascimento, "data")}
      ${linhaLgpd("Data de Admissão", p.dataAdmissao, "data")}
      ${linhaLgpd("Forma de Admissão", labelFormaAdmissao(p.formaAdmissao))}
      ${linhaLgpd("Origem/Procedência", p.origem)}
      ${linhaLgpd("Igreja Anterior", p.igrejaAnterior)}
      ${linhaLgpd("Data do Batismo", p.dataBatismo, "data")}
      ${linhaLgpd("Data do Rito de Recebimento", p.dataRitoRecebimento, "data")}
      ${linhaLgpd("Nome Lido no Rito", p.nomeLidoRito)}
      ${linhaLgpd("Ministrante do Rito", p.ministranteRito)}
      ${linhaLgpd("Estado Civil", ROTULO_ESTADO_CIVIL[p.estadoCivil])}
      ${linhaLgpd("Telefone", p.telefone)}
      ${linhaLgpd("E-mail", p.email)}
      ${linhaLgpd("Endereço", p.endereco)}
    </div>
    <div class="cartao-perfil" style="margin-top:12px;">
      <h4 style="margin:0 0 8px; color: var(--cor-primaria);">Dados Ministeriais</h4>
      ${linhaLgpd("Função", p.funcao)}
      ${linhaLgpd("Cargo Ministerial", nomeCargoPorSigla(p.cargoMinisterial))}
      ${linhaLgpd("Departamento", nomeDepartamentoPorId(p.departamentoId))}
      ${linhaLgpd("Dizimista Fiel", p.dizimistaFiel, "bit")}
    </div>
    ${saidaHtml}
    <div class="cartao-perfil" style="margin-top:12px;">
      <h4 style="margin:0 0 8px; color: var(--cor-primaria);">Site institucional (vC.3)</h4>
      <div id="historicoSiteMembro"><p class="subtitle">Carregando…</p></div>
    </div>
    ${authPermissoes.includes("pessoas") ? `
    <div class="cartao-perfil" style="margin-top:12px;">
      <h4 style="margin:0 0 8px; color: var(--cor-primaria);">Acesso ao Meu Painel (PIN)</h4>
      <p class="subtitle">O membro entra com a matrícula e um PIN de 4 números que ele mesmo cria, confirmando o e-mail cadastrado. Para quem não tem e-mail (ou perdeu o acesso a ele), gere um PIN provisório e entregue pessoalmente.</p>
      <button class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="gerarPinProvisorioAcao" data-args-click="${argsAttr(Number(membroId))}">🔐 Gerar PIN provisório</button>
      <div id="resultadoPinProvisorio"></div>
    </div>` : ""}`;
  carregarHistoricoSiteMembro(membroId);
}

// vC.3 — o que essa pessoa já fez no site institucional (inscrições em
// evento, pedidos de camiseta), casado só por e-mail — nunca funde com a
// conta dela lá (Minha Conta continua existindo e funcionando sozinha,
// mesmo que ela vire ou deixe de ser membro depois).
async function carregarHistoricoSiteMembro(membroId) {
  const container = document.getElementById("historicoSiteMembro");
  if (!container) return;
  const res = await fetchProtegido(`${API_BASE}/historico-site-membro?matricula=${membroId}`);
  const dados = await jsonDaTela(res, container, "objeto");
  if (dados === null) return;

  if (!dados.temEmail) {
    container.innerHTML = "<p class='subtitle'>Sem e-mail cadastrado — não dá pra cruzar com o site.</p>";
    return;
  }
  if (dados.indisponivel) {
    container.innerHTML = "<p class='subtitle'>Não foi possível consultar o site agora.</p>";
    return;
  }
  if (dados.inscricoes.length === 0 && dados.pedidos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma inscrição em evento nem pedido de camiseta encontrado pelo e-mail cadastrado.</p>";
    return;
  }

  let html = "";
  if (dados.inscricoes.length > 0) {
    html += `<p class="subtitle">Inscrições em eventos:</p><ul>` +
      dados.inscricoes.map(i => `<li>${escaparHtmlEbd(i.eventoTitulo) || "Evento"} ${i.eventoData ? `(${escaparHtmlEbd(i.eventoData)})` : ""} ${i.presente ? "— presença confirmada" : ""}</li>`).join("") +
      `</ul>`;
  }
  if (dados.pedidos.length > 0) {
    html += `<p class="subtitle">Pedidos de camiseta:</p><ul>` +
      dados.pedidos.map(p => `<li>${escaparHtmlEbd(p.grupo) || "Camiseta"} — R$ ${Number(p.valorPago || 0).toFixed(2)} pago</li>`).join("") +
      `</ul>`;
  }
  container.innerHTML = html;
}

// Substitui a antiga verFotoMembro() — mesma lógica, só sem controlar
// mostrar/esconder bloco nem rolar tela (isso agora é mostrarAbaPerfil()).
function carregarAbaFoto(membroId) {
  const pessoa = (window._pessoasCache || []).find(p => p.membroId === membroId);
  document.getElementById("resultadoFotoMembro").textContent = "";
  const preview = document.getElementById("fotoMembroPreview");
  preview.innerHTML = pessoa && pessoa.fotoUrl
    ? `<img src="${urlSegura(pessoa.fotoUrl)}" alt="Foto" style="max-width:160px;border-radius:8px;" />`
    : "<span class='subtitle'>Sem foto cadastrada.</span>";

  // v7.7: menor de 18 anos — quem decide sobre a foto é o responsável (não o consentimento da própria pessoa): o aviso dele substitui a linha do consentimento de Foto
  mnrPrepararFotoDeMenor(membroId, pessoa);
  if (mnrEhMenorDeIdade(pessoa)) return;

  fetchProtegido(`${API_BASE}/lgpd/consentimento/${membroId}`).then(r => r.json()).then(data => {
    const fotoConsentimento = (data.consentimentos || []).find(c => c.tipo === "FOTO");
    const statusEl = document.getElementById("fotoMembroStatusConsentimento");
    statusEl.textContent = fotoConsentimento && fotoConsentimento.concedido
      ? `✅ Consentimento de Foto concedido em ${fotoConsentimento.dataRegistro}.`
      : "⚠️ Sem consentimento de Foto concedido — o upload será bloqueado até conceder.";
  });
}

// Substitui a antiga editarPessoa()'s auto-show de vínculos — agora é sua
// própria aba, carregada só quando clicada.
function carregarAbaVinculos(membroId) {
  carregarOpcoesTipoVinculo();
  carregarVinculosFamiliares(membroId);
}

const TAM_PAGINA = 20;
let paginaAtualPessoas = 1;
let pessoasFiltradas = [];

async function carregarPessoas() {
  const res = await fetchProtegido(`${API_BASE}/pessoas`);
  const lista = await jsonDaTela(res, document.getElementById("resultadoListaPessoas"), "lista");
  if (lista === null) { window._pessoasCache = []; return; } // recusa: o motivo fica no lugar da lista
  window._pessoasCache = lista;
  aplicarFiltroPessoas();
}

function aplicarFiltroPessoas() {
  const busca = (document.getElementById("pessoasBusca").value || "").toLowerCase();
  const catFiltro = document.getElementById("pessoasFiltroCategoria").value;
  const congFiltro = document.getElementById("pessoasFiltroCongregacao")?.value || "";
  const situacaoFiltro = document.getElementById("pessoasFiltroSituacao")?.value || "";
  const todas = window._pessoasCache || [];
  pessoasFiltradas = todas.filter(p => {
    const nomeOk = !busca || p.nome.toLowerCase().includes(busca) || String(p.membroId).includes(busca);
    const catOk = !catFiltro || (p.capacidade && p.capacidade.categoria === catFiltro);
    const congOk = !congFiltro || String(p.congregacaoId) === congFiltro;
    const situacaoOk = !situacaoFiltro || p.situacaoMembro === situacaoFiltro;
    return nomeOk && catOk && congOk && situacaoOk;
  });
  paginaAtualPessoas = 1;
  renderizarPessoas();
}

// ---- IMPORTAÇÃO/EXPORTAÇÃO DE PESSOAS (v1.8) ----

function baixarModeloPessoas() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["Matrícula", "Nome", "Situação"],
    [15, "Maria da Silva", "EM_COMUNHAO"]
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Modelo");
  XLSX.writeFile(wb, "modelo-importacao-pessoas.xlsx");
}

// Levenshtein normalizado (0 a 1, 1 = idênticos) — sem dependência nova, só pra
// sinalizar possível duplicata por nome parecido (ex: erro de digitação) mesmo
// com matrícula diferente. Não bloqueia nada sozinho, só marca pra revisão.
function similaridadeNomes(a, b) {
  const s1 = (a || "").trim().toLowerCase();
  const s2 = (b || "").trim().toLowerCase();
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  const m = s1.length, n = s2.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = s1[i - 1] === s2[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const distancia = dp[m][n];
  return 1 - distancia / Math.max(m, n);
}

let importacaoPessoasLinhas = [];

async function prepararImportacaoPessoas() {
  const input = document.getElementById("arquivoExcelPessoas");
  const msg = document.getElementById("resultadoImportacaoPessoas");
  const arquivo = input.files[0];
  if (!arquivo) {
    msg.textContent = "Selecione um arquivo .xlsx antes de importar.";
    return;
  }

  const buffer = await arquivo.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const primeiraAba = workbook.SheetNames[0];
  const linhasBrutas = XLSX.utils.sheet_to_json(workbook.Sheets[primeiraAba], { defval: "" });

  const existentes = window._pessoasCache || [];

  const linhas = linhasBrutas
    .map(linha => {
      const chaves = Object.keys(linha);
      const chaveMatricula = chaves.find(k => /matr[ií]cula/i.test(k));
      const chaveNome = chaves.find(k => /nome/i.test(k));
      const chaveSituacao = chaves.find(k => /situa[cç][aã]o/i.test(k));
      return {
        membroId: chaveMatricula ? Number(linha[chaveMatricula]) : null,
        nome: chaveNome ? String(linha[chaveNome]).trim() : "",
        situacaoMembro: chaveSituacao ? String(linha[chaveSituacao]).trim() : ""
      };
    })
    .filter(l => l.membroId && l.nome)
    .map(l => {
      const duplicataMatricula = existentes.find(p => p.membroId === l.membroId);
      if (duplicataMatricula) {
        return Object.assign({}, l, {
          status: "DUPLICATA_MATRICULA",
          conflito: duplicataMatricula,
          decisao: "MANTER" // "MANTER" (ignora a linha da planilha) ou "ATUALIZAR"
        });
      }
      let melhorSimilaridade = 0;
      let melhorMatch = null;
      for (const p of existentes) {
        const sim = similaridadeNomes(l.nome, p.nome);
        if (sim > melhorSimilaridade) { melhorSimilaridade = sim; melhorMatch = p; }
      }
      if (melhorSimilaridade >= 0.9) {
        return Object.assign({}, l, {
          status: "POSSIVEL_DUPLICATA_NOME",
          conflito: melhorMatch,
          similaridade: melhorSimilaridade,
          decisao: "IGNORAR" // "IGNORAR" ou "IMPORTAR"
        });
      }
      return Object.assign({}, l, { status: "NOVO", decisao: "IMPORTAR" });
    });

  if (linhas.length === 0) {
    msg.textContent = "Não encontrei colunas de Matrícula e Nome na planilha.";
    return;
  }

  importacaoPessoasLinhas = linhas;
  msg.textContent = "";
  abrirModalRevisaoImportacaoPessoas();
}

// O antigo onchange="importacaoPessoasLinhas[i].decisao = this.value" (CSP forte: código não fica mais no HTML): guarda a decisão escolhida na linha i.
function definirDecisaoImportacao(indice, valor) {
  importacaoPessoasLinhas[indice].decisao = valor;
}

function abrirModalRevisaoImportacaoPessoas() {
  const caixa = document.getElementById("modalCaixa");
  const linhasHtml = importacaoPessoasLinhas.map((l, i) => {
    if (l.status === "DUPLICATA_MATRICULA") {
      return `<tr>
        <td>${l.membroId}</td><td>${escaparHtmlEbd(l.nome)}</td><td>${escaparHtmlEbd(l.situacaoMembro) || "-"}</td>
        <td>Matrícula já existe: <strong>${escaparHtmlEbd(l.conflito.nome)}</strong></td>
        <td>
          <select data-on-change="definirDecisaoImportacao" data-args-change="${argsAttr(i, ARG.valor)}">
            <option value="MANTER" ${l.decisao === "MANTER" ? "selected" : ""}>Manter o que já está (ignorar)</option>
            <option value="ATUALIZAR" ${l.decisao === "ATUALIZAR" ? "selected" : ""}>Atualizar pessoa existente</option>
          </select>
        </td>
      </tr>`;
    }
    if (l.status === "POSSIVEL_DUPLICATA_NOME") {
      return `<tr>
        <td>${l.membroId}</td><td>${escaparHtmlEbd(l.nome)}</td><td>${escaparHtmlEbd(l.situacaoMembro) || "-"}</td>
        <td>Nome ${Math.round(l.similaridade * 100)}% parecido com <strong>${escaparHtmlEbd(l.conflito.nome)}</strong> (matrícula ${l.conflito.membroId})</td>
        <td>
          <select data-on-change="definirDecisaoImportacao" data-args-change="${argsAttr(i, ARG.valor)}">
            <option value="IGNORAR" ${l.decisao === "IGNORAR" ? "selected" : ""}>Ignorar esta linha</option>
            <option value="IMPORTAR" ${l.decisao === "IMPORTAR" ? "selected" : ""}>Importar mesmo assim (é pessoa nova)</option>
          </select>
        </td>
      </tr>`;
    }
    return `<tr>
      <td>${l.membroId}</td><td>${escaparHtmlEbd(l.nome)}</td><td>${escaparHtmlEbd(l.situacaoMembro) || "-"}</td>
      <td>Novo</td><td>-</td>
    </tr>`;
  }).join("");

  caixa.innerHTML = `
    <h3>Revisar Importação (${importacaoPessoasLinhas.length} linha(s))</h3>
    <p class="subtitle">Confira as linhas sinalizadas antes de confirmar. Linhas "Novo" já estão marcadas pra importar.</p>
    <div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr>
      <th>Matrícula</th><th>Nome</th><th>Situação</th><th>Conflito</th><th>Decisão</th>
    </tr></thead><tbody>${linhasHtml}</tbody></table></div>
    <div class="modal-acoes">
      <button class="btn-confirmar btn-secundario" id="modalCancelar">Cancelar</button>
      <button class="btn-confirmar" id="modalConfirmar">Confirmar Importação</button>
    </div>`;
  document.getElementById("modalOverlay").classList.remove("escondido");
  document.getElementById("modalConfirmar").onclick = () => confirmarImportacaoPessoas();
  document.getElementById("modalCancelar").onclick = () => { fecharModal(); importacaoPessoasLinhas = []; };
}

async function confirmarImportacaoPessoas() {
  const payload = importacaoPessoasLinhas
    .filter(l => l.decisao === "IMPORTAR" || l.decisao === "ATUALIZAR")
    .map(l => ({
      membroId: l.membroId,
      nome: l.nome,
      situacaoMembro: l.situacaoMembro || null,
      sobrescrever: l.status === "DUPLICATA_MATRICULA" && l.decisao === "ATUALIZAR"
    }));

  fecharModal();
  const msg = document.getElementById("resultadoImportacaoPessoas");
  if (payload.length === 0) {
    msg.textContent = "Nenhuma linha selecionada pra importar.";
    importacaoPessoasLinhas = [];
    return;
  }

  const res = await fetchProtegido(`${API_BASE}/pessoas/importar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ linhas: payload })
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.sucesso
    ? `Criados: ${data.resumo.criados} · Atualizados: ${data.resumo.atualizados} · Ignorados: ${data.resumo.ignorados}`
    : "";
  document.getElementById("arquivoExcelPessoas").value = "";
  importacaoPessoasLinhas = [];
  if (data.sucesso) carregarPessoas();
}

// vB.8 — `sensivel: true` marca colunas restritas a nível Global em
// exportação em massa (ver ExportarPessoas) — dado de contato/nascimento
// em lote é o que a LGPD mais protege contra compartilhamento externo.
const COLUNAS_EXPORT_PESSOAS = [
  { chave: "membroId", rotulo: "Matrícula", padrao: true },
  { chave: "nome", rotulo: "Nome", padrao: true },
  { chave: "idade", rotulo: "Idade", padrao: false, valor: p => idadeDe(p.dataNascimento) ?? "" },
  { chave: "categoria", rotulo: "Categoria", padrao: false, valor: p => (p.capacidade && p.capacidade.categoria) || "" },
  { chave: "formaAdmissao", rotulo: "Forma de Admissão", padrao: false, valor: p => labelFormaAdmissao(p.formaAdmissao) },
  { chave: "funcao", rotulo: "Função", padrao: false },
  { chave: "cargoMinisterial", rotulo: "Cargo Ministerial", padrao: false },
  { chave: "congregacao", rotulo: "Congregação", padrao: true },
  { chave: "status", rotulo: "Status", padrao: true },
  { chave: "situacaoMembro", rotulo: "Situação", padrao: true },
  { chave: "telefone", rotulo: "Telefone", padrao: false, sensivel: true },
  { chave: "email", rotulo: "E-mail", padrao: false, sensivel: true },
  { chave: "endereco", rotulo: "Endereço", padrao: false, sensivel: true },
  { chave: "dataNascimento", rotulo: "Data de Nascimento", padrao: false, sensivel: true },
  { chave: "dataAdmissao", rotulo: "Data de Admissão", padrao: false }
];

function abrirModalExportarPessoas() {
  const caixa = document.getElementById("modalCaixa");
  // vB.8 — quem não é nível Global nem vê a opção de coluna sensível (a
  // API também recusaria — isso é só não oferecer o que seria negado).
  const colunasDisponiveis = COLUNAS_EXPORT_PESSOAS.filter(c => !c.sensivel || authNivel === "GLOBAL");
  const checkboxesHtml = colunasDisponiveis.map(c => `
    <label style="display:flex;align-items:center;gap:6px;margin:4px 0;">
      <input type="checkbox" id="exportCol_${escaparHtmlEbd(c.chave)}" ${c.padrao ? "checked" : ""} /> ${escaparHtmlEbd(c.rotulo)}${c.sensivel ? " 🔒" : ""}
    </label>`).join("");

  caixa.innerHTML = `
    <h3>Exportar Pessoas (${pessoasFiltradas.length} registro(s) na lista filtrada)</h3>
    <p class="subtitle">Escolha as colunas que devem entrar na planilha. Toda exportação fica registrada na Auditoria.</p>
    <div style="max-height:300px;overflow-y:auto;">${checkboxesHtml}</div>
    <div class="modal-acoes">
      <button class="btn-confirmar btn-secundario" id="modalCancelar">Cancelar</button>
      <button class="btn-confirmar" id="modalConfirmar">📤 Gerar Planilha</button>
    </div>`;
  document.getElementById("modalOverlay").classList.remove("escondido");
  document.getElementById("modalConfirmar").onclick = () => exportarPessoasAcao();
  document.getElementById("modalCancelar").onclick = () => fecharModal();
}

async function exportarPessoasAcao() {
  const colunasSelecionadas = COLUNAS_EXPORT_PESSOAS.filter(c => document.getElementById(`exportCol_${c.chave}`) && document.getElementById(`exportCol_${c.chave}`).checked);
  if (colunasSelecionadas.length === 0) {
    mostrarToast("Selecione ao menos uma coluna.", "erro");
    return;
  }

  // vB.8 — passa pelo servidor ANTES de gerar o arquivo: registra a
  // exportação na Auditoria e confere de novo (não só confia no que o
  // modal já escondeu) se colunas sensíveis exigem nível Global. Não
  // reconsulta o banco (os dados já estão em `pessoasFiltradas`, já
  // carregados com o escopo de quem está logado) — só valida e audita.
  const res = await fetchProtegido(`${API_BASE}/pessoas/exportar`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ colunas: colunasSelecionadas.map(c => c.chave), quantidade: pessoasFiltradas.length })
  });
  const data = await res.json();
  if (!data.sucesso) { avisarResultado(data); return; }

  const linhas = pessoasFiltradas.map(p => {
    const linha = {};
    colunasSelecionadas.forEach(c => {
      linha[c.rotulo] = c.valor ? c.valor(p) : (p[c.chave] ?? "");
    });
    return linha;
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(linhas);
  XLSX.utils.book_append_sheet(wb, ws, "Pessoas");
  XLSX.writeFile(wb, "rol-de-membros.xlsx");
  fecharModal();
}

function labelFormaAdmissao(codigo) {
  const mapa = {
    BATISMO: "Batismo",
    CARTA_MUDANCA: "Carta de Mudança",
    RECONCILIACAO: "Reconciliação",
    ACLAMACAO: "Aclamação"
  };
  return mapa[codigo] || "-";
}

function renderizarPessoas() {
  const container = document.getElementById("resultadoListaPessoas");
  const total = pessoasFiltradas.length;
  const totalPaginas = Math.max(1, Math.ceil(total / TAM_PAGINA));
  if (paginaAtualPessoas > totalPaginas) paginaAtualPessoas = totalPaginas;
  const inicio = (paginaAtualPessoas - 1) * TAM_PAGINA;
  const pagina = pessoasFiltradas.slice(inicio, inicio + TAM_PAGINA);

  // Tabela enxuta de propósito (v1.10) — o resto (idade, categoria, forma de
  // admissão, função, cargo ministerial...) mora no Perfil, aba Dados. Uma
  // pessoa por tela não pode quebrar o notebook por causa de coluna demais.
  // Miniatura da foto direto na lista (pedido explícito) — assim dá pra ver de
  // várias pessoas de uma vez, sem precisar entrar perfil por perfil.
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th></th><th>Matrícula</th><th>Nome</th><th>Congregação</th><th>Status</th><th>Situação</th><th class="acoes-inline"></th>
  </tr></thead><tbody>`;

  pagina.forEach(p => {
    const miniatura = p.fotoUrl
      ? `<img src="${urlSegura(p.fotoUrl)}" alt="Foto de ${escaparHtmlEbd(p.nome)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;display:block;" />`
      : `<span style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:#e5e5e5;color:#888;font-size:0.75rem;">?</span>`;
    html += `<tr>
      <td>${miniatura}</td>
      <td>${p.membroId}</td>
      <td>${escaparHtmlEbd(p.nome)}</td>
      <td>${escaparHtmlEbd(p.congregacao) || "-"}</td>
      <td>${badgeStatusPessoa(p.status)}</td>
      <td>${escaparHtmlEbd(p.situacaoMembro) || "-"}</td>
      <td class="acoes-inline">
        <button class="btn-link" data-on-click="abrirPerfilPessoa" data-args-click="${argsAttr(p.membroId)}">👁️ Ver Perfil</button>
      </td>
    </tr>`;
  });

  html += "</tbody></table>";
  container.innerHTML = html;

  document.getElementById("pessoasInfo").textContent = `${total} pessoa(s)`;
  document.getElementById("pessoasPaginacao").innerHTML = `
    <button ${paginaAtualPessoas === 1 ? "disabled" : ""} data-on-click="mudarPaginaPessoas" data-args-click="${argsAttr(-1)}">← Anterior</button>
    <span class="info-pagina">Página ${escaparHtmlEbd(paginaAtualPessoas)} de ${totalPaginas}</span>
    <button ${paginaAtualPessoas === totalPaginas ? "disabled" : ""} data-on-click="mudarPaginaPessoas" data-args-click="${argsAttr(1)}">Próxima →</button>`;
}

function mudarPaginaPessoas(delta) {
  paginaAtualPessoas += delta;
  renderizarPessoas();
}

function editarPessoa(membroId) {
  const pessoa = (window._pessoasCache || []).find(p => p.membroId === membroId);
  if (!pessoa) return;
  document.getElementById("pessoaMatricula").value = pessoa.membroId;
  document.getElementById("pessoaNome").value = pessoa.nome;
  document.getElementById("pessoaStatus").value = pessoa.status;
  document.getElementById("pessoaCongregacao").value = pessoa.congregacaoId != null ? String(pessoa.congregacaoId) : "";
  document.getElementById("pessoaDataNascimento").value = pessoa.dataNascimento || "";
  document.getElementById("pessoaDataAdmissao").value = pessoa.dataAdmissao || "";
  document.getElementById("pessoaFormaAdmissao").value = pessoa.formaAdmissao || "";
  document.getElementById("pessoaDataBatismo").value = pessoa.dataBatismo || "";
  document.getElementById("pessoaOrigem").value = pessoa.origem || "";
  document.getElementById("pessoaIgrejaAnterior").value = pessoa.igrejaAnterior || "";
  document.getElementById("pessoaDataRitoRecebimento").value = pessoa.dataRitoRecebimento || "";
  document.getElementById("pessoaNomeLidoRito").value = pessoa.nomeLidoRito || "";
  document.getElementById("pessoaMinistranteRito").value = pessoa.ministranteRito || "";
  document.getElementById("pessoaSituacao").value = pessoa.situacaoMembro || "EM_COMUNHAO";
  document.getElementById("pessoaEstadoCivil").value = pessoa.estadoCivil || "";
  document.getElementById("pessoaDataAfastamento").value = pessoa.dataAfastamento || "";
  document.getElementById("pessoaMotivoSaida").value = pessoa.motivoSaida || "";
  document.getElementById("pessoaDizimista").value = pessoa.dizimistaFiel == null ? "" : String(pessoa.dizimistaFiel);
  document.getElementById("pessoaDepartamento").value = pessoa.departamentoId != null ? String(pessoa.departamentoId) : "";
  document.getElementById("pessoaCargoMinisterial").value = pessoa.cargoMinisterial || "";
  document.getElementById("pessoaTelefone").value = pessoa.telefone || "";
  document.getElementById("pessoaEmail").value = pessoa.email || "";
  document.getElementById("pessoaEndereco").value = pessoa.endereco || "";
  document.getElementById("pessoaExtensao").value = pessoa.extensaoId != null ? String(pessoa.extensaoId) : "";
}

async function desligarPessoa(membroId) {
  if (!(await confirmarAcao("Confirma desligar esta pessoa? Ela deixa de ser ATIVA, mas o histórico continua.", "Desligar"))) return;

  const res = await fetchProtegido(`${API_BASE}/pessoas/${membroId}`, { method: "DELETE" });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) await carregarPessoas();
  return data.sucesso;
}

async function desligarPessoaPerfilAcao() {
  const membroId = window._membroPerfilAtual;
  if (!membroId) return;
  const ok = await desligarPessoa(membroId);
  if (ok) abrirPerfilPessoa(membroId);
}

// ---- CARTAS DE TRÂNSITO (v1.4 — Reg. Art. 131) ----
const ROTULO_CARTA = { RECOMENDACAO: "Recomendação", MUDANCA: "Mudança", ATESTADO_SUPLETIVO: "Atestado Supletivo" };

let minhasCartasCache = [];
async function carregarMinhasCartas() {
  const caixa = document.getElementById("cxMinhasCartas");
  if (!caixa || !authMatricula) return;
  const res = await fetchProtegido(`${API_BASE}/cartas/minhas?matricula=${authMatricula}`);
  const cartas = await jsonDaTela(res, caixa, "lista");
  if (cartas === null) return;
  minhasCartasCache = Array.isArray(cartas) ? cartas : [];
  if (minhasCartasCache.length === 0) {
    caixa.innerHTML = `<p class="subtitle">Nenhuma carta solicitada ainda.</p>`;
    return;
  }
  caixa.innerHTML = `<table class="tabela-frequencia"><thead><tr><th>Tipo</th><th>Status</th><th>Pedido</th><th>Validade</th><th></th></tr></thead><tbody>` +
    minhasCartasCache.map(c => `<tr>
      <td>${ROTULO_CARTA[c.tipo] || escaparHtmlEbd(c.tipo)}</td>
      <td>${escaparHtmlEbd(c.status)}</td>
      <td>${escaparHtmlEbd(c.dataPedido) || "-"}</td>
      <td>${escaparHtmlEbd(c.dataValidade) || "-"}</td>
      <td class="acoes-inline">
        ${c.tipo === "MUDANCA" && c.status === "SOLICITADA" ? `<button class="btn-link" data-on-click="confirmarCartaPendente">Confirmar</button>` : ""}
        ${c.status !== "SOLICITADA" ? `<button class="btn-link" data-on-click="imprimirMinhaCarta" data-args-click="${argsAttr(c.cartaId)}">🖨️ Imprimir</button>` : ""}
        ${["EMITIDA", "CONFIRMADA"].includes(c.status) ? `<button class="btn-link" data-on-click="baixarPdfCarta" data-args-click="${argsAttr(c.cartaId, c.membroId)}">📄 Baixar PDF</button>` : ""}
      </td>
    </tr>`).join("") + "</tbody></table>";
}

async function solicitarCarta(tipo) {
  if (!authMatricula) { avisarResultado({ mensagem: "Faça login com sua matrícula." }); return; }
  const msg = document.getElementById("resultadoSolicitacaoCarta");
  const matricula = Number(authMatricula);
  const headers = { "Content-Type": "application/json" };

  if (tipo === "MUDANCA") {
    const ok = await confirmarAcao(
      "⚠️ A Carta de Mudança desliga você do rol de membros da IEADESPA. Após 30 dias, seus dados pessoais serão minimizados (mantendo apenas matrícula, nome, data de admissão e batismo — Reg. Art. 132 §2º). Confirma a solicitação?",
      "Confirmar desligamento"
    );
    if (!ok) return;
    const manterAcessoSite = await confirmarAcao(
      "Você quer manter acesso ao site institucional (Minha Conta, com seu e-mail atual) mesmo depois de desligado? Se sim, garantimos essa conta agora, antes da minimização apagar seu e-mail daqui. Se não, seus dados são só minimizados, como sempre.",
      "Manter acesso ao site"
    );
    await fetchProtegido(`${API_BASE}/cartas/minhas`, { method: "POST", headers, body: JSON.stringify({ matricula, tipo }) });
    const res2 = await fetchProtegido(`${API_BASE}/cartas/minhas`, { method: "POST", headers, body: JSON.stringify({ matricula, tipo, confirmar: true, manterAcessoSite }) });
    const data2 = await res2.json();
    msg.textContent = data2.mensagem;
    carregarMinhasCartas();
    return;
  }

  const res = await fetchProtegido(`${API_BASE}/cartas/minhas`, { method: "POST", headers, body: JSON.stringify({ matricula, tipo }) });
  const data = await res.json();
  msg.textContent = data.mensagem;
  carregarMinhasCartas();
}

async function confirmarCartaPendente() {
  if (!authMatricula) return;
  const ok = await confirmarAcao("Confirmar esta solicitação de Carta de Mudança (declaração de ciência do desligamento)?", "Confirmar");
  if (!ok) return;
  const manterAcessoSite = await confirmarAcao(
    "Você quer manter acesso ao site institucional (Minha Conta, com seu e-mail atual) mesmo depois de desligado? Se sim, garantimos essa conta agora, antes da minimização apagar seu e-mail daqui. Se não, seus dados são só minimizados, como sempre.",
    "Manter acesso ao site"
  );
  const res = await fetchProtegido(`${API_BASE}/cartas/minhas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ matricula: Number(authMatricula), tipo: "MUDANCA", confirmar: true, manterAcessoSite })
  });
  const data = await res.json();
  avisarResultado(data);
  carregarMinhasCartas();
}
let cartasCache = [];
async function carregarCartas() {
  const res = await fetchProtegido(`${API_BASE}/cartas`);
  const lista = await jsonDaTela(res, document.getElementById("resultadoListaCartas"), "lista");
  if (lista === null) { cartasCache = []; return; }
  cartasCache = lista;
  renderizarCartas();
}

function renderizarCartas() {
  const container = document.getElementById("resultadoListaCartas");
  const cores = { SOLICITADA: "badge-licenca", CONFIRMADA: "badge-licenca", EMITIDA: "badge-ativo", CANCELADA: "badge-desligado", CONCLUIDA: "badge-inativo" };
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>ID</th><th>Membro</th><th>Tipo</th><th>Status</th><th>Destino</th><th>Pedido</th><th>Validade</th><th class="acoes-inline"></th>
  </tr></thead><tbody>`;
  cartasCache.forEach(c => {
    html += `<tr>
      <td>${c.cartaId}</td>
      <td>${escaparHtmlEbd(c.nome)} (${c.membroId})</td>
      <td>${ROTULO_CARTA[c.tipo] || escaparHtmlEbd(c.tipo)}</td>
      <td><span class="badge-status ${cores[c.status] || ""}">${escaparHtmlEbd(c.status)}</span></td>
      <td>${escaparHtmlEbd(c.destino) || "-"}</td>
      <td>${escaparHtmlEbd(c.dataPedido) || "-"}</td>
      <td>${escaparHtmlEbd(c.dataValidade) || "-"}</td>
      <td class="acoes-inline">
        ${["SOLICITADA", "CONFIRMADA"].includes(c.status) ? `<button class="btn-link" data-on-click="emitirCarta" data-args-click="${argsAttr(c.cartaId)}">Emitir</button>` : ""}
        ${["SOLICITADA", "CONFIRMADA", "EMITIDA"].includes(c.status) ? `<button class="btn-link btn-link-perigo" data-on-click="cancelarCarta" data-args-click="${argsAttr(c.cartaId)}">Cancelar</button>` : ""}
        <button class="btn-link" data-on-click="imprimirCarta" data-args-click="${argsAttr(c.cartaId)}">🖨️ Imprimir</button>
        ${["EMITIDA", "CONFIRMADA"].includes(c.status) ? `<button class="btn-link" data-on-click="baixarPdfCarta" data-args-click="${argsAttr(c.cartaId, c.membroId)}">📄 Baixar PDF</button>` : ""}
      </td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function emitirCarta(cartaId) {
  const res = await fetchProtegido(`${API_BASE}/cartas/emitir`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cartaId }) });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarCartas();
}

async function cancelarCarta(cartaId) {
  if (!(await confirmarAcao("Cancelar esta carta?", "Cancelar"))) return;
  const res = await fetchProtegido(`${API_BASE}/cartas/cancelar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cartaId }) });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarCartas();
}

async function processarSaidasCartas() {
  const res = await fetchProtegido(`${API_BASE}/cartas/processar`, { method: "POST" });
  const data = await res.json();
  const el = document.getElementById("resultadoCartas");
  if (el && data && data.sucesso) el.textContent = data.mensagem;
  carregarCartas();
}

const LABEL_SITUACAO_CARTA = {
  EM_COMUNHAO: "Comunhão",
  SEM_COMUNHAO: "Paz",
  CONGREGADO: "Observação",
  NOVO_CONVERTIDO: "Observação"
};
const LABEL_ESTADO_CIVIL = {
  SOLTEIRO: "Solteiro(a)", CASADO: "Casado(a)", VIUVO: "Viúvo(a)",
  DIVORCIADO: "Divorciado(a)", UNIAO_ESTAVEL: "União Estável"
};
const LABEL_CARGO_MINISTERIAL = {
  AUXILIAR: "Auxiliar", MISSIONARIO: "Missionário(a)", DIACONO: "Diácono",
  PRESBITERO: "Presbítero", EVANGELISTA: "Evangelista", PASTOR: "Pastor"
};

// Marca "( )" -> "(X)" na opção escolhida, mantendo as demais em branco — mesmo
// espírito de múltipla escolha do modelo em papel usado nas congregações.
function marcarOpcao(rotulo, marcado) {
  return `(${marcado ? "X" : "&nbsp;"}) ${rotulo}`;
}

// vB.6 — PDF gerado no servidor (protocolo único + rodapé de emissão),
// substitui "salvar como PDF" do navegador pra quem precisa de um arquivo
// de verdade, não só imprimir na hora.
async function baixarPdfCarta(cartaId, membroId) {
  const res = await fetchProtegido(`${API_BASE}/cartas/${cartaId}/pdf?matricula=${membroId}`);
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    mostrarToast((data && data.mensagem) || "Não foi possível gerar o PDF.", "erro");
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `carta-${cartaId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function imprimirCarta(cartaId) {
  const c = (cartasCache || []).find(x => x.cartaId === cartaId);
  if (c) renderizarImpressaoCarta(c);
}

function imprimirMinhaCarta(cartaId) {
  const c = (minhasCartasCache || []).find(x => x.cartaId === cartaId);
  if (c) renderizarImpressaoCarta(c);
}

function renderizarImpressaoCarta(c) {
  const rotulo = ROTULO_CARTA[c.tipo] || c.tipo;
  const ehCongregado = c.situacaoMembro === "CONGREGADO";
  const situacaoRotulo = LABEL_SITUACAO_CARTA[c.situacaoMembro] || "Comunhão";
  const hoje = new Date();
  const dataEmissaoFmt = c.dataEmissao ? c.dataEmissao.split("-").reverse().join("/") : `____ / ____ / ${hoje.getFullYear()}`;
  const w = window.open("", "_blank", "width=760,height=900");
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escaparHtmlEbd(rotulo)}</title>
  <style>
    body{font-family:Georgia,serif;color:#111;padding:40px;}
    .carta{max-width:680px;margin:auto;}
    .cab{text-align:center;border-bottom:2px solid #333;padding-bottom:12px;margin-bottom:20px;}
    h1{font-size:17px;margin:0 0 4px;} h2{font-size:18px;margin:4px 0 20px;text-align:right;}
    .sub{font-size:12px;color:#555;} p{line-height:1.7;margin:8px 0;}
    .linha{display:flex;gap:24px;flex-wrap:wrap;margin:10px 0;}
    .linha span{white-space:nowrap;}
    .decl{font-style:italic;border:1px solid #999;padding:10px;margin:14px 0;font-size:14px;}
    .obs{border-top:1px solid #ccc;padding-top:8px;margin-top:16px;font-size:13px;}
    .rodape{margin-top:44px;display:flex;justify-content:space-around;font-size:12px;text-align:center;}
    .rodape div{border-top:1px solid #111;padding-top:4px;width:220px;}
    .validade{margin-top:20px;font-size:11px;color:#555;text-align:center;}
  </style></head><body><div class="carta">
    <div class="cab"><h1>IGREJA EVANGÉLICA ASSEMBLEIA DE DEUS</h1><div class="sub">Ministério do SETA em Parauapebas — PA · IEADESPA</div></div>
    <h2>${marcarOpcao("CARTA DE RECOMENDAÇÃO", c.tipo === "RECOMENDACAO")}${"&nbsp;&nbsp;"}${marcarOpcao("CARTA DE MUDANÇA", c.tipo === "MUDANCA")}${"&nbsp;&nbsp;"}${marcarOpcao("ATESTADO SUPLETIVO", c.tipo === "ATESTADO_SUPLETIVO")}</h2>
    <p>Parauapebas, PA, ${escaparHtmlEbd(dataEmissaoFmt)}.</p>
    <p>Saudações no SENHOR JESUS.</p>
    <p>Apresentamos à Igreja em <strong>${escaparHtmlEbd(c.destino) || "______________________"}</strong> o(a) portador(a) desta carta o(a) Sr(a). <strong>${escaparHtmlEbd(c.nome)}</strong> (Cartão de Membro nº ${c.membroId}).</p>
    <div class="linha"><span>${marcarOpcao("Membro", !ehCongregado)}</span><span>${marcarOpcao("Congregado", ehCongregado)}</span></div>
    <p>Nesta Igreja desde ${c.dataAdmissao ? escaparHtmlEbd(c.dataAdmissao.split("-").reverse().join("/")) : "____/____/______"}, por se achar em: <strong>${situacaoRotulo}</strong>.</p>
    <p>Nós o(a) recomendamos que recebais no Senhor, como usam os Santos.</p>
    <div class="linha">
      <span><strong>Função:</strong> ${escaparHtmlEbd(c.funcao) || "—"}</span>
      <span><strong>Cargo:</strong> ${LABEL_CARGO_MINISTERIAL[c.cargoMinisterial] || "—"}</span>
      <span><strong>Estado Civil:</strong> ${LABEL_ESTADO_CIVIL[c.estadoCivil] || "—"}</span>
    </div>
    ${c.declaracaoCiencia ? `<p class="decl">${escaparHtmlEbd(c.declaracaoCiencia)}</p>` : ""}
    ${(c.motivoSaida || c.destino) ? `<p class="obs"><strong>OBS:</strong> ${escaparHtmlEbd(c.motivoSaida) || ""}</p>` : ""}
    <div class="rodape"><div>Pastor Congregacional</div><div>Secretário Local(a)</div></div>
    <p class="validade">${c.dataValidade ? `VALIDADE: até ${escaparHtmlEbd(c.dataValidade.split("-").reverse().join("/"))}` : (c.tipo === "MUDANCA" ? "" : "VALIDADE: 30 dias a partir da data de emissão")}</p>
  </div></body></html>`);
  w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 300);
}

// ---- Vínculos Familiares (seção dentro do cadastro de uma Pessoa) ----
// Núcleo mínimo (v0.2): cadastro do relacionamento em si. O cálculo de grau de
// parentesco por travessia nasce em v2.6/v3.1, quando tiver um consumidor de verdade.
async function carregarOpcoesTipoVinculo() {
  const select = document.getElementById("vinculoTipo");
  const res = await fetchProtegido(`${API_BASE}/catalogos/tiposVinculoFamiliar`);
  const tipos = await jsonDaTela(res, select, "objeto");
  if (tipos === null) return;
  select.innerHTML = tipos.filter(t => t.ativo !== false).map(t => `<option value="${t.tipoVinculoId}">${escaparHtmlEbd(t.rotuloDireto)}</option>`).join("");
}

async function carregarVinculosFamiliares(membroId) {
  const container = document.getElementById("resultadoListaVinculosFamiliares");
  const res = await fetchProtegido(`${API_BASE}/vinculos-familiares?membroId=${membroId}`);
  const vinculos = await jsonDaTela(res, container, "objeto");
  if (vinculos === null) return;

  if (vinculos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum vínculo familiar cadastrado.</p>";
    return;
  }

  let html = `<table class="tabela-frequencia"><thead><tr><th>Parentesco</th><th>Pessoa</th><th></th></tr></thead><tbody>`;
  vinculos.forEach(v => {
    html += `<tr>
      <td>${escaparHtmlEbd(v.rotulo)}</td>
      <td>${escaparHtmlEbd(v.outraPessoaNome)} (${v.outraPessoaId})${v.outraPessoaEhResponsavel ? ' <span class="badge-status badge-ativo">Responsável Legal</span>' : ""}</td>
      <td class="acoes-inline"><button class="btn-link btn-link-perigo" data-on-click="removerVinculoFamiliar" data-args-click="${argsAttr(v.vinculoId)}">Remover</button></td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function salvarVinculoFamiliar() {
  const membroId = window._membroFamiliaAtual;
  const tipoVinculoId = document.getElementById("vinculoTipo").value;
  const membroParenteId = document.getElementById("vinculoMatriculaParente").value;
  const responsavelLegal = document.getElementById("vinculoResponsavelLegal").checked;
  if (!membroId || !tipoVinculoId || !membroParenteId) {
    mostrarToast("Informe o tipo de vínculo e a matrícula da outra pessoa.", "erro");
    return;
  }
  const res = await fetchProtegido(`${API_BASE}/vinculos-familiares`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, membroParenteId, tipoVinculoId, responsavelLegal })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) {
    document.getElementById("vinculoMatriculaParente").value = "";
    document.getElementById("vinculoResponsavelLegal").checked = false;
    carregarVinculosFamiliares(membroId);
  }
}

async function removerVinculoFamiliar(vinculoId) {
  if (!(await confirmarAcao("Remover este vínculo familiar?", "Remover"))) return;
  const res = await fetchProtegido(`${API_BASE}/vinculos-familiares/${vinculoId}`, { method: "DELETE" });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarVinculosFamiliares(window._membroFamiliaAtual);
}

// ---- Linha do Tempo do Membro (v1.6): agrega eventos já existentes + Marcos manuais ----
window._membroHistoricoAtual = null;
let marcosCacheAtual = [];

const ROTULO_TIPO_MARCO = { CONVERSAO: "Conversão", MINISTERIO_ANTERIOR: "Ministério/Igreja anterior", BATISMO_ESPIRITO_SANTO: "Batismo no Espírito Santo", OUTRO: "Outro" };

async function carregarHistoricoMembro(membroId) {
  const container = document.getElementById("resultadoHistoricoMembro");
  const [resHistorico, resMarcos] = await Promise.all([
    fetchProtegido(`${API_BASE}/pessoas/${membroId}/historico`),
    fetchProtegido(`${API_BASE}/marcos-membro?membroId=${membroId}`)
  ]);
  const historico = await resHistorico.json();
  const marcos = await resMarcos.json();
  marcosCacheAtual = Array.isArray(marcos) ? marcos : [];
  const eventos = historico.eventos || [];

  if (eventos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum evento registrado ainda.</p>";
    return;
  }

  container.innerHTML = `<ul class="linha-tempo">` + eventos.map(e => {
    const podeCorrigir = e.marcoId != null && authGeral;
    return `<li>
      <strong>${escaparHtmlEbd(e.data) || "data não informada"}</strong> — ${escaparHtmlEbd(e.titulo)}
      ${e.descricao ? `<br><span class="subtitle">${escaparHtmlEbd(e.descricao)}</span>` : ""}
      ${podeCorrigir ? ` <button class="btn-link" data-on-click="corrigirMarcoMembroAcao" data-args-click="${argsAttr(e.marcoId)}">Corrigir</button>` : ""}
    </li>`;
  }).join("") + "</ul>";
}

async function registrarMarcoMembroAcao() {
  const membroId = window._membroHistoricoAtual;
  const tipo = document.getElementById("marcoTipo").value;
  const descricao = document.getElementById("marcoDescricao").value.trim();
  const dataMarco = document.getElementById("marcoData").value || null;
  const dataAproximada = document.getElementById("marcoDataAproximada").checked;
  const msg = document.getElementById("resultadoMarcoMembro");
  if (!membroId || !descricao) {
    msg.textContent = "Informe a descrição do marco.";
    return;
  }
  const res = await fetchProtegido(`${API_BASE}/marcos-membro`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, tipo, descricao, dataMarco, dataAproximada })
  });
  const data = await res.json();
  msg.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("marcoDescricao").value = "";
    document.getElementById("marcoData").value = "";
    document.getElementById("marcoDataAproximada").checked = false;
    carregarHistoricoMembro(membroId);
  }
}

// Correção de um Marco já lançado — restrita a nível Global, sempre com
// justificativa (mesmo padrão de pedirAjustePrazo() do módulo de disciplina).
function pedirCorrecaoMarco(marco) {
  return new Promise(resolve => {
    const caixa = document.getElementById("modalCaixa");
    caixa.innerHTML = `
      <h3>Corrigir marco: ${ROTULO_TIPO_MARCO[marco.tipo] || escaparHtmlEbd(marco.tipo)}</h3>
      <div class="input-group">
        <label>Descrição:</label>
        <input type="text" id="modalDescricao" value="${escaparHtmlEbd(marco.descricao || "")}" />
      </div>
      <div class="input-group">
        <label>Data:</label>
        <input type="date" id="modalData" value="${escaparHtmlEbd(marco.dataMarco) || ""}" />
      </div>
      <div class="input-group">
        <label>Justificativa (obrigatória — fica registrada na auditoria):</label>
        <textarea id="modalJustificativa" rows="3"></textarea>
      </div>
      <div class="modal-acoes">
        <button class="btn-confirmar btn-secundario" id="modalCancelar">Cancelar</button>
        <button class="btn-confirmar" id="modalConfirmar">Corrigir</button>
      </div>`;
    document.getElementById("modalOverlay").classList.remove("escondido");
    document.getElementById("modalConfirmar").onclick = () => {
      const descricao = document.getElementById("modalDescricao").value.trim();
      const dataMarco = document.getElementById("modalData").value || null;
      const justificativa = document.getElementById("modalJustificativa").value.trim();
      fecharModal();
      resolve({ descricao, dataMarco, justificativa });
    };
    document.getElementById("modalCancelar").onclick = () => { fecharModal(); resolve(null); };
  });
}

async function corrigirMarcoMembroAcao(marcoId) {
  const marco = marcosCacheAtual.find(m => m.marcoId === marcoId);
  if (!marco) return;
  const dados = await pedirCorrecaoMarco(marco);
  if (!dados) return;
  if (!dados.justificativa) {
    mostrarToast("Justificativa é obrigatória para corrigir um marco.", "erro");
    return;
  }
  const res = await fetchProtegido(`${API_BASE}/marcos-membro/${marcoId}/editar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados)
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarHistoricoMembro(window._membroHistoricoAtual);
}

// ---- Foto do Membro (v1.7) — consentimento é trava real, não registro paralelo ----
async function concederConsentimentoFotoAcao() {
  const membroId = window._membroFotoAtual;
  if (!membroId) return;
  const res = await fetchProtegido(`${API_BASE}/lgpd/consentimento/${membroId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipo: "FOTO", concedido: true, baseLegal: "CONSENTIMENTO" })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarAbaFoto(membroId);
}

// Recorte de foto (v1.10.1) — arrasta pra posicionar + zoom, sempre exporta um
// quadrado (JPEG). Sem lib nova: canvas puro, mesmo espírito "sem build step"
// do resto do front-end. Circular só na pré-visualização (guia pro rosto);
// o arquivo salvo é quadrado (mais compatível como avatar em qualquer lugar).
// Promise<{base64, mimeType}|null> — null se cancelou.
function abrirRecorteFoto(arquivo) {
  const TAMANHO_SAIDA = 480;
  const VIEW = 280;
  return new Promise((resolve) => {
    const leitor = new FileReader();
    leitor.onerror = () => {
      mostrarToast("Não consegui ler essa imagem. Tente outra foto.", "erro");
      resolve(null);
    };
    leitor.onload = () => {
      const img = new Image();
      img.onerror = () => {
        mostrarToast("Esse arquivo não é uma imagem válida (ou o formato não é suportado). Tente outra foto.", "erro");
        resolve(null);
      };
      img.onload = () => {
        const caixa = document.getElementById("modalCaixa");
        caixa.innerHTML = `
          <h3>Ajustar foto</h3>
          <p class="subtitle">Arraste pra posicionar e use o zoom pra focar no rosto — evite foto de corpo inteiro.</p>
          <div id="recorteArea" style="position:relative; width:${VIEW}px; height:${VIEW}px; margin:0 auto; overflow:hidden; border-radius:50%; border:3px solid var(--cor-secundaria); cursor:grab; touch-action:none;">
            <canvas id="recorteCanvas" width="${VIEW}" height="${VIEW}"></canvas>
          </div>
          <div class="input-group" style="margin-top:14px;">
            <label>Zoom:</label>
            <input type="range" id="recorteZoom" min="1" max="3" step="0.01" value="1" style="width:100%;" />
          </div>
          <div class="modal-acoes">
            <button class="btn-confirmar btn-secundario" id="modalCancelar">Cancelar</button>
            <button class="btn-confirmar" id="modalConfirmar">✅ Usar esta foto</button>
          </div>`;
        document.getElementById("modalOverlay").classList.remove("escondido");

        const canvas = document.getElementById("recorteCanvas");
        const ctx = canvas.getContext("2d");
        const escalaBase = Math.max(VIEW / img.width, VIEW / img.height);
        let zoom = 1;
        let offsetX = 0, offsetY = 0;
        let arrastando = false, inicioX = 0, inicioY = 0;

        function desenhar() {
          const escala = escalaBase * zoom;
          const w = img.width * escala, h = img.height * escala;
          ctx.clearRect(0, 0, VIEW, VIEW);
          ctx.drawImage(img, VIEW / 2 - w / 2 + offsetX, VIEW / 2 - h / 2 + offsetY, w, h);
        }
        desenhar();

        const area = document.getElementById("recorteArea");
        const comecar = (x, y) => { arrastando = true; inicioX = x - offsetX; inicioY = y - offsetY; area.style.cursor = "grabbing"; };
        const mover = (x, y) => { if (arrastando) { offsetX = x - inicioX; offsetY = y - inicioY; desenhar(); } };
        const terminar = () => { arrastando = false; area.style.cursor = "grab"; };

        area.addEventListener("mousedown", e => comecar(e.offsetX, e.offsetY));
        area.addEventListener("mousemove", e => mover(e.offsetX, e.offsetY));
        window.addEventListener("mouseup", terminar);
        area.addEventListener("touchstart", e => {
          const t = e.touches[0], r = area.getBoundingClientRect();
          comecar(t.clientX - r.left, t.clientY - r.top);
        }, { passive: true });
        area.addEventListener("touchmove", e => {
          const t = e.touches[0], r = area.getBoundingClientRect();
          mover(t.clientX - r.left, t.clientY - r.top);
        }, { passive: true });
        area.addEventListener("touchend", terminar);

        document.getElementById("recorteZoom").oninput = e => { zoom = Number(e.target.value); desenhar(); };

        document.getElementById("modalConfirmar").onclick = () => {
          const saida = document.createElement("canvas");
          saida.width = TAMANHO_SAIDA;
          saida.height = TAMANHO_SAIDA;
          const fatorSaida = TAMANHO_SAIDA / VIEW;
          const escala = escalaBase * zoom * fatorSaida;
          const w = img.width * escala, h = img.height * escala;
          saida.getContext("2d").drawImage(
            img,
            TAMANHO_SAIDA / 2 - w / 2 + offsetX * fatorSaida,
            TAMANHO_SAIDA / 2 - h / 2 + offsetY * fatorSaida,
            w, h
          );
          const base64 = saida.toDataURL("image/jpeg", 0.9).split(",")[1];
          fecharModal();
          resolve({ base64, mimeType: "image/jpeg" });
        };
        document.getElementById("modalCancelar").onclick = () => { fecharModal(); resolve(null); };
      };
      img.src = leitor.result;
    };
    leitor.readAsDataURL(arquivo);
  });
}

async function enviarFotoMembroAcao() {
  const membroId = window._membroFotoAtual;
  const input = document.getElementById("fotoMembroArquivo");
  const msg = document.getElementById("resultadoFotoMembro");
  if (!membroId || !input.files[0]) {
    msg.textContent = "Escolha um arquivo de imagem.";
    return;
  }
  const recorte = await abrirRecorteFoto(input.files[0]);
  if (!recorte) return;
  const res = await fetchProtegido(`${API_BASE}/pessoas/${membroId}/foto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fotoBase64: recorte.base64, mimeType: recorte.mimeType })
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.mensagem;
  if (data.sucesso) {
    input.value = "";
    await carregarPessoas();
    carregarAbaFoto(membroId);
  }
}

// ---- CASAMENTOS (v1.9 — Reg. Art. 83) ----
const ROTULO_MODALIDADE_CASAMENTO = { CIVIL_E_RELIGIOSO: "Civil e Religioso", SOMENTE_RELIGIOSO: "Somente Religioso" };

async function carregarCasamentos(membroId) {
  const container = document.getElementById("resultadoListaCasamentos");
  const res = await fetchProtegido(`${API_BASE}/casamentos?membroId=${membroId}`);
  const casamentos = await jsonDaTela(res, container, "lista");
  if (casamentos === null) return;
  if (!Array.isArray(casamentos) || casamentos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum casamento registrado ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Cônjuge</th><th>Modalidade</th><th>Celebrante</th><th>Data</th><th>Cartório</th><th></th>
  </tr></thead><tbody>`;
  casamentos.forEach(c => {
    html += `<tr>
      <td>${escaparHtmlEbd(c.nomeMembroConjuge) || escaparHtmlEbd(c.nomeConjuge) || "-"}</td>
      <td>${ROTULO_MODALIDADE_CASAMENTO[c.modalidade] || escaparHtmlEbd(c.modalidade)}</td>
      <td>${escaparHtmlEbd(c.celebrante) || "-"}</td>
      <td>${escaparHtmlEbd(c.dataCasamento) || "-"}</td>
      <td>${c.registradoCartorio ? "✅ Sim" : "Não"}</td>
      <td><button class="btn-link btn-link-perigo" data-on-click="excluirCasamentoAcao" data-args-click="${argsAttr(c.casamentoId)}">Excluir</button></td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function salvarCasamento() {
  const membroId = window._membroCasamentosAtual;
  const msg = document.getElementById("resultadoCasamento");
  if (!membroId) return;

  const membroConjugeId = document.getElementById("casamentoConjugeMatricula").value || null;
  const nomeConjuge = document.getElementById("casamentoConjugeNome").value.trim() || null;
  const celebrante = document.getElementById("casamentoCelebrante").value.trim() || null;
  const modalidade = document.getElementById("casamentoModalidade").value;
  const dataHabilitacaoCivil = document.getElementById("casamentoDataHabilitacao").value || null;
  const dataCasamento = document.getElementById("casamentoData").value;
  const registradoCartorio = document.getElementById("casamentoRegistradoCartorio").checked;

  if (!dataCasamento) { msg.textContent = "Informe a data do casamento."; return; }
  if (!membroConjugeId && !nomeConjuge) { msg.textContent = "Informe o cônjuge: matrícula ou nome."; return; }

  const res = await fetchProtegido(`${API_BASE}/casamentos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, membroConjugeId, nomeConjuge, celebrante, modalidade, dataHabilitacaoCivil, dataCasamento, registradoCartorio })
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.aviso || "";
  if (data.sucesso) {
    document.getElementById("casamentoConjugeMatricula").value = "";
    document.getElementById("casamentoConjugeNome").value = "";
    document.getElementById("casamentoCelebrante").value = "";
    document.getElementById("casamentoDataHabilitacao").value = "";
    document.getElementById("casamentoData").value = "";
    document.getElementById("casamentoRegistradoCartorio").checked = false;
    carregarCasamentos(membroId);
  }
}

async function excluirCasamentoAcao(casamentoId) {
  if (!(await confirmarAcao("Confirma excluir este registro de casamento? (correção de lançamento)", "Excluir"))) return;
  const res = await fetchProtegido(`${API_BASE}/casamentos/${casamentoId}`, { method: "DELETE" });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarCasamentos(window._membroCasamentosAtual);
}

// ---- APRESENTAÇÃO DE CRIANÇAS (vB.12 — Reg. Art. 82) ----
const ROTULO_MODALIDADE_APRESENTACAO = { SOLENE: "Solene", RESERVADA: "Reservada" };

async function carregarApresentacoesCrianca(membroId) {
  const container = document.getElementById("resultadoListaApresentacoes");
  const res = await fetchProtegido(`${API_BASE}/apresentacoes-crianca?membroId=${membroId}`);
  const apresentacoes = await jsonDaTela(res, container, "lista");
  if (apresentacoes === null) return;
  if (!Array.isArray(apresentacoes) || apresentacoes.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma apresentação de criança registrada ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Criança</th><th>Nascimento</th><th>Modalidade</th><th>Data</th><th>Aptidão</th><th></th>
  </tr></thead><tbody>`;
  apresentacoes.forEach(a => {
    const aptidaoTexto = a.aptidao?.apto ? "✅ Apta" : "⚠️ " + Object.values(a.aptidao?.itens || {}).filter(i => !i.ok).map(i => escaparHtmlEbd(i.detalhe)).join("; ");
    html += `<tr>
      <td>${escaparHtmlEbd(a.nomeCrianca)}</td>
      <td>${escaparHtmlEbd(a.dataNascimento) || "-"}</td>
      <td>${ROTULO_MODALIDADE_APRESENTACAO[a.modalidade] || escaparHtmlEbd(a.modalidade)}</td>
      <td>${escaparHtmlEbd(a.dataApresentacao) || "-"}</td>
      <td>${aptidaoTexto}</td>
      <td>
        ${a.geraCertificado ? `<a class="btn-link" href="${API_BASE}/apresentacoes-crianca/${a.apresentacaoId}/pdf" target="_blank">📄 Certificado</a>` : ""}
        <button class="btn-link btn-link-perigo" data-on-click="excluirApresentacaoCriancaAcao" data-args-click="${argsAttr(a.apresentacaoId)}">Excluir</button>
      </td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function salvarApresentacaoCrianca() {
  const membroId = window._membroApresentacoesAtual;
  const msg = document.getElementById("resultadoApresentacaoCrianca");
  if (!membroId) return;

  const nomeCrianca = document.getElementById("apresentacaoNomeCrianca").value.trim();
  const dataNascimento = document.getElementById("apresentacaoDataNascimento").value;
  const papel = document.getElementById("apresentacaoPapelPerfil").value;
  const outroPaiMatricula = document.getElementById("apresentacaoOutroPaiMatricula").value || null;
  const oficiante = document.getElementById("apresentacaoOficiante").value.trim() || null;
  const modalidade = document.getElementById("apresentacaoModalidade").value;
  const dataApresentacao = document.getElementById("apresentacaoData").value;

  if (!nomeCrianca || !dataNascimento || !dataApresentacao) {
    msg.textContent = "Informe nome da criança, data de nascimento e data da apresentação.";
    return;
  }

  const membroIdPai = papel === "PAI" ? membroId : outroPaiMatricula;
  const membroIdMae = papel === "MAE" ? membroId : outroPaiMatricula;

  const res = await fetchProtegido(`${API_BASE}/apresentacoes-crianca`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nomeCrianca, dataNascimento, membroIdPai, membroIdMae, oficiante, modalidade, dataApresentacao })
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.aviso || "";
  if (data.sucesso) {
    document.getElementById("apresentacaoNomeCrianca").value = "";
    document.getElementById("apresentacaoDataNascimento").value = "";
    document.getElementById("apresentacaoOutroPaiMatricula").value = "";
    document.getElementById("apresentacaoOficiante").value = "";
    document.getElementById("apresentacaoData").value = "";
    carregarApresentacoesCrianca(membroId);
  }
}

async function excluirApresentacaoCriancaAcao(apresentacaoId) {
  if (!(await confirmarAcao("Confirma excluir este registro de apresentação? (correção de lançamento)", "Excluir"))) return;
  const res = await fetchProtegido(`${API_BASE}/apresentacoes-crianca/${apresentacaoId}`, { method: "DELETE" });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarApresentacoesCrianca(window._membroApresentacoesAtual);
}

// ---- LICENÇA POR CANDIDATURA (v1.9 — Reg. Art. 157 §2º) ----
const ROTULO_STATUS_LICENCA = { EM_LICENCA: "Em licença", RETORNOU: "Retornou", NAO_RETORNOU: "Não retornou" };

async function carregarLicencasCandidatura(membroId) {
  const container = document.getElementById("resultadoListaLicencasCandidatura");
  const res = await fetchProtegido(`${API_BASE}/licencas-candidatura?membroId=${membroId}`);
  const licencas = await jsonDaTela(res, container, "lista");
  if (licencas === null) return;
  if (!Array.isArray(licencas) || licencas.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma licença por candidatura registrada ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Pleito</th><th>Início da Licença</th><th>Status</th><th></th>
  </tr></thead><tbody>`;
  licencas.forEach(l => {
    html += `<tr>
      <td>${escaparHtmlEbd(l.dataPleito) || "-"}</td>
      <td>${escaparHtmlEbd(l.dataInicioLicenca) || "-"}</td>
      <td>${ROTULO_STATUS_LICENCA[l.status] || escaparHtmlEbd(l.status)}</td>
      <td>${authGeral && l.status === "EM_LICENCA" ? `<button class="btn-link" data-on-click="registrarRetornoLicencaAcao" data-args-click="${argsAttr(l.licencaId)}">Registrar retorno</button>` : "-"}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function salvarLicencaCandidatura() {
  const membroId = window._membroLicencasAtual;
  const msg = document.getElementById("resultadoLicencaCandidatura");
  if (!membroId) return;

  const dataPleito = document.getElementById("licencaDataPleito").value;
  if (!dataPleito) { msg.textContent = "Informe a data do pleito."; return; }

  if (!(await confirmarAcao("Confirma registrar a licença por candidatura? A pessoa perde Assentos/Liderança/Cargo até a Diretoria decidir o retorno.", "Registrar Licença"))) return;

  const res = await fetchProtegido(`${API_BASE}/licencas-candidatura`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, dataPleito })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) {
    document.getElementById("licencaDataPleito").value = "";
    carregarLicencasCandidatura(membroId);
    carregarPessoas();
  }
}

// Promise<boolean|null> — true = retornou, false = não retornou, null = cancelou.
function pedirDecisaoRetornoLicenca() {
  return new Promise(resolve => {
    const caixa = document.getElementById("modalCaixa");
    caixa.innerHTML = `
      <h3>Registrar retorno da Licença por Candidatura</h3>
      <p class="subtitle">Decisão da Diretoria após o pleito. Se retornou, o status do membro volta pra ATIVO
        (Cargo/Assentos precisam ser reatribuídos manualmente). Se não retornou, o status do membro não muda
        sozinho — o próximo passo (ex: desligamento) fica por conta de quem está operando.</p>
      <div class="modal-acoes">
        <button class="btn-confirmar btn-secundario" id="modalCancelar">Cancelar</button>
        <button class="btn-confirmar btn-perigo" id="modalNaoRetornou">Não retornou</button>
        <button class="btn-confirmar" id="modalRetornou">Retornou</button>
      </div>`;
    document.getElementById("modalOverlay").classList.remove("escondido");
    document.getElementById("modalRetornou").onclick = () => { fecharModal(); resolve(true); };
    document.getElementById("modalNaoRetornou").onclick = () => { fecharModal(); resolve(false); };
    document.getElementById("modalCancelar").onclick = () => { fecharModal(); resolve(null); };
  });
}

async function registrarRetornoLicencaAcao(licencaId) {
  const retornou = await pedirDecisaoRetornoLicenca();
  if (retornou === null) return;

  const res = await fetchProtegido(`${API_BASE}/licencas-candidatura/${licencaId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ retornou })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) {
    carregarLicencasCandidatura(window._membroLicencasAtual);
    carregarPessoas();
  }
}

// ---- FILA DE APROVAÇÕES (v1.11 — pedidos de autoedição sujeitos a aprovação) ----
let filaAprovacoesCache = [];

async function carregarFilaAprovacoes() {
  const container = document.getElementById("resultadoFilaAprovacoes");
  const res = await fetchProtegido(`${API_BASE}/fila-aprovacoes`);
  const solicitacoes = await jsonDaTela(res, container, "lista");
  if (solicitacoes === null) return;
  filaAprovacoesCache = Array.isArray(solicitacoes) ? solicitacoes : [];

  if (filaAprovacoesCache.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum pedido pendente no momento.</p>";
    return;
  }

  container.innerHTML = filaAprovacoesCache.map(s => `
    <div class="cartao-perfil" style="margin-bottom:16px;">
      <div class="barra-lista" style="justify-content:space-between;">
        <h4 style="margin:0; color: var(--cor-primaria);">${escaparHtmlEbd(s.nome)} (matrícula ${s.membroId}) — ${new Date(s.dataSolicitacao).toLocaleDateString("pt-BR")}</h4>
        <button class="btn-confirmar" style="width:auto;margin:0;" data-on-click="aprovarTodaSolicitacaoAcao" data-args-click="${argsAttr(s.solicitacaoId)}">✅ Aprovar tudo</button>
      </div>
      <div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr>
        <th>Campo</th><th>Valor Atual</th><th>Valor Proposto</th><th></th>
      </tr></thead><tbody>
        ${s.campos.map(c => `<tr>
          <td>${escaparHtmlEbd(c.rotulo)}</td>
          <td>${escaparHtmlEbd(c.valorAnterior) || "-"}</td>
          <td><strong>${escaparHtmlEbd(c.valorProposto)}</strong></td>
          <td class="acoes-inline">
            <button class="btn-link" data-on-click="decidirCampoFilaAcao" data-args-click="${argsAttr(s.solicitacaoId, c.campoId, "APROVADO")}">Aprovar</button>
            <button class="btn-link btn-link-perigo" data-on-click="decidirCampoFilaAcao" data-args-click="${argsAttr(s.solicitacaoId, c.campoId, "REJEITADO")}">Rejeitar</button>
          </td>
        </tr>`).join("")}
      </tbody></table></div>
    </div>`).join("");
}

async function decidirCampoFilaAcao(solicitacaoId, campoId, decisao) {
  const res = await fetchProtegido(`${API_BASE}/fila-aprovacoes/${solicitacaoId}/decidir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decisoes: [{ campoId, decisao }] })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarFilaAprovacoes();
}

async function aprovarTodaSolicitacaoAcao(solicitacaoId) {
  if (!(await confirmarAcao("Aprovar todos os campos pendentes desta solicitação?", "Aprovar tudo"))) return;
  const solicitacao = filaAprovacoesCache.find(s => s.solicitacaoId === solicitacaoId);
  if (!solicitacao) return;
  const decisoes = solicitacao.campos.filter(c => c.status === "PENDENTE").map(c => ({ campoId: c.campoId, decisao: "APROVADO" }));
  const res = await fetchProtegido(`${API_BASE}/fila-aprovacoes/${solicitacaoId}/decidir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decisoes })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarFilaAprovacoes();
}

registrarAcoes({
  abrirModalExportarPessoas, abrirPerfilPessoa, aplicarFiltroPessoas, aprovarTodaSolicitacaoAcao, baixarModeloPessoas, baixarPdfCarta, cancelarCarta,
  concederConsentimentoFotoAcao, confirmarCartaPendente, corrigirMarcoMembroAcao, decidirCampoFilaAcao, definirDecisaoImportacao,
  desligarPessoaPerfilAcao, emitirCarta, enviarFotoMembroAcao, excluirApresentacaoCriancaAcao, excluirCasamentoAcao, imprimirCarta,
  imprimirMinhaCarta, mostrarAbaPerfil, mostrarSubAbaPessoas, mudarPaginaPessoas, prepararImportacaoPessoas, processarSaidasCartas,
  registrarMarcoMembroAcao, registrarRetornoLicencaAcao, removerVinculoFamiliar, salvarApresentacaoCrianca, salvarCasamento,
  salvarLicencaCandidatura, salvarPessoa, salvarVinculoFamiliar, solicitarCarta, voltarBuscaPessoas
});
