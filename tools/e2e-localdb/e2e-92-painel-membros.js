// e2e-92-painel-membros.js — o PAINEL EXECUTIVO do módulo Membros (FASE 10, v10.1b passo 7a, 18/11/2026): GET /api/pessoas?resumo=1 contra o SQL Server de
// verdade (a consulta com GROUPING SETS, a idade calculada no banco, o batismo no Espírito Santo dos marcos, as entradas e saídas dos 6 meses) e os filtros
// novos da lista em páginas (?falta=, ?rol=). A prova compara cada número da rota com um gabarito contado direto no banco, para a Geral e para o dirigente
// de uma congregação (o escopo vale no painel também). Roda sobre a base cenario-178 (`BASE=cenario-178 bash rodar.sh roteiro e2e-92-painel-membros.js`);
// monta o próprio cenário.
process.env.AUTH_SECRET = "segredo-do-painel-de-membros-no-banco-" + "x".repeat(24);
const L = require("./lib");
const { ok, fim, q, escalar, obterPool } = L;

const PERM = ["pessoas"];
const fator = () => ({ via: "CHAVE", em: Date.now() });
const tokenLider = (escopo, extra = {}) => L.sessao(9201, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: escopo, permissoes: PERM, ...extra });
const tokenGeral = () => L.sessao(9202, { via: "SENHA", fator: fator(), nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: PERM });

