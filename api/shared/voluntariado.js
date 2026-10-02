// shared/voluntariado.js (v7.5 — Escalas e voluntariado)
//
// Regra pura, sem banco. As escalas (v5.6) e a esteira de habilitação (v5.7) já existem; aqui ficam as quatro coisas que o
// Regimento exige e elas não tinham:
//
//  1) RODÍZIO VOLUNTÁRIO (Art. 135 §1º): grupos distintos se alternam na mesma tarefa, para que ninguém a faça de forma contínua
//     e habitual (o que descaracteriza a "habitualidade" do vínculo de emprego). O grupo de cada data sai de uma conta —
//     semanas desde uma data-âncora — e não de um ponteiro guardado, então gerar de novo, cancelar uma data ou pular um mês não
//     desalinha o revezamento. A trava de HABITUALIDADE acusa quem serve escala após escala na mesma equipe operacional.
//  2) TERMO DE ADESÃO (Art. 133 §8º; Lei 9.608/98, art. 2º): texto versionado com hash, aceite digital com IP/data/hora, as
//     outras formas de prova (ficha, e-mail/WhatsApp) e a ratificação coletiva ("Lista de Ouro").
//  3) REMOÇÃO DA ESCALA (Art. 133-D): a sanção do voluntário faltoso é só sair da escala — sem multa, desconto ou suspensão
//     trabalhista. Aqui vão as validações e os textos dos avisos; o efeito (cancelar as escalas futuras) é do banco.
//  4) AFASTAMENTO (Art. 133 §7º, II): direito de recusa sem penalidade — o texto do aviso ao líder quando a vaga abre.
const crypto = require("crypto");
const net = require("net");
const cal = require("./calendario");

const limpar = (v) => String(v == null ? "" : v).trim();
const sha256 = (txt) => crypto.createHash("sha256").update(txt).digest("hex");
const inteiroPositivo = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

// ---------------------------------------------------------------
// Termo de Adesão ao Serviço Voluntário
// ---------------------------------------------------------------

const TERMO_VERSAO = 1;
const TERMO_TITULO = "Termo de Adesão ao Serviço Voluntário";
const TERMO_ITENS = [
  {
    codigo: "NATUREZA", base: "Lei 9.608/1998, art. 1º e parágrafo único; Regimento Art. 133",
    texto: "Presto serviço à IEADESPA por vontade própria e por motivação religiosa, sem receber qualquer pagamento. Entre mim e a Igreja não existe, nem passará a existir, vínculo de emprego nem obrigação trabalhista, previdenciária ou afim."
  },
  {
    codigo: "OBJETO", base: "Lei 9.608/1998, art. 2º; Regimento Art. 133 §1º",
    texto: "O serviço é a cooperação nas atividades da Igreja — liturgia e culto, zeladoria e limpeza, portaria e recepção, cantina e cozinha, obras e mutirões, missões, ação social e administração — nas equipes e escalas em que eu aceitar servir. A lista é só exemplo: toda atividade em benefício da Igreja, sem fim lucrativo para mim, é serviço voluntário."
  },
  {
    codigo: "AUTONOMIA", base: "Regimento Art. 133 §7º",
    texto: "Não cumpro expediente nem controle de jornada. As escalas são acordos de cooperação, não ordens. Posso recusar uma escala, justificar uma ausência ou pedir afastamento temporário por motivo pessoal, profissional ou familiar, sem penalidade trabalhista, sujeitando-me apenas à disciplina eclesiástica e à fidelidade ministerial."
  },
  {
    codigo: "DESPESAS", base: "Lei 9.608/1998, art. 3º, parágrafo único; Regimento Art. 133 §4º",
    texto: "O transporte, a alimentação e o vestuário das atividades ordinárias são por minha conta. Só há ressarcimento em Missão Oficial Extraordinária, com Ordem de Serviço escrita e assinada ANTES da despesa, e pelo valor exato da nota fiscal."
  },
  {
    codigo: "SEM_REMUNERACAO", base: "Regimento Art. 133 §3º e Art. 135 §3º",
    texto: "Não recebo cachê, comissão, percentual de venda, “caixinha” nem oferta fixa pelo meu serviço, seja nos cultos, seja em cantinas, bazares e eventos de arrecadação."
  },
  {
    codigo: "REMOCAO", base: "Regimento Art. 133-D",
    texto: "A consequência para o voluntário desidioso, faltoso ou rebelde é a remoção da escala de serviço, comunicada pelo dirigente, bastando a perda da confiança ministerial. Não há multa, desconto nem suspensão trabalhista."
  },
  {
    codigo: "CIENCIA", base: "Regimento Art. 133 §§5º e 6º",
    texto: "Estou ciente de que a Diretoria pode pedir certidões de antecedentes, de que devo avisar a liderança se passar a responder a inquérito ou processo criminal, e de que as regras sobre uso de imagem, voz e propriedade intelectual estão no Art. 133 §6º do Regimento."
  },
  {
    codigo: "REGISTRO", base: "Regimento Art. 133 §8º, II",
    texto: "Entendo que marcar a caixa de aceite vale como assinatura eletrônica e que a Igreja guarda o IP, a data e a hora do meu aceite para fins de auditoria."
  }
];
// A frase do Regimento Art. 133 §8º, II, "a" — é ela que vale como assinatura.
const TERMO_ACEITE = "Li, aceito as normas estatutárias e concordo com o regime de trabalho voluntário";
const TERMO_HASH = sha256(JSON.stringify({ v: TERMO_VERSAO, t: TERMO_TITULO, i: TERMO_ITENS, a: TERMO_ACEITE }));

