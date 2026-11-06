// shared/territorio.js — v9.5: Mapa territorial e inteligência de expansão. Só regra pura, testada (__tests__/territorio.test.js); o banco fica em territorioDb.js.
// Desenho em docs/plano/fase-9-entidades-vinculadas.md.
//  - o endereço do membro em linhas (e a linha única montada com elas);
//  - os bairros e os pontos no mapa (latitude e longitude; o link do Google Maps);
//  - a distância em linha reta, a cobertura por bairro e a densidade por unidade;
//  - a tabela de critérios da simulação de emancipação (montada pelo responsável) e a avaliação de cada Extensão.
const { texto, idDe, booleano, UFS } = require("./entidadesVinculadas");

// ---------------------------------------------------------------- o endereço em linhas ----------------------------------------------------------------
const LIMITES_ENDERECO = { logradouro: 200, numero: 20, complemento: 100, bairroTexto: 150, cidade: 150 };
const CAMPOS_ENDERECO = ["logradouro", "numero", "complemento", "bairroId", "bairroTexto", "cidade", "uf", "cep"];
// A anonimização e a exclusão da LGPD limpam as linhas junto com a linha única (minimizacaoLgpd.js e ExecutarExclusaoLGPD).
const LIMPAR_ENDERECO_LINHAS = `EnderecoLogradouro = NULL, EnderecoNumero = NULL, EnderecoComplemento = NULL, EnderecoBairroId = NULL, EnderecoBairroTexto = NULL,
            EnderecoCidade = NULL, EnderecoUF = NULL, EnderecoCep = NULL`;

// CEP: 8 dígitos, gravado como 00000-000. Vazio = sem CEP.
function normalizarCep(valor) {
  if (valor == null || valor === "") return { valido: true, cep: null };
  if (typeof valor !== "string" && typeof valor !== "number") return { valido: false, mensagem: "O CEP tem 8 números." };
  const d = String(valor).replace(/[\s.-]/g, "");
  if (!/^[0-9]{8}$/.test(d)) return { valido: false, mensagem: "O CEP tem 8 números (ex.: 68515-000)." };
  if (/^0{8}$/.test(d)) return { valido: false, mensagem: "O CEP não é válido." };
  return { valido: true, cep: `${d.slice(0, 5)}-${d.slice(5)}` };
}

// As linhas do endereço que chegam da tela (Pessoas ou Meus Dados). Todas são opcionais (há quem só saiba o bairro), mas: o bairro é da lista (bairroId) OU
// escrito (bairroTexto), nunca os dois; o bairro escrito pede a cidade e a UF (para entrar na fila do bairro certo); a UF é uma das 27.
function validarEnderecoPartes(dados) {
  if (dados == null || typeof dados !== "object" || Array.isArray(dados)) return { valido: false, mensagem: "O endereço veio num formato inválido." };
  const p = {};
  for (const [campo, rotulo] of [["logradouro", "A rua (logradouro)"], ["numero", "O número"], ["complemento", "O complemento"], ["bairroTexto", "O bairro"], ["cidade", "A cidade"]]) {
    const r = texto(dados[campo], { maximo: LIMITES_ENDERECO[campo], rotulo, obrigatorio: false });
    if (!r.valido) return r;
    p[campo] = r.texto;
  }
  if (p.bairroTexto && p.bairroTexto.length < 2) return { valido: false, mensagem: "O bairro: escreva pelo menos 2 caracteres." };
  if (p.cidade && p.cidade.length < 2) return { valido: false, mensagem: "A cidade: escreva pelo menos 2 caracteres." };
  const bruto = dados.bairroId;
  if (bruto != null && bruto !== "") {
    const id = idDe(bruto);
    if (!id) return { valido: false, mensagem: "O bairro escolhido não é válido." };
    p.bairroId = id;
  } else p.bairroId = null;
  if (p.bairroId && p.bairroTexto) return { valido: false, mensagem: "Escolha o bairro na lista OU escreva o nome dele, não os dois." };
  if (dados.uf != null && dados.uf !== "") {
    const uf = typeof dados.uf === "string" ? dados.uf.trim().toUpperCase() : "";
    if (!UFS.includes(uf)) return { valido: false, mensagem: "UF inválida." };
    p.uf = uf;
  } else p.uf = null;
  const cep = normalizarCep(dados.cep);
  if (!cep.valido) return cep;
  p.cep = cep.cep;
  if (p.bairroTexto && (!p.cidade || !p.uf)) return { valido: false, mensagem: "Escrevendo o nome do bairro, informe também a cidade e a UF." };
  return { valido: true, partes: p };
}

