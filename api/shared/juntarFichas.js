// shared/juntarFichas.js (FASE 10, v10.1b passo 6, 18/11/2026) — as REGRAS PURAS de JUNTAR FICHAS REPETIDAS (nenhuma consulta ao banco aqui; quem lê e grava é
// shared/juntarFichasDb.js). Decisões do responsável (rodada 8 da gestão de membros e 13/11/2026):
//  - a tela mostra SÓ o que é diferente entre as duas fichas e a secretaria escolhe, campo a campo, o que fica (opção 3); os iguais ficam como estão;
//  - fica SEMPRE a matrícula mais antiga; o número que sobra vai para o PRÓXIMO cadastro novo (MatriculasLivres);
//  - o escopo é o do CPF repetido: as duas fichas na congregação (ou na área) de quem junta; fora disso, só a Secretaria Geral;
//  - a carteirinha física não é impressa enquanto a ficha tiver pendência de cadastro (REPETIDA ou NUMERO) e a assembleia geral avisa antes de abrir.
// As travas de cada campo são as MESMAS da edição campo a campo (shared/edicaoFicha.js): o nome e o CPF já gravado só a Geral, ninguém mexe no próprio
// nascimento/sexo/estado civil/admissão, processo de cargo... Os atos da Igreja (situação, cargo, dízimo, saída) só a Secretaria Geral escolhe ao juntar.
const regras = require("./edicaoFicha");
const { mascararCpf } = require("./fichaMembro");

// Os campos que a junção compara. Os 20 da edição campo a campo (com as mesmas travas) e os que só existem aqui: a congregação (com a Extensão), o endereço
// inteiro (a linha e as 8 partes), a foto e os atos da Igreja. `colunas` = as colunas de MembroReferencia que andam juntas; `rotulo`, `grupo` para a tela.
const ENDERECO_COLUNAS = ["Endereco", "EnderecoLogradouro", "EnderecoNumero", "EnderecoComplemento", "EnderecoBairroId", "EnderecoBairroTexto", "EnderecoCidade", "EnderecoUF", "EnderecoCep"];
const EXTRAS = {
  congregacao: { colunas: ["CongregacaoId", "ExtensaoId"], rotulo: "Congregação", grupo: "Na igreja", quem: "ESCOPO" },
  fotoUrl: { colunas: ["FotoUrl"], rotulo: "Foto", grupo: "Dados pessoais", quem: "SECRETARIA" },
  situacaoMembro: { colunas: ["SituacaoMembro"], rotulo: "Situação", grupo: "Na igreja", quem: "GERAL" },
  status: { colunas: ["Status"], rotulo: "Situação no rol", grupo: "Na igreja", quem: "GERAL" },
  cargo: { colunas: ["CargoMinisterial", "Funcao"], rotulo: "Cargo", grupo: "Na igreja", quem: "GERAL" },
  dizimistaFiel: { colunas: ["DizimistaFiel"], rotulo: "Dizimista fiel", grupo: "Na igreja", quem: "GERAL" },
  dataAfastamento: { colunas: ["DataAfastamento"], rotulo: "Data do afastamento", grupo: "Na igreja", quem: "SECRETARIA" },
  saida: { colunas: ["DataSaida", "MotivoSaida"], rotulo: "Saída do rol", grupo: "Na igreja", quem: "GERAL", disciplinar: true }
};
const CAMPOS = (() => {
  const c = {};
  for (const [chave, d] of Object.entries(regras.CAMPOS)) {
    c[chave] = { colunas: chave === "endereco" ? ENDERECO_COLUNAS : [d.coluna], rotulo: d.rotulo, grupo: d.grupo, quem: "EDICAO" };
  }
  return Object.assign(c, EXTRAS);
})();
// Todas as colunas que a junção lê da ficha (a ficha que sai é guardada inteira à parte, para desfazer)
const COLUNAS_FICHA = [...new Set(Object.values(CAMPOS).flatMap((c) => c.colunas))];
const ehCampo = (chave) => typeof chave === "string" && Object.prototype.hasOwnProperty.call(CAMPOS, chave);

const SAIDAS_DISCIPLINARES = new Set(["EXCLUSAO", "ABANDONO_MATERIAL", "ABANDONO_DIGITAL"]);

