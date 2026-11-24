// shared/importacaoMembros.js (FASE 10, v10.1e, passo 9 de Membros, 21/11/2026; migração 185) — a IMPORTAÇÃO dos membros do sistema pago: as regras PURAS
// (sem banco; quem lê e grava é shared/importacaoMembrosDb.js).
//
// Decisões do responsável (18/11/2026):
//  - o arquivo: CSV com ';' e o cabeçalho MATRÍCULA;NOME;IGREJA;SEXO;NASCIMENTO;ESTADO CIVIL;E-MAIL;CELULAR;MÃE;PAI;CPF. A IGREJA vem "IEADESPA - <nome>";
//    o SEXO, FEMININO ou MASCULINO; o ESTADO CIVIL usa ".: NAO INFORMADO :." para vazio; há linhas incompletas; existe a matrícula 0;
//  - "IEADESPA - GERAL" é um cadastro errado (o da matrícula 0): entra SEM congregação;
//  - o arrolamento NÃO vem: quem entra fica com "Arrolamento a completar" (sem voto) e a pendência ARROLAMENTO — isso é do banco (importacaoMembrosDb.js);
//  - COLUNAS EXTRAS: reconhecidas pelo nome (sem acento, maiúscula ou pontuação), as desconhecidas ignoradas e mostradas; (23/11, a tela r27) a Secretaria
//    Geral pode trocar o campo de cada coluna, ou "não usar" (a escolha vem na prévia e é conferida aqui: mapearColunas);
//  - (22/11/2026) UMA VEZ SÓ, sem tela de diferenças. A matrícula do sistema pago é mantida; a repetida no arquivo ou zerada (vazia, que não é número)
//    entra com a próxima do sistema e a pendência NUMERO; a possível repetida (o mesmo CPF ou o mesmo nome e nascimento de outra linha ou ficha — a tela r27 —,
//    ou a mesma matrícula e a mesma pessoa no arquivo) entra com a pendência REPETIDA, para a secretaria juntar as fichas (ou dizer que não são a mesma);
//  - (22/11/2026, as regras da rodada 28) a matrícula que JÁ É de uma ficha do sistema (hoje só a 1 e a 2, completadas à mão) FICA DE FORA: a linha não entra
//    (o problema MATRICULA_JA_EXISTE) e a prévia mostra quantas são.
//
// O caminho: lerCsv (o texto vira linhas de células) → mapearColunas (cada coluna vira um campo, ou é ignorada) → lerLinha (cada linha vira os dados da ficha,
// com os PROBLEMAS — a linha não entra — e os AVISOS — a linha entra, sem o que estava errado) → classificar (com o que o banco já tem: a ficha da mesma
// matrícula, a ficha do mesmo CPF) → resumir (os números da prévia e os avisos gerais, sem dado pessoal).
const ficha = require("./fichaMembro");
const pre = require("./preCadastro");

const LIMITE_TEXTO = 8 * 1024 * 1024;   // 8 milhões de letras (o arquivo real tem uns 5 mil membros: ~1 milhão)
const LIMITE_LINHAS = 20000;
const SALTO_MATRICULA = 1000;           // um salto maior que este entre duas matrículas seguidas do arquivo é "fora da sequência"

