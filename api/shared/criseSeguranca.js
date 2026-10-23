// shared/criseSeguranca.js (v7.15 — Gestão de crise e porta-voz único; segurança da congregação) — a regra pura, sem banco.
//
// Regimento Art. 161-B: em crise institucional, escândalo na mídia, acidente grave ou evento de repercussão pública negativa, só o Pastor Presidente, ou um profissional de
// comunicação designado formalmente por ele, fala em nome da IEADESPA (§ 1º); qualquer outro diretor, pastor, advogado ou membro fica proibido de dar nota, entrevista ou opinião
// ligando o assunto à Igreja enquanto durar a crise (§ 2º). Contrato de 23/10/2026 (docs/plano/fase-7-saude-eventos-e-comunicacao.md, "## v7.15").
//
// Aqui ficam os catálogos, a validação de tudo o que chega da tela, os textos do aviso da crise e a avaliação da segurança de cada congregação (plano de emergência, simulado,
// vistoria predial, AVCB e seguro). O banco está em shared/criseSegurancaDb.js; a rota, em GestaoCriseSeguranca.
const crypto = require("crypto");
const { validarTexto } = require("./comunicacao");

const PERMISSAO_CRISE = "crise_gestao";
const PERMISSAO_SEGURANCA = "seguranca_congregacao";

// ---------------------------------------------------------------
// Catálogos
// ---------------------------------------------------------------

const PORTA_VOZ = { PRESIDENTE: "O próprio Pastor Presidente", DESIGNADO: "Profissional de comunicação designado pelo Presidente" };
const CANAIS_MANIFESTACAO = { NOTA: "Nota", ENTREVISTA: "Entrevista", REDE_SOCIAL: "Rede social", COLETIVA: "Coletiva de imprensa" };
const SITUACOES_DEMANDA = { RECEBIDA: "Recebida (aguardando o porta-voz)", RESPONDIDA: "Respondida pelo porta-voz", RECUSADA: "Recusada" };
const SITUACOES_RESPOSTA = ["RESPONDIDA", "RECUSADA"];
const TIPOS_SIMULADO = { EVACUACAO: "Evacuação", INCENDIO: "Incêndio", PRIMEIROS_SOCORROS: "Primeiros socorros", VIOLENCIA: "Violência (invasão, ameaça, atirador)" };
// O checklist da vistoria predial: todo item é respondido (em ordem), com a pendência escrita quando não está em ordem.
const ITENS_VISTORIA = {
  EXTINTORES: { rotulo: "Extintores", dica: "Na validade, no lugar, sinalizados e sem nada na frente." },
  SAIDAS: { rotulo: "Saídas de emergência", dica: "Desobstruídas, abrindo para fora e sem tranca durante o culto." },
  ILUMINACAO_EMERGENCIA: { rotulo: "Iluminação de emergência", dica: "Acende quando a energia cai (teste apertando o botão)." },
  QUADRO_ELETRICO: { rotulo: "Quadro elétrico", dica: "Fechado, identificado, sem fio exposto nem gambiarra." },
  ACESSIBILIDADE: { rotulo: "Acessibilidade", dica: "Rampa, corrimão e passagem livre para cadeira de rodas." },
  SINALIZACAO: { rotulo: "Sinalização", dica: "Placas de saída e de rota de fuga visíveis." },
  ALARME_INCENDIO: { rotulo: "Alarme de incêndio", dica: "Funciona (se o templo tiver)." },
  KIT_PRIMEIROS_SOCORROS: { rotulo: "Kit de primeiros socorros", dica: "Completo e dentro da validade." },
  GAS: { rotulo: "Gás", dica: "Botijão fora do salão, mangueira e registro na validade (se houver cozinha)." },
  ESTRUTURA: { rotulo: "Estrutura do prédio", dica: "Sem rachadura nova, infiltração no forro ou telha solta." }
};
const RESULTADOS_ITEM = { OK: "Em ordem", PENDENTE: "Pendente", NAO_SE_APLICA: "Não se aplica" };
const FUNCOES_EQUIPE = { COORDENACAO: "Coordenação", BRIGADA: "Brigada (incêndio e evacuação)", PRIMEIROS_SOCORROS: "Primeiros socorros", PORTARIA: "Portaria", ESTACIONAMENTO: "Estacionamento" };
// Sempre no plano de emergência, além dos contatos da congregação.
const CONTATOS_EMERGENCIA = [
  { nome: "Bombeiros", numero: "193" }, { nome: "SAMU", numero: "192" }, { nome: "Polícia Militar", numero: "190" }, { nome: "Defesa Civil", numero: "199" }
];

