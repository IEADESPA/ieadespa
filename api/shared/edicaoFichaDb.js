// shared/edicaoFichaDb.js (FASE 10, v10.1b passo 5, 18/11/2026) — a leitura e a gravação da edição CAMPO A CAMPO, o que o MEMBRO grava sozinho (Meus Dados),
// as SUGESTÕES dele, a CAIXA DE SUGESTÕES da secretaria e o HISTÓRICO de alterações da ficha (as regras puras estão em shared/edicaoFicha.js).
// Toda gravação é numa transação com a ficha travada (UPDLOCK) e confere o valor de AGORA, não o da tela: o que mudou no meio (outra secretaria, uma sugestão
// aplicada, o próprio membro) nunca é sobrescrito sem ver ("mudou enquanto você editava" = 409). A trilha (AuditLog) vai na mesma transação, com o CPF, o
// e-mail e o telefone mascarados. O endereço passa por shared/territorioDb.js (as linhas e o bairro da lista, travado antes da ficha).
const { sql } = require("./db");
const { registrarAuditoriaNaTransacao } = require("./auditoria");
const regras = require("./edicaoFicha");
const { condicaoSqlEscopoPessoa, noEscopoDaPessoa } = require("./escopoRotas");
const territorioDb = require("./territorioDb");

const SAIDAS_DISCIPLINARES = new Set(["EXCLUSAO", "ABANDONO_MATERIAL", "ABANDONO_DIGITAL"]);
const MSG_CPF_REPETIDO = "Esse CPF já está na ficha de outra pessoa. Se for a mesma pessoa, as duas fichas precisam ser juntadas.";
const MSG_CPF_REPETIDO_MEMBRO = "Este CPF já está em outro cadastro. A Secretaria Geral vai conferir (pode ser uma ficha sua em dobro); se precisar, procure a secretaria da sua congregação.";
const erroNumero = (e) => e && (e.number || (e.originalError && e.originalError.info && e.originalError.info.number));
const violouCpfUnico = (e) => [2601, 2627].includes(erroNumero(e)) && /UX_MembroReferencia_Cpf/i.test(String(e && e.message));

// A transação de toda gravação: a mesma de shared/territorioDb.js (trava o bairro da lista, se houver, ANTES da ficha — a ordem da renomeação do bairro).
// `fazer(rq, t)` devolve { sucesso, ... }; sucesso === false desfaz tudo.
function emTransacao(pool, prepEnd, fazer) {
  return territorioDb.gravarComBairroTravado(pool, prepEnd || null, async (rq, t) => {
    const r = await fazer(rq, t);
    return r && r.sucesso === false ? { ...r, desfazer: true } : r;
  });
}

const tipoSql = (c) => (c.tipo === "data" ? sql.Date : c.tipo === "departamento" || c.tipo === "extensao" ? sql.Int : c.tipo === "cpf" ? sql.Char(11) : c.coluna === "Sexo" ? sql.NChar(1)
  : c.tipo === "simnao" ? sql.Bit : c.tipo === "situacao" || c.tipo === "cargo" ? sql.NVarChar(30) : c.tipo === "status" ? sql.NVarChar(20) : sql.NVarChar(300));
const mesmo = (a, b) => (a === null || a === undefined ? null : String(a)) === (b === null || b === undefined ? null : String(b));
const COLUNAS = Object.values(regras.CAMPOS).filter((c) => c.coluna).map((c) => `m.${c.coluna}`).join(", ");

// A ficha com tudo o que as regras precisam: os campos, a congregação/Extensão (escopo), o processo de cargo em andamento e a exclusão julgada (as mesmas
// consultas do cadastro, GestaoPessoas). `travar` = UPDLOCK na ficha (dentro da transação).
async function lerFicha(rq, membroId, { travar = false } = {}) {
  const r = await rq().input("id", sql.Int, membroId).query(`
    SELECT m.MembroId, m.Status AS StatusAtual, m.CongregacaoId, ${COLUNAS}, c.Nome AS CongregacaoNome, e.Nome AS ExtensaoNome,
           (SELECT CONVERT(varchar(10), MAX(hc.Desde), 120) FROM CargosMinisteriaisHistorico hc WHERE hc.MembroId = m.MembroId AND hc.Ate IS NULL AND hc.Cargo = m.CargoMinisterial) AS CargoDesde,
           CASE WHEN EXISTS (SELECT 1 FROM Consagracoes cs LEFT JOIN TiposConsagracao tc ON tc.Nome = cs.Assunto
                             WHERE cs.MembroId = m.MembroId AND ISNULL(cs.CargoAlvo, tc.CargoMinisterialResultante) IS NOT NULL
                             AND cs.Status IN (N'PROTOCOLADO', N'EM_ANALISE_CONSELHO', N'AGUARDANDO_PLENARIO', N'HOMOLOGADO')) THEN 1 ELSE 0 END AS EmProcessoDeCargo,
           CASE WHEN EXISTS (SELECT 1 FROM ProcessosDisciplinares pdx WHERE pdx.MembroId = m.MembroId AND pdx.Resultado = N'EXCLUSAO' AND pdx.CEIRecusouEm IS NULL
                             AND pdx.Status IN (N'JULGADO', N'EM_RECURSO')) THEN 1 ELSE 0 END AS TemExclusao
    FROM MembroReferencia m ${travar ? "WITH (UPDLOCK, ROWLOCK)" : ""}
    LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    LEFT JOIN ExtensoesTenda e ON e.ExtensaoId = m.ExtensaoId
    WHERE m.MembroId = @id`);
  const l = r.recordset[0];
  if (!l) return null;
  const valores = {};
  for (const [chave, c] of Object.entries(regras.CAMPOS)) valores[chave] = regras.valorParaTexto(c.coluna ? l[c.coluna] : chave === "cargoDesde" ? l.CargoDesde : null);
  return { membroId: l.MembroId, status: l.StatusAtual, congregacaoId: l.CongregacaoId == null ? null : Number(l.CongregacaoId), congregacaoNome: l.CongregacaoNome || null, extensaoNome: l.ExtensaoNome || null,
    emProcessoDeCargo: !!l.EmProcessoDeCargo, temExclusao: !!l.TemExclusao, valores };
}

// O valor como a tela da secretaria mostra: o CPF sempre mascarado (o número inteiro só pelo "Mostrar" da Geral, que registra a leitura — passo 1).
const valorParaTela = (chave, v) => (chave === "cpf" ? regras.mascarar("cpf", v) : v);

