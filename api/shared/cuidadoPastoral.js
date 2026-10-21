// shared/cuidadoPastoral.js (v7.11 — Cuidado pastoral: filas com responsável, prazo e sigilo)
//
// Regimento Art. 128 §5º, II, b ("Busca Ativa" do visitante em até 48 horas); Art. 85 §3º, I (a visita nunca a sós); Art. 132 §1º, II (o Dirigente só vê quem é da congregação
// dele) e §2º, II (as anotações pastorais saem com o membro); LGPD arts. 7º, 11 e 18 (nota pastoral e pedido de oração são dado sensível de convicção religiosa e de saúde).
//
// Este módulo é a REGRA, pura (sem banco): os tipos de acompanhamento e os seus prazos, a escada do prazo vencido (Congregação → Área → Região → nível geral), a detecção de
// afastamento pelo padrão da PRÓPRIA pessoa, o sinal de risco nos textos que os membros mandam, quem lê cada nível de nota, a linha sem nome do boletim de oração e o que
// cada aviso diz. O banco (shared/cuidadoPastoralDb.js) só reúne os fatos e grava o que aqui se decide.
//
// Princípios: (1) todo item tem dono e prazo, e o prazo vencido chama ajuda em vez de sumir; (2) a pessoa acompanhada nunca vê o item nem as notas sobre ela; (3) nenhum aviso
// (o e-mail sai do sistema), auditoria ou log leva o texto de uma nota ou de um pedido; (4) o detector só mede o que o sistema vê (EBD e reuniões) e nunca abre abandono sozinho.
const vol = require("./voluntariado");
const cal = require("./calendario");

// ---------------------------------------------------------------
// Vocabulário
// ---------------------------------------------------------------

const MS_HORA = 3600000;
const MS_DIA = 24 * MS_HORA;
const MAX_NOME = 150;
const MAX_CONTATO = 150;
const MAX_MOTIVO = 300;
const MAX_OBSERVACAO = 300;
const MAX_NOTA = 2000;
const MAX_PEDIDO = 1000;
const MAX_BOLETIM = 200;
const MIN_TEXTO_BOLETIM = 10;
const MAX_ADIAR_DIAS = 30;                  // a liderança adia o prazo até 30 dias à frente, com motivo
const CONTATO_RETROATIVO_DIAS = 7;          // "liguei para ela no sábado": o contato pode ser registrado até 7 dias depois
const PRAZO_RISCO_HORAS = 24;               // o pedido com sinal de risco vira item urgente: 24 horas (o aviso já sai na hora)
const BOLETIM_DIAS = 14;                    // a linha aprovada fica 14 dias no boletim
const LEMBRETES_GERAIS_MAXIMO = 5;          // no nível geral, vencido de novo, o aviso se repete no máximo 5 vezes
const LIMITE_PEDIDOS_ORACAO_DIA = 10;       // por pessoa, em 24 horas (contra abuso; um pedido verdadeiro nunca chega perto)
const LIMITE_PEDIDOS_VISITA_DIA = 3;
const LIMITE_NOTAS_DIA = 60;                // quem escreve notas o dia inteiro está colando texto: o teto evita encher a tabela que não se apaga
const MAIORIDADE = vol.MAIORIDADE;

// Os tipos e o prazo de cada um. A sigla é a de Catálogos → Prazos; `horas: true` quando o número guardado é de horas.
const TIPOS = {
  VISITANTE: { rotulo: "Visitante", sigla: "CUIDADO_PRAZO_VISITANTE_HORAS", horas: true, padrao: 48, descricao: "Quem visitou a igreja: a \"Busca Ativa\" do Regimento (Art. 128 §5º) manda procurar em até 48 horas." },
  NOVO_CONVERTIDO: { rotulo: "Novo convertido", sigla: "CUIDADO_PRAZO_NOVO_CONVERTIDO_DIAS", horas: false, padrao: 7, descricao: "Quem aceitou a Jesus: acompanhar até a classe de novos convertidos e o discipulado." },
  AFASTAMENTO: { rotulo: "Membro afastado", sigla: "CUIDADO_PRAZO_AFASTAMENTO_DIAS", horas: false, padrao: 14, descricao: "Membro que deixou de vir (pela detecção do sistema ou porque alguém percebeu). Procurar antes que vire abandono." },
  PEDIDO_VISITA: { rotulo: "Pedido de visita", sigla: "CUIDADO_PRAZO_PEDIDO_VISITA_DIAS", horas: false, padrao: 7, descricao: "Alguém pediu uma visita da liderança." },
  PEDIDO_ORACAO: { rotulo: "Pedido de oração", sigla: "CUIDADO_PRAZO_PEDIDO_ORACAO_DIAS", horas: false, padrao: 3, descricao: "Quem pediu oração e pediu que alguém da liderança falasse com ele." },
  POS_INTERNACAO: { rotulo: "Pós-internação", sigla: "CUIDADO_PRAZO_POS_INTERNACAO_DIAS", horas: false, padrao: 3, descricao: "Quem está ou esteve internado: visitar no hospital ou em casa." }
};
const CODIGOS_TIPO = Object.keys(TIPOS);
// tipos que a liderança abre à mão (pedido de oração nasce de um pedido; os outros também podem nascer à mão)
const TIPOS_ABERTURA_MANUAL = ["VISITANTE", "NOVO_CONVERTIDO", "AFASTAMENTO", "PEDIDO_VISITA", "POS_INTERNACAO"];
// tipos em que a pessoa precisa estar no cadastro (os outros aceitam só o nome e o contato)
const TIPOS_SO_MEMBRO = ["AFASTAMENTO"];
// tipos com no máximo um item aberto por pessoa do cadastro (o índice único do banco é o mesmo)
const TIPOS_UM_ABERTO = ["NOVO_CONVERTIDO", "AFASTAMENTO", "PEDIDO_VISITA", "POS_INTERNACAO"];

const ORIGENS = {
  LIDERANCA: "Aberto pela liderança",
  DETECCAO: "Detectado pelo sistema (a frequência caiu)",
  PEDIDO_MEMBRO: "Pedido do próprio membro",
  PEDIDO_ORACAO: "Pedido de oração com pedido de contato"
};

const FORMAS_CONTATO = {
  LIGACAO: "Ligação",
  MENSAGEM: "Mensagem (WhatsApp, SMS ou e-mail)",
  VISITA_LAR: "Visita no lar",
  VISITA_HOSPITAL: "Visita no hospital",
  NO_CULTO: "Conversa no culto",
  OUTRO: "Outro"
};
const FORMAS_PRESENCIAIS = ["VISITA_LAR", "VISITA_HOSPITAL"];