const MAX = {
  motivo: 300, nome: 150, contato: 150, ato: 300, resumoEncerramento: 500, resumo: 2000, link: 500, documento: 300, autorizadoPor: 150,
  veiculo: 150, pedido: 2000, resposta: 2000, rotas: 2000, pontos: 1000, contatosLocais: 1000, responsaveis: 1000, textoSimulado: 1000, observacoes: 1000,
  pendencia: 500, comoResolvida: 500, motivoAnulacao: 300
};
const MAX_PARTICIPANTES = 100000, MAX_DURACAO_MINUTOS = 1440;
const SIMULADO_RETROATIVO_ANOS = 5, EQUIPE_FUTURO_DIAS = 60, PRAZO_IMPRENSA_DIAS = 365;
const AVCB_AVISO_DIAS = 60;                  // o mesmo de GestaoImoveis: "a vencer" a partir de 60 dias
const PRAZOS_PADRAO = { SEGURANCA_PLANO_REVISAO_DIAS: 365, SEGURANCA_SIMULADO_MAX_DIAS: 365, SEGURANCA_VISTORIA_MAX_DIAS: 180 };

const proprio = (obj, chave) => typeof chave === "string" && Object.prototype.hasOwnProperty.call(obj, chave);
const inteiroPositivo = (v) => (typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 2147483647 ? v : null);
const RECUSA = (problema) => ({ problema });

// ---------------------------------------------------------------
// Texto, datas e links
// ---------------------------------------------------------------

// Texto obrigatório (min >= 1) ou opcional (min 0: vazio vira null). Linha única quando `linha`. `semChaves`: o texto entra no aviso da crise, onde {{...}} é campo a preencher.
function texto(v, { campo, max, min = 1, linha = false, semChaves = false }) {
  if (min === 0 && (v == null || (typeof v === "string" && v.trim() === ""))) return { texto: null };
  const r = validarTexto(v, { campo, max, min: Math.max(1, min) });
  if (r.problema) return r;
  if (linha && /\n/.test(r.texto)) return RECUSA(`${campo[0].toUpperCase()}${campo.slice(1)} é uma linha só.`);
  if (semChaves && /\{\{|\}\}/.test(r.texto)) return RECUSA(`${campo[0].toUpperCase()}${campo.slice(1)} não pode ter {{ }}.`);
  return r;
}
// Data AAAA-MM-DD que existe de verdade ("2026-02-30" não vira 2 de março).
function dataValida(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !isNaN(d) && d.toISOString().slice(0, 10) === v;
}
function somarDias(iso, dias) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}
function diasEntre(de, ate) {
  const [a1, m1, d1] = de.split("-").map(Number), [a2, m2, d2] = ate.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}
const diaDe = (v) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
// O dia de Brasília de um INSTANTE (DATETIME2 gravado em UTC): o ato das 22h30 do dia 23 é do dia 23, não do 24 (UTC-3, sem horário de verão desde 2019).
// Texto de só data ("2026-10-23") já é o dia: fica como está.
function diaBrasilia(v) {
  if (v == null || v === "") return null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d) ? null : new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10);
}
// Data e hora de Brasília como a tela manda ("2026-10-23T14:30", do campo datetime-local) -> instante (Date). Brasília não tem horário de verão desde 2019: UTC-3.
function dataHoraBrasilia(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  if (!dataValida(v.slice(0, 10))) return null;
  const [h, min] = v.slice(11).split(":").map(Number);
  if (h > 23 || min > 59) return null;
  const d = new Date(`${v}:00-03:00`);
  return isNaN(d) ? null : d;
}
// Endereço da internet da manifestação publicada: só http(s), sem espaço, sem usuário/senha.
function linkValido(v) {
  if (v == null || v === "") return { link: null };
  if (typeof v !== "string" || v.length > MAX.link || /\s/.test(v) || !/^https?:\/\//i.test(v)) return RECUSA("O link precisa começar com https:// (ou http://), sem espaços.");
  try {
    const u = new URL(v);
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password || !u.hostname.includes(".")) return RECUSA("Link inválido.");
  } catch { return RECUSA("Link inválido."); }
  return { link: v };
}
function idOpcional(v, rotulo) {
  if (v == null || v === "") return { id: null };
  const id = inteiroPositivo(v);
  return id ? { id } : RECUSA(`${rotulo} inválido.`);
}

