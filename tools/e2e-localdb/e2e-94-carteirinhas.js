// e2e-94-carteirinhas.js — AS CARTEIRINHAS (FASE 10, v10.1b passo 8, migração 180, 19/11/2026), contra o SQL Server de verdade: os modelos (os padrões que nascem
// sozinhos, criar, salvar com a versão, "usar este modelo", o desenho que só aceita o que não muda, a arte conferida pelo conteúdo e pelo tamanho), a lista para
// imprimir de uma congregação (nova, mudou de tipo, segunda via; bloqueada com pendência REPETIDA ou NUMERO; disciplina e quem saiu fora; o escopo), imprimir
// (registra e devolve os cartões; obreiro só a Geral; nada fora do escopo), a segunda via, a carteirinha da ficha, a digital da própria pessoa, o QR FIXO (o mesmo
// código antes e depois de tudo) e a conferência pública (a situação calculada agora; só o mínimo; quem saiu só o nome; lixo e código desconhecido = 404; o
// limitador), o resumo por congregação, juntar fichas com QR (fica o da que fica; o da que sai vai para o arquivo) e o acesso sem sessão ou sem permissão.
// Roda sobre a base cenario-180 (`bash rodar.sh preparar-180` e depois `BASE=cenario-180 bash rodar.sh roteiro e2e-94-carteirinhas.js`); monta o próprio cenário.
process.env.AUTH_SECRET = "segredo-das-carteirinhas-no-banco-" + "x".repeat(24);
const L = require("./lib");
const { ok, fim, q, escalar, obterPool } = L;
const certificados = require("../../api/shared/certificados");

