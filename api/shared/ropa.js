// shared/ropa.js (vB.8 — ROPA: Registro de Operações de Tratamento)
// Catálogo curado à mão — não existia NADA disso até aqui (nem tabela, nem
// documento): não dá pra derivar "qual é a finalidade e a base legal de
// cada tratamento" automaticamente do schema, alguém precisa decidir e
// escrever. O que a Function (GestaoRopa) faz de automático é só a parte
// que É derivável: contar quantos registros reais existem em cada tabela
// agora, pra o ROPA nunca ficar "desatualizado sem ninguém perceber" —
// senão vira só mais um documento estático que ninguém confere se ainda
// bate com o sistema.
//
// Cobre os tratamentos de dado pessoal REALMENTE implementados hoje — não
// é uma lista exaustiva de 95+ tabelas, é o registro das atividades de
// tratamento reais (mesmo espírito do "gap real, não fabricado" de toda
// vB.8): crescer este catálogo é 1 entrada nova por vez, quando um módulo
// novo tratar dado pessoal de um jeito que ainda não está aqui.
const REGISTROS_TRATAMENTO = [
  {
    chave: "MEMBRESIA",
    finalidade: "Gestão do vínculo de membresia religiosa (cadastro, categoria, histórico)",
    titulares: "Membros e ex-membros",
    categoriasDados: ["Identificação", "Contato", "Datas eclesiásticas (batismo, admissão)"],
    baseLegal: "LGPD Art. 11, II, \"a\" — organização religiosa, dado de pessoa com vínculo regular (dispensa consentimento)",
    tabelasEnvolvidas: ["MembroReferencia"],
    retencao: "Enquanto durar o vínculo; minimizado 30 dias após desligamento formal (Reg. Art. 132 §2º — ver PoliticasRetencao)"
  },
  {
    chave: "FOTO",
    finalidade: "Identificação visual (crachá, cadastro com foto)",
    titulares: "Membros",
    categoriasDados: ["Imagem"],
    baseLegal: "LGPD Art. 7º, I — consentimento (ConsentimentosLGPD, Tipo='FOTO'/'DADOS_CONTATO')",
    tabelasEnvolvidas: ["MembroReferencia"],
    retencao: "Enquanto o consentimento não for revogado — revogação exclui o arquivo (shared/storage.js::excluirFoto)"
  },
  {
    chave: "DISCIPLINA",
    finalidade: "Processo disciplinar eclesiástico (Regimento, Código Penal Eclesiástico)",
    titulares: "Membros sob processo",
    categoriasDados: ["Motivo, decisão, sanção — sigiloso"],
    baseLegal: "LGPD Art. 11, II, \"a\"/\"c\" — obrigação legal/exercício regular de direitos da organização religiosa",
    tabelasEnvolvidas: ["ProcessosDisciplinares", "ProcessoInfracoes", "MedidasCautelares"],
    retencao: "Indeterminada (PoliticasRetencao — histórico disciplinar/reincidência, Regimento Art. 77)"
  },
  {
    chave: "FINANCEIRO",
    finalidade: "Gestão financeira, dízimos/ofertas e prestação de contas",
    titulares: "Dizimistas (membros e avulsos)",
    categoriasDados: ["Nome, valor, forma de pagamento"],
    baseLegal: "LGPD Art. 11, II, \"a\" — obrigação estatutária de prestação de contas",
    tabelasEnvolvidas: ["Dizimistas", "LancamentosTesouraria"],
    retencao: "Indeterminada — exigência de prestação de contas contínua (Estatuto Art. 36)"
  },
  {
    chave: "COMUNICACAO",
    finalidade: "Notificação institucional (prazo vencendo, pendência, aviso operacional) — NUNCA marketing",
    titulares: "Membros com Lideranca (destinatários de notificação)",
    categoriasDados: ["E-mail, inscrição push"],
    baseLegal: "LGPD Art. 11, II, \"a\" — comunicação inerente ao exercício da função/vínculo, com opt-out por categoria (NotificacaoPreferencias, vB.2)",
    tabelasEnvolvidas: ["Notificacoes", "PushInscricoesMembro"],
    retencao: "Notificação: indeterminada enquanto não arquivada. Inscrição push: até o dispositivo revogar/desinstalar."
  },
  {
    chave: "VINCULO_FAMILIAR_MENOR",
    finalidade: "Registro de vínculo familiar e identificação de responsável legal de menor",
    titulares: "Membros menores de idade e seus responsáveis",
    categoriasDados: ["Vínculo de parentesco", "Flag de responsável legal"],
    baseLegal: "LGPD Art. 11, II, \"a\" + Art. 14 (melhor interesse da criança)",
    tabelasEnvolvidas: ["VinculosFamiliares"],
    retencao: "Enquanto durar o vínculo familiar/de membresia"
  },
  {
    chave: "EBD",
    finalidade: "Escola Bíblica Dominical: turmas, chamada, caderneta, atividades, alerta de ausência ao professor (FASE 6)",
    titulares: "Alunos (membros e não-membros, inclusive crianças), professores e visitantes da EBD",
    categoriasDados: ["Identificação (nome)", "Presença por domingo", "Respostas de atividade", "Não-membro: contato, nascimento, responsável (menor)", "Visitante: nome e contato"],
    baseLegal: "LGPD Art. 11, II, \"a\" — organização religiosa (membros); Art. 7º, IX e Art. 14 (legítimo interesse/melhor interesse da criança, com responsável) para não-membros e visitantes",
    tabelasEnvolvidas: ["EbdAlunos", "EbdChamadas", "EbdRespostasAlunos", "EbdCadernetas"],
    retencao: "Presença e matrícula de membro: enquanto durar o vínculo. Visitante: nome/contato anonimizados após 12 meses; aluno não-membro: anonimizado 24 meses após encerrar a matrícula (rotina diária — PoliticasRetencao). O Encarregado anonimiza antes, a pedido (Proteção de Dados → EBD)."
  },
  {
    chave: "FORMACAO",
    finalidade: "Trilhas de formação, conclusão de módulos e certificado verificável usado como requisito (v6.5/v6.9)",
    titulares: "Membros em formação",
    categoriasDados: ["Matrícula e progresso em trilha", "Certificado (titular, título, validade, código de verificação)"],
    baseLegal: "LGPD Art. 11, II, \"a\" — organização religiosa; Art. 7º, IX — prova da formação exigida pelos fluxos (consagração, liderança, escala)",
    tabelasEnvolvidas: ["TrilhaMatriculas", "TrilhaModuloConclusoes", "CertificadosEmitidos"],
    retencao: "Indeterminada enquanto o certificado puder ser verificado (prova de formação); a verificação pública mostra só o que está impresso no certificado"
  },
  {
    chave: "PSC",
    finalidade: "Avaliação anual de saúde de cada congregação (Programa de Saúde Congregacional, Regimento Art. 127-129) e a reclassificação compulsória que dela decorre (v7.1)",
    titulares: "Quem preenche, valida e homologa a avaliação; encarregado nomeado na reclassificação",
    categoriasDados: ["Identificação de quem agiu (matrícula)", "Respostas e evidências (links) sobre a congregação, não sobre pessoas"],
    baseLegal: "LGPD Art. 7º, IX — legítimo interesse da instituição em avaliar suas unidades; sem dado sensível de membro (o PSC é avaliação da congregação, não cadastro de saúde de pessoa)",
    tabelasEnvolvidas: ["PscAvaliacoes", "PscRespostas", "PscReclassificacoes"],
    retencao: "Indeterminada — o histórico dos exercícios é o que sustenta uma reclassificação compulsória (PoliticasRetencao)"
  },
  {
    chave: "AUDITORIA",
    finalidade: "Trilha de integridade e compliance (quem fez o quê, quando)",
    titulares: "Quem usa o sistema (Liderança)",
    categoriasDados: ["Ação, usuário, hash da cadeia"],
    baseLegal: "LGPD Art. 16, I — cumprimento de obrigação legal/regulatória (governança)",
    tabelasEnvolvidas: ["AuditLog"],
    retencao: "Indeterminada — trilha imutável (PoliticasRetencao)"
  }
];

// Só a contagem é derivada de verdade (SELECT COUNT(*) por tabela) — o
// resto (finalidade/base legal/retenção) é o julgamento humano que um ROPA
// exige, não algo que o próprio schema "sabe" sozinho.
async function montarRopa(pool, sql) {
  const registros = [];
  for (const registro of REGISTROS_TRATAMENTO) {
    const contagens = {};
    for (const tabela of registro.tabelasEnvolvidas) {
      const resultado = await pool.request().query(`SELECT COUNT(*) AS total FROM ${tabela}`);
      contagens[tabela] = resultado.recordset[0].total;
    }
    registros.push(Object.assign({}, registro, { contagens }));
  }
  return registros;
}

module.exports = { REGISTROS_TRATAMENTO, montarRopa };
