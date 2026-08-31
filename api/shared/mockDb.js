// shared/mockDb.js
// Estado mock compartilhado por todas as Functions de reunião/pessoas/permissões.
// Espelha o formato das tabelas do sql/schema.sql (MembroReferencia, Congregacoes,
// Funcoes, Sessoes, Presencas, Lideranca, Orgaos). Quando o Azure SQL estiver
// conectado, cada Function troca essas chamadas pelas queries reais já comentadas
// dentro dela — este arquivo deixa de ser importado.
//
// Persistência: como ainda não há Azure SQL conectado, o estado é salvo em
// api/data/mockdb.json a cada alteração. Isso é o que faz o "banco" sobreviver
// a um reinício do `func start` — sem isso, cada reinício voltava pra semente
// original (era o que parecia "desfazer" exclusões/cadastros).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { hashSenha } = require("./auth");
const estatuto = require("./estatuto");

const ARQUIVO_DB = path.join(__dirname, "..", "data", "mockdb.json");

function carregarDoDisco() {
  try {
    return JSON.parse(fs.readFileSync(ARQUIVO_DB, "utf8"));
  } catch (e) {
    return null; // primeira vez rodando: arquivo ainda não existe
  }
}

const salvo = carregarDoDisco();

function proximoId(lista, campo) {
  return lista.reduce((max, item) => Math.max(max, item[campo] || 0), 0) + 1;
}

// Lê um campo do arquivo salvo se existir; senão usa a semente. Campo a campo
// (não o arquivo inteiro de uma vez) pra um arquivo salvo por uma versão mais
// antiga do código — sem esse campo ainda — não quebrar quando eu adicionar
// algo novo (ex: "consagracoes" não existia nos arquivos salvos antes desta
// rodada).
function campoSalvoOuSemente(nomeCampo, semente) {
  return salvo && salvo[nomeCampo] ? salvo[nomeCampo] : semente;
}

// ---- catálogos geridos (evita "Templo Central" x "Sede" digitados diferente) ----
const congregacoes = campoSalvoOuSemente("congregacoes", [
  { congregacaoId: 1, nome: "Templo Central", areaId: 1, ativa: true },
  { congregacaoId: 2, nome: "Congregação Bela Vista", areaId: 1, ativa: true },
  { congregacaoId: 3, nome: "Congregação Salmos (Palmares Sul)", areaId: 2, ativa: true },
  { congregacaoId: 4, nome: "Congregação Cidade Jardim", areaId: 2, ativa: true },
  { congregacaoId: 5, nome: "Congregação Rio Verde", areaId: 3, ativa: true },
  { congregacaoId: 6, nome: "Congregação Novo Brasil", areaId: 4, ativa: true }
]);

const funcoes = campoSalvoOuSemente("funcoes", [
  { funcaoId: 1, nome: "Auxiliar", ativa: true },
  { funcaoId: 2, nome: "Diácono", ativa: true },
  { funcaoId: 3, nome: "Diaconisa", ativa: true },
  { funcaoId: 4, nome: "Presbítero", ativa: true },
  { funcaoId: 5, nome: "Evangelista", ativa: true },
  { funcaoId: 6, nome: "Pastor", ativa: true }
]);

// Órgãos do Estatuto 2026 (oficial) — Art. 13. Órgãos de Apoio e Execução (Departamentos/
// Secretarias) não entram aqui: não têm poder deliberativo nem quórum (Art. 13 §2º).
const orgaos = campoSalvoOuSemente("orgaos", [
  { orgaoId: 1, sigla: "ASSEMBLEIA_GERAL", nome: "Assembleia Geral", quorumMinimoPct: null, quorumDeliberativoPct: null },
  { orgaoId: 2, sigla: "CLI", nome: "Câmara de Liderança Institucional", quorumMinimoPct: null, quorumDeliberativoPct: null, faltasParaPerdaAssento: 3 },
  { orgaoId: 3, sigla: "DIRETORIA_EXECUTIVA", nome: "Diretoria Executiva", quorumMinimoPct: null, quorumDeliberativoPct: null },
  { orgaoId: 4, sigla: "CEI", nome: "Conselho de Ética e Integridade", quorumMinimoPct: null, quorumDeliberativoPct: null },
  { orgaoId: 5, sigla: "CONSELHO_FISCAL", nome: "Conselho Fiscal", quorumMinimoPct: null, quorumDeliberativoPct: null }
]);

