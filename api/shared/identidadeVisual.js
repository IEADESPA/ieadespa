// shared/identidadeVisual.js (v7.14 — Identidade Visual Anual, Regimento Art. 159 e Art. 126-Q, II) — a regra PURA: sem banco, sem relógio escondido, testada.
//
// O calendário do Art. 159 § 1º, sempre pela data de BRASÍLIA (shared/dataBrasilia.js), calculado na hora a partir do ano da identidade (o "ano-alvo"):
//   o processo da identidade de 2028 corre em novembro e dezembro de 2027 —
//   SUGESTAO  01 a 15/nov      (qualquer membro apto e em comunhão manda até 3 sugestões; pode retirar a sua até o dia 15)
//   TRIAGEM   16 a 21/nov      (a Diretoria aprova os finalistas — pode ajustar a redação, guardando a original — ou descarta pelo critério do inciso I, a)
//   VOTACAO   22 a 30/nov      (os finalistas viram uma Enquete de toda a membresia apta, votada em Meu Painel; fecha no fim do dia 30, à meia-noite de Brasília)
//   ARTE      dezembro         (até 3 cores da Diretoria; concurso de arte dos membros; escolha final no culto, até 31/12)
//   ENCERRADO depois do resultado registrado, ou a partir de 1º de janeiro do ano-alvo
// Nenhuma rotina abre ou fecha etapa: a etapa é a data. A rotina diária e o primeiro acesso só materializam o que a data já decidiu (criar a enquete, apurá-la).
// O ciclo é ABERTO pela Diretoria (decisão do responsável, 23/10/2026): sem ciclo aberto, nada de sugestão — o sistema não mostra etapa de um processo que não existe.
//
// Antiduplicidade (Art. 159 § 1º, I, a, 3 — "vedada a sugestão de temas repetidos já utilizados desde 2006"): o texto é comparado na forma NORMALIZADA (sem acento, sem
// maiúscula, sem pontuação, espaços simples). Igual a um tema já usado = recusado na hora; PARECIDO = aceito, mas marcado para a triagem conferir.
const { hojeBrasilia } = require("./dataBrasilia");

const PERMISSAO = "identidade_visual";
const PRIMEIRO_ANO_TEMAS = 2006;              // "desde o ano de 2006" (Art. 159 § 1º, I, a, 3)
const PRIMEIRO_CICLO = 2028;                  // decisão de 23/10/2026: o processo da identidade de 2027 foi feito fora do sistema; o primeiro ciclo no sistema é o de 2028
const MAX_SUGESTOES = 3;                      // por membro e por ciclo (decisão de 22/10/2026)
const MAX_TEXTO = 80;                         // "frase curta, até 80 letras"
const MIN_TEXTO = 3;
const MAX_TEMA_USADO = 150;                   // tema antigo cadastrado pela Secretaria (alguns anos tiveram frase mais longa)
const MAX_FINALISTAS = 10;
const MIN_FINALISTAS = 2;                     // uma enquete precisa de ao menos duas opções
const MAX_CORES = 3;                          // "até 03 (três) opções de cores" (Art. 159 § 1º, IV, a)
const MAX_ARTES = 3;                          // por membro e por ciclo (as retiradas e as recusadas não contam)
const MAX_IMAGEM_BYTES = 5 * 1024 * 1024;
const TIPOS_IMAGEM = ["image/png", "image/jpeg"];

const FASES = {
  AGUARDANDO: { rotulo: "Aguardando o início", ordem: 0 },
  SUGESTAO: { rotulo: "Sugestões de temas", ordem: 1 },
  TRIAGEM: { rotulo: "Triagem da Diretoria", ordem: 2 },
  VOTACAO: { rotulo: "Votação do tema", ordem: 3 },
  ARTE: { rotulo: "Cores e concurso de arte", ordem: 4 },
  ENCERRADO: { rotulo: "Encerrado", ordem: 5 }
};