// O que a secretaria vê da ficha para editar: cada campo com o valor, se pode mudar e, se não pode, por quê.
// `opcoes` (opcoesDaFicha): as listas que vêm do banco — a situação, o cargo, as Extensões da congregação da pessoa e a situação no rol — com o nome de cada uma.
function camposParaSecretaria(ficha, papel, ehProprio, opcoes = {}) {
  return Object.entries(regras.CAMPOS).map(([chave, c]) => {
    const p = regras.podeSecretariaMudar(chave, { papel, ehProprio, valorAtual: ficha.valores[chave], emProcessoDeCargo: ficha.emProcessoDeCargo, temExclusao: ficha.temExclusao });
    const doBanco = Object.prototype.hasOwnProperty.call(opcoes, chave) ? opcoes[chave] : null;
    return { chave, rotulo: c.rotulo, grupo: c.grupo, tipo: c.tipo, opcoes: doBanco ? doBanco.map((o) => o.codigo) : c.lista || null,
      ...(doBanco ? { rotulosOpcoes: Object.fromEntries(doBanco.map((o) => [o.codigo, o.rotulo])) } : {}),
      valor: valorParaTela(chave, ficha.valores[chave]), pode: p.pode, motivo: p.motivo };
  });
}
const ROTULO_STATUS = { ATIVO: "Ativo", INATIVO: "Inativo", FALECIDO: "Falecido" };
async function opcoesDaFicha(rq, ficha) {
  const r = await rq().input("c", sql.Int, ficha.congregacaoId).input("e", sql.Int, ficha.valores.extensaoId ? Number(ficha.valores.extensaoId) : null).query(`
    SELECT Sigla AS codigo, Nome AS rotulo FROM SituacoesMembro WHERE Ativa = 1 ORDER BY SituacaoId;
    SELECT Sigla AS codigo, Nome AS rotulo FROM CargosMinisteriais WHERE Ativo = 1 ORDER BY ISNULL(Ordem, 999), Nome;
    SELECT CAST(ExtensaoId AS NVARCHAR(12)) AS codigo, Nome AS rotulo FROM ExtensoesTenda WHERE CongregacaoMaeId = @c AND (Ativa = 1 OR ExtensaoId = @e) ORDER BY Nome;`);
  const rs = r.recordsets || [];
  return { situacaoMembro: rs[0] || [], cargoMinisterial: rs[1] || [], extensaoId: rs[2] || [],
    status: regras.STATUS_DA_FICHA.map((codigo) => ({ codigo, rotulo: ROTULO_STATUS[codigo] })) };
}

