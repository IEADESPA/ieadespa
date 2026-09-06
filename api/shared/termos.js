// shared/termos.js
// Catálogo de termos que precisam ser assinados antes de usar a Secretaria —
// bloqueio real (ver shared/auth.js exigirLogin), não decorativo. VersaoTermo
// é o que muda quando o texto for editado depois: TermosAssinados guarda a
// versão assinada, então mudar a versão aqui faz quem já assinou a antiga
// voltar a ficar pendente, sem apagar o histórico de quem assinou o quê.
const TERMOS = {
  CONFIDENCIALIDADE: {
    versao: "2026-1",
    titulo: "Termo de Confidencialidade e Sigilo de Dados",
    texto:
      "Declaro estar ciente de que, no exercício desta função, terei acesso a dados pessoais e, eventualmente, sensíveis " +
      "de membros e obreiros da IEADESPA (Regimento Interno, Art. 132, c/c Lei nº 13.709/2018 — LGPD). Comprometo-me a: " +
      "(I) usar esses dados exclusivamente para as finalidades desta função; (II) não divulgar, copiar, repassar ou " +
      "expor tais dados a terceiros sem autorização; (III) respeitar os limites de acesso hierarquizado definidos pelo " +
      "Art. 132, restringindo-me aos dados do meu próprio escopo (congregação, área ou nível correspondente); " +
      "(IV) comunicar imediatamente à Secretaria Geral qualquer suspeita de vazamento. Estou ciente de que a violação " +
      "deste compromisso configura infração ética grave (Regimento Interno, Código Penal Eclesiástico — \"Violação de " +
      "Dados, Sigilo e Uso Indevido de Imagem\"), sujeita a processo disciplinar, e pode ainda configurar " +
      "responsabilidade civil e criminal nos termos da legislação aplicável.",
    // Todo mundo que loga na Secretaria (qualquer Lideranca) precisa assinar.
    aplicaA: () => true
  },
  COMPROMISSO_DIRIGENTE: {
    versao: "2026-1",
    titulo: "Termo de Compromisso de Gestão e Fidelidade Doutrinária (Art. 57)",
    texto:
      "Nos termos do Art. 57 do Estatuto (Do Termo de Posse e Compromisso de Gestão), declaro: (I) conhecer e " +
      "submeter-me integralmente ao Estatuto e ao Regimento Interno da IEADESPA; (II) reconhecer o caráter voluntário " +
      "e não empregatício desta função eclesiástica, sem vínculo trabalhista de qualquer natureza; (III) assumir a " +
      "responsabilidade pela guarda e pela prestação de contas dos bens e valores sob minha administração enquanto " +
      "durar esta função; (IV) comprometer-me a entregar a Congregação, seus bens, documentos e valores, de forma " +
      "organizada, em caso de substituição ou afastamento, na forma detalhada no Regimento Interno. Estou ciente de " +
      "que a recusa em assinar este Termo implica a revogação imediata da nomeação (Art. 57, § 1º), e de que este " +
      "documento serve como prova documental de minha ciência das normas institucionais em eventuais demandas " +
      "judiciais ou administrativas (Art. 57, § 2º).",
    // Só quem tem papel de escopo Congregação (mesmo classificador estrutural
    // usado em universo.js/GestaoLideranca pra identificar um Dirigente).
    aplicaA: (papelNivel) => papelNivel === "CONGREGACAO"
  }
};

function termosAplicaveis(papelNivel) {
  return Object.keys(TERMOS).filter(tipo => TERMOS[tipo].aplicaA(papelNivel));
}

async function termosPendentes(pool, sql, membroId, papelNivel) {
  const aplicaveis = termosAplicaveis(papelNivel);
  if (aplicaveis.length === 0) return [];
  const assinados = await pool.request().input("id", sql.Int, membroId)
    .query(`SELECT TipoTermo, VersaoTermo FROM TermosAssinados WHERE MembroId = @id`);
  const assinadosOk = new Set(assinados.recordset.map(r => `${r.TipoTermo}:${r.VersaoTermo}`));
  return aplicaveis.filter(tipo => !assinadosOk.has(`${tipo}:${TERMOS[tipo].versao}`));
}

module.exports = { TERMOS, termosAplicaveis, termosPendentes };
