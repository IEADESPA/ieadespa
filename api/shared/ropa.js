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
