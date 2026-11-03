// shared/entidadesVinculadas.js — v9.1: Entidades vinculadas (Estatuto Art. 64 a 68; Regimento Art. 47-A e 153). Só regra pura, testada
// (__tests__/entidadesVinculadas.test.js); o banco fica em entidadesVinculadasDb.js. Desenho em docs/plano/fase-9-entidades-vinculadas.md.
const { somarDias, dataDoAto } = require("./afm");

const NATUREZAS = { ASSISTENCIA_SOCIAL: "Assistência social", SAUDE: "Saúde", EDUCACAO: "Educação", OUTRA: "Outra" };
const STATUS_ENTIDADE = { PROPOSTA: "Proposta (aguardando a CLI)", ATIVA: "Ativa", NAO_APROVADA: "Não aprovada pela CLI", DESFEITA: "Vínculo desfeito (a Assembleia não ratificou)", EXTINTA: "Extinta" };
const FUNCOES = {
  DIRETOR_PRESIDENTE: "Diretor-Presidente", DIRETOR_VICE: "Diretor Vice-Presidente", DIRETOR_ADMIN: "Diretor Administrativo", DIRETOR_FINANCEIRO: "Diretor Financeiro",
  SECRETARIO: "Secretário(a)", GESTOR_TECNICO: "Gestor técnico (Reg. Art. 153)", CONSELHEIRO_FISCAL: "Conselheiro(a) fiscal", OUTRA: "Outra função"
};
const FUNCOES_UNICAS = ["DIRETOR_PRESIDENTE", "GESTOR_TECNICO"];
const STATUS_DIRIGENTE = { INDICADO: "Indicado pelo Pastor Presidente (aguardando a CLI)", HOMOLOGADO: "Homologado pela CLI", RECUSADO: "Recusado pela CLI", ENCERRADO: "Encerrado" };
const MOTIVOS_ENCERRAMENTO = {
  EXONERACAO: "Exoneração (Art. 65)", FIM_MANDATO: "Fim do mandato", RENUNCIA: "Renúncia", DESTITUICAO_INTERVENCAO: "Destituído pela intervenção ratificada",
  EXTINCAO: "Extinção da entidade", FALECIMENTO: "Falecimento", OUTRO: "Outro"
};
// os que a tela escolhe (a destituição e a extinção são do próprio sistema)
const MOTIVOS_ENCERRAMENTO_MANUAL = ["EXONERACAO", "FIM_MANDATO", "RENUNCIA", "FALECIMENTO", "OUTRO"];
const MOTIVOS_INTERVENCAO = {
  GESTAO_TEMERARIA: "Gestão temerária", DESVIO_FINALIDADE: "Desvio de finalidade", INADIMPLENCIA_FISCAL: "Inadimplência fiscal", RISCO_IMAGEM: "Risco à imagem da Igreja"
};
const STATUS_INTERVENCAO = {
  APURACAO: "Em apuração", ARQUIVADA: "Apuração arquivada", DECRETADA: "Decretada — aguardando a ratificação da CLI", RATIFICADA: "Ratificada pela CLI (em vigor)",
  NAO_RATIFICADA: "Não ratificada pela CLI (sem efeito)", CADUCADA: "Perdeu a eficácia (sem ratificação em 15 dias)", ENCERRADA: "Encerrada (gestão devolvida)"
};
const EM_CURSO = ["APURACAO", "DECRETADA", "RATIFICADA"];
const PERIODICIDADES = { ANUAL: "Anual", SEMESTRAL: "Semestral", TRIMESTRAL: "Trimestral" };
const MESES_DO_PERIODO = { ANUAL: 12, SEMESTRAL: 6, TRIMESTRAL: 3 };
const RESULTADOS_APRECIACAO = { APROVADA: "Aprovada", APROVADA_COM_RESSALVAS: "Aprovada com ressalvas", REPROVADA: "Reprovada" };
const RESULTADOS_CF = { SEM_CONFUSAO: "Sem confusão patrimonial", IRREGULARIDADE: "Irregularidade encontrada" };
const RESULTADOS_AG = { RATIFICADA: "Ratificada pela Assembleia", NAO_RATIFICADA: "Não ratificada pela Assembleia" };
// Art. 68: o destino do patrimônio depende da natureza (I saúde, II educação; as demais seguem a regra geral do Terceiro Setor)
const DESTINOS = {
  SAUDE_OUTRA_INSTITUICAO: { rotulo: "Outra instituição de saúde sem fins lucrativos (Art. 68, I)", naturezas: ["SAUDE"] },
  SAUDE_MATRIZ_ASSISTENCIAL: { rotulo: "A Matriz, com afetação exclusiva a fins assistenciais (Art. 68, I — só se a IEADESPA mantiver atividade assistencial do mesmo tipo)", naturezas: ["SAUDE"] },
  EDUCACAO_CONGENERE: { rotulo: "Instituição de ensino congênere (Art. 68, II)", naturezas: ["EDUCACAO"] },
  CONGENERE_SEM_FINS: { rotulo: "Entidade congênere sem fins econômicos (regra do Terceiro Setor)", naturezas: ["ASSISTENCIA_SOCIAL", "OUTRA"] }
};

