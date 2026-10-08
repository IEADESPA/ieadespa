// e2e-3-atos.js — o poder de polícia técnica (Art. 50): interdição cautelar e pedido de remoção de postagem, com ratificação, avisos, tetos e leitura por papel.
// Parte da base-cenario (banco recém-restaurado). Handlers REAIS, SQL Server real.
const fs = require("fs");
const L = require("./lib");
const { q, um, escalar, ok, fim, GET, POST, GERAL, LIDER, PIN, IP_PUBLICO, API, path } = L;
const H = require(path.join(API, "GestaoSetoresTecnicos/index.js"));
const db = require(path.join(API, "shared/setoresTecnicosDb.js"));
const motor = require(path.join(API, "shared/notificacaoMotor.js"));
const cen = JSON.parse(fs.readFileSync(path.join(__dirname, "cenario.json"), "utf8"));
const S = cen.setores, C = cen.cong;
const TUDO = ["setores_tecnicos", "setores_ratificacao", "vistoria_antecedentes"];
const presidente = GERAL(1001, TUDO), secretario = GERAL(1002, TUDO), gestora = GERAL(1003, ["setores_tecnicos"]);
const dirCentral = LIDER(3001, ["reunioes", "pessoas"], ["Central E2E"]), dirVila = LIDER(3002, ["reunioes", "pessoas"], ["Vila Nova E2E"]), dirBeta = LIDER(3004, ["reunioes", "pessoas"], ["Beta E2E"]);
const pastor = LIDER(3003, ["reunioes", "pessoas"], ["Central E2E", "Vila Nova E2E"], "AREA");
const notif = (regra, ref) => q("SELECT DestinatarioMembroId d FROM Notificacoes WHERE RegraChave = @r AND ReferenciaId = @i ORDER BY DestinatarioMembroId", { r: regra, i: ref }).then(l => l.map(x => x.d));
const mesmo = (a, b) => JSON.stringify([...a].sort((x, y) => x - y)) === JSON.stringify([...b].sort((x, y) => x - y));
const hoje = L.hojeBr();

async function ativar(token, membro, setor, extra = {}) {
  let r = await POST(H, "indicar", gestora, { membroId: membro, setorId: setor, formacao: "Profissional da área", ...extra });
  if (r.status !== 201) throw new Error(`indicar ${membro}/${setor}: ${JSON.stringify(r.body)}`);
  const vinculoId = r.body.vinculoId;
  if (token) r = await POST(H, "aceitar-termo", token, { vinculoId, aceito: true }, IP_PUBLICO);
  else r = await POST(H, "registrar-termo", GERAL(1002, TUDO), { vinculoId, forma: "FICHA_FISICA", dataAceite: hoje, referencia: `ficha ${membro}` });   // quem indicou e aprovou (a gestora) não registra a ficha de setor com poder
  if (r.status !== 201) throw new Error(`termo ${membro}/${setor}: ${JSON.stringify(r.body)}`);
  return vinculoId;
}
const interdicao = (extra = {}) => ({ congregacaoId: C.central.id, motivo: "RISCO_DESABAMENTO", objeto: "Templo principal — cobertura da nave", descricao: "Vi rachaduras novas na viga principal e a cobertura cedeu cinco centímetros desde a última visita.", referencia: "ART 12345", ...extra });
const remocao = (extra = {}) => ({ congregacaoId: C.central.id, canalId: cen.canalId, motivo: "DIREITO_AUTORAL", referencia: "https://www.instagram.com/p/AbC123/", descricao: "A foto é de um fotógrafo profissional e foi usada sem autorização.", ...extra });