function termoVigente() {
  return { versao: TERMO_VERSAO, titulo: TERMO_TITULO, itens: TERMO_ITENS.map(i => ({ ...i })), aceite: TERMO_ACEITE, hash: TERMO_HASH };
}

// Texto que vai no CABEÇALHO da lista de presença / escala para valer como ratificação (Art. 133 §8º, III, "a").
const RATIFICACAO_VERSAO = 1;
const RATIFICACAO_TEXTO = "Ao assinar esta lista, ratifico o regime de Serviço Religioso Voluntário da IEADESPA (Regimento Interno, Art. 133), nos termos da Lei nº 9.608/1998: confirmo que sempre servi e continuarei servindo de forma voluntária e gratuita, sem vínculo de emprego, e convalido todo o período anterior de minha cooperação.";
const RATIFICACAO_HASH = sha256(JSON.stringify({ v: RATIFICACAO_VERSAO, t: RATIFICACAO_TEXTO }));

function ratificacaoVigente() {
  return { versao: RATIFICACAO_VERSAO, texto: RATIFICACAO_TEXTO, hash: RATIFICACAO_HASH };
}

const FORMAS_ADESAO = {
  CLICKWRAP: "Aceite digital (marcou a caixa, com IP, data e hora)",
  FICHA_FISICA: "Cláusula de Voluntariado na Ficha de Membro assinada",
  MENSAGERIA: "Termo enviado por e-mail ou WhatsApp, com resposta positiva expressa",
  LISTA_OURO: "Ratificação coletiva (Lista de Ouro)"
};
const FORMAS_REGISTRO_MANUAL = ["FICHA_FISICA", "MENSAGERIA"];
const CANAIS_MENSAGERIA = { EMAIL: "E-mail", WHATSAPP: "WhatsApp oficial da Secretaria" };
const ORIGENS_RATIFICACAO = {
  ASSEMBLEIA_GERAL: "Lista de presença de Assembleia Geral",
  REUNIAO_OBREIROS: "Lista de presença de Reunião de Obreiros",
  ESCALA_SERVICO: "Escala de serviço"
};
const MAX_SIGNATARIOS_MANUAIS = 500;
// A Lei 9.608/98 é de 18/02/1998: nenhuma lista de ratificação pode ser anterior a ela.
const DATA_MINIMA_RATIFICACAO = "1998-02-19";
// Tetos: nenhum rodízio, grupo ou criação em lote pode chegar perto do limite de parâmetros do SQL Server (2.100) nem sobrecarregar o banco.
const MAX_RODIZIOS_POR_CONGREGACAO = 50;
const MAX_MEMBROS_POR_GRUPO = 150;
const MAX_MEMBROS_AO_CRIAR_GRUPO = 100;

