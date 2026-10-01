// shared/certificados.js (v6.5 — Certificados + página imprimível; v6.9 —
// certificado VERIFICÁVEL)
//
// v6.5: CRUD + PDF/print, nenhum motor novo. Ver preâmbulo de
// sql/migrations/105_ebd_certificados.sql para a decisão de escopo — resumo:
// "emissão de certificados" é genérica (qualquer MembroId + Título/Motivo
// livre), com um vínculo OPCIONAL de conveniência a uma conquista já
// desbloqueada (v6.4), nunca obrigatório.
//
// v6.9 (migração 110): o MESMO certificado ganha (a) um CÓDIGO público de
// verificação — segredo portador de 16 caracteres, ~80 bits — que vai no QR
// do PDF e deixa qualquer pessoa conferir a autenticidade SEM login; (b)
// validade (educação continuada: o certificado vence); (c) um selo de
// integridade (hash dos campos que importam: se alguém mexer na validade ou
// no titular direto no banco, a verificação pública acusa); e (d) revogação
// (anti-fraude/erro de emissão). Nada disso muda o que o v6.5 já fazia.
//
// Emitir um certificado JÁ é o evento real — não existe "certificado
// pendente/rascunho" (diferente de CartasTransito) — então o protocolo
// institucional único (shared/protocolo.js, tipo 'CERT') é gerado no
// INSERT, dentro de emitirCertificado.
//
// Lógica pura (testável sem banco) primeiro, funções de banco (finas)
// depois — mesmo padrão do resto da FASE 6.
const crypto = require("crypto");
const { sql } = require("./db");
const { gerarProtocolo } = require("./protocolo");
const { registrarAuditoria, sha256 } = require("./auditoria");

const TIPO_PROTOCOLO_CERTIFICADO = "CERT";
const URL_PUBLICA_PADRAO = "https://app.ieadespa.org.br";
// Sem I, O, 0 e 1: o código é digitado/lido em papel, e essas quatro
// confundem. 32 símbolos x 16 posições = 80 bits.
const ALFABETO_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TAMANHO_CODIGO = 16;
const MOTIVO_REVOGACAO_MINIMO = 5;

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

// Trava 6-B: "temGestao" acima precisa ser gestão QUE ALCANÇA a pessoa — a
// permissão (ebd_gestao ou trilhas_gestao) e o titular dentro do escopo
// territorial de quem pede (membro sem congregação só por escopo global,
// como auth.estaNoEscopo já trata). Antes, qualquer gestor local via, emitia
// e revogava certificado de qualquer membro da igreja.
async function gestorAlcancaMembro(pool, usuario, membroId) {
  const permissoes = (usuario && usuario.permissoes) || [];
  if (!permissoes.includes("ebd_gestao") && !permissoes.includes("trilhas_gestao")) return false;
  const r = await pool.request().input("id", sql.Int, membroId).query(`
    SELECT c.Nome AS CongregacaoNome FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE m.MembroId = @id
  `);
  if (!r.recordset.length) return false;
  return require("./auth").estaNoEscopo(usuario, r.recordset[0].CongregacaoNome);
}

// ---- Código público de verificação ----

function gerarCodigoVerificacao() {
  let codigo = "";
  for (let i = 0; i < TAMANHO_CODIGO; i++) codigo += ALFABETO_CODIGO[crypto.randomInt(ALFABETO_CODIGO.length)];
  return codigo;
}

