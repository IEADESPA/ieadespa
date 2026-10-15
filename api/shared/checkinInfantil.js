// shared/checkinInfantil.js (v7.10 — Check-in infantil com cadeia de custódia)
// ECA arts. 70 e 70-A (prevenção); Lei 14.811/2024 (art. 59-A do ECA); LGPD arts. 11 e 14 (dado de saúde e dado de criança).
//
// A REGRA do check-in, pura, sem banco (a parte com banco está em shared/checkinInfantilDb.js). O que mora aqui:
//  - o código de retirada: gerado ao acaso, guardado só como HMAC, conferido em tempo constante;
//  - a janela do serviço, a lotação da sala (a proporção adulto/criança da v7.7 agora com gente de verdade) e a saída de voluntário;
//  - quem pode retirar a criança e o que é uma retirada divergente;
//  - as validações de tudo o que chega de fora (nada que o cliente manda vira consulta ao banco sem passar por aqui);
//  - a etiqueta, o recibo e o histórico que o responsável vê; os textos dos avisos.
//
// Princípios (cada um já custou um defeito em versões anteriores, por isso estão escritos):
//  1) O CÓDIGO NUNCA SE GUARDA, NEM SE REGISTRA: só o HMAC (com o segredo do servidor, atado ao registro e à geração do código). O texto sai uma vez, na resposta do
//     check-in (ou da segunda via), e nunca vai para log, auditoria nem histórico.
//  2) SEM CÓDIGO NÃO SE RETIRA, AINDA QUE A PESSOA SEJA CONHECIDA. Quem perdeu a etiqueta e o recibo pede a segunda via (dois olhares); não existe retirada "sem código".
//  3) QUEM NÃO ESTÁ NA LISTA NÃO SAI COM A CRIANÇA SEM A LIDERANÇA: retirada divergente precisa do código E da aprovação de um gestor.
//  4) A CUSTÓDIA SE APOIA NO CADASTRO DA SECRETARIA (responsáveis com o documento conferido), nunca no vínculo familiar de autoatendimento.
//  5) O QUE ENTRA É VALIDADO COM RIGOR: identificador só na grafia canônica, texto sem marcação (< >), tamanhos fechados, listas com teto.
const crypto = require("crypto");
const mm = require("./ministerioMenores");
const vol = require("./voluntariado");

// ---------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------

// Sem 0/O e 1/I/L: o voluntário digita o que lê na etiqueta, e letra parecida erra. 31 símbolos ^ 6 = ~887 milhões de códigos.
const ALFABETO_CODIGO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const TAMANHO_CODIGO = 6;
const FORMATO_CODIGO = /^[A-HJKMNP-Z2-9]{6}$/;

const TENTATIVAS_PADRAO = 5;            // erros do código que travam a criança; o teto de 5 vale mesmo que a Igreja configure mais
const TENTATIVAS_TETO = 5;
const JANELA_ANTES_MIN_PADRAO = 60;     // a sala aceita crianças desde 60 minutos antes do serviço
const JANELA_DEPOIS_HORAS_PADRAO = 5;   // ... até 5 horas depois
const JANELA_ANTES_MIN_TETO = 240;
const JANELA_DEPOIS_HORAS_TETO = 12;
const VISITANTE_CONTATO_DIAS_PADRAO = 90;
const SEGUNDA_VIA_MINUTOS = 10;         // quanto tempo o pedido de segunda via espera o segundo adulto
const MAX_CRIANCAS_POR_CHECKIN = 6;
const MAX_AUTORIZADOS_VISITA = 3;
const MAX_AUTORIZADOS_POR_CRIANCA = 8;
const MAX_NOME = 150;
const MAX_SAUDE = 400;
const MAX_MOTIVO = 300;
const MAX_REFERENCIA = 200;
const LIMITE_LISTA = 300;

const SIGLAS_PRAZO = {
  abreMinutosAntes: "CHECKIN_ABRE_MINUTOS_ANTES",
  fechaHorasDepois: "CHECKIN_FECHA_HORAS_DEPOIS",
  tentativasCodigo: "CHECKIN_TENTATIVAS_CODIGO",
  visitanteContatoDias: "CHECKIN_VISITANTE_CONTATO_DIAS"
};

const PARENTESCOS = {
  PAI: "Pai", MAE: "Mãe", AVO: "Avô ou avó", TIO: "Tio ou tia", IRMAO: "Irmão ou irmã (18 anos ou mais)", PADRINHO: "Padrinho ou madrinha",
  TUTOR: "Tutor(a)", AMIGO_FAMILIA: "Amigo(a) da família", OUTRO: "Outra pessoa de confiança do responsável"
};
// O que o voluntário conferiu no balcão (nunca se guarda o número do documento).
const DOCUMENTOS = { RG: "RG", CNH: "CNH", CPF: "CPF", OUTRO: "Outro documento com foto" };

const SITUACOES = {
  NA_SALA: "Na sala",
  RETIRADA_PENDENTE: "Retirada aguardando aprovação da liderança",
  RETIRADA: "Retirada"
};

