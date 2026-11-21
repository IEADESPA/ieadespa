// shared/preCadastroDb.js (FASE 10, v10.1b passo 4, 17/11/2026) — a leitura e a gravação do PRÉ-CADASTRO, da FILA DE CADASTROS, da CONFERÊNCIA DO CPF ao digitar
// e dos CASOS que vão à Secretaria Geral. As regras puras estão em shared/preCadastro.js.
//
// O processamento de um pré-cadastro (processar) roda numa transação, com uma trava por CPF (sp_getapplock): dois pré-cadastros com o mesmo CPF ao mesmo tempo
// ficam em fila — o mais antigo é avaliado primeiro (e pode entrar sozinho, virando ficha); o outro vê a ficha (ou o pré-cadastro mais antigo) e vai para CORREÇÃO.
// A ficha nova nasce como CONGREGADO, com a matrícula gerada (shared/matriculaNova.js: primeiro um número de MatriculasLivres). O índice único do CPF na ficha
// (migração 174) é a última trava: se outro cadastro gravou o mesmo CPF no meio, o pré-cadastro vai para CORREÇÃO (ponto de salvamento, sem desfazer o resto).
const crypto = require("crypto");
const { sql } = require("./db");
const auth = require("./auth");
const { registrarAuditoriaNaTransacao } = require("./auditoria");
const regras = require("./preCadastro");
const ficha = require("./fichaMembro");
const matriculaNova = require("./matriculaNova");
const { ehGeral, noEscopoDaPessoa, condicaoSqlEscopoCongregacao } = require("./escopoRotas");
const { secretariaLocalDe, cobreCongregacaoInteira } = require("./transferencias");
const { hojeBrasilia } = require("./dataBrasilia");

const erroNumero = (e) => e && (e.number || (e.originalError && e.originalError.info && e.originalError.info.number));
const violouUnico = (e, indice) => [2601, 2627].includes(erroNumero(e)) && (!indice || new RegExp(indice).test(String(e && e.message)));
const ABERTAS = "N'PENDENTE', N'CORRECAO'";

async function emTransacao(pool, fazer) {
  const t = new sql.Transaction(pool);
  await t.begin();
  try {
    const r = await fazer(t, () => new sql.Request(t));
    if (r && r.sucesso === false) { await t.rollback(); return r; }
    await t.commit();
    return r;
  } catch (e) {
    try { await t.rollback(); } catch (_) { /* já desfeita */ }
    throw e;
  }
}
// esperaMs: quanto esperar pela trava (o padrão, 20 s; o formulário do site passa o que sobra do tempo fixo da resposta)
async function travar(rq, recurso, esperaMs = 20000) {
  const espera = Math.max(0, Math.min(Math.floor(Number(esperaMs) || 0), 20000));
  const r = await rq().input("r", sql.NVarChar(255), recurso).input("ms", sql.Int, espera)
    .query("DECLARE @rc INT; EXEC @rc = sp_getapplock @Resource = @r, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = @ms; SELECT @rc AS rc");
  if (Number(r.recordset[0].rc) < 0) throw new Error("trava do pré-cadastro não obtida a tempo");
}

// O hash truncado de quem enviou pelo site (o site manda um identificador do visitante; aqui guardamos só 16 letras do hash, nunca o valor em claro).
// HMAC com o segredo do servidor (revisão de 20/11/2026): o hash simples de um IP se desfaz testando os 2^32 endereços
const hashOrigem = (v) => (typeof v === "string" && v.trim() ? crypto.createHmac("sha256", String(process.env.AUTH_SECRET || "")).update(`precad:${v.trim().slice(0, 128)}`).digest("hex").slice(0, 16) : null);

async function lerCongregacao(rq, congregacaoId) {
  if (!congregacaoId) return null;
  const r = await rq().input("c", sql.Int, congregacaoId).query("SELECT CongregacaoId, Nome, AreaId, Ativa FROM Congregacoes WHERE CongregacaoId = @c");
  const c = r.recordset[0];
  return c ? { congregacaoId: Number(c.CongregacaoId), nome: c.Nome, areaId: c.AreaId == null ? null : Number(c.AreaId), ativa: c.Ativa === true || c.Ativa === 1 } : null;
}

// Quem lança o pré-cadastro na congregação: a secretaria (permissão "pessoas" cobrindo a congregação inteira, ou a Geral) → SECRETARIA; um professor ATIVO da EBD
// numa turma ativa da congregação, ou alguém da LIDERANÇA da congregação (Lideranca com escopo nela, em vigor) → LIDER. Senão null.
async function origemDeQuemLanca(pool, usuario, congregacao) {
  const visao = auth.visaoDaPermissao(usuario, "pessoas");
  if (visao && (ehGeral(visao) || cobreCongregacaoInteira(visao, congregacao.nome))) return "SECRETARIA";
  const r = await pool.request().input("m", sql.Int, Number(usuario.membroId)).input("c", sql.Int, congregacao.congregacaoId).query(`
    SELECT CASE WHEN EXISTS (SELECT 1 FROM EbdTurmaProfessores tp JOIN EbdTurmas t ON t.TurmaId = tp.TurmaId
                             WHERE tp.MembroId = @m AND tp.Ativo = 1 AND t.Ativa = 1 AND t.CongregacaoId = @c)
                  OR EXISTS (SELECT 1 FROM Lideranca l WHERE l.MembroId = @m AND l.EscopoTipo = N'CONGREGACAO' AND l.EscopoId = @c
                             AND (l.AtivoAte IS NULL OR l.AtivoAte >= CAST(SYSUTCDATETIME() AS DATE)))
                THEN 1 ELSE 0 END AS pode`);
  return Number(r.recordset[0].pode) === 1 ? "LIDER" : null;
}