// Os três requisitos de validade (Art. 159 § 1º, I, a): o motivo de um descarte é sempre um deles.
const CRITERIOS = {
  1: { codigo: 1, rotulo: "Curto e memorável", descricao: "Frase de impacto, curta e fácil de estampar." },
  2: { codigo: 2, rotulo: "Amplo e abrangente", descricao: "O tema deve permitir desdobramentos para Jovens, Senhoras e Missões." },
  3: { codigo: 3, rotulo: "Originalidade total", descricao: "É vedada a sugestão de temas repetidos já utilizados pela Igreja desde 2006." }
};

const OCASIOES = { CULTO_ADMINISTRATIVO: "Culto Administrativo de Dezembro", VIGILIA: "Vigília de Ano Novo" };

// ---------------------------------------------------------------
// Calendário
// ---------------------------------------------------------------

function anoValido(ano) { return Number.isInteger(ano) && ano >= 2000 && ano <= 2200; }
const doisDigitos = (n) => String(n).padStart(2, "0");

// As datas (AAAA-MM-DD, calendário de Brasília) de cada etapa do processo da identidade de `anoAlvo`.
function calendario(anoAlvo) {
  if (!anoValido(anoAlvo)) throw new Error("ano inválido");
  const b = anoAlvo - 1;
  return {
    anoAlvo, anoDoProcesso: b,
    sugestao: { inicio: `${b}-11-01`, fim: `${b}-11-15` },
    triagem: { inicio: `${b}-11-16`, fim: `${b}-11-21` },
    votacao: { inicio: `${b}-11-22`, fim: `${b}-11-30` },
    arte: { inicio: `${b}-12-01`, fim: `${b}-12-31` },
    // a votação fecha "no fim do dia 30": à meia-noite de 1º/12 em Brasília (UTC−3) = 03h00 UTC de 1º/12
    votacaoFechaEm: `${b}-12-01T03:00:00.000Z`
  };
}

// A etapa do processo da identidade de `anoAlvo` no dia `hoje` (AAAA-MM-DD, Brasília). `encerrado`: o resultado final já foi registrado.
function fase(anoAlvo, hoje, { encerrado = false } = {}) {
  const c = calendario(anoAlvo);
  if (encerrado) return "ENCERRADO";
  if (hoje < c.sugestao.inicio) return "AGUARDANDO";
  if (hoje <= c.sugestao.fim) return "SUGESTAO";
  if (hoje <= c.triagem.fim) return "TRIAGEM";
  if (hoje <= c.votacao.fim) return "VOTACAO";
  if (hoje <= c.arte.fim) return "ARTE";
  return "ENCERRADO";
}

// O ano da próxima identidade, no dia `hoje`: o processo de novembro/dezembro de 2027 escolhe a de 2028.
function anoAlvoDoDia(hoje) { return Number(String(hoje).slice(0, 4)) + 1; }

// A Diretoria abre o ciclo do ano quando quiser, até o último dia das sugestões (abrir depois disso seria um processo sem sugestão nenhuma).
function podeAbrirCiclo(anoAlvo, hoje) {
  if (Number.isInteger(anoAlvo) && anoAlvo < PRIMEIRO_CICLO) return { problema: `O primeiro ciclo no sistema é o da identidade de ${PRIMEIRO_CICLO}: o de ${anoAlvo} foi feito fora do sistema (cadastre o tema em "Temas já usados").` };
  if (!Number.isInteger(anoAlvo) || anoAlvo !== anoAlvoDoDia(hoje)) return { problema: `Só se abre o ciclo da identidade do ano que vem (${anoAlvoDoDia(hoje)}).` };
  if (hoje > calendario(anoAlvo).sugestao.fim) return { problema: `As sugestões para ${anoAlvo} terminaram em 15/11: este ano o ciclo não pode mais ser aberto no sistema.` };
  return { ok: true };
}

// O membro retira a própria arte até 24/12 do ano do processo (depois, a Diretoria já prepara a escolha do culto) e nunca depois do resultado.
function retiradaDeArteAte(anoAlvo) { return `${calendario(anoAlvo).anoDoProcesso}-12-24`; }