// IP do aceite digital (Art. 133 §8º, II, "b"). Valida com o analisador do próprio Node (net.isIP) e só aceita endereço PÚBLICO: loopback,
// rede privada, link-local, "não especificado" e documentação não provam de onde veio a conexão. O cabeçalho do Azure (x-azure-clientip) vale primeiro;
// depois vem o x-client-ip e, por último, o primeiro endereço público da cadeia x-forwarded-for. Um cliente pode escrever o que quiser em
// x-forwarded-for — por isso o aceite guarda TAMBÉM a cadeia inteira (ver cadeiaDeCabecalhos): a prova não depende de esse primeiro valor ser honesto.
function cabecalho(headers, nome) {
  const h = headers || {};
  const chave = Object.keys(h).find(k => k.toLowerCase() === nome);
  const v = chave ? h[chave] : undefined;
  return Array.isArray(v) ? v.join(",") : String(v == null ? "" : v);
}
function ipPublico(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;                    // não especificado, privado, loopback, multicast/reservado
    if (a === 100 && b >= 64 && b <= 127) return false;                                 // CGNAT
    if (a === 169 && b === 254) return false;                                           // link-local
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || (b === 0 && ip.startsWith("192.0.0.")) || ip.startsWith("192.0.2."))) return false;
    if (a === 198 && (b === 18 || b === 19 || ip.startsWith("198.51.100."))) return false;
    if (ip.startsWith("203.0.113.")) return false;
    return true;
  }
  if (net.isIPv6(ip)) {
    const baixo = ip.toLowerCase();
    if (baixo === "::" || baixo === "::1") return false;
    if (/^(fc|fd)/.test(baixo) || /^fe[89ab]/.test(baixo) || baixo.startsWith("ff")) return false; // ULA, link-local, multicast
    if (baixo.startsWith("2001:db8")) return false;
    const mapeado = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(baixo);
    if (mapeado) return ipPublico(mapeado[1]);
    return true;
  }
  return false;
}
// "1.2.3.4", "1.2.3.4:5678", "[2804::1]:443", "2804::1" -> o endereço, ou null se não for um IP válido.
function normalizarIp(texto) {
  const v = limpar(texto);
  if (!v) return null;
  let m = /^\[([^\]]+)\](?::\d+)?$/.exec(v);
  if (m) return net.isIPv6(m[1]) ? m[1] : null;
  m = /^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/.exec(v);
  if (m) return net.isIPv4(m[1]) ? m[1] : null;
  return net.isIP(v) ? v : null;
}
function extrairIp(headers) {
  const candidatos = [cabecalho(headers, "x-azure-clientip"), cabecalho(headers, "x-client-ip"), ...cabecalho(headers, "x-forwarded-for").split(",")];
  for (const c of candidatos) {
    const ip = normalizarIp(c);
    if (ip && ip.length <= 45 && ipPublico(ip)) return ip;
  }
  return null;
}
// Os cabeçalhos de origem como chegaram, limpos e cortados: guardados com a adesão para a prova não depender só do primeiro IP.
function cadeiaDeCabecalhos(headers) {
  const partes = {};
  for (const nome of ["x-azure-clientip", "x-client-ip", "x-forwarded-for"]) {
    const v = cabecalho(headers, nome).replace(/[^0-9a-fA-F:.,\[\] ]/g, "").trim().slice(0, 120);
    if (v) partes[nome] = v;
  }
  return Object.keys(partes).length ? JSON.stringify(partes).slice(0, 400) : null;
}

function validarAceiteDigital({ aceito, ip }) {
  if (aceito !== true) return { valido: false, mensagem: "Marque a caixa de aceite para aderir ao Termo." };
  if (!ip) return { valido: false, mensagem: "Não foi possível registrar a origem da conexão (IP), que o Regimento Art. 133 §8º, II exige no aceite digital. Tente de novo ou peça à Secretaria para registrar a sua adesão." };
  return { valido: true };
}

