// shared/discipulado.js (v8.5 — Trilha de discipulado) — regra PURA (sem banco): a caminhada de uma pessoa, o funil por congregação, a validação do catálogo e quando
// o próximo passo vira acompanhamento. O banco está em shared/discipuladoDb.js; o desenho, em docs/plano/fase-8-ministerial-afm.md.
//
// Regimento Art. 70 §4º e §5º (Curso de Discipulado da AFM; Discipulado Pós-Batismal no batismo de urgência); Art. 80, IV (o curso antes do batismo); Art. 128 (a classe
// de novos convertidos mede a congregação).

const FONTES = {
  MARCO: "Marco do perfil",
  BATISMO_AGUAS: "Batismo nas águas (data do cadastro)",
  TRILHA: "Trilha de formação concluída",
  SERVICO_VOLUNTARIO: "Primeiro serviço voluntário (escala realizada)"
};
const DIAS_PARADO_PADRAO = 90;          // "parado": nenhum passo há 90 dias
const JANELA_ACOMPANHAMENTO_DIAS = 180;  // só vira acompanhamento quem deu um passo nos últimos 180 dias (o membro antigo não inunda a fila)
const MAX_NOVOS_POR_CONGREGACAO = 20;    // por dia, por congregação
const DIA_MS = 24 * 60 * 60 * 1000;

const dataIso = (v) => {
  if (v == null || v === "") return null;
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};
const somarDias = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);
const diasEntre = (de, ate) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / DIA_MS);

// A caminhada de uma pessoa. `etapas`: as ATIVAS, [{ etapaId, chave, nome, ordem, fonte, geraAcompanhamento, preRequisitos: [etapaId] }] (qualquer ordem).
// `fatos`: Map etapaId -> { data } (a data em que a etapa foi feita; null = feita sem data conhecida). Devolve as etapas em ordem com `feita`, `data` e
// `foraDeOrdem` (feita antes de um pré-requisito — o batismo de urgência antes do curso, Art. 70 §5º), o próximo passo (a primeira pendente), o último passo e se começou.
function caminhada(etapas, fatos) {
  const ordenadas = [...(etapas || [])].sort((a, b) => a.ordem - b.ordem || a.etapaId - b.etapaId);
  const feitas = new Map();
  for (const e of ordenadas) {
    const f = fatos && fatos.get(e.etapaId);
    if (f) feitas.set(e.etapaId, f);
  }
  const nomeDe = new Map(ordenadas.map((e) => [e.etapaId, e.nome]));
  let ultimoPasso = null;
  const lista = ordenadas.map((e) => {
    const f = feitas.get(e.etapaId);
    const data = f ? dataIso(f.data) : null;
    if (data && (!ultimoPasso || data > ultimoPasso)) ultimoPasso = data;
    const faltando = (e.preRequisitos || []).filter((p) => nomeDe.has(p) && !feitas.has(p)).map((p) => nomeDe.get(p));
    return { etapaId: e.etapaId, chave: e.chave, nome: e.nome, ordem: e.ordem, fonte: e.fonte, fonteRotulo: FONTES[e.fonte] || e.fonte,
      feita: !!f, data, foraDeOrdem: !!f && faltando.length > 0, preRequisitosPendentes: faltando };
  });
  const proximo = lista.find((e) => !e.feita) || null;
  const base = ordenadas.find((e) => proximo && e.etapaId === proximo.etapaId);
  return {
    etapas: lista,
    proximo: proximo ? { etapaId: proximo.etapaId, chave: proximo.chave, nome: proximo.nome, geraAcompanhamento: !!(base && base.geraAcompanhamento) } : null,
    ultimoPasso,
    iniciada: feitas.size > 0,
    concluida: lista.length > 0 && !proximo
  };
}

// Abrir o acompanhamento do próximo passo? Só para quem COMEÇOU, deu um passo recente (dentro da janela) e tem um próximo passo que pede acompanhamento.
function deveAcompanhar(c, hojeIso, janelaDias = JANELA_ACOMPANHAMENTO_DIAS) {
  if (!c || !c.iniciada || !c.proximo || !c.proximo.geraAcompanhamento || !c.ultimoPasso) return false;
  return c.ultimoPasso >= somarDias(hojeIso, -janelaDias) && c.ultimoPasso <= hojeIso;
}

