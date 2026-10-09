// e2e-12-revisao-lote2.js — v7.7, segunda leva de correções da revisão adversarial, ponta a ponta (handlers REAIS, SQL Server real):
//  - vistoria com restrição e termo anulado tiram a pessoa das escalas com menores NA HORA;
//  - em sala com menores, adulto só troca com adulto;
//  - a foto de menor sem autorização vigente do responsável é apagada pela faxina (e a do responsável que saiu, no ato);
//  - ninguém reabilita a si mesmo; desligar a marca de menores pede a confirmação reforçada (428);
//  - canal que inclui menores não vai para o site;
//  - o detalhe do serviço só mostra as salas com menores a quem administra escalas ou lidera equipe.
// Parte da base "cenario-menores": BASE=cenario-menores bash rodar.sh roteiro e2e-12-revisao-lote2.js
const fs = require("fs");
const crypto = require("crypto");
const L = require("./lib");
const { q, escalar, ok, fim, GET, POST, GERAL, LIDER, PIN, sessao, IP_PUBLICO, API, path, obterPool } = L;
const E = require(path.join(API, "GestaoEscalas/index.js"));
const M = require(path.join(API, "GestaoMinisterioMenores/index.js"));
const HAB = require(path.join(API, "GestaoHabilitacaoVoluntarios/index.js"));
const V = require(path.join(API, "GestaoVistoriasAntecedentes/index.js"));
const VOL = require(path.join(API, "GestaoVoluntariado/index.js"));
const C = require(path.join(API, "GestaoConsentimentoMenor/index.js"));
const CAN = require(path.join(API, "GestaoCanais/index.js"));
const cDb = require(path.join(API, "shared/menoresConsentimentoDb.js"));
const canaisDb = require(path.join(API, "shared/canaisDb.js"));
const { eq, c1 } = JSON.parse(fs.readFileSync(path.join(__dirname, "cenario-menores.json"), "utf8"));
const hoje = L.hojeBr();
const TUDO = ["setores_tecnicos", "setores_ratificacao", "vistoria_antecedentes"];
const presidente = GERAL(1001, TUDO);
const secretaria = LIDER(3001, ["habilitacao_voluntarios", "escalas", "reunioes", "pessoas"], ["Central E2E"]);
const diretoriaHab = GERAL(1001, [...TUDO, "habilitacao_voluntarios", "escalas"]);
const semFatorHab = sessao(1001, { via: "SENHA", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["habilitacao_voluntarios"] });
const gestaoCanais = GERAL(1001, ["canais_gestao", "setores_tecnicos", "setores_ratificacao", "vistoria_antecedentes"]);
const dias = (n) => new Date(Date.now() + n * 86400000);
const diaIso = (n) => dias(n).toISOString().slice(0, 10);
const hash = (t) => crypto.createHash("sha256").update(t).digest("hex");
const doc = (tipo, d, t) => ({ tipo, hash: hash(t), dataEmissao: diaIso(-d) });
const lav = (membroId, extra = {}) => POST(V, "lavrar", presidente, { membroId, motivo: "INVESTIDURA", funcao: "Ministério infantil", comVulneraveis: true, dataVerificacao: hoje, resultado: "SEM_RESTRICAO", parecer: "Certidões sem apontamentos; apto.", destinoOriginal: "DEVOLVIDO",
  documentos: [doc("ANTECEDENTES_FEDERAL", 5, `f${membroId}${Math.random()}`), doc("ANTECEDENTES_ESTADUAL", 5, `e${membroId}${Math.random()}`)], ...extra });