const DESFECHOS_CONCLUSAO = {
  INTEGRADO: "Integrado: está vindo e participando",
  ACOMPANHADO: "Segue acompanhado pela liderança (fora da fila)",
  NAO_LOCALIZADO: "Não foi localizado",
  RECUSOU_CONTATO: "Não quis contato",
  ENCAMINHADO: "Encaminhado (outra congregação, assistência social, profissional)",
  OUTRO: "Outro"
};
const DESFECHOS_CANCELAMENTO = { DUPLICADO: "Duplicado (já existe outro item igual)", ENGANO: "Aberto por engano" };
// concluir um "membro afastado" assim mostra o caminho do abandono (v1.5), que segue manual
const DESFECHOS_ABANDONO = ["NAO_LOCALIZADO", "RECUSOU_CONTATO"];

const DEGRAUS = { CONGREGACAO: "Congregação (Dirigente)", AREA: "Área (Pastor de Área)", REGIAO: "Região (Superintendente Regional)", GERAL: "Nível geral (Diretoria)" };
const ORDEM_DEGRAUS = ["CONGREGACAO", "AREA", "REGIAO", "GERAL"];

const NIVEIS_NOTA = {
  EQUIPE: { rotulo: "Equipe", descricao: "A liderança do território e quem é responsável por um acompanhamento aberto desta pessoa." },
  LIDERANCA: { rotulo: "Liderança local", descricao: "Só a liderança com a permissão de cuidado pastoral no território (nunca o voluntário responsável)." },
  PASTORAL: { rotulo: "Somente pastor", descricao: "Só quem escreveu e quem, na liderança do território, tem o cargo de Pastor no cadastro. Abrir pede a confirmação reforçada." }
};
const CODIGOS_NIVEL_NOTA = Object.keys(NIVEIS_NOTA);

const CATEGORIAS_ORACAO = {
  SAUDE: { rotulo: "Saúde", frase: "pela saúde" },
  FAMILIA: { rotulo: "Família", frase: "pela família" },
  TRABALHO: { rotulo: "Trabalho e sustento", frase: "pelo trabalho e pelo sustento" },
  LUTO: { rotulo: "Luto", frase: "por conforto no luto" },
  ESPIRITUAL: { rotulo: "Vida espiritual", frase: "pela vida espiritual" },
  GRATIDAO: { rotulo: "Gratidão", frase: null },
  OUTRO: { rotulo: "Outro assunto", frase: "por uma necessidade" }
};
const PARA_QUEM = { PROPRIO: "Por mim", OUTRA_PESSOA: "Por outra pessoa" };

// Quem pediu e se sentiu em perigo lê isto NA HORA (o 188 e o 190 aparecem sempre na tela do pedido).
const CONTATOS_DE_AJUDA = [
  { nome: "CVV — Centro de Valorização da Vida", numero: "188", descricao: "De graça, 24 horas, todos os dias. Para quem está sofrendo ou pensando em tirar a própria vida." },
  { nome: "Polícia", numero: "190", descricao: "Se existe perigo agora." },
  { nome: "Central de Atendimento à Mulher", numero: "180", descricao: "De graça, 24 horas. Para a mulher que sofre violência." },
  { nome: "Disque 100", numero: "100", descricao: "De graça, 24 horas. Violência contra criança, adolescente, idoso ou pessoa com deficiência." }
];

// ---------------------------------------------------------------
// Pequenos auxiliares
// ---------------------------------------------------------------

const limpar = (v) => (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const temMarca = (s) => /[<>]/.test(s);
const idPositivo = (v) => vol.inteiroPositivo(v);
const comoData = (v) => (v instanceof Date ? v : typeof v === "string" || typeof v === "number" ? new Date(v) : null);
const instanteValido = (v) => { const d = comoData(v); return d && !Number.isNaN(d.getTime()) ? d : null; };
const booleano = (v) => v === true || v === 1 || v === "1" || v === "true";
const ehBooleano = (v) => v === true || v === false || v === 1 || v === 0 || v === "1" || v === "0" || v === "true" || v === "false";
function somarDiasIso(iso, dias) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}
// O fim do dia AAAA-MM-DD em Brasília (UTC−3, sem horário de verão desde 2019), como instante.
function fimDoDiaBrasilia(iso) {
  if (!cal.dataIsoValida(iso)) return null;
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d, 23 + 3, 59, 59));
}
// O dia AAAA-MM-DD em Brasília de um instante.
const diaBrasilia = (instante) => new Date(instante.getTime() - 3 * MS_HORA).toISOString().slice(0, 10);
const primeiroNome = (nome) => (limpar(nome).split(/\s+/)[0] || "").slice(0, 40);
// Texto livre que um membro manda: sem marcação (<, >) e dentro do tamanho. Devolve { texto } ou { mensagem }.
function textoLivre(v, { campo, min = 0, max, obrigatorio = false }) {
  if (v != null && typeof v !== "string") return { mensagem: `${campo} inválido.` };
  const t = limpar(v);
  if (!t) return obrigatorio ? { mensagem: `Escreva ${campo}.` } : { texto: null };
  if (temMarca(t)) return { mensagem: `${campo[0].toUpperCase()}${campo.slice(1)} não pode ter os sinais < e >.` };
  // caractere de controle ou invisível (o "espaço de largura zero" que parte um nome em dois e passa pela conferência do boletim); a quebra de linha e o tab valem
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f­​-‏‪-‮⁠-⁤﻿]/.test(t)) return { mensagem: `${campo[0].toUpperCase()}${campo.slice(1)} tem um caractere invisível ou de controle: apague e escreva de novo.` };
  if (t.length < min) return { mensagem: `${campo[0].toUpperCase()}${campo.slice(1)} está curto demais (pelo menos ${min} caracteres).` };
  if (t.length > max) return { mensagem: `${campo[0].toUpperCase()}${campo.slice(1)} pode ter no máximo ${max} caracteres.` };
  return { texto: t };
}

// ---------------------------------------------------------------
// Prazos
// ---------------------------------------------------------------

// Os números lidos de Catálogos → Prazos, com limites que nenhum valor digitado ultrapassa (o banco aceita de 1 a 3650 em qualquer sigla).
const PARAMETROS = {
  CUIDADO_PRAZO_DEGRAU_DIAS: { padrao: 3, min: 1, max: 30 },
  CUIDADO_DETECCAO_SEMANAS: { padrao: 6, min: 3, max: 26 },
  CUIDADO_DETECCAO_COSTUME_PCT: { padrao: 50, min: 10, max: 100 },
  CUIDADO_DETECCAO_QUEDA_PCT: { padrao: 60, min: 20, max: 100 }
};
const TETO_PRAZO_TIPO = { horas: 24 * 30, dias: 90 };
function prazosDoCuidado(lidos = {}) {
  const r = {};
  const fixar = (v, padrao, min, max) => { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : padrao; };
  for (const [codigo, t] of Object.entries(TIPOS)) r[t.sigla] = fixar(lidos[t.sigla], t.padrao, 1, t.horas ? TETO_PRAZO_TIPO.horas : TETO_PRAZO_TIPO.dias);
  for (const [sigla, p] of Object.entries(PARAMETROS)) r[sigla] = fixar(lidos[sigla], p.padrao, p.min, p.max);
  return r;
}
const SIGLAS_PRAZO = [...Object.values(TIPOS).map((t) => t.sigla), ...Object.keys(PARAMETROS)];