const PRAZO_RATIFICACAO_DIAS = 15;   // Reg. Art. 47-A §2º — fixo: é o próprio prazo fatal do Regimento
const PRAZO_MANIFESTACAO_DIAS = 5;   // Estatuto Art. 65 §3º — o mínimo para o gestor se manifestar (o 5º dia inteiro é dele: a decretação, do 6º em diante)
const PRAZO_CORRECAO_CADUCIDADE_DIAS = 10;   // até quantos dias depois do prazo fatal a reunião feita a tempo (registro atrasado) ainda corrige a caducidade, com a ata
// O último dia em que o gestor se manifesta e o primeiro em que a decretação sem urgência é possível.
const manifestacaoAte = (notificadoEm) => somarDias(notificadoEm, PRAZO_MANIFESTACAO_DIAS);
const decretavelDesde = (notificadoEm) => somarDias(notificadoEm, PRAZO_MANIFESTACAO_DIAS + 1);
const PRAZO_ENTREGA_PADRAO = 120;    // Prazos ENTIDADE_PRESTACAO_PRAZO_DIAS (cada entidade tem o seu)
const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

// ---------------------------------------------------------------- textos ----------------------------------------------------------------
// Texto de uma linha (sem quebra nem caractere de controle) ou de várias linhas (o parágrafo da fundamentação).
function texto(valor, { minimo = 0, maximo, rotulo, obrigatorio = true, multilinha = false }) {
  if (valor == null || valor === "") {
    if (!obrigatorio) return { valido: true, texto: null };
    return { valido: false, mensagem: `Informe ${rotulo.toLowerCase()}.` };
  }
  if (typeof valor !== "string") return { valido: false, mensagem: `${rotulo} é um texto.` };
  let t = valor.replace(/\r\n?/g, "\n");
  // eslint-disable-next-line no-control-regex
  t = multilinha ? t.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, " ") : t.replace(/[\u0000-\u001F\u007F]/g, " ");
  t = t.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!t) {
    if (!obrigatorio) return { valido: true, texto: null };
    return { valido: false, mensagem: `Informe ${rotulo.toLowerCase()}.` };
  }
  if (t.length < minimo) return { valido: false, mensagem: `${rotulo}: escreva pelo menos ${minimo} caracteres.` };
  if (t.length > maximo) return { valido: false, mensagem: `${rotulo} tem no máximo ${maximo} caracteres.` };
  return { valido: true, texto: t };
}

// Identificador numérico estrito: "0x10", "1e1", true, [5] e 1.5 não são identificadores.
function idDe(valor) {
  if (typeof valor === "number") return Number.isInteger(valor) && valor > 0 && valor <= 2147483647 ? valor : null;
  if (typeof valor !== "string" || !/^[1-9][0-9]{0,9}$/.test(valor.trim())) return null;
  const n = Number(valor.trim());
  return n <= 2147483647 ? n : null;
}
const booleano = (v) => v === true || v === "true" || v === 1 || v === "1";