// Aceita o código como a pessoa digita ou lê: com hífens, espaços, minúsculo.
function normalizarCodigo(texto) {
  return String(texto == null ? "" : texto).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function codigoValido(texto) {
  return normalizarCodigo(texto).length === TAMANHO_CODIGO;
}

// "ABCD-EFGH-JKLM-NPQR" — legível no papel.
function formatarCodigo(texto) {
  const c = normalizarCodigo(texto);
  return c.length === TAMANHO_CODIGO ? c.match(/.{4}/g).join("-") : (c || null);
}

function urlPublicaBase() {
  return String(process.env.APP_URL_PUBLICA || URL_PUBLICA_PADRAO).replace(/\/+$/, "");
}

// A URL que o QR carrega. A página estática app/verificar.html lê o "c".
function urlVerificacao(codigo) {
  return `${urlPublicaBase()}/verificar.html?c=${encodeURIComponent(formatarCodigo(codigo))}`;
}

// ---- Datas ----

// Coluna DATE do mssql chega como Date à meia-noite UTC (o dia gravado);
// qualquer outro Date é um instante e usa o dia local (mesma regra da
// Trava 6-A, conquistas.js::paraDataLocal). Devolve 'AAAA-MM-DD'.
function isoDia(valor) {
  if (!valor) return null;
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    const meiaNoiteUtc = valor.getUTCHours() === 0 && valor.getUTCMinutes() === 0 && valor.getUTCSeconds() === 0 && valor.getUTCMilliseconds() === 0;
    const [a, m, d] = meiaNoiteUtc ? [valor.getUTCFullYear(), valor.getUTCMonth() + 1, valor.getUTCDate()] : [valor.getFullYear(), valor.getMonth() + 1, valor.getDate()];
    return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(valor));
  return m ? m[1] : null;
}

function isoSegundo(valor) {
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 19);
}

// ---- Selo de integridade ----

// Hash dos campos que dão valor ao certificado. Recalculado na verificação
// pública a partir do que está no banco AGORA: se alguém alterar a validade,
// o titular ou o título direto na tabela, o selo não bate.
function calcularHashIntegridade({ codigo, membroId, titulo, dataEmissao, validoAte }) {
  return sha256(JSON.stringify([normalizarCodigo(codigo), Number(membroId), String(titulo), isoSegundo(dataEmissao), isoDia(validoAte) || ""]));
}

// O que a página pública de verificação mostra. Regra de privacidade: só o
// que já está impresso no certificado (título, nome, datas, protocolo) —
// nunca matrícula, congregação, motivo de revogação nem quem emitiu.
function avaliarVerificacaoPublica({ certificado, hojeIso }) {
  if (!certificado) return { situacao: "NAO_ENCONTRADO" };

  if (certificado.hashIntegridade) {
    const esperado = calcularHashIntegridade({
      codigo: certificado.codigoVerificacao, membroId: certificado.membroId, titulo: certificado.titulo,
      dataEmissao: certificado.dataEmissao, validoAte: certificado.validoAte
    });
    if (esperado !== certificado.hashIntegridade) return { situacao: "INTEGRIDADE_FALHOU" };
  }

  const validoAte = isoDia(certificado.validoAte);
  let situacao = "VALIDO";
  if (certificado.revogadoEm) situacao = "REVOGADO";
  else if (validoAte && hojeIso && validoAte < hojeIso) situacao = "VENCIDO";

  return {
    situacao,
    titulo: certificado.titulo,
    nome: certificado.nome,
    protocolo: certificado.protocolo,
    dataEmissao: isoDia(certificado.dataEmissao),
    validoAte,
    revogadoEm: certificado.revogadoEm ? isoDia(certificado.revogadoEm) : null,
    selo: certificado.hashIntegridade ? "COM_SELO" : "SEM_SELO"
  };
}

function podeRevogarCertificado(certificado, motivo) {
  if (!certificado) return { permitido: false, mensagem: "Certificado não encontrado." };
  if (certificado.revogadoEm) return { permitido: false, mensagem: "Este certificado já foi revogado." };
  if (!motivo || String(motivo).trim().length < MOTIVO_REVOGACAO_MINIMO) {
    return { permitido: false, mensagem: `Informe o motivo da revogação (mínimo ${MOTIVO_REVOGACAO_MINIMO} caracteres).` };
  }
  return { permitido: true };
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
    dataEmissao: row.DataEmissao,
    // v6.9
    codigoVerificacao: row.CodigoVerificacao ? formatarCodigo(row.CodigoVerificacao) : null,
    validoAte: row.ValidoAte ? isoDia(row.ValidoAte) : null,
    trilhaMatriculaId: row.TrilhaMatriculaId || null,
    revogadoEm: row.RevogadoEm || null,
    motivoRevogacao: row.MotivoRevogacao || null,
    hashIntegridade: row.HashIntegridade || null
  };
}