const COLUNAS = `p.PreCadastroId, p.Origem, p.CriadoPor, p.CongregacaoId, c.Nome AS CongregacaoNome, p.Nome, ${ficha.sqlCpfMascarado("p.Cpf")} AS CpfMascarado,
  p.Email, p.Telefone, CONVERT(varchar(10), p.DataNascimento, 120) AS DataNascimento, p.Sexo, p.EstadoCivil, p.Situacao, p.Pendencias, p.MembroIdResultado,
  p.MembroIdRepetido, mr.Nome AS RepetidoNome, cr.Nome AS RepetidoCongregacao, er.Nome AS RepetidoExtensao, p.PreCadastroRepetidoId, p.ResponsavelConfirmado,
  p.RepeticaoConferida, p.CriadoEm, p.AtualizadoEm, p.DecididoEm, p.DecididoComo, p.MotivoDescarte, CONVERT(varchar(20), CONVERT(bigint, p.Versao)) AS Versao,
  p.PedidoPessoaEm, p.PedidoPessoaExpiraEm, p.PedidoPessoaRespondidoEm, CASE WHEN p.PedidoPessoaExpiraEm < SYSUTCDATETIME() THEN 1 ELSE 0 END AS PedidoPessoaVencido`;
const DE = `FROM PreCadastros p LEFT JOIN Congregacoes c ON c.CongregacaoId = p.CongregacaoId
  LEFT JOIN MembroReferencia mr ON mr.MembroId = p.MembroIdRepetido LEFT JOIN Congregacoes cr ON cr.CongregacaoId = mr.CongregacaoId
  LEFT JOIN ExtensoesTenda er ON er.ExtensaoId = mr.ExtensaoId`;

// Uma linha para a tela. A ficha repetida só aparece (matrícula e nome) para quem a alcança; para os outros, só "está fora do seu escopo: foi à Secretaria Geral".
function mapear(l, visao) {
  const pend = regras.lerPendencias(l.Pendencias);
  let repetido = null;
  if (l.MembroIdRepetido) {
    repetido = visao && (ehGeral(visao) || noEscopoDaPessoa(visao, l.RepetidoCongregacao, l.RepetidoExtensao))
      ? { matricula: Number(l.MembroIdRepetido), nome: l.RepetidoNome, congregacao: l.RepetidoCongregacao }
      : { foraDoEscopo: true, mensagem: regras.MSG.CPF_FORA_DO_ESCOPO };
  } else if (l.PreCadastroRepetidoId) {
    repetido = { preCadastroId: Number(l.PreCadastroRepetidoId) };
  }
  return { preCadastroId: Number(l.PreCadastroId), origem: l.Origem, congregacaoId: l.CongregacaoId == null ? null : Number(l.CongregacaoId), congregacao: l.CongregacaoNome,
    nome: l.Nome, cpfMascarado: l.CpfMascarado, email: l.Email, telefone: l.Telefone, dataNascimento: l.DataNascimento, sexo: l.Sexo, estadoCivil: l.EstadoCivil,
    situacao: l.Situacao, pendencias: regras.pendenciasComRotulo(pend), matricula: l.MembroIdResultado == null ? null : Number(l.MembroIdResultado), repetido,
    responsavelConfirmado: !!l.ResponsavelConfirmado, repeticaoConferida: !!l.RepeticaoConferida, criadoEm: l.CriadoEm, decididoEm: l.DecididoEm,
    decididoComo: l.DecididoComo, motivoDescarte: l.MotivoDescarte, versao: l.Versao,
    // a pessoa foi chamada a completar pelo e-mail (migração 183) e ainda não respondeu: a coluna "a pessoa completa" da esteira
    pedidoPessoa: l.PedidoPessoaEm && !l.PedidoPessoaRespondidoEm ? { em: l.PedidoPessoaEm, expiraEm: l.PedidoPessoaExpiraEm, vencido: !!l.PedidoPessoaVencido } : null,
    podeResolver: !!visao && ["PENDENTE", "CORRECAO"].includes(l.Situacao) && (ehGeral(visao) || secretariaLocalDe(visao, l.CongregacaoNome)) };
}

async function lerPreCadastro(rq, id) {
  const r = await rq().input("id", sql.Int, id).query(`SELECT ${COLUNAS} ${DE} WHERE p.PreCadastroId = @id`);
  return r.recordset[0] || null;
}
// O pré-cadastro é visível para a visão de "pessoas"? A Geral vê tudo; os outros, quando cobrem a congregação dele inteira (a área acompanha).
const visivelPara = (visao, l) => !!visao && !!l && (ehGeral(visao) || (!!l.CongregacaoNome && cobreCongregacaoInteira(visao, l.CongregacaoNome)));
// Quem completa, aceita e descarta: a secretaria local da congregação do pré-cadastro, ou a Geral (a área só acompanha).
function papelParaResolver(visao, l) {
  if (!visao || !l) return null;
  if (ehGeral(visao)) return "GERAL";
  if (l.CongregacaoNome && secretariaLocalDe(visao, l.CongregacaoNome)) return "LOCAL";
  return null;
}