// ---- pessoas ----
// Capacidade eleitoral (quem vota / quem pode ser votado) é CALCULADA a partir de
// dataNascimento/dataAdmissao/dizimistaFiel/status pelas regras do Art. 23 — ver
// api/shared/estatuto.js. Não existe mais um campo "elegível": a classificação
// "opera-se automaticamente" (Art. 7º §1º), nunca é marcação manual.
// ---- seed de demonstração: ~300 pessoas variadas (só é usada quando não há mockdb.json salvo) ----
function dataISO(ano, mes, dia) {
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}
function gerarSeedMembros() {
  const primeiros = [
    "Maria", "José", "Ana", "João", "Francisca", "Antônio", "Raimunda", "Francisco",
    "Raimundo", "Sebastiana", "Pedro", "Paulo", "Lucas", "Mateus", "Tiago", "André",
    "Felipe", "Marcos", "Simão", "Tadeu", "Ester", "Rute", "Débora", "Sara",
    "Rebeca", "Lia", "Raquel", "Miriam", "Davi", "Salomão", "Elias", "Isaías"
  ];
  const sobrenomes = [
    "Alves", "Martins", "Silva", "Souza", "Lima", "Pereira", "Santos", "Oliveira",
    "Costa", "Ribeiro", "Carvalho", "Gomes", "Barbosa", "Rocha", "Dias", "Nascimento",
    "Araújo", "Melo", "Cardoso", "Teixeira", "Marques", "Lopes", "Correia", "Freitas"
  ];
  const funcoesSeed = ["Auxiliar", "Diácono", "Diaconisa", "Presbítero", "Evangelista", "Pastor", null, null, null];
  const base = [
    { membroId: 3, nome: "João Alves Martins", funcao: "Presbítero", congregacaoId: 1, status: "ATIVO", dataNascimento: "1975-06-15", dataAdmissao: "2008-09-14", dizimistaFiel: true, situacaoMembro: "EM_COMUNHAO" },
    { membroId: 7, nome: "Elesbão Silva Marques", funcao: "Diácono", congregacaoId: 1, status: "ATIVO", dataNascimento: "1982-03-22", dataAdmissao: "2010-05-01", dizimistaFiel: true, situacaoMembro: "EM_COMUNHAO" },
    { membroId: 9, nome: "Julimar Souza", funcao: "Auxiliar", congregacaoId: 2, status: "LICENÇA", dataNascimento: "1990-11-03", dataAdmissao: "2019-02-10", dizimistaFiel: false, situacaoMembro: "SEM_COMUNHAO" }
  ];
  const lista = base.slice();
  let id = 10;
  const hoje = new Date();
  for (let i = 0; i < 300; i++) {
    const nome = `${primeiros[i % primeiros.length]} ${sobrenomes[(i * 7) % sobrenomes.length]}${i % 3 === 0 ? " " + sobrenomes[(i * 13) % sobrenomes.length] : ""}`;
    const r = Math.random();
    let status, situacaoMembro;
    if (r < 0.68) { status = "ATIVO"; situacaoMembro = Math.random() < 0.86 ? "EM_COMUNHAO" : "SEM_COMUNHAO"; }
    else if (r < 0.78) { status = "LICENÇA"; situacaoMembro = "SEM_COMUNHAO"; }
    else if (r < 0.89) { status = "INATIVO"; situacaoMembro = "SEM_COMUNHAO"; }
    else { status = "DESLIGADO"; situacaoMembro = "SEM_COMUNHAO"; }

    // idade entre 12 e 85 anos
    const idade = 12 + Math.floor(Math.random() * 74);
    const anoNasc = hoje.getFullYear() - idade;
    const dataNascimento = dataISO(anoNasc, 1 + Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 28));

    // admissão sempre a partir dos 12 anos (dado consistente com o Estatuto Art. 6º)
    const maxAnosMembresia = Math.max(0, idade - 12);
    const rAdm = Math.random();
    let dataAdmissao;
    if (rAdm < 0.10 && idade >= 18) {
      // adulto recém-admitido (período de integração < 90 dias)
      dataAdmissao = new Date(hoje.getTime() - Math.floor(Math.random() * 89) * 86400000).toISOString().slice(0, 10);
    } else if (rAdm < 0.22 && idade >= 18) {
      // entre 90 dias e 1 ano
      dataAdmissao = new Date(hoje.getTime() - (90 + Math.floor(Math.random() * 275)) * 86400000).toISOString().slice(0, 10);
    } else {
      // 1 ano ou mais de membresia (respeitando o mínimo de 12 anos de idade)
      const anosMembresia = Math.min(maxAnosMembresia, Math.max(1, Math.floor(Math.random() * Math.max(1, maxAnosMembresia))));
      const anoAdm = hoje.getFullYear() - anosMembresia;
      dataAdmissao = dataISO(anoAdm, 1 + Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 28));
    }

    const dz = Math.random();
    const dizimistaFiel = dz < 0.6 ? true : dz < 0.8 ? false : null;
    lista.push({
      membroId: id++,
      nome,
      funcao: funcoesSeed[Math.floor(Math.random() * funcoesSeed.length)],
      congregacaoId: 1 + Math.floor(Math.random() * 6),
      status,
      dataNascimento,
      dataAdmissao,
      dizimistaFiel,
      situacaoMembro
    });
  }
  return lista;
}
const membros = campoSalvoOuSemente("membros", gerarSeedMembros());

// Credencial de teste local: matrícula 3, senha 1234 — com TODAS as permissões,
// pra não quebrar a conta que já está em uso assim que este cadastro de
// permissões granulares entrar no ar. Só é recriada se ainda não existir arquivo salvo.
const liderancas = campoSalvoOuSemente("liderancas", [
  {
    liderancaId: 1, membroId: 3, papelId: 1,
    escopoTipo: "GLOBAL", escopoId: null,
    senhaHash: hashSenha("1234")
  }
]);

const sessoes = campoSalvoOuSemente("sessoes", []);
const presencas = campoSalvoOuSemente("presencas", []);

// Esteira de Consagrações — migrado pra cá (antes vivia isolado dentro de
// ListarConsagracoes/index.js, fora da persistência).
const consagracoes = campoSalvoOuSemente("consagracoes", [
  {
    consagracaoId: "b1e10000-0000-0000-0000-000000000001",
    membroId: 21,
    nome: "Carlos Eduardo Lima",
    cargoAtual: "Auxiliar",
    assunto: "Separação ao Diaconato",
    proponenteMembroId: 3,
    proponente: "João Alves Martins",
    status: "EM_ANALISE_CONSELHO",
    dataProtocolo: "2026-08-10",
    dataConclusao: null
  }
]);

// Assentos por Função (Art. 15 §1º, II) — registro manual de quem ocupa hoje um cargo que dá
// assento na CLI (Diretoria, Conselho Fiscal, CEI, Dirigente de Congregação, Líder Geral de
// Departamento/Secretaria). Assento por Ordenação (Pastor/Evangelista/Presbítero) NÃO usa esta
// tabela — é calculado ao vivo a partir de MembroReferencia (ver universoDoOrgao).
const assentos = campoSalvoOuSemente("assentos", []);

let proximaCongregacaoId = proximoId(congregacoes, "congregacaoId");
let proximaFuncaoId = proximoId(funcoes, "funcaoId");
let proximaLiderancaId = proximoId(liderancas, "liderancaId");
let proximoSessaoId = sessoes.length > 0 ? proximoId(sessoes, "sessaoId") : 101;
let proximoPresencaId = proximoId(presencas, "presencaId");
let proximoAssentoId = proximoId(assentos, "assentoId");