// O valor de uma coluna como texto comparável (datas em AAAA-MM-DD, bit em "1"/"0", espaços em excesso fora).
function textoDaColuna(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "boolean") return v ? "1" : "0";
  const t = String(v).replace(/\s+/g, " ").trim();
  return t === "" ? null : t;
}
// O valor de um campo (as colunas dele) como texto comparável: um campo de uma coluna vira o texto; de várias, a lista (JSON).
function valorDoCampo(chave, linha) {
  const cols = CAMPOS[chave].colunas;
  if (cols.length === 1) return textoDaColuna(linha[cols[0]]);
  const partes = cols.map((c) => textoDaColuna(linha[c]));
  return partes.every((p) => p === null) ? null : JSON.stringify(partes);
}
const iguais = (chave, a, b) => valorDoCampo(chave, a) === valorDoCampo(chave, b);

// Qual das duas fica: a MAIS ANTIGA. Se nenhum dos dois números foi reaproveitado de uma junção, a de número menor (a matrícula do sistema antigo e as
// geradas crescem com o tempo: "juntando a 15 e a 500, fica a 15"); se algum foi reaproveitado (um número velho dado a uma pessoa nova), a que entrou primeiro
// no sistema (CriadoEm), e no empate o número menor. `a`, `b` = { membroId, criadoEm, reaproveitada }.
function quemFica(a, b) {
  const menor = Number(a.membroId) < Number(b.membroId) ? a : b;
  const maior = menor === a ? b : a;
  if (!a.reaproveitada && !b.reaproveitada) return { fica: menor, sai: maior };
  const ta = a.criadoEm ? new Date(a.criadoEm).getTime() : NaN, tb = b.criadoEm ? new Date(b.criadoEm).getTime() : NaN;
  if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta < tb ? { fica: a, sai: b } : { fica: b, sai: a };
  return { fica: menor, sai: maior };
}

// Quem pode escolher o valor de um campo ao juntar. ctx: { papel (GERAL | SECRETARIA), ehProprio, valorFica (texto), emProcessoDeCargo, temExclusao }.
// Devolve { pode, motivo } — sem poder, fica o valor da ficha que fica (a mais antiga).
function podeEscolher(chave, ctx) {
  if (!ehCampo(chave)) return { pode: false, motivo: "Campo desconhecido." };
  const c = CAMPOS[chave];
  const geral = ctx.papel === "GERAL";
  if (ctx.ehProprio) return { pode: false, motivo: "Ninguém escolhe os dados da própria ficha." };
  if (c.quem === "EDICAO") return regras.podeSecretariaMudar(chave, { papel: ctx.papel, ehProprio: false, valorAtual: ctx.valorFica, emProcessoDeCargo: ctx.emProcessoDeCargo, temExclusao: ctx.temExclusao });
  if (c.quem === "GERAL" && !geral) return { pode: false, motivo: `${c.rotulo}: muda por um ato da Igreja — ao juntar, só a Secretaria Geral escolhe.` };
  return { pode: true, motivo: null };
}

