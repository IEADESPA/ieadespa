// Regra pura dos Setores Técnicos (v7.6): o catálogo contra o texto do Regimento e contra a migração, o Termo de Adesão específico (composição, hash e conferência),
// as validações de vínculo e de ato cautelar e a matriz de quem pode o quê. Sem banco: a camada com banco é coberta em setoresTecnicosDb.test.js e no roteiro
// ponta a ponta contra o SQL Server.
const fs = require("fs");
const path = require("path");
const st = require("../setoresTecnicos");
const vol = require("../voluntariado");

const RAIZ = path.resolve(__dirname, "..", "..", "..");
const REGIMENTO = fs.readFileSync(path.join(RAIZ, "regimento_interno_2026.txt"), "utf8");
const MIGRACAO = fs.readFileSync(path.join(RAIZ, "sql", "migrations", "142_setores_tecnicos.sql"), "utf8");
const HOJE = "2026-10-08";

// As linhas de INSERT do catálogo na migração: [codigo, inciso, nome, ExigeRegistro, PodeInterditar, PodeSolicitarRemocao, Ordem].
function setoresDaMigracao() {
  const texto = "(?:N'(?:[^']|'')*'|NULL)";
  const re = new RegExp(`VALUES \\(N'([A-Z_]+)', N'([IVXL]+)', N'((?:[^']|'')*)', N'((?:[^']|'')*)', ${texto}, ${texto}, (\\d), (\\d), (\\d), (\\d+)\\);`, "g");
  const lista = [];
  let m;
  while ((m = re.exec(MIGRACAO))) lista.push({ codigo: m[1], inciso: m[2], nome: m[3].replace(/''/g, "'"), competencia: m[4], exigeRegistro: m[5] === "1", podeInterditar: m[6] === "1", podeSolicitarRemocao: m[7] === "1", ordem: Number(m[8]) });
  return lista;
}

describe("o catálogo dos 20 Setores Técnicos (Art. 52)", () => {
  const setores = setoresDaMigracao();
  test("a migração semeia exatamente os 20 setores, na ordem dos incisos I a XX", () => {
    expect(setores).toHaveLength(20);
    const romanos = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];
    expect(setores.map(s => s.inciso)).toEqual(romanos);
    expect(setores.map(s => s.ordem)).toEqual(romanos.map((_, i) => i + 1));
    expect(new Set(setores.map(s => s.codigo)).size).toBe(20);
  });
  test("o nome de cada setor é o título que o Regimento dá ao inciso (a fonte do catálogo é o texto do Art. 52)", () => {
    for (const s of setores) expect(REGIMENTO).toContain(`${s.inciso} - ${s.nome}:`);
  });
  test("só Engenharia e Segurança interditam (Art. 50, I) e só Comunicação pede remoção de postagem (Art. 50, II)", () => {
    expect(setores.filter(s => s.podeInterditar).map(s => s.codigo)).toEqual(["ENGENHARIA", "SEGURANCA"]);
    expect(setores.filter(s => s.podeSolicitarRemocao).map(s => s.codigo)).toEqual(["COMUNICACAO"]);
  });
  test("exigem registro no conselho só os setores de profissão regulada que o Regimento chama de técnicos (engenharia, saúde, assistência social, contabilidade)", () => {
    expect(setores.filter(s => s.exigeRegistro).map(s => s.codigo)).toEqual(["ENGENHARIA", "SAUDE", "ASSISTENCIA_SOCIAL", "CONTABILIDADE"]);
  });
  test("o setor Jurídico traz os limites do Art. 51 na própria competência", () => {
    expect(setores.find(s => s.codigo === "JURIDICO").competencia).toMatch(/Art\. 51/);
  });
  test("a migração é reaplicável: cada setor entra só se o código ainda não existe, e o texto nunca tem uma linha só com GO dentro de string", () => {
    expect((MIGRACAO.match(/IF NOT EXISTS \(SELECT 1 FROM dbo\.SetoresTecnicos WHERE Codigo = /g) || []).length).toBe(20);
    for (const linha of MIGRACAO.split("\n")) if (/^\s*GO\s*$/i.test(linha)) expect(linha.trim()).toBe("GO");
  });
});

