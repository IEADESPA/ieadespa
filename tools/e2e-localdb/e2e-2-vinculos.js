// e2e-2-vinculos.js — catálogo, candidatura, indicação, aprovação, Termo de Adesão (aceite digital, ficha), saída e dados do titular. Handlers REAIS, SQL Server real.
const fs = require("fs");
const L = require("./lib");
const { q, um, escalar, ok, fim, GET, POST, GERAL, LIDER, PIN, IP_PUBLICO, API, path } = L;
const H = require(path.join(API, "GestaoSetoresTecnicos/index.js"));
const LGPD = require(path.join(API, "MeusDadosLGPD/index.js"));
const db = require(path.join(API, "shared/setoresTecnicosDb.js"));
const st = require(path.join(API, "shared/setoresTecnicos.js"));
const cen = JSON.parse(fs.readFileSync(path.join(__dirname, "cenario.json"), "utf8"));
const S = cen.setores;
const TUDO = ["setores_tecnicos", "setores_ratificacao", "vistoria_antecedentes"];
const presidente = GERAL(1001, TUDO), secretario = GERAL(1002, TUDO), gestora = GERAL(1003, ["setores_tecnicos"]);
const dirCentral = LIDER(3001, ["reunioes", "pessoas"], ["Central E2E"]), dirVila = LIDER(3002, ["reunioes", "pessoas"], ["Vila Nova E2E"]);
const pastor = LIDER(3003, ["reunioes", "pessoas"], ["Central E2E", "Vila Nova E2E"], "AREA");
const notif = (regra, ref) => q("SELECT DestinatarioMembroId d FROM Notificacoes WHERE RegraChave = @r AND ReferenciaId = @i ORDER BY DestinatarioMembroId", { r: regra, i: ref }).then(l => l.map(x => x.d));
const vinculo = (membro, setor) => um("SELECT TOP 1 * FROM SetoresTecnicosMembros WHERE MembroId = @m AND SetorId = @s ORDER BY VinculoId DESC", { m: membro, s: setor });