const aloca = (servico, equipe, membro, status = "CONVIDADO") => q("INSERT INTO EscalasAlocacoes (ServicoId, EquipeId, MembroId, Status) VALUES (@s, @e, @m, @st)", { s: servico, e: equipe, m: membro, st: status });
const servico = async (dataHora, status = "RASCUNHO", cong = c1, desc = "Culto M7 lote2") => (await q("INSERT INTO EscalasServicos (CongregacaoId, DataHora, Descricao, Status, PublicadaEm) VALUES (@c, @d, @de, @st, CASE WHEN @st = 'PUBLICADA' THEN SYSUTCDATETIME() END); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { c: cong, d: dataHora, de: desc, st: status }))[0].id;
const statusAloc = (servico, membro) => escalar("SELECT Status FROM EscalasAlocacoes WHERE ServicoId = @s AND MembroId = @m", { s: servico, m: membro });

(async () => {
  let r;
  const pool = await obterPool();

  console.log("== o painel da gestão não distingue as pendências reservadas ==");
  r = await POST(M, "auto-denuncia", PIN(6024), { tipo: "INQUERITO_POLICIAL", dataCiencia: hoje, ciente: true }); ok(r.status === 201 || r.status === 200, "6024 comunica um fato à Diretoria (comunicação em análise)", r.body);
  r = await GET(M, "painel", secretaria, { congregacaoId: c1 }); ok(r.status === 200, "a Secretaria abre o painel da congregação", r.status);
  const linha = (corpo, id) => (corpo.voluntarios || []).find((v) => v.membroId === id);
  const gestao6019 = linha(r.body, 6019), gestao6024 = linha(r.body, 6024);
  ok(!!gestao6019 && !!gestao6024, "6019 (restrição) e 6024 (comunicação em análise) estão no painel", [!!gestao6019, !!gestao6024]);
  ok(JSON.stringify(gestao6019.validades.antecedentes) === JSON.stringify(gestao6024.validades.antecedentes) && gestao6019.proximoVencimento === null && gestao6024.proximoVencimento === null, "as duas pendências reservadas têm a MESMA linha das certidões e nenhum próximo vencimento para a gestão", [gestao6019.validades.antecedentes, gestao6024.validades.antecedentes, gestao6019.proximoVencimento, gestao6024.proximoVencimento]);
  ok(gestao6019.validades.antecedentes.situacao === "PENDENCIA_DIRETORIA" && !/RESTRICAO|AUTO_DENUNCIA/.test(JSON.stringify([gestao6019, gestao6024])), "e nada nelas cita restrição nem comunicação", gestao6019);
  r = await GET(M, "painel", diretoriaHab, { congregacaoId: c1 });
  ok(r.status === 200 && linha(r.body, 6019).validades.antecedentes.situacao === "COM_RESTRICAO", "a Diretoria vê o detalhe (restrição nas certidões)", r.status);

  console.log("== vistoria com restrição tira da escala na hora ==");
  const sv1 = await servico(dias(40));
  await aloca(sv1, eq.bercario, 6012, "ACEITO");
  ok((await statusAloc(sv1, 6012)) === "ACEITO", "6012 está escalada (aceitou) no berçário");
  r = await lav(6012, { resultado: "COM_RESTRICAO", parecer: "Há um apontamento que a Diretoria precisa tratar com a pessoa." }); ok(r.status === 201, "a Diretoria lavra uma vistoria COM restrição para 6012", r.body);
  ok((await statusAloc(sv1, 6012)) === "CANCELADA", "a escala foi desmarcada NA HORA, sem esperar a rotina do dia seguinte", await statusAloc(sv1, 6012));
  const rets = await q("SELECT Motivos FROM MinisterioMenoresRetiradas WHERE MembroId = 6012");
  ok(rets.length >= 1, "a retirada ficou registrada", rets);
  r = await lav(6012); ok(r.status === 201, "a Diretoria lavra uma vistoria nova, sem restrição (a última válida decide)", r.body);
  const aud = await q("SELECT DadosDepois FROM AuditLog WHERE Acao = 'MENORES_RETIRADO_DA_ESCALA' ORDER BY AuditId DESC");
  ok(aud.length >= 1 && !/COM_RESTRICAO|ANTECEDENTES/.test(JSON.stringify(aud[0])), "a trilha da retirada não leva o motivo da restrição", aud[0]);

  console.log("== anular o termo que sustentava a habilitação tira da escala na hora ==");
  const sv2 = await servico(dias(41));
  await aloca(sv2, eq.bercario, 6011, "ACEITO");
  const vigentes = await q("SELECT v.VistoriaId FROM VistoriasAntecedentes v WHERE v.MembroId = 6011 AND NOT EXISTS (SELECT 1 FROM VistoriasAnulacoes a WHERE a.VistoriaId = v.VistoriaId) ORDER BY v.VistoriaId DESC");
  ok(vigentes.length === 1, "6011 tem um único termo válido", vigentes);
  r = await POST(V, "anular", presidente, { vistoriaId: vigentes[0].VistoriaId, motivo: "Termo lavrado na matrícula errada (teste do lote 2)." }); ok(r.status === 200, "a Diretoria anula o termo", r.body);
  ok((await statusAloc(sv2, 6011)) === "CANCELADA", "sem termo válido, a escala com menores foi desmarcada NA HORA", await statusAloc(sv2, 6011));
  r = await lav(6011); ok(r.status === 201, "a Diretoria lavra o termo certo", r.body);

  console.log("== troca em sala com menores: adulto só troca com adulto ==");
  const adolescente = (await q("SELECT TOP 1 MembroId FROM MembroReferencia WHERE MembroId IN (6020, 6022) AND DataNascimento > DATEADD(YEAR, -18, CAST(SYSUTCDATETIME() AS DATE)) ORDER BY MembroId"))[0];
  if (!adolescente) console.log("  (cenário sem adolescente apto: etapa da troca ignorada)");
  else {
    // a adolescente precisa de adesão válida (autorização da mãe cadastrada) para chegar à regra das trocas: sem ela a recusa é outra, mais antiga
    r = await POST(VOL, "responsavel", secretaria, { menorId: adolescente.MembroId, responsavelId: 6001, vinculo: "MAE", documento: "Certidão de nascimento conferida" }); ok(r.status === 201 || r.status === 200, "a Secretaria designa a mãe da adolescente", r.body);
    await q("INSERT INTO VoluntariadoAdesoes (MembroId, Forma, TermoVersao, TermoHash, DataAceite, AceitoEm, EnderecoIp, ResponsavelMembroId, ResponsavelNome, ResponsavelVinculo) VALUES (@m, 'CLICK_RESP', 1, @h, CAST(SYSUTCDATETIME() AS DATE), SYSUTCDATETIME(), N'177.8.9.10', 6001, N'Maria M7', N'MAE')", { m: adolescente.MembroId, h: hash("termo-menor") });
    const sv3 = await servico(dias(42));
    await aloca(sv3, eq.maternal, 6010, "ACEITO");
    const alocT = await escalar("SELECT AlocacaoId FROM EscalasAlocacoes WHERE ServicoId = @s AND MembroId = 6010", { s: sv3 });
    r = await POST(E, "trocas", PIN(6010), { alocacaoOrigemId: alocT, membroDestinoId: adolescente.MembroId });
    ok(r.status === 422 && /só troca com outro adulto/.test(r.body.mensagem) && !/vencid|antecedentes|restri/i.test(r.body.mensagem), "adulto → adolescente: recusado, sem citar motivo de habilitação", r.body);
    r = await POST(E, "trocas", PIN(6010), { alocacaoOrigemId: alocT, membroDestinoId: 6012 }); ok(r.status === 201, "adulto → adulto habilitado: vale", r.body);
  }

  console.log("== a foto de menor sem autorização do responsável ==");
  await q("INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, DataAdmissao, Email) VALUES (6040, N'Menor Foto M7', @c, 'ATIVO', 'EM_COMUNHAO', '2012-05-05', '2020-01-01', N'p6040@exemplo.org')", { c: c1 });
  await q("INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, DataAdmissao, Email, FotoUrl) VALUES (6041, N'Menor Foto Sem Consent M7', @c, 'ATIVO', 'EM_COMUNHAO', '2013-05-05', '2020-01-01', N'p6041@exemplo.org', N'https://exemplo.invalid/fotos/6041.jpg')", { c: c1 });
  await q("UPDATE MembroReferencia SET FotoUrl = N'https://exemplo.invalid/fotos/6040.jpg' WHERE MembroId = 6040");
  await q("UPDATE MembroReferencia SET FotoUrl = N'https://exemplo.invalid/fotos/6010.jpg' WHERE MembroId = 6010");
  r = await POST(VOL, "responsavel", secretaria, { menorId: 6040, responsavelId: 6001, vinculo: "MAE", documento: "Certidão de nascimento conferida" }); ok(r.status === 201 || r.status === 200, "a Secretaria designa a mãe do 6040", r.body);
  r = await GET(C, "textos", PIN(6001)); const hashImagem = r.body.textos.find((t) => t.finalidade === "IMAGEM").hash;
  r = await POST(C, "conceder", PIN(6001), { menorId: 6040, finalidade: "IMAGEM", aceito: true, termoHash: hashImagem }, IP_PUBLICO); ok(r.status === 200 || r.status === 201, "a mãe autoriza a imagem", r.body);
  let fx = await cDb.apagarFotosDeMenoresSemConsentimento(pool);
  ok(fx.apagadas === 1, "a faxina apaga só a foto do menor SEM autorização (6041)", fx);
  ok((await escalar("SELECT FotoUrl FROM MembroReferencia WHERE MembroId = 6041")) === null, "a foto do 6041 saiu do cadastro");
  ok((await escalar("SELECT FotoUrl FROM MembroReferencia WHERE MembroId = 6040")) !== null, "a foto do 6040, autorizada pela mãe, fica");
  ok((await escalar("SELECT FotoUrl FROM MembroReferencia WHERE MembroId = 6010")) !== null, "a foto do adulto nunca é tocada");
  fx = await cDb.apagarFotosDeMenoresSemConsentimento(pool);
  ok(fx.apagadas === 0, "rodar de novo não apaga nada (idempotente)", fx);
  const resps = await q("SELECT ResponsavelId FROM VoluntariadoResponsaveis WHERE MenorMembroId = 6040 AND ResponsavelMembroId = 6001 AND RevogadoEm IS NULL");
  r = await POST(VOL, "responsavel-revogar", secretaria, { responsavelId: resps[0].ResponsavelId }); ok(r.status === 200, "a Secretaria revoga a designação da mãe", r.body);
  ok((await escalar("SELECT FotoUrl FROM MembroReferencia WHERE MembroId = 6040")) === null, "a foto do 6040 saiu NO ATO em que a mãe deixou de ser responsável");

  console.log("== ninguém reabilita a si mesmo; desligar a marca de menores pede a confirmação reforçada ==");
  const hab6001 = await escalar("SELECT HabilitacaoId FROM VoluntariosHabilitacao WHERE MembroId = 6001");
  r = await POST(HAB, "marcar-inapto", secretaria, { habilitacaoId: hab6001, motivo: "Afastada para o teste do lote 2." }); ok(r.status === 200, "a Secretaria marca a 6001 como inapta", r.body);
  const dela = LIDER(6001, ["habilitacao_voluntarios"], ["Central E2E"]);
  r = await POST(HAB, "reabilitar", dela, { habilitacaoId: hab6001 }); ok(r.status === 403 && /Ninguém reabilita a si mesmo/.test(r.body.mensagem), "a própria pessoa não se reabilita", r.body);
  r = await POST(HAB, "reabilitar", secretaria, { habilitacaoId: hab6001 }); ok(r.status === 200, "outra pessoa da Secretaria reabilita", r.body);
  r = await POST(HAB, "equipes-flag", secretaria, { equipeId: eq.novaSemMarca, contatoComMenores: true }); ok(r.status === 200, "LIGAR a marca é livre", r.body);
  r = await POST(HAB, "equipes-flag", semFatorHab, { equipeId: eq.novaSemMarca, contatoComMenores: false }); ok(r.status === 428 && r.body.precisaFator === true, "DESLIGAR a marca sem a confirmação reforçada: 428", r.body);
  ok((await escalar("SELECT ContatoComMenores FROM EscalasEquipes WHERE EquipeId = @e", { e: eq.novaSemMarca })) === true || (await escalar("SELECT ContatoComMenores FROM EscalasEquipes WHERE EquipeId = @e", { e: eq.novaSemMarca })) === 1, "e a marca continuou ligada");
  r = await POST(HAB, "equipes-flag", diretoriaHab, { equipeId: eq.novaSemMarca, contatoComMenores: false }); ok(r.status === 200, "com a confirmação recente, desliga", r.body);

  console.log("== canal que inclui menores não vai para o site ==");
  const novo = (extra = {}) => POST(CAN, "canais", gestaoCanais, { nome: "Grupo das crianças lote 2", plataforma: "WHATSAPP_GRUPO", categoria: "GRUPO_OFICIAL", identificador: "Crianças da Central L2", vinculoInstitucional: "ESTRUTURA", declaracaoInstitucional: true, escopo: "CONGREGACAO", congregacaoId: c1, incluiMenores: true, ...extra });
  r = await novo({ publicoNoSite: true }); ok(r.status === 422 && /não pode ser divulgado no site/.test(r.body.mensagem), "criar canal com menores e público no site: recusado", r.body);
  r = await novo({ publicoNoSite: false }); ok(r.status === 201, "o mesmo canal, sem divulgar: aceito", r.body);
  const comum = await POST(CAN, "canais", gestaoCanais, { nome: "Canal comum lote 2", plataforma: "WHATSAPP_GRUPO", categoria: "GRUPO_OFICIAL", identificador: "Comunicados L2", vinculoInstitucional: "ESTRUTURA", declaracaoInstitucional: true, escopo: "CONGREGACAO", congregacaoId: c1, incluiMenores: false, publicoNoSite: true });
  ok(comum.status === 201, "um canal sem menores pode ser público", comum.body);
  // um canal com menores marcado como público por baixo dos panos (dado antigo) tampouco aparece no site
  const menCanal = await escalar("SELECT TOP 1 CanalId FROM CanaisOficiaisComunicacao WHERE Nome = N'Grupo das crianças lote 2'");
  if (menCanal) await q("UPDATE CanaisOficiaisComunicacao SET PublicoNoSite = 1 WHERE CanalId = @c", { c: menCanal });
  const ctx = await require(path.join(API, "shared/calendarioDb.js")).carregarContextoTerritorial(pool);
  const publicos = await canaisDb.canaisPublicos(pool, ctx);
  ok(!publicos.some((c) => /crianças lote 2/.test(c.nome)), "o canal com menores não aparece na lista pública, mesmo marcado por baixo dos panos", publicos.map((c) => c.nome));
  ok(publicos.some((c) => /Canal comum lote 2/.test(c.nome)), "o canal comum aparece", publicos.map((c) => c.nome));
  r = await POST(CAN, "canais", gestaoCanais, { nome: "Grupo recusa uniforme", plataforma: "WHATSAPP_GRUPO", categoria: "GRUPO_OFICIAL", identificador: "Uniforme L2", vinculoInstitucional: "ESTRUTURA", declaracaoInstitucional: true, escopo: "CONGREGACAO", congregacaoId: c1, incluiMenores: true, responsavelAcessoMembroId: 99999999 });
  const m1 = r.body.mensagem;
  r = await POST(CAN, "canais", gestaoCanais, { nome: "Grupo recusa uniforme 2", plataforma: "WHATSAPP_GRUPO", categoria: "GRUPO_OFICIAL", identificador: "Uniforme L2b", vinculoInstitucional: "ESTRUTURA", declaracaoInstitucional: true, escopo: "CONGREGACAO", congregacaoId: c1, incluiMenores: true, responsavelAcessoMembroId: 6020 });
  ok(r.status === 422 && m1 === r.body.mensagem, "matrícula inexistente e matrícula de menor recebem a MESMA recusa (não vira consulta de cadastro)", [m1, r.body.mensagem]);

  console.log("== o detalhe do serviço: as salas com menores só para quem administra escalas ou lidera equipe ==");
  const svD = await servico(dias(45));
  await aloca(svD, eq.bercario, 6010);
  r = await GET(E, "servicos-detalhe", secretaria, { servicoId: svD }); ok(r.status === 200 && r.body.menores !== undefined, "quem administra escalas vê as salas com menores", r.status);
  r = await GET(E, "servicos-detalhe", LIDER(3003, ["financeiro"], ["Central E2E"]), { servicoId: svD });
  ok(r.status === 403 || r.status === 404 || (r.status === 200 && r.body.menores === undefined), "o tesoureiro local NÃO vê as salas com menores (nem os nomes de voluntários sem habilitação)", [r.status, Object.keys(r.body || {})]);

  fim("e2e-12-revisao-lote2");
})().catch((e) => { console.error("ERRO:", e); process.exitCode = 1; try { L.shimEncerrar(); } catch { } });