// Um caso para a Secretaria Geral (um ABERTO por ficha existente, tipo e congregação que pediu: digitar de novo não duplica).
async function registrarCaso(rq, { tipo, membroIdExistente, congregacaoQuePediuId = null, pedidoPor = null, preCadastroId = null, nome = null, nascimento = null }) {
  try {
    await rq().input("t", sql.NVarChar(30), tipo).input("m", sql.Int, membroIdExistente).input("c", sql.Int, congregacaoQuePediuId).input("por", sql.Int, pedidoPor)
      .input("pc", sql.Int, preCadastroId).input("n", sql.NVarChar(200), nome ? String(nome).slice(0, 200) : null).input("nasc", sql.Date, nascimento || null)
      .query(`IF NOT EXISTS (SELECT 1 FROM CasosCadastroGeral WHERE MembroIdExistente = @m AND Tipo = @t AND ISNULL(CongregacaoQuePediuId, -1) = ISNULL(@c, -1) AND Situacao = N'ABERTO')
              INSERT INTO CasosCadastroGeral (Tipo, MembroIdExistente, CongregacaoQuePediuId, PedidoPor, PreCadastroId, NomeInformado, NascimentoInformado)
              VALUES (@t, @m, @c, @por, @pc, @n, @nasc)`);
  } catch (e) {
    if (!violouUnico(e, "UX_CasosCadastro_Aberto")) throw e;   // outro pedido abriu o mesmo caso no mesmo instante: já está com a Geral
  }
}