const TIPOS_EVENTO = {
  CHECKIN: "Entrega da criança na sala",
  CODIGO_ERRADO: "Código de retirada errado",
  CRIANCA_TRAVADA: "Criança travada por erros do código",
  CRIANCA_DESTRAVADA: "Criança destravada pela liderança",
  RETIRADA: "Retirada da criança",
  RETIRADA_DIVERGENTE_PEDIDA: "Retirada por quem não está na lista, pedida",
  RETIRADA_DIVERGENTE_APROVADA: "Retirada divergente aprovada pela liderança",
  RETIRADA_DIVERGENTE_NEGADA: "Retirada divergente negada pela liderança",
  SEGUNDA_VIA_PEDIDA: "Segunda via do código, pedida",
  SEGUNDA_VIA_EMITIDA: "Segunda via do código, emitida",
  VOLUNTARIO_ENTROU: "Voluntário entrou na sala",
  VOLUNTARIO_SAIU: "Voluntário saiu da sala",
  SALA_RECUSOU_CHECKIN: "Sala recusou um check-in"
};

const MENSAGENS = {
  SEM_ACESSO_A_SALA: "Você não está escalado nesta sala, neste serviço, ou não está apto hoje para servir com menores. Procure o líder da equipe.",
  SALA_NAO_ENCONTRADA: "Sala não encontrada.",
  SALA_SEM_MARCA: "Esta equipe não está marcada como \"contato com menores\": o check-in infantil só funciona em sala com essa marca.",
  SERVICO_NAO_PUBLICADO: "O serviço desta sala não está publicado: o check-in só abre em serviço publicado.",
  CODIGO_FORMATO: "O código tem 6 letras e números, como está na etiqueta (não usa 0, 1, O, I nem L). Confira e digite de novo.",
  CODIGO_ERRADO: "Código errado.",
  CRIANCA_TRAVADA: "Esta criança está travada por erros do código. Peça à liderança para destravar ou emita a segunda via.",
  JA_RETIRADA: "Esta criança já foi retirada.",
  MUDOU: "O registro mudou enquanto você agia (outra pessoa atuou nele). Atualize a tela e confira.",
  CRIANCA_NAO_ACHADA: "Criança não encontrada nesta sala.",
  NAO_E_MENOR: "Só crianças e adolescentes com menos de 18 anos fazem check-in infantil.",
  SEM_NASCIMENTO: "O cadastro desta criança não tem a data de nascimento. Peça à Secretaria para completar, ou faça o check-in como visitante.",
  JA_NA_SALA: "Esta criança já está numa sala (ainda não foi retirada).",
  SEM_PERMISSAO_GESTAO: "Esta ação é da liderança da congregação (entrar com a senha de acesso administrativo).",
  SEM_RESPONSAVEL: "Esta criança não tem responsável cadastrado pela Secretaria: faça o check-in como visitante e peça à Secretaria para cadastrar o responsável."
};

// ---------------------------------------------------------------
// Validação de entrada (texto e identificador que chegam de fora)
// ---------------------------------------------------------------

const limpar = (v) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
const temMarca = (s) => /[<>]/.test(s);
const ehObjeto = (v) => v != null && typeof v === "object" && !Array.isArray(v);
// Identificador na grafia canônica (só dígitos, sem zero à esquerda nem espaço, dentro do INT do SQL): "05", " 5", "1e1", "0x10", true e [5] não são identificadores.
function idDe(v) {
  if (typeof v !== "number" && typeof v !== "string") return null;
  const s = String(v);
  if (!/^[1-9]\d{0,9}$/.test(s)) return null;
  const n = Number(s);
  return n <= 2147483647 ? n : null;
}

// Nome de pessoa: 2 a 150 caracteres, sem marcação, com pelo menos duas letras (nome só de símbolos não vale).
function validarNome(v, rotulo = "o nome") {
  const s = limpar(v);
  if (s.length < 2 || s.length > MAX_NOME) return { valido: false, mensagem: `Informe ${rotulo} (de 2 a ${MAX_NOME} caracteres).` };
  if (temMarca(s)) return { valido: false, mensagem: `${rotulo[0].toUpperCase()}${rotulo.slice(1)} não pode ter os sinais < ou >.` };
  if ((s.match(/\p{L}/gu) || []).length < 2) return { valido: false, mensagem: `Informe ${rotulo} com letras.` };
  return { valido: true, valor: s };
}

function validarTelefone(v) {
  if (typeof v !== "string" && typeof v !== "number") return { valido: false, mensagem: "Informe o telefone de quem trouxe a criança, com DDD." };
  const digitos = String(v).replace(/\D/g, "");
  if (digitos.length < 10 || digitos.length > 13) return { valido: false, mensagem: "Informe o telefone com DDD (10 a 13 números)." };
  return { valido: true, valor: digitos };
}

function validarParentesco(v) {
  if (typeof v !== "string" || !Object.prototype.hasOwnProperty.call(PARENTESCOS, v)) return { valido: false, mensagem: `Informe o parentesco. Use um de: ${Object.keys(PARENTESCOS).join(", ")}.` };
  return { valido: true, valor: v };
}

function validarDocumento(v) {
  if (typeof v !== "string" || !Object.prototype.hasOwnProperty.call(DOCUMENTOS, v)) return { valido: false, mensagem: `Informe o documento que você conferiu. Use um de: ${Object.keys(DOCUMENTOS).join(", ")}.` };
  return { valido: true, valor: v };
}