// O prazo de um item que nasce agora.
function prazoInicial(tipo, agora, prazos, { urgente = false } = {}) {
  const a = instanteValido(agora) || new Date();
  if (urgente) return new Date(a.getTime() + PRAZO_RISCO_HORAS * MS_HORA);
  const t = TIPOS[tipo];
  if (!t) return null;
  const n = (prazos && prazos[t.sigla]) || t.padrao;
  return new Date(a.getTime() + n * (t.horas ? MS_HORA : MS_DIA));
}

// { vencido, faixa: NORMAL|ATENCAO|VENCIDO, texto } — calculado na leitura (o prazo vence mesmo que a rotina não rode).
function situacaoDoPrazo(prazoEm, agora = new Date()) {
  const p = instanteValido(prazoEm), a = instanteValido(agora);
  if (!p || !a) return { vencido: false, faixa: "NORMAL", texto: "" };
  const restante = p.getTime() - a.getTime();
  const abs = Math.abs(restante);
  const quanto = abs >= 2 * MS_DIA ? `${Math.floor(abs / MS_DIA)} dias` : abs >= MS_HORA ? `${Math.floor(abs / MS_HORA)} h` : `${Math.max(1, Math.floor(abs / 60000))} min`;
  if (restante <= 0) return { vencido: true, faixa: "VENCIDO", texto: `vencido há ${quanto}` };
  return { vencido: false, faixa: restante <= MS_DIA ? "ATENCAO" : "NORMAL", texto: `vence em ${quanto}` };
}

// ---------------------------------------------------------------
// A escada do prazo vencido
// ---------------------------------------------------------------

// O próximo degrau acima de `atual` em que há alguém para receber (`comGente`: conjunto ou lista dos degraus que têm alguém com a permissão). O degrau vazio é pulado;
// null = não há mais para onde subir (o item já está no nível geral, ou ninguém acima tem a permissão).
function proximoDegrau(atual, comGente) {
  const tem = comGente instanceof Set ? comGente : new Set(comGente || []);
  const i = ORDEM_DEGRAUS.indexOf(atual);
  if (i < 0) return null;
  for (let j = i + 1; j < ORDEM_DEGRAUS.length; j++) if (tem.has(ORDEM_DEGRAUS[j])) return ORDEM_DEGRAUS[j];
  return null;
}

// O que a rotina diária faz com um item aberto e vencido: SUBIR (com o degrau novo), LEMBRAR (já no topo, ainda dentro dos lembretes) ou NADA.
function decidirEscada(item, comGente, agora = new Date()) {
  if (!item || item.Status !== "ABERTO") return { acao: "NADA" };
  const s = situacaoDoPrazo(item.PrazoEm, agora);
  if (!s.vencido) return { acao: "NADA" };
  const prox = proximoDegrau(item.Nivel, comGente);
  if (prox) return { acao: "SUBIR", de: item.Nivel, para: prox };
  if ((Number(item.LembretesGerais) || 0) < LEMBRETES_GERAIS_MAXIMO) return { acao: "LEMBRAR", de: item.Nivel, para: item.Nivel };
  return { acao: "NADA" };
}

// O prazo novo de quem subiu de degrau: o urgente (sinal de risco) continua com 24 horas a cada degrau; o comum ganha os dias de Catálogos (padrão 3).
function prazoDoDegrau(item, agora, prazos) {
  const a = instanteValido(agora) || new Date();
  if (item && item.Urgente) return new Date(a.getTime() + PRAZO_RISCO_HORAS * MS_HORA);
  return new Date(a.getTime() + ((prazos && prazos.CUIDADO_PRAZO_DEGRAU_DIAS) || PARAMETROS.CUIDADO_PRAZO_DEGRAU_DIAS.padrao) * MS_DIA);
}

// ---------------------------------------------------------------
// Validações das entradas
// ---------------------------------------------------------------

// Abrir um item à mão (liderança). Devolve { valido, mensagem } ou { valido:true, dados }.
function validarAbertura(corpo) {
  const d = corpo && typeof corpo === "object" ? corpo : {};
  const tipo = limpar(d.tipo);
  if (!TIPOS_ABERTURA_MANUAL.includes(tipo)) return { valido: false, mensagem: "Escolha o tipo do acompanhamento." };
  const congregacaoId = idPositivo(d.congregacaoId);
  if (!congregacaoId) return { valido: false, mensagem: "Escolha a congregação." };
  const membroId = d.membroId == null || d.membroId === "" ? null : idPositivo(d.membroId);
  if (d.membroId != null && d.membroId !== "" && !membroId) return { valido: false, mensagem: "Matrícula inválida." };
  const nome = textoLivre(d.pessoaNome, { campo: "o nome da pessoa", min: 2, max: MAX_NOME });
  if (nome.mensagem) return { valido: false, mensagem: nome.mensagem };
  const contato = textoLivre(d.pessoaContato, { campo: "o contato", min: 4, max: MAX_CONTATO });
  if (contato.mensagem) return { valido: false, mensagem: contato.mensagem };
  if (membroId && (nome.texto || contato.texto)) return { valido: false, mensagem: "Para quem é do cadastro, informe só a matrícula (o nome e o contato vêm do cadastro)." };
  if (!membroId && !nome.texto) return { valido: false, mensagem: "Informe a matrícula de quem é do cadastro, ou o nome de quem não é." };
  if (TIPOS_SO_MEMBRO.includes(tipo) && !membroId) return { valido: false, mensagem: "\"Membro afastado\" é para quem está no cadastro: informe a matrícula." };
  if (!membroId && !contato.texto) return { valido: false, mensagem: "Informe um contato (telefone ou e-mail) de quem não está no cadastro: sem ele ninguém consegue procurar a pessoa." };
  const motivo = textoLivre(d.motivo, { campo: "o motivo", min: 3, max: MAX_MOTIVO });
  if (motivo.mensagem) return { valido: false, mensagem: motivo.mensagem };
  const responsavelMembroId = d.responsavelMembroId == null || d.responsavelMembroId === "" ? null : idPositivo(d.responsavelMembroId);
  if (d.responsavelMembroId != null && d.responsavelMembroId !== "" && !responsavelMembroId) return { valido: false, mensagem: "Responsável inválido." };
  if (d.urgente != null && !ehBooleano(d.urgente)) return { valido: false, mensagem: "Urgente inválido." };
  return { valido: true, dados: { tipo, congregacaoId, membroId, pessoaNome: nome.texto, pessoaContato: contato.texto, motivo: motivo.texto, responsavelMembroId, urgente: booleano(d.urgente) } };
}

