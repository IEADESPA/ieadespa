// e2e-46-trava7c-decisoes-corridas.js — Trava de Revisão 7-C, as duas decisões de 23/10/2026 com corridas de verdade (N processos node, cada um com a sua conexão ao SQL
// Server), sobre a base "cenario-trava7c":
//   - a mesma matrícula ligada a quatro fornecedores ao mesmo tempo: só um fica (o índice único decide; os outros recebem a frase certa, nunca 500);
//   - quatro saídas confirmadas ao mesmo tempo para a voluntária: cada saída tem o seu aviso — nenhuma saída sem aviso nem aviso sem saída (a transação);
//   - quatro pedidos de marcar o mesmo departamento ao mesmo tempo: uma mudança só na trilha;
//   - três rodadas do motor ao mesmo tempo: nenhum aviso repetido.
const { spawn } = require("child_process");
const L = require("./lib");
const { ok, fim, q, escalar, obterPool, path } = L;

async function disparar(chamadas) {
  const t0 = Date.now() + 6000 + chamadas.length * 700;
  const procs = chamadas.map((spec) => new Promise((resolve) => {
    const p = spawn(process.execPath, ["-r", path.join(__dirname, "shim-mssql.js"), path.join(__dirname, "worker.js"), JSON.stringify({ ...spec, t0 })], { env: process.env });
    let saida = ""; p.stdout.on("data", (d) => { saida += d; });
    p.on("exit", () => { const m = saida.split("\n").find((l) => l.startsWith("@@RESULTADO@@")); resolve(m ? JSON.parse(m.slice(13)) : { status: -1, erro: "sem resultado" }); });
  }));
  return Promise.all(procs);
}
const TES_C = { tipo: "LIDER", membroId: 3001, permissoes: ["financeiro"], escopo: ["Central E2E"], nivel: "CONGREGACAO" };

