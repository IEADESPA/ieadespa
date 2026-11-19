// e2e-93-juntar-fichas.js — JUNTAR FICHAS REPETIDAS (FASE 10, v10.1b passo 6, migração 179, 18/11/2026), contra o SQL Server de verdade: a lista das duplas
// (mesmo nome e nascimento, sem acento e sem maiúscula; as marcadas; as que alguém disse "não são a mesma"), a comparação só com o que é diferente (CPF e
// contato mascarados, o motivo disciplinar escondido), quem fica (a mais antiga), o escopo por nível (local, área, Geral; fora = não existe), o que impede
// (transferência, sugestão, a própria ficha, registro reservado, liderança nas duas), a junção de verdade (as linhas movidas, os conflitos arquivados e
// descartados, a ligação entre as duas, o gatilho imutável que volta ligado, a credencial cancelada e renumerada, as sessões que caem, o dízimo, o número no
// próximo cadastro, a trilha, o histórico da ficha que não vaza para o número reaproveitado), desfazer, a falha no meio que não deixa nada pela metade, as
// pendências e o bloqueio da credencial física, o alerta da assembleia e da votação geral, o lixo nos campos e as corridas com vários processos node (a mesma
// dupla quatro vezes, A→B × B→A, duas duplas com a mesma ficha, junção × edição campo a campo, junção × presença nova).
// Roda sobre a base cenario-179 (`bash rodar.sh preparar-179` e depois `BASE=cenario-179 bash rodar.sh roteiro e2e-93-juntar-fichas.js`); monta o próprio
// cenário. E2E_RCSI=1 liga o READ_COMMITTED_SNAPSHOT (como no Azure SQL).
process.env.AUTH_SECRET = "segredo-do-juntar-fichas-" + "x".repeat(24);
const { spawn } = require("child_process");
const L = require("./lib");
const { ok, fim, q, escalar, obterPool, path, LIXO } = L;