// Adesão registrada pela Secretaria: a ficha física (§8º, I) e a confirmação por e-mail/WhatsApp (§8º, II, "c").
function validarRegistroAdesao(d = {}, { hoje }) {
  const forma = limpar(d.forma).toUpperCase();
  if (!FORMAS_REGISTRO_MANUAL.includes(forma)) return { valido: false, mensagem: "A Secretaria registra a ficha física ou a confirmação por e-mail/WhatsApp. O aceite digital é feito pela própria pessoa, e a Lista de Ouro, na ratificação coletiva." };
  const dataAceite = limpar(d.dataAceite);
  if (!cal.dataIsoValida(dataAceite)) return { valido: false, mensagem: "Informe a data em que a pessoa assinou ou respondeu (AAAA-MM-DD)." };
  if (dataAceite > hoje) return { valido: false, mensagem: "A data da assinatura ou da resposta não pode estar no futuro." };
  const referencia = limpar(d.referencia);
  if (referencia.length < 3 || referencia.length > 200) return { valido: false, mensagem: forma === "FICHA_FISICA" ? "Informe onde está a ficha assinada (número, pasta ou arquivo digital) — de 3 a 200 caracteres." : "Informe onde a conversa foi arquivada (a mensagem de envio e a resposta), de 3 a 200 caracteres." };
  let canal = null;
  if (forma === "MENSAGERIA") {
    canal = limpar(d.canal).toUpperCase();
    if (!CANAIS_MENSAGERIA[canal]) return { valido: false, mensagem: "Informe o canal: e-mail ou WhatsApp oficial da Secretaria." };
  }
  return { valido: true, dados: { forma, dataAceite, referencia, canal } };
}

// Lista de Ouro (Art. 133 §8º, III): a assinatura em lista cujo cabeçalho traz a ratificação convalida o período anterior.
function validarRatificacao(d = {}, { hoje }) {
  const origem = limpar(d.origem).toUpperCase();
  if (!ORIGENS_RATIFICACAO[origem]) return { valido: false, mensagem: "Escolha a origem da lista: Assembleia Geral, Reunião de Obreiros ou Escala de serviço." };
  let sessaoId = null, servicoId = null;
  if (origem === "ESCALA_SERVICO") {
    servicoId = inteiroPositivo(d.servicoId);
    if (!servicoId) return { valido: false, mensagem: "Informe o serviço (a escala) cuja lista foi assinada." };
  } else {
    sessaoId = inteiroPositivo(d.sessaoId);
    if (!sessaoId) return { valido: false, mensagem: "Informe a sessão (assembleia ou reunião) cuja lista de presença foi assinada." };
  }
  const descricao = limpar(d.descricao);
  if (descricao.length < 5 || descricao.length > 200) return { valido: false, mensagem: "Descreva a lista (de 5 a 200 caracteres), por exemplo: Assembleia Geral Ordinária de 14/03/2026." };
  const dataLista = limpar(d.dataLista);
  if (!cal.dataIsoValida(dataLista)) return { valido: false, mensagem: "Informe a data da lista (AAAA-MM-DD)." };
  if (dataLista > hoje) return { valido: false, mensagem: "A data da lista não pode estar no futuro." };
  if (dataLista < DATA_MINIMA_RATIFICACAO) return { valido: false, mensagem: "A data da lista é anterior à Lei 9.608/98 (18/02/1998): confira." };
  if (d.cabecalhoConfirmado !== true) return { valido: false, mensagem: "A ratificação só vale se o CABEÇALHO da lista trouxe a menção expressa à ratificação do regime voluntário (Art. 133 §8º, III, “a”). Confirme que trouxe." };
  let extras = [];
  if (d.membroIds != null) {
    if (!Array.isArray(d.membroIds)) return { valido: false, mensagem: "membroIds deve ser uma lista de matrículas." };
    if (d.membroIds.length > MAX_SIGNATARIOS_MANUAIS) return { valido: false, mensagem: `Informe até ${MAX_SIGNATARIOS_MANUAIS} matrículas avulsas por registro.` };
    extras = d.membroIds.map(inteiroPositivo);
    if (extras.some(x => x == null)) return { valido: false, mensagem: "Há matrícula inválida na lista." };
    extras = [...new Set(extras)];
  }
  return { valido: true, dados: { origem, sessaoId, servicoId, descricao, dataLista, membroIds: extras } };
}