// ---------------------------------------------------------------- a secretaria, um campo por vez
// `valorLido` = o valor que a tela mostrava (texto; para o CPF, o mascarado; para o endereço, a linha única): se a ficha já tem outro, 409. `valor` do endereço
// = as linhas (enderecoPartes). Devolve { sucesso, status, mensagem, valor?, emailAnterior? }.
async function gravarCampoSecretaria(pool, { visao, membroId, chave, valor, valorLido, hoje }) {
  if (!regras.ehCampo(chave)) return { sucesso: false, status: 422, mensagem: regras.OUTRO_CAMINHO[chave] || "Este campo não muda por aqui." };
  const papel = regras.papelNaFicha(visao);
  const c = regras.CAMPOS[chave];
  let novo, prepEnd = null;
  if (chave === "endereco") {
    if (!valor || typeof valor !== "object") return { sucesso: false, status: 200, mensagem: "Informe o endereço nas linhas (rua, número, bairro, cidade)." };
    const prep = await territorioDb.prepararEnderecoMembro(() => pool.request(), valor, { membroId });
    if (!prep.sucesso) return { sucesso: false, status: 200, mensagem: prep.mensagem };
    prepEnd = { partes: prep.partes, endereco: prep.endereco };
  } else {
    const v = regras.validar(chave, valor, hoje);
    if (!v.ok) return { sucesso: false, status: 200, mensagem: v.mensagem };
    novo = v.valor;
  }
  // o papel e as travas ANTES de qualquer outra coisa (a conferência do CPF abre caso na Geral: só para quem pode mudar o campo); a transação confere de novo
  const previa = await lerFicha(() => pool.request(), membroId);
  if (!previa || !noEscopoDaPessoa(visao, previa.congregacaoNome, previa.extensaoNome)) return { sucesso: false, status: 200, mensagem: "Matrícula não encontrada." };
  const pp = regras.podeSecretariaMudar(chave, { papel, ehProprio: Number(membroId) === Number(visao.membroId), valorAtual: previa.valores[chave],
    emProcessoDeCargo: previa.emProcessoDeCargo, temExclusao: previa.temExclusao });
  if (!pp.pode) return { sucesso: false, status: 403, mensagem: pp.motivo };
  // o CPF que já está noutra ficha: a mesma conferência do cadastro (passo 4) — no escopo, a matrícula; fora dele, "já tem cadastro" e o caso vai à Geral
  if (chave === "cpf" && novo && novo !== previa.valores.cpf) {
    const conf = await require("./preCadastroDb").conferir(pool, visao, { cpf: novo, excluirMembroId: Number(membroId), soCpf: true });
    if (conf.bloqueia) return { sucesso: false, status: 200, mensagem: conf.cpf.mensagem, cpfRepetido: conf.cpf.situacao, ...(conf.cpf.matricula ? { matricula: conf.cpf.matricula } : {}) };
  }
  // o que roda DEPOIS da transação (como no cadastro completo): o histórico de cargos, a vacância e a credencial do falecimento, as sessões de quem saiu do ativo
  let depois = null;
  try {
    const r = await emTransacao(pool, prepEnd, async (rq, t) => {
      const ficha = await lerFicha(rq, membroId, { travar: true });
      if (!ficha || !noEscopoDaPessoa(visao, ficha.congregacaoNome, ficha.extensaoNome)) return { sucesso: false, status: 200, mensagem: "Matrícula não encontrada." };
      const atual = ficha.valores[chave];
      const p = regras.podeSecretariaMudar(chave, { papel, ehProprio: Number(membroId) === Number(visao.membroId), valorAtual: atual,
        emProcessoDeCargo: ficha.emProcessoDeCargo, temExclusao: ficha.temExclusao });
      if (!p.pode) return { sucesso: false, status: 403, mensagem: p.motivo };
      if (valorLido !== undefined && !mesmo(valorParaTela(chave, atual), valorLido === "" ? null : valorLido)) {
        return { sucesso: false, status: 409, mensagem: `${c.rotulo} mudou enquanto você editava. Abra a ficha de novo para ver o valor de agora.` };
      }
      if (chave === "endereco") {
        novo = prepEnd.endereco;   // a linha refeita sob a trava do bairro
        const gravar = rq().input("id", sql.Int, membroId).input("endereco", sql.NVarChar(300), novo);
        territorioDb.entradasEndereco(gravar, prepEnd.partes);
        await gravar.query(`UPDATE MembroReferencia SET Endereco = @endereco, ${territorioDb.SET_ENDERECO} WHERE MembroId = @id`);
      } else {
        if (mesmo(atual, novo)) return { sucesso: true, status: 200, mensagem: "Nada mudou.", valor: valorParaTela(chave, atual) };
        if (chave === "departamentoId" && novo != null) {
          const d = await rq().input("d", sql.Int, novo).query(`SELECT TOP 1 1 AS x FROM Departamentos WHERE DepartamentoId = @d`);
          if (!d.recordset.length) return { sucesso: false, status: 200, mensagem: "Departamento inválido." };
        }
        // os campos que vieram do cadastro completo (as sobras do passo 7a): o catálogo, a Extensão da congregação da pessoa, a saída e a readmissão
        if (c.tipo === "situacao") {
          const x = await rq().input("v", sql.NVarChar(30), novo).query(`SELECT TOP 1 1 AS x FROM SituacoesMembro WHERE Sigla = @v`);
          if (!x.recordset.length) return { sucesso: false, status: 200, mensagem: "Situação: escolha uma opção da lista." };
        }
        if (c.tipo === "cargo" && novo != null) {
          const x = await rq().input("v", sql.NVarChar(30), novo).query(`SELECT TOP 1 1 AS x FROM CargosMinisteriais WHERE Sigla = @v`);
          if (!x.recordset.length) return { sucesso: false, status: 200, mensagem: "Cargo: escolha uma opção da lista." };
        }
        if (c.tipo === "extensao" && novo != null) {
          const x = await rq().input("v", sql.Int, novo).input("c", sql.Int, ficha.congregacaoId).input("e", sql.Int, atual ? Number(atual) : null)
            .query(`SELECT TOP 1 Nome FROM ExtensoesTenda WHERE ExtensaoId = @v AND CongregacaoMaeId = @c AND (Ativa = 1 OR ExtensaoId = @e)`);
          if (!x.recordset.length) return { sucesso: false, status: 200, mensagem: "Extensão da Tenda inválida (inativa, emancipada ou de outra congregação)." };
          if (!noEscopoDaPessoa(visao, ficha.congregacaoNome, x.recordset[0].Nome)) return { sucesso: false, status: 403, mensagem: "Essa Extensão está fora do seu alcance." };
        }
        if (c.tipo === "extensao" && novo == null && !noEscopoDaPessoa(visao, ficha.congregacaoNome, null)) {
          return { sucesso: false, status: 403, mensagem: "Tirar a pessoa da Extensão a leva para fora do seu alcance: peça à secretaria da congregação." };
        }
        if (chave === "cargoDesde") {
          // "no cargo desde" mora no histórico de cargos (escadaDb.sincronizarCadastro, depois da transação): precisa de um cargo de oficial na ficha
          if (!ficha.valores.cargoMinisterial || ficha.valores.cargoMinisterial === "MEMBRO") return { sucesso: false, status: 200, mensagem: "\"No cargo desde\" só vale para quem tem cargo de oficial." };
          if (novo < "1950-01-01") return { sucesso: false, status: 200, mensagem: "A data de entrada no cargo está antiga demais." };
          depois = { cargo: { anterior: ficha.valores.cargoMinisterial, novo: ficha.valores.cargoMinisterial, desde: novo } };
        } else if (c.tipo === "status") {
          const saiu = regras.STATUS_DE_SAIDA.includes(atual);
          if (saiu && papel !== "GERAL") return { sucesso: false, status: 403, mensagem: "Voltar de uma saída do rol é a readmissão: só a Secretaria Geral registra." };
          if (novo === "FALECIDO" && !saiu) {
            // o falecimento é a saída do rol: sem comunhão, a data e a causa (como no cadastro completo); os vínculos e a credencial caem depois da transação
            await rq().input("id", sql.Int, membroId).input("hoje", sql.Date, hoje).query(`
              UPDATE MembroReferencia SET Status = N'FALECIDO', SituacaoMembro = N'SEM_COMUNHAO', DataSaida = ISNULL(DataSaida, @hoje), MotivoSaida = N'FALECIMENTO' WHERE MembroId = @id`);
            depois = { terminal: "FALECIMENTO" };
          } else {
            await rq().input("id", sql.Int, membroId).input("v", tipoSql(c), novo).query(`UPDATE MembroReferencia SET ${c.coluna} = @v WHERE MembroId = @id`);
            if (novo !== "ATIVO") depois = { derrubarSessoes: true };
          }
        } else {
          await rq().input("id", sql.Int, membroId).input("v", tipoSql(c), novo).query(`UPDATE MembroReferencia SET ${c.coluna} = @v WHERE MembroId = @id`);
          if (c.tipo === "cargo") depois = { cargo: { anterior: atual || null, novo: novo || null, desde: null } };
        }
      }
      if (chave !== "endereco" || !mesmo(atual, novo)) {
        await registrarAuditoriaNaTransacao(t, { tabela: "MembroReferencia", registroId: Number(membroId), acao: `Mudou ${c.rotulo.toLowerCase()} (campo a campo)`.slice(0, 100),
          usuarioId: visao.membroId, dadosAntes: { [chave]: regras.mascarar(chave, atual) }, dadosDepois: { [chave]: regras.mascarar(chave, novo) } });
      }
      return { sucesso: true, status: 200, mensagem: `✅ ${c.rotulo} salvo.`, valor: valorParaTela(chave, novo), emailAnterior: chave === "email" && atual ? atual : undefined };
    });
    if (r && r.sucesso && depois) await efeitosDepois(pool, { membroId: Number(membroId), por: visao.membroId, depois });
    return r;
  } catch (e) {
    if (violouCpfUnico(e)) return { sucesso: false, status: 200, mensagem: MSG_CPF_REPETIDO };
    throw e;
  }
}

// Os efeitos que o cadastro completo fazia depois de gravar (GestaoPessoas): falhou um deles? A ficha já está gravada; o erro fica no log (a mesma regra de lá).
async function efeitosDepois(pool, { membroId, por, depois }) {
  try {
    if (depois.cargo) {
      const h = await require("./escadaDb").sincronizarCadastro(pool, { membroId, cargoAnterior: depois.cargo.anterior, cargoNovo: depois.cargo.novo, desde: depois.cargo.desde, por });
      if (h && h.sucesso === false) console.warn(`[edicaoFicha] histórico de cargos de ${membroId} não atualizado: ${h.mensagem}`);
    }
    if (depois.terminal) {
      await require("./vacancia").encerrarVinculos(pool, sql, membroId, depois.terminal);   // também derruba as sessões abertas da pessoa
      await require("./credencialDb").recolherSemFalhar(pool, membroId, depois.terminal, por);
    }
    if (depois.derrubarSessoes) await require("./auth").revogarSessoesDoMembro(pool, sql, membroId);
  } catch (e) { console.error(`[edicaoFicha] efeito depois da gravação de ${membroId} falhou: ${e.message}`); }
}