// ------------------------------------------------------------------ o texto do arquivo
// "Mãe" -> "MAE"; "E-mail" -> "E MAIL"; "Nº Matrícula" -> "N MATRICULA": sem acento, maiúscula, só letras e números com um espaço entre eles.
function chave(texto) {
  return String(texto == null ? "" : texto).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

// O separador do arquivo: o que mais aparece no cabeçalho (fora de aspas), entre ';', ',' e tabulação. Empate ou nenhum: ';' (o do sistema pago).
function separadorDe(primeiraLinha) {
  const conta = { ";": 0, ",": 0, "\t": 0 };
  let aspas = false;
  for (const ch of primeiraLinha) {
    if (ch === "\"") aspas = !aspas;
    else if (!aspas && Object.prototype.hasOwnProperty.call(conta, ch)) conta[ch]++;
  }
  if (conta[";"] >= conta[","] && conta[";"] >= conta["\t"]) return ";";
  return conta["\t"] > conta[","] ? "\t" : ",";
}

// Lê o CSV (RFC 4180): campos entre aspas podem ter o separador, quebra de linha e aspas dobradas (""). Aceita CRLF, LF e a marca BOM do começo.
// Devolve { separador, linhas: [{ numero, celulas }], aspas } — numero é a linha do arquivo onde o registro COMEÇA (o cabeçalho é a 1). aspas (revisão de
// 23/11, I1): o primeiro campo entre aspas que passou para a linha de baixo ({ linha onde a aspa abriu, fechou }), ou null. Uma aspa sem fechar engolia as
// linhas seguintes num campo só, e as pessoas sumiam da prévia sem aviso; quem recusa o arquivo é prepararArquivo.
function lerCsv(texto) {
  let t = String(texto == null ? "" : texto);
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  const fimPrimeira = t.search(/\r?\n/);
  const separador = separadorDe(fimPrimeira < 0 ? t : t.slice(0, fimPrimeira));
  const linhas = [];
  let celulas = [], campo = "", aspas = false, numero = 1, inicio = 1, i = 0, abriu = 0, quebra = null;
  const fecharCampo = () => { celulas.push(campo); campo = ""; };
  const fecharLinha = () => { fecharCampo(); linhas.push({ numero: inicio, celulas }); celulas = []; };
  while (i < t.length) {
    const ch = t[i];
    if (aspas) {
      if (ch === "\"") {
        if (t[i + 1] === "\"") { campo += "\""; i += 2; continue; }
        aspas = false; i++; continue;
      }
      if (ch === "\n" || (ch === "\r" && t[i + 1] !== "\n")) { numero++; if (!quebra) quebra = { linha: abriu, fechou: false }; }
      campo += ch; i++; continue;
    }
    if (ch === "\"" && campo.trim() === "") { campo = ""; aspas = true; abriu = numero; i++; continue; }
    if (ch === separador) { fecharCampo(); i++; continue; }
    if (ch === "\r" && t[i + 1] === "\n") { i++; continue; }
    if (ch === "\n" || ch === "\r") { fecharLinha(); numero++; inicio = numero; i++; continue; }
    campo += ch; i++;
  }
  if (campo !== "" || celulas.length) fecharLinha();
  // fechou = a aspa que atravessou a linha fechou depois (não é a que ficou aberta até o fim do arquivo)
  if (quebra && !(aspas && abriu === quebra.linha)) quebra.fechou = true;
  return { separador, linhas, aspas: quebra };
}

// ------------------------------------------------------------------ as colunas
// Cada campo da ficha e os nomes de coluna que o representam (já passados por chave()). As 11 do sistema pago primeiro; depois as da planilha mais completa
// que ele pode trazer (decisão 3: a data e a forma de entrada, o batismo, a escolaridade).
const COLUNAS = Object.freeze([
  { campo: "matricula", rotulo: "Matrícula", nomes: ["MATRICULA", "N MATRICULA", "NO MATRICULA", "NUMERO DA MATRICULA", "MATRICULA DO MEMBRO"], padrao: true, obrigatoria: true },
  { campo: "nome", rotulo: "Nome", nomes: ["NOME", "NOME COMPLETO", "NOME DO MEMBRO"], padrao: true, obrigatoria: true },
  { campo: "igreja", rotulo: "Congregação", nomes: ["IGREJA", "CONGREGACAO", "CONGREGACAO ATUAL"], padrao: true },
  { campo: "sexo", rotulo: "Sexo", nomes: ["SEXO"], padrao: true },
  { campo: "nascimento", rotulo: "Nascimento", nomes: ["NASCIMENTO", "DATA DE NASCIMENTO", "DATA NASCIMENTO", "DT NASCIMENTO", "DATA NASC"], padrao: true },
  { campo: "estadoCivil", rotulo: "Estado civil", nomes: ["ESTADO CIVIL", "EST CIVIL"], padrao: true },
  { campo: "email", rotulo: "E-mail", nomes: ["E MAIL", "EMAIL"], padrao: true },
  { campo: "celular", rotulo: "Celular", nomes: ["CELULAR", "TELEFONE", "FONE", "TELEFONE CELULAR", "WHATSAPP"], padrao: true },
  { campo: "mae", rotulo: "Mãe", nomes: ["MAE", "NOME DA MAE", "FILIACAO MAE"], padrao: true },
  { campo: "pai", rotulo: "Pai", nomes: ["PAI", "NOME DO PAI", "FILIACAO PAI"], padrao: true },
  { campo: "cpf", rotulo: "CPF", nomes: ["CPF", "N CPF", "NUMERO DO CPF"], padrao: true },
  { campo: "admissao", rotulo: "Data de entrada", nomes: ["ADMISSAO", "DATA DE ADMISSAO", "DATA ADMISSAO", "MEMBRO DESDE", "DATA DE ENTRADA", "DATA DO ARROLAMENTO", "DATA DE ARROLAMENTO"] },
  { campo: "formaAdmissao", rotulo: "Forma de entrada", nomes: ["FORMA DE ADMISSAO", "TIPO DE ADMISSAO", "FORMA DE ENTRADA", "TIPO DE ARROLAMENTO", "FORMA DE ARROLAMENTO", "ARROLAMENTO"] },
  { campo: "batismo", rotulo: "Batismo nas águas", nomes: ["BATISMO", "DATA DE BATISMO", "DATA DO BATISMO", "DATA BATISMO", "BATISMO NAS AGUAS"] },
  { campo: "escolaridade", rotulo: "Escolaridade", nomes: ["ESCOLARIDADE", "GRAU DE INSTRUCAO", "INSTRUCAO"] }
]);
const CAMPO_POR_NOME = new Map(COLUNAS.flatMap((c) => c.nomes.map((n) => [n, c])));
const CAMPO_POR_CODIGO = new Map(COLUNAS.map((c) => [c.campo, c]));
// o catálogo para a tela (o select de cada coluna): o campo, o rótulo e se é uma das 11 colunas de sempre do sistema pago (a outra é "a mais")
const CAMPOS = Object.freeze(COLUNAS.map((c) => Object.freeze({ campo: c.campo, rotulo: c.rotulo, padrao: c.padrao === true })));

// O cabeçalho vira o mapa { campo: índice da coluna }. A coluna desconhecida é ignorada (e mostrada); a segunda coluna do mesmo campo também.
// `escolha` (a tela, 23/11): um campo (ou null = "não usar") para CADA coluna do cabeçalho, na ordem; substitui o reconhecimento pelo nome. Escolha que não bate com
// o arquivo (outro número de colunas, campo que não existe, o mesmo campo em duas colunas) devolve { erro }. Sem matrícula ou sem nome, o arquivo não serve.
// `lista`: todas as colunas do cabeçalho, na ordem, com o campo ligado (ou null) — é o mapa que a tela mostra.
function mapearColunas(cabecalho, escolha) {
  const mapa = Object.create(null);
  const reconhecidas = [], ignoradas = [], lista = [];
  const cab = cabecalho || [];
  if (escolha != null) {
    if (!Array.isArray(escolha) || escolha.length !== cab.length) return { erro: "O mapa das colunas não bate com este arquivo. Escolha o arquivo de novo." };
    for (const campo of escolha) {
      if (campo === null) continue;
      if (typeof campo !== "string" || !CAMPO_POR_CODIGO.has(campo)) return { erro: "O mapa das colunas tem um campo que não existe. Escolha o arquivo de novo." };
    }
  }
  cab.forEach((bruto, indice) => {
    const nome = String(bruto == null ? "" : bruto).trim().slice(0, 80);
    const c = escolha != null ? (escolha[indice] === null ? null : CAMPO_POR_CODIGO.get(escolha[indice])) : CAMPO_POR_NOME.get(chave(nome));
    let motivo = null;
    if (!c) motivo = escolha != null ? "não usar" : "desconhecida";
    else if (mapa[c.campo] !== undefined) motivo = `repetida (já há a coluna de ${c.rotulo.toLowerCase()})`;
    if (motivo) {
      if (escolha != null && c) return;   // o mesmo campo em duas colunas: tratado abaixo (erro)
      if (nome || escolha != null) ignoradas.push({ indice, coluna: nome, motivo });
      lista.push({ indice, coluna: nome, campo: null });
      return;
    }
    mapa[c.campo] = indice;
    reconhecidas.push({ indice, coluna: nome, campo: c.campo, rotulo: c.rotulo });
    lista.push({ indice, coluna: nome, campo: c.campo });
  });
  if (escolha != null) {
    const usados = escolha.filter((x) => x !== null);
    const dobrado = usados.find((x, i) => usados.indexOf(x) !== i);
    if (dobrado) return { erro: `Duas colunas estão ligadas ao mesmo campo (${CAMPO_POR_CODIGO.get(dobrado).rotulo.toLowerCase()}). Escolha “não usar” em uma delas.` };
  }
  const faltando = COLUNAS.filter((c) => c.obrigatoria && mapa[c.campo] === undefined).map((c) => c.rotulo);
  return { mapa, reconhecidas, ignoradas, faltando, lista };
}

// ------------------------------------------------------------------ os valores de cada célula
// As datas: dd/mm/aaaa (também d/m/aaaa e com "-" ou "."), com ou sem a hora; aaaa-mm-dd. Devolve AAAA-MM-DD ou null (vazio) ou false (inválida).
function lerData(v, hojeISO) {
  const t = String(v == null ? "" : v).trim();
  if (!t) return null;
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T].*)?$/.exec(t);
  let iso = null;
  if (m) iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  else if ((m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/.exec(t))) iso = `${m[1]}-${m[2]}-${m[3]}`;
  if (!iso || !pre.dataNoCalendario(iso)) return false;
  if (iso < "1900-01-01" || (hojeISO && iso > hojeISO)) return false;
  return iso;
}

