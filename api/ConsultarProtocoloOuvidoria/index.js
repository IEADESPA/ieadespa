// ConsultarProtocoloOuvidoria (v3.7)
// GET /api/ouvidoria-protocolo/{protocolo} — SEM login: o protocolo é a
// própria credencial (única forma de um denunciante anônimo acompanhar).
// Devolve só o status, nunca o relato/denunciado/denunciante.
//
// Fecho dos itens em aberto (03/10/2026) — a rota servia de sonda: o protocolo era sequencial (com 4 letras aleatórias), e quem chutasse em série descobria
// quais denúncias existem, de que tipo e em que andamento. Agora:
//  - os protocolos NOVOS são aleatórios de verdade (~79 bits, shared/ouvidoria.js::gerarProtocolo); os antigos continuam consultáveis;
//  - limite por origem (como a lista pública de documentos e a verificação de certificado): 10 consultas por minuto por IP, por instância;
//  - "formato inválido" e "não existe" dão a MESMA resposta e fazem o MESMO caminho (a mesma consulta ao banco, com um valor que nunca existe), para nem a
//    forma nem o tempo da resposta dizerem se o texto chegou a ser procurado.
const { getPool, sql } = require("../shared/db");
const { normalizarProtocolo } = require("../shared/ouvidoria");
const { criarLimitador, chaveDeOrigem } = require("../shared/limiteTaxa");

const limitadorConsulta = criarLimitador({ janelaMs: 60000, maximo: 10 });
const NAO_ENCONTRADO = { sucesso: false, mensagem: "Protocolo não encontrado. Confira se digitou exatamente como recebeu." };
// Nunca é um protocolo (o "#" não está em nenhum dos dois formatos): a consulta roda igual e não acha nada.
const VALOR_IMPOSSIVEL = "#";

module.exports = async function (context, req) {
  const limite = limitadorConsulta.registrar(chaveDeOrigem(req));
  if (!limite.permitido) {
    context.res = { status: 429, headers: { "Retry-After": String(limite.retryAposSegundos) }, body: { sucesso: false, mensagem: "Muitas consultas seguidas. Aguarde um minuto." } };
    return;
  }
  const protocolo = normalizarProtocolo(context.bindingData.protocolo);

  const pool = await getPool();
  const result = await pool.request().input("protocolo", sql.NVarChar(30), protocolo || VALOR_IMPOSSIVEL).query(`
    SELECT Tipo AS tipo, Status AS status, CONVERT(varchar(10), DataProtocolo, 120) AS dataProtocolo
    FROM DenunciasOuvidoria WHERE Protocolo = @protocolo
  `);
  if (!protocolo || result.recordset.length === 0) {
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { ...NAO_ENCONTRADO } };
    return;
  }
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, ...result.recordset[0] } };
};