// Registrar um contato. `agora` vem do servidor. O contato pode ser de até 7 dias atrás, nunca do futuro.
function validarContato(corpo, { agora = new Date() } = {}) {
  const d = corpo && typeof corpo === "object" ? corpo : {};
  const forma = limpar(d.forma);
  if (!FORMAS_CONTATO[forma]) return { valido: false, mensagem: "Escolha como foi o contato." };
  if (!ehBooleano(d.conseguiu)) return { valido: false, mensagem: "Diga se conseguiu falar com a pessoa." };
  const acompanhante = textoLivre(d.acompanhante, { campo: "o nome de quem foi junto", min: 2, max: MAX_NOME });
  if (acompanhante.mensagem) return { valido: false, mensagem: acompanhante.mensagem };
  if (FORMAS_PRESENCIAIS.includes(forma) && !acompanhante.texto) {
    return { valido: false, mensagem: "Visita é sempre com outra pessoa (Regimento Art. 85 §3º: nunca a sós). Informe quem foi junto." };
  }
  const obs = textoLivre(d.observacao, { campo: "a observação", max: MAX_OBSERVACAO });
  if (obs.mensagem) return { valido: false, mensagem: obs.mensagem };
  const a = instanteValido(agora) || new Date();
  let em = a;
  if (d.data != null && d.data !== "") {
    const iso = limpar(d.data).slice(0, 10);
    if (!cal.dataIsoValida(iso) || limpar(d.data).length !== 10) return { valido: false, mensagem: "Data do contato inválida (AAAA-MM-DD)." };
    const hoje = diaBrasilia(a);
    if (iso > hoje) return { valido: false, mensagem: "O contato não pode ser de uma data futura." };
    if (iso < somarDiasIso(hoje, -CONTATO_RETROATIVO_DIAS)) return { valido: false, mensagem: `Registre o contato em até ${CONTATO_RETROATIVO_DIAS} dias.` };
    if (iso < hoje) em = new Date(fimDoDiaBrasilia(iso).getTime() - 12 * MS_HORA);    // meio-dia de Brasília daquele dia (a hora exata não importa)
  }
  return { valido: true, dados: { forma, conseguiu: booleano(d.conseguiu), acompanhante: acompanhante.texto, observacao: obs.texto, em } };
}

function validarConclusao(corpo) {
  const d = corpo && typeof corpo === "object" ? corpo : {};
  const desfecho = limpar(d.desfecho);
  if (!DESFECHOS_CONCLUSAO[desfecho]) return { valido: false, mensagem: "Escolha o desfecho do acompanhamento." };
  const obs = textoLivre(d.observacao, { campo: "a observação", max: MAX_OBSERVACAO });
  if (obs.mensagem) return { valido: false, mensagem: obs.mensagem };
  if (desfecho === "OUTRO" && !obs.texto) return { valido: false, mensagem: "Com o desfecho \"Outro\", escreva uma observação curta." };
  return { valido: true, dados: { desfecho, observacao: obs.texto } };
}

function validarCancelamento(corpo) {
  const d = corpo && typeof corpo === "object" ? corpo : {};
  const desfecho = limpar(d.desfecho);
  if (!DESFECHOS_CANCELAMENTO[desfecho]) return { valido: false, mensagem: "Escolha o motivo do cancelamento (duplicado ou engano)." };
  const motivo = textoLivre(d.motivo, { campo: "o motivo", min: 5, max: MAX_OBSERVACAO, obrigatorio: true });
  if (motivo.mensagem) return { valido: false, mensagem: motivo.mensagem };
  return { valido: true, dados: { desfecho, motivo: motivo.texto } };
}

// Adiar: o novo prazo é o FIM do dia escolhido (Brasília), depois de agora e até 30 dias à frente.
function validarAdiamento(corpo, { agora = new Date() } = {}) {
  const d = corpo && typeof corpo === "object" ? corpo : {};
  const iso = limpar(d.novoPrazo);
  if (iso.length !== 10 || !cal.dataIsoValida(iso)) return { valido: false, mensagem: "Informe a nova data do prazo (AAAA-MM-DD)." };
  const a = instanteValido(agora) || new Date();
  const novo = fimDoDiaBrasilia(iso);
  if (novo.getTime() <= a.getTime()) return { valido: false, mensagem: "O novo prazo precisa ser depois de agora." };
  if (iso > somarDiasIso(diaBrasilia(a), MAX_ADIAR_DIAS)) return { valido: false, mensagem: `O prazo pode ser adiado até ${MAX_ADIAR_DIAS} dias à frente.` };
  const motivo = textoLivre(d.motivo, { campo: "o motivo", min: 5, max: MAX_OBSERVACAO, obrigatorio: true });
  if (motivo.mensagem) return { valido: false, mensagem: motivo.mensagem };
  return { valido: true, dados: { novoPrazo: novo, motivo: motivo.texto } };
}

function validarNota(corpo) {
  const d = corpo && typeof corpo === "object" ? corpo : {};
  const nivel = limpar(d.nivel);
  if (!NIVEIS_NOTA[nivel]) return { valido: false, mensagem: "Escolha o nível de sigilo da nota." };
  const membroId = d.membroId == null || d.membroId === "" ? null : idPositivo(d.membroId);
  const itemId = d.itemId == null || d.itemId === "" ? null : idPositivo(d.itemId);
  if ((d.membroId != null && d.membroId !== "" && !membroId) || (d.itemId != null && d.itemId !== "" && !itemId)) return { valido: false, mensagem: "Identificador inválido." };
  if (!membroId && !itemId) return { valido: false, mensagem: "Informe sobre quem é a nota." };
  const texto = textoLivre(d.texto, { campo: "a nota", min: 3, max: MAX_NOTA, obrigatorio: true });
  if (texto.mensagem) return { valido: false, mensagem: texto.mensagem };
  const retificaNotaId = d.retificaNotaId == null || d.retificaNotaId === "" ? null : idPositivo(d.retificaNotaId);
  if (d.retificaNotaId != null && d.retificaNotaId !== "" && !retificaNotaId) return { valido: false, mensagem: "Nota corrigida inválida." };
  return { valido: true, dados: { nivel, membroId, itemId, texto: texto.texto, retificaNotaId } };
}

function validarPedidoOracao(corpo) {
  const d = corpo && typeof corpo === "object" ? corpo : {};
  const paraQuem = limpar(d.paraQuem) || "PROPRIO";
  if (!PARA_QUEM[paraQuem]) return { valido: false, mensagem: "Diga se o pedido é por você ou por outra pessoa." };
  const categoria = limpar(d.categoria);
  if (!CATEGORIAS_ORACAO[categoria]) return { valido: false, mensagem: "Escolha o assunto do pedido." };
  const texto = textoLivre(d.texto, { campo: "o pedido", min: 5, max: MAX_PEDIDO, obrigatorio: true });
  if (texto.mensagem) return { valido: false, mensagem: texto.mensagem };
  if (!ehBooleano(d.podeBoletim)) return { valido: false, mensagem: "Diga se o pedido pode ir ao boletim de oração (sem o seu nome) ou é só para a liderança." };
  if (d.querContato != null && !ehBooleano(d.querContato)) return { valido: false, mensagem: "Pedido de contato inválido." };
  return { valido: true, dados: { paraQuem, categoria, texto: texto.texto, podeBoletim: booleano(d.podeBoletim), querContato: booleano(d.querContato) } };
}

