// shared/minimizacaoLgpd.js (vB.8 — Retenção que executa)
// Extraído de api/GestaoCartas (ação "processar", v1.5/vC.3) — mesma
// lógica exata, só reaproveitável por outros gatilhos de desligamento no
// futuro sem copiar/colar a lista de colunas. "O que vence é minimizado,
// não destruído": zera dado operacional (contato, cargo, vínculo
// territorial) e preserva o Registro Histórico Mínimo (nome, matrícula,
// datas centrais, motivo/data de saída) — nunca apaga o que o Regimento
// exige guardar (Reg. Art. 132 §2º).
const { sql } = require("./db");
const vacancia = require("./vacancia");

const DIAS_MINIMIZACAO_PADRAO = 30; // usado só se a política estiver ausente/inativa — nunca destrava sozinho um prazo maior

// Lê PoliticasRetencao pela categoria — é o que faz a retenção EXECUTAR de
// verdade (antes disso, PoliticasRetencao não acionava nada, era só catálogo).
async function diasMinimizacaoExMembro(pool) {
  const politica = (await pool.request().query(`
    SELECT DiasRetencao FROM PoliticasRetencao WHERE Categoria = N'Dados de Ex-Membro (pós-Carta de Mudança)' AND Ativo = 1
  `)).recordset[0];
  return politica && politica.DiasRetencao != null ? politica.DiasRetencao : DIAS_MINIMIZACAO_PADRAO;
}

async function minimizarCamposExMembro(pool, membroId, { dataSaida, motivo }) {
  await vacancia.encerrarVinculos(pool, sql, membroId, motivo || "Carta de Mudança");
  await pool.request()
    .input("id", sql.Int, membroId)
    .input("dataSaida", sql.Date, dataSaida)
    .input("motivo", sql.NVarChar(200), motivo || "Carta de Mudança")
    .query(`UPDATE MembroReferencia SET
            Status = 'DESLIGADO', SituacaoMembro = 'SEM_COMUNHAO',
            Telefone = NULL, Email = NULL, Endereco = NULL,
            Funcao = NULL, CargoMinisterial = NULL, DepartamentoId = NULL,
            Origem = NULL, IgrejaAnterior = NULL, DataRitoRecebimento = NULL,
            NomeLidoRito = NULL, MinistranteRito = NULL, DizimistaFiel = NULL,
            CongregacaoId = NULL, ExtensaoId = NULL,
            DataSaida = @dataSaida, MotivoSaida = @motivo
            WHERE MembroId = @id`);
}

module.exports = { diasMinimizacaoExMembro, minimizarCamposExMembro, DIAS_MINIMIZACAO_PADRAO };