function validarTextoLivre(v, { min = 1, max, rotulo }) {
  const s = limpar(v);
  if (s.length < min || s.length > max) return { valido: false, mensagem: `${rotulo}: de ${min} a ${max} caracteres.` };
  if (temMarca(s)) return { valido: false, mensagem: `${rotulo} não pode ter os sinais < ou >.` };
  return { valido: true, valor: s };
}

function validarSaudeTexto(v) { return validarTextoLivre(v, { min: 2, max: MAX_SAUDE, rotulo: "A alergia ou condição de saúde" }); }

function dataIsoValida(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// "AAAA-MM-DD" que já passou e dá menos de 18 anos em `hoje`.
function validarNascimentoDeMenor(v, { hoje }) {
  if (!dataIsoValida(v)) return { valido: false, mensagem: "Informe a data de nascimento no formato AAAA-MM-DD." };
  if (v > hoje) return { valido: false, mensagem: "A data de nascimento não pode ser no futuro." };
  const idade = vol.idadeEmAnos(v, hoje);
  if (idade == null || idade >= vol.MAIORIDADE) return { valido: false, mensagem: MENSAGENS.NAO_E_MENOR };
  return { valido: true, valor: v, idade };
}

// Referência de pessoa autorizada que a tela devolve: RESP:<matrícula> | AUT:<id> | VIS:<id> | TROUXE.
const REF_PESSOA = /^(RESP|AUT|VIS):([1-9]\d{0,9})$/;
function lerRefPessoa(ref) {
  if (ref === "TROUXE") return { tipo: "TROUXE", id: null };
  if (typeof ref !== "string") return null;
  const m = REF_PESSOA.exec(ref);
  if (!m) return null;
  const id = idDe(m[2]);
  return id ? { tipo: m[1], id } : null;
}

// ---------------------------------------------------------------
// O código de retirada
// ---------------------------------------------------------------

// `sorteio(min, max)` devolve um inteiro em [min, max) (crypto.randomInt por padrão; os testes injetam o seu).
function gerarCodigo(sorteio = crypto.randomInt) {
  let codigo = "";
  for (let i = 0; i < TAMANHO_CODIGO; i++) codigo += ALFABETO_CODIGO[sorteio(0, ALFABETO_CODIGO.length)];
  return codigo;
}

// O que o voluntário digitou, na forma de comparar: sem espaços e hifens, em maiúsculas. null se não tem o formato de um código.
function normalizarCodigo(v) {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\s-]/g, "").toUpperCase();
  return FORMATO_CODIGO.test(s) ? s : null;
}

// A chave do HMAC nasce do segredo do servidor com um rótulo próprio: o mesmo segredo assina a sessão e tempera o PIN, e nenhum dos três pode servir ao outro.
function chaveDoCodigo(segredo) {
  if (typeof segredo !== "string" || segredo.length < 16) throw new Error("Segredo do servidor ausente ou curto demais para o código de retirada.");
  return crypto.createHash("sha256").update(`checkin-infantil-codigo|${segredo}`).digest();
}

function hashCodigo(codigo, { registroId, geracao, segredo }) {
  const rid = idDe(registroId), g = idDe(geracao);
  if (!rid || !g || typeof codigo !== "string" || !FORMATO_CODIGO.test(codigo)) throw new Error("hashCodigo: dados inválidos.");
  return crypto.createHmac("sha256", chaveDoCodigo(segredo)).update(`${rid}|${g}|${codigo}`).digest("hex");
}

// Comparação em tempo constante do código digitado com o HMAC guardado. Código fora do formato nunca confere.
function confereCodigo(digitado, hashGuardado, { registroId, geracao, segredo }) {
  const codigo = normalizarCodigo(digitado);
  if (!codigo || typeof hashGuardado !== "string" || !/^[0-9a-f]{64}$/.test(hashGuardado)) return false;
  const calculado = Buffer.from(hashCodigo(codigo, { registroId, geracao, segredo }), "hex");
  const guardado = Buffer.from(hashGuardado, "hex");
  return calculado.length === guardado.length && crypto.timingSafeEqual(calculado, guardado);
}

function tentativasPermitidas(configurado) {
  return Number.isInteger(configurado) && configurado >= 1 ? Math.min(configurado, TENTATIVAS_TETO) : TENTATIVAS_PADRAO;
}

// ---------------------------------------------------------------
// Idade, faixa e janela do serviço
// ---------------------------------------------------------------

function faixaDaIdade(idade) {
  if (!Number.isInteger(idade) || idade < 0 || idade >= vol.MAIORIDADE) return null;
  if (idade <= 2) return "BERCARIO";
  if (idade <= 5) return "MATERNAL";
  if (idade <= 9) return "INFANTIL";
  if (idade <= 12) return "JUNIORES";
  return "ADOLESCENTES";
}
const idadeForaDaFaixa = (idade, faixaSala) => !!faixaSala && faixaDaIdade(idade) !== faixaSala;