// O bairro da lista manda na cidade e na UF (o que a tela mandou de diferente é corrigido pelo bairro: nunca um endereço "Bairro da Paz, Marabá" com o bairro
// cadastrado em Parauapebas).
function aplicarBairro(partes, bairro) {
  if (!partes.bairroId || !bairro) return { ...partes };
  return { ...partes, cidade: bairro.cidade, uf: bairro.uf };
}

const vazio = (p) => !p || CAMPOS_ENDERECO.every((c) => p[c] == null || p[c] === "");

// A linha única (Endereco, 300 caracteres) montada com as linhas: "Rua A, 123, apto 2 — Bairro da Paz — Parauapebas/PA — CEP 68515-000".
function montarLinhaEndereco(partes, nomeDoBairro) {
  if (vazio(partes)) return null;
  const rua = [partes.logradouro, partes.numero, partes.complemento].filter(Boolean).join(", ");
  const bairro = nomeDoBairro || partes.bairroTexto || null;
  const cidade = partes.cidade ? (partes.uf ? `${partes.cidade}/${partes.uf}` : partes.cidade) : (partes.uf || null);
  const linha = [rua || null, bairro, cidade, partes.cep ? `CEP ${partes.cep}` : null].filter(Boolean).join(" — ");
  return linha ? linha.slice(0, 300) : null;
}

// ---------------------------------------------------------------- pontos no mapa ----------------------------------------------------------------
const arred = (n, casas) => { const f = 10 ** casas; return Math.round(n * f) / f; };
function numeroDe(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!/^-?[0-9]{1,3}(\.[0-9]{1,15})?$/.test(t)) return null;
  return Number(t);
}
// Um ponto (latitude, longitude). Os dois vazios = sem ponto (ok, quando `opcional`). O 0,0 (no meio do oceano) é recusado: é o que sobra de um campo em branco.
function validarPonto(lat, lng, { opcional = true } = {}) {
  const semLat = lat == null || lat === "", semLng = lng == null || lng === "";
  if (semLat && semLng) return opcional ? { valido: true, lat: null, lng: null } : { valido: false, mensagem: "Marque o ponto no mapa (ou informe a latitude e a longitude)." };
  if (semLat || semLng) return { valido: false, mensagem: "Informe a latitude e a longitude (as duas)." };
  const a = numeroDe(lat), o = numeroDe(lng);
  if (a == null || o == null) return { valido: false, mensagem: "A latitude e a longitude são números com ponto (ex.: -6.0675 e -49.9025)." };
  if (a < -90 || a > 90) return { valido: false, mensagem: "A latitude vai de -90 a 90." };
  if (o < -180 || o > 180) return { valido: false, mensagem: "A longitude vai de -180 a 180." };
  if (a === 0 && o === 0) return { valido: false, mensagem: "O ponto 0, 0 não é um lugar de verdade: marque de novo." };
  return { valido: true, lat: arred(a, 6), lng: arred(o, 6) };
}

// O ponto a partir do que a pessoa colou: o link do Google Maps (o pino exato "!3d…!4d…" vale mais que o centro da tela "@lat,lng", que vale mais que
// "q=lat,lng") ou os dois números "lat, lng". O link curto (maps.app.goo.gl) não traz o ponto: a mensagem diz o que fazer.
const NUM = "(-?[0-9]{1,3}(?:\\.[0-9]+)?)";
const PADROES_LINK = [
  new RegExp(`!3d${NUM}!4d${NUM}`),
  new RegExp(`@${NUM},${NUM}`),
  new RegExp(`[?&](?:q|query|ll|destination|center)=${NUM},\\s*${NUM}`)
];
function interpretarPonto(entrada) {
  if (typeof entrada !== "string" || !entrada.trim()) return { valido: false, mensagem: "Cole o link do Google Maps do lugar, ou escreva a latitude e a longitude." };
  if (entrada.length > 3000) return { valido: false, mensagem: "O texto colado é grande demais." };
  let t = entrada.trim();
  try { t = decodeURIComponent(t); } catch (e) { /* fica como veio */ }
  for (const re of PADROES_LINK) {
    const m = t.match(re);
    if (m) return validarPonto(m[1], m[2], { opcional: false });
  }
  const par = t.match(/^(-?[0-9]{1,3}(?:\.[0-9]+)?)\s*[,;\s]\s*(-?[0-9]{1,3}(?:\.[0-9]+)?)$/);
  if (par) return validarPonto(par[1], par[2], { opcional: false });
  if (/goo\.gl|maps\.app/i.test(t)) return { valido: false, mensagem: "O link curto não traz o ponto: abra-o no navegador e cole o endereço completo que aparece (o que tem @ e os números)." };
  return { valido: false, mensagem: "Não achei o ponto no que foi colado. Cole o link completo do Google Maps ou escreva \"latitude, longitude\"." };
}