// ---------------------------------------------------------------
// A crise
// ---------------------------------------------------------------

// O Porta-Voz Único. `presidente`: { membroId, nome } de quem é o Presidente hoje (o banco o acha na Liderança). Devolve { portaVoz } normalizado ou { problema }.
//   PRESIDENTE: o nome e a matrícula são os do Presidente; o contato (para onde encaminhar a imprensa) é obrigatório.
//   DESIGNADO: nome, contato e o ato da designação (§ 1º: "designado formalmente"); a matrícula é opcional (o profissional pode não ser membro).
function validarPortaVoz(entrada, { presidente } = {}) {
  const p = entrada && typeof entrada === "object" && !Array.isArray(entrada) ? entrada : {};
  if (!proprio(PORTA_VOZ, p.tipo)) return RECUSA("Escolha quem é o porta-voz: o Presidente ou o profissional designado.");
  const contato = texto(p.contato, { campo: "o contato para a imprensa (telefone ou e-mail)", max: MAX.contato, min: 5, linha: true, semChaves: true });
  if (contato.problema) return contato;
  if (p.tipo === "PRESIDENTE") {
    if (!presidente || !inteiroPositivo(presidente.membroId)) return RECUSA("Não há Presidente ativo na Liderança: cadastre-o em Permissões antes de abrir o regime.");
    return { portaVoz: { tipo: "PRESIDENTE", membroId: presidente.membroId, nome: String(presidente.nome || "").slice(0, MAX.nome), contato: contato.texto, ato: null } };
  }
  const nome = texto(p.nome, { campo: "o nome do porta-voz", max: MAX.nome, min: 3, linha: true, semChaves: true });
  if (nome.problema) return nome;
  const ato = texto(p.ato, { campo: "o ato da designação (número e data do ato do Presidente)", max: MAX.ato, min: 5, linha: true, semChaves: true });
  if (ato.problema) return ato;
  const m = idOpcional(p.membroId, "Matrícula do porta-voz");
  if (m.problema) return m;
  return { portaVoz: { tipo: "DESIGNADO", membroId: m.id, nome: nome.texto, contato: contato.texto, ato: ato.texto } };
}
function validarAbertura(dados, ctx) {
  const d = dados && typeof dados === "object" ? dados : {};
  const motivo = texto(d.motivo, { campo: "o motivo, em poucas palavras", max: MAX.motivo, min: 5 });
  if (motivo.problema) return motivo;
  const pv = validarPortaVoz(d.portaVoz, ctx);
  if (pv.problema) return pv;
  return { dados: { motivo: motivo.texto, portaVoz: pv.portaVoz } };
}
function validarEncerramento(dados) {
  const d = dados && typeof dados === "object" ? dados : {};
  const resumo = texto(d.resumo, { campo: "o resumo do encerramento", max: MAX.resumoEncerramento, min: 5, semChaves: true });
  if (resumo.problema) return resumo;
  return { dados: { resumo: resumo.texto } };
}

// Manifestação autorizada: o que o porta-voz disse, quando, por qual canal e com autorização de quem. `agora` limita a data ao presente (com 10 minutos de folga).
function validarManifestacao(dados, { agora = new Date(), abertaEm = null } = {}) {
  const d = dados && typeof dados === "object" ? dados : {};
  const quando = dataHoraBrasilia(d.dataHora);
  if (!quando) return RECUSA("Informe a data e a hora da manifestação.");
  if (quando.getTime() > agora.getTime() + 10 * 60000) return RECUSA("A manifestação não pode estar no futuro: registre depois de feita.");
  if (abertaEm && quando.getTime() < new Date(abertaEm).getTime() - 24 * 3600000) return RECUSA("A data é de antes da crise (registre só o que foi dito durante ela).");
  if (!proprio(CANAIS_MANIFESTACAO, d.canal)) return RECUSA("Escolha o canal: nota, entrevista, rede social ou coletiva.");
  const quem = texto(d.quemFalou, { campo: "quem falou", max: MAX.nome, min: 3, linha: true });
  if (quem.problema) return quem;
  const resumo = texto(d.resumo, { campo: "o resumo do que foi dito", max: MAX.resumo, min: 10 });
  if (resumo.problema) return resumo;
  const link = linkValido(d.link);
  if (link.problema) return link;
  const doc = texto(d.documento, { campo: "a referência do documento", max: MAX.documento, min: 0, linha: true });
  if (doc.problema) return doc;
  const aut = texto(d.autorizadoPor, { campo: "quem autorizou", max: MAX.autorizadoPor, min: 3, linha: true });
  if (aut.problema) return aut;
  const corrige = idOpcional(d.corrigeManifestacaoId, "Manifestação corrigida");
  if (corrige.problema) return corrige;
  return { dados: { dataHora: quando, canal: d.canal, quemFalou: quem.texto, resumo: resumo.texto, link: link.link, documento: doc.texto, autorizadoPor: aut.texto, corrigeManifestacaoId: corrige.id } };
}