// ---------------------------------------------------------------- a fila: processar um pré-cadastro (o aceite automático)
// porQuem/como: quem resolveu (null/AUTOMATICO no aceite sozinho; o membroId e LOCAL/GERAL quando a secretaria completou ou aceitou).
// naoERepeticao: a secretaria conferiu que nome e nascimento parecidos NÃO são a mesma pessoa. responsavelConfirmado: o menor tem o consentimento do responsável.
// esperaMaxMs: o teto de espera pela trava do CPF (o formulário do site passa o que sobra do tempo fixo da resposta; sem a trava a tempo, nada muda e o
// pré-cadastro fica na fila sem avaliar — PENDENTE sem pendência —, para a secretaria ou para o reenvio do mesmo envio).
async function processar(pool, id, { porQuem = null, como = "AUTOMATICO", naoERepeticao = false, responsavelConfirmado = false, versaoLida = null, esperaMaxMs = 20000 } = {}) {
  return emTransacao(pool, async (t, rq) => {
    const inicio = Date.now();
    const espera = () => Math.max(0, esperaMaxMs - (Date.now() - inicio));
    const base = (await rq().input("id", sql.Int, id).query("SELECT Cpf FROM PreCadastros WHERE PreCadastroId = @id")).recordset[0];
    if (!base) return { sucesso: false, naoExiste: true, mensagem: regras.MSG.NAO_EXISTE };
    await travar(rq, base.Cpf ? `precad-cpf:${base.Cpf}` : `precad:${id}`, espera());
    let l = (await rq().input("id", sql.Int, id).query(`SELECT p.*, CONVERT(varchar(20), CONVERT(bigint, p.Versao)) AS VersaoTexto FROM PreCadastros p WITH (UPDLOCK, HOLDLOCK) WHERE p.PreCadastroId = @id`)).recordset[0];
    if (l.Cpf && l.Cpf !== base.Cpf) await travar(rq, `precad-cpf:${l.Cpf}`, espera());   // o CPF mudou entre a leitura e a trava (completar): trava o novo também
    if (versaoLida && String(l.VersaoTexto) !== String(versaoLida)) return { sucesso: false, conflito: true, mensagem: regras.MSG.MUDOU };
    if (!["PENDENTE", "CORRECAO"].includes(l.Situacao)) return { sucesso: true, situacao: l.Situacao, matricula: l.MembroIdResultado == null ? null : Number(l.MembroIdResultado), jaResolvido: true };

    const hoje = hojeBrasilia();
    const dados = { nome: l.Nome, cpf: l.Cpf ? String(l.Cpf).trim() : null, email: l.Email, telefone: l.Telefone,
      dataNascimento: l.DataNascimento ? new Date(l.DataNascimento).toISOString().slice(0, 10) : null, sexo: l.Sexo ? String(l.Sexo).trim() : null,
      estadoCivil: l.EstadoCivil, congregacaoId: l.CongregacaoId == null ? null : Number(l.CongregacaoId) };
    const responsavel = !!(responsavelConfirmado || l.ResponsavelConfirmado);
    const repeticaoConferida = !!(naoERepeticao || l.RepeticaoConferida);
    const pend = regras.pendenciasSemBanco(dados, { hojeISO: hoje, responsavelConfirmado: responsavel });
    let situacao = "PENDENTE", membroRep = null, preRep = null, congregacaoDaFichaRep = null;
    if (dados.cpf) {
      const f = (await rq().input("cpf", sql.Char(11), dados.cpf).query("SELECT TOP 1 MembroId, CongregacaoId FROM MembroReferencia WHERE Cpf = @cpf")).recordset[0];
      if (f) { situacao = "CORRECAO"; membroRep = Number(f.MembroId); congregacaoDaFichaRep = f.CongregacaoId == null ? null : Number(f.CongregacaoId); pend.push("CPF_REPETIDO"); }
      else {
        const o = (await rq().input("cpf", sql.Char(11), dados.cpf).input("id", sql.Int, id)
          .query(`SELECT TOP 1 PreCadastroId FROM PreCadastros WHERE Cpf = @cpf AND Situacao IN (${ABERTAS}) AND PreCadastroId < @id ORDER BY PreCadastroId`)).recordset[0];
        if (o) { situacao = "CORRECAO"; preRep = Number(o.PreCadastroId); pend.push("CPF_EM_OUTRO_PRECADASTRO"); }
      }
    }
    if (situacao !== "CORRECAO" && dados.nome && dados.dataNascimento && !repeticaoConferida) {
      const candidatos = (await rq().input("n", sql.Date, dados.dataNascimento).query("SELECT MembroId, Nome FROM MembroReferencia WHERE DataNascimento = @n")).recordset;
      if (candidatos.some((c) => regras.nomesParecidos(c.Nome, dados.nome))) pend.push("POSSIVEL_REPETICAO");
    }

    const gravarEstado = async (sit, pendencias, mr, pr) => {
      await rq().input("id", sql.Int, id).input("s", sql.NVarChar(12), sit).input("p", sql.NVarChar(300), pendencias.length ? pendencias.join(",") : null)
        .input("mr", sql.Int, mr).input("pr", sql.Int, pr).input("resp", sql.Bit, responsavel).input("rep", sql.Bit, repeticaoConferida)
        .query(`UPDATE PreCadastros SET Situacao = @s, Pendencias = @p, MembroIdRepetido = @mr, PreCadastroRepetidoId = @pr, ResponsavelConfirmado = @resp,
                  RepeticaoConferida = @rep, AtualizadoEm = SYSUTCDATETIME() WHERE PreCadastroId = @id`);
    };
    const avisarGeralSeFora = async (mr, congregacaoDaFicha) => {
      // a ficha repetida está noutra congregação: o caso vai também à Secretaria Geral (a local talvez não alcance a outra ficha)
      if (mr && congregacaoDaFicha !== dados.congregacaoId) {
        await registrarCaso(rq, { tipo: "PRECADASTRO_REPETIDO", membroIdExistente: mr, congregacaoQuePediuId: dados.congregacaoId, pedidoPor: l.CriadoPor == null ? null : Number(l.CriadoPor),
          preCadastroId: id, nome: dados.nome, nascimento: dados.dataNascimento });
      }
    };

    if (pend.length || situacao === "CORRECAO") {
      await gravarEstado(situacao, pend, membroRep, preRep);
      await avisarGeralSeFora(membroRep, congregacaoDaFichaRep);
      return { sucesso: true, situacao, pendencias: pend };
    }

    // ---- sem pendência: entra sozinho (a ficha nova, como CONGREGADO, com a matrícula gerada) ----
    let matricula = null;
    for (let tentativa = 0; tentativa < 6; tentativa++) {
      const numero = await matriculaNova.proximaMatricula(rq);
      await rq().query("SAVE TRANSACTION antesDaFicha");
      try {
        await rq().input("id", sql.Int, numero).input("nome", sql.NVarChar(200), dados.nome).input("c", sql.Int, dados.congregacaoId)
          .input("nasc", sql.Date, dados.dataNascimento).input("sexo", sql.NChar(1), dados.sexo).input("ec", sql.NVarChar(20), dados.estadoCivil)
          .input("email", sql.NVarChar(150), dados.email).input("tel", sql.NVarChar(20), dados.telefone).input("cpf", sql.Char(11), dados.cpf)
          .query(`INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, Sexo, EstadoCivil, Email, Telefone, Cpf)
                  VALUES (@id, @nome, @c, N'ATIVO', N'CONGREGADO', @nasc, @sexo, @ec, @email, @tel, @cpf);
                  DELETE FROM MatriculasLivres WHERE MembroId = @id;`);
        matricula = numero;
        break;
      } catch (e) {
        await rq().query("IF XACT_STATE() = 1 ROLLBACK TRANSACTION antesDaFicha");
        if (matriculaNova.ehCpfRepetido(e)) {
          // outro cadastro gravou o mesmo CPF no meio: vai para CORREÇÃO com a ficha que acabou de nascer
          const f = (await rq().input("cpf", sql.Char(11), dados.cpf).query("SELECT TOP 1 MembroId, CongregacaoId FROM MembroReferencia WHERE Cpf = @cpf")).recordset[0];
          const mr = f ? Number(f.MembroId) : null;
          if (!mr) throw e;
          await gravarEstado("CORRECAO", ["CPF_REPETIDO"], mr, null);
          await avisarGeralSeFora(mr, f.CongregacaoId == null ? null : Number(f.CongregacaoId));
          return { sucesso: true, situacao: "CORRECAO", pendencias: ["CPF_REPETIDO"] };
        }
        if (!matriculaNova.ehMatriculaRepetida(e)) throw e;   // a matrícula foi tomada por outro cadastro no mesmo instante: pede o próximo número
      }
    }
    if (!matricula) throw new Error("não foi possível gerar a matrícula do pré-cadastro");
    await rq().input("id", sql.Int, id).input("m", sql.Int, matricula).input("por", sql.Int, porQuem).input("como", sql.NVarChar(12), como)
      .input("resp", sql.Bit, responsavel).input("rep", sql.Bit, repeticaoConferida)
      .query(`UPDATE PreCadastros SET Situacao = N'ACEITO', Pendencias = NULL, MembroIdResultado = @m, MembroIdRepetido = NULL, PreCadastroRepetidoId = NULL,
                ResponsavelConfirmado = @resp, RepeticaoConferida = @rep, DecididoEm = SYSUTCDATETIME(), DecididoPor = @por, DecididoComo = @como,
                AtualizadoEm = SYSUTCDATETIME() WHERE PreCadastroId = @id`);
    await registrarAuditoriaNaTransacao(t, { tabela: "MembroReferencia", registroId: matricula, acao: "Cadastrou pessoa pelo pré-cadastro", usuarioId: porQuem,
      dadosDepois: { preCadastroId: id, origem: l.Origem, congregacaoId: dados.congregacaoId, aceite: como, cpf: ficha.mascararCpf(dados.cpf) } });
    return { sucesso: true, situacao: "ACEITO", matricula };
  });
}