// Sem acento e em minúsculas, para comparar "Pedagogia" com "pedagogia " ou "Gestão Hospitalar" com "gestao hospitalar".
function chaveDeComparacao(t) {
  return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------- CNPJ ----------------------------------------------------------------
// O CNPJ alfanumérico (IN RFB 2.229/2024, emitido desde julho de 2026): as 12 primeiras posições podem ter letras (A-Z) e números; os dois dígitos
// verificadores continuam numéricos, calculados pelo módulo 11 com o valor de cada caractere = código ASCII − 48 (o número antigo dá o mesmo resultado).
function normalizarCnpj(valor) {
  if (typeof valor !== "string") return "";
  return valor.toUpperCase().replace(/[\s./-]/g, "");
}
function digitoCnpj(base) {
  const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let soma = 0;
  for (let i = 0; i < base.length; i++) soma += (base.charCodeAt(i) - 48) * pesos[i];
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}
// `matriz`: Art. 64 — a entidade vinculada é "Matriz 0001" (a ordem do estabelecimento, posições 9 a 12).
function validarCnpj(valor, { matriz = false, rotulo = "O CNPJ" } = {}) {
  const c = normalizarCnpj(valor);
  if (!c) return { valido: false, mensagem: `Informe ${rotulo.replace(/^O /, "o ")}.` };
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c)) return { valido: false, mensagem: `${rotulo} tem 14 posições: 12 letras ou números e 2 dígitos no fim.` };
  if (/^(.)\1{13}$/.test(c)) return { valido: false, mensagem: `${rotulo} não é válido.` };
  const d1 = digitoCnpj(c.slice(0, 12));
  const d2 = digitoCnpj(c.slice(0, 12) + d1);
  if (Number(c[12]) !== d1 || Number(c[13]) !== d2) return { valido: false, mensagem: `${rotulo} não confere (os dígitos verificadores estão errados).` };
  if (matriz && c.slice(8, 12) !== "0001") return { valido: false, mensagem: "A entidade vinculada é cadastrada pelo CNPJ da matriz (final 0001-xx), não de uma filial (Estatuto, Art. 64)." };
  return { valido: true, cnpj: c };
}
function formatarCnpj(c) {
  const s = String(c || "");
  return s.length === 14 ? `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}` : s;
}

// ---------------------------------------------------------------- tipos ----------------------------------------------------------------
function validarTipo(dados) {
  const d = dados && typeof dados === "object" && !Array.isArray(dados) ? dados : {};
  const nome = texto(d.nome, { minimo: 3, maximo: 80, rotulo: "O nome do tipo" });
  if (!nome.valido) return nome;
  const natureza = typeof d.natureza === "string" ? d.natureza.trim().toUpperCase() : "";
  if (!NATUREZAS[natureza]) return { valido: false, mensagem: "Escolha a natureza do tipo (assistência social, saúde, educação ou outra)." };
  const lista = d.formacoes == null ? [] : d.formacoes;
  if (!Array.isArray(lista)) return { valido: false, mensagem: "As formações aceitas são uma lista." };
  if (lista.length > 20) return { valido: false, mensagem: "No máximo 20 formações por tipo." };
  const formacoes = [];
  const vistas = new Set();
  for (const f of lista) {
    const t = texto(f, { minimo: 3, maximo: 80, rotulo: "Cada formação" });
    if (!t.valido) return t;
    const k = chaveDeComparacao(t.texto);
    if (vistas.has(k)) continue;
    vistas.add(k);
    formacoes.push(t.texto);
  }
  return { valido: true, dados: { nome: nome.texto, natureza, formacoes } };
}

// Reg. Art. 153: a formação do gestor técnico precisa ser uma das aceitas pelo tipo (nenhuma na lista = o tipo não tem exigência legal de formação).
function formacaoAtende(formacao, aceitas) {
  const lista = Array.isArray(aceitas) ? aceitas : [];
  if (lista.length === 0) return true;
  const k = chaveDeComparacao(formacao);
  return !!k && lista.some((a) => chaveDeComparacao(a) === k);
}
function mensagemFormacao(tipoNome, aceitas) {
  return `O gestor técnico de ${tipoNome} precisa ter a formação exigida por lei: ${aceitas.join(" ou ")} (Regimento, Art. 153).`;
}

