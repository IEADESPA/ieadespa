// shared/ripd.js (vB.8 — RIPD: Relatório de Impacto à Proteção de Dados)
// Só entra aqui tratamento que É de alto risco E que EXISTE de verdade no
// sistema hoje — nada fabricado. O texto original da vB.8 citava "foto,
// dado de menor, nota pastoral, dado de saúde em evento" como exemplos de
// tratamento de risco; dos quatro, hoje só dois têm tabela/tratamento real
// (Foto, Dado de Menor) — os outros dois (nota pastoral, dado de saúde em
// evento) não têm NENHUM módulo no sistema ainda, então entram como
// "N/A hoje" em vez de um RIPD inventado sobre algo que não existe.
const RIPDS = [
  {
    chave: "FOTO",
    tratamento: "Foto do membro (identificação visual)",
    riscoIdentificado: "Imagem é dado que, combinado com nome/matrícula, identifica a pessoa com alta confiança; vazamento do Blob Storage exporia rosto + vínculo religioso (dado potencialmente sensível por associação).",
    medidasMitigacao: [
      "Container privado (sem acesso público direto — shared/storage.js)",
      "URL servida sempre via link assinado (SAS) de validade curta (1 hora)",
      "Consentimento real e revogável (ConsentimentosLGPD) — revogação exclui o arquivo, não só desativa a exibição",
      "Nome do blob não é sequencial adivinhável fora do padrão membro-{id}, mas o container inteiro é privado, então isso é defesa em profundidade, não a única barreira"
    ],
    riscoResidual: "Baixo — mitigado pelas 3 camadas acima (privacidade do container + SAS temporário + consentimento revogável)."
  },
  {
    chave: "DADO_DE_MENOR",
    tratamento: "Cadastro de membro menor de idade + identificação do responsável legal",
    riscoIdentificado: "Dado de criança/adolescente exige cuidado reforçado (Art. 14) — exposição indevida do vínculo familiar ou dos dados de contato do responsável é o principal risco.",
    medidasMitigacao: [
      "Sem coluna dedicada de 'é menor' exposta publicamente — condição derivada de DataNascimento, calculada na leitura (estatuto.js::idadeEm)",
      "Vínculo com responsável legal (VinculosFamiliares.ResponsavelLegal) só é visível a quem tem permissão 'pessoas'",
      "Autoatendimento (MeusDadosLGPD) já exibe o vínculo pro próprio titular/responsável, nunca a terceiro"
    ],
    riscoResidual: "Médio — mitigado por controle de acesso, mas não há hoje um consentimento parental específico e separado do consentimento genérico do próprio adulto responsável (gap conhecido, registrado em api/GestaoConsentimentoLGPD)."
  },
  {
    chave: "NOTA_PASTORAL",
    tratamento: "N/A hoje — não existe tabela/tela de 'nota pastoral' no sistema.",
    riscoIdentificado: null, medidasMitigacao: [], riscoResidual: "N/A — sem tratamento real, sem RIPD a fazer. Entra quando o módulo existir."
  },
  {
    chave: "DADO_DE_SAUDE_EM_EVENTO",
    tratamento: "N/A hoje — não existe cadastro de dado de saúde (alergia, condição médica) em evento ou check-in.",
    riscoIdentificado: null, medidasMitigacao: [], riscoResidual: "N/A — sem tratamento real, sem RIPD a fazer. Ver v7.10 (check-in infantil), que prevê isso como versão futura."
  }
];

module.exports = { RIPDS };