// A adesão guarda o hash do texto aceito no sistema. Só a versão vigente pode ser conferida contra o código; as anteriores ficam como
// "versão anterior" (o texto delas não está mais aqui — o hash é a prova de que não foi alterado depois do aceite). Ficha e mensagem
// não têm texto no sistema: a prova é o documento arquivado, apontado pela referência.
function avaliarIntegridadeAdesao({ forma, termoVersao, termoHash }) {
  if (forma === "FICHA_FISICA" || forma === "MENSAGERIA") return { status: "DOCUMENTO_EXTERNO", mensagem: "A prova é o documento arquivado, apontado na referência (não há texto guardado no sistema)." };
  const versaoVigente = forma === "LISTA_OURO" ? RATIFICACAO_VERSAO : TERMO_VERSAO;
  const hashVigente = forma === "LISTA_OURO" ? RATIFICACAO_HASH : TERMO_HASH;
  if (!termoHash) return { status: "SEM_HASH", mensagem: "Adesão sem hash do texto." };
  if (Number(termoVersao) !== versaoVigente) return { status: "VERSAO_ANTERIOR", mensagem: `Aceitou a versão ${termoVersao} do texto; a vigente é a ${versaoVigente}. O hash guardado prova o texto da época.` };
  if (termoHash !== hashVigente) return { status: "DIVERGENTE", mensagem: "O texto da versão vigente mudou sem trocar o número da versão: avise a equipe técnica." };
  return { status: "OK", mensagem: "Íntegra: o texto aceito é o da versão vigente." };
}

// ---------------------------------------------------------------
// Equipes e rodízio voluntário
// ---------------------------------------------------------------

const NATUREZAS = {
  LITURGIA: "Liturgia e louvor",
  ZELADORIA: "Zeladoria e limpeza",
  PORTARIA: "Portaria, recepção e segurança",
  COZINHA: "Cantina e cozinha",
  OUTRA: "Outra (sem classificação)"
};
// O revezamento é a regra onde o serviço é braçal e repetitivo (Art. 135): é onde "habitualidade" vira passivo trabalhista.
const NATUREZAS_OPERACIONAIS = ["ZELADORIA", "PORTARIA", "COZINHA"];
const DIAS_SEMANA = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const LIMITE_SEQUENCIA_PADRAO = 3;
const MAX_SEMANAS_GERACAO = 26;
const SEMANAS_GERACAO_PADRAO = 8;
const MAX_GRUPOS = 12;

const equipeExigeRevezamento = (natureza) => NATUREZAS_OPERACIONAIS.includes(natureza);

function validarNatureza(natureza) {
  const n = limpar(natureza).toUpperCase();
  return NATUREZAS[n] ? { valido: true, natureza: n } : { valido: false, mensagem: `Natureza inválida. Use uma de: ${Object.keys(NATUREZAS).join(", ")}.` };
}

function validarRodizio(d = {}) {
  const nome = limpar(d.nome);
  if (nome.length < 3 || nome.length > 100) return { valido: false, mensagem: "Dê um nome ao rodízio (de 3 a 100 caracteres), por exemplo: Limpeza do templo." };
  if (/[<>]/.test(nome)) return { valido: false, mensagem: "O nome do rodízio não pode ter os sinais < ou >." };
  const equipeId = inteiroPositivo(d.equipeId);
  if (!equipeId) return { valido: false, mensagem: "Escolha a equipe que cumpre este rodízio." };
  const diaSemana = Number(d.diaSemana);
  if (!Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6) return { valido: false, mensagem: "Escolha o dia da semana." };
  const hora = limpar(d.hora);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return { valido: false, mensagem: "Informe a hora no formato HH:MM." };
  const intervaloSemanas = d.intervaloSemanas == null || d.intervaloSemanas === "" ? 1 : Number(d.intervaloSemanas);
  if (!Number.isInteger(intervaloSemanas) || intervaloSemanas < 1 || intervaloSemanas > 4) return { valido: false, mensagem: "O intervalo é de 1 a 4 semanas." };
  const dataAncora = limpar(d.dataAncora);
  if (!cal.dataIsoValida(dataAncora)) return { valido: false, mensagem: "Informe a data da primeira escala do primeiro grupo (AAAA-MM-DD)." };
  if (cal.diaDaSemana(dataAncora) !== diaSemana) return { valido: false, mensagem: `A data de partida precisa cair numa ${DIAS_SEMANA[diaSemana].toLowerCase()}.` };
  return { valido: true, dados: { nome, equipeId, diaSemana, hora, intervaloSemanas, dataAncora } };
}