// O valor para MOSTRAR na tela de quem junta: o CPF mascarado, o e-mail e o celular mascarados (como no desenho aprovado), o motivo de uma saída disciplinar
// só para quem tem "disciplina" no escopo das duas fichas. `nomes` = { congregacoes: Map(id->nome), extensoes: Map, departamentos: Map, cargos: Map }.
function valorParaTela(chave, linha, { podeDisciplina = false, nomes = {} } = {}) {
  const v = (col) => linha[col];
  // as datas no padrão brasileiro (dd/mm/aaaa); o resto como está
  const txt = (col) => { const t = textoDaColuna(v(col)); return t && /^Data/.test(col) && /^\d{4}-\d{2}-\d{2}$/.test(t) ? `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)}` : t; };
  const pegar = (mapa, id) => (id == null ? null : (mapa && mapa.get(Number(id))) || `nº ${id}`);
  switch (chave) {
    case "cpf": return txt("Cpf") ? mascararCpf(txt("Cpf")) : null;
    case "email": return txt("Email") ? regras.mascarar("email", txt("Email")) : null;
    case "telefone": return txt("Telefone") ? regras.mascarar("telefone", txt("Telefone")) : null;
    case "endereco": return txt("Endereco");
    case "congregacao": {
      if (v("CongregacaoId") == null) return null;
      const cong = pegar(nomes.congregacoes, v("CongregacaoId"));
      return v("ExtensaoId") == null ? cong : `${cong} · ${pegar(nomes.extensoes, v("ExtensaoId"))}`;
    }
    case "departamentoId": return v("DepartamentoId") == null ? null : pegar(nomes.departamentos, v("DepartamentoId"));
    case "fotoUrl": return txt("FotoUrl") ? "tem foto" : null;
    case "cargo": return txt("CargoMinisterial") ? ((nomes.cargos && nomes.cargos.get(txt("CargoMinisterial"))) || txt("CargoMinisterial")) : txt("Funcao");
    case "dizimistaFiel": return v("DizimistaFiel") == null ? null : v("DizimistaFiel") ? "sim" : "não";
    case "saida": {
      if (!txt("DataSaida") && !txt("MotivoSaida")) return null;
      const motivo = txt("MotivoSaida");
      const mostra = motivo && SAIDAS_DISCIPLINARES.has(motivo) && !podeDisciplina ? "motivo reservado" : motivo;
      return [txt("DataSaida"), mostra].filter(Boolean).join(" · ");
    }
    default: {
      const c = CAMPOS[chave];
      return c ? txt(c.colunas[0]) : null;
    }
  }
}

// As escolhas que vieram da tela: { campo: "FICA" | "SAI" } (ou o número da matrícula de uma das duas). Só os campos diferentes contam; o que não veio fica
// como a ficha que fica. Devolve { ok, escolhas, mensagem }.
function lerEscolhas(entrada, { fica, sai }) {
  if (entrada === undefined || entrada === null) return { ok: true, escolhas: {} };
  if (typeof entrada !== "object" || Array.isArray(entrada)) return { ok: false, mensagem: "Escolhas inválidas." };
  const escolhas = Object.create(null);
  for (const [k, v] of Object.entries(entrada)) {
    if (!ehCampo(k)) return { ok: false, mensagem: "Há um campo que não existe nas escolhas." };
    const lado = v === "FICA" || String(v) === String(fica) ? "FICA" : v === "SAI" || String(v) === String(sai) ? "SAI" : null;
    if (!lado) return { ok: false, mensagem: `Escolha inválida em ${CAMPOS[k].rotulo.toLowerCase()}.` };
    escolhas[k] = lado;
  }
  return { ok: true, escolhas };
}

// ---------------------------------------------------------------- o que fazer com as linhas das outras tabelas
// Quando a linha da ficha que sai NÃO cabe na que fica (um índice único: a mesma presença na mesma reunião, as duas no mesmo grupo...):
//  - DESCARTAR: dado de acesso, contador ou aviso, que não é história da pessoa — a linha da que sai é apagada (a da que fica continua);
//  - ARQUIVAR: o mesmo fato registrado duas vezes — a linha da que sai vai INTEIRA para JuncoesFichasArquivo (para conferir e desfazer) e sai da tabela;
//  - o resto BLOQUEIA a junção: as duas fichas têm algo EM ANDAMENTO que só uma pode ter (liderança, cargo em aberto, matrícula ativa...) — alguém da
//    secretaria encerra o da ficha que sai antes (a tela diz o quê).
const DESCARTAR = new Set(["MembroPins", "AcessoTentativas", "NotificacaoPreferencias", "Notificacoes", "ConquistasDesbloqueadas", "ConquistasEventos", "DesafiosWebAuthn"]);
const ARQUIVAR = new Set(["Presencas", "RespostasEnquete", "PublicoEnqueteCustom", "MinisterioMenoresPoliticaAceites", "CodigoCondutaAceites", "EscalasAlocacoes",
  "EscalasEquipeMembros", "EbdTurmaProfessores", "OficiantesBatismo", "AFMTurmaAlunos", "CerimoniasComissaoUncao", "SaidaAprovacoes", "VinculosFamiliares",
  "CredenciamentosAssembleia", "ComunicacaoEntregas", "DeclaracoesConflitoInteresse", "EscalasRodizioGrupoMembros", "CpfLeituras"]);
