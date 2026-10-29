// e2e-62-discipulado.js — v8.5 (Trilha de discipulado), com os handlers e o banco REAIS, sobre a base "cenario-escada" (a "preparar-escada" aplica a 161).
// O catálogo (etapas e tipos de marco) só no nível geral; o marco único, o só do nível geral, a data no futuro; as quatro fontes da etapa (marco, batismo nas águas,
// trilha de formação, escala realizada); a caminhada no perfil e a minha; o funil e os parados só do território; a rotina que abre o "próximo passo" na fila do cuidado
// (só passo recente, no máximo 20 por congregação, nunca de novo para a mesma etapa) e o fecha sozinho; a minimização que apaga os marcos; Meus Dados; lixo.
const L = require("./lib");
const { ok, fim, q, escalar, obterPool, hojeBr, path, API, GERAL, LIDER } = L;
const E = require("./lib-escada");
const { chamarRota } = E;

console.error = () => { };
const req = (m) => require(path.join(API, m));
const somar = (n) => req("shared/afm.js").somarDias(hojeBr(), n);
const MEMBRO = (m) => L.sessao(m, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() } });
const SEC = () => GERAL(1002, ["pessoas"]);
const LOCAL = () => LIDER(E.P.lider, ["pessoas"], [E.CENTRAL]);
const disc = (acao, { metodo = "GET", token, corpo, query } = {}) => chamarRota("GestaoDiscipulado/index.js", { metodo, binding: { acao }, token: token === undefined ? SEC() : token || undefined, corpo, query });
const marco = (membroId, tipo, extra = {}, token) => chamarRota("RegistrarMarcoMembro/index.js", { metodo: "POST", token: token || LOCAL(), corpo: { membroId, tipo, descricao: `Marco ${tipo} (e2e)`, ...extra } });

// pessoas da trilha (Central E2E, menos a 9420 da Vila Nova)
const N = { nova: 9401, batizada: 9402, servo: 9403, antiga: 9404, trilha: 9405, sai: 9406, fora: 9420 };

