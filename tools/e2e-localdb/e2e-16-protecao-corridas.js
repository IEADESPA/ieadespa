// e2e-16-protecao-corridas.js — v7.8: corridas de verdade (N processos node, cada um com a sua conexão ao SQL Server) nas rotas da proteção de crianças: o clique duplo no registro,
// o encerramento ao mesmo tempo, o limite de adendos, a reclassificação, o canal de ajuda e a rotina horária. Parte da base "cenario-protecao".
process.env.CRON_SECRET = "segredo-cron-so-do-teste-e2e";
const fs = require("fs");
const { spawn } = require("child_process");
const L = require("./lib");
const { q, um, escalar, ok, fim, GET, POST, GERAL, PIN, API, path } = L;
const { eq, c1 } = JSON.parse(fs.readFileSync(path.join(__dirname, "cenario-menores.json"), "utf8"));
const hoje = L.hojeBr();
const PERM = ["protecao_menores"];
const presidente = GERAL(1001, PERM);
const P = require(path.join(API, "GestaoProtecaoMenores/index.js"));

async function disparar(chamadas) {
  const t0 = Date.now() + 6000 + chamadas.length * 600;      // folga para os processos subirem a ponte e conectarem
  const procs = chamadas.map((spec) => new Promise((resolve) => {
    const p = spawn(process.execPath, ["-r", path.join(__dirname, "shim-mssql.js"), path.join(__dirname, "worker.js"), JSON.stringify({ ...spec, t0 })], { env: process.env });
    let saida = ""; p.stdout.on("data", (d) => { saida += d; });
    p.on("exit", () => { const m = saida.split("\n").find((l) => l.startsWith("@@RESULTADO@@")); resolve(m ? JSON.parse(m.slice(13)) : { status: -1, erro: "sem resultado" }); });
  }));
  return Promise.all(procs);
}
const contar = (rs) => rs.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
const pin = (id) => ({ tipo: "PIN", membroId: id });
const geral = (id) => ({ tipo: "GERAL", membroId: id, permissoes: PERM });
const prot = (acao, token, corpo) => ({ handler: "protecao", acao, token, corpo });
const incidente = (extra = {}) => ({ nivel: "QUEBRA_POLITICA", dataOcorrencia: hoje, congregacaoId: c1, descricao: "Um adulto ficou a sós com uma criança na sala do maternal.", ...extra });
const alegacao = (extra = {}) => incidente({ nivel: "ALEGACAO", relatadoPor: "VOLUNTARIO", relato: "A criança disse, com as palavras dela, que o tio a machucou.", ...extra });
const idDe = async (protocolo) => escalar("SELECT IncidenteId FROM IncidentesProtecao WHERE Protocolo = @p", { p: protocolo });