// As linhas que ligam uma ficha à OUTRA (um vínculo de família entre as duas, que viraria "a pessoa é parente de si mesma"): arquivadas, como acima.
const LIGACAO_ARQUIVAR = new Set(["VinculosFamiliares"]);
// Tabelas tratadas à parte pelo banco (antes do movimento geral): as pendências da dupla, os casos da Geral, a credencial, as sessões e as chaves de acesso.
const ESPECIAIS = new Set(["FichasPendencias", "CasosCadastroGeral", "CredenciaisEclesiasticas", "SessoesAtivas"]);
// Os pares de colunas da pessoa que não podem virar a MESMA pessoa (além dos CHECK "[A]<>[B]" que o banco já tem e que são lidos do catálogo): casada com
// ela mesma, as duas partes de uma mediação, pai e mãe da mesma criança, quem denunciou e quem foi denunciado.
const PARES_PROIBIDOS = {
  Casamentos: [["MembroId", "MembroConjugeId"]],
  MediacoesArbitragens: [["ParteAId", "ParteBId"]],
  ApresentacoesCrianca: [["MembroIdMae", "MembroIdPai"]],
  DenunciasOuvidoria: [["DenunciadoMembroId", "DenuncianteMembroId"]]
};
// Colunas de membro SEM chave estrangeira que também andam (as chaves de acesso do aparelho e os desafios da chave)
const COLUNAS_SEM_FK = [{ t: "ChavesAcesso", c: "MembroId" }, { t: "DesafiosWebAuthn", c: "MembroId" }];