// A votação já fechou (o instante da meia-noite de 1º/12 em Brasília passou)?
function votacaoFechou(anoAlvo, agora = new Date()) { return agora.getTime() >= Date.parse(calendario(anoAlvo).votacaoFechaEm); }

function dataBr(iso) { const s = String(iso || ""); return /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : ""; }

// ---------------------------------------------------------------
// Texto
// ---------------------------------------------------------------

// Controle, formatação invisível (zero-width, direção do texto), separador de linha/parágrafo: nunca entram.
const INVISIVEL = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const TEM_LETRA = /\p{L}/u;
// Letra que não é do alfabeto latino (depois de tirar os acentos): o "а" cirílico é igual ao "a" na tela, mas não na comparação — por isso é recusado com aviso.
const LETRA_DE_OUTRO_ALFABETO = /(?=\p{L})\P{Script=Latin}/u;

// A forma de comparação: sem acento, minúsculas, só letras e números, um espaço entre as palavras. "Avante, Igreja!" = "avante igreja".
// NFKD (e não só NFD): as formas de compatibilidade viram a letra comum — "Ａｖａｎｔｅ" (letra larga), "ﬁ" (ligadura) e "²" (sobrescrito) não escapam da comparação.
function normalizar(texto) {
  return String(texto == null ? "" : texto)
    .normalize("NFKD").replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// O texto de uma sugestão (ou do ajuste da Diretoria): uma linha, sem tag, sem caractere invisível, só letras do alfabeto latino, de 3 a 80 caracteres (como o banco conta).
function validarTema(v, { max = MAX_TEXTO, campo = "o tema" } = {}) {
  if (typeof v !== "string") return { problema: `Escreva ${campo}.` };
  if (INVISIVEL.test(v.replace(/[ \t]/g, " ").replace(/\r?\n$/, ""))) return { problema: `${maiuscula(campo)} tem um caractere invisível ou uma quebra de linha: apague e escreva de novo, numa linha só.` };
  const t = v.replace(/\s+/g, " ").trim();
  // o tamanho é o do banco (NVARCHAR conta unidades UTF-16: um emoji conta 2) — contar "como a pessoa vê" deixava passar texto que o banco não guarda
  const tamanho = t.length;
  if (tamanho < MIN_TEXTO) return { problema: `Escreva ${campo} (no mínimo ${MIN_TEXTO} letras).` };
  if (tamanho > max) return { problema: `${maiuscula(campo)} pode ter até ${max} caracteres (tem ${tamanho}; um emoji conta 2).` };
  if (/[<>]/.test(t)) return { problema: `${maiuscula(campo)} não pode ter os sinais < e >.` };
  if (LETRA_DE_OUTRO_ALFABETO.test(t.normalize("NFKD").replace(/\p{M}/gu, ""))) return { problema: `${maiuscula(campo)} tem letras de outro alfabeto (por exemplo, do russo ou do grego): escreva só com as letras do português.` };
  if (!TEM_LETRA.test(t) || !normalizar(t)) return { problema: `${maiuscula(campo)} precisa ter palavras.` };
  return { texto: t, normalizado: normalizar(t) };
}
function maiuscula(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

// Texto livre curto (motivo, observação, ata, nome da cor, título da arte): pode faltar quando `opcional`.
function validarTextoLivre(v, { campo, max, min = 1, opcional = false, umaLinha = false }) {
  if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) return opcional ? { texto: null } : { problema: `Escreva ${campo}.` };
  if (typeof v !== "string") return { problema: `Escreva ${campo}.` };
  const t = v.replace(/\r\n/g, "\n").trim();
  const sem = umaLinha ? t : t.replace(/\n/g, " ");
  if (INVISIVEL.test(sem.replace(/\t/g, " "))) return { problema: `${maiuscula(campo)} tem um caractere invisível ou de controle${umaLinha ? " (ou uma quebra de linha)" : ""}: apague e escreva de novo.` };
  const tamanho = t.length;                     // unidades UTF-16, como o NVARCHAR do banco (um emoji conta 2)
  if (tamanho < min) return { problema: `Escreva ${campo} (no mínimo ${min} letras).` };
  if (tamanho > max) return { problema: `${maiuscula(campo)} pode ter até ${max} caracteres (tem ${tamanho}; um emoji conta 2).` };
  return { texto: t };
}

// ---------------------------------------------------------------
// Antiduplicidade: igual e parecido
// ---------------------------------------------------------------

// Palavras que não distinguem um tema de outro.
const PALAVRAS_VAZIAS = new Set(["a", "o", "as", "os", "e", "de", "da", "do", "das", "dos", "em", "no", "na", "nos", "nas", "um", "uma", "uns", "umas", "para", "pra", "pro",
  "por", "pelo", "pela", "com", "que", "ao", "aos", "se", "ate", "sob", "sobre"]);
function palavras(normalizado) { return String(normalizado).split(" ").filter((p) => p && !PALAVRAS_VAZIAS.has(p)); }

function distancia(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b.length; j++) atual[j] = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    anterior = atual;
  }
  return anterior[b.length];
}