(async () => {
  console.log("== quem serve com poder ==");
  await ativar(PIN(2001), 2001, S.ENGENHARIA, { conselhoSigla: "CREA-PA", registroNumero: "12345" });
  await ativar(null, 2010, S.ENGENHARIA, { conselhoSigla: "CREA-PA", registroNumero: "777" });
  await ativar(null, 2002, S.SEGURANCA);
  await ativar(secretario, 1002, S.SEGURANCA);
  await ativar(null, 2003, S.COMUNICACAO);
  await ativar(null, 2011, S.COMUNICACAO);
  await ativar(null, 2004, S.JURIDICO);
  let r = await GET(H, "meu-painel", PIN(2001));
  ok(r.body.poderes.interdicao.length === 1 && r.body.poderes.remocao.length === 0, "Engenharia: tem o poder de interdição e não o de remoção");
  r = await GET(H, "meu-painel", PIN(2003)); ok(r.body.poderes.remocao.length === 1 && r.body.poderes.interdicao.length === 0, "Comunicação: o inverso");
  r = await GET(H, "meu-painel", PIN(2004)); ok(r.body.poderes.remocao.length === 0 && r.body.poderes.interdicao.length === 0, "Jurídico: nenhum dos dois");
  r = await GET(H, "setores", PIN(2012)); const instalados = r.body.setores.filter(s => s.instalado).map(s => s.codigo);
  ok(["COMUNICACAO", "ENGENHARIA", "JURIDICO", "SEGURANCA"].every(c => instalados.includes(c)), "os quatro setores onde acabamos de pôr gente ficam instalados", instalados);

  console.log("== quem não pode, não emite ==");
  const totalAntes = await escalar("SELECT COUNT(*) FROM SetoresTecnicosIntervencoes");
  for (const [rotulo, t] of [["Jurídico (sem poder)", PIN(2004)], ["quem não serve em setor", PIN(2005)], ["Comunicação (poder do outro tipo)", PIN(2003)], ["dirigente", dirCentral], ["a própria Diretoria sem vínculo", presidente], ["gestora", gestora]]) {
    r = await POST(H, "interdicao", t, interdicao()); ok(r.status === 403, `interdição negada: ${rotulo}`, r.status);
  }
  r = await POST(H, "pedido-remocao", PIN(2001), remocao()); ok(r.status === 403, "Engenharia não pede remoção de postagem");
  ok((await escalar("SELECT COUNT(*) FROM SetoresTecnicosIntervencoes")) === totalAntes, "nenhuma tentativa negada gravou algo");
  r = await POST(H, "interdicao", PIN(2001), interdicao({ motivo: "ERRO_GROSSEIRO" })); ok(r.status === 422, "motivo de remoção não vale para interdição");
  r = await POST(H, "interdicao", PIN(2001), interdicao({ descricao: "curta" })); ok(r.status === 422, "justificativa curta: 422");
  r = await POST(H, "interdicao", PIN(2001), interdicao({ objeto: "<img src=x onerror=alert(1)>" })); ok(r.status === 422, "objeto com tag: 422");
  r = await POST(H, "interdicao", PIN(2001), interdicao({ congregacaoId: 999999 })); ok(r.status === 422 && /Congregação não encontrada/.test(r.body.mensagem), "congregação inexistente: 422");
  r = await POST(H, "interdicao", PIN(2001), interdicao({ congregacaoId: "0x1" })); ok(r.status === 422, "congregacaoId 0x1: 422");
  r = await POST(H, "interdicao", PIN(2001), interdicao({ setorId: S.JURIDICO })); ok(r.status === 422 && /não serve nesse setor/.test(r.body.mensagem), "setor que a pessoa não serve (ou sem o poder): 422", r.body);

  console.log("== a interdição ==");
  r = await POST(H, "interdicao", PIN(2001), interdicao()); ok(r.status === 201 && r.body.intervencaoId && r.body.semDiretoria === false, "o engenheiro interdita o templo", r.body);
  const A = r.body.intervencaoId;
  let a = await um("SELECT * FROM SetoresTecnicosIntervencoes WHERE IntervencaoId = @i", { i: A });
  ok(a.Status === "EMITIDA" && a.RegistroProfissional === "CREA-PA 12345" && a.EmitidaPorMembroId === 2001 && a.SetorId === S.ENGENHARIA && a.CongregacaoId === C.central.id, "ficou EMITIDA, com o registro profissional de quem emitiu (Art. 49 §1º)", a);
  const quemAvisado = await notif("SETOR_INTERDICAO", A);
  ok(mesmo(quemAvisado, [1, 2, 1001, 1002, 1003, 3001, 3003, 2001]), "o aviso foi à Diretoria, à secretaria dos setores, ao dirigente e ao pastor de área da congregação e ao próprio emitente", quemAvisado);
  ok(!quemAvisado.includes(3002) && !quemAvisado.includes(3004) && !quemAvisado.includes(2002), "e NÃO ao dirigente de outra congregação nem a quem não tem relação");
  const msg = await escalar("SELECT Mensagem FROM Notificacoes WHERE RegraChave = 'SETOR_INTERDICAO' AND ReferenciaId = @i AND DestinatarioMembroId = 3001", { i: A });
  ok(/INTERDITOU/.test(msg) && /CREA-PA 12345/.test(msg) && /Central E2E/.test(msg) && /ratificá-lo ou revogá-lo/.test(msg) && !/rachaduras/.test(msg), "o texto diz quem, onde e que a Diretoria decide — e não vaza a justificativa técnica", msg);
  const aud = await q("SELECT DadosDepois FROM AuditLog WHERE Acao = 'INTERDICAO_EMITIDA'");
  ok(aud.length === 1 && !/rachaduras|ART 12345/.test(JSON.stringify(aud)), "a auditoria leva os códigos e o tamanho, não o texto livre");
  r = await POST(H, "interdicao", PIN(2001), interdicao()); ok(r.status === 422 && /mesmo local/.test(r.body.mensagem), "a mesma estrutura em aberto: recusada");
  r = await POST(H, "interdicao", PIN(2001), interdicao({ objeto: "Salão anexo — fiação do quadro geral", motivo: "FALHA_ELETRICA_GRAVE" })); ok(r.status === 201, "segunda interdição (outro local)", r.body); const B = r.body.intervencaoId;
  r = await POST(H, "interdicao", PIN(2001), interdicao({ objeto: "Casa pastoral — muro", congregacaoId: C.vila.id })); ok(r.status === 201, "terceira", r.body); const Cc = r.body.intervencaoId;
  r = await POST(H, "interdicao", PIN(2001), interdicao({ objeto: "Quarta tentativa no mesmo dia" })); ok(r.status === 422 && /No máximo 3 atos por dia/.test(r.body.mensagem), "o teto de 3 atos por dia segura a rajada", r.body);
  ok((await escalar("SELECT COUNT(*) FROM SetoresTecnicosIntervencoes WHERE EmitidaPorMembroId = 2001")) === 3, "só 3 foram gravadas");

  console.log("== ratificar, revogar, levantar ==");
  r = await POST(H, "decidir", PIN(2001), { intervencaoId: A, decisao: "RATIFICAR" }); ok(r.status === 403, "o emitente (sem permissão) não decide");
  r = await POST(H, "decidir", gestora, { intervencaoId: A, decisao: "RATIFICAR" }); ok(r.status === 403, "gestão sem a permissão da Diretoria não ratifica");
  r = await POST(H, "decidir", dirCentral, { intervencaoId: A, decisao: "RATIFICAR" }); ok(r.status === 403, "o dirigente da congregação não ratifica");
  r = await POST(H, "decidir", LIDER(1001, ["setores_ratificacao"], ["Central E2E"]), { intervencaoId: A, decisao: "RATIFICAR" }); ok(r.status === 403, "ratificação com escopo de uma congregação não é o nível geral");
  r = await POST(H, "decidir", presidente, { intervencaoId: "0x1", decisao: "RATIFICAR" }); ok(r.status === 400, "intervencaoId 0x1: 400");
  r = await POST(H, "decidir", presidente, { intervencaoId: 999999, decisao: "RATIFICAR" }); const naoExiste = r;
  ok(r.status === 404 && /Ato não encontrado/.test(r.body.mensagem), "ato que não existe: 404");
  r = await POST(H, "decidir", presidente, { intervencaoId: A, decisao: "TALVEZ" }); ok(r.status === 422, "decisão fora da lista: 422");
  // Quem emite não decide o próprio ato: a Secretária (1002) serve em Segurança e emite; o Presidente ratifica, ela não.
  r = await POST(H, "interdicao", secretario, interdicao({ objeto: "Templo da Beta — escada de emergência", congregacaoId: C.beta.id })); ok(r.status === 201, "o Secretário Geral, que serve em Segurança, emite", r.body); const D = r.body.intervencaoId;
  r = await POST(H, "decidir", secretario, { intervencaoId: D, decisao: "RATIFICAR" }); ok(r.status === 403 && /não o ratifica nem o revoga/.test(r.body.mensagem), "ninguém ratifica o próprio ato (mesmo sendo da Diretoria)", r.body);
  r = await POST(H, "decidir", secretario, { intervencaoId: D, decisao: "REVOGAR", observacao: "Quero desfazer o que fiz" }); ok(r.status === 403, "nem revoga o próprio");
  r = await POST(H, "decidir", presidente, { intervencaoId: D, decisao: "RATIFICAR", observacao: "Ratificado: risco real." }); ok(r.status === 200, "outra pessoa da Diretoria ratifica", r.body);
  r = await POST(H, "decidir", presidente, { intervencaoId: A, decisao: "RATIFICAR" }); ok(r.status === 200 && r.body.ato.status === "RATIFICADA" && r.body.ato.emVigor === true, "o Presidente ratifica a interdição A", r.body);
  a = await um("SELECT * FROM SetoresTecnicosIntervencoes WHERE IntervencaoId = @i", { i: A }); ok(a.DecididaPorMembroId === 1001 && a.DecididaEm, "ficou quem decidiu e quando");
  ok(mesmo(await notif("SETOR_INTERDICAO_DECIDIDA", A * 10 + 1), [1, 2, 1002, 1003, 3001, 3003, 2001]), "a decisão avisou o emitente e os líderes — e não quem decidiu", await notif("SETOR_INTERDICAO_DECIDIDA", A * 10 + 1));
  r = await POST(H, "decidir", presidente, { intervencaoId: A, decisao: "RATIFICAR" }); ok(r.status === 422 && /já está ratificada/.test(r.body.mensagem), "ratificar de novo: 422", r.body);
  r = await POST(H, "decidir", presidente, { intervencaoId: A, decisao: "REVOGAR", observacao: "Mudei de ideia sobre a viga." }); ok(r.status === 422, "uma interdição ratificada não se revoga (levanta-se)");
  r = await POST(H, "decidir", presidente, { intervencaoId: B, decisao: "REVOGAR" }); ok(r.status === 422, "revogar exige motivo");
  r = await POST(H, "decidir", presidente, { intervencaoId: B, decisao: "REVOGAR", observacao: "O laudo mostra que a fiação está dentro da norma." }); ok(r.status === 200 && r.body.ato.status === "REVOGADA", "a Diretoria revoga a interdição B", r.body);
  r = await POST(H, "levantar", PIN(2001), { intervencaoId: B, observacao: "Tentando levantar uma revogada" }); ok(r.status === 422 && /já está revogada/.test(r.body.mensagem), "ato revogado é definitivo", r.body);
  // levantar
  r = await POST(H, "levantar", PIN(2001), { intervencaoId: A }); ok(r.status === 422, "levantar exige a observação");
  r = await POST(H, "levantar", PIN(2010), { intervencaoId: A, observacao: "Eu também sou engenheiro" }); ok(r.status === 404 && r.body.mensagem === naoExiste.body.mensagem, "outro engenheiro sem relação com o ato recebe a MESMA resposta de 'não existe'", r);
  r = await POST(H, "levantar", PIN(2012), { intervencaoId: A, observacao: "Um estranho tentando" }); ok(r.status === 404, "um estranho: 404");
  r = await POST(H, "levantar", dirCentral, { intervencaoId: A, observacao: "O dirigente quer reabrir o templo" }); ok(r.status === 403 && /Só quem emitiu/.test(r.body.mensagem), "o líder da congregação NÃO levanta a interdição (nem o dirigente)", r.body);
  r = await POST(H, "levantar", PIN(2001), { intervencaoId: A, observacao: "Reforço da viga concluído; laudo ART 998877 emitido." }); ok(r.status === 200 && r.body.ato.status === "LEVANTADA", "quem emitiu levanta, com o laudo", r.body);
  a = await um("SELECT * FROM SetoresTecnicosIntervencoes WHERE IntervencaoId = @i", { i: A }); ok(a.FechadaPorMembroId === 2001 && a.FechamentoObs && a.DecididaPorMembroId === 1001, "ficaram quem levantou e quem tinha ratificado");
  r = await POST(H, "levantar", PIN(2001), { intervencaoId: A, observacao: "De novo, para testar" }); ok(r.status === 422, "levantar de novo: 422");
  // quem saiu do setor perde o poder de levantar; a Diretoria levanta
  r = await GET(H, "meu-painel", PIN(2010)); const vGil = r.body.vinculos.find(v => v.setorId === S.ENGENHARIA);
  r = await POST(H, "interdicao", PIN(2010), interdicao({ objeto: "Templo da Vila Nova — telhado", congregacaoId: C.vila.id })); ok(r.status === 201, "o outro engenheiro (Gil) emite uma interdição", r.body); const E = r.body.intervencaoId;
  r = await POST(H, "sair", PIN(2010), { vinculoId: vGil.vinculoId }); ok(r.status === 200, "Gil sai do setor");
  r = await POST(H, "levantar", PIN(2010), { intervencaoId: E, observacao: "Já saí do setor, mas quero levantar" }); ok(r.status === 403, "quem saiu do setor perde o poder de levantar", r.body);
  r = await POST(H, "levantar", secretario, { intervencaoId: E, observacao: "A Diretoria levanta: o telhado foi refeito." }); ok(r.status === 200, "a Diretoria levanta a interdição de quem saiu", r.body);
  r = await POST(H, "interdicao", PIN(2010), interdicao({ objeto: "Outro lugar" })); ok(r.status === 403, "e quem saiu do setor não emite mais");

  console.log("== o pedido de remoção de postagem ==");
  r = await POST(H, "pedido-remocao", PIN(2011), remocao({ referencia: "javascript:alert(1)" })); ok(r.status === 422, "link javascript: recusado");
  r = await POST(H, "pedido-remocao", PIN(2011), remocao({ referencia: "ftp://exemplo.org/x" })); ok(r.status === 422, "link ftp: recusado");
  r = await POST(H, "pedido-remocao", PIN(2011), remocao({ canalId: 999999 })); ok(r.status === 422 && /canal ativo desta congregação/.test(r.body.mensagem), "canal que não existe: 422");
  r = await POST(H, "pedido-remocao", PIN(2011), remocao({ congregacaoId: C.vila.id })); ok(r.status === 422 && /canal ativo desta congregação/.test(r.body.mensagem), "canal de outra congregação: 422");
  r = await POST(H, "pedido-remocao", PIN(2011), remocao({ canalId: undefined, objeto: "" })); ok(r.status === 422, "sem canal e sem a rede descrita: 422");
  r = await POST(H, "pedido-remocao", PIN(2011), remocao()); ok(r.status === 201, "a Comunicação pede a remoção da postagem", r.body); const R1 = r.body.intervencaoId;
  const quemRemocao = await notif("SETOR_REMOCAO_SOLICITADA", R1);
  ok(mesmo(quemRemocao, [1, 2, 1001, 1002, 1003, 3001, 3003, 4001, 2011]), "o aviso foi a quem cuida da rede (4001), ao líder da congregação, à Diretoria, à secretaria e ao emitente", quemRemocao);
  r = await POST(H, "pedido-remocao", PIN(2011), remocao()); ok(r.status === 422 && /mesma rede/.test(r.body.mensagem), "o mesmo link em aberto: recusado");
  r = await POST(H, "atender", PIN(2011), { intervencaoId: R1 }); ok(r.status === 403, "quem pediu não dá o pedido por atendido");
  r = await POST(H, "atender", PIN(2003), { intervencaoId: R1 }); ok(r.status === 404, "outro membro da Comunicação, sem relação com a rede: 404");
  r = await POST(H, "atender", dirVila, { intervencaoId: R1 }); ok(r.status === 404, "o dirigente de OUTRA congregação: 404 (igual a 'não existe')");
  r = await POST(H, "atender", dirBeta, { intervencaoId: R1 }); ok(r.status === 404, "dirigente da Beta: 404");
  r = await POST(H, "atender", PIN(4001), { intervencaoId: R1, observacao: "Postagem apagada às 14h." }); ok(r.status === 200 && r.body.ato.status === "ATENDIDA", "quem administra o canal (por PIN) atende", r.body);
  r = await POST(H, "atender", PIN(4001), { intervencaoId: R1 }); ok(r.status === 422 && /já está atendida/.test(r.body.mensagem), "atender de novo: 422");
  ok(mesmo(await notif("SETOR_REMOCAO_DECIDIDA", R1 * 10 + 3), [1, 2, 1001, 1002, 1003, 3001, 3003, 2011]), "o atendimento avisou o emitente e os líderes, não quem atendeu", await notif("SETOR_REMOCAO_DECIDIDA", R1 * 10 + 3));
  r = await POST(H, "pedido-remocao", PIN(2011), remocao({ referencia: "https://www.facebook.com/permalink.php?story_fbid=2" })); const R2 = r.body.intervencaoId;
  r = await POST(H, "cancelar", PIN(2011), { intervencaoId: R2 }); ok(r.status === 422, "cancelar exige observação");
  r = await POST(H, "cancelar", dirCentral, { intervencaoId: R2, observacao: "O dirigente tenta cancelar" }); ok(r.status === 403, "o dirigente não cancela o pedido alheio");
  r = await POST(H, "cancelar", PIN(2011), { intervencaoId: R2, observacao: "Era outra postagem; engano meu." }); ok(r.status === 200 && r.body.ato.status === "CANCELADA", "quem pediu cancela", r.body);
  r = await POST(H, "pedido-remocao", PIN(2011), remocao({ referencia: "https://www.facebook.com/permalink.php?story_fbid=3" })); const R3 = r.body.intervencaoId;
  r = await POST(H, "decidir", presidente, { intervencaoId: R3, decisao: "RATIFICAR" }); ok(r.status === 422, "pedido de remoção não se ratifica");
  r = await POST(H, "decidir", presidente, { intervencaoId: R3, decisao: "REVOGAR", observacao: "A postagem é do site oficial, está correta." }); ok(r.status === 200 && r.body.ato.status === "REVOGADA", "a Diretoria revoga o pedido", r.body);
  r = await POST(H, "pedido-remocao", PIN(2003), remocao({ referencia: "https://www.facebook.com/permalink.php?story_fbid=4", canalId: undefined, objeto: "Facebook da Central" })); const R4 = r.body.intervencaoId;
  r = await POST(H, "atender", dirCentral, { intervencaoId: R4 }); ok(r.status === 200 && /removida/.test(r.body.ato.fechamentoObs), "o dirigente da congregação atende (observação padrão)", r.body);
  r = await POST(H, "pedido-remocao", PIN(2003), remocao({ referencia: "https://www.facebook.com/permalink.php?story_fbid=5" })); const R5 = r.body.intervencaoId;
  r = await POST(H, "atender", pastor, { intervencaoId: R5, observacao: "Retirada pelo pastor de área." }); ok(r.status === 200, "o pastor de área (alcança a congregação) atende");
  r = await POST(H, "pedido-remocao", PIN(2003), remocao({ referencia: "https://www.facebook.com/permalink.php?story_fbid=6" })); const R6 = r.body.intervencaoId;
  r = await POST(H, "atender", gestora, { intervencaoId: R6 }); ok(r.status === 200, "a gestão dos setores atende");
  r = await POST(H, "levantar", PIN(2003), { intervencaoId: R6, observacao: "Tentando levantar um pedido de remoção" }); ok(r.status === 422 && /Um pedido de remoção/.test(r.body.mensagem), "um pedido de remoção não se 'levanta'", r.body);
  r = await POST(H, "atender", PIN(4001), { intervencaoId: A }); ok(r.status === 404 || r.status === 422, "uma interdição não é 'atendida'", r.status);

  console.log("== o que cada papel enxerga ==");
  r = await GET(H, "atos", presidente); ok(r.status === 200 && r.body.atos.length >= 12, "a Diretoria vê todos os atos", r.body.atos && r.body.atos.length);
  r = await GET(H, "atos", gestora); ok(r.status === 200, "a gestão também vê");
  r = await GET(H, "atos", PIN(2001)); ok(r.status === 403, "PIN não vê a lista geral");
  r = await GET(H, "atos", dirCentral); ok(r.status === 403, "o dirigente não vê a lista geral (tem a rota da congregação)");
  r = await GET(H, "atos", presidente, { tipo: "INTERDICAO", abertos: "1" }); ok(r.body.atos.every(x => x.tipo === "INTERDICAO" && ["EMITIDA", "RATIFICADA"].includes(x.status)) && r.body.atos.some(x => x.intervencaoId === D) && r.body.atos.some(x => x.intervencaoId === Cc), "filtro: interdições em aberto", r.body.atos.map(x => x.status));
  r = await GET(H, "atos", presidente, { tipo: "XXX" }); ok(r.status === 400, "tipo inválido: 400");
  r = await GET(H, "atos", presidente, { congregacaoId: "0x1" }); ok(r.status === 400, "congregacaoId 0x1: 400");
  r = await GET(H, "atos", presidente, { congregacaoId: C.vila.id }); ok(r.body.atos.every(x => x.congregacaoNome === "Vila Nova E2E") && r.body.atos.length >= 2, "filtro por congregação");
  const acoesD = (await GET(H, "atos", presidente, { tipo: "INTERDICAO", abertos: "1" })).body.atos.find(x => x.intervencaoId === Cc).acoes;
  ok(acoesD.join() === "RATIFICAR,REVOGAR,LEVANTAR", "a Diretoria recebe os botões certos para a interdição em aberto", acoesD);
  r = await GET(H, "atos-da-congregacao", dirCentral, { congregacaoId: C.central.id }); ok(r.status === 200 && r.body.atos.length >= 4 && r.body.atos.every(x => x.congregacaoNome === "Central E2E"), "o dirigente vê os atos da PRÓPRIA congregação", r.body.atos && r.body.atos.length);
  r = await GET(H, "atos-da-congregacao", dirCentral, { congregacaoId: C.vila.id }); const fora = r;
  r = await GET(H, "atos-da-congregacao", dirCentral, { congregacaoId: 999999 }); ok(fora.status === 403 && r.status === 403 && r.body.mensagem === fora.body.mensagem, "congregação de fora e congregação que não existe respondem IGUAL (403)");
  r = await GET(H, "atos-da-congregacao", pastor, { congregacaoId: C.vila.id }); ok(r.status === 200, "o pastor de área vê as congregações da área");
  r = await GET(H, "atos-da-congregacao", pastor, { congregacaoId: C.beta.id }); ok(r.status === 403, "mas não as de outra área");
  r = await GET(H, "atos-da-congregacao", PIN(2001), { congregacaoId: C.central.id }); ok(r.status === 403, "PIN não é líder");
  // Líder = liderança territorial COM a permissão "pessoas" e sem restrição de departamento. O geral que cuida de gente é líder de todas; quem só tem as permissões dos setores, não.
  r = await GET(H, "atos-da-congregacao", GERAL(1001, [...TUDO, "pessoas"]), { congregacaoId: C.beta.id }); ok(r.status === 200, "o nível geral que cuida de pessoas é líder de todas");
  r = await GET(H, "atos-da-congregacao", presidente, { congregacaoId: C.beta.id }); ok(r.status === 403, "o nível geral sem a permissão pessoas não é líder: 403", r.body);
  r = await GET(H, "atos-da-congregacao", GERAL(1001, ["financeiro"]), { congregacaoId: C.beta.id }); ok(r.status === 403, "o tesoureiro geral (só financeiro) não é líder: 403", r.body);
  const atoR = (await GET(H, "atos-da-congregacao", dirCentral, { congregacaoId: C.central.id })).body.atos.find(x => x.intervencaoId === R1);
  ok(atoR && atoR.canalDescricao && /Instagram da Central E2E/.test(atoR.canalDescricao) && atoR.referencia === "https://www.instagram.com/p/AbC123/", "o líder vê o canal e o link da postagem");
  r = await GET(H, "ato", PIN(2011), { intervencaoId: R1 }); ok(r.status === 200, "quem emitiu vê o próprio ato");
  r = await GET(H, "ato", PIN(2012), { intervencaoId: R1 }); const estranho = r;
  r = await GET(H, "ato", PIN(2012), { intervencaoId: 999999 }); ok(estranho.status === 404 && r.status === 404 && r.body.mensagem === estranho.body.mensagem, "um estranho recebe a MESMA resposta para ato existente e inexistente");
  r = await GET(H, "ato", PIN(4001), { intervencaoId: R1 }); ok(r.status === 200, "quem administra o canal vê o pedido");
  r = await GET(H, "ato", dirVila, { intervencaoId: R1 }); ok(r.status === 404, "o dirigente de fora não vê");
  r = await GET(H, "canais", PIN(2011), { congregacaoId: C.central.id }); ok(r.status === 200 && r.body.canais.length === 1 && r.body.canais[0].canalId === cen.canalId, "quem pode pedir remoção lista os canais da congregação");
  r = await GET(H, "canais", PIN(2001), { congregacaoId: C.central.id }); ok(r.status === 403, "quem não pode pedir remoção não lista canais");
  r = await GET(H, "meu-painel", PIN(2011)); ok(r.body.atos.length === 3 && r.body.atos.every(x => x.emitenteNome && x.emitidaPorMembroId === 2011), "o painel de quem emitiu lista só os próprios atos", r.body.atos.length);

  console.log("== a cobrança diária (motor de avisos) ==");
  const idAntigo = (await q(`INSERT INTO SetoresTecnicosIntervencoes (Tipo, SetorId, VinculoId, EmitidaPorMembroId, CongregacaoId, Motivo, Objeto, Descricao, Status, EmitidaEm)
    SELECT 'INTERDICAO', SetorId, VinculoId, EmitidaPorMembroId, CongregacaoId, 'RISCO_DESABAMENTO', N'Mezanino antigo', N'Rachadura antiga na laje do mezanino.', 'EMITIDA', DATEADD(DAY, -3, SYSUTCDATETIME()) FROM SetoresTecnicosIntervencoes WHERE IntervencaoId = @i;
    SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`, { i: Cc }))[0].id;
  const pool = await L.obterPool();
  const fatos = await db.detectarInterdicoesPendentes(pool);
  ok(fatos.length >= 1 && fatos.every(f => mesmo(f.destinatarios.map(d => d.membroId), [1, 2, 1001, 1002])), "o detector cobra a Diretoria (e só ela) pelas interdições sem ratificação depois do prazo", fatos.map(f => f.destinatarios.map(d => d.membroId)));
  ok(fatos.some(f => /Mezanino antigo/.test(f.fatoGerador) && /há 3 dia\(s\) sem ratificação/.test(f.fatoGerador)), "o texto diz o objeto e há quantos dias", fatos.map(f => f.fatoGerador));
  ok(!fatos.some(f => f.referenciaId === Cc * 10000 + 0), "a interdição de hoje (dentro do prazo) ainda não é cobrada");
  const antes = await escalar("SELECT COUNT(*) FROM Notificacoes WHERE RegraChave = 'SETOR_INTERDICAO_PENDENTE'");
  const r1 = await motor.avaliarRegras(pool);
  const meio = await escalar("SELECT COUNT(*) FROM Notificacoes WHERE RegraChave = 'SETOR_INTERDICAO_PENDENTE'");
  ok(meio - antes >= 4, "a rodada diária cria os avisos", [antes, meio]);
  await motor.avaliarRegras(pool);
  const depois = await escalar("SELECT COUNT(*) FROM Notificacoes WHERE RegraChave = 'SETOR_INTERDICAO_PENDENTE'");
  ok(depois === meio, "rodar de novo no mesmo dia não duplica");
  await q("INSERT INTO SetoresTecnicosIntervencoes (Tipo, SetorId, VinculoId, EmitidaPorMembroId, CongregacaoId, CanalId, Motivo, Referencia, Descricao, Status, EmitidaEm) SELECT 'REMOCAO_POSTAGEM', SetorId, VinculoId, EmitidaPorMembroId, CongregacaoId, @c, 'ERRO_GROSSEIRO', N'https://exemplo.org/p/antigo', N'Texto com erro grosseiro de português e doutrina.', 'EMITIDA', DATEADD(DAY, -2, SYSUTCDATETIME()) FROM SetoresTecnicosIntervencoes WHERE IntervencaoId = @i", { i: R1, c: cen.canalId });
  const fatosR = await db.detectarRemocoesPendentes(pool);
  ok(fatosR.length === 1 && fatosR[0].destinatarios.map(d => d.membroId).includes(4001) && fatosR[0].destinatarios.map(d => d.membroId).includes(3001) && fatosR[0].destinatarios.map(d => d.membroId).includes(1001) && !fatosR[0].destinatarios.map(d => d.membroId).includes(3002), "o detector do pedido de remoção cobra o administrador do canal, o líder da congregação e a Diretoria", fatosR.map(f => f.destinatarios.map(d => d.membroId)));
  ok(/remoção imediata/.test(fatosR[0].fatoGerador) && /há 2 dia\(s\)/.test(fatosR[0].fatoGerador), "e diz há quantos dias");
  fim("e2e-3-atos");
})().catch((e) => { console.error("ERRO:", e); process.exitCode = 1; try { L.shimEncerrar(); } catch { } });