// A liderança registra um pedido recebido em mãos: de um membro (matrícula) ou de alguém de fora do cadastro (nome e contato).
function validarSolicitante(corpo) {
  const d = corpo && typeof corpo === "object" ? corpo : {};
  const congregacaoId = idPositivo(d.congregacaoId);
  if (!congregacaoId) return { valido: false, mensagem: "Escolha a congregação." };
  const membroId = d.membroId == null || d.membroId === "" ? null : idPositivo(d.membroId);
  if (d.membroId != null && d.membroId !== "" && !membroId) return { valido: false, mensagem: "Matrícula inválida." };
  const nome = textoLivre(d.solicitanteNome, { campo: "o nome de quem pediu", min: 2, max: MAX_NOME });
  if (nome.mensagem) return { valido: false, mensagem: nome.mensagem };
  const contato = textoLivre(d.solicitanteContato, { campo: "o contato de quem pediu", min: 4, max: MAX_CONTATO });
  if (contato.mensagem) return { valido: false, mensagem: contato.mensagem };
  if (membroId && (nome.texto || contato.texto)) return { valido: false, mensagem: "Para quem é do cadastro, informe só a matrícula." };
  if (!membroId && !nome.texto) return { valido: false, mensagem: "Informe a matrícula de quem pediu, ou o nome de quem não é do cadastro." };
  return { valido: true, dados: { congregacaoId, membroId, solicitanteNome: nome.texto, solicitanteContato: contato.texto } };
}

function validarPedidoVisita(corpo) {
  const d = corpo && typeof corpo === "object" ? corpo : {};
  const motivo = textoLivre(d.motivo, { campo: "o motivo da visita", min: 5, max: MAX_MOTIVO, obrigatorio: true });
  if (motivo.mensagem) return { valido: false, mensagem: motivo.mensagem };
  if (d.hospital != null && !ehBooleano(d.hospital)) return { valido: false, mensagem: "Internação inválida." };
  const contato = textoLivre(d.contato, { campo: "o melhor contato ou horário", max: MAX_CONTATO });
  if (contato.mensagem) return { valido: false, mensagem: contato.mensagem };
  return { valido: true, dados: { motivo: motivo.texto, hospital: booleano(d.hospital), contato: contato.texto } };
}

// ---------------------------------------------------------------
// O sinal de risco
// ---------------------------------------------------------------