(async () => {
  const pool = await obterPool();
  const hoje = hojeBr();
  const { central, vila } = await E.montarCenario();
  const pessoa = async (m, nome, cong, extra = "") => q(`IF NOT EXISTS (SELECT 1 FROM MembroReferencia WHERE MembroId = @m)
    INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, DataAdmissao, Email) VALUES (@m, @n, @c, 'ATIVO', 'EM_COMUNHAO', '1990-01-01', '2020-01-01', @e)`,
    { m, n: nome, c: cong, e: `disc${m}@e2e.local` });
  for (const [k, m] of Object.entries(N)) await pessoa(m, `Discipulado ${k} E2E`, m === N.fora ? vila : central);
  const contar = (sqlTxt, p) => escalar(sqlTxt, p);

  console.log("== migração 161 ==");
  ok((await contar("SELECT COUNT(*) FROM EtapasDiscipulado")) === 6 && (await contar("SELECT COUNT(*) FROM TiposMarco")) === 6, "a trilha inicial (6 etapas) e os 6 tipos de marco");
  ok(/DISCIPULADO/.test(await escalar("SELECT definition FROM sys.check_constraints WHERE name = 'CK_CuidadoItens_Tipo'"))
    && /PASSO_DADO/.test(await escalar("SELECT definition FROM sys.check_constraints WHERE name = 'CK_CuidadoItens_Desfecho'")), "o cuidado aceita o tipo e o desfecho novos");

  console.log("== catálogo: só o nível geral mexe ==");
  let r = await disc("catalogo", { token: LOCAL() });
  ok(r.status === 200 && r.body.etapas.length === 6 && r.body.tiposMarco.some((t) => t.codigo === "CURSO_DISCIPULADO" && t.unico), "a liderança local lê o catálogo", r.body);
  ok((await disc("catalogo", { token: null })).status === 401, "sem sessão: 401");
  r = await disc("tipo-marco", { metodo: "POST", token: LOCAL(), corpo: { codigo: "CLASSE_NOVOS", nome: "Classe de novos" } });
  ok(r.status === 403, "a liderança local não cria tipo de marco", r.body);
  r = await disc("tipo-marco", { metodo: "POST", corpo: { codigo: "classe_novos", nome: "Classe de novos convertidos", unico: true } });
  ok(r.status === 200 && (await contar("SELECT Unico FROM TiposMarco WHERE Codigo = 'CLASSE_NOVOS'")) === true, "o nível geral cria (o código vira maiúsculas)", r.body);
  r = await disc("tipo-marco", { metodo: "POST", corpo: { codigo: "OUTRA_CLASSE", nome: "Classe de novos convertidos" } });
  ok(r.status === 409, "nome repetido: 409", r.body);
  r = await disc("tipo-marco", { metodo: "POST", corpo: { codigo: "BATISMO_ESPIRITO_SANTO", nome: "Batismo no Espírito Santo", unico: true, soNivelGeral: false } });
  ok(r.status === 422 && /escada/.test(r.body.mensagem), "o batismo no Espírito Santo continua só do nível geral (escada)", r.body);
  const etapasAgora = (await disc("catalogo")).body.etapas;
  const id = (chave) => etapasAgora.find((e) => e.chave === chave).etapaId;
  r = await disc("etapa", { metodo: "POST", corpo: { etapaId: id("CONVERSAO"), chave: "CONVERSAO", nome: "Conversão", ordem: 1, fonte: "MARCO", tipoMarco: "CONVERSAO", preRequisitos: [id("BATISMO_AGUAS")] } });
  ok(r.status === 422 && /círculo/.test(r.body.mensagem), "pré-requisito em círculo: recusado (nada muda)", r.body);
  r = await disc("etapa", { metodo: "POST", corpo: { chave: "X", nome: "Etapa", ordem: 1, fonte: "MARCO", tipoMarco: "CONVERSAO" } });
  ok(r.status === 400, "chave curta: 400", r.body);
  r = await disc("etapa", { metodo: "POST", corpo: { chave: "CURSO_TRILHA", nome: "Curso pela trilha", ordem: 7, fonte: "TRILHA", trilhaId: 999999 } });
  ok(r.status === 422 && /Trilha de formação não encontrada/.test(r.body.mensagem), "trilha inexistente: recusada", r.body);
  r = await disc("etapa", { metodo: "POST", token: LOCAL(), corpo: { chave: "NOVA_ETAPA", nome: "Nova etapa", ordem: 7, fonte: "BATISMO_AGUAS" } });
  ok(r.status === 403, "a liderança local não cria etapa", r.body);

  console.log("== marcos: único, só do nível geral, data ==");
  r = await marco(N.nova, "CONVERSAO", { dataMarco: somar(-20) });
  ok(r.status === 201, "conversão registrada pela liderança local", r.body);
  r = await marco(N.nova, "CONVERSAO", { dataMarco: somar(-10) });
  ok(r.status === 409 && /único/.test(r.body.mensagem), "a segunda conversão: 409 (é único)", r.body);
  ok((await marco(N.nova, "OUTRO")).status === 201 && (await marco(N.nova, "OUTRO")).status === 201, "o repetível aceita outro");
  r = await marco(N.nova, "CURSO_DISCIPULADO", { dataMarco: somar(5) });
  ok(r.status === 400 && /futuro/.test(r.body.mensagem), "data no futuro: 400", r.body);
  r = await marco(N.nova, "INVENTADO");
  ok(r.status === 400, "tipo fora do catálogo: 400", r.body);
  await disc("tipo-marco", { metodo: "POST", corpo: { codigo: "CLASSE_NOVOS", nome: "Classe de novos convertidos", unico: true, ativo: false } });
  ok((await marco(N.nova, "CLASSE_NOVOS")).status === 400, "tipo desativado: 400");
  ok((await marco(N.nova, "BATISMO_ESPIRITO_SANTO")).status === 403, "batismo no Espírito Santo: a liderança local não lança");
  ok((await marco(N.fora, "CONVERSAO")).body.mensagem === "Matrícula não encontrada.", "fora do território: matrícula não encontrada");

  console.log("== as quatro fontes ==");
  // batizada: conversão, curso e batismo (a data do cadastro)
  await marco(N.batizada, "CONVERSAO", { dataMarco: "2026-01-10" });
  await marco(N.batizada, "CURSO_DISCIPULADO", { dataMarco: "2026-03-01" });
  await q("UPDATE MembroReferencia SET DataBatismo = @d WHERE MembroId = @m", { d: somar(-15), m: N.batizada });
  // servo: tudo até o primeiro serviço voluntário (uma escala confirmada, já realizada; a cancelada e a futura não contam)
  for (const [t, d] of [["CONVERSAO", "2025-01-01"], ["CURSO_DISCIPULADO", "2025-02-01"], ["PARTICIPACAO_DEPARTAMENTO", "2025-05-01"]]) await marco(N.servo, t, { dataMarco: d });
  await q("UPDATE MembroReferencia SET DataBatismo = '2025-03-01' WHERE MembroId = @m", { m: N.servo });
  await marco(N.servo, "BATISMO_ESPIRITO_SANTO", { dataMarco: "2025-04-01" }, SEC());
  const equipe = await escalar("INSERT INTO EscalasEquipes (Nome, CongregacaoId, LiderMembroId) OUTPUT INSERTED.EquipeId VALUES (N'Recepção E2E', @c, @l)", { c: central, l: E.P.lider });
  const servico = (quando, status) => escalar("INSERT INTO EscalasServicos (CongregacaoId, DataHora, Descricao, Status) OUTPUT INSERTED.ServicoId VALUES (@c, @d, N'Culto E2E', @s)", { c: central, d: quando, s: status });
  const sFuturo = await servico(`${somar(10)}T22:00:00`, "PUBLICADA");
  const sCancelado = await servico("2025-06-01T22:00:00", "CANCELADA");
  const sPassado = await servico("2025-07-06T22:00:00", "PUBLICADA");
  for (const s of [sFuturo, sCancelado]) await q("INSERT INTO EscalasAlocacoes (ServicoId, EquipeId, MembroId, Status) VALUES (@s, @e, @m, 'CONFIRMADO')", { s, e: equipe, m: N.servo });
  let c = (await disc("pessoa", { token: LOCAL(), query: { membroId: N.servo } })).body.caminhada;
  ok(c.proximo && c.proximo.chave === "SERVICO_VOLUNTARIO", "a escala futura e a cancelada não contam como serviço", c.proximo);
  await q("INSERT INTO EscalasAlocacoes (ServicoId, EquipeId, MembroId, Status) VALUES (@s, @e, @m, 'ACEITO')", { s: sPassado, e: equipe, m: N.servo });
  c = (await disc("pessoa", { token: LOCAL(), query: { membroId: N.servo } })).body.caminhada;
  ok(c.concluida && c.etapas.find((e) => e.chave === "SERVICO_VOLUNTARIO").data === "2025-07-06", "a escala realizada conta: trilha concluída (a data de Brasília)", c.etapas.map((e) => [e.chave, e.data]));
  c = (await disc("pessoa", { token: LOCAL(), query: { membroId: N.batizada } })).body.caminhada;
  ok(c.etapas.find((e) => e.chave === "BATISMO_AGUAS").feita && c.proximo.chave === "BATISMO_ESPIRITO", "o batismo nas águas vem da data do cadastro", c.proximo);
  // trilha: o curso configurado como trilha de formação (v6.9) — a etapa passa a ler a conclusão
  const trilhaId = await escalar("INSERT INTO Trilhas (Nome) OUTPUT INSERTED.TrilhaId VALUES (N'Curso de Discipulado E2E')");
  await marco(N.trilha, "CONVERSAO", { dataMarco: somar(-30) });
  await q("INSERT INTO TrilhaMatriculas (TrilhaId, MembroId, Status, ConcluidaEm) VALUES (@t, @m, 'CONCLUIDA', @d)", { t: trilhaId, m: N.trilha, d: `${somar(-3)}T12:00:00` });
  const curso = etapasAgora.find((e) => e.chave === "CURSO_DISCIPULADO");
  r = await disc("etapa", { metodo: "POST", corpo: { etapaId: curso.etapaId, chave: curso.chave, nome: curso.nome, ordem: curso.ordem, fonte: "TRILHA", trilhaId, preRequisitos: curso.preRequisitos } });
  ok(r.status === 200, "o nível geral liga a etapa do curso à trilha de formação", r.body);
  c = (await disc("pessoa", { token: LOCAL(), query: { membroId: N.batizada } })).body.caminhada;
  ok(!c.etapas.find((e) => e.chave === "CURSO_DISCIPULADO").feita, "só a trilha: o marco antigo do curso deixa de contar");
  r = await disc("etapa", { metodo: "POST", corpo: { etapaId: curso.etapaId, chave: curso.chave, nome: curso.nome, ordem: curso.ordem, fonte: "TRILHA", trilhaId, tipoMarco: "CURSO_DISCIPULADO", preRequisitos: curso.preRequisitos } });
  c = (await disc("pessoa", { token: LOCAL(), query: { membroId: N.batizada } })).body.caminhada;
  ok(r.status === 200 && c.etapas.find((e) => e.chave === "CURSO_DISCIPULADO").data === "2026-03-01", "a trilha E o marco: quem fez o curso antes da trilha não perde a etapa", c.etapas.map((e) => [e.chave, e.data]));
  c = (await disc("pessoa", { token: LOCAL(), query: { membroId: N.trilha } })).body.caminhada;
  ok(c.etapas.find((e) => e.chave === "CURSO_DISCIPULADO").feita && c.proximo.chave === "BATISMO_AGUAS", "o curso conta pela trilha concluída", c.etapas.map((e) => [e.chave, e.feita]));
  // a urgência (Art. 70 §5º): batismo antes do curso — fora de ordem, e o curso é o próximo passo
  await q("UPDATE MembroReferencia SET DataBatismo = @d WHERE MembroId = @m", { d: somar(-2), m: N.nova });
  c = (await disc("pessoa", { token: LOCAL(), query: { membroId: N.nova } })).body.caminhada;
  ok(c.etapas.find((e) => e.chave === "BATISMO_AGUAS").foraDeOrdem && c.proximo.chave === "CURSO_DISCIPULADO", "batismo de urgência antes do curso: fora de ordem, e o curso pendente", c.proximo);
  ok((await disc("pessoa", { token: LOCAL(), query: { membroId: N.fora } })).status === 404 && (await disc("pessoa", { token: LOCAL(), query: { membroId: "abc" } })).status === 404, "a pessoa de fora do território (ou malformada): 404");
  r = await disc("minha", { token: MEMBRO(N.nova) });
  ok(r.status === 200 && r.body.caminhada.proximo.chave === "CURSO_DISCIPULADO", "a minha caminhada", r.body);

  console.log("== funil e parados (só o território) ==");
  await marco(N.antiga, "CONVERSAO", { dataMarco: "2010-01-01" });   // parada há anos antes do curso
  r = await disc("funil", { token: LOCAL() });
  const centralF = (r.body.congregacoes || []).find((x) => x.nome === E.CENTRAL);
  ok(r.status === 200 && centralF && !(r.body.congregacoes || []).some((x) => x.nome !== E.CENTRAL), "a liderança local vê só a sua congregação", (r.body.congregacoes || []).map((x) => x.nome));
  const linhaCurso = centralF.etapas.find((e) => e.etapaId === curso.etapaId);
  ok(centralF.iniciadas >= 5 && linhaCurso.proximoPasso >= 2 && linhaCurso.parados >= 1, "o funil conta quem fez, quem tem a etapa como próximo passo e quem parou", linhaCurso);
  r = await disc("parados", { token: LOCAL(), query: { congregacaoId: central, etapaId: curso.etapaId } });
  ok(r.status === 200 && r.body.itens.some((p) => p.membroId === N.antiga) && !r.body.itens.some((p) => p.membroId === N.nova), "parados antes do curso: a antiga, não a nova (deu passo há pouco)", r.body.itens);
  ok((await disc("parados", { token: LOCAL(), query: { congregacaoId: vila, etapaId: curso.etapaId } })).status === 404, "parados de outra congregação: 404");
  r = await disc("funil", { token: SEC(), query: { diasParado: "abc" } });
  ok(r.status === 200 && r.body.diasParado === 90, "dias inválidos: o padrão (90)");

  console.log("== o próximo passo vira acompanhamento ==");
  const rotina = () => req("shared/discipuladoDb.js").rotinaDiaria(pool);
  let rr = await rotina();
  const itensDe = (m) => q("SELECT ItemId, Status, Desfecho, Origem, Motivo, EtapaDiscipuladoId FROM CuidadoItens WHERE Tipo = 'DISCIPULADO' AND MembroId = @m ORDER BY ItemId", { m });
  let it = await itensDe(N.nova);
  ok(it.length === 1 && it[0].Status === "ABERTO" && it[0].Origem === "DISCIPULADO" && it[0].EtapaDiscipuladoId === curso.etapaId && /Curso de Discipulado/.test(it[0].Motivo), "quem andou há pouco: o item do próximo passo (o curso)", it);
  ok((await itensDe(N.antiga)).length === 0, "quem parou há anos não inunda a fila (fora da janela de 180 dias)");
  ok((await itensDe(N.servo)).length === 0, "quem concluiu a trilha não tem próximo passo");
  rr = await rotina();
  ok((await itensDe(N.nova)).length === 1 && rr.abertos === 0, "a rotina de novo não abre outro", rr);
  // a pessoa faz o curso: o item fecha sozinho e abre o do próximo passo
  await marco(N.nova, "CURSO_DISCIPULADO", { dataMarco: somar(-1) });
  rr = await rotina();
  it = await itensDe(N.nova);
  ok(it[0].Status === "CONCLUIDO" && it[0].Desfecho === "PASSO_DADO", "deu o passo: o item fecha sozinho (passo dado)", it);
  ok(it.length === 1, "o próximo passo dela (batismo no Espírito Santo) não pede acompanhamento: nenhum item novo", it);
  ok((await q("SELECT Tipo FROM CuidadoEventos WHERE ItemId = @i ORDER BY EventoId", { i: it[0].ItemId })).some((e) => e.Tipo === "CONCLUIDO"), "com o evento de conclusão no histórico do item");
  // quem fez o curso pela trilha tem o batismo nas águas como próximo passo (pede acompanhamento); a liderança cancela: não reabre para a mesma etapa
  let itT = await itensDe(N.trilha);
  ok(itT.length === 1 && itT[0].Status === "ABERTO" && /Batismo nas águas/.test(itT[0].Motivo), "o curso concluído pela trilha: o item do batismo nas águas", itT);
  await q("UPDATE CuidadoItens SET Status = 'CANCELADO', Desfecho = 'ENGANO', EncerradoEm = SYSUTCDATETIME() WHERE ItemId = @i", { i: itT[0].ItemId });
  await rotina();
  ok((await itensDe(N.trilha)).length === 1, "cancelado pela liderança: não reabre para a mesma etapa");
  // no máximo 20 por congregação por dia
  for (let i = 0; i < 25; i++) { await pessoa(9500 + i, `Convertido ${i} E2E`, central); await q("INSERT INTO MarcosMembro (MembroId, Tipo, Descricao, DataMarco) VALUES (@m, 'CONVERSAO', N'e2e', @d)", { m: 9500 + i, d: somar(-i - 1) }); }
  rr = await rotina();
  ok(rr.abertos === 20, "25 convertidos novos: 20 itens hoje (o resto amanhã)", rr);
  ok((await contar("SELECT COUNT(*) FROM CuidadoItens WHERE Tipo = 'DISCIPULADO' AND MembroId BETWEEN 9500 AND 9524")) === 20 && (await contar("SELECT COUNT(*) FROM CuidadoItens WHERE MembroId = 9524")) === 0,
    "os passos mais recentes primeiro");
  ok((await rotina()).abertos === 5, "no dia seguinte, os outros 5");
  ok((await contar("SELECT COUNT(*) FROM CuidadoItens WHERE Tipo = 'DISCIPULADO' AND Origem = 'DISCIPULADO' AND PrazoEm > SYSUTCDATETIME()")) > 0, "com o prazo do tipo (Catálogos → Prazos)");
  // a rotina do cuidado chama a do discipulado
  const cuidado = await req("shared/cuidadoPastoralDb.js").rotinaDiaria(pool);
  ok(cuidado.discipulado && !cuidado.falhas.includes("discipulado"), "a rotina diária do cuidado roda a do discipulado", cuidado);
  // a fila do cuidado mostra o item com a origem e o resumo
  const g = await chamarRota("GestaoCuidadoPastoral/index.js", { binding: { acao: "fila" }, token: GERAL(1002, ["cuidado_pastoral"]) }).catch(() => null);
  if (g && g.status === 200) ok(JSON.stringify(g.body).includes("Próximo passo do discipulado"), "a fila mostra o tipo novo");

  console.log("== Meus Dados e a minimização ==");
  const md = await req("shared/discipuladoDb.js").dadosDoTitular(pool, N.nova);
  ok(md.etapas.some((e) => e.etapa === "Conversão" && e.feita) && md.proximoPasso, "Meus Dados: a caminhada e o próximo passo", md);
  await marco(N.sai, "CONVERSAO", { dataMarco: "2024-01-01" });
  await req("shared/minimizacaoLgpd.js").minimizarCamposExMembro(pool, N.sai, { dataSaida: hoje, motivo: "Carta de Mudança" });
  ok((await contar("SELECT COUNT(*) FROM MarcosMembro WHERE MembroId = @m", { m: N.sai })) === 0, "minimizado: os marcos (registros de conversão) saem — Art. 132 §2º, II");

  if (process.env.E2E_CONTRATO) {
    const contrato = {
      catalogo: (await disc("catalogo")).body, funilLocal: (await disc("funil", { token: LOCAL() })).body, funilGeral: (await disc("funil")).body,
      parados: (await disc("parados", { token: LOCAL(), query: { congregacaoId: central, etapaId: curso.etapaId } })).body,
      pessoa: (await disc("pessoa", { token: LOCAL(), query: { membroId: N.nova } })).body, minha: (await disc("minha", { token: MEMBRO(N.nova) })).body,
      minhaVazia: (await disc("minha", { token: MEMBRO(N.fora) })).body
    };
    require("fs").mkdirSync(path.join(__dirname, "..", "front-discipulado"), { recursive: true });
    require("fs").writeFileSync(path.join(__dirname, "..", "front-discipulado", "contrato-real.json"), JSON.stringify(contrato, null, 2));
    console.log("contrato gravado em tools/front-discipulado/contrato-real.json");
  }
  console.log("== lixo ==");
  const quebras = [];
  for (const lixo of [null, 1, "x", [], {}, true, "' OR 1=1 --", "<script>", "A".repeat(5000), -1, 1e20]) {
    for (const [acao, base] of [["etapa", { chave: "LIXO_E2E", nome: "Lixo", ordem: 9, fonte: "MARCO", tipoMarco: "OUTRO" }], ["tipo-marco", { codigo: "LIXO_E2E", nome: "Lixo e2e" }]]) {
      for (const campo of Object.keys(base).concat(["preRequisitos", "etapaId", "unico", "trilhaId"])) {
        const r2 = await disc(acao, { metodo: "POST", corpo: { ...base, [campo]: lixo } });
        if (r2.status >= 500 || /SQL|RequestError|undefined/.test(JSON.stringify(r2.body))) quebras.push([acao, campo, String(lixo).slice(0, 20), r2.status]);
      }
    }
    for (const acao of ["pessoa", "parados", "funil"]) {
      const r2 = await disc(acao, { token: LOCAL(), query: { membroId: lixo, congregacaoId: lixo, etapaId: lixo, diasParado: lixo } });
      if (r2.status >= 500) quebras.push([acao, String(lixo).slice(0, 20), r2.status]);
    }
  }
  ok(quebras.length === 0, "lixo em todo campo: nenhuma 500 nem texto interno", quebras.slice(0, 5));
  ok((await disc("inventada")).status === 404 && (await disc("etapa", { metodo: "GET" })).status === 404, "ação desconhecida: 404");

  fim("e2e-62 discipulado");
})().catch((e) => { console.log("ERRO", e); process.exit(1); });
