// shared/ouvidoria.js (v3.7)
// Ouvidoria Eclesiástica (Art. 104) — canal de denúncias/sugestões sigiloso
// e opcionalmente anônimo, vinculado ao NIF (Conselho Fiscal) + CEI,
// independente da Diretoria Executiva.
const crypto = require("crypto");

// Protocolo é a única forma de o denunciante (inclusive anônimo) acompanhar depois — e a consulta é pública (ConsultarProtocoloOuvidoria): o protocolo É a
// credencial. Fecho dos itens em aberto (03/10/2026): o formato antigo, OUV-AAAA-NNNNN-xxxx, era sequencial com só 4 letras hexadecimais aleatórias (65.536
// possibilidades por número): quem quisesse enumerar descobria quais denúncias existem, de que tipo e em que andamento. O protocolo NOVO não tem mais o
// sequencial e leva 16 caracteres aleatórios (crypto.randomBytes) de um alfabeto sem letras ambíguas (sem 0/O, 1/I/L), ~79 bits:
// OUV-AAAA-XXXX-XXXX-XXXX-XXXX (28 caracteres; a coluna aceita 30). Os protocolos antigos continuam valendo (ninguém perde o acompanhamento).
const ALFABETO_PROTOCOLO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";   // 31 símbolos
const BLOCOS_PROTOCOLO = 4;
const TAMANHO_BLOCO = 4;

// Um símbolo uniforme do alfabeto: descarta o byte que cairia no "resto" (rejeição), para nenhum símbolo sair mais que outro.
function simbolosAleatorios(quantidade) {
  const limite = 256 - (256 % ALFABETO_PROTOCOLO.length);
  let saida = "";
  while (saida.length < quantidade) {
    for (const b of crypto.randomBytes(quantidade * 2)) {
      if (b < limite) saida += ALFABETO_PROTOCOLO[b % ALFABETO_PROTOCOLO.length];
      if (saida.length === quantidade) break;
    }
  }
  return saida;
}

// `pool` não é mais usado (o protocolo não depende de sequência no banco); fica na assinatura para os chamadores não mudarem.
async function gerarProtocolo(_pool, { ano = new Date().getFullYear() } = {}) {
  const s = simbolosAleatorios(BLOCOS_PROTOCOLO * TAMANHO_BLOCO);
  const blocos = [];
  for (let i = 0; i < BLOCOS_PROTOCOLO; i++) blocos.push(s.slice(i * TAMANHO_BLOCO, (i + 1) * TAMANHO_BLOCO));
  return `OUV-${ano}-${blocos.join("-")}`;
}

const RE_PROTOCOLO_NOVO = new RegExp(`^OUV-[0-9]{4}(-[${ALFABETO_PROTOCOLO}]{${TAMANHO_BLOCO}}){${BLOCOS_PROTOCOLO}}$`);
const RE_PROTOCOLO_ANTIGO = /^OUV-[0-9]{4}-[0-9]{5,9}-[0-9a-f]{4}$/;

// Forma canônica do que a pessoa digitou (espaços fora; o novo em maiúsculas, o antigo com o sufixo em minúsculas, como foi emitido), ou null se não é um
// protocolo em nenhum dos dois formatos. Quem chama trata null EXATAMENTE como "não existe" (mesma resposta, mesmo caminho até o banco).
function normalizarProtocolo(entrada) {
  if (typeof entrada !== "string" && typeof entrada !== "number") return null;
  const texto = String(entrada).trim();
  if (texto.length > 40) return null;
  const maiusculo = texto.toUpperCase();
  if (RE_PROTOCOLO_NOVO.test(maiusculo)) return maiusculo;
  const antigo = `${maiusculo.slice(0, -4)}${maiusculo.slice(-4).toLowerCase()}`;      // o sufixo hexadecimal foi emitido em minúsculas
  if (RE_PROTOCOLO_ANTIGO.test(antigo)) return antigo;
  return null;
}

// Art. 104 §8º — vedado compartilhar com a Diretoria Executiva quando ela
// for parte denunciada. Mesma ideia de membroAutorizadoNoOrgaoLocal, só que
// fixa num órgão central (Assentos já referencia Orgaos diretamente).
async function usuarioEhDaDiretoria(pool, sql, membroId) {
  const result = await pool.request().input("membroId", sql.Int, membroId).query(`
    SELECT TOP 1 a.AssentoId
    FROM Assentos a JOIN Orgaos o ON o.OrgaoId = a.OrgaoId
    WHERE a.MembroId = @membroId AND a.DataFim IS NULL AND o.Sigla = 'DIRETORIA_EXECUTIVA'
  `);
  return result.recordset.length > 0;
}

// Remove da lista qualquer denúncia contra alguém da Diretoria quando quem
// está vendo TAMBÉM é da Diretoria (conflito de interesse real, Art. 104
// §8º) — não é redação parcial, é ocultação total da linha.
async function redigirDenuncias(pool, sql, denuncias, usuario) {
  if (denuncias.length === 0) return denuncias;
  const usuarioEhDiretoria = await usuarioEhDaDiretoria(pool, sql, usuario.membroId);
  if (!usuarioEhDiretoria) return denuncias;
  return denuncias.filter(d => !d.denunciadoEhDiretoria);
}

module.exports = { gerarProtocolo, normalizarProtocolo, ALFABETO_PROTOCOLO, usuarioEhDaDiretoria, redigirDenuncias };
