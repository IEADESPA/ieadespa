const { permitir, ipDoPedido } = require("../src/lib/rateLimit");
const { LIMITE_CORPO_BYTES, ehRobo, validarVisita, criarRegistrador, tamanhoDoCorpo, lerCorpo, gravarNoDirectus } = require("../src/lib/visitas");

/*
 * Contador de visitas (16/10/2026). `POST /api/registrar-visita` com `{ path, referrer_domain }`, chamado pelo `BaseLayout.astro` a cada página
 * vista (mesma origem do site: sem pré-voo CORS). Antes o navegador gravava direto no Directus, uma gravação por visita, e o Directus de
 * produção (B1, um núcleo) travava a 100 % de CPU com ~60–70 visitantes por minuto. Agora esta Function guarda a visita num buffer em memória
 * e o Directus recebe UM POST com o array de linhas a cada 25 visitas ou 10 s (a regra e as garantias estão em `src/lib/visitas.js`).
 *
 * Responde sempre rápido e com `Cache-Control: no-store`: 204 quando guardou (ou ignorou um robô), 400/413 para pedido malformado, 429 acima
 * do limite por IP. O Directus NUNCA derruba a visita: a gravação acontece dentro desta requisição (depois de responder não se conta com a
 * CPU da Function), mas uma falha só devolve as linhas ao buffer. Perda aceita: se a instância reciclar, somem as visitas ainda no buffer
 * (no máximo as dos últimos 10 s) — é só um contador.
 *
 * Só `path` e `referrer_domain` são gravados (o `date_created` o Directus preenche); IP e user-agent não são guardados em lugar nenhum.
 */
const LIMITE_VISITAS_POR_IP = 120; // 5 min; muita gente navega do mesmo Wi-Fi da igreja/evento

const registrador = criarRegistrador({
  gravar: (linhas) => gravarNoDirectus({ url: process.env.DIRECTUS_URL, token: process.env.DIRECTUS_ADMIN_TOKEN })(linhas),
});

module.exports = async function (context, req) {
  const responder = (status, corpo) => {
    context.res = corpo === undefined
      ? { status, headers: { "Cache-Control": "no-store" } }
      : { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: corpo };
  };

  try {
    const userAgent = req.headers && Object.entries(req.headers).find(([nome]) => nome.toLowerCase() === "user-agent")?.[1];
    if (ehRobo(userAgent)) return responder(204);

    if (!permitir(`registrar-visita:${ipDoPedido(req)}`, LIMITE_VISITAS_POR_IP)) return responder(429, { erro: "Muitas visitas em pouco tempo." });

    if (tamanhoDoCorpo(req) > LIMITE_CORPO_BYTES) return responder(413, { erro: "Corpo grande demais." });
    const visita = validarVisita(lerCorpo(req));
    if (!visita.ok) return responder(400, { erro: visita.erro });

    // sem a configuração do Directus não há onde gravar: ignora a visita (não vale encher a memória à toa)
    if (!process.env.DIRECTUS_URL || !process.env.DIRECTUS_ADMIN_TOKEN) return responder(204);

    const resultado = await registrador.registrar(visita.linha);
    if (resultado.descarregou && !resultado.ok) {
      context.log.warn(`Contador de visitas: a gravação de ${resultado.linhas} linha(s) falhou (${resultado.erro && resultado.erro.message}); voltaram ao buffer.`);
    }
    return responder(204);
  } catch (erro) {
    // o contador nunca pode virar erro para quem está só abrindo uma página
    context.log.warn(`Contador de visitas: erro inesperado (${erro && erro.message}).`);
    return responder(204);
  }
};
