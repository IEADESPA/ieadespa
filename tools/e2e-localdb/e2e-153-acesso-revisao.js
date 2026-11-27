// e2e-153-acesso-revisao.js — as correções da revisão de fora do ramo v10-acesso-ajustes-3 (26/11/2026), contra o SQL Server de verdade. Monta o próprio
// cenário sobre a base cenario-175 (`BASE=cenario-175 bash rodar.sh roteiro e2e-153-acesso-revisao.js`). Cobre:
//   1. a recusa da ficha não entrega a quem não vê a disciplina daquela pessoa que ela tem exclusão julgada: a mesma resposta para a exclusão e para o
//      processo de cargo, e a recusa vem depois de todas as outras que quem salva provoca à vontade (a sonda sem gravar nada responde igual para todos);
//   2. o "processar" das Cartas de Mudança confere a pessoa DENTRO da transação: quem faleceu ou saiu do rol por outra causa não vira "desligado por carta"
//      (a carta é cancelada e a ficha fica como está), e quem foi readmitido no meio do processamento não é minimizado;
//   3. a licença por candidatura começa 90 dias antes do pleito: o pleito que já passou e o registro antes da hora são recusados; dentro dos 90 dias começa hoje;
//   4. o PIN provisório: o PIN, a queda das sessões e a trilha juntos (a primeira vez e a troca), e "avisado por e-mail" só quando o e-mail saiu (aqui não há
//      serviço de e-mail: a resposta diz que o aviso não saiu e a trilha registra);
//   5. a trava do último administrador dentro da transação: duas suspensões de acesso ao mesmo tempo, cada uma num processo com a sua conexão, contra as
//      duas últimas pessoas que administram os acessos: só uma passa;
//   6. a ficha: a situação do membro e o cargo gravados com a sigla do catálogo (o banco compara sem caixa e sem o espaço do fim), e a causa disciplinar
//      antiga, que quem salva não vê, não é reaplicada numa saída nova (o readmitido que falece fica com a causa FALECIMENTO).
process.env.AUTH_SECRET = "segredo-do-roteiro-da-revisao-3-" + "x".repeat(24);
const L = require("./lib");
const { ok, fim, q, escalar, obterPool } = L;
const { chamarRota } = require("./lib-afm");

const BASE_ID = 1530000;
const ID = {
  geral: BASE_ID + 1, secLocal: BASE_ID + 2, comum: BASE_ID + 3, excluido: BASE_ID + 4, emCargo: BASE_ID + 5, proponente: BASE_ID + 6,
  cartaFalecida: BASE_ID + 10, cartaExcluida: BASE_ID + 11, cartaReadmitido: BASE_ID + 12, cartaJaDesligada: BASE_ID + 13, cartaNormal: BASE_ID + 14,
  pinComEmail: BASE_ID + 20, pinSemEmail: BASE_ID + 21, adminA: BASE_ID + 30, adminB: BASE_ID + 31,
  fichaCatalogo: BASE_ID + 40, readmitido: BASE_ID + 41
};
const NOME_SEDE = "Sede Revisao E2E153";
const NOME_OUTRA = "Outra Revisao E2E153";
const resumo = (r) => `${r && r.status} ${JSON.stringify((r && r.body) || {}).slice(0, 220)}`;
const iguais = (a, b) => a.status === b.status && JSON.stringify(a.body) === JSON.stringify(b.body);
const fala = (r) => String((r && r.body && r.body.mensagem) || "");