// O sexo: FEMININO/F e MASCULINO/M. Vazio -> null; outro -> false.
function lerSexo(v) {
  const k = chave(v);
  if (!k) return null;
  if (k === "F" || k === "FEMININO") return "F";
  if (k === "M" || k === "MASCULINO") return "M";
  return false;
}

// O estado civil do sistema pago ("SOLTEIRO(A)", "CASADA", ".: NAO INFORMADO :.") -> o código da ficha. Não informado -> null; desconhecido -> false.
function lerEstadoCivil(v) {
  const k = chave(v);
  if (!k || k === "NAO INFORMADO") return null;
  if (k.startsWith("SOLTEIR")) return "SOLTEIRO";
  if (k.startsWith("CASAD")) return "CASADO";
  if (k.startsWith("VIUV")) return "VIUVO";
  if (k.startsWith("DIVORCIAD")) return "DIVORCIADO";
  if (k === "UNIAO ESTAVEL" || k.startsWith("UNIAO ESTAVEL ")) return "UNIAO_ESTAVEL";
  return false;
}

// A forma de entrada (as da ficha: edicaoFicha.js). Vazio -> null; desconhecida -> false.
function lerFormaAdmissao(v) {
  const k = chave(v);
  if (!k) return null;
  if (k.startsWith("BATISMO")) return "BATISMO";
  if (k.startsWith("CARTA")) return "CARTA_MUDANCA";
  if (k.startsWith("RECONCILIA")) return "RECONCILIACAO";
  if (k.startsWith("ACLAMA")) return "ACLAMACAO";
  return false;
}

// A escolaridade, pelo rótulo ("Médio completo") ou pelo código ("MEDIO_COMPLETO"). Vazio -> null; desconhecida -> false.
const ESCOLARIDADE_POR_CHAVE = new Map(ficha.ESCOLARIDADES.flatMap((e) => [[chave(e.rotulo), e.codigo], [chave(e.codigo), e.codigo]]));
function lerEscolaridade(v) {
  const k = chave(v);
  if (!k) return null;
  return ESCOLARIDADE_POR_CHAVE.get(k) || false;
}