function validarNomeGrupo(nome) {
  const n = limpar(nome);
  if (/[<>]/.test(n)) return { valido: false, mensagem: "O nome do grupo não pode ter os sinais < ou >." };
  return n.length >= 1 && n.length <= 60 ? { valido: true, nome: n } : { valido: false, mensagem: "Dê um nome ao grupo (até 60 caracteres), por exemplo: Grupo A." };
}

// Grupos distintos se alternam (Art. 135 §1º, I): um rodízio de um grupo só não revezava ninguém.
function validarComposicao(grupos) {
  const ativos = (grupos || []).filter(g => g.ativo !== false);
  if (ativos.length < 2) return { valido: false, mensagem: "O rodízio precisa de pelo menos dois grupos distintos que se alternem (Regimento Art. 135 §1º, I)." };
  const vazio = ativos.find(g => !g.membros || g.membros < 1);
  if (vazio) return { valido: false, mensagem: `O grupo “${vazio.nome}” está sem voluntários.` };
  return { valido: true };
}

// A data e a hora de um serviço são "hora de parede" (a que a congregação vive), guardadas como se fossem UTC: assim o banco
// devolve exatamente o que foi digitado, em qualquer servidor.
function dataHoraDeParede(dataIso, hora) {
  return new Date(`${dataIso}T${hora}:00.000Z`);
}

function textoDataHora(valor) {
  const iso = valor instanceof Date ? valor.toISOString() : String(valor);
  return `${cal.formatarDataBr(iso.slice(0, 10))} às ${iso.slice(11, 16)}`;
}

const ocorrenciaPasso = (rodizio) => 7 * Number(rodizio.intervaloSemanas || 1);

// Quem serve na data: a conta é "quantas voltas completas desde a âncora", módulo o número de grupos. Devolve null se a data não
// é uma data do rodízio (antes da âncora, ou fora do passo).
function indiceDoGrupo({ dataAncora, intervaloSemanas = 1, dataIso, totalGrupos }) {
  if (!totalGrupos || totalGrupos < 1) return null;
  const dias = cal.diasEntre(dataAncora, dataIso);
  const passo = 7 * Number(intervaloSemanas);
  if (dias < 0 || dias % passo !== 0) return null;
  return (dias / passo) % totalGrupos;
}

// Plano de geração: as datas do rodízio entre `de` e `ate` (inclusive), cada uma com o grupo da vez. `existentes` são as datas que já
// têm serviço ativo do rodízio — ficam de fora e voltam em `jaExistem`, sem duplicar.
function planejarOcorrencias({ rodizio, grupos, de, ate, existentes = new Set() }) {
  const lista = (grupos || []).slice().sort((a, b) => a.ordem - b.ordem || a.grupoId - b.grupoId);
  const passo = ocorrenciaPasso(rodizio);
  const ocorrencias = [], jaExistem = [];
  if (lista.length === 0 || !cal.dataIsoValida(de) || !cal.dataIsoValida(ate) || ate < de) return { ocorrencias, jaExistem };
  const inicio = Math.max(0, cal.diasEntre(rodizio.dataAncora, de));
  let k = Math.ceil(inicio / passo);
  for (;;) {
    const dataIso = cal.somarDias(rodizio.dataAncora, k * passo);
    if (dataIso > ate) break;
    const g = lista[k % lista.length];
    if (existentes.has(dataIso)) jaExistem.push(dataIso);
    else ocorrencias.push({ dataIso, dataHora: `${dataIso}T${rodizio.hora}`, indiceGrupo: k % lista.length, grupoId: g.grupoId, grupoNome: g.nome });
    k++;
  }
  return { ocorrencias, jaExistem };
}

