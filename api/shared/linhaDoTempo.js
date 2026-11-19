// shared/linhaDoTempo.js (FASE 10, v10.1b passo 2, 17/11/2026) — a LINHA DO TEMPO ÚNICA da pessoa: soma, por leitura (nunca duplica dado), o que a Igreja já
// guarda dela em várias tabelas — a ficha (entrada, readmissão, batismo, rito, saída, falecimento), a esteira de consagração, os cargos que não vieram de
// consagração, as cartas de trânsito, os marcos (conversão, batismo no Espírito Santo, ministério anterior…), o casamento, a apresentação dos filhos, a esteira
// do batismo (turma, local e oficiantes), as vias da credencial e a licença para candidatura — e, SÓ para quem tem a permissão "disciplina" no escopo, os
// processos disciplinares e os procedimentos de abandono.
//
// Regra pura (montarLinhaDoTempo) + uma leitura no banco em UM pedido só (lerFontes: vários SELECTs no mesmo lote, sem uma consulta por evento).
// Nunca entra na linha do tempo: CPF, contato, o código do QR da credencial, o motivo de uma saída/recolhimento disciplinar (para quem não tem "disciplina")
// nem o parecer de uma reprovação no batismo.
const { ROTULO_CARGO } = require("./escada");

const POR_PAGINA_PADRAO = 50;
const POR_PAGINA_MAX = 200;

const FORMA_ADMISSAO = { BATISMO: "por batismo", CARTA_MUDANCA: "por carta de mudança", RECONCILIACAO: "por reconciliação", ACLAMACAO: "por aclamação" };
// Causas de saída que contam a disciplina (Reg. Art. 11): para quem não tem a permissão "disciplina", a saída aparece sem o motivo.
const SAIDAS_DISCIPLINARES = new Set(["EXCLUSAO", "ABANDONO_MATERIAL", "ABANDONO_DIGITAL"]);
const ROTULO_SAIDA = { DESLIGAMENTO: "Desligamento do rol de membros", CARTA_MUDANCA: "Saída por carta de mudança", EXCLUSAO: "Saída do rol: exclusão",
  ABANDONO_MATERIAL: "Saída do rol: abandono", ABANDONO_DIGITAL: "Saída do rol: abandono digital" };
const ROTULO_CARTA = { MUDANCA: "Carta de mudança emitida", RECOMENDACAO: "Carta de recomendação emitida", ATESTADO_SUPLETIVO: "Atestado supletivo emitido" };
const ORIGEM_CARGO = { NOMEACAO_PRESIDENCIAL: "nomeação do Pastor Presidente", OUTRA_CONVENCAO: "vindo de outra convenção", CADASTRO: "registrado no cadastro",
  LEGADO: "registro antigo" };
const MODALIDADE_CASAMENTO = { CIVIL_E_RELIGIOSO: "civil e religioso", SOMENTE_RELIGIOSO: "só religioso" };
const ROTULO_MARCO = { CONVERSAO: "Conversão", BATISMO_ESPIRITO_SANTO: "Batismo no Espírito Santo", MINISTERIO_ANTERIOR: "Ministério ou igreja anterior" };

// A ordem entre eventos do MESMO dia (do mais antigo para o mais novo na vida da pessoa): a conversão vem antes do batismo, o batismo antes da entrada…
const ORDEM = { CONVERSAO: 10, MARCO: 20, BATISMO_INSCRICAO: 25, BATISMO_AGUAS: 30, ADMISSAO: 40, READMISSAO: 40, RITO_RECEBIMENTO: 45, BATISMO_ESPIRITO_SANTO: 50,
  CASAMENTO: 55, APRESENTACAO: 56, CONSAGRACAO_PROTOCOLO: 60, CONSAGRACAO_CONCLUIDA: 61, CARGO_INICIO: 62, CARGO_FIM: 63, CREDENCIAL_EMITIDA: 70, CREDENCIAL_ENCERRADA: 71,
  LICENCA_INICIO: 75, LICENCA_FIM: 76, TRANSFERENCIA: 78, CARTA_TRANSITO: 80, DISCIPLINA_ABERTURA: 85, DISCIPLINA_CONCLUSAO: 86, ABANDONO_NOTIFICACAO: 87, ABANDONO_HOMOLOGACAO: 88,
  SAIDA: 95, FALECIMENTO: 99 };