async function principal() {
  const { chamarRota } = require("./lib-afm");
  const { hojeBrasilia } = require("../../api/shared/dataBrasilia");
  await obterPool();
  const pedir = (token, query) => chamarRota("GestaoPessoas/index.js", { metodo: "GET", token, query: query || {} });
  const hoje = hojeBrasilia();
  const mesAtual = hoje.slice(0, 7);
  // uma data dentro do mês 2 meses atrás (dia 10, para não cair fora do mês)
  const doisMesesAtras = (() => { const [a, m] = mesAtual.split("-").map(Number); const d = new Date(Date.UTC(a, m - 3, 10)); return d.toISOString().slice(0, 10); })();
  const anosAtras = (n) => `${Number(hoje.slice(0, 4)) - n}${hoje.slice(4)}`;

  console.log("== o cenário: uma congregação nova com 14 pessoas de situações, idades e cadastros diferentes ==");
  const area = (await q("INSERT INTO Areas (Nome) VALUES (N'Área Painel E2E92'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const cong = (await q("INSERT INTO Congregacoes (Nome, AreaId) VALUES (N'Painel E2E92', @a); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { a: area }))[0].id;
  const dep = (await q("SELECT TOP 1 DepartamentoId AS id FROM Departamentos ORDER BY DepartamentoId"))[0];
  const depId = dep ? dep.id : null;
  // [id, situacao, status, nascimento, cpf, email, departamento, sexo, admissao, forma, saida]
  const pessoas = [
    [920001, "EM_COMUNHAO", "ATIVO", anosAtras(40), "52998224725", "a@exemplo.org", depId, "F", `${mesAtual}-01`, "BATISMO", null],
    [920002, "EM_COMUNHAO", "ATIVO", anosAtras(8), null, null, null, "M", `${mesAtual}-01`, "CARTA_MUDANCA", null],
    [920003, "EM_COMUNHAO", "ATIVO", anosAtras(15), null, "c@exemplo.org", depId, "F", doisMesesAtras, "BATISMO", null],
    [920004, "CONGREGADO", "ATIVO", anosAtras(22), null, null, null, null, null, null, null],
    [920005, "CONGREGADO", "ATIVO", null, null, "e@exemplo.org", depId, "M", null, null, null],
    [920006, "SEM_COMUNHAO", "ATIVO", anosAtras(65), "11144477735", "f@exemplo.org", depId, "F", null, null, null],
    [920007, "EM_COMUNHAO", "ATIVO", anosAtras(31), null, null, depId, "M", null, null, null],
    [920008, "EM_COMUNHAO", "LICENÇA", anosAtras(45), null, "h@exemplo.org", null, "F", null, null, null],
    [920009, "EM_COMUNHAO", "ATIVO", anosAtras(19), null, null, null, "M", null, null, null],
    [920010, "EM_COMUNHAO", "ATIVO", anosAtras(12), null, "j@exemplo.org", null, "F", null, null, null],
    // fora do rol: não contam no painel (mas a saída conta no movimento)
    [920011, "EM_COMUNHAO", "DESLIGADO", anosAtras(50), null, null, null, "M", null, null, doisMesesAtras],
    [920012, "EM_COMUNHAO", "FALECIDO", anosAtras(90), null, null, null, "F", null, null, `${mesAtual}-01`],
    [920013, "EM_COMUNHAO", "ATIVO", anosAtras(33), null, null, null, "M", null, null, null],
    [920014, "CONGREGADO", "ATIVO", anosAtras(5), null, null, null, "F", null, null, null]
  ];
  for (const [id, sit, st, nasc, cpf, email, d, sexo, adm, forma, saida] of pessoas) {
    await q(`INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, Cpf, Email, DepartamentoId, Sexo, DataAdmissao, FormaAdmissao, DataSaida)
             VALUES (@id, @n, @c, @st, @sit, @nasc, @cpf, @em, @d, @sexo, @adm, @forma, @saida)`,
      { id, n: `Pessoa ${id} E2E92`, c: cong, st, sit, nasc, cpf, em: email, d, sexo, adm, forma, saida });
  }
  // o batismo nas águas de 3 e o batismo no Espírito Santo de 2 (o marco)
  await q("UPDATE MembroReferencia SET DataBatismo = '2010-05-05' WHERE MembroId IN (920001, 920003, 920006)");
  const temMarcos = (await escalar("SELECT COUNT(*) FROM sys.tables WHERE name = 'MarcosMembro'")) === 1;
  if (temMarcos) {
    for (const id of [920001, 920006]) {
      await q("INSERT INTO MarcosMembro (MembroId, Tipo, Descricao, DataMarco) VALUES (@id, N'BATISMO_ESPIRITO_SANTO', N'Batismo no Espírito Santo', '2012-01-01')", { id });
    }
  }
  ok((await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE MembroId BETWEEN 920001 AND 920014")) === 14, "14 pessoas do roteiro gravadas");
  ok(temMarcos, "a tabela dos marcos (batismo no Espírito Santo) existe");

  console.log("== o painel do dirigente: só a congregação dele, cada número contra o gabarito ==");
  const r = await pedir(tokenLider(["Painel E2E92"]), { resumo: "1" });
  ok(r.status === 200 && r.body && r.body.sucesso === true, "dirigente: 200 com o painel", JSON.stringify(r.body).slice(0, 300));
  const p = (r.body && r.body.resumo) || {};
  ok(p.total === 12, "rol = 12 (os 14 menos o desligado e o falecido)", String(p.total));
  ok(p.emComunhao === 8 && p.congregados === 3 && p.semComunhao === 1, "por situação: 8 em comunhão, 3 congregados, 1 sem comunhão", JSON.stringify([p.emComunhao, p.congregados, p.semComunhao]));
  ok(p.semCpf === 10, "sem CPF: 10", String(p.semCpf));
  ok(p.semNascimento === 1, "sem nascimento: 1", String(p.semNascimento));
  ok(p.semContato === 6, "sem e-mail nem celular: 6", String(p.semContato));
  ok(p.semSexo === 1, "sem sexo: 1", String(p.semSexo));
  const depsGab = depId ? 5 : 0;
  ok(p.semDepartamento === 12 - depsGab, `sem departamento: ${12 - depsGab}`, String(p.semDepartamento));
  ok(p.completos === (depId ? 2 : 0), "cadastro completo (CPF, nascimento, contato, departamento e sexo): as 2 com tudo", String(p.completos));
  ok(p.batizadosAguas === 3, "batizados nas águas: 3", String(p.batizadosAguas));
  ok(p.batizadosEspirito === 2, "batizados no Espírito Santo (o marco): 2", String(p.batizadosEspirito));
  ok(p.novosNoMes === 2 && p.mesAtual === mesAtual, "novos no mês: 2 (admissão neste mês)", JSON.stringify([p.novosNoMes, p.mesAtual]));
  ok(JSON.stringify(p.novosPorForma) === JSON.stringify([{ forma: "por batismo", n: 1 }, { forma: "por carta", n: 1 }])
    || JSON.stringify(p.novosPorForma) === JSON.stringify([{ forma: "por carta", n: 1 }, { forma: "por batismo", n: 1 }]), "os novos do mês pela forma de entrada", JSON.stringify(p.novosPorForma));
  const mov = new Map((p.movimento || []).map((x) => [x.mes, x]));
  ok((p.movimento || []).length === 6 && mov.get(mesAtual) && mov.get(mesAtual).entradas === 2 && mov.get(mesAtual).saidas === 1,
    "o mês atual no movimento: 2 entradas e 1 saída (o falecimento)", JSON.stringify(mov.get(mesAtual)));
  const mesDois = doisMesesAtras.slice(0, 7);
  ok(mov.get(mesDois) && mov.get(mesDois).entradas === 1 && mov.get(mesDois).saidas === 1, "dois meses atrás: 1 entrada e 1 saída (o desligamento)", JSON.stringify(mov.get(mesDois)));
  const faixa = new Map((p.grupos && p.grupos.faixa || []).map((g) => [g.nome, g.total]));
  ok(faixa.get("Crianças (até 11)") === 2 && faixa.get("Adolescentes (12 a 17)") === 2 && faixa.get("Jovens (18 a 29)") === 2
    && faixa.get("Adultos (30 a 59)") === 4 && faixa.get("60 anos ou mais") === 1 && faixa.get("Sem data de nascimento") === 1,
  "as faixas de idade calculadas no banco (o aniversário de hoje já conta)", JSON.stringify([...faixa]));
  const sexo = new Map((p.grupos && p.grupos.sexo || []).map((g) => [g.nome, g.total]));
  ok(sexo.get("Mulheres") === 6 && sexo.get("Homens") === 5 && sexo.get("Sem sexo informado") === 1, "por sexo: 6 mulheres, 5 homens, 1 sem informar", JSON.stringify([...sexo]));
  const congs = (p.grupos && p.grupos.congregacao) || [];
  ok(congs.length === 1 && congs[0].nome === "Painel E2E92" && congs[0].total === 12, "por congregação: só a dele", JSON.stringify(congs));
  const somaDeps = ((p.grupos && p.grupos.departamento) || []).reduce((s, g) => s + g.total, 0);
  ok(somaDeps === 12, "os departamentos somam o rol", String(somaDeps));
  const esPorDep = ((p.grupos && p.grupos.departamento) || []).reduce((s, g) => s + g.es, 0);
  ok(esPorDep === 2, "o recorte (Espírito Santo) somado nos departamentos bate com o total", String(esPorDep));
  ok(!JSON.stringify(r.body).includes("E2E92 Pessoa") && !JSON.stringify(r.body).includes("Pessoa 9200"), "o painel não traz o nome de ninguém");

  console.log("== a Geral vê o campo inteiro; o escopo vazio vê zero ==");
  const g = await pedir(tokenGeral(), { resumo: "1" });
  const rolGab = await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE ISNULL(Status, N'ATIVO') NOT IN (N'DESLIGADO', N'FALECIDO')");
  ok(g.status === 200 && g.body.resumo.total === rolGab, `Geral: o rol inteiro (${rolGab})`, String(g.body && g.body.resumo && g.body.resumo.total));
  const esGab = await escalar("SELECT COUNT(*) FROM MembroReferencia m WHERE ISNULL(m.Status, N'ATIVO') NOT IN (N'DESLIGADO', N'FALECIDO') AND EXISTS (SELECT 1 FROM MarcosMembro mm WHERE mm.MembroId = m.MembroId AND mm.Tipo = N'BATISMO_ESPIRITO_SANTO')");
  ok(g.body.resumo.batizadosEspirito === esGab, `Geral: batizados no Espírito Santo (${esGab})`, String(g.body.resumo.batizadosEspirito));
  const congsGeral = g.body.resumo.congregacoes || [];
  ok(congsGeral.some((c) => c.congregacaoId === cong && c.nome === "Painel E2E92" && c.total === 12), "Geral: a lista das congregações traz a do roteiro com o id e o rol");
  const so = await pedir(tokenGeral(), { resumo: "1", congregacaoId: String(cong) });
  ok(so.status === 200 && so.body.resumo.total === 12 && so.body.resumo.batizadosEspirito === 2 && so.body.resumo.novosNoMes === 2,
    "Geral escolhendo a congregação: os mesmos números do dirigente", JSON.stringify(so.body.resumo && [so.body.resumo.total, so.body.resumo.batizadosEspirito]));
  const fora = await pedir(tokenLider(["Painel E2E92"]), { resumo: "1", congregacaoId: String(cong + 99999) });
  ok(fora.status === 200 && fora.body.resumo.total === 0, "dirigente pedindo outra congregação: zero (o escopo vale junto)", JSON.stringify(fora.body).slice(0, 200));
  const ruimCong = await pedir(tokenGeral(), { resumo: "1", congregacaoId: "1 OR 1=1" });
  ok(ruimCong.status === 400, "congregação inválida no painel: 400");
  const v = await pedir(tokenLider([]), { resumo: "1" });
  ok(v.status === 200 && v.body.resumo.total === 0 && v.body.resumo.movimento.length === 6, "escopo vazio: painel zerado");
  const outra = await pedir(tokenLider(["Congregação que não existe E2E92"]), { resumo: "1" });
  ok(outra.status === 200 && outra.body.resumo.total === 0, "congregação que não existe: zero (nunca o campo inteiro)", JSON.stringify(outra.body).slice(0, 200));

  console.log("== a lista em páginas: o que falta e o rol ==");
  const lista = (query) => pedir(tokenLider(["Painel E2E92"]), { pagina: 1, porPagina: 100, ...query });
  const semCpf = await lista({ falta: "cpf", rol: "1" });
  ok(semCpf.status === 200 && semCpf.body.total === 10 && semCpf.body.itens.every((x) => !x.cpfMascarado), "falta CPF no rol: as 10", String(semCpf.body.total));
  const semContato = await lista({ falta: "contato", rol: "1" });
  ok(semContato.body.total === 6, "falta contato no rol: as 6", String(semContato.body.total));
  const semNasc = await lista({ falta: "nascimento", rol: "1" });
  ok(semNasc.body.total === 1 && semNasc.body.itens[0].membroId === 920005, "falta nascimento: só a 920005");
  const semSexo = await lista({ falta: "sexo" });
  ok(semSexo.body.total === 1 && semSexo.body.itens[0].membroId === 920004, "falta sexo: só a 920004");
  const rol = await lista({ rol: "1" });
  ok(rol.body.total === 12, "só o rol: 12", String(rol.body.total));
  const saidas = await lista({ rol: "saidas" });
  ok(saidas.body.total === 2 && saidas.body.itens.map((x) => x.membroId).sort().join() === "920011,920012", "só quem saiu: o desligado e o falecido");
  const todos = await lista({});
  ok(todos.body.total === 14, "sem ?rol: todos, como antes (14)", String(todos.body.total));
  const ruim = await lista({ falta: "cpf) OR (1=1" });
  ok(ruim.status === 400, "filtro do que falta desconhecido: 400");
  for (const lixo of L.LIXO.slice(0, 15)) {
    const x = await pedir(tokenGeral(), { pagina: 1, falta: lixo, rol: lixo });
    ok([200, 400].includes(x.status), `entrada estranha não derruba a rota (${String(JSON.stringify(lixo)).slice(0, 30)})`, String(x.status));
    const y = await pedir(tokenGeral(), { resumo: lixo });
    ok([200, 400].includes(y.status), `resumo com lixo não derruba a rota (${String(JSON.stringify(lixo)).slice(0, 30)})`, String(y.status));
  }

  fim("e2e-92 (painel de membros no banco)");
  L.shimEncerrar();
}

principal().catch((e) => { console.error(e); process.exitCode = 1; L.shimEncerrar(); });