// Demanda de imprensa que chegou a um líder (é assim que ele encaminha ao porta-voz).
function validarDemanda(dados, { agora = new Date() } = {}) {
  const d = dados && typeof dados === "object" ? dados : {};
  const veiculo = texto(d.veiculo, { campo: "o veículo (jornal, rádio, TV, site, perfil)", max: MAX.veiculo, min: 2, linha: true });
  if (veiculo.problema) return veiculo;
  const contato = texto(d.contato, { campo: "o contato de quem pediu (telefone ou e-mail)", max: MAX.contato, min: 5, linha: true });
  if (contato.problema) return contato;
  const pedido = texto(d.pedido, { campo: "o que foi pedido", max: MAX.pedido, min: 5 });
  if (pedido.problema) return pedido;
  let prazo = null;
  if (d.prazo != null && d.prazo !== "") {
    prazo = dataHoraBrasilia(d.prazo);
    if (!prazo) return RECUSA("Prazo inválido (data e hora).");
    const dif = prazo.getTime() - agora.getTime();
    if (dif < -7 * 86400000 || dif > PRAZO_IMPRENSA_DIAS * 86400000) return RECUSA("O prazo da imprensa vai de 7 dias atrás a 1 ano à frente.");
  }
  const corrige = idOpcional(d.corrigeDemandaId, "Demanda corrigida");
  if (corrige.problema) return corrige;
  return { dados: { veiculo: veiculo.texto, contato: contato.texto, pedido: pedido.texto, prazo, corrigeDemandaId: corrige.id } };
}
function validarResposta(dados) {
  const d = dados && typeof dados === "object" ? dados : {};
  if (!SITUACOES_RESPOSTA.includes(d.situacao)) return RECUSA("Escolha: respondida pelo porta-voz ou recusada.");
  const resposta = texto(d.resposta, { campo: d.situacao === "RECUSADA" ? "o motivo da recusa" : "a resposta dada", max: MAX.resposta, min: 5 });
  if (resposta.problema) return resposta;
  const subst = idOpcional(d.substituiRespostaId, "Resposta substituída");
  if (subst.problema) return subst;
  return { dados: { situacao: d.situacao, resposta: resposta.texto, substituiRespostaId: subst.id } };
}

// ---------------------------------------------------------------
// O aviso da crise (vai a toda a liderança ativa: sininho e celular na hora; e-mail pela fila da v7.12)
// ---------------------------------------------------------------