// ---------------------------------------------------------------- o membro (Meus Dados)
// O que ele mexe sozinho: o contato (telefone, e-mail), o endereço e os campos VAZIOS (nascimento, sexo, estado civil, escolaridade, CPF, filiação).
// `valores` = { chave: valor } (sem o endereço; o que veio igual ao de agora não conta); `prepEnd` = o endereço já preparado (ou null). Tudo ou nada: um campo
// que já está preenchido (inclusive se foi preenchido no meio, por uma sugestão aplicada) recusa a gravação inteira, com a dica de sugerir.
async function gravarDoMembro(pool, { membroId, valores, prepEnd, hoje }) {
  for (const chave of Object.keys(valores || {})) {
    if (!regras.ehCampo(chave) || chave === "endereco") return { sucesso: false, mensagem: regras.OUTRO_CAMINHO[chave] || "Campo desconhecido." };
    const m = regras.CAMPOS[chave].membro;
    if (m !== "DIRETO" && m !== "VAZIO") return { sucesso: false, mensagem: `${regras.CAMPOS[chave].rotulo}: peça a mudança à secretaria ("Sugerir mudança").` };
  }
  try {
    return await emTransacao(pool, prepEnd, async (rq, t) => {
      const ficha = await lerFicha(rq, membroId, { travar: true });
      if (!ficha) return { sucesso: false, mensagem: "Matrícula não encontrada." };
      const antes = {}, depois = {}, mudou = [];
      const gravar = rq().input("id", sql.Int, membroId);
      const sets = [];
      for (const [chave, bruto] of Object.entries(valores || {})) {
        const atual = ficha.valores[chave];
        // o que voltou igual ao de agora não conta (nem é conferido: um telefone antigo fora do formato não impede de salvar o resto)
        const brutoTxt = bruto === null || bruto === undefined ? null : (typeof bruto === "string" || typeof bruto === "number") ? String(bruto).replace(/\s+/g, " ").trim() || null : bruto;
        if (mesmo(atual, brutoTxt)) continue;
        const v = regras.validar(chave, bruto, hoje);
        if (!v.ok) return { sucesso: false, campo: chave, mensagem: v.mensagem };
        const novo = v.valor;
        if (mesmo(atual, novo)) continue;
        const c = regras.CAMPOS[chave];
        if (regras.modoDoMembro(chave, atual, { emProcessoDeCargo: ficha.emProcessoDeCargo }) !== "DIRETO") {
          return { sucesso: false, campo: chave, mensagem: regras.vazio(atual)
            ? `${c.rotulo}: há um processo de cargo em andamento, então a mudança vai como sugestão para a secretaria ("Sugerir mudança").`
            : `${c.rotulo} já está preenchido: para mudar, use "Sugerir mudança" (a secretaria confere).` };
        }
        gravar.input(`v${sets.length}`, tipoSql(c), novo);
        sets.push(`${c.coluna} = @v${sets.length}`);
        antes[chave] = regras.mascarar(chave, atual); depois[chave] = regras.mascarar(chave, novo); mudou.push(chave);
      }
      if (prepEnd) {
        gravar.input("endereco", sql.NVarChar(300), prepEnd.endereco || null);
        territorioDb.entradasEndereco(gravar, prepEnd.partes);
        sets.push(`Endereco = @endereco, ${territorioDb.SET_ENDERECO}`);
        if (!mesmo(ficha.valores.endereco, prepEnd.endereco || null)) { antes.endereco = ficha.valores.endereco; depois.endereco = prepEnd.endereco || null; mudou.push("endereco"); }
      }
      if (!sets.length) return { sucesso: true, mensagem: "Nada mudou.", mudou: [] };
      await gravar.query(`UPDATE MembroReferencia SET ${sets.join(", ")} WHERE MembroId = @id`);
      if (mudou.length) {
        await registrarAuditoriaNaTransacao(t, { tabela: "MembroReferencia", registroId: Number(membroId), acao: "Atualizou os próprios dados (autoatendimento)",
          usuarioId: Number(membroId), dadosAntes: antes, dadosDepois: depois });
      }
      return { sucesso: true, mensagem: "✅ Dados atualizados.", mudou, emailAnterior: mudou.includes("email") ? ficha.valores.email : undefined };
    });
  } catch (e) {
    if (!violouCpfUnico(e)) throw e;
    // o CPF dele já está noutra ficha (muitas vezes, a mesma pessoa com duas fichas): ele não fica sabendo de quem é, e o caso vai à Secretaria Geral
    try {
      const cpf = regras.validar("cpf", valores.cpf).valor;
      const outra = cpf ? (await pool.request().input("c", sql.Char(11), cpf).input("m", sql.Int, membroId)
        .query(`SELECT TOP 1 MembroId FROM MembroReferencia WHERE Cpf = @c AND MembroId <> @m`)).recordset[0] : null;
      const eu = (await pool.request().input("m", sql.Int, membroId).query(`SELECT Nome, CongregacaoId, CONVERT(varchar(10), DataNascimento, 120) AS Nasc FROM MembroReferencia WHERE MembroId = @m`)).recordset[0];
      if (outra && eu) {
        await require("./preCadastroDb").registrarCaso(() => pool.request(), { tipo: "CPF_FORA_DO_ESCOPO", membroIdExistente: Number(outra.MembroId),
          congregacaoQuePediuId: eu.CongregacaoId || null, pedidoPor: Number(membroId), nome: eu.Nome, nascimento: eu.Nasc || null });
      }
    } catch (_) { /* o caso é ajuda à Geral: a resposta ao membro não depende dele */ }
    return { sucesso: false, campo: "cpf", mensagem: MSG_CPF_REPETIDO_MEMBRO };
  }
}

// O que o membro vê dos próprios campos: o modo de cada um (MUDA, SUGERE, NAO) e os que já têm sugestão esperando a secretaria.
async function regrasDoMembro(pool, membroId) {
  const ficha = await lerFicha(() => pool.request(), membroId);
  if (!ficha) return null;
  const pend = await pool.request().input("m", sql.Int, membroId).query(`
    SELECT DISTINCT c.NomeCampo FROM SolicitacoesEdicaoCampos c JOIN SolicitacoesEdicaoPessoa s ON s.SolicitacaoId = c.SolicitacaoId
    WHERE s.MembroId = @m AND c.Status = N'PENDENTE'`);
  const pendentes = new Set(pend.recordset.map((l) => l.NomeCampo));
  return Object.entries(regras.CAMPOS).map(([chave, c]) => {
    const modo = regras.modoDoMembro(chave, ficha.valores[chave], { emProcessoDeCargo: ficha.emProcessoDeCargo });
    return { chave, rotulo: c.rotulo, grupo: c.grupo, tipo: c.tipo, opcoes: c.lista || null, modo: modo === "DIRETO" ? "MUDA" : modo === "SUGERIR" ? "SUGERE" : "NAO",
      sugestaoPendente: pendentes.has(chave) };
  });
}