// ---------------------------------------------------------------- entidade ----------------------------------------------------------------
function validarEntidade(dados, { edicao = false } = {}) {
  const d = dados && typeof dados === "object" && !Array.isArray(dados) ? dados : {};
  const razao = texto(d.razaoSocial, { minimo: 3, maximo: 150, rotulo: "A razão social" });
  if (!razao.valido) return razao;
  const fantasia = texto(d.nomeFantasia, { maximo: 100, rotulo: "O nome fantasia", obrigatorio: false });
  if (!fantasia.valido) return fantasia;
  const finalidade = texto(d.finalidade, { minimo: 10, maximo: 500, rotulo: "A finalidade", multilinha: true });
  if (!finalidade.valido) return finalidade;
  const municipio = texto(d.municipio, { maximo: 80, rotulo: "O município", obrigatorio: false });
  if (!municipio.valido) return municipio;
  const uf = d.uf == null || d.uf === "" ? null : (typeof d.uf === "string" ? d.uf.trim().toUpperCase() : "?");
  if (uf !== null && !UFS.includes(uf)) return { valido: false, mensagem: "UF inválida." };
  const tipoId = idDe(d.tipoId);
  if (!tipoId) return { valido: false, mensagem: "Escolha o tipo da entidade." };
  const saida = { razaoSocial: razao.texto, nomeFantasia: fantasia.texto, finalidade: finalidade.texto, municipio: municipio.texto, uf, tipoId };
  if (!edicao || (d.cnpj != null && d.cnpj !== "")) {
    const c = validarCnpj(d.cnpj, { matriz: true });
    if (!c.valido) return c;
    saida.cnpj = c.cnpj;
  }
  return { valido: true, dados: saida };
}

// ---------------------------------------------------------------- dirigentes ----------------------------------------------------------------
function validarIndicacao(dados, { hoje }) {
  const d = dados && typeof dados === "object" && !Array.isArray(dados) ? dados : {};
  const funcao = typeof d.funcao === "string" ? d.funcao.trim().toUpperCase() : "";
  if (!FUNCOES[funcao]) return { valido: false, mensagem: "Escolha a função." };
  const descricao = texto(d.funcaoDescricao, { minimo: 3, maximo: 80, rotulo: "O nome da função", obrigatorio: funcao === "OUTRA" });
  if (!descricao.valido) return descricao;
  const membroId = d.membroId == null || d.membroId === "" ? null : idDe(d.membroId);
  if (d.membroId != null && d.membroId !== "" && !membroId) return { valido: false, mensagem: "Matrícula inválida." };
  const externo = texto(d.nomeExterno, { minimo: 5, maximo: 120, rotulo: "O nome do profissional de fora", obrigatorio: false });
  if (!externo.valido) return externo;
  if (!!membroId === !!externo.texto) return { valido: false, mensagem: "Informe a matrícula do membro OU o nome do profissional de fora (Regimento, Art. 153), não os dois." };
  const formacao = texto(d.formacao, { minimo: 3, maximo: 80, rotulo: "A formação", obrigatorio: funcao === "GESTOR_TECNICO" });
  if (!formacao.valido) return formacao;
  const registro = texto(d.registroProfissional, { maximo: 40, rotulo: "O registro profissional", obrigatorio: false });
  if (!registro.valido) return registro;
  const ato = texto(d.indicacaoAto, { minimo: 3, maximo: 200, rotulo: "O ato de indicação do Pastor Presidente" });
  if (!ato.valido) return ato;
  const data = dataDoAto(d.indicadoEm, hoje, "a data da indicação");
  if (!data.valido) return data;
  let mandatoAte = null;
  if (d.mandatoAte != null && d.mandatoAte !== "") {
    const m = typeof d.mandatoAte === "string" ? d.mandatoAte.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m) || Number.isNaN(Date.parse(`${m}T00:00:00Z`)) || new Date(`${m}T00:00:00Z`).toISOString().slice(0, 10) !== m) return { valido: false, mensagem: "Data do fim do mandato inválida." };
    if (m <= data.data) return { valido: false, mensagem: "O fim do mandato vem depois da indicação." };
    if (m > "2100-12-31") return { valido: false, mensagem: "O fim do mandato está longe demais." };
    mandatoAte = m;
  }
  const remunerado = booleano(d.remunerado);
  return {
    valido: true,
    dados: {
      funcao, funcaoDescricao: funcao === "OUTRA" ? descricao.texto : null, membroId, nomeExterno: externo.texto, formacao: formacao.texto, registroProfissional: registro.texto,
      indicacaoAto: ato.texto, indicadoEm: data.data, mandatoAte, remunerado, declaracaoParentesco: booleano(d.declaracaoParentesco)
    }
  };
}