const dataBr = (iso) => { const [a, m, d] = String(iso).slice(0, 10).split("-"); return `${d}/${m}/${a}`; };
const ONDE_REGISTRAR = "Se a imprensa (jornal, rádio, TV, site, blog ou perfil de rede social) procurar você, não comente: passe o contato do porta-voz e registre o pedido no sistema, em Crise e segurança → Imprensa.";
// { titulo, corpo } do aviso. `evento`: ABERTA | PORTA_VOZ | ENCERRADA. O {{primeiro_nome}} é preenchido para cada pessoa pela comunicação.
function textoAviso({ evento, portaVoz, desde, resumo }) {
  const pv = portaVoz || {};
  const quem = pv.tipo === "PRESIDENTE" ? `o Pastor Presidente, ${pv.nome}` : `${pv.nome} (profissional de comunicação designado pelo Presidente${pv.ato ? `: ${pv.ato}` : ""})`;
  let titulo, corpo;
  if (evento === "ENCERRADA") {
    titulo = "Fim do regime de crise";
    corpo = `Paz do Senhor, {{primeiro_nome}}.\n\nO regime de crise declarado em ${dataBr(desde)} foi ENCERRADO pela Presidência. A Política de Porta-Voz Único (Regimento Art. 161-B) deixa de valer `
      + `para este assunto.${resumo ? `\n\n${resumo}` : ""}\n\nMesmo assim, fale em nome da Igreja só quando a sua função pedir.`;
  } else {
    titulo = evento === "PORTA_VOZ" ? "Crise: novo porta-voz único" : "Regime de crise: porta-voz único";
    corpo = `Paz do Senhor, {{primeiro_nome}}.\n\n${evento === "PORTA_VOZ" ? `O regime de crise declarado em ${dataBr(desde)} continua, e o PORTA-VOZ ÚNICO mudou.`
      : "A Presidência declarou REGIME DE CRISE em toda a IEADESPA."}\n\nEnquanto durar a crise, só fala em nome da Igreja ${quem}. Contato para a imprensa: ${pv.contato}.\n\n`
      + "Fica proibido a qualquer outro diretor, pastor, advogado ou membro dar nota, entrevista ou publicar opinião pessoal ligando o assunto à Igreja "
      + "(Regimento Art. 161-B, § 2º), sob pena de responsabilização.\n\n" + ONDE_REGISTRAR;
  }
  return { titulo, corpo };
}
// O rodapé do e-mail do aviso (no lugar do link "não quero mais receber": é aviso obrigatório).
const RODAPE_AVISO = "Você recebe este aviso porque é da liderança da Igreja: durante o regime de crise, por decisão da Igreja, com base no Art. 161-B do Regimento, toda a liderança fica sabendo quem é o porta-voz único.";
// O texto CURTO do celular (título até 120, mensagem até 180): o essencial — quem fala e o contato — no começo, nunca cortado no meio (revisão independente, v7.15).
function textoCelular({ evento, portaVoz }) {
  const pv = portaVoz || {};
  const corta = (t, n) => (t.length > n ? t.slice(0, n - 1) + "…" : t);
  if (evento === "ENCERRADA") return { titulo: "Fim do regime de crise", mensagem: "A crise foi encerrada pela Presidência: a vedação do Art. 161-B deixa de valer. Detalhes no sininho." };
  const nome = corta(String(pv.nome || ""), 60), contato = corta(String(pv.contato || ""), 60);
  const titulo = evento === "PORTA_VOZ" ? corta(`Crise: novo porta-voz — ${nome}`, 120) : corta(`Crise: só ${nome} fala pela Igreja`, 120);
  return { titulo, mensagem: corta(`Imprensa: encaminhe para ${contato}. Não comente o assunto (Art. 161-B). Detalhes no sininho.`, 180) };
}

// ---------------------------------------------------------------
// Segurança da congregação
// ---------------------------------------------------------------