// "AAAA-MM-DDTHH:MM" no relógio de Brasília (as datas do serviço são gravadas como o horário local, sem fuso).
function agoraBrasiliaIso(agora = new Date()) { return new Date(agora.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 16); }
function minutosDe(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(iso || ""));
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) / 60000;
}
function prazosDoCheckin(p = {}) {
  const inteiro = (v, padrao, teto) => (Number.isInteger(v) && v >= 1 ? Math.min(v, teto) : padrao);
  return {
    abreMinutosAntes: inteiro(p.abreMinutosAntes, JANELA_ANTES_MIN_PADRAO, JANELA_ANTES_MIN_TETO),
    fechaHorasDepois: inteiro(p.fechaHorasDepois, JANELA_DEPOIS_HORAS_PADRAO, JANELA_DEPOIS_HORAS_TETO),
    tentativasCodigo: tentativasPermitidas(p.tentativasCodigo),
    visitanteContatoDias: Number.isInteger(p.visitanteContatoDias) && p.visitanteContatoDias >= 1 ? Math.min(p.visitanteContatoDias, 365) : VISITANTE_CONTATO_DIAS_PADRAO
  };
}

// A sala só abre dentro da janela do serviço. `servicoIso` e `agoraIso` no relógio de Brasília.
function avaliarJanela({ servicoIso, agoraIso, antesMin = JANELA_ANTES_MIN_PADRAO, depoisHoras = JANELA_DEPOIS_HORAS_PADRAO }) {
  const s = minutosDe(servicoIso), a = minutosDe(agoraIso);
  if (s == null || a == null) return { aberta: false, codigo: "SEM_HORARIO", mensagem: "O serviço não tem horário válido." };
  const abre = s - antesMin, fecha = s + depoisHoras * 60;
  if (a < abre) return { aberta: false, codigo: "AINDA_NAO_ABRIU", mensagem: `O check-in desta sala abre ${antesMin} minutos antes do serviço.`, faltamMinutos: Math.ceil(abre - a) };
  if (a > fecha) return { aberta: false, codigo: "JA_FECHOU", mensagem: `O check-in desta sala fechou: o serviço já passou de ${depoisHoras} hora(s). Peça à liderança.` };
  return { aberta: true, codigo: "ABERTA", mensagem: null };
}

// ---------------------------------------------------------------
// Lotação da sala (a proporção da v7.7 com gente de verdade) e saída de voluntário
// ---------------------------------------------------------------

// { adultos: voluntários presentes, maiores de 18 e aptos AGORA; criancas: já na sala; adicionar: quantas entram agora; faixa; criancasPorAdulto; adultosMinimos }
function avaliarLotacao({ adultos, criancas, adicionar = 1, faixa, criancasPorAdulto, adultosMinimos = mm.ADULTOS_MINIMOS_PADRAO }) {
  const minimo = Math.max(mm.ADULTOS_MINIMOS_PADRAO, Number.isInteger(adultosMinimos) ? adultosMinimos : mm.ADULTOS_MINIMOS_PADRAO);
  const problemas = [];
  const porAdulto = faixa ? (criancasPorAdulto || mm.criancasPorAdulto(faixa)) : null;
  if (!faixa || !mm.FAIXAS[faixa]) problemas.push({ codigo: "SEM_FAIXA", mensagem: "A equipe desta sala não tem faixa etária definida: a liderança define a faixa para conferir a proporção de adultos por criança." });
  if (adultos < minimo) problemas.push({ codigo: "ADULTOS_INSUFICIENTES", mensagem: `Uma sala com crianças nunca fica com um adulto só: são necessários ao menos ${minimo} adultos habilitados presentes e há ${adultos}.` });
  const capacidade = porAdulto ? adultos * porAdulto : 0;
  if (porAdulto && adultos >= minimo && criancas + adicionar > capacidade) {
    problemas.push({ codigo: "SALA_CHEIA", mensagem: `A sala está no limite: ${adultos} adultos para ${porAdulto} crianças cada = ${capacidade}, e já há ${criancas}. Chame mais um adulto habilitado para a sala ou direcione a criança para outra sala.` });
  }
  return { ok: problemas.length === 0, problemas, adultos, criancas, capacidade, vagas: Math.max(0, capacidade - criancas), criancasPorAdulto: porAdulto, adultosMinimos: minimo };
}

// O voluntário só sai se a sala continuar dentro da regra (ou vazia). O adolescente apto é auxiliar e não conta como adulto: sair não muda a conta.
function avaliarSaidaVoluntario({ adultos, criancas, contaComoAdulto, faixa, criancasPorAdulto, adultosMinimos = mm.ADULTOS_MINIMOS_PADRAO }) {
  if (criancas === 0 || !contaComoAdulto) return { ok: true };
  const minimo = Math.max(mm.ADULTOS_MINIMOS_PADRAO, Number.isInteger(adultosMinimos) ? adultosMinimos : mm.ADULTOS_MINIMOS_PADRAO);
  const restam = adultos - 1;
  if (restam < minimo) return { ok: false, mensagem: `Você não pode sair agora: a sala ficaria com ${restam} adulto(s) para ${criancas} criança(s), e uma sala com crianças precisa de ao menos ${minimo}. Entregue as crianças ou espere outro adulto chegar.` };
  const porAdulto = faixa ? (criancasPorAdulto || mm.criancasPorAdulto(faixa)) : null;
  if (porAdulto && criancas > restam * porAdulto) return { ok: false, mensagem: `Você não pode sair agora: com ${restam} adultos a sala passaria da proporção (${porAdulto} crianças por adulto) com ${criancas} criança(s).` };
  return { ok: true };
}