// O funil de UMA congregação. `pessoas`: [{ membroId, caminhada }] (as caminhadas já calculadas). Só entra quem começou. Para cada etapa: quantos fizeram e quantos estão
// parados ANTES dela (é o próximo passo e o último passo foi há mais de `diasParado`).
function funil(pessoas, etapas, { hojeIso, diasParado = DIAS_PARADO_PADRAO }) {
  const ordenadas = [...(etapas || [])].sort((a, b) => a.ordem - b.ordem || a.etapaId - b.etapaId);
  const iniciadas = (pessoas || []).filter((p) => p.caminhada && p.caminhada.iniciada);
  const limite = somarDias(hojeIso, -diasParado);
  const porEtapa = ordenadas.map((e) => ({ etapaId: e.etapaId, nome: e.nome, ordem: e.ordem, fizeram: 0, proximoPasso: 0, parados: 0 }));
  const indice = new Map(porEtapa.map((x, i) => [x.etapaId, i]));
  let concluiram = 0;
  for (const p of iniciadas) {
    for (const e of p.caminhada.etapas) if (e.feita && indice.has(e.etapaId)) porEtapa[indice.get(e.etapaId)].fizeram++;
    const prox = p.caminhada.proximo;
    if (!prox) { concluiram++; continue; }
    if (!indice.has(prox.etapaId)) continue;
    const linha = porEtapa[indice.get(prox.etapaId)];
    linha.proximoPasso++;
    if (paradoDesde(p.caminhada, limite)) linha.parados++;
  }
  return { iniciadas: iniciadas.length, concluiram, etapas: porEtapa };
}
// parado: o último passo foi antes do limite (sem data conhecida de nenhum passo também conta como parado — não há como dizer que andou)
const paradoDesde = (c, limiteIso) => !c.ultimoPasso || c.ultimoPasso < limiteIso;
function estaParado(c, hojeIso, diasParado = DIAS_PARADO_PADRAO) {
  return !!(c && c.iniciada && c.proximo && paradoDesde(c, somarDias(hojeIso, -diasParado)));
}

// ---- validações do catálogo (o nível geral edita) ----
const textoLimpo = (v) => (typeof v === "string" ? v.replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim() : "");
const CHAVE = /^[A-Z][A-Z0-9_]{2,29}$/;

function validarTipoMarco(c) {
  const corpo = c && typeof c === "object" ? c : {};
  const codigo = typeof corpo.codigo === "string" ? corpo.codigo.trim().toUpperCase() : "";
  if (!CHAVE.test(codigo)) return { valido: false, mensagem: "O código é de 3 a 30 letras maiúsculas, números ou _ (ex.: CLASSE_NOVOS)." };
  const nome = textoLimpo(corpo.nome);
  if (nome.length < 3 || nome.length > 80) return { valido: false, mensagem: "O nome tem de 3 a 80 caracteres." };
  const descricao = textoLimpo(corpo.descricao);
  if (descricao.length > 300) return { valido: false, mensagem: "A descrição tem no máximo 300 caracteres." };
  for (const k of ["unico", "soNivelGeral", "ativo"]) if (corpo[k] != null && typeof corpo[k] !== "boolean") return { valido: false, mensagem: `"${k}" é sim ou não.` };
  return { valido: true, tipo: { codigo, nome, descricao: descricao || null, unico: !!corpo.unico, soNivelGeral: !!corpo.soNivelGeral, ativo: corpo.ativo !== false } };
}