function validarGeracao(d = {}, { hoje }) {
  const semanas = d.semanas == null || d.semanas === "" ? SEMANAS_GERACAO_PADRAO : Number(d.semanas);
  if (!Number.isInteger(semanas) || semanas < 1 || semanas > MAX_SEMANAS_GERACAO) return { valido: false, mensagem: `Informe de 1 a ${MAX_SEMANAS_GERACAO} semanas.` };
  return { valido: true, dados: { de: hoje, ate: cal.somarDias(hoje, semanas * 7), semanas, publicar: d.publicar === true } };
}

// ---------------------------------------------------------------
// Trava de habitualidade (Art. 135 §1º, II)
// ---------------------------------------------------------------

// `servicos`: os serviços ativos da equipe, [{ servicoId, dataHora, membroIds[] }] (membroIds = quem tem alocação ativa).
// Sequência atual de cada pessoa = quantas escalas SEGUIDAS, contando de trás para a frente, ela está. Quem folgou na última
// escala tem sequência zero — o revezamento está funcionando. Só devolve quem chegou ao limite.
function analisarHabitualidade({ servicos, limite = LIMITE_SEQUENCIA_PADRAO }) {
  const ordenados = (servicos || []).slice().sort((a, b) => new Date(a.dataHora) - new Date(b.dataHora));
  if (ordenados.length === 0 || limite < 2) return [];
  const ultimo = ordenados[ordenados.length - 1];
  const resultado = [];
  for (const membroId of new Set(ultimo.membroIds || [])) {
    let n = 0;
    for (let i = ordenados.length - 1; i >= 0; i--) {
      if ((ordenados[i].membroIds || []).includes(membroId)) n++; else break;
    }
    if (n >= limite) resultado.push({ membroId, sequencia: n, desde: ordenados[ordenados.length - n].dataHora, ate: ultimo.dataHora });
  }
  return resultado.sort((a, b) => b.sequencia - a.sequencia || a.membroId - b.membroId);
}

function textoHabitualidade({ equipeNome, itens, limite }) {
  const quem = itens.map(i => `${i.nome} (${i.sequencia} seguidas)`).join(", ");
  return `Equipe ${equipeNome}: ${quem}. Pela regra do Art. 135 §1º, II, o revezamento existe para ninguém servir de forma contínua e habitual — organize um rodízio com grupos distintos ou escale outros voluntários (alerta a partir de ${limite} escalas seguidas).`;
}

// ---------------------------------------------------------------
// Remoção da escala e afastamento (Art. 133-D e Art. 133 §7º)
// ---------------------------------------------------------------

const TIPOS_MOTIVO_DESLIGAMENTO = ["PERDA_CONFIANCA", "MUDANCA", "INDISPONIBILIDADE", "SAIDA_DA_IGREJA", "OUTRO"];

function validarRemocao({ membroId, atorId, motivo, tipoMotivo }) {
  if (!inteiroPositivo(membroId)) return { valido: false, mensagem: "Informe o voluntário." };
  if (inteiroPositivo(membroId) === inteiroPositivo(atorId)) return { valido: false, mensagem: "Ninguém remove a si mesmo da escala. Para se afastar, declare a indisponibilidade ou fale com o dirigente." };
  const tipo = limpar(tipoMotivo).toUpperCase() || "PERDA_CONFIANCA";
  if (!TIPOS_MOTIVO_DESLIGAMENTO.includes(tipo)) return { valido: false, mensagem: `Tipo de motivo inválido. Use um de: ${TIPOS_MOTIVO_DESLIGAMENTO.join(", ")}.` };
  const m = limpar(motivo);
  if (m.length < 5 || m.length > 300) return { valido: false, mensagem: "Registre o motivo (de 5 a 300 caracteres): ele fica na ficha do voluntário, fora de qualquer processo disciplinar." };
  return { valido: true, dados: { membroId: inteiroPositivo(membroId), tipoMotivo: tipo, motivo: m } };
}