(async () => {
  await obterPool();
  const c1 = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Central E2E'");

  console.log("== a mesma matrícula em quatro fornecedores ao mesmo tempo ==");
  let rs = await disparar([0, 1, 2, 3].map((i) => ({ handler: "fornecedores", token: TES_C, corpo: { nome: `Ana Corrida ${i} E2E`, cpfCnpj: `777.777.777-7${i}`, tipo: "PF", membroId: 6010 } })));
  ok(rs.every((x) => x.status !== 500 && x.status > 0 && !x.erro), "as quatro terminam sem erro de servidor", rs);
  ok((await escalar("SELECT COUNT(*) FROM Fornecedores WHERE MembroId = 6010")) === 1, "no fim, UM fornecedor com a matrícula da Ana");
  ok(rs.filter((x) => x.status === 201).length === 1, "só um cadastro passou", rs.map((x) => x.status));
  ok(rs.filter((x) => x.status !== 201).every((x) => x.mensagem === "Esta matrícula já está ligada a outro fornecedor."), "os outros recebem a frase certa (pela conferência ou pelo índice único, 409)", rs.map((x) => `${x.status} ${x.mensagem}`));
  const fAna = await escalar("SELECT FornecedorId FROM Fornecedores WHERE MembroId = 6010");

  console.log("== quatro saídas confirmadas ao mesmo tempo para a voluntária ==");
  const antesS = await escalar("SELECT COUNT(*) FROM SaidasTesouraria"), antesA = await escalar("SELECT COUNT(*) FROM SaidaAvisosVoluntario");
  rs = await disparar([0, 1, 2, 3].map((i) => ({ handler: "saidas", token: TES_C, corpo: { congregacaoId: c1, fornecedorId: fAna, tipo: "MANUTENCAO", descricao: `Serviço ${i}`, valor: 40 + i, documentoFiscalBase64: Buffer.from("pdf").toString("base64"), mimeType: "application/pdf", confirmoAvisos: ["VOLUNTARIO_ATIVO"] } })));
  ok(rs.every((x) => x.status === 201), "as quatro saídas confirmadas são gravadas", rs.map((x) => `${x.status} ${x.mensagem}`));
  const novasS = (await escalar("SELECT COUNT(*) FROM SaidasTesouraria")) - antesS, novosA = (await escalar("SELECT COUNT(*) FROM SaidaAvisosVoluntario")) - antesA;
  ok(novasS === 4 && novosA === 4, "quatro saídas e quatro avisos", { novasS, novosA });
  ok((await escalar("SELECT COUNT(*) FROM SaidasTesouraria s WHERE s.FornecedorId = @f AND NOT EXISTS (SELECT 1 FROM SaidaAvisosVoluntario a WHERE a.SaidaId = s.SaidaId)", { f: fAna })) === 0, "nenhuma saída da voluntária sem o aviso");

  console.log("== quatro pedidos de marcar o mesmo departamento ao mesmo tempo ==");
  const ADM = { tipo: "GERAL", membroId: 1002, permissoes: ["pessoas"] };
  rs = await disparar([0, 1, 2, 3].map(() => ({ handler: "menores", acao: "funcao-marca", token: ADM, corpo: { tipo: "DEPARTAMENTO", id: 2, contatoComMenores: true } })));
  ok(rs.every((x) => [200, 422].includes(x.status)), "nenhum erro de servidor", rs.map((x) => `${x.status} ${x.mensagem}`));
  ok((await escalar("SELECT ContatoComMenores FROM Departamentos WHERE DepartamentoId = 2")) === true, "a Mocidade fica marcada");
  ok((await escalar("SELECT COUNT(*) FROM AuditLog WHERE Tabela = 'Departamentos' AND RegistroId = 2 AND Acao = 'CONTATO_COM_MENORES_ALTERADO'")) === 1, "uma mudança só na trilha (o estado antigo no WHERE)");
  rs = await disparar([true, false, true, false].map((v) => ({ handler: "menores", acao: "funcao-marca", token: ADM, corpo: { tipo: "DEPARTAMENTO", id: 3, contatoComMenores: v } })));
  const final = await escalar("SELECT ContatoComMenores FROM Departamentos WHERE DepartamentoId = 3");
  const trilha = await q("SELECT DadosDepois FROM AuditLog WHERE Tabela = 'Departamentos' AND RegistroId = 3 AND Acao = 'CONTATO_COM_MENORES_ALTERADO' ORDER BY AuditId");
  const ultimo = trilha.length ? /"contatoComMenores":true/.test(trilha[trilha.length - 1].DadosDepois) : false;
  ok(rs.every((x) => [200, 422].includes(x.status)) && ultimo === final, "ligar e desligar ao mesmo tempo: a trilha termina no mesmo estado do banco", { final, trilha: trilha.length });

  console.log("== três rodadas do motor ao mesmo tempo, sem aviso repetido ==");
  await q("UPDATE Papeis SET ContatoComMenores = 1 WHERE Nome = N'Comitê de Proteção'");
  rs = await disparar([0, 1, 2].map(() => ({ funcao: { modulo: "notificacaoMotor", nome: "avaliarRegras", args: [{ chaves: ["MENORES_FUNCAO_SEM_APTIDAO", "TESOURARIA_VOLUNTARIO_PAGO"] }] } })));
  ok(rs.every((x) => x.status === 200 && !x.erro), "as três rodadas terminam", rs.map((x) => x.erro || (x.resultado && x.resultado.criadas)));
  ok((await escalar(`SELECT COUNT(*) FROM (SELECT RegraChave, DestinatarioMembroId, ReferenciaId FROM Notificacoes WHERE RegraChave IN ('MENORES_FUNCAO_SEM_APTIDAO','TESOURARIA_VOLUNTARIO_PAGO')
    GROUP BY RegraChave, DestinatarioMembroId, ReferenciaId HAVING COUNT(*) > 1) x`)) === 0, "nenhum aviso repetido");
  ok((await escalar("SELECT COUNT(*) FROM Notificacoes WHERE RegraChave = 'MENORES_FUNCAO_SEM_APTIDAO'")) > 0 && (await escalar("SELECT COUNT(*) FROM Notificacoes WHERE RegraChave = 'TESOURARIA_VOLUNTARIO_PAGO'")) > 0, "e os dois avisos saíram");

  fim("e2e-46 (Trava 7-C: as decisões com corridas)");
})().catch((e) => { console.log("ERRO:", e && e.stack); L.shimEncerrar(); process.exitCode = 1; });
