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
            DataSaida = @dataSaida, MotivoSaida = @motivo, Sexo = NULL
            WHERE MembroId = @id`);
  // v8.2 — o histórico de cargos é registro eclesiástico de consagração: sai com a minimização (Regimento Art. 132 §2º, II).
  await pool.request().input("id", sql.Int, membroId).query(`DELETE FROM CargosMinisteriaisHistorico WHERE MembroId = @id`);
  // v8.3 — o texto do parecer do CEI (a fundamentação e a exceção do Pastor não casado falam da vida conjugal e pregressa) sai; o resultado e a data ficam como registro.
  // As marcas do escrutínio (recasado, fundamento) e da sabatina falam da vida conjugal tanto quanto o texto: saem também (revisão independente, 28/10/2026).
  await pool.request().input("id", sql.Int, membroId).query(`
    UPDATE p SET Fundamentacao = NULL, ExcecaoPastorNaoCasado = NULL, EscrutinioFundamento = NULL, EscrutinioDocumental = NULL, Recasado = NULL, CasamentoAtualEstavel = NULL,
                 SabatinaVidaPregressa = NULL, SabatinaFinanceira = NULL, SabatinaDoutrina = NULL
    FROM PareceresCEIConsagracao p JOIN Consagracoes c ON c.ConsagracaoId = p.ConsagracaoId WHERE c.MembroId = @id`);
  // v8.4 — o recolhimento da credencial (Regimento Art. 95 §2º, IV, a): a via válida é cancelada (o QR passa a dizer "cancelada").
  await require("./credencialDb").cancelarNoDesligamento(pool, membroId, motivo || "Desligamento");
  // A cópia dos documentos pessoais da indicação (Art. 74, II) não é registro que o Regimento mande guardar: sai do banco e do armazenamento.
  const docs = await pool.request().input("id", sql.Int, membroId).query(`
    DELETE a OUTPUT DELETED.Url FROM AnexosGenericos a JOIN Consagracoes c ON c.Numero = a.RegistroId WHERE a.Tabela = N'Consagracoes' AND c.MembroId = @id`);
  for (const d of (docs && docs.recordset) || []) {
    try { await require("./storage").excluirDocumento(d.Url); } catch (e) { /* o arquivo pode já não existir; o registro já saiu */ }
  }
}

module.exports = { diasMinimizacaoExMembro, minimizarCamposExMembro, DIAS_MINIMIZACAO_PADRAO };