// A SUGESTÃO do membro: só os campos que ele sugere (o que ele muda sozinho vai por Meus Dados), com o valor conferido, e UMA sugestão pendente por campo.
// A ficha fica travada enquanto confere (duas abas mandando ao mesmo tempo não criam dois pedidos do mesmo campo). Devolve { sucesso, status, mensagem, solicitacaoId? }.
async function sugerir(pool, { membroId, campos, hoje }) {
  const chaves = Object.keys(campos || {});
  if (!chaves.length) return { sucesso: false, status: 400, mensagem: "Informe ao menos um campo para sugerir a mudança." };
  if (chaves.length > Object.keys(regras.CAMPOS).length) return { sucesso: false, status: 400, mensagem: "Campos demais num pedido só." };
  const normal = {};
  for (const chave of chaves) {
    if (!regras.ehCampo(chave)) return { sucesso: false, status: 200, mensagem: regras.OUTRO_CAMINHO[chave] || `Campo desconhecido: ${String(chave).slice(0, 40)}.` };
    const c = regras.CAMPOS[chave];
    if (c.membro === "DIRETO") return { sucesso: false, status: 200, mensagem: `${c.rotulo}: você mesmo muda em Meus Dados, sem pedido.` };
    if (c.membro === "NAO") return { sucesso: false, status: 200, mensagem: `${c.rotulo}: quem muda é a secretaria.` };
    const v = regras.validar(chave, campos[chave], hoje);
    if (!v.ok) return { sucesso: false, status: 200, mensagem: v.mensagem };
    if (v.valor === null || v.valor === undefined) return { sucesso: false, status: 200, mensagem: `${c.rotulo}: informe o valor certo.` };
    normal[chave] = String(v.valor);
  }
  return emTransacao(pool, null, async (rq, t) => {
    const ficha = await lerFicha(rq, membroId, { travar: true });
    if (!ficha) return { sucesso: false, status: 200, mensagem: "Matrícula não encontrada." };
    const criar = [];
    for (const [chave, proposto] of Object.entries(normal)) {
      const atual = ficha.valores[chave];
      if (mesmo(atual, proposto)) continue;
      if (regras.modoDoMembro(chave, atual, { emProcessoDeCargo: ficha.emProcessoDeCargo }) === "DIRETO") {
        return { sucesso: false, status: 200, mensagem: `${regras.CAMPOS[chave].rotulo} está vazio: você mesmo preenche em Meus Dados, sem pedido.` };
      }
      criar.push({ chave, anterior: atual, proposto });
    }
    if (!criar.length) return { sucesso: false, status: 200, mensagem: "Nenhum dos valores enviados é diferente do que já está cadastrado." };
    const pend = await rq().input("m", sql.Int, membroId).query(`
      SELECT DISTINCT c.NomeCampo FROM SolicitacoesEdicaoCampos c JOIN SolicitacoesEdicaoPessoa s ON s.SolicitacaoId = c.SolicitacaoId
      WHERE s.MembroId = @m AND c.Status = N'PENDENTE'`);
    const jaPendentes = criar.filter((x) => pend.recordset.some((l) => l.NomeCampo === x.chave)).map((x) => regras.CAMPOS[x.chave].rotulo);
    if (jaPendentes.length) {
      return { sucesso: false, status: 409, mensagem: `Já existe um pedido esperando a secretaria para: ${jaPendentes.join(", ")}. Espere a resposta antes de pedir de novo.` };
    }
    const s = await rq().input("m", sql.Int, membroId).query(`INSERT INTO SolicitacoesEdicaoPessoa (MembroId) OUTPUT INSERTED.SolicitacaoId VALUES (@m)`);
    const solicitacaoId = s.recordset[0].SolicitacaoId;
    for (const x of criar) {
      await rq().input("s", sql.Int, solicitacaoId).input("n", sql.NVarChar(50), x.chave).input("a", sql.NVarChar(300), x.anterior).input("p", sql.NVarChar(300), x.proposto)
        .query(`INSERT INTO SolicitacoesEdicaoCampos (SolicitacaoId, NomeCampo, ValorAnterior, ValorProposto) VALUES (@s, @n, @a, @p)`);
    }
    await registrarAuditoriaNaTransacao(t, { tabela: "SolicitacoesEdicaoPessoa", registroId: solicitacaoId, acao: "Solicitou edição de dados (aguardando aprovação)",
      usuarioId: Number(membroId), dadosDepois: { campos: criar.map((x) => ({ chave: x.chave, valorAnterior: regras.mascarar(x.chave, x.anterior), valorProposto: regras.mascarar(x.chave, x.proposto) })) } });
    return { sucesso: true, status: 201, mensagem: `✅ Pedido enviado — ${criar.length} campo(s) esperando a secretaria conferir.`, solicitacaoId };
  });
}

// Os pedidos do próprio membro, com a resposta (o motivo da recusa); quem decidiu não aparece.
async function minhasSugestoes(pool, membroId) {
  const r = await pool.request().input("m", sql.Int, membroId).query(`
    SELECT TOP 200 s.SolicitacaoId, CONVERT(varchar(33), s.DataSolicitacao, 126) AS DataSolicitacao, s.Status, c.CampoId, c.NomeCampo, c.ValorAnterior, c.ValorProposto,
           c.Status AS StatusCampo, c.MotivoDecisao, CONVERT(varchar(33), c.DataDecisao, 126) AS DataDecisao
    FROM SolicitacoesEdicaoPessoa s JOIN SolicitacoesEdicaoCampos c ON c.SolicitacaoId = s.SolicitacaoId
    WHERE s.MembroId = @m ORDER BY s.DataSolicitacao DESC, c.CampoId`);
  const porSolicitacao = new Map();
  for (const l of r.recordset) {
    if (!porSolicitacao.has(l.SolicitacaoId)) porSolicitacao.set(l.SolicitacaoId, { solicitacaoId: l.SolicitacaoId, dataSolicitacao: l.DataSolicitacao, status: l.Status, campos: [] });
    porSolicitacao.get(l.SolicitacaoId).campos.push({ campoId: l.CampoId, nomeCampo: l.NomeCampo, rotulo: regras.ehCampo(l.NomeCampo) ? regras.CAMPOS[l.NomeCampo].rotulo : l.NomeCampo,
      valorAnterior: l.ValorAnterior, valorProposto: l.ValorProposto, status: l.StatusCampo, motivo: l.MotivoDecisao || null, dataDecisao: l.DataDecisao || null });
  }
  return [...porSolicitacao.values()];
}

