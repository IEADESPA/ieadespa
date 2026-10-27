// e2e-43-trava7c-voluntario-pagamento.js — Trava de Revisão 7-C, DECISÃO 1 do responsável (23/10/2026): as regras de dinheiro do voluntário (Regimento Art. 133 §4º, Art. 135
// §2º e §3º; Lei 9.608/98) só AVISAM o tesoureiro. Handlers e banco REAIS, sobre a base "cenario-trava7c" (a 155 aplicada duas vezes: `bash rodar.sh preparar-trava7c`).
//   - a migração 155: a coluna Fornecedores.MembroId (só pessoa física, uma matrícula por fornecedor), a tabela dos avisos confirmados (não se edita nem se apaga), os prazos e as regras;
//   - o fornecedor pessoa física ligado à matrícula de uma pessoa do território (a busca filtra; fora do território = "não encontrado");
//   - a saída: o voluntário ativo (equipe de escala ou termo de adesão), o pagamento habitual (3 semanas em 60 dias, ajustável), o cachê/comissão — a primeira tentativa não grava
//     nada, a confirmação grava a saída e os avisos JUNTOS (uma transação), o detalhe mostra a quem aprova e paga;
//   - o resumo do mês para a Tesouraria geral pelo motor (uma vez por mês), Meus Dados e o ROPA.
// No 9280398 (antes da decisão) este roteiro falha: não há a coluna, a tabela nem os avisos (a saída para o voluntário era gravada em silêncio).
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, API, path, GERAL, LIDER, PIN, hojeBr } = L;
const st = require(path.join(API, "shared/storage.js"));
let blobs = 0;
st.salvarDocumento = async () => `https://blob.e2e/documentos/doc-${++blobs}`;     // o armazenamento de mentira (o Blob não existe no LocalDB)
st.urlDocumentoComSas = (u) => `${u}?sas=e2e`;
const HF = require(path.join(API, "GestaoFornecedores/index.js"));
const HS = require(path.join(API, "GestaoSaidas/index.js"));
const MEUS = require(path.join(API, "MeusDadosLGPD/index.js"));
const vpDb = require(path.join(API, "shared/voluntarioPagamentoDb.js"));
const motor = require(path.join(API, "shared/notificacaoMotor.js"));
const volDb = require(path.join(API, "shared/voluntariadoDb.js"));
const ropa = require(path.join(API, "shared/ropa.js"));

let falhasAuditoria = 0;
const erroOriginal = console.error;
console.error = (...a) => { if (String(a[0]).includes("[AUDITORIA]")) falhasAuditoria++; if (process.env.E2E_VERBOSO) erroOriginal(...a); };