// O CPF: só os dígitos; o zero da frente que a planilha comeu (8 a 10 dígitos) volta, e o número tem de ser válido pelos dígitos. Vazio -> null; inválido -> false.
function lerCpf(v) {
  const d = ficha.soDigitos(String(v == null ? "" : v).trim());
  if (!d) return null;
  if (d.length < 8 || d.length > 11) return false;
  const cpf = d.padStart(11, "0");
  return ficha.cpfValido(cpf) ? cpf : false;
}

// O celular: com DDD (10 ou 11 números); o +55 da frente sai. Vazio -> null; inválido -> false.
function lerCelular(v) {
  let d = String(v == null ? "" : v).replace(/\D/g, "");
  if (!d) return null;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  const r = pre.lerTelefone(d);
  return r.ok && r.valor ? r.valor : false;
}

// A matrícula: número inteiro positivo (zeros à esquerda saem). 0 -> { zero }; vazia -> { vazia }; outro texto -> { invalida }.
function lerMatricula(v) {
  const t = String(v == null ? "" : v).trim();
  if (!t) return { vazia: true, texto: "" };
  if (!/^\d{1,9}$/.test(t)) return { invalida: true, texto: t.slice(0, 20) };
  const n = Number(t);
  return n === 0 ? { zero: true, texto: t } : { numero: n, texto: t };
}

// A congregação do arquivo: "IEADESPA - Vila Nova" -> "VILA NOVA" (a chave). "IEADESPA - GERAL" e vazio -> sem congregação (decisão 1).
const PREFIXO_IGREJA = /^\s*IEADESPA\s*[-–—:]\s*/i;
function chaveDaIgreja(v) {
  const t = String(v == null ? "" : v).trim();
  return chave(t.replace(PREFIXO_IGREJA, ""));
}

// ------------------------------------------------------------------ os motivos (o que a tela e a lista para baixar mostram)
const PROBLEMAS = Object.freeze({
  SEM_NOME: "Sem nome",
  NOME_INVALIDO: "O nome tem caracteres que não podem ser usados ou passa de 200 letras",
  CONGREGACAO_NAO_ENCONTRADA: "A congregação não existe no sistema (confira o nome)",
  CONGREGACAO_INATIVA: "A congregação está desativada no sistema",
  CONGREGACAO_AMBIGUA: "Duas congregações do sistema têm esse nome",
  COLUNAS_A_MAIS: "A linha tem mais colunas que o cabeçalho (um ';' no meio de um nome?)",
  MATRICULA_JA_EXISTE: "A matrícula já é de uma ficha do sistema: fica de fora (essa ficha se completa à mão)",
  // na hora de gravar (não na prévia): o banco recusou a linha sempre, e o resto da importação seguiu sem ela (shared/importacaoMembrosDb.js, revisão de 23/11)
  ERRO_AO_GRAVAR: "O sistema não conseguiu gravar esta linha na importação: ficou de fora (confira os dados e cadastre à mão)",
  // a importação que parou e passou do prazo da guarda dos dados (G2, revisão de 24/11): a rotina deixa de fora as linhas que faltavam (importacaoMembrosDb)
  NAO_TERMINOU: "A importação parou e não terminou no prazo da guarda dos dados: esta linha ficou de fora (cadastre à mão)"
});
const AVISOS = Object.freeze({
  SEM_CONGREGACAO: "Entra sem congregação (no arquivo: GERAL ou vazio)",
  MATRICULA_ZERO: "Matrícula 0: entra com a próxima matrícula do sistema",
  SEM_MATRICULA: "Sem matrícula: entra com a próxima matrícula do sistema",
  MATRICULA_INVALIDA: "A matrícula não é um número: entra com a próxima do sistema",
  MATRICULA_REPETIDA_NO_ARQUIVO: "A mesma matrícula de outra linha do arquivo: entra com a próxima do sistema",
  MESMA_PESSOA_NO_ARQUIVO: "Parece a mesma pessoa de outra linha do arquivo (a mesma matrícula): marcada como possível ficha repetida",
  CPF_REPETIDO_NO_ARQUIVO: "O mesmo CPF de outra linha do arquivo: entra sem o CPF, marcada como possível ficha repetida",
  CPF_EM_OUTRA_FICHA: "O CPF já está em outra ficha do sistema: entra sem o CPF, marcada como possível ficha repetida",
  NOME_NASCIMENTO_NO_ARQUIVO: "O mesmo nome e nascimento de outra linha do arquivo: marcada como possível ficha repetida",
  NOME_NASCIMENTO_EM_OUTRA_FICHA: "O mesmo nome e nascimento de uma ficha do sistema: marcada como possível ficha repetida",
  CPF_INVALIDO: "CPF inválido: entra sem o CPF",
  NASCIMENTO_INVALIDO: "Data de nascimento inválida: entra sem ela",
  SEXO_DESCONHECIDO: "Sexo não reconhecido: entra sem ele",
  ESTADO_CIVIL_DESCONHECIDO: "Estado civil não reconhecido: entra sem ele",
  EMAIL_INVALIDO: "E-mail inválido: entra sem ele",
  CELULAR_INVALIDO: "Celular inválido (com DDD, 10 ou 11 números): entra sem ele",
  MAE_INVALIDA: "Nome da mãe inválido: entra sem ele",
  PAI_INVALIDO: "Nome do pai inválido: entra sem ele",
  ADMISSAO_INVALIDA: "Data de entrada inválida: entra sem ela",
  FORMA_ADMISSAO_DESCONHECIDA: "Forma de entrada não reconhecida: entra sem ela",
  BATISMO_INVALIDO: "Data de batismo inválida: entra sem ela",
  ESCOLARIDADE_DESCONHECIDA: "Escolaridade não reconhecida: entra sem ela"
});
const textoDe = (codigo) => PROBLEMAS[codigo] || AVISOS[codigo] || codigo;