(async () => {
  let rs, r;
  console.log("== 8 cliques no 'registrar' ao mesmo tempo (a mesma pessoa, o mesmo fato) ==");
  rs = await disparar(Array.from({ length: 8 }, () => prot("registrar", pin(6018), incidente({ descricao: "Registro repetido por clique duplo, mesmo fato, mesma pessoa." }))));
  console.log("   ", JSON.stringify(contar(rs)));
  ok((await escalar("SELECT COUNT(*) FROM IncidentesProtecao WHERE RegistradoPorMembroId = 6018")) === 1, "nasce UM incidente só", await escalar("SELECT COUNT(*) FROM IncidentesProtecao WHERE RegistradoPorMembroId = 6018"));
  ok(rs.every((x) => [201, 422].includes(x.status)) && rs.some((x) => x.status === 201), "as demais chamadas são 'já registrado' (201) ou 'ocupado' (422): nenhuma 500", contar(rs));
  ok((await escalar("SELECT COUNT(*) FROM Notificacoes WHERE RegraChave = 'PROTECAO_INCIDENTE_NOVO' AND ReferenciaTabela = 'IncidentesProtecao'")) === (await escalar("SELECT COUNT(DISTINCT DestinatarioMembroId) FROM Notificacoes WHERE RegraChave = 'PROTECAO_INCIDENTE_NOVO'")), "e cada destinatário recebe UM aviso só (nada de aviso em dobro)");

  console.log("== 6 encerramentos ao mesmo tempo do mesmo caso ==");
  r = await POST(P, "registrar", PIN(6019), incidente({ descricao: "Quebra de teste para a corrida de encerramento do caso." })); const quebra = await idDe(r.body.protocolo);
  rs = await disparar(Array.from({ length: 6 }, (_, i) => prot("encerrar", geral(i % 2 ? 1001 : 1002), { incidenteId: quebra, resultado: "SEM_CONTINUIDADE", providencia: "Conversamos com a equipe e reforçamos a regra." })));
  console.log("   ", JSON.stringify(contar(rs)));
  ok(rs.filter((x) => x.status === 200).length === 1 && rs.filter((x) => x.status === 422).length === 5, "exatamente um encerra; os outros 5 recebem 'já foi encerrado'", contar(rs));
  ok((await escalar("SELECT Status FROM IncidentesProtecao WHERE IncidenteId = @i", { i: quebra })) === "ENCERRADO", "e o caso está encerrado uma vez só");

  console.log("== 4 reclassificações ao mesmo tempo ==");
  r = await POST(P, "registrar", PIN(6019), incidente({ descricao: "Outra quebra de teste para a corrida de reclassificação." })); const q2 = await idDe(r.body.protocolo);
  rs = await disparar(Array.from({ length: 4 }, () => prot("reclassificar", geral(1001), { incidenteId: q2, nivelNovo: "ALEGACAO", motivo: "A criança contou algo mais grave depois.", relatadoPor: "VOLUNTARIO", relato: "Ela disse sozinha que alguém a tocou onde não devia." })));
  console.log("   ", JSON.stringify(contar(rs)));
  ok(rs.filter((x) => x.status === 200).length === 1 && rs.every((x) => [200, 422].includes(x.status)), "uma só vale; as outras são recusadas (422), nenhuma 500", contar(rs));
  ok((await escalar("SELECT COUNT(*) FROM IncidenteReclassificacoes WHERE IncidenteId = @i", { i: q2 })) === 1 && (await escalar("SELECT COUNT(*) FROM IncidenteRelatos WHERE IncidenteId = @i AND Tipo = 'RELATO'", { i: q2 })) === 1, "um histórico e um relato");
  ok((await escalar("SELECT COUNT(*) FROM AuditLog WHERE Acao = 'PROTECAO_INCIDENTE_RECLASSIFICADO'")) === 1, "uma entrada de auditoria");

  console.log("== 8 adendos ao mesmo tempo (o limite é 5) ==");
  rs = await disparar(Array.from({ length: 8 }, (_, i) => prot("adendo", geral(1002), { incidenteId: q2, texto: `Adendo espontâneo de teste número ${i} que a criança contou sozinha.` })));
  console.log("   ", JSON.stringify(contar(rs)));
  ok(rs.filter((x) => x.status === 201).length === 5 && rs.filter((x) => x.status === 422).length === 3, "exatamente 5 entram; 3 são recusados (a escuta não se repete)", contar(rs));
  ok((await escalar("SELECT COUNT(*) FROM IncidenteRelatos WHERE IncidenteId = @i AND Tipo = 'ADENDO'", { i: q2 })) === 5, "e há 5 adendos no banco");

  console.log("== 6 comunicações ao órgão ao mesmo tempo ==");
  const agora = new Date().toISOString();
  rs = await disparar(Array.from({ length: 6 }, (_, i) => prot("comunicacao", geral(i % 2 ? 1001 : 1002), { incidenteId: q2, orgao: "CONSELHO_TUTELAR", forma: "TELEFONE", comunicadoEm: agora, protocoloExterno: `CT-${i}` })));
  console.log("   ", JSON.stringify(contar(rs)));
  ok(rs.every((x) => x.status === 201), "todas entram (cada ligação é um registro; nenhuma 500)", contar(rs));
  ok((await escalar("SELECT COUNT(*) FROM IncidenteComunicacoes WHERE IncidenteId = @i", { i: q2 })) === 6, "seis registros");

  console.log("== o encerramento contra a comunicação, ao mesmo tempo (nada entra num caso já encerrado) ==");
  r = await POST(P, "registrar", PIN(6019), alegacao({ envolvidoNome: "Pessoa de fora (sem cadastro)", descricao: "Suspeita de teste para a corrida entre comunicação e encerramento." })); const q3 = await idDe(r.body.protocolo);
  r = await POST(P, "comunicacao", presidente, { incidenteId: q3, orgao: "CONSELHO_TUTELAR", forma: "OFICIO", comunicadoEm: agora, protocoloExterno: "CT-BASE" }); ok(r.status === 201, "uma comunicação com comprovante já existe", r.body);
  rs = await disparar([
    prot("encerrar", geral(1001), { incidenteId: q3, resultado: "ENCAMINHADO_AUTORIDADE", providencia: "Comunicado ao Conselho Tutelar, protocolo registrado." }),
    ...Array.from({ length: 5 }, (_, i) => prot("comunicacao", geral(1002), { incidenteId: q3, orgao: "POLICIA", forma: "TELEFONE", comunicadoEm: agora, protocoloExterno: `PM-${i}` }))
  ]);
  console.log("   ", JSON.stringify(contar(rs)));
  // (a comparação é feita DENTRO do banco: um Date do JavaScript perderia a precisão dos 100 ns e acusaria uma corrida que não houve)
  const depois = await escalar("SELECT COUNT(*) FROM IncidenteComunicacoes k WHERE k.IncidenteId = @i AND k.RegistradoEm > (SELECT EncerradoEm FROM IncidentesProtecao WHERE IncidenteId = @i)", { i: q3 });
  ok(rs.filter((x) => x.status === 200).length === 1 && depois === 0, "nenhuma comunicação foi gravada DEPOIS do instante do encerramento", { depois, ...contar(rs) });

  console.log("== 4 decisões de afastamento ao mesmo tempo (só acréscimo) ==");
  r = await POST(P, "registrar", PIN(6019), alegacao({ envolvidoMembroId: 6024, descricao: "Suspeita de teste com membro envolvido para a corrida de decisões." })); const q4 = await idDe(r.body.protocolo);
  const env = await escalar("SELECT EnvolvidoId FROM IncidenteEnvolvidos WHERE IncidenteId = @i", { i: q4 });
  rs = await disparar([...Array.from({ length: 2 }, () => prot("cautelar-decidir", geral(1001), { incidenteId: q4, envolvidoId: env, decisao: "MANTIDO_AFASTADO", observacao: "Mantido até a apuração das autoridades." })),
    ...Array.from({ length: 2 }, () => prot("cautelar-decidir", geral(1002), { incidenteId: q4, envolvidoId: env, decisao: "LIBERADO", observacao: "As autoridades arquivaram o caso; levantamos." }))]);
  console.log("   ", JSON.stringify(contar(rs)));
  ok(rs.every((x) => x.status === 200) && (await escalar("SELECT COUNT(*) FROM IncidenteDecisoesCautelares WHERE EnvolvidoId = @e", { e: env })) === 4, "as 4 decisões ficam registradas (histórico), sem 500", contar(rs));
  const ultima = await escalar("SELECT TOP 1 Decisao FROM IncidenteDecisoesCautelares WHERE EnvolvidoId = @e ORDER BY DecisaoId DESC", { e: env });
  const m6024 = (await GET(require(path.join(API, "GestaoMinisterioMenores/index.js")), "minha-situacao", PIN(6024))).body.situacao;
  ok(m6024.bloqueios.some((b) => b.codigo === "PENDENCIA_DIRETORIA") === (ultima === "MANTIDO_AFASTADO"), "o estado da pessoa segue a ÚLTIMA decisão gravada", [ultima, m6024.bloqueios.map((b) => b.codigo)]);

  console.log("== 8 pedidos de ajuda ao mesmo tempo (origens diferentes) ==");
  const antes = await escalar("SELECT COUNT(*) FROM IncidentesProtecao WHERE Origem = 'CANAL_AJUDA'");
  rs = await disparar(Array.from({ length: 8 }, (_, i) => ({ handler: "ajuda", publica: true, corpo: { texto: `Pedido de ajuda de teste simultâneo número ${i}, escrito com as minhas palavras.`, quemSou: "CRIANCA_ADOLESCENTE" }, headers: { "x-forwarded-for": `9.9.9.9, 205.1.1.${i + 1}:443, 10.0.0.1:80` } })));
  console.log("   ", JSON.stringify(contar(rs)));
  ok(rs.every((x) => x.status === 201) && (await escalar("SELECT COUNT(*) FROM IncidentesProtecao WHERE Origem = 'CANAL_AJUDA'")) === antes + 8, "os 8 são registrados, cada um com o seu relógio de 24 horas", contar(rs));
  ok((await escalar("SELECT COUNT(DISTINCT Protocolo) FROM IncidentesProtecao WHERE Origem = 'CANAL_AJUDA'")) === antes + 8, "todos com protocolo diferente");

  console.log("== 4 rodadas da rotina horária ao mesmo tempo ==");
  rs = await disparar(Array.from({ length: 4 }, () => ({ handler: "verificador", rotina: true, headers: { "x-cron-secret": process.env.CRON_SECRET } })));
  console.log("   ", JSON.stringify(contar(rs)));
  ok(rs.every((x) => x.status === 200), "nenhuma falha", [contar(rs), rs.filter((x) => x.status !== 200).map((x) => x.erro || x.mensagem).slice(0, 2)]);
  const dup = await q("SELECT RegraChave, DestinatarioMembroId d, ReferenciaId r, COUNT(*) n FROM Notificacoes WHERE RegraChave LIKE 'PROTECAO[_]%' GROUP BY RegraChave, DestinatarioMembroId, ReferenciaId HAVING COUNT(*) > 1");
  ok(dup.length === 0, "nenhum aviso duplicado (mesma regra, destinatário e referência)", dup.slice(0, 3));

  fim("e2e-16-protecao-corridas");
})().catch((e) => { console.error("ERRO:", e); process.exitCode = 1; try { L.shimEncerrar(); } catch { } });