// Dois textos JÁ NORMALIZADOS são parecidos quando (1) têm as mesmas palavras que contam, em qualquer ordem ("Igreja avante" × "Avante a igreja"); ou (2) todas as palavras
// do mais curto (pelo menos duas) estão no mais longo ("Fé que vence" × "Uma fé que vence o mundo"); ou (3) diferem por poucas letras — um erro de digitação, um plural
// (1 letra no texto de até 9; 2, ou 15% do tamanho, nos maiores). Regra simples de propósito: a triagem (gente) decide; o sistema só põe a marca.
function parecidos(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const pa = palavras(a), pb = palavras(b);
  const sa = new Set(pa), sb = new Set(pb);
  if (sa.size && sa.size === sb.size && [...sa].every((p) => sb.has(p))) return true;
  const [menor, maior] = sa.size <= sb.size ? [sa, sb] : [sb, sa];
  if (menor.size >= 2 && [...menor].every((p) => maior.has(p))) return true;
  const maiorTamanho = Math.max(a.length, b.length);
  const limite = maiorTamanho < 10 ? 1 : Math.max(2, Math.floor(0.15 * maiorTamanho));      // texto curto: só uma letra de diferença ("Paz" × "Luz" não é parecido)
  return distancia(a, b) <= limite;
}

// Confere um texto normalizado contra a lista de temas já usados ([{ ano, tema, normalizado }]). Devolve { igual, parecido } — cada um o tema encontrado (ou null).
function conferirTemasUsados(normalizado, temasUsados) {
  const lista = Array.isArray(temasUsados) ? temasUsados : [];
  const igual = lista.find((t) => t && t.normalizado === normalizado) || null;
  if (igual) return { igual, parecido: null };
  const parecido = lista.find((t) => t && parecidos(normalizado, t.normalizado)) || null;
  return { igual: null, parecido };
}

// ---------------------------------------------------------------
// Cores, imagem, resultado
// ---------------------------------------------------------------

const HEX = /^#[0-9A-Fa-f]{6}$/;
function validarCor(dados) {
  const d = dados && typeof dados === "object" && !Array.isArray(dados) ? dados : {};
  const ordem = Number.isInteger(d.ordem) ? d.ordem : (typeof d.ordem === "string" && /^[1-3]$/.test(d.ordem) ? Number(d.ordem) : null);
  if (!ordem || ordem < 1 || ordem > MAX_CORES) return { problema: "Escolha a posição da cor (1, 2 ou 3)." };
  const nome = validarTextoLivre(d.nome, { campo: "o nome da cor", max: 40, min: 2, umaLinha: true });
  if (nome.problema) return nome;
  if (/[<>]/.test(nome.texto)) return { problema: "O nome da cor não pode ter os sinais < e >." };
  if (typeof d.hex !== "string" || !HEX.test(d.hex.trim())) return { problema: "Informe a cor no formato #RRGGBB (por exemplo, #1A4D8F)." };
  return { dados: { ordem, nome: nome.texto, hex: d.hex.trim().toUpperCase() } };
}

