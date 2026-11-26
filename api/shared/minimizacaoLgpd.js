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
const { emTransacao } = require("./transacaoCurta");
const { LIMPAR_ENDERECO_LINHAS } = require("./territorio");   // v9.5: as linhas do endereço saem junto com a linha única

const DIAS_MINIMIZACAO_PADRAO = 30; // usado só se a política estiver ausente/inativa — nunca destrava sozinho um prazo maior

// Lê PoliticasRetencao pela categoria — é o que faz a retenção EXECUTAR de
// verdade (antes disso, PoliticasRetencao não acionava nada, era só catálogo).
// O prazo e de onde ele veio: `padrao` = true quando a política está inativa, ausente ou sem prazo ("indeterminado") e valeu o padrão de 30 dias (a
// revisão de fora de 25/11/2026 pediu que a trilha e a resposta digam qual prazo valeu).
async function prazoMinimizacaoExMembro(pool) {
  const politica = (await pool.request().query(`
    SELECT DiasRetencao FROM PoliticasRetencao WHERE Categoria = N'Dados de Ex-Membro (pós-Carta de Mudança)' AND Ativo = 1
  `)).recordset[0];
  return politica && politica.DiasRetencao != null ? { dias: politica.DiasRetencao, padrao: false } : { dias: DIAS_MINIMIZACAO_PADRAO, padrao: true };
}
async function diasMinimizacaoExMembro(pool) {
  return (await prazoMinimizacaoExMembro(pool)).dias;
}