// ---------------------------------------------------------------
// Funções de banco (finas)
// ---------------------------------------------------------------

const SELECT_CERTIFICADO = `
  SELECT c.*, m.Nome AS Nome, cc.Nome AS ConquistaNome
  FROM CertificadosEmitidos c
  JOIN MembroReferencia m ON m.MembroId = c.MembroId
  LEFT JOIN CatalogoConquistas cc ON cc.ConquistaId = c.ConquistaId
`;

function ehColisaoDeCodigo(erro) {
  return !!erro && (erro.number === 2601 || erro.number === 2627) && /UX_CertificadosEmitidos_Codigo/.test(String(erro.message));
}

// `validoAte` ('AAAA-MM-DD') e `trilhaMatriculaId` só vêm da conclusão de
// uma trilha (shared/trilhas.js); a emissão manual da EBD (v6.5) não os usa.
async function emitirCertificado(pool, { membroId, titulo, descricao, conquistaId, emitidoPorMembroId, validoAte, trilhaMatriculaId }) {
  const validacao = validarEmissaoCertificado({ membroId, titulo });
  if (!validacao.valido) return { sucesso: false, mensagem: validacao.mensagem };

  const membro = await pool.request().input("id", sql.Int, membroId).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @id`);
  if (membro.recordset.length === 0) return { sucesso: false, mensagem: "Membro não encontrado." };

  if (conquistaId) {
    const conquista = await pool.request().input("id", sql.Int, conquistaId).query(`SELECT ConquistaId FROM CatalogoConquistas WHERE ConquistaId = @id`);
    if (conquista.recordset.length === 0) return { sucesso: false, mensagem: "Conquista informada não encontrada." };
    // Trava 6-A: o vínculo é com uma conquista que a pessoa JÁ desbloqueou
    // (README v6.5) — antes só se conferia que ela existia no catálogo.
    const desbloqueada = await pool.request().input("id", sql.Int, conquistaId).input("membroId", sql.Int, membroId)
      .query(`SELECT 1 AS ok FROM ConquistasDesbloqueadas WHERE ConquistaId = @id AND MembroId = @membroId`);
    if (desbloqueada.recordset.length === 0) return { sucesso: false, mensagem: "Este membro ainda não desbloqueou a conquista informada." };
  }

  const protocolo = await gerarProtocolo(pool, TIPO_PROTOCOLO_CERTIFICADO);
  const tituloLimpo = String(titulo).trim();
  const emitidoEm = new Date();

  // O código é aleatório; em caso (astronomicamente raro) de colisão com o
  // índice único, sorteia outro em vez de falhar a emissão.
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const codigo = gerarCodigoVerificacao();
    const hash = calcularHashIntegridade({ codigo, membroId, titulo: tituloLimpo, dataEmissao: emitidoEm, validoAte });
    try {
      const result = await pool.request()
        .input("membroId", sql.Int, membroId)
        .input("titulo", sql.NVarChar(150), tituloLimpo)
        .input("descricao", sql.NVarChar(600), descricao ? String(descricao).trim() : null)
        .input("conquistaId", sql.Int, conquistaId || null)
        .input("emitidoPor", sql.Int, emitidoPorMembroId || null)
        .input("protocolo", sql.NVarChar(30), protocolo)
        .input("emitidoEm", sql.DateTime2, emitidoEm)
        .input("codigo", sql.NVarChar(20), codigo)
        .input("validoAte", sql.Date, validoAte || null)
        .input("matriculaId", sql.Int, trilhaMatriculaId || null)
        .input("hash", sql.NVarChar(64), hash)
        .query(`
          INSERT INTO CertificadosEmitidos (MembroId, Titulo, Descricao, ConquistaId, EmitidoPorMembroId, Protocolo, DataEmissao,
                                            CodigoVerificacao, ValidoAte, TrilhaMatriculaId, HashIntegridade)
          OUTPUT INSERTED.CertificadoId
          VALUES (@membroId, @titulo, @descricao, @conquistaId, @emitidoPor, @protocolo, @emitidoEm, @codigo, @validoAte, @matriculaId, @hash)
        `);
      const certificadoId = result.recordset[0].CertificadoId;

      await registrarAuditoria({
        tabela: "CertificadosEmitidos", registroId: certificadoId, acao: "CERTIFICADO_EMITIDO",
        usuarioId: emitidoPorMembroId, dadosAntes: null,
        dadosDepois: { membroId, titulo: tituloLimpo, conquistaId: conquistaId || null, protocolo, validoAte: validoAte || null, trilhaMatriculaId: trilhaMatriculaId || null }
      });

      return { sucesso: true, certificadoId, protocolo, codigoVerificacao: formatarCodigo(codigo), mensagem: "✅ Certificado emitido." };
    } catch (e) {
      if (!ehColisaoDeCodigo(e) || tentativa === 3) throw e;
    }
  }
  return { sucesso: false, mensagem: "Não foi possível gerar um código de verificação único." };
}

async function listarCertificadosMembro(pool, membroId) {
  const result = await pool.request().input("membroId", sql.Int, membroId).query(`
    ${SELECT_CERTIFICADO}
    WHERE c.MembroId = @membroId
    ORDER BY c.DataEmissao DESC
  `);
  return result.recordset.map(mapearCertificado);
}

async function buscarCertificadoPorId(pool, certificadoId) {
  const result = await pool.request().input("id", sql.Int, certificadoId).query(`${SELECT_CERTIFICADO} WHERE c.CertificadoId = @id`);
  return result.recordset.length ? mapearCertificado(result.recordset[0]) : null;
}

// Verificação pública: só por código. Devolve o registro completo (a rota
// pública decide o que expõe, via avaliarVerificacaoPublica).
async function buscarCertificadoPorCodigo(pool, codigo) {
  if (!codigoValido(codigo)) return null;
  const result = await pool.request().input("codigo", sql.NVarChar(20), normalizarCodigo(codigo))
    .query(`${SELECT_CERTIFICADO} WHERE c.CodigoVerificacao = @codigo`);
  if (!result.recordset.length) return null;
  const c = mapearCertificado(result.recordset[0]);
  // mapearCertificado formata o código p/ exibição; a avaliação do selo precisa do valor cru.
  return { ...c, codigoVerificacao: normalizarCodigo(result.recordset[0].CodigoVerificacao) };
}

async function revogarCertificado(pool, { certificadoId, motivo, revogadoPorMembroId }) {
  const certificado = await buscarCertificadoPorId(pool, certificadoId);
  const validacao = podeRevogarCertificado(certificado, motivo);
  if (!validacao.permitido) return { sucesso: false, mensagem: validacao.mensagem };

  await pool.request()
    .input("id", sql.Int, certificadoId).input("motivo", sql.NVarChar(300), String(motivo).trim()).input("por", sql.Int, revogadoPorMembroId || null)
    .query(`UPDATE CertificadosEmitidos SET RevogadoEm = SYSUTCDATETIME(), MotivoRevogacao = @motivo, RevogadoPorMembroId = @por WHERE CertificadoId = @id`);

  await registrarAuditoria({
    tabela: "CertificadosEmitidos", registroId: certificadoId, acao: "CERTIFICADO_REVOGADO",
    usuarioId: revogadoPorMembroId, dadosAntes: { revogado: false }, dadosDepois: { revogado: true, motivo: String(motivo).trim() }
  });

  return { sucesso: true, mensagem: "✅ Certificado revogado." };
}

module.exports = {
  TIPO_PROTOCOLO_CERTIFICADO, ALFABETO_CODIGO, TAMANHO_CODIGO,
  // Lógica pura
  validarEmissaoCertificado, podeAcessarCertificado, gestorAlcancaMembro, mapearCertificado,
  gerarCodigoVerificacao, normalizarCodigo, codigoValido, formatarCodigo, urlVerificacao,
  isoDia, calcularHashIntegridade, avaliarVerificacaoPublica, podeRevogarCertificado,
  // Banco
  emitirCertificado, listarCertificadosMembro, buscarCertificadoPorId, buscarCertificadoPorCodigo, revogarCertificado
};
