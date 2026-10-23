// e2e-33-crise.js — v7.15 (Gestão de crise e porta-voz único; segurança da congregação), com os handlers e o banco REAIS, sobre a base "cenario-crise" (cenario-pastoral + a
// migração 152 aplicada duas vezes: `bash rodar.sh preparar-crise`).
// O esquema (crise única, histórico e manifestação que não se reescrevem, CHECK que fecham o NULL, a categoria CRISE na comunicação), quem pode o quê (PIN, liderança sem
// permissão, Dirigente, Pastor de Área, nível geral, o porta-voz), a confirmação reforçada, a abertura com o aviso a TODA a liderança (sininho na hora, celular na primeira rodada,
// e-mail pela fila com a prioridade e o teto da hora), a troca do porta-voz e o encerramento (o aviso velho que estava na fila é cancelado; quem deixou a liderança no meio também
// recebe o fim), as manifestações e as correções, os pedidos da imprensa (encaminhamento, resposta, correção), a segurança (plano em versões, simulado, vistoria com pendência,
// AVCB e seguro, equipe só de adultos da congregação, saída automática), os avisos do sininho, a retenção, a exclusão LGPD, Meus Dados, a auditoria e uma bateria de lixo.
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, API, path, GET, POST, LIDER, GERAL, PIN, sessao, chamar, hojeBr } = L;

// os canais de mentira ANTES de carregar os handlers (a comunicação guarda a referência na carga): o e-mail anota o que "saiu"; o celular entrega 1 aparelho
const enviados = [], pushes = [];
const emailMod = require(path.join(API, "shared/notificacaoEmail.js"));
emailMod.enviarEmailComunicado = async (m) => { enviados.push(m); return { ok: true }; };
emailMod.enviarEmailNotificacao = async () => true;
const pushMod = require(path.join(API, "shared/notificacaoPush.js"));
pushMod.enviarPushNotificacao = async (_pool, _sql, membroId, msg) => { pushes.push({ membroId, ...msg }); return 1; };
let falhasAuditoria = 0;
const erroOriginal = console.error;
console.error = (...a) => { if (String(a[0]).includes("[AUDITORIA]")) falhasAuditoria++; if (process.env.E2E_VERBOSO) erroOriginal(...a); };

const H = require(path.join(API, "GestaoCriseSeguranca/index.js"));
const HC = require(path.join(API, "GestaoComunicacao/index.js"));
const db = require(path.join(API, "shared/criseSegurancaDb.js"));
const com = require(path.join(API, "shared/comunicacaoDb.js"));
const cm = require(path.join(API, "shared/comunicacao.js"));
const cs = require(path.join(API, "shared/criseSeguranca.js"));
const { avaliarRegras } = require(path.join(API, "shared/notificacaoMotor.js"));

const C = "Central E2E", V = "Vila Nova E2E", B = "Beta E2E";
const PERM_GERAL = ["crise_gestao", "seguranca_congregacao", "comunicacao"];
const SEC = GERAL(1002, PERM_GERAL);
const SEC_SEM_FATOR = sessao(1002, { via: "SENHA", fator: { via: "NENHUM" }, nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: PERM_GERAL });
const DIR_C = LIDER(3001, ["seguranca_congregacao", "comunicacao"], [C]);
const DIR_V = LIDER(3002, ["seguranca_congregacao"], [V]);
const DIR_B = LIDER(3004, ["seguranca_congregacao"], [B]);
const PASTOR_AREA = LIDER(3003, ["seguranca_congregacao"], [C, V], "AREA");
const LIDER_SEM = LIDER(1003, ["setores_tecnicos"], "TODAS", "GLOBAL");
const PORTA_VOZ = LIDER(2004, [], [C]);                 // o profissional designado (membro, sem permissão nenhuma)
const P = { ana: 8010, bento: 8011, carla: 8012, menor: 8021, vilaA: 8030, semNasc: 2007 };
const VER_CRISE = { membroId: 1002, crise: true, seguranca: true, geralSeguranca: true, podeVerCongregacao: () => true };
const somarDias = (iso, d) => { const [a, m, x] = iso.split("-").map(Number); return new Date(Date.UTC(a, m - 1, x + d)).toISOString().slice(0, 10); };
const falha = async (texto, params) => { try { await q(texto, params); return null; } catch (e) { return e.message || String(e); } };
const dataHoraAgora = (minutos = 0) => new Date(Date.now() - 3 * 3600000 + minutos * 60000).toISOString().slice(0, 16);
const TABELAS = ["CriseRegimes", "CriseHistorico", "CriseManifestacoes", "CriseDemandasImprensa", "CriseDemandaRespostas", "SegurancaPlanos", "SegurancaSimulados", "SegurancaVistorias",
  "SegurancaVistoriaItens", "SegurancaEquipe", "ComunicacaoEnvios", "ComunicacaoEntregas", "Notificacoes"];
