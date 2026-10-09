// worker.js — um processo = uma conexão própria. Espera o instante T0 e faz UMA chamada ao handler real, imprimindo { status, body }. Uso: node -r ./shim-mssql.js worker.js '<json>'
// `handler`: setores | vistorias | menores | escalas | habilitacao (as rotas HTTP); ou `funcao: { modulo: "ministerioMenoresDb", nome, args }` para chamar direto uma função de banco (a rotina diária).
const L = require("./lib");
const { chamar, GERAL, LIDER, PIN, API, path, obterPool } = L;
const spec = JSON.parse(process.argv[2]);
const handlers = { setores: "GestaoSetoresTecnicos/index.js", vistorias: "GestaoVistoriasAntecedentes/index.js", menores: "GestaoMinisterioMenores/index.js", escalas: "GestaoEscalas/index.js", habilitacao: "GestaoHabilitacaoVoluntarios/index.js", protecao: "GestaoProtecaoMenores/index.js", ajuda: "ProtecaoAjuda/index.js", verificador: "ProtecaoVerificador/index.js" };
(async () => {
  const pool = await obterPool();                      // a ponte já está de pé e conectada
  const espera = () => spec.t0 - Date.now();
  if (spec.funcao) {
    const mod = require(path.join(API, "shared", spec.funcao.modulo + ".js"));
    if (espera() > 0) await new Promise((r) => setTimeout(r, espera()));
    const resultado = await mod[spec.funcao.nome](pool, ...(spec.funcao.args || [{}]));
    process.stdout.write("@@RESULTADO@@" + JSON.stringify({ status: 200, resultado }) + "\n");
    L.shimEncerrar();
    return;
  }
  const h = require(path.join(API, handlers[spec.handler]));
  // rotina agendada (segredo no cabeçalho, context.log chamável) e rota pública (sem token)
  if (spec.rotina || spec.publica) {
    if (espera() > 0) await new Promise((r) => setTimeout(r, espera()));
    const ctx = { bindingData: {}, log: Object.assign(() => { }, { error() { }, info() { }, warn() { }, verbose() { } }) };
    await h(ctx, { method: "POST", query: {}, body: spec.corpo || {}, headers: spec.headers || {} });
    const res = ctx.res || { status: 0, body: null };
    process.stdout.write("@@RESULTADO@@" + JSON.stringify({ status: res.status, mensagem: res.body && res.body.mensagem, body: res.body && res.body.sucesso !== undefined ? { sucesso: res.body.sucesso } : null }) + "\n");
    L.shimEncerrar();
    return;
  }
  const t = spec.token;
  const token = t.tipo === "PIN" ? PIN(t.membroId) : t.tipo === "GERAL" ? GERAL(t.membroId, t.permissoes) : LIDER(t.membroId, t.permissoes, t.escopo, t.nivel);
  if (espera() > 0) await new Promise((r) => setTimeout(r, espera()));
  const r = await chamar(h, { acao: spec.acao, metodo: spec.metodo || "POST", token, corpo: spec.corpo, headers: spec.headers || {} });
  process.stdout.write("@@RESULTADO@@" + JSON.stringify({ status: r.status, mensagem: r.body && r.body.mensagem, body: r.body && r.body.sucesso !== undefined ? { sucesso: r.body.sucesso } : null }) + "\n");
  L.shimEncerrar();
})().catch((e) => { process.stdout.write("@@RESULTADO@@" + JSON.stringify({ status: 0, erro: String(e && e.message) }) + "\n"); try { L.shimEncerrar(); } catch { } process.exit(0); });
