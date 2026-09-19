// shared/certificados.js (v6.5 — Certificados + página imprimível)
//
// Fecha a FASE 6 com a versão mais simples do capítulo: CRUD + PDF/print,
// nenhum motor novo. Ver preâmbulo de sql/migrations/105_ebd_certificados.sql
// para a decisão de escopo completa — resumo: "emissão de certificados" é
// genérica (qualquer MembroId + Título/Motivo livre), com um vínculo
// OPCIONAL de conveniência a uma conquista já desbloqueada (v6.4), nunca
// obrigatório.
//
// Emitir um certificado JÁ é o evento real — não existe "certificado
// pendente/rascunho" (diferente de CartasTransito) — então o protocolo
// institucional único (shared/protocolo.js, tipo 'CERT') é gerado no
// INSERT, dentro de emitirCertificado.
//
// Lógica pura (testável sem banco) primeiro, funções de banco (finas)
// depois — mesmo padrão do resto da FASE 6.
const { sql } = require("./db");
const { gerarProtocolo } = require("./protocolo");
const { registrarAuditoria } = require("./auditoria");

const TIPO_PROTOCOLO_CERTIFICADO = "CERT";

// ---------------------------------------------------------------
// Lógica pura
// ---------------------------------------------------------------

// Validação da emissão: MembroId e Título são as únicas exigências reais
// (Descricao/ConquistaId são opcionais) — mesmo espírito minimalista do
// resto desta versão.
function validarEmissaoCertificado({ membroId, titulo }) {
  if (!membroId || !Number.isInteger(Number(membroId)) || Number(membroId) <= 0) {
    return { valido: false, mensagem: "Informe a matrícula do membro que vai receber o certificado." };
  }
  if (!titulo || !String(titulo).trim()) {
    return { valido: false, mensagem: "Informe o título do certificado." };
  }
  if (String(titulo).trim().length > 150) {
    return { valido: false, mensagem: "O título do certificado deve ter até 150 caracteres." };
  }
  return { valido: true };
}

// Só a própria matrícula (autoatendimento, mesmo modelo de CartaPdf) ou
// quem tem a permissão de gestão pode ver/baixar um certificado de
// terceiro.
function podeAcessarCertificado(certificado, { membroIdSolicitante, temGestao }) {
  if (!certificado) return false;
  if (temGestao) return true;
  return Number(certificado.membroId) === Number(membroIdSolicitante);
}

function mapearCertificado(row) {
  return {
    certificadoId: row.CertificadoId,
    membroId: row.MembroId,
    nome: row.Nome,
    titulo: row.Titulo,
    descricao: row.Descricao,
    conquistaId: row.ConquistaId,
    conquistaNome: row.ConquistaNome || null,
    emitidoPorMembroId: row.EmitidoPorMembroId,
    protocolo: row.Protocolo,
    dataEmissao: row.DataEmissao
  };
}

// ---------------------------------------------------------------
// Funções de banco (finas)
// ---------------------------------------------------------------

async function emitirCertificado(pool, { membroId, titulo, descricao, conquistaId, emitidoPorMembroId }) {
  const validacao = validarEmissaoCertificado({ membroId, titulo });
  if (!validacao.valido) return { sucesso: false, mensagem: validacao.mensagem };

  const membro = await pool.request().input("id", sql.Int, membroId).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @id`);
  if (membro.recordset.length === 0) return { sucesso: false, mensagem: "Membro não encontrado." };

  if (conquistaId) {
    const conquista = await pool.request().input("id", sql.Int, conquistaId).query(`SELECT ConquistaId FROM CatalogoConquistas WHERE ConquistaId = @id`);
    if (conquista.recordset.length === 0) return { sucesso: false, mensagem: "Conquista informada não encontrada." };
  }

  const protocolo = await gerarProtocolo(pool, TIPO_PROTOCOLO_CERTIFICADO);

  const result = await pool.request()
    .input("membroId", sql.Int, membroId)
    .input("titulo", sql.NVarChar(150), String(titulo).trim())
    .input("descricao", sql.NVarChar(600), descricao ? String(descricao).trim() : null)
    .input("conquistaId", sql.Int, conquistaId || null)
    .input("emitidoPor", sql.Int, emitidoPorMembroId || null)
    .input("protocolo", sql.NVarChar(30), protocolo)
    .query(`
      INSERT INTO CertificadosEmitidos (MembroId, Titulo, Descricao, ConquistaId, EmitidoPorMembroId, Protocolo)
      OUTPUT INSERTED.CertificadoId
      VALUES (@membroId, @titulo, @descricao, @conquistaId, @emitidoPor, @protocolo)
    `);
  const certificadoId = result.recordset[0].CertificadoId;

  await registrarAuditoria({
    tabela: "CertificadosEmitidos", registroId: certificadoId, acao: "CERTIFICADO_EMITIDO",
    usuarioId: emitidoPorMembroId, dadosAntes: null, dadosDepois: { membroId, titulo, conquistaId: conquistaId || null, protocolo }
  });

  return { sucesso: true, certificadoId, protocolo, mensagem: "✅ Certificado emitido." };
}

async function listarCertificadosMembro(pool, membroId) {
  const result = await pool.request().input("membroId", sql.Int, membroId).query(`
    SELECT c.*, m.Nome AS Nome, cc.Nome AS ConquistaNome
    FROM CertificadosEmitidos c
    JOIN MembroReferencia m ON m.MembroId = c.MembroId
    LEFT JOIN CatalogoConquistas cc ON cc.ConquistaId = c.ConquistaId
    WHERE c.MembroId = @membroId
    ORDER BY c.DataEmissao DESC
  `);
  return result.recordset.map(mapearCertificado);
}

async function buscarCertificadoPorId(pool, certificadoId) {
  const result = await pool.request().input("id", sql.Int, certificadoId).query(`
    SELECT c.*, m.Nome AS Nome, cc.Nome AS ConquistaNome
    FROM CertificadosEmitidos c
    JOIN MembroReferencia m ON m.MembroId = c.MembroId
    LEFT JOIN CatalogoConquistas cc ON cc.ConquistaId = c.ConquistaId
    WHERE c.CertificadoId = @id
  `);
  return result.recordset.length ? mapearCertificado(result.recordset[0]) : null;
}

module.exports = {
  TIPO_PROTOCOLO_CERTIFICADO,
  // Lógica pura
  validarEmissaoCertificado, podeAcessarCertificado, mapearCertificado,
  // Banco
  emitirCertificado, listarCertificadosMembro, buscarCertificadoPorId
};