// Mandato com data vencida: aparece como vencido (não se fecha sozinho — o mesmo padrão das cadeiras dos órgãos).
function situacaoDirigente(linha, hoje) {
  if (linha.status === "HOMOLOGADO" && linha.mandatoAte && linha.mandatoAte < hoje) return "MANDATO_VENCIDO";
  return linha.status;
}

// ---------------------------------------------------------------- intervenção ----------------------------------------------------------------
function prazoRatificacao(decretadaEm) { return somarDias(decretadaEm, PRAZO_RATIFICACAO_DIAS); }
function diasEntre(deIso, ateIso) {
  return Math.round((Date.parse(`${String(ateIso).slice(0, 10)}T00:00:00Z`) - Date.parse(`${String(deIso).slice(0, 10)}T00:00:00Z`)) / 86400000);
}
// O estado de fato hoje: decretada com o prazo vencido sem ratificação já perdeu a eficácia, mesmo antes de a rotina marcar.
function estadoEfetivo(iv, hoje) {
  if (iv.status === "DECRETADA" && iv.prazoRatificacao && hoje > iv.prazoRatificacao) return "CADUCADA";
  return iv.status;
}
// Vale (afasta a diretoria e põe o interventor): decretada dentro do prazo ou ratificada (e ainda não encerrada).
function intervencaoVale(iv, hoje) {
  const e = estadoEfetivo(iv, hoje);
  return e === "DECRETADA" || e === "RATIFICADA";
}

function validarApuracao(dados) {
  const d = dados && typeof dados === "object" && !Array.isArray(dados) ? dados : {};
  const motivo = typeof d.motivo === "string" ? d.motivo.trim().toUpperCase() : "";
  if (!MOTIVOS_INTERVENCAO[motivo]) return { valido: false, mensagem: "Escolha o motivo da apuração (Regimento, Art. 47-A §1º)." };
  const fatos = texto(d.fatos, { minimo: 20, maximo: 2000, rotulo: "Os fatos que motivam a apuração", multilinha: true });
  if (!fatos.valido) return fatos;
  return { valido: true, dados: { motivo, fatos: fatos.texto } };
}