async function principal() {
  await obterPool();

  console.log("== o cenário ==");
  const area = (await q("INSERT INTO Areas (Nome) VALUES (N'Área Revisão E2E153'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const sede = (await q("INSERT INTO Congregacoes (Nome, AreaId) VALUES (@n, @a); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { n: NOME_SEDE, a: area }))[0].id;
  await q("INSERT INTO Congregacoes (Nome, AreaId) VALUES (@n, @a)", { n: NOME_OUTRA, a: area });
  for (const [chave, id] of Object.entries(ID)) {
    await q(`INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, DataAdmissao, Sexo, EstadoCivil)
      VALUES (@id, @n, @c, 'ATIVO', 'EM_COMUNHAO', '1984-03-12', '2010-05-02', 'M', 'SOLTEIRO')`, { id, n: `Pessoa ${chave} E2E153`, c: sede });
  }
  const { TERMOS } = require(L.path.join(L.API, "shared/termos.js"));
  for (const m of Object.values(ID)) {
    for (const [tipo, t] of Object.entries(TERMOS)) await q("INSERT INTO TermosAssinados (MembroId, TipoTermo, VersaoTermo) VALUES (@m, @t, @v)", { m, t: tipo, v: t.versao });
  }
  const pessoas = (metodo, opcoes) => chamarRota("GestaoPessoas/index.js", { metodo, ...opcoes });
  const ficha = (id, extra = {}) => ({ membroId: id, nome: `Pessoa ${Object.keys(ID).find((k) => ID[k] === id)} E2E153`, congregacaoId: sede, status: "ATIVO",
    situacaoMembro: "EM_COMUNHAO", dataNascimento: "1984-03-12", dataAdmissao: "2010-05-02", estadoCivil: "SOLTEIRO", sexo: "M", ...extra });
  const admissaoDe = (id) => escalar("SELECT CONVERT(varchar(10), DataAdmissao, 120) FROM MembroReferencia WHERE MembroId = @id", { id });
  const geral = () => L.GERAL(ID.geral, ["pessoas", "disciplina"]);
  const soPessoas = () => L.LIDER(ID.secLocal, ["pessoas"], [NOME_SEDE]);
  const comDisciplina = () => L.LIDER(ID.secLocal, ["pessoas", "disciplina"], [NOME_SEDE]);
  // a disciplina recebida por delegação, mas de OUTRA congregação: não vê a disciplina desta pessoa
  const disciplinaDeOutra = () => L.sessao(ID.secLocal, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "CONGREGACAO", escopoCongregacoes: [NOME_SEDE],
    permissoes: ["pessoas", "disciplina"], concessoes: [
      { tipo: "PROPRIA", permissoes: ["pessoas"], nivel: "CONGREGACAO", escopoCongregacoes: [NOME_SEDE] },
      { tipo: "DELEGACAO", permissoes: ["disciplina"], nivel: "CONGREGACAO", escopoCongregacoes: [NOME_OUTRA] }
    ] });
  // a exclusão julgada (de mentira) e o processo de cargo em andamento
  await q("INSERT INTO ProcessosDisciplinares (MembroId, DataAbertura, Status, Resultado, DataConclusao) VALUES (@m, '2025-01-01', 'JULGADO', 'EXCLUSAO', '2025-03-01')",
    { m: ID.excluido });
  await q(`INSERT INTO Consagracoes (MembroId, Assunto, ProponenteMembroId, Status, CargoAlvo, Modalidade)
    VALUES (@m, N'Separação ao Diaconato', @p, 'PROTOCOLADO', 'DIACONO', 'INDICACAO')`, { m: ID.emCargo, p: ID.proponente });

  // ------------------------------------------------------------------------------------------------------------------
  console.log("== 1. a recusa da ficha não entrega a exclusão julgada a quem não vê a disciplina ==");
  const novaAdmissao = { dataAdmissao: "2010-05-03" };
  const rExcluido = await pessoas("POST", { token: soPessoas(), corpo: ficha(ID.excluido, novaAdmissao) });
  const rEmCargo = await pessoas("POST", { token: soPessoas(), corpo: ficha(ID.emCargo, novaAdmissao) });
  ok(rExcluido.status === 403 && iguais(rExcluido, rEmCargo), "só com \"pessoas\": a exclusão e o processo de cargo recebem a mesma resposta, byte a byte",
    `${resumo(rExcluido)} | ${resumo(rEmCargo)}`);
  ok(!/exclus|disciplin|readmiss|processo/i.test(fala(rExcluido)) && /Secretaria \(nível geral\)/.test(fala(rExcluido)),
    "a mensagem é neutra: não fala em exclusão, disciplina, readmissão nem processo", fala(rExcluido));
  ok((await admissaoDe(ID.excluido)) === "2010-05-02" && (await admissaoDe(ID.emCargo)) === "2010-05-02", "nada gravado");
  // a sonda sem gravar nada (o cargo lido diferente do gravado): a mesma resposta para quem tem exclusão e para quem não tem
  const sondaExcluido = await pessoas("POST", { token: soPessoas(), corpo: ficha(ID.excluido, { ...novaAdmissao, cargoOriginal: "PASTOR" }) });
  const sondaComum = await pessoas("POST", { token: soPessoas(), corpo: ficha(ID.comum, { ...novaAdmissao, cargoOriginal: "PASTOR" }) });
  ok(sondaComum.status === 409 && iguais(sondaExcluido, sondaComum), "a sonda do cargo lido: 409 igual para quem tem exclusão e para quem não tem",
    `${resumo(sondaExcluido)} | ${resumo(sondaComum)}`);
  // outra recusa que quem salva provoca à vontade (a situação fora do catálogo): também igual
  const sondaStatusExcluido = await pessoas("POST", { token: soPessoas(), corpo: ficha(ID.excluido, { ...novaAdmissao, status: "NAO_EXISTE_E2E" }) });
  const sondaStatusComum = await pessoas("POST", { token: soPessoas(), corpo: ficha(ID.comum, { ...novaAdmissao, status: "NAO_EXISTE_E2E" }) });
  ok(sondaStatusComum.status === 400 && iguais(sondaStatusExcluido, sondaStatusComum), "a sonda da situação fora do catálogo: 400 igual para os dois",
    `${resumo(sondaStatusExcluido)} | ${resumo(sondaStatusComum)}`);
  ok((await admissaoDe(ID.excluido)) === "2010-05-02" && (await admissaoDe(ID.comum)) === "2010-05-02", "e as sondas não gravaram nada");
  // a disciplina de outra congregação não vê a desta pessoa: a resposta neutra
  const rDeOutra = await pessoas("POST", { token: disciplinaDeOutra(), corpo: ficha(ID.excluido, novaAdmissao) });
  ok(iguais(rDeOutra, rExcluido), "com a disciplina só de outra congregação: a mesma resposta neutra", resumo(rDeOutra));
  // quem vê a disciplina desta pessoa continua recebendo a explicação
  const rComDisc = await pessoas("POST", { token: comDisciplina(), corpo: ficha(ID.excluido, novaAdmissao) });
  ok(rComDisc.status === 403 && /readmissão/.test(fala(rComDisc)), "quem vê a disciplina desta pessoa: a explicação da readmissão", resumo(rComDisc));
  const rComDiscCargo = await pessoas("POST", { token: comDisciplina(), corpo: ficha(ID.emCargo, novaAdmissao) });
  ok(rComDiscCargo.status === 403 && /processo de cargo/.test(fala(rComDiscCargo)), "e a do processo de cargo", resumo(rComDiscCargo));
  // cada regra com o seu gatilho: a exclusão só barra a admissão (o estado civil de quem tem exclusão a secretaria local muda)
  const rEstadoCivil = await pessoas("POST", { token: soPessoas(), corpo: ficha(ID.excluido, { estadoCivil: "CASADO" }) });
  ok(rEstadoCivil.status === 200 && rEstadoCivil.body && rEstadoCivil.body.sucesso !== false, "o estado civil de quem tem exclusão: a secretaria local grava", resumo(rEstadoCivil));
  const rCargoEstadoCivil = await pessoas("POST", { token: soPessoas(), corpo: ficha(ID.emCargo, { estadoCivil: "CASADO" }) });
  ok(iguais(rCargoEstadoCivil, rExcluido), "o estado civil de quem tem processo de cargo: a mesma recusa neutra", resumo(rCargoEstadoCivil));
  // a Secretaria (nível geral) registra a readmissão
  const rGeral = await pessoas("POST", { token: geral(), corpo: ficha(ID.excluido, { ...novaAdmissao, estadoCivil: "CASADO" }) });
  ok(rGeral.status === 200 && (await admissaoDe(ID.excluido)) === "2010-05-03", "o nível geral registra a readmissão", resumo(rGeral));

  // ------------------------------------------------------------------------------------------------------------------
  console.log("== 2. o processamento das Cartas de Mudança confere a pessoa dentro da transação ==");
  const pool = await obterPool();
  const cartas = (acao, corpo) => chamarRota("GestaoCartas/index.js", { metodo: "POST", binding: { acao }, token: soPessoas(), corpo });
  const cartaDe = (id) => escalar("SELECT Status FROM CartasTransito WHERE CartaId = @id", { id });
  const fichaDe = (id) => escalar(`SELECT CONCAT(Status, '|', ISNULL(MotivoSaida, '-'), '|', ISNULL(CONVERT(varchar(10), DataSaida, 120), '-'), '|', ISNULL(Telefone, '-'))
    FROM MembroReferencia WHERE MembroId = @id`, { id });
  const prazo = await require(L.path.join(L.API, "shared/minimizacaoLgpd.js")).prazoMinimizacaoExMembro(pool);
  // as cartas confirmadas pelo próprio membro, todas já vencidas
  const cartaVencida = (m) => escalar(`INSERT INTO CartasTransito (MembroId, Tipo, Status, Destino, SolicitadoPor, DataSolicitacao, DataConfirmacao, DeclaracaoCiencia)
    OUTPUT INSERTED.CartaId VALUES (@m, 'MUDANCA', 'CONFIRMADA', N'Igreja de Teste', @m, DATEADD(day, -(@d + 5), SYSUTCDATETIME()), DATEADD(day, -(@d + 3), SYSUTCDATETIME()),
    N'Declaro ciência (roteiro)')`, { m, d: prazo.dias });
  const carta = {};
  for (const k of ["cartaFalecida", "cartaExcluida", "cartaReadmitido", "cartaJaDesligada", "cartaNormal"]) {
    await q("UPDATE MembroReferencia SET Telefone = N'91900000000' WHERE MembroId = @id", { id: ID[k] });
    carta[k] = await cartaVencida(ID[k]);
  }
  // depois de confirmar a carta: uma faleceu e outra foi desligada pela ficha por exclusão; a terceira já tinha a saída por carta gravada à mão
  await q("UPDATE MembroReferencia SET Status = 'FALECIDO', SituacaoMembro = 'SEM_COMUNHAO', DataSaida = '2026-11-20', MotivoSaida = N'FALECIMENTO' WHERE MembroId = @id",
    { id: ID.cartaFalecida });
  await q("UPDATE MembroReferencia SET Status = 'DESLIGADO', SituacaoMembro = 'SEM_COMUNHAO', DataSaida = '2026-11-21', MotivoSaida = N'EXCLUSAO' WHERE MembroId = @id",
    { id: ID.cartaExcluida });
  await q("UPDATE MembroReferencia SET Status = 'DESLIGADO', SituacaoMembro = 'SEM_COMUNHAO', DataSaida = '2026-11-02', MotivoSaida = N'CARTA_MUDANCA' WHERE MembroId = @id",
    { id: ID.cartaJaDesligada });
  // a readmissão gravada no meio do processamento: depois da leitura das cartas e antes da vez desta carta
  const pedidoOriginal = pool.request;
  let readmitir = true;
  pool.request = (...a) => {
    const rq = pedidoOriginal.apply(pool, a);
    const consultar = rq.query.bind(rq);
    rq.query = async (texto) => {
      const resposta = await consultar(texto);
      if (readmitir && /c\.Tipo = 'MUDANCA' AND c\.Status IN/.test(String(texto))) {
        readmitir = false;
        await pedidoOriginal.apply(pool).input("id", L.sql.Int, ID.cartaReadmitido).query("UPDATE MembroReferencia SET DataAdmissao = CAST(SYSUTCDATETIME() AS DATE) WHERE MembroId = @id");
      }
      return resposta;
    };
    return rq;
  };
  let processou;
  try { processou = await cartas("processar", {}); } finally { pool.request = pedidoOriginal; }
  ok(!readmitir, "a readmissão foi gravada depois da leitura das cartas (o gatilho do roteiro disparou)");
  ok(processou.status === 200 && processou.body && processou.body.sucesso === true, "o processamento termina", resumo(processou));
  ok((await cartaDe(carta.cartaFalecida)) === "CANCELADA" && (await fichaDe(ID.cartaFalecida)) === "FALECIDO|FALECIMENTO|2026-11-20|91900000000",
    "quem faleceu depois de confirmar a carta continua falecido, com a data e a causa (a carta é cancelada, nada minimizado)", await fichaDe(ID.cartaFalecida));
  ok((await cartaDe(carta.cartaExcluida)) === "CANCELADA" && (await fichaDe(ID.cartaExcluida)) === "DESLIGADO|EXCLUSAO|2026-11-21|91900000000",
    "quem saiu do rol por exclusão continua com a causa e a data dela", await fichaDe(ID.cartaExcluida));
  ok((await cartaDe(carta.cartaReadmitido)) === "CANCELADA" && /^ATIVO\|-\|-\|91900000000$/.test(await fichaDe(ID.cartaReadmitido)),
    "quem foi readmitido no meio do processamento não é minimizado (a carta é cancelada pelo retorno)", await fichaDe(ID.cartaReadmitido));
  ok((await cartaDe(carta.cartaJaDesligada)) === "CONCLUIDA" && (await fichaDe(ID.cartaJaDesligada)) === "DESLIGADO|CARTA_MUDANCA|2026-11-02|-",
    "quem já tinha a saída por carta gravada à mão: minimizado, com a data de saída que estava", await fichaDe(ID.cartaJaDesligada));
  ok((await cartaDe(carta.cartaNormal)) === "CONCLUIDA" && /^DESLIGADO\|CARTA_MUDANCA\|\d{4}-\d{2}-\d{2}\|-$/.test(await fichaDe(ID.cartaNormal)),
    "a carta comum segue como sempre: concluída e minimizada", await fichaDe(ID.cartaNormal));
  const msg = fala(processou);
  ok(/2 saída\(s\) minimizada/.test(msg) && /1 carta\(s\) cancelada\(s\) por retorno/.test(msg) && /2 carta\(s\) cancelada\(s\) porque a pessoa já tinha saído do rol/.test(msg),
    "a resposta conta as minimizadas, o retorno e as de quem já tinha saído do rol", msg);
  const trilhaFalecida = await escalar("SELECT TOP 1 CONCAT(Acao, ' ', DadosDepois) FROM AuditLog WHERE Tabela = N'CartasTransito' AND RegistroId = @c ORDER BY AuditId DESC",
    { c: carta.cartaFalecida });
  ok(/já saiu do rol/.test(trilhaFalecida || "") && /"situacaoNoRol":"FALECIDO"/.test(trilhaFalecida || ""), "a trilha diz por que a carta foi cancelada", String(trilhaFalecida).slice(0, 200));

  // ------------------------------------------------------------------------------------------------------------------
  console.log("== 3. a licença por candidatura começa 90 dias antes do pleito ==");
  const { hojeBrasilia } = require(L.path.join(L.API, "shared/dataBrasilia.js"));
  const diasDeHoje = (n) => { const d = new Date(`${hojeBrasilia()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const dataBr = (iso) => iso.split("-").reverse().join("/");
  const licenca = (membroId, dataPleito) => chamarRota("GestaoLicencasCandidatura/index.js", { metodo: "POST", token: L.GERAL(ID.geral, ["pessoas"]), corpo: { membroId, dataPleito } });
  const statusDe = (id) => escalar("SELECT Status FROM MembroReferencia WHERE MembroId = @id", { id });
  const licencasDe = (id) => escalar("SELECT COUNT(*) FROM LicencasCandidatura WHERE MembroId = @id", { id });
  const passado = await licenca(ID.comum, diasDeHoje(-1));
  ok(passado.body && passado.body.sucesso === false && new RegExp(`pleito \\(${dataBr(diasDeHoje(-1))}\\) já passou`).test(fala(passado))
    && (await statusDe(ID.comum)) === "ATIVO" && (await licencasDe(ID.comum)) === 0, "o pleito que já passou é recusado (nada muda)", resumo(passado));
  const cedo = await licenca(ID.comum, diasDeHoje(400));
  ok(cedo.body && cedo.body.sucesso === false && fala(cedo).includes(`em ${dataBr(diasDeHoje(310))}: registre a partir desse dia`)
    && (await statusDe(ID.comum)) === "ATIVO" && (await licencasDe(ID.comum)) === 0, "o registro antes dos 90 dias é recusado com o dia em que a licença começa; a pessoa continua ATIVO", resumo(cedo));
  const dentro = await licenca(ID.comum, diasDeHoje(60));
  const gravada = await escalar("SELECT CONCAT(CONVERT(varchar(10), DataPleito, 120), '|', CONVERT(varchar(10), DataInicioLicenca, 120)) FROM LicencasCandidatura WHERE MembroId = @id", { id: ID.comum });
  ok(dentro.status === 201 && (await statusDe(ID.comum)) === "LICENCA_CANDIDATURA" && gravada === `${diasDeHoje(60)}|${diasDeHoje(0)}`
    && fala(dentro).includes(`a partir de hoje (${dataBr(diasDeHoje(0))})`), "dentro dos 90 dias: a licença começa hoje, e é hoje o início gravado e dito", `${resumo(dentro)} ${gravada}`);

  // ------------------------------------------------------------------------------------------------------------------
  console.log("== 4. o PIN provisório: o PIN, as sessões e a trilha juntos; o aviso por e-mail só quando saiu ==");
  await q("UPDATE MembroReferencia SET Email = N'pin.teste@exemplo.org' WHERE MembroId = @id", { id: ID.pinComEmail });
  const gerarPin = (membroId) => chamarRota("GestaoPinMembro/index.js", { metodo: "POST", token: soPessoas(), corpo: { membroId } });
  const linhaPin = (id) => q("SELECT PinHash, CAST(Provisorio AS INT) AS Provisorio, DefinidoPorMembroId, CASE WHEN ProvisorioExpiraEm > SYSUTCDATETIME() THEN 1 ELSE 0 END AS Vale FROM MembroPins WHERE MembroId = @id", { id });
  const trilhaPin = (id) => q("SELECT Acao, ISNULL(DadosDepois, N'') AS DadosDepois, UsuarioId FROM AuditLog WHERE Tabela = N'MembroPins' AND RegistroId = @id ORDER BY AuditId", { id });
  const sessoesAbertas = (id) => escalar("SELECT COUNT(*) FROM SessoesAtivas WHERE MembroId = @id AND Encerrada = 0", { id });
  ok((await linhaPin(ID.pinComEmail)).length === 0, "antes: a pessoa não tem PIN (a gravação vai pelo INSERT)");
  await q("INSERT INTO SessoesAtivas (MembroId, DispositivoInfo) VALUES (@m, N'e2e-153'), (@m, N'e2e-153')", { m: ID.pinComEmail });
  const pin1 = await gerarPin(ID.pinComEmail);
  const depois1 = await linhaPin(ID.pinComEmail);
  const trilha1 = await trilhaPin(ID.pinComEmail);
  ok(pin1.status === 200 && pin1.body.sucesso === true && /^\d{4,8}$/.test(String(pin1.body.pin || "")), "o PIN é gerado e entregue na resposta", resumo(pin1));
  ok(depois1.length === 1 && depois1[0].Provisorio === 1 && depois1[0].DefinidoPorMembroId === ID.secLocal && depois1[0].Vale === 1,
    "o PIN provisório fica gravado (INSERT), com quem gerou e a validade", JSON.stringify(depois1));
  ok((await sessoesAbertas(ID.pinComEmail)) === 0, "as sessões abertas da pessoa caíram");
  ok(pin1.body.avisadoPorEmail === false && pin1.body.avisoEmailNaoSaiu === true && /aviso por e-mail não saiu/.test(fala(pin1)),
    "sem serviço de e-mail: a resposta NÃO diz que avisou, e diz que o aviso não saiu", resumo(pin1));
  const geradoUm = trilha1.filter((t) => t.Acao === "PIN_PROVISORIO_GERADO");
  const naoSaiuUm = trilha1.filter((t) => t.Acao === "Aviso do PIN provisório não enviado");
  ok(geradoUm.length === 1 && geradoUm[0].UsuarioId === ID.secLocal && /"sessoesEncerradas":2/.test(geradoUm[0].DadosDepois),
    "a trilha guarda quem gerou e as 2 sessões encerradas", JSON.stringify(trilha1));
  ok(naoSaiuUm.length === 1 && naoSaiuUm[0].UsuarioId === ID.secLocal, "a trilha registra que o aviso por e-mail não saiu", JSON.stringify(trilha1));
  ok(!JSON.stringify(trilha1).includes(String(pin1.body.pin)) && !JSON.stringify(trilha1).includes("pin.teste@exemplo.org"), "a trilha não leva o PIN nem o e-mail");
  const pin2 = await gerarPin(ID.pinComEmail);
  const depois2 = await linhaPin(ID.pinComEmail);
  ok(pin2.status === 200 && depois2.length === 1 && depois2[0].PinHash !== depois1[0].PinHash && depois2[0].Provisorio === 1,
    "gerar de novo troca o PIN (UPDATE), sem linha repetida", JSON.stringify(depois2.map((l) => l.Provisorio)));
  ok((await trilhaPin(ID.pinComEmail)).filter((t) => t.Acao === "PIN_PROVISORIO_GERADO").length === 2, "cada geração deixa a sua linha na trilha");
  const semEmail = await gerarPin(ID.pinSemEmail);
  const trilhaSem = await trilhaPin(ID.pinSemEmail);
  ok(semEmail.status === 200 && semEmail.body.avisadoPorEmail === false && semEmail.body.avisoEmailNaoSaiu === false && !/não saiu/.test(fala(semEmail))
    && trilhaSem.length === 1 && trilhaSem[0].Acao === "PIN_PROVISORIO_GERADO", "quem não tem e-mail: nada de aviso nem de 'não saiu'; só a linha da geração", `${resumo(semEmail)} ${JSON.stringify(trilhaSem)}`);

  // ------------------------------------------------------------------------------------------------------------------
  console.log("== 5. a trava do último administrador dentro da transação: duas suspensões ao mesmo tempo ==");
  // A ponte do LocalDB é UMA conexão: a corrida de verdade precisa de um processo por pedido (worker.js), como no e2e-6.
  const { spawn } = require("child_process");
  const disparar = async (chamadas) => {
    const t0 = Date.now() + 6000 + chamadas.length * 600;   // folga para os processos subirem a ponte e conectarem
    return Promise.all(chamadas.map((spec) => new Promise((resolve) => {
      const p = spawn(process.execPath, ["-r", L.path.join(__dirname, "shim-mssql.js"), L.path.join(__dirname, "worker.js"), JSON.stringify({ ...spec, t0 })], { env: process.env });
      let saida = ""; p.stdout.on("data", (d) => { saida += d; });
      p.on("exit", () => { const m = saida.split("\n").find((l) => l.startsWith("@@RESULTADO@@")); resolve(m ? JSON.parse(m.slice(13)) : { status: -1, erro: "sem resultado" }); });
    })));
  };
  const travaPermissoes = require(L.path.join(L.API, "shared/travaPermissoes.js"));
  const situacaoDe = async (id) => travaPermissoes.situacaoDoCargo(await obterPool(), L.sql, id, hojeBrasilia());
  const pAdmin = (await q("INSERT INTO Papeis (Nome, Nivel, Permissoes) VALUES (N'Geral E2E153', 'GLOBAL', N'pessoas,permissoes'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const senhaHash = L.auth.hashSenha("senha-de-mentira-E2E153");
  for (const id of [ID.adminA, ID.adminB]) {
    await q("INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId, SenhaHash, AtivoAte) VALUES (@m, @p, 'GLOBAL', NULL, @h, NULL)", { m: id, p: pAdmin, h: senhaHash });
  }
  // só neste trecho, os outros que administram deixam de contar (o fim volta como estava no fim do trecho): A e B ficam sendo os dois últimos
  const retirados = await q(`UPDATE l SET AtivoAte = '2000-01-01'
      OUTPUT INSERTED.LiderancaId AS id, CONVERT(varchar(10), DELETED.AtivoAte, 120) AS ate
      FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId
      WHERE l.MembroId NOT IN (@a, @b) AND (l.AtivoAte IS NULL OR l.AtivoAte >= @hoje) AND (',' + REPLACE(p.Permissoes, ' ', '') + ',') LIKE '%,permissoes,%'`,
  { a: ID.adminA, b: ID.adminB, hoje: hojeBrasilia() });
  const antesA = await situacaoDe(ID.adminA);
  ok(antesA.alvoAdministra && antesA.outros === 1, "antes: A e B são as duas últimas pessoas que administram os acessos", JSON.stringify(antesA));
  const suspender = (membroId) => ({ handler: "medidas", metodo: "POST", token: { tipo: "GERAL", membroId: ID.geral, permissoes: ["pessoas"] },
    corpo: { membroId, motivo: "Conferência do caixa (corrida E2E153)", suspenderAcessoSistema: true } });
  const corrida = await disparar([suspender(ID.adminA), suspender(ID.adminB)]);
  const passaram = corrida.filter((r) => r.status === 201);
  const recusadas = corrida.filter((r) => r.status === 200 && r.body && r.body.sucesso === false && /única com a permissão "permissoes"/.test(String(r.mensagem || "")));
  ok(passaram.length === 1 && recusadas.length === 1, "duas suspensões ao mesmo tempo contra os dois últimos: uma passa, a outra é recusada", JSON.stringify(corrida));
  const medidas = await escalar("SELECT COUNT(*) FROM MedidasCautelares WHERE MembroId IN (@a, @b)", { a: ID.adminA, b: ID.adminB });
  const depoisA = await situacaoDe(ID.adminA), depoisB = await situacaoDe(ID.adminB);
  ok(medidas === 1 && (depoisA.alvoAdministra ? 1 : 0) + (depoisB.alvoAdministra ? 1 : 0) === 1,
    "uma medida só no banco, e uma pessoa continua administrando os acessos", `${medidas} ${JSON.stringify([depoisA, depoisB])}`);
  for (const r of retirados) await q("UPDATE Lideranca SET AtivoAte = @ate WHERE LiderancaId = @id", { id: r.id, ate: r.ate || null });

  // ------------------------------------------------------------------------------------------------------------------
  console.log("== 6. a ficha: a sigla do catálogo; a causa disciplinar antiga não volta numa saída nova ==");
  const cargoDoCatalogo = await escalar("SELECT TOP 1 Sigla FROM CargosMinisteriais WHERE Sigla <> N'MEMBRO' ORDER BY Sigla");
  await q("UPDATE MembroReferencia SET CargoMinisterial = @c WHERE MembroId = @id", { id: ID.fichaCatalogo, c: cargoDoCatalogo });
  const comCaixa = await pessoas("POST", { token: geral(), corpo: ficha(ID.fichaCatalogo, { situacaoMembro: "em_comunhao ", cargoMinisterial: `${cargoDoCatalogo.toLowerCase()} `, cargoOriginal: cargoDoCatalogo }) });
  const gravado = await escalar("SELECT CONCAT(SituacaoMembro, '|', CargoMinisterial) FROM MembroReferencia WHERE MembroId = @id", { id: ID.fichaCatalogo });
  ok(comCaixa.body && comCaixa.body.sucesso === true && gravado === `EM_COMUNHAO|${cargoDoCatalogo}`, "\"em_comunhao \" e o cargo em minúsculas são gravados com a sigla do catálogo",
    `${resumo(comCaixa)} ${gravado}`);
  ok(comCaixa.body && comCaixa.body.membro && comCaixa.body.membro.capacidade && comCaixa.body.membro.capacidade.emComunhao === true && comCaixa.body.membro.situacaoMembro === "EM_COMUNHAO",
    "e a pessoa conta como em comunhão (a capacidade eleitoral reconhece a situação)", JSON.stringify(comCaixa.body && comCaixa.body.membro && { s: comCaixa.body.membro.situacaoMembro, c: comCaixa.body.membro.capacidade }));
  const historicoCargo = await escalar("SELECT COUNT(*) FROM CargosMinisteriaisHistorico WHERE MembroId = @id", { id: ID.fichaCatalogo });
  ok(historicoCargo === 0, "o mesmo cargo escrito de outro jeito não conta como troca de cargo (nada no histórico)", String(historicoCargo));
  // o readmitido: ATIVO, com a EXCLUSAO de antes guardada (escondida de quem não tem "disciplina")
  await q("UPDATE MembroReferencia SET Status = 'ATIVO', MotivoSaida = 'EXCLUSAO', DataSaida = NULL WHERE MembroId = @id", { id: ID.readmitido });
  const faleceu = await pessoas("POST", { token: soPessoas(), corpo: ficha(ID.readmitido, { status: "FALECIDO", situacaoMembro: "SEM_COMUNHAO", motivoSaida: "FALECIMENTO" }) });
  const fichaFalecido = await escalar("SELECT CONCAT(Status, '|', MotivoSaida) FROM MembroReferencia WHERE MembroId = @id", { id: ID.readmitido });
  ok(faleceu.body && faleceu.body.sucesso === true && fichaFalecido === "FALECIDO|FALECIMENTO",
    "o readmitido que falece fica com a causa FALECIMENTO, não com a EXCLUSAO antiga", `${resumo(faleceu)} ${fichaFalecido}`);
  const mesmaSaida = await pessoas("POST", { token: soPessoas(), corpo: ficha(ID.readmitido, { status: "FALECIDO", situacaoMembro: "SEM_COMUNHAO", motivoSaida: null, telefone: "91900000153" }) });
  ok(mesmaSaida.body && mesmaSaida.body.sucesso === true, "salvar de novo a mesma saída segue funcionando", resumo(mesmaSaida));
}

principal().then(() => fim("e2e-153 (acesso, revisão de fora)")).catch((e) => { console.error(e); ok(false, "o roteiro quebrou: " + (e && e.message)); fim("e2e-153 (acesso, revisão de fora)"); });