// ------------------------------------------------------------------ uma linha
// celulas: as células da linha; mapa: o de mapearColunas; congregacoes: Map(chave do nome -> [{ congregacaoId, nome, ativa }]); hojeISO: para as datas.
// Devolve { dados, matricula: { numero | zero | vazia | invalida, texto }, problemas: [], avisos: [] }.
function lerLinha(celulas, mapa, { congregacoes, hojeISO, colunasCabecalho }) {
  const cel = (campo) => (mapa[campo] === undefined ? "" : String(celulas[mapa[campo]] == null ? "" : celulas[mapa[campo]]).trim());
  const problemas = [], avisos = [];
  const dados = {};

  if (colunasCabecalho && celulas.length > colunasCabecalho && celulas.slice(colunasCabecalho).some((c) => String(c).trim() !== "")) problemas.push("COLUNAS_A_MAIS");

  const nome = pre.lerNome(cel("nome").replace(/\s+/g, " "));
  if (!nome.ok) problemas.push("NOME_INVALIDO");
  else if (!nome.valor) problemas.push("SEM_NOME");
  dados.nome = nome.ok ? nome.valor : null;

  const matricula = lerMatricula(cel("matricula"));

  dados.igrejaArquivo = cel("igreja").slice(0, 150) || null;
  dados.congregacaoId = null;
  const k = chaveDaIgreja(cel("igreja"));
  if (!k || k === "GERAL") avisos.push("SEM_CONGREGACAO");
  else {
    const achadas = (congregacoes && congregacoes.get(k)) || [];
    if (!achadas.length) problemas.push("CONGREGACAO_NAO_ENCONTRADA");
    else if (achadas.length > 1) problemas.push("CONGREGACAO_AMBIGUA");
    else if (!achadas[0].ativa) problemas.push("CONGREGACAO_INATIVA");
    else dados.congregacaoId = achadas[0].congregacaoId;
  }

  const valor = (lido, aviso) => { if (lido === false) { avisos.push(aviso); return null; } return lido; };
  dados.sexo = valor(lerSexo(cel("sexo")), "SEXO_DESCONHECIDO");
  dados.dataNascimento = valor(lerData(cel("nascimento"), hojeISO), "NASCIMENTO_INVALIDO");
  dados.estadoCivil = valor(lerEstadoCivil(cel("estadoCivil")), "ESTADO_CIVIL_DESCONHECIDO");
  const email = pre.lerEmail(cel("email"));
  dados.email = email.ok ? email.valor : valor(false, "EMAIL_INVALIDO");
  dados.telefone = valor(lerCelular(cel("celular")), "CELULAR_INVALIDO");
  const mae = ficha.lerNomeFiliacao(cel("mae"), "da mãe");
  dados.nomeMae = mae.ok ? mae.nome : valor(false, "MAE_INVALIDA");
  const pai = ficha.lerNomeFiliacao(cel("pai"), "do pai");
  dados.nomePai = pai.ok ? pai.nome : valor(false, "PAI_INVALIDO");
  dados.cpf = valor(lerCpf(cel("cpf")), "CPF_INVALIDO");
  dados.dataAdmissao = valor(lerData(cel("admissao"), hojeISO), "ADMISSAO_INVALIDA");
  dados.formaAdmissao = valor(lerFormaAdmissao(cel("formaAdmissao")), "FORMA_ADMISSAO_DESCONHECIDA");
  dados.dataBatismo = valor(lerData(cel("batismo"), hojeISO), "BATISMO_INVALIDO");
  dados.escolaridade = valor(lerEscolaridade(cel("escolaridade")), "ESCOLARIDADE_DESCONHECIDA");

  return { dados, matricula, problemas, avisos };
}