function validarEtapa(c) {
  const corpo = c && typeof c === "object" ? c : {};
  const chave = typeof corpo.chave === "string" ? corpo.chave.trim().toUpperCase() : "";
  if (!CHAVE.test(chave)) return { valido: false, mensagem: "A chave é de 3 a 30 letras maiúsculas, números ou _ (ex.: CLASSE_NOVOS)." };
  const nome = textoLimpo(corpo.nome);
  if (nome.length < 3 || nome.length > 80) return { valido: false, mensagem: "O nome tem de 3 a 80 caracteres." };
  const descricao = textoLimpo(corpo.descricao);
  if (descricao.length > 300) return { valido: false, mensagem: "A descrição tem no máximo 300 caracteres." };
  const ordem = Number(corpo.ordem);
  if (!Number.isInteger(ordem) || ordem < 1 || ordem > 99) return { valido: false, mensagem: "A ordem é um número de 1 a 99." };
  if (!Object.prototype.hasOwnProperty.call(FONTES, corpo.fonte)) return { valido: false, mensagem: "Escolha de onde vem a etapa: marco, batismo nas águas, trilha de formação ou serviço voluntário." };
  let tipoMarco = null, trilhaId = null;
  if (corpo.fonte === "MARCO") {
    tipoMarco = typeof corpo.tipoMarco === "string" ? corpo.tipoMarco.trim().toUpperCase() : "";
    if (!CHAVE.test(tipoMarco)) return { valido: false, mensagem: "Escolha o tipo de marco da etapa." };
  }
  if (corpo.fonte === "TRILHA") {
    trilhaId = Number(corpo.trilhaId);
    if (!Number.isInteger(trilhaId) || trilhaId <= 0) return { valido: false, mensagem: "Escolha a trilha de formação da etapa." };
    // o marco continua valendo junto (quem fez o curso antes de a AFM configurar a trilha não perde a etapa): opcional
    if (corpo.tipoMarco != null && corpo.tipoMarco !== "") {
      tipoMarco = typeof corpo.tipoMarco === "string" ? corpo.tipoMarco.trim().toUpperCase() : "";
      if (!CHAVE.test(tipoMarco)) return { valido: false, mensagem: "Tipo de marco inválido." };
    }
  }
  for (const k of ["geraAcompanhamento", "ativa"]) if (corpo[k] != null && typeof corpo[k] !== "boolean") return { valido: false, mensagem: `"${k}" é sim ou não.` };
  const pre = corpo.preRequisitos == null ? [] : corpo.preRequisitos;
  if (!Array.isArray(pre) || pre.length > 10 || pre.some((x) => !Number.isInteger(Number(x)) || Number(x) <= 0)) return { valido: false, mensagem: "Pré-requisitos inválidos (até 10 etapas)." };
  const etapaId = corpo.etapaId == null || corpo.etapaId === "" ? null : Number(corpo.etapaId);
  if (etapaId !== null && (!Number.isInteger(etapaId) || etapaId <= 0)) return { valido: false, mensagem: "Etapa inválida." };
  const preRequisitos = [...new Set(pre.map(Number))];
  if (etapaId && preRequisitos.includes(etapaId)) return { valido: false, mensagem: "Uma etapa não é pré-requisito dela mesma." };
  return { valido: true, etapa: { etapaId, chave, nome, descricao: descricao || null, ordem, fonte: corpo.fonte, tipoMarco, trilhaId, geraAcompanhamento: corpo.geraAcompanhamento !== false, ativa: corpo.ativa !== false, preRequisitos } };
}

// O texto do acompanhamento (vai para a fila do cuidado pastoral).
function textoDoAcompanhamento(c) {
  const ultima = [...c.etapas].filter((e) => e.feita && e.data).sort((a, b) => (a.data < b.data ? 1 : -1))[0];
  return {
    motivo: `Próximo passo: ${c.proximo.nome}.`,
    resumo: ultima ? `Último passo: ${ultima.nome} em ${ultima.data.split("-").reverse().join("/")}.` : "Começou a caminhada."
  };
}

module.exports = { FONTES, DIAS_PARADO_PADRAO, JANELA_ACOMPANHAMENTO_DIAS, MAX_NOVOS_POR_CONGREGACAO, caminhada, deveAcompanhar, funil, estaParado, validarTipoMarco, validarEtapa,
  textoDoAcompanhamento, somarDias, diasEntre, dataIso };
