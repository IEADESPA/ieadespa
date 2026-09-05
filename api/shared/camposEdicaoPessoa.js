// shared/camposEdicaoPessoa.js (v1.11)
// Campos "sujeitos a aprovação da Secretaria" (classificação registrada no
// README, v1.10) — entram em cálculo/registro formal (ex: shared/estatuto.js
// usa Data de Nascimento/Admissão pra capacidade eleitoral), erro tem
// consequência real. Fixo em código, não catálogo editável por tela (mesmo
// espírito de CAUSAS_SAIDA/FORMAS_ADMISSAO em GestaoPessoas). Reaproveitado por
// SolicitarEdicaoPessoa (cria o pedido) e GestaoFilaAprovacoes (aplica quando
// aprovado).
const CAMPOS_APROVACAO = {
  dataNascimento: { coluna: "DataNascimento", tipoData: true, rotulo: "Data de Nascimento" },
  dataAdmissao: { coluna: "DataAdmissao", tipoData: true, rotulo: "Data de Admissão" },
  dataBatismo: { coluna: "DataBatismo", tipoData: true, rotulo: "Data do Batismo" },
  formaAdmissao: { coluna: "FormaAdmissao", tipoData: false, rotulo: "Forma de Admissão" },
  origem: { coluna: "Origem", tipoData: false, rotulo: "Origem/Procedência" },
  igrejaAnterior: { coluna: "IgrejaAnterior", tipoData: false, rotulo: "Igreja Anterior" },
  dataRitoRecebimento: { coluna: "DataRitoRecebimento", tipoData: true, rotulo: "Data do Rito de Recebimento" },
  nomeLidoRito: { coluna: "NomeLidoRito", tipoData: false, rotulo: "Nome Lido no Rito" },
  ministranteRito: { coluna: "MinistranteRito", tipoData: false, rotulo: "Ministrante do Rito" }
};

module.exports = { CAMPOS_APROVACAO };
