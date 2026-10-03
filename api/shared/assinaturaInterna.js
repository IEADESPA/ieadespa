// shared/assinaturaInterna.js (vB.6 — Assinatura eletrônica interna com trilha)
// Lógica pura de avaliação de integridade — separada do handler HTTP
// (VerificarTermoAssinado) só pra poder testar as 5 combinações sem
// precisar de um Azure SQL de verdade.
const { sha256 } = require("./auditoria");

function avaliarIntegridadeTermo({ catalogoTermo, hashConteudo, versaoTermo }) {
  if (!catalogoTermo) {
    return { status: "TIPO_REMOVIDO_DO_CATALOGO", mensagem: "Este tipo de termo não existe mais no catálogo atual." };
  }
  if (!hashConteudo) {
    return { status: "SEM_HASH_ANTIGO", mensagem: "Assinado antes da trilha de integridade existir (vB.6) — sem hash capturado no momento, não dá pra verificar." };
  }
  if (catalogoTermo.versao !== versaoTermo) {
    return { status: "VERSAO_DESATUALIZADA", mensagem: `O catálogo já tem uma versão mais nova (${catalogoTermo.versao}) — esta assinatura é da versão ${versaoTermo}.` };
  }
  if (sha256(catalogoTermo.texto) !== hashConteudo) {
    return { status: "CONTEUDO_DIVERGENTE", mensagem: "O texto do termo mudou no catálogo sem trocar a versão — inconsistência real, avise a equipe técnica." };
  }
  return { status: "OK", mensagem: "Íntegro — o texto assinado é exatamente o que está no catálogo hoje, nesta versão." };
}

module.exports = { avaliarIntegridadeTermo };