// O nome de cada tabela na prévia (o que a secretaria entende). As que não estão aqui entram em "outros registros" — de propósito: o que é da disciplina, da
// proteção de menores, do cuidado pastoral ou da ouvidoria nunca aparece pelo nome a quem junta.
const ROTULOS = {
  Presencas: "presenças em reuniões", Dizimistas: "cadastro de dizimista", LancamentosTesouraria: "lançamentos da tesouraria", EbdAlunos: "matrícula na EBD",
  EbdTurmaProfessores: "professor da EBD", EscalasAlocacoes: "escalas", EscalasEquipeMembros: "equipes das escalas", EscalasIndisponibilidades: "indisponibilidades nas escalas",
  VinculosFamiliares: "vínculos de família", Casamentos: "casamentos", ApresentacoesCrianca: "apresentação de filhos", MarcosMembro: "marcos da vida espiritual",
  CandidatosBatismo: "candidato ao batismo", OficiantesBatismo: "oficiante de batismo", CartasTransito: "cartas", CertificadosEmitidos: "certificados",
  CredenciaisEclesiasticas: "credencial", CargosMinisteriaisHistorico: "histórico de cargos", Consagracoes: "consagrações", Lideranca: "acesso de liderança",
  SessoesAtivas: "sessões (encerradas)", TransferenciasCongregacao: "transferências", SolicitacoesEdicaoPessoa: "sugestões de alteração", CpfLeituras: "leituras do CPF",
  RespostasEnquete: "respostas de enquetes", PublicoEnqueteCustom: "público de enquetes", Notificacoes: "avisos", NotificacaoPreferencias: "preferências de aviso",
  PushInscricoesMembro: "avisos no celular", MembroPins: "PIN de acesso", ChavesAcesso: "chaves de acesso do aparelho", TermosAssinados: "termos assinados",
  ConsentimentosLGPD: "consentimentos (LGPD)", ComunicacaoConsentimentos: "consentimentos de comunicação", ComunicacaoEntregas: "comunicados recebidos",
  Matriculas_AFM: "matrícula na AFM", AFMTurmaAlunos: "turmas da AFM", TrilhaMatriculas: "trilhas de formação", VoluntariadoAdesoes: "adesões ao voluntariado",
  VoluntariosHabilitacao: "habilitação de voluntário", EventoOrganizadores: "organização de eventos", SetoresTecnicosMembros: "setores técnicos",
  FichasPendencias: "pendências de cadastro", PreCadastros: "pré-cadastros", Assentos: "assentos em órgãos", ComissaoMembros: "comissões",
  ConquistasDesbloqueadas: "conquistas", ConquistasEventos: "conquistas", AcessoTentativas: "tentativas de acesso", CodigosAcessoMembro: "códigos de acesso",
  LicencasCandidatura: "licença para candidatura", EnviosMissionarios: "envio missionário", ExtensaoEncarregados: "encarregado de Extensão"
};
// Os nomes nas mensagens de bloqueio (o que precisa ser encerrado antes)
const BLOQUEIO = {
  Lideranca: "as duas fichas têm acesso de liderança: encerre o da ficha que sai antes de juntar",
  CargosMinisteriaisHistorico: "as duas fichas têm um cargo em aberto no histórico de cargos: a Secretaria Geral corrige o da ficha que sai antes",
  Consagracoes: "as duas fichas têm um processo de consagração em andamento: conclua ou cancele o da ficha que sai",
  EbdAlunos: "as duas fichas estão matriculadas na EBD: tire a matrícula da ficha que sai antes",
  Matriculas_AFM: "as duas fichas têm matrícula automática na AFM: a Secretaria Geral corrige a da ficha que sai",
  CandidatosBatismo: "as duas fichas estão como candidatas ao batismo: tire a da ficha que sai",
  VoluntariosHabilitacao: "as duas fichas têm habilitação de voluntário: encerre a da ficha que sai",
  TransferenciasCongregacao: "há um pedido de transferência em andamento",
  EnviosMissionarios: "as duas fichas têm um envio missionário em andamento",
  TrilhaMatriculas: "as duas fichas estão na mesma trilha de formação em andamento: encerre a da ficha que sai",
  SetoresTecnicosMembros: "as duas fichas estão no mesmo Setor Técnico: encerre o vínculo da ficha que sai",
  ComissaoMembros: "as duas fichas estão na mesma comissão: encerre a da ficha que sai",
  EventoOrganizadores: "as duas fichas organizam o mesmo evento: tire a da ficha que sai"
};
const rotuloDaTabela = (t) => (Object.prototype.hasOwnProperty.call(ROTULOS, t) ? ROTULOS[t] : null);
const motivoDoBloqueio = (t) => (Object.prototype.hasOwnProperty.call(BLOQUEIO, t) ? BLOQUEIO[t] : "as duas fichas têm um registro que só uma pessoa pode ter (fale com a Secretaria Geral)");
function politicaDoConflito(tabela) {
  if (DESCARTAR.has(tabela)) return "DESCARTAR";
  if (ARQUIVAR.has(tabela)) return "ARQUIVAR";
  return "BLOQUEAR";
}

// A prévia agrupada para a tela: as tabelas com nome (ordenadas pela quantidade) e o resto somado em "outros registros". Nunca o nome de uma tabela sem rótulo.
function previaParaTela(contagens) {
  const comNome = new Map();
  let outros = 0;
  for (const { t, n } of contagens) {
    const r = rotuloDaTabela(t);
    if (r) comNome.set(r, (comNome.get(r) || 0) + n);
    else outros += n;
  }
  const itens = [...comNome.entries()].map(([rotulo, n]) => ({ rotulo, n })).sort((x, y) => y.n - x.n || x.rotulo.localeCompare(y.rotulo));
  if (outros) itens.push({ rotulo: "outros registros", n: outros });
  return itens;
}

// O texto para o nome comparável (sem acento e sem diferença de maiúscula; o banco usa a ordenação Latin1_General_CI_AI para o mesmo fim).
const chaveDoNome = (nome) => String(nome || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

module.exports = { CAMPOS, COLUNAS_FICHA, ENDERECO_COLUNAS, ehCampo, textoDaColuna, valorDoCampo, iguais, quemFica, podeEscolher, valorParaTela, lerEscolhas,
  DESCARTAR, ARQUIVAR, LIGACAO_ARQUIVAR, ESPECIAIS, COLUNAS_SEM_FK, PARES_PROIBIDOS, politicaDoConflito, rotuloDaTabela, motivoDoBloqueio, previaParaTela, chaveDoNome, SAIDAS_DISCIPLINARES };