// A imagem da arte: PNG ou JPEG de verdade (a assinatura do arquivo, não o tipo que o navegador declarou), até 5 MB.
function conferirImagem(buffer, tipo) {
  if (!TIPOS_IMAGEM.includes(tipo)) return { problema: "A arte tem de ser uma imagem PNG ou JPEG." };
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return { problema: "A imagem está vazia ou corrompida." };
  if (buffer.length > MAX_IMAGEM_BYTES) return { problema: "A imagem passa de 5 MB: diminua o tamanho e mande de novo." };
  const png = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if ((tipo === "image/png" && !png) || (tipo === "image/jpeg" && !jpeg)) return { problema: "O arquivo não é a imagem que diz ser (PNG ou JPEG)." };
  return { ok: true };
}
// ---- Metadados da imagem (decisão do responsável, 23/10/2026): a arte pode vir de um celular, com o lugar (GPS), o aparelho, a data e o nome de quem fotografou.
// Antes de guardar, sai tudo o que não é a imagem — sem biblioteca nova: o arquivo é percorrido pedaço a pedaço e só os pedaços de desenho ficam.
// PNG: ficam os pedaços críticos (cabeçalho, paleta, dados, fim) e os de cor e transparência; saem texto (tEXt, zTXt, iTXt), EXIF (eXIf), data (tIME), perfil de cor (iCCP) e
// qualquer outro pedaço auxiliar. JPEG: saem APP1 a APP15 (EXIF, XMP, IPTC/Photoshop, perfil de cor...) — menos o APP14 da Adobe, que diz como converter as cores — e os
// comentários (COM); o que vem depois do fim da imagem (EOI) também sai. Arquivo que não se deixa percorrer é recusado (não é a imagem que diz ser).
const PNG_ASSINATURA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_MANTER = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "sBIT", "bKGD", "pHYs", "acTL", "fcTL", "fdAT"]);
function limparPng(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_ASSINATURA)) return null;
  const partes = [PNG_ASSINATURA];
  let i = 8;
  while (i + 12 <= buf.length) {
    const tamanho = buf.readUInt32BE(i);
    const tipo = buf.toString("latin1", i + 4, i + 8);
    const fim = i + 12 + tamanho;
    if (tamanho > 0x7fffffff || fim > buf.length || !/^[A-Za-z]{4}$/.test(tipo)) return null;
    const critico = (buf[i + 4] & 0x20) === 0;          // 1ª letra maiúscula = pedaço crítico (o desenho não sai sem ele)
    if (critico || PNG_MANTER.has(tipo)) partes.push(buf.subarray(i, fim));
    i = fim;
    if (tipo === "IEND") return Buffer.concat(partes);
  }
  return null;
}
function limparJpeg(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  const partes = [buf.subarray(0, 2)];
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) return null;
    while (i + 1 < buf.length && buf[i + 1] === 0xff) i++;                       // bytes de preenchimento antes do marcador
    if (i + 1 >= buf.length) return null;
    const m = buf[i + 1];
    if (m === 0xd9) { partes.push(Buffer.from([0xff, 0xd9])); return Buffer.concat(partes); }      // fim da imagem: o que vier depois é descartado
    if ((m >= 0xd0 && m <= 0xd7) || m === 0x01) { partes.push(buf.subarray(i, i + 2)); i += 2; continue; }
    if (i + 4 > buf.length) return null;
    const fim = i + 2 + buf.readUInt16BE(i + 2);
    if (buf.readUInt16BE(i + 2) < 2 || fim > buf.length) return null;
    if (m === 0xda) {                                                            // início da varredura: o cabeçalho e os dados comprimidos até o próximo marcador
      let j = fim;
      while (j < buf.length) {
        if (buf[j] === 0xff && j + 1 < buf.length) {
          const n = buf[j + 1];
          if (n === 0x00 || (n >= 0xd0 && n <= 0xd7)) { j += 2; continue; }
          break;
        }
        j++;
      }
      partes.push(buf.subarray(i, j));
      i = j;
      continue;
    }
    const tirar = (m >= 0xe1 && m <= 0xef && m !== 0xee) || m === 0xfe;
    if (!tirar) partes.push(buf.subarray(i, fim));
    i = fim;
  }
  return null;
}
// Confere a imagem e devolve o arquivo SEM os metadados ({ buffer }) ou { problema }.
function prepararImagem(buffer, tipo) {
  const c = conferirImagem(buffer, tipo);
  if (c.problema) return c;
  const limpo = tipo === "image/png" ? limparPng(buffer) : limparJpeg(buffer);
  if (!limpo || limpo.length < 8) return { problema: "A imagem está corrompida (não foi possível ler o arquivo inteiro). Salve de novo como PNG ou JPEG e mande outra vez." };
  return { buffer: limpo };
}