// ---------------------------------------------------------------
// Quem pode retirar a criança
// ---------------------------------------------------------------

// Monta quem pode retirar a criança nesta visita. Cada pessoa tem uma `ref` que a tela devolve na hora de retirar.
//   responsaveis [{ membroId, nome, vinculo }]            os responsáveis cadastrados pela Secretaria (sempre)
//   fixos        [{ autorizadoId, membroId, nome, parentesco, validoAte }]  a lista do responsável (criança membro)
//   trouxe       { membroId?, nome, parentesco? }          quem entregou a criança nesta visita
//   daVisita     [{ autorizadoVisitaId, nome, parentesco }] os indicados no check-in, só para esta visita
function montarAutorizados({ responsaveis = [], fixos = [], trouxe = null, daVisita = [], hoje }) {
  const lista = [];
  for (const r of responsaveis) {
    lista.push({ ref: `RESP:${r.membroId}`, tipo: "RESPONSAVEL", membroId: Number(r.membroId), nome: r.nome || null, rotulo: vol.VINCULOS_RESPONSAVEL[r.vinculo] || "Responsável" });
  }
  for (const f of fixos) {
    if (f.validoAte && hoje && String(f.validoAte).slice(0, 10) < hoje) continue;           // venceu
    lista.push({ ref: `AUT:${f.autorizadoId}`, tipo: "AUTORIZADO", autorizadoId: Number(f.autorizadoId), membroId: f.membroId ? Number(f.membroId) : null, nome: f.nome || null, rotulo: PARENTESCOS[f.parentesco] || "Autorizado(a)" });
  }
  for (const v of daVisita) {
    lista.push({ ref: `VIS:${v.autorizadoVisitaId}`, tipo: "AUTORIZADO", autorizadoVisitaId: Number(v.autorizadoVisitaId), membroId: null, nome: v.nome || null, rotulo: `${PARENTESCOS[v.parentesco] || "Autorizado(a)"} (só esta visita)` });
  }
  if (trouxe && (trouxe.membroId || trouxe.nome)) {
    lista.push({ ref: "TROUXE", tipo: "TROUXE", membroId: trouxe.membroId ? Number(trouxe.membroId) : null, nome: trouxe.nome || null, rotulo: `Quem trouxe a criança${trouxe.parentesco && PARENTESCOS[trouxe.parentesco] ? ` (${PARENTESCOS[trouxe.parentesco].toLowerCase()})` : ""}` });
  }
  return lista;
}

// Quem está retirando: alguém da lista (`refPessoa`) ou "outra pessoa" (`outro`: nome, parentesco, documento). Devolve { divergente, tipo, membroId, nome, parentesco, documento } ou { erro }.
function classificarRetirante({ ref, outro }, autorizados) {
  if (ref != null) {
    const lido = lerRefPessoa(ref);
    if (!lido) return { erro: "Escolha quem está retirando a criança." };
    const achado = autorizados.find((a) => a.ref === (lido.tipo === "TROUXE" ? "TROUXE" : `${lido.tipo}:${lido.id}`));
    if (!achado) return { erro: "Essa pessoa não está na lista de quem pode retirar esta criança. Se for outra pessoa, escolha \"outra pessoa\"." };
    return { divergente: false, tipo: achado.tipo, membroId: achado.membroId || null, nome: achado.nome || null, parentesco: null, documento: null };
  }
  if (!ehObjeto(outro)) return { erro: "Escolha quem está retirando a criança." };
  const nome = validarNome(outro.nome, "o nome de quem está retirando");
  if (!nome.valido) return { erro: nome.mensagem };
  const par = validarParentesco(outro.parentesco);
  if (!par.valido) return { erro: par.mensagem };
  const doc = validarDocumento(outro.documento);
  if (!doc.valido) return { erro: doc.mensagem };
  return { divergente: true, tipo: "OUTRO", membroId: null, nome: nome.valor, parentesco: par.valor, documento: doc.valor };
}

// ---------------------------------------------------------------
// Validação dos pedidos
// ---------------------------------------------------------------

function validarSala(d = {}) {
  const servicoId = idDe(d.servicoId), equipeId = idDe(d.equipeId);
  if (!servicoId || !equipeId) return { valido: false, mensagem: "Informe a sala: servicoId e equipeId." };
  return { valido: true, servicoId, equipeId };
}

