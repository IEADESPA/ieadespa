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
  // v8.4 — o recolhimento da credencial (Regimento Art. 131 §3º, III; Art. 132 §2º, II): a via válida é cancelada (o QR passa a dizer "cancelada").
  await require("./credencialDb").cancelarNoDesligamento(pool, membroId, motivo || "Desligamento");
  // A cópia dos documentos pessoais da indicação (Art. 74, II) não é registro que o Regimento mande guardar: sai do banco e do armazenamento.
  const docs = await pool.request().input("id", sql.Int, membroId).query(`
    DELETE a OUTPUT DELETED.Url FROM AnexosGenericos a JOIN Consagracoes c ON c.Numero = a.RegistroId WHERE a.Tabela = N'Consagracoes' AND c.MembroId = @id`);
  for (const d of (docs && docs.recordset) || []) {
    try { await require("./storage").excluirDocumento(d.Url); } catch (e) { /* o arquivo pode já não existir; o registro já saiu */ }
  }
  // Trava 8-A — Regimento Art. 132 §2º, II: "serão eliminados ... registros eclesiásticos de conversão e consagração". O diploma e o CHM deixam de existir (a
  // verificação pública passa a dizer "não encontrado" — antes ela seguia mostrando o nome), e os processos de consagração saem com o parecer do CEI. Os livros de
  // batismo e casamento ficam (o próprio parágrafo os preserva); a auditoria guarda que a minimização aconteceu.
  await pool.request().input("id", sql.Int, membroId).query(`
    DELETE FROM CertificadosEmitidos WHERE MembroId = @id AND Natureza IN (N'CHM', N'DIPLOMA');
    UPDATE Matriculas_AFM SET CertificadoHabilitacao = 0, CHMEm = NULL, CHMPor = NULL, CHMCertificadoId = NULL WHERE MembroId = @id;
    DELETE p FROM PareceresCEIConsagracao p JOIN Consagracoes c ON c.ConsagracaoId = p.ConsagracaoId WHERE c.MembroId = @id;
    DELETE FROM Consagracoes WHERE MembroId = @id;`);
  // v8.5 — os marcos do perfil (conversão, curso de discipulado, ministério anterior...) são "registros eclesiásticos de conversão" (Art. 132 §2º, II): saem. A trilha
  // de discipulado não guarda nada próprio (lê os marcos, o batismo, as trilhas e as escalas); o batismo nas águas fica, como assentamento do sacramento.
  await pool.request().input("id", sql.Int, membroId).query(`DELETE FROM MarcosMembro WHERE MembroId = @id`);
}

module.exports = { diasMinimizacaoExMembro, minimizarCamposExMembro, DIAS_MINIMIZACAO_PADRAO };
