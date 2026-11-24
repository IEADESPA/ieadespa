// e2e-98-arrolamento.js — COMPLETAR O ARROLAMENTO (FASE 10, Membros, rodada 28 aprovada em 23/11/2026), contra o SQL Server de verdade. Só dados de mentira.
// Quem veio do sistema pago entra com a situação "Arrolamento a completar" (ARROLAMENTO), sem voto, e a pendência ARROLAMENTO. A secretaria escolhe a situação,
// e como e quando a pessoa entrou; ao completar, a pessoa sai do grupo. A função eclesiástica não se grava aqui (regra dele de 24/11/2026: só a Câmara de
// liderança e a academia; a ficha mostra a que já existe, só para ler). Regra dele: "A área e a Geral também
// podem completar e editar ... se a congregação não faz o que tem de fazer, a área faz, e o serviço não para." Cada uma só no seu escopo.
//  1. o 4º grupo do painel (?resumo=1) e o andamento (GET /api/arrolamento): local, área (por congregação), Geral (por área e as sem congregação);
//  2. a ficha para completar (GET /api/arrolamento/ficha): a próxima, pular, "não encontrada" igual para o que não existe e o que está fora do escopo;
//  3. completar (POST /api/arrolamento/completar): a local, a área e a Geral; a extensão; a própria ficha; a sem congregação (de antes da regra G3, 24/11)
//     ninguém completa, e a congregação no pedido é recusada; a função eclesiástica recusada em todo nível (nada muda); a pendência resolvida e a trilha, numa transação só; a segunda vez 409; lixo sem 500;
//  4. a corrida (a local e a área ao mesmo tempo na mesma ficha): uma completa, a outra leva 409;
//  5. o cadastro antigo (POST /api/pessoas) e o importador antigo não tiram ninguém do grupo nem põem ninguém nele; o cargo continua só da Geral ali.
// Roda sobre a base cenario-185 (`BASE=cenario-185 bash rodar.sh roteiro e2e-98-arrolamento.js`).
process.env.AUTH_SECRET = "segredo-do-arrolamento-" + "x".repeat(24);
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, LIXO } = L;

const PERM = ["pessoas"];
const fator = () => ({ via: "CHAVE", em: Date.now() });
const C = { VN: "Vila Nova E2E98", CJ: "Cidade Jardim E2E98", OU: "Outra E2E98" };
const EXT = "Extensão E2E98";
const NAO = { sucesso: false, mensagem: "Matrícula não encontrada." };
const sess = (id, extra) => L.sessao(id, { via: "SENHA", fator: fator(), permissoes: PERM, ...extra });
const tok = {
  geral: () => sess(9801, { nivel: "GLOBAL", escopoCongregacoes: "TODAS" }),
  local: () => sess(9802, { nivel: "CONGREGACAO", escopoCongregacoes: [C.VN] }),
  area: () => sess(9803, { nivel: "AREA", escopoCongregacoes: [C.VN, C.CJ] }),
  outra: () => sess(9804, { nivel: "CONGREGACAO", escopoCongregacoes: [C.OU] }),
  extensao: () => sess(9805, { nivel: "CONGREGACAO", escopoCongregacoes: [C.VN], escopoExtensaoNome: EXT }),
  membro: () => L.sessao(9806, { via: "PIN" }),
  depto: () => sess(9807, { nivel: "DEPARTAMENTO", escopoCongregacoes: "TODAS" }),
  semPermissao: () => sess(9808, { nivel: "CONGREGACAO", escopoCongregacoes: [C.VN], permissoes: [] }),
  importada: () => sess(9809, { nivel: "CONGREGACAO", escopoCongregacoes: [C.VN] })
};
const comunhao = { situacao: "EM_COMUNHAO", formaAdmissao: "BATISMO", dataAdmissao: "2009-03-12", cargoMinisterial: "" };