// ---------------------------------------------------------------- o histórico de alterações da ficha (lido da trilha)
const CHAVES_FORA = /senha|hash|token|codigo|pin$|chave|fotoUrl|url$/i;
// Um valor da trilha em texto curto para a tela (objetos, como as linhas do endereço, viram um resumo).
function resumo(v) {
  if (v === null || v === undefined) return v === undefined ? undefined : null;
  if (typeof v === "object") {
    try { return Object.values(v).filter((x) => x !== null && x !== "" && typeof x !== "object").join(", ").slice(0, 200) || null; } catch (_) { return null; }
  }
  return String(v).slice(0, 300);
}
// CPF, e-mail e telefone nunca saem inteiros no histórico, mesmo das linhas antigas da trilha (o que já veio mascarado fica como está).
function mascaraTrilha(k, v) {
  if (typeof v !== "string" && typeof v !== "number") return v;
  const s = String(v);
  if (/\*/.test(s)) return s;
  if (/^cpf/i.test(k)) return regras.mascarar("cpf", s);
  if (/^email/i.test(k)) return regras.mascarar("email", s);
  if (/^telefone/i.test(k)) return regras.mascarar("telefone", s);
  return v;
}
// As mudanças de UMA linha da trilha. `podeDisciplina` = quem lê tem "disciplina" no escopo da pessoa (sem ela, o motivo de uma saída disciplinar é sigiloso).
function mudancasDaLinha(antesTxt, depoisTxt, podeDisciplina) {
  const ler = (txt) => { try { const o = txt ? JSON.parse(txt) : {}; return o && typeof o === "object" && !Array.isArray(o) ? o : {}; } catch (_) { return {}; } };
  const antes = ler(antesTxt), depois = ler(depoisTxt);
  const temAntes = (k) => Object.prototype.hasOwnProperty.call(antes, k);
  const chaves = [...new Set([...Object.keys(antes), ...Object.keys(depois)])].filter((k) => !CHAVES_FORA.test(k));
  const lista = [];
  for (const k of chaves) {
    let a = antes[k], d = depois[k];
    if (/motivo|causa/i.test(k) && !podeDisciplina && (SAIDAS_DISCIPLINARES.has(a) || SAIDAS_DISCIPLINARES.has(d))) {
      a = a == null ? a : "(sigiloso)"; d = d == null ? d : "(sigiloso)";
    }
    a = resumo(mascaraTrilha(k, a)); d = resumo(mascaraTrilha(k, d));
    if (temAntes(k) && a === d) continue;
    lista.push({ campo: k, rotulo: regras.ehCampo(k) ? regras.CAMPOS[k].rotulo : k, ...(temAntes(k) ? { antes: a === undefined ? null : a } : {}), depois: d === undefined ? null : d });
  }
  return lista;
}
async function lerAlteracoes(pool, membroId, { pagina = 1, porPagina = 30, podeDisciplina = false } = {}) {
  // v10.1b passo 6 (juntar fichas, migração 179): a trilha de um número que SAIU numa junção e foi dado a outra pessoa (MatriculasLivres) é da ficha antiga —
  // a pessoa nova não vê o que era da outra (só o que veio depois da junção). E a ficha que FICOU mostra também a trilha da que saiu (de antes da junção),
  // marcada com o número dela. Quem mudou: o nome só se a ficha de quem mudou já existia naquela hora (um número reaproveitado não "assina" o que não fez).
  const r = await pool.request().input("id", sql.Int, membroId).input("pular", sql.Int, (pagina - 1) * porPagina).input("trazer", sql.Int, porPagina).query(`
    WITH trilha AS (
      SELECT a.AuditId, a.DataHora, a.Acao, a.UsuarioId, a.DadosAntes, a.DadosDepois, CAST(NULL AS INT) AS DaFicha
      FROM AuditLog a
      WHERE a.RegistroId = @id AND a.Tabela = N'MembroReferencia'
        AND NOT EXISTS (SELECT 1 FROM JuncoesFichas j WHERE j.MatriculaSai = @id AND j.Situacao = N'FEITA' AND a.DataHora < j.JuntadaEm)
      UNION ALL
      SELECT a.AuditId, a.DataHora, a.Acao, a.UsuarioId, a.DadosAntes, a.DadosDepois, j.MatriculaSai
      FROM JuncoesFichas j JOIN AuditLog a ON a.RegistroId = j.MatriculaSai AND a.Tabela = N'MembroReferencia' AND a.DataHora < j.JuntadaEm
      WHERE j.MatriculaFica = @id AND j.Situacao = N'FEITA'
    )
    SELECT COUNT(*) AS total FROM trilha;
    WITH trilha AS (
      SELECT a.AuditId, a.DataHora, a.Acao, a.UsuarioId, a.DadosAntes, a.DadosDepois, CAST(NULL AS INT) AS DaFicha
      FROM AuditLog a
      WHERE a.RegistroId = @id AND a.Tabela = N'MembroReferencia'
        AND NOT EXISTS (SELECT 1 FROM JuncoesFichas j WHERE j.MatriculaSai = @id AND j.Situacao = N'FEITA' AND a.DataHora < j.JuntadaEm)
      UNION ALL
      SELECT a.AuditId, a.DataHora, a.Acao, a.UsuarioId, a.DadosAntes, a.DadosDepois, j.MatriculaSai
      FROM JuncoesFichas j JOIN AuditLog a ON a.RegistroId = j.MatriculaSai AND a.Tabela = N'MembroReferencia' AND a.DataHora < j.JuntadaEm
      WHERE j.MatriculaFica = @id AND j.Situacao = N'FEITA'
    )
    SELECT t.AuditId, CONVERT(varchar(33), t.DataHora, 126) AS DataHora, t.Acao, t.UsuarioId, u.Nome AS UsuarioNome, t.DadosAntes, t.DadosDepois, t.DaFicha
    FROM trilha t LEFT JOIN MembroReferencia u ON u.MembroId = t.UsuarioId AND (u.CriadoEm IS NULL OR u.CriadoEm <= t.DataHora)
    ORDER BY t.DataHora DESC, t.AuditId DESC OFFSET @pular ROWS FETCH NEXT @trazer ROWS ONLY`);
  const total = r.recordsets[0][0].total;
  const itens = r.recordsets[1].map((l) => ({ id: Number(l.AuditId), quando: l.DataHora, acao: l.Acao, ...(l.DaFicha ? { daFichaJuntada: l.DaFicha } : {}),
    quem: l.UsuarioId ? { matricula: l.UsuarioId, nome: l.UsuarioNome || null } : null, mudancas: mudancasDaLinha(l.DadosAntes, l.DadosDepois, podeDisciplina) }));
  return { total, pagina, porPagina, itens };
}