// Minúsculas, sem acento, só letras e números separados por um espaço. "Não AGUENTO mais viver!!" → "nao aguento mais viver".
function normalizar(texto) {
  return String(texto == null ? "" : texto).replace(/[­​-‏⁠-⁤﻿]/g, "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
// A lista prefere errar para mais: um alarme falso custa um telefonema; um pedido de socorro perdido não tem volta. A liderança desmarca o alarme falso, com motivo.
// (Revisão independente, 21/10/2026: a primeira lista só pegava a forma "me bate"; o jeito comum de escrever — "ele bate em mim", "abusa da minha filha", "eu me mato",
// "não quero viver", "quero sumir" — passava. A tabela de frases do teste, de um lado e de outro, é a régua desta lista.)
const PADROES_AUTOLESAO = [
  /\bsuicid/, /\b(me|se) matar\b/, /\bmatar me\b/, /\bme mato\b/, /\btirar (a )?(minha |propria |minha propria )?vida\b/,
  /\b(acabar|dar fim|por fim|por um fim) (com|a|na|em) (a )?minha (propria )?vida\b/, /\bacabar com tudo\b/,
  /\bnao (quero|aguento|consigo|suporto|tenho vontade de)( mais)? viver\b/, /\b(cansei|cansada|cansado) de viver\b/, /\bdesist(ir|i|indo) (da vida|de viver)\b/, /\bsem vontade de viver\b/,
  /\b(quero|queria|vontade de|pensando em|penso em|desejo de|prefiro|melhor eu) morrer\b/, /\bse eu morresse\b/, /\bmelhor (eu )?morrer\b/,
  /\b(quero|queria|preferia|prefiro) (estar|ficar) mort[oa]\b/, /\bpensamentos? (de|sobre) morte\b/,
  /\b(quero|queria|vontade de|vou) sumir\b/, /\bsumir (de vez|para sempre|pra sempre)\b/, /\bnao quero mais (estar aqui|acordar|existir)\b/, /\bnao queria (ter nascido|existir)\b/,
  /\bme (cortar|corto|cortei|cortando|enforcar|enforco|jogar|jogo|ferir|firo|feri)\b/, /\benforcar\b/, /\bme machuc(ar|o|ei|ando)\b/, /\bauto ?mutila/, /\bauto ?lesa/,
  /\bcort(ar|ei|o|ando) (os |meus |o |meu )?puls/, /\bpular (d[ao]s?|de) (predio|ponte|janela|viaduto|apartamento|sacada)\b/, /\boverdose\b/,
  /\b(tomar|tomei|tomo|vou tomar) (todos os|muitos|varios|uma caixa de|um monte de|a cartela de|a caixa de)( de)? remedios?\b/, /\b(caixa|cartela|vidro) (inteira |inteiro )?de remedios?\b/,
  /\bveneno\b/, /\bchumbinho\b/, /\bvida (nao tem|sem) sentido\b/, /\bnao vale a pena viver\b/
];
const VITIMAS = "(em mim|nela|nele|neles|nelas|na gente|em nos|n[ao]s? (minh[ao]s?|meus?|nossa|nosso)|n[ao]s? (filh|crianc|menin|mae|esposa|mulher|sobrinh|net|entead|bebe))";
const PADROES_VIOLENCIA = [
  /\bme (bate|bateu|batem|bateram|batia|espanca|espancou|agride|agrediu|ameaca|ameacou|machuca|machucou|empurra|empurrou|estuprou|violentou|abusou|abusa|forca|forcou|prende|prendeu|tranca|trancou|chuta|chutou|esgana|esganou|enforca|enforcou)\b/,
  new RegExp(`\\bbat(e|eu|em|ia|endo|eram) ${VITIMAS}`), /\b(apanho|apanhei|apanhando|apanha|apanhou|apanhava|apanham)\b/, /\bespanc/, /\bagred/, /\bagress(ao|oes|or|ora|iv)/,
  /\bviolencia\b/, /\bviolentad/, /\bviolentou\b/, /\babus[a-z]*/, /\bestupr/, /\bmolest/, /\bassedi/, /\bpedofil/, /\bexplora[a-z]* sexual/, /\bpartes intimas\b/,
  /\b(toca|tocou|tocando|passa a mao|passou a mao) (n[ao]s? |em )?(minh[ao]s? |meus? |a |o )?(partes|nela|nele|crianca|menin|filh|sobrinh|net|entead)/,
  /\b(mexe|mexeu|mexendo) com (a |o )?(crianca|menin|minha filha|meu filho|sobrinh|net|entead)/,
  /\bameac\w* de morte\b/, /\b(vai|quer|ameaca|ameacou|prometeu|jurou|disse que vai) (me )?matar\b/, /\bmatar (a gente|nos|meus?|minhas?|os filhos|as criancas)\b/,
  /\b(soco|socos|tapa|tapas|surra|surras|murro|murros|chute|chutes)\b/, /\bmedida protetiva\b/, /\bmaria da penha\b/, /\bcarcere privado\b/,
  /\b(me|nos) (tranca|trancou|trancava)\b/, /\b(mantem|me deixa|deixa a gente) (presa|preso|presos|presas|trancad)/,
  /\b(tenho|tem|sinto|tenha|temos) medo (dele|dela|do meu (marido|pai|padrasto|namorado|companheiro|ex|filho)|da minha (mae|madrasta|companheira|esposa)|de voltar (para|pra) casa)\b/
];
const PADROES_CRIANCA = [/\b(crianca|criancas|filh[oa]s?|menin[oa]s?|sobrinh[oa]s?|net[oa]s?|bebe|menor de idade|adolescentes?|entead[oa]s?)\b/];
// Quem escreve sobre violência e cita alguém da igreja (o pastor, o dirigente, um obreiro, o professor da EBD): o caso fica só com o nível geral — a pessoa citada pode ser
// justamente quem receberia o aviso, leria o texto e poderia desmarcar o risco (revisão independente, 21/10/2026; o mesmo princípio da v7.8).
const PADROES_LIDERANCA = [/\b(pastor|pastora|pr|dirigente|presbitero|diacono|diaconisa|evangelista|obreiro|obreira|missionari[oa]|lider|lideranca|professor|professora|tio da ebd|tia da ebd|secretari[oa] da igreja|tesoureir[oa])\b/];

// { risco, autolesao, violencia, crianca, liderancaCitada } — `crianca` e `liderancaCitada` só valem junto com violência (a criança manda para a Proteção de crianças, v7.8; a
// liderança citada deixa o caso só com o nível geral).
function avaliarRisco(...textos) {
  const t = ` ${normalizar(textos.filter((x) => typeof x === "string").join(" "))} `;
  const autolesao = PADROES_AUTOLESAO.some((p) => p.test(t));
  const violencia = PADROES_VIOLENCIA.some((p) => p.test(t));
  const crianca = violencia && PADROES_CRIANCA.some((p) => p.test(t));
  const liderancaCitada = violencia && PADROES_LIDERANCA.some((p) => p.test(t));
  return { risco: autolesao || violencia, autolesao, violencia, crianca, liderancaCitada };
}
// O texto cita esta pessoa pelo nome? (o primeiro nome E mais uma parte do nome, cada uma com 3 letras ou mais: "o Jorge Souza" acusa; só "Jorge", não)
function citaPeloNome(texto, nome) {
  const palavras = new Set(normalizar(texto).split(" "));
  const partes = normalizar(nome).split(" ").filter((p) => p.length >= 3 && !PARTICULAS.has(p));
  return partes.length >= 2 && palavras.has(partes[0]) && partes.slice(1).some((p) => palavras.has(p));
}

// ---------------------------------------------------------------
// O boletim de oração (linha sem nome)
// ---------------------------------------------------------------

// A linha gerada pelo assunto e pela congregação: nunca pelo texto do pedido (que pode ter nomes, diagnóstico, endereço).
function linhaDoBoletim({ categoria, paraQuem, congregacaoNome }) {
  const c = CATEGORIAS_ORACAO[categoria] || CATEGORIAS_ORACAO.OUTRO;
  const onde = limpar(congregacaoNome) ? `da Congregação ${limpar(congregacaoNome)}` : "da nossa igreja";
  if (categoria === "GRATIDAO") return `Alguém ${onde} agradece a Deus e pede que a igreja agradeça junto.`;
  return paraQuem === "OUTRA_PESSOA" ? `Alguém ${onde} pede oração ${c.frase} de uma pessoa querida.` : `Alguém ${onde} pede oração ${c.frase}.`;
}

// O moderador pode reescrever a linha, mas a reescrita não pode trazer o nome de quem pediu nem de quem o pedido cita (`nomes`: os nomes completos conhecidos).
// Cada parte com 3 letras ou mais conta ("Maria", "Souza"); "da", "de" e "dos" não, nem as palavras do nome da congregação (`congregacaoNome`), que a própria linha gerada
// leva (a irmã "Maria Central" da Congregação Central: "central" não acusa, "maria" acusa).
const PARTICULAS = new Set(["da", "de", "do", "das", "dos", "e"]);
// As palavras de duas letras do português que não são nome (o "Zé" e a "Lu" acusam; o "da", o "em" e o "ao", não).
const CURTAS_COMUNS = new Set(["da", "de", "do", "as", "os", "ao", "em", "na", "no", "um", "se", "ou", "eu", "me", "te", "ja", "so", "la", "ha", "lhe", "pr", "e", "a", "o"]);
// Diagnóstico não vai ao boletim (a linha é lida em voz alta e impressa): a reescrita que traz um destes termos é recusada.
const TERMOS_DE_SAUDE = /\b(cancer|tumor|metastase|quimio|hiv|aids|depressao|depressiv|ansiedade|psiquiatr|bipolar|esquizofren|autis|dependencia|alcoolism|drogas?|gravidez|gravida|aborto|infarto|avc|derrame|cirurgia (de|no|na) (seio|mama|utero|prostata)|uti|terminal)/;
function validarTextoBoletim(texto, { nomes = [], congregacaoNome = "" } = {}) {
  const t = textoLivre(texto, { campo: "a linha do boletim", min: MIN_TEXTO_BOLETIM, max: MAX_BOLETIM, obrigatorio: true });
  if (t.mensagem) return { valido: false, mensagem: t.mensagem };
  const daCongregacao = new Set(normalizar(congregacaoNome).split(" "));
  const palavras = new Set(normalizar(t.texto).split(" ").filter((p) => !daCongregacao.has(p)));
  for (const nome of nomes) {
    for (const parte of normalizar(nome).split(" ")) {
      if (parte.length >= 2 && !PARTICULAS.has(parte) && !CURTAS_COMUNS.has(parte) && palavras.has(parte)) return { valido: false, mensagem: "A linha do boletim não pode ter o nome de quem pediu: o boletim é sem nome." };
    }
  }
  if (TERMOS_DE_SAUDE.test(` ${normalizar(t.texto)} `)) return { valido: false, mensagem: "A linha do boletim não leva diagnóstico nem detalhe de saúde: escreva só \"pela saúde\" (o texto do pedido fica com a liderança)." };
  return { valido: true, texto: t.texto };
}

// ---------------------------------------------------------------
// A detecção de afastamento pelo padrão da própria pessoa
// ---------------------------------------------------------------

const DETECCAO_BASE_DIAS = 182;             // ~6 meses de base, antes das semanas recentes
const DETECCAO_MIN_BASE = 6;                // oportunidades mínimas no período de base (sem isso não há costume)
const DETECCAO_MIN_RECENTES = 3;            // e nas semanas recentes (sem isso não há o que comparar)
const DETECCAO_MAX_POR_CONGREGACAO = 5;     // itens novos por congregação por dia (a fila não amanhece entupida)
const DETECCAO_CARENCIA_DIAS = 90;          // item de afastamento encerrado há menos que isto: não reabre
const FONTES = { EBD: "EBD", REUNIAO: "reuniões" };

// `oportunidades`: [{ data: "AAAA-MM-DD" | Date, presente: bool, fonte: "EBD"|"REUNIAO" }]. Um dia com mais de uma oportunidade conta como uma (presente se veio a alguma).
// Devolve { sinal, base:{presencas,oportunidades,taxa}, recente:{...}, queda, resumo }.
function avaliarFrequencia(oportunidades, { hoje, semanas = PARAMETROS.CUIDADO_DETECCAO_SEMANAS.padrao, costumePct = PARAMETROS.CUIDADO_DETECCAO_COSTUME_PCT.padrao,
  quedaPct = PARAMETROS.CUIDADO_DETECCAO_QUEDA_PCT.padrao } = {}) {
  const vazio = { sinal: false, base: { presencas: 0, oportunidades: 0, taxa: null }, recente: { presencas: 0, oportunidades: 0, taxa: null }, queda: null, resumo: "" };
  if (!cal.dataIsoValida(hoje)) return vazio;
  const inicioRecente = somarDiasIso(hoje, -semanas * 7);
  const inicioBase = somarDiasIso(inicioRecente, -DETECCAO_BASE_DIAS);
  const porDia = new Map();
  const fontes = new Set();
  for (const o of oportunidades || []) {
    if (!o) continue;
    const dia = o.data instanceof Date ? o.data.toISOString().slice(0, 10) : String(o.data || "").slice(0, 10);
    if (!cal.dataIsoValida(dia) || dia < inicioBase || dia > hoje) continue;
    porDia.set(dia, !!porDia.get(dia) || !!o.presente);
    if (FONTES[o.fonte]) fontes.add(o.fonte);
  }
  const base = { presencas: 0, oportunidades: 0 }, recente = { presencas: 0, oportunidades: 0 };
  for (const [dia, presente] of porDia) {
    const alvo = dia >= inicioRecente ? recente : base;
    alvo.oportunidades++;
    if (presente) alvo.presencas++;
  }
  base.taxa = base.oportunidades ? base.presencas / base.oportunidades : null;
  recente.taxa = recente.oportunidades ? recente.presencas / recente.oportunidades : null;
  const r = { ...vazio, base, recente };
  if (base.oportunidades < DETECCAO_MIN_BASE || recente.oportunidades < DETECCAO_MIN_RECENTES) return r;
  if (base.taxa < costumePct / 100) return r;                                       // quem sempre veio pouco não "caiu"
  const limite = base.taxa * (1 - quedaPct / 100);
  r.queda = base.taxa - recente.taxa;
  if (recente.taxa > limite + 1e-9) return r;
  const pct = (x) => `${Math.round(x * 100)}%`;
  const deOnde = ["EBD", "REUNIAO"].filter((f) => fontes.has(f)).map((f) => FONTES[f]).join(" e ") || "frequência";
  r.sinal = true;
  r.resumo = `${deOnde[0].toUpperCase()}${deOnde.slice(1)}: antes ${base.presencas} de ${base.oportunidades} (${pct(base.taxa)}); nas últimas ${semanas} semanas ${recente.presencas} de ${recente.oportunidades} (${pct(recente.taxa)}).`;
  return r;
}

// ---------------------------------------------------------------
// Quem lê e quem escreve cada nível de nota
// ---------------------------------------------------------------

// `ctx`: { membroId (quem lê), gestao (liderança com a permissão que alcança a pessoa), pastor (cargo PASTOR no cadastro), responsavelAberto (é responsável por um item
// aberto desta pessoa) }. A pessoa acompanhada é tirada ANTES (para ela as notas não existem).
function podeLerNota(nota, ctx) {
  if (!nota || !ctx) return false;
  if (Number(nota.AutorMembroId) === Number(ctx.membroId)) return true;
  if (nota.Nivel === "EQUIPE") return !!(ctx.gestao || ctx.responsavelAberto);
  if (nota.Nivel === "LIDERANCA") return !!ctx.gestao;
  if (nota.Nivel === "PASTORAL") return !!(ctx.gestao && ctx.pastor);
  return false;
}
function podeEscreverNota(nivel, ctx) {
  if (!ctx || !NIVEIS_NOTA[nivel]) return false;
  if (ctx.gestao) return true;
  return nivel === "EQUIPE" && !!ctx.responsavelAberto;
}
const notaPedeFator = (nivel) => nivel === "PASTORAL";
// A correção nunca rebaixa o sigilo: a nota que corrige é do mesmo nível ou de um mais restrito que a corrigida (revisão independente, 21/10/2026).
const ORDEM_SIGILO = { EQUIPE: 1, LIDERANCA: 2, PASTORAL: 3 };
const podeCorrigir = (nivelNovo, nivelCorrigida) => !!ORDEM_SIGILO[nivelNovo] && !!ORDEM_SIGILO[nivelCorrigida] && ORDEM_SIGILO[nivelNovo] >= ORDEM_SIGILO[nivelCorrigida];

// Quem pode ser nomeado responsável. `p`: { membroId, status, nascimento, congregacaoId } da pessoa indicada; `item`: { congregacaoId, membroId (acompanhado),
// acompanhadoMenor }; `alcancaPorLideranca`: a pessoa tem liderança com a permissão que alcança a congregação; `bloqueioReservado`: pendência reservada à Diretoria (v7.8).
function avaliarResponsavel(p, item, { hoje, alcancaPorLideranca = false, bloqueioReservado = false } = {}) {
  if (!p || !item) return { ok: false, mensagem: "Pessoa não encontrada." };
  if (p.status !== "ATIVO") return { ok: false, mensagem: "O responsável precisa ser membro ativo." };
  if (item.membroId && Number(item.membroId) === Number(p.membroId)) return { ok: false, mensagem: "A própria pessoa acompanhada não pode ser a responsável." };
  const idade = vol.idadeEmAnos(p.nascimento, hoje);
  if (idade == null || idade < MAIORIDADE) return { ok: false, mensagem: "O responsável precisa ser maior de idade (com a data de nascimento no cadastro)." };
  if (!alcancaPorLideranca && Number(p.congregacaoId) !== Number(item.congregacaoId)) return { ok: false, mensagem: "O responsável precisa ser da mesma congregação (ou da liderança que alcança a congregação)." };
  if (item.acompanhadoMenor && bloqueioReservado) return { ok: false, mensagem: "Esta pessoa não pode acompanhar um menor de idade agora. Escolha outro responsável." };
  return { ok: true };
}

// ---------------------------------------------------------------
// Os avisos (o e-mail sai do sistema: nada de nota, texto de pedido, diagnóstico nem tipo sensível)
// ---------------------------------------------------------------

function textoAtribuido({ pessoaNome, congregacaoNome, prazoTexto }) {
  const quem = primeiroNome(pessoaNome) || "uma pessoa";
  return `Você foi nomeado responsável por acompanhar ${quem}${limpar(congregacaoNome) ? ` (Congregação ${limpar(congregacaoNome)})` : ""}${prazoTexto ? `; o prazo ${prazoTexto}` : ""}. `
    + "Abra Meu Painel → Cuidado para ver o contato, o motivo e o que já foi feito.";
}
function textoResumo({ novos = 0, vencendo = 0, vencidos = 0, abertos = 0 }) {
  const partes = [];
  if (novos) partes.push(`${novos} ${novos === 1 ? "novo" : "novos"}`);
  if (vencendo) partes.push(`${vencendo} vencendo em 24 horas`);
  if (vencidos) partes.push(`${vencidos} ${vencidos === 1 ? "vencido" : "vencidos"}`);
  return `Seus acompanhamentos pastorais: ${abertos} em aberto${partes.length ? ` (${partes.join(", ")})` : ""}. Abra Meu Painel → Cuidado.`;
}
function textoDegrau({ congregacaoNome, para, diasVencido }) {
  const onde = limpar(congregacaoNome) ? ` da Congregação ${limpar(congregacaoNome)}` : "";
  const quando = Number(diasVencido) > 0 ? ` (vencido há ${diasVencido} ${Number(diasVencido) === 1 ? "dia" : "dias"})` : "";
  return `Um acompanhamento pastoral${onde} passou do prazo${quando} e subiu para ${para === "GERAL" ? "o nível geral" : `a ${DEGRAUS[para] || "liderança"}`}. `
    + "Abra Cuidado pastoral → Fila: veja quem é o responsável e ajude ou troque o responsável.";
}
// O item que nasce sem quem o receba na congregação (não há Dirigente, ou a pessoa acompanhada É o Dirigente) sobe na hora para o degrau de cima.
function textoSemResponsavel({ congregacaoNome, para }) {
  const onde = limpar(congregacaoNome) ? ` na Congregação ${limpar(congregacaoNome)}` : "";
  return `Um acompanhamento pastoral novo${onde} não tem quem o receba na congregação e veio para ${para === "GERAL" ? "o nível geral" : `a ${DEGRAUS[para] || "liderança"}`}. `
    + "Abra Cuidado pastoral → Fila (Sem responsável) e nomeie alguém.";
}
function textoModeracao({ quantos, congregacaoNome }) {
  return `${quantos} ${quantos === 1 ? "pedido de oração espera" : "pedidos de oração esperam"} moderação${limpar(congregacaoNome) ? ` na Congregação ${limpar(congregacaoNome)}` : ""}. Abra Cuidado pastoral → Pedidos de oração.`;
}
function textoRisco({ congregacaoNome, crianca = false }) {
  return `Chegou um pedido com SINAL DE RISCO${limpar(congregacaoNome) ? ` na Congregação ${limpar(congregacaoNome)}` : ""}. Atenda agora: abra Cuidado pastoral → Pedidos de oração → Sinal de risco (o acompanhamento urgente está na Fila → Urgentes). `
    + "Se a pessoa corre perigo agora: Polícia 190; CVV 188 (24 horas)."
    + (crianca ? " O pedido fala de criança ou adolescente junto com violência: registre também em Proteção de crianças (a lei manda comunicar ao Conselho Tutelar imediatamente)." : "");
}
// O que a resposta diz a quem pediu, depois do aviso de risco (a regra da Trava 7-B: "avisada" só quando o aviso saiu do app).
function textoAvisoRisco(aviso) {
  if (Number((aviso || {}).externas) > 0) return "A liderança foi avisada agora.";
  return "Não conseguimos avisar a liderança agora: procure o Dirigente ou o pastor pessoalmente.";
}

// Referência estável para os avisos diários (o banco não repete o mesmo aviso, para a mesma pessoa, com a mesma referência): o número do dia desde 01/01/2020.
function referenciaDoDia(hojeIso) {
  if (!cal.dataIsoValida(hojeIso)) return null;
  const [a, m, d] = hojeIso.split("-").map(Number);
  return Math.round((Date.UTC(a, m - 1, d) - Date.UTC(2020, 0, 1)) / MS_DIA) + 1;
}

module.exports = {
  TIPOS, CODIGOS_TIPO, TIPOS_ABERTURA_MANUAL, TIPOS_SO_MEMBRO, TIPOS_UM_ABERTO, ORIGENS, FORMAS_CONTATO, FORMAS_PRESENCIAIS, DESFECHOS_CONCLUSAO, DESFECHOS_CANCELAMENTO,
  DESFECHOS_ABANDONO, DEGRAUS, ORDEM_DEGRAUS, NIVEIS_NOTA, CODIGOS_NIVEL_NOTA, CATEGORIAS_ORACAO, PARA_QUEM, CONTATOS_DE_AJUDA, FONTES,
  MAX_NOME, MAX_CONTATO, MAX_MOTIVO, MAX_OBSERVACAO, MAX_NOTA, MAX_PEDIDO, MAX_BOLETIM, MAX_ADIAR_DIAS, CONTATO_RETROATIVO_DIAS, PRAZO_RISCO_HORAS, BOLETIM_DIAS,
  LEMBRETES_GERAIS_MAXIMO, LIMITE_PEDIDOS_ORACAO_DIA, LIMITE_PEDIDOS_VISITA_DIA, LIMITE_NOTAS_DIA, MAIORIDADE,
  DETECCAO_BASE_DIAS, DETECCAO_MIN_BASE, DETECCAO_MIN_RECENTES, DETECCAO_MAX_POR_CONGREGACAO, DETECCAO_CARENCIA_DIAS, PARAMETROS, SIGLAS_PRAZO,
  prazosDoCuidado, prazoInicial, situacaoDoPrazo, proximoDegrau, decidirEscada, fimDoDiaBrasilia, diaBrasilia, primeiroNome, somarDiasIso,
  validarAbertura, validarContato, validarConclusao, validarCancelamento, validarAdiamento, validarNota, validarPedidoOracao, validarSolicitante, validarPedidoVisita,
  normalizar, avaliarRisco, citaPeloNome, podeCorrigir, prazoDoDegrau, linhaDoBoletim, validarTextoBoletim, avaliarFrequencia, podeLerNota, podeEscreverNota, notaPedeFator, avaliarResponsavel,
  textoAtribuido, textoResumo, textoDegrau, textoSemResponsavel, textoModeracao, textoRisco, textoAvisoRisco, referenciaDoDia
};