// Quem trouxe: `responsavelId` (matrícula do responsável cadastrado) OU nome, parentesco, documento e, para visitante, telefone.
function validarTrouxe(t, { exigeContato }) {
  if (!ehObjeto(t)) return { valido: false, mensagem: "Informe quem trouxe a criança." };
  if (t.responsavelId != null && t.responsavelId !== "") {
    const id = idDe(t.responsavelId);
    if (!id) return { valido: false, mensagem: "responsavelId inválido." };
    return { valido: true, valor: { membroId: id } };
  }
  const nome = validarNome(t.nome, "o nome de quem trouxe a criança");
  if (!nome.valido) return nome;
  const par = validarParentesco(t.parentesco);
  if (!par.valido) return par;
  const doc = validarDocumento(t.documento);
  if (!doc.valido) return doc;
  let contato = null;
  if (t.contato != null && t.contato !== "") {
    const tel = validarTelefone(t.contato);
    if (!tel.valido) return tel;
    contato = tel.valor;
  } else if (exigeContato) return { valido: false, mensagem: "Informe o telefone de quem trouxe a criança (com DDD): é por ele que a liderança fala com o responsável." };
  return { valido: true, valor: { nome: nome.valor, parentesco: par.valor, documento: doc.valor, contato } };
}

function chaveVisitante(nome, nascimento) { return `${limpar(nome).toLowerCase()}|${nascimento}`; }

// Corpo do check-in. `hoje` ('AAAA-MM-DD' de Brasília) fixa a idade do visitante.
function validarCheckin(d = {}, { hoje }) {
  const sala = validarSala(d);
  if (!sala.valido) return sala;
  if (!Array.isArray(d.criancas) || d.criancas.length < 1) return { valido: false, mensagem: "Informe ao menos uma criança." };
  if (d.criancas.length > MAX_CRIANCAS_POR_CHECKIN) return { valido: false, mensagem: `Faça o check-in de até ${MAX_CRIANCAS_POR_CHECKIN} crianças por vez.` };
  const criancas = [];
  const vistos = new Set();
  let haVisitante = false;
  for (const c of d.criancas) {
    if (!ehObjeto(c)) return { valido: false, mensagem: "Cada criança precisa ser um objeto com menorId ou visitante." };
    const temMembro = c.menorId != null && c.menorId !== "";
    const temVisitante = c.visitante != null;
    if (temMembro === temVisitante) return { valido: false, mensagem: "Cada criança é um membro (menorId) ou um visitante (visitante), nunca os dois nem nenhum." };
    if (temMembro) {
      const id = idDe(c.menorId);
      if (!id) return { valido: false, mensagem: "menorId inválido." };
      if (vistos.has(`M${id}`)) return { valido: false, mensagem: "A mesma criança aparece duas vezes." };
      vistos.add(`M${id}`);
      criancas.push({ tipo: "MEMBRO", menorId: id });
    } else {
      if (!ehObjeto(c.visitante)) return { valido: false, mensagem: "Dados do visitante inválidos." };
      const nome = validarNome(c.visitante.nome, "o nome da criança visitante");
      if (!nome.valido) return nome;
      const nasc = validarNascimentoDeMenor(c.visitante.nascimento, { hoje });
      if (!nasc.valido) return nasc;
      const k = chaveVisitante(nome.valor, nasc.valor);
      if (vistos.has(`V${k}`)) return { valido: false, mensagem: "A mesma criança aparece duas vezes." };
      vistos.add(`V${k}`);
      let saude = null;
      if (c.visitante.saude != null) {
        if (!ehObjeto(c.visitante.saude)) return { valido: false, mensagem: "Dados de saúde inválidos." };
        const texto = validarSaudeTexto(c.visitante.saude.texto);
        if (!texto.valido) return texto;
        if (c.visitante.saude.concordo !== true) return { valido: false, mensagem: "O responsável presente precisa concordar com a informação de saúde na etiqueta (marque a concordância)." };
        if (typeof c.visitante.saude.textoHash !== "string") return { valido: false, mensagem: "Falta o hash do texto de autorização que a tela mostrou (recarregue a tela)." };
        saude = { texto: texto.valor, textoHash: c.visitante.saude.textoHash.trim().toLowerCase() };
      }
      haVisitante = true;
      criancas.push({ tipo: "VISITANTE", nome: nome.valor, nascimento: nasc.valor, idade: nasc.idade, saude });
    }
  }
  const trouxe = validarTrouxe(d.trouxe, { exigeContato: haVisitante });
  if (!trouxe.valido) return trouxe;
  let extras = [];
  if (d.autorizadosVisita != null) {
    if (!Array.isArray(d.autorizadosVisita)) return { valido: false, mensagem: "autorizadosVisita deve ser uma lista." };
    if (d.autorizadosVisita.length > MAX_AUTORIZADOS_VISITA) return { valido: false, mensagem: `Indique no máximo ${MAX_AUTORIZADOS_VISITA} pessoas para esta visita.` };
    for (const x of d.autorizadosVisita) {
      if (!ehObjeto(x)) return { valido: false, mensagem: "Cada pessoa indicada precisa ter nome e parentesco." };
      const nome = validarNome(x.nome, "o nome da pessoa autorizada");
      if (!nome.valido) return nome;
      const par = validarParentesco(x.parentesco);
      if (!par.valido) return par;
      extras.push({ nome: nome.valor, parentesco: par.valor });
    }
  }
  return { valido: true, servicoId: sala.servicoId, equipeId: sala.equipeId, criancas, trouxe: trouxe.valor, extras };
}