// O tamanho do texto base64 já entrega o do arquivo: recusa antes de decodificar.
function base64CabeNoLimite(texto) { return typeof texto === "string" && texto.length > 0 && texto.length <= Math.ceil(MAX_IMAGEM_BYTES / 3) * 4 + 4 && /^[A-Za-z0-9+/]+={0,2}$/.test(texto); }

// Apuração da votação: [{ opcaoId, votos }] -> o vencedor, o empate (dois ou mais com o maior número) ou nenhum voto.
function apurar(opcoes) {
  const lista = (Array.isArray(opcoes) ? opcoes : []).map((o) => ({ opcaoId: o.opcaoId, votos: Number(o.votos) || 0 }));
  const total = lista.reduce((s, o) => s + o.votos, 0);
  if (!total) return { situacao: "SEM_VOTOS", total: 0, maior: 0, empatados: lista.map((o) => o.opcaoId) };
  const maior = Math.max(...lista.map((o) => o.votos));
  const primeiros = lista.filter((o) => o.votos === maior).map((o) => o.opcaoId);
  if (primeiros.length > 1) return { situacao: "EMPATE", total, maior, empatados: primeiros };
  return { situacao: "VENCEDOR", total, maior, vencedor: primeiros[0], empatados: [] };
}

// O resultado final do culto (Art. 159 § 1º, V e VI).
function validarResultado(dados, { anoAlvo, hoje }) {
  const d = dados && typeof dados === "object" && !Array.isArray(dados) ? dados : {};
  const c = calendario(anoAlvo);
  if (typeof d.dataCulto !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d.dataCulto) || isNaN(Date.parse(`${d.dataCulto}T12:00:00Z`))
    || new Date(`${d.dataCulto}T12:00:00Z`).toISOString().slice(0, 10) !== d.dataCulto) return { problema: "Informe a data do culto." };
  if (d.dataCulto < c.arte.inicio || d.dataCulto > c.arte.fim) return { problema: `A escolha final acontece em dezembro de ${c.anoDoProcesso} (até 31/12): confira a data do culto.` };
  if (d.dataCulto > hoje) return { problema: "A data do culto não pode ser no futuro: registre o resultado depois do culto." };
  if (!Object.prototype.hasOwnProperty.call(OCASIOES, d.ocasiao)) return { problema: "Escolha a ocasião: Culto Administrativo de Dezembro ou Vigília de Ano Novo." };
  const votos = Number.isInteger(d.votosVencedor) ? d.votosVencedor : (typeof d.votosVencedor === "string" && /^\d{1,6}$/.test(d.votosVencedor) ? Number(d.votosVencedor) : null);
  if (!votos || votos < 1 || votos > 100000) return { problema: "Informe quantos votos o modelo escolhido recebeu." };
  let presentes = null;
  if (d.presentes !== undefined && d.presentes !== null && d.presentes !== "") {
    presentes = Number.isInteger(d.presentes) ? d.presentes : (typeof d.presentes === "string" && /^\d{1,6}$/.test(d.presentes) ? Number(d.presentes) : NaN);
    if (!Number.isInteger(presentes) || presentes < votos || presentes > 100000) return { problema: "O número de presentes não pode ser menor que o de votos do modelo escolhido." };
  }
  const ata = validarTextoLivre(d.ata, { campo: "a observação ou a referência da ata", max: 1000, opcional: true });
  if (ata.problema) return ata;
  return { dados: { dataCulto: d.dataCulto, ocasiao: d.ocasiao, votosVencedor: votos, presentes, ata: ata.texto } };
}