// A decretação: hoje, com a fundamentação; sem urgência, só depois dos 5 dias da notificação (Art. 65 §3º).
function validarDecretacao(dados, { iv, hoje }) {
  const d = dados && typeof dados === "object" && !Array.isArray(dados) ? dados : {};
  if (iv.status !== "APURACAO") return { valido: false, mensagem: "Só se decreta intervenção sobre uma apuração aberta (Regimento, Art. 47-A §1º)." };
  const fund = texto(d.fundamentacao, { minimo: 30, maximo: 2000, rotulo: "A fundamentação (os motivos técnicos, disciplinares ou de gestão)", multilinha: true });
  if (!fund.valido) return fund;
  const urgencia = booleano(d.urgencia);
  let justificativa = null;
  if (urgencia) {
    const j = texto(d.urgenciaJustificativa, { minimo: 20, maximo: 1000, rotulo: "A justificativa da urgência (o risco iminente ao patrimônio ou à continuidade dos serviços)", multilinha: true });
    if (!j.valido) return j;
    justificativa = j.texto;
  } else {
    if (!iv.notificadoEm) return { valido: false, mensagem: "Antes de decretar, o gestor precisa ser notificado por escrito e ter 5 dias para se manifestar (Estatuto, Art. 65 §3º) — ou marque a urgência, com a justificativa." };
    const libera = decretavelDesde(iv.notificadoEm);
    if (hoje < libera) return { valido: false, mensagem: `O gestor pode se manifestar até ${br(manifestacaoAte(iv.notificadoEm))} (5 dias desde a notificação, Estatuto, Art. 65 §3º). Sem urgência, a decretação só a partir de ${br(libera)}.` };
  }
  const interventorMembroId = d.interventorMembroId == null || d.interventorMembroId === "" ? null : idDe(d.interventorMembroId);
  if (d.interventorMembroId != null && d.interventorMembroId !== "" && !interventorMembroId) return { valido: false, mensagem: "Matrícula do interventor inválida." };
  const interventorNome = texto(d.interventorNome, { minimo: 5, maximo: 120, rotulo: "O nome do interventor", obrigatorio: false });
  if (!interventorNome.valido) return interventorNome;
  if (!!interventorMembroId === !!interventorNome.texto) return { valido: false, mensagem: "Informe o interventor: a matrícula do membro OU o nome do profissional de fora." };
  return {
    valido: true,
    dados: { fundamentacao: fund.texto, urgencia, urgenciaJustificativa: justificativa, interventorMembroId, interventorNome: interventorNome.texto, afastaDiretoria: booleano(d.afastaDiretoria),
      decretadaEm: hoje, prazoRatificacao: prazoRatificacao(hoje) }
  };
}

// A reunião da CLI que ratifica (ou não) tem de estar entre a decretação e o 15º dia.
function reuniaoNoPrazo(reuniaoData, iv) {
  return !!reuniaoData && reuniaoData >= iv.decretadaEm && reuniaoData <= iv.prazoRatificacao;
}

// ---------------------------------------------------------------- prestação de contas ----------------------------------------------------------------
function ultimoDiaDoMes(ano, mes) { return new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10); }
function codigoDoPeriodo(periodicidade, ano, indice) {
  if (periodicidade === "ANUAL") return String(ano);
  return `${ano}-${periodicidade === "SEMESTRAL" ? "S" : "T"}${indice}`;
}
// O período (início, fim e prazo de entrega) a partir do código; null se o código não é desta periodicidade.
function periodoDoCodigo(codigo, periodicidade, prazoDias) {
  const c = typeof codigo === "string" ? codigo.trim().toUpperCase() : "";
  let ano, indice;
  if (periodicidade === "ANUAL") { if (!/^\d{4}$/.test(c)) return null; ano = Number(c); indice = 1; }
  else {
    const m = /^(\d{4})-([ST])([1-4])$/.exec(c);
    if (!m || m[2] !== (periodicidade === "SEMESTRAL" ? "S" : "T")) return null;
    ano = Number(m[1]); indice = Number(m[3]);
    if (periodicidade === "SEMESTRAL" && indice > 2) return null;
  }
  if (ano < 2000 || ano > 2100) return null;
  const meses = MESES_DO_PERIODO[periodicidade];
  const mesInicio = (indice - 1) * meses + 1;
  const inicio = `${ano}-${String(mesInicio).padStart(2, "0")}-01`;
  const fim = ultimoDiaDoMes(ano, mesInicio + meses - 1);
  return { codigo: c, inicio, fim, prazo: somarDias(fim, prazoDias) };
}
// Todos os períodos desde o do vínculo até o que contém hoje (o corrente entra também: ainda não deve nada).
function periodosDesde(vinculoEm, periodicidade, prazoDias, hoje) {
  if (!vinculoEm || !MESES_DO_PERIODO[periodicidade]) return [];
  const meses = MESES_DO_PERIODO[periodicidade];
  let ano = Number(vinculoEm.slice(0, 4));
  let indice = Math.floor((Number(vinculoEm.slice(5, 7)) - 1) / meses) + 1;
  const lista = [];
  for (let guarda = 0; guarda < 500; guarda++) {
    const p = periodoDoCodigo(codigoDoPeriodo(periodicidade, ano, indice), periodicidade, prazoDias);
    if (!p || p.inicio > hoje) break;
    lista.push(p);
    indice++;
    if (indice > 12 / meses) { indice = 1; ano++; }
  }
  return lista;
}
// A situação de cada período: EM_CURSO (ainda não acabou), NO_PRAZO (acabou, prazo correndo), ATRASADA (prazo vencido sem entrega), ENTREGUE, APRECIADA.
// Mesmo mecanismo da v5.4: calculado na leitura, nada a fechar à mão.
function situacaoDosPeriodos(periodos, prestacoes, hoje) {
  const porCodigo = new Map((prestacoes || []).map((p) => [p.periodo, p]));
  return periodos.map((p) => {
    const reg = porCodigo.get(p.codigo) || null;
    let situacao;
    if (reg) situacao = reg.resultado ? "APRECIADA" : "ENTREGUE";
    else if (hoje <= p.fim) situacao = "EM_CURSO";
    else if (hoje <= p.prazo) situacao = "NO_PRAZO";
    else situacao = "ATRASADA";
    // Art. 66 §3º: o período que fecha o ano pede a verificação anual do Conselho Fiscal
    const fechaAno = p.fim.slice(5) === "12-31";
    return { ...p, situacao, fechaAno, cfPendente: !!(reg && fechaAno && !reg.cfResultado), prestacao: reg };
  });
}
const ROTULO_SITUACAO_PERIODO = { EM_CURSO: "Em curso", NO_PRAZO: "Prazo de entrega correndo", ATRASADA: "Atrasada", ENTREGUE: "Entregue (aguardando a CLI)", APRECIADA: "Apreciada pela CLI" };