function validarRetirada(d = {}) {
  const registroId = idDe(d.registroId);
  if (!registroId) return { valido: false, mensagem: "Informe a criança (registroId)." };
  if (typeof d.codigo !== "string" || !d.codigo.trim()) return { valido: false, mensagem: "Digite o código da etiqueta." };
  const codigo = normalizarCodigo(d.codigo);
  if (!codigo) return { valido: false, formato: true, mensagem: MENSAGENS.CODIGO_FORMATO };
  const r = ehObjeto(d.retirante) ? d.retirante : null;
  if (!r) return { valido: false, mensagem: "Escolha quem está retirando a criança." };
  const tem = r.ref != null, temOutro = r.outro != null;
  if (tem === temOutro) return { valido: false, mensagem: "Escolha alguém da lista ou \"outra pessoa\", nunca os dois." };
  return { valido: true, registroId, codigo, retirante: tem ? { ref: r.ref } : { outro: r.outro } };
}

function validarDecisaoDivergencia(d = {}) {
  const registroId = idDe(d.registroId);
  if (!registroId) return { valido: false, mensagem: "Informe a criança (registroId)." };
  if (typeof d.aprovar !== "boolean") return { valido: false, mensagem: "Informe aprovar: true ou false." };
  const motivo = validarTextoLivre(d.motivo, { min: 8, max: MAX_MOTIVO, rotulo: "O motivo da decisão" });
  if (!motivo.valido) return motivo;
  return { valido: true, registroId, aprovar: d.aprovar, motivo: motivo.valor };
}

function validarPedidoSegundaVia(d = {}) {
  const registroId = idDe(d.registroId);
  if (!registroId) return { valido: false, mensagem: "Informe a criança (registroId)." };
  const lido = d.pessoa && ehObjeto(d.pessoa) ? lerRefPessoa(d.pessoa.ref) : null;
  if (!lido) return { valido: false, mensagem: "Escolha quem está pedindo a segunda via entre os que podem retirar a criança." };
  const doc = validarDocumento(d.documento);
  if (!doc.valido) return doc;
  return { valido: true, registroId, pessoa: lido, documento: doc.valor };
}

function validarAutorizado(d = {}) {
  const menorId = idDe(d.menorId);
  if (!menorId) return { valido: false, mensagem: "Informe a criança (menorId)." };
  const nome = validarNome(d.nome, "o nome da pessoa autorizada");
  if (!nome.valido) return nome;
  const par = validarParentesco(d.parentesco);
  if (!par.valido) return par;
  let membroId = null;
  if (d.membroId != null && d.membroId !== "") { membroId = idDe(d.membroId); if (!membroId) return { valido: false, mensagem: "membroId inválido." }; }
  let validoAte = null;
  if (d.validoAte != null && d.validoAte !== "") {
    if (!dataIsoValida(d.validoAte)) return { valido: false, mensagem: "validoAte: use o formato AAAA-MM-DD." };
    validoAte = d.validoAte;
  }
  let referencia = null;
  if (d.referencia != null && d.referencia !== "") {
    const r = validarTextoLivre(d.referencia, { min: 3, max: MAX_REFERENCIA, rotulo: "A referência da ficha" });
    if (!r.valido) return r;
    referencia = r.valor;
  }
  return { valido: true, menorId, nome: nome.valor, parentesco: par.valor, membroId, validoAte, referencia };
}

function validarSaudeDaCrianca(d = {}) {
  const menorId = idDe(d.menorId);
  if (!menorId) return { valido: false, mensagem: "Informe a criança (menorId)." };
  const texto = validarSaudeTexto(d.texto);
  if (!texto.valido) return texto;
  let referencia = null;
  if (d.referencia != null && d.referencia !== "") {
    const r = validarTextoLivre(d.referencia, { min: 3, max: MAX_REFERENCIA, rotulo: "A referência da ficha" });
    if (!r.valido) return r;
    referencia = r.valor;
  }
  return { valido: true, menorId, texto: texto.valor, referencia };
}

// ---------------------------------------------------------------
// Etiqueta, recibo e histórico do responsável
// ---------------------------------------------------------------

