// shared/travaPermissoes.js — quem ainda administra os acessos.
// Tirar o cargo ou o acesso da última pessoa que consegue usar a permissão "permissoes" deixa a igreja sem ninguém para conceder, retirar ou devolver acesso
// (nem para desfazer o próprio ato). Conta só quem entra de verdade com ela: cargo vigente pelo dia de Brasília, ATIVO no rol, com senha, papel do nível geral
// (GestaoLideranca só aceita o geral) e sem a recertificação da permissão vencida (o login a tira da sessão). Usado pela medida cautelar e pelo cadastro.

const PODE_ADMINISTRAR = `
  SELECT DISTINCT l.MembroId
  FROM Lideranca l
  JOIN Papeis p ON p.PapelId = l.PapelId
  JOIN MembroReferencia m ON m.MembroId = l.MembroId
  WHERE m.Status = 'ATIVO' AND l.SenhaHash IS NOT NULL AND p.Nivel = 'GLOBAL'
    AND (l.EscopoTipo IS NULL OR l.EscopoTipo IN ('GLOBAL', 'DEPARTAMENTO'))
    AND (l.AtivoAte IS NULL OR l.AtivoAte >= @hoje)
    AND (',' + REPLACE(p.Permissoes, ' ', '') + ',') LIKE '%,permissoes,%'
    AND NOT EXISTS (SELECT 1 FROM RecertificacoesAcesso r
                    WHERE r.MembroId = l.MembroId AND r.Permissao = N'permissoes' AND r.Status = 'EXPIRADA'
                      AND r.RecertificacaoId = (SELECT MAX(r2.RecertificacaoId) FROM RecertificacoesAcesso r2 WHERE r2.MembroId = l.MembroId AND r2.Permissao = N'permissoes'))`;

// Numa consulta só: se a pessoa tem cargo de liderança vigente, se ela é uma das que administram os acessos e quantas outras administram.
// `executor`: o pool ou a transação de quem chama; `hoje`: o dia de Brasília (AAAA-MM-DD).
async function situacaoDoCargo(executor, sql, membroId, hoje) {
  const r = await executor.request().input("id", sql.Int, membroId).input("hoje", sql.Date, hoje).query(`
    WITH Administram AS (${PODE_ADMINISTRAR})
    SELECT CASE WHEN EXISTS (SELECT 1 FROM Lideranca l WHERE l.MembroId = @id AND (l.AtivoAte IS NULL OR l.AtivoAte >= @hoje)) THEN 1 ELSE 0 END AS TemCargoVigente,
           CASE WHEN EXISTS (SELECT 1 FROM Administram WHERE MembroId = @id) THEN 1 ELSE 0 END AS AlvoAdministra,
           (SELECT COUNT(*) FROM Administram WHERE MembroId <> @id) AS Outros`);
  const l = (r.recordset && r.recordset[0]) || {};
  return { temCargoVigente: Number(l.TemCargoVigente) === 1, alvoAdministra: Number(l.AlvoAdministra) === 1, outros: Number(l.Outros) || 0 };
}

const ficariaSemAdministrador = (s) => !!s && s.alvoAdministra && s.outros === 0;

const MENSAGEM_ULTIMO = "Não é possível: esta pessoa é a única que administra os acessos (permissão \"permissoes\") e ninguém mais conseguiria conceder ou devolver acesso depois. Conceda a permissão a outra pessoa antes.";

module.exports = { situacaoDoCargo, ficariaSemAdministrador, MENSAGEM_ULTIMO };