// ---------------------------------------------------------------- lançar (líder, secretaria ou o site)
async function inserir(pool, dados, { origem, criadoPor = null, consentimento = null, origemHash = null }) {
  const r = await pool.request().input("o", sql.NVarChar(12), origem).input("por", sql.Int, criadoPor).input("c", sql.Int, dados.congregacaoId)
    .input("nome", sql.NVarChar(200), dados.nome).input("cpf", sql.Char(11), dados.cpf).input("email", sql.NVarChar(150), dados.email)
    .input("tel", sql.NVarChar(20), dados.telefone).input("nasc", sql.Date, dados.dataNascimento).input("sexo", sql.NChar(1), dados.sexo)
    .input("ec", sql.NVarChar(20), dados.estadoCivil).input("cv", sql.NVarChar(20), consentimento ? consentimento.versao : null)
    .input("cb", sql.NVarChar(30), consentimento ? consentimento.base : null).input("h", sql.Char(16), origemHash)
    .query(`INSERT INTO PreCadastros (Origem, CriadoPor, CongregacaoId, Nome, Cpf, Email, Telefone, DataNascimento, Sexo, EstadoCivil, ConsentimentoVersao, ConsentimentoBase,
              ConsentimentoEm, OrigemHash)
            OUTPUT INSERTED.PreCadastroId
            VALUES (@o, @por, @c, @nome, @cpf, @email, @tel, @nasc, @sexo, @ec, @cv, @cb, CASE WHEN @cv IS NULL THEN NULL ELSE SYSUTCDATETIME() END, @h)`);
  return Number(r.recordset[0].PreCadastroId);
}

// ---------------------------------------------------------------- o formulário do site ("Quero me cadastrar")
// O identificador de UM envio do formulário (a página gera 32 letras hexadecimais ao acaso; o mesmo envio repetido traz o mesmo).
const ENVIO_ID = /^[0-9a-f]{32}$/;
const TRAVA_DO_SITE = "precad-site:limites";

// Grava o pré-cadastro do site NUMA transação, debaixo de uma trava só do formulário público (sp_getapplock, dona a transação), na ordem:
//  1. o mesmo envio já gravado (EnvioId)? devolve ele, sem contar nem gravar de novo (o reenvio depois de um prazo esgotado não duplica);
//  2. a contagem da última hora (de quem enviou, e no total) — o limite mora no banco e vale para todas as instâncias;
//  3. a gravação.
// Revisão de 20/11/2026: a contagem e a gravação andavam separadas e uma rajada passava dos limites. A trava serializa só os envios do site (alguns
// milissegundos cada; o limite é de 200 por hora): a fila, a secretaria e o líder não esperam por ela, e a tabela não fica travada. O índice único
// UX_PreCadastros_Envio (migração 184) é a última trava do envio repetido.
// Devolve { id, repetido, avaliado } (avaliado: o processamento já passou por ele — não está PENDENTE sem pendência) ou { limite: true }.
async function inserirDoSite(pool, dados, { envioId, consentimento, origemHash = null, porVisitanteHora, totalHora, esperaMs = 10000 }) {
  if (typeof envioId !== "string" || !ENVIO_ID.test(envioId)) throw new Error("inserirDoSite: envioId inválido");
  const lerRepetido = async (rq) => {
    const l = (await rq().input("e", sql.Char(32), envioId).query("SELECT PreCadastroId, Situacao, Pendencias FROM PreCadastros WHERE EnvioId = @e")).recordset[0];
    return l ? { id: Number(l.PreCadastroId), repetido: true, avaliado: !(l.Situacao === "PENDENTE" && l.Pendencias == null) } : null;
  };
  try {
    return await emTransacao(pool, async (t, rq) => {
      await travar(rq, TRAVA_DO_SITE, esperaMs);
      const repetido = await lerRepetido(rq);
      if (repetido) return repetido;
      const c = (await rq().input("h", sql.Char(16), origemHash).query(`
        SELECT COUNT(*) AS total, SUM(CASE WHEN @h IS NOT NULL AND OrigemHash = @h THEN 1 ELSE 0 END) AS daOrigem
        FROM PreCadastros WHERE Origem = N'SITE' AND CriadoEm >= DATEADD(HOUR, -1, SYSUTCDATETIME())`)).recordset[0];
      if (Number(c.total || 0) >= totalHora || (origemHash && Number(c.daOrigem || 0) >= porVisitanteHora)) return { limite: true };
      const r = await rq().input("c", sql.Int, dados.congregacaoId)
        .input("nome", sql.NVarChar(200), dados.nome).input("cpf", sql.Char(11), dados.cpf).input("email", sql.NVarChar(150), dados.email)
        .input("tel", sql.NVarChar(20), dados.telefone).input("nasc", sql.Date, dados.dataNascimento).input("sexo", sql.NChar(1), dados.sexo)
        .input("ec", sql.NVarChar(20), dados.estadoCivil).input("cv", sql.NVarChar(20), consentimento.versao).input("cb", sql.NVarChar(30), consentimento.base)
        .input("h", sql.Char(16), origemHash).input("e", sql.Char(32), envioId)
        .query(`INSERT INTO PreCadastros (Origem, CongregacaoId, Nome, Cpf, Email, Telefone, DataNascimento, Sexo, EstadoCivil, ConsentimentoVersao, ConsentimentoBase,
                  ConsentimentoEm, OrigemHash, EnvioId)
                OUTPUT INSERTED.PreCadastroId
                VALUES (N'SITE', @c, @nome, @cpf, @email, @tel, @nasc, @sexo, @ec, @cv, @cb, SYSUTCDATETIME(), @h, @e)`);
      return { id: Number(r.recordset[0].PreCadastroId), repetido: false, avaliado: false };
    });
  } catch (e) {
    // o mesmo envio gravado no mesmo instante por outro caminho (a trava deveria impedir; o índice único garante): é o mesmo envio
    if (!violouUnico(e, "UX_PreCadastros_Envio")) throw e;
    const repetido = await lerRepetido(() => pool.request());
    if (!repetido) throw e;
    return repetido;
  }
}

