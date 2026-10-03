// shared/violacaoUnica.js
// O banco recusa sozinho o que nunca deve repetir (índices ÚNICOS das migrações 127 a 130: sigla de órgão, cargo ocupado, credenciamento, presença, item de remessa, número de
// remessa, geração de prebenda, nome de congregação...). Quando dois pedidos chegam ao mesmo tempo e o segundo perde a corrida, o driver devolve esse erro: 2601 (índice único)
// ou 2627 (restrição UNIQUE/PRIMARY KEY). A rota nunca deixa isso virar 500: responde 409 com uma mensagem que a pessoa entende (ver `conflito`).
function violouUnicidade(erro) {
  if (!erro) return false;
  const numero = erro.number !== undefined ? erro.number : (erro.originalError && erro.originalError.number);
  return numero === 2601 || numero === 2627;
}

// Resposta padrão de conflito: 409 + { sucesso: false, mensagem } (a tela mostra `mensagem` como já faz com as demais recusas).
function conflito(mensagem) {
  return { status: 409, headers: { "Content-Type": "application/json" }, body: { sucesso: false, mensagem } };
}

// Embrulha a função da rota: se QUALQUER gravação dela perder a corrida para um índice único, a resposta é o 409 amigável em vez de uma exceção (500). `mensagem` é o texto ou
// uma função (erro, context, req) => texto, para escolher a frase pelo nome do índice que consta em erro.message (ex.: "UX_Congregacoes_Nome"). Qualquer outro erro segue como antes.
function comConflito(rota, mensagem) {
  return async function (context, req) {
    try {
      return await rota(context, req);
    } catch (erro) {
      if (!violouUnicidade(erro)) throw erro;
      context.res = conflito(typeof mensagem === "function" ? mensagem(erro, context, req) : mensagem);
    }
  };
}

module.exports = { violouUnicidade, conflito, comConflito };