function validarEntrega(dados, { periodo, hoje }) {
  const d = dados && typeof dados === "object" && !Array.isArray(dados) ? dados : {};
  const data = dataDoAto(d.entregueEm, hoje, "a data da entrega");
  if (!data.valido) return data;
  if (data.data <= periodo.fim) return { valido: false, mensagem: "A prestação de contas é entregue depois do fim do período." };
  if (!booleano(d.relatorioAtividades)) return { valido: false, mensagem: "A prestação de contas leva o Relatório de Atividades (Estatuto, Art. 67)." };
  if (!booleano(d.balancoAuditado)) return { valido: false, mensagem: "A prestação de contas leva o Balanço Financeiro auditado (Estatuto, Art. 67)." };
  const orgao = texto(d.auditoriaOrgao, { minimo: 3, maximo: 150, rotulo: "Quem auditou o balanço (o órgão de fiscalização da própria entidade, Art. 61, II)" });
  if (!orgao.valido) return orgao;
  const obs = texto(d.observacao, { maximo: 1000, rotulo: "A observação", obrigatorio: false, multilinha: true });
  if (!obs.valido) return obs;
  return { valido: true, dados: { entregueEm: data.data, auditoriaOrgao: orgao.texto, observacao: obs.texto } };
}

// ---------------------------------------------------------------- extinção ----------------------------------------------------------------
function validarExtincao(dados, { natureza }) {
  const d = dados && typeof dados === "object" && !Array.isArray(dados) ? dados : {};
  const destino = typeof d.destinoPatrimonio === "string" ? d.destinoPatrimonio.trim().toUpperCase() : "";
  const regra = DESTINOS[destino];
  if (!regra) return { valido: false, mensagem: "Escolha o destino do patrimônio (Estatuto, Art. 68)." };
  if (!regra.naturezas.includes(natureza)) return { valido: false, mensagem: `Esse destino não serve para uma entidade de ${NATUREZAS[natureza] ? NATUREZAS[natureza].toLowerCase() : "outra natureza"} (Estatuto, Art. 68).` };
  if (destino === "SAUDE_MATRIZ_ASSISTENCIAL" && !booleano(d.matrizMantemAssistencia)) {
    return { valido: false, mensagem: "Os bens de saúde só voltam à Matriz se a IEADESPA mantiver atividade assistencial do mesmo tipo (Art. 68, I): confirme." };
  }
  const nome = texto(d.destinatarioNome, { minimo: 3, maximo: 150, rotulo: destino === "SAUDE_MATRIZ_ASSISTENCIAL" ? "A atividade assistencial da Matriz que recebe" : "Quem recebe o patrimônio" });
  if (!nome.valido) return nome;
  let destinatarioCnpj = null;
  if (d.destinatarioCnpj != null && d.destinatarioCnpj !== "") {
    const c = validarCnpj(d.destinatarioCnpj, { rotulo: "O CNPJ de quem recebe" });
    if (!c.valido) return c;
    destinatarioCnpj = c.cnpj;
  }
  const bens = texto(d.bensComodato, { maximo: 1000, rotulo: "Os bens da Matriz cedidos em comodato", obrigatorio: false, multilinha: true });
  if (!bens.valido) return bens;
  return { valido: true, dados: { destinoPatrimonio: destino, destinatarioNome: nome.texto, destinatarioCnpj, bensComodato: bens.texto } };
}