async function chamar(h, { metodo = "GET", ligado = {}, query = {}, corpo, token }) {
  const ctx = { bindingData: ligado, log: Object.assign(() => { }, { error() { }, info() { }, warn() { }, verbose() { } }) };
  const qs = {}; for (const [k, v] of Object.entries(query)) qs[k] = v == null ? v : String(v);
  await h(ctx, { method: metodo, query: qs, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return ctx.res || { status: 0, body: null };
}
const C = "Central E2E", V = "Vila Nova E2E";
const TES_C = () => LIDER(3001, ["financeiro"], [C]);          // tesoureiro local da Central
const TES_V = () => LIDER(3002, ["financeiro"], [V]);          // tesoureiro local da Vila Nova
const TES_G = () => GERAL(1002, ["financeiro"]);               // Tesouraria geral
const PDF = Buffer.from("%PDF-1.4 nota fiscal e2e").toString("base64");
const contar = async () => ({ saidas: await escalar("SELECT COUNT(*) FROM SaidasTesouraria"), avisos: await escalar("SELECT COUNT(*) FROM SaidaAvisosVoluntario") });
const falhaSql = async (texto, p) => { try { await q(texto, p); return null; } catch (e) { return String(e.message || e); } };

(async () => {
  const pool = await obterPool();
  const c1 = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = @n", { n: C });
  const hoje = hojeBr();

  console.log("== a migração 155 (a parte do dinheiro do voluntário) ==");
  ok((await escalar("SELECT COUNT(*) FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Fornecedores') AND name = 'MembroId' AND is_nullable = 1")) === 1, "Fornecedores.MembroId existe e é opcional");
  ok((await escalar("SELECT COUNT(*) FROM sys.indexes WHERE name = 'UX_Fornecedores_Membro' AND is_unique = 1 AND has_filter = 1")) === 1, "o índice único filtrado (uma matrícula por fornecedor)");
  ok((await escalar("SELECT COUNT(*) FROM sys.check_constraints WHERE name = 'CK_Fornecedores_MembroSoPF'")) === 1, "o CHECK: matrícula só em pessoa física");
  ok((await escalar("SELECT COUNT(*) FROM sys.triggers WHERE name = 'TR_SaidaAvisosVoluntario_Imutavel'")) === 1, "o gatilho dos avisos confirmados");
  ok((await escalar("SELECT COUNT(*) FROM Prazos WHERE Sigla IN ('TESOURARIA_HABITUAL_PAGAMENTOS','TESOURARIA_HABITUAL_JANELA_DIAS')")) === 2, "os dois prazos, uma vez só (a 155 rodou duas vezes)");
  ok((await escalar("SELECT COUNT(*) FROM NotificacaoRegras WHERE Chave = 'TESOURARIA_VOLUNTARIO_PAGO' AND PermissaoAlvo = 'financeiro' AND NivelAlvo = 'GLOBAL'")) === 1, "a regra do resumo do mês, uma vez só");

  console.log("== o fornecedor pessoa física ligado à matrícula ==");
  // 6010 (Ana, Central) serve nas equipes do berçário e do maternal: é voluntária ativa; 2012 (Ivo, Central) não serve em equipe nem tem termo; 6023 é da Vila Nova
  let r = await chamar(HF, { metodo: "GET", token: TES_C(), query: { buscaMembro: "Apta" } });
  const achados = (r.body.membros || []).map((m) => m.membroId);
  ok(achados.includes(6010) && achados.includes(6012) && !achados.includes(6026), "a busca do tesoureiro da Central acha a Ana e NÃO acha a Quitéria, que é da Vila Nova", achados);
  r = await chamar(HF, { metodo: "GET", token: TES_C(), query: { buscaMembro: "%" } });
  ok(Array.isArray(r.body.membros) && r.body.membros.length === 0, "a busca curta (ou só o curinga) não devolve ninguém", r.body);
  r = await chamar(HF, { metodo: "POST", token: TES_C(), corpo: { nome: "Ana Voluntária E2E", cpfCnpj: "111.111.111-11", tipo: "PF", membroId: 6010 } });
  ok(r.status === 201, "o tesoureiro local cadastra a pessoa física ligada à matrícula da Ana", r.body);
  const fAna = r.body.fornecedorId;
  ok((await escalar("SELECT MembroId FROM Fornecedores WHERE FornecedorId = @f", { f: fAna })) === 6010, "a matrícula ficou gravada");
  const audF = await um("SELECT TOP 1 DadosDepois FROM AuditLog WHERE Tabela = 'Fornecedores' AND RegistroId = @f ORDER BY AuditId DESC", { f: fAna });
  ok(audF && /"membroId":6010/.test(audF.DadosDepois) && !/111\.111\.111-11/.test(audF.DadosDepois), "a trilha guarda a matrícula e o CPF mascarado", audF && audF.DadosDepois);
  r = await chamar(HF, { metodo: "POST", token: TES_C(), corpo: { nome: "Nilo da Vila E2E", cpfCnpj: "222.222.222-22", tipo: "PF", membroId: 6023 } });
  ok(r.body.sucesso === false && r.body.mensagem === "Membro não encontrado no seu território.", "pessoa da Vila Nova: o tesoureiro da Central não liga (a mesma resposta de \"não existe\")", r.body);
  r = await chamar(HF, { metodo: "POST", token: TES_C(), corpo: { nome: "Ninguém E2E", cpfCnpj: "222.222.222-23", tipo: "PF", membroId: 999999 } });
  ok(r.body.mensagem === "Membro não encontrado no seu território.", "matrícula que não existe: a mesma resposta");
  r = await chamar(HF, { metodo: "POST", token: TES_C(), corpo: { nome: "Gráfica E2E", cpfCnpj: "11.222.333/0001-44", tipo: "PJ", membroId: 6010 } });
  ok(r.status === 400, "pessoa jurídica não se liga a matrícula", r.body);
  r = await chamar(HF, { metodo: "POST", token: TES_G(), corpo: { nome: "Ana de novo E2E", cpfCnpj: "111.111.111-12", tipo: "PF", membroId: 6010 } });
  ok(r.body.mensagem === "Esta matrícula já está ligada a outro fornecedor.", "a mesma matrícula em outro fornecedor é recusada", r.body);
  ok((await escalar("SELECT COUNT(*) FROM Fornecedores WHERE CpfCnpj IN ('222.222.222-22','222.222.222-23','11.222.333/0001-44','111.111.111-12')")) === 0, "nenhuma recusa gravou fornecedor");
  r = await chamar(HF, { metodo: "POST", token: TES_C(), corpo: { nome: "Ivo E2E", cpfCnpj: "333.333.333-33", tipo: "PF" } });
  const fIvo = r.body.fornecedorId;
  r = await chamar(HF, { metodo: "PUT", token: TES_C(), ligado: { id: String(fIvo) }, corpo: { membroId: 2012 } });
  ok(r.body.sucesso === true && (await escalar("SELECT MembroId FROM Fornecedores WHERE FornecedorId = @f", { f: fIvo })) === 2012, "ligar depois (PUT) funciona", r.body);
  r = await chamar(HF, { metodo: "GET", token: TES_C() });
  const linhaIvo = (r.body || []).find((x) => x.fornecedorId === fIvo);
  ok(linhaIvo && linhaIvo.membroVinculado === true && linhaIvo.membroId === undefined && linhaIvo.cpfCnpj === undefined, "o tesoureiro local vê SÓ que há matrícula ligada (nunca qual, nem o CPF)", linhaIvo);
  r = await chamar(HF, { metodo: "GET", token: TES_G() });
  const geralAna = (r.body || []).find((x) => x.fornecedorId === fAna);
  ok(geralAna && geralAna.membroId === 6010 && geralAna.membroNome === "Ana Apta M7", "o geral vê a matrícula e o nome do membro", geralAna);
  ok(/CK_Fornecedores_MembroSoPF/.test(await falhaSql("UPDATE Fornecedores SET Tipo = 'PJ' WHERE FornecedorId = @f", { f: fAna }) || ""), "o banco recusa pessoa jurídica com matrícula (CHECK)");
  ok(/UX_Fornecedores_Membro|duplicate/i.test(await falhaSql("UPDATE Fornecedores SET MembroId = 6010 WHERE FornecedorId = @f", { f: fIvo }) || ""), "o banco recusa a mesma matrícula em dois fornecedores (índice único)");

  console.log("== a saída para a voluntária: avisa, e só grava depois da confirmação ==");
  const corpo = (fornecedorId, extra = {}) => ({ congregacaoId: c1, fornecedorId, tipo: "MANUTENCAO", descricao: "Limpeza do templo", valor: 120, documentoFiscalBase64: PDF, mimeType: "application/pdf", ...extra });
  let antes = await contar();
  const blobsAntes = blobs;
  r = await chamar(HS, { metodo: "POST", token: TES_C(), corpo: corpo(fAna) });
  ok(r.status === 200 && r.body.precisaConfirmarAvisos === true && (r.body.avisos || []).map((a) => a.codigo).join() === "VOLUNTARIO_ATIVO", "a primeira tentativa devolve o aviso de voluntária (serve na equipe de escala)", r.body);
  ok(/9\.608\/98/.test(r.body.avisos[0].texto) && /Ordem de Serviço prévia \(Regimento Art\. 133 §4º\)/.test(r.body.avisos[0].texto), "o texto cita a Lei 9.608/98 e a Ordem de Serviço prévia", r.body.avisos[0]);
  let depois = await contar();
  ok(depois.saidas === antes.saidas && depois.avisos === antes.avisos && blobs === blobsAntes, "nada foi gravado nem subiu o arquivo", { antes, depois });
  r = await chamar(HS, { metodo: "POST", token: TES_C(), corpo: corpo(fAna, { confirmoAvisos: ["HABITUALIDADE"] }) });
  ok(r.body.precisaConfirmarAvisos === true, "confirmar o aviso errado não serve: pede de novo", r.body);
  r = await chamar(HS, { metodo: "POST", token: TES_C(), corpo: corpo(fAna, { confirmoAvisos: ["VOLUNTARIO_ATIVO"] }) });
  ok(r.status === 201 && /1 aviso\(s\) sobre esta pessoa ficaram registrados/.test(r.body.mensagem), "com a confirmação, a saída é gravada (o sistema não impede)", r.body);
  const s1 = r.body.saidaId;
  const av1 = await q("SELECT Codigo, Texto, ConfirmadoPorMembroId FROM SaidaAvisosVoluntario WHERE SaidaId = @s", { s: s1 });
  ok(av1.length === 1 && av1[0].Codigo === "VOLUNTARIO_ATIVO" && av1[0].ConfirmadoPorMembroId === 3001 && /gratuito/.test(av1[0].Texto), "o aviso ficou registrado com o texto mostrado e quem confirmou", av1);
  const audS = await um("SELECT TOP 1 DadosDepois FROM AuditLog WHERE Tabela = 'SaidasTesouraria' AND RegistroId = @s AND Acao = 'Solicitou pagamento'", { s: s1 });
  ok(audS && /"avisosConfirmados":\["VOLUNTARIO_ATIVO"\]/.test(audS.DadosDepois), "a trilha da saída lista os avisos confirmados", audS && audS.DadosDepois);
  r = await chamar(HS, { metodo: "GET", token: TES_G(), ligado: { id: String(s1) } });
  ok(Array.isArray(r.body.avisosVoluntario) && r.body.avisosVoluntario[0].confirmadoPorNome === "Dirigente Central E2E" && r.body.avisosVoluntario[0].rotulo === "Pessoa voluntária", "o detalhe da saída mostra o aviso a quem aprova e paga, com quem confirmou", r.body.avisosVoluntario);
  r = await chamar(HS, { metodo: "GET", token: TES_V(), ligado: { id: String(s1) } });
  ok(r.status === 403 && !r.body.avisosVoluntario, "o tesoureiro da Vila Nova não vê a saída (nem os avisos) da Central", r.status);

  console.log("== cachê e comissão para voluntário ==");
  r = await chamar(HS, { metodo: "POST", token: TES_C(), corpo: corpo(fAna, { descricao: "Cachê do louvor no aniversário" }) });
  ok((r.body.avisos || []).map((a) => a.codigo).join() === "VOLUNTARIO_ATIVO,CACHE_COMISSAO" && /Art\. 135 §3º/.test(r.body.avisos[1].texto), "cachê na descrição: o aviso do Art. 135 §3º junto do de voluntária", r.body.avisos);
  r = await chamar(HS, { metodo: "POST", token: TES_C(), corpo: corpo(fAna, { descricao: "comissão da cantina", confirmoAvisos: ["VOLUNTARIO_ATIVO", "CACHE_COMISSAO"] }) });
  ok(r.status === 201 && (await escalar("SELECT COUNT(*) FROM SaidaAvisosVoluntario WHERE SaidaId = @s", { s: r.body.saidaId })) === 2, "confirmados os dois, os dois ficam registrados", r.body);

  console.log("== o termo de adesão também faz a pessoa voluntária ==");
  r = await chamar(HS, { metodo: "POST", token: TES_C(), corpo: corpo(fIvo) });
  ok(r.status === 201 && (await escalar("SELECT COUNT(*) FROM SaidaAvisosVoluntario WHERE SaidaId = @s", { s: r.body.saidaId })) === 0, "o Ivo (sem equipe e sem termo) recebe sem aviso", r.body);
  const ad = await volDb.registrarAdesaoManual(pool, { membroId: 2012, dados: { forma: "FICHA_FISICA", dataAceite: hoje, referencia: "Ficha E2E do Ivo" }, por: 1002, hoje });
  ok(ad.sucesso === true, "o termo de adesão do Ivo é registrado (ficha física)", ad);
  r = await chamar(HS, { metodo: "POST", token: TES_C(), corpo: corpo(fIvo) });
  ok((r.body.avisos || []).map((a) => a.codigo).join() === "VOLUNTARIO_ATIVO", "com o termo vigente, o Ivo passa a ser voluntário: o aviso aparece", r.body);

  console.log("== o pagamento habitual (\"diarista disfarçada\") — qualquer pessoa física ==");
  r = await chamar(HF, { metodo: "POST", token: TES_C(), corpo: { nome: "Diarista Sem Matrícula E2E", cpfCnpj: "444.444.444-44", tipo: "PF" } });
  const fDia = r.body.fornecedorId;
  const ids = [];
  for (let i = 0; i < 2; i++) { r = await chamar(HS, { metodo: "POST", token: TES_C(), corpo: corpo(fDia, { valor: 80 + i }) }); ok(r.status === 201, `pagamento ${i + 1} sem aviso (ainda não é habitual)`, r.body); ids.push(r.body.saidaId); }
  await q("UPDATE SaidasTesouraria SET SolicitadoEm = DATEADD(DAY, -7, SolicitadoEm) WHERE SaidaId = @s", { s: ids[0] });
  await q("UPDATE SaidasTesouraria SET SolicitadoEm = DATEADD(DAY, -14, SolicitadoEm) WHERE SaidaId = @s", { s: ids[1] });
  r = await chamar(HS, { metodo: "POST", token: TES_C(), corpo: corpo(fDia, { valor: 90 }) });
  ok((r.body.avisos || []).map((a) => a.codigo).join() === "HABITUALIDADE" && /3 semanas diferentes nos últimos 60 dias/.test(r.body.avisos[0].texto) && /diarista disfarçada/.test(r.body.avisos[0].texto), "3 semanas diferentes em 60 dias: o aviso de habitualidade (Art. 135 §2º)", r.body.avisos);
  await q("UPDATE SaidasTesouraria SET Status = 'CANCELADA', MotivoCancelamento = N'teste', CanceladoPor = 1002, CanceladoEm = SYSUTCDATETIME() WHERE SaidaId = @s", { s: ids[1] });
  r = await chamar(HS, { metodo: "POST", token: TES_C(), corpo: corpo(fDia, { valor: 91 }) });
  ok(r.status === 201, "o pagamento cancelado não conta: sem aviso", r.body);
  await q("UPDATE Prazos SET Dias = 2 WHERE Sigla = 'TESOURARIA_HABITUAL_PAGAMENTOS'");
  r = await chamar(HS, { metodo: "POST", token: TES_C(), corpo: corpo(fDia, { valor: 92 }) });
  ok((r.body.avisos || []).some((a) => a.codigo === "HABITUALIDADE"), "o limite é o do parâmetro (2): o aviso volta", r.body);
  r = await chamar(HS, { metodo: "POST", token: TES_C(), corpo: corpo(fDia, { valor: 92, confirmoAvisos: ["HABITUALIDADE"] }) });
  ok(r.status === 201 && (await escalar("SELECT Codigo FROM SaidaAvisosVoluntario WHERE SaidaId = @s", { s: r.body.saidaId })) === "HABITUALIDADE", "confirmado, o aviso de habitualidade fica registrado na saída", r.body);
  await q("UPDATE Prazos SET Dias = 3 WHERE Sigla = 'TESOURARIA_HABITUAL_PAGAMENTOS'");
  await q("UPDATE SaidasTesouraria SET SolicitadoEm = DATEADD(DAY, -70, SolicitadoEm) WHERE SaidaId = @s", { s: ids[0] });
  r = await chamar(HS, { metodo: "POST", token: TES_C(), corpo: corpo(fDia, { valor: 93 }) });
  ok(r.status === 201, "o pagamento fora da janela de 60 dias não conta", r.body);

  console.log("== a transação: a saída e os avisos, ou nada ==");
  antes = await contar();
  let erro = null;
  try { await vpDb.inserirSaidaComAvisos(pool, { congregacaoId: c1, fornecedorId: fAna, tipo: "MANUTENCAO", descricao: "x", valor: 10, documentoFiscalUrl: "u", notaFiscalCnpj: null }, [{ codigo: "VOLUNTARIO_ATIVO", texto: "a" }, { codigo: "INVENTADO", texto: "b" }], 3001); } catch (e) { erro = e; }
  depois = await contar();
  ok(erro && /CK_SaidaAvisosVoluntario_Codigo/.test(String(erro.message)) && depois.saidas === antes.saidas && depois.avisos === antes.avisos, "um aviso que o banco recusa desfaz também a saída (nada fica pela metade)", { erro: erro && erro.message, antes, depois });
  ok(/não se edita nem se apaga/.test(await falhaSql("UPDATE SaidaAvisosVoluntario SET Texto = N'outro' WHERE SaidaId = @s", { s: s1 }) || ""), "o aviso confirmado não se edita");
  ok(/não se edita nem se apaga/.test(await falhaSql("DELETE FROM SaidaAvisosVoluntario WHERE SaidaId = @s", { s: s1 }) || ""), "nem se apaga");
  ok(/CK_SaidaAvisosVoluntario_Codigo|NULL/.test(await falhaSql("INSERT INTO SaidaAvisosVoluntario (SaidaId, Codigo, Texto, ConfirmadoPorMembroId) VALUES (@s, NULL, N'x', 3001)", { s: s1 }) || ""), "código nulo é recusado");
  ok(/UQ_SaidaAvisosVoluntario|duplicate/i.test(await falhaSql("INSERT INTO SaidaAvisosVoluntario (SaidaId, Codigo, Texto, ConfirmadoPorMembroId) VALUES (@s, N'VOLUNTARIO_ATIVO', N'x', 3001)", { s: s1 }) || ""), "o mesmo aviso duas vezes na mesma saída é recusado");

  console.log("== o resumo do mês para a Tesouraria geral (motor, rotina diária) ==");
  const fatos = await vpDb.detectarMensal(pool);
  ok(fatos.length === 1 && /Ana Voluntária E2E \(Pessoa voluntária, Cachê ou comissão a voluntário\)/.test(fatos[0].fatoGerador) && /Diarista Sem Matrícula E2E \(Pagamento habitual/.test(fatos[0].fatoGerador), "um fato do mês, com cada pessoa e os avisos dela", fatos);
  const r1 = await motor.avaliarRegras(pool, { chaves: ["TESOURARIA_VOLUNTARIO_PAGO"] });
  const nots = await q("SELECT DestinatarioMembroId d FROM Notificacoes WHERE RegraChave = 'TESOURARIA_VOLUNTARIO_PAGO'");
  const destinos = nots.map((x) => Number(x.d));
  ok(r1.criadas >= 1 && destinos.includes(1002) && !destinos.includes(3001), "vai à Tesouraria geral (financeiro, nível Global), não ao tesoureiro local", destinos);
  const r2 = await motor.avaliarRegras(pool, { chaves: ["TESOURARIA_VOLUNTARIO_PAGO"] });
  ok(r2.criadas === 0, "rodar de novo no mesmo mês não repete o aviso", r2);

  console.log("== Meus Dados, o ROPA e a desligação ==");
  const ctxM = { bindingData: { matricula: "6010" }, log: Object.assign(() => { }, { error() { } }) };
  await MEUS(ctxM, { method: "GET", query: {}, headers: { "x-auth-token": PIN(6010) } });
  const t = ctxM.res.body.tesouraria;
  ok(t && t.fornecedor && t.fornecedor.nome === "Ana Voluntária E2E" && t.avisosDePagamento.length === 3 && t.avisosDePagamento.every((a) => a.rotulo && a.em), "Meus Dados da Ana: o cadastro de fornecedor e os avisos dos pagamentos a ela", t);
  const reg = (await ropa.montarRopa(pool, require("mssql"))).find((x) => x.chave === "VOLUNTARIO_PAGAMENTO");
  ok(reg && reg.contagens.Fornecedores >= 3 && reg.contagens.SaidaAvisosVoluntario >= 4, "o ROPA conta as tabelas novas", reg && reg.contagens);
  r = await chamar(HF, { metodo: "PUT", token: TES_C(), ligado: { id: String(fIvo) }, corpo: { membroId: null } });
  ok(r.body.sucesso && (await escalar("SELECT MembroId FROM Fornecedores WHERE FornecedorId = @f", { f: fIvo })) === null, "desligar a matrícula (null) funciona", r.body);
  r = await chamar(HS, { metodo: "POST", token: TES_C(), corpo: corpo(fIvo) });
  ok(r.status === 201, "desligado, o pagamento ao Ivo sai sem o aviso de voluntário", r.body);

  ok(falhasAuditoria === 0, "nenhuma falha de auditoria", falhasAuditoria);
  fim("e2e-43 (Trava 7-C, decisão 1: o dinheiro do voluntário só avisa)");
})().catch((e) => { console.log("ERRO:", e && e.stack); L.shimEncerrar(); process.exitCode = 1; });
