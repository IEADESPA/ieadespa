// e2e-64-educacao-continuada.js — v8.6 (Educação continuada), com os handlers e o banco REAIS, sobre a base "cenario-escada" (a "preparar-escada" aplica a 162).
// A reciclagem anual (Art. 68 §3º): a edição, o aprovado só com a frequência mínima, a credencial não renovada para quem não foi aprovado no ano anterior (a licença para
// oficiar, a Comissão de Unção, o QR e a escada dizem o mesmo), a reposição, quem virou obreiro depois da edição. O exame bienal (Art. 70 §3º): sob observação, suspenso
// pela ausência, a ausência justificada, a repescagem, um bienal por ano. Quem pode o quê; o histórico (a justificativa só para a própria pessoa); os avisos de outubro;
// a retenção da justificativa; Meus Dados; lixo.
const L = require("./lib");
const { ok, fim, q, escalar, obterPool, hojeBr, path, API, GERAL, LIDER } = L;
const E = require("./lib-escada");
const { P, CENTRAL, chamarRota, cerimonias, COMISSAO } = E;

console.error = () => { };
const req = (m) => require(path.join(API, m));
const MEMBRO = (m) => L.sessao(m, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() } });
const AFM = () => GERAL(1002, ["afm", "pessoas", "consagracoes"]);
const edc = (acao, { metodo = "GET", token, corpo, query } = {}) => chamarRota("GestaoEducacaoContinuada/index.js", { metodo, binding: { acao }, token: token === undefined ? AFM() : token || undefined, corpo, query });