(async () => {
  console.log("== papéis e catálogo ==");
  ok((await GET(H, "catalogos")).status === 401, "sem sessão: 401");
  let r = await GET(H, "catalogos", PIN(2001)); ok(r.status === 200 && !r.body.papeis.gestao && !r.body.papeis.diretoria && !r.body.papeis.lider, "membro por PIN: sem papel de gestão, diretoria nem líder", r.body && r.body.papeis);
  r = await GET(H, "catalogos", GERAL(1001, [...TUDO, "pessoas"])); ok(r.body.papeis.gestao && r.body.papeis.diretoria && r.body.papeis.lider, "o Presidente (geral, com as permissões e a de pessoas) é gestão, diretoria e líder geral");
  r = await GET(H, "catalogos", gestora); ok(r.body.papeis.gestao && !r.body.papeis.diretoria, "quem só tem setores_tecnicos é gestão, não diretoria");
  r = await GET(H, "catalogos", dirCentral); ok(!r.body.papeis.gestao && r.body.papeis.lider, "o dirigente é líder e não é gestão");
  // permissão no escopo ERRADO não vale: papel local com a permissão
  r = await GET(H, "catalogos", LIDER(3001, ["setores_tecnicos"], ["Central E2E"])); ok(!r.body.papeis.gestao, "setores_tecnicos com escopo de uma congregação NÃO é o nível geral");
  r = await GET(H, "setores", PIN(2001)); ok(r.status === 200 && r.body.setores.length === 20, "o catálogo tem 20 setores", r.body.setores && r.body.setores.length);
  const ativos = Object.fromEntries((await q("SELECT SetorId, COUNT(*) n FROM SetoresTecnicosMembros WHERE Status = 'ATIVO' GROUP BY SetorId")).map(x => [x.SetorId, x.n]));
  ok(r.body.setores.every(s => s.profissionais === (ativos[s.setorId] || 0) && s.instalado === (s.profissionais > 0) && s.situacao === (s.profissionais > 0 ? "INSTALADO" : "SEM_PROFISSIONAIS")), "o setor só está instalado se alguém serve nele (Art. 48 §2º)");
  ok(!JSON.stringify(r.body).match(/membroNome|Email|@exemplo/), "o catálogo nunca traz nome nem e-mail de ninguém");

  console.log("== administrar o catálogo ==");
  r = await POST(H, "setor", PIN(2001), { nome: "Setor de Fotografia E2E", competencia: "Registro fotográfico dos eventos." }); ok(r.status === 403, "PIN não cria setor", r.status);
  r = await POST(H, "setor", dirCentral, { nome: "Setor de Fotografia E2E", competencia: "Registro fotográfico dos eventos." }); ok(r.status === 403, "dirigente (sem permissão) não cria setor", r.status);
  r = await POST(H, "setor", gestora, { nome: "Setor de Fotografia E2E", competencia: "Registro fotográfico dos eventos." }); ok(r.status === 201 && r.body.setor.codigo === "SETOR_DE_FOTOGRAFIA_E2E", "a gestão cria setor; o código sai do nome", r.body);
  const fotoId = r.body.setor && r.body.setor.setorId;
  r = await POST(H, "setor", gestora, { nome: "Setor de Fotografia E2E", competencia: "Registro fotográfico dos eventos." }); ok(r.status === 422 && /Já existe/.test(r.body.mensagem), "nome repetido é recusado", r.body);
  r = await POST(H, "setor", gestora, { nome: "Setor <img src=x onerror=1>", competencia: "Registro fotográfico dos eventos." }); ok(r.status === 422, "nome com tag é recusado");
  r = await POST(H, "setor-editar", gestora, { setorId: fotoId, nome: "Setor de Fotografia E2E", competencia: "Registro fotográfico e audiovisual dos eventos.", podeSolicitarRemocao: true }); ok(r.status === 200 && r.body.setor.podeSolicitarRemocao === true, "a gestão edita as marcas do setor", r.body);
  r = await POST(H, "setor-editar", gestora, { setorId: "0x10", nome: "x" }); ok(r.status === 400, "setorId 0x10 é 400");
  r = await POST(H, "setor-editar", gestora, { setorId: 999999, nome: "Setor Qualquer", competencia: "Competência qualquer." }); ok(r.status === 422 && /não encontrado/i.test(r.body.mensagem), "editar setor inexistente: 422");
  r = await POST(H, "setor-ativo", gestora, { setorId: fotoId, ativo: "false" }); ok(r.status === 400, "ativo precisa ser booleano de verdade");
  r = await POST(H, "setor-ativo", gestora, { setorId: fotoId, ativo: false }); ok(r.status === 200 && r.body.setor.ativo === false, "a gestão desativa o setor");
  r = await GET(H, "setores", PIN(2001)); ok(r.body.setores.length === 20, "o setor desativado some do catálogo comum");
  r = await GET(H, "setores", gestora); ok(r.body.setores.length === 21, "e a gestão ainda o vê");
  r = await POST(H, "candidatar", PIN(2012), { setorId: fotoId, formacao: "Fotógrafo" }); ok(r.status === 422, "setor desativado não recebe candidatura", r.body);
  r = await POST(H, "setor-ativo", gestora, { setorId: fotoId, ativo: true }); ok(r.status === 200, "reativa");

  console.log("== candidatura ==");
  r = await POST(H, "candidatar", PIN(2005), { setorId: S.JURIDICO, formacao: "Advogada, OAB/PA" }); ok(r.status === 201 && r.body.vinculoId, "membro se candidata ao Jurídico (sem registro exigido)", r.body);
  const v2005 = r.body.vinculoId;
  r = await POST(H, "candidatar", PIN(2005), { setorId: S.JURIDICO, formacao: "Advogada" }); ok(r.status === 422 && /em andamento/.test(r.body.mensagem), "candidatura repetida: recusada", r.body);
  for (const [m, motivo] of [[2006, /18 anos/], [2007, /data de nascimento/], [2008, /plena comunhão/], [2009, /plena comunhão/]]) {
    r = await POST(H, "candidatar", PIN(m), { setorId: S.JURIDICO, formacao: "Qualquer" }); ok(r.status === 422 && motivo.test(r.body.mensagem), `candidatura de ${m}: ${motivo}`, r.body);
  }
  r = await POST(H, "candidatar", PIN(2001), { setorId: S.ENGENHARIA, formacao: "Engenheira civil" }); ok(r.status === 422 && /exige o registro/.test(r.body.mensagem), "Engenharia exige o registro no conselho", r.body);
  r = await POST(H, "candidatar", PIN(2001), { setorId: S.ENGENHARIA, formacao: "Engenheira civil, UFPA", conselhoSigla: "crea-pa", registroNumero: "12345" }); ok(r.status === 201, "com registro: candidatura aceita", r.body);
  const v2001 = r.body.vinculoId;
  ok((await vinculo(2001, S.ENGENHARIA)).RegistroNumero === "12345" && (await vinculo(2001, S.ENGENHARIA)).ConselhoSigla === "CREA-PA", "o registro foi guardado normalizado");
  for (const [rotulo, corpo] of [["setor 0x10", { setorId: "0x10", formacao: "Teste" }], ["setor true", { setorId: true, formacao: "Teste" }], ["setor lista", { setorId: [S.JURIDICO], formacao: "Teste" }], ["setor negativo", { setorId: -1, formacao: "Teste" }], ["setor ausente", { formacao: "Teste" }], ["formação com tag", { setorId: S.TI, formacao: "<img src=x onerror=alert(1)>" }], ["formação gigante", { setorId: S.TI, formacao: "x".repeat(5000) }], ["registro com tag", { setorId: S.TI, formacao: "Teste", conselhoSigla: "<b>", registroNumero: "1" }]]) {
    r = await POST(H, "candidatar", PIN(2012), corpo); ok(r.status === 422, `candidatura lixo (${rotulo}): 422`, r.status);
  }
  ok((await escalar("SELECT COUNT(*) FROM SetoresTecnicosMembros WHERE MembroId = 2012")) === 0, "nada foi gravado pelas candidaturas lixo");
  ok(JSON.stringify(await notif("SETOR_CANDIDATURA", v2005)) === JSON.stringify([1, 2, 1001, 1002, 1003]), "a candidatura avisou quem tem setores_tecnicos (os dois da semente, Presidente, Secretário Geral, gestora)", await notif("SETOR_CANDIDATURA", v2005));

  console.log("== o que a gestão vê ==");
  r = await GET(H, "vinculos", gestora); const meus2 = (r.body.vinculos || []).filter(v => [2001, 2005].includes(v.membroId));
  ok(r.status === 200 && meus2.length === 2 && meus2.every(v => v.status === "CANDIDATO"), "a gestão lista os vínculos (2 candidatos)", meus2.length);
  ok(meus2.every(v => v.termo === null && v.rotuloStatus), "sem Termo ainda");
  for (const t of [PIN(2005), dirCentral, pastor, LIDER(3001, ["setores_ratificacao"], ["Central E2E"])]) { r = await GET(H, "vinculos", t); ok(r.status === 403, "quem não é gestão geral recebe 403 na lista de vínculos", r.status); }
  r = await GET(H, "vinculos", gestora, { status: "XXX" }); ok(r.status === 400, "status inválido: 400");
  r = await GET(H, "vinculos", gestora, { setorId: "0x10" }); ok(r.status === 400, "setorId 0x10: 400");
  r = await GET(H, "vinculos", gestora, { setorId: S.ENGENHARIA, status: "CANDIDATO" }); ok(r.status === 200 && r.body.vinculos.length === 1, "filtro por setor e situação");

  console.log("== aprovar, recusar, indicar ==");
  r = await POST(H, "aprovar", PIN(2005), { vinculoId: v2005 }); ok(r.status === 403, "o candidato não se aprova (sem permissão)");
  // Gestora se candidata e tenta aprovar a própria
  r = await POST(H, "candidatar", gestora, { setorId: S.CONTABILIDADE, formacao: "Contadora", conselhoSigla: "CRC", registroNumero: "9" }); ok(r.status === 201, "a gestora se candidata");
  const vG = r.body.vinculoId;
  r = await POST(H, "aprovar", gestora, { vinculoId: vG }); ok(r.status === 403 && /própria candidatura/.test(r.body.mensagem), "ninguém aprova a própria candidatura", r.body);
  r = await POST(H, "recusar", gestora, { vinculoId: vG }); ok(r.status === 403, "nem recusa a própria");
  r = await POST(H, "aprovar", presidente, { vinculoId: vG }); ok(r.status === 200, "outra pessoa da administração aprova");
  r = await POST(H, "aprovar", presidente, { vinculoId: vG }); ok(r.status === 422 && /já foi decidida/.test(r.body.mensagem), "aprovar duas vezes: 422");
  r = await POST(H, "aprovar", gestora, { vinculoId: "abc" }); ok(r.status === 400, "vinculoId abc: 400");
  r = await POST(H, "aprovar", gestora, { vinculoId: 999999 }); ok(r.status === 422, "vínculo que não existe: 422");
  r = await POST(H, "aprovar", gestora, { vinculoId: v2005 }); ok(r.status === 200 && /aprovada/.test(r.body.mensagem), "a gestão aprova a candidatura de 2005");
  ok((await vinculo(2005, S.JURIDICO)).Status === "AGUARDANDO_TERMO", "o vínculo passou a aguardar o Termo");
  ok(JSON.stringify(await notif("SETOR_INDICADO", v2005)) === JSON.stringify([2005]), "a aprovação avisou a candidata para aceitar o Termo");
  r = await POST(H, "candidatar", PIN(2010), { setorId: S.MUSICA_SOM, formacao: "Músico" }); const vGil = r.body.vinculoId;
  r = await POST(H, "recusar", gestora, { vinculoId: vGil, observacao: "No momento não há vaga." }); ok(r.status === 200, "a gestão recusa uma candidatura");
  r = await vinculo(2010, S.MUSICA_SOM); ok(r.Status === "ENCERRADO" && r.MotivoEncerramento === "RECUSADO", "ficou ENCERRADO por RECUSADO");
  r = await POST(H, "recusar", gestora, { vinculoId: vGil }); ok(r.status === 422, "recusar de novo: 422");
  r = await POST(H, "candidatar", PIN(2010), { setorId: S.MUSICA_SOM, formacao: "Músico" }); ok(r.status === 201, "depois de recusado, a pessoa pode se candidatar de novo (vínculo novo)");
  r = await POST(H, "indicar", PIN(2012), { membroId: 2004, setorId: S.JURIDICO, formacao: "Advogado" }); ok(r.status === 403, "PIN não indica");
  r = await POST(H, "indicar", gestora, { membroId: 2004, setorId: S.JURIDICO, formacao: "Advogado, OAB/PA" }); ok(r.status === 201, "a gestão indica 2004 ao Jurídico", r.body);
  const v2004 = r.body.vinculoId;
  ok((await vinculo(2004, S.JURIDICO)).Status === "AGUARDANDO_TERMO", "a indicação já espera o Termo");
  ok(JSON.stringify(await notif("SETOR_INDICADO", v2004)) === JSON.stringify([2004]), "o indicado foi avisado");
  r = await POST(H, "indicar", gestora, { membroId: 1003, setorId: S.JURIDICO, formacao: "Advogada" }); ok(r.status === 422 && /se indicar/.test(r.body.mensagem), "ninguém se indica", r.body);
  r = await POST(H, "indicar", gestora, { membroId: 2006, setorId: S.JURIDICO, formacao: "Menor" }); ok(r.status === 422 && /18 anos/.test(r.body.mensagem), "menor não é indicado");
  r = await POST(H, "indicar", gestora, { membroId: 2004, setorId: S.JURIDICO, formacao: "Advogado" }); ok(r.status === 422 && /já tem um vínculo/.test(r.body.mensagem), "indicar quem já tem vínculo: 422");
  r = await POST(H, "indicar", gestora, { membroId: 99999, setorId: S.JURIDICO, formacao: "Fantasma" }); ok(r.status === 422, "pessoa que não existe: 422");
  for (const corpo of [{ membroId: "0x7", setorId: S.TI, formacao: "x" }, { membroId: [2012], setorId: S.TI, formacao: "xxx" }, { membroId: 2012, setorId: "1e1", formacao: "xxx" }]) { r = await POST(H, "indicar", gestora, corpo); ok(r.status === 422, "indicação lixo: 422", r.status); }

  console.log("== o Termo ==");
  r = await GET(H, "meu-painel", PIN(2005)); const meu = r.body.vinculos.find(v => v.vinculoId === v2005);
  ok(r.status === 200 && meu.status === "AGUARDANDO_TERMO" && meu.termoParaAceitar && /^[0-9a-f]{64}$/.test(meu.termoParaAceitar.hash), "o painel traz o Termo para aceitar, com o hash");
  ok(meu.termoParaAceitar.itens.some(i => i.codigo === "LIMITES_JURIDICOS") && meu.termoParaAceitar.especificos.join() === "LIMITES_JURIDICOS", "o Termo do Jurídico traz os limites do Art. 51");
  ok(r.body.condicao.pode === true && r.body.setoresParaCandidatura.length > 0 && !r.body.setoresParaCandidatura.some(s => s.setorId === S.JURIDICO), "o painel diz o que posso e que o Jurídico já não está entre as candidaturas possíveis");
  ok(JSON.stringify(r.body).indexOf("177.8.9.10") < 0, "o painel nunca mostra IP");
  r = await GET(H, "termo", PIN(2005), { vinculoId: v2005 }); ok(r.status === 200 && r.body.termo.titulo === st.TERMO_SETOR_TITULO, "o dono lê o Termo do vínculo");
  r = await GET(H, "termo", PIN(2012), { vinculoId: v2005 }); const naoDono = r.body.mensagem;
  r = await GET(H, "termo", PIN(2012), { vinculoId: 999999 }); ok(r.status === 404 && r.body.mensagem === naoDono, "o Termo de outra pessoa responde igual a 'não existe'");
  r = await GET(H, "termo", gestora, { vinculoId: v2005 }); ok(r.status === 200, "a gestão lê o Termo de qualquer vínculo");
  r = await GET(H, "termo", PIN(2005), {}); ok(r.status === 400, "termo sem vinculoId: 400");

  r = await POST(H, "aceitar-termo", PIN(2012), { vinculoId: v2005, aceito: true }, IP_PUBLICO); ok(r.status === 422 && r.body.mensagem === "Vínculo não encontrado.", "ninguém aceita o Termo de outra pessoa", r.body);
  r = await POST(H, "aceitar-termo", PIN(2005), { vinculoId: v2005 }, IP_PUBLICO); ok(r.status === 422, "sem marcar a caixa: 422");
  r = await POST(H, "aceitar-termo", PIN(2005), { vinculoId: v2005, aceito: "true" }, IP_PUBLICO); ok(r.status === 422, "aceito como TEXTO não vale");
  r = await POST(H, "aceitar-termo", PIN(2005), { vinculoId: v2005, aceito: 1 }, IP_PUBLICO); ok(r.status === 422, "aceito=1 não vale");
  r = await POST(H, "aceitar-termo", PIN(2005), { vinculoId: v2005, aceito: true }, {}); ok(r.status === 422 && /origem da conexão/.test(r.body.mensagem), "sem IP identificável, o aceite é recusado");
  r = await POST(H, "aceitar-termo", PIN(2005), { vinculoId: v2005, aceito: true }, { "x-forwarded-for": "192.168.0.7, 10.0.0.1:80" }); ok(r.status === 422, "IP privado não prova a origem");
  ok((await escalar("SELECT COUNT(*) FROM SetoresTecnicosAdesoes WHERE MembroId = 2005")) === 0 && (await vinculo(2005, S.JURIDICO)).Status === "AGUARDANDO_TERMO", "as recusas não gravaram nada");
  r = await POST(H, "aceitar-termo", PIN(2005), { vinculoId: v2005, aceito: true }, IP_PUBLICO); ok(r.status === 201 && r.body.vinculo.status === "ATIVO", "o aceite digital ativa o vínculo", r.body);
  const ad = await um("SELECT * FROM SetoresTecnicosAdesoes WHERE VinculoId = @v", { v: v2005 });
  const termoJur = st.termoDoSetor({ codigo: "JURIDICO", nome: "Setor Jurídico", podeInterditar: false, podeSolicitarRemocao: false });
  ok(ad.Forma === "CLICKWRAP" && ad.TermoHash === termoJur.hash && ad.TermoVersao === 1 && ad.TermoEspecificos === "LIMITES_JURIDICOS", "a prova guarda forma, versão, hash e as cláusulas próprias", ad);
  ok(ad.EnderecoIp === "177.8.9.10" && ad.AceitoEm && /9\.9\.9\.9/.test(ad.CadeiaCabecalhos), "a prova guarda o IP (o penúltimo do x-forwarded-for) e a cadeia dos cabeçalhos", [ad.EnderecoIp, ad.CadeiaCabecalhos]);
  ok(r.body.vinculo.termo.integridade.status === "OK" && !JSON.stringify(r.body).includes("177.8.9.10"), "o vínculo mostra a integridade do texto mas nunca o IP");
  const aud = await q("SELECT DadosDepois FROM AuditLog WHERE Acao = 'SETOR_ADESAO_REGISTRADA'");
  ok(aud.length === 1 && !JSON.stringify(aud).includes("177.8.9.10") && JSON.stringify(aud).includes(termoJur.hash), "a auditoria leva o hash e não leva o IP");
  r = await POST(H, "aceitar-termo", PIN(2005), { vinculoId: v2005, aceito: true }, IP_PUBLICO); ok(r.status === 422 && /já aceitou/.test(r.body.mensagem), "aceitar de novo: 422");
  r = await POST(H, "aceitar-termo", PIN(2001), { vinculoId: v2001, aceito: true }, IP_PUBLICO); ok(r.status === 422 && /ainda não foi aprovada/.test(r.body.mensagem), "candidatura ainda não aprovada não aceita Termo", r.body);

  console.log("== o Termo por ficha ou mensagem (registrado pela gestão) ==");
  const base = { vinculoId: v2004, forma: "FICHA_FISICA", dataAceite: L.hojeBr(), referencia: "Pasta 3, ficha 12" };
  r = await POST(H, "registrar-termo", PIN(2004), base); ok(r.status === 403, "o próprio não registra a ficha por si");
  r = await POST(H, "registrar-termo", gestora, { ...base, forma: "CLICKWRAP" }); ok(r.status === 422, "clickwrap não é registrado pela gestão");
  r = await POST(H, "registrar-termo", gestora, { ...base, dataAceite: "2999-01-01" }); ok(r.status === 422, "data no futuro: 422");
  r = await POST(H, "registrar-termo", gestora, { ...base, referencia: "" }); ok(r.status === 422, "sem referência: 422");
  r = await POST(H, "registrar-termo", gestora, { ...base, forma: "MENSAGERIA" }); ok(r.status === 422, "mensagem sem canal: 422");
  r = await POST(H, "registrar-termo", gestora, { ...base, vinculoId: v2001 }); ok(r.status === 422 && /Aprove a candidatura/.test(r.body.mensagem), "candidatura não aprovada não recebe ficha", r.body);
  r = await POST(H, "registrar-termo", gestora, base); ok(r.status === 201 && r.body.vinculo.status === "ATIVO" && r.body.vinculo.termo.forma === "FICHA_FISICA", "a ficha ativa o vínculo", r.body);
  const ad2 = await um("SELECT * FROM SetoresTecnicosAdesoes WHERE VinculoId = @v", { v: v2004 });
  ok(ad2.TermoHash === null && ad2.EnderecoIp === null && ad2.RegistradoPorMembroId === 1003 && ad2.Referencia === "Pasta 3, ficha 12", "a ficha não guarda texto nem IP; guarda quem registrou e onde está o papel", ad2);
  r = await POST(H, "registrar-termo", gestora, base); ok(r.status === 422 && /já tem o Termo/.test(r.body.mensagem), "registrar duas vezes: 422");

  console.log("== sair e encerrar ==");
  r = await POST(H, "sair", PIN(2012), { vinculoId: v2004 }); ok(r.status === 422 && r.body.mensagem === "Vínculo não encontrado.", "ninguém sai pelo vínculo de outra pessoa");
  r = await POST(H, "encerrar", gestora, { vinculoId: v2004, tipoMotivo: "DESLIGAMENTO" }); ok(r.status === 422, "desligamento sem motivo: 422");
  r = await POST(H, "encerrar", PIN(2004), { vinculoId: v2004, tipoMotivo: "OUTRO", observacao: "x" }); ok(r.status === 403, "PIN não encerra vínculo alheio");
  r = await POST(H, "encerrar", gestora, { vinculoId: v2004, tipoMotivo: "DESLIGAMENTO", observacao: "Mudou de área profissional." }); ok(r.status === 200, "a gestão desliga", r.body);
  r = await vinculo(2004, S.JURIDICO); ok(r.Status === "ENCERRADO" && r.MotivoEncerramento === "DESLIGAMENTO" && r.EncerradoPorMembroId === 1003, "ficou ENCERRADO, com quem e por quê");
  r = await POST(H, "encerrar", gestora, { vinculoId: v2004, tipoMotivo: "OUTRO" }); ok(r.status === 422, "encerrar o já encerrado: 422");
  r = await GET(H, "meu-painel", PIN(2004)); const enc2004 = r.body.vinculos.find(v => v.vinculoId === v2004);
  ok(enc2004.status === "ENCERRADO" && enc2004.obsEncerramento === null && !JSON.stringify(r.body).includes("Mudou de área profissional"), "a pessoa vê que o vínculo foi encerrado e por qual tipo de motivo, mas NÃO o texto que a administração escreveu", enc2004);
  r = await GET(H, "vinculos", gestora, { setorId: S.JURIDICO, status: "ENCERRADO" }); ok(r.body.vinculos.some(v => v.vinculoId === v2004 && v.obsEncerramento === "Mudou de área profissional."), "a administração continua lendo o texto");
  r = await POST(H, "aceitar-termo", PIN(2004), { vinculoId: v2004, aceito: true }, IP_PUBLICO); ok(r.status === 422 && /encerrado/.test(r.body.mensagem), "vínculo encerrado não aceita Termo");
  r = await POST(H, "sair", PIN(2005), { vinculoId: v2005 }); ok(r.status === 200 && /direito seu/.test(r.body.mensagem), "a pessoa sai quando quiser");
  r = await vinculo(2005, S.JURIDICO); ok(r.Status === "ENCERRADO" && r.MotivoEncerramento === "SAIDA_PROPRIA", "SAIDA_PROPRIA");
  r = await POST(H, "sair", PIN(2005), { vinculoId: v2005 }); ok(r.status === 422, "sair de novo: 422");
  // limites: 3 candidaturas por dia (anti-spam) e 5 vínculos vigentes por pessoa; a indicação da administração não passa pelo teto diário
  for (const s of [S.TI, S.EDUCACAO, S.TRANSPORTE]) { r = await POST(H, "candidatar", PIN(2012), { setorId: s, formacao: "Voluntário" }); ok(r.status === 201, `2012 se candidata (${s})`, r.body); }
  r = await POST(H, "candidatar", PIN(2012), { setorId: S.GASTRONOMIA, formacao: "Voluntário" }); ok(r.status === 422 && /3 candidaturas hoje/.test(r.body.mensagem), "a quarta candidatura do dia é recusada", r.body);
  for (const s of [S.GASTRONOMIA, S.BELEZA]) { r = await POST(H, "indicar", gestora, { membroId: 2012, setorId: s, formacao: "Voluntário" }); ok(r.status === 201, `2012 é indicado (${s})`, r.body); }
  r = await POST(H, "indicar", gestora, { membroId: 2012, setorId: S.CULTURA_ARTES, formacao: "Voluntário" }); ok(r.status === 422 && /5 vínculos/.test(r.body.mensagem), "o sexto vínculo vigente é recusado (indicação)", r.body);
  r = await POST(H, "candidatar", PIN(2012), { setorId: S.CULTURA_ARTES, formacao: "Voluntário" }); ok(r.status === 422 && /5 vínculos/.test(r.body.mensagem), "o sexto vínculo vigente é recusado (candidatura)", r.body);

  console.log("== retenção do IP (LGPD art. 16) ==");
  // O vínculo de 2005 (clickwrap) está encerrado agora. Empurra o fim para 6 anos atrás e roda a rotina.
  await q("UPDATE SetoresTecnicosMembros SET EncerradoEm = DATEADD(YEAR, -6, SYSUTCDATETIME()) WHERE VinculoId = @v", { v: v2005 });
  let an = await db.anonimizarIpsVencidos(L.sql && (await L.obterPool()));
  ok(an.anonimizados === 1 && an.retencaoDias === 1825, "a rotina anonimiza o IP de quem saiu há mais de 5 anos", an);
  const ad3 = await um("SELECT EnderecoIp, CadeiaCabecalhos, TermoHash FROM SetoresTecnicosAdesoes WHERE VinculoId = @v", { v: v2005 });
  ok(ad3.EnderecoIp === "anonimizado" && ad3.CadeiaCabecalhos === null && ad3.TermoHash === termoJur.hash, "o IP e a cadeia somem; o hash e o resto da prova ficam");
  an = await db.anonimizarIpsVencidos(await L.obterPool()); ok(an.anonimizados === 0, "rodar de novo não faz nada");
  ok((await escalar("SELECT COUNT(*) FROM AuditLog WHERE Acao = 'IP_ANONIMIZADO' AND Tabela = 'SetoresTecnicosAdesoes'")) === 1, "o lote ficou na auditoria, sem dado pessoal");

  console.log("== o direito de acesso do titular ==");
  const ctx = { bindingData: { matricula: "2005" }, log: { error() { }, info() { }, warn() { }, verbose() { } } };
  await LGPD(ctx, { method: "GET", query: {}, headers: { "x-auth-token": PIN(2005) } });
  ok(ctx.res.status === 200 && ctx.res.body.setoresTecnicos.vinculos.length === 1, "Meus Dados traz os vínculos de Setores Técnicos", ctx.res.status);
  const v = ctx.res.body.setoresTecnicos.vinculos[0];
  ok(v.setor === "Setor Jurídico" && v.termo.forma && v.termo.hash === termoJur.hash && v.termo.enderecoIp === "anonimizado", "com o Termo (e o IP, já anonimizado)", v);
  ok(!JSON.stringify(ctx.res.body.setoresTecnicos).includes("Mudou de área"), "as observações escritas por outros ficam de fora");
  ok(ctx.res.body.vistoriasAntecedentes && Array.isArray(ctx.res.body.vistoriasAntecedentes.vistorias), "e o bloco das vistorias (vazio) existe");
  fim("e2e-2-vinculos");
})().catch((e) => { console.error("ERRO:", e); process.exitCode = 1; try { L.shimEncerrar(); } catch { } });
