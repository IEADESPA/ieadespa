// shared/limiteTaxa.js (Trava 6-B)
// Limite de requisições por origem, em memória, para rota ANÔNIMA que
// consulta o banco (a verificação pública de certificado, v6.9). É uma
// contenção por instância das Functions — não um limite global: com várias
// instâncias, cada uma conta a sua parte. O que ela garante é que uma única
// origem martelando a rota não acorda o banco serverless a cada requisição
// nem consome o pool à toa; um limite global de verdade exige borda paga
// (Front Door/WAF), registrado no README como decisão.
//
// A origem é guardada só como hash truncado do IP (nunca o IP em claro), e a
// tabela se limpa sozinha (janelas vencidas saem na próxima passada).
const crypto = require("crypto");

function criarLimitador({ janelaMs = 60000, maximo = 30, maxChaves = 5000 } = {}) {
  const contadores = new Map(); // chave -> { inicio, total }

  function limpar(agora) {
    for (const [chave, c] of contadores) if (agora - c.inicio >= janelaMs) contadores.delete(chave);
  }

  // Devolve { permitido, restante, retryAposSegundos }.
  function registrar(chave, agora = Date.now()) {
    if (contadores.size > maxChaves) limpar(agora);
    let c = contadores.get(chave);
    if (!c || agora - c.inicio >= janelaMs) {
      c = { inicio: agora, total: 0 };
      contadores.set(chave, c);
    }
    c.total++;
    if (c.total > maximo) {
      return { permitido: false, restante: 0, retryAposSegundos: Math.max(1, Math.ceil((c.inicio + janelaMs - agora) / 1000)) };
    }
    return { permitido: true, restante: maximo - c.total, retryAposSegundos: 0 };
  }

  return { registrar, _tamanho: () => contadores.size };
}

// IP do cliente atrás do proxy do Static Web Apps/Functions. Sem cabeçalho
// conhecido, todas as requisições caem numa chave só ("desconhecida") — o
// limite fica mais apertado, nunca mais frouxo.
// v7.5 (revisão de segurança, medido no Azure em 02/10/2026): o x-azure-clientip e o x-client-ip chegam EXATAMENTE como o cliente os escreveu, e no
// x-forwarded-for só o PENÚLTIMO valor (o último é o proxy do Azure) é confiável. Antes a chave saía do primeiro valor — quem trocasse esse valor a cada
// requisição nunca batia no limite. Ver shared/origemConexao.js.
function chaveDeOrigem(req) {
  const ip = require("./origemConexao").ipDoCliente((req && req.headers) || {}, { apenasPublico: false }) || "desconhecida";
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

module.exports = { criarLimitador, chaveDeOrigem };