// ---------------------------------------------------------------- pendências e avisos ----------------------------------------------------------------
function br(iso) { return iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : ""; }
function textoPrazoIntervencao({ entidade, prazo, hoje }) {
  const faltam = diasEntre(hoje, prazo);
  const quando = faltam <= 0 ? "vence HOJE" : (faltam === 1 ? "vence amanhã" : `faltam ${faltam} dias (até ${br(prazo)})`);
  return `A intervenção em ${entidade} ainda não foi ratificada pela CLI: o prazo fatal ${quando}. Sem a ratificação dentro dos 15 dias, ela perde a eficácia (Regimento, Art. 47-A §2º).`;
}
function textoDecretada({ entidade, prazo }) {
  return `O Pastor Presidente decretou intervenção em ${entidade}. A CLI precisa ratificá-la até ${br(prazo)}, sob pena de perda de eficácia (Regimento, Art. 47-A §2º).`;
}
function textoCaducada({ entidade, prazo }) {
  return `A intervenção em ${entidade} perdeu a eficácia: a CLI não a ratificou até ${br(prazo)} (Regimento, Art. 47-A §2º). A diretoria afastada volta; uma nova intervenção exige nova decretação.`;
}
function textoPrestacaoAtrasada({ entidade, periodos }) {
  const lista = (periodos || []).map((p) => `${p.codigo} (venceu em ${br(p.prazo)})`).join(", ");
  return `A prestação de contas de ${entidade} está atrasada: ${lista}. Ainda não foi entregue à CLI (Estatuto, Art. 67).`;
}
function textoCorrigida({ entidade, reuniao }) {
  return `A intervenção em ${entidade}, dada como caducada, foi corrigida: a CLI a ratificou na reunião de ${br(reuniao)}, dentro do prazo de 15 dias (Regimento, Art. 47-A §2º). A diretoria de antes da decretação foi destituída.`;
}

module.exports = {
  NATUREZAS, STATUS_ENTIDADE, FUNCOES, FUNCOES_UNICAS, STATUS_DIRIGENTE, MOTIVOS_ENCERRAMENTO, MOTIVOS_ENCERRAMENTO_MANUAL, MOTIVOS_INTERVENCAO, STATUS_INTERVENCAO, EM_CURSO,
  PERIODICIDADES, RESULTADOS_APRECIACAO, RESULTADOS_CF, RESULTADOS_AG, DESTINOS, PRAZO_RATIFICACAO_DIAS, PRAZO_MANIFESTACAO_DIAS, PRAZO_ENTREGA_PADRAO, UFS,
  ROTULO_SITUACAO_PERIODO, PRAZO_CORRECAO_CADUCIDADE_DIAS, manifestacaoAte, decretavelDesde, textoCorrigida,
  texto, idDe, booleano, chaveDeComparacao, normalizarCnpj, validarCnpj, formatarCnpj, validarTipo, formacaoAtende, mensagemFormacao, validarEntidade, validarIndicacao,
  situacaoDirigente, prazoRatificacao, diasEntre, estadoEfetivo, intervencaoVale, validarApuracao, validarDecretacao, reuniaoNoPrazo, periodoDoCodigo, periodosDesde,
  situacaoDosPeriodos, validarEntrega, validarExtincao, br, textoPrazoIntervencao, textoDecretada, textoCaducada, textoPrestacaoAtrasada, somarDias, dataDoAto
};
