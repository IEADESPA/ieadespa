// e2e-7-setup.js — v7.7 (Ministério com menores): as garantias da migração 143 e o cenário dos roteiros e2e-8 a e2e-10, sobre a base do e2e-1 (cenario).
// Cada voluntário abaixo representa UMA situação da regra; os roteiros seguintes só mexem neles pelos handlers reais.
const fs = require("fs");
const crypto = require("crypto");
const L = require("./lib");
const { q, um, escalar, ok, fim, GET, POST, GERAL, LIDER, PIN, API, path, obterPool } = L;
const V = require(path.join(API, "GestaoVistoriasAntecedentes/index.js"));
const mm = require(path.join(API, "shared/ministerioMenores.js"));
const cen = JSON.parse(fs.readFileSync(path.join(__dirname, "cenario.json"), "utf8"));
const hoje = L.hojeBr();
const TUDO = ["setores_tecnicos", "setores_ratificacao", "vistoria_antecedentes"];
const presidente = GERAL(1001, TUDO);
const hash = (t) => crypto.createHash("sha256").update(t).digest("hex");
const falha = async (texto, params) => { try { await q(texto, params); return null; } catch (e) { return String(e.message || e); } };

(async () => {
  console.log("== migração 143: esquema, prazos, regras de aviso, retenção ==");
  for (const t of ["MinisterioMenoresSalas", "MinisterioMenoresPoliticaAceites", "MinisterioMenoresConsentimentos", "MinisterioMenoresAutoDenuncias", "MinisterioMenoresRetiradas", "MinisterioMenoresCadastroNacional"]) {
    ok((await escalar("SELECT COUNT(*) FROM sys.tables WHERE name = @t", { t })) === 1, `tabela ${t} existe`);
  }
  for (const [tab, col] of [["EscalasEquipes", "FaixaEtariaMenores"], ["VoluntariosHabilitacao", "FichaAtualizadaEm"], ["CanaisOficiaisComunicacao", "ResponsavelAcessoMembroId"], ["MinisterioMenoresAutoDenuncias", "LiberadoEm"]]) {
    ok((await escalar("SELECT COUNT(*) FROM sys.columns WHERE object_id = OBJECT_ID(@t) AND name = @c", { t: "dbo." + tab, c: col })) === 1, `coluna ${tab}.${col} existe`);
  }
  ok((await escalar("SELECT COUNT(*) FROM Prazos WHERE Sigla LIKE 'MENORES[_]%' OR Sigla IN ('HABILITACAO_ANTECEDENTES_DIAS','HABILITACAO_TREINAMENTO_DIAS','HABILITACAO_FICHA_DIAS')")) === 11, "11 prazos novos");
  ok((await escalar("SELECT COUNT(*) FROM NotificacaoRegras WHERE Chave LIKE 'MENORES[_]%'")) === 11, "11 regras de aviso");
  ok((await escalar("SELECT COUNT(*) FROM NotificacaoRegras WHERE Chave LIKE 'MENORES[_]%' AND Obrigatoria = 1")) === 10, "10 regras obrigatórias (todas, menos o aviso mensal das certidões a renovar)");
  ok((await escalar("SELECT COUNT(*) FROM PoliticasRetencao WHERE Categoria IN (N'Ministério com menores: aceites, consentimentos, retiradas', N'Auto-denúncia de inquérito ou processo (Art. 133 §5º, V)')")) === 2, "2 políticas de retenção");
  ok((await escalar("SELECT COUNT(*) FROM sys.indexes WHERE name = 'UX_MenoresAutoDen_SemDecisao'")) === 1, "índice único: uma comunicação sem decisão por pessoa");
  // idempotência: reaplicar a 143 sobre o banco já migrado não duplica nada
  const sqlTexto = fs.readFileSync(path.join(API, "../sql/migrations/143_ministerio_menores.sql"), "utf8");
  const pool = await obterPool();
  for (let i = 0; i < 2; i++) for (const lote of sqlTexto.split(/^\s*GO\s*$/gim).map((t) => t.trim()).filter(Boolean)) await pool.request().query(lote);
  ok((await escalar("SELECT COUNT(*) FROM NotificacaoRegras WHERE Chave LIKE 'MENORES[_]%'")) === 11, "reaplicar duas vezes não duplica as regras de aviso");
  ok((await escalar("SELECT COUNT(*) FROM Prazos WHERE Sigla LIKE 'MENORES[_]%'")) === 8, "reaplicar não duplica os prazos");
  ok((await escalar("SELECT COUNT(*) FROM PoliticasRetencao WHERE Categoria LIKE N'Ministério com menores%' OR Categoria LIKE N'Auto-denúncia%'")) === 2, "reaplicar não duplica a retenção");

  console.log("== o cenário: equipes e voluntários, cada um numa situação ==");
  const c1 = cen.cong.central.id, c2 = cen.cong.vila.id;
  const pessoas = [
    // [id, nome, nascimento, admissão, congregação]
    [6001, "Lider Maria M7", "1980-03-03", "2015-01-01", c1], [6002, "Lider Jorge M7", "1979-03-03", "2015-01-01", c1], [6003, "Lider Rita M7", "1981-03-03", "2015-01-01", c2],
    [6010, "Ana Apta M7", "1990-01-01", "2016-01-01", c1], [6011, "Bruno Apto M7", "1991-01-01", "2016-01-01", c1], [6012, "Carla Apta M7", "1992-01-01", "2016-01-01", c1],
    [6013, "Davi Certidao Vencida M7", "1985-01-01", "2016-01-01", c1], [6014, "Elisa Sem Treino M7", "1986-01-01", "2016-01-01", c1], [6015, "Fabio Sem Politica M7", "1987-01-01", "2016-01-01", c1],
    [6016, "Gabi Ficha Antiga M7", "1988-01-01", "2016-01-01", c1], [6017, "Hugo Recente M7", "1989-01-01", hoje.slice(0, 4) + "-08-01", c1], [6018, "Iara Sem Vistoria M7", "1990-06-01", "2016-01-01", c1],
    [6019, "Jonas Com Restricao M7", "1984-01-01", "2016-01-01", c1], [6020, "Karen Adolescente M7", "2010-03-01", "2022-01-01", c1], [6021, "Lucas Sem Nascimento M7", null, "2016-01-01", c1],
    [6022, "Marta Autodenuncia M7", "1983-01-01", "2016-01-01", c1], [6023, "Nilo Vila M7", "1990-02-02", "2016-01-01", c2], [6024, "Olga Apta M7", "1993-01-01", "2016-01-01", c1],
    [6025, "Paulo Esteira Real M7", "1987-07-07", "2016-01-01", c1], [6026, "Quiteria Apta Vila M7", "1992-02-02", "2016-01-01", c2], [6027, "Renato Sem Comunhao M7", "1985-05-05", "2016-01-01", c1]
  ];
  for (const [id, nome, nasc, adm, c] of pessoas) {
    await q("INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, DataAdmissao, Email) VALUES (@id, @n, @c, 'ATIVO', @si, @nasc, @adm, @em)",
      { id, n: nome, c, si: id === 6027 ? "SEM_COMUNHAO" : "EM_COMUNHAO", nasc: nasc ? new Date(`${nasc}T00:00:00Z`) : null, adm: new Date(`${adm}T00:00:00Z`), em: `p${id}@exemplo.org` });
  }
  await q("UPDATE MembroReferencia SET DataNascimento = NULL WHERE MembroId = 6021");
  const equipe = async (nome, cong, lider, menores, faixa) => (await q("INSERT INTO EscalasEquipes (Nome, CongregacaoId, LiderMembroId, ContatoComMenores, FaixaEtariaMenores) VALUES (@n, @c, @l, @m, @f); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id",
    { n: nome, c: cong, l: lider, m: menores ? 1 : 0, f: faixa || null }))[0].id;
  const eq = {
    bercario: await equipe("Bercario M7", c1, 6001, true, "BERCARIO"), maternal: await equipe("Maternal M7", c1, 6001, true, "MATERNAL"),
    recepcao: await equipe("Recepcao M7", c1, 6002, false, null), infantilVila: await equipe("Infantil Vila M7", c2, 6003, true, "INFANTIL"),
    novaSemMarca: await equipe("Equipe Futura M7", c1, 6002, false, null)
  };
  const noEquipe = (e, m) => q("INSERT INTO EscalasEquipeMembros (EquipeId, MembroId) VALUES (@e, @m)", { e, m });
  for (const m of [6010, 6011, 6012, 6013, 6014, 6015, 6016, 6017, 6018, 6019, 6020, 6021, 6022, 6024, 6025, 6027]) { await noEquipe(eq.bercario, m); await noEquipe(eq.maternal, m); }
  for (const m of [6010, 6011, 6013, 6024]) await noEquipe(eq.recepcao, m);       // a equipe SEM menores: todos passam, apto ou não
  for (const m of [6023, 6026]) await noEquipe(eq.infantilVila, m);
  for (const m of [6001, 6002]) await noEquipe(eq.maternal, m);

  // Habilitação (a esteira da v5.7), pronta por SQL — o roteiro e2e-8 testa o caminho pelos handlers com a pessoa 6025.
  const etapas = "EtapaFichaInscricaoEm, EtapaReferenciasEm, EtapaEntrevistaEm, EtapaAntecedentesEm, EtapaTreinamentoEm, EtapaTermoAssinadoEm";
  const habilitar = (id, cong, extra = {}) => q(`INSERT INTO VoluntariosHabilitacao (MembroId, CongregacaoId, ${etapas}, Status, AptoDesde, AptoValidoAte, FichaAtualizadaEm)
    VALUES (@m, @c, @f, @f, @f, @f, @t, @f, 'APTO', @f, @v, @fa)`, { m: id, c: cong, f: new Date(Date.now() - 200 * 86400000), t: extra.treino === undefined ? new Date(Date.now() - 100 * 86400000) : extra.treino, v: new Date(Date.now() + 500 * 86400000), fa: extra.ficha === undefined ? new Date(Date.now() - 30 * 86400000) : extra.ficha });
  for (const id of [6001, 6002, 6010, 6011, 6012, 6013, 6015, 6016, 6017, 6019, 6020, 6022, 6024, 6027, 6021]) await habilitar(id, c1, id === 6016 ? { ficha: new Date(Date.now() - 400 * 86400000) } : {});
  await habilitar(6003, c2); await habilitar(6023, c2); await habilitar(6026, c2);
  await habilitar(6014, c1, { treino: null });      // sem a etapa de treinamento carimbada
  await q("UPDATE VoluntariosHabilitacao SET EtapaTreinamentoEm = NULL, Status = 'PENDENTE' WHERE MembroId = 6014");
  await q("UPDATE VoluntariosHabilitacao SET EtapaFichaInscricaoEm = DATEADD(DAY, -400, SYSUTCDATETIME()) WHERE MembroId = 6016");

  // Política aceita (a versão vigente) por quase todos; 6015 nunca aceitou.
  for (const id of [6001, 6002, 6003, 6010, 6011, 6012, 6013, 6014, 6016, 6017, 6019, 6020, 6021, 6022, 6023, 6024, 6026, 6027]) {
    await q("INSERT INTO MinisterioMenoresPoliticaAceites (MembroId, Versao, TextoHash, Forma, EnderecoIp) VALUES (@m, @v, @h, 'CLICKWRAP', N'177.8.9.10')", { m: id, v: mm.POLITICA_VERSAO, h: mm.POLITICA_HASH });
  }

  // Termos de Vistoria pelo handler real (a Diretoria lavra): em dia para quase todos; vencido para 6013; com restrição para 6019; só uma certidão para 6024? (não: 6024 é apta)
  const doc = (tipo, dias, rotulo) => ({ tipo, hash: hash(`${rotulo}`), dataEmissao: new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10) });
  const lavrar = async (membroId, extra, dias = 20) => {
    const r = await POST(V, "lavrar", presidente, { membroId, motivo: "INVESTIDURA", funcao: "Ministério infantil", comVulneraveis: true, dataVerificacao: hoje, resultado: "SEM_RESTRICAO", parecer: "Certidões sem apontamentos; apto à função.",
      destinoOriginal: "DEVOLVIDO", documentos: [doc("ANTECEDENTES_FEDERAL", dias, `fed${membroId}`), doc("ANTECEDENTES_ESTADUAL", dias, `est${membroId}`)], ...extra });
    if (r.status !== 201) throw new Error(`lavrar ${membroId}: ${JSON.stringify(r.body)}`);
  };
  for (const id of [6001, 6002, 6003, 6010, 6011, 6012, 6014, 6015, 6016, 6017, 6020, 6021, 6022, 6023, 6024, 6026, 6027]) await lavrar(id, {});
  await lavrar(6013, { documentos: [doc("ANTECEDENTES_FEDERAL", 400, "fed6013"), doc("ANTECEDENTES_ESTADUAL", 400, "est6013")] });
  await lavrar(6019, { resultado: "COM_RESTRICAO", parecer: "Há um apontamento que a Diretoria precisa tratar com a pessoa.", documentos: [doc("ANTECEDENTES_FEDERAL", 20, "fed6019"), doc("ANTECEDENTES_ESTADUAL", 20, "est6019")] });
  ok((await escalar("SELECT COUNT(*) FROM VistoriasAntecedentes WHERE MembroId BETWEEN 6001 AND 6027")) === 19, "19 termos de vistoria lavrados pelo handler real");

  fs.writeFileSync(path.join(__dirname, "cenario-menores.json"), JSON.stringify({ eq, c1, c2 }, null, 1));
  console.log("cenário da v7.7 gravado:", JSON.stringify(eq));

  console.log("== gatilhos e CHECK da 143 ==");
  const idPol = await escalar("SELECT TOP 1 AceiteId FROM MinisterioMenoresPoliticaAceites WHERE MembroId = 6010");
  let m = await falha("UPDATE MinisterioMenoresPoliticaAceites SET Versao = 9 WHERE AceiteId = @i", { i: idPol }); ok(m && /prova documental/.test(m), "o aceite da política não se altera", m);
  m = await falha("DELETE FROM MinisterioMenoresPoliticaAceites WHERE AceiteId = @i", { i: idPol }); ok(m && /prova documental/.test(m), "o aceite da política não se apaga", m);
  m = await falha("UPDATE MinisterioMenoresPoliticaAceites SET EnderecoIp = N'anonimizado', CadeiaCabecalhos = NULL WHERE AceiteId = @i", { i: idPol }); ok(m === null, "mas o IP pode ser anonimizado (LGPD art. 16)", m);
  m = await falha("UPDATE MinisterioMenoresPoliticaAceites SET EnderecoIp = N'1.2.3.4' WHERE AceiteId = @i", { i: idPol }); ok(m && /prova documental/.test(m), "e não se troca por outro IP", m);
  m = await falha("INSERT INTO MinisterioMenoresPoliticaAceites (MembroId, Versao, TextoHash, Forma) VALUES (6010, 1, @h, 'CLICKWRAP')", { h: mm.POLITICA_HASH }); ok(m && /UQ_MenoresPolitica_MembroVersao|CK_MenoresPolitica_Click/.test(m), "um aceite por versão; clickwrap exige IP", m);
  m = await falha("INSERT INTO MinisterioMenoresPoliticaAceites (MembroId, Versao, TextoHash, Forma, Referencia, RegistradoPorMembroId) VALUES (6012, 2, @h, 'FICHA_FISICA', N'pasta', 6012)", { h: mm.POLITICA_HASH }); ok(m && /CK_MenoresPolitica_Ficha/.test(m), "ficha registrada pela própria pessoa é recusada pelo banco", m);

  await q("INSERT INTO MinisterioMenoresConsentimentos (MenorMembroId, ResponsavelMembroId, Finalidade, Concedido, TextoVersao, TextoHash, Forma, EnderecoIp) VALUES (6020, 6001, 'IMAGEM', 1, 1, @h, 'CLICK_RESP', N'177.8.9.10')", { h: hash("t") });
  const idCons = await escalar("SELECT MAX(ConsentimentoId) FROM MinisterioMenoresConsentimentos");
  m = await falha("UPDATE MinisterioMenoresConsentimentos SET Concedido = 0 WHERE ConsentimentoId = @i", { i: idCons }); ok(m && /prova documental/.test(m), "o consentimento não se altera (para revogar, grava-se outra linha)", m);
  m = await falha("DELETE FROM MinisterioMenoresConsentimentos WHERE ConsentimentoId = @i", { i: idCons }); ok(m && /prova documental/.test(m), "o consentimento não se apaga", m);
  m = await falha("INSERT INTO MinisterioMenoresConsentimentos (MenorMembroId, ResponsavelMembroId, Finalidade, Concedido, TextoVersao, TextoHash, Forma, EnderecoIp) VALUES (6020, 6020, 'IMAGEM', 1, 1, @h, 'CLICK_RESP', N'1.1.1.1')", { h: hash("t") }); ok(m && /CK_MenoresConsent_NaoSiMesmo/.test(m), "ninguém consente por si como responsável", m);
  m = await falha("INSERT INTO MinisterioMenoresConsentimentos (MenorMembroId, ResponsavelMembroId, Finalidade, Concedido, TextoVersao, TextoHash, Forma) VALUES (6020, 6001, 'IMAGEM', 1, 1, @h, 'CLICK_RESP')", { h: hash("t") }); ok(m && /CK_MenoresConsent_Click/.test(m), "o aceite digital sem IP é recusado", m);
  m = await falha("INSERT INTO MinisterioMenoresConsentimentos (MenorMembroId, ResponsavelMembroId, Finalidade, Concedido, TextoVersao, TextoHash, Forma, EnderecoIp) VALUES (6020, 6001, 'OUTRA', 1, 1, @h, 'CLICK_RESP', N'1.1.1.1')", { h: hash("t") }); ok(m && /CK_MenoresConsent_Finalidade/.test(m), "finalidade fora da lista é recusada", m);

  await q("INSERT INTO MinisterioMenoresAutoDenuncias (MembroId, Tipo, DataCiencia) VALUES (6022, 'INQUERITO_POLICIAL', '2026-09-01')");
  const idAuto = await escalar("SELECT MAX(AutoDenunciaId) FROM MinisterioMenoresAutoDenuncias");
  m = await falha("INSERT INTO MinisterioMenoresAutoDenuncias (MembroId, Tipo, DataCiencia) VALUES (6022, 'PROCESSO_CRIMINAL', '2026-09-02')"); ok(m && /UX_MenoresAutoDen_SemDecisao/.test(m), "duas comunicações sem decisão da mesma pessoa: o índice único recusa", m);
  m = await falha("INSERT INTO MinisterioMenoresAutoDenuncias (MembroId, Tipo, DataCiencia) VALUES (6021, 'TALVEZ', '2026-09-02')"); ok(m && /CK_MenoresAutoDen_Tipo/.test(m), "tipo fora da lista é recusado", m);
  m = await falha("UPDATE MinisterioMenoresAutoDenuncias SET Tipo = 'PROCESSO_CRIMINAL' WHERE AutoDenunciaId = @i", { i: idAuto }); ok(m && /registro documental/.test(m), "o tipo declarado não se altera", m);
  m = await falha("UPDATE MinisterioMenoresAutoDenuncias SET Decisao = 'MANTIDO' WHERE AutoDenunciaId = @i", { i: idAuto }); ok(m && /CK_MenoresAutoDen_DecisaoCompleta/.test(m), "decisão sem quem decidiu é recusada", m);
  m = await falha("UPDATE MinisterioMenoresAutoDenuncias SET Decisao = 'MANTIDO', DecididaPorMembroId = 6022, DecididaEm = SYSUTCDATETIME() WHERE AutoDenunciaId = @i", { i: idAuto }); ok(m && /CK_MenoresAutoDen_NaoDecideSi/.test(m), "ninguém decide a própria comunicação (banco)", m);
  m = await falha("UPDATE MinisterioMenoresAutoDenuncias SET LiberadoEm = SYSUTCDATETIME(), LiberadoPorMembroId = 1001 WHERE AutoDenunciaId = @i", { i: idAuto }); ok(m && /CK_MenoresAutoDen_Liberacao|registro documental/.test(m), "não se libera quem não foi afastado", m);
  await q("UPDATE MinisterioMenoresAutoDenuncias SET Decisao = 'AFASTADO_PREVENTIVAMENTE', DecididaPorMembroId = 1001, DecididaEm = SYSUTCDATETIME(), DecisaoObservacao = N'Afastado por cautela.' WHERE AutoDenunciaId = @i", { i: idAuto });
  m = await falha("UPDATE MinisterioMenoresAutoDenuncias SET Decisao = 'MANTIDO' WHERE AutoDenunciaId = @i", { i: idAuto }); ok(m && /registro documental/.test(m), "a decisão entra uma única vez", m);
  await q("UPDATE MinisterioMenoresAutoDenuncias SET LiberadoEm = SYSUTCDATETIME(), LiberadoPorMembroId = 1001, LiberacaoObservacao = N'Arquivado.' WHERE AutoDenunciaId = @i", { i: idAuto });
  m = await falha("UPDATE MinisterioMenoresAutoDenuncias SET LiberacaoObservacao = N'outra' WHERE AutoDenunciaId = @i", { i: idAuto }); ok(m && /registro documental/.test(m), "a liberação também entra uma única vez", m);
  m = await falha("DELETE FROM MinisterioMenoresAutoDenuncias WHERE AutoDenunciaId = @i", { i: idAuto }); ok(m && /registro documental/.test(m), "a comunicação não se apaga", m);

  await q("INSERT INTO MinisterioMenoresRetiradas (MembroId, EquipeId, Motivos, AlocacoesCanceladas) VALUES (6010, @e, N'TESTE', 1)", { e: eq.bercario });
  const idRet = await escalar("SELECT MAX(RetiradaId) FROM MinisterioMenoresRetiradas");
  m = await falha("UPDATE MinisterioMenoresRetiradas SET AlocacoesCanceladas = 9 WHERE RetiradaId = @i", { i: idRet }); ok(m && /histórico/.test(m), "a retirada registrada não se altera", m);
  m = await falha("DELETE FROM MinisterioMenoresRetiradas WHERE RetiradaId = @i", { i: idRet }); ok(m && /histórico/.test(m), "nem se apaga", m);
  m = await falha("INSERT INTO MinisterioMenoresRetiradas (MembroId, EquipeId, Motivos, AlocacoesCanceladas) VALUES (6010, @e, N'X', 0)", { e: eq.bercario }); ok(m && /CK_MenoresRetiradas_N/.test(m), "retirada de zero escalas é recusada", m);
  await q("INSERT INTO MinisterioMenoresCadastroNacional (MembroId, Fonte, Resultado) VALUES (6010, N'TESTE', 'NADA_CONSTA')");
  m = await falha("UPDATE MinisterioMenoresCadastroNacional SET Resultado = 'CONSTA' WHERE MembroId = 6010"); ok(m && /histórico/.test(m), "a consulta ao cadastro nacional não se altera", m);
  m = await falha("INSERT INTO MinisterioMenoresSalas (ServicoId, EquipeId, CriancasPrevistas, DefinidoPorMembroId) VALUES (999999, @e, 5, 1001)", { e: eq.bercario }); ok(m && /FOREIGN KEY/.test(m), "sala de serviço que não existe é recusada", m);
  m = await falha("UPDATE EscalasEquipes SET FaixaEtariaMenores = 'ADULTOS' WHERE EquipeId = @e", { e: eq.bercario }); ok(m && /CK_EscalasEquipes_FaixaMenores/.test(m), "faixa etária fora da lista é recusada", m);

  // limpa as linhas de teste dos gatilhos para os roteiros seguintes partirem do cenário limpo
  await q("DELETE FROM MinisterioMenoresCadastroNacional WHERE Fonte = N'TESTE'").catch(() => { });
  fim("e2e-7-setup");
})().catch((e) => { console.error("ERRO:", e); process.exitCode = 1; try { require("./lib").shimEncerrar(); } catch { } });