function persistir() {
  const dados = {
    congregacoes, funcoes, orgaos, membros, liderancas, sessoes, presencas, consagracoes, assentos,
    situacoesMembro: situacoesMembro.lista,
    departamentos: departamentos.lista,
    funcionalidades: funcionalidades.lista,
    papeis: papeis.lista,
    areas: areas.lista,
    regioes: regioes.lista,
    quadrantes: quadrantes.lista,
    distritos: distritos.lista,
    extensoes: extensoes.lista
  };
  fs.mkdirSync(path.dirname(ARQUIVO_DB), { recursive: true });
  fs.writeFileSync(ARQUIVO_DB, JSON.stringify(dados, null, 2), "utf8");
}

function listarCongregacoes() { return congregacoes; }
function getCongregacao(id) { return congregacoes.find(c => String(c.congregacaoId) === String(id)) || null; }
function criarCongregacao(dados) {
  const nome = typeof dados === "string" ? dados : dados.nome;
  const areaId = (typeof dados === "object" && dados.areaId) ? Number(dados.areaId) : null;
  const cong = { congregacaoId: proximaCongregacaoId++, nome, areaId, ativa: true };
  congregacoes.push(cong);
  persistir();
  return cong;
}
function atualizarCongregacao(id, dados) {
  const c = getCongregacao(id);
  if (!c) return null;
  if (typeof dados === "string") {
    c.nome = dados;
  } else {
    if (dados.nome !== undefined) c.nome = dados.nome;
    if (dados.areaId !== undefined) c.areaId = dados.areaId ? Number(dados.areaId) : null;
  }
  persistir();
  return c;
}
function desativarCongregacao(id) {
  const c = getCongregacao(id);
  if (!c) return null;
  c.ativa = false;
  persistir();
  return c;
}
function reativarCongregacao(id) {
  const c = getCongregacao(id);
  if (!c) return null;
  c.ativa = true;
  persistir();
  return c;
}
// Exclui de verdade (diferente de desativar) — só permitido se ninguém usa mais.
function excluirCongregacao(id) {
  const c = getCongregacao(id);
  if (!c) return { erro: "NAO_ENCONTRADA" };
  const emUso = membros.some(m => String(m.congregacaoId) === String(id));
  if (emUso) return { erro: "EM_USO" };
  congregacoes.splice(congregacoes.indexOf(c), 1);
  persistir();
  return { sucesso: true };
}

function listarFuncoes() { return funcoes; }
function getFuncao(id) { return funcoes.find(f => String(f.funcaoId) === String(id)) || null; }
function getFuncaoPorNome(nome) { return funcoes.find(f => f.nome.toLowerCase() === String(nome).toLowerCase()) || null; }
function criarFuncao(nome) {
  const funcao = { funcaoId: proximaFuncaoId++, nome, ativa: true };
  funcoes.push(funcao);
  persistir();
  return funcao;
}
function atualizarFuncao(id, nome) {
  const f = getFuncao(id);
  if (!f) return null;
  f.nome = nome;
  persistir();
  return f;
}
function desativarFuncao(id) {
  const f = getFuncao(id);
  if (!f) return null;
  f.ativa = false;
  persistir();
  return f;
}
function reativarFuncao(id) {
  const f = getFuncao(id);
  if (!f) return null;
  f.ativa = true;
  persistir();
  return f;
}
// Exclui de verdade (diferente de desativar) — só permitido se ninguém usa mais.
function excluirFuncao(id) {
  const f = getFuncao(id);
  if (!f) return { erro: "NAO_ENCONTRADA" };
  const emUso = membros.some(m => (m.funcao || "").toLowerCase() === f.nome.toLowerCase());
  if (emUso) return { erro: "EM_USO" };
  funcoes.splice(funcoes.indexOf(f), 1);
  persistir();
  return { sucesso: true };
}

function getOrgao(orgaoId) { return orgaos.find(o => String(o.orgaoId) === String(orgaoId)) || null; }
function listarOrgaos() { return orgaos; }
function criarOrgao({ sigla, nome, quorumMinimoPct, quorumDeliberativoPct, faltasParaPerdaAssento }) {
  const orgao = {
    orgaoId: proximoId(orgaos, "orgaoId"),
    sigla: String(sigla).toUpperCase(),
    nome,
    quorumMinimoPct: quorumMinimoPct != null && quorumMinimoPct !== "" ? Number(quorumMinimoPct) : null,
    quorumDeliberativoPct: quorumDeliberativoPct != null && quorumDeliberativoPct !== "" ? Number(quorumDeliberativoPct) : null,
    faltasParaPerdaAssento: faltasParaPerdaAssento != null && faltasParaPerdaAssento !== "" ? Number(faltasParaPerdaAssento) : null
  };
  orgaos.push(orgao);
  persistir();
  return orgao;
}
function atualizarOrgao(orgaoId, dados) {
  const o = getOrgao(orgaoId);
  if (!o) return null;
  if (dados.sigla !== undefined) o.sigla = String(dados.sigla).toUpperCase();
  if (dados.nome !== undefined) o.nome = dados.nome;
  if (dados.quorumMinimoPct !== undefined) o.quorumMinimoPct = dados.quorumMinimoPct != null && dados.quorumMinimoPct !== "" ? Number(dados.quorumMinimoPct) : null;
  if (dados.quorumDeliberativoPct !== undefined) o.quorumDeliberativoPct = dados.quorumDeliberativoPct != null && dados.quorumDeliberativoPct !== "" ? Number(dados.quorumDeliberativoPct) : null;
  if (dados.faltasParaPerdaAssento !== undefined) o.faltasParaPerdaAssento = dados.faltasParaPerdaAssento != null && dados.faltasParaPerdaAssento !== "" ? Number(dados.faltasParaPerdaAssento) : null;
  persistir();
  return o;
}
function excluirOrgao(orgaoId) {
  const idx = orgaos.findIndex(o => String(o.orgaoId) === String(orgaoId));
  if (idx === -1) return false;
  orgaos.splice(idx, 1);
  persistir();
  return true;
}