// Art. 133-D, III: "Irmão, você não está mais na escala ... a partir de hoje". O motivo NÃO vai no aviso — quem quiser conversar procura o dirigente.
function textoAvisoRemocao({ equipes, hoje }) {
  const onde = equipes.length === 1 ? `da equipe ${equipes[0]}` : `das equipes ${equipes.join(", ")}`;
  return `Você não está mais na escala ${onde}, a partir de hoje (${cal.formatarDataBr(hoje)}). As escalas futuras dessa equipe foram canceladas. Esta é uma decisão ministerial de confiança, sem qualquer desconto, multa ou penalidade trabalhista (Regimento Art. 133-D). Se quiser conversar, procure o seu dirigente.`;
}

function textoAvisoReintegracao({ equipeNome, hoje }) {
  return `Você voltou a fazer parte da equipe ${equipeNome}, a partir de hoje (${cal.formatarDataBr(hoje)}). Você volta a poder ser convidado para as escalas.`;
}

function textoVagaAberta({ membroNome, equipeNome, vagas, causa }) {
  const porque = causa === "AFASTAMENTO" ? "pediu afastamento (direito de recusa, Art. 133 §7º)"
    : causa === "RECUSA" ? "recusou a escala (direito de recusa, sem penalidade — Art. 133 §7º, II)"
    : "saiu da escala";
  if (vagas.length === 0) return `${membroNome} ${porque} na equipe ${equipeNome}. Não havia escalas futuras marcadas para ele(a).`;
  const datas = vagas.slice(0, 5).map(v => textoDataHora(v.dataHora)).join("; ");
  const mais = vagas.length > 5 ? ` e mais ${vagas.length - 5}` : "";
  return `${membroNome} ${porque} na equipe ${equipeNome}: ${vagas.length} vaga(s) em aberto — ${datas}${mais}. Cubra com outro voluntário: nos serviços de rodízio, combine com o grupo; nos demais, rode o auto-escalador.`;
}

function textoEscaladoNoRodizio({ rodizioNome, grupoNome, datas }) {
  const lista = datas.slice(0, 6).map(textoDataHora).join("; ");
  const mais = datas.length > 6 ? ` e mais ${datas.length - 6}` : "";
  return `Você foi escalado no rodízio “${rodizioNome}” (${grupoNome}): ${lista}${mais}. Aceite ou recuse em Meu Painel → Minhas Escalas — recusar é um direito, sem penalidade (Art. 133 §7º, II).`;
}

module.exports = {
  TERMO_VERSAO, TERMO_TITULO, TERMO_ITENS, TERMO_ACEITE, TERMO_HASH, termoVigente,
  RATIFICACAO_VERSAO, RATIFICACAO_TEXTO, RATIFICACAO_HASH, ratificacaoVigente,
  FORMAS_ADESAO, FORMAS_REGISTRO_MANUAL, CANAIS_MENSAGERIA, ORIGENS_RATIFICACAO, MAX_SIGNATARIOS_MANUAIS,
  DATA_MINIMA_RATIFICACAO, MAX_RODIZIOS_POR_CONGREGACAO, MAX_MEMBROS_POR_GRUPO, MAX_MEMBROS_AO_CRIAR_GRUPO,
  extrairIp, cadeiaDeCabecalhos, normalizarIp, ipPublico, validarAceiteDigital, validarRegistroAdesao, validarRatificacao, avaliarIntegridadeAdesao,
  NATUREZAS, NATUREZAS_OPERACIONAIS, DIAS_SEMANA, LIMITE_SEQUENCIA_PADRAO, MAX_SEMANAS_GERACAO, SEMANAS_GERACAO_PADRAO, MAX_GRUPOS,
  equipeExigeRevezamento, validarNatureza, validarRodizio, validarNomeGrupo, validarComposicao,
  dataHoraDeParede, textoDataHora, indiceDoGrupo, planejarOcorrencias, validarGeracao,
  analisarHabitualidade, textoHabitualidade,
  TIPOS_MOTIVO_DESLIGAMENTO, validarRemocao, textoAvisoRemocao, textoAvisoReintegracao, textoVagaAberta, textoEscaladoNoRodizio
};