// Distância em linha reta (km), pela fórmula de haversine — a mesma do "qual congregação está mais perto" do site.
function distanciaKm(a, b) {
  if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const R = 6371.0088, rad = (g) => (Number(g) * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
const km1 = (d) => (d == null ? null : arred(d, 1));

// ---------------------------------------------------------------- bairros e parâmetros ----------------------------------------------------------------
function validarBairro(dados) {
  if (dados == null || typeof dados !== "object" || Array.isArray(dados)) return { valido: false, mensagem: "Dados inválidos." };
  const nome = texto(dados.nome, { minimo: 2, maximo: 150, rotulo: "O nome do bairro" });
  if (!nome.valido) return nome;
  const cidade = texto(dados.cidade, { minimo: 2, maximo: 150, rotulo: "A cidade" });
  if (!cidade.valido) return cidade;
  const uf = typeof dados.uf === "string" ? dados.uf.trim().toUpperCase() : "";
  if (!UFS.includes(uf)) return { valido: false, mensagem: "UF inválida." };
  const ponto = validarPonto(dados.lat, dados.lng);
  if (!ponto.valido) return ponto;
  return { valido: true, bairro: { nome: nome.texto, cidade: cidade.texto, uf, lat: ponto.lat, lng: ponto.lng } };
}

const RAIO_PADRAO_KM = 3;
function validarRaio(valor) {
  const n = typeof valor === "number" ? valor : (typeof valor === "string" && /^[0-9]{1,3}([.,][0-9]{1,2})?$/.test(valor.trim()) ? Number(valor.trim().replace(",", ".")) : NaN);
  if (!Number.isFinite(n) || n < 0.1 || n > 100) return { valido: false, mensagem: "O raio de cobertura vai de 0,1 a 100 km." };
  return { valido: true, raio: arred(n, 2) };
}

// ---------------------------------------------------------------- cobertura e densidade ----------------------------------------------------------------
// bairros: [{ bairroId, nome, cidade, uf, lat, lng, membros }]; unidades: [{ chave: "C12" | "E3", tipo, nome, lat, lng }] (só as ativas).
// Cada bairro com ponto ganha a unidade mais perto e a distância; descoberto = tem membros e nenhuma unidade dentro do raio.
function maisPerto(ponto, unidades) {
  let melhor = null;
  for (const u of unidades) {
    const d = distanciaKm(ponto, u);
    if (d == null) continue;
    if (!melhor || d < melhor.distancia || (d === melhor.distancia && String(u.chave) < String(melhor.unidade.chave))) melhor = { unidade: u, distancia: d };
  }
  return melhor;
}
function cobertura(bairros, unidades, raioKm) {
  const comPonto = (unidades || []).filter((u) => u.lat != null && u.lng != null);
  return (bairros || []).map((b) => {
    if (b.lat == null || b.lng == null) return { ...b, semPonto: true, maisPerto: null, distanciaKm: null, descoberto: false };
    const m = maisPerto(b, comPonto);
    const distancia = m ? m.distancia : null;
    return {
      ...b, semPonto: false,
      maisPerto: m ? { chave: m.unidade.chave, tipo: m.unidade.tipo, nome: m.unidade.nome } : null,
      distanciaKm: km1(distancia),
      descoberto: Number(b.membros) > 0 && (distancia == null || distancia > raioKm)
    };
  });
}

// linhas: [{ bairroId, unidadeChave, membros }] — quantos membros de cada unidade moram em cada bairro. Por unidade: os membros com bairro de ponto marcado,
// a distância média do bairro deles até a unidade e quantos moram mais perto de outra unidade (a outra precisa estar de fato mais perto, não empatada).
function densidadePorUnidade(linhas, bairros, unidades) {
  const porBairro = new Map((bairros || []).map((b) => [Number(b.bairroId), b]));
  const comPonto = (unidades || []).filter((u) => u.lat != null && u.lng != null);
  const porChave = new Map((unidades || []).map((u) => [u.chave, u]));
  const saida = new Map();
  for (const u of unidades || []) saida.set(u.chave, { chave: u.chave, tipo: u.tipo, nome: u.nome, semPonto: u.lat == null || u.lng == null, membrosLocalizados: 0, somaKm: 0, maisPertoDeOutra: 0 });
  for (const l of linhas || []) {
    const u = porChave.get(l.unidadeChave);
    const b = porBairro.get(Number(l.bairroId));
    const n = Number(l.membros) || 0;
    if (!u || !b || b.lat == null || b.lng == null || n <= 0) continue;
    const s = saida.get(u.chave);
    if (s.semPonto) continue;
    const propria = distanciaKm(b, u);
    s.membrosLocalizados += n;
    s.somaKm += propria * n;
    const m = maisPerto(b, comPonto);
    if (m && m.unidade.chave !== u.chave && m.distancia < propria - 1e-9) s.maisPertoDeOutra += n;
  }
  return [...saida.values()].map((s) => ({
    chave: s.chave, tipo: s.tipo, nome: s.nome, semPonto: s.semPonto, membrosLocalizados: s.membrosLocalizados,
    distanciaMediaKm: s.membrosLocalizados ? km1(s.somaKm / s.membrosLocalizados) : null, maisPertoDeOutra: s.maisPertoDeOutra
  }));
}

// ---------------------------------------------------------------- critérios da simulação de emancipação ----------------------------------------------------------------
const INDICADORES = {
  MESES_ABERTA: { rotulo: "Meses desde a abertura da Extensão", tipo: "numero", inteiro: true, unidade: "meses" },
  MEMBROS_EM_COMUNHAO: { rotulo: "Membros em comunhão", tipo: "numero", inteiro: true, unidade: "membros" },
  ENCARREGADO_EM_COMUNHAO: { rotulo: "Encarregado em comunhão", tipo: "simnao" },
  OBREIROS: { rotulo: "Obreiros consagrados entre os membros (auxiliar a pastor)", tipo: "numero", inteiro: true, unidade: "obreiros" },
  DIZIMO_MEDIO_12M: { rotulo: "Dízimo confirmado dos membros: média por mês dos últimos 12 meses fechados", tipo: "numero", inteiro: false, unidade: "reais" },
  DIZIMISTAS_12M: { rotulo: "Membros que deram dízimo nos últimos 12 meses fechados", tipo: "numero", inteiro: true, unidade: "membros" },
  DISTANCIA_MAE_KM: { rotulo: "Distância até a Congregação-Mãe (km, em linha reta)", tipo: "numero", inteiro: false, unidade: "km" },
  NIVEL_PSC_MAE: { rotulo: "Nível do PSC homologado mais recente da Congregação-Mãe (0 a 5)", tipo: "numero", inteiro: true, unidade: "nível", maximo: 5 }
};
const OPERADORES = { MINIMO: "pelo menos", MAXIMO: "no máximo", SIM: "precisa ser sim" };
const VALOR_MAXIMO = 9999999999.99;

function valorDoCriterio(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!/^[0-9]{1,10}([.,][0-9]{1,2})?$/.test(t)) return null;
  return Number(t.replace(",", "."));
}
function validarCriterio(dados) {
  if (dados == null || typeof dados !== "object" || Array.isArray(dados)) return { valido: false, mensagem: "Dados inválidos." };
  const ind = INDICADORES[dados.indicador];
  if (!ind || !Object.prototype.hasOwnProperty.call(INDICADORES, dados.indicador)) return { valido: false, mensagem: "Escolha o indicador na lista." };
  const operador = dados.operador;
  let valor = null;
  if (ind.tipo === "simnao") {
    if (operador !== "SIM") return { valido: false, mensagem: "Este indicador é de sim ou não: a comparação é \"precisa ser sim\"." };
  } else {
    if (operador !== "MINIMO" && operador !== "MAXIMO") return { valido: false, mensagem: "Escolha a comparação: \"pelo menos\" ou \"no máximo\"." };
    valor = valorDoCriterio(dados.valor);
    if (valor == null || valor < 0 || valor > VALOR_MAXIMO) return { valido: false, mensagem: "Informe o valor (um número, sem negativo)." };
    if (ind.inteiro && !Number.isInteger(valor)) return { valido: false, mensagem: `O valor de "${ind.rotulo}" é um número inteiro.` };
    if (ind.maximo != null && valor > ind.maximo) return { valido: false, mensagem: `O valor de "${ind.rotulo}" vai até ${ind.maximo}.` };
  }
  let ordem = 0;
  if (dados.ordem != null && dados.ordem !== "") {
    const n = typeof dados.ordem === "number" ? dados.ordem : (typeof dados.ordem === "string" && /^[0-9]{1,3}$/.test(dados.ordem.trim()) ? Number(dados.ordem.trim()) : NaN);
    if (!Number.isInteger(n) || n < 0 || n > 999) return { valido: false, mensagem: "A ordem é um número de 0 a 999." };
    ordem = n;
  }
  const obs = texto(dados.observacao, { maximo: 300, rotulo: "A observação", obrigatorio: false });
  if (!obs.valido) return obs;
  const ativo = dados.ativo === undefined ? true : booleano(dados.ativo);
  return { valido: true, criterio: { indicador: dados.indicador, operador, valor, ativo, ordem, observacao: obs.texto } };
}

// Um critério diante do valor medido: ATENDE, NAO_ATENDE ou SEM_DADO (falta o dado para medir — nunca conta como atendido).
function avaliarCriterio(criterio, medido) {
  if (medido == null || (typeof medido === "number" && !Number.isFinite(medido))) return "SEM_DADO";
  if (criterio.operador === "SIM") return medido === true ? "ATENDE" : "NAO_ATENDE";
  if (typeof medido !== "number") return "SEM_DADO";
  const v = Number(criterio.valor);
  if (criterio.operador === "MINIMO") return medido >= v - 1e-9 ? "ATENDE" : "NAO_ATENDE";
  if (criterio.operador === "MAXIMO") return medido <= v + 1e-9 ? "ATENDE" : "NAO_ATENDE";
  return "SEM_DADO";
}
// A Extensão diante dos critérios ATIVOS (na ordem): ATENDE_TUDO só quando todos atendem; um que não atende → NAO_ATENDE; nenhum que falha mas algum sem dado →
// SEM_DADO; nenhum critério ativo → SEM_CRITERIOS (a tela diz isso, em vez de apontar).
function avaliarExtensao(criterios, medidas) {
  const ativos = (criterios || []).filter((c) => c.ativo).sort((a, b) => (a.ordem - b.ordem) || (a.criterioId - b.criterioId));
  const itens = ativos.map((c) => {
    const medido = medidas ? medidas[c.indicador] : null;
    return { criterioId: c.criterioId, indicador: c.indicador, operador: c.operador, valor: c.valor, medido: medido == null ? null : medido, resultado: avaliarCriterio(c, medido) };
  });
  let situacao = "ATENDE_TUDO";
  if (!itens.length) situacao = "SEM_CRITERIOS";
  else if (itens.some((i) => i.resultado === "NAO_ATENDE")) situacao = "NAO_ATENDE";
  else if (itens.some((i) => i.resultado === "SEM_DADO")) situacao = "SEM_DADO";
  return { situacao, itens, atendidos: itens.filter((i) => i.resultado === "ATENDE").length, total: itens.length };
}

// ---------------------------------------------------------------- datas ----------------------------------------------------------------
// Meses completos entre a abertura e hoje (a abertura em 15/03 faz 1 mês em 15/04).
function mesesEntre(inicioIso, hojeIso) {
  if (!inicioIso || !hojeIso) return null;
  const [y1, m1, d1] = String(inicioIso).slice(0, 10).split("-").map(Number);
  const [y2, m2, d2] = String(hojeIso).slice(0, 10).split("-").map(Number);
  if (![y1, m1, d1, y2, m2, d2].every(Number.isFinite)) return null;
  const n = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  return n < 0 ? 0 : n;
}
// Os últimos 12 meses FECHADOS (o mês corrente não entra): hoje 06/11/2026 → de 2025-11 a 2026-10.
function janela12Meses(hojeIso) {
  const [y, m] = String(hojeIso).slice(0, 7).split("-").map(Number);
  const mes = (ano, mm) => { const t = ano * 12 + (mm - 1); return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };
  return { de: mes(y, m - 12), ate: mes(y, m - 1) };
}

module.exports = {
  CAMPOS_ENDERECO, LIMITES_ENDERECO, LIMPAR_ENDERECO_LINHAS, UFS, RAIO_PADRAO_KM, INDICADORES, OPERADORES,
  normalizarCep, validarEnderecoPartes, aplicarBairro, montarLinhaEndereco, enderecoVazio: vazio,
  validarPonto, interpretarPonto, distanciaKm, validarBairro, validarRaio, cobertura, densidadePorUnidade, maisPerto,
  validarCriterio, avaliarCriterio, avaliarExtensao, mesesEntre, janela12Meses
};