// ---- Assentos por Função (Art. 15 §1º, II) ----
function listarAssentosAtivosDoOrgao(orgaoId) {
  return assentos.filter(a => String(a.orgaoId) === String(orgaoId) && !a.dataFim);
}

function listarAssentos() {
  return assentos.map(a => {
    const membro = getMembro(a.membroId);
    const orgao = getOrgao(a.orgaoId);
    return Object.assign({}, a, {
      nome: membro ? membro.nome : "(desconhecido)",
      orgaoSigla: orgao ? orgao.sigla : null,
      orgaoNome: orgao ? orgao.nome : null
    });
  });
}

function criarAssento({ orgaoId, membroId, tipoAssento, cargoOuFuncao, dataInicio }) {
  const assento = {
    assentoId: proximoAssentoId++,
    orgaoId: Number(orgaoId),
    membroId: Number(membroId),
    tipoAssento: tipoAssento || "FUNCAO",
    cargoOuFuncao: cargoOuFuncao || null,
    dataInicio: dataInicio || new Date().toISOString().slice(0, 10),
    dataFim: null,
    motivoEncerramento: null
  };
  assentos.push(assento);
  persistir();
  return assento;
}

function encerrarAssento(assentoId, motivo) {
  const assento = assentos.find(a => String(a.assentoId) === String(assentoId));
  if (!assento) return null;
  assento.dataFim = new Date().toISOString().slice(0, 10);
  assento.motivoEncerramento = motivo || "FIM_MANDATO";
  persistir();
  return assento;
}

function getMembro(membroId) {
  return membros.find(m => String(m.membroId) === String(membroId));
}

function resolverMembro(m) {
  const cong = getCongregacao(m.congregacaoId);
  const capacidade = estatuto.calcularCapacidadeEleitoral(m);
  return Object.assign({}, m, { congregacao: cong ? cong.nome : null, capacidade });
}

function membroEstaNoEscopo(membro, escopoCongregacoes) {
  if (!escopoCongregacoes || escopoCongregacoes === "TODAS") return true;
  const cong = getCongregacao(membro.congregacaoId);
  return !!cong && escopoCongregacoes.includes(cong.nome);
}

function listarMembros({ escopoCongregacoes } = {}) {
  return membros.filter(m => membroEstaNoEscopo(m, escopoCongregacoes)).map(resolverMembro);
}

function criarMembro({ membroId, nome, funcao, congregacaoId, status, dataNascimento, dataAdmissao, dizimistaFiel, situacaoMembro, departamentoId }) {
  if (getMembro(membroId)) return null; // matrícula já existe
  const membro = {
    membroId: Number(membroId),
    nome,
    funcao: funcao || null,
    congregacaoId: congregacaoId ? Number(congregacaoId) : null,
    status: status || "ATIVO",
    dataNascimento: dataNascimento || null,
    dataAdmissao: dataAdmissao || null,
    dizimistaFiel: dizimistaFiel === undefined ? null : !!dizimistaFiel,
    situacaoMembro: situacaoMembro || (status === "ATIVO" ? "EM_COMUNHAO" : "SEM_COMUNHAO"),
    departamentoId: departamentoId ? Number(departamentoId) : null
  };
  membros.push(membro);
  persistir();
  return resolverMembro(membro);
}

function atualizarMembro(membroId, dados) {
  const membro = getMembro(membroId);
  if (!membro) return null;
  if (dados.nome !== undefined) membro.nome = dados.nome;
  if (dados.funcao !== undefined) membro.funcao = dados.funcao;
  if (dados.congregacaoId !== undefined) membro.congregacaoId = dados.congregacaoId ? Number(dados.congregacaoId) : null;
  if (dados.status !== undefined) membro.status = dados.status;
  if (dados.dataNascimento !== undefined) membro.dataNascimento = dados.dataNascimento || null;
  if (dados.dataAdmissao !== undefined) membro.dataAdmissao = dados.dataAdmissao || null;
  if (dados.dizimistaFiel !== undefined) membro.dizimistaFiel = dados.dizimistaFiel === null ? null : !!dados.dizimistaFiel;
  if (dados.situacaoMembro !== undefined) membro.situacaoMembro = dados.situacaoMembro || null;
  if (dados.departamentoId !== undefined) membro.departamentoId = dados.departamentoId ? Number(dados.departamentoId) : null;
  persistir();
  return resolverMembro(membro);
}

function desligarMembro(membroId) {
  return atualizarMembro(membroId, { status: "DESLIGADO" });
}

// ---- Assembleia Geral: capacidade ativa (Art. 23 §1º), calculada — não importada ----
function listarElegiveisAssembleia() {
  const hoje = new Date();
  return membros
    .filter(m => estatuto.calcularCapacidadeEleitoral(m, hoje).capacidadeAtiva)
    .map(resolverMembro);
}

// Importação em massa de pessoas (matrícula + nome) — bulk da mesma operação que a tela de
// Pessoas já faz uma por uma (criarMembro/atualizarMembro). Não mexe em elegibilidade: isso é
// sempre calculado por estatuto.calcularCapacidadeEleitoral, nunca por importação.
function importarPessoas(linhas) {
  let incluidos = 0;
  let atualizados = 0;

  for (const linha of linhas) {
    const membroId = Number(linha.matricula);
    const nome = String(linha.nome).trim();
    if (!membroId || !nome) continue;

    const existente = getMembro(membroId);
    if (existente) {
      atualizarMembro(membroId, { nome });
      atualizados++;
    } else {
      criarMembro({ membroId, nome, status: "ATIVO" });
      incluidos++;
    }
  }

  return { incluidos, atualizados };
}

