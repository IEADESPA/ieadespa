// Saude (vD.5, 06/10/2026) — "o sistema está no ar?", sem tocar no banco.
//
// GET /api/saude -> { ok: true, hora, instancia }
//
// Para quem é: o fluxo `.github/workflows/sistema-disponibilidade.yml`, que chama isto a cada
// 5 minutos e avisa por e-mail quando não responde. Como NÃO abre o banco, a chamada mantém as
// Functions aquecidas (some a partida a frio de 15-30 s) sem acordar o Azure SQL serverless — que
// continua pausando de madrugada (a lição de custo de 06/10/2026, ver HOMOLOGACAO.md).
// Não devolve versão, nome de servidor nem nada que ajude a mapear o ambiente: só "ok" e a hora.
module.exports = async function (context) {
  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: { ok: true, hora: new Date().toISOString() }
  };
};