// ------------------------------------------------------------------ o arquivo inteiro (sem o banco)
// Devolve { erro } (o arquivo não serve) ou { separador, colunas, linhas: [{ linha, dados, matricula, problemas, avisos }], vazias, totalColunas } — as linhas
// vazias ficam de fora (e são contadas). `escolha`: o mapa das colunas escolhido na tela (mapearColunas); sem ela, cada coluna é reconhecida pelo nome.
function prepararArquivo(texto, { congregacoes, hojeISO, escolha }) {
  if (typeof texto !== "string" || !texto.trim()) return { erro: "O arquivo está vazio." };
  if (texto.length > LIMITE_TEXTO) return { erro: "O arquivo é grande demais (mais de 8 milhões de letras). Divida em partes." };
  if (texto.includes("�")) return { erro: "O arquivo tem letras que não puderam ser lidas (acentos trocados por “�”). Salve o arquivo de novo como CSV (UTF-8 ou Windows) e tente outra vez." };
  const { separador, linhas, aspas } = lerCsv(texto);
  if (!linhas.length) return { erro: "O arquivo está vazio." };
  // ninguém some calado (revisão de 23/11, I1): o campo entre aspas que atravessa a linha engoliria as pessoas de baixo; o arquivo inteiro volta, com a linha
  if (aspas && !aspas.fechou) return { erro: `A linha ${aspas.linha} do arquivo abre aspas (") e não fecha: as pessoas das linhas de baixo sumiriam da prévia. Corrija essa linha na planilha e mande o arquivo de novo.` };
  if (aspas) return { erro: `A linha ${aspas.linha} do arquivo tem um campo entre aspas que passa para a linha de baixo: as pessoas dessas linhas sumiriam da prévia. Corrija essa linha na planilha e mande o arquivo de novo.` };
  const [cab, ...resto] = linhas;
  const colunas = mapearColunas(cab.celulas, escolha);
  if (colunas.erro) return { erro: colunas.erro };
  if (colunas.faltando.length) {
    // o mapa vai junto (só os nomes das colunas): a tela mostra e a Geral liga a coluna que falta
    return { erro: `O arquivo não tem a coluna de ${colunas.faltando.map((f) => f.toLowerCase()).join(" nem a de ")}. A primeira linha precisa ser o cabeçalho (MATRÍCULA;NOME;IGREJA;...).`,
      colunas: { lista: colunas.lista, escolhidas: escolha != null }, totalColunas: cab.celulas.length };
  }
  const corpo = resto.filter((l) => l.celulas.some((c) => String(c).trim() !== ""));
  if (!corpo.length) return { erro: "O arquivo só tem o cabeçalho: nenhuma pessoa para importar." };
  if (corpo.length > LIMITE_LINHAS) return { erro: `O arquivo passa de ${LIMITE_LINHAS.toLocaleString("pt-BR")} pessoas. Divida em partes.` };
  const opcoes = { congregacoes, hojeISO, colunasCabecalho: cab.celulas.length };
  return {
    separador,
    colunas: { reconhecidas: colunas.reconhecidas, ignoradas: colunas.ignoradas, lista: colunas.lista, escolhidas: escolha != null },
    linhas: corpo.map((l) => ({ linha: l.numero, ...lerLinha(l.celulas, colunas.mapa, opcoes) })),
    vazias: resto.length - corpo.length,
    totalColunas: cab.celulas.length
  };
}

// ------------------------------------------------------------------ com o que o banco já tem
// "A mesma pessoa": o mesmo CPF (os dois com CPF) ou nomes parecidos (preCadastro.nomesParecidos: iguais, ou o mesmo primeiro e o mesmo último nome).
function mesmaPessoa(a, b) {
  if (a.cpf && b.cpf) return a.cpf === b.cpf;
  return pre.nomesParecidos(a.nome, b.nome);
}

// Decide o que acontece com cada linha. `fichasPorMatricula`: Map(matrícula -> { nome, cpf }) das fichas que já existem com as matrículas do arquivo;
// `fichasPorCpf`: Map(cpf -> matrícula) das fichas que já existem com os CPFs do arquivo. Muda as linhas no lugar e devolve a mesma lista; cada linha ganha:
//   acao: NOVA | PROBLEMA; matriculaNumero (a do arquivo, quando serve); numeroNovo + motivoNumero (pendência NUMERO); repetidaLinha / repetidaMembro (a
//   linha anterior ou a ficha de que ela pode ser repetida: pendência REPETIDA).
// A matrícula que JÁ É de uma ficha do sistema (as regras da rodada 28, 22/11/2026): a linha fica de fora (o problema MATRICULA_JA_EXISTE), seja quem for —
// a ficha de lá continua como está e se completa à mão. O resto entra uma vez só, marcado (NUMERO, REPETIDA) para a secretaria acertar.
// `fichasPorNomeNascimento`: Map(chaveNomeNascimento -> matrícula) das fichas do sistema com o mesmo nome e nascimento de alguma linha.
function classificar(linhas, { fichasPorMatricula = new Map(), fichasPorCpf = new Map(), fichasPorNomeNascimento = new Map() } = {}) {
  const primeiraDaMatricula = new Map();   // matrícula do arquivo -> a primeira linha (não PROBLEMA) que a usa
  const numeroNovo = (l, motivo, aviso) => { l.numeroNovo = true; l.motivoNumero = motivo; l.avisos.push(aviso); };
  const repetida = (l, { linha = null, membro = null }, aviso) => {
    if (l.repetidaLinha == null && l.repetidaMembro == null) { l.repetidaLinha = linha; l.repetidaMembro = membro; }
    l.avisos.push(aviso);
  };
  for (const l of linhas) {
    l.numeroNovo = false; l.motivoNumero = null; l.matriculaNumero = null; l.repetidaLinha = null; l.repetidaMembro = null;
    const m = l.matricula;
    if (m.numero && fichasPorMatricula.has(m.numero) && !l.problemas.includes("MATRICULA_JA_EXISTE")) l.problemas.push("MATRICULA_JA_EXISTE");
    if (l.problemas.length) { l.acao = "PROBLEMA"; continue; }
    l.acao = "NOVA";
    if (m.zero) { numeroNovo(l, "ZERO", "MATRICULA_ZERO"); continue; }
    if (m.vazia) { numeroNovo(l, "VAZIA", "SEM_MATRICULA"); continue; }
    if (m.invalida) { numeroNovo(l, "INVALIDA", "MATRICULA_INVALIDA"); continue; }
    const anterior = primeiraDaMatricula.get(m.numero);
    if (anterior) {
      numeroNovo(l, "REPETIDA_NO_ARQUIVO", "MATRICULA_REPETIDA_NO_ARQUIVO");
      if (mesmaPessoa(l.dados, anterior.dados)) repetida(l, { linha: anterior.linha }, "MESMA_PESSOA_NO_ARQUIVO");
      continue;
    }
    primeiraDaMatricula.set(m.numero, l);
    l.matriculaNumero = m.numero;
  }

  // O CPF fica numa ficha só (índice único). Já está numa ficha do sistema: a linha entra sem ele, como possível repetida dessa ficha. Repetido no arquivo:
  // fica com a MENOR matrícula do arquivo (a mais antiga; sem matrícula, a primeira linha), e as outras entram sem ele, como possíveis repetidas dela.
  const porCpf = new Map();
  for (const l of linhas) {
    if (l.acao !== "NOVA" || !l.dados.cpf) continue;
    const dono = fichasPorCpf.get(l.dados.cpf);
    if (dono) { repetida(l, { membro: dono }, "CPF_EM_OUTRA_FICHA"); l.dados.cpf = null; continue; }
    if (!porCpf.has(l.dados.cpf)) porCpf.set(l.dados.cpf, []);
    porCpf.get(l.dados.cpf).push(l);
  }
  for (const grupo of porCpf.values()) {
    if (grupo.length < 2) continue;
    const ordem = [...grupo].sort((a, b) => (a.matriculaNumero == null) - (b.matriculaNumero == null) || (a.matriculaNumero || 0) - (b.matriculaNumero || 0) || a.linha - b.linha);
    const dono = ordem[0];
    for (const l of ordem.slice(1)) { repetida(l, { linha: dono.linha }, "CPF_REPETIDO_NO_ARQUIVO"); l.dados.cpf = null; }
  }

  // O mesmo NOME e o mesmo NASCIMENTO (a tela r27 aprovada: "o mesmo CPF, ou o mesmo nome e nascimento, de uma ficha que já está no sistema ou de outra linha do
  // arquivo"; a chave é a mesma da tela Fichas repetidas: sem acento nem maiúscula, os espaços juntos). A ficha do sistema vem primeiro; no arquivo, a primeira
  // linha fica e as outras são marcadas como possíveis repetidas dela. Quem já é possível repetida (o CPF, a matrícula) não ganha outra marca.
  const primeiraDoNome = new Map();
  for (const l of linhas) {
    if (l.acao !== "NOVA" || !l.dados.nome || !l.dados.dataNascimento) continue;
    const k = chaveNomeNascimento(l.dados.nome, l.dados.dataNascimento);
    const ficha = fichasPorNomeNascimento.get(k);
    const primeira = primeiraDoNome.get(k);
    if (!primeira) primeiraDoNome.set(k, l);
    if (l.repetidaLinha != null || l.repetidaMembro != null) continue;
    if (ficha != null) repetida(l, { membro: ficha }, "NOME_NASCIMENTO_EM_OUTRA_FICHA");
    else if (primeira) repetida(l, { linha: primeira.linha }, "NOME_NASCIMENTO_NO_ARQUIVO");
  }
  return linhas;
}
// A chave do "mesmo nome e nascimento": o nome sem acento nem maiúscula, com os espaços juntos (como o COLLATE Latin1_General_CI_AI da tela Fichas repetidas),
// e a data AAAA-MM-DD.
function chaveNomeNascimento(nome, dataISO) {
  const n = String(nome == null ? "" : nome).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  return `${n}|${String(dataISO == null ? "" : dataISO).slice(0, 10)}`;
}