// ---- Universo de presença/falta/quórum por órgão ----
// Cada órgão tem seu próprio universo de "quem deveria estar presente":
// - ASSEMBLEIA_GERAL: quem tem capacidade ativa (Art. 23 §1º) — calculado, não importado.
// - CLI: composição mista do Art. 15 — por Ordenação (Pastor/Evangelista/Presbítero, ATIVO,
//   sem disciplina — calculado ao vivo) UNIÃO com Assentos por Função ativos (Diretoria,
//   Conselho Fiscal, CEI, Dirigente de Congregação, Líder Geral de Departamento/Secretaria).
// - Demais órgãos (ainda sem tela de sessão própria): todo mundo ATIVO, mesma simplificação
//   de sempre enquanto não há um universo mais específico definido.
function membrosPorOrdenacaoCLI() {
  const hoje = new Date();
  const FUNCOES_ORDENACAO = ["Pastor", "Evangelista", "Presbítero"];
  return membros.filter(
    m => m.status === "ATIVO" && FUNCOES_ORDENACAO.includes(m.funcao) && !estatuto.estaSobDisciplina(m, hoje)
  );
}

// Lista resolvida (com nome de congregação) de quem está no universo de um órgão pelo id —
// usada pelas telas de "quem participa" (Assembleia Geral, CLI).
function listarMembrosOrgao(orgaoId) {
  return universoDoOrgao(getOrgao(orgaoId)).map(resolverMembro);
}

function universoDoOrgao(orgao) {
  if (!orgao) return membros.filter(m => m.status === "ATIVO");

  if (orgao.sigla === "ASSEMBLEIA_GERAL") {
    return listarElegiveisAssembleia();
  }

  if (orgao.sigla === "CLI") {
    const porOrdenacao = membrosPorOrdenacaoCLI();
    const idsPorOrdenacao = new Set(porOrdenacao.map(m => m.membroId));
    const porFuncao = listarAssentosAtivosDoOrgao(orgao.orgaoId)
      .map(a => getMembro(a.membroId))
      .filter(m => m && !idsPorOrdenacao.has(m.membroId));
    return porOrdenacao.concat(porFuncao);
  }

  return membros.filter(m => m.status === "ATIVO");
}

function contarUniversoOrgao(orgao, escopoCongregacoes) {
  return universoDoOrgao(orgao).filter(m => membroEstaNoEscopo(m, escopoCongregacoes)).length;
}

function getPapel(id) { return papeis.get(id) || null; }

function getLideranca(membroId) {
  const atribs = liderancas.filter(l => String(l.membroId) === String(membroId));
  if (atribs.length === 0) return null;
  const permissoes = [];
  atribs.forEach(a => {
    const p = getPapel(a.papelId);
    (p && p.permissoes ? p.permissoes : []).forEach(ch => { if (!permissoes.includes(ch)) permissoes.push(ch); });
  });
  const temGlobal = atribs.some(a => a.escopoTipo === "GLOBAL");
  let escopo = "TODAS";
  if (!temGlobal) {
    const nomes = [];
    atribs.forEach(a => {
      if (a.escopoTipo === "CONGREGACAO") { const c = getCongregacao(a.escopoId); if (c && !nomes.includes(c.nome)) nomes.push(c.nome); }
    });
    escopo = nomes.length ? nomes : "TODAS";
  }
  const tipos = atribs.map(a => { const p = getPapel(a.papelId); return p ? p.nome : ("Papel " + a.papelId); });
  return {
    membroId: Number(membroId),
    tipo: tipos.join(", "),
    escopo,
    permissoes,
    senhaHash: atribs[0].senhaHash || null
  };
}

function listarLiderancas() {
  return liderancas.map(l => {
    const membro = getMembro(l.membroId) || {};
    const papel = getPapel(l.papelId) || {};
    return {
      liderancaId: l.liderancaId,
      membroId: l.membroId,
      nome: membro.nome || "(desconhecido)",
      papelId: l.papelId,
      papel: papel.nome || "—",
      nivel: papel.nivel || "—",
      escopoTipo: l.escopoTipo,
      escopoId: l.escopoId,
      permissoes: papel.permissoes || []
    };
  });
}

// Cria/atualiza uma ATRIBUIÇÃO (pessoa -> papel + escopo + senha).
function criarOuAtualizarLideranca({ membroId, papelId, escopoTipo, escopoId, senha }) {
  let lideranca = liderancas.find(l => String(l.membroId) === String(membroId));
  if (!lideranca) {
    lideranca = { liderancaId: proximaLiderancaId++, membroId: Number(membroId), papelId: Number(papelId), escopoTipo: escopoTipo || "GLOBAL", escopoId: escopoId ? Number(escopoId) : null, senhaHash: null };
    liderancas.push(lideranca);
  } else {
    lideranca.papelId = Number(papelId);
    lideranca.escopoTipo = escopoTipo || "GLOBAL";
    lideranca.escopoId = escopoId ? Number(escopoId) : null;
  }
  if (senha) lideranca.senhaHash = hashSenha(senha);
  persistir();
  return lideranca;
}

function removerLideranca(membroId) {
  const index = liderancas.findIndex(l => String(l.membroId) === String(membroId));
  if (index === -1) return false;
  liderancas.splice(index, 1);
  persistir();
  return true;
}

function getSessaoAberta() {
  return sessoes.find(s => s.status === "ABERTA") || null;
}

function getSessao(sessaoId) {
  return sessoes.find(s => String(s.sessaoId) === String(sessaoId)) || null;
}

function criarSessao({ orgaoId, descricao, senhaAcesso }) {
  const sessao = {
    sessaoId: proximoSessaoId++,
    orgaoId,
    descricao,
    dataSessao: new Date().toISOString().slice(0, 10),
    status: "ABERTA",
    senhaAcesso
  };
  sessoes.push(sessao);
  persistir();
  return sessao;
}