// ---------------------------------------------------------------- a secretaria: completar, aceitar, descartar
// Completar: os campos mandados substituem os do pré-cadastro (a congregação, só a Geral muda); depois processa (sem pendência, entra sozinho).
async function completar(pool, { id, campos, papel, por, versaoLida, naoERepeticao = false, responsavelConfirmado = false }) {
  const r = await emTransacao(pool, async (t, rq) => {
    const l = (await rq().input("id", sql.Int, id).query(`SELECT *, CONVERT(varchar(20), CONVERT(bigint, Versao)) AS VersaoTexto FROM PreCadastros WITH (UPDLOCK, HOLDLOCK) WHERE PreCadastroId = @id`)).recordset[0];
    if (!l) return { sucesso: false, mensagem: regras.MSG.NAO_EXISTE };
    if (!["PENDENTE", "CORRECAO"].includes(l.Situacao)) return { sucesso: false, conflito: true, mensagem: regras.MSG.JA_RESOLVIDO };
    if (versaoLida && String(l.VersaoTexto) !== String(versaoLida)) return { sucesso: false, conflito: true, mensagem: regras.MSG.MUDOU };
    const atual = { nome: l.Nome, cpf: l.Cpf ? String(l.Cpf).trim() : null, email: l.Email, telefone: l.Telefone,
      dataNascimento: l.DataNascimento ? new Date(l.DataNascimento).toISOString().slice(0, 10) : null, sexo: l.Sexo ? String(l.Sexo).trim() : null,
      estadoCivil: l.EstadoCivil, congregacaoId: l.CongregacaoId == null ? null : Number(l.CongregacaoId) };
    const novo = { ...atual };
    for (const k of ["nome", "cpf", "email", "telefone", "dataNascimento", "sexo", "estadoCivil", "congregacaoId"]) if (Object.prototype.hasOwnProperty.call(campos, k)) novo[k] = campos[k];
    const lido = regras.lerEntrada(novo, { hojeISO: hojeBrasilia() });
    if (!lido.ok) return { sucesso: false, mensagem: lido.mensagem };
    const d = lido.dados;
    if (d.congregacaoId !== atual.congregacaoId && papel !== "GERAL") return { sucesso: false, proibido: true, mensagem: regras.MSG.SO_GERAL_CONGREGACAO };
    if (d.congregacaoId !== atual.congregacaoId) {
      const c = await lerCongregacao(rq, d.congregacaoId);
      if (!c || !c.ativa) return { sucesso: false, mensagem: "Congregação inválida." };
    }
    const cpfMudou = d.cpf !== atual.cpf;
    await rq().input("id", sql.Int, id).input("c", sql.Int, d.congregacaoId).input("nome", sql.NVarChar(200), d.nome).input("cpf", sql.Char(11), d.cpf)
      .input("email", sql.NVarChar(150), d.email).input("tel", sql.NVarChar(20), d.telefone).input("nasc", sql.Date, d.dataNascimento)
      .input("sexo", sql.NChar(1), d.sexo).input("ec", sql.NVarChar(20), d.estadoCivil).input("limpa", sql.Bit, cpfMudou)
      .query(`UPDATE PreCadastros SET CongregacaoId = @c, Nome = @nome, Cpf = @cpf, Email = @email, Telefone = @tel, DataNascimento = @nasc, Sexo = @sexo,
                EstadoCivil = @ec, AtualizadoEm = SYSUTCDATETIME(),
                Situacao = CASE WHEN @limpa = 1 THEN N'PENDENTE' ELSE Situacao END,
                MembroIdRepetido = CASE WHEN @limpa = 1 THEN NULL ELSE MembroIdRepetido END,
                PreCadastroRepetidoId = CASE WHEN @limpa = 1 THEN NULL ELSE PreCadastroRepetidoId END
              WHERE PreCadastroId = @id`);
    await registrarAuditoriaNaTransacao(t, { tabela: "PreCadastros", registroId: id, acao: "Completou pré-cadastro", usuarioId: por,
      dadosDepois: { campos: Object.keys(campos).filter((k) => k !== "cpf"), cpfAlterado: cpfMudou, cpf: cpfMudou ? ficha.mascararCpf(d.cpf) : undefined } });
    return { sucesso: true };
  });
  if (!r.sucesso) return r;
  return processar(pool, id, { porQuem: por, como: papel, naoERepeticao, responsavelConfirmado });
}

