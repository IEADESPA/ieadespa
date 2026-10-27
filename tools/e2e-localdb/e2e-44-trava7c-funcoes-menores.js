// e2e-44-trava7c-funcoes-menores.js — Trava de Revisão 7-C, DECISÃO 2 do responsável (23/10/2026): a aptidão para funções com criança FORA das escalas, em DEPARTAMENTOS e na
// LIDERANÇA (eventos ficaram fora). Handlers e banco REAIS, sobre a base "cenario-trava7c" (a 155 aplicada duas vezes).
//   - a migração 155: as marcas Departamentos/Papeis.ContatoComMenores (nascem desligadas; a União de Crianças nasce marcada) e a regra obrigatória do aviso;
//   - a nomeação (GestaoLideranca): sem aptidão, grava e AVISA, com o texto genérico (nunca o motivo da pendência reservada);
//   - o painel: a Diretoria lê o motivo, a Proteção de crianças do nível geral lê "pendência com a Diretoria", quem só marca não vê ninguém; o apto não aparece;
//   - a marca: departamento com `pessoas` e cargo com `permissoes`, do nível geral, com a confirmação reforçada (428);
//   - o aviso pelo motor: um por pessoa e função, à Diretoria e à Proteção do nível geral, nunca à própria pessoa, repetindo no mês seguinte enquanto durar.
// No 9280398 este roteiro falha: não há as marcas, a rota "funcoes", o aviso da nomeação nem a regra.
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, API, path, GERAL, LIDER, PIN, sessao, hojeBr, GET, POST } = L;
const HM = require(path.join(API, "GestaoMinisterioMenores/index.js"));
const HL = require(path.join(API, "GestaoLideranca/index.js"));
const HC = require(path.join(API, "GestaoCatalogos/index.js"));
const mmDb = require(path.join(API, "shared/ministerioMenoresDb.js"));
const mm = require(path.join(API, "shared/ministerioMenores.js"));
const fm = require(path.join(API, "shared/funcoesMenores.js"));
const fmDb = require(path.join(API, "shared/funcoesMenoresDb.js"));
const motor = require(path.join(API, "shared/notificacaoMotor.js"));
const { criarNotificacao } = require(path.join(API, "shared/notificacoes.js"));

let falhasAuditoria = 0;
const erroOriginal = console.error;
console.error = (...a) => { if (String(a[0]).includes("[AUDITORIA]")) falhasAuditoria++; if (process.env.E2E_VERBOSO) erroOriginal(...a); };

async function chamar(h, { metodo = "POST", ligado = {}, corpo, token }) {
  const ctx = { bindingData: ligado, log: Object.assign(() => { }, { error() { }, info() { }, warn() { }, verbose() { } }) };
  await h(ctx, { method: metodo, query: {}, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return ctx.res || { status: 0, body: null };
}
const DIR = () => GERAL(1002, ["vistoria_antecedentes"]);            // a Diretoria (lê o motivo)
const PROT = () => GERAL(7001, ["protecao_menores"]);               // a Proteção de crianças do nível geral (o Comitê)
const ADM_P = () => GERAL(1002, ["pessoas"]);                        // marca departamento
const ADM_PERM = () => GERAL(1002, ["permissoes"]);                  // marca cargo; nomeia
const SEM_FATOR = (perms) => sessao(1002, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() - 3600000 }, nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: perms });
const PALAVRAS_DO_MOTIVO = /inqu[ée]rito|processo criminal|auto-?den[úu]ncia|comunica[çc][ãa]o .* an[áa]lise|incidente|afastamento|cadastro nacional|restri[çc][ãa]o|comunh[ãa]o|certid|treinamento|antecedentes|AUTO_DENUNCIA|INCIDENTE|PENDENCIA_DIRETORIA/i;
const nomear = (membroId, papelId, escopoTipo, escopoId) => chamar(HL, { token: ADM_PERM(), corpo: { membroId, papelId, escopoTipo, escopoId, senha: "Senha#E2E2026" } });
const codigos = (p) => (p ? p.bloqueios.map((b) => b.codigo) : []);