function registrarPresenca(sessaoId, membroId) {
  const presenca = {
    presencaId: proximoPresencaId++,
    sessaoId,
    membroId,
    presente: true,
    faltaJustificada: false,
    motivoJustificativa: null
  };
  presencas.push(presenca);
  persistir();
  return presenca;
}

function jaRegistrouPresenca(sessaoId, membroId) {
  return presencas.some(p => String(p.sessaoId) === String(sessaoId) && String(p.membroId) === String(membroId));
}

// Ao encerrar: todo membro do universo do órgão (ATIVO, ou elegível na Assembleia
// Geral) sem presença lançada nesta sessão vira falta.
function encerrarSessao(sessaoId) {
  const sessao = getSessao(sessaoId);
  if (!sessao) return null;

  sessao.status = "ENCERRADA";
  const orgao = getOrgao(sessao.orgaoId);

  let totalFaltas = 0;
  for (const membro of universoDoOrgao(orgao)) {
    if (jaRegistrouPresenca(sessaoId, membro.membroId)) continue;
    presencas.push({
      presencaId: proximoPresencaId++,
      sessaoId,
      membroId: membro.membroId,
      presente: false,
      faltaJustificada: false,
      motivoJustificativa: null
    });
    totalFaltas++;
  }

  const daSessao = presencas.filter(p => String(p.sessaoId) === String(sessaoId));
  persistir();
  return {
    sessao,
    totalPresentes: daSessao.filter(p => p.presente).length,
    totalFaltas,
    totalJustificadas: daSessao.filter(p => !p.presente && p.faltaJustificada).length
  };
}

function listarFrequenciaPorSessao(sessaoId, { escopoCongregacoes } = {}) {
  return presencas
    .filter(p => String(p.sessaoId) === String(sessaoId))
    .map(p => {
      const membro = getMembro(p.membroId) || {};
      return {
        membroId: p.membroId,
        nome: membro.nome || "(desconhecido)",
        funcao: membro.funcao || null,
        congregacaoId: membro.congregacaoId != null ? membro.congregacaoId : null,
        presente: p.presente,
        faltaJustificada: p.faltaJustificada,
        motivoJustificativa: p.motivoJustificativa,
        justificativaPendente: p.justificativaPendente || null
      };
    })
    .filter(item => {
      if (!escopoCongregacoes || escopoCongregacoes === "TODAS") return true;
      const cong = getCongregacao(item.congregacaoId);
      return !!cong && escopoCongregacoes.includes(cong.nome);
    });
}

function listarFrequenciaPorMembro(membroId) {
  return presencas
    .filter(p => String(p.membroId) === String(membroId))
    .map(p => {
      const sessao = getSessao(p.sessaoId) || {};
      return {
        sessaoId: p.sessaoId,
        descricao: sessao.descricao || null,
        dataSessao: sessao.dataSessao || null,
        presente: p.presente,
        faltaJustificada: p.faltaJustificada,
        motivoJustificativa: p.motivoJustificativa,
        justificativaPendente: p.justificativaPendente || null
      };
    });
}

function resumoFrequenciaPorMembro(membroId) {
  const historico = listarFrequenciaPorMembro(membroId);
  const totalReunioes = historico.length;
  const totalPresencas = historico.filter(h => h.presente).length;
  const totalFaltas = historico.filter(h => !h.presente).length;
  const totalJustificadas = historico.filter(h => !h.presente && h.faltaJustificada).length;
  return {
    totalReunioes,
    totalPresencas,
    totalFaltas,
    totalJustificadas,
    percentualPresenca: totalReunioes > 0 ? Math.round((totalPresencas / totalReunioes) * 100) : null
  };
}

function justificarFalta(sessaoId, membroId, motivo) {
  const presenca = presencas.find(
    p => String(p.sessaoId) === String(sessaoId) && String(p.membroId) === String(membroId)
  );
  if (!presenca || presenca.presente) return null;
  presenca.faltaJustificada = true;
  presenca.motivoJustificativa = motivo || null;
  presenca.justificativaPendente = null;
  persistir();
  return presenca;
}

// Correção manual pela Secretaria: vira presente (limpa justificativa) ou vira falta.
function atualizarPresencaManual(sessaoId, membroId, presente) {
  const presenca = presencas.find(
    p => String(p.sessaoId) === String(sessaoId) && String(p.membroId) === String(membroId)
  );
  if (!presenca) return null;
  presenca.presente = !!presente;
  if (presenca.presente) {
    presenca.faltaJustificada = false;
    presenca.motivoJustificativa = null;
    presenca.justificativaPendente = null;
  }
  persistir();
  return presenca;
}

// ---- justificativa pendente (o próprio obreiro solicita, a Secretaria aprova/rejeita) ----
// Fica pendente em vez de aplicar na hora: só a matrícula (sem senha) autentica
// o pedido, então qualquer decisão definitiva precisa passar pela Secretaria —
// evita que alguém forje uma justificativa em nome de outro só sabendo a matrícula.
function solicitarJustificativa(sessaoId, membroId, motivo) {
  const presenca = presencas.find(
    p => String(p.sessaoId) === String(sessaoId) && String(p.membroId) === String(membroId)
  );
  if (!presenca || presenca.presente || presenca.faltaJustificada) return null;
  presenca.justificativaPendente = motivo || null;
  persistir();
  return presenca;
}

function rejeitarJustificativaPendente(sessaoId, membroId) {
  const presenca = presencas.find(
    p => String(p.sessaoId) === String(sessaoId) && String(p.membroId) === String(membroId)
  );
  if (!presenca) return null;
  presenca.justificativaPendente = null;
  persistir();
  return presenca;
}

// ---- Consagrações ----
function listarConsagracoesAtivas() {
  return consagracoes.filter(c => c.status !== "CONCLUIDO" && c.status !== "REPROVADO");
}

function getConsagracao(id) {
  return consagracoes.find(c => String(c.consagracaoId) === String(id)) || null;
}