async function principal() {
  const { chamarRota } = require("./lib-afm");
  await obterPool();
  await L.importacaoConcluida();   // a trava das matrículas: o arrolamento só existe depois da importação do sistema pago
  const arrol = (token, query = {}) => chamarRota("Arrolamento/index.js", { token, query });
  const ficha = (token, query) => chamarRota("Arrolamento/index.js", { token, binding: { acao: "ficha" }, query });
  const completar = (token, matricula, corpo) => chamarRota("Arrolamento/index.js", { metodo: "POST", token, binding: { acao: "completar" }, corpo: { matricula, ...corpo } });
  const resumo = async (token, query = {}) => (await chamarRota("GestaoPessoas/index.js", { token, query: { resumo: 1, ...query } })).body.resumo;
  const pessoaLista = async (id, token) => ((await chamarRota("GestaoPessoas/index.js", { token })).body || []).find((p) => Number(p.membroId) === Number(id)) || null;
  const salvar = async (id, mudancas, token) => {
    const atual = (await pessoaLista(id, tok.geral())) || {};
    const { cargoDesde, funcao, congregacao, extensao, capacidade, menorDeIdade, fotoUrl, processoDisciplinarAtivo, ...campos } = atual;
    return chamarRota("GestaoPessoas/index.js", { metodo: "POST", token, corpo: { ...campos, ...mudancas } });
  };
  const sit = (id) => escalar("SELECT SituacaoMembro FROM MembroReferencia WHERE MembroId = @id", { id });
  const pend = (id) => um("SELECT Situacao, Resolucao, ResolvidaPor FROM FichasPendencias WHERE MembroId = @id AND Tipo = N'ARROLAMENTO'", { id });
  const igualNao = (r) => r && r.status === 200 && JSON.stringify(r.body) === JSON.stringify(NAO);
  const retrato = async () => JSON.stringify(await q(`SELECT
      (SELECT COUNT(*) FROM MembroReferencia) n1, (SELECT CHECKSUM_AGG(CHECKSUM(MembroId, SituacaoMembro, FormaAdmissao, DataAdmissao, CargoMinisterial, CongregacaoId)) FROM MembroReferencia) c1,
      (SELECT COUNT(*) FROM FichasPendencias) n2, (SELECT CHECKSUM_AGG(CHECKSUM(PendenciaId, Situacao, Resolucao)) FROM FichasPendencias) c2,
      (SELECT COUNT(*) FROM CargosMinisteriaisHistorico) n3, (SELECT COUNT(*) FROM AuditLog) n4`));

  console.log("== o cenário ==");
  const areas = {};
  for (const [k, nome] of [["A1", "Área E2E98 Um"], ["A2", "Área E2E98 Dois"]]) areas[k] = (await q("INSERT INTO Areas (Nome) VALUES (@n); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { n: nome }))[0].id;
  const cong = {};
  for (const [k, nome, a] of [["VN", C.VN, "A1"], ["CJ", C.CJ, "A1"], ["OU", C.OU, "A2"]]) cong[k] = (await q("INSERT INTO Congregacoes (Nome, AreaId) VALUES (@n, @a); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { n: nome, a: areas[a] }))[0].id;
  const ext = (await q("INSERT INTO ExtensoesTenda (Nome, CongregacaoMaeId) VALUES (@n, @c); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { n: EXT, c: cong.VN }))[0].id;
  const nova = (id, nome, c, situacao = "EM_COMUNHAO", extra = {}) => q(`INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, ExtensaoId, Status, SituacaoMembro, DataNascimento, Sexo)
    VALUES (@id, @n, @c, @e, @st, @s, '1988-07-21', N'F')`, { id, n: nome, c: c === null ? null : cong[c], e: extra.ext || null, st: extra.status || "ATIVO", s: situacao });
  const importada = async (id, nome, c, extra = {}) => {
    await nova(id, nome, c, extra.situacao || "ARROLAMENTO", extra);
    await q(`INSERT INTO FichasPendencias (MembroId, Tipo, Detalhe, Origem, AbertaPor, Situacao, Resolucao, ResolvidaEm, ResolvidaPor)
      VALUES (@id, N'ARROLAMENTO', N'Importada do sistema pago (de mentira).', N'IMPORTACAO', 9801, @s, @r, @em, @por)`,
    { id, s: extra.resolvida ? "RESOLVIDA" : "ABERTA", r: extra.resolvida ? "COMPLETADA" : null, em: extra.resolvida ? new Date() : null, por: extra.resolvida ? 9801 : null });
  };
  for (const [id, nome, c] of [[9801, "Secretaria Geral E2E98", "VN"], [9802, "Secretaria Local E2E98", "VN"], [9803, "Secretaria Area E2E98", "CJ"], [9804, "Secretaria Outra E2E98", "OU"],
    [9805, "Secretaria Extensao E2E98", "VN"], [9806, "Membro Comum E2E98", "VN"], [9807, "Lider Departamento E2E98", "VN"], [9808, "Sem Permissao E2E98", "VN"]]) await nova(id, nome, c);
  await importada(9809, "Secretaria Importada E2E98", "VN");
  for (let i = 1; i <= 5; i++) await importada(980100 + i, `Pessoa VN${i} E2E98`, "VN");
  await importada(980106, "Pessoa Extensao E2E98", "VN", { ext });
  await importada(980107, "Pessoa Completada E2E98", "VN", { situacao: "EM_COMUNHAO", resolvida: true });
  await importada(980108, "Pessoa Desligada E2E98", "VN", { status: "DESLIGADO" });
  for (let i = 1; i <= 3; i++) await importada(980200 + i, `Pessoa CJ${i} E2E98`, "CJ");
  for (let i = 1; i <= 2; i++) await importada(980300 + i, `Pessoa OU${i} E2E98`, "OU");
  await importada(980401, "Pessoa Sem Congregacao E2E98", null);
  await nova(980501, "Pessoa Antiga E2E98", "VN");

  console.log("== 1. o 4º grupo no painel ==");
  let rs = await resumo(tok.local());
  ok(rs.arrolamento === 7, "a local vê 7 a completar (a importada que é secretária conta; a completada e a desligada não)", rs.arrolamento);
  ok(rs.total === 7 + 1 + 6 + 1, "o rol soma os 4 grupos (a completada e a antiga em comunhão, os 6 usuários e a sem permissão)", rs.total);
  rs = await resumo(tok.area());
  ok(rs.arrolamento === 10, "a área vê as das suas 2 congregações (7 + 3)", rs.arrolamento);
  rs = await resumo(tok.geral());
  ok(rs.arrolamento >= 13, "a Geral vê a Igreja toda, com a sem congregação", rs.arrolamento);
  rs = await resumo(tok.area(), { congregacaoId: cong.CJ });
  ok(rs.arrolamento === 3, "a área escolhe Cidade Jardim: 3", rs.arrolamento);

  console.log("== 1. o andamento ==");
  let r = await arrol(tok.local());
  ok(r.status === 200 && r.body.sucesso === true, "a local lê o andamento", r.body);
  ok(r.body.veioEm === L.hojeBr(), "o dia em que as fichas vieram do sistema pago (a importação concluída, no dia de Brasília)", r.body.veioEm);
  ok(r.body.andamento && r.body.andamento.vieram === 8 && r.body.andamento.completadas === 1 && r.body.andamento.faltam === 7, "Vila Nova: 8 vieram, 1 completada, faltam 7", r.body.andamento);
  ok(Array.isArray(r.body.proximas) && r.body.proximas.length === 4 && r.body.proximas[0].matricula === 9809 && r.body.proximas[1].matricula === 980101 && r.body.proximas[0].nome,
    "as 4 próximas, pela matrícula, com o nome", r.body.proximas);
  ok(r.body.porCongregacao.length === 1 && r.body.porCongregacao[0].nome === C.VN, "um lugar só: Vila Nova", r.body.porCongregacao);
  ok(r.body.porArea === undefined && r.body.semCongregacao === undefined, "a local não recebe as áreas nem as sem congregação", r.body);
  const nada = await arrol(tok.outra(), { congregacaoId: cong.VN });
  ok(nada.status === 200 && nada.body.andamento.vieram === 0 && nada.body.veioEm === null, "quem não tem nada a ver com o arrolamento não recebe a data", nada.body);
  r = await arrol(tok.area());
  const lugar = (lista, nome) => (lista || []).find((x) => x.nome === nome) || {};
  ok(lugar(r.body.porCongregacao, C.VN).faltam === 7 && lugar(r.body.porCongregacao, C.CJ).vieram === 3 && r.body.porCongregacao.length === 2, "a área: cada congregação com o seu andamento", r.body.porCongregacao);
  ok(r.body.andamento.vieram === 11 && r.body.andamento.faltam === 10, "a área: 11 vieram, faltam 10", r.body.andamento);
  r = await arrol(tok.geral());
  ok(lugar(r.body.porArea, "Área E2E98 Um").vieram === 11 && lugar(r.body.porArea, "Área E2E98 Dois").faltam === 2, "a Geral: por área", r.body.porArea);
  ok(r.body.semCongregacao === 1, "a Geral: 1 ficha veio sem congregação", r.body.semCongregacao);
  r = await arrol(tok.area(), { congregacaoId: cong.OU });
  ok(r.status === 200 && r.body.andamento.vieram === 0 && r.body.proximas.length === 0, "a área escolhendo a congregação de outra área: nada", r.body);
  r = await arrol(tok.area(), { congregacaoId: cong.CJ });
  ok(r.body.andamento.vieram === 3 && r.body.proximas[0].matricula === 980201, "a área escolhendo Cidade Jardim: o andamento e as próximas de lá", r.body);
  for (const lixo of ["abc", "-1", "0", "1 OR 1=1", "1;DROP TABLE Areas"]) {
    r = await arrol(tok.area(), { congregacaoId: lixo });
    ok(r.status === 400, `congregação "${lixo}": 400`, r.status);
  }
  ok((await arrol(null)).status === 401, "sem sessão: 401");
  ok((await arrol(tok.membro())).status === 403, "o membro comum (PIN): 403");
  ok((await arrol(tok.semPermissao())).status === 403, "sem a permissão de pessoas: 403");

  console.log("== 2. a ficha para completar ==");
  r = await ficha(tok.local(), { matricula: 980101 });
  ok(r.status === 200 && r.body.ficha && r.body.ficha.matricula === 980101 && r.body.ficha.nome === "Pessoa VN1 E2E98" && r.body.ficha.congregacao === C.VN && r.body.ficha.nascimento === "1988-07-21",
    "a local abre a ficha de Vila Nova", r.body);
  ok(r.body.proxima && r.body.proxima.matricula === 980102, "a próxima vem junto", r.body.proxima);
  ok(r.body.andamento && r.body.andamento.vieram === 8 && r.body.andamento.completadas === 1, "o andamento da congregação dela", r.body.andamento);
  const fora = await ficha(tok.outra(), { matricula: 980101 });
  const naoExiste = await ficha(tok.outra(), { matricula: 999999 });
  ok(igualNao(fora) && igualNao(naoExiste), "fora do escopo e inexistente: a mesma resposta", [fora, naoExiste]);
  ok(igualNao(await ficha(tok.local(), { matricula: 980301 })), "a local não abre a de outra área");
  ok(igualNao(await ficha(tok.local(), { matricula: 980401 })), "a local não abre a sem congregação");
  ok(igualNao(await ficha(tok.extensao(), { matricula: 980101 })), "a concessão da extensão não abre a de fora da extensão");
  r = await ficha(tok.extensao(), { matricula: 980106 });
  ok(r.body.ficha && r.body.ficha.matricula === 980106, "a concessão da extensão abre a da extensão", r.body);
  r = await ficha(tok.local(), { matricula: 980107 });
  ok(r.status === 409 && r.body.sucesso === false && /já foi completad/.test(r.body.mensagem), "a já completada: 409", r.body);
  r = await ficha(tok.local(), { matricula: 980501 });
  ok(r.status === 409 && /não está no arrolamento/.test(r.body.mensagem), "a ficha que não veio do sistema pago: 409", r.body);
  ok(igualNao(await ficha(tok.local(), { matricula: 980108 })), "a desligada não aparece");
  r = await ficha(tok.local(), { congregacaoId: cong.VN, depois: 980104 });
  ok(r.body.ficha && r.body.ficha.matricula === 980105, "pular: a seguinte pela matrícula", r.body.ficha);
  r = await ficha(tok.local(), { congregacaoId: cong.VN, depois: 980106 });
  ok(r.body.ficha && r.body.ficha.matricula === 9809, "depois da última, volta para a primeira", r.body.ficha);
  r = await ficha(tok.local(), { congregacaoId: cong.VN });
  ok(r.body.ficha && r.body.ficha.matricula === 9809, "sem 'depois': a primeira", r.body.ficha);
  r = await ficha(tok.local(), { congregacaoId: cong.OU });
  ok(r.status === 200 && r.body.ficha === null, "a congregação de fora: nenhuma ficha", r.body);
  // G3 (decisão dele de 24/11/2026): sem congregação não há importação. A fila "das sem congregação" não existe mais; a ficha de antes da regra, aberta pela
  // matrícula, diz que não se completa por aqui (só quem a vê: a Geral; para os outros, a mesma resposta de "não encontrada")
  r = await ficha(tok.geral(), { semCongregacao: 1 });
  ok(r.status === 400 && !r.body.ficha, "a fila das sem congregação não existe mais (nem para a Geral): 400", r.body);
  r = await ficha(tok.geral(), { matricula: 980401 });
  ok(r.status === 409 && /sem congregação/.test(r.body.mensagem) && /avise o suporte/.test(r.body.mensagem) && !/escolhe/.test(r.body.mensagem) && !r.body.ficha,
    "a ficha sem congregação de antes da regra: 409, sem o formulário e sem prometer a escolha", r.body);
  const prox = await arrol(tok.geral());
  ok(!prox.body.proximas.some((p) => p.matricula === 980401), "as 4 próximas da Geral não trazem a ficha que não se completa", prox.body.proximas);
  for (const query of [{}, { matricula: "abc" }, { matricula: "0" }, { congregacaoId: "x" }, { congregacaoId: cong.VN, depois: "-3" }]) {
    r = await ficha(tok.local(), query);
    ok(r.status === 400 || igualNao(r), `ficha com ${JSON.stringify(query)}: 400 ou não encontrada, sem 500`, r.status);
  }

  console.log("== 3. completar ==");
  let antes = await retrato();
  r = await completar(tok.outra(), 980101, comunhao);
  ok(igualNao(r), "a congregação de outra área não completa (a mesma resposta de 'não existe')", r.body);
  r = await completar(tok.outra(), 999999, comunhao);
  ok(igualNao(r), "matrícula que não existe: a mesma resposta");
  ok(await retrato() === antes, "nada mudou");
  r = await completar(tok.importada(), 9809, comunhao);
  ok(r.status === 403 && /própria ficha/.test(r.body.mensagem) && (await sit(9809)) === "ARROLAMENTO", "ninguém completa a própria ficha", r.body);
  r = await completar(tok.local(), 980101, comunhao);
  ok(r.status === 200 && r.body.sucesso === true && /em comunhão \(na Assembleia, vota com 18 anos e 90 dias de entrada\)/.test(r.body.mensagem),
    "a secretaria de Vila Nova completa: em comunhão, e o recado diz a regra do voto na Assembleia (sem 'ganhou o voto')", r.body);
  let f = await um("SELECT SituacaoMembro, FormaAdmissao, CONVERT(varchar(10), DataAdmissao, 120) AS DataAdmissao, CargoMinisterial FROM MembroReferencia WHERE MembroId = 980101");
  ok(f.SituacaoMembro === "EM_COMUNHAO" && f.FormaAdmissao === "BATISMO" && f.DataAdmissao === "2009-03-12" && !f.CargoMinisterial, "a ficha gravada com a data de verdade", f);
  let p = await pend(980101);
  ok(p.Situacao === "RESOLVIDA" && p.Resolucao === "COMPLETADA" && p.ResolvidaPor === 9802, "a pendência resolvida por quem completou", p);
  ok((await escalar("SELECT COUNT(*) FROM AuditLog WHERE Tabela = N'MembroReferencia' AND RegistroId = N'980101' AND Acao = N'Completou o arrolamento' AND UsuarioId = 9802")) === 1, "a trilha registra quem completou");
  ok(r.body.proxima && r.body.proxima.matricula === 980102, "e diz a próxima", r.body.proxima);
  antes = await retrato();
  r = await completar(tok.local(), 980101, comunhao);
  ok(r.status === 409 && /já foi completad/.test(r.body.mensagem) && (await retrato()) === antes, "a segunda vez: 409, nada muda", r.body);

  // A3, regra dele de 24/11/2026: a função eclesiástica (auxiliar ... pastor) só a Câmara de liderança e a academia; a secretaria local e a da área nunca.
  // O arrolamento não grava função em nenhum nível: o pedido com função é recusado inteiro e nada muda.
  const CAMARA = /só a Câmara de liderança e a academia mudam: o arrolamento não grava função/;
  for (const [quem, t, mat, funcao] of [["a área", tok.area(), 980201, "PRESBITERO"], ["a local", tok.local(), 980102, "PASTOR"], ["a Geral", tok.geral(), 980201, "DIACONO"]]) {
    antes = await retrato();
    r = await completar(t, mat, { ...comunhao, cargoMinisterial: funcao, formaAdmissao: "CARTA_MUDANCA", dataAdmissao: "2001-05-01" });
    ok(r.status === 400 && CAMARA.test(r.body.mensagem) && (await retrato()) === antes && (await sit(mat)) === "ARROLAMENTO",
      `${quem} não grava a função ${funcao} no arrolamento: 400, nada muda`, r.body);
  }
  r = await completar(tok.area(), 980201, { ...comunhao, formaAdmissao: "CARTA_MUDANCA", dataAdmissao: "2001-05-01" });
  ok(r.status === 200 && r.body.sucesso === true, "a área completa em Cidade Jardim, sem função (o serviço não para)", r.body);
  ok(!(await escalar("SELECT CargoMinisterial FROM MembroReferencia WHERE MembroId = 980201")) && (await escalar("SELECT COUNT(*) FROM CargosMinisteriaisHistorico WHERE MembroId = 980201")) === 0,
    "nenhuma função gravada, nenhum histórico de cargo aberto");
  r = await salvar(980201, { cargoMinisterial: "PASTOR" }, tok.area());
  ok(r.status === 403 && !(await escalar("SELECT CargoMinisterial FROM MembroReferencia WHERE MembroId = 980201")), "depois de completar, o cadastro antigo continua sem deixar a área trocar o cargo", r.body);
  // a função que a ficha já tem aparece para ler (o nome do catálogo); sem função, nada
  await q("UPDATE MembroReferencia SET CargoMinisterial = N'DIACONO' WHERE MembroId = 980103");
  r = await ficha(tok.local(), { matricula: 980103 });
  ok(r.body.ficha && r.body.ficha.funcao === "Diácono", "a ficha mostra a função que já tem, só para ler", r.body.ficha);
  await q("UPDATE MembroReferencia SET CargoMinisterial = NULL WHERE MembroId = 980103");
  r = await ficha(tok.local(), { matricula: 980102 });
  ok(r.body.ficha && r.body.ficha.funcao === null, "sem função: a ficha vem com a função vazia", r.body.ficha);

  r = await completar(tok.area(), 980301, comunhao);
  ok(igualNao(r), "a área não completa a de outra área");
  r = await completar(tok.outra(), 980301, { situacao: "SEM_COMUNHAO", formaAdmissao: "CARTA_MUDANCA", dataAdmissao: "2015-01-10" });
  ok(r.status === 200 && (await sit(980301)) === "SEM_COMUNHAO" && /sem comunhão/i.test(r.body.mensagem), "a outra congregação completa a sua, sem comunhão (sem voto)", r.body);
  r = await completar(tok.geral(), 980302, { situacao: "CONGREGADO" });
  f = await um("SELECT SituacaoMembro, FormaAdmissao, DataAdmissao FROM MembroReferencia WHERE MembroId = 980302");
  ok(r.status === 200 && f.SituacaoMembro === "CONGREGADO" && f.FormaAdmissao === null && f.DataAdmissao === null, "a Geral completa em qualquer lugar: congregado, sem forma nem data", [r.body, f]);
  r = await completar(tok.geral(), 980102, { ...comunhao, congregacaoId: cong.CJ });
  ok(r.status === 400 && /transferência/.test(r.body.mensagem) && (await sit(980102)) === "ARROLAMENTO", "a ficha que tem congregação não muda de congregação por aqui", r.body);

  // G3: a congregação nunca vem no completar, e a ficha sem congregação (de antes da regra) não se completa por aqui, nem pela Geral
  r = await completar(tok.depto(), 980401, comunhao);
  ok(r.status === 409 && /sem congregação/.test(r.body.mensagem) && (await sit(980401)) === "ARROLAMENTO", "a sem congregação: quem vê a Igreja toda não completa (409)", r.body);
  r = await completar(tok.geral(), 980401, comunhao);
  ok(r.status === 409 && /sem congregação/.test(r.body.mensagem) && (await sit(980401)) === "ARROLAMENTO", "a sem congregação: nem a Geral completa (409)", r.body);
  for (const congregacaoId of [cong.CJ, 99999999]) {
    r = await completar(tok.geral(), 980401, { ...comunhao, congregacaoId });
    ok(r.status === 400 && /transferência/.test(r.body.mensagem) && (await sit(980401)) === "ARROLAMENTO"
      && (await escalar("SELECT CongregacaoId FROM MembroReferencia WHERE MembroId = 980401")) === null, `a congregação ${congregacaoId} no pedido: recusada, nada muda`, r.body);
  }

  ok(igualNao(await completar(tok.extensao(), 980102, comunhao)), "a concessão da extensão não completa a de fora dela");
  r = await completar(tok.extensao(), 980106, comunhao);
  ok(r.status === 200 && (await sit(980106)) === "EM_COMUNHAO", "a concessão da extensão completa a da extensão", r.body);
  ok((await completar(null, 980102, comunhao)).status === 401, "sem sessão: 401");
  ok((await completar(tok.membro(), 980102, comunhao)).status === 403, "o membro comum: 403");
  ok((await completar(tok.semPermissao(), 980102, comunhao)).status === 403, "sem a permissão de pessoas: 403");

  console.log("== 3. o que se manda errado ==");
  for (const [corpo, padrao] of [[{ ...comunhao, situacao: "ARROLAMENTO" }, /situação/i], [{ ...comunhao, formaAdmissao: "OUTRA" }, /como a pessoa entrou/i],
    [{ ...comunhao, dataAdmissao: "2099-01-01" }, /depois de hoje/], [{ ...comunhao, dataAdmissao: "1980-01-01" }, /antes do nascimento/], [{ ...comunhao, cargoMinisterial: "XPTO" }, /função/i],
    [{ situacao: "CONGREGADO", cargoMinisterial: "DIACONO" }, CAMARA]]) {
    antes = await retrato();
    r = await completar(tok.local(), 980102, corpo);
    ok(r.status === 400 && padrao.test(r.body.mensagem) && (await retrato()) === antes, `recusado sem mexer no banco: ${r.body && r.body.mensagem}`, r.body);
  }
  let quebras = 0, mudou = 0;
  for (const campo of ["matricula", "situacao", "formaAdmissao", "dataAdmissao", "cargoMinisterial", "congregacaoId"]) for (const lixo of LIXO) {
    const corpo = { matricula: 980102, ...comunhao };
    if (lixo === undefined) delete corpo[campo]; else corpo[campo] = lixo;
    antes = await retrato();
    r = await chamarRota("Arrolamento/index.js", { metodo: "POST", token: tok.local(), binding: { acao: "completar" }, corpo });
    if (r.status === 500 || r.status === 0 || /SELECT |UPDATE |mssql|tedious|node_modules/.test(JSON.stringify(r.body))) quebras++;
    if (r.status >= 400 && (await retrato()) !== antes) mudou++;
    if (r.status === 200) await q("UPDATE MembroReferencia SET SituacaoMembro = N'ARROLAMENTO' WHERE MembroId = 980102; UPDATE FichasPendencias SET Situacao = N'ABERTA', Resolucao = NULL, ResolvidaEm = NULL, ResolvidaPor = NULL WHERE MembroId = 980102 AND Tipo = N'ARROLAMENTO'");
  }
  ok(quebras === 0, "lixo em todo campo: nenhuma 500 nem texto interno", quebras);
  ok(mudou === 0, "o recusado nunca mexe no banco", mudou);
  ok((await chamarRota("Arrolamento/index.js", { metodo: "POST", token: tok.local(), binding: { acao: "completar" }, corpo: "x" })).status === 400, "corpo que não é objeto: 400");
  ok((await chamarRota("Arrolamento/index.js", { metodo: "DELETE", token: tok.local(), binding: { acao: "completar" } })).status === 405, "outro método: 405");

  console.log("== 4. a corrida: a local, a área e a Geral na mesma ficha, cada uma com a sua conexão ==");
  const corpoCorrida = (forma) => ({ matricula: 980103, ...comunhao, formaAdmissao: forma });
  const res = await disparar([{ quem: "local", corpo: corpoCorrida("BATISMO") }, { quem: "area", corpo: corpoCorrida("ACLAMACAO") }, { quem: "geral", corpo: corpoCorrida("RECONCILIACAO") },
    { quem: "local", corpo: corpoCorrida("CARTA_MUDANCA") }]);
  const vencedores = res.filter((x) => x.ok && x.status === 200 && x.sucesso === true);
  ok(res.every((x) => x.ok && (x.status === 200 || x.status === 409)), "cada processo terminou com 200 ou 409 (nenhum 500)", res);
  ok(vencedores.length === 1, "uma completa, as outras levam 409", res);
  ok((await escalar("SELECT COUNT(*) FROM AuditLog WHERE Tabela = N'MembroReferencia' AND RegistroId = N'980103' AND Acao = N'Completou o arrolamento'")) === 1, "uma linha só na trilha");
  p = await pend(980103);
  ok(p.Situacao === "RESOLVIDA", "a pendência resolvida uma vez", p);

  console.log("== 5. o cadastro e o importador antigos não mexem no grupo ==");
  r = await salvar(980104, { situacaoMembro: "EM_COMUNHAO", telefone: "91988887777" }, tok.local());
  ok(r.status === 200 && r.body.sucesso !== false && (await sit(980104)) === "ARROLAMENTO" && (await pend(980104)).Situacao === "ABERTA", "o cadastro antigo grava o telefone, mas a pessoa continua no grupo (só completando sai)", r.body);
  ok((await escalar("SELECT Telefone FROM MembroReferencia WHERE MembroId = 980104")) === "91988887777", "o telefone foi gravado");
  r = await salvar(980501, { situacaoMembro: "ARROLAMENTO" }, tok.geral());
  ok(r.body.sucesso === false && /sistema pago/.test(r.body.mensagem) && (await sit(980501)) === "EM_COMUNHAO", "ninguém põe uma ficha no grupo pelo cadastro", r.body);
  r = await chamarRota("ImportarPessoas/index.js", { metodo: "POST", token: tok.geral(), corpo: { linhas: [{ membroId: 980105, nome: "Pessoa VN5 E2E98", situacaoMembro: "EM_COMUNHAO", sobrescrever: true }, { membroId: 980501, nome: "Pessoa Antiga E2E98", situacaoMembro: "ARROLAMENTO", sobrescrever: true }] } });
  ok((await sit(980105)) === "ARROLAMENTO" && (await sit(980501)) === "EM_COMUNHAO", "nem pelo importador antigo", [r.status, r.body]);

  console.log("== o painel depois ==");
  rs = await resumo(tok.local());
  ok(rs.arrolamento === 4, "Vila Nova: faltam 4 (a secretária importada, a 2, a 4 e a 5)", rs.arrolamento);
  r = await arrol(tok.local());
  ok(r.body.andamento.faltam === rs.arrolamento && r.body.andamento.vieram === 8, "o andamento bate com o número do painel", [r.body.andamento, rs.arrolamento]);
  fim("e2e-98 completar o arrolamento");
}

// ---------------------------------------------------------------- os processos da corrida (um processo = uma conexão; todos esperam o mesmo instante)
async function filho() {
  const spec = JSON.parse(process.argv[3]);
  const { chamarRota } = require("./lib-afm");
  await obterPool();
  const espera = spec.t0 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  try {
    const r = await chamarRota("Arrolamento/index.js", { metodo: "POST", token: tok[spec.quem](), binding: { acao: "completar" }, corpo: spec.corpo });
    const b = r.body || {};
    process.stdout.write("@@RESULTADO@@" + JSON.stringify({ ok: true, status: r.status, sucesso: b.sucesso, mensagem: b.mensagem }) + "\n");
  } catch (e) {
    process.stdout.write("@@RESULTADO@@" + JSON.stringify({ ok: false, erro: e && e.message }) + "\n");
  }
  L.shimEncerrar();
}
async function disparar(specs) {
  const { spawn } = require("child_process");
  const t0 = Date.now() + 7000 + specs.length * 800;
  return Promise.all(specs.map((s, i) => new Promise((resolve) => {
    const p = spawn(process.execPath, ["-r", L.path.join(__dirname, "shim-mssql.js"), __filename, "filho", JSON.stringify({ n: i, t0, ...s })], { env: process.env });
    let saida = ""; p.stdout.on("data", (d) => { saida += d; });
    p.on("exit", () => { const m = saida.split("\n").find((l) => l.startsWith("@@RESULTADO@@")); resolve(m ? JSON.parse(m.slice(13)) : { ok: false, erro: "sem resultado" }); });
  })));
}

if (process.argv[2] === "filho") filho();
else principal().catch((e) => { console.error(e); process.exitCode = 1; L.shimEncerrar(); });