// ---------------------------------------------------------------- a caixa de sugestões
// As sugestões no escopo de quem vê (filtradas NO BANCO pela congregação/Extensão da pessoa; a segunda trava em memória), sem as do próprio usuário.
// situacao: PENDENTE (padrão) ou DECIDIDAS. Cada campo diz se quem vê pode aplicar e, se não pode, por quê (a área acompanha; o CPF preenchido é da Geral...).
async function listarSugestoes(pool, visao, { situacao = "PENDENTE", limite = 300 } = {}) {
  const pedido = pool.request();
  const cond = await condicaoSqlEscopoPessoa(pool, visao, pedido, "m.CongregacaoId", "ex.Nome");
  if (cond === "") return [];
  pedido.input("eu", sql.Int, visao.membroId).input("limite", sql.Int, limite);
  const decididas = situacao === "DECIDIDAS";
  const r = await pedido.query(`
    SELECT TOP (@limite) s.SolicitacaoId, s.MembroId, m.Nome, CONVERT(varchar(33), s.DataSolicitacao, 126) AS DataSolicitacao, s.Status,
           c.CampoId, c.NomeCampo, c.ValorAnterior, c.ValorProposto, c.Status AS StatusCampo, c.MotivoDecisao, c.DecididoPor, dp.Nome AS DecididoPorNome,
           CONVERT(varchar(33), c.DataDecisao, 126) AS DataDecisao, cg.Nome AS CongregacaoNome, ex.Nome AS ExtensaoNome,
           CASE WHEN EXISTS (SELECT 1 FROM Consagracoes cs LEFT JOIN TiposConsagracao tc ON tc.Nome = cs.Assunto
                             WHERE cs.MembroId = m.MembroId AND ISNULL(cs.CargoAlvo, tc.CargoMinisterialResultante) IS NOT NULL
                             AND cs.Status IN (N'PROTOCOLADO', N'EM_ANALISE_CONSELHO', N'AGUARDANDO_PLENARIO', N'HOMOLOGADO')) THEN 1 ELSE 0 END AS EmProcessoDeCargo,
           CASE WHEN EXISTS (SELECT 1 FROM ProcessosDisciplinares pdx WHERE pdx.MembroId = m.MembroId AND pdx.Resultado = N'EXCLUSAO' AND pdx.CEIRecusouEm IS NULL
                             AND pdx.Status IN (N'JULGADO', N'EM_RECURSO')) THEN 1 ELSE 0 END AS TemExclusao
    FROM SolicitacoesEdicaoPessoa s
    JOIN MembroReferencia m ON m.MembroId = s.MembroId
    JOIN SolicitacoesEdicaoCampos c ON c.SolicitacaoId = s.SolicitacaoId
    LEFT JOIN MembroReferencia dp ON dp.MembroId = c.DecididoPor
    LEFT JOIN Congregacoes cg ON cg.CongregacaoId = m.CongregacaoId
    LEFT JOIN ExtensoesTenda ex ON ex.ExtensaoId = m.ExtensaoId
    WHERE ${decididas ? "c.Status <> N'PENDENTE'" : "c.Status = N'PENDENTE'"} AND s.MembroId <> @eu ${cond ? `AND ${cond}` : ""}
    ORDER BY ${decididas ? "c.DataDecisao DESC" : "s.DataSolicitacao ASC"}, c.CampoId`);
  const papel = regras.papelNaFicha(visao);
  const geral = papel === "GERAL";
  const porSolicitacao = new Map();
  for (const l of r.recordset) {
    if (!noEscopoDaPessoa(visao, l.CongregacaoNome, l.ExtensaoNome) || Number(l.MembroId) === Number(visao.membroId)) continue;   // a segunda trava
    const aplica = regras.podeAplicarSugestao(visao, l.CongregacaoNome);
    if (!porSolicitacao.has(l.SolicitacaoId)) {
      porSolicitacao.set(l.SolicitacaoId, { solicitacaoId: l.SolicitacaoId, membroId: l.MembroId, nome: l.Nome, congregacao: l.CongregacaoNome, dataSolicitacao: l.DataSolicitacao,
        status: l.Status, podeAplicar: aplica, campos: [] });
    }
    const chave = l.NomeCampo;
    const masc = (v) => (chave === "cpf" && !geral && !/\*/.test(String(v || "")) ? regras.mascarar("cpf", v) : v);   // (o decidido já está mascarado no banco)
    let pode = aplica, motivoNao = aplica ? null : "A área acompanha: quem aplica ou recusa é a secretaria da congregação ou a Secretaria Geral.";
    if (aplica && l.StatusCampo === "PENDENTE") {
      const p = !regras.ehCampo(chave) || chave === "endereco" ? { pode: false, motivo: "Este campo não se aplica por aqui: recuse com o motivo." }
        : regras.podeSecretariaMudar(chave, { papel, ehProprio: false, valorAtual: regras.valorParaTexto(l.ValorAnterior), emProcessoDeCargo: !!l.EmProcessoDeCargo, temExclusao: !!l.TemExclusao });
      if (!p.pode) { pode = false; motivoNao = p.motivo; }
    }
    porSolicitacao.get(l.SolicitacaoId).campos.push({ campoId: l.CampoId, nomeCampo: chave, rotulo: regras.ehCampo(chave) ? regras.CAMPOS[chave].rotulo : chave,
      valorAnterior: masc(l.ValorAnterior), valorProposto: masc(l.ValorProposto), status: l.StatusCampo, motivo: l.MotivoDecisao || null,
      podeAplicar: l.StatusCampo === "PENDENTE" ? pode : false, podeRecusar: l.StatusCampo === "PENDENTE" ? aplica : false, motivoNaoAplica: l.StatusCampo === "PENDENTE" ? motivoNao : null,
      decididoPor: l.DecididoPor ? { matricula: l.DecididoPor, nome: l.DecididoPorNome || null } : null, dataDecisao: l.DataDecisao || null });
  }
  return [...porSolicitacao.values()];
}