function criarConsagracao({ membroId, cargoAtual, assunto, proponenteMembroId }) {
  const membro = getMembro(membroId);
  const proponente = getMembro(proponenteMembroId);
  const consagracao = {
    consagracaoId: crypto.randomUUID(),
    membroId: Number(membroId),
    nome: membro ? membro.nome : "(desconhecido)",
    cargoAtual: cargoAtual || (membro ? membro.funcao : null),
    assunto,
    proponenteMembroId: proponenteMembroId ? Number(proponenteMembroId) : null,
    proponente: proponente ? proponente.nome : null,
    status: "PROTOCOLADO",
    dataProtocolo: new Date().toISOString().slice(0, 10),
    dataConclusao: null
  };
  consagracoes.push(consagracao);
  persistir();
  return consagracao;
}

const PROXIMA_ETAPA_CONSAGRACAO = {
  PROTOCOLADO: "EM_ANALISE_CONSELHO",
  EM_ANALISE_CONSELHO: "AGUARDANDO_PLENARIO",
  AGUARDANDO_PLENARIO: "CONCLUIDO"
};

function avancarConsagracao(id) {
  const c = getConsagracao(id);
  if (!c) return null;
  const novoStatus = PROXIMA_ETAPA_CONSAGRACAO[c.status];
  if (!novoStatus) return null;
  c.status = novoStatus;
  if (novoStatus === "CONCLUIDO") {
    c.dataConclusao = new Date().toISOString().slice(0, 10);
    if (c.assunto !== "Integração" && c.assunto !== "Reintegração") {
      atualizarMembro(c.membroId, { funcao: c.assunto });
    }
  }
  persistir();
  return c;
}

function reprovarConsagracao(id) {
  const c = getConsagracao(id);
  if (!c) return null;
  c.status = "REPROVADO";
  c.dataConclusao = new Date().toISOString().slice(0, 10);
  persistir();
  return c;
}

// ---- Catálogos configuráveis e Hierarquia (CRUD genérico) ----
// Tudo aqui é criável/renomeável/excluível pela interface — a regra é "nada fixo em código".
function criarCrudCatalogo(nomeCampo, campoId, semente) {
  const lista = campoSalvoOuSemente(nomeCampo, semente);
  return {
    lista,
    listar: () => lista,
    get: (id) => lista.find(x => String(x[campoId]) === String(id)) || null,
    criar: (dados) => {
      const novo = { [campoId]: proximoId(lista, campoId), ...dados };
      lista.push(novo);
      persistir();
      return novo;
    },
    atualizar: (id, dados) => {
      const x = lista.find(y => String(y[campoId]) === String(id));
      if (!x) return null;
      Object.assign(x, dados);
      persistir();
      return x;
    },
    excluir: (id) => {
      const idx = lista.findIndex(y => String(y[campoId]) === String(id));
      if (idx === -1) return false;
      lista.splice(idx, 1);
      persistir();
      return true;
    }
  };
}

const situacoesMembro = criarCrudCatalogo("situacoesMembro", "situacaoId", [
  { situacaoId: 1, sigla: "CONGREGADO", nome: "Congregado", ativa: true },
  { situacaoId: 2, sigla: "EM_COMUNHAO", nome: "Membro em Comunhão", ativa: true },
  { situacaoId: 3, sigla: "SEM_COMUNHAO", nome: "Membro sem Comunhão", ativa: true }
]);

const departamentos = criarCrudCatalogo("departamentos", "departamentoId", [
  { departamentoId: 1, sigla: "UCADESPA", nome: "União de Crianças", numero: 1, ativa: true },
  { departamentoId: 2, sigla: "UMADESPA", nome: "União de Mocidade", numero: 2, ativa: true },
  { departamentoId: 3, sigla: "USADESPA", nome: "União de Senhoras", numero: 3, ativa: true },
  { departamentoId: 4, sigla: "UHADESPA", nome: "União de Homens", numero: 4, ativa: true },
  { departamentoId: 5, sigla: "SEMIADESPA", nome: "Missões", numero: 5, ativa: true },
  { departamentoId: 6, sigla: "ACAO_DA_FE", nome: "Ação Social", numero: 6, ativa: true },
  { departamentoId: 7, sigla: "EBD", nome: "Escola Bíblica Dominical", numero: 7, ativa: true },
  { departamentoId: 8, sigla: "FAMILIA", nome: "Ministério de Família", numero: 8, ativa: true }
]);

const funcionalidades = criarCrudCatalogo("funcionalidades", "funcionalidadeId", [
  { funcionalidadeId: 1, chave: "reunioes", nome: "Reuniões" },
  { funcionalidadeId: 2, chave: "assembleia", nome: "Assembleia Geral" },
  { funcionalidadeId: 3, chave: "cli", nome: "CLI" },
  { funcionalidadeId: 4, chave: "pessoas", nome: "Pessoas" },
  { funcionalidadeId: 5, chave: "permissoes", nome: "Permissões" },
  { funcionalidadeId: 6, chave: "consagracoes", nome: "Consagrações" },
  { funcionalidadeId: 7, chave: "estrutura", nome: "Estrutura" },
  { funcionalidadeId: 8, chave: "catalogos", nome: "Catálogos" },
  { funcionalidadeId: 9, chave: "financeiro", nome: "Financeiro" },
  { funcionalidadeId: 10, chave: "relatorios", nome: "Relatórios" },
  { funcionalidadeId: 11, chave: "auditoria", nome: "Auditoria" },
  { funcionalidadeId: 12, chave: "disciplina", nome: "Disciplina" }
]);

