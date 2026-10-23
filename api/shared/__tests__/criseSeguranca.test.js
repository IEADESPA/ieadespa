// v7.15 — a regra pura da crise e da segurança da congregação (shared/criseSeguranca.js): o porta-voz, a abertura e o encerramento, as manifestações, os pedidos da imprensa,
// o texto do aviso da crise, o plano, o simulado, a vistoria, a equipe e a avaliação de cada congregação (plano, simulado, vistoria, AVCB e seguro). O banco está nos roteiros
// tools/e2e-localdb/e2e-33 e e2e-34.
const cs = require("../criseSeguranca");
const cm = require("../comunicacao");

const PRESIDENTE = { membroId: 1001, nome: "Pr. Presidente" };
const HOJE = "2026-10-23";

describe("o porta-voz único (Art. 161-B § 1º)", () => {
  test("o Presidente: nome e matrícula do cadastro dele; o contato para a imprensa é obrigatório", () => {
    const r = cs.validarPortaVoz({ tipo: "PRESIDENTE", contato: "(91) 3333-4444", nome: "Outro Nome", membroId: 77 }, { presidente: PRESIDENTE });
    expect(r.portaVoz).toEqual({ tipo: "PRESIDENTE", membroId: 1001, nome: "Pr. Presidente", contato: "(91) 3333-4444", ato: null });
    expect(cs.validarPortaVoz({ tipo: "PRESIDENTE" }, { presidente: PRESIDENTE }).problema).toMatch(/contato/);
    expect(cs.validarPortaVoz({ tipo: "PRESIDENTE", contato: "(91) 3333-4444" }, { presidente: null }).problema).toMatch(/Presidente ativo/);
  });
  test("o profissional designado precisa do ato formal da designação; a matrícula é opcional", () => {
    const ok = cs.validarPortaVoz({ tipo: "DESIGNADO", nome: "Joana Assessora", contato: "imprensa@ieadespa.org.br", ato: "Ato da Presidência nº 12/2026" }, { presidente: PRESIDENTE });
    expect(ok.portaVoz).toMatchObject({ tipo: "DESIGNADO", membroId: null, nome: "Joana Assessora", ato: "Ato da Presidência nº 12/2026" });
    expect(cs.validarPortaVoz({ tipo: "DESIGNADO", nome: "Joana Assessora", contato: "imprensa@ieadespa.org.br" }).problema).toMatch(/ato da designação/);
    expect(cs.validarPortaVoz({ tipo: "DESIGNADO", nome: "Joana", contato: "imprensa@x.org", ato: "Ato 1/2026", membroId: "12" }).problema).toMatch(/Matrícula/);
    expect(cs.validarPortaVoz({ tipo: "DESIGNADO", nome: "Joana", contato: "imprensa@x.org", ato: "Ato 1/2026", membroId: 12 }).portaVoz.membroId).toBe(12);
  });
  test("tipo desconhecido, \"constructor\", lixo e {{ }} (o texto entra no aviso, onde {{...}} é campo a preencher) são recusados", () => {
    for (const tipo of [undefined, "constructor", "toString", "presidente", 1, null]) expect(cs.validarPortaVoz({ tipo, contato: "(91) 3333-4444" }, { presidente: PRESIDENTE }).problema).toBeTruthy();
    expect(cs.validarPortaVoz({ tipo: "DESIGNADO", nome: "{{primeiro_nome}}", contato: "imprensa@x.org", ato: "Ato 1/2026" }).problema).toMatch(/\{\{/);
    expect(cs.validarPortaVoz({ tipo: "DESIGNADO", nome: "Joana\nSegunda linha", contato: "imprensa@x.org", ato: "Ato 1/2026" }).problema).toMatch(/uma linha/);
    expect(cs.validarPortaVoz({ tipo: "DESIGNADO", nome: "Jo​ana", contato: "imprensa@x.org", ato: "Ato 1/2026" }).problema).toMatch(/invisível/);
    expect(cs.validarPortaVoz(null).problema).toBeTruthy();
    expect(cs.validarPortaVoz([]).problema).toBeTruthy();
  });
  test("abertura: motivo de 5 a 300; encerramento: resumo de 5 a 500, sem {{ }}", () => {
    expect(cs.validarAbertura({ motivo: "Acidente", portaVoz: { tipo: "PRESIDENTE", contato: "(91) 3333-4444" } }, { presidente: PRESIDENTE }).dados.motivo).toBe("Acidente");
    expect(cs.validarAbertura({ motivo: "x", portaVoz: { tipo: "PRESIDENTE", contato: "(91) 3333-4444" } }, { presidente: PRESIDENTE }).problema).toMatch(/motivo/);
    expect(cs.validarAbertura({ motivo: "y".repeat(301), portaVoz: { tipo: "PRESIDENTE", contato: "(91) 3333-4444" } }, { presidente: PRESIDENTE }).problema).toMatch(/300/);
    expect(cs.validarEncerramento({ resumo: "Assunto superado." }).dados.resumo).toBe("Assunto superado.");
    expect(cs.validarEncerramento({ resumo: "Olá {{primeiro_nome}}" }).problema).toMatch(/\{\{/);
    expect(cs.validarEncerramento({}).problema).toBeTruthy();
  });
});

describe("o aviso da crise", () => {
  const pv = { tipo: "DESIGNADO", nome: "Joana Assessora", contato: "imprensa@ieadespa.org.br", ato: "Ato nº 12/2026" };
  test("abertura: diz quem fala, o contato, a vedação do § 2º e onde registrar o pedido da imprensa", () => {
    const t = cs.textoAviso({ evento: "ABERTA", portaVoz: pv, desde: HOJE });
    expect(t.titulo).toMatch(/porta-voz único/);
    expect(t.corpo).toMatch(/Joana Assessora/);
    expect(t.corpo).toMatch(/imprensa@ieadespa\.org\.br/);
    expect(t.corpo).toMatch(/161-B, § 2º/);
    expect(t.corpo).toMatch(/Crise e segurança → Imprensa/);
    expect(t.corpo).toMatch(/^Paz do Senhor, \{\{primeiro_nome\}\}\./);
  });
  test("cabe no modelo da comunicação (título 150, texto 2.000) mesmo com tudo no máximo, e o validador do modelo aceitaria os campos", () => {
    const grande = { tipo: "DESIGNADO", nome: "n".repeat(cs.MAX.nome), contato: "c".repeat(cs.MAX.contato), ato: "a".repeat(cs.MAX.ato) };
    for (const evento of ["ABERTA", "PORTA_VOZ", "ENCERRADA"]) {
      const t = cs.textoAviso({ evento, portaVoz: grande, desde: HOJE, resumo: "r".repeat(cs.MAX.resumoEncerramento) });
      expect(t.titulo.length).toBeLessThanOrEqual(150);
      expect(t.corpo.length).toBeLessThanOrEqual(2000);
      expect(cm.preencher(t.corpo, { nome: "Ana Souza" })).toMatch(/^Paz do Senhor, Ana\./);
    }
  });
  test("troca de porta-voz e encerramento têm textos próprios; o do fim diz que a vedação deixa de valer", () => {
    expect(cs.textoAviso({ evento: "PORTA_VOZ", portaVoz: pv, desde: HOJE }).corpo).toMatch(/PORTA-VOZ ÚNICO mudou/);
    const fim = cs.textoAviso({ evento: "ENCERRADA", portaVoz: pv, desde: "2026-10-01", resumo: "A investigação foi concluída." });
    expect(fim.titulo).toBe("Fim do regime de crise");
    expect(fim.corpo).toMatch(/01\/10\/2026/);
    expect(fim.corpo).toMatch(/deixa de valer/);
    expect(fim.corpo).toMatch(/investigação foi concluída/);
  });
  test("revisão independente: o texto do CELULAR é curto e começa pelo essencial — quem fala e o contato (nunca cortado no meio)", () => {
    const pv = { tipo: "DESIGNADO", nome: "Joana Assessora", contato: "imprensa@ieadespa.org.br" };
    const a = cs.textoCelular({ evento: "ABERTA", portaVoz: pv });
    expect(a.titulo).toBe("Crise: só Joana Assessora fala pela Igreja");
    expect(a.mensagem).toMatch(/^Imprensa: encaminhe para imprensa@ieadespa\.org\.br\. Não comente/);
    expect(cs.textoCelular({ evento: "PORTA_VOZ", portaVoz: pv }).titulo).toBe("Crise: novo porta-voz — Joana Assessora");
    expect(cs.textoCelular({ evento: "ENCERRADA" }).titulo).toBe("Fim do regime de crise");
    const grande = { nome: "n".repeat(150), contato: "c".repeat(150) };
    for (const evento of ["ABERTA", "PORTA_VOZ", "ENCERRADA"]) {
      const t = cs.textoCelular({ evento, portaVoz: grande });
      expect(t.titulo.length).toBeLessThanOrEqual(120);
      expect(t.mensagem.length).toBeLessThanOrEqual(180);
    }
    expect(cs.textoCelular({ evento: "ABERTA", portaVoz: grande }).mensagem).toMatch(/Não comente/);
  });
  test("o Presidente como porta-voz aparece pelo cargo", () => {
    expect(cs.textoAviso({ evento: "ABERTA", portaVoz: { tipo: "PRESIDENTE", nome: "Pr. Fulano", contato: "(91) 3333-4444" }, desde: HOJE }).corpo).toMatch(/o Pastor Presidente, Pr\. Fulano/);
  });
  test("a categoria CRISE da comunicação: obrigatória, do sistema (fora da tela de modelos), com rodapé próprio e sem link de saída", () => {
    expect(cm.CATEGORIAS.CRISE).toMatchObject({ obrigatoria: true, sistema: true });
    expect(cm.ehCategoria("CRISE")).toBe(true);
    expect(cm.ehCategoriaDaTela("CRISE")).toBe(false);
    expect(cm.ehCategoriaDaTela("CONVOCACAO")).toBe(true);
    expect(cm.CATEGORIAS_DO_SISTEMA).toEqual(["CRISE"]);
    expect(cm.CATEGORIAS_DE_PROVA.sort()).toEqual(["CONVOCACAO", "CRISE"]);
    expect(cm.SITUACOES.ALCANCADO).toMatch(/já alcançado/);   // revisão independente: o e-mail do aviso não sai para quem já foi alcançado
    expect(cm.validarModelo({ categoria: "CRISE", titulo: "Crise aberta", corpo: "Texto do aviso da crise." }).problema).toMatch(/categoria/);
    expect(cm.textoConsentimento("CRISE")).toBeNull();
    const email = cm.montarEmail({ titulo: "Regime de crise", corpo: "Texto", categoria: "CRISE", linkSair: "https://x/sair" });
    expect(email.texto).toMatch(/liderança da Igreja/);
    expect(email.texto).not.toMatch(/sair|convocação/);
    expect(email.html).not.toMatch(/href=/);
  });
});

describe("as manifestações autorizadas", () => {
  const AGORA = new Date("2026-10-23T18:00:00Z");      // 15h em Brasília
  const base = { dataHora: "2026-10-23T14:30", canal: "NOTA", quemFalou: "Joana Assessora", resumo: "Nota oficial sobre o acidente.", autorizadoPor: "Pr. Presidente" };
  test("válida: a data e a hora de Brasília viram o instante certo", () => {
    const r = cs.validarManifestacao(base, { agora: AGORA });
    expect(r.dados.dataHora.toISOString()).toBe("2026-10-23T17:30:00.000Z");
    expect(r.dados).toMatchObject({ canal: "NOTA", link: null, documento: null, corrigeManifestacaoId: null });
  });
  test("no futuro, antes da crise, canal desconhecido e data impossível: recusadas", () => {
    expect(cs.validarManifestacao({ ...base, dataHora: "2026-10-23T16:00" }, { agora: AGORA }).problema).toMatch(/futuro/);
    expect(cs.validarManifestacao(base, { agora: AGORA, abertaEm: "2026-10-25T00:00:00Z" }).problema).toMatch(/antes da crise/);
    for (const canal of ["TV", "constructor", "", null]) expect(cs.validarManifestacao({ ...base, canal }, { agora: AGORA }).problema).toMatch(/canal/);
    for (const dataHora of ["2026-02-30T10:00", "2026-10-23T25:00", "2026-10-23 14:30", "2026-10-23", "", null, 5]) expect(cs.validarManifestacao({ ...base, dataHora }, { agora: AGORA }).problema).toMatch(/data e a hora/);
  });
  test("o link é só http(s), sem espaço, sem usuário e senha", () => {
    expect(cs.validarManifestacao({ ...base, link: "https://g1.globo.com/pa/nota" }, { agora: AGORA }).dados.link).toBe("https://g1.globo.com/pa/nota");
    for (const link of ["javascript:alert(1)", "https://a b.com", "ftp://x.com", "https://user:senha@x.com", "https://localhost", "data:text/html,x", "x".repeat(501)]) {
      expect(cs.validarManifestacao({ ...base, link }, { agora: AGORA }).problema).toBeTruthy();
    }
  });
  test("a correção aponta uma manifestação (identificador inteiro)", () => {
    expect(cs.validarManifestacao({ ...base, corrigeManifestacaoId: 7 }, { agora: AGORA }).dados.corrigeManifestacaoId).toBe(7);
    expect(cs.validarManifestacao({ ...base, corrigeManifestacaoId: "7" }, { agora: AGORA }).problema).toBeTruthy();
  });
});

describe("os pedidos da imprensa", () => {
  const AGORA = new Date("2026-10-23T18:00:00Z");
  test("válido, com e sem prazo; o prazo vai de 7 dias atrás a 1 ano à frente", () => {
    const ok = cs.validarDemanda({ veiculo: "Rádio Clube", contato: "(91) 98888-7777", pedido: "Quer uma entrevista sobre o acidente." }, { agora: AGORA });
    expect(ok.dados.prazo).toBeNull();
    expect(cs.validarDemanda({ veiculo: "Rádio Clube", contato: "(91) 98888-7777", pedido: "Entrevista hoje.", prazo: "2026-10-23T20:00" }, { agora: AGORA }).dados.prazo.toISOString()).toBe("2026-10-23T23:00:00.000Z");
    expect(cs.validarDemanda({ veiculo: "Rádio Clube", contato: "(91) 98888-7777", pedido: "Entrevista.", prazo: "2028-01-01T10:00" }, { agora: AGORA }).problema).toMatch(/prazo/);
    expect(cs.validarDemanda({ veiculo: "Rádio Clube", contato: "(91) 98888-7777", pedido: "Entrevista.", prazo: "2026-10-01T10:00" }, { agora: AGORA }).problema).toMatch(/prazo/);
  });
  test("sem veículo, sem contato ou sem o pedido: recusado", () => {
    expect(cs.validarDemanda({ contato: "(91) 98888-7777", pedido: "Entrevista." }).problema).toMatch(/veículo/);
    expect(cs.validarDemanda({ veiculo: "Rádio", pedido: "Entrevista." }).problema).toMatch(/contato/);
    expect(cs.validarDemanda({ veiculo: "Rádio", contato: "(91) 98888-7777" }).problema).toMatch(/pedido/);
  });
  test("a resposta: respondida ou recusada, com o texto; a correção substitui uma resposta", () => {
    expect(cs.validarResposta({ situacao: "RESPONDIDA", resposta: "Nota enviada ao jornalista." }).dados).toEqual({ situacao: "RESPONDIDA", resposta: "Nota enviada ao jornalista.", substituiRespostaId: null });
    expect(cs.validarResposta({ situacao: "RECUSADA", resposta: "x" }).problema).toMatch(/motivo da recusa/);
    expect(cs.validarResposta({ situacao: "RECEBIDA", resposta: "Nada a dizer." }).problema).toBeTruthy();
    expect(cs.validarResposta({ situacao: "RESPONDIDA", resposta: "Nota enviada.", substituiRespostaId: 3 }).dados.substituiRespostaId).toBe(3);
  });
});

describe("a segurança da congregação", () => {
  test("o plano: rotas, pontos, responsáveis e a versão que a tela leu", () => {
    const ok = cs.validarPlano({ rotasEvacuacao: "Porta principal e lateral esquerda.", pontosEncontro: "Praça em frente.", responsaveis: "Diác. João", versaoAtual: 0 });
    expect(ok.dados).toMatchObject({ contatosLocais: null, versaoAtual: 0 });
    expect(cs.validarPlano({ rotasEvacuacao: "Porta principal e lateral esquerda.", pontosEncontro: "Praça em frente.", responsaveis: "Diác. João" }).problema).toMatch(/Recarregue/);
    expect(cs.validarPlano({ rotasEvacuacao: "curto", pontosEncontro: "Praça em frente.", responsaveis: "Diác. João", versaoAtual: 0 }).problema).toMatch(/rotas/);
  });
  test("o simulado: data (não futura, até 5 anos), tipo, participantes e duração inteiros", () => {
    const base = { data: "2026-10-20", tipo: "EVACUACAO", participantes: 120, duracaoMinutos: 15 };
    expect(cs.validarSimulado(base, { hoje: HOJE }).dados).toMatchObject({ correuBem: null, melhorar: null });
    expect(cs.validarSimulado({ ...base, data: "2026-10-24" }, { hoje: HOJE }).problema).toMatch(/futuro/);
    expect(cs.validarSimulado({ ...base, data: "2020-01-01" }, { hoje: HOJE }).problema).toMatch(/5 anos/);
    for (const participantes of [0, -1, 1.5, "120", 100001, null]) expect(cs.validarSimulado({ ...base, participantes }, { hoje: HOJE }).problema).toMatch(/Participantes/);
    for (const duracaoMinutos of [0, 1441, "15"]) expect(cs.validarSimulado({ ...base, duracaoMinutos }, { hoje: HOJE }).problema).toMatch(/Duração/);
    expect(cs.validarSimulado({ ...base, tipo: "TERREMOTO" }, { hoje: HOJE }).problema).toMatch(/tipo/);
  });
  const todos = (resultado = "OK") => Object.keys(cs.ITENS_VISTORIA).map((item) => ({ item, resultado }));
  test("a vistoria: o checklist inteiro, cada item uma vez; o pendente leva o que falta", () => {
    expect(cs.validarVistoria({ data: HOJE, itens: todos() }, { hoje: HOJE }).dados.itens).toHaveLength(10);
    expect(cs.validarVistoria({ data: HOJE, itens: todos().slice(1) }, { hoje: HOJE }).problema).toMatch(/todos os itens/);
    const repetido = todos(); repetido[1] = { ...repetido[0] };
    expect(cs.validarVistoria({ data: HOJE, itens: repetido }, { hoje: HOJE }).problema).toMatch(/cada um uma vez/);
    const pend = todos(); pend[0] = { item: "EXTINTORES", resultado: "PENDENTE" };
    expect(cs.validarVistoria({ data: HOJE, itens: pend }, { hoje: HOJE }).problema).toMatch(/pendente em "Extintores"/);
    pend[0].pendencia = "Dois vencidos em 09/2026.";
    expect(cs.validarVistoria({ data: HOJE, itens: pend }, { hoje: HOJE }).dados.itens[0]).toEqual({ item: "EXTINTORES", resultado: "PENDENTE", pendencia: "Dois vencidos em 09/2026." });
    // a pendência escrita em item "em ordem" não entra (o banco também recusa)
    const okComTexto = todos(); okComTexto[0].pendencia = "nada";
    expect(cs.validarVistoria({ data: HOJE, itens: okComTexto }, { hoje: HOJE }).dados.itens[0].pendencia).toBeNull();
    expect(cs.validarVistoria({ data: "2026-10-24", itens: todos() }, { hoje: HOJE }).problema).toMatch(/futuro/);
    const estranho = todos(); estranho[0] = { item: "constructor", resultado: "OK" };
    expect(cs.validarVistoria({ data: HOJE, itens: estranho }, { hoje: HOJE }).problema).toBeTruthy();
  });
  test("a equipe: pessoa, função, desde (até 60 dias à frente) e até (não antes do início nem já passado)", () => {
    const base = { membroId: 8010, funcao: "BRIGADA", desde: "2026-01-01" };
    expect(cs.validarEquipe(base, { hoje: HOJE }).dados).toEqual({ ...base, ate: null });
    expect(cs.validarEquipe({ ...base, desde: "2027-01-01" }, { hoje: HOJE }).problema).toMatch(/60 dias/);
    expect(cs.validarEquipe({ ...base, ate: "2025-12-31" }, { hoje: HOJE }).problema).toMatch(/antes do início/);
    expect(cs.validarEquipe({ ...base, ate: "2026-10-01" }, { hoje: HOJE }).problema).toMatch(/já passou/);
    expect(cs.validarEquipe({ ...base, funcao: "SEGURANCA_ARMADA" }, { hoje: HOJE }).problema).toMatch(/função/);
    expect(cs.validarEquipe({ ...base, membroId: "8010" }, { hoje: HOJE }).problema).toMatch(/pessoa/);
  });
});

describe("a avaliação de cada congregação", () => {
  test("nada registrado: plano, simulado e vistoria aparecem como ausentes, cada um ligado ao aviso dele", () => {
    const a = cs.avaliarSeguranca({ hoje: HOJE });
    expect(a.alertas.map((x) => [x.codigo, x.regra])).toEqual([
      ["PLANO_AUSENTE", "SEGURANCA_PLANO_REVISAO"], ["SIMULADO_AUSENTE", "SEGURANCA_SEM_SIMULADO"], ["VISTORIA_AUSENTE", "SEGURANCA_SEM_VISTORIA"]]);
  });
  test("os prazos do contrato: plano anual, simulado em 1 ano, vistoria em 6 meses (180 dias) — no limite ainda vale, no dia seguinte vence", () => {
    const emDia = cs.avaliarSeguranca({ hoje: HOJE, plano: { versao: 2, revisadoEm: "2025-10-23T10:00:00Z" }, simulado: "2025-10-23", vistoria: "2026-04-26" });
    expect(emDia.alertas).toEqual([]);
    expect(emDia.plano).toEqual({ versao: 2, revisadoEm: "2025-10-23", venceEm: "2026-10-23", vencido: false });
    const vencido = cs.avaliarSeguranca({ hoje: "2026-10-24", plano: { versao: 2, revisadoEm: "2025-10-23T10:00:00Z" }, simulado: "2025-10-23", vistoria: "2026-04-26" });
    expect(vencido.alertas.map((x) => x.codigo)).toEqual(["PLANO_VENCIDO", "SIMULADO_ATRASADO", "VISTORIA_ATRASADA"]);
    expect(cs.avaliarSeguranca({ hoje: "2026-10-24", vistoria: "2026-04-27", plano: { versao: 1, revisadoEm: HOJE }, simulado: HOJE }).alertas).toEqual([]);
    expect(cs.avaliarSeguranca({ hoje: "2026-10-24", vistoria: "2026-04-26", plano: { versao: 1, revisadoEm: HOJE }, simulado: HOJE }).alertas.map((x) => x.codigo)).toEqual(["VISTORIA_ATRASADA"]);
    expect(cs.somarDias("2026-04-26", 180)).toBe("2026-10-23");
  });
  test("os prazos vêm de Catálogos → Prazos (e o lixo volta ao padrão)", () => {
    const curto = cs.avaliarSeguranca({ hoje: HOJE, plano: { versao: 1, revisadoEm: "2026-10-01" }, simulado: HOJE, vistoria: HOJE, prazos: { SEGURANCA_PLANO_REVISAO_DIAS: 10 } });
    expect(curto.alertas.map((x) => x.codigo)).toEqual(["PLANO_VENCIDO"]);
    expect(cs.prazosDaSeguranca({ SEGURANCA_PLANO_REVISAO_DIAS: 0, SEGURANCA_SIMULADO_MAX_DIAS: "x", SEGURANCA_VISTORIA_MAX_DIAS: 99999 })).toEqual(cs.PRAZOS_PADRAO);
  });
  test("AVCB: vencido avisa (o Regimento veda culto) e o NÃO INFORMADO também (revisão independente); a vencer em 60 dias só aparece no painel", () => {
    const base = { hoje: HOJE, plano: { versao: 1, revisadoEm: HOJE }, simulado: HOJE, vistoria: HOJE };
    const a = cs.avaliarSeguranca({ ...base, imoveis: [
      { descricao: "Templo", avcbVigenciaFim: "2026-10-22", seguro: "VIGENTE" }, { descricao: "Anexo", avcbVigenciaFim: "2026-12-01", seguro: "SEM_SEGURO" },
      { descricao: "Salão", avcbVigenciaFim: null, seguro: "VENCIDO", seguroFim: "2026-09-30" }] });
    expect(a.alertas.map((x) => [x.codigo, x.regra])).toEqual([["AVCB_VENCIDO", "SEGURANCA_AVCB_SEGURO"], ["AVCB_NAO_INFORMADO", "SEGURANCA_AVCB_SEGURO"], ["SEGURO_VENCIDO", "SEGURANCA_AVCB_SEGURO"]]);
    expect(a.alertas[0].texto).toMatch(/veda receber culto/);
    expect(a.imoveis.map((i) => [i.avcb, i.seguro])).toEqual([["VENCIDA", "VIGENTE"], ["A_VENCER", "SEM_SEGURO"], ["NAO_INFORMADA", "VENCIDO"]]);
    expect(cs.situacaoAvcb("2026-12-23", HOJE)).toBe("VIGENTE");
    expect(cs.situacaoAvcb("2026-12-22", HOJE)).toBe("A_VENCER");
    expect(cs.situacaoAvcb(HOJE, HOJE)).toBe("A_VENCER");
  });
  test("revisão independente: sem imóvel no patrimônio também avisa (o AVCB não pode ser conferido); sem informação sobre imóveis (null), não avalia", () => {
    const base = { hoje: HOJE, plano: { versao: 1, revisadoEm: HOJE }, simulado: HOJE, vistoria: HOJE };
    expect(cs.avaliarSeguranca({ ...base, imoveis: [] }).alertas.map((x) => [x.codigo, x.regra])).toEqual([["SEM_IMOVEL", "SEGURANCA_AVCB_SEGURO"]]);
    expect(cs.avaliarSeguranca({ ...base, imoveis: null }).alertas).toEqual([]);
    expect(cs.avaliarSeguranca({ ...base, imoveis: [{ descricao: "Templo", avcbVigenciaFim: null, seguro: "VIGENTE" }] }).alertas.map((x) => x.codigo)).toEqual(["AVCB_NAO_INFORMADO"]);
  });
  test("revisão independente: a revisão do plano vale pelo dia de BRASÍLIA (22h30 do dia 23 é dia 23, não 24 em UTC)", () => {
    const a = cs.avaliarSeguranca({ hoje: "2026-10-23", plano: { versao: 1, revisadoEm: "2025-10-24T01:30:00Z" }, simulado: HOJE, vistoria: HOJE });
    expect(a.plano).toEqual({ versao: 1, revisadoEm: "2025-10-23", venceEm: "2026-10-23", vencido: false });
    expect(cs.avaliarSeguranca({ hoje: "2026-10-24", plano: { versao: 1, revisadoEm: "2025-10-24T01:30:00Z" }, simulado: "2026-10-24", vistoria: "2026-10-24" }).alertas.map((x) => x.codigo)).toEqual(["PLANO_VENCIDO"]);
    expect([cs.diaBrasilia("2026-10-23T02:59:00Z"), cs.diaBrasilia("2026-10-23T03:00:00Z"), cs.diaBrasilia(new Date("2026-10-23T12:00:00Z")), cs.diaBrasilia("2026-10-23"), cs.diaBrasilia(null)])
      .toEqual(["2026-10-22", "2026-10-23", "2026-10-23", "2026-10-23", null]);
  });
  test("pendência da vistoria aparece no painel, sem aviso próprio", () => {
    const a = cs.avaliarSeguranca({ hoje: HOJE, plano: { versao: 1, revisadoEm: HOJE }, simulado: HOJE, vistoria: HOJE, pendencias: 2 });
    expect(a.alertas).toEqual([{ codigo: "PENDENCIAS", regra: null, texto: "2 pendência(s) da vistoria sem resolver." }]);
  });
});

describe("o resumo do sininho", () => {
  test("a referência muda com o mês e com a lista (não com a ordem), e é um inteiro positivo de 31 bits", () => {
    const a = cs.referenciaDoResumo("SEGURANCA_SEM_SIMULADO", "2026-10", [3, 1, 2]);
    expect(a).toBe(cs.referenciaDoResumo("SEGURANCA_SEM_SIMULADO", "2026-10", [1, 2, 3]));
    expect(a).not.toBe(cs.referenciaDoResumo("SEGURANCA_SEM_SIMULADO", "2026-11", [1, 2, 3]));
    expect(a).not.toBe(cs.referenciaDoResumo("SEGURANCA_SEM_SIMULADO", "2026-10", [1, 2, 3, 4]));
    expect(a).not.toBe(cs.referenciaDoResumo("SEGURANCA_SEM_VISTORIA", "2026-10", [1, 2, 3]));
    expect(Number.isInteger(a) && a > 0 && a <= 2147483647).toBe(true);
  });
  test("o texto junta as congregações em ordem e corta em 12 (cabe nos 1.000 do sininho)", () => {
    expect(cs.textoResumo("SEGURANCA_AVCB_SEGURO", ["Vila", "Central"])).toBe("AVCB ou seguro do templo vencido: Central, Vila. Veja em Crise e segurança → Segurança.");
    const muitas = Array.from({ length: 40 }, (_, i) => `Congregação ${"x".repeat(60)} ${i}`);
    const t = cs.textoResumo("SEGURANCA_SEM_SIMULADO", muitas);
    expect(t).toMatch(/e mais 28/);
    expect(t.length).toBeLessThanOrEqual(1000);
  });
});