const dataOuNulo = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const textoOuNulo = (v) => (v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim());
const rotuloCargo = (c) => ROTULO_CARGO[c] || textoOuNulo(c) || "cargo não informado";
const dataBR = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : null);

function evento(e) {
  return { data: dataOuNulo(e.data), aproximada: !!e.aproximada, tipo: e.tipo, categoria: e.categoria, titulo: e.titulo, detalhe: textoOuNulo(e.detalhe), origem: e.origem,
    ...(e.marcoId != null ? { marcoId: e.marcoId } : {}) };
}

// Mais recente primeiro (como o desenho aprovado: "a vida na Igreja", mais novo no alto); sem data vão para o fim; no mesmo dia, o que aconteceu depois fica
// em cima.
function ordenar(eventos) {
  return eventos.slice().sort((a, b) => {
    if (a.data !== b.data) {
      if (!a.data) return 1;
      if (!b.data) return -1;
      return a.data < b.data ? 1 : -1;
    }
    return (ORDEM[b.tipo] || 50) - (ORDEM[a.tipo] || 50);
  });
}

// f = as fontes lidas (lerFontes); opcoes.disciplina = quem vê tem "disciplina" com a pessoa no escopo DESSA permissão.
function montarLinhaDoTempo(fontes, opcoes = {}) {
  const f = fontes || {};
  const disciplina = !!opcoes.disciplina;
  const m = f.membro || {};
  const eventos = [];
  const dataAdm = dataOuNulo(m.DataAdmissao), dataSaida = dataOuNulo(m.DataSaida);
  // a exclusão que valeu (a recusada pela CEI não conta — o mesmo critério do "TemExclusao" do cadastro) e terminou antes da entrada de agora
  const exclusaoAntesDaEntrada = disciplina && (f.processos || []).some((p) => p.Resultado === "EXCLUSAO" && !p.CEIRecusouEm && dataOuNulo(p.DataConclusao) && dataAdm
    && dataOuNulo(p.DataConclusao) < dataAdm);
  const voltou = !!(dataAdm && dataSaida && dataAdm > dataSaida);

  // ---- a esteira do batismo (antes da ficha: o batismo da turma tem o local e os oficiantes) ----
  const oficiantesPorTurma = new Map();
  for (const o of f.oficiantes || []) {
    const lista = oficiantesPorTurma.get(o.TurmaId) || [];
    lista.push(o.Nome);
    oficiantesPorTurma.set(o.TurmaId, lista);
  }
  let batismoTurma = null;
  for (const c of f.batismo || []) {
    const inscricao = dataOuNulo(c.DataInscricao);
    if (inscricao) eventos.push(evento({ data: inscricao, tipo: "BATISMO_INSCRICAO", categoria: "ESPIRITUAL", titulo: "Inscrição para o batismo nas águas", origem: "batismo" }));
    if (c.Status === "BATIZADO" && dataOuNulo(c.DataBatismoTurma)) {
      const oficiantes = (oficiantesPorTurma.get(c.TurmaId) || []).join(", ");
      batismoTurma = { data: dataOuNulo(c.DataBatismoTurma), local: textoOuNulo(c.Local), oficiantes: oficiantes || null };
      eventos.push(evento({ data: batismoTurma.data, tipo: "BATISMO_AGUAS", categoria: "ESPIRITUAL", titulo: "Batismo nas águas",
        detalhe: [batismoTurma.local, oficiantes ? `oficiado por ${oficiantes}` : null].filter(Boolean).join(" · "), origem: "batismo" }));
    }
  }

  // ---- a ficha ----
  const procedencia = textoOuNulo(m.IgrejaAnterior) ? `Veio de: ${textoOuNulo(m.IgrejaAnterior)}` : textoOuNulo(m.Origem);
  if (dataAdm) {
    const forma = FORMA_ADMISSAO[m.FormaAdmissao] || null;
    if (voltou || exclusaoAntesDaEntrada) {
      eventos.push(evento({ data: dataAdm, tipo: "READMISSAO", categoria: "ENTRADA", titulo: exclusaoAntesDaEntrada ? "Readmissão no rol de membros (depois de exclusão)" : "Readmissão no rol de membros",
        detalhe: forma, origem: "ficha" }));
    } else {
      eventos.push(evento({ data: dataAdm, tipo: "ADMISSAO", categoria: "ENTRADA", titulo: `Entrada no rol de membros${forma ? ` (${forma})` : ""}`, detalhe: procedencia, origem: "ficha" }));
    }
  }
  const dataBatismoFicha = dataOuNulo(m.DataBatismo);
  if (dataBatismoFicha && !(batismoTurma && batismoTurma.data === dataBatismoFicha)) {
    const fora = m.FormaAdmissao === "CARTA_MUDANCA" && textoOuNulo(m.IgrejaAnterior);
    eventos.push(evento({ data: dataBatismoFicha, tipo: "BATISMO_AGUAS", categoria: "ESPIRITUAL", titulo: "Batismo nas águas",
      detalhe: fora ? `em outra igreja: ${textoOuNulo(m.IgrejaAnterior)}` : null, origem: "ficha" }));
  }
  if (dataOuNulo(m.DataRitoRecebimento)) {
    eventos.push(evento({ data: m.DataRitoRecebimento, tipo: "RITO_RECEBIMENTO", categoria: "ENTRADA", titulo: "Rito público de recebimento", detalhe: textoOuNulo(m.MinistranteRito), origem: "ficha" }));
  }
  if (dataSaida) {
    const motivo = m.MotivoSaida || null;
    if (motivo === "FALECIMENTO" || m.Status === "FALECIDO") {
      eventos.push(evento({ data: dataSaida, tipo: "FALECIMENTO", categoria: "SAIDA", titulo: "Falecimento", origem: "ficha" }));
    } else if (SAIDAS_DISCIPLINARES.has(motivo) && !disciplina) {
      eventos.push(evento({ data: dataSaida, tipo: "SAIDA", categoria: "SAIDA", titulo: "Saída do rol de membros", origem: "ficha" }));
    } else {
      eventos.push(evento({ data: dataSaida, tipo: "SAIDA", categoria: "SAIDA", titulo: ROTULO_SAIDA[motivo] || "Saída do rol de membros", origem: "ficha" }));
    }
  }

  // ---- os marcos (conversão, batismo no Espírito Santo, ministério anterior, curso de discipulado…) ----
  let conversao = null, espirito = null;
  for (const mc of f.marcos || []) {
    const tipo = mc.Tipo === "CONVERSAO" ? "CONVERSAO" : mc.Tipo === "BATISMO_ESPIRITO_SANTO" ? "BATISMO_ESPIRITO_SANTO" : "MARCO";
    const titulo = ROTULO_MARCO[mc.Tipo] || textoOuNulo(mc.NomeTipo) || "Marco";
    const ev = evento({ data: mc.DataMarco, aproximada: mc.DataAproximada, tipo, categoria: "ESPIRITUAL", titulo, detalhe: mc.Descricao, origem: "marco", marcoId: mc.MarcoId });
    eventos.push(ev);
    if (tipo === "CONVERSAO" && !conversao) conversao = { data: ev.data, aproximada: ev.aproximada, detalhe: ev.detalhe };
    if (tipo === "BATISMO_ESPIRITO_SANTO" && !espirito) espirito = { data: ev.data, aproximada: ev.aproximada, detalhe: ev.detalhe };
  }

  // ---- a esteira de consagração e os cargos que não vieram dela ----
  for (const c of f.consagracoes || []) {
    if (dataOuNulo(c.DataProtocolo)) eventos.push(evento({ data: c.DataProtocolo, tipo: "CONSAGRACAO_PROTOCOLO", categoria: "MINISTERIO", titulo: `Pedido de consagração: ${textoOuNulo(c.Assunto) || "consagração"}`, origem: "consagracao" }));
    if (c.Status === "CONCLUIDO" && dataOuNulo(c.DataConclusao)) {
      eventos.push(evento({ data: c.DataConclusao, tipo: "CONSAGRACAO_CONCLUIDA", categoria: "MINISTERIO", titulo: `Consagração concluída: ${textoOuNulo(c.Assunto) || "consagração"}`,
        detalhe: c.CargoAtual ? rotuloCargo(c.CargoAtual) : null, origem: "consagracao" }));
    }
  }
  for (const h of f.cargos || []) {
    const origem = ORIGEM_CARGO[h.Origem] || null;
    eventos.push(evento({ data: h.Desde, tipo: "CARGO_INICIO", categoria: "MINISTERIO", titulo: `No cargo de ${rotuloCargo(h.Cargo)}`, detalhe: h.Desde ? origem : [origem, "data de entrada não informada"].filter(Boolean).join(" · "), origem: "cargo" }));
    if (dataOuNulo(h.Ate)) eventos.push(evento({ data: h.Ate, tipo: "CARGO_FIM", categoria: "MINISTERIO", titulo: `Deixou o cargo de ${rotuloCargo(h.Cargo)}`, origem: "cargo" }));
  }

  // ---- família ----
  for (const c of f.casamentos || []) {
    const conjuge = textoOuNulo(c.Conjuge);
    eventos.push(evento({ data: c.DataCasamento, tipo: "CASAMENTO", categoria: "FAMILIA", titulo: conjuge ? `Casamento com ${conjuge}` : "Casamento",
      detalhe: [MODALIDADE_CASAMENTO[c.Modalidade] || null, textoOuNulo(c.Celebrante) ? `celebrante: ${textoOuNulo(c.Celebrante)}` : null].filter(Boolean).join(" · "), origem: "casamento" }));
  }
  for (const a of f.apresentacoes || []) {
    eventos.push(evento({ data: a.DataApresentacao, tipo: "APRESENTACAO", categoria: "FAMILIA", titulo: `Apresentação de ${textoOuNulo(a.NomeCrianca) || "um filho"}`,
      detalhe: textoOuNulo(a.Oficiante) ? `oficiante: ${textoOuNulo(a.Oficiante)}` : null, origem: "apresentacao" }));
  }

  // ---- cartas, credencial e licença ----
  for (const c of f.cartas || []) {
    eventos.push(evento({ data: c.DataEmissao, tipo: "CARTA_TRANSITO", categoria: "CARTAS", titulo: ROTULO_CARTA[c.Tipo] || "Carta de trânsito emitida", detalhe: c.Destino, origem: "carta" }));
  }
  for (const c of f.credenciais || []) {
    eventos.push(evento({ data: c.EmitidaEm, tipo: "CREDENCIAL_EMITIDA", categoria: "CREDENCIAL", titulo: `Credencial emitida (${c.Via}ª via)`, origem: "credencial" }));
    if (c.Situacao !== "VALIDA" && dataOuNulo(c.EncerradaEm)) {
      const recolhida = c.Situacao === "CANCELADA";
      eventos.push(evento({ data: c.EncerradaEm, tipo: "CREDENCIAL_ENCERRADA", categoria: "CREDENCIAL", titulo: recolhida ? `Credencial recolhida (${c.Via}ª via)` : `Credencial substituída (${c.Via}ª via)`,
        detalhe: recolhida && disciplina ? c.MotivoEncerramento : null, origem: "credencial" }));
    }
  }
  for (const l of f.licencas || []) {
    eventos.push(evento({ data: l.DataInicioLicenca, tipo: "LICENCA_INICIO", categoria: "LICENCA", titulo: "Licença para candidatura política",
      detalhe: dataOuNulo(l.DataPleito) ? `pleito em ${dataBR(dataOuNulo(l.DataPleito))}` : null, origem: "licenca" }));
    if (l.Status === "RETORNOU" && dataOuNulo(l.DataRetornoDecidida)) eventos.push(evento({ data: l.DataRetornoDecidida, tipo: "LICENCA_FIM", categoria: "LICENCA", titulo: "Volta da licença", origem: "licenca" }));
    if (l.Status === "NAO_RETORNOU" && dataOuNulo(l.DataRetornoDecidida)) eventos.push(evento({ data: l.DataRetornoDecidida, tipo: "LICENCA_FIM", categoria: "LICENCA", titulo: "Não voltou da licença", origem: "licenca" }));
  }

  // ---- a transferência de congregação (v10.1b passo 3): só as concluídas; quem decidiu fica na trilha (auditoria), aqui só como foi ----
  for (const t of f.transferencias || []) {
    const como = t.Regra === "GERAL" ? "pela Secretaria Geral" : t.Regra === "MESMA_AREA" ? "na mesma área: entrou na hora"
      : t.DecididoComo === "GERAL" ? "decidida pela Secretaria Geral" : "aceita pela congregação de destino";
    eventos.push(evento({ data: t.Data, tipo: "TRANSFERENCIA", categoria: "CONGREGACAO", titulo: `Transferência: ${textoOuNulo(t.Origem) || "?"} → ${textoOuNulo(t.Destino) || "?"}`,
      detalhe: como, origem: "transferencia" }));
  }

  // ---- disciplina e abandono: só com a permissão "disciplina" no escopo (as fontes nem são lidas sem ela; aqui é a segunda trava) ----
  if (disciplina) {
    for (const p of f.processos || []) {
      eventos.push(evento({ data: p.DataAbertura, tipo: "DISCIPLINA_ABERTURA", categoria: "DISCIPLINA", titulo: "Processo disciplinar aberto", origem: "disciplina" }));
      if (dataOuNulo(p.DataConclusao)) {
        const pena = textoOuNulo(p.PenalidadeNome) ? `${textoOuNulo(p.PenalidadeNome)}${p.DiasSancao ? ` (${p.DiasSancao} dias)` : ""}` : null;
        eventos.push(evento({ data: p.DataConclusao, tipo: "DISCIPLINA_CONCLUSAO", categoria: "DISCIPLINA", titulo: `Processo disciplinar concluído${p.Resultado ? `: ${p.Resultado}` : ""}`, detalhe: pena, origem: "disciplina" }));
      }
    }
    for (const a of f.abandonos || []) {
      const qual = a.Tipo === "DIGITAL" ? "digital" : "material";
      eventos.push(evento({ data: a.DataNotificacao, tipo: "ABANDONO_NOTIFICACAO", categoria: "DISCIPLINA", titulo: `Notificação de abandono ${qual}`, origem: "abandono" }));
      if (dataOuNulo(a.DataHomologacao)) eventos.push(evento({ data: a.DataHomologacao, tipo: "ABANDONO_HOMOLOGACAO", categoria: "DISCIPLINA", titulo: `Abandono ${qual} homologado`, origem: "abandono" }));
    }
  }

  // ---- a vida espiritual à vista (o resumo do alto da ficha) ----
  const batismoAguas = batismoTurma
    ? { data: batismoTurma.data, local: batismoTurma.local, oficiantes: batismoTurma.oficiantes, emOutraIgreja: null }
    : dataBatismoFicha ? { data: dataBatismoFicha, local: null, oficiantes: null, emOutraIgreja: m.FormaAdmissao === "CARTA_MUDANCA" ? textoOuNulo(m.IgrejaAnterior) : null } : null;
  const vidaEspiritual = {
    conversao,
    batismoAguas,
    batismoEspiritoSanto: espirito,
    procedencia: dataAdm || textoOuNulo(m.IgrejaAnterior) || textoOuNulo(m.Origem)
      ? { formaAdmissao: FORMA_ADMISSAO[m.FormaAdmissao] || null, dataAdmissao: dataAdm, igrejaAnterior: textoOuNulo(m.IgrejaAnterior), origem: textoOuNulo(m.Origem) } : null
  };
  return { vidaEspiritual, eventos: ordenar(eventos) };
}