// A minimização DENTRO da transação de quem chama (shared/transacaoCurta.js): `t` = { executor, transacao }. Ou tudo vale (a vacância, os campos zerados, os
// registros eliminados, a credencial), ou nada muda e o processamento pode ser repetido. Devolve os endereços dos documentos a apagar do armazenamento, o que
// só se faz DEPOIS do commit (excluirDocumentos): um arquivo apagado não volta se a transação for desfeita.
async function minimizarNaTransacao(t, membroId, { dataSaida, motivo }) {
  const pool = t.executor;
  await vacancia.encerrarVinculos(pool, sql, membroId, motivo || "Carta de Mudança");
  await pool.request()
    .input("id", sql.Int, membroId)
    .input("dataSaida", sql.Date, dataSaida)
    .input("motivo", sql.NVarChar(200), motivo || "Carta de Mudança")
    .query(`UPDATE MembroReferencia SET
            Status = 'DESLIGADO', SituacaoMembro = 'SEM_COMUNHAO',
            Telefone = NULL, Email = NULL, Endereco = NULL, ${LIMPAR_ENDERECO_LINHAS},
            Funcao = NULL, CargoMinisterial = NULL, DepartamentoId = NULL,
            Origem = NULL, IgrejaAnterior = NULL, DataRitoRecebimento = NULL,
            NomeLidoRito = NULL, MinistranteRito = NULL, DizimistaFiel = NULL,
            CongregacaoId = NULL, ExtensaoId = NULL,
            DataSaida = @dataSaida, MotivoSaida = @motivo, Sexo = NULL
            WHERE MembroId = @id;
            -- v10.1b (migração 174) — o CPF, a filiação e a escolaridade não são registro que o Regimento mande guardar: saem com a minimização (só se a coluna
            -- existe: a rotina não quebra num banco que ainda não recebeu a 174)
            IF COL_LENGTH('dbo.MembroReferencia', 'Cpf') IS NOT NULL
              EXEC sp_executesql N'UPDATE dbo.MembroReferencia SET Cpf = NULL, NomeMae = NULL, NomePai = NULL, Escolaridade = NULL WHERE MembroId = @m', N'@m INT', @m = @id;`);
  // v8.2 — o histórico de cargos é registro eclesiástico de consagração: sai com a minimização (Regimento Art. 132 §2º, II).
  await pool.request().input("id", sql.Int, membroId).query(`DELETE FROM CargosMinisteriaisHistorico WHERE MembroId = @id`);
  // v8.4 — o recolhimento da credencial (Regimento Art. 131 §3º, III; Art. 132 §2º, II): a via válida é cancelada (o QR passa a dizer "cancelada").
  await require("./credencialDb").cancelarNoDesligamento(pool, membroId, motivo || "Desligamento", null, t.transacao);
  // A cópia dos documentos pessoais da indicação (Art. 74, II) não é registro que o Regimento mande guardar: sai do banco aqui e do armazenamento depois do commit.
  const docs = await pool.request().input("id", sql.Int, membroId).query(`
    DELETE a OUTPUT DELETED.Url FROM AnexosGenericos a JOIN Consagracoes c ON c.Numero = a.RegistroId WHERE a.Tabela = N'Consagracoes' AND c.MembroId = @id`);
  const documentos = ((docs && docs.recordset) || []).map((d) => d.Url).filter(Boolean);
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
  // Trava 8-B — Art. 132 §2º, II: fica só o "Registro Histórico Mínimo"; "serão eliminados todos os demais dados". Os resultados da reciclagem e do exame (v8.6) e o
  // histórico escolar (v8.7: a matrícula nos cursos, as notas, os aproveitamentos) saem, com os documentos verificáveis (o diploma, o histórico e a declaração: a
  // verificação pública passa a dizer "não encontrado", como o CHM e o diploma de consagração na Trava 8-A). Fica o que é de outras pessoas: a turma que a pessoa
  // lecionou (as notas dos alunos dependem dela) e o parecer que ela deu no aproveitamento de outro aluno.
  await pool.request().input("id", sql.Int, membroId).query(`
    IF OBJECT_ID(N'dbo.AFMReciclagemResultados', N'U') IS NOT NULL
    BEGIN
      DELETE FROM AFMReciclagemResultados WHERE MembroId = @id;
      DELETE FROM AFMExameResultados WHERE MembroId = @id;
    END
    IF OBJECT_ID(N'dbo.AFMCursoMatriculas', N'U') IS NOT NULL
    BEGIN
      DELETE da FROM AFMDocumentosAcademicos da JOIN CertificadosEmitidos ce ON ce.CertificadoId = da.CertificadoId WHERE ce.MembroId = @id;
      DELETE FROM AFMDocumentosAcademicos WHERE CursoMatriculaId IN (SELECT CursoMatriculaId FROM AFMCursoMatriculas WHERE MembroId = @id);
      UPDATE AFMCursoMatriculas SET DiplomaCertificadoId = NULL WHERE MembroId = @id;
      DELETE FROM CertificadosEmitidos WHERE MembroId = @id AND Natureza IN (N'DIPLOMA_AFM', N'HISTORICO', N'DECLARACAO');
      DELETE FROM AFMTurmaAlunos WHERE MembroId = @id;
      DELETE FROM AFMAproveitamentos WHERE MembroId = @id;
      DELETE FROM AFMCursoMatriculas WHERE MembroId = @id;
    END`);
  return documentos;
}

// Depois do commit: os arquivos dos documentos que a minimização tirou do banco. Devolve os endereços que o armazenamento NÃO apagou (fora do ar, credencial
// vencida): o banco já não os tem, então quem chamou registra a pendência na trilha (o arquivo que já não existia conta como apagado).
async function excluirDocumentos(urls) {
  const naoApagados = [];
  for (const url of urls || []) {
    let apagou = false;
    try { apagou = (await require("./storage").excluirDocumento(url)) !== false; } catch (e) { apagou = false; }
    if (!apagou) naoApagados.push(url);
  }
  return naoApagados;
}

// A minimização numa transação própria, e os arquivos depois do commit (para quem não tem outra gravação a fazer junto, como os roteiros de teste).
async function minimizarCamposExMembro(pool, membroId, opcoes) {
  const documentos = await emTransacao(pool, ({ executor, transacao }) => minimizarNaTransacao({ executor, transacao }, membroId, opcoes));
  await excluirDocumentos(documentos);
}

module.exports = { diasMinimizacaoExMembro, prazoMinimizacaoExMembro, minimizarNaTransacao, excluirDocumentos, minimizarCamposExMembro, DIAS_MINIMIZACAO_PADRAO };