const PERM = ["pessoas"];
const fator = () => ({ via: "CHAVE", em: Date.now() });
const C = { VN: "Vila Nova E2E94", CJ: "Cidade Jardim E2E94" };
const tok = {
  geral: () => L.sessao(9401, { via: "SENHA", fator: fator(), nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: PERM }),
  vn: () => L.sessao(9402, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: [C.VN], permissoes: PERM }),
  cj: () => L.sessao(9403, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: [C.CJ], permissoes: PERM }),
  semPessoas: () => L.sessao(9404, { via: "SENHA", fator: fator(), nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["reunioes"] }),
  membro: (id) => L.sessao(id, { via: "SENHA", fator: fator(), nivel: "MEMBRO", escopoCongregacoes: [], permissoes: [] })
};
function cpfDe(base9) {
  const d = String(base9).padStart(9, "0").split("").map(Number);
  const dv = (arr) => { const n = arr.length + 1; const s = arr.reduce((acc, x, i) => acc + x * (n - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(d); const d2 = dv([...d, d1]);
  return [...d, d1, d2].join("");
}
// um PNG só com o cabeçalho (assinatura + IHDR): o suficiente para conferir o tipo e o tamanho em pixels
function pngCabecalho(largura, altura) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write("IHDR", 12, "ascii"); b.writeUInt32BE(largura, 16); b.writeUInt32BE(altura, 20);
  return b.toString("base64");
}

async function principal() {
  const { chamarRota } = require("./lib-afm");
  await obterPool();
  const K = (token, acao, { metodo = "GET", corpo, query, id } = {}) =>
    chamarRota("Carteirinhas/index.js", { metodo, token, binding: { acao, id: id == null ? undefined : String(id) }, corpo: corpo || {}, query: query || {} });
  const conferir = (codigo) => chamarRota("ConferirCarteirinha/index.js", { metodo: "GET", binding: { codigo }, headers: { "x-forwarded-for": "203.0.113.94, 10.0.0.1" } });

  console.log("== a migração 180 ==");
  ok(await escalar("SELECT COUNT(*) FROM sys.tables WHERE name IN ('CarteirinhaModelos', 'CarteirinhasQr', 'CarteirinhasImpressas', 'CarteirinhasPedidos')") === 4, "as quatro tabelas novas");
  ok(await escalar("SELECT COUNT(*) FROM sys.indexes WHERE name IN ('UX_CarteirinhaModelos_PublicoAtivo', 'IX_CarteirinhasQr_Membro', 'IX_CarteirinhasImpressas_Membro', 'UX_CarteirinhasPedidos_Aberto')") === 4, "os índices");

  console.log("== o cenário: duas congregações e as pessoas de cada situação ==");
  const area = (await q("INSERT INTO Areas (Nome) VALUES (N'Área E2E94'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const cong = {};
  for (const [k, nome] of [["VN", C.VN], ["CJ", C.CJ]]) cong[k] = (await q("INSERT INTO Congregacoes (Nome, AreaId) VALUES (@n, @a); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { n: nome, a: area }))[0].id;
  const ficha = (id, nome, c, extra = {}) => q(`INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, DataAdmissao, FormaAdmissao,
      Cpf, NomeMae, NomePai, CargoMinisterial, Funcao, Sexo, CriadoEm, Telefone, Email)
    VALUES (@id, @nome, @c, @st, @sit, @nasc, @adm, N'BATISMO', @cpf, @mae, @pai, @cargo, @funcao, N'F', @criado, @tel, @email)`,
    { id, nome, c, st: extra.status || "ATIVO", sit: extra.sit || "EM_COMUNHAO", nasc: extra.nasc || "1990-03-14", adm: extra.adm === undefined ? "2015-04-12" : extra.adm,
      cpf: extra.cpf || null, mae: extra.mae || null, pai: extra.pai || null, cargo: extra.cargo || null, funcao: extra.funcao || null, criado: extra.criado || "2020-01-01",
      tel: extra.tel || null, email: extra.email || null });
  const CPF1 = cpfDe(940000001);
  await ficha(940001, "Ana Beatriz Moreira", cong.VN, { cpf: CPF1, mae: "Lúcia Moreira", pai: "Paulo Moreira", funcao: "Professora · Ministério Infantil", tel: "(91) 98888-1111", email: "ana@exemplo.org" });
  await ficha(940002, "Clara Nunes", cong.VN, { sit: "CONGREGADO", adm: null });
  await ficha(940003, "Tiago Moura", cong.VN, { cargo: "DIACONO" });
  await ficha(940004, "Rui Disciplina", cong.VN, { sit: "SEM_COMUNHAO" });
  await ficha(940005, "Sara Saiu", cong.VN, { status: "DESLIGADO" });
  await ficha(940006, "Marcos Vieira", cong.VN, { criado: "2012-01-01" });
  await ficha(940007, "MARCOS VIEIRA", cong.VN, { criado: "2026-01-01" });
  await ficha(940008, "Número Torto", cong.VN);
  await ficha(940009, "Pedro de Outra", cong.CJ);
  await ficha(940010, "Joana Sem Nada", cong.VN, { adm: null });
  await ficha(940011, "Tomé Em Disciplina", cong.VN, { sit: "SEM_COMUNHAO" });
  await q(`INSERT INTO FichasPendencias (MembroId, Tipo, OutroMembroId, Origem) VALUES (940007, N'REPETIDA', 940006, N'MARCADA'), (940008, N'NUMERO', NULL, N'MARCADA'), (940011, N'NUMERO', NULL, N'MARCADA')`);
  ok(await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE MembroId BETWEEN 940001 AND 940011") === 11, "11 pessoas do roteiro");

  console.log("== os modelos ==");
  const m0 = await K(tok.vn(), "modelos");
  const modelos0 = (m0.body && m0.body.modelos) || [];
  ok(m0.status === 200 && modelos0.length >= 3 && ["MEMBRO", "CONGREGADO", "OBREIRO"].every((p) => modelos0.some((m) => m.publico === p && m.ativo)), "os 3 padrões nascem sozinhos e ativos (a local vê)", JSON.stringify(modelos0.map((m) => [m.nome, m.publico, m.ativo])));
  ok(m0.body.geral === false && modelos0.every((m) => m.desenho && m.desenho.lados && typeof m.versao === "string"), "a local vê só para ver (geral=false); cada um com o desenho e a versão");
  const usadoMembro = (modelos0.find((m) => m.publico === "MEMBRO" && m.ativo) || {}).usadoPor;
  const gabMembro = await escalar(`SELECT COUNT(*) FROM MembroReferencia m WHERE ISNULL(m.Status, N'ATIVO') IN (N'ATIVO', N'LICENÇA', N'LICENCA_CANDIDATURA') AND ISNULL(m.SituacaoMembro, N'') NOT IN (N'SEM_COMUNHAO', N'CONGREGADO')
    AND NOT (ISNULL(m.CargoMinisterial, N'') IN (N'AUXILIAR', N'MISSIONARIO', N'DIACONO', N'PRESBITERO', N'EVANGELISTA', N'PASTOR') AND m.SituacaoMembro = N'EM_COMUNHAO')`);
  ok(usadoMembro === gabMembro, `"usado por" do modelo de membro bate com o banco (${gabMembro})`, String(usadoMembro));
  const m1 = await K(tok.vn(), "modelos");
  ok(m1.body.modelos.length === modelos0.length, "ler de novo não cria padrões de novo");
  const recusaLocal = await K(tok.vn(), "modelos", { metodo: "POST", corpo: { nome: "Visitante", publico: "OUTRO" } });
  ok(recusaLocal.status === 403, "a local não cria modelo (só a Secretaria Geral)", String(recusaLocal.status));
  const novoOutro = await K(tok.geral(), "modelos", { metodo: "POST", corpo: { nome: "Visitante", publico: "OUTRO" } });
  ok(novoOutro.status === 201 && novoOutro.body.ativo === true, "a Geral cria o modelo de visitante (OUTRO, ativo, não sai sozinho)", JSON.stringify(novoOutro.body));
  const novoMembro = await K(tok.geral(), "modelos", { metodo: "POST", corpo: { nome: "Membro 2027", publico: "MEMBRO" } });
  ok(novoMembro.status === 201 && novoMembro.body.ativo === false && /continua o atual/.test(novoMembro.body.mensagem), "modelo novo de membro nasce guardado (o atual continua)", JSON.stringify(novoMembro.body));
  const ruimPublico = await K(tok.geral(), "modelos", { metodo: "POST", corpo: { nome: "Coisa", publico: "QUALQUER" } });
  const ruimNome = await K(tok.geral(), "modelos", { metodo: "POST", corpo: { nome: "x", publico: "OUTRO" } });
  ok(ruimPublico.status === 422 && ruimNome.status === 422, "público e nome inválidos: recusados", JSON.stringify([ruimPublico.status, ruimNome.status]));
  const mId = novoMembro.body.modeloId;
  const lido = (await K(tok.geral(), "modelos")).body.modelos.find((m) => m.modeloId === mId);
  const desenho = lido.desenho;
  desenho.lados.frente.camadas.push({ id: "lema", tipo: "TEXTO", texto: "Fiel até a morte", x: 30, y: 45, larg: 40, alt: 4, cor: "#ffffff", tamanho: 6 });
  const salvo = await K(tok.geral(), "modelos", { metodo: "PUT", id: mId, corpo: { nome: "Membro 2027", desenho, versao: lido.versao } });
  ok(salvo.status === 200 && typeof salvo.body.versao === "string" && salvo.body.versao !== lido.versao, "salvar com a versão lida: grava e devolve a versão nova", JSON.stringify(salvo.body));
  const velho = await K(tok.geral(), "modelos", { metodo: "PUT", id: mId, corpo: { nome: "Membro 2027 (outra aba)", desenho, versao: lido.versao } });
  ok(velho.status === 409 && (await escalar("SELECT Nome FROM CarteirinhaModelos WHERE ModeloId = @id", { id: mId })) === "Membro 2027", "salvar com a versão velha (outra pessoa salvou no meio): 409 e nada por cima", String(velho.status));
  const comCpf = JSON.parse(JSON.stringify(desenho)); comCpf.lados.verso.camadas.push({ id: "cpf", tipo: "CAMPO", campo: "CPF", x: 5, y: 20, larg: 30, alt: 4 });
  const rCpf = await K(tok.geral(), "modelos", { metodo: "PUT", id: mId, corpo: { nome: "Membro 2027", desenho: comCpf, versao: salvo.body.versao } });
  const comCong = JSON.parse(JSON.stringify(desenho)); comCong.lados.verso.camadas.push({ id: "cg", tipo: "CAMPO", campo: "CONGREGACAO", x: 5, y: 20, larg: 30, alt: 4 });
  const rCong = await K(tok.geral(), "modelos", { metodo: "PUT", id: mId, corpo: { nome: "Membro 2027", desenho: comCong, versao: salvo.body.versao } });
  const semQr = JSON.parse(JSON.stringify(desenho)); semQr.lados.verso.camadas = semQr.lados.verso.camadas.filter((c) => c.tipo !== "QR");
  const rQr = await K(tok.geral(), "modelos", { metodo: "PUT", id: mId, corpo: { nome: "Membro 2027", desenho: semQr, versao: salvo.body.versao } });
  ok(rCpf.status === 422 && rCong.status === 422 && /só leva o que não muda/.test(rCpf.body.mensagem) && rQr.status === 422 && /QR/.test(rQr.body.mensagem),
    "a física recusa CPF e congregação (só o que não muda) e exige o QR", JSON.stringify([rCpf.status, rCong.status, rQr.status]));
  const fantasma = await K(tok.geral(), "modelos", { metodo: "PUT", id: 99999999, corpo: { nome: "X Y Z", desenho, versao: salvo.body.versao } });
  ok(fantasma.status === 404, "salvar um modelo que não existe: 404", String(fantasma.status));
  const membroAntigo = modelos0.find((m) => m.publico === "MEMBRO" && m.ativo).modeloId;
  const ativ = await K(tok.geral(), "ativar", { metodo: "POST", id: mId });
  const ativos = await q("SELECT ModeloId FROM CarteirinhaModelos WHERE Publico = N'MEMBRO' AND Ativo = 1");
  ok(ativ.status === 200 && ativos.length === 1 && ativos[0].ModeloId === mId, "\"usar este modelo\": vira o único ativo de membro (o anterior fica guardado)", JSON.stringify(ativos));
  const volta = await K(tok.geral(), "ativar", { metodo: "POST", id: membroAntigo });
  ok(volta.status === 200 && (await escalar("SELECT ModeloId FROM CarteirinhaModelos WHERE Publico = N'MEMBRO' AND Ativo = 1")) === membroAntigo, "e volta ao anterior");
  const ativLocal = await K(tok.vn(), "ativar", { metodo: "POST", id: mId });
  ok(ativLocal.status === 403, "a local não troca o modelo", String(ativLocal.status));

  console.log("== a arte de fundo (conferida pelo conteúdo e pelo tamanho) ==");
  const arte = (corpo, token = tok.geral()) => K(token, "arte", { metodo: "POST", id: mId, corpo });
  const aPeq = await arte({ lado: "frente", tipo: "image/png", imagemBase64: pngCabecalho(800, 500) });
  ok(aPeq.status === 400 && /1\.011 × 638/.test(aPeq.body.mensagem) && /800 × 500/.test(aPeq.body.mensagem), "arte pequena (800 × 500): recusada, dizendo o mínimo e o tamanho dela", JSON.stringify(aPeq.body));
  const aFalsa = await arte({ lado: "frente", tipo: "image/png", imagemBase64: Buffer.from("<svg onload=alert(1)>").toString("base64") });
  const aTipo = await arte({ lado: "frente", tipo: "image/svg+xml", imagemBase64: pngCabecalho(2400, 1514) });
  const aLado = await arte({ lado: "meio", tipo: "image/png", imagemBase64: pngCabecalho(2400, 1514) });
  const aGrande = await arte({ lado: "verso", tipo: "image/png", imagemBase64: "A".repeat(14500000) });
  ok([aFalsa, aTipo, aLado, aGrande].every((r) => r.status === 400), "conteúdo que não é PNG, SVG, lado estranho e arquivo grande demais: 400", JSON.stringify([aFalsa.status, aTipo.status, aLado.status, aGrande.status]));
  const aLocal = await arte({ lado: "frente", tipo: "image/png", imagemBase64: pngCabecalho(2400, 1514) }, tok.vn());
  ok(aLocal.status === 403, "a local não troca a arte", String(aLocal.status));
  const vAntesArte = (await K(tok.geral(), "modelos")).body.modelos.find((m) => m.modeloId === mId).versao;
  const aBoa = await arte({ lado: "frente", tipo: "image/png", imagemBase64: pngCabecalho(2400, 1514) });
  ok((aBoa.status === 200 && /^doc-\d+-[a-z0-9]+$/.test(aBoa.body.arteId)) || aBoa.status === 503, "arte boa (2.400 × 1.514): o arquivo guardado como veio (ou, sem o armazenamento aqui, 503)", JSON.stringify(aBoa.body));
  ok((await escalar("SELECT ArteFrente FROM CarteirinhaModelos WHERE ModeloId = @id", { id: mId })) == null, "enviar a arte NÃO muda o modelo: ela só vale no salvar (desfazer e sair sem salvar não perdem a anterior)");
  const vArte = (await K(tok.geral(), "modelos")).body.modelos.find((m) => m.modeloId === mId).versao;
  ok(vArte === vAntesArte, "a versão do modelo não mudou com o envio da arte (o próximo salvar não dá 409)");
  const arteId = aBoa.status === 200 ? aBoa.body.arteId : "doc-1763500000000-abc123";
  const comArte = JSON.parse(JSON.stringify(desenho)); comArte.lados.frente.fundo.arte = true;
  const sArte = await K(tok.geral(), "modelos", { metodo: "PUT", id: mId, corpo: { nome: "Membro 2027", desenho: comArte, versao: vArte, arteFrente: arteId } });
  ok(sArte.status === 200 && (await escalar("SELECT ArteFrente FROM CarteirinhaModelos WHERE ModeloId = @id", { id: mId })) === arteId, "salvar com a arte: o desenho e a arte juntos", JSON.stringify(sArte.body));
  const sFora = await K(tok.geral(), "modelos", { metodo: "PUT", id: mId, corpo: { nome: "Membro 2027", desenho: comArte, versao: sArte.body.versao, arteFrente: "https://outro.exemplo.org/x.png" } });
  ok(sFora.status === 422 && (await escalar("SELECT ArteFrente FROM CarteirinhaModelos WHERE ModeloId = @id", { id: mId })) === arteId, "arte que não é um arquivo nosso (endereço de fora): recusada", JSON.stringify(sFora.body));

  console.log("== a lista para imprimir de Vila Nova ==");
  const filaVn = await K(tok.vn(), "fila", { query: { congregacaoId: cong.VN } });
  const itens = (filaVn.body && filaVn.body.itens) || [];
  const por = (id) => itens.find((x) => x.membroId === id);
  ok(filaVn.status === 200 && por(940001) && por(940001).motivo === "NOVA" && /^nova · entrou em 12\/04\/2015$/.test(por(940001).detalhe) && por(940001).tipo === "MEMBRO", "a membro nova (com a data em que entrou)", JSON.stringify(por(940001)));
  ok(por(940002) && por(940002).tipo === "CONGREGADO" && por(940002).motivo === "NOVA" && por(940002).detalhe === "nova", "a congregada (modelo de congregado)", JSON.stringify(por(940002)));
  ok(por(940003) && por(940003).tipo === "OBREIRO" && por(940003).soGeral === true, "o obreiro aparece para a local marcado 'só a Geral imprime'", JSON.stringify(por(940003)));
  ok(!por(940004) && !por(940005) && !por(940009), "em disciplina, quem saiu e a pessoa de outra congregação ficam fora");
  ok(por(940006) && por(940006).bloqueada && por(940006).detalhe === "duas fichas a juntar (940006 e 940007)" && por(940007) && por(940007).bloqueada && por(940007).detalhe === "duas fichas a juntar (940007 e 940006)",
    "as duas fichas repetidas: bloqueadas, com as duas matrículas", JSON.stringify([por(940006), por(940007)]));
  ok(por(940008) && por(940008).bloqueada && por(940008).detalhe === "número de matrícula a acertar", "número a acertar: bloqueada", JSON.stringify(por(940008)));
  const ordem = itens.map((x) => x.bloqueada);
  ok(ordem.every((b, i) => i === 0 || !b || ordem[i - 1] || b), "as bloqueadas vêm no fim (como no desenho)", JSON.stringify(ordem));
  ok(!JSON.stringify(filaVn.body).includes(CPF1) && !JSON.stringify(filaVn.body).includes("98888"), "a lista não traz CPF nem contato");
  const filaGeral = await K(tok.geral(), "fila", { query: { congregacaoId: cong.VN } });
  ok(filaGeral.status === 200 && filaGeral.body.itens.find((x) => x.membroId === 940003).soGeral === false, "para a Geral o obreiro não vem marcado");
  const filaFora = await K(tok.vn(), "fila", { query: { congregacaoId: cong.CJ } });
  const filaLixo = await K(tok.vn(), "fila", { query: { congregacaoId: "1 OR 1=1" } });
  const filaNada = await K(tok.vn(), "fila", { query: { congregacaoId: 99999999 } });
  ok(filaFora.status === 404 && filaLixo.status === 404 && filaNada.status === 404, "outra congregação, lixo e congregação que não existe: a mesma resposta (404)", JSON.stringify([filaFora.status, filaLixo.status, filaNada.status]));

  console.log("== imprimir: preparar (nada gravado) e confirmar (só as que saíram) ==");
  const P = (token, ids, material, extra = {}) => K(token, "preparar", { metodo: "POST", corpo: { membroIds: ids, material, ...extra } });
  const Cf = (token, ids, material, frenteVerso) => K(token, "confirmar", { metodo: "POST", corpo: { membroIds: ids, material, frenteVerso } });
  const imp1 = await P(tok.vn(), [940001, 940002, 940003, 940006, 940009, 99999999, "940001"], "PVC");
  const cart = (imp1.body && imp1.body.cartoes) || [];
  const rec = (imp1.body && imp1.body.recusadas) || [];
  ok(imp1.status === 200 && cart.map((x) => x.membroId).sort().join() === "940001,940002", "prepara só as duas que podem (a repetida da lista conta uma vez)", JSON.stringify(cart.map((x) => x.membroId)));
  const recPor = (id) => (rec.find((x) => x.membroId === id) || {}).mensagem || "";
  ok(/Art\. 76/.test(recPor(940003)) && /Pendência/.test(recPor(940006)) && recPor(940009) === "Matrícula não encontrada." && recPor(99999999) === "Matrícula não encontrada.",
    "recusadas: o obreiro (só a Geral), a repetida (pendência), a de outra congregação e a que não existe (a mesma frase)", JSON.stringify(rec));
  ok(!(rec.find((x) => x.membroId === 940009) || {}).nome && !(rec.find((x) => x.membroId === 99999999) || {}).nome, "a recusa de fora do escopo não diz o nome de ninguém");
  const c1 = cart.find((x) => x.membroId === 940001) || {};
  ok(c1.nome === "Ana Beatriz Moreira" && c1.nascimento === "1990-03-14" && c1.mae === "Lúcia Moreira" && c1.pai === "Paulo Moreira" && c1.matricula === 940001 && /^<svg/.test(c1.qrSvg || "") && c1.tipo === "MEMBRO",
    "o cartão traz só o que não muda (nome, nascimento, matrícula, pai e mãe), o tipo e o QR", JSON.stringify({ ...c1, qrSvg: (c1.qrSvg || "").slice(0, 20) }));
  ok(!JSON.stringify(imp1.body).includes(CPF1) && !JSON.stringify(imp1.body).includes("98888") && !JSON.stringify(imp1.body).includes("Professora"), "o que vai para a impressora não tem CPF, contato nem a função (o que muda fica na digital)");
  ok(Array.isArray(imp1.body.modelos) && imp1.body.modelos.length === 2 && imp1.body.modelos.every((m) => m.desenho && m.ativo), "vêm os modelos usados (membro e congregado)");
  ok((await escalar("SELECT COUNT(*) FROM CarteirinhasImpressas WHERE MembroId BETWEEN 940001 AND 940011")) === 0, "preparar NÃO registra nada (a impressora ainda não soltou)");
  ok((await K(tok.vn(), "fila", { query: { congregacaoId: cong.VN } })).body.itens.some((x) => x.membroId === 940001), "preparada e não confirmada: continua na lista");
  const conf1 = await Cf(tok.vn(), [940002, 940001, 940003, 99999999], "PVC", true);
  ok(conf1.status === 200 && (conf1.body.registradas || []).join() === "940001,940002" && /Art\. 76/.test(((conf1.body.recusadas || []).find((x) => x.membroId === 940003) || {}).mensagem || ""),
    "confirmar registra só as que podem (o obreiro e a que não existe ficam de fora)", JSON.stringify(conf1.body));
  const reg = await q("SELECT MembroId, Publico, Material, FrenteVerso, Motivo, ImpressaPor, CongregacaoId FROM CarteirinhasImpressas WHERE MembroId BETWEEN 940001 AND 940011 ORDER BY MembroId");
  ok(reg.length === 2 && reg[0].Publico === "MEMBRO" && reg[1].Publico === "CONGREGADO" && reg.every((l) => l.Material === "PVC" && l.FrenteVerso === true && l.Motivo === "NOVA" && l.ImpressaPor === 9402 && l.CongregacaoId === cong.VN),
    "o registro das duas impressões (tipo, material, frente e verso, nova, quem, onde)", JSON.stringify(reg));
  const qr1 = await escalar("SELECT Codigo FROM CarteirinhasQr WHERE MembroId = 940001");
  ok(typeof qr1 === "string" && qr1.length >= 12 && (await escalar("SELECT COUNT(*) FROM CarteirinhasQr WHERE MembroId IN (940001, 940002)")) === 2, "o QR fixo nasceu para as duas (um para cada)");
  const depois = (await K(tok.vn(), "fila", { query: { congregacaoId: cong.VN } })).body.itens;
  ok(!depois.some((x) => x.membroId === 940001 || x.membroId === 940002), "depois de confirmadas, saem da lista");
  const rMat = await P(tok.vn(), [940010], "OURO");
  const rVazio = await P(tok.vn(), [], "PAPEL");
  const rMuitos = await P(tok.vn(), Array.from({ length: 21 }, (_, i) => 950000 + i), "PAPEL");
  const rLixo = await P(tok.vn(), "940010", "PAPEL");
  const cMuitos = await Cf(tok.vn(), Array.from({ length: 21 }, (_, i) => 950000 + i), "PAPEL", false);
  ok([rMat, rVazio, rMuitos, rLixo, cMuitos].every((r) => r.status === 422) && /No máximo 20/.test(rMuitos.body.mensagem), "material estranho, lista vazia, mais de 20 e lista que não é lista: recusados", JSON.stringify([rMat.status, rVazio.status, rMuitos.status, rLixo.status, cMuitos.status]));
  const soRecusa = await P(tok.vn(), [940003], "PAPEL");
  const soRecusaC = await Cf(tok.vn(), [940003], "PAPEL", false);
  ok(soRecusa.status === 422 && /Art\. 76/.test(soRecusa.body.mensagem) && soRecusaC.status === 422 && (await escalar("SELECT COUNT(*) FROM CarteirinhasImpressas WHERE MembroId = 940003")) === 0, "só o obreiro, pela local: recusado nas duas fases e nada registrado", JSON.stringify(soRecusa.body));
  const impGeral = await P(tok.geral(), [940003], "PAPEL");
  const confGeral = await Cf(tok.geral(), [940003], "PAPEL", false);
  ok(impGeral.status === 200 && impGeral.body.cartoes.length === 1 && confGeral.status === 200 && (await escalar("SELECT Publico FROM CarteirinhasImpressas WHERE MembroId = 940003")) === "OBREIRO", "a Geral imprime a do obreiro (modelo de obreiro)", JSON.stringify(impGeral.body.recusadas));

  console.log("== mudou de tipo e a segunda via ==");
  await q("UPDATE MembroReferencia SET SituacaoMembro = N'EM_COMUNHAO', DataAdmissao = '2026-11-01' WHERE MembroId = 940002");
  const mudou = (await K(tok.vn(), "fila", { query: { congregacaoId: cong.VN } })).body.itens.find((x) => x.membroId === 940002);
  ok(mudou && mudou.motivo === "MUDOU" && mudou.detalhe === "mudou · agora membro" && mudou.tipo === "MEMBRO", "a congregada virou membro: volta à lista ('mudou · agora membro')", JSON.stringify(mudou));
  const sv = await K(tok.vn(), "segunda-via", { metodo: "POST", corpo: { membroId: 940001, motivo: "perdeu a de papel" } });
  const sv2 = await K(tok.vn(), "segunda-via", { metodo: "POST", corpo: { membroId: 940001, motivo: "de novo" } });
  ok(sv.status === 201 && sv2.status === 201 && /já estava pedida/.test(sv2.body.mensagem) && (await escalar("SELECT COUNT(*) FROM CarteirinhasPedidos WHERE MembroId = 940001 AND AtendidoEm IS NULL")) === 1,
    "pedir a segunda via; pedir de novo não duplica", JSON.stringify([sv.body, sv2.body]));
  const svCurto = await K(tok.vn(), "segunda-via", { metodo: "POST", corpo: { membroId: 940001, motivo: "x" } });
  const svDisc = await K(tok.vn(), "segunda-via", { metodo: "POST", corpo: { membroId: 940004, motivo: "perdeu" } });
  const svFora = await K(tok.vn(), "segunda-via", { metodo: "POST", corpo: { membroId: 940009, motivo: "perdeu" } });
  const svLixo = await K(tok.vn(), "segunda-via", { metodo: "POST", corpo: { membroId: "abc", motivo: "perdeu" } });
  ok(svCurto.status === 422 && svDisc.status === 422 && svFora.status === 404 && svLixo.status === 404, "motivo curto e pessoa em disciplina: 422; fora do escopo e lixo: 404", JSON.stringify([svCurto.status, svDisc.status, svFora.status, svLixo.status]));
  const naFila = (await K(tok.vn(), "fila", { query: { congregacaoId: cong.VN } })).body.itens.find((x) => x.membroId === 940001);
  ok(naFila && naFila.motivo === "SEGUNDA_VIA" && naFila.detalhe === "segunda via (perdeu a de papel)", "a segunda via entra na lista com o motivo", JSON.stringify(naFila));
  const imp2 = await P(tok.vn(), [940001, 940002], "PAPEL");
  const conf2 = await Cf(tok.vn(), [940001, 940002], "PAPEL", false);
  ok(imp2.status === 200 && imp2.body.cartoes.length === 2 && conf2.status === 200 && conf2.body.registradas.length === 2, "imprime a segunda via e a de quem mudou");
  ok((await escalar("SELECT TOP 1 Motivo FROM CarteirinhasImpressas WHERE MembroId = 940001 ORDER BY ImpressaoId DESC")) === "SEGUNDA_VIA"
    && (await escalar("SELECT TOP 1 Motivo FROM CarteirinhasImpressas WHERE MembroId = 940002 ORDER BY ImpressaoId DESC")) === "MUDOU"
    && (await escalar("SELECT COUNT(*) FROM CarteirinhasPedidos WHERE MembroId = 940001 AND AtendidoEm IS NOT NULL AND ImpressaoId IS NOT NULL")) === 1,
  "o registro diz segunda via e mudou; o pedido ficou atendido e ligado à impressão");
  ok((await escalar("SELECT Codigo FROM CarteirinhasQr WHERE MembroId = 940001")) === qr1 && (await escalar("SELECT COUNT(*) FROM CarteirinhasQr WHERE MembroId = 940001")) === 1, "o QR continua o MESMO depois da segunda via");

  console.log("== a carteirinha na ficha ==");
  const f1 = await K(tok.vn(), "ficha", { id: 940001 });
  ok(f1.status === 200 && f1.body.carteirinha.impressoes.length === 2 && f1.body.carteirinha.impressoes[0].motivo === "SEGUNDA_VIA" && f1.body.carteirinha.podeImprimir === true
    && f1.body.carteirinha.precisaDeNova === false && f1.body.carteirinha.pedido === null, "a ficha: as impressões (a mais nova primeiro), pode imprimir, não precisa de nova", JSON.stringify(f1.body.carteirinha));
  const f6 = await K(tok.vn(), "ficha", { id: 940006 });
  ok(f6.status === 200 && f6.body.carteirinha.podeImprimir === false && /Pendência/.test(f6.body.carteirinha.porQueNao), "a repetida: não pode, e diz por quê");
  const f3 = await K(tok.vn(), "ficha", { id: 940003 });
  ok(f3.body.carteirinha.podeImprimir === false && /Art\. 76/.test(f3.body.carteirinha.porQueNao), "o obreiro, para a local: não pode (só a Geral)");
  const f4 = await K(tok.vn(), "ficha", { id: 940004 });
  ok(f1.body.carteirinha.podePedirSegundaVia === true && f6.body.carteirinha.podePedirSegundaVia === true && f4.status === 200 && f4.body.carteirinha.podePedirSegundaVia === false,
    "a segunda via se pede de quem está no rol (a repetida também); quem está em disciplina, não", JSON.stringify([f1.body.carteirinha.podePedirSegundaVia, f6.body.carteirinha.podePedirSegundaVia, f4.body.carteirinha && f4.body.carteirinha.podePedirSegundaVia]));
  const fFora = await K(tok.cj(), "ficha", { id: 940001 });
  const fNada = await K(tok.vn(), "ficha", { id: 99999999 });
  ok(fFora.status === 404 && fNada.status === 404, "fora do escopo e matrícula que não existe: 404 igual", JSON.stringify([fFora.status, fNada.status]));

  console.log("== a digital da própria pessoa ==");
  const minha = await K(tok.membro(940001), "minha");
  const dig = (minha.body && minha.body.carteirinha) || {};
  ok(minha.status === 200 && dig.nome === "Ana Beatriz Moreira" && dig.funcao === "Professora · Ministério Infantil" && dig.congregacao === C.VN && dig.area === "Área E2E94"
    && dig.situacao === "EM_COMUNHAO" && dig.membroDesde === "04/2015" && dig.matricula === 940001 && /^<svg/.test(dig.qrSvg) && dig.url.includes(`c=${qr1.slice(0, 4)}`),
  "a digital: o que muda (função, congregação, área, situação, membro desde), a matrícula e o MESMO QR", JSON.stringify({ ...dig, qrSvg: "…" }));
  ok(!JSON.stringify(minha.body).includes(CPF1), "a digital não mostra o CPF");
  const minha3 = await K(tok.membro(940003), "minha");
  ok(minha3.body.carteirinha.cargo === "Diácono" && minha3.body.carteirinha.tipo === "OBREIRO", "a do obreiro mostra o cargo", JSON.stringify(minha3.body.carteirinha.cargo));
  const semLogin = await K(null, "minha");
  ok(semLogin.status === 401, "sem sessão: 401", String(semLogin.status));

  console.log("== a conferência pública do QR ==");
  const formatado = (await K(tok.membro(940001), "minha")).body.carteirinha.url.split("c=")[1];
  const v1 = await conferir(decodeURIComponent(formatado).toLowerCase());
  ok(v1.status === 200 && v1.body.situacao === "EM_COMUNHAO" && v1.body.nome === "Ana Beatriz Moreira" && v1.body.cargo === "Membro" && v1.body.funcao === "Professora · Ministério Infantil"
    && v1.body.congregacao === C.VN && v1.body.membroDesde === "04/2015" && v1.body.iniciais === "AM", "em comunhão: nome, cargo, função, congregação, membro desde (o código em minúsculas e com hífens vale)", JSON.stringify(v1.body));
  const pub = JSON.stringify(v1.body);
  ok(!pub.includes(CPF1) && !pub.includes("940001") && !pub.includes("98888") && !pub.includes("ana@exemplo") && !pub.includes("Lúcia"), "nunca CPF, matrícula, contato nem filiação");
  const cod3 = await escalar("SELECT Codigo FROM CarteirinhasQr WHERE MembroId = 940003");
  const v3 = await conferir(cod3);
  ok(v3.status === 200 && v3.body.cargo === "Diácono" && typeof v3.body.exerceCargo === "boolean", "o obreiro: o cargo e se exerce agora", JSON.stringify(v3.body));
  await q("UPDATE MembroReferencia SET SituacaoMembro = N'SEM_COMUNHAO' WHERE MembroId = 940001");
  const vDisc = await conferir(qr1);
  ok(vDisc.status === 200 && vDisc.body.situacao === "DISCIPLINA" && !vDisc.body.congregacao && !vDisc.body.funcao && !vDisc.body.cargo, "em disciplina: só o nome (sem cargo, função nem congregação)", JSON.stringify(vDisc.body));
  await q("UPDATE MembroReferencia SET Status = N'DESLIGADO' WHERE MembroId = 940001");
  const vSaiu = await conferir(qr1);
  ok(vSaiu.status === 200 && vSaiu.body.situacao === "SAIU" && vSaiu.body.foto === null && !vSaiu.body.congregacao, "não é mais membro: só o nome, sem foto", JSON.stringify(vSaiu.body));
  ok((await escalar("SELECT Codigo FROM CarteirinhasQr WHERE MembroId = 940001")) === qr1, "o código continua o mesmo depois de tudo (nunca muda)");
  await q("UPDATE MembroReferencia SET Status = N'ATIVO', SituacaoMembro = N'EM_COMUNHAO' WHERE MembroId = 940001");
  const vNada = await conferir("ABCD-EFGH-JKLM-NPQR");
  const vLixo = await conferir("'; DROP TABLE CarteirinhasQr; --");
  const vCurto = await conferir("ABC");
  ok(vNada.status === 404 && vLixo.status === 404 && vCurto.status === 404 && vNada.body.situacao === "NAO_ENCONTRADA", "código desconhecido, lixo e curto: 404 igual", JSON.stringify([vNada.status, vLixo.status, vCurto.status]));
  ok((await escalar("SELECT COUNT(*) FROM CarteirinhasQr")) >= 3, "a tabela continua inteira depois da tentativa");

  console.log("== o resumo por congregação ==");
  const resG = await K(tok.geral(), "resumo");
  const linhaVn = ((resG.body && resG.body.congregacoes) || []).find((l) => l.congregacaoId === cong.VN);
  const filaAgora = (await K(tok.geral(), "fila", { query: { congregacaoId: cong.VN } })).body.itens;
  ok(resG.status === 200 && linhaVn && linhaVn.bloqueadas === 3 && linhaVn.repetidas === 2 && linhaVn.numeros === 1 && linhaVn.area === "Área E2E94",
    "Geral: Vila Nova com 3 bloqueadas (2 repetidas, 1 número) e a área", JSON.stringify(linhaVn));
  ok(linhaVn.prontas === filaAgora.filter((x) => !x.bloqueada).length, "as prontas do resumo batem com a lista da congregação", JSON.stringify([linhaVn.prontas, filaAgora.filter((x) => !x.bloqueada).map((x) => x.membroId)]));
  const resVn = await K(tok.vn(), "resumo");
  ok(resVn.status === 200 && resVn.body.congregacoes.length === 1 && resVn.body.congregacoes[0].congregacaoId === cong.VN && resVn.body.geral === false, "a local vê só a dela", JSON.stringify(resVn.body.congregacoes.map((l) => l.congregacao)));

  console.log("== juntar fichas com QR ==");
  const C6 = certificados.gerarCodigoVerificacao(), C7 = certificados.gerarCodigoVerificacao();
  await q("INSERT INTO CarteirinhasQr (MembroId, Codigo, CriadoEm) VALUES (940006, @c6, '2020-01-01'), (940007, @c7, '2026-01-01')", { c6: C6, c7: C7 });
  await q("INSERT INTO CarteirinhasPedidos (MembroId, Motivo, PedidoPor) VALUES (940007, N'perdeu', 9402)");
  const comp = await chamarRota("FichasRepetidas/index.js", { metodo: "GET", token: tok.vn(), binding: { acao: "comparar" }, query: { a: 940006, b: 940007 } });
  const junta = await chamarRota("FichasRepetidas/index.js", { metodo: "POST", token: tok.vn(), binding: { acao: "juntar" }, corpo: { a: 940006, b: 940007, escolhas: {}, versao: comp.body && comp.body.versao } });
  ok(junta.status === 200, "a junção das duas fichas com QR passa (nada bloqueia)", JSON.stringify(junta.body).slice(0, 300));
  ok((await escalar("SELECT COUNT(*) FROM CarteirinhasQr WHERE MembroId = 940006 AND Codigo IN (@c6, @c7)", { c6: C6, c7: C7 })) === 2,
    "os dois códigos agora são da ficha que fica (o cartão já impresso das duas continua valendo)");
  const vSai = await conferir(certificados.formatarCodigo(C7));
  ok(vSai.status === 200 && vSai.body.nome === "Marcos Vieira", "o QR da ficha que saiu confere a pessoa da ficha que ficou (não aparece como falso)", JSON.stringify(vSai.body));
  const urlNova = (await K(tok.membro(940006), "minha")).body.carteirinha.url;
  ok(urlNova.endsWith(encodeURIComponent(certificados.formatarCodigo(C6))), "o cartão novo sai com o código mais antigo", urlNova);
  ok((await escalar("SELECT COUNT(*) FROM CarteirinhasPedidos WHERE MembroId = 940006 AND AtendidoEm IS NULL")) === 1, "o pedido de segunda via da que saiu veio para a que fica");
  const posJunta = (await K(tok.vn(), "fila", { query: { congregacaoId: cong.VN } })).body.itens.find((x) => x.membroId === 940006);
  ok(posJunta && !posJunta.bloqueada && posJunta.motivo === "SEGUNDA_VIA", "depois de juntar: desbloqueada, com a segunda via pedida", JSON.stringify(posJunta));

  console.log("== sem sessão, sem permissão ==");
  for (const [acao, op] of [["modelos", {}], ["resumo", {}], ["fila", { query: { congregacaoId: cong.VN } }], ["imprimir", { metodo: "POST", corpo: { membroIds: [940010], material: "PAPEL" } }], ["ficha", { id: 940001 }]]) {
    const semSessao = await K(null, acao, op);
    const semPerm = await K(tok.semPessoas(), acao, op);
    ok(semSessao.status === 401 && semPerm.status === 403, `${acao}: sem sessão 401, sem a permissão "pessoas" 403`, JSON.stringify([semSessao.status, semPerm.status]));
  }
  const estranha = await K(tok.geral(), "qualquer");
  ok(estranha.status === 404, "ação estranha: 404");

  console.log("== o limitador da conferência ==");
  let limitado = false;
  for (let i = 0; i < 40 && !limitado; i++) limitado = (await conferir(qr1)).status === 429;
  ok(limitado, "muitas leituras seguidas da mesma origem: 429");

  fim("e2e-94 (as carteirinhas no banco)");
  L.shimEncerrar();
}

principal().catch((e) => { console.error(e); process.exitCode = 1; L.shimEncerrar(); });