function paginar(eventos, consulta = {}) {
  const pagina = Math.min(Math.max(parseInt(consulta.pagina, 10) || 1, 1), 100000);
  const porPagina = Math.min(Math.max(parseInt(consulta.porPagina, 10) || POR_PAGINA_PADRAO, 1), POR_PAGINA_MAX);
  const inicio = (pagina - 1) * porPagina;
  return { itens: eventos.slice(inicio, inicio + porPagina), total: eventos.length, pagina, porPagina };
}

// Data do UTC para o dia de Brasília (UTC-3, sem horário de verão desde 2019) — para os carimbos DATETIME2 (credencial).
const DIA_BR = (col) => `CONVERT(varchar(10), DATEADD(HOUR, -3, ${col}), 120)`;

// UMA ida ao banco: todos os SELECTs no mesmo lote (recordsets na ordem abaixo). Disciplina e abandono só entram no lote quando quem vê pode vê-los.
async function lerFontes(pool, sql, membroId, { disciplina = false } = {}) {
  const lotes = [
    `SELECT Nome, Status, SituacaoMembro, (SELECT c.Nome FROM Congregacoes c WHERE c.CongregacaoId = MembroReferencia.CongregacaoId) AS CongregacaoNome,
            FormaAdmissao, CONVERT(varchar(10), DataAdmissao, 120) AS DataAdmissao, CONVERT(varchar(10), DataBatismo, 120) AS DataBatismo,
            CONVERT(varchar(10), DataRitoRecebimento, 120) AS DataRitoRecebimento, MinistranteRito, Origem, IgrejaAnterior,
            CONVERT(varchar(10), DataSaida, 120) AS DataSaida, MotivoSaida
     FROM MembroReferencia WHERE MembroId = @id`,
    `SELECT Assunto, CargoAtual, Status, CONVERT(varchar(10), DataProtocolo, 120) AS DataProtocolo, CONVERT(varchar(10), DataConclusao, 120) AS DataConclusao
     FROM Consagracoes WHERE MembroId = @id`,
    `SELECT Tipo, CONVERT(varchar(10), DataEmissao, 120) AS DataEmissao, Destino FROM CartasTransito WHERE MembroId = @id AND DataEmissao IS NOT NULL`,
    `SELECT mm.MarcoId, mm.Tipo, t.Nome AS NomeTipo, mm.Descricao, CONVERT(varchar(10), mm.DataMarco, 120) AS DataMarco, mm.DataAproximada
     FROM MarcosMembro mm LEFT JOIN TiposMarco t ON t.Codigo = mm.Tipo WHERE mm.MembroId = @id`,
    `SELECT Cargo, CONVERT(varchar(10), Desde, 120) AS Desde, CONVERT(varchar(10), Ate, 120) AS Ate, Origem
     FROM CargosMinisteriaisHistorico WHERE MembroId = @id AND Origem <> N'CONSAGRACAO'`,
    `SELECT CONVERT(varchar(10), c.DataCasamento, 120) AS DataCasamento, c.Celebrante, c.Modalidade,
            CASE WHEN c.MembroId = @id THEN COALESCE(oc.Nome, c.NomeConjuge) ELSE om.Nome END AS Conjuge
     FROM Casamentos c LEFT JOIN MembroReferencia oc ON oc.MembroId = c.MembroConjugeId LEFT JOIN MembroReferencia om ON om.MembroId = c.MembroId
     WHERE c.MembroId = @id OR c.MembroConjugeId = @id`,
    `SELECT NomeCrianca, CONVERT(varchar(10), DataApresentacao, 120) AS DataApresentacao, Oficiante FROM ApresentacoesCrianca WHERE MembroIdPai = @id OR MembroIdMae = @id`,
    `SELECT cb.TurmaId, cb.Status, ${DIA_BR("cb.DataInscricao")} AS DataInscricao, CONVERT(varchar(10), t.DataBatismo, 120) AS DataBatismoTurma, t.Local
     FROM CandidatosBatismo cb LEFT JOIN TurmasBatismo t ON t.TurmaId = cb.TurmaId AND t.Status = N'REALIZADA' WHERE cb.MembroId = @id`,
    `SELECT o.TurmaId, mr.Nome FROM OficiantesBatismo o JOIN MembroReferencia mr ON mr.MembroId = o.MembroId
     WHERE o.TurmaId IN (SELECT TurmaId FROM CandidatosBatismo WHERE MembroId = @id AND TurmaId IS NOT NULL) ORDER BY o.TurmaId, mr.Nome`,
    `SELECT Via, Situacao, ${DIA_BR("EmitidaEm")} AS EmitidaEm, ${DIA_BR("EncerradaEm")} AS EncerradaEm, MotivoEncerramento
     FROM CredenciaisEclesiasticas WHERE MembroId = @id`,
    `SELECT CONVERT(varchar(10), DataPleito, 120) AS DataPleito, CONVERT(varchar(10), DataInicioLicenca, 120) AS DataInicioLicenca, Status,
            CONVERT(varchar(10), DataRetornoDecidida, 120) AS DataRetornoDecidida
     FROM LicencasCandidatura WHERE MembroId = @id`
  ];
  if (disciplina) {
    lotes.push(`SELECT CONVERT(varchar(10), p.DataAbertura, 120) AS DataAbertura, CONVERT(varchar(10), p.DataConclusao, 120) AS DataConclusao, p.Status, p.Resultado,
                       p.DiasSancao, p.CEIRecusouEm, tp.Nome AS PenalidadeNome
                FROM ProcessosDisciplinares p LEFT JOIN TiposPenalidade tp ON tp.PenalidadeId = p.PenalidadeId WHERE p.MembroId = @id`);
    lotes.push(`SELECT Tipo, CONVERT(varchar(10), DataNotificacao, 120) AS DataNotificacao, CONVERT(varchar(10), DataHomologacao, 120) AS DataHomologacao
                FROM ProcedimentosAbandono WHERE MembroId = @id`);
  }
  // a transferência (migração 176): por último, com a guarda da tabela (as bases antigas de teste ainda não a têm — então o lote devolve vazio)
  lotes.push(`IF OBJECT_ID(N'dbo.TransferenciasCongregacao', N'U') IS NOT NULL
      SELECT ${DIA_BR("t.DecididoEm")} AS Data, co.Nome AS Origem, cd.Nome AS Destino, t.Regra, t.DecididoComo
      FROM TransferenciasCongregacao t JOIN Congregacoes co ON co.CongregacaoId = t.CongregacaoOrigemId JOIN Congregacoes cd ON cd.CongregacaoId = t.CongregacaoDestinoId
      WHERE t.MembroId = @id AND t.Situacao = N'CONCLUIDA'
    ELSE SELECT CAST(NULL AS varchar(10)) AS Data, CAST(NULL AS NVARCHAR(200)) AS Origem, CAST(NULL AS NVARCHAR(200)) AS Destino, CAST(NULL AS NVARCHAR(20)) AS Regra,
      CAST(NULL AS NVARCHAR(20)) AS DecididoComo WHERE 1 = 0`);
  const r = await pool.request().input("id", sql.Int, membroId).query(lotes.join(";\n"));
  const rs = r.recordsets || [];
  const lido = (i) => rs[i] || [];
  return {
    membro: lido(0)[0] || null, consagracoes: lido(1), cartas: lido(2), marcos: lido(3), cargos: lido(4), casamentos: lido(5), apresentacoes: lido(6),
    batismo: lido(7), oficiantes: lido(8), credenciais: lido(9), licencas: lido(10), processos: disciplina ? lido(11) : [], abandonos: disciplina ? lido(12) : [],
    transferencias: lido(lotes.length - 1)
  };
}

module.exports = { montarLinhaDoTempo, paginar, lerFontes, ordenar, POR_PAGINA_PADRAO, POR_PAGINA_MAX, SAIDAS_DISCIPLINARES };