function validarPlano(dados) {
  const d = dados && typeof dados === "object" ? dados : {};
  const rotas = texto(d.rotasEvacuacao, { campo: "as rotas de evacuação", max: MAX.rotas, min: 10 });
  if (rotas.problema) return rotas;
  const pontos = texto(d.pontosEncontro, { campo: "os pontos de encontro", max: MAX.pontos, min: 5 });
  if (pontos.problema) return pontos;
  const contatos = texto(d.contatosLocais, { campo: "os contatos da congregação", max: MAX.contatosLocais, min: 0 });
  if (contatos.problema) return contatos;
  const resp = texto(d.responsaveis, { campo: "os responsáveis", max: MAX.responsaveis, min: 3 });
  if (resp.problema) return resp;
  if (!(Number.isInteger(d.versaoAtual) && d.versaoAtual >= 0)) return RECUSA("Recarregue o plano antes de salvar.");
  return { dados: { rotasEvacuacao: rotas.texto, pontosEncontro: pontos.texto, contatosLocais: contatos.texto, responsaveis: resp.texto, versaoAtual: d.versaoAtual } };
}
function validarSimulado(dados, { hoje }) {
  const d = dados && typeof dados === "object" ? dados : {};
  if (!dataValida(d.data)) return RECUSA("Informe a data do simulado.");
  if (d.data > hoje) return RECUSA("O simulado não pode estar no futuro: registre depois de feito.");
  if (d.data < somarDias(hoje, -365 * SIMULADO_RETROATIVO_ANOS)) return RECUSA(`Simulado de mais de ${SIMULADO_RETROATIVO_ANOS} anos atrás não entra.`);
  if (!proprio(TIPOS_SIMULADO, d.tipo)) return RECUSA("Escolha o tipo do simulado.");
  if (!(Number.isInteger(d.participantes) && d.participantes >= 1 && d.participantes <= MAX_PARTICIPANTES)) return RECUSA("Participantes: um número inteiro de 1 em diante.");
  if (!(Number.isInteger(d.duracaoMinutos) && d.duracaoMinutos >= 1 && d.duracaoMinutos <= MAX_DURACAO_MINUTOS)) return RECUSA("Duração: de 1 a 1.440 minutos.");
  const bem = texto(d.correuBem, { campo: "o que correu bem", max: MAX.textoSimulado, min: 0 });
  if (bem.problema) return bem;
  const melhorar = texto(d.melhorar, { campo: "o que melhorar", max: MAX.textoSimulado, min: 0 });
  if (melhorar.problema) return melhorar;
  return { dados: { data: d.data, tipo: d.tipo, participantes: d.participantes, duracaoMinutos: d.duracaoMinutos, correuBem: bem.texto, melhorar: melhorar.texto } };
}
// O checklist inteiro: cada item do catálogo uma vez, com o resultado; o pendente leva o que falta.
function validarVistoria(dados, { hoje }) {
  const d = dados && typeof dados === "object" ? dados : {};
  if (!dataValida(d.data)) return RECUSA("Informe a data da vistoria.");
  if (d.data > hoje) return RECUSA("A vistoria não pode estar no futuro.");
  if (d.data < somarDias(hoje, -365)) return RECUSA("Vistoria de mais de 1 ano atrás não entra.");
  if (!Array.isArray(d.itens) || d.itens.length !== Object.keys(ITENS_VISTORIA).length) return RECUSA("Responda todos os itens do checklist.");
  const vistos = new Set(), itens = [];
  for (const x of d.itens) {
    if (!x || typeof x !== "object" || !proprio(ITENS_VISTORIA, x.item) || vistos.has(x.item)) return RECUSA("Responda todos os itens do checklist (cada um uma vez).");
    vistos.add(x.item);
    if (!proprio(RESULTADOS_ITEM, x.resultado)) return RECUSA(`${ITENS_VISTORIA[x.item].rotulo}: escolha em ordem, pendente ou não se aplica.`);
    let pendencia = null;
    if (x.resultado === "PENDENTE") {
      const p = texto(x.pendencia, { campo: `o que está pendente em "${ITENS_VISTORIA[x.item].rotulo}"`, max: MAX.pendencia, min: 3 });
      if (p.problema) return p;
      pendencia = p.texto;
    }
    itens.push({ item: x.item, resultado: x.resultado, pendencia });
  }
  const obs = texto(d.observacoes, { campo: "as observações", max: MAX.observacoes, min: 0 });
  if (obs.problema) return obs;
  return { dados: { data: d.data, itens, observacoes: obs.texto } };
}
function validarAnulacao(dados) {
  const d = dados && typeof dados === "object" ? dados : {};
  const m = texto(d.motivo, { campo: "o motivo da anulação", max: MAX.motivoAnulacao, min: 5 });
  return m.problema ? m : { dados: { motivo: m.texto } };
}
function validarResolucao(dados) {
  const d = dados && typeof dados === "object" ? dados : {};
  const c = texto(d.como, { campo: "como foi resolvida", max: MAX.comoResolvida, min: 3 });
  return c.problema ? c : { dados: { como: c.texto } };
}
function validarEquipe(dados, { hoje }) {
  const d = dados && typeof dados === "object" ? dados : {};
  if (!inteiroPositivo(d.membroId)) return RECUSA("Escolha a pessoa.");
  if (!proprio(FUNCOES_EQUIPE, d.funcao)) return RECUSA("Escolha a função.");
  if (!dataValida(d.desde)) return RECUSA("Informe desde quando.");
  if (d.desde > somarDias(hoje, EQUIPE_FUTURO_DIAS)) return RECUSA(`O início pode ser no máximo ${EQUIPE_FUTURO_DIAS} dias à frente.`);
  if (d.desde < "2000-01-01") return RECUSA("Data de início inválida.");
  let ate = null;
  if (d.ate != null && d.ate !== "") {
    if (!dataValida(d.ate)) return RECUSA("Data de término inválida.");
    if (d.ate < d.desde) return RECUSA("O término não pode ser antes do início.");
    if (d.ate < hoje) return RECUSA("O término já passou: registre só quem está na equipe.");
    ate = d.ate;
  }
  return { dados: { membroId: d.membroId, funcao: d.funcao, desde: d.desde, ate } };
}