// ------------------------------------------------------------------ os números da prévia (sem dado pessoal)
// maiorMatriculaSistema: a maior matrícula que já existe no sistema. Devolve as contagens, os avisos gerais (a matrícula fora da sequência, as congregações não
// encontradas, com quantas pessoas cada uma) e a matrícula que o próximo cadastro novo vai receber.
function resumir(prep, { maiorMatriculaSistema = 0 } = {}) {
  const ls = prep.linhas;
  const conta = (f) => ls.filter(f).length;
  const novas = ls.filter((l) => l.acao === "NOVA");
  const comNumero = novas.filter((l) => l.matriculaNumero != null).map((l) => ({ m: l.matriculaNumero, linha: l.linha })).sort((a, b) => a.m - b.m);
  const avisosGerais = [];
  // a matrícula muito alta, fora da sequência: depois dela, todo cadastro novo continua dali (a maior + 1)
  for (let i = 1; i < comNumero.length; i++) {
    if (comNumero[i].m - comNumero[i - 1].m > SALTO_MATRICULA) {
      const altas = comNumero.slice(i);
      avisosGerais.push({ codigo: "MATRICULA_FORA_DA_SEQUENCIA", linhas: altas.slice(0, 20).map((x) => x.linha),
        texto: `${altas.length === 1 ? "A matrícula" : `${altas.length} matrículas a partir da`} ${altas[0].m.toLocaleString("pt-BR")} (linha ${altas[0].linha}) ${altas.length === 1 ? "está" : "estão"} muito acima das outras (a anterior é a ${comNumero[i - 1].m.toLocaleString("pt-BR")}). Se ${altas.length === 1 ? "ficar" : "ficarem"} assim, o próximo cadastro novo recebe a ${(Math.max(comNumero[comNumero.length - 1].m, maiorMatriculaSistema) + 1).toLocaleString("pt-BR")}. Confira no sistema pago antes de importar.` });
      break;
    }
  }
  const naoAchadas = new Map();
  for (const l of ls) {
    if (!l.problemas.includes("CONGREGACAO_NAO_ENCONTRADA") && !l.problemas.includes("CONGREGACAO_INATIVA") && !l.problemas.includes("CONGREGACAO_AMBIGUA")) continue;
    const nome = String(l.dados.igrejaArquivo || "").replace(PREFIXO_IGREJA, "").trim() || "(vazio)";
    naoAchadas.set(nome, (naoAchadas.get(nome) || 0) + 1);
  }
  if (naoAchadas.size) {
    avisosGerais.push({ codigo: "CONGREGACOES_NAO_ENCONTRADAS", texto: `${naoAchadas.size === 1 ? "Uma congregação do arquivo não foi achada" : `${naoAchadas.size} congregações do arquivo não foram achadas`} no sistema: essas pessoas ficam de fora até o nome bater (confira o nome no sistema ou no arquivo e faça a prévia de novo).` });
  }
  const maiorArquivo = comNumero.length ? comNumero[comNumero.length - 1].m : 0;
  const ehRepetida = (l) => l.repetidaLinha != null || l.repetidaMembro != null;
  return {
    total: ls.length,
    vazias: Number(prep.vazias) || 0,
    totalColunas: Number(prep.totalColunas) || 0,
    novas: novas.length,
    // os quadros da tela (r27): cada linha que entra conta numa caixa só — a matrícula a acertar primeiro, depois a possível repetida, e o resto entra como está
    quadros: {
      comMatricula: conta((l) => l.acao === "NOVA" && !l.numeroNovo && !ehRepetida(l)),
      acertar: conta((l) => l.acao === "NOVA" && l.numeroNovo),
      repetidas: conta((l) => l.acao === "NOVA" && !l.numeroNovo && ehRepetida(l))
    },
    congregacoesReconhecidas: new Set(novas.map((l) => l.dados.congregacaoId).filter((c) => c != null)).size,
    jaExistem: conta((l) => l.problemas.includes("MATRICULA_JA_EXISTE")),
    primeiraMatriculaNova: Math.max(maiorArquivo, maiorMatriculaSistema) + 1,
    problemas: conta((l) => l.acao === "PROBLEMA"),
    comAviso: conta((l) => l.acao === "NOVA" && l.avisos.length > 0),
    numeroNovo: conta((l) => l.acao === "NOVA" && l.numeroNovo),
    possivelRepetida: conta((l) => l.acao === "NOVA" && ehRepetida(l)),
    semCongregacao: conta((l) => l.acao === "NOVA" && l.dados.congregacaoId == null),
    separador: prep.separador === "\t" ? "tabulação" : prep.separador,
    colunas: prep.colunas,
    congregacoesNaoEncontradas: [...naoAchadas.entries()].map(([nome, pessoas]) => ({ nome: nome.slice(0, 150), pessoas })).sort((a, b) => b.pessoas - a.pessoas).slice(0, 100),
    avisosGerais,
    proximaMatricula: Math.max(maiorArquivo, maiorMatriculaSistema) + 1 + conta((l) => l.acao === "NOVA" && l.numeroNovo)
  };
}