const PERM = ["pessoas"];
const fator = () => ({ via: "CHAVE", em: Date.now() });
const C = { VN: "Vila Nova E2E93", CJ: "Cidade Jardim E2E93", BP: "Bairro da Paz E2E93" };
const tok = {
  geral: () => L.sessao(9301, { via: "SENHA", fator: fator(), nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: PERM }),
  geralDisc: () => L.sessao(9307, { via: "SENHA", fator: fator(), nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["pessoas", "disciplina", "reunioes", "assembleia", "enquetes"] }),
  vn: () => L.sessao(9302, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: [C.VN], permissoes: PERM }),
  cj: () => L.sessao(9303, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: [C.CJ], permissoes: PERM }),
  area1: () => L.sessao(9304, { via: "SENHA", fator: fator(), nivel: "AREA", escopoCongregacoes: [C.VN, C.CJ], permissoes: PERM }),
  bp: () => L.sessao(9305, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: [C.BP], permissoes: PERM }),
  semPessoas: () => L.sessao(9306, { via: "SENHA", fator: fator(), nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["reunioes"] })
};
function cpfDe(base9) {
  const d = String(base9).padStart(9, "0").split("").map(Number);
  const dv = (arr) => { const n = arr.length + 1; const s = arr.reduce((acc, x, i) => acc + x * (n - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(d); const d2 = dv([...d, d1]);
  return [...d, d1, d2].join("");
}

// ---------------------------------------------------------------- os processos das corridas
async function filho() {
  const spec = JSON.parse(process.argv[3]);
  const { chamarRota } = require("./lib-afm");
  await obterPool();
  const espera = spec.t0 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  try {
    let res;
    if (spec.sql) {
      try { await q(spec.sql, spec.params || {}); res = { status: 200, body: { sucesso: true } }; } catch (e) { res = { status: 409, body: { sucesso: false, mensagem: String(e.message).slice(0, 120) } }; }
    } else {
      res = await chamarRota(spec.rota, { metodo: spec.metodo || "POST", token: tok[spec.quem](), binding: spec.binding || {}, corpo: spec.corpo || {}, query: spec.query || {} });
    }
    const b = res.body || {};
    process.stdout.write("@@RESULTADO@@" + JSON.stringify({ ok: true, status: res.status, sucesso: b.sucesso, mensagem: b.mensagem }) + "\n");
  } catch (e) {
    process.stdout.write("@@RESULTADO@@" + JSON.stringify({ ok: false, erro: e && e.message }) + "\n");
  }
  L.shimEncerrar();
}
async function disparar(specs) {
  const t0 = Date.now() + 7000 + specs.length * 800;
  return Promise.all(specs.map((s, i) => new Promise((resolve) => {
    const p = spawn(process.execPath, ["-r", path.join(__dirname, "shim-mssql.js"), __filename, "filho", JSON.stringify({ n: i, t0, ...s })], { env: process.env });
    let saida = ""; p.stdout.on("data", (d) => { saida += d; });
    p.on("exit", () => { const m = saida.split("\n").find((l) => l.startsWith("@@RESULTADO@@")); resolve(m ? JSON.parse(m.slice(13)) : { ok: false, erro: "sem resultado" }); });
  })));
}

async function principal() {
  const { chamarRota } = require("./lib-afm");
  await obterPool();
  const F = (quem, acao, { metodo = "GET", corpo, query } = {}) => chamarRota("FichasRepetidas/index.js", { metodo, token: tok[quem](), binding: { acao }, corpo: corpo || {}, query: query || {} });
  const lista = (quem) => F(quem, "");
  const comparar = (quem, a, b) => F(quem, "comparar", { query: { a, b } });
  const juntar = async (quem, a, b, escolhas, versao) => {
    let v = versao;
    if (v === undefined) { const c = await comparar(quem, a, b); v = c.body && c.body.versao; }
    return F(quem, "juntar", { metodo: "POST", corpo: { a, b, escolhas: escolhas || {}, versao: v } });
  };
  const existe = async (id) => Number(await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE MembroId = @id", { id })) === 1;
  const rcsi = process.env.E2E_RCSI === "1";
  if (rcsi) {
    await q("ALTER DATABASE CURRENT SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE");
    ok((await escalar("SELECT CAST(is_read_committed_snapshot_on AS INT) FROM sys.databases WHERE name = DB_NAME()")) === 1, "READ_COMMITTED_SNAPSHOT ligado (como o Azure SQL)");
  }

  console.log("== a migração 179 (aplicada duas vezes no preparo) ==");
  ok(await escalar("SELECT COUNT(*) FROM sys.tables WHERE name IN ('FichasPendencias', 'JuncoesFichas', 'JuncoesFichasArquivo')") === 3, "as três tabelas novas");
  ok(await escalar("SELECT COUNT(*) FROM sys.indexes WHERE name IN ('UX_FichasPendencias_Aberta', 'IX_FichasPendencias_Situacao', 'IX_FichasPendencias_Outro', 'IX_JuncoesFichas_Fica', 'IX_JuncoesFichas_Sai', 'IX_JuncoesFichasArquivo_Juncao')") === 6, "os índices");

  console.log("== o cenário: duas áreas, três congregações e as fichas repetidas ==");
  const a1 = (await q("INSERT INTO Areas (Nome) VALUES (N'Área 1 E2E93'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const a2 = (await q("INSERT INTO Areas (Nome) VALUES (N'Área 2 E2E93'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const cong = {};
  for (const [k, nome, area] of [["VN", C.VN, a1], ["CJ", C.CJ, a1], ["BP", C.BP, a2]]) {
    cong[k] = (await q("INSERT INTO Congregacoes (Nome, AreaId) VALUES (@n, @a); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { n: nome, a: area }))[0].id;
  }
  const ficha = (id, nome, c, extra = {}) => q(`INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, DataAdmissao, FormaAdmissao,
      Telefone, Email, Cpf, NomeMae, Sexo, EstadoCivil, CriadoEm)
    VALUES (@id, @nome, @c, N'ATIVO', N'EM_COMUNHAO', @nasc, @adm, N'BATISMO', @tel, @email, @cpf, @mae, @sexo, @ec, @criado)`,
    { id, nome, c, nasc: extra.nasc || "1990-03-14", adm: extra.adm === undefined ? "2015-04-12" : extra.adm, tel: extra.tel || null, email: extra.email || null,
      cpf: extra.cpf || null, mae: extra.mae || null, sexo: extra.sexo || "F", ec: extra.ec || "CASADO", criado: extra.criado || "2020-01-01" });
  const CPF_ANA = cpfDe(931000001);
  // a dupla principal (VN × VN): a 930100 (2015) e a 930500 (2026), com nome escrito diferente e acento
  await ficha(930100, "Ana Beatriz Moreira", cong.VN, { tel: "(91) 98888-7777", email: "ana.antiga@exemplo.org", mae: "Lúcia Moreira", criado: "2015-01-10" });
  await ficha(930500, "ANA BEATRIZ MOREIRA", cong.VN, { tel: "(91) 97777-1212", email: "ana.nova@exemplo.org", cpf: CPF_ANA, mae: "Lúcia Moreira", criado: "2026-03-01", adm: null });
  // uma dupla entre congregações da mesma área (VN × CJ) e uma entre áreas (VN × BP)
  await ficha(930200, "João Carlos Pereira", cong.VN, { nasc: "1985-07-20", sexo: "M" });
  await ficha(930600, "Joao Carlos Pereira", cong.CJ, { nasc: "1985-07-20", sexo: "M" });
  await ficha(930300, "Maria de Fátima Lima", cong.VN, { nasc: "1970-11-02" });
  await ficha(930700, "Maria de Fatima Lima", cong.BP, { nasc: "1970-11-02" });
  // parecidas mas NÃO repetidas (nascimento diferente)
  await ficha(930400, "Ana Beatriz Moreira", cong.VN, { nasc: "1991-03-14" });
  // a ficha de uma terceira pessoa (parente) e a ficha da própria secretaria (9302 também é ficha, para a trava do "próprio")
  await ficha(930900, "Parente Teste E2E93", cong.VN, { nasc: "1960-01-01" });
  await ficha(9302, "Secretária VN E2E93", cong.VN, { nasc: "1980-01-01" });
  await ficha(930950, "Secretaria VN e2e93", cong.VN, { nasc: "1980-01-01" });
  await ficha(9307, "Secretário Geral E2E93", cong.BP, { nasc: "1975-01-01", sexo: "M" });

  console.log("== a lista das duplas, por nível ==");
  const pares = (r) => ((r.body && r.body.itens) || []).map((x) => `${x.a}-${x.b}`);
  const lvn = pares(await lista("vn"));
  ok(lvn.includes("930100-930500"), "a local vê a dupla da congregação dela (sem acento e sem maiúscula)", lvn);
  ok(!lvn.includes("930200-930600") && !lvn.includes("930300-930700"), "a local NÃO vê as duplas com uma ficha de fora", lvn);
  ok(!lvn.some((p) => p.includes("930400")), "nascimento diferente não é dupla");
  const lar = pares(await lista("area1"));
  ok(lar.includes("930100-930500") && lar.includes("930200-930600") && !lar.includes("930300-930700"), "a área vê as da área (não a que tem uma ficha de outra área)", lar);
  const lge = pares(await lista("geral"));
  ok(lge.includes("930100-930500") && lge.includes("930200-930600") && lge.includes("930300-930700"), "a Geral vê todas", lge);
  ok(pares(await lista("bp")).length === 0, "BP não vê nenhuma (a dupla dela tem a outra ficha fora)");
  const sem = await lista("semPessoas");
  ok(sem.status === 403, "sem a permissão \"pessoas\": 403", sem.status);

  console.log("== a comparação: só o que é diferente, quem fica, CPF e contato mascarados ==");
  const c1 = await comparar("vn", 930500, 930100);
  const b1 = c1.body || {};
  ok(b1.sucesso && b1.fica && b1.fica.matricula === 930100 && b1.sai.matricula === 930500, "fica a mais antiga (930100), mesmo pedindo na ordem trocada", b1.fica);
  const campos1 = (b1.campos || []).map((x) => x.campo);
  ok(campos1.includes("nome") && campos1.includes("telefone") && campos1.includes("email") && campos1.includes("cpf") && campos1.includes("dataAdmissao"), "os campos diferentes aparecem", campos1);
  ok(!campos1.includes("nomeMae") && !campos1.includes("dataNascimento") && !campos1.includes("congregacao"), "os iguais NÃO aparecem (só contados)", campos1);
  ok(b1.iguais > 10, "os iguais contados", b1.iguais);
  const txt1 = JSON.stringify(b1);
  ok(!txt1.includes(CPF_ANA) && !txt1.includes(CPF_ANA.slice(0, 9)), "o CPF inteiro não aparece em lugar nenhum da resposta");
  ok(!txt1.includes("ana.nova@exemplo.org") && !txt1.includes("97777-1212") && !txt1.includes("977771212"), "o e-mail e o celular saem mascarados");
  const nome1 = b1.campos.find((x) => x.campo === "nome");
  ok(nome1 && nome1.pode === false && /Geral/.test(nome1.motivo || ""), "o nome: a secretaria local não escolhe (só a Geral)", nome1);
  const cpf1 = b1.campos.find((x) => x.campo === "cpf");
  ok(cpf1 && cpf1.pode === true && cpf1.sugerido === "SAI", "o CPF vazio na que fica: a local preenche com o da outra (sugerido)", cpf1);
  ok(Array.isArray(b1.previa) && typeof b1.versao === "string" && b1.versao.length >= 16, "a prévia e a versão");
  ok(b1.podeJuntar === true && (b1.bloqueios || []).length === 0, "nada impede ainda", b1.bloqueios);
  const fora = await comparar("vn", 930300, 930700);
  const inexistente = await comparar("vn", 930300, 939999);
  ok(fora.status === 404 && inexistente.status === 404 && fora.body.mensagem === inexistente.body.mensagem, "fora do escopo e inexistente: a mesma resposta", [fora.status, inexistente.status]);
  ok((await comparar("vn", 930100, 930100)).status === 400, "a mesma ficha duas vezes: 400");
  ok((await comparar("cj", 930200, 930600)).status === 404, "a local de CJ não alcança a ficha de VN: não existe");
  ok((await comparar("area1", 930200, 930600)).body.sucesso === true, "a área compara as duas fichas da área");
  ok((await comparar("area1", 930300, 930700)).status === 404, "a área não compara com uma ficha de outra área");
  ok((await comparar("geral", 930300, 930700)).body.sucesso === true, "a Geral compara entre áreas");
  const proprio = await comparar("vn", 9302, 930950);
  ok(proprio.body.sucesso && !proprio.body.podeJuntar && /própria/.test(proprio.body.bloqueios.join(" ")), "a própria ficha: não junta", proprio.body.bloqueios);

  console.log("== o que impede: transferência, sugestão, registro reservado, liderança nas duas ==");
  await q(`INSERT INTO TransferenciasCongregacao (MembroId, CongregacaoOrigemId, CongregacaoDestinoId, Regra, PedidoComo, PedidoPor) VALUES (930600, @cj, @vn, N'MESMA_AREA', N'ORIGEM', 9303)`, { cj: cong.CJ, vn: cong.VN });
  let cb = (await comparar("area1", 930200, 930600)).body;
  ok(!cb.podeJuntar && /transferência/.test(cb.bloqueios.join(" ")), "transferência pendente impede", cb.bloqueios);
  const rj = await juntar("area1", 930200, 930600);
  ok(rj.status === 422 && (await existe(930600)), "e a junção é recusada (nada muda)", rj.status);
  await q("DELETE FROM TransferenciasCongregacao WHERE MembroId = 930600");
  await q("INSERT INTO SolicitacoesEdicaoPessoa (MembroId) VALUES (930600)");
  cb = (await comparar("area1", 930200, 930600)).body;
  ok(!cb.podeJuntar && /sugest/.test(cb.bloqueios.join(" ")), "sugestão pendente impede", cb.bloqueios);
  await q("DELETE FROM SolicitacoesEdicaoPessoa WHERE MembroId = 930600");
  await q("INSERT INTO ProcessosDisciplinares (MembroId, DataAbertura, Status) VALUES (930600, '2026-01-10', N'EM_ANDAMENTO')");
  cb = (await comparar("area1", 930200, 930600)).body;
  ok(!cb.podeJuntar && /Secretaria Geral/.test(cb.bloqueios.join(" ")), "registro reservado (disciplina): a área não junta", cb.bloqueios);
  ok(!JSON.stringify(cb).match(/disciplin|processo disciplinar|EM_ANDAMENTO/i), "e a mensagem não diz que é processo disciplinar");
  const cbg = (await comparar("geral", 930200, 930600)).body;
  ok(cbg.podeJuntar === true, "a Geral pode juntar mesmo assim", cbg.bloqueios);
  await q("DELETE FROM ProcessosDisciplinares WHERE MembroId = 930600");
  await q("INSERT INTO Lideranca (MembroId, Tipo, Escopo) VALUES (930200, N'Teste', N'x'), (930600, N'Teste', N'x')");
  cb = (await comparar("geral", 930200, 930600)).body;
  ok(!cb.podeJuntar && /liderança/.test(cb.bloqueios.join(" ")), "liderança nas duas: bloqueia (encerre a da que sai)", cb.bloqueios);
  await q("DELETE FROM Lideranca WHERE MembroId IN (930200, 930600)");

  console.log("== a junção de verdade (VN × VN pela local), com as linhas de muitas tabelas ==");
  const tvf = Number(await escalar("SELECT TipoVinculoId FROM TiposVinculoFamiliar WHERE Codigo = N'IRMAO'"));
  const s1 = (await q("INSERT INTO Sessoes (OrgaoId, Descricao, DataSessao, Status) VALUES (2, N'Reunião 1 E2E93', '2026-02-01', N'ENCERRADA'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const s2 = (await q("INSERT INTO Sessoes (OrgaoId, Descricao, DataSessao, Status) VALUES (2, N'Reunião 2 E2E93', '2026-03-01', N'ENCERRADA'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  // a mesma presença nas duas fichas (s1: conflito, vai para o arquivo) e uma só da que sai (s2: anda)
  await q("INSERT INTO Presencas (SessaoId, MembroId, Presente) VALUES (@s1, 930100, 1), (@s1, 930500, 1), (@s2, 930500, 1)", { s1, s2 });
  // vínculos: a que sai é irmã da parente (anda) e as duas fichas estão ligadas uma à outra (vai para o arquivo)
  await q("INSERT INTO VinculosFamiliares (MembroId, MembroParenteId, TipoVinculoId) VALUES (930500, 930900, @t), (930100, 930500, @t)", { t: tvf });
  // dizimista ativo nas duas, na mesma congregação (fica o mais antigo)
  await q("INSERT INTO Dizimistas (CongregacaoId, Nome, MembroId, Ativo) VALUES (@c, N'Ana A', 930100, 1), (@c, N'Ana B', 930500, 1)", { c: cong.VN });
  // credencial válida nas duas, via 1 (a da que sai é cancelada e renumerada)
  await q(`INSERT INTO CredenciaisEclesiasticas (MembroId, Via, Codigo, Situacao, EmitidaEm, EmitidaPor) VALUES (930100, 1, N'E93CODIGOFICA001', N'VALIDA', SYSUTCDATETIME(), 9301),
           (930500, 1, N'E93CODIGOSAI0001', N'VALIDA', SYSUTCDATETIME(), 9301)`);
  // sessão aberta da que sai; PIN nas duas (o da que sai é descartado)
  await q("INSERT INTO SessoesAtivas (MembroId, DispositivoInfo) VALUES (930500, N'teste')");
  await q("INSERT INTO MembroPins (MembroId, PinHash) VALUES (930100, N'hashfica'), (930500, N'hashsai')");
  // tabela com gatilho IMUTÁVEL: o consentimento de comunicação da que sai
  await q(`INSERT INTO ComunicacaoConsentimentos (MembroId, Canal, Categoria, Concedido, Origem, TextoVersao, TextoHash) VALUES (930500, N'EMAIL', N'EVENTOS', 1, N'MEU_PAINEL', N'v1', REPLICATE(N'a', 64))`);
  // a trilha da que sai (o histórico da ficha)
  await q(`INSERT INTO AuditLog (Tabela, RegistroId, Acao, UsuarioId, DadosAntes, DadosDepois) VALUES (N'MembroReferencia', 930500, N'Mudou celular (campo a campo)', 9302, N'{"telefone":"1"}', N'{"telefone":"2"}')`);
  // uma pendência REPETIDA entre as duas (marcada antes) e uma de ARROLAMENTO em cada
  await q(`INSERT INTO FichasPendencias (MembroId, Tipo, OutroMembroId, Origem) VALUES (930500, N'REPETIDA', 930100, N'MARCADA');
           INSERT INTO FichasPendencias (MembroId, Tipo, Origem) VALUES (930500, N'ARROLAMENTO', N'IMPORTACAO'), (930100, N'ARROLAMENTO', N'IMPORTACAO')`);
  const antesGatilhos = await escalar("SELECT COUNT(*) FROM sys.triggers WHERE is_disabled = 1");
  const c2 = (await comparar("vn", 930100, 930500)).body;
  ok(c2.podeJuntar === true, "pode juntar", c2.bloqueios);
  ok(c2.arquivadas === 2 && c2.descartadas === 1, "a prévia: 2 linhas guardadas à parte (a presença repetida e o vínculo entre as duas) e 1 descartada (o PIN)", [c2.arquivadas, c2.descartadas]);
  const rotulos = (c2.previa || []).map((p) => p.rotulo);
  ok(rotulos.includes("presenças em reuniões") && rotulos.includes("credencial"), "a prévia mostra as partes pelo nome", rotulos);
  ok(!JSON.stringify(c2.previa).match(/Comunicacao|AuditLog|Consentimento[A-Z]/), "nenhum nome de tabela cru na prévia");
  // escolher o nome (travado para a local) é recusado
  const rNome = await juntar("vn", 930100, 930500, { nome: "SAI" }, c2.versao);
  ok(rNome.status === 403 && (await existe(930500)), "escolher o nome (só a Geral) é recusado e nada muda", rNome.status);
  // versão velha
  const rVelha = await juntar("vn", 930100, 930500, {}, "versao-velha-123456");
  ok(rVelha.status === 409 && (await existe(930500)), "versão velha: 409 e nada muda", rVelha.status);
  const rOk = await juntar("vn", 930100, 930500, { telefone: "SAI", cpf: "SAI", email: "FICA" }, c2.versao);
  ok(rOk.body && rOk.body.sucesso && rOk.body.fica === 930100 && rOk.body.sai === 930500, "juntou", rOk.body && rOk.body.mensagem);
  const juncaoId = rOk.body && rOk.body.juncaoId;
  ok(!(await existe(930500)), "a ficha que saiu não existe mais");
  ok(Number(await escalar("SELECT COUNT(*) FROM MatriculasLivres WHERE MembroId = 930500 AND JuntadaCom = 930100")) === 1, "o número que saiu está livre para o próximo cadastro");
  const f = (await q("SELECT Telefone, Email, Cpf, Nome FROM MembroReferencia WHERE MembroId = 930100"))[0];
  ok(f.Telefone === "(91) 97777-1212" && f.Email === "ana.antiga@exemplo.org" && f.Cpf === CPF_ANA && f.Nome === "Ana Beatriz Moreira", "a ficha que fica com o que foi escolhido (celular e CPF da outra; e-mail e nome dela)", f);
  ok(Number(await escalar("SELECT COUNT(*) FROM Presencas WHERE MembroId = 930100")) === 2, "as presenças: a repetida ficou uma só e a outra andou");
  ok(Number(await escalar("SELECT COUNT(*) FROM VinculosFamiliares WHERE MembroId = 930100 AND MembroParenteId = 930900")) === 1, "o vínculo com a parente andou");
  ok(Number(await escalar("SELECT COUNT(*) FROM VinculosFamiliares WHERE MembroId = MembroParenteId")) === 0, "nenhum vínculo da pessoa com ela mesma");
  ok(Number(await escalar("SELECT COUNT(*) FROM JuncoesFichasArquivo WHERE JuncaoId = @j", { j: juncaoId })) === 2, "as 2 linhas guardadas inteiras no arquivo");
  ok(Number(await escalar("SELECT COUNT(*) FROM Dizimistas WHERE MembroId = 930100 AND Ativo = 1")) === 1, "um só cadastro de dizimista ativo");
  const creds = await q("SELECT Via, Situacao, Codigo FROM CredenciaisEclesiasticas WHERE MembroId = 930100 ORDER BY Via");
  ok(creds.length === 2 && creds[0].Situacao === "VALIDA" && creds[0].Codigo === "E93CODIGOFICA001" && creds[1].Via === 2 && creds[1].Situacao === "CANCELADA",
    "a credencial da que saiu: cancelada e renumerada (via 2); a da que fica continua", creds);
  ok(Number(await escalar("SELECT COUNT(*) FROM SessoesAtivas WHERE MembroId = 930100 AND DispositivoInfo = N'teste' AND Encerrada = 1")) === 1, "a sessão aberta da que saiu foi encerrada (e andou)");
  ok((await escalar("SELECT PinHash FROM MembroPins WHERE MembroId = 930100")) === "hashfica", "o PIN da que fica continua (o da outra foi descartado)");
  ok(Number(await escalar("SELECT COUNT(*) FROM ComunicacaoConsentimentos WHERE MembroId = 930100")) === 1, "a linha da tabela com gatilho imutável andou");
  ok(Number(await escalar("SELECT COUNT(*) FROM sys.triggers WHERE is_disabled = 1")) === antesGatilhos, "nenhum gatilho ficou desligado");
  ok(Number(await escalar("SELECT COUNT(*) FROM FichasPendencias WHERE Situacao = N'ABERTA' AND (MembroId = 930100 OR OutroMembroId = 930100) AND Tipo = N'REPETIDA'")) === 0, "a pendência de ficha repetida entre as duas foi resolvida");
  ok(Number(await escalar("SELECT COUNT(*) FROM FichasPendencias WHERE Situacao = N'ABERTA' AND MembroId = 930100 AND Tipo = N'ARROLAMENTO'")) === 1, "o arrolamento: uma só pendência aberta (a repetida foi resolvida)");
  // (nada mais aponta para 930500: a chave estrangeira de cada uma das ~420 colunas recusaria o DELETE da ficha se sobrasse algo — e ela foi apagada)
  const trilha = await q("SELECT Tabela, Acao, UsuarioId, DadosAntes, DadosDepois FROM AuditLog WHERE (Tabela = N'MembroReferencia' AND RegistroId = 930100) OR (Tabela = N'JuncoesFichas' AND RegistroId = @j) ORDER BY AuditId DESC", { j: juncaoId });
  ok(trilha.some((t) => t.Tabela === "MembroReferencia" && /Juntou a ficha 930500/.test(t.Acao) && t.UsuarioId === 9302), "a trilha na ficha que fica, com quem juntou");
  ok(trilha.some((t) => t.Tabela === "JuncoesFichas"), "e a trilha da junção");
  ok(!JSON.stringify(trilha).includes(CPF_ANA), "o CPF inteiro não vai para a trilha");
  const reg = (await q("SELECT * FROM JuncoesFichas WHERE JuncaoId = @j", { j: juncaoId }))[0];
  ok(reg && reg.MatriculaFica === 930100 && reg.MatriculaSai === 930500 && reg.Escopo === "LOCAL" && reg.JuntadaPor === 9302 && reg.Movimentos && reg.FichaSai, "o registro da junção para conferir e desfazer");
  // o histórico da ficha que ficou mostra o da que saiu
  const alt = await chamarRota("EdicaoFicha/index.js", { metodo: "GET", token: tok.vn(), binding: { membroId: "930100", acao: "alteracoes" } });
  ok(alt.body && alt.body.itens.some((i) => i.daFichaJuntada === 930500 && /celular/.test(i.acao)), "o histórico da que ficou traz o da que saiu (marcado)", alt.body && alt.body.itens.map((i) => i.acao));
  // a lista: a dupla sumiu
  ok(!pares(await lista("vn")).includes("930100-930500"), "a dupla saiu da lista");

  console.log("== o número que saiu vai para o próximo cadastro, e o histórico antigo não vaza para a pessoa nova ==");
  const novo = await chamarRota("GestaoPessoas/index.js", { metodo: "POST", token: tok.vn(), corpo: { gerarMatricula: true, nome: "Pessoa Nova E2E93", congregacaoId: cong.VN, status: "ATIVO",
    situacaoMembro: "CONGREGADO", dataNascimento: "2000-05-05" } });
  ok(novo.body && novo.body.sucesso && novo.body.membro && novo.body.membro.membroId === 930500, "o próximo cadastro recebeu o 930500", novo.body && novo.body.mensagem);
  const altNovo = await chamarRota("EdicaoFicha/index.js", { metodo: "GET", token: tok.vn(), binding: { membroId: "930500", acao: "alteracoes" } });
  ok(altNovo.body && altNovo.body.itens.every((i) => !/celular/.test(i.acao)), "a pessoa nova NÃO vê a trilha da ficha antiga com o mesmo número", altNovo.body && altNovo.body.itens.map((i) => i.acao));
  // desfazer agora não dá (o número foi dado a outra pessoa)
  const dz = await F("geral", "desfazer", { metodo: "POST", corpo: { juncaoId, motivo: "teste do desfazer" } });
  ok(dz.status === 409 && /outra pessoa/.test(dz.body.mensagem), "desfazer com o número já reaproveitado: recusado", dz.body && dz.body.mensagem);

  console.log("== desfazer (a Geral), voltando tudo como era ==");
  // outra dupla para desfazer: a 930200 × 930600 (área), com linhas em várias tabelas
  await q("INSERT INTO Presencas (SessaoId, MembroId, Presente) VALUES (@s1, 930200, 1), (@s1, 930600, 1), (@s2, 930600, 0)", { s1, s2 });
  await q("INSERT INTO VinculosFamiliares (MembroId, MembroParenteId, TipoVinculoId) VALUES (930600, 930900, @t)", { t: tvf });
  await q(`INSERT INTO CredenciaisEclesiasticas (MembroId, Via, Codigo, Situacao, EmitidaEm, EmitidaPor) VALUES (930200, 1, N'E93CODIGOFICA002', N'VALIDA', SYSUTCDATETIME(), 9301),
           (930600, 1, N'E93CODIGOSAI0002', N'VALIDA', SYSUTCDATETIME(), 9301)`);
  await q("UPDATE CredenciaisEclesiasticas SET Situacao = N'CANCELADA', EncerradaEm = SYSUTCDATETIME(), EncerradaPor = 9301, MotivoEncerramento = N'teste' WHERE Codigo = N'E93CODIGOSAI0002'");
  await q(`INSERT INTO FichasPendencias (MembroId, Tipo, OutroMembroId, Origem) VALUES (930600, N'REPETIDA', 930200, N'MARCADA')`);
  const retratoDupla = async () => JSON.stringify([
    await q("SELECT PresencaId, SessaoId, MembroId, Presente FROM Presencas WHERE MembroId IN (930200, 930600) ORDER BY PresencaId"),
    await q("SELECT VinculoId, MembroId, MembroParenteId FROM VinculosFamiliares WHERE MembroId IN (930200, 930600) OR MembroParenteId IN (930200, 930600) ORDER BY VinculoId"),
    await q("SELECT CredencialId, MembroId, Via, Situacao FROM CredenciaisEclesiasticas WHERE MembroId IN (930200, 930600) ORDER BY CredencialId"),
    await q("SELECT PendenciaId, MembroId, Situacao FROM FichasPendencias WHERE MembroId IN (930200, 930600) ORDER BY PendenciaId"),
    await q("SELECT MembroId, Nome, Telefone, Email, Cpf, CongregacaoId, DataNascimento, DataAdmissao FROM MembroReferencia WHERE MembroId IN (930200, 930600) ORDER BY MembroId")
  ]);
  const antesDupla = await retratoDupla();
  const c3 = (await comparar("area1", 930200, 930600)).body;
  const r3 = await juntar("area1", 930200, 930600, { congregacao: "SAI" }, c3.versao);
  ok(r3.body && r3.body.sucesso, "a área juntou VN × CJ (escolhendo a congregação da outra)", r3.body && r3.body.mensagem);
  ok(Number(await escalar("SELECT CongregacaoId FROM MembroReferencia WHERE MembroId = 930200")) === cong.CJ, "a ficha que fica foi para a congregação escolhida");
  const naoGeral = await F("area1", "desfazer", { metodo: "POST", corpo: { juncaoId: r3.body.juncaoId, motivo: "teste do desfazer" } });
  ok(naoGeral.status === 403, "a área não desfaz (só a Geral)", naoGeral.status);
  ok((await F("geral", "desfazer", { metodo: "POST", corpo: { juncaoId: r3.body.juncaoId, motivo: "ab" } })).status === 400, "desfazer sem motivo: 400");
  const d3 = await F("geral", "desfazer", { metodo: "POST", corpo: { juncaoId: r3.body.juncaoId, motivo: "juntadas por engano no teste" } });
  ok(d3.body && d3.body.sucesso, "a Geral desfez", d3.body && d3.body.mensagem);
  ok(await existe(930600), "a ficha que saiu voltou");
  ok((await retratoDupla()) === antesDupla, "TUDO voltou como era (presenças com o mesmo id, vínculos, credenciais e vias, pendências e as duas fichas)");
  ok(Number(await escalar("SELECT COUNT(*) FROM MatriculasLivres WHERE MembroId = 930600")) === 0, "o número saiu da lista de livres");
  ok((await F("geral", "desfazer", { metodo: "POST", corpo: { juncaoId: r3.body.juncaoId, motivo: "de novo" } })).status === 409, "desfazer de novo: 409");
  // a ficha que ficou foi mexida depois da junção: não desfaz
  const c4 = (await comparar("geral", 930200, 930600)).body;
  const r4 = await juntar("geral", 930200, 930600, {}, c4.versao);
  ok(r4.body && r4.body.sucesso, "juntou de novo (Geral)");
  await q("UPDATE MembroReferencia SET Telefone = N'(91) 90000-0000' WHERE MembroId = 930200");
  const d4 = await F("geral", "desfazer", { metodo: "POST", corpo: { juncaoId: r4.body.juncaoId, motivo: "depois de mexer" } });
  ok(d4.status === 409 && /alterada depois/.test(d4.body.mensagem), "a ficha mexida depois: não desfaz (diz por quê)", d4.body && d4.body.mensagem);

  console.log("== a falha no meio não deixa nada pela metade ==");
  await ficha(931100, "Rui Barbosa Falha", cong.VN, { nasc: "1950-01-01", sexo: "M" });
  await ficha(931200, "Rui Barbosa Falha", cong.VN, { nasc: "1950-01-01", sexo: "M" });
  await q("INSERT INTO Presencas (SessaoId, MembroId, Presente) VALUES (@s2, 931200, 1)", { s2 });
  await q(`INSERT INTO ComunicacaoConsentimentos (MembroId, Canal, Categoria, Concedido, Origem, TextoVersao, TextoHash) VALUES (931200, N'EMAIL', N'EVENTOS', 1, N'MEU_PAINEL', N'v1', REPLICATE(N'b', 64))`);
  await q(`CREATE TRIGGER dbo.TR_E2E93_Falha ON dbo.MembroReferencia AFTER DELETE AS BEGIN IF EXISTS (SELECT 1 FROM deleted WHERE MembroId = 931200) BEGIN RAISERROR(N'falha de teste', 16, 1); ROLLBACK TRANSACTION; END END`);
  const c5 = (await comparar("vn", 931100, 931200)).body;
  const r5 = await juntar("vn", 931100, 931200, {}, c5.versao).catch((e) => ({ status: 500, body: { mensagem: e.message } }));
  ok(r5.status !== 200 || !(r5.body && r5.body.sucesso), "a junção falhou no último passo", r5.status);
  ok(await existe(931200), "a ficha que sairia continua");
  ok(Number(await escalar("SELECT COUNT(*) FROM Presencas WHERE MembroId = 931200")) === 1 && Number(await escalar("SELECT COUNT(*) FROM ComunicacaoConsentimentos WHERE MembroId = 931200")) === 1, "as linhas não andaram");
  ok(Number(await escalar("SELECT COUNT(*) FROM JuncoesFichas WHERE MatriculaSai = 931200")) === 0, "nenhum registro de junção pela metade");
  ok(Number(await escalar("SELECT COUNT(*) FROM sys.triggers WHERE is_disabled = 1")) === antesGatilhos, "nenhum gatilho ficou desligado depois da falha");
  await q("DROP TRIGGER dbo.TR_E2E93_Falha");

  console.log("== marcar, \"não são a mesma\", as pendências e a credencial física ==");
  const mk = await F("vn", "marcar", { metodo: "POST", corpo: { a: 930400, b: 930100, nota: "parecem a mesma" } });
  ok(mk.body && mk.body.sucesso, "marcou como possível repetida", mk.body && mk.body.mensagem);
  ok(pares(await lista("vn")).includes("930100-930400"), "a dupla marcada entra na lista (mesmo com nascimento diferente)");
  const pd = await F("vn", "pendencias", { query: { membroId: 930100 } });
  ok(pd.body && pd.body.impressaoFisicaBloqueada === true && pd.body.pendencias.some((p) => p.tipo === "REPETIDA" && p.outra && p.outra.matricula === 930400), "a pendência aparece nas duas e a credencial física fica bloqueada", pd.body);
  const pdf = await chamarRota("GestaoCredenciais/index.js", { metodo: "GET", token: tok.geral(), binding: { acao: "pdf" }, query: { membroId: "930100" } });
  ok(pdf.status === 409 && /pendência de cadastro/.test(pdf.body && pdf.body.mensagem), "o PDF para imprimir a credencial: bloqueado (409)", pdf.status);
  const credId = Number(await escalar("SELECT CredencialId FROM CredenciaisEclesiasticas WHERE MembroId = 930100 AND Situacao = N'VALIDA'"));
  const imp = await chamarRota("GestaoCredenciais/index.js", { metodo: "POST", token: tok.geral(), binding: { acao: "impressa" }, corpo: { credencialId: credId } });
  ok(imp.status === 409, "registrar a impressão: bloqueado", imp.status);
  const nsm = await F("vn", "nao-sao-a-mesma", { metodo: "POST", corpo: { a: 930100, b: 930400 } });
  ok(nsm.body && nsm.body.sucesso, "não são a mesma pessoa", nsm.body && nsm.body.mensagem);
  ok(!pares(await lista("vn")).includes("930100-930400"), "a dupla sai da lista");
  ok((await F("vn", "pendencias", { query: { membroId: 930100 } })).body.impressaoFisicaBloqueada === false, "e a credencial física volta a poder");
  await F("vn", "nao-sao-a-mesma", { metodo: "POST", corpo: { a: 930100, b: 930400 } });
  ok(Number(await escalar("SELECT COUNT(*) FROM FichasPendencias WHERE Resolucao = N'NAO_E_A_MESMA' AND ((MembroId = 930400 AND OutroMembroId = 930100) OR (MembroId = 930100 AND OutroMembroId = 930400))")) === 1, "dizer de novo não duplica");
  // o número a acertar
  await q("INSERT INTO FichasPendencias (MembroId, Tipo, Origem, Detalhe) VALUES (930900, N'NUMERO', N'IMPORTACAO', N'na planilha era 0')");
  const pn = Number(await escalar("SELECT PendenciaId FROM FichasPendencias WHERE MembroId = 930900 AND Tipo = N'NUMERO'"));
  ok((await F("vn", "pendencias", { query: { membroId: 930900 } })).body.impressaoFisicaBloqueada === true, "o número a acertar também bloqueia a credencial física");
  ok((await F("bp", "conferir-numero", { metodo: "POST", corpo: { pendenciaId: pn, nota: "conferido" } })).status === 404, "fora do escopo: não existe");
  ok((await F("vn", "conferir-numero", { metodo: "POST", corpo: { pendenciaId: pn, nota: "" } })).status === 400, "sem a nota: 400");
  const cn = await F("vn", "conferir-numero", { metodo: "POST", corpo: { pendenciaId: pn, nota: "conferido com a ficha de papel" } });
  ok(cn.body && cn.body.sucesso, "conferiu o número", cn.body && cn.body.mensagem);
  ok((await F("vn", "conferir-numero", { metodo: "POST", corpo: { pendenciaId: pn, nota: "de novo" } })).status === 409, "conferir de novo: 409");

  console.log("== o alerta antes da assembleia geral e da votação geral ==");
  await q("INSERT INTO FichasPendencias (MembroId, Tipo, OutroMembroId, Origem) VALUES (930700, N'REPETIDA', 930300, N'MARCADA')");
  const al = await F("geral", "alerta");
  ok(al.body && al.body.precisaConfirmar === true && al.body.contagem.repetidas >= 1, "a Geral vê o alerta (com a contagem, sem nome)", al.body);
  ok(!JSON.stringify(al.body).match(/Maria|Fatima|Fátima|9307|9303/), "o alerta não traz nome nem matrícula");
  ok((await F("vn", "alerta")).status === 403, "a local não vê o alerta do campo inteiro");
  const sAg = (await q(`INSERT INTO Sessoes (OrgaoId, Descricao, DataSessao, Status, DataPrevista) VALUES (1, N'AGO E2E93', CAST(SYSUTCDATETIME() AS DATE), N'CONVOCADA', CAST(SYSUTCDATETIME() AS DATE));
                         SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`))[0].id;
  await q("UPDATE Sessoes SET Status = N'ENCERRADA' WHERE Status = N'ABERTA' AND SessaoId <> @s", { s: sAg });
  const ab1 = await chamarRota("AbrirReuniao/index.js", { metodo: "POST", token: tok.geralDisc(), corpo: { sessaoId: sAg, senhaAcesso: "1234" } });
  ok(ab1.body && ab1.body.sucesso === false && ab1.body.precisaConfirmar === true && (await escalar("SELECT Status FROM Sessoes WHERE SessaoId = @s", { s: sAg })) === "CONVOCADA",
    "abrir a assembleia geral com cadastro pendente: pede confirmação e NÃO abre", ab1.body);
  const ab2 = await chamarRota("AbrirReuniao/index.js", { metodo: "POST", token: tok.geralDisc(), corpo: { sessaoId: sAg, senhaAcesso: "1234", confirmarCadastrosPendentes: true } });
  ok(ab2.body && ab2.body.sucesso === true && (await escalar("SELECT Status FROM Sessoes WHERE SessaoId = @s", { s: sAg })) === "ABERTA", "confirmando, abre", ab2.body && ab2.body.mensagem);
  ok(/abriuComCadastrosPendentes/.test(await escalar("SELECT TOP 1 DadosDepois FROM AuditLog WHERE Tabela = N'Sessoes' AND RegistroId = @s ORDER BY AuditId DESC", { s: sAg }) || ""), "a escolha ficou na trilha");
  await q("UPDATE Sessoes SET Status = N'ENCERRADA' WHERE SessaoId = @s", { s: sAg });
  const enq = (conf) => chamarRota("GestaoEnquetes/index.js", { metodo: "POST", token: tok.geralDisc(), corpo: { titulo: "Votação E2E93", publicoTipo: "TODOS_ATIVOS", visibilidade: "SECRETA",
    perguntas: [{ titulo: "Aprova?", tipo: "OPCOES", opcoes: ["Sim", "Não"] }], ...(conf ? { confirmarCadastrosPendentes: true } : {}) } });
  const e1 = await enq(false);
  ok(e1.body && e1.body.precisaConfirmar === true && Number(await escalar("SELECT COUNT(*) FROM Enquetes WHERE Titulo = N'Votação E2E93'")) === 0, "a votação de todos os ativos: pede confirmação e não cria", e1.body);
  const e2 = await enq(true);
  ok(e2.body && e2.body.sucesso === true, "confirmando, cria", e2.body && e2.body.mensagem);
  await q("UPDATE FichasPendencias SET Situacao = N'RESOLVIDA', Resolucao = N'NAO_E_A_MESMA', ResolvidaEm = SYSUTCDATETIME() WHERE MembroId = 930700 AND Situacao = N'ABERTA'");

  console.log("== lixo nos campos ==");
  await ficha(931300, "Lixo Teste Um", cong.VN, { nasc: "1999-09-09" });
  await ficha(931400, "Lixo Teste Um", cong.VN, { nasc: "1999-09-09" });
  const retratoLixo = async () => JSON.stringify(await q("SELECT COUNT(*) n, CHECKSUM_AGG(CHECKSUM(*)) c FROM MembroReferencia")) + JSON.stringify(await q("SELECT COUNT(*) n FROM JuncoesFichas"))
    + JSON.stringify(await q("SELECT COUNT(*) n, CHECKSUM_AGG(CHECKSUM(PendenciaId, Situacao)) c FROM FichasPendencias"));
  let quebras = [], mudou = [], chamadas = 0;
  const cLixo = (await comparar("vn", 931300, 931400)).body;
  const bases = {
    juntar: { a: 931300, b: 931400, escolhas: {}, versao: cLixo.versao },
    desfazer: { juncaoId: r4.body.juncaoId, motivo: "motivo de teste" },
    marcar: { a: 931300, b: 931400, nota: "x" }, "nao-sao-a-mesma": { a: 931300, b: 931400, nota: "x" }, "conferir-numero": { pendenciaId: pn, nota: "teste" }
  };
  for (const [acao, base] of Object.entries(bases)) {
    for (const campo of Object.keys(base)) {
      for (const lixo of LIXO) {
        const corpo = { ...base };
        if (lixo === undefined) delete corpo[campo]; else corpo[campo] = lixo;
        if (acao === "juntar" && campo === "versao" && lixo === undefined) continue;
        const antes = await retratoLixo();
        const r = await F(acao === "desfazer" ? "area1" : "vn", acao, { metodo: "POST", corpo }).catch((e) => ({ status: 500, body: { mensagem: e.message } }));
        chamadas++;
        if (r.status === 500) quebras.push(`${acao}.${campo}=${JSON.stringify(lixo).slice(0, 30)} -> 500 ${JSON.stringify(r.body).slice(0, 100)}`);
        if (r.status >= 400 && (await retratoLixo()) !== antes) mudou.push(`${acao}.${campo}=${JSON.stringify(lixo).slice(0, 30)} (${r.status}) mexeu`);
        if (r.body && /SELECT |INSERT |UPDATE |mssql|tedious|at Object/i.test(JSON.stringify(r.body))) quebras.push(`${acao}.${campo} vazou texto interno`);
      }
    }
  }
  // as escolhas com lixo em cada campo
  for (const lixo of LIXO) {
    const r = await F("vn", "juntar", { metodo: "POST", corpo: { a: 931300, b: 931400, versao: cLixo.versao, escolhas: { telefone: lixo, constructor: "SAI", __proto__: { x: 1 } } } }).catch((e) => ({ status: 500, body: { mensagem: e.message } }));
    chamadas++;
    if (r.status === 500) quebras.push(`escolhas=${JSON.stringify(lixo).slice(0, 30)} -> 500`);
    if (r.body && r.body.sucesso) { mudou.push("escolhas com lixo juntou"); break; }
  }
  for (const lixo of LIXO) {
    const r = await F("vn", "comparar", { query: { a: lixo, b: 931400 } }).catch((e) => ({ status: 500, body: { mensagem: e.message } }));
    chamadas++;
    if (r.status === 500) quebras.push(`comparar a=${JSON.stringify(lixo).slice(0, 30)} -> 500`);
  }
  ok(quebras.length === 0, `${chamadas} chamadas com lixo: nenhuma 500 nem vazamento`, quebras.slice(0, 6));
  ok(mudou.length === 0, "chamada recusada nunca mexe no banco", mudou.slice(0, 6));

  console.log("== corridas com vários processos ==");
  const rota = "FichasRepetidas/index.js";
  // 1) a mesma dupla, quatro vezes ao mesmo tempo
  await ficha(932100, "Corrida Um", cong.VN, { nasc: "1977-07-07" });
  await ficha(932200, "Corrida Um", cong.VN, { nasc: "1977-07-07" });
  await q("INSERT INTO Presencas (SessaoId, MembroId, Presente) VALUES (@s1, 932200, 1), (@s2, 932200, 1)", { s1, s2 });
  let cv = (await comparar("vn", 932100, 932200)).body.versao;
  let rr = await disparar([1, 2, 3, 4].map(() => ({ quem: "vn", rota, binding: { acao: "juntar" }, corpo: { a: 932100, b: 932200, escolhas: {}, versao: cv } })));
  ok(rr.filter((x) => x.ok && x.sucesso).length === 1 && rr.every((x) => x.ok && x.status !== 500), "a mesma dupla 4 vezes: exatamente uma junta, nenhuma 500", rr.map((x) => x.status));
  ok(Number(await escalar("SELECT COUNT(*) FROM JuncoesFichas WHERE MatriculaSai = 932200 AND Situacao = N'FEITA'")) === 1 && Number(await escalar("SELECT COUNT(*) FROM Presencas WHERE MembroId = 932100")) === 2,
    "um registro só e as presenças inteiras");
  // 2) A→B × B→A
  await ficha(932300, "Corrida Dois", cong.VN, { nasc: "1977-07-08" });
  await ficha(932400, "Corrida Dois", cong.VN, { nasc: "1977-07-08" });
  cv = (await comparar("vn", 932300, 932400)).body.versao;
  rr = await disparar([{ a: 932300, b: 932400 }, { a: 932400, b: 932300 }, { a: 932300, b: 932400 }, { a: 932400, b: 932300 }].map((p) => ({ quem: "vn", rota, binding: { acao: "juntar" }, corpo: { ...p, escolhas: {}, versao: cv } })));
  ok(rr.filter((x) => x.ok && x.sucesso).length === 1 && rr.every((x) => x.ok && x.status !== 500), "A→B e B→A ao mesmo tempo: uma só, nenhuma 500", rr.map((x) => x.status));
  ok((await existe(932300)) && !(await existe(932400)), "fica a mais antiga (932300) em qualquer ordem");
  // 3) duas duplas com a mesma ficha (A+B e A+C) ao mesmo tempo: as duas juntam (uma depois da outra)
  await ficha(932500, "Corrida Tres", cong.VN, { nasc: "1977-07-09" });
  await ficha(932600, "Corrida Tres", cong.VN, { nasc: "1977-07-09" });
  await ficha(932700, "Corrida Tres", cong.VN, { nasc: "1977-07-09" });
  await q("INSERT INTO Presencas (SessaoId, MembroId, Presente) VALUES (@s1, 932600, 1), (@s1, 932700, 1)", { s1 });
  const v56 = (await comparar("vn", 932500, 932600)).body.versao, v57 = (await comparar("vn", 932500, 932700)).body.versao;
  rr = await disparar([{ quem: "vn", rota, binding: { acao: "juntar" }, corpo: { a: 932500, b: 932600, escolhas: {}, versao: v56 } },
    { quem: "vn", rota, binding: { acao: "juntar" }, corpo: { a: 932500, b: 932700, escolhas: {}, versao: v57 } }]);
  ok(rr.every((x) => x.ok && x.status !== 500), "A+B e A+C ao mesmo tempo: nenhuma 500", rr.map((x) => [x.status, x.mensagem]));
  ok(rr.filter((x) => x.sucesso).length >= 1, "pelo menos uma juntou (a outra, se a versão da A mudou, pede para conferir de novo)", rr.map((x) => x.mensagem));
  ok(Number(await escalar("SELECT COUNT(*) FROM Presencas WHERE MembroId IN (932500, 932600, 932700) AND SessaoId = @s1", { s1 })) +
    Number(await escalar("SELECT COUNT(*) FROM JuncoesFichasArquivo a JOIN JuncoesFichas j ON j.JuncaoId = a.JuncaoId WHERE j.MatriculaFica = 932500")) === 2, "nenhuma presença perdida (as que não couberam estão no arquivo)");
  // 4) junção × a secretaria mudando um campo da ficha que fica, ao mesmo tempo
  await ficha(932800, "Corrida Quatro", cong.VN, { nasc: "1977-07-10", tel: "(91) 91111-1111" });
  await ficha(932900, "Corrida Quatro", cong.VN, { nasc: "1977-07-10", tel: "(91) 92222-2222" });
  cv = (await comparar("vn", 932800, 932900)).body.versao;
  rr = await disparar([{ quem: "vn", rota, binding: { acao: "juntar" }, corpo: { a: 932800, b: 932900, escolhas: { telefone: "SAI" }, versao: cv } },
    { quem: "area1", rota: "EdicaoFicha/index.js", binding: { membroId: "932800", acao: "campo" }, corpo: { campo: "telefone", valor: "(91) 93333-3333", valorLido: "(91) 91111-1111" } }]);
  ok(rr.every((x) => x.ok && x.status !== 500), "junção × edição campo a campo: nenhuma 500", rr.map((x) => [x.status, x.mensagem]));
  const tel = await escalar("SELECT Telefone FROM MembroReferencia WHERE MembroId = 932800");
  const juntou4 = rr[0].sucesso, editou4 = rr[1].sucesso && rr[1].status === 200 && !/Nada mudou/.test(rr[1].mensagem || "");
  ok((juntou4 && !editou4 && tel === "(91) 92222-2222") || (!juntou4 && editou4 && tel === "(91) 93333-3333") || (juntou4 && editou4 && ["(91) 92222-2222", "(91) 93333-3333"].includes(tel)),
    "uma das duas ganha, sem gravar por cima às cegas (a junção confere a versão; a edição confere o valor lido)", [juntou4, editou4, tel]);
  // 5) junção × uma presença nova gravada na ficha que sai ao mesmo tempo
  await ficha(933000, "Corrida Cinco", cong.VN, { nasc: "1977-07-11" });
  await ficha(933100, "Corrida Cinco", cong.VN, { nasc: "1977-07-11" });
  const s3 = (await q("INSERT INTO Sessoes (OrgaoId, Descricao, DataSessao, Status) VALUES (2, N'Reunião 3 E2E93', '2026-04-01', N'ENCERRADA'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  cv = (await comparar("vn", 933000, 933100)).body.versao;
  rr = await disparar([{ quem: "vn", rota, binding: { acao: "juntar" }, corpo: { a: 933000, b: 933100, escolhas: {}, versao: cv } },
    { sql: "INSERT INTO Presencas (SessaoId, MembroId, Presente) VALUES (@s, 933100, 1)", params: { s: s3 } }]);
  ok(rr.every((x) => x.ok && x.status !== 500), "junção × presença nova: nenhuma 500", rr.map((x) => [x.status, x.mensagem]));
  const orfas = Number(await escalar("SELECT COUNT(*) FROM Presencas p WHERE p.SessaoId = @s AND NOT EXISTS (SELECT 1 FROM MembroReferencia m WHERE m.MembroId = p.MembroId)", { s: s3 }));
  ok(orfas === 0, "nenhuma presença ficou apontando para uma ficha que não existe");
  ok(rr[0].sucesso ? Number(await escalar("SELECT COUNT(*) FROM Presencas WHERE SessaoId = @s AND MembroId = 933000", { s: s3 })) + (rr[1].sucesso ? 0 : 1) === 1 : true,
    "se a presença entrou antes, andou junto; se depois, foi recusada (a ficha não existe mais)", rr.map((x) => x.sucesso));

  ok(Number(await escalar("SELECT COUNT(*) FROM sys.triggers WHERE is_disabled = 1")) === antesGatilhos, "no fim: nenhum gatilho desligado");
  if (rcsi) await q("ALTER DATABASE CURRENT SET READ_COMMITTED_SNAPSHOT OFF WITH ROLLBACK IMMEDIATE");
  fim(`e2e-93 (juntar fichas${rcsi ? ", RCSI" : ""})`);
  L.shimEncerrar();
}

if (process.argv[2] === "filho") filho();
else principal().catch((e) => { console.error(e); process.exitCode = 1; L.shimEncerrar(); });