// Na etiqueta (que fica no peito da criança) vão o primeiro nome e a inicial do último: quem vê a etiqueta não precisa do nome completo.
function nomeParaEtiqueta(nome) {
  const partes = limpar(nome).split(" ").filter(Boolean);
  if (!partes.length) return "";
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[partes.length - 1][0].toUpperCase()}.`;
}
const primeiroNome = (nome) => limpar(nome).split(" ")[0] || "";

function montarEtiqueta({ nomeCrianca, idade, salaNome, congregacaoNome, codigo, saudeTexto, instante }) {
  return {
    nome: nomeParaEtiqueta(nomeCrianca), idade, sala: salaNome, congregacao: congregacaoNome, codigo,
    saude: saudeTexto || null, instante,
    orientacao: "Guarde este código: sem ele a criança não é entregue, mesmo a quem a equipe conhece."
  };
}

// O que o responsável vê do histórico das próprias crianças: nunca o código, nunca o nome do voluntário, nunca a saúde, nunca o motivo da liderança.
function linhaDoHistoricoParaResponsavel(r) {
  return {
    registroId: r.registroId, data: r.data, sala: r.salaNome, congregacao: r.congregacaoNome,
    entregueEm: r.entregueEm, retiradoEm: r.retiradoEm || null,
    situacao: r.situacao, rotuloSituacao: SITUACOES[r.situacao] || r.situacao,
    quemTrouxe: r.quemTrouxe || null, quemRetirou: r.quemRetirou || null,
    retiradaDivergente: !!r.divergente
  };
}

// ---------------------------------------------------------------
// Avisos (o e-mail sai do sistema e não se recolhe: aviso ao responsável leva só o primeiro nome da criança; aviso à liderança nunca leva nome de criança)
// ---------------------------------------------------------------

function textoRetiradaDivergentePais({ nomeCrianca, salaNome }) {
  return `Alguém que não está na sua lista de pessoas autorizadas pediu para retirar ${primeiroNome(nomeCrianca)} da sala ${salaNome}. A criança só sai se a liderança da congregação aprovar. Se foi você quem mandou essa pessoa, avise a liderança agora; se não foi, vá até a sala.`.slice(0, 1000);
}
function textoRetiradaDivergenteGestao({ salaNome }) {
  return `Há uma retirada divergente aguardando a sua aprovação na sala ${salaNome}: quem pediu não está na lista de quem pode retirar a criança. Abra Check-in infantil → Aprovações, confirme com o responsável pelo telefone cadastrado e decida. Enquanto não houver decisão, a criança continua na sala.`.slice(0, 1000);
}
function textoSegundaVia({ nomeCrianca, salaNome }) {
  return `Foi emitida a segunda via do código de retirada de ${primeiroNome(nomeCrianca)} na sala ${salaNome}, depois da conferência de documento e da confirmação de dois adultos da sala. O código antigo deixou de valer. Se não foi você ou alguém da sua lista, avise a liderança.`.slice(0, 1000);
}
function textoSemRetirada({ quantidade, salaNome, data }) {
  return `${quantidade} criança(s) da sala ${salaNome} ficaram sem retirada registrada depois do serviço de ${data}. Confira com a equipe da sala e regularize o registro: a retirada precisa estar registrada para a Igreja provar a quem a criança foi entregue.`.slice(0, 1000);
}
function textoProfessorRetirado({ turmaNome }) {
  return `Um professor saiu da turma ${turmaNome} por uma pendência na habilitação para servir com menores (a turma está marcada como "com menores"). Confira as vagas abertas e a regra dos dois adultos antes da próxima aula.`.slice(0, 1000);
}

// As referências dos avisos são números (Notificacoes.ReferenciaId é INT) e deduplicam: o mesmo fato não avisa duas vezes, e um fato novo (outra data, outro ciclo) reabre o aviso.
// Uma sala-serviço sem retirada avisa uma vez por (serviço, equipe); o serviço tem id de verdade e a equipe cabe em dois dígitos de resto.
function referenciaDeSemRetirada(servicoId, equipeId) { return (Number(servicoId) % 20000000) * 100 + (Number(equipeId) % 100); }
// Um aviso por (turma, professor, dia): se o professor volta e sai de novo em outro dia, avisa de novo. 40 000 turmas × 365 dias × 1 ano ainda cabem em INT com o resto abaixo.
function referenciaDeProfessor(turmaId, membroId, dataIso) {
  const dias = mm.ordinalDeIso(dataIso) % 4096;
  return ((Number(turmaId) % 1000) * 1000 + (Number(membroId) % 1000)) * 4096 % 2000000000 + dias;
}

module.exports = {
  ALFABETO_CODIGO, TAMANHO_CODIGO, FORMATO_CODIGO, TENTATIVAS_PADRAO, TENTATIVAS_TETO, JANELA_ANTES_MIN_PADRAO, JANELA_DEPOIS_HORAS_PADRAO, VISITANTE_CONTATO_DIAS_PADRAO,
  SEGUNDA_VIA_MINUTOS, MAX_CRIANCAS_POR_CHECKIN, MAX_AUTORIZADOS_VISITA, MAX_AUTORIZADOS_POR_CRIANCA, MAX_NOME, MAX_SAUDE, MAX_MOTIVO, MAX_REFERENCIA, LIMITE_LISTA,
  SIGLAS_PRAZO, PARENTESCOS, DOCUMENTOS, SITUACOES, TIPOS_EVENTO, MENSAGENS,
  idDe, validarNome, validarTelefone, validarParentesco, validarDocumento, validarSaudeTexto, dataIsoValida, validarNascimentoDeMenor, lerRefPessoa,
  gerarCodigo, normalizarCodigo, hashCodigo, confereCodigo, tentativasPermitidas,
  faixaDaIdade, idadeForaDaFaixa, agoraBrasiliaIso, minutosDe, prazosDoCheckin, avaliarJanela,
  avaliarLotacao, avaliarSaidaVoluntario,
  montarAutorizados, classificarRetirante,
  validarSala, validarCheckin, validarRetirada, validarDecisaoDivergencia, validarPedidoSegundaVia, validarAutorizado, validarSaudeDaCrianca,
  nomeParaEtiqueta, primeiroNome, montarEtiqueta, linhaDoHistoricoParaResponsavel,
  textoRetiradaDivergentePais, textoRetiradaDivergenteGestao, textoSegundaVia, textoSemRetirada, textoProfessorRetirado,
  referenciaDeSemRetirada, referenciaDeProfessor
};
