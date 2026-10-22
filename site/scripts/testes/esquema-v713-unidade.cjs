// Teste de UNIDADE do script de esquema da v7.13 (site/scripts/directus-eventos-v713-esquema.mjs), rodando o script DE VERDADE em modo --simular contra um Directus de
// mentira (servidor HTTP local, sem tocar nenhum Directus): os campos que ele cria e — revisão de 22/10/2026 — a conferência das permissões PÚBLICAS em todas as linhas
// (não só a primeira) e em mais ações/coleções (criar/apagar inscrição, criar resposta, qualquer coisa em evento_entradas).
// Sem rede externa. Como rodar (de dentro de site/):  node scripts/testes/esquema-v713-unidade.cjs
const http = require("http");
const path = require("path");
const { execFile } = require("child_process");

let falhas = 0;
let total = 0;
const eq = (a, b, d) => {
  total += 1;
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { falhas++; console.log("  FALHA", d, "→", JSON.stringify(a), "esperado", JSON.stringify(b)); } else console.log("  ok   ", d);
};
const verdade = (c, d) => eq(!!c, true, d);

const PUBLICA = "pub-1";
function servidor(permissoes) {
  const campos = {
    inscricoes_eventos: ["id", "evento", "nome", "pago", "presente", "aguardando_vaga", "push_endpoint"],
    camiseta_pedidos: ["id", "nome", "valor_pago"],
    eventos: ["id", "title", "faixas_valor"],
    respostas_inscricao: ["id", "inscricao", "pergunta", "valor"],
    evento_entradas: ["id"],
  };
  return http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    const json = (status, data) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify({ data })); };
    const m = /^\/fields\/(\w+)$/.exec(u.pathname);
    if (m) return campos[m[1]] ? json(200, campos[m[1]].map((field) => ({ field }))) : json(403, null);
    if (u.pathname === "/relations") return json(200, []);
    if (u.pathname === "/policies") return json(200, [{ id: PUBLICA, name: "$t:public_label", admin_access: false }, { id: "eq-1", name: "Editor de eventos", admin_access: false }, { id: "adm", name: "Administrator", admin_access: true }]);
    if (u.pathname === "/permissions") return json(200, permissoes);
    return json(404, null);
  });
}

function rodar(porta) {
  return new Promise((resolve) => {
    execFile(process.execPath, [path.join(__dirname, "../directus-eventos-v713-esquema.mjs"), "--simular"], { env: { ...process.env, DIRECTUS_URL: `http://127.0.0.1:${porta}`, DIRECTUS_ADMIN_TOKEN: "teste" } }, (erro, saida) => resolve({ codigo: erro ? erro.code : 0, saida }));
  });
}

(async () => {
  const perm = (collection, action, fields, extra = {}) => ({ id: Math.floor(Math.random() * 1e6), policy: PUBLICA, collection, action, fields, permissions: {}, validation: {}, ...extra });
  const cenarios = [
    {
      nome: "público bem fechado",
      permissoes: [perm("inscricoes_eventos", "read", ["id", "evento", "aguardando_vaga", "presente"]), perm("inscricoes_eventos", "update", ["push_endpoint", "push_p256dh", "push_auth"]), perm("respostas_inscricao", "create", ["inscricao", "pergunta", "valor"]),
        { id: 1, policy: "eq-1", collection: "inscricoes_eventos", action: "update", fields: ["*"], permissions: {}, validation: {} }],
    },
    {
      nome: "público aberto demais",
      permissoes: [
        perm("inscricoes_eventos", "read", ["id", "evento"]),
        perm("inscricoes_eventos", "read", ["*"]), // a SEGUNDA linha é a perigosa
        perm("inscricoes_eventos", "create", ["evento", "nome"]),
        perm("inscricoes_eventos", "delete", ["*"]),
        perm("inscricoes_eventos", "update", ["push_endpoint", "pago"]),
        perm("evento_entradas", "create", ["*"]),
        perm("respostas_inscricao", "create", ["*"]),
      ],
    },
  ];
  const resultados = {};
  for (const c of cenarios) {
    const s = servidor(c.permissoes);
    await new Promise((r) => s.listen(0, "127.0.0.1", r));
    resultados[c.nome] = await rodar(s.address().port);
    s.close();
  }
  const bom = resultados["público bem fechado"];
  const ruim = resultados["público aberto demais"];
  console.log("== o esquema (modo --simular) ==");
  for (const campo of ["faixa_rotulo", "tipo_participante", "pagamento_informado_nome", "pago_conferido_por_nome", "pago_conferido_valor", "cortesia_registrada_valor", "cortesia_motivo"]) verdade(bom.saida.includes(`campo inscricoes_eventos.${campo}`), `cria inscricoes_eventos.${campo}`);
  verdade(bom.saida.includes("campo respostas_inscricao.date_created"), "[revisão 2] cria a data de criação das respostas (o crachá só usa a feita junto com a inscrição)");
  verdade(bom.saida.includes("campo camiseta_pedidos.pagamento_informado_valor") && bom.saida.includes("campo eventos.cracha_config"), "cria o aviso no pedido de camiseta e a configuração do crachá");
  console.log("== as permissões públicas ==");
  eq([bom.codigo, /ATENÇÃO/.test(bom.saida)], [0, false], "público bem fechado: nenhuma ATENÇÃO e o script termina bem");
  verdade(/aviso: o público pode CRIAR em respostas_inscricao/.test(bom.saida), "[revisão 15] a criação pública de respostas (a pesquisa) é mostrada, com a regra e a validação");
  verdade(/o público pode LER TODOS os campos de inscricoes_eventos/.test(ruim.saida), "[revisão 15] a SEGUNDA linha de leitura pública com '*' é achada (antes só a primeira era olhada)");
  verdade(/o público pode CRIAR em inscricoes_eventos/.test(ruim.saida), "[revisão 15] criação pública de inscrição: ATENÇÃO");
  verdade(/o público pode APAGAR em inscricoes_eventos/.test(ruim.saida), "[revisão 15] exclusão pública de inscrição: ATENÇÃO");
  verdade(/o público pode ALTERAR pago em inscricoes_eventos/.test(ruim.saida), "[revisão 15] alteração pública do 'pago': ATENÇÃO");
  verdade(/o público pode CRIAR em evento_entradas/.test(ruim.saida), "[revisão 15] qualquer permissão pública em evento_entradas: ATENÇÃO");
  eq(ruim.codigo, 1, "[revisão 15] com permissão pública aberta demais, o script termina com erro (código 1)");

  console.log(falhas === 0 ? `\nTUDO CERTO (${total} verificações)` : `\n${falhas} FALHA(S) de ${total}`);
  process.exit(falhas === 0 ? 0 : 1);
})().catch((e) => { console.log("ERRO NO TESTE:", e && e.stack); process.exit(1); });