const papeis = criarCrudCatalogo("papeis", "papelId", [
  { papelId: 1, nome: "Secretário Geral", nivel: "GLOBAL", permissoes: ["reunioes", "assembleia", "cli", "pessoas", "permissoes", "consagracoes", "estrutura", "catalogos", "financeiro", "relatorios", "auditoria", "disciplina"] },
  { papelId: 2, nome: "Dirigente de Congregação", nivel: "CONGREGACAO", permissoes: ["reunioes", "pessoas", "estrutura"] },
  { papelId: 3, nome: "Pastor de Área", nivel: "AREA", permissoes: ["reunioes", "pessoas", "assembleia"] },
  { papelId: 4, nome: "Secretário de Reuniões", nivel: "GLOBAL", permissoes: ["reunioes"] },
  { papelId: 5, nome: "Tesoureiro", nivel: "GLOBAL", permissoes: ["financeiro"] },
  { papelId: 6, nome: "Líder de Consagrações", nivel: "GLOBAL", permissoes: ["consagracoes"] }
]);

const distritos = criarCrudCatalogo("distritos", "distritoId", [
  { distritoId: 1, nome: "Distrito Norte" },
  { distritoId: 2, nome: "Distrito Sul" }
]);
const quadrantes = criarCrudCatalogo("quadrantes", "quadranteId", [
  { quadranteId: 1, nome: "Quadrante Leste", distritoId: 1 },
  { quadranteId: 2, nome: "Quadrante Oeste", distritoId: 2 }
]);
const regioes = criarCrudCatalogo("regioes", "regiaoId", [
  { regiaoId: 1, nome: "Região Centro", quadranteId: 1 },
  { regiaoId: 2, nome: "Região Vila Nova", quadranteId: 1 },
  { regiaoId: 3, nome: "Região Industrial", quadranteId: 2 }
]);
const areas = criarCrudCatalogo("areas", "areaId", [
  { areaId: 1, nome: "Área Palmares", regiaoId: 1 },
  { areaId: 2, nome: "Área Cidade Jardim", regiaoId: 1 },
  { areaId: 3, nome: "Área Rio Verde", regiaoId: 2 },
  { areaId: 4, nome: "Área Novo Brasil", regiaoId: 3 }
]);
const extensoes = criarCrudCatalogo("extensoes", "extensaoId", [
  { extensaoId: 1, nome: "Extensão Beira Rio", congregacaoMaeId: 3 }
]);

// Exclui dados fictícios por categoria (sempre preserva o admin matrícula 3 + seu acesso).
function excluirDadosFicticios(categorias = []) {
  const admin = membros.find(m => String(m.membroId) === "3");
  const adminLideranca = liderancas.find(l => String(l.membroId) === "3");
  const adminPapel = papeis.lista.find(p => String(p.papelId) === "1");

  categorias.forEach(cat => {
    if (cat === "pessoas") membros.splice(0, membros.length);
    if (cat === "congregacoes") congregacoes.splice(0, congregacoes.length);
    if (cat === "estrutura") { [areas, regioes, quadrantes, distritos, extensoes].forEach(c => c.lista.splice(0, c.lista.length)); }
    if (cat === "funcoes") funcoes.splice(0, funcoes.length);
    if (cat === "orgaos") orgaos.splice(0, orgaos.length);
    if (cat === "departamentos") departamentos.lista.splice(0, departamentos.lista.length);
    if (cat === "situacoes") situacoesMembro.lista.splice(0, situacoesMembro.lista.length);
    if (cat === "permissoes") { funcionalidades.lista.splice(0, funcionalidades.lista.length); papeis.lista.splice(0, papeis.lista.length); }
    if (cat === "liderancas") liderancas.splice(0, liderancas.length);
    if (cat === "consagracoes") consagracoes.splice(0, consagracoes.length);
    if (cat === "reunioes") { sessoes.splice(0, sessoes.length); presencas.splice(0, presencas.length); }
  });

  if (admin) membros.push(admin);
  if (adminPapel && !papeis.lista.some(p => String(p.papelId) === "1")) papeis.lista.push(adminPapel);
  if (adminLideranca && !liderancas.some(l => String(l.membroId) === "3")) liderancas.push(adminLideranca);

  persistir();
  return { sucesso: true, mensagem: "✅ Dados fictícios excluídos. Admin (matrícula 3) preservado." };
}

module.exports = {
  congregacoes,
  funcoes,
  orgaos,
  membros,
  sessoes,
  presencas,
  liderancas,
  listarCongregacoes,
  getCongregacao,
  criarCongregacao,
  atualizarCongregacao,
  desativarCongregacao,
  reativarCongregacao,
  excluirCongregacao,
  listarFuncoes,
  getFuncao,
  getFuncaoPorNome,
  criarFuncao,
  atualizarFuncao,
  desativarFuncao,
  reativarFuncao,
  excluirFuncao,
  getOrgao,
  getPapel,
  listarOrgaos,
  criarOrgao,
  atualizarOrgao,
  excluirOrgao,
  assentos,
  listarAssentos,
  listarAssentosAtivosDoOrgao,
  criarAssento,
  encerrarAssento,
  getMembro,
  listarMembros,
  criarMembro,
  atualizarMembro,
  desligarMembro,
  membroEstaNoEscopo,
  listarElegiveisAssembleia,
  importarPessoas,
  universoDoOrgao,
  listarMembrosOrgao,
  contarUniversoOrgao,
  getLideranca,
  listarLiderancas,
  criarOuAtualizarLideranca,
  removerLideranca,
  getSessaoAberta,
  getSessao,
  criarSessao,
  registrarPresenca,
  jaRegistrouPresenca,
  encerrarSessao,
  listarFrequenciaPorSessao,
  listarFrequenciaPorMembro,
  resumoFrequenciaPorMembro,
  justificarFalta,
  atualizarPresencaManual,
  solicitarJustificativa,
  rejeitarJustificativaPendente,
  consagracoes,
  listarConsagracoesAtivas,
  getConsagracao,
  criarConsagracao,
  avancarConsagracao,
  reprovarConsagracao,
  excluirDadosFicticios,
  situacoesMembro,
  departamentos,
  funcionalidades,
  papeis,
  areas,
  regioes,
  quadrantes,
  distritos,
  extensoes
};