async function descartar(pool, { id, papel, por, motivo, versaoLida }) {
  const m = regras.motivoLimpo(motivo);
  if (!m) return { sucesso: false, mensagem: regras.MSG.MOTIVO_DESCARTE };
  return emTransacao(pool, async (t, rq) => {
    const l = (await rq().input("id", sql.Int, id).query(`SELECT Situacao, CONVERT(varchar(20), CONVERT(bigint, Versao)) AS VersaoTexto FROM PreCadastros WITH (UPDLOCK, HOLDLOCK) WHERE PreCadastroId = @id`)).recordset[0];
    if (!l) return { sucesso: false, mensagem: regras.MSG.NAO_EXISTE };
    if (!["PENDENTE", "CORRECAO"].includes(l.Situacao)) return { sucesso: false, conflito: true, mensagem: regras.MSG.JA_RESOLVIDO };
    if (versaoLida && String(l.VersaoTexto) !== String(versaoLida)) return { sucesso: false, conflito: true, mensagem: regras.MSG.MUDOU };
    await rq().input("id", sql.Int, id).input("por", sql.Int, por).input("como", sql.NVarChar(12), papel).input("m", sql.NVarChar(300), m)
      .query(`UPDATE PreCadastros SET Situacao = N'DESCARTADO', MembroIdRepetido = NULL, PreCadastroRepetidoId = NULL, MotivoDescarte = @m, DecididoEm = SYSUTCDATETIME(),
                DecididoPor = @por, DecididoComo = @como, AtualizadoEm = SYSUTCDATETIME() WHERE PreCadastroId = @id`);
    await registrarAuditoriaNaTransacao(t, { tabela: "PreCadastros", registroId: id, acao: "Descartou pré-cadastro", usuarioId: por, dadosDepois: { motivo: m } });
    return { sucesso: true, situacao: "DESCARTADO" };
  });
}

// ---------------------------------------------------------------- a fila (listar), no escopo
const POR_PAGINA_MAX = 50;
async function listar(pool, visao, { caixa = "fila", pagina = 1, porPagina = 30 } = {}) {
  const pg = Math.min(Math.max(parseInt(pagina, 10) || 1, 1), 100000);
  const pp = Math.min(Math.max(parseInt(porPagina, 10) || 30, 1), POR_PAGINA_MAX);
  const pedido = pool.request();
  const condEscopo = ehGeral(visao) ? null : await condicaoSqlEscopoCongregacao(pool, visao, pedido, "p.CongregacaoId");
  if (condEscopo === "") return { itens: [], total: 0, pagina: pg, porPagina: pp };
  const situacoes = caixa === "aceitos" ? "N'ACEITO'" : caixa === "descartados" ? "N'DESCARTADO'" : ABERTAS;
  const onde = `WHERE p.Situacao IN (${situacoes})${condEscopo ? ` AND ${condEscopo}` : ""}`;
  pedido.input("pular", sql.Int, (pg - 1) * pp).input("trazer", sql.Int, pp);
  const r = await pedido.query(`SELECT COUNT(*) AS total FROM PreCadastros p ${onde};
    SELECT ${COLUNAS} ${DE} ${onde} ORDER BY CASE p.Situacao WHEN N'CORRECAO' THEN 0 ELSE 1 END, p.CriadoEm, p.PreCadastroId OFFSET @pular ROWS FETCH NEXT @trazer ROWS ONLY`);
  const itens = r.recordsets[1].filter((l) => visivelPara(visao, l)).map((l) => mapear(l, visao));   // segunda trava (o banco filtrou pela união dos escopos)
  return { itens, total: Number(r.recordsets[0][0].total), pagina: pg, porPagina: pp };
}
// Os que EU lancei (o professor/líder acompanha só os seus: o nome e a situação — sem CPF nem contato).
async function meus(pool, membroId) {
  const r = await pool.request().input("m", sql.Int, membroId).query(`
    SELECT TOP 50 p.PreCadastroId, p.Nome, c.Nome AS CongregacaoNome, p.Situacao, p.CriadoEm, p.DecididoEm FROM PreCadastros p
    LEFT JOIN Congregacoes c ON c.CongregacaoId = p.CongregacaoId WHERE p.CriadoPor = @m ORDER BY p.PreCadastroId DESC`);
  return r.recordset.map((l) => ({ preCadastroId: Number(l.PreCadastroId), nome: l.Nome, congregacao: l.CongregacaoNome,
    situacao: l.Situacao === "ACEITO" ? "ACEITO" : l.Situacao === "DESCARTADO" ? "DESCARTADO" : "NA_FILA", criadoEm: l.CriadoEm, decididoEm: l.DecididoEm }));
}