(async () => {
  const pool = await obterPool();
  const hoje = hojeBr();

  console.log("== a migração 155 (a parte das funções com menores) ==");
  for (const t of ["Departamentos", "Papeis"]) ok((await escalar("SELECT COUNT(*) FROM sys.columns WHERE object_id = OBJECT_ID(@t) AND name = 'ContatoComMenores' AND is_nullable = 0", { t: "dbo." + t })) === 1, `${t}.ContatoComMenores existe (não nula)`);
  ok((await escalar("SELECT ContatoComMenores FROM Departamentos WHERE Sigla = 'UCADESPA'")) === true, "a União de Crianças nasce marcada");
  ok((await escalar("SELECT COUNT(*) FROM Departamentos WHERE Sigla <> 'UCADESPA' AND ContatoComMenores = 1")) === 0 && (await escalar("SELECT COUNT(*) FROM Papeis WHERE ContatoComMenores = 1")) === 0, "o resto nasce desligado");
  ok((await escalar("SELECT COUNT(*) FROM NotificacaoRegras WHERE Chave = 'MENORES_FUNCAO_SEM_APTIDAO' AND Obrigatoria = 1 AND PermissaoAlvo IS NULL")) === 1, "a regra do aviso, obrigatória, uma vez só");
  await q("UPDATE Departamentos SET ContatoComMenores = 0 WHERE Sigla = 'UCADESPA'");
  await pool.request().query(require("fs").readFileSync(path.join(API, "..", "sql", "migrations", "155_trava_7c_decisoes.sql"), "utf8").split(/^\s*GO\s*$/gim).filter((l) => /ContatoComMenores/.test(l) && /Departamentos/.test(l))[0]);
  ok((await escalar("SELECT ContatoComMenores FROM Departamentos WHERE Sigla = 'UCADESPA'")) === false, "rodar a migração de novo NÃO regrava a marca que a tela tirou");
  await q("UPDATE Departamentos SET ContatoComMenores = 1 WHERE Sigla = 'UCADESPA'");

  // a Marta comunica à Diretoria um inquérito (Regimento Art. 133 §5º, V): pendência reservada até a decisão — o mesmo que o e2e-40 faz com o Comitê
  await q("INSERT INTO MinisterioMenoresAutoDenuncias (MembroId, Tipo, DataCiencia) VALUES (6022, 'INQUERITO_POLICIAL', @d)", { d: hoje });
  // quem é apto e quem não é, pelo cálculo da v7.7 (nada aqui inventa aptidão)
  const ap = await mmDb.aptidaoEmLote(pool, [6010, 6011, 6012, 6024, 6013, 6022, 6016, 7001, 7002], { hoje });
  const apto = [6010, 6011, 6012, 6024].find((id) => ap.get(id) && ap.get(id).apto);
  ok(!!apto, "o cenário tem um voluntário apto", [...ap].map(([k, v]) => [k, v.apto]));
  ok(ap.get(6013) && !ap.get(6013).apto && !mm.temBloqueioReservado(ap.get(6013).bloqueios), "o Davi (certidão vencida) não está apto, sem pendência reservada", ap.get(6013) && ap.get(6013).bloqueios.map((b) => b.codigo));
  ok(ap.get(6022) && mm.temBloqueioReservado(ap.get(6022).bloqueios), "a Marta (comunicação à Diretoria em análise) tem pendência reservada", ap.get(6022) && ap.get(6022).bloqueios.map((b) => b.codigo));

  console.log("== o painel antes de qualquer nomeação ==");
  let r = await GET(HM, "funcoes", DIR());
  ok(r.status === 200 && r.body.resumo && r.body.resumo.ocupantes === 0 && r.body.inaptos.length === 0, "ninguém ocupa função marcada ainda", r.body.resumo);
  ok(r.body.departamentos.find((d) => d.sigla === "UCADESPA").contatoComMenores === true, "a lista mostra a União de Crianças marcada");

  console.log("== a nomeação: grava e avisa, sem o motivo ==");
  r = await nomear(6013, 9, "DEPARTAMENTO", 1);
  ok(r.body.sucesso === true && /não está apto para função com menores/.test(r.body.mensagem) && r.body.avisoMenores, "o Davi é nomeado Líder da União de Crianças: grava e a tela avisa", r.body);
  ok((await escalar("SELECT COUNT(*) FROM Lideranca WHERE MembroId = 6013 AND EscopoTipo = 'DEPARTAMENTO' AND EscopoId = 1")) === 1, "a nomeação não foi impedida");
  ok(/"avisoFuncaoComMenores":true/.test((await um("SELECT TOP 1 DadosDepois FROM AuditLog WHERE Tabela = 'Lideranca' AND RegistroId = 6013 ORDER BY AuditId DESC")).DadosDepois), "a trilha registra que o aviso foi dado");
  r = await nomear(6022, 9, "DEPARTAMENTO", 1);
  ok(r.body.sucesso === true && r.body.avisoMenores && !/inqu[ée]rito|auto-?den|processo|an[áa]lise|INCIDENTE|AUTO_DENUNCIA/i.test(r.body.avisoMenores), "a Marta (pendência reservada): o MESMO texto genérico, nada do motivo a quem nomeia", r.body.mensagem);
  r = await nomear(apto, 9, "DEPARTAMENTO", 1);
  ok(r.body.sucesso === true && r.body.mensagem === "✅ Liderança registrada." && !r.body.avisoMenores, "quem está apto: sem aviso", r.body);
  r = await nomear(6016, 9, "DEPARTAMENTO", 2);
  ok(r.body.mensagem === "✅ Liderança registrada.", "departamento sem a marca (Mocidade): sem aviso", r.body);

  console.log("== o painel: a Diretoria lê o motivo; a Proteção, \"pendência com a Diretoria\"; quem só marca não vê ninguém ==");
  r = await GET(HM, "funcoes", DIR());
  let lista = r.body.inaptos;
  ok(lista.map((p) => p.membroId).sort().join() === "6013,6022" && r.body.resumo.ocupantes === 3, "a Diretoria vê o Davi e a Marta (o apto não aparece; a Gabi está num departamento sem marca)", r.body.resumo);
  ok(codigos(lista.find((p) => p.membroId === 6022)).includes("AUTO_DENUNCIA_EM_ANALISE"), "a Diretoria lê o motivo reservado", codigos(lista.find((p) => p.membroId === 6022)));
  ok(lista.find((p) => p.membroId === 6013).funcoes[0].rotulo === "Departamento União de Crianças", "com a função que a pessoa ocupa");
  r = await GET(HM, "funcoes", PROT());
  lista = r.body.inaptos;
  const marta = lista.find((p) => p.membroId === 6022);
  ok(marta && codigos(marta).includes("PENDENCIA_DIRETORIA") && !codigos(marta).some((c) => mm.BLOQUEIOS_RESERVADOS.includes(c)), "a Proteção vê a Marta com \"pendência com a Diretoria\", sem o motivo", codigos(marta));
  ok(!/AUTO_DENUNCIA|INCIDENTE_EM|CADASTRO_NACIONAL|ANTECEDENTES_COM_RESTRICAO/.test(JSON.stringify(r.body)), "nada reservado na resposta da Proteção");
  r = await GET(HM, "funcoes", ADM_P());
  ok(r.status === 200 && r.body.inaptos === null && r.body.resumo === null && r.body.podeMarcarDepartamento === true && r.body.podeMarcarPapel === false, "quem só marca departamento vê as marcas, nunca quem não está apto", { inaptos: r.body.inaptos, a: r.body.podeMarcarDepartamento, b: r.body.podeMarcarPapel });
  r = await GET(HM, "funcoes", LIDER(3001, ["protecao_menores", "habilitacao_voluntarios", "pessoas"], ["Central E2E"]));
  ok(r.status === 403, "o Dirigente (Proteção, Habilitação e Pessoas na congregação) não entra: é do nível geral", r.status);
  r = await GET(HM, "catalogos", PROT());
  ok(r.body.papeis.funcoes === true && r.body.papeis.verInaptos === true && r.body.papeis.marcarDepartamento === false, "o catálogo diz à tela o que a sessão pode", r.body.papeis);

  console.log("== a marca: nível geral, a porta de cada catálogo e a confirmação reforçada ==");
  r = await POST(HM, "funcao-marca", SEM_FATOR(["pessoas"]), { tipo: "DEPARTAMENTO", id: 2, contatoComMenores: true });
  ok(r.status === 428 && (await escalar("SELECT ContatoComMenores FROM Departamentos WHERE DepartamentoId = 2")) === false, "sem a confirmação recente: 428 e nada muda", r.status);
  r = await POST(HM, "funcao-marca", ADM_PERM(), { tipo: "DEPARTAMENTO", id: 2, contatoComMenores: true });
  ok(r.status === 403, "quem cuida das permissões não marca departamento", r.status);
  r = await POST(HM, "funcao-marca", DIR(), { tipo: "DEPARTAMENTO", id: 2, contatoComMenores: true });
  ok(r.status === 403, "a Diretoria só vê: marcar é de quem cuida das pessoas", r.status);
  r = await POST(HM, "funcao-marca", ADM_P(), { tipo: "DEPARTAMENTO", id: 2, contatoComMenores: true });
  ok(r.status === 200 && r.body.mudou === true && (await escalar("SELECT ContatoComMenores FROM Departamentos WHERE DepartamentoId = 2")) === true, "marcado (a Mocidade tem adolescentes)", r.body);
  ok((await escalar("SELECT COUNT(*) FROM AuditLog WHERE Tabela = 'Departamentos' AND RegistroId = 2 AND Acao = 'CONTATO_COM_MENORES_ALTERADO'")) === 1, "a marca fica na trilha");
  r = await GET(HM, "funcoes", DIR());
  const gabiDentro = r.body.inaptos.some((p) => p.membroId === 6016);
  ok(gabiDentro === !(ap.get(6016) && ap.get(6016).apto), "com a marca, a Gabi passa a ser conferida", r.body.inaptos.map((p) => p.membroId));
  r = await POST(HM, "funcao-marca", ADM_P(), { tipo: "DEPARTAMENTO", id: 2, contatoComMenores: true });
  ok(r.body.mudou === false && (await escalar("SELECT COUNT(*) FROM AuditLog WHERE Tabela = 'Departamentos' AND RegistroId = 2 AND Acao = 'CONTATO_COM_MENORES_ALTERADO'")) === 1, "marcar de novo não grava nada", r.body);
  r = await POST(HM, "funcao-marca", ADM_P(), { tipo: "DEPARTAMENTO", id: 2, contatoComMenores: false });
  ok(r.status === 200 && (await escalar("SELECT ContatoComMenores FROM Departamentos WHERE DepartamentoId = 2")) === false, "tirar a marca também é possível (com a confirmação)", r.body);
  r = await GET(HM, "funcoes", DIR());
  ok(!r.body.inaptos.some((p) => p.membroId === 6016), "sem a marca, a Gabi sai do painel");
  r = await POST(HM, "funcao-marca", ADM_P(), { tipo: "DEPARTAMENTO", id: 99999, contatoComMenores: true });
  ok(r.status === 404, "departamento que não existe: 404", r.status);
  // o catálogo genérico não mexe na marca (ela não é campo dele)
  r = await chamar(HC, { ligado: { catalogo: "departamentos" }, token: GERAL(1002, ["pessoas"]), corpo: { id: 1, contatoComMenores: false, ContatoComMenores: 0 } });
  ok((await escalar("SELECT ContatoComMenores FROM Departamentos WHERE DepartamentoId = 1")) === true, "o catálogo genérico de departamentos não tira a marca (só a rota própria, com a confirmação)", r.body);

  console.log("== cargo marcado: o Comitê de Proteção (para provar que o aviso nunca vai à própria pessoa) ==");
  const papelComite = await escalar("SELECT PapelId FROM Papeis WHERE Nome = N'Comitê de Proteção'");
  r = await POST(HM, "funcao-marca", ADM_PERM(), { tipo: "PAPEL", id: papelComite, contatoComMenores: true });
  ok(r.status === 200 && r.body.mudou === true, "quem cuida das permissões marca o cargo", r.body);
  r = await GET(HM, "funcoes", DIR());
  const comite = r.body.inaptos.filter((p) => p.funcoes.some((f) => f.tipo === "PAPEL")).map((p) => p.membroId).sort();
  ok(comite.join() === [7001, 7002].filter((id) => !(ap.get(id) && ap.get(id).apto)).join(), "os do Comitê que não estão aptos aparecem pelo cargo", comite);

  console.log("== o aviso pelo motor (rotina diária) ==");
  const diretoriaEProtecao = (await q(`SELECT DISTINCT l.MembroId FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId WHERE p.Nivel = 'GLOBAL'
    AND ((',' + p.Permissoes + ',') LIKE '%,vistoria_antecedentes,%' OR (',' + p.Permissoes + ',') LIKE '%,protecao_menores,%') AND (l.AtivoAte IS NULL OR l.AtivoAte >= CAST(SYSUTCDATETIME() AS DATE))`)).map((x) => Number(x.MembroId));
  ok(diretoriaEProtecao.includes(7001) && diretoriaEProtecao.includes(1002), "no cenário, a Diretoria e o Comitê recebem", diretoriaEProtecao);
  const fatos = await fmDb.detectar(pool, { hoje });
  const esperados = 2 + comite.length;   // Davi e Marta pelo departamento; o Comitê pelo cargo
  ok(fatos.length === esperados, `um fato por pessoa e função (${esperados})`, fatos.map((f) => f.fatoGerador.slice(0, 40)));
  const r1 = await motor.avaliarRegras(pool, { chaves: ["MENORES_FUNCAO_SEM_APTIDAO"] });
  const nots = await q("SELECT DestinatarioMembroId d, Mensagem m, ReferenciaId ref FROM Notificacoes WHERE RegraChave = 'MENORES_FUNCAO_SEM_APTIDAO'");
  ok(r1.criadas === nots.length && nots.length > 0, "o motor cria os avisos", { criadas: r1.criadas, n: nots.length });
  const nomes = { 6013: "Davi Certidao Vencida M7", 6022: "Marta Autodenuncia M7", 7001: "Pastor do Comite E2E", 7002: "Leiga do Comite E2E" };
  const paraSiMesmo = nots.filter((n) => Object.entries(nomes).some(([id, nome]) => Number(id) === Number(n.d) && n.m.startsWith(nome)));
  ok(paraSiMesmo.length === 0, "nenhum aviso vai à própria pessoa (o Comitê recebe o do colega, não o seu)", paraSiMesmo);
  const davi = nots.filter((n) => n.m.startsWith("Davi"));
  ok(davi.length > 0 && davi.every((n) => diretoriaEProtecao.includes(Number(n.d))), "o aviso do Davi vai só à Diretoria e à Proteção do nível geral", davi.map((n) => n.d));
  ok(!davi.some((n) => [3001, 3002, 3003].includes(Number(n.d))), "nunca à liderança local");
  // o nome das pessoas do cenário diz a situação delas ("Davi Certidao Vencida", "Marta Autodenuncia"): confere-se o texto DEPOIS do nome
  const semNome = (m) => String(m).replace(/^[^,]*, da congregação/, "");
  ok(nots.every((n) => !PALAVRAS_DO_MOTIVO.test(semNome(n.m)) && /não está apto para função com menores/.test(n.m)), "todos os avisos dizem só \"não está apto\": nenhum motivo", nots.map((n) => n.m).find((m) => PALAVRAS_DO_MOTIVO.test(semNome(m))));
  ok((await escalar("SELECT COUNT(*) FROM Notificacoes WHERE RegraChave = 'MENORES_FUNCAO_SEM_APTIDAO' AND Mensagem LIKE N'%Marta%'")) > 0, "a Marta (pendência reservada) também é avisada — sem o motivo");
  const r2 = await motor.avaliarRegras(pool, { chaves: ["MENORES_FUNCAO_SEM_APTIDAO"] });
  ok(r2.criadas === 0, "no mesmo mês, nada se repete", r2);
  const proximo = (() => { const [a, m] = hoje.split("-").map(Number); return m === 12 ? `${a + 1}-01-05` : `${a}-${String(m + 1).padStart(2, "0")}-05`; })();
  const doMes = await fmDb.detectar(pool, { hoje: proximo });
  const refsAgora = new Set(nots.map((n) => Number(n.ref)));
  ok(doMes.length === fatos.length && doMes.every((f) => !refsAgora.has(Number(f.referenciaId))), "no mês seguinte, enquanto durar, cada aviso volta (outra referência)", doMes.length);
  const repetido = await criarNotificacao(pool, { regraChave: "MENORES_FUNCAO_SEM_APTIDAO", destinatarioMembroId: 1002, titulo: "t", mensagem: doMes[0].fatoGerador, categoria: "MENORES", referenciaTabela: "Lideranca", referenciaId: doMes[0].referenciaId });
  ok(repetido.criada === true, "e o motor o aceita como aviso novo");

  console.log("== quem deixa o cargo, ou o departamento desativado, sai do painel e do aviso ==");
  await q("UPDATE Lideranca SET AtivoAte = DATEADD(DAY, -1, CAST(SYSUTCDATETIME() AS DATE)) WHERE MembroId = 6013");
  r = await GET(HM, "funcoes", DIR());
  ok(!r.body.inaptos.some((p) => p.membroId === 6013), "o mandato do Davi venceu: ele sai do painel");
  ok(!(await fmDb.detectar(pool, { hoje })).some((f) => f.fatoGerador.startsWith("Davi")), "e do aviso");
  await q("UPDATE Departamentos SET Ativo = 0 WHERE DepartamentoId = 1");
  ok(!(await GET(HM, "funcoes", DIR())).body.inaptos.some((p) => p.membroId === 6022), "departamento desativado não conta");
  await q("UPDATE Departamentos SET Ativo = 1 WHERE DepartamentoId = 1");
  r = await chamar(HL, { metodo: "DELETE", ligado: { membroId: "6022" }, token: ADM_PERM() });
  ok(r.body.sucesso === true && !(await GET(HM, "funcoes", DIR())).body.inaptos.some((p) => p.membroId === 6022), "a liderança da Marta removida (decisão humana): ela sai do painel", r.body);

  ok(falhasAuditoria === 0, "nenhuma falha de auditoria", falhasAuditoria);
  fim("e2e-44 (Trava 7-C, decisão 2: funções com menores em departamentos e liderança)");
})().catch((e) => { console.log("ERRO:", e && e.stack); L.shimEncerrar(); process.exitCode = 1; });