(async () => {
  const pool = await obterPool();
  const hoje = hojeBr();
  const ano = Number(hoje.slice(0, 4));
  await E.montarCenario();
  const licenca = async (m) => (await req("shared/afmDb.js").licencasDe(pool, [m])).get(m);
  const qr = async (m) => req("shared/credencial.js").situacaoPublica({ situacao: "VALIDA", via: 1 }, await req("shared/credencialDb.js").pessoa(pool, m)).funcao;

  console.log("== migração 162 ==");
  ok((await escalar("SELECT COUNT(*) FROM sys.tables WHERE name IN ('AFMReciclagemEdicoes', 'AFMReciclagemResultados', 'AFMExames', 'AFMExameResultados')")) === 4, "as quatro tabelas");
  ok((await escalar("SELECT COUNT(*) FROM NotificacaoRegras WHERE Chave IN ('AFM_RECICLAGEM_PENDENTE', 'AFM_EXAME_PENDENTE')")) === 2, "as duas regras de aviso");

  console.log("== quem pode o quê ==");
  ok((await edc("painel", { token: null })).status === 401, "sem sessão: 401");
  ok((await edc("painel", { token: LIDER(P.lider, ["afm"], [CENTRAL]) })).status === 403, "a AFM local não vê o painel");
  ok((await edc("edicao", { metodo: "POST", token: LIDER(P.lider, ["afm"], [CENTRAL]), corpo: { data: `${ano - 1}-08-10`, cargaHoraria: 20, frequenciaMinimaPct: 75 } })).status === 403, "nem registra a edição");
  ok((await edc("painel", { token: GERAL(1002, ["pessoas"]) })).status === 403, "o nível geral sem 'afm': 403");

  console.log("== a reciclagem do ano anterior (Art. 68 §3º) ==");
  ok((await licenca(P.pastor2)).podeOficiar, "antes de qualquer edição registrada, ninguém fica pendente (nada retroage)");
  let r = await edc("edicao", { metodo: "POST", corpo: { data: `${ano - 1}-08-10`, cargaHoraria: 20, frequenciaMinimaPct: 75, observacao: "Reciclagem e2e" } });
  ok(r.status === 200, "a edição do ano anterior registrada", r.body);
  const edicaoId = await escalar("SELECT EdicaoId FROM AFMReciclagemEdicoes WHERE Ano = @a", { a: ano - 1 });
  r = await edc("resultados-reciclagem", { metodo: "POST", corpo: { edicaoId, itens: [
    { membroId: P.pastor1, resultado: "APROVADO", horasPresentes: 16 }, { membroId: P.pastor2, resultado: "REPROVADO", horasPresentes: 10 },
    { membroId: P.pastor4, resultado: "APROVADO", horasPresentes: 14 }, { membroId: 1002, resultado: "APROVADO", horasPresentes: 20 }, { membroId: 99999999, resultado: "APROVADO", horasPresentes: 20 }
  ] } });
  const porId = new Map((r.body.resultados || []).map((x) => [x.membroId, x]));
  ok(r.status === 200 && porId.get(P.pastor1).sucesso && porId.get(P.pastor2).sucesso, "os resultados entram um a um", r.body);
  ok(!porId.get(P.pastor4).sucesso && /frequência mínima/.test(porId.get(P.pastor4).mensagem), "aprovado sem a frequência mínima (14 de 15 h): recusado", porId.get(P.pastor4));
  ok(!porId.get(1002).sucesso && /próprio/.test(porId.get(1002).mensagem), "ninguém registra o próprio resultado");
  ok(!porId.get(99999999).sucesso, "matrícula inexistente: recusada");
  ok((await licenca(P.pastor1)).podeOficiar && (await qr(P.pastor1)) === "HABILITADO", "aprovado: em dia");
  const l2 = await licenca(P.pastor2);
  ok(!l2.podeOficiar && /Art\. 68 §3º/.test(l2.motivo) && (await qr(P.pastor2)) === "INATIVO", "reprovado na reciclagem do ano anterior: credencial não renovada (não oficia; o QR diz inativo)", l2);
  ok(!(await licenca(P.pastor3)).podeOficiar, "sem resultado registrado também: a frequência e a aprovação são exigidas");
  const ce = (await cerimonias("criar", { dataCerimonia: L.hojeBr(), local: "Templo E2E", ocasiao: "AGO", valorTaxa: 70 })).body.cerimoniaId;
  r = await cerimonias("comissao", { cerimoniaId: ce, membroIds: COMISSAO });
  ok(r.status === 422 && /Dois E2E: não está em atividade/.test(r.body.mensagem), "a Comissão de Unção recusa o Pastor sem a reciclagem (a regra única)", r.body);
  const reqEsc = await E.req("Consagração a Evangelista", P.presbitero, "NOMEACAO_PRESIDENCIAL");
  ok(((reqEsc.body.requisitos || {}).itens || []).some((i) => i.chave === "educacao" && i.situacao === "FALTA"), "a escada trava (nem a nomeação do Presidente dispensa)", reqEsc.body.requisitos);
  // quem virou obreiro depois da edição não tinha como ir
  await q("UPDATE CargosMinisteriaisHistorico SET Desde = @d WHERE MembroId = @m AND Ate IS NULL", { d: `${ano - 1}-09-01`, m: P.vetado });
  ok((await licenca(P.vetado)).podeOficiar, "obreiro desde depois da edição: não fica pendente");
  // a promoção depois da edição não zera a contagem (revisão): o Presbítero sem a reciclagem promovido a Evangelista continua devendo
  await q(`UPDATE CargosMinisteriaisHistorico SET Desde = '2015-01-01' WHERE MembroId = @m AND Ate IS NULL;
    UPDATE CargosMinisteriaisHistorico SET Ate = @d WHERE MembroId = @m AND Ate IS NULL;
    INSERT INTO CargosMinisteriaisHistorico (MembroId, Cargo, Desde, Origem) VALUES (@m, N'EVANGELISTA', @d, N'CADASTRO');
    UPDATE MembroReferencia SET CargoMinisterial = N'EVANGELISTA' WHERE MembroId = @m`, { m: P.presbitero, d: `${ano - 1}-12-10` });
  ok(!(await licenca(P.presbitero)).podeOficiar, "promovido depois de faltar à reciclagem: a promoção não apaga a pendência");
  await q(`DELETE FROM CargosMinisteriaisHistorico WHERE MembroId = @m AND Ate IS NULL; UPDATE CargosMinisteriaisHistorico SET Ate = NULL WHERE MembroId = @m AND Ate = @d;
    UPDATE MembroReferencia SET CargoMinisterial = N'PRESBITERO' WHERE MembroId = @m`, { m: P.presbitero, d: `${ano - 1}-12-10` });
  // a reposição: o resultado corrigido para aprovado
  r = await edc("resultados-reciclagem", { metodo: "POST", corpo: { edicaoId, itens: [{ membroId: P.pastor2, resultado: "APROVADO", horasPresentes: 15 }, { membroId: P.pastor3, resultado: "APROVADO", horasPresentes: 18 }, { membroId: P.pastor4, resultado: "APROVADO", horasPresentes: 15 }] } });
  ok(r.body.sucesso && (await licenca(P.pastor2)).podeOficiar && (await licenca(P.pastor3)).podeOficiar, "a reposição: aprovados, a credencial volta", r.body);
  ok((await escalar("SELECT COUNT(*) FROM AuditLog WHERE Tabela = 'AFMReciclagemResultados' AND RegistroId = @m", { m: P.pastor2 })) >= 2, "e cada lançamento fica na auditoria");
  r = await edc("edicao", { metodo: "POST", corpo: { data: `${ano - 1}-08-12`, cargaHoraria: 24, frequenciaMinimaPct: 75 } });
  ok(r.status === 409 && /Corrija esses resultados primeiro/.test(r.body.mensagem), "subir a carga deixaria aprovados abaixo do novo mínimo (18 h): recusado", r.body);
  r = await edc("edicao", { metodo: "POST", corpo: { data: `${ano - 1}-08-12`, cargaHoraria: 20, frequenciaMinimaPct: 75 } });
  ok(r.status === 200 && (await escalar("SELECT COUNT(*) FROM AFMReciclagemEdicoes WHERE Ano = @a", { a: ano - 1 })) === 1, "registrar de novo o mesmo ano corrige (uma edição por ano)", r.body);
  ok((await escalar("SELECT TOP 1 RegistroId FROM AuditLog WHERE Tabela = 'AFMReciclagemEdicoes' ORDER BY AuditId DESC")) === edicaoId
    && /"cargaHoraria":20/.test(await escalar("SELECT TOP 1 DadosAntes FROM AuditLog WHERE Tabela = 'AFMReciclagemEdicoes' AND Acao = 'AFM_RECICLAGEM_EDICAO_ALTERADA' ORDER BY AuditId DESC") || ""),
    "a auditoria da edição: o id certo e o antes");
  ok((await edc("edicao", { query: { edicaoId: 99999 } })).status === 404 && (await edc("exame", { query: { exameId: 99999 } })).status === 404, "edição ou exame inexistente: 404");

  console.log("== o exame bienal (Art. 70 §3º) ==");
  r = await edc("exame", { metodo: "POST", corpo: { tipo: "BIENAL", data: `${ano - 1}-11-30` } });
  ok(r.status === 201, "o bienal registrado", r.body);
  const bienal = r.body.exameId;
  ok((await edc("exame", { metodo: "POST", corpo: { tipo: "BIENAL", data: `${ano - 1}-11-23` } })).status === 409, "um bienal por ano: o segundo, 409");
  r = await edc("resultados-exame", { metodo: "POST", corpo: { exameId: bienal, itens: [
    { membroId: P.pastor1, resultado: "APROVADO" }, { membroId: P.pastor2, resultado: "REPROVADO" }, { membroId: P.pastor3, resultado: "AUSENTE" },
    { membroId: P.pastor4, resultado: "AUSENTE_JUSTIFICADO" }, { membroId: P.presbitero, resultado: "REPROVADO" }
  ] } });
  const ex = new Map((r.body.resultados || []).map((x) => [x.membroId, x]));
  ok(!ex.get(P.pastor4).sucesso && /justificativa/.test(ex.get(P.pastor4).mensagem), "ausência justificada sem a justificativa: recusada");
  await edc("resultados-exame", { metodo: "POST", corpo: { exameId: bienal, itens: [{ membroId: P.pastor4, resultado: "AUSENTE_JUSTIFICADO", justificativa: "Internado no hospital (e2e)" }] } });
  ok((await licenca(P.pastor2)).podeOficiar && (await qr(P.pastor2)) === "SOB_OBSERVACAO", "reprovado: continua oficiando, mas o QR diz 'sob observação'");
  const l3 = await licenca(P.pastor3);
  ok(!l3.podeOficiar && /Art\. 70 §3º, II/.test(l3.motivo) && (await qr(P.pastor3)) === "INATIVO", "ausente sem justificativa: suspenso das funções", l3);
  ok((await licenca(P.pastor4)).podeOficiar, "ausente com justificativa: deve a repescagem, sem sanção");
  const reqObs = await E.req("Consagração a Evangelista", P.presbitero, "NOMEACAO_PRESIDENCIAL");
  ok(((reqObs.body.requisitos || {}).itens || []).some((i) => i.chave === "educacao" && /sob observação/.test(i.detalhe)), "sob observação: não sobe na escada", reqObs.body.requisitos);
  ok((await edc("exame", { metodo: "POST", corpo: { tipo: "REPESCAGEM", data: `${ano - 1}-11-20`, exameOrigemId: bienal } })).status === 422, "a repescagem é depois do bienal");
  r = await edc("exame", { metodo: "POST", corpo: { tipo: "REPESCAGEM", data: `${ano - 1}-12-15`, exameOrigemId: bienal } });
  const repescagem = r.body.exameId;
  // a ausência justificada na repescagem não tira a suspensão (revisão): só a aprovação
  await edc("resultados-exame", { metodo: "POST", corpo: { exameId: repescagem, itens: [{ membroId: P.pastor3, resultado: "AUSENTE_JUSTIFICADO", justificativa: "Viagem missionária (e2e)" }] } });
  ok(!(await licenca(P.pastor3)).podeOficiar && (await qr(P.pastor3)) === "INATIVO", "suspenso que falta com justificativa à repescagem: continua suspenso");
  await edc("resultados-exame", { metodo: "POST", corpo: { exameId: repescagem, itens: [{ membroId: P.pastor3, resultado: "APROVADO" }, { membroId: P.pastor2, resultado: "REPROVADO" }] } });
  ok((await licenca(P.pastor3)).podeOficiar && (await qr(P.pastor3)) === "HABILITADO", "aprovado na repescagem: volta");
  ok((await qr(P.pastor2)) === "SOB_OBSERVACAO", "reprovado de novo na repescagem: continua sob observação");
  const reqJust = await E.req("Consagração a Evangelista", P.pastor4, "NOMEACAO_PRESIDENCIAL");
  ok(!((reqJust.body.requisitos || {}).itens || []).some((i) => i.chave === "educacao" && i.situacao === "FALTA"), "a ausência justificada não trava a escada (só avisa)", reqJust.body.requisitos);

  console.log("== o painel, o histórico e Meus Dados ==");
  r = await edc("painel");
  const pend = (r.body.pessoas || []).filter((p) => p.situacao && p.situacao.pendencias.length).map((p) => p.membroId);
  ok(r.status === 200 && pend.includes(P.pastor2) && pend.includes(P.pastor4) && !pend.includes(P.pastor1), "o painel mostra quem está pendente", pend);
  ok(r.body.edicoes[0].horasMinimas === 15 && r.body.exames.length === 2 && r.body.edicaoDoAno === null, "a edição (com o mínimo de horas) e os dois exames; sem a edição do ano ainda", r.body.edicoes[0]);
  const futuro = (await edc("exame", { metodo: "POST", corpo: { tipo: "BIENAL", data: `${ano + 1}-11-28` } })).body.exameId;
  r = await edc("resultados-exame", { metodo: "POST", corpo: { exameId: futuro, itens: [{ membroId: P.pastor1, resultado: "APROVADO" }] } });
  ok(r.status === 422 && /ainda não aconteceu/.test(r.body.mensagem), "resultado de um exame que ainda não aconteceu: recusado", r.body);
  await q("DELETE FROM AFMExames WHERE ExameId = @e", { e: futuro });
  r = await edc("pessoa", { token: LIDER(P.lider, ["pessoas"], [CENTRAL]), query: { membroId: P.pastor4 } });
  ok(r.status === 200 && r.body.exames.length === 1 && r.body.exames[0].justificativa === undefined, "o perfil (liderança do território): o exame, sem o texto da justificativa", r.body.exames);
  ok((await edc("pessoa", { token: LIDER(P.lider, ["pessoas"], [CENTRAL]), query: { membroId: P.foraEscopo } })).status === 404, "fora do território: 404");
  r = await edc("minha", { token: MEMBRO(P.pastor4) });
  ok(r.status === 200 && r.body.exames[0].justificativa === "Internado no hospital (e2e)" && r.body.situacao.devendoRepescagem, "a própria pessoa vê a justificativa e a pendência", r.body);
  const trilhaId = await escalar("INSERT INTO Trilhas (Nome) OUTPUT INSERTED.TrilhaId VALUES (N'Curso de Obreiros E2E')");
  await q("INSERT INTO TrilhaMatriculas (TrilhaId, MembroId, Status, ConcluidaEm) VALUES (@t, @m, 'CONCLUIDA', @d)", { t: trilhaId, m: P.pastor2, d: `${ano - 1}-06-20T12:00:00` });
  r = await edc("pessoa", { token: LIDER(P.lider, ["pessoas"], [CENTRAL]), query: { membroId: P.pastor2 } });
  ok(r.body.trilhas.length === 1 && r.body.trilhas[0].trilha === "Curso de Obreiros E2E" && r.body.trilhas[0].concluidaEm === `${ano - 1}-06-20`, "o histórico traz as trilhas de formação concluídas", r.body.trilhas);
  const md = await req("shared/educacaoContinuadaDb.js").dadosDoTitular(pool, P.pastor2);
  ok(md.reciclagens.length === 1 && md.exames.length === 2 && md.pendencias.length === 1, "Meus Dados: as reciclagens, os exames e a pendência", md);

  console.log("== os avisos (antes de vencer) ==");
  const det = req("shared/educacaoContinuadaDb.js");
  ok((await det.detectarReciclagemPendente(pool, { hojeIso: `${ano}-10-15` })).length === 0, "sem a edição do ano registrada, não há o que avisar");
  await edc("edicao", { metodo: "POST", corpo: { data: `${ano}-08-10`, cargaHoraria: 20, frequenciaMinimaPct: 75 } });
  ok((await det.detectarReciclagemPendente(pool, { hojeIso: `${ano}-09-15` })).length === 0, "em setembro, ainda não");
  r = await edc("painel");
  ok(r.body.edicaoDoAno && r.body.edicaoDoAno.ano === ano && r.body.pessoas.filter((p) => p.semAprovacaoNoAno).some((p) => p.membroId === P.pastor1)
    && !r.body.pessoas.some((p) => p.semAprovacaoNoAno && !p.obreiro), "o painel: quem ainda não foi aprovado na reciclagem do ano (só obreiros)", r.body.edicaoDoAno);
  const fatos = await det.detectarReciclagemPendente(pool, { hojeIso: `${ano}-10-15` });
  ok(fatos.length > 2 && fatos.some((f) => f.referenciaId < 0 && /obreiro\(s\) ainda sem aprovação/.test(f.fatoGerador)) && fatos.some((f) => f.destinatarios[0].membroId === P.pastor1),
    "de outubro em diante: cada obreiro sem a reciclagem do ano e a AFM do nível geral (a contagem)", fatos.length);
  const fx = await det.detectarExamePendente(pool, { hojeIso: hoje });
  ok(fx.some((f) => f.destinatarios[0].membroId === P.pastor2) && fx.some((f) => f.destinatarios[0].membroId === P.pastor4) && !fx.some((f) => f.destinatarios[0].membroId === P.pastor3),
    "o exame: quem está sob observação ou devendo a repescagem (não quem já foi aprovado)", fx.map((f) => f.destinatarios[0].membroId));

  if (process.env.E2E_CONTRATO) {
    const contrato = { painel: (await edc("painel")).body, edicao: (await edc("edicao", { query: { edicaoId } })).body, exame: (await edc("exame", { query: { exameId: bienal } })).body,
      pessoa: (await edc("pessoa", { token: LIDER(P.lider, ["pessoas"], [CENTRAL]), query: { membroId: P.pastor2 } })).body, minha: (await edc("minha", { token: MEMBRO(P.pastor4) })).body,
      minhaVazia: (await edc("minha", { token: MEMBRO(P.candidato) })).body };
    require("fs").mkdirSync(path.join(__dirname, "..", "front-educacao"), { recursive: true });
    require("fs").writeFileSync(path.join(__dirname, "..", "front-educacao", "contrato-real.json"), JSON.stringify(contrato, null, 2));
    console.log("contrato gravado em tools/front-educacao/contrato-real.json");
  }

  console.log("== a retenção da justificativa (pode citar saúde) ==");
  const antigo = await escalar("INSERT INTO AFMExames (Tipo, DataExame) OUTPUT INSERTED.ExameId VALUES ('BIENAL', @d)", { d: `${ano - 3}-11-29` });
  await q("INSERT INTO AFMExameResultados (ExameId, MembroId, Resultado, Justificativa) VALUES (@e, @m, 'AUSENTE_JUSTIFICADO', N'Cirurgia (e2e)')", { e: antigo, m: P.pastor1 });
  const ret = await det.aplicarRetencao(pool);
  ok(ret.justificativasApagadas >= 1 && (await escalar("SELECT Justificativa FROM AFMExameResultados WHERE ExameId = @e", { e: antigo })) === det.MARCA_APAGADA, "2 anos depois do exame: o texto sai (o resultado fica)", ret);
  ok((await escalar("SELECT Justificativa FROM AFMExameResultados WHERE ExameId = @e AND MembroId = @m", { e: bienal, m: P.pastor4 })) === "Internado no hospital (e2e)", "a recente fica");
  await det.aplicarRetencao(pool, { membroId: P.pastor4 });
  ok((await escalar("SELECT Justificativa FROM AFMExameResultados WHERE ExameId = @e AND MembroId = @m", { e: bienal, m: P.pastor4 })) === det.MARCA_APAGADA, "a exclusão LGPD apaga a da pessoa na hora");
  const rot = await req("shared/afmDb.js").rotinaDiaria(pool);
  ok(!rot.falhas.includes("retencaoExame"), "a rotina diária da AFM roda a retenção", rot);

  console.log("== lixo ==");
  const quebras = [];
  for (const lixo of [null, 1, "x", [], {}, true, "' OR 1=1 --", "<script>", "A".repeat(5000), -1, 1e20, "2026-02-30"]) {
    for (const [acao, base] of [["edicao", { data: `${ano}-08-10`, cargaHoraria: 20, frequenciaMinimaPct: 75 }], ["exame", { tipo: "REPESCAGEM", data: `${ano}-03-10`, exameOrigemId: bienal }],
      ["resultados-reciclagem", { edicaoId, itens: [{ membroId: P.pastor1, resultado: "APROVADO", horasPresentes: 18 }] }], ["resultados-exame", { exameId: bienal, itens: [{ membroId: P.pastor1, resultado: "APROVADO" }] }]]) {
      for (const campo of Object.keys(base)) {
        const r2 = await edc(acao, { metodo: "POST", corpo: { ...base, [campo]: lixo } });
        if (r2.status >= 500 || /SQL|RequestError|undefined/.test(JSON.stringify(r2.body))) quebras.push([acao, campo, String(lixo).slice(0, 20), r2.status]);
      }
      const r3 = await edc(acao, { metodo: "POST", corpo: { ...base, itens: [{ membroId: P.pastor1, resultado: lixo, horasPresentes: lixo, justificativa: lixo }] } });
      if (r3.status >= 500) quebras.push([acao, "itens", String(lixo).slice(0, 20), r3.status]);
    }
    for (const acao of ["edicao", "exame", "pessoa"]) { const r4 = await edc(acao, { query: { edicaoId: lixo, exameId: lixo, membroId: lixo } }); if (r4.status >= 500) quebras.push([acao, String(lixo).slice(0, 20), r4.status]); }
  }
  ok(quebras.length === 0, "lixo em todo campo: nenhuma 500 nem texto interno", quebras.slice(0, 5));
  ok((await edc("resultados-reciclagem", { metodo: "POST", corpo: { edicaoId, itens: Array.from({ length: 501 }, () => ({ membroId: P.pastor1, resultado: "APROVADO", horasPresentes: 18 })) } })).status === 400, "mais de 500 de uma vez: 400");
  ok((await edc("inventada")).status === 404, "ação desconhecida: 404");

  fim("e2e-64 educação continuada");
})().catch((e) => { console.log("ERRO", e); process.exit(1); });