// ---------------------------------------------------------------
// Avisos à Diretoria (o texto do sininho e do e-mail)
// ---------------------------------------------------------------

function textoTriagem({ anoAlvo, quantas }) {
  return `A triagem das sugestões de tema para a Identidade Visual de ${anoAlvo} começou: ${quantas} sugestão(ões) esperam o crivo da Diretoria até ${dataBr(calendario(anoAlvo).triagem.fim)}. `
    + "Aprove os finalistas (ajustando a redação, se preciso) ou descarte pelo critério do Art. 159.";
}
function textoVotacaoAberta({ anoAlvo, finalistas }) {
  return `A votação do tema da Identidade Visual de ${anoAlvo} está aberta em Meu Painel, com ${finalistas} finalista(s), até ${dataBr(calendario(anoAlvo).votacao.fim)}.`;
}
function textoVotacaoSemFinalistas({ anoAlvo, finalistas }) {
  return `A votação do tema da Identidade Visual de ${anoAlvo} NÃO abriu: há ${finalistas} finalista(s) aprovado(s) e são precisos pelo menos ${MIN_FINALISTAS}. `
    + `Conclua a triagem e abra a votação (ela termina em ${dataBr(calendario(anoAlvo).votacao.fim)}).`;
}
function textoVotacaoEsperando({ anoAlvo, pendentes, finalistas }) {
  return `A votação do tema da Identidade Visual de ${anoAlvo} NÃO abriu sozinha: há ${pendentes} sugestão(ões) ainda sem decisão da triagem (e ${finalistas} finalista(s)). `
    + `Termine a triagem — ou abra a votação pelo botão, assim mesmo (ela termina em ${dataBr(calendario(anoAlvo).votacao.fim)}).`;
}
function textoApuracao({ anoAlvo, situacao, tema, votos, total }) {
  if (situacao === "VENCEDOR") return `Votação encerrada: o tema da Identidade Visual de ${anoAlvo} é "${tema}" (${votos} de ${total} voto(s)). Agora vêm as cores e o concurso de arte.`;
  if (situacao === "EMPATE") return `Votação do tema de ${anoAlvo} encerrada com EMPATE (${total} voto(s)): a Diretoria registra o desempate na aba Identidade Visual.`;
  return `A votação do tema de ${anoAlvo} terminou sem nenhum voto: a Diretoria define o tema entre os finalistas na aba Identidade Visual.`;
}
function textoArte({ anoAlvo, cores }) {
  return `Dezembro: fase da arte da Identidade Visual de ${anoAlvo}. ${cores ? `Há ${cores} cor(es) registrada(s).` : "Registre até 3 cores: os membros só podem mandar a arte depois disso."} `
    + "A escolha final (arte + cor) é no culto, até 31/12; registre o resultado no sistema.";
}

// A data de hoje no calendário de Brasília (atalho para quem chama sem relógio próprio).
function hoje(agora = new Date()) { return hojeBrasilia(agora); }

module.exports = {
  PERMISSAO, PRIMEIRO_ANO_TEMAS, MAX_SUGESTOES, MAX_TEXTO, MIN_TEXTO, MAX_TEMA_USADO, MAX_FINALISTAS, MIN_FINALISTAS, MAX_CORES, MAX_ARTES, MAX_IMAGEM_BYTES, TIPOS_IMAGEM,
  FASES, CRITERIOS, OCASIOES,
  calendario, fase, anoAlvoDoDia, podeAbrirCiclo, votacaoFechou, dataBr, hoje,
  normalizar, validarTema, validarTextoLivre, palavras, distancia, parecidos, conferirTemasUsados,
  validarCor, conferirImagem, prepararImagem, limparPng, limparJpeg, base64CabeNoLimite, apurar, validarResultado, retiradaDeArteAte, PRIMEIRO_CICLO,
  textoTriagem, textoVotacaoAberta, textoVotacaoSemFinalistas, textoVotacaoEsperando, textoApuracao, textoArte
};
