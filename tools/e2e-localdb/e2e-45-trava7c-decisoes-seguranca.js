// e2e-45-trava7c-decisoes-seguranca.js — Trava de Revisão 7-C, as duas decisões de 23/10/2026 sob ataque: quem pode o quê (matriz de atores), o 403 igual para "não existe" e
// "não é seu", o território na ligação do fornecedor à matrícula, a busca que não vira sonda nem injeção, e lixo em cada campo (nunca 500, nunca vazamento, e a chamada
// recusada não mexe no banco). Handlers e banco REAIS, sobre a base "cenario-trava7c".
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, API, path, GERAL, LIDER, PIN, sessao, LIXO, GET, POST } = L;
const st = require(path.join(API, "shared/storage.js"));
st.salvarDocumento = async () => "https://blob.e2e/documentos/doc-seg";
st.urlDocumentoComSas = (u) => u;
const HF = require(path.join(API, "GestaoFornecedores/index.js"));
const HS = require(path.join(API, "GestaoSaidas/index.js"));
const HM = require(path.join(API, "GestaoMinisterioMenores/index.js"));
const HL = require(path.join(API, "GestaoLideranca/index.js"));

let falhasAuditoria = 0;
const erroOriginal = console.error;
console.error = (...a) => { if (String(a[0]).includes("[AUDITORIA]")) falhasAuditoria++; if (process.env.E2E_VERBOSO) erroOriginal(...a); };

