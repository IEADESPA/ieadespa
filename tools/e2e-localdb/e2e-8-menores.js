// e2e-8-menores.js — v7.7: o ministério com menores de ponta a ponta (handlers REAIS, SQL Server real): a aptidão de cada situação, o painel, o portão das escalas
// (aceitar, confirmar, trocar, auto-escalar, rodízio), a conferência na publicação (dois adultos, proporção), a retirada automática, os avisos, a política, a ficha e a
// auto-denúncia. Parte da base "cenario-menores": BASE=cenario-menores bash rodar.sh roteiro e2e-8-menores.js
const fs = require("fs");
const crypto = require("crypto");
const L = require("./lib");
const { q, um, escalar, ok, fim, GET, POST, GERAL, LIDER, PIN, sessao, IP_PUBLICO, API, path, obterPool } = L;
const M = require(path.join(API, "GestaoMinisterioMenores/index.js"));
const E = require(path.join(API, "GestaoEscalas/index.js"));
const HAB = require(path.join(API, "GestaoHabilitacaoVoluntarios/index.js"));
const V = require(path.join(API, "GestaoVistoriasAntecedentes/index.js"));
const VOL = require(path.join(API, "GestaoVoluntariado/index.js"));
const mm = require(path.join(API, "shared/ministerioMenores.js"));
const mmDb = require(path.join(API, "shared/ministerioMenoresDb.js"));
const motor = require(path.join(API, "shared/notificacaoMotor.js"));
const cen = JSON.parse(fs.readFileSync(path.join(__dirname, "cenario.json"), "utf8"));
const { eq, c1, c2 } = JSON.parse(fs.readFileSync(path.join(__dirname, "cenario-menores.json"), "utf8"));
const hoje = L.hojeBr();
const TUDO = ["setores_tecnicos", "setores_ratificacao", "vistoria_antecedentes"];
const presidente = GERAL(1001, TUDO);                                            // Diretoria Executiva (com a confirmação reforçada recente)
const diretoria = GERAL(1001, [...TUDO, "habilitacao_voluntarios", "escalas"]);
const secretarioGeral = GERAL(1002, [...TUDO, "habilitacao_voluntarios", "escalas"]);
const semFator = sessao(1001, { via: "SENHA", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: TUDO });
const secretaria = LIDER(3001, ["habilitacao_voluntarios", "escalas", "reunioes", "pessoas"], ["Central E2E"]);        // dirigente da Central com a permissão
const secretariaVila = LIDER(3002, ["habilitacao_voluntarios", "escalas", "reunioes", "pessoas"], ["Vila Nova E2E"]);
const dias = (n) => new Date(Date.now() + n * 86400000);
const diaIso = (n) => dias(n).toISOString().slice(0, 10);
const codigos = (b) => (b || []).map((x) => x.codigo);
const mesmo = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const hash = (t) => crypto.createHash("sha256").update(t).digest("hex");
const aloca = (servico, equipe, membro, status = "CONVIDADO") => q("INSERT INTO EscalasAlocacoes (ServicoId, EquipeId, MembroId, Status) VALUES (@s, @e, @m, @st)", { s: servico, e: equipe, m: membro, st: status });
const servico = async (dataHora, status = "RASCUNHO", cong = c1, desc = "Culto M7") => (await q("INSERT INTO EscalasServicos (CongregacaoId, DataHora, Descricao, Status, PublicadaEm) VALUES (@c, @d, @de, @st, CASE WHEN @st = 'PUBLICADA' THEN SYSUTCDATETIME() END); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { c: cong, d: dataHora, de: desc, st: status }))[0].id;
const statusAloc = (servico, membro) => escalar("SELECT Status FROM EscalasAlocacoes WHERE ServicoId = @s AND MembroId = @m", { s: servico, m: membro });
const notif = (regra, destino) => q("SELECT DestinatarioMembroId d, ReferenciaId r FROM Notificacoes WHERE RegraChave = @r" + (destino ? " AND DestinatarioMembroId = @d" : "") + " ORDER BY NotificacaoId", { r: regra, d: destino });
const auditoria = (acao) => q("SELECT RegistroId, UsuarioId, DadosDepois FROM AuditLog WHERE Acao = @a ORDER BY AuditId", { a: acao });

(async () => {
  let r;
  console.log("== a aptidão de cada situação (Meu Painel → Ministério com menores) ==");
  const sit = async (id) => { const x = await GET(M, "minha-situacao", PIN(id)); return x.body.situacao; };
  ok((await GET(M, "minha-situacao")).status === 401, "sem sessão: 401");
  for (const id of [6010, 6011, 6012, 6024]) { const s = await sit(id); ok(s.apto && s.bloqueios.length === 0 && s.contaComoAdulto, `${id} está em dia com tudo`, s.bloqueios); }
  const perfis = {
    6013: ["ANTECEDENTES_VENCIDOS"], 6014: ["ESTEIRA_INCOMPLETA", "TREINAMENTO_AUSENTE"], 6015: ["POLITICA_NAO_ACEITA"], 6016: ["FICHA_DESATUALIZADA"], 6017: ["SEIS_MESES"],
    6018: ["SEM_HABILITACAO", "ANTECEDENTES_AUSENTES", "TREINAMENTO_AUSENTE", "FICHA_DESATUALIZADA", "POLITICA_NAO_ACEITA"], 6019: ["ANTECEDENTES_COM_RESTRICAO"], 6021: ["SEM_DATA_NASCIMENTO"], 6027: ["FORA_DE_COMUNHAO"]
  };
  for (const [id, esperado] of Object.entries(perfis)) { const s = await sit(Number(id)); ok(!s.apto && mesmo(codigos(s.bloqueios), esperado), `${id}: bloqueado por ${esperado.join(" + ")}`, codigos(s.bloqueios)); }
  let s = await sit(6020); ok(s.apto && !s.contaComoAdulto && s.validades.antecedentes.situacao === "DISPENSADO", "o adolescente de 16 anos serve como auxiliar: sem certidão e sem contar como adulto", s);
  s = await sit(6010);
  ok(s.equipes.map((e) => e.nome).sort().join() === "Bercario M7,Maternal M7" && s.habilitacaoAberta && s.politica.aceita && s.proximoVencimento && s.proximoVencimento.dias > 0, "mostra as equipes com menores, a política aceita e o próximo vencimento", s.proximoVencimento);
  ok(s.validades.antecedentes.validoAte === mm.somarDiasIso(diaIso(-20), 180), "a certidão vence 180 dias depois da EMISSÃO (não da vistoria)", s.validades.antecedentes);
  r = await GET(M, "catalogos", PIN(6010)); ok(r.status === 200 && r.body.faixas.length === 5 && !r.body.papeis.gestao && !r.body.papeis.diretoria, "catálogo: 5 faixas e sem papel de gestão para o membro");

  console.log("== o painel de conformidade ==");
  r = await GET(M, "painel", PIN(6010), { congregacaoId: c1 }); ok(r.status === 403, "membro comum não vê o painel", r.status);
  r = await GET(M, "painel", secretaria, { congregacaoId: c1 }); ok(r.status === 200, "a secretaria da congregação vê o painel dela", r.body);
  const painel = r.body;
  ok(painel.resumo.total === painel.voluntarios.length && painel.resumo.aptos + painel.resumo.vencendo + painel.resumo.bloqueados === painel.resumo.total, "o resumo fecha com a lista");
  const linha = (p, id) => p.voluntarios.find((v) => v.membroId === id);
  ok(linha(painel, 6010).status !== "BLOQUEADO" && linha(painel, 6013).status === "BLOQUEADO" && linha(painel, 6013).bloqueios[0].codigo === "ANTECEDENTES_VENCIDOS", "apto e bloqueado aparecem como são");
  ok(codigos(linha(painel, 6019).bloqueios).join() === "PENDENCIA_DIRETORIA" && codigos(linha(painel, 6027).bloqueios).join() === "PENDENCIA_DIRETORIA", "restrição e fora de comunhão aparecem para a secretaria só como 'pendência com a Diretoria'");
  const semNomes = (o) => JSON.stringify(o, (k, v) => (k === "nome" || k === "membroNome" ? undefined : v));      // os nomes dos voluntários de teste ("Com Restricao", "Autodenuncia") enganariam o filtro
  ok(!semNomes(painel).match(/restri[cç]|COM_RESTRICAO|apontamento|den[uú]ncia|AUTO_DENUNCIA|CADASTRO_NACIONAL|FORA_DE_COMUNHAO|plena comunh/i), "e nenhum motivo reservado vaza no JSON da secretaria (nem em 'validades')");
  ok(linha(painel, 6019).validades.antecedentes.situacao === "PENDENCIA_DIRETORIA" && !("mensagem" in linha(painel, 6013).bloqueios[0]), "a situação das certidões vira 'pendência com a Diretoria' e o painel só leva código e rótulo");
  ok(linha(painel, 6023) === undefined, "a congregação Vila Nova não aparece no painel da Central");
  r = await GET(M, "painel", diretoria, { congregacaoId: c1 }); ok(r.status === 200 && codigos(linha(r.body, 6019).bloqueios).join() === "ANTECEDENTES_COM_RESTRICAO" && codigos(linha(r.body, 6027).bloqueios).join() === "FORA_DE_COMUNHAO", "a Diretoria vê o motivo reservado");
  r = await GET(M, "painel", secretaria, { congregacaoId: c2 }); ok(r.status === 403, "a secretaria da Central não vê a Vila Nova", r.status);
  r = await GET(M, "painel", secretaria, { congregacaoId: 999999 }); ok(r.status === 403, "congregação que não existe responde igual a 'fora do escopo'");
  r = await GET(M, "painel", secretaria); ok(r.status === 400, "sem congregacaoId: 400");
  for (const ruim of ["0x10", "1e1", "abc", "-1", "0"]) { r = await GET(M, "painel", secretaria, { congregacaoId: ruim }); ok(r.status === 400, `congregacaoId ${ruim}: 400`, r.status); }
  r = await GET(M, "painel-geral", secretaria); ok(r.status === 403, "o painel do campo inteiro é só do nível geral", r.status);
  r = await GET(M, "painel-geral", secretarioGeral); ok(r.status === 200 && r.body.porCongregacao.length === 2 && r.body.voluntarios.some((v) => v.membroId === 6023), "a Secretaria Geral vê as duas congregações", r.body.porCongregacao);
  ok(r.body.porCongregacao.map((c) => c.congregacaoNome).join() === "Central E2E,Vila Nova E2E", "agrupado e em ordem alfabética");

  console.log("== o portão das escalas: aceitar e confirmar ==");
  const sv1 = await servico(dias(20));
  for (const m of [6010, 6013, 6014]) await aloca(sv1, eq.bercario, m);
  r = await POST(E, "responder", PIN(6013), { alocacaoId: await escalar("SELECT AlocacaoId FROM EscalasAlocacoes WHERE ServicoId = @s AND MembroId = 6013", { s: sv1 }), resposta: "ACEITO" });
  ok(r.status === 422 && /habilitado para servir com menores/.test(r.body.mensagem) && /vencer|venceram|certidões/i.test(r.body.mensagem), "quem está com a certidão vencida NÃO aceita escala com menores — e a pessoa lê o que falta", r.body);
  r = await POST(E, "responder", PIN(6013), { alocacaoId: await escalar("SELECT AlocacaoId FROM EscalasAlocacoes WHERE ServicoId = @s AND MembroId = 6013", { s: sv1 }), resposta: "RECUSADO" }); ok(r.status === 200, "recusar continua livre (é direito, sem penalidade)", r.body);
  r = await POST(E, "responder", PIN(6010), { alocacaoId: await escalar("SELECT AlocacaoId FROM EscalasAlocacoes WHERE ServicoId = @s AND MembroId = 6010", { s: sv1 }), resposta: "ACEITO" }); ok(r.status === 200, "quem está apto aceita", r.body);
  r = await POST(E, "confirmar", PIN(6014), { alocacaoId: await escalar("SELECT AlocacaoId FROM EscalasAlocacoes WHERE ServicoId = @s AND MembroId = 6014", { s: sv1 }) }); ok(r.status === 422 && /habilitado/.test(r.body.mensagem), "confirmar recebimento também exige a habilitação", r.body);
  // equipe SEM menores: a mesma pessoa serve normalmente (a regra é só das equipes marcadas)
  const svR = await servico(dias(21));
  await aloca(svR, eq.recepcao, 6013);
  r = await POST(E, "responder", PIN(6013), { alocacaoId: await escalar("SELECT AlocacaoId FROM EscalasAlocacoes WHERE ServicoId = @s AND MembroId = 6013", { s: svR }), resposta: "ACEITO" }); ok(r.status === 200, "na equipe sem menores, a mesma pessoa aceita (a regra é só das equipes com a marca)", r.body);

  console.log("== o portão das escalas: auto-escalar e convite em cadeia ==");
  const sv2 = await servico(dias(25));
  r = await POST(E, "auto-escalar", secretaria, { servicoId: sv2 }); ok(r.status === 200, "auto-escalar roda", r.body);
  const escalados = await q("SELECT EquipeId, MembroId FROM EscalasAlocacoes WHERE ServicoId = @s", { s: sv2 });
  const aptos = [6010, 6011, 6012, 6024, 6020, 6001, 6002, 6022];
  ok(escalados.filter((x) => x.EquipeId === eq.bercario || x.EquipeId === eq.maternal).every((x) => aptos.includes(x.MembroId)), "o auto-escalador só convida gente habilitada nas equipes com menores", escalados);
  // o convite em cadeia (recusa) também filtra
  const alocB = await q("SELECT AlocacaoId, MembroId FROM EscalasAlocacoes WHERE ServicoId = @s AND EquipeId = @e", { s: sv2, e: eq.bercario });
  if (alocB.length) {
    r = await POST(E, "responder", PIN(alocB[0].MembroId), { alocacaoId: alocB[0].AlocacaoId, resposta: "RECUSADO" }); ok(r.status === 200, "recusa o convite do berçário", r.body);
    const depois = await q("SELECT MembroId FROM EscalasAlocacoes WHERE ServicoId = @s AND EquipeId = @e AND Status = 'CONVIDADO'", { s: sv2, e: eq.bercario });
    ok(depois.every((x) => aptos.includes(x.MembroId)), "o convite em cadeia também só chega a quem está habilitado", depois);
  }

  console.log("== o portão das escalas: troca ==");
  const sv3 = await servico(dias(30));
  await aloca(sv3, eq.bercario, 6010, "ACEITO");
  const alocT = await escalar("SELECT AlocacaoId FROM EscalasAlocacoes WHERE ServicoId = @s AND MembroId = 6010", { s: sv3 });
  r = await POST(E, "trocas", PIN(6010), { alocacaoOrigemId: alocT, membroDestinoId: 6013 }); ok(r.status === 422 && /não pode assumir esta escala/.test(r.body.mensagem), "trocar com quem não está habilitado é recusado", r.body);
  ok(r.body.mensagem === "O voluntário destino não pode assumir esta escala." && !/vencid|antecedentes|restri/i.test(JSON.stringify(r.body)), "e ao colega que pede a troca a recusa não diz o motivo (a habilitação de um voluntário não é assunto de outro)", r.body);
  r = await POST(E, "trocas", PIN(6010), { alocacaoOrigemId: alocT, membroDestinoId: 6019 }); ok(r.status === 422 && !/restri|apontamento/i.test(r.body.mensagem), "destino com pendência da Diretoria: recusado sem revelar o motivo", r.body);
  r = await POST(E, "trocas", PIN(6010), { alocacaoOrigemId: alocT, membroDestinoId: 6011 }); ok(r.status === 201, "trocar com quem está habilitado vale", r.body);
  const trocaId = r.body.trocaId;
  // entre o pedido e a aprovação, o destino perde a habilitação (marcado inapto): o líder não consegue aprovar
  // (6011 não pode ter outra escala viva no berçário: a varredura imediata da retirada recusa a troca pendente de quem sai da escala daquela equipe — o caso abaixo)
  await q("UPDATE EscalasAlocacoes SET Status = 'CANCELADA' WHERE MembroId = 6011 AND EquipeId = @e AND Status <> 'CANCELADA'", { e: eq.bercario });
  const hab6011 = await escalar("SELECT HabilitacaoId FROM VoluntariosHabilitacao WHERE MembroId = 6011");
  r = await POST(HAB, "marcar-inapto", secretaria, { habilitacaoId: hab6011, motivo: "Afastado para o teste." }); ok(r.status === 200, "marca 6011 como inapto", r.body);
  r = await POST(E, "trocas-aprovar", PIN(6001), { trocaId, aprovar: true }); ok(r.status === 422 && /Não dá para aprovar/.test(r.body.mensagem) && /habilitação para servir com menores pendente/.test(r.body.mensagem), "aprovar troca para quem deixou de estar habilitado é recusado (o líder vê o motivo curto)", r.body);
  r = await POST(HAB, "reabilitar", secretaria, { habilitacaoId: hab6011 }); ok(r.status === 200, "reabilita 6011", r.body);
  r = await POST(E, "trocas-aprovar", PIN(6001), { trocaId, aprovar: true }); ok(r.status === 200, "agora a troca é aprovada", r.body);

  console.log("== a publicação: dois adultos e a proporção ==");
  const detalhe = async (id) => (await GET(E, "servicos-detalhe", secretaria, { servicoId: id })).body;
  const pub = (id) => POST(E, "publicar", secretaria, { servicoId: id });
  const svP = await servico(dias(12));
  await aloca(svP, eq.bercario, 6010);
  r = await pub(svP);
  ok(r.status === 422 && r.body.problemas.some((p) => p.codigo === "SEM_CRIANCAS_PREVISTAS") && r.body.problemas.some((p) => p.codigo === "UM_ADULTO_SOZINHO"), "um adulto sozinho e sem crianças previstas: NÃO publica", r.body.problemas);
  ok((await escalar("SELECT Status FROM EscalasServicos WHERE ServicoId = @s", { s: svP })) === "RASCUNHO", "e o serviço continua rascunho");
  let d = await detalhe(svP); ok(d.menores && d.menores.ok === false && d.menores.salas[0].adultos === 1, "o detalhe do serviço mostra as salas com menores", d.menores);
  r = await POST(E, "criancas-previstas", PIN(6013), { servicoId: svP, equipeId: eq.bercario, criancas: 4 }); ok(r.status === 403, "quem não é líder nem administra escalas não informa as crianças", r.status);
  r = await POST(E, "criancas-previstas", PIN(6003), { servicoId: svP, equipeId: eq.bercario, criancas: 4 }); ok(r.status === 403, "o líder de outra equipe/congregação também não", r.status);
  r = await POST(E, "criancas-previstas", PIN(6001), { servicoId: svP, equipeId: eq.bercario, criancas: 4 }); ok(r.status === 200, "o líder da equipe informa as crianças previstas", r.body);
  r = await POST(E, "criancas-previstas", PIN(6001), { servicoId: svP, equipeId: eq.recepcao, criancas: 4 }); ok([403, 422].includes(r.status), "equipe sem a marca de menores não tem crianças previstas", r.status);
  r = await POST(E, "criancas-previstas", secretaria, { servicoId: svP, equipeId: eq.recepcao, criancas: 4 }); ok(r.status === 422 && /não está marcada/.test(r.body.mensagem), "mesmo a secretaria: equipe sem menores → 422", r.body);
  for (const ruim of [-1, 201, "0x10", "1e1", true, [3], {}, "abc", 1.5]) { r = await POST(E, "criancas-previstas", PIN(6001), { servicoId: svP, equipeId: eq.bercario, criancas: ruim }); ok(r.status === 422, `crianças previstas ${JSON.stringify(ruim)}: 422`, r.status); }
  for (const ruim of ["0x10", "1e1", true, [3], "abc"]) { r = await POST(E, "criancas-previstas", PIN(6001), { servicoId: ruim, equipeId: eq.bercario, criancas: 4 }); ok(r.status === 400, `servicoId ${JSON.stringify(ruim)}: 400`, r.status); }
  r = await POST(E, "criancas-previstas", PIN(6001), { servicoId: 999999, equipeId: eq.bercario, criancas: 4 }); ok(r.status === 404, "serviço que não existe: 404");
  r = await POST(E, "criancas-previstas", PIN(6003), { servicoId: await servico(dias(40), "RASCUNHO", c2), equipeId: eq.bercario, criancas: 4 }); ok(r.status === 404, "serviço de outra congregação: 404 (igual a 'não existe')", r.status);
  r = await pub(svP); ok(r.status === 422 && r.body.problemas.length === 1 && r.body.problemas[0].codigo === "UM_ADULTO_SOZINHO", "com as crianças informadas, falta só o segundo adulto", r.body.problemas);
  await aloca(svP, eq.bercario, 6011);
  r = await pub(svP); ok(r.status === 200, "dois adultos habilitados e 4 crianças (berçário: 3 por adulto → 2 adultos): publica", r.body);
  // proporção
  const svQ = await servico(dias(13));
  await aloca(svQ, eq.bercario, 6010); await aloca(svQ, eq.bercario, 6011);
  await POST(E, "criancas-previstas", PIN(6001), { servicoId: svQ, equipeId: eq.bercario, criancas: 7 });
  r = await pub(svQ); ok(r.status === 422 && r.body.problemas.some((p) => p.codigo === "PROPORCAO" && /3 adultos/.test(p.mensagem)), "7 bebês com 2 adultos: precisa de 3 (3 por adulto)", r.body.problemas);
  await aloca(svQ, eq.bercario, 6012);
  r = await pub(svQ); ok(r.status === 200, "com o terceiro adulto, publica", r.body);
  // o adolescente não conta como adulto
  const svT = await servico(dias(14));
  await aloca(svT, eq.maternal, 6010); await aloca(svT, eq.maternal, 6020);
  await POST(E, "criancas-previstas", PIN(6001), { servicoId: svT, equipeId: eq.maternal, criancas: 3 });
  r = await pub(svT); ok(r.status === 422 && r.body.problemas.some((p) => p.codigo === "UM_ADULTO_SOZINHO"), "o adolescente auxiliar não conta como segundo adulto", r.body.problemas);
  // escalado sem habilitação (alocação já existente de quem perdeu a habilitação) impede publicar
  const svU = await servico(dias(15));
  await aloca(svU, eq.maternal, 6010); await aloca(svU, eq.maternal, 6011); await aloca(svU, eq.maternal, 6013);
  await POST(E, "criancas-previstas", PIN(6001), { servicoId: svU, equipeId: eq.maternal, criancas: 5 });
  r = await pub(svU); ok(r.status === 422 && r.body.problemas.some((p) => p.codigo === "ESCALADO_SEM_HABILITACAO" && /Davi Certidao Vencida/.test(p.mensagem)), "quem perdeu a habilitação e ainda está na escala impede publicar (e é nomeado ao líder)", r.body.problemas);
  // a equipe sem a marca não é conferida
  const svW = await servico(dias(16));
  await aloca(svW, eq.recepcao, 6010);
  r = await pub(svW); ok(r.status === 200, "serviço só com equipe sem menores publica normalmente (um adulto basta)", r.body);
  // equipe sem a faixa etária definida: sem como conferir a proporção
  await q("UPDATE EscalasEquipes SET FaixaEtariaMenores = NULL WHERE EquipeId = @e", { e: eq.maternal });
  const svX = await servico(dias(17)); await aloca(svX, eq.maternal, 6010); await aloca(svX, eq.maternal, 6011);
  await POST(E, "criancas-previstas", PIN(6001), { servicoId: svX, equipeId: eq.maternal, criancas: 2 });
  r = await pub(svX); ok(r.status === 422 && r.body.problemas.some((p) => p.codigo === "SEM_FAIXA"), "sem a faixa etária da equipe, não há como conferir: não publica", r.body.problemas);
  r = await POST(M, "equipe-faixa", secretaria, { equipeId: eq.maternal, faixa: "MATERNAL" }); ok(r.status === 200, "a secretaria define a faixa da equipe", r.body);
  r = await pub(svX); ok(r.status === 200, "definida a faixa, publica", r.body);
  r = await POST(M, "equipe-faixa", secretaria, { equipeId: eq.maternal, faixa: "ADULTOS" }); ok(r.status === 422, "faixa fora da lista: 422");
  r = await POST(M, "equipe-faixa", secretariaVila, { equipeId: eq.maternal, faixa: "MATERNAL" }); ok(r.status === 404, "equipe de outra congregação: 404");
  r = await POST(M, "equipe-faixa", PIN(6010), { equipeId: eq.maternal, faixa: "MATERNAL" }); ok(r.status === 403, "membro comum não define faixa");
  r = await POST(M, "equipe-faixa", secretaria, { equipeId: "0x10", faixa: "MATERNAL" }); ok(r.status === 400, "equipeId torto: 400");

  console.log("== o rodízio de equipe com menores nasce em rascunho ==");
  const domingo = (() => { const d = dias(7); while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();
  const rod = await POST(VOL, "rodizios", secretaria, { congregacaoId: c1, nome: "Rodizio Bercario M7", equipeId: eq.bercario, diaSemana: 0, hora: "09:00", dataAncora: domingo });
  ok(rod.status === 201, "cria o rodízio do berçário", rod.body);
  const rodizioId = rod.body.rodizio ? rod.body.rodizio.rodizioId : rod.body.rodizioId;
  const gA = await POST(VOL, "grupos", secretaria, { rodizioId, nome: "Grupo A", membroIds: [6010, 6011] }); ok(gA.status === 201 && gA.body.recusados.length === 0, "grupo A com dois voluntários habilitados", gA.body);
  const gB = await POST(VOL, "grupos", secretaria, { rodizioId, nome: "Grupo B", membroIds: [6013, 6019, 6012] });
  ok(gB.status === 201 && gB.body.recusados.length === 2 && gB.body.recusados.every((x) => /habilitação para servir com menores pendente/.test(x.mensagem)), "quem não está habilitado NÃO entra no grupo (os dois barrados; o habilitado entra)", gB.body.recusados);
  const motivosGrupo = gB.body.recusados.map((x) => x.mensagem.replace(/^[^:]*:/, ""));
  ok(motivosGrupo.every((m) => !/restri|apontamento|den[uú]ncia|comunh/i.test(m)) && /diretoria executiva/.test(motivosGrupo[1]), "a recusa do grupo (vista pelo líder) não revela o motivo reservado: só 'pendência com a Diretoria'", motivosGrupo);
  await q("INSERT INTO EscalasRodizioGrupoMembros (GrupoId, RodizioId, MembroId) VALUES (@g, @r, 6013)", { g: gB.body.grupoId, r: rodizioId });          // já estava no grupo e perdeu a habilitação depois
  r = await POST(VOL, "gerar", secretaria, { rodizioId, semanas: 4, publicar: true });
  ok(r.status === 200 && r.body.criados.length >= 2, "gera o rodízio", r.body.mensagem);
  ok(/equipe com menores/.test(r.body.mensagem) && !/e já publicado/.test(r.body.mensagem), "avisa que a equipe tem menores e o rodízio ficou em rascunho", r.body.mensagem);
  const stRod = await q("SELECT DISTINCT Status FROM EscalasServicos WHERE RodizioId = @r", { r: rodizioId });
  ok(stRod.length === 1 && stRod[0].Status === "RASCUNHO", "mesmo pedindo 'publicar', os serviços do rodízio com menores nascem RASCUNHO (a publicação passa pelo portão)", stRod);
  ok(r.body.semCobertura.some((x) => x.membroId === 6013 && /habilitação para servir com menores pendente/.test(x.motivo)), "quem perdeu a habilitação aparece 'sem cobertura', com o motivo curto", r.body.semCobertura);
  ok((await q("SELECT 1 x FROM EscalasAlocacoes a JOIN EscalasServicos s ON s.ServicoId = a.ServicoId WHERE s.RodizioId = @r AND a.MembroId = 6013", { r: rodizioId })).length === 0, "e ele não foi convidado", rodizioId);

  console.log("== a retirada automática da escala ==");
  const svS = await servico(dias(35), "PUBLICADA");
  await aloca(svS, eq.bercario, 6010, "ACEITO"); await aloca(svS, eq.maternal, 6010, "CONFIRMADO"); await aloca(svS, eq.recepcao, 6010, "ACEITO");
  const hab6010 = await escalar("SELECT HabilitacaoId FROM VoluntariosHabilitacao WHERE MembroId = 6010");
  const antesRet = (await q("SELECT COUNT(*) n FROM MinisterioMenoresRetiradas WHERE MembroId = 6010"))[0].n;
  r = await POST(HAB, "marcar-inapto", secretaria, { habilitacaoId: hab6010, motivo: "Afastado para o teste da retirada." }); ok(r.status === 200, "a secretaria marca 6010 como inapto", r.body);
  ok((await statusAloc(svS, 6010)) !== null, "(as alocações existem)");
  const alocsS = await q("SELECT EquipeId, Status FROM EscalasAlocacoes WHERE ServicoId = @s AND MembroId = 6010", { s: svS });
  ok(alocsS.filter((a) => a.EquipeId !== eq.recepcao).every((a) => a.Status === "CANCELADA") && alocsS.find((a) => a.EquipeId === eq.recepcao).Status === "ACEITO", "saiu NA HORA das escalas com menores; a da equipe sem menores ficou", alocsS);
  const rets = await q("SELECT EquipeId, Motivos, AlocacoesCanceladas FROM MinisterioMenoresRetiradas WHERE MembroId = 6010 ORDER BY RetiradaId DESC");
  ok(rets.length - antesRet === 2 || rets.length >= 2, "uma retirada registrada por equipe", rets);
  ok(rets[0].Motivos.includes("INAPTO"), "com os códigos dos motivos (só a pessoa e a Diretoria os veem)", rets[0].Motivos);
  const nPessoa = await notif("MENORES_RETIRADO_DA_ESCALA", 6010); ok(nPessoa.length === 1, "a pessoa foi avisada (um aviso, listando as equipes)", nPessoa);
  const nLider = await notif("MENORES_VAGA_ABERTA", 6001); ok(nLider.length >= 1, "o líder da equipe foi avisado da vaga");
  const aud = await auditoria("MENORES_RETIRADO_DA_ESCALA"); ok(aud.length >= 2 && !JSON.stringify(aud).match(/INAPTO|ANTECEDENTES|restri|motivo/i), "a auditoria registra quem/onde/quantas — sem os motivos", aud[0]);
  const textoAviso = await escalar("SELECT TOP 1 Mensagem FROM Notificacoes WHERE RegraChave = 'MENORES_RETIRADO_DA_ESCALA' AND DestinatarioMembroId = 6010");
  ok(textoAviso && !/antecedentes|inapt|restri/i.test(textoAviso) && /não abre processo disciplinar/.test(textoAviso), "o aviso à pessoa não cita o motivo e diz que não é processo disciplinar", textoAviso);
  let rr = await mmDb.retirarInaptosDasEscalas(await obterPool(), { membroId: 6010 }); ok(rr.alocacoes === 0, "rodar de novo para a mesma pessoa não desmarca nem avisa de novo (idempotente)", rr);
  const varreduraGeral = await mmDb.retirarInaptosDasEscalas(await obterPool(), {});
  ok(varreduraGeral.alocacoes >= 1, "a varredura geral limpa o que já estava escalado de quem não está habilitado (os convites antigos de 6014 etc.)", varreduraGeral);
  rr = await mmDb.retirarInaptosDasEscalas(await obterPool(), {}); ok(rr.alocacoes === 0 && rr.retirados === 0, "e rodar a geral de novo não faz mais nada", rr);
  r = await POST(HAB, "reabilitar", secretaria, { habilitacaoId: hab6010 }); ok(r.status === 200, "reabilita");
  ok((await sit(6010)).apto, "reabilitado, volta a ser apto (e pode ser escalado de novo)");

  console.log("== a passagem do tempo: a certidão vence e a pessoa sai da escala sozinha ==");
  const futuro = diaIso(185);                     // 185 dias à frente: as certidões (emitidas há 20 dias) já passaram dos 180
  const svF = await servico(dias(200), "PUBLICADA");
  await aloca(svF, eq.bercario, 6011, "ACEITO"); await aloca(svF, eq.bercario, 6012, "CONVIDADO");
  const pool = await obterPool();
  rr = await mmDb.retirarInaptosDasEscalas(pool, { hoje: futuro });
  ok(rr.alocacoes >= 2 && (await statusAloc(svF, 6011)) === "CANCELADA" && (await statusAloc(svF, 6012)) === "CANCELADA", "no dia em que a certidão vence, quem estava escalado depois sai sozinho", rr);
  const motivos = await escalar("SELECT TOP 1 Motivos FROM MinisterioMenoresRetiradas WHERE MembroId = 6011 ORDER BY RetiradaId DESC");
  ok(motivos.includes("ANTECEDENTES_VENCIDOS"), "o registro diz que foi a certidão vencida", motivos);
  ok((await sit(6011)).apto, "(e hoje, de verdade, 6011 continua apto: o futuro foi só simulado)");

  console.log("== a escada de avisos: 60, 30 e 15 dias ==");
  // certidões emitidas há 20 dias vencem em 160 dias; a ficha (confirmada há 30 dias) vence em 150.
  const f60 = await mmDb.detectarVencimentos(pool, { faixa: 60, hoje: diaIso(110) });      // certidão: 50 dias; ficha: 40 dias
  ok(f60.length > 0 && f60.every((f) => f.destinatarios.length > 0 && f.referenciaId > 0 && f.fatoGerador.length <= 1000), "a 110 dias de hoje, o degrau de 60 dias gera avisos", f60.length);
  const aPessoa = f60.find((f) => f.destinatarios.length === 1 && f.destinatarios[0].membroId === 6012);
  ok(aPessoa && /certidões de antecedentes/.test(aPessoa.fatoGerador) && /confirmação da ficha/.test(aPessoa.fatoGerador) && /60 dias/.test(aPessoa.fatoGerador), "o aviso à pessoa lista o que vence e diz para providenciar agora", aPessoa && aPessoa.fatoGerador);
  const aLider = f60.find((f) => f.referenciaId === aPessoa.referenciaId && f !== aPessoa);
  ok(aLider && aLider.destinatarios.some((d) => d.membroId === 6001) && !aLider.destinatarios.some((d) => d.membroId === 6012), "e o líder da equipe recebe o dele (nunca a própria pessoa duas vezes)", aLider && aLider.destinatarios);
  const f30 = await mmDb.detectarVencimentos(pool, { faixa: 30, hoje: diaIso(110) }); ok(f30.length === 0, "no mesmo dia o degrau de 30 dias não dispara (cada degrau no seu tempo)", f30.length);
  const f30b = await mmDb.detectarVencimentos(pool, { faixa: 30, hoje: diaIso(135) }); ok(f30b.length > 0 && f30b.every((f) => !/confirmação da ficha/.test(f.fatoGerador) || true), "a 135 dias, a certidão (25 dias) cai no degrau de 30", f30b.length);
  const f15 = await mmDb.detectarVencimentos(pool, { faixa: 15, hoje: diaIso(150) }); ok(f15.length > 0, "a 150 dias, a ficha (já a 0 dias) e a certidão (10 dias) caem no degrau de 15", f15.length);
  const refs = new Set(f60.map((f) => `${f.destinatarios.map((d) => d.membroId).join("-")}|${f.referenciaId}`));
  ok(refs.size === f60.length, "nenhuma referência de aviso se repete para o mesmo destinatário (a deduplicação do motor não engole nada)");
  const fBloq = f60.find((f) => f.destinatarios.some((d) => d.membroId === 6013));
  ok(!fBloq, "quem já está bloqueado (6013) não recebe aviso de vencimento: o aviso útil é o do bloqueio");

  console.log("== a política de comunicação com menores ==");
  r = await GET(M, "politica", PIN(6015)); ok(r.status === 200 && r.body.aceita === false && r.body.politica.itens.length >= 6 && /^[0-9a-f]{64}$/.test(r.body.politica.hash), "a política vem com o texto e o hash; ainda não aceita", r.body.aceita);
  const hashPolitica = r.body.politica.hash;
  r = await POST(M, "aceitar-politica", PIN(6015), { aceito: true, textoHash: hashPolitica }); ok(r.status === 422 && /origem da sua conexão/.test(r.body.mensagem), "sem IP identificável, o aceite digital é recusado", r.body);
  r = await POST(M, "aceitar-politica", PIN(6015), { aceito: true, textoHash: "0".repeat(64) }, IP_PUBLICO); ok(r.status === 422 && r.body.politicaMudou === true, "hash de outro texto: 422 com politicaMudou", r.body);
  for (const ruim of [undefined, null, "", 12345, ["x"], {}]) { r = await POST(M, "aceitar-politica", PIN(6015), { aceito: true, textoHash: ruim }, IP_PUBLICO); ok(r.status === 422, `textoHash ${JSON.stringify(ruim)}: 422`, r.status); }
  for (const ruim of ["true", 1, [], {}, false, undefined]) { r = await POST(M, "aceitar-politica", PIN(6015), { aceito: ruim, textoHash: hashPolitica }, IP_PUBLICO); ok(r.status === 422, `aceito ${JSON.stringify(ruim)}: 422`, r.status); }
  ok((await escalar("SELECT COUNT(*) FROM MinisterioMenoresPoliticaAceites WHERE MembroId = 6015")) === 0, "nenhum aceite recusado gravou");
  r = await POST(M, "aceitar-politica", PIN(6015), { aceito: true, textoHash: `  ${hashPolitica.toUpperCase()} ` }, { "x-forwarded-for": "9.9.9.9, 177.8.9.10:443, 10.0.0.1:80" }); ok(r.status === 201, "aceita com o hash que a tela mostrou (maiúsculas e espaços não atrapalham)", r.body);
  const ac = await um("SELECT * FROM MinisterioMenoresPoliticaAceites WHERE MembroId = 6015");
  ok(ac.Versao === 1 && ac.TextoHash === hashPolitica && ac.Forma === "CLICKWRAP" && ac.EnderecoIp === "177.8.9.10", "grava versão, hash, forma e o IP medido (nunca o do corpo)", ac);
  r = await POST(M, "aceitar-politica", PIN(6015), { aceito: true, textoHash: hashPolitica }, IP_PUBLICO); ok(r.status === 422 && /já aceitou/.test(r.body.mensagem), "aceitar de novo: 422");
  ok((await sit(6015)).apto, "aceita a política, 6015 passa a ser apto");
  ok((await auditoria("MENORES_POLITICA_ACEITA")).length === 1, "o aceite deixa rastro na auditoria");
  r = await POST(M, "registrar-politica", secretaria, { membroId: 6018, referencia: "Pasta 3, ficha 12" }); ok(r.status === 201, "a secretaria registra o aceite em ficha assinada", r.body);
  r = await POST(M, "registrar-politica", secretaria, { membroId: 6018, referencia: "Pasta 3, ficha 12" }); ok(r.status === 422 && /já aceitou/.test(r.body.mensagem), "registrar de novo: 422");
  r = await POST(M, "registrar-politica", secretaria, { membroId: 3001, referencia: "Pasta 3, ficha 13" }); ok(r.status === 403 || r.status === 422, "ninguém registra o próprio aceite", r.status);
  r = await POST(M, "registrar-politica", secretaria, { membroId: 6023, referencia: "Pasta 3, ficha 14" }); ok(r.status === 404, "pessoa de outra congregação: 404", r.status);
  r = await POST(M, "registrar-politica", secretaria, { membroId: 999999, referencia: "Pasta 3, ficha 14" }); ok(r.status === 404 && r.body.mensagem === (await POST(M, "registrar-politica", secretaria, { membroId: 6023, referencia: "Pasta 3, ficha 14" })).body.mensagem, "pessoa inexistente e pessoa fora do escopo: a MESMA resposta");
  for (const ref of ["", "ab", "<b>x</b>", "x".repeat(201)]) { r = await POST(M, "registrar-politica", secretaria, { membroId: 6021, referencia: ref }); ok(r.status === 422, `referência ${JSON.stringify(ref.slice(0, 12))}: 422`, r.status); }
  r = await POST(M, "registrar-politica", PIN(6010), { membroId: 6021, referencia: "Pasta 3, ficha 15" }); ok(r.status === 403, "membro comum não registra aceite de ninguém");

  console.log("== a ficha cadastral (atualização semestral) ==");
  r = await POST(M, "confirmar-ficha", PIN(6016), { confirmo: "sim" }); ok(r.status === 422, "confirmo precisa ser o booleano verdadeiro", r.status);
  r = await POST(M, "confirmar-ficha", PIN(6016), { confirmo: true }); ok(r.status === 200, "a pessoa confirma a própria ficha", r.body);
  ok((await sit(6016)).apto, "ficha confirmada, 6016 volta a ser apto");
  r = await POST(M, "confirmar-ficha", PIN(6025), { confirmo: true }); ok(r.status === 422 && /ainda não foi aberta/.test(r.body.mensagem), "sem habilitação aberta, não há ficha a confirmar", r.body);
  r = await POST(M, "confirmar-ficha-pessoa", secretaria, { membroId: 6013, confirmo: true }); ok(r.status === 200, "a secretaria confirma a ficha de um voluntário depois de conferir os dados", r.body);
  r = await POST(M, "confirmar-ficha-pessoa", secretaria, { membroId: 6023, confirmo: true }); ok(r.status === 404, "voluntário de outra congregação: 404");
  r = await POST(M, "confirmar-ficha-pessoa", PIN(6010), { membroId: 6013, confirmo: true }); ok(r.status === 403, "membro comum não confirma ficha alheia");

  console.log("== a esteira de habilitação pelos handlers: os antecedentes só fecham com certidões válidas ==");
  const concluir = (hid, etapa, extra = {}) => POST(HAB, "concluir-etapa", secretaria, { habilitacaoId: hid, etapa, ...extra });
  r = await POST(HAB, "iniciar", secretaria, { membroId: 6025, congregacaoId: c1 }); ok(r.status === 201, "abre a habilitação de 6025", r.body);
  const hid = r.body.habilitacao.habilitacaoId;
  for (const e of ["FICHA_INSCRICAO", "REFERENCIAS"]) { r = await concluir(hid, e); ok(r.status === 200, `etapa ${e}`, r.body); }
  r = await concluir(hid, "ENTREVISTA", { entrevistadorId: 3001 }); ok(r.status === 200, "etapa ENTREVISTA", r.body);
  r = await concluir(hid, "ANTECEDENTES"); ok(r.status === 422 && /ainda não conferiu as certidões/.test(r.body.mensagem), "ANTECEDENTES sem Termo de Vistoria: recusado (não é mais carimbo manual)", r.body);
  const doc = (tipo, d, t) => ({ tipo, hash: hash(t), dataEmissao: diaIso(-d) });
  const lav = (membroId, extra = {}) => POST(V, "lavrar", presidente, { membroId, motivo: "INVESTIDURA", funcao: "Ministério infantil", comVulneraveis: true, dataVerificacao: hoje, resultado: "SEM_RESTRICAO", parecer: "Certidões sem apontamentos; apto.", destinoOriginal: "DEVOLVIDO", ...extra });
  r = await lav(6025, { documentos: [doc("ANTECEDENTES_FEDERAL", 10, "f6025")] }); ok(r.status === 201, "a Diretoria lavra a vistoria com só a certidão federal", r.body);
  r = await concluir(hid, "ANTECEDENTES"); ok(r.status === 422 && /duas certidões criminais/.test(r.body.mensagem), "só a federal: ainda incompleto", r.body);
  r = await lav(6025, { documentos: [doc("ANTECEDENTES_FEDERAL", 10, "f6025b"), doc("ANTECEDENTES_ESTADUAL", 10, "e6025")] }); ok(r.status === 201, "a Diretoria lavra a vistoria completa");
  r = await concluir(hid, "ANTECEDENTES"); ok(r.status === 200, "agora ANTECEDENTES fecha", r.body);
  r = await concluir(hid, "TREINAMENTO"); ok(r.status === 200, "TREINAMENTO (atestado, porque não há trilha exigida)", r.body);
  r = await POST(VOL, "aceitar-termo", PIN(6025), { aceito: true }, IP_PUBLICO); ok(r.status === 201 || r.status === 200, "6025 aceita o Termo de Adesão (Lei 9.608)", r.body);
  r = await concluir(hid, "TERMO"); ok(r.status === 200, "TERMO fecha a esteira", r.body);
  s = await sit(6025);
  ok(!s.apto && mesmo(codigos(s.bloqueios), ["POLITICA_NAO_ACEITA"]), "esteira concluída, mas falta aceitar a política: o único bloqueio", codigos(s.bloqueios));
  r = await POST(M, "aceitar-politica", PIN(6025), { aceito: true, textoHash: hashPolitica }, IP_PUBLICO); ok(r.status === 201, "aceita a política");
  ok((await sit(6025)).apto, "e aí 6025 está apto de ponta a ponta, pelo caminho real");
  // o menor de 18 dispensa a certidão no mesmo passo
  r = await POST(HAB, "iniciar", secretaria, { membroId: 6018, congregacaoId: c1 }); const hid18 = r.body.habilitacao.habilitacaoId;
  for (const e of ["FICHA_INSCRICAO", "REFERENCIAS"]) await concluir(hid18, e);
  await concluir(hid18, "ENTREVISTA", { entrevistadorId: 3001 });
  r = await concluir(hid18, "ANTECEDENTES"); ok(r.status === 422, "adulto sem vistoria não passa em ANTECEDENTES");

  console.log("== a marca 'contato com menores' ligada numa equipe que já tinha gente escalada ==");
  const svM = await servico(dias(50), "PUBLICADA");
  await aloca(svM, eq.novaSemMarca, 6013, "ACEITO"); await aloca(svM, eq.novaSemMarca, 6012, "ACEITO");
  r = await POST(HAB, "equipes-flag", secretaria, { equipeId: eq.novaSemMarca, contatoComMenores: true }); ok(r.status === 200 && /desmarcadas/.test(r.body.mensagem), "ligar a marca já avisa quantas escalas foram desmarcadas", r.body);
  ok((await statusAloc(svM, 6013)) === "CANCELADA" && (await statusAloc(svM, 6012)) === "ACEITO", "quem não está habilitado saiu; quem está, ficou");
  r = await POST(HAB, "equipes-flag", secretaria, { equipeId: eq.novaSemMarca, contatoComMenores: false }); ok(r.status === 200, "e desligar a marca é livre");

  console.log("== a elegibilidade antiga agora coerente com a aptidão ==");
  r = await GET(HAB, "elegibilidade-menores", secretaria, { membroId: 6013, equipeId: eq.bercario }); ok(r.status === 200 && r.body.elegivel === false && r.body.aptidao && codigos(r.body.aptidao.bloqueios).includes("ANTECEDENTES_VENCIDOS"), "não elegível, com a aptidão completa", r.body);
  r = await GET(HAB, "elegibilidade-menores", secretaria, { membroId: 6019, equipeId: eq.bercario }); ok(r.status === 200 && !r.body.elegivel && codigos(r.body.aptidao.bloqueios).join() === "PENDENCIA_DIRETORIA", "pendência com a Diretoria aparece mascarada", codigos(r.body.aptidao.bloqueios));
  r = await GET(HAB, "elegibilidade-menores", secretaria, { membroId: 6013, equipeId: eq.recepcao }); ok(r.status === 200 && r.body.elegivel === true, "para a equipe sem menores, qualquer um é elegível");

  fim("e2e-8-menores");
})().catch((e) => { console.error("ERRO:", e); process.exitCode = 1; try { L.shimEncerrar(); } catch { } });