// Decide UM campo de uma sugestão: APROVADO (aplica na ficha) ou REJEITADO (com motivo, que a pessoa lê). Numa transação, com o pedido e a ficha travados.
// Não aplica por cima: se a ficha mudou depois do pedido, 409 (quem decide vê o valor de agora e recusa, ou a pessoa pede de novo).
async function decidirCampo(pool, { visao, solicitacaoId, campoId, decisao, motivo, hoje }) {
  if (decisao !== "APROVADO" && decisao !== "REJEITADO") return { sucesso: false, status: 400, mensagem: "Decisão inválida: APROVADO ou REJEITADO." };
  const motivoLimpo = typeof motivo === "string" ? motivo.replace(/\s+/g, " ").trim() : "";
  if (decisao === "REJEITADO" && !motivoLimpo) return { sucesso: false, status: 200, mensagem: "Escreva o motivo da recusa: a pessoa recebe a resposta." };
  if (motivoLimpo.length > 300) return { sucesso: false, status: 200, mensagem: "O motivo passa de 300 letras." };
  if (/[<>]/.test(motivoLimpo)) return { sucesso: false, status: 200, mensagem: "O motivo tem caracteres que não podem ser usados." };
  try {
    return await emTransacao(pool, null, async (rq, t) => {
      const cr = await rq().input("c", sql.Int, campoId).input("s", sql.Int, solicitacaoId).query(`
        SELECT c.CampoId, c.NomeCampo, c.ValorAnterior, c.ValorProposto, c.Status, s.MembroId
        FROM SolicitacoesEdicaoCampos c WITH (UPDLOCK, ROWLOCK) JOIN SolicitacoesEdicaoPessoa s ON s.SolicitacaoId = c.SolicitacaoId
        WHERE c.CampoId = @c AND c.SolicitacaoId = @s`);
      const campo = cr.recordset[0];
      if (!campo) return { sucesso: false, status: 200, mensagem: "Sugestão não encontrada." };
      const ficha = await lerFicha(rq, campo.MembroId, { travar: true });
      if (!ficha || !noEscopoDaPessoa(visao, ficha.congregacaoNome, ficha.extensaoNome)) return { sucesso: false, status: 200, mensagem: "Sugestão não encontrada." };
      if (Number(campo.MembroId) === Number(visao.membroId)) return { sucesso: false, status: 403, mensagem: "Você não pode decidir o seu próprio pedido — peça a outra pessoa da Secretaria." };
      if (campo.Status !== "PENDENTE") return { sucesso: false, status: 409, mensagem: "Esta sugestão já foi decidida." };
      if (!regras.podeAplicarSugestao(visao, ficha.congregacaoNome)) {
        return { sucesso: false, status: 403, mensagem: "A área acompanha as sugestões; quem aplica ou recusa é a secretaria da congregação ou a Secretaria Geral." };
      }
      const chave = campo.NomeCampo;
      const c = regras.ehCampo(chave) ? regras.CAMPOS[chave] : null;
      const rotulo = c ? c.rotulo.toLowerCase() : "campo";
      if (decisao === "REJEITADO") {
        await rq().input("c", sql.Int, campoId).input("por", sql.Int, visao.membroId).input("m", sql.NVarChar(300), motivoLimpo)
          .query(`UPDATE SolicitacoesEdicaoCampos SET Status = N'REJEITADO', DecididoPor = @por, DataDecisao = SYSUTCDATETIME(), MotivoDecisao = @m WHERE CampoId = @c AND Status = N'PENDENTE'`);
        await registrarAuditoriaNaTransacao(t, { tabela: "MembroReferencia", registroId: Number(campo.MembroId), acao: `Recusou a sugestão de ${rotulo}`.slice(0, 100),
          usuarioId: visao.membroId, dadosAntes: { [chave]: regras.mascarar(chave, campo.ValorAnterior) }, dadosDepois: { [`${chave}Sugerido`]: regras.mascarar(chave, campo.ValorProposto), motivoRecusa: motivoLimpo } });
        await fecharSeDecidida(rq, solicitacaoId);
        return { sucesso: true, status: 200, mensagem: "Sugestão recusada.", aplicado: false };
      }
      if (!c || c.tipo === "endereco") return { sucesso: false, status: 422, mensagem: "Este campo não se aplica por aqui: recuse com o motivo." };
      const p = regras.podeSecretariaMudar(chave, { papel: regras.papelNaFicha(visao), ehProprio: false, valorAtual: ficha.valores[chave],
        emProcessoDeCargo: ficha.emProcessoDeCargo, temExclusao: ficha.temExclusao });
      if (!p.pode) return { sucesso: false, status: 403, mensagem: p.motivo };
      const v = regras.validar(chave, campo.ValorProposto, hoje);
      if (!v.ok) return { sucesso: false, status: 200, mensagem: `${v.mensagem} Recuse a sugestão com o motivo.` };
      const anterior = c.tipo === "cpf" ? (campo.ValorAnterior ? String(campo.ValorAnterior).replace(/\D/g, "") || null : null) : regras.valorParaTexto(campo.ValorAnterior);
      if (!mesmo(ficha.valores[chave], anterior)) {
        return { sucesso: false, status: 409, mensagem: `${c.rotulo} mudou depois do pedido (agora: ${valorParaTela(chave, ficha.valores[chave]) || "vazio"}). Se a sugestão não vale mais, recuse com o motivo.` };
      }
      if (chave === "departamentoId" && v.valor != null) {
        const d = await rq().input("d", sql.Int, v.valor).query(`SELECT TOP 1 1 AS x FROM Departamentos WHERE DepartamentoId = @d`);
        if (!d.recordset.length) return { sucesso: false, status: 200, mensagem: "Departamento inválido: recuse com o motivo." };
      }
      await rq().input("id", sql.Int, campo.MembroId).input("v", tipoSql(c), v.valor).query(`UPDATE MembroReferencia SET ${c.coluna} = @v WHERE MembroId = @id`);
      await rq().input("c", sql.Int, campoId).input("por", sql.Int, visao.membroId)
        .query(`UPDATE SolicitacoesEdicaoCampos SET Status = N'APROVADO', DecididoPor = @por, DataDecisao = SYSUTCDATETIME() WHERE CampoId = @c AND Status = N'PENDENTE'`);
      await registrarAuditoriaNaTransacao(t, { tabela: "MembroReferencia", registroId: Number(campo.MembroId), acao: `Aplicou a sugestão de ${rotulo}`.slice(0, 100), usuarioId: visao.membroId,
        dadosAntes: { [chave]: regras.mascarar(chave, ficha.valores[chave]) }, dadosDepois: { [chave]: regras.mascarar(chave, v.valor) } });
      await fecharSeDecidida(rq, solicitacaoId);
      return { sucesso: true, status: 200, mensagem: "Sugestão aplicada.", aplicado: true };
    });
  } catch (e) {
    if (violouCpfUnico(e)) return { sucesso: false, status: 200, mensagem: `${MSG_CPF_REPETIDO} Recuse a sugestão com o motivo.` };
    throw e;
  }
}

// Fecha o pedido quando nenhum campo dele está mais pendente (dentro da transação de quem decidiu o último). O CPF de um pedido decidido não fica inteiro guardado
// no pedido (minimização: depois da decisão ele só serve de registro, e a ficha é o lugar do número).
async function fecharSeDecidida(rq, solicitacaoId) {
  await rq().input("s", sql.Int, solicitacaoId).query(`
    UPDATE SolicitacoesEdicaoCampos
    SET ValorAnterior = CASE WHEN ValorAnterior IS NULL OR LEN(ValorAnterior) <> 11 THEN ValorAnterior ELSE N'***.' + SUBSTRING(ValorAnterior, 4, 3) + N'.' + SUBSTRING(ValorAnterior, 7, 3) + N'-**' END,
        ValorProposto = CASE WHEN LEN(ValorProposto) <> 11 THEN ValorProposto ELSE N'***.' + SUBSTRING(ValorProposto, 4, 3) + N'.' + SUBSTRING(ValorProposto, 7, 3) + N'-**' END
    WHERE SolicitacaoId = @s AND NomeCampo = N'cpf' AND Status <> N'PENDENTE'`);
  await rq().input("s", sql.Int, solicitacaoId).query(`
    UPDATE SolicitacoesEdicaoPessoa SET Status = N'CONCLUIDA'
    WHERE SolicitacaoId = @s AND Status = N'PENDENTE' AND NOT EXISTS (SELECT 1 FROM SolicitacoesEdicaoCampos WHERE SolicitacaoId = @s AND Status = N'PENDENTE')`);
}

module.exports = { lerFicha, camposParaSecretaria, opcoesDaFicha, gravarCampoSecretaria, gravarDoMembro, regrasDoMembro, sugerir, minhasSugestoes, lerAlteracoes, mudancasDaLinha,
  listarSugestoes, decidirCampo, valorParaTela, violouCpfUnico, MSG_CPF_REPETIDO };