// Os prazos (Catálogos → Prazos), com o padrão do contrato quando faltar.
function prazosDaSeguranca(lidos = {}) {
  const p = {};
  for (const [sigla, padrao] of Object.entries(PRAZOS_PADRAO)) {
    const n = Number(lidos[sigla]);
    p[sigla] = Number.isInteger(n) && n >= 1 && n <= 3650 ? n : padrao;
  }
  return p;
}
// VIGENTE | A_VENCER (60 dias) | VENCIDA | NAO_INFORMADA — o mesmo critério da tela de Imóveis.
function situacaoAvcb(fim, hoje) {
  const f = diaDe(fim);
  if (!f) return "NAO_INFORMADA";
  if (f < hoje) return "VENCIDA";
  return diasEntre(hoje, f) <= AVCB_AVISO_DIAS ? "A_VENCER" : "VIGENTE";
}

// A situação de segurança de UMA congregação e os alertas, a partir dos fatos (o banco os reúne):
//   plano: { versao, revisadoEm } | null · simulado: data do último (não anulado) | null · vistoria: data da última | null · pendencias: itens pendentes não resolvidos
//   imoveis: [{ descricao, avcbVigenciaFim, seguro: "VIGENTE" | "VENCIDO" | "SEM_SEGURO", seguroFim }]
// Cada alerta: { codigo, regra, texto }. `regra` é a chave do aviso do sininho que ele alimenta (null = só aparece no painel).
// `imoveis`: null = não se sabe (não avalia); [] = a congregação não tem imóvel no patrimônio (o AVCB não pode ser conferido: avisa).
function avaliarSeguranca({ hoje, plano, simulado, vistoria, pendencias = 0, imoveis = null, prazos = {} }) {
  const p = prazosDaSeguranca(prazos);
  const alertas = [];
  const out = { plano: null, simulado: null, vistoria: null, imoveis: [] };
  if (!plano) { alertas.push({ codigo: "PLANO_AUSENTE", regra: "SEGURANCA_PLANO_REVISAO", texto: "Sem plano de emergência." }); }
  else {
    // a revisão é um instante (gravado em UTC): o dia que vale é o de Brasília (a revisão das 22h do dia 23 não pode virar dia 24)
    const revisadoEm = diaBrasilia(plano.revisadoEm);
    const venceEm = somarDias(revisadoEm, p.SEGURANCA_PLANO_REVISAO_DIAS);
    out.plano = { versao: plano.versao, revisadoEm, venceEm, vencido: venceEm < hoje };
    if (venceEm < hoje) alertas.push({ codigo: "PLANO_VENCIDO", regra: "SEGURANCA_PLANO_REVISAO", texto: `Plano de emergência sem revisão desde ${dataBr(revisadoEm)}.` });
  }
  if (!simulado) alertas.push({ codigo: "SIMULADO_AUSENTE", regra: "SEGURANCA_SEM_SIMULADO", texto: "Nenhum simulado registrado." });
  else {
    const limite = somarDias(diaDe(simulado), p.SEGURANCA_SIMULADO_MAX_DIAS);
    out.simulado = { ultimo: diaDe(simulado), proximoAte: limite, atrasado: limite < hoje };
    if (limite < hoje) alertas.push({ codigo: "SIMULADO_ATRASADO", regra: "SEGURANCA_SEM_SIMULADO", texto: `Último simulado em ${dataBr(simulado)}: mais de ${p.SEGURANCA_SIMULADO_MAX_DIAS} dias.` });
  }
  if (!vistoria) alertas.push({ codigo: "VISTORIA_AUSENTE", regra: "SEGURANCA_SEM_VISTORIA", texto: "Nenhuma vistoria predial registrada." });
  else {
    const limite = somarDias(diaDe(vistoria), p.SEGURANCA_VISTORIA_MAX_DIAS);
    out.vistoria = { ultima: diaDe(vistoria), proximaAte: limite, atrasada: limite < hoje };
    if (limite < hoje) alertas.push({ codigo: "VISTORIA_ATRASADA", regra: "SEGURANCA_SEM_VISTORIA", texto: `Última vistoria em ${dataBr(vistoria)}: mais de ${p.SEGURANCA_VISTORIA_MAX_DIAS} dias.` });
  }
  if (pendencias > 0) alertas.push({ codigo: "PENDENCIAS", regra: null, texto: `${pendencias} pendência(s) da vistoria sem resolver.` });
  // v7.15 (revisão independente): sem imóvel no patrimônio, ou imóvel sem AVCB informado, também avisa — o "nunca cadastrado" não pode passar por "em dia"
  if (Array.isArray(imoveis) && !imoveis.length) alertas.push({ codigo: "SEM_IMOVEL", regra: "SEGURANCA_AVCB_SEGURO", texto: "Nenhum imóvel desta congregação no patrimônio: não há como conferir o AVCB nem o seguro (peça à Tesouraria para cadastrar)." });
  for (const i of imoveis || []) {
    const avcb = situacaoAvcb(i.avcbVigenciaFim, hoje);
    out.imoveis.push({ descricao: i.descricao, avcb, avcbVigenciaFim: diaDe(i.avcbVigenciaFim), avcbNumero: i.avcbNumero || null, seguro: i.seguro || "SEM_SEGURO", seguroFim: diaDe(i.seguroFim) });
    if (avcb === "VENCIDA") alertas.push({ codigo: "AVCB_VENCIDO", regra: "SEGURANCA_AVCB_SEGURO", texto: `AVCB vencido (${i.descricao}) desde ${dataBr(i.avcbVigenciaFim)}: o Regimento veda receber culto sem AVCB vigente.` });
    if (avcb === "NAO_INFORMADA") alertas.push({ codigo: "AVCB_NAO_INFORMADO", regra: "SEGURANCA_AVCB_SEGURO", texto: `AVCB não informado (${i.descricao}): cadastre o número e a validade em Financeiro → Imóveis.` });
    if (i.seguro === "VENCIDO") alertas.push({ codigo: "SEGURO_VENCIDO", regra: "SEGURANCA_AVCB_SEGURO", texto: `Seguro vencido (${i.descricao})${i.seguroFim ? ` desde ${dataBr(i.seguroFim)}` : ""}.` });
  }
  return { ...out, alertas };
}

