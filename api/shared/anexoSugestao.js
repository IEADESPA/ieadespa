// shared/anexoSugestao.js (FASE 10, as sobras de Membros, 19/11/2026) — O ANEXO DA SUGESTÃO do membro (migração 182): a foto do documento que prova a mudança.
// Só imagem (JPEG, PNG, WebP) ou PDF, até 5 MB, conferidos pelo CONTEÚDO (o tipo vem do aparelho e vira o Content-Type do arquivo). Guardado no container privado
// dos documentos com o nome "sug-..."; só a secretaria que decide a sugestão vê (endereço assinado e curto); some quando a sugestão termina de ser decidida.
const { sql } = require("./db");
const imagem = require("./imagemArquivo");
const storage = require("./storage");

const TIPOS = [...imagem.TIPOS, "application/pdf"];
const MAX = 5 * 1024 * 1024;
const MAX_BASE64 = Math.ceil(MAX / 3) * 4 + 16;
const RX_NOME = /^sug-\d{10,16}-[a-z0-9]{1,16}$/;

// { ok, buffer, tipo } ou { ok: false, mensagem }
function validar(anexo) {
  if (!anexo || typeof anexo !== "object" || Array.isArray(anexo)) return { ok: false, mensagem: "O anexo está quebrado: anexe de novo." };
  if (!TIPOS.includes(anexo.tipo)) return { ok: false, mensagem: "O anexo precisa ser uma foto (JPEG, PNG ou WebP) ou um PDF." };
  if (typeof anexo.base64 !== "string" || !anexo.base64 || anexo.base64.length > MAX_BASE64) return { ok: false, mensagem: "O anexo está vazio ou passa de 5 MB." };
  const buffer = Buffer.from(anexo.base64, "base64");
  if (!buffer.length || buffer.length > MAX) return { ok: false, mensagem: "O anexo está vazio ou passa de 5 MB." };
  const confere = anexo.tipo === "application/pdf" ? buffer.toString("ascii", 0, 5) === "%PDF-" : imagem.assinaturaConfere(buffer, anexo.tipo);
  if (!confere) return { ok: false, mensagem: "O arquivo não é do tipo informado: anexe a foto ou o PDF de novo." };
  return { ok: true, buffer, tipo: anexo.tipo };
}

async function guardar(v) { return storage.salvarAnexoSugestao(v.buffer, v.tipo); }

async function ligar(pool, { solicitacaoId, membroId, nome, tipo }) {
  await pool.request().input("s", sql.Int, Number(solicitacaoId)).input("m", sql.Int, Number(membroId)).input("n", sql.NVarChar(400), nome).input("t", sql.NVarChar(40), tipo)
    .query(`UPDATE SolicitacoesEdicaoPessoa SET AnexoNome = @n, AnexoTipo = @t WHERE SolicitacaoId = @s AND MembroId = @m`);
}

// O endereço assinado do anexo (ou null: sem anexo)
async function endereco(pool, solicitacaoId) {
  const r = await pool.request().input("s", sql.Int, Number(solicitacaoId)).query(`SELECT AnexoNome, AnexoTipo FROM SolicitacoesEdicaoPessoa WHERE SolicitacaoId = @s`);
  const l = r.recordset[0];
  if (!l || !l.AnexoNome || !RX_NOME.test(l.AnexoNome)) return null;
  const url = storage.urlDocumentoComSas(l.AnexoNome);
  return url ? { url, tipo: l.AnexoTipo || null } : null;
}

// Minimização: a sugestão já terminou de ser decidida → o arquivo sai (melhor esforço: a decisão já está gravada)
async function limparSeDecidida(pool, solicitacaoId) {
  const r = await pool.request().input("s", sql.Int, Number(solicitacaoId))
    .query(`UPDATE SolicitacoesEdicaoPessoa SET AnexoNome = NULL, AnexoTipo = NULL OUTPUT DELETED.AnexoNome AS Nome
            WHERE SolicitacaoId = @s AND Status = N'CONCLUIDA' AND AnexoNome IS NOT NULL`);
  const nome = r.recordset[0] && r.recordset[0].Nome;
  if (nome && RX_NOME.test(nome)) await storage.excluirDocumento(nome);
  return !!nome;
}

module.exports = { TIPOS, MAX, validar, guardar, ligar, endereco, limparSeDecidida, RX_NOME };