// A linha para a lista de problemas (tela e arquivo para baixar): só o necessário para achar a pessoa no sistema pago — nunca o CPF nem o contato.
// A linha que NÃO entra mostra só o que a impede (os avisos dela dizem "entra sem...", o que confundiria).
function linhaParaLista(l) {
  const problemas = l.problemas || [];
  return {
    linha: l.linha, matricula: l.matriculaArquivo != null ? l.matriculaArquivo : (l.matricula && l.matricula.texto) || "", nome: l.nome || (l.dados && l.dados.nome) || "",
    acao: l.acao, matriculaFinal: l.matriculaFinal == null ? null : l.matriculaFinal,
    motivos: (l.acao === "PROBLEMA" && problemas.length ? problemas : [...problemas, ...(l.avisos || [])]).map(textoDe)
  };
}

// O CSV da lista de problemas (para abrir no Excel): ';', a marca BOM e as células que começam com = + - @ protegidas (injeção de fórmula).
function csvDaLista(itens) {
  const celula = (v) => {
    let t = String(v == null ? "" : v);
    if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
    return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, "\"\"")}"` : t;
  };
  const cab = ["Linha", "Matrícula no arquivo", "Nome", "O que acontece", "Matrícula no sistema", "Motivos"];
  const oQue = { NOVA: "Entra", PROBLEMA: "Não entra" };
  const linhas = itens.map((i) => [i.linha, i.matricula, i.nome, oQue[i.acao] || i.acao, i.matriculaFinal == null ? "" : i.matriculaFinal, i.motivos.join(" | ")].map(celula).join(";"));
  return "﻿" + [cab.join(";"), ...linhas].join("\r\n") + "\r\n";
}

// Para o mapa das congregações: Map(chave do nome -> [{ congregacaoId, nome, ativa }]) a partir das linhas do banco.
function mapaDeCongregacoes(lista) {
  const m = new Map();
  for (const c of lista || []) {
    const k = chave(c.nome);
    if (!k) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push({ congregacaoId: Number(c.congregacaoId), nome: c.nome, ativa: c.ativa === true || c.ativa === 1 });
  }
  return m;
}

module.exports = { LIMITE_TEXTO, LIMITE_LINHAS, SALTO_MATRICULA, COLUNAS, CAMPOS, PROBLEMAS, AVISOS, chave, chaveNomeNascimento, lerCsv, mapearColunas, lerData, lerSexo, lerEstadoCivil,
  lerFormaAdmissao, lerEscolaridade, lerCpf, lerCelular, lerMatricula, chaveDaIgreja, lerLinha, prepararArquivo, mesmaPessoa, classificar, resumir, linhaParaLista,
  csvDaLista, mapaDeCongregacoes, textoDe };