// O aviso do sininho junta as congregações de UMA regra para UMA pessoa. A referência (que impede repetir o aviso) muda quando muda o mês ou a lista: a pessoa é lembrada
// uma vez por mês e na hora em que mais uma congregação entra na lista.
function referenciaDoResumo(regra, mes, congregacaoIds) {
  const base = `${regra}|${mes}|${[...congregacaoIds].map(Number).sort((a, b) => a - b).join(",")}`;
  return crypto.createHash("sha256").update(base).digest().readUInt32BE(0) & 0x7fffffff || 1;
}
const TEXTO_REGRA = {
  SEGURANCA_PLANO_REVISAO: "Plano de emergência ausente ou com a revisão anual vencida",
  SEGURANCA_SEM_SIMULADO: "Mais de 1 ano sem simulado (ou nenhum registrado)",
  SEGURANCA_SEM_VISTORIA: "Vistoria predial com mais de 6 meses (ou nenhuma registrada)",
  SEGURANCA_AVCB_SEGURO: "AVCB ou seguro do templo vencido"
};
function textoResumo(regra, nomes) {
  const lista = [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const mostrar = lista.slice(0, 12).join(", ") + (lista.length > 12 ? ` e mais ${lista.length - 12}` : "");
  return `${TEXTO_REGRA[regra] || regra}: ${mostrar}. Veja em Crise e segurança → Segurança.`.slice(0, 1000);
}

module.exports = {
  PERMISSAO_CRISE, PERMISSAO_SEGURANCA, PORTA_VOZ, CANAIS_MANIFESTACAO, SITUACOES_DEMANDA, SITUACOES_RESPOSTA, TIPOS_SIMULADO, ITENS_VISTORIA, RESULTADOS_ITEM, FUNCOES_EQUIPE,
  CONTATOS_EMERGENCIA, MAX, PRAZOS_PADRAO, AVCB_AVISO_DIAS, RODAPE_AVISO, TEXTO_REGRA,
  texto, dataValida, somarDias, diasEntre, diaDe, diaBrasilia, dataHoraBrasilia, linkValido, inteiroPositivo,
  validarPortaVoz, validarAbertura, validarEncerramento, validarManifestacao, validarDemanda, validarResposta, textoAviso, textoCelular,
  validarPlano, validarSimulado, validarVistoria, validarAnulacao, validarResolucao, validarEquipe, prazosDaSeguranca, situacaoAvcb, avaliarSeguranca,
  referenciaDoResumo, textoResumo
};