async function retrato() {
  const partes = [];
  for (const t of TABELAS) partes.push(JSON.stringify(await um(`SELECT COUNT(*) n, CHECKSUM_AGG(CHECKSUM(*)) c FROM ${t}`)));
  return partes.join("|");
}
// para cada campo e cada lixo: nunca 500, nunca texto interno; se recusou (>= 400), o banco fica IGUAL
async function fuzz(rotulo, { base, campos, chamarCom }) {
  let chamadas = 0; const quebras = [], mudancas = [];
  for (const campo of campos) for (const lixo of L.LIXO) {
    const corpo = { ...base };
    if (lixo === undefined) delete corpo[campo]; else corpo[campo] = lixo;
    const antes = await retrato();
    const r = await chamarCom(corpo);
    chamadas++;
    if (r.status === 500 || ![200, 201, 400, 403, 404, 409, 422, 428, 429].includes(r.status)) quebras.push(`${campo}=${JSON.stringify(lixo).slice(0, 30)} -> ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
    else if (r.status >= 400 && (await retrato()) !== antes) mudancas.push(`${campo}=${JSON.stringify(lixo).slice(0, 30)} (${r.status})`);
    if (r.body && /SELECT |INSERT |UPDATE |ConnectionError|mssql|tedious|node_modules/i.test(JSON.stringify(r.body))) quebras.push(`${campo} vazou texto interno`);
  }
  ok(quebras.length === 0, `${rotulo}: ${chamadas} chamadas com lixo, nenhuma 500 nem vazamento`, quebras.slice(0, 4));
  ok(mudancas.length === 0, `${rotulo}: chamada recusada nunca altera o banco`, mudancas.slice(0, 4));
}

(async () => {
  const pool = await obterPool();
  const cong = {};
  for (const [k, n] of [["c", C], ["v", V], ["b", B]]) cong[k] = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = @n", { n });
  await q("UPDATE Prazos SET Dias = 5 WHERE Sigla = 'COMUNICACAO_EMAILS_POR_RODADA'; UPDATE Prazos SET Dias = 8 WHERE Sigla = 'COMUNICACAO_EMAILS_POR_HORA'");
  await q("DELETE FROM PushInscricoesMembro WHERE MembroId IN (3001, 3002)");
  await q("INSERT INTO PushInscricoesMembro (MembroId, Endpoint, P256dh, Auth) VALUES (3001, N'https://push.e2e/3001', N'p', N'a'), (3002, N'https://push.e2e/3002', N'p', N'a')");
  await q("UPDATE MembroReferencia SET Email = NULL WHERE MembroId = 3004");      // um líder sem e-mail: SEM_CONTATO

  console.log("== o esquema da 152 (aplicada duas vezes) ==");
  for (const t of TABELAS.slice(0, 10)) ok((await escalar("SELECT COUNT(*) FROM sys.tables WHERE name = @t", { t })) === 1, `tabela ${t} existe`);
  const gatilhos = await q("SELECT name FROM sys.triggers WHERE (name LIKE 'TR[_]Crise%' OR name LIKE 'TR[_]Seguranca%') AND is_disabled = 0");
  ok(gatilhos.length === 10, "os 10 gatilhos existem e estão ligados", gatilhos.map((g) => g.name));
  const unicos = (await q("SELECT name FROM sys.indexes WHERE is_unique = 1 AND has_filter = 1 AND (name LIKE 'UX[_]Crise%' OR name LIKE 'UX[_]Seguranca%')")).map((x) => x.name).sort();
  ok(JSON.stringify(unicos) === JSON.stringify(["UX_CriseDemandaRespostas_Primeira", "UX_CriseDemandaRespostas_Substitui", "UX_CriseDemandasImprensa_Correcao", "UX_CriseHistorico_Abertura",
    "UX_CriseHistorico_Encerramento", "UX_CriseManifestacoes_Correcao", "UX_CriseRegimes_UmaAtiva", "UX_SegurancaEquipe_Ativo"]), "os 8 índices únicos filtrados", unicos);
  const naoConfiaveis = await escalar("SELECT COUNT(*) FROM sys.check_constraints WHERE (name LIKE 'CK[_]Crise%' OR name LIKE 'CK[_]Seguranca%' OR name LIKE 'CK[_]Comunicacao%[_]Categoria') AND (is_disabled = 1 OR is_not_trusted = 1)");
  const nChecks = await escalar("SELECT COUNT(*) FROM sys.check_constraints WHERE name LIKE 'CK[_]Crise%' OR name LIKE 'CK[_]Seguranca%'");
  ok(naoConfiaveis === 0 && nChecks >= 30, `os ${nChecks} CHECK estão ligados e confiáveis`);
  for (const t of ["ComunicacaoModelos", "ComunicacaoEnvios"]) {
    ok((await escalar("SELECT COUNT(*) FROM sys.check_constraints WHERE name = @n AND definition LIKE N'%CRISE%' AND definition LIKE N'%CONVOCACAO%' AND definition LIKE N'%FINANCEIRO%'", { n: `CK_${t}_Categoria` })) === 1,
      `a categoria CRISE entrou no CHECK de ${t} sem tirar nenhuma`);
  }
  const papeis = async (perm) => (await q(`SELECT Nome FROM Papeis WHERE (',' + Permissoes + ',') LIKE '%,${perm},%' ORDER BY Nome`)).map((p) => p.Nome);
  ok(JSON.stringify(await papeis("crise_gestao")) === JSON.stringify(["Presidente", "Secretário Geral"]), "crise_gestao só no Presidente e no Secretário Geral", await papeis("crise_gestao"));
  ok(JSON.stringify(await papeis("seguranca_congregacao")) === JSON.stringify(["Dirigente de Congregação", "Pastor de Área", "Presidente", "Secretário Geral"]), "seguranca_congregacao nos 4 papéis");
  ok((await escalar("SELECT COUNT(*) FROM Papeis WHERE Permissoes LIKE '%crise_gestao%crise_gestao%' OR Permissoes LIKE '%seguranca_congregacao%seguranca_congregacao%'")) === 0, "reaplicar não duplicou a permissão");
  const prazos = Object.fromEntries((await q("SELECT Sigla, COUNT(*) n, MAX(Dias) d FROM Prazos WHERE Sigla LIKE 'SEGURANCA[_]%' GROUP BY Sigla")).map((p) => [p.Sigla, [p.n, p.d]]));
  ok(JSON.stringify(prazos) === JSON.stringify({ SEGURANCA_PLANO_REVISAO_DIAS: [1, 365], SEGURANCA_SIMULADO_MAX_DIAS: [1, 365], SEGURANCA_VISTORIA_MAX_DIAS: [1, 180] }), "os 3 prazos, uma vez cada", prazos);
  const regras = await q("SELECT Chave, CanalEmail, CanalPush, Obrigatoria FROM NotificacaoRegras WHERE Chave LIKE 'SEGURANCA[_]%' OR Chave = 'CRISE_DEMANDA_IMPRENSA'");
  ok(regras.length === 5 && regras.filter((r) => r.Chave.startsWith("SEGURANCA")).every((r) => !r.CanalEmail && !r.CanalPush && !r.Obrigatoria), "as 4 regras da segurança só no sininho", regras);
  ok(regras.some((r) => r.Chave === "CRISE_DEMANDA_IMPRENSA" && r.Obrigatoria && r.CanalPush && !r.CanalEmail), "o pedido da imprensa: obrigatório, celular, sem e-mail direto");
  const pol = await q("SELECT Categoria, DiasRetencao, BaseLegal FROM PoliticasRetencao WHERE Categoria LIKE N'Crise%' OR Categoria LIKE N'Segurança%'");
  ok(pol.length === 3 && pol.every((p) => p.BaseLegal !== "x"), "as 3 políticas de retenção com a base legal escrita", pol);

  console.log("== quem entra ==");
  ok((await GET(H, "faixa", PIN(P.ana))).status === 403, "PIN não vê a faixa (é da liderança)");
  const f0 = await GET(H, "faixa", LIDER_SEM);
  ok(f0.status === 200 && f0.body.ativa === false, "liderança sem permissão nenhuma lê a faixa: sem crise", f0.body);
  ok((await POST(H, "abrir", DIR_C, { motivo: "Tentativa" })).status === 403, "o Dirigente não abre crise");
  ok((await POST(H, "abrir", LIDER(3001, ["crise_gestao"], [C]), { motivo: "Tentativa" })).status === 403, "crise_gestao numa concessão local não abre crise");
  ok((await GET(H, "seguranca", LIDER_SEM)).status === 403, "liderança sem a permissão não vê a segurança");

  console.log("== uma comunicação comum já na fila, para provar a prioridade do aviso ==");
  await q(`INSERT INTO ComunicacaoConsentimentos (MembroId, Canal, Categoria, Concedido, Origem, TextoVersao, TextoHash)
    SELECT m.MembroId, 'EMAIL', 'EVENTOS', 1, 'MEU_PAINEL', @v, @h FROM MembroReferencia m WHERE m.CongregacaoId = @c AND m.Status = 'ATIVO' AND m.Email IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM ComunicacaoConsentimentos k WHERE k.MembroId = m.MembroId AND k.Categoria = 'EVENTOS' AND k.Canal = 'EMAIL')`, { v: cm.TEXTO_VERSAO, h: cm.hashDoTexto("EVENTOS"), c: cong.c });
  const VER_COM = { membroId: 1002, gestao: true, geral: true, podeVerCongregacao: () => true };
  const mod = (await com.salvarModelo(pool, { ver: VER_COM, dados: { categoria: "EVENTOS", titulo: "Congresso E2E", corpo: "Olá, {{primeiro_nome}}: congresso no sábado." } })).modelo;
  await com.aprovarModelo(pool, { ver: VER_COM, modeloId: mod.modeloId, hash: mod.hash });
  const comum = await com.enviar(pool, { ver: VER_COM, dados: { modeloId: mod.modeloId, criterios: { territorio: { tipo: "CONGREGACAO", ids: [cong.c] } } } });
  const comumPend = await escalar("SELECT COUNT(*) FROM ComunicacaoEntregas WHERE EnvioId = @e AND Canal = 'EMAIL' AND Situacao = 'PENDENTE'", { e: comum.envioId });
  ok(comum.sucesso && comumPend > 0 && enviados.length === 5, `o comunicado de eventos mandou 5 (a cota da rodada) e deixou ${comumPend} na fila`, { e: enviados.length, comumPend });

  console.log("== abrir o regime de crise ==");
  const PV = { tipo: "DESIGNADO", membroId: 2004, nome: "Nome digitado", contato: "imprensa@ieadespa.e2e", ato: "Ato da Presidência nº 12/2026" };
  ok((await POST(H, "abrir", SEC_SEM_FATOR, { motivo: "Acidente no templo", portaVoz: PV })).status === 428, "sem a confirmação reforçada: 428");
  ok((await POST(H, "abrir", SEC, { motivo: "Acidente no templo", portaVoz: { ...PV, ato: "" } })).status === 422, "designado sem o ato da designação: recusado");
  ok((await POST(H, "abrir", SEC, { motivo: "Acidente no templo", portaVoz: { ...PV, membroId: 2009 } })).status === 422, "porta-voz com matrícula de desligado: recusado");
  ok((await escalar("SELECT COUNT(*) FROM CriseRegimes")) === 0, "nada foi gravado nas recusas");
  const lideresEsperados = await escalar(`SELECT COUNT(DISTINCT m.MembroId) FROM Lideranca l JOIN MembroReferencia m ON m.MembroId = l.MembroId
    WHERE m.Status = 'ATIVO' AND (l.AtivoAte IS NULL OR l.AtivoAte >= CAST(SYSUTCDATETIME() AS DATE))
      AND NOT EXISTS (SELECT 1 FROM SolicitacoesTitularLGPD s WHERE s.MembroId = m.MembroId AND s.Tipo = 'EXCLUSAO' AND s.Status = 'ATENDIDA')`);
  const antesEnv = enviados.length, antesPush = pushes.length;
  const ab = await POST(H, "abrir", SEC, { motivo: "Acidente no templo", portaVoz: PV });
  ok(ab.status === 201 && ab.body.criseId > 0, "o Secretário Geral abre o regime (201)", ab.body);
  const criseId = ab.body.criseId;
  const linha = await um("SELECT * FROM CriseRegimes WHERE CriseId = @c", { c: criseId });
  ok(linha.OrdenadoPorMembroId === 1001 && linha.RegistradoPorMembroId === 1002 && linha.Status === "ATIVA" && linha.Alcance === "CAMPO", "quem ordenou é o Presidente; quem registrou, o Secretário; alcance: o Campo", linha);
  ok(linha.PortaVozNome === "Adv Davi E2E" && linha.PortaVozMembroId === 2004 && linha.DesignacaoAto === PV.ato, "o porta-voz com matrícula leva o nome do cadastro, o contato e o ato", linha);
  const hAb = await um("SELECT * FROM CriseHistorico WHERE CriseId = @c AND Evento = 'ABERTA'", { c: criseId });
  const envioAb = hAb.EnvioId;
  const env = await um("SELECT * FROM ComunicacaoEnvios WHERE EnvioId = @e", { e: envioAb });
  ok(env.Categoria === "CRISE" && env.Total === lideresEsperados && lideresEsperados >= 10, `o aviso vai a toda a liderança ativa (${lideresEsperados} pessoas)`, { total: env.Total, lideresEsperados });
  ok((await escalar("SELECT COUNT(*) FROM Notificacoes WHERE RegraChave = 'COMUNICADO' AND ReferenciaTabela = 'ComunicacaoEnvios' AND ReferenciaId = @e", { e: envioAb })) === lideresEsperados,
    "o sininho de cada líder nasceu junto com o regime");
  const sino3001 = await um("SELECT Titulo, Mensagem FROM Notificacoes WHERE RegraChave = 'COMUNICADO' AND ReferenciaId = @e AND DestinatarioMembroId = 3001", { e: envioAb });
  ok(/porta-voz/i.test(sino3001.Titulo) && /Paz do Senhor, Dirigente\./.test(sino3001.Mensagem) && /Adv Davi E2E/.test(sino3001.Mensagem) && /§ 2º/.test(sino3001.Mensagem) && !/Acidente no templo/.test(sino3001.Mensagem),
    "o texto: primeiro nome, o porta-voz, a vedação do § 2º — e NUNCA o motivo registrado", sino3001);
  const pushesDoAviso = pushes.slice(antesPush).filter((p) => p.titulo === "Crise: só Adv Davi E2E fala pela Igreja").map((p) => p.membroId).sort((a, b) => a - b);
  const comAparelho = (await q("SELECT DISTINCT s.MembroId AS m FROM ComunicacaoEntregas s WHERE s.EnvioId = @e AND s.Canal = 'PUSH' AND s.Situacao <> 'SEM_APARELHO' ORDER BY 1", { e: envioAb })).map((x) => x.m);
  ok(pushesDoAviso.includes(3001) && pushesDoAviso.includes(3002) && JSON.stringify(pushesDoAviso) === JSON.stringify(comAparelho), "o celular saiu NA HORA para todos os líderes com aparelho", { pushesDoAviso, comAparelho });
  const emailsDoAviso = enviados.slice(antesEnv);
  const emailCrise = await q("SELECT MembroId, Situacao FROM ComunicacaoEntregas WHERE EnvioId = @e AND Canal = 'EMAIL' AND Situacao IN ('ACEITO', 'ALCANCADO')", { e: envioAb });
  ok(emailCrise.length === 3 && emailsDoAviso.length === emailCrise.filter((x) => x.Situacao === "ACEITO").length,
    "a rodada tomou 3 e-mails do aviso (o teto da HORA, 8: 5 do comunicado + 3) e mandou só os de quem ainda não tinha sido alcançado", { emailCrise, enviados: emailsDoAviso.length });
  ok(emailCrise.filter((x) => x.Situacao === "ALCANCADO").every((x) => comAparelho.includes(x.MembroId)), "revisão: o e-mail dispensado (ALCANCADO) é só de quem já recebeu no celular");
  ok((await escalar("SELECT COUNT(*) FROM ComunicacaoEntregas WHERE EnvioId = @e AND Canal = 'EMAIL' AND Situacao = 'PENDENTE'", { e: comum.envioId })) === comumPend, "o comunicado de eventos não andou nesta rodada: o aviso passou na frente");
  const pushAbertura = pushes.slice(antesPush).find((p) => p.membroId === 3001) || {};
  ok(pushAbertura.titulo === "Crise: só Adv Davi E2E fala pela Igreja" && /^Imprensa: encaminhe para imprensa@ieadespa\.e2e\./.test(pushAbertura.mensagem),
    "revisão: o celular leva o texto curto com quem fala e o contato (não o começo do texto longo)", pushAbertura);
  ok(/Celular: \d+ de \d+ aparelho\(s\) avisados agora/.test(ab.body.mensagem) && /Sininho: \d+ líder/.test(ab.body.mensagem), "revisão: a resposta diz a verdade sobre o celular (quantos de quantos)", ab.body.mensagem);
  const emSeuNome = await q("SELECT Mensagem FROM Notificacoes WHERE RegraChave = 'CRISE_EM_SEU_NOME' AND DestinatarioMembroId = 1001");
  ok(emSeuNome.length === 1 && /aberto em seu nome por Secretário Geral E2E/.test(emSeuNome[0].Mensagem), "revisão: o Presidente é avisado de que o regime foi aberto em seu nome pelo Secretário", emSeuNome);
  ok(emailsDoAviso.every((m) => /porta-voz/i.test(m.assunto) && !/sair\.html/.test(m.html) && /liderança da Igreja/.test(m.texto)), "o aviso passou NA FRENTE do comunicado de eventos, sem link de saída", emailsDoAviso.map((m) => m.assunto));
  ok((await escalar("SELECT COUNT(*) FROM ComunicacaoEntregas WHERE EnvioId = @e AND Canal = 'EMAIL' AND Situacao = 'SEM_CONTATO' AND MembroId = 3004", { e: envioAb })) === 1, "o líder sem e-mail fica como sem contato");
  ok((await escalar("SELECT COUNT(*) FROM ComunicacaoEntregas WHERE EnvioId = @e AND Canal = 'EMAIL' AND Situacao = 'PENDENTE'", { e: envioAb })) > 0, "o resto dos e-mails do aviso espera na fila");
  ok((await POST(H, "abrir", SEC, { motivo: "Outra crise", portaVoz: PV })).status === 409, "a segunda crise ao mesmo tempo: 409");
  ok(!!(await falha(`INSERT INTO CriseRegimes (Motivo, OrdenadoPorMembroId, RegistradoPorMembroId, PortaVozTipo, PortaVozMembroId, PortaVozNome, PortaVozContato) VALUES (N'Direto no banco', 1001, 1002, N'PRESIDENTE', 1001, N'Presidente', N'(91) 3333-4444')`)),
    "o BANCO recusa a segunda crise ativa (índice único filtrado)");
  ok(/UX_CriseRegimes_UmaAtiva/.test(await falha(`INSERT INTO CriseRegimes (Motivo, OrdenadoPorMembroId, RegistradoPorMembroId, PortaVozTipo, PortaVozMembroId, PortaVozNome, PortaVozContato) VALUES (N'Direto no banco', 1001, 1002, N'PRESIDENTE', 1001, N'Presidente', N'(91) 3333-4444')`)),
    "(e a recusa é do índice único, não de outra regra)");

  console.log("== a faixa e o regime na comunicação ==");
  const f1 = (await GET(H, "faixa", LIDER_SEM)).body;
  ok(f1.ativa === true && f1.portaVoz.nome === "Adv Davi E2E" && f1.portaVoz.contato === "imprensa@ieadespa.e2e" && f1.souPortaVoz === false && !("motivo" in f1), "toda liderança vê a faixa com o porta-voz (sem o motivo)", f1);
  ok((await GET(H, "faixa", PORTA_VOZ)).body.souPortaVoz === true, "o porta-voz se reconhece na faixa");
  const modelos = (await GET(HC, "modelos", SEC)).body.modelos;
  ok(!modelos.some((m) => m.categoria === "CRISE"), "o modelo do aviso não aparece na tela de modelos");
  const modeloCrise = env.ModeloId;
  ok((await POST(HC, "enviar", SEC, { modeloId: modeloCrise, criterios: { territorio: { tipo: "TODAS" } } })).status === 404, "o modelo do aviso não se reenvia pela tela de comunicados");
  ok((await POST(HC, "arquivar-modelo", SEC, { modeloId: modeloCrise })).status === 404 && (await POST(HC, "aprovar-modelo", SEC, { modeloId: modeloCrise, hash: "x" })).status === 404, "nem se arquiva, nem se aprova");
  ok((await POST(HC, "cancelar", SEC, { envioId: envioAb })).status === 422, "o aviso da crise não se cancela pela tela de comunicados");
  ok((await POST(HC, "previa", SEC, { categoria: "CRISE", criterios: { territorio: { tipo: "TODAS" } } })).status === 422, "a prévia não aceita a categoria do sistema");
  ok(!(await GET(HC, "catalogos", SEC)).body.categorias.some((c) => c.codigo === "CRISE") && !(await GET(HC, "preferencias", PIN(P.ana))).body.categorias.some((c) => c.categoria === "CRISE"),
    "nem no catálogo da tela nem nas preferências da pessoa");
  const meus = (await GET(HC, "meus-comunicados", DIR_C)).body.comunicados;
  const avisoMeu = meus.find((c) => c.envioId === envioAb);
  ok(avisoMeu && avisoMeu.pedeCiencia === true && avisoMeu.categoriaRotulo === "Aviso de crise", "o líder vê o aviso em Meu Painel → Comunicações, com o \"Li o aviso\"", avisoMeu);
  ok((await POST(HC, "ciencia", DIR_C, { envioId: envioAb })).status === 200 && (await escalar("SELECT COUNT(*) FROM ComunicacaoEntregas WHERE EnvioId = @e AND MembroId = 3001 AND CienciaEm IS NOT NULL", { e: envioAb })) === 1,
    "a ciência do aviso fica registrada");

  console.log("== manifestações (o porta-voz e o nível geral) ==");
  const MAN = { criseId, dataHora: dataHoraAgora(-30), canal: "NOTA", quemFalou: "Adv Davi E2E", resumo: "Nota oficial sobre o acidente no templo.", autorizadoPor: "Presidente E2E" };
  ok((await POST(H, "manifestacao", DIR_C, MAN)).status === 403, "o Dirigente não registra manifestação");
  const m1 = await POST(H, "manifestacao", PORTA_VOZ, { ...MAN, link: "https://jornal.e2e.com.br/nota" });
  ok(m1.status === 201, "o porta-voz registra a manifestação", m1.body);
  ok((await POST(H, "manifestacao", PORTA_VOZ, { ...MAN, dataHora: dataHoraAgora(60) })).status === 422, "no futuro: recusada");
  ok((await POST(H, "manifestacao", PORTA_VOZ, { ...MAN, link: "javascript:alert(1)" })).status === 422, "link que não é http(s): recusado");
  const m2 = await POST(H, "manifestacao", SEC, { ...MAN, resumo: "Nota oficial corrigida: o acidente foi no anexo.", corrigeManifestacaoId: m1.body.manifestacaoId });
  ok(m2.status === 201 && m2.body.manifestacoes.find((x) => x.manifestacaoId === m1.body.manifestacaoId).corrigidaPor === m2.body.manifestacaoId, "a correção é uma linha nova que aponta a corrigida", m2.body);
  ok((await POST(H, "manifestacao", SEC, { ...MAN, corrigeManifestacaoId: m1.body.manifestacaoId })).status === 409, "a mesma linha não se corrige duas vezes (409)");
  ok(!!(await falha("UPDATE CriseManifestacoes SET Resumo = N'adulterado' WHERE ManifestacaoId = @m", { m: m1.body.manifestacaoId })) && !!(await falha("DELETE FROM CriseManifestacoes")),
    "a manifestação não se edita nem se apaga no banco");

  console.log("== pedidos da imprensa ==");
  const DEM = { veiculo: "Rádio Clube E2E", contato: "(91) 98888-7777", pedido: "Quer entrevista sobre o acidente.", prazo: dataHoraAgora(120) };
  const d1 = await POST(H, "demanda", DIR_C, DEM);
  ok(d1.status === 201 && /porta-voz/.test(d1.body.mensagem), "o Dirigente registra o pedido que chegou a ele (é o encaminhamento)", d1.body);
  const dl = await um("SELECT * FROM CriseDemandasImprensa WHERE DemandaId = @d", { d: d1.body.demandaId });
  ok(dl.CriseId === criseId && dl.RegistradoPorMembroId === 3001, "o pedido fica na crise ativa, com quem registrou");
  const avisados = (await q("SELECT DestinatarioMembroId AS m FROM Notificacoes WHERE RegraChave = 'CRISE_DEMANDA_IMPRENSA' AND ReferenciaId = @d ORDER BY 1", { d: d1.body.demandaId })).map((x) => x.m);
  const gestoresDaCrise = (await q("SELECT DISTINCT l.MembroId AS m FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId WHERE (',' + p.Permissoes + ',') LIKE '%,crise_gestao,%' AND p.Nivel = 'GLOBAL' AND (l.AtivoAte IS NULL OR l.AtivoAte >= CAST(SYSUTCDATETIME() AS DATE))")).map((x) => x.m);
  const esperados = [...new Set([...gestoresDaCrise, 2004])].filter((m) => m !== 3001).sort((a, b) => a - b);
  ok(JSON.stringify(avisados) === JSON.stringify(esperados) && avisados.includes(1001) && avisados.includes(1002) && avisados.includes(2004) && !avisados.includes(3001),
    "o pedido chega na hora a quem tem crise_gestao no nível geral (Presidente e Secretário) e ao porta-voz — nunca a quem registrou", { avisados, esperados });
  ok(pushes.some((p) => p.membroId === 2004 && /Rádio Clube/.test(p.mensagem)), "e no celular do porta-voz");
  // fechamento da revisão: quem teve a exclusão LGPD ATENDIDA não recebe o aviso do pedido da imprensa, mesmo tendo crise_gestao
  const excluidoImprensa = gestoresDaCrise.find((m) => ![1001, 1002].includes(m));
  await q("INSERT INTO SolicitacoesTitularLGPD (MembroId, Tipo, Status) VALUES (@m, 'EXCLUSAO', 'ATENDIDA')", { m: excluidoImprensa });
  const dLgpd = await db.registrarDemanda(pool, { ver: { membroId: 2005, crise: false }, dados: { veiculo: "TV LGPD E2E", contato: "(91) 90000-3333", pedido: "Pedido para conferir a exclusão LGPD." } });
  const avisadosLgpd = (await q("SELECT DestinatarioMembroId AS m FROM Notificacoes WHERE RegraChave = 'CRISE_DEMANDA_IMPRENSA' AND ReferenciaId = @d", { d: dLgpd.demandaId })).map((x) => x.m);
  ok(!!excluidoImprensa && avisadosLgpd.includes(1001) && !avisadosLgpd.includes(excluidoImprensa), "revisão: quem teve a exclusão LGPD atendida não recebe o aviso da imprensa (os outros recebem)", { excluidoImprensa, avisadosLgpd });
  const listaDir = (await GET(H, "demandas", DIR_C)).body;
  const listaVila = (await GET(H, "demandas", DIR_V)).body;
  const listaPv = (await GET(H, "demandas", PORTA_VOZ)).body;
  ok(listaDir.gestor === false && listaDir.demandas.length === 1 && listaDir.demandas[0].minha && listaDir.demandas[0].podeResponder === false, "o Dirigente vê só os pedidos dele, sem poder responder");
  ok(listaVila.demandas.length === 0, "o outro Dirigente não vê o pedido");
  ok(listaPv.gestor === true && listaPv.demandas.some((d) => d.demandaId === d1.body.demandaId && d.podeResponder && d.contato === DEM.contato), "o porta-voz vê todos os pedidos da crise e responde");
  const foraId = (await q("INSERT INTO CriseDemandasImprensa (CriseId, Veiculo, Contato, Pedido, RegistradoPorMembroId) VALUES (NULL, N'Jornal de Antes E2E', N'(91) 97777-0000', N'Pedido de antes da crise.', 3002); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  ok(!(await GET(H, "demandas", PORTA_VOZ)).body.demandas.some((d) => d.demandaId === foraId), "revisão: o porta-voz NÃO vê o pedido de fora da crise (nem o contato do jornalista dele)");
  ok((await GET(H, "demandas", SEC)).body.demandas.some((d) => d.demandaId === foraId && d.contato === "(91) 97777-0000"), "o nível geral vê o pedido de fora da crise");
  ok((await POST(H, "demanda", PORTA_VOZ, { ...DEM, corrigeDemandaId: foraId })).status === 404, "revisão: o porta-voz não corrige pedido fora do alcance da lista dele (404)");
  ok((await POST(H, "responder", PORTA_VOZ, { demandaId: foraId, situacao: "RESPONDIDA", resposta: "Resposta indevida." })).status === 404, "revisão: nem responde o de fora da crise");
  ok((await POST(H, "responder", DIR_C, { demandaId: d1.body.demandaId, situacao: "RESPONDIDA", resposta: "Entrevista dada." })).status === 403, "quem registrou não responde (403)");
  ok((await POST(H, "responder", DIR_V, { demandaId: d1.body.demandaId, situacao: "RESPONDIDA", resposta: "Entrevista dada." })).status === 404, "outro líder: 404, como se não existisse");
  const r1 = await POST(H, "responder", PORTA_VOZ, { demandaId: d1.body.demandaId, situacao: "RESPONDIDA", resposta: "Nota enviada ao repórter." });
  ok(r1.status === 201, "o porta-voz responde", r1.body);
  ok((await POST(H, "responder", SEC, { demandaId: d1.body.demandaId, situacao: "RECUSADA", resposta: "Sem entrevista." })).status === 409, "responder de novo sem apontar a resposta atual: 409 (alguém respondeu enquanto isso)");
  const r2 = await POST(H, "responder", SEC, { demandaId: d1.body.demandaId, situacao: "RECUSADA", resposta: "Corrigindo: entrevista recusada.", substituiRespostaId: r1.body.respostaId });
  ok(r2.status === 201 && (await GET(H, "demandas", DIR_C)).body.demandas[0].situacao === "RECUSADA", "a correção da resposta é linha nova; a situação vale a última (quem registrou vê)");
  ok((await escalar("SELECT COUNT(*) FROM CriseDemandaRespostas WHERE DemandaId = @d", { d: d1.body.demandaId })) === 2, "as duas respostas ficam no histórico");
  const dc = await POST(H, "demanda", DIR_C, { ...DEM, veiculo: "Rádio Clube AM E2E", corrigeDemandaId: d1.body.demandaId });
  ok(dc.status === 201, "quem registrou corrige o próprio pedido (linha nova)", dc.body);
  ok((await POST(H, "responder", SEC, { demandaId: d1.body.demandaId, situacao: "RESPONDIDA", resposta: "Outra resposta.", substituiRespostaId: r2.body.respostaId })).status === 422, "o pedido corrigido não se responde mais (responde-se a versão nova)");
  ok((await POST(H, "demanda", DIR_V, { ...DEM, corrigeDemandaId: dc.body.demandaId })).status === 404, "outro líder não corrige o pedido alheio");
  ok((await escalar("SELECT COUNT(*) FROM Notificacoes WHERE RegraChave = 'CRISE_DEMANDA_IMPRENSA' AND ReferenciaId = @d", { d: dc.body.demandaId })) === 0, "a correção não repete o aviso");
  ok(!!(await falha("UPDATE CriseDemandasImprensa SET Pedido = N'adulterado' WHERE DemandaId = @d", { d: d1.body.demandaId })) && !!(await falha("UPDATE CriseDemandaRespostas SET Resposta = N'x'")), "pedido e resposta não se editam no banco");

  console.log("== trocar o porta-voz ==");
  const pendAntes = await escalar("SELECT COUNT(*) FROM ComunicacaoEntregas WHERE EnvioId = @e AND Situacao = 'PENDENTE'", { e: envioAb });
  ok((await POST(H, "porta-voz", SEC_SEM_FATOR, { criseId, portaVoz: { tipo: "PRESIDENTE", contato: "(91) 3333-4444" } })).status === 428, "trocar o porta-voz pede a confirmação reforçada");
  ok((await POST(H, "porta-voz", SEC, { criseId, portaVoz: PV })).status === 422, "o mesmo porta-voz: nada mudou (422)");
  // a crise "aberta" às 23h30 de Brasília de ontem (02h30 UTC de hoje): o aviso tem de dizer o dia de BRASÍLIA (só para o teste: o gatilho fica desligado na mudança)
  await q("DISABLE TRIGGER TR_CriseRegimes_Protegido ON CriseRegimes; UPDATE CriseRegimes SET AbertaEm = DATEADD(MINUTE, 150, CAST(CAST(SYSUTCDATETIME() AS DATE) AS DATETIME2)) WHERE CriseId = @c; ENABLE TRIGGER TR_CriseRegimes_Protegido ON CriseRegimes", { c: criseId });
  const ontemUtc = somarDias(new Date().toISOString().slice(0, 10), -1).split("-").reverse().join("/");
  const antesPushTroca = pushes.length;
  const pv2 = await POST(H, "porta-voz", SEC, { criseId, portaVoz: { tipo: "PRESIDENTE", contato: "(91) 3333-4444" } });
  ok(pv2.status === 200 && pv2.body.crise.portaVoz.nome === "Presidente E2E" && pv2.body.crise.portaVoz.membroId === 1001, "o Presidente passa a ser o porta-voz", pv2.body.crise);
  ok(pendAntes > 0 && (await escalar("SELECT COUNT(*) FROM ComunicacaoEntregas WHERE EnvioId = @e AND Situacao = 'PENDENTE'", { e: envioAb })) === 0
    && (await escalar("SELECT COUNT(*) FROM ComunicacaoEntregas WHERE EnvioId = @e AND Situacao = 'CANCELADO'", { e: envioAb })) === pendAntes, `os ${pendAntes} avisos velhos que estavam na fila foram cancelados (o novo vai a todos)`);
  ok((await escalar("SELECT COUNT(*) FROM ComunicacaoEntregas WHERE EnvioId = @e AND Situacao = 'PENDENTE'", { e: comum.envioId })) === comumPend, "o comunicado de eventos na fila não foi tocado");
  ok((await GET(H, "faixa", LIDER_SEM)).body.portaVoz.nome === "Presidente E2E", "a faixa já mostra o novo porta-voz");
  const envioTroca = await escalar("SELECT EnvioId FROM CriseHistorico WHERE CriseId = @c AND Evento = 'PORTA_VOZ'", { c: criseId });
  const sinoTroca = await escalar("SELECT Mensagem FROM Notificacoes WHERE RegraChave = 'COMUNICADO' AND ReferenciaId = @e AND DestinatarioMembroId = 3001", { e: envioTroca });
  ok(String(sinoTroca).includes(`declarado em ${ontemUtc}`), `revisão: o aviso usa o dia de Brasília da abertura (${ontemUtc})`, sinoTroca);
  ok(pushes.slice(antesPushTroca).some((p) => p.membroId === 3001 && p.titulo === "Crise: novo porta-voz — Presidente E2E" && /\(91\) 3333-4444/.test(p.mensagem)), "revisão: o celular da troca leva o NOVO porta-voz e o contato");
  ok((await POST(H, "manifestacao", PORTA_VOZ, MAN)).status === 403, "o porta-voz antigo não registra mais manifestação");
  ok((await GET(H, "demandas", PORTA_VOZ)).body.gestor === false, "nem vê os pedidos de todos");
  ok((await q("SELECT Evento FROM CriseHistorico WHERE CriseId = @c ORDER BY HistoricoId", { c: criseId })).map((x) => x.Evento).join(",") === "ABERTA,PORTA_VOZ", "o histórico guarda a abertura e a troca");
  ok((await POST(H, "continuar-aviso", DIR_C, {})).status === 403 && (await POST(H, "continuar-aviso", SEC, {})).status === 200, "\"continuar o aviso\" é só do nível geral da crise");

  console.log("== encerrar (com um líder que saiu da liderança no meio) ==");
  await q("UPDATE Lideranca SET AtivoAte = DATEADD(DAY, -1, CAST(SYSUTCDATETIME() AS DATE)) WHERE MembroId = 3004");
  ok((await POST(H, "encerrar", SEC_SEM_FATOR, { criseId, resumo: "Assunto encerrado." })).status === 428, "encerrar pede a confirmação reforçada");
  ok((await POST(H, "encerrar", SEC, { criseId, resumo: "" })).status === 422, "sem o resumo: recusado");
  // revisão: a troca do porta-voz entra DEPOIS da leitura de fora e ANTES da trava do encerramento (no preparo do aviso do fim): o histórico do fim tem de ter o porta-voz de agora
  const prepOriginal = com.prepararAvisoDoSistema;
  let interposto = false;
  com.prepararAvisoDoSistema = async (p2, args) => {
    if (!interposto && args && args.titulo === "Fim do regime de crise") {
      interposto = true;
      await db.designarPortaVoz(pool, { ver: VER_CRISE, criseId, dados: { portaVoz: { tipo: "DESIGNADO", nome: "Assessor Novo E2E", contato: "novo@e2e.invalid", ato: "Ato 77/2026" } } });
    }
    return prepOriginal(p2, args);
  };
  const enc = await POST(H, "encerrar", SEC, { criseId, resumo: "Assunto encerrado pela Presidência." });
  com.prepararAvisoDoSistema = prepOriginal;
  ok(interposto && (await escalar("SELECT PortaVozNome FROM CriseHistorico WHERE CriseId = @c AND Evento = 'ENCERRADA'", { c: criseId })) === "Assessor Novo E2E",
    "revisão: a troca que entrou antes da trava aparece no histórico do fim (o porta-voz é relido dentro da trava)");
  ok(enc.status === 200 && enc.body.crise.status === "ENCERRADA", "o regime é encerrado", enc.body);
  const hFim = await um("SELECT * FROM CriseHistorico WHERE CriseId = @c AND Evento = 'ENCERRADA'", { c: criseId });
  ok(!!(await escalar("SELECT COUNT(*) FROM Notificacoes WHERE RegraChave = 'COMUNICADO' AND ReferenciaId = @e AND DestinatarioMembroId = 3004", { e: hFim.EnvioId })), "quem deixou a liderança no meio também recebe o fim");
  ok(/deixa de valer/.test(await escalar("SELECT TOP 1 Mensagem FROM Notificacoes WHERE ReferenciaId = @e AND RegraChave = 'COMUNICADO'", { e: hFim.EnvioId })), "o aviso do fim diz que a vedação deixa de valer");
  ok((await POST(H, "encerrar", SEC, { criseId, resumo: "De novo." })).status === 409, "encerrar duas vezes: 409");
  ok((await GET(H, "faixa", LIDER_SEM)).body.ativa === false, "a faixa some");
  ok((await POST(H, "manifestacao", SEC, { ...MAN, dataHora: dataHoraAgora(-5) })).status === 201, "o nível geral ainda registra o que foi dito no último dia, na crise encerrada");
  ok((await POST(H, "porta-voz", SEC, { criseId, portaVoz: { tipo: "PRESIDENTE", contato: "(91) 3333-4444" } })).status === 409, "crise encerrada não troca porta-voz");
  await q("DISABLE TRIGGER TR_CriseRegimes_Protegido ON CriseRegimes; UPDATE CriseRegimes SET EncerradaEm = DATEADD(MINUTE, -30, SYSUTCDATETIME()) WHERE CriseId = @c; ENABLE TRIGGER TR_CriseRegimes_Protegido ON CriseRegimes", { c: criseId });
  const depoisDoFim = await POST(H, "manifestacao", SEC, { ...MAN, dataHora: dataHoraAgora(-5) });
  ok(depoisDoFim.status === 422 && /encerrada/.test(depoisDoFim.body.mensagem), "revisão: na crise encerrada, só se registra o que foi dito ATÉ o encerramento", depoisDoFim.body);
  const d2 = await POST(H, "demanda", DIR_V, { ...DEM, veiculo: "Blog E2E" });
  ok(d2.status === 201 && (await escalar("SELECT CriseId FROM CriseDemandasImprensa WHERE DemandaId = @d", { d: d2.body.demandaId })) === null && /Presidência/.test(d2.body.mensagem), "fora da crise o pedido também se centraliza (sem crise)");
  ok(!!(await falha("UPDATE CriseRegimes SET Motivo = N'x' WHERE CriseId = @c", { c: criseId })) && !!(await falha("UPDATE CriseRegimes SET Status = 'ATIVA', EncerradaEm = NULL, EncerradaPorMembroId = NULL, ResumoEncerramento = NULL WHERE CriseId = @c", { c: criseId }))
    && !!(await falha("DELETE FROM CriseRegimes WHERE CriseId = @c", { c: criseId })) && !!(await falha("UPDATE CriseHistorico SET Texto = N'x'")), "no banco: encerrada não muda, não reabre, não se apaga; o histórico não se edita");
  ok((await falha(`INSERT INTO CriseRegimes (Motivo, OrdenadoPorMembroId, RegistradoPorMembroId, PortaVozTipo, PortaVozNome, PortaVozContato, DesignacaoAto, Status, EncerradaEm, EncerradaPorMembroId)
      VALUES (N'Teste do CHECK', 1001, 1002, N'DESIGNADO', N'Fulano', N'(91) 3333-4444', NULL, N'ENCERRADA', SYSUTCDATETIME(), 1002)`) || "").includes("CK_CriseRegimes_Designado"), "o banco recusa o designado sem o ato (o CHECK fecha o NULL)");
  const crises = (await GET(H, "crises", SEC)).body.crises;
  ok(crises.length === 1 && crises[0].manifestacoes === 3 && crises[0].demandas === 3, "a lista de crises com as contagens", crises);
  const det = (await GET(H, "crise", SEC, { criseId })).body;
  ok(det.historico.length === 4 && det.historico.every((h) => h.aviso && h.aviso.total > 0) && det.crise.motivo === "Acidente no templo", "o detalhe: histórico com o aviso de cada passo, e o motivo para o nível geral");
  ok((await GET(H, "crise", PORTA_VOZ, { criseId })).status === 404 && (await GET(H, "crise", DIR_C, { criseId })).status === 404, "o detalhe da crise não abre para os outros");

  console.log("== segurança: território ==");
  const painelDir = (await GET(H, "seguranca", DIR_C)).body.congregacoes.map((c) => c.nome);
  const painelPastor = (await GET(H, "seguranca", PASTOR_AREA)).body.congregacoes.map((c) => c.nome).sort();
  const painelGeral = (await GET(H, "seguranca", SEC)).body.congregacoes.map((c) => c.nome);
  ok(JSON.stringify(painelDir) === JSON.stringify([C]), "o Dirigente vê só a congregação dele", painelDir);
  ok(JSON.stringify(painelPastor) === JSON.stringify([C, V]), "o Pastor de Área vê as da área", painelPastor);
  ok([C, V, B].every((n) => painelGeral.includes(n)), "o nível geral vê todas");
  const novo = (await GET(H, "seguranca", DIR_C)).body.congregacoes[0];
  ok(["PLANO_AUSENTE", "SIMULADO_AUSENTE", "VISTORIA_AUSENTE"].every((k) => novo.alertas.some((a) => a.codigo === k)), "sem nada registrado: plano, simulado e vistoria ausentes", novo.alertas);
  ok((await GET(H, "congregacao", DIR_C, { congregacaoId: cong.v })).status === 404 && (await POST(H, "plano", DIR_C, { congregacaoId: cong.v })).status === 404, "a congregação de outro: 404, mesmo para gravar");

  console.log("== plano de emergência em versões ==");
  const PLANO = { congregacaoId: cong.c, rotasEvacuacao: "Porta principal e porta lateral esquerda.", pontosEncontro: "Praça em frente ao templo.", contatosLocais: "Diác. João (91) 9999-0000", responsaveis: "Diác. João e Irmã Maria", versaoAtual: 0 };
  ok((await POST(H, "plano", DIR_C, PLANO)).status === 201, "o Dirigente registra o plano (versão 1)");
  ok((await POST(H, "plano", PASTOR_AREA, PLANO)).status === 409, "salvar em cima de um plano que mudou enquanto isso: 409");
  const pl2 = await POST(H, "plano", PASTOR_AREA, { ...PLANO, versaoAtual: 1, pontosEncontro: "Estacionamento do lado." });
  ok(pl2.status === 201 && pl2.body.versao === 2, "o Pastor de Área revisa (versão 2)");
  const detC = (await GET(H, "congregacao", DIR_C, { congregacaoId: cong.c })).body;
  ok(detC.planoAtual.versao === 2 && detC.versoesDoPlano.length === 2 && detC.contatosEmergencia.some((x) => x.numero === "193") && !detC.alertas.some((a) => a.codigo === "PLANO_AUSENTE"), "o plano atual, as versões e os telefones de emergência");
  ok(!!(await falha("UPDATE SegurancaPlanos SET Responsaveis = N'x'")) && !!(await falha("DELETE FROM SegurancaPlanos")), "a versão do plano não se edita nem se apaga");

  console.log("== simulados ==");
  const SIM = { congregacaoId: cong.c, data: hojeBr(), tipo: "EVACUACAO", participantes: 85, duracaoMinutos: 12, correuBem: "Saída em ordem.", melhorar: "Sinalizar a porta lateral." };
  const s1 = await POST(H, "simulado", DIR_C, SIM);
  ok(s1.status === 201, "o simulado é registrado");
  ok((await POST(H, "simulado", DIR_C, SIM)).status === 422, "o mesmo tipo na mesma data: recusado (duplo clique)");
  ok((await POST(H, "simulado", DIR_C, { ...SIM, data: "2099-01-01" })).status === 422, "no futuro: recusado");
  ok((await POST(H, "anular-simulado", DIR_V, { simuladoId: s1.body.simuladoId, motivo: "Registro errado." })).status === 404, "outro Dirigente não anula");
  ok((await POST(H, "anular-simulado", DIR_C, { simuladoId: s1.body.simuladoId, motivo: "x" })).status === 422, "anular sem motivo: recusado");
  ok((await POST(H, "anular-simulado", DIR_C, { simuladoId: s1.body.simuladoId, motivo: "Data errada." })).status === 200, "anula com motivo");
  ok((await POST(H, "anular-simulado", DIR_C, { simuladoId: s1.body.simuladoId, motivo: "Data errada." })).status === 409, "anular duas vezes: 409");
  ok((await GET(H, "seguranca", DIR_C)).body.congregacoes[0].alertas.some((a) => a.codigo === "SIMULADO_AUSENTE"), "o anulado não conta");
  ok((await POST(H, "simulado", DIR_C, SIM)).status === 201, "depois de anular, registra de novo");
  ok(!!(await falha("UPDATE SegurancaSimulados SET Participantes = 1")) && !!(await falha("DELETE FROM SegurancaSimulados")), "o simulado não se edita nem se apaga");

  console.log("== vistoria predial ==");
  const itens = Object.keys(cs.ITENS_VISTORIA).map((item) => ({ item, resultado: item === "EXTINTORES" ? "PENDENTE" : item === "GAS" ? "NAO_SE_APLICA" : "OK", ...(item === "EXTINTORES" ? { pendencia: "Dois extintores vencidos." } : {}) }));
  const v1 = await POST(H, "vistoria", DIR_C, { congregacaoId: cong.c, data: hojeBr(), itens });
  ok(v1.status === 201 && /1 pendência/.test(v1.body.mensagem), "a vistoria com uma pendência", v1.body);
  ok((await POST(H, "vistoria", DIR_C, { congregacaoId: cong.c, data: hojeBr(), itens })).status === 422, "a segunda vistoria na mesma data: recusada");
  ok((await POST(H, "vistoria", DIR_C, { congregacaoId: cong.c, data: hojeBr(), itens: itens.slice(1) })).status === 422, "checklist incompleto: recusado");
  const pc = (await GET(H, "seguranca", DIR_C)).body.congregacoes[0];
  ok(pc.pendencias === 1 && pc.alertas.some((a) => a.codigo === "PENDENCIAS"), "a pendência aparece no painel");
  const itemPend = (await GET(H, "congregacao", DIR_C, { congregacaoId: cong.c })).body.vistorias[0].itens.find((i) => i.item === "EXTINTORES");
  ok(((await falha("BEGIN TRAN; INSERT INTO SegurancaVistorias (CongregacaoId, Data, RegistradoPorMembroId) VALUES (@b, '2026-01-01', 1002); INSERT INTO SegurancaVistoriaItens (VistoriaId, Item, Resultado, Pendencia) VALUES (SCOPE_IDENTITY(), N'SAIDAS', N'PENDENTE', NULL); ROLLBACK", { b: cong.b })) || "").includes("CK_SegurancaVistoriaItens_Pendencia")
    && (await escalar("SELECT COUNT(*) FROM SegurancaVistorias WHERE CongregacaoId = @b", { b: cong.b })) === 0, "o banco recusa pendente sem o que falta (o CHECK fecha o NULL)");
  ok((await POST(H, "resolver-pendencia", DIR_V, { vistoriaItemId: itemPend.vistoriaItemId, como: "Recarregados." })).status === 404, "outro Dirigente não resolve");
  ok((await POST(H, "resolver-pendencia", DIR_C, { vistoriaItemId: itemPend.vistoriaItemId, como: "Recarregados em 23/10." })).status === 200, "a pendência é resolvida");
  ok((await POST(H, "resolver-pendencia", DIR_C, { vistoriaItemId: itemPend.vistoriaItemId, como: "De novo." })).status === 409, "resolver duas vezes: 409");
  ok((await GET(H, "seguranca", DIR_C)).body.congregacoes[0].pendencias === 0, "o painel não mostra mais a pendência");
  ok(!!(await falha("UPDATE SegurancaVistoriaItens SET ResolvidaEm = NULL, ResolvidaPorMembroId = NULL, ComoResolvida = NULL WHERE VistoriaItemId = @i", { i: itemPend.vistoriaItemId })), "a resolução não se desfaz no banco");

  // revisão: a pendência de uma vistoria anterior, não resolvida, continua contando depois de uma vistoria nova "em ordem"
  const itensOk = Object.keys(cs.ITENS_VISTORIA).map((item) => ({ item, resultado: "OK" }));
  ok((await POST(H, "vistoria", SEC, { congregacaoId: cong.b, data: somarDias(hojeBr(), -20), itens })).status === 201 && (await POST(H, "vistoria", SEC, { congregacaoId: cong.b, data: hojeBr(), itens: itensOk })).status === 201, "Beta: uma vistoria com pendência e uma nova em ordem");
  ok((await GET(H, "seguranca", SEC)).body.congregacoes.find((c) => c.congregacaoId === cong.b).pendencias === 1, "revisão: a pendência da vistoria anterior continua no painel até ser marcada resolvida");

  console.log("== AVCB e seguro (v4.24 e v4.16) ==");
  const bem = (await q("INSERT INTO BensPatrimoniais (CongregacaoId, Tipo, Descricao, ValorAquisicao, DataAquisicao, RegistradoPor) VALUES (@c, 'IMOVEL', N'Templo Central E2E', 100000, '2010-01-01', 1002); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { c: cong.c }))[0].id;
  await q("INSERT INTO ImoveisSituacaoFiscal (BemId, AvcbNumero, AvcbVigenciaFim, RegistradoPor) VALUES (@b, N'AVCB-123', DATEADD(DAY, -3, CAST(SYSUTCDATETIME() AS DATE)), 1002)", { b: bem });
  await q("INSERT INTO ApolicesSeguro (Tipo, Seguradora, NumeroApolice, DataInicio, DataFim, Coberturas, BemId, RegistradoPor) VALUES ('OUTROS', N'Seguradora E2E', N'AP-1', '2025-01-01', DATEADD(DAY, -10, CAST(SYSUTCDATETIME() AS DATE)), N'INCENDIO', @b, 1002)", { b: bem });
  const comImovel = (await GET(H, "seguranca", DIR_C)).body.congregacoes[0];
  ok(comImovel.imoveis.length === 1 && comImovel.imoveis[0].avcb === "VENCIDA" && comImovel.imoveis[0].seguro === "VENCIDO", "o painel mostra o AVCB e o seguro do imóvel da congregação", comImovel.imoveis);
  ok(comImovel.alertas.some((a) => a.codigo === "AVCB_VENCIDO" && /veda receber culto/.test(a.texto)) && comImovel.alertas.some((a) => a.codigo === "SEGURO_VENCIDO"), "e avisa o que está vencido");

  console.log("== equipe de segurança ==");
  const EQ = { congregacaoId: cong.c, funcao: "BRIGADA", desde: hojeBr() };
  ok((await POST(H, "equipe", DIR_C, { ...EQ, membroId: P.menor })).status === 422, "menor de idade não entra na equipe");
  ok((await POST(H, "equipe", DIR_C, { ...EQ, membroId: P.vilaA })).status === 422, "membro de outra congregação não entra");
  ok((await POST(H, "equipe", DIR_C, { ...EQ, membroId: P.semNasc })).status === 422, "sem data de nascimento não entra (pode ser menor)");
  const e1 = await POST(H, "equipe", DIR_C, { ...EQ, membroId: P.ana });
  ok(e1.status === 201, "a Ana entra na brigada");
  ok((await POST(H, "equipe", DIR_C, { ...EQ, membroId: P.ana })).status === 422, "a mesma função duas vezes: recusada");
  ok((await POST(H, "equipe", DIR_C, { ...EQ, membroId: P.ana, funcao: "PORTARIA" })).status === 201, "outra função para a mesma pessoa: aceita");
  const e3 = await POST(H, "equipe", DIR_C, { ...EQ, membroId: P.bento, funcao: "PRIMEIROS_SOCORROS" });
  const busca = (await POST(H, "buscar-membros", DIR_C, { congregacaoId: cong.c, q: "Cuidado" })).body.membros.map((m) => m.membroId);
  ok(busca.includes(P.ana) && !busca.includes(P.menor) && !busca.includes(P.vilaA), "a busca traz só adultos ativos da congregação", busca);
  ok((await POST(H, "buscar-membros", DIR_C, { congregacaoId: cong.c, q: "%" })).body.membros.length === 0, "o % é texto, não curinga");
  ok((await POST(H, "sair-equipe", DIR_V, { equipeId: e3.body.equipeId })).status === 404 && (await POST(H, "sair-equipe", DIR_C, { equipeId: e3.body.equipeId })).status === 200
    && (await POST(H, "sair-equipe", DIR_C, { equipeId: e3.body.equipeId })).status === 409, "saída manual: só no território, uma vez");
  const passado = (await q("INSERT INTO SegurancaEquipe (CongregacaoId, MembroId, Funcao, Desde, Ate, RegistradoPorMembroId) VALUES (@b, 2011, 'PORTARIA', @d, @a, 1002); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id",
    { b: cong.b, d: somarDias(hojeBr(), -100), a: somarDias(hojeBr(), -5) }))[0].id;
  ok((await POST(H, "sair-equipe", SEC, { equipeId: passado })).status === 200, "registra a saída de quem tinha o \"até\" no passado");
  ok((await escalar("SELECT CONVERT(CHAR(10), Ate, 23) FROM SegurancaEquipe WHERE EquipeId = @e", { e: passado })) === somarDias(hojeBr(), -5), "revisão: registrar a saída não estica o \"até\" que já passou");
  await q("UPDATE MembroReferencia SET CongregacaoId = @v WHERE MembroId = @m", { v: cong.v, m: P.ana });
  const eqDet = (await GET(H, "congregacao", DIR_C, { congregacaoId: cong.c })).body.equipe.filter((e) => e.equipeId === e1.body.equipeId)[0];
  ok(eqDet.saiuDaCongregacao === true && eqDet.ativo === false, "quem mudou de congregação já não conta como ativo na tela, antes da rotina");
  const rot = await db.rotinaDiaria(pool);
  const fechadas = await q("SELECT MotivoEncerramento AS m FROM SegurancaEquipe WHERE MembroId = @a", { a: P.ana });
  ok(rot.equipeEncerrada === 2 && fechadas.every((x) => x.m === "SAIU_DA_CONGREGACAO"), "a rotina diária tira da equipe quem deixou a congregação", { rot, fechadas });
  await q("UPDATE MembroReferencia SET CongregacaoId = @c WHERE MembroId = @m", { c: cong.c, m: P.ana });
  ok(!!(await falha("DELETE FROM SegurancaEquipe")) && !!(await falha("UPDATE SegurancaEquipe SET EncerradoEm = NULL, MotivoEncerramento = NULL, EncerradoPorMembroId = NULL WHERE MembroId = @a", { a: P.ana }))
    && !!(await falha("UPDATE SegurancaEquipe SET MembroId = NULL, AnonimizadoEm = SYSUTCDATETIME() WHERE MembroId = @a", { a: P.ana })), "a equipe não se apaga, não reabre e não perde o nome sem a marca de purga");

  console.log("== os avisos do sininho (motor das 7h) ==");
  const lidVila = await escalar("SELECT TOP 1 LiderancaId FROM Lideranca WHERE MembroId = 3002");
  await q("INSERT INTO DelegacoesAcesso (LiderancaId, DeleganteMembroId, DelegadoMembroId, DataInicio, DataFim, Motivo) VALUES (@l, 3002, 2010, @i, @f, N'Férias E2E')",
    { l: lidVila, i: somarDias(hojeBr(), -1), f: somarDias(hojeBr(), 5) });
  // e um delegado da Central com a exclusão LGPD atendida: não recebe os lembretes de segurança
  const lidCentral = await escalar("SELECT TOP 1 LiderancaId FROM Lideranca WHERE MembroId = 3001");
  await q("INSERT INTO DelegacoesAcesso (LiderancaId, DeleganteMembroId, DelegadoMembroId, DataInicio, DataFim, Motivo) VALUES (@l, 3001, 2001, @i, @f, N'Licença E2E')",
    { l: lidCentral, i: somarDias(hojeBr(), -1), f: somarDias(hojeBr(), 5) });
  await q("INSERT INTO SolicitacoesTitularLGPD (MembroId, Tipo, Status) VALUES (2001, 'EXCLUSAO', 'ATENDIDA')");
  const CHAVES = ["SEGURANCA_PLANO_REVISAO", "SEGURANCA_SEM_SIMULADO", "SEGURANCA_SEM_VISTORIA", "SEGURANCA_AVCB_SEGURO"];
  const r1m = await avaliarRegras(pool, { chaves: CHAVES });
  const avisos = await q("SELECT RegraChave, DestinatarioMembroId AS m, Mensagem FROM Notificacoes WHERE RegraChave LIKE 'SEGURANCA[_]%'");
  const de = (m, regra) => avisos.filter((a) => a.m === m && a.RegraChave === regra);
  ok(r1m.falhas.length === 0 && r1m.criadas === avisos.length && avisos.length > 0, `a rodada criou ${avisos.length} avisos`, r1m);
  ok(de(3001, "SEGURANCA_AVCB_SEGURO").length === 1 && de(3001, "SEGURANCA_PLANO_REVISAO").length === 0 && de(3001, "SEGURANCA_SEM_SIMULADO").length === 0, "o Dirigente da Central: só o AVCB/seguro (plano, simulado e vistoria estão em dia)");
  ok(de(3002, "SEGURANCA_PLANO_REVISAO").length === 1 && /Vila Nova E2E/.test(de(3002, "SEGURANCA_PLANO_REVISAO")[0].Mensagem) && !/Central/.test(de(3002, "SEGURANCA_PLANO_REVISAO")[0].Mensagem), "o Dirigente da Vila recebe o da Vila (e não o da Central)");
  ok(de(3003, "SEGURANCA_AVCB_SEGURO").length === 1 && de(3003, "SEGURANCA_SEM_VISTORIA").length === 1 && /Vila Nova E2E/.test(de(3003, "SEGURANCA_SEM_VISTORIA")[0].Mensagem), "o Pastor de Área recebe um aviso por regra, juntando as congregações da área");
  ok(avisos.every((a) => ![1001, 1002].includes(a.m)), "o nível geral não recebe um aviso por congregação (acompanha pelo painel)");
  ok(de(3002, "SEGURANCA_AVCB_SEGURO").length === 1 && /Vila Nova E2E/.test(de(3002, "SEGURANCA_AVCB_SEGURO")[0].Mensagem), "revisão: a congregação sem imóvel no patrimônio também entra no aviso do AVCB");
  ok(avisos.filter((a) => a.m === 2001).length === 0 && de(3001, "SEGURANCA_AVCB_SEGURO").length === 1, "revisão: o delegado com a exclusão LGPD atendida não recebe os lembretes de segurança (o delegante recebe)");
  ok(de(2010, "SEGURANCA_PLANO_REVISAO").length === 1 && /Vila Nova E2E/.test(de(2010, "SEGURANCA_PLANO_REVISAO")[0].Mensagem), "revisão: quem recebeu o papel por delegação vigente também recebe o aviso");
  ok((await avaliarRegras(pool, { chaves: CHAVES })).criadas === 0, "rodar de novo no mesmo dia não repete");

  console.log("== retenção, exclusão LGPD e Meus Dados ==");
  const meusAna = await db.dadosDoTitular(pool, P.ana);
  ok(meusAna.equipeSeguranca.length === 2 && meusAna.equipeSeguranca.every((e) => e.congregacao === C), "Meus Dados mostra a equipe de segurança da pessoa", meusAna);
  ok((await db.dadosDoTitular(pool, 2004)).portaVozEmCrises.length === 1 && (await db.dadosDoTitular(pool, 3001)).registrosNaCrise.pedidosDeImprensa === 2, "e as crises em que foi porta-voz e os registros dela na crise");
  const eAtiva = await POST(H, "equipe", DIR_C, { ...EQ, membroId: P.carla, funcao: "COORDENACAO" });
  const t = new L.sql.Transaction(pool);
  await t.begin();
  const lg = await db.exclusaoLgpd(() => new L.sql.Request(t), P.carla);
  await t.commit();
  const eCarla = await um("SELECT * FROM SegurancaEquipe WHERE EquipeId = @e", { e: eAtiva.body.equipeId });
  ok(lg.equipeSeguranca === 1 && eCarla.MembroId === null && eCarla.AnonimizadoEm && eCarla.MotivoEncerramento === "EXCLUSAO_LGPD" && eCarla.EncerradoEm, "a exclusão LGPD encerra e tira o nome da equipe", eCarla);
  ok((await escalar("SELECT COUNT(*) FROM CriseHistorico WHERE PortaVozMembroId = 2004")) === 1, "o histórico da crise fica (registro institucional)");
  // a retenção: o pedido e a saída da equipe "envelhecem" (só para o teste: o gatilho fica desligado durante a mudança das datas)
  await q("DISABLE TRIGGER TR_CriseDemandasImprensa_Protegida ON CriseDemandasImprensa; UPDATE CriseDemandasImprensa SET RecebidaEm = DATEADD(DAY, -1830, RecebidaEm) WHERE DemandaId = @d; ENABLE TRIGGER TR_CriseDemandasImprensa_Protegida ON CriseDemandasImprensa", { d: d2.body.demandaId });
  await q("DISABLE TRIGGER TR_SegurancaEquipe_Protegida ON SegurancaEquipe; UPDATE SegurancaEquipe SET EncerradoEm = DATEADD(DAY, -1830, EncerradoEm) WHERE EquipeId = @e; ENABLE TRIGGER TR_SegurancaEquipe_Protegida ON SegurancaEquipe", { e: e3.body.equipeId });
  const ret = await db.aplicarRetencao(pool);
  ok(ret.contatosApagados === 1 && (await um("SELECT Contato, ContatoApagadoEm FROM CriseDemandasImprensa WHERE DemandaId = @d", { d: d2.body.demandaId })).Contato === null, "o contato do jornalista sai em 5 anos (o pedido fica)", ret);
  ok(ret.equipeAnonimizada === 1 && (await escalar("SELECT MembroId FROM SegurancaEquipe WHERE EquipeId = @e", { e: e3.body.equipeId })) === null, "o nome de quem saiu da equipe há 5 anos sai do registro");
  ok((await escalar("SELECT ISNULL(CAST(SESSION_CONTEXT(N'crise_purga') AS INT), 0) + ISNULL(CAST(SESSION_CONTEXT(N'seguranca_purga') AS INT), 0)")) === 0, "a marca de purga não ficou ligada na conexão");
  ok(!!(await falha("UPDATE CriseDemandasImprensa SET Contato = NULL, ContatoApagadoEm = SYSUTCDATETIME() WHERE DemandaId = @d", { d: dc.body.demandaId })), "sem a marca, nem a retenção mexe no pedido");

  console.log("== revisão: o pedido da imprensa não enche o celular do Presidente ==");
  const antesRajada = pushes.length;
  const VER_BETA = { membroId: 3004, crise: false, seguranca: false, geralSeguranca: false, podeVerCongregacao: () => false };
  for (let i = 1; i <= 11; i++) await db.registrarDemanda(pool, { ver: VER_BETA, dados: { veiculo: `Rajada ${i} E2E`, contato: "(91) 90000-1111", pedido: "Mais um pedido de entrevista." } });
  const avisosPres = await escalar("SELECT COUNT(*) FROM Notificacoes WHERE RegraChave = 'CRISE_DEMANDA_IMPRENSA' AND DestinatarioMembroId = 1001 AND CriadaEm >= DATEADD(HOUR, -24, SYSUTCDATETIME())");
  ok(avisosPres === 10, "revisão: no máximo 10 avisos de pedido da imprensa por pessoa em 24 horas (os pedidos ficam todos na lista)", avisosPres);
  ok(pushes.slice(antesRajada).filter((p) => p.membroId === 1001 && /Rajada/.test(p.mensagem)).length === 1, "revisão: o celular só no 1º pedido do líder na hora", pushes.slice(antesRajada).filter((p) => p.membroId === 1001).length);
  ok((await escalar("SELECT COUNT(*) FROM CriseDemandasImprensa WHERE Veiculo LIKE N'Rajada %'")) === 11, "os 11 pedidos estão registrados");

  console.log("== revisão: a fila do aviso — metade da rodada para a convocação, teto próprio, e-mail só a quem não foi alcançado; porta-voz desligado ==");
  await q("UPDATE Prazos SET Dias = 1000 WHERE Sigla = 'COMUNICACAO_EMAILS_POR_HORA'; UPDATE Prazos SET Dias = 6 WHERE Sigla = 'COMUNICACAO_EMAILS_POR_RODADA'; UPDATE Prazos SET Dias = 1000 WHERE Sigla = 'COMUNICACAO_CRISE_EMAILS_POR_HORA'");
  const segura = { enviarEmail: async () => ({ limite: true }) };
  const ab2 = await db.abrir(pool, { ver: VER_CRISE, dados: { motivo: "Segunda crise E2E", portaVoz: { tipo: "DESIGNADO", membroId: 2012, nome: "Ivo", contato: "pv2@e2e.invalid", ato: "Ato 88/2026" } }, deps: segura });
  ok(ab2.sucesso, "a segunda crise abre", ab2.mensagem);
  const envio2 = await escalar("SELECT EnvioId FROM CriseHistorico WHERE CriseId = @c AND Evento = 'ABERTA'", { c: ab2.criseId });
  const modC = (await com.salvarModelo(pool, { ver: VER_COM, dados: { categoria: "CONVOCACAO", titulo: "Convocação E2E", corpo: "Assembleia no sábado, {{primeiro_nome}}." } })).modelo;
  await com.aprovarModelo(pool, { ver: VER_COM, modeloId: modC.modeloId, hash: modC.hash });
  const conv = await com.enviar(pool, { ver: VER_COM, dados: { modeloId: modC.modeloId, criterios: { territorio: { tipo: "CONGREGACAO", ids: [cong.c] } } }, deps: segura });
  const pendCrise = () => escalar("SELECT COUNT(*) FROM ComunicacaoEntregas WHERE EnvioId = @e AND Canal = 'EMAIL' AND Situacao = 'PENDENTE'", { e: envio2 });
  const pc0 = await pendCrise();
  ok(pc0 >= 6 && (await escalar("SELECT COUNT(*) FROM ComunicacaoEntregas WHERE EnvioId = @e AND Canal = 'EMAIL' AND Situacao = 'PENDENTE'", { e: conv.envioId })) >= 6, "aviso e convocação esperam na fila", pc0);
  let antesR = enviados.length;
  await com.processarFila(pool, {});
  let rodada = enviados.slice(antesR);
  const nConv = rodada.filter((m) => /Convocação E2E/.test(m.assunto)).length, tomadasCrise = pc0 - (await pendCrise());
  ok(nConv >= 3 && tomadasCrise <= 3, `revisão: com convocação na fila, o aviso leva no máximo a metade da rodada (6): convocação ${nConv}, aviso ${tomadasCrise}`);
  const criseNaHora = await escalar("SELECT COUNT(*) FROM ComunicacaoEntregas x JOIN ComunicacaoEnvios v ON v.EnvioId = x.EnvioId WHERE v.Categoria = 'CRISE' AND x.Canal = 'EMAIL' AND x.Situacao IN ('ACEITO', 'ENVIANDO') AND x.AtualizadoEm >= DATEADD(MINUTE, -60, SYSUTCDATETIME())");
  await q("UPDATE Prazos SET Dias = @d WHERE Sigla = 'COMUNICACAO_CRISE_EMAILS_POR_HORA'; UPDATE Prazos SET Dias = 20 WHERE Sigla = 'COMUNICACAO_EMAILS_POR_RODADA'", { d: criseNaHora + 1 });
  const pc1 = await pendCrise();
  await com.processarFila(pool, {});
  ok(pc1 - (await pendCrise()) <= 1, `revisão: o teto próprio do aviso por hora (${criseNaHora + 1}) vale: nesta rodada saiu no máximo 1 e-mail do aviso`, pc1 - (await pendCrise()));
  await q("UPDATE Prazos SET Dias = 1000 WHERE Sigla = 'COMUNICACAO_CRISE_EMAILS_POR_HORA'; UPDATE Prazos SET Dias = 50 WHERE Sigla = 'COMUNICACAO_EMAILS_POR_RODADA'");
  antesR = enviados.length;
  await com.processarFila(pool, {});
  const comPush = (await q("SELECT MembroId AS m FROM ComunicacaoEntregas WHERE EnvioId = @e AND Canal = 'PUSH' AND Situacao = 'ACEITO'", { e: envio2 })).map((x) => x.m);
  const emailsDeQuemTemPush = await q("SELECT MembroId, Situacao FROM ComunicacaoEntregas WHERE EnvioId = @e AND Canal = 'EMAIL' AND MembroId IN (SELECT CAST(value AS INT) FROM OPENJSON(@ids))", { e: envio2, ids: JSON.stringify(comPush) });
  ok(comPush.length >= 2 && emailsDeQuemTemPush.length === comPush.length && emailsDeQuemTemPush.every((x) => ["ALCANCADO", "SEM_CONTATO"].includes(x.Situacao))
    && emailsDeQuemTemPush.filter((x) => x.Situacao === "ALCANCADO").length >= 2,
  "revisão: quem já recebeu no celular não recebe o e-mail do aviso (ALCANCADO)", emailsDeQuemTemPush);
  const emailsDosComPush = enviados.slice(antesR).filter((m) => /porta-voz/i.test(m.assunto) && comPush.some((id) => m.email === `p${id}@exemplo.org` || m.email === `dirigente${id}@e2e.invalid`));
  ok(emailsDosComPush.length === 0, "revisão: e nenhum e-mail do aviso saiu para eles", emailsDosComPush.map((m) => m.email));
  ok((await pendCrise()) === 0, "o resto do aviso saiu");
  await q("UPDATE MembroReferencia SET Status = 'DESLIGADO' WHERE MembroId = 2012");
  const dDesl = await db.registrarDemanda(pool, { ver: { membroId: 3001, crise: false }, dados: { veiculo: "Rádio do Desligado E2E", contato: "(91) 90000-2222", pedido: "Pedido com porta-voz desligado." } });
  ok(dDesl.sucesso && (await escalar("SELECT COUNT(*) FROM Notificacoes WHERE RegraChave = 'CRISE_DEMANDA_IMPRENSA' AND ReferenciaId = @d AND DestinatarioMembroId = 2012", { d: dDesl.demandaId })) === 0,
    "revisão: o porta-voz desligado não recebe o aviso do pedido da imprensa");
  await q("UPDATE MembroReferencia SET Status = 'ATIVO' WHERE MembroId = 2012");
  ok((await db.encerrar(pool, { ver: VER_CRISE, criseId: ab2.criseId, dados: { resumo: "Fim da segunda crise E2E." }, deps: segura })).sucesso, "a segunda crise é encerrada");

  console.log("== lixo em cada campo ==");
  const VER_SEC = { membroId: 1002, crise: true, seguranca: true, geralSeguranca: true, podeVerCongregacao: () => true };
  const VER_DIR = { membroId: 3002, crise: false, seguranca: true, geralSeguranca: false, podeVerCongregacao: (n) => n === V };
  const status = (r) => (!r || r.naoExiste ? 404 : r.sucesso ? 201 : r.proibido ? 403 : r.mudou ? 409 : r.limite ? 429 : 422);
  await fuzz("abrir", { base: { motivo: "Acidente", portaVoz: { tipo: "PRESIDENTE", contato: "(91) 3333-4444" } }, campos: ["motivo", "portaVoz"],
    chamarCom: async (corpo) => { const r = await chamar(H, { acao: "abrir", metodo: "POST", token: SEC, corpo }); if (r.status === 201) await q("UPDATE CriseRegimes SET Status = 'ENCERRADA', EncerradaEm = SYSUTCDATETIME(), EncerradaPorMembroId = 1002 WHERE Status = 'ATIVA'"); return r; } });
  await fuzz("pedido da imprensa", { base: DEM, campos: ["veiculo", "contato", "pedido", "prazo", "corrigeDemandaId"], chamarCom: async (dados) => { const r = await db.registrarDemanda(pool, { ver: VER_DIR, dados }); return { status: status(r), body: r }; } });
  await fuzz("plano", { base: { ...PLANO, congregacaoId: cong.v, versaoAtual: 99 }, campos: ["rotasEvacuacao", "pontosEncontro", "contatosLocais", "responsaveis", "versaoAtual"],
    chamarCom: async (dados) => { const r = await db.salvarPlano(pool, { ver: VER_DIR, congregacaoId: cong.v, dados }); return { status: status(r), body: r }; } });
  await fuzz("simulado", { base: { ...SIM, data: "2026-01-01" }, campos: ["data", "tipo", "participantes", "duracaoMinutos", "correuBem", "melhorar"],
    chamarCom: async (dados) => { const r = await db.registrarSimulado(pool, { ver: VER_DIR, congregacaoId: cong.v, dados }); if (r.sucesso) await q("UPDATE SegurancaSimulados SET AnuladoEm = SYSUTCDATETIME(), AnuladoPorMembroId = 1002, MotivoAnulacao = N'teste de lixo' WHERE SimuladoId = @s", { s: r.simuladoId }); return { status: status(r), body: r }; } });
  await fuzz("vistoria", { base: { data: "2026-10-01", itens }, campos: ["data", "itens", "observacoes"],
    chamarCom: async (dados) => { const r = await db.registrarVistoria(pool, { ver: VER_DIR, congregacaoId: cong.v, dados }); if (r.sucesso) await q("UPDATE SegurancaVistorias SET AnuladoEm = SYSUTCDATETIME(), AnuladoPorMembroId = 1002, MotivoAnulacao = N'teste de lixo' WHERE VistoriaId = @v", { v: r.vistoriaId }); return { status: status(r), body: r }; } });
  await fuzz("manifestação", { base: { ...MAN, criseId }, campos: ["dataHora", "canal", "quemFalou", "resumo", "link", "documento", "autorizadoPor", "corrigeManifestacaoId"],
    chamarCom: async (dados) => { const r = await db.registrarManifestacao(pool, { ver: VER_SEC, dados: { ...dados, criseId } }); return { status: status(r), body: r }; } });
  await fuzz("equipe", { base: { membroId: P.vilaA, funcao: "BRIGADA", desde: hojeBr() }, campos: ["membroId", "funcao", "desde", "ate"],
    chamarCom: async (dados) => { const r = await db.adicionarEquipe(pool, { ver: VER_DIR, congregacaoId: cong.v, dados }); if (r.sucesso) await q("UPDATE SegurancaEquipe SET EncerradoEm = SYSUTCDATETIME(), MotivoEncerramento = 'MANUAL', Ate = Desde WHERE EquipeId = @e", { e: r.equipeId }); return { status: status(r), body: r }; } });

  console.log("== auditoria ==");
  const acoes = (await q("SELECT DISTINCT Acao FROM AuditLog WHERE Acao LIKE 'CRISE[_]%' OR Acao LIKE 'SEGURANCA[_]%'")).map((x) => x.Acao);
  ok(["CRISE_ABERTA", "CRISE_PORTA_VOZ", "CRISE_ENCERRADA", "CRISE_MANIFESTACAO", "CRISE_MANIFESTACAO_CORRECAO", "CRISE_DEMANDA", "CRISE_DEMANDA_CORRECAO", "CRISE_DEMANDA_RESPONDIDA", "CRISE_RESPOSTA_CORRECAO",
    "SEGURANCA_PLANO_REVISADO", "SEGURANCA_SIMULADO", "SEGURANCA_SIMULADO_ANULADO", "SEGURANCA_VISTORIA", "SEGURANCA_PENDENCIA_RESOLVIDA", "SEGURANCA_EQUIPE_ENTROU", "SEGURANCA_EQUIPE_SAIU"].every((a) => acoes.includes(a)),
  "cada ato deixou a sua linha na auditoria", acoes);
  ok((await escalar("SELECT COUNT(*) FROM AuditLog WHERE (Acao LIKE 'CRISE[_]%' OR Acao LIKE 'SEGURANCA[_]%') AND (RegistroId IS NULL OR RegistroId = 0)")) === 0, "nenhuma linha de auditoria sem o registro");
  ok(!(await q("SELECT DadosDepois FROM AuditLog WHERE Acao LIKE 'CRISE[_]%'")).some((x) => /Acidente|Rádio|Nota oficial/.test(String(x.DadosDepois))), "a auditoria não guarda o texto (motivo, pedido, manifestação)");
  ok(falhasAuditoria === 0, "nenhuma falha de auditoria", falhasAuditoria);

  console.log("== revisão: reaplicar a 152 com a lista de permissões de um papel quase cheia ==");
  await q("UPDATE Papeis SET Permissoes = LEFT(REPLACE(REPLACE(Permissoes, ',seguranca_congregacao', ''), 'seguranca_congregacao,', '') + ',' + REPLICATE('x', 1000), 995) WHERE Nome = N'Dirigente de Congregação'");
  const textoMig = require("fs").readFileSync(path.join(API, "..", "sql", "migrations", "152_crise_e_seguranca.sql"), "utf8");
  let erroMig = null;
  try { for (const lote of textoMig.split(/^\s*GO\s*$/gim).map((t) => t.trim()).filter(Boolean)) await pool.request().query(lote); } catch (e) { erroMig = e.message; }
  const larg = await escalar("SELECT CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Papeis' AND COLUMN_NAME = 'Permissoes'");
  const permDir = await escalar("SELECT Permissoes FROM Papeis WHERE Nome = N'Dirigente de Congregação'");
  ok(erroMig === null && larg === 2000 && String(permDir).endsWith(",seguranca_congregacao"), "revisão: a 152 alarga Papeis.Permissoes antes de acrescentar (nada estoura)", { erroMig, larg, fim: String(permDir).slice(-30) });

  fim("e2e-33 (crise e segurança)");
})().catch((e) => { console.log("ERRO:", e && e.stack); L.shimEncerrar(); process.exitCode = 1; });