async function chamar(h, { metodo = "GET", ligado = {}, query = {}, corpo, token }) {
  const ctx = { bindingData: ligado, log: Object.assign(() => { }, { error() { }, info() { }, warn() { }, verbose() { } }) };
  const qs = {}; for (const [k, v] of Object.entries(query)) qs[k] = v == null ? v : (typeof v === "object" ? v : String(v));
  await h(ctx, { method: metodo, query: qs, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return ctx.res || { status: 0, body: null };
}
// o retrato das tabelas das duas decisões (contagem + soma de verificação): uma chamada recusada não pode mudar nada
async function retrato() {
  const partes = [];
  for (const t of ["Fornecedores", "SaidasTesouraria", "SaidaAvisosVoluntario", "Departamentos", "Papeis", "Lideranca", "Notificacoes"]) partes.push(JSON.stringify(await um(`SELECT COUNT(*) n, CHECKSUM_AGG(CHECKSUM(*)) c FROM ${t}`)));
  return partes.join("|");
}
async function fuzz(rotulo, { campos, base, chamarCom, aceitos = [200, 201, 400, 401, 403, 404, 409, 422, 428] }) {
  const quebras = [], mudancas = [];
  let n = 0;
  for (const campo of campos) for (const lixo of LIXO) {
    const corpo = { ...base };
    if (lixo === undefined) delete corpo[campo]; else corpo[campo] = lixo;
    const antes = await retrato();
    const r = await chamarCom(corpo);
    n++;
    if (r.status === 500 || !aceitos.includes(r.status)) quebras.push(`${campo}=${JSON.stringify(lixo).slice(0, 30)} -> ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
    else if ((r.status >= 400 || (r.body && r.body.sucesso === false)) && (await retrato()) !== antes) mudancas.push(`${campo}=${JSON.stringify(lixo).slice(0, 30)} (${r.status}) mexeu no banco`);
    if (r.body && /SELECT |INSERT |UPDATE |ConnectionError|mssql|tedious|at Object|node_modules/i.test(JSON.stringify(r.body))) quebras.push(`${campo} vazou texto interno: ${JSON.stringify(r.body).slice(0, 140)}`);
  }
  ok(quebras.length === 0, `${rotulo}: ${n} chamadas com lixo, nenhuma 500 nem vazamento`, quebras.slice(0, 5));
  ok(mudancas.length === 0, `${rotulo}: a chamada recusada nunca altera o banco`, mudancas.slice(0, 5));
}
const C = "Central E2E", V = "Vila Nova E2E";
const TES_C = () => LIDER(3001, ["financeiro"], [C]);
const TES_V = () => LIDER(3002, ["financeiro"], [V]);
const TES_DEP = () => LIDER(3001, ["tesouraria_departamental"], [C]);
const ADM_P = () => GERAL(1002, ["pessoas"]);
const ADM_PERM = () => GERAL(1002, ["permissoes"]);
const PDF = Buffer.from("%PDF nota").toString("base64");

(async () => {
  await obterPool();
  const c1 = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = @n", { n: C });

  console.log("== o fornecedor ligado à matrícula: atores e território ==");
  for (const [nome, tk, esperado] of [["sem sessão", null, 401], ["PIN", PIN(6010), 403], ["tesouraria só do departamento", TES_DEP(), 403], ["Dirigente sem financeiro", LIDER(3001, ["pessoas", "protecao_menores"], [C]), 403]]) {
    const r = await chamar(HF, { token: tk, query: { buscaMembro: "Apta" } });
    ok(r.status === esperado, `${nome}: ${esperado} na busca de membro`, r.status);
  }
  let r = await chamar(HF, { metodo: "POST", token: TES_C(), corpo: { nome: "Ana Seg E2E", cpfCnpj: "555.555.555-55", tipo: "PF", membroId: 6010 } });
  const fAna = r.body.fornecedorId;
  ok(r.status === 201, "o tesoureiro da Central liga a Ana (da Central)");
  r = await chamar(HF, { metodo: "POST", token: TES_V(), corpo: { nome: "Pessoa Seg E2E", cpfCnpj: "666.666.666-66", tipo: "PF" } });
  const fVila = r.body.fornecedorId;
  const antes = await retrato();
  r = await chamar(HF, { metodo: "PUT", token: TES_V(), ligado: { id: String(fVila) }, corpo: { membroId: 6012 } });
  const fora = r.body;
  r = await chamar(HF, { metodo: "PUT", token: TES_V(), ligado: { id: String(fVila) }, corpo: { membroId: 987654 } });
  ok(fora.mensagem === "Membro não encontrado no seu território." && JSON.stringify(fora) === JSON.stringify(r.body), "a Vila Nova não liga a matrícula de alguém da Central: a mesma resposta de \"não existe\" (não é sonda)", fora);
  ok((await retrato()) === antes, "e nada mudou");
  r = await chamar(HF, { token: TES_V(), query: { buscaMembro: "Apta" } });
  ok(!(r.body.membros || []).some((m) => [6010, 6012, 6024].includes(m.membroId)), "a busca da Vila Nova não mostra ninguém da Central", r.body.membros);
  r = await chamar(HF, { token: TES_V(), query: { buscaMembro: "6010" } });
  ok((r.body.membros || []).length === 0, "nem pela matrícula", r.body);
  for (const sonda of ["'; DROP TABLE Fornecedores; --", "%' OR 1=1 --", "[a-z]%", "_____", "%%%"]) {
    r = await chamar(HF, { token: TES_C(), query: { buscaMembro: sonda } });
    ok(r.status === 200 && Array.isArray(r.body.membros) && r.body.membros.length === 0, `a busca com "${sonda}" é só texto (nenhum curinga, nenhuma injeção)`, r.body);
  }
  ok((await escalar("SELECT COUNT(*) FROM Fornecedores")) >= 2, "a tabela continua lá");
  r = await chamar(HF, { token: TES_C(), query: { buscaMembro: ["Apta", "M7"] } });
  ok(r.status === 200 && Array.isArray(r.body.membros), "a busca com o parâmetro repetido (lista) não quebra", r.body);

  console.log("== lixo nos campos novos ==");
  let seq = 0;
  await fuzz("fornecedor.membroId (POST)", { campos: ["membroId"], base: { nome: "Lixo E2E", tipo: "PF" }, chamarCom: (c) => chamar(HF, { metodo: "POST", token: TES_C(), corpo: { ...c, cpfCnpj: `900.000.${String(++seq).padStart(3, "0")}-00` } }) });
  // os POST aceitos pelo fuzz (membroId vazio ou ausente) criaram fornecedores sem matrícula: tudo bem; o que importa é a recusa não gravar
  await fuzz("fornecedor.membroId (PUT)", { campos: ["membroId"], base: {}, chamarCom: (c) => chamar(HF, { metodo: "PUT", token: TES_C(), ligado: { id: String(fAna) }, corpo: c }) });
  await chamar(HF, { metodo: "PUT", token: TES_C(), ligado: { id: String(fAna) }, corpo: { membroId: 6010 } });
  ok((await escalar("SELECT MembroId FROM Fornecedores WHERE FornecedorId = @f", { f: fAna })) === 6010, "(a Ana volta a ficar ligada)");
  const base = { congregacaoId: c1, fornecedorId: fAna, tipo: "MANUTENCAO", descricao: "Serviço", valor: 50, documentoFiscalBase64: PDF, mimeType: "application/pdf" };
  await fuzz("saída.confirmoAvisos", { campos: ["confirmoAvisos"], base, chamarCom: async (c) => {
    // a confirmação só vale com o código EXATO do aviso: lixo nunca grava (o que passa é só a lista certa)
    const r2 = await chamar(HS, { metodo: "POST", token: TES_C(), corpo: c });
    return r2.status === 201 ? { status: 599, body: { gravouComLixo: c.confirmoAvisos } } : r2;
  } });
  await fuzz("saída.fornecedorId", { campos: ["fornecedorId"], base: { ...base, confirmoAvisos: ["VOLUNTARIO_ATIVO"] }, chamarCom: async (c) => {
    const r2 = await chamar(HS, { metodo: "POST", token: TES_C(), corpo: c });
    return r2.status === 201 && Number(c.fornecedorId) !== Number(fAna) ? { status: 599, body: { gravou: c.fornecedorId } } : r2;
  } });
  await fuzz("funcao-marca", { campos: ["tipo", "id", "contatoComMenores"], base: { tipo: "DEPARTAMENTO", id: 2, contatoComMenores: false }, chamarCom: (c) => POST(HM, "funcao-marca", ADM_P(), c) });
  ok((await escalar("SELECT COUNT(*) FROM Departamentos WHERE ContatoComMenores = 1")) === 1, "depois do lixo, só a União de Crianças continua marcada");

  console.log("== a marca e o painel: atores ==");
  const matriz = [
    ["sem sessão", null, 401, 401],
    ["PIN", PIN(6010), 403, 403],
    ["Dirigente com pessoas, permissoes e protecao_menores (local)", LIDER(3001, ["pessoas", "permissoes", "protecao_menores", "vistoria_antecedentes"], [C]), 403, 403],
    ["Pastor de Área", LIDER(3003, ["pessoas", "permissoes"], [C, V], "AREA"), 403, 403],
    ["papel Global com escopo de uma congregação", sessao(1002, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "GLOBAL", escopoCongregacoes: [C], permissoes: ["pessoas", "permissoes", "vistoria_antecedentes"] }), 403, 403],
    ["geral só com habilitacao_voluntarios", GERAL(1002, ["habilitacao_voluntarios"]), 403, 403],
    ["geral com financeiro", GERAL(1002, ["financeiro"]), 403, 403],
    ["Diretoria (só vê)", GERAL(1002, ["vistoria_antecedentes"]), 200, 403]
  ];
  for (const [nome, tk, ver, marcar] of matriz) {
    const a = await retrato();
    const g = await GET(HM, "funcoes", tk);
    const p = await POST(HM, "funcao-marca", tk, { tipo: "DEPARTAMENTO", id: 2, contatoComMenores: true });
    ok(g.status === ver && p.status === marcar && (await retrato()) === a, `${nome}: ver ${ver}, marcar ${marcar}, nada muda`, [g.status, p.status]);
  }
  r = await POST(HM, "funcao-marca", ADM_P(), { tipo: "PAPEL", id: 9, contatoComMenores: true });
  ok(r.status === 403, "quem marca departamento não marca cargo", r.status);
  r = await POST(HM, "funcao-marca", ADM_PERM(), { tipo: "PAPEL", id: 999999, contatoComMenores: true });
  ok(r.status === 404, "cargo que não existe: 404, sem trilha", r.status);

  console.log("== o aviso da nomeação nunca diz o motivo; a nomeação segue sendo só do nível geral ==");
  await q("INSERT INTO MinisterioMenoresAutoDenuncias (MembroId, Tipo, DataCiencia) VALUES (6022, 'INQUERITO_POLICIAL', CAST(SYSUTCDATETIME() AS DATE))");
  r = await chamar(HL, { metodo: "POST", token: LIDER(3001, ["permissoes"], [C]), corpo: { membroId: 6022, papelId: 9, escopoTipo: "DEPARTAMENTO", escopoId: 1, senha: "Senha#E2E2026" } });
  ok(r.status === 403, "o Dirigente não nomeia", r.status);
  r = await chamar(HL, { metodo: "POST", token: ADM_PERM(), corpo: { membroId: 6022, papelId: 9, escopoTipo: "DEPARTAMENTO", escopoId: 1, senha: "Senha#E2E2026" } });
  ok(r.body.sucesso && r.body.avisoMenores && !/inqu[ée]rito|INQUERITO|auto-?den|processo|an[áa]lise|AUTO_DENUNCIA/i.test(JSON.stringify(r.body)), "a resposta da nomeação não traz nada da comunicação em análise", r.body);
  const aud = await um("SELECT TOP 1 DadosDepois FROM AuditLog WHERE Tabela = 'Lideranca' AND RegistroId = 6022 ORDER BY AuditId DESC");
  ok(aud && !/INQUERITO|AUTO_DENUNCIA|bloqueio/i.test(aud.DadosDepois), "nem a trilha (só que houve o aviso)", aud && aud.DadosDepois);

  ok(falhasAuditoria === 0, "nenhuma falha de auditoria", falhasAuditoria);
  fim("e2e-45 (Trava 7-C: as decisões sob ataque — atores, território, sondas e lixo)");
})().catch((e) => { console.log("ERRO:", e && e.stack); L.shimEncerrar(); process.exitCode = 1; });