// ---------------------------------------------------------------- a conferência ao digitar (cadastro pelo sistema)
// cpf (texto, pode vir mascarado/incompleto), nome, dataNascimento, congregacaoId (onde a pessoa vai ser cadastrada), excluirMembroId (a ficha em edição).
// CPF que já existe NÃO deixa concluir: no escopo de quem cadastra, devolve a ficha (para ir até ela); FORA do escopo, devolve só que já tem cadastro e REGISTRA o caso
// para a Secretaria Geral — sem nome, congregação ou matrícula da outra ficha. Nome + nascimento parecidos: só aviso, e só das fichas que quem cadastra alcança.
async function conferir(pool, visao, { cpf, nome, dataNascimento, congregacaoId = null, excluirMembroId = null, soCpf = false }) {
  const saida = { cpf: { situacao: "SEM_CPF" }, parecidos: [], bloqueia: false };
  const c = ficha.lerCpf(cpf);
  if (cpf !== undefined && cpf !== null && String(cpf).trim() !== "") {
    if (!c.ok) saida.cpf = { situacao: "INVALIDO", mensagem: c.mensagem };
    else {
      const f = (await pool.request().input("cpf", sql.Char(11), c.cpf).input("ex", sql.Int, excluirMembroId).query(`
        SELECT TOP 1 m.MembroId, m.Nome, cg.Nome AS CongregacaoNome, e.Nome AS ExtensaoNome FROM MembroReferencia m
        LEFT JOIN Congregacoes cg ON cg.CongregacaoId = m.CongregacaoId LEFT JOIN ExtensoesTenda e ON e.ExtensaoId = m.ExtensaoId
        WHERE m.Cpf = @cpf AND (@ex IS NULL OR m.MembroId <> @ex)`)).recordset[0];
      if (!f) saida.cpf = { situacao: "LIVRE" };
      else if (ehGeral(visao) || noEscopoDaPessoa(visao, f.CongregacaoNome, f.ExtensaoNome)) {
        saida.cpf = { situacao: "NO_ESCOPO", matricula: Number(f.MembroId), nome: f.Nome, congregacao: f.CongregacaoNome,
          mensagem: `Este CPF já está na ficha de ${f.Nome} (matrícula ${f.MembroId}). Abra essa ficha em vez de cadastrar de novo.` };
        saida.bloqueia = true;
      } else {
        await registrarCaso(() => pool.request(), { tipo: "CPF_FORA_DO_ESCOPO", membroIdExistente: Number(f.MembroId), congregacaoQuePediuId: congregacaoId,
          pedidoPor: Number(visao.membroId) || null, nome: typeof nome === "string" ? nome.trim() : null, nascimento: regras.dataNoCalendario(dataNascimento) ? dataNascimento : null });
        saida.cpf = { situacao: "FORA_DO_ESCOPO", mensagem: regras.MSG.CPF_FORA_DO_ESCOPO, enviadoGeral: true };
        saida.bloqueia = true;
      }
    }
  }
  if (!soCpf && typeof nome === "string" && nome.trim().length >= 2 && regras.dataNoCalendario(dataNascimento)) {
    const r = await pool.request().input("n", sql.Date, dataNascimento).input("ex", sql.Int, excluirMembroId).query(`
      SELECT TOP 200 m.MembroId, m.Nome, cg.Nome AS CongregacaoNome, e.Nome AS ExtensaoNome FROM MembroReferencia m
      LEFT JOIN Congregacoes cg ON cg.CongregacaoId = m.CongregacaoId LEFT JOIN ExtensoesTenda e ON e.ExtensaoId = m.ExtensaoId
      WHERE m.DataNascimento = @n AND (@ex IS NULL OR m.MembroId <> @ex)`);
    saida.parecidos = r.recordset.filter((l) => regras.nomesParecidos(l.Nome, nome) && (ehGeral(visao) || noEscopoDaPessoa(visao, l.CongregacaoNome, l.ExtensaoNome)))
      .slice(0, 10).map((l) => ({ matricula: Number(l.MembroId), nome: l.Nome, congregacao: l.CongregacaoNome }));
  }
  return saida;
}

// ---------------------------------------------------------------- os casos da Secretaria Geral
async function listarCasos(pool, { situacao = "ABERTO" } = {}) {
  const r = await pool.request().input("s", sql.NVarChar(12), situacao === "RESOLVIDO" ? "RESOLVIDO" : "ABERTO").query(`
    SELECT TOP 200 k.CasoId, k.Tipo, k.MembroIdExistente, m.Nome AS NomeExistente, cm.Nome AS CongregacaoExistente, k.CongregacaoQuePediuId, cp.Nome AS CongregacaoQuePediu,
           k.PedidoPor, k.PreCadastroId, k.NomeInformado, CONVERT(varchar(10), k.NascimentoInformado, 120) AS NascimentoInformado, k.Situacao, k.CriadoEm, k.ResolvidoEm, k.Nota
    FROM CasosCadastroGeral k JOIN MembroReferencia m ON m.MembroId = k.MembroIdExistente LEFT JOIN Congregacoes cm ON cm.CongregacaoId = m.CongregacaoId
    LEFT JOIN Congregacoes cp ON cp.CongregacaoId = k.CongregacaoQuePediuId WHERE k.Situacao = @s ORDER BY k.CriadoEm DESC, k.CasoId DESC`);
  return r.recordset.map((k) => ({ casoId: Number(k.CasoId), tipo: k.Tipo, fichaExistente: { matricula: Number(k.MembroIdExistente), nome: k.NomeExistente, congregacao: k.CongregacaoExistente },
    congregacaoQuePediu: k.CongregacaoQuePediu, pedidoPor: k.PedidoPor == null ? null : Number(k.PedidoPor), preCadastroId: k.PreCadastroId == null ? null : Number(k.PreCadastroId),
    nomeInformado: k.NomeInformado, nascimentoInformado: k.NascimentoInformado, situacao: k.Situacao, criadoEm: k.CriadoEm, resolvidoEm: k.ResolvidoEm, nota: k.Nota }));
}
async function resolverCaso(pool, { casoId, por, nota }) {
  const n = regras.motivoLimpo(nota);
  if (!n) return { sucesso: false, mensagem: "Diga como o caso foi resolvido." };
  const r = await pool.request().input("id", sql.Int, casoId).input("por", sql.Int, por).input("n", sql.NVarChar(500), n)
    .query(`UPDATE CasosCadastroGeral SET Situacao = N'RESOLVIDO', ResolvidoEm = SYSUTCDATETIME(), ResolvidoPor = @por, Nota = @n WHERE CasoId = @id AND Situacao = N'ABERTO'`);
  return r.rowsAffected && r.rowsAffected[0] ? { sucesso: true } : { sucesso: false, mensagem: "Caso não encontrado ou já resolvido." };
}

module.exports = { ENVIO_ID, hashOrigem, lerCongregacao, origemDeQuemLanca, mapear, lerPreCadastro, visivelPara, papelParaResolver, registrarCaso, processar, inserir,
  inserirDoSite, completar, descartar, listar, meus, conferir, listarCasos, resolverCaso };