describe("a migração fala o mesmo que o código", () => {
  test("as três permissões novas são declaradas e concedidas só a Presidente e Secretário Geral", () => {
    for (const chave of ["setores_tecnicos", "setores_ratificacao", "vistoria_antecedentes"]) {
      expect(MIGRACAO).toMatch(new RegExp(`INSERT INTO dbo\\.Funcionalidades \\(Chave, Nome\\) VALUES \\('${chave}'`));
      expect(MIGRACAO).toMatch(new RegExp(`WHERE Nome IN \\('Presidente', 'Secretário Geral'\\) AND \\(',' \\+ ISNULL\\(Permissoes, ''\\) \\+ ','\\) NOT LIKE '%,${chave},%'`));
    }
  });
  test("toda regra de aviso que o código usa existe na migração, e as de ato cautelar não podem ser desligadas pelo destinatário", () => {
    const ler = (nome) => fs.readFileSync(path.join(__dirname, "..", `${nome}.js`), "utf8");
    // As chaves que as duas camadas de banco passam ao aviso imediato, mais as que o registro de detectores diários declara.
    const imediatas = [...(ler("setoresTecnicosDb") + ler("vistoriaAntecedentesDb")).matchAll(/regraChave: "([A-Z_]+)"/g)].map(m => m[1]);
    const diarias = [...ler("notificacaoDetectores").matchAll(/^  ((?:SETOR|VISTORIA)_[A-Z_]+): \{/gm)].map(m => m[1]);
    const chaves = new Set([...imediatas, ...diarias]);
    expect(chaves).toEqual(new Set(["SETOR_INDICADO", "SETOR_CANDIDATURA", "SETOR_INTERDICAO", "SETOR_INTERDICAO_DECIDIDA", "SETOR_INTERDICAO_PENDENTE", "SETOR_REMOCAO_SOLICITADA",
      "SETOR_REMOCAO_DECIDIDA", "SETOR_REMOCAO_PENDENTE", "VISTORIA_SOLICITADA", "VISTORIA_PENDENTES"]));
    for (const c of chaves) expect(MIGRACAO).toContain(`Chave = N'${c}'`);
    for (const c of ["SETOR_INTERDICAO", "SETOR_INTERDICAO_DECIDIDA", "SETOR_INTERDICAO_PENDENTE", "SETOR_REMOCAO_SOLICITADA", "SETOR_REMOCAO_PENDENTE", "SETOR_REMOCAO_DECIDIDA", "VISTORIA_SOLICITADA"]) {
      expect(MIGRACAO).toMatch(new RegExp(`VALUES \\(N'${c}', [^;]*, 1, 1\\);`));
    }
  });
  test("o CHECK do hash da certidão compara em binário: maiúscula não passa, e o gatilho do Termo de Vistoria recusa qualquer UPDATE ou DELETE", () => {
    expect(MIGRACAO).toMatch(/HashSha256 COLLATE Latin1_General_100_BIN2 NOT LIKE '%\[\^0-9a-f\]%'/);
    expect(MIGRACAO).toMatch(/TR_Vistorias_Imutavel ON dbo\.VistoriasAntecedentes AFTER UPDATE, DELETE/);
    expect(MIGRACAO).toMatch(/TR_VistoriasDoc_Imutavel ON dbo\.VistoriasDocumentos AFTER UPDATE, DELETE/);
  });
});

describe("Termo de Adesão do Setor Técnico (Art. 49 §2º)", () => {
  const juridico = { codigo: "JURIDICO", nome: "Setor Jurídico", podeInterditar: false, podeSolicitarRemocao: false };
  const engenharia = { codigo: "ENGENHARIA", nome: "Engenharia", podeInterditar: true, podeSolicitarRemocao: false };
  const comunicacao = { codigo: "COMUNICACAO", nome: "Comunicação", podeInterditar: false, podeSolicitarRemocao: true };
  const comum = { codigo: "MUSICA_SOM", nome: "Música", podeInterditar: false, podeSolicitarRemocao: false };

  test("o texto geral cita o Regimento e a Lei 9.608: sem honorários, responsabilidade técnica, autonomia, ciência e registro", () => {
    const t = st.termoDoSetor(comum);
    expect(t.itens.map(i => i.codigo)).toEqual(["NATUREZA", "SEM_HONORARIOS", "ABRANGENCIA", "RESPONSABILIDADE_TECNICA", "AUTONOMIA", "CIENCIA", "REGISTRO"]);
    expect(t.itens.find(i => i.codigo === "SEM_HONORARIOS").base).toMatch(/Art\. 49/);
    expect(t.itens.find(i => i.codigo === "RESPONSABILIDADE_TECNICA").texto).toMatch(/Responsabilidade Técnica.*conselho de classe/);
    expect(t.itens.find(i => i.codigo === "NATUREZA").base).toMatch(/Lei 9\.608/);
    expect(t.aceite).toMatch(/^Li, aceito as normas estatutárias e concordo com o regime de trabalho voluntário/);
  });
  test("cada setor ganha as cláusulas que o Regimento lhe dá: Jurídico (Art. 51), Engenharia/Segurança (Art. 50, I), Comunicação (Art. 50, II)", () => {
    expect(st.termoDoSetor(juridico).itens.map(i => i.codigo)).toContain("LIMITES_JURIDICOS");
    expect(st.termoDoSetor(engenharia).itens.map(i => i.codigo)).toContain("INTERDICAO");
    expect(st.termoDoSetor(engenharia).itens.map(i => i.codigo)).not.toContain("REMOCAO_POSTAGEM");
    expect(st.termoDoSetor(comunicacao).itens.map(i => i.codigo)).toContain("REMOCAO_POSTAGEM");
    expect(st.termoDoSetor(comum).itens.map(i => i.codigo)).not.toEqual(expect.arrayContaining(["INTERDICAO", "REMOCAO_POSTAGEM", "LIMITES_JURIDICOS"]));
    // O registro é sempre a última cláusula, logo antes da frase de aceite.
    for (const s of [juridico, engenharia, comunicacao, comum]) { const itens = st.termoDoSetor(s).itens; expect(itens[itens.length - 1].codigo).toBe("REGISTRO"); }
  });
  test("o hash cobre o texto exato: setor diferente, cláusula diferente ou versão diferente dão hash diferente, e é estável", () => {
    const hashes = [juridico, engenharia, comunicacao, comum].map(s => st.termoDoSetor(s).hash);
    expect(new Set(hashes).size).toBe(4);
    expect(st.termoDoSetor(engenharia).hash).toBe(st.termoDoSetor({ ...engenharia }).hash);
    expect(st.termoDoSetor(engenharia).hash).toMatch(/^[0-9a-f]{64}$/);
    // Mesmo código de setor com as marcas trocadas é OUTRO texto.
    expect(st.termoDoSetor({ ...engenharia, podeInterditar: false }).hash).not.toBe(st.termoDoSetor(engenharia).hash);
  });
  test("quem aceitou guarda a lista das cláusulas próprias: a conferência refaz o texto exato mesmo que o catálogo mude depois", () => {
    const aceito = st.termoDoSetor(engenharia);
    const adesao = { forma: "CLICKWRAP", termoVersao: aceito.versao, termoHash: aceito.hash, termoEspecificos: st.textoDosEspecificos(aceito.especificos) };
    expect(st.avaliarIntegridadeAdesao(adesao, engenharia).status).toBe("OK");
    // A Secretaria desmarcou o poder de interditar depois do aceite: o Termo que a pessoa viu continua íntegro.
    expect(st.avaliarIntegridadeAdesao(adesao, { ...engenharia, podeInterditar: false }).status).toBe("OK");
    expect(st.avaliarIntegridadeAdesao({ ...adesao, termoHash: "0".repeat(64) }, engenharia).status).toBe("DIVERGENTE");
    expect(st.avaliarIntegridadeAdesao({ ...adesao, termoVersao: 0 }, engenharia).status).toBe("VERSAO_ANTERIOR");
    expect(st.avaliarIntegridadeAdesao({ ...adesao, termoHash: null }, engenharia).status).toBe("SEM_HASH");
    expect(st.avaliarIntegridadeAdesao({ forma: "FICHA_FISICA" }, engenharia).status).toBe("DOCUMENTO_EXTERNO");
    expect(st.avaliarIntegridadeAdesao({ forma: "MENSAGERIA" }, engenharia).status).toBe("DOCUMENTO_EXTERNO");
  });
  test("lista de cláusulas desconhecidas é ignorada (nada de texto que não está no código)", () => {
    expect(st.termoDoSetor(comum, ["INTERDICAO", "INVENTADA"]).especificos).toEqual(["INTERDICAO"]);
    expect(st.listaDosEspecificos("INTERDICAO,REMOCAO_POSTAGEM")).toEqual(["INTERDICAO", "REMOCAO_POSTAGEM"]);
    expect(st.listaDosEspecificos(null)).toEqual([]);
    expect(st.textoDosEspecificos(["A", "B"])).toBe("A,B");
  });
  test("nenhum texto do Termo carrega sinal de tag", () => {
    for (const s of [juridico, engenharia, comunicacao, comum]) for (const i of st.termoDoSetor(s).itens) expect(`${i.texto}${i.base}`).not.toMatch(/[<>]/);
  });
});

describe("catálogo: criar e editar setor", () => {
  const base = { nome: "Setor de Fotografia", competencia: "Registro fotográfico oficial dos eventos da Igreja." };
  test("o mínimo que vale: nome e competência; o resto assume o padrão", () => {
    const v = st.validarSetor(base);
    expect(v.valido).toBe(true);
    expect(v.dados).toMatchObject({ nome: "Setor de Fotografia", exigeRegistro: false, podeInterditar: false, podeSolicitarRemocao: false, ordem: 0, profissoes: null, conselhoClasse: null, inciso: null });
  });
  test("recusa nome curto, longo, com tag, competência curta e marcas que não são booleanas", () => {
    for (const nome of ["ab", "x".repeat(101), "Setor <b>", "Setor >"]) expect(st.validarSetor({ ...base, nome }).valido).toBe(false);
    for (const competencia of ["curta", "x".repeat(601), "tem <script>"]) expect(st.validarSetor({ ...base, competencia }).valido).toBe(false);
    for (const campo of ["exigeRegistro", "podeInterditar", "podeSolicitarRemocao"]) for (const valor of ["true", 1, [], {}]) expect(st.validarSetor({ ...base, [campo]: valor }).valido).toBe(false);
    for (const ordem of [-1, 1000, 1.5, "abc"]) expect(st.validarSetor({ ...base, ordem }).valido).toBe(false);
    expect(st.validarSetor({ ...base, inciso: "XXI" }).valido).toBe(true);
    expect(st.validarSetor({ ...base, inciso: "21" }).valido).toBe(false);
  });
  test("o código do setor sai do nome, sem acento, em maiúsculas, com no máximo 30 caracteres", () => {
    expect(st.gerarCodigoSetor("Setor de Fotografia")).toBe("SETOR_DE_FOTOGRAFIA");
    expect(st.gerarCodigoSetor("Educação & Pedagogia!")).toBe("EDUCACAO_PEDAGOGIA");
    expect(st.gerarCodigoSetor("Setor de Engenharia, Arquitetura e Obras Públicas")).toHaveLength(st.gerarCodigoSetor("Setor de Engenharia, Arquitetura e Obras Públicas").length);
    expect(st.gerarCodigoSetor("Setor de Engenharia, Arquitetura e Obras Públicas").length).toBeLessThanOrEqual(30);
    expect(st.gerarCodigoSetor("Setor de Engenharia, Arquitetura e Obras Públicas")).not.toMatch(/_$/);
    expect(st.gerarCodigoSetor("!!")).toBeNull();
    expect(st.gerarCodigoSetor("")).toBeNull();
  });
});

describe("vínculo: formação, registro no conselho e quem pode servir", () => {
  test("registro: sigla e número juntos ou nenhum; setor que exige não aceita em branco", () => {
    expect(st.validarRegistroProfissional({})).toEqual({ valido: true, conselhoSigla: null, registroNumero: null });
    expect(st.validarRegistroProfissional({ conselhoSigla: "crea-pa", registroNumero: "12345/d" })).toEqual({ valido: true, conselhoSigla: "CREA-PA", registroNumero: "12345/D" });
    expect(st.validarRegistroProfissional({ conselhoSigla: "CREA" }).valido).toBe(false);
    expect(st.validarRegistroProfissional({ registroNumero: "123" }).valido).toBe(false);
    const exige = st.validarRegistroProfissional({}, { exige: true, conselhoClasse: "CREA / CAU" });
    expect(exige.valido).toBe(false);
    expect(exige.mensagem).toMatch(/CREA \/ CAU/);
    for (const ruim of [{ conselhoSigla: "<b>", registroNumero: "1" }, { conselhoSigla: "C", registroNumero: "1" }, { conselhoSigla: "CREA", registroNumero: "1 2" }, { conselhoSigla: "CREA", registroNumero: "x".repeat(31) }, { conselhoSigla: "A".repeat(21), registroNumero: "1" }]) {
      expect(st.validarRegistroProfissional(ruim).valido).toBe(false);
    }
    expect(st.rotuloRegistro("CREA", "123")).toBe("CREA 123");
    expect(st.rotuloRegistro(null, null)).toBeNull();
  });
  test("formação: de 3 a 150 caracteres, sem tag", () => {
    expect(st.validarFormacao("Engenheira civil, UFPA").valido).toBe(true);
    for (const f of ["", "ab", "x".repeat(151), "<img src=x onerror=alert(1)>", null, undefined]) expect(st.validarFormacao(f).valido).toBe(false);
  });
  test("só serve quem é membro ativo em comunhão, maior de 18 anos e com data de nascimento no cadastro", () => {
    expect(st.condicaoParaServir({ Status: "ATIVO", SituacaoMembro: "EM_COMUNHAO", idade: 30 })).toEqual({ pode: true });
    expect(st.condicaoParaServir({ Status: "ATIVO", SituacaoMembro: "CONGREGADO", idade: 18 }).pode).toBe(true);
    expect(st.condicaoParaServir({ Status: "ATIVO", SituacaoMembro: "SEM_COMUNHAO", idade: 30 }).pode).toBe(false);
    expect(st.condicaoParaServir({ Status: "DESLIGADO", SituacaoMembro: "EM_COMUNHAO", idade: 30 }).pode).toBe(false);
    expect(st.condicaoParaServir({ Status: "ATIVO", SituacaoMembro: "EM_COMUNHAO", idade: 17 }).mensagem).toMatch(/18 anos/);
    expect(st.condicaoParaServir({ Status: "ATIVO", SituacaoMembro: "EM_COMUNHAO", idade: null }).mensagem).toMatch(/data de nascimento/);
    expect(st.condicaoParaServir(null).pode).toBe(false);
  });
  test("candidatura e indicação: setor e membro precisam ser inteiros estritos; o registro vale conforme o setor", () => {
    const setor = { exigeRegistro: true, conselhoClasse: "CREA / CAU" };
    const ok = { setorId: "2", formacao: "Engenheiro civil", conselhoSigla: "CREA", registroNumero: "55" };
    expect(st.validarCandidatura(ok, { setor }).dados).toEqual({ setorId: 2, formacao: "Engenheiro civil", conselhoSigla: "CREA", registroNumero: "55" });
    for (const setorId of ["0x10", "1e1", true, [5], 0, -1, "", null, 2.5]) expect(st.validarCandidatura({ ...ok, setorId }, { setor }).valido).toBe(false);
    expect(st.validarCandidatura({ ...ok, conselhoSigla: "", registroNumero: "" }, { setor }).valido).toBe(false);
    expect(st.validarCandidatura({ ...ok, conselhoSigla: "", registroNumero: "" }, { setor: { exigeRegistro: false } }).valido).toBe(true);
    expect(st.validarIndicacao({ ...ok, membroId: 7 }, { setor }).dados.membroId).toBe(7);
    for (const membroId of [undefined, "abc", "0x7", 0, true]) expect(st.validarIndicacao({ ...ok, membroId }, { setor }).valido).toBe(false);
  });
  test("encerramento: o desligamento exige motivo, ninguém desliga a si mesmo, e RECUSADO não é escolha de quem encerra", () => {
    const ok = st.validarEncerramento({ tipoMotivo: "DESLIGAMENTO", observacao: "Mudou de área profissional." }, { atorId: 1, membroId: 7 });
    expect(ok.valido).toBe(true);
    expect(st.validarEncerramento({ tipoMotivo: "DESLIGAMENTO" }, { atorId: 1, membroId: 7 }).valido).toBe(false);
    expect(st.validarEncerramento({ tipoMotivo: "MUDANCA" }, { atorId: 1, membroId: 7 }).valido).toBe(true);
    expect(st.validarEncerramento({ tipoMotivo: "OUTRO", observacao: "x" }, { atorId: 7, membroId: 7 }).valido).toBe(false);
    expect(st.validarEncerramento({ tipoMotivo: "RECUSADO" }, { atorId: 1, membroId: 7 }).valido).toBe(false);
    expect(st.validarEncerramento({ tipoMotivo: "XXX" }, { atorId: 1, membroId: 7 }).valido).toBe(false);
    expect(st.validarEncerramento({ tipoMotivo: "MUDANCA", observacao: "<b>" }, { atorId: 1, membroId: 7 }).valido).toBe(false);
  });
  test("termo registrado pela Secretaria: só ficha ou mensagem, com data e referência; nunca no futuro", () => {
    expect(st.validarRegistroTermo({ forma: "FICHA_FISICA", dataAceite: "2026-10-01", referencia: "Pasta 3, ficha 12" }, { hoje: HOJE }).valido).toBe(true);
    expect(st.validarRegistroTermo({ forma: "MENSAGERIA", dataAceite: "2026-10-01", referencia: "E-mail de 01/10", canal: "EMAIL" }, { hoje: HOJE }).valido).toBe(true);
    expect(st.validarRegistroTermo({ forma: "CLICKWRAP", dataAceite: "2026-10-01", referencia: "x" }, { hoje: HOJE }).valido).toBe(false);
    expect(st.validarRegistroTermo({ forma: "FICHA_FISICA", dataAceite: "2026-12-01", referencia: "ficha 1" }, { hoje: HOJE }).valido).toBe(false);
    expect(st.validarRegistroTermo({ forma: "MENSAGERIA", dataAceite: "2026-10-01", referencia: "mensagem" }, { hoje: HOJE }).valido).toBe(false);
  });
});

describe("ato cautelar: interdição (Art. 50, I)", () => {
  const ok = { congregacaoId: "3", motivo: "risco_desabamento", objeto: "Templo principal — cobertura da nave", descricao: "Vi rachaduras novas na viga principal e a cobertura cedeu cinco centímetros desde a última visita.", referencia: "ART 12345" };
  test("o pedido válido sai normalizado", () => {
    const v = st.validarInterdicao(ok);
    expect(v.valido).toBe(true);
    expect(v.dados).toMatchObject({ congregacaoId: 3, motivo: "RISCO_DESABAMENTO", objeto: "Templo principal — cobertura da nave", referencia: "ART 12345" });
    expect(st.validarInterdicao({ ...ok, referencia: "" }).dados.referencia).toBeNull();
  });
  test("recusa congregação mal escrita, motivo fora da lista, objeto vazio, justificativa curta e qualquer sinal de tag", () => {
    for (const congregacaoId of ["0x3", "1e1", true, [3], 0, "", null]) expect(st.validarInterdicao({ ...ok, congregacaoId }).valido).toBe(false);
    for (const motivo of ["ERRO_GROSSEIRO", "", "falta de pintura", null]) expect(st.validarInterdicao({ ...ok, motivo }).valido).toBe(false);
    for (const objeto of ["", "ab", "x".repeat(151), "<img src=x onerror=1>", null]) expect(st.validarInterdicao({ ...ok, objeto }).valido).toBe(false);
    for (const descricao of ["curta demais", "x".repeat(1001), "y".repeat(40) + " <script>", null]) expect(st.validarInterdicao({ ...ok, descricao }).valido).toBe(false);
    expect(st.validarInterdicao({ ...ok, referencia: "x".repeat(301) }).valido).toBe(false);
    expect(st.validarInterdicao({ ...ok, referencia: "<b>" }).valido).toBe(false);
  });
});

describe("ato cautelar: pedido de remoção de postagem (Art. 50, II)", () => {
  const ok = { congregacaoId: 3, motivo: "DIREITO_AUTORAL", objeto: "Instagram @congregacao", referencia: "https://www.instagram.com/p/AbC123/", descricao: "A foto é de um fotógrafo profissional e foi usada sem autorização." };
  test("o pedido válido sai normalizado; o canal é opcional quando a rede é descrita", () => {
    expect(st.validarPedidoRemocao(ok).dados).toMatchObject({ congregacaoId: 3, canalId: null, motivo: "DIREITO_AUTORAL", referencia: "https://www.instagram.com/p/AbC123/" });
    const comCanal = st.validarPedidoRemocao({ ...ok, canalId: "8", objeto: "" });
    expect(comCanal.valido).toBe(true);
    expect(comCanal.dados.canalId).toBe(8);
    expect(comCanal.dados.objeto).toBeNull();
    expect(st.validarPedidoRemocao({ ...ok, objeto: "" }).valido).toBe(false);
  });
  test("o link só pode ser http ou https com domínio — nada de javascript:, data:, espaço, aspas ou tag", () => {
    for (const bom of ["https://www.instagram.com/p/AbC123/", "http://exemplo.org/post?id=1&x=2", "https://facebook.com/permalink.php?story_fbid=1"]) expect(st.enderecoDaPostagem(bom)).toBe(bom);
    for (const ruim of ["javascript:alert(1)", "data:text/html,<b>", "ftp://exemplo.org/x", "https://localhost/x", "https://exe mplo.org", "https://x.org/\"onload=1", "https://x.org/<b>", "//exemplo.org/x", "exemplo.org/x", "", null, "https://" + "a".repeat(300) + ".org"]) expect(st.enderecoDaPostagem(ruim)).toBeNull();
    expect(st.validarPedidoRemocao({ ...ok, referencia: "javascript:alert(1)" }).valido).toBe(false);
  });
  test("recusa motivo de interdição, canal mal escrito e justificativa curta", () => {
    expect(st.validarPedidoRemocao({ ...ok, motivo: "RISCO_DESABAMENTO" }).valido).toBe(false);
    for (const canalId of ["0x8", "1e1", true, [8], 0, -2, 1.5]) expect(st.validarPedidoRemocao({ ...ok, canalId }).valido).toBe(false);
    expect(st.validarPedidoRemocao({ ...ok, descricao: "curta" }).valido).toBe(false);
  });
});

describe("ratificar, revogar, levantar, atender e cancelar", () => {
  test("ratificar só vale para interdição; revogar vale para os dois e exige motivo", () => {
    expect(st.validarDecisao({ decisao: "ratificar" }, { tipo: "INTERDICAO" }).dados).toMatchObject({ decisao: "RATIFICAR", para: "RATIFICADA", observacao: null });
    expect(st.validarDecisao({ decisao: "RATIFICAR" }, { tipo: "REMOCAO_POSTAGEM" }).valido).toBe(false);
    expect(st.validarDecisao({ decisao: "REVOGAR" }, { tipo: "INTERDICAO" }).valido).toBe(false);
    expect(st.validarDecisao({ decisao: "REVOGAR", observacao: "curto" }, { tipo: "INTERDICAO" }).valido).toBe(false);
    expect(st.validarDecisao({ decisao: "REVOGAR", observacao: "O laudo mostra que não há risco." }, { tipo: "REMOCAO_POSTAGEM" }).dados.para).toBe("REVOGADA");
    for (const d of ["", "TALVEZ", null, 3]) expect(st.validarDecisao({ decisao: d }, { tipo: "INTERDICAO" }).valido).toBe(false);
    expect(st.validarDecisao({ decisao: "RATIFICAR", observacao: "<b>" }, { tipo: "INTERDICAO" }).valido).toBe(false);
  });
  test("levantar e cancelar exigem observação; atender usa um texto padrão quando vem em branco", () => {
    expect(st.validarFechamento({}, { acao: "LEVANTAR" }).valido).toBe(false);
    expect(st.validarFechamento({ observacao: "Reforço concluído, laudo emitido." }, { acao: "LEVANTAR" }).dados).toMatchObject({ para: "LEVANTADA", tipo: "INTERDICAO" });
    expect(st.validarFechamento({}, { acao: "CANCELAR" }).valido).toBe(false);
    expect(st.validarFechamento({}, { acao: "ATENDER" }).dados).toMatchObject({ para: "ATENDIDA", tipo: "REMOCAO_POSTAGEM", observacao: "Atendido: a postagem foi removida." });
    expect(st.validarFechamento({ observacao: "Postagem apagada às 14h" }, { acao: "ATENDER" }).dados.observacao).toBe("Postagem apagada às 14h");
    expect(st.validarFechamento({ observacao: "x".repeat(301) }, { acao: "ATENDER" }).valido).toBe(false);
    expect(st.validarFechamento({}, { acao: "APAGAR" }).valido).toBe(false);
  });
  test("as transições permitidas por tipo de ato", () => {
    expect(st.transicaoPermitida("INTERDICAO", "EMITIDA", "RATIFICADA")).toBe(true);
    expect(st.transicaoPermitida("INTERDICAO", "EMITIDA", "REVOGADA")).toBe(true);
    expect(st.transicaoPermitida("INTERDICAO", "EMITIDA", "LEVANTADA")).toBe(true);
    expect(st.transicaoPermitida("INTERDICAO", "RATIFICADA", "LEVANTADA")).toBe(true);
    expect(st.transicaoPermitida("INTERDICAO", "RATIFICADA", "REVOGADA")).toBe(false);
    expect(st.transicaoPermitida("INTERDICAO", "REVOGADA", "RATIFICADA")).toBe(false);
    expect(st.transicaoPermitida("INTERDICAO", "LEVANTADA", "EMITIDA")).toBe(false);
    expect(st.transicaoPermitida("REMOCAO_POSTAGEM", "EMITIDA", "ATENDIDA")).toBe(true);
    expect(st.transicaoPermitida("REMOCAO_POSTAGEM", "EMITIDA", "RATIFICADA")).toBe(false);
    expect(st.transicaoPermitida("REMOCAO_POSTAGEM", "ATENDIDA", "CANCELADA")).toBe(false);
    expect(st.transicaoPermitida("OUTRO", "EMITIDA", "ATENDIDA")).toBe(false);
  });
});

describe("quem pode o quê em cada ato (a mesma função mostra o botão e confere a rota)", () => {
  const interdicao = (extra = {}) => ({ tipo: "INTERDICAO", status: "EMITIDA", setorId: 2, emitidaPorMembroId: 50, congregacaoNome: "Central", canalId: null, ...extra });
  const remocao = (extra = {}) => ({ tipo: "REMOCAO_POSTAGEM", status: "EMITIDA", setorId: 6, emitidaPorMembroId: 50, congregacaoNome: "Central", canalId: 8, ...extra });
  const acesso = (extra = {}) => ({ membroId: 1, diretoria: false, gestao: false, lider: () => false, setoresAtivos: new Set(), canaisAdministrados: new Set(), ...extra });
  const quem = (ato, a) => st.ACOES_DO_ATO.filter(x => st.podeAgirNoAto(ato, x, a));

  test("a Diretoria ratifica, revoga e levanta a interdição de outra pessoa", () => {
    expect(quem(interdicao(), acesso({ diretoria: true }))).toEqual(["RATIFICAR", "REVOGAR", "LEVANTAR"]);
    expect(quem(interdicao({ status: "RATIFICADA" }), acesso({ diretoria: true }))).toEqual(["LEVANTAR"]);
  });
  test("ninguém ratifica nem revoga o ato que emitiu (segregação), mas pode levantá-lo enquanto serve no setor", () => {
    const meu = interdicao({ emitidaPorMembroId: 1 });
    expect(quem(meu, acesso({ diretoria: true }))).toEqual(["LEVANTAR"]);
    expect(quem(meu, acesso({ setoresAtivos: new Set([2]) }))).toEqual(["LEVANTAR"]);
    // Saiu do setor: perde o poder de levantar.
    expect(quem(meu, acesso({ setoresAtivos: new Set([3]) }))).toEqual([]);
    expect(quem(meu, acesso())).toEqual([]);
  });
  test("o emitente de outro setor ou um estranho não faz nada na interdição", () => {
    expect(quem(interdicao(), acesso({ setoresAtivos: new Set([2]) }))).toEqual([]);
    expect(quem(interdicao(), acesso({ gestao: true }))).toEqual([]);
    expect(quem(interdicao(), acesso({ lider: () => true }))).toEqual([]);
  });
  test("interdição encerrada (revogada, levantada) é definitiva", () => {
    for (const status of ["REVOGADA", "LEVANTADA"]) expect(quem(interdicao({ status }), acesso({ diretoria: true, setoresAtivos: new Set([2]) }))).toEqual([]);
  });
  test("o pedido de remoção é atendido por quem cuida da rede, pelo líder da congregação, pela gestão ou pela Diretoria — nunca por quem emitiu", () => {
    expect(quem(remocao(), acesso({ canaisAdministrados: new Set([8]) }))).toEqual(["ATENDER"]);
    expect(quem(remocao(), acesso({ canaisAdministrados: new Set([9]) }))).toEqual([]);
    expect(quem(remocao(), acesso({ lider: (nome) => nome === "Central" }))).toEqual(["ATENDER"]);
    expect(quem(remocao(), acesso({ lider: (nome) => nome === "Vila Nova" }))).toEqual([]);
    expect(quem(remocao(), acesso({ gestao: true }))).toEqual(["ATENDER"]);
    expect(quem(remocao(), acesso({ diretoria: true }))).toEqual(["REVOGAR", "ATENDER"]);
    expect(quem(remocao({ emitidaPorMembroId: 1 }), acesso({ diretoria: true, gestao: true, lider: () => true, canaisAdministrados: new Set([8]) }))).toEqual(["CANCELAR"]);
  });
  test("pedido sem canal registrado só é atendido pelo líder, pela gestão ou pela Diretoria", () => {
    expect(quem(remocao({ canalId: null }), acesso({ canaisAdministrados: new Set([8]) }))).toEqual([]);
    expect(quem(remocao({ canalId: null }), acesso({ lider: () => true }))).toEqual(["ATENDER"]);
  });
  test("pedido já decidido não aceita mais nada", () => {
    for (const status of ["ATENDIDA", "CANCELADA", "REVOGADA"]) expect(quem(remocao({ status }), acesso({ diretoria: true, gestao: true, lider: () => true }))).toEqual([]);
  });
  test("entrada estranha nunca dá permissão", () => {
    expect(st.podeAgirNoAto(null, "ATENDER", acesso())).toBe(false);
    expect(st.podeAgirNoAto(remocao(), "ATENDER", null)).toBe(false);
    expect(st.podeAgirNoAto(remocao(), "APAGAR", acesso({ diretoria: true }))).toBe(false);
    expect(st.podeAgirNoAto(remocao(), "ATENDER", { membroId: 1, diretoria: false, gestao: false })).toBe(false);
  });
  test("setor desativado ou sem a marca não emite", () => {
    expect(st.setorPodeEmitir({ ativo: true, podeInterditar: true }, "INTERDICAO")).toBe(true);
    expect(st.setorPodeEmitir({ ativo: false, podeInterditar: true }, "INTERDICAO")).toBe(false);
    expect(st.setorPodeEmitir({ ativo: true, podeInterditar: true }, "REMOCAO_POSTAGEM")).toBe(false);
    expect(st.setorPodeEmitir({ ativo: true, podeSolicitarRemocao: true }, "REMOCAO_POSTAGEM")).toBe(true);
    expect(st.setorPodeEmitir(null, "INTERDICAO")).toBe(false);
  });
});

describe("textos dos avisos", () => {
  test("a interdição diz quem, onde, por quê, que a Diretoria precisa decidir e que a vida vem antes da agenda", () => {
    const t = st.textoInterdicaoEmitida({ setorNome: "Setor de Engenharia", emitenteNome: "Ana", registro: "CREA 55", congregacaoNome: "Central", objeto: "o templo principal", motivo: "RISCO_DESABAMENTO", hoje: HOJE });
    expect(t).toMatch(/Ana \(CREA 55\) INTERDITOU/);
    expect(t).toMatch(/Central/);
    expect(t).toMatch(/risco de desabamento/);
    expect(t).toMatch(/08\/10\/2026/);
    expect(t).toMatch(/ratificá-lo ou revogá-lo/);
    expect(t).toMatch(/segurança da vida prevalece/);
    expect(t.length).toBeLessThan(1000);
  });
  test("as decisões e as cobranças citam o fato e o prazo", () => {
    const dec = (decisao) => st.textoInterdicaoDecidida({ decisao, setorNome: "Eng", congregacaoNome: "Central", objeto: "o templo", observacao: "ok" });
    expect(dec("RATIFICADA")).toMatch(/RATIFICOU/);
    expect(dec("REVOGADA")).toMatch(/REVOGOU/);
    expect(dec("LEVANTADA")).toMatch(/LEVANTADA/);
    expect(st.textoInterdicaoPendente({ setorNome: "Eng", congregacaoNome: "Central", objeto: "o templo", emitidaEm: "2026-10-01", dias: 7 })).toMatch(/há 7 dia\(s\) sem ratificação/);
    expect(st.textoRemocaoPendente({ setorNome: "Com", congregacaoNome: "Central", emitidaEm: "2026-10-01", dias: 3 })).toMatch(/remoção imediata/);
    expect(st.textoPedidoRemocao({ setorNome: "Com", emitenteNome: "Bia", congregacaoNome: "Central", objeto: "Instagram", motivo: "ERRO_GROSSEIRO", hoje: HOJE })).toMatch(/REMOÇÃO IMEDIATA/);
    expect(st.textoRemocaoDecidida({ para: "ATENDIDA", setorNome: "Com", congregacaoNome: "Central" })).toMatch(/ATENDIDO/);
    expect(st.textoRemocaoDecidida({ para: "REVOGADA", setorNome: "Com", congregacaoNome: "Central", observacao: "foi um engano" })).toMatch(/REVOGOU.*foi um engano/);
    expect(st.textoRemocaoDecidida({ para: "CANCELADA", setorNome: "Com", congregacaoNome: "Central" })).toMatch(/CANCELOU/);
    expect(st.textoVinculoIndicado({ setorNome: "Setor Jurídico" })).toMatch(/aceite o Termo de Adesão/);
    expect(st.textoCandidatura({ nome: "Caio", setorNome: "Setor Jurídico" })).toMatch(/Caio se candidatou/);
  });
});

describe("os limites de contenção estão escritos num lugar só", () => {
  test("tetos de atos e de vínculos", () => {
    expect(st.MAX_ATOS_ABERTOS_POR_EMITENTE).toBe(5);
    expect(st.MAX_ATOS_POR_DIA).toBe(3);
    expect(st.MAX_VINCULOS_VIGENTES_POR_PESSOA).toBe(5);
    expect(st.IP_RETENCAO_DIAS_PADRAO).toBe(vol.IP_RETENCAO_DIAS_PADRAO);
  });
});
