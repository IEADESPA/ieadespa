// shared/escada.js (v8.2) — Escada ministerial e ascensão (Regimento Art. 66 §§3º–5º, 67, 71 a 74). Regra pura: nenhuma consulta ao banco aqui (quem busca os dados é
// shared/escadaDb.js). Desenho em docs/plano/fase-8-ministerial-afm.md.
//
// Cada requisito vira um item da lista que a tela mostra: ATENDE, FALTA (trava), SEM_DADO (trava: dado que falta no cadastro nunca conta como atendido — mesmo espírito do
// Estatuto Art. 23 em estatuto.calcularCapacidadeEleitoral), AVISO (não trava) e DISPENSADO (a modalidade dispensa, com o artigo).
const { idadeEm } = require("./estatuto");
const { avaliarNivel, rotuloDoPar } = require("./afm");

// Art. 71 — a ordem ascendente. "Membro" é a base (cargo em branco também é membro).
const ESCADA = ["MEMBRO", "AUXILIAR", "MISSIONARIO", "DIACONO", "PRESBITERO", "EVANGELISTA", "PASTOR"];
const ROTULO_CARGO = {
  MEMBRO: "Membro", AUXILIAR: "Auxiliar", MISSIONARIO: "Missionário(a)", DIACONO: "Diácono", PRESBITERO: "Presbítero", EVANGELISTA: "Evangelista", PASTOR: "Pastor"
};

// Modalidades do processo. Só a INDICAÇÃO (JAI e Dirigente, Art. 74, II) passa pelo veto técnico da AFM; as outras duas são registradas só pelo nível geral, com a referência.
const MODALIDADES = {
  INDICACAO: { rotulo: "Indicação (JAI e Dirigente)", artigo: "Art. 74, II" },
  NOMEACAO_PRESIDENCIAL: { rotulo: "Nomeação direta do Pastor Presidente", artigo: "Art. 66 §4º", referencia: "a referência do ato da Presidência" },
  OUTRA_CONVENCAO: { rotulo: "Ministro já ordenado vindo de outra convenção", artigo: "Art. 71", referencia: "a igreja ou convenção de origem" }
};

// Art. 72 — interstício: o tempo mínimo no cargo anterior.
const INTERSTICIO = {
  MISSIONARIO: { anterior: "AUXILIAR", anos: 1, artigo: "Art. 72, II, a" },
  DIACONO: { anterior: "MISSIONARIO", anos: 2, artigo: "Art. 72, III, a" },
  PRESBITERO: { anterior: "DIACONO", anos: 2, artigo: "Art. 72, IV, a" }
};
const IDADE_MINIMA_AUXILIAR = 17;        // Art. 72, I, a
const ANOS_MEMBRESIA_AUXILIAR = 1;       // Art. 72, I, a
const IDADE_PREFERENCIAL_PRESBITERO = 30; // Art. 72, IV, a ("idade preferencial": aviso, não trava)
const TETO_OBREIRAS = "MISSIONARIO";     // Art. 71, III

const indice = (cargo) => ESCADA.indexOf(cargo == null || cargo === "" ? "MEMBRO" : cargo);
const rotulo = (cargo) => ROTULO_CARGO[cargo] || String(cargo || "Membro");

// O degrau seguinte ao cargo atual (null no topo ou com cargo fora da escada).
function proximoDegrau(cargoAtual) {
  const i = indice(cargoAtual);
  return i >= 0 && i < ESCADA.length - 1 ? ESCADA[i + 1] : null;
}

// AAAA-MM-DD + n anos. 29/02 num ano que não é bissexto vira 01/03 — o mesmo dia em que estatuto.idadeEm passa a contar o ano completo (a data que a tela
// promete é a data em que o requisito passa a valer).
function somarAnos(dataIso, anos) {
  const [a, m, d] = String(dataIso).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a + anos, m - 1, d)).toISOString().slice(0, 10);
}
const dataBr = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const isoDe = (v) => {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

function item(chave, rotuloItem, artigo, situacao, detalhe, tecnico = false) {
  return { chave, rotulo: rotuloItem, artigo, situacao, detalhe: detalhe || null, tecnico };
}

// dados: { cargoAtual, cargoDesde, status, emComunhao, sobDisciplina, cartaMudanca, dataNascimento, dataAdmissao, dizimistaFiel, sexo, estadoCivil, batismoEspirito,
//          afm: { statusMatricula, nivel, concluido, chm, chmEm } | null }
// alvo: o cargo de destino (do tipo de consagração). modalidade: INDICACAO | NOMEACAO_PRESIDENCIAL | OUTRA_CONVENCAO.
// veDisciplina: quem pergunta tem a permissão "disciplina" sobre a pessoa. Sem ela, disciplina e carta de mudança viram um AVISO igual para todos ("a Secretaria confere
// no avanço") — senão a própria lista diria quem está sob disciplina (revisão independente, 28/10/2026). O avanço, que é do nível geral, sempre confere de verdade.
function avaliarAscensao(dados, alvo, { modalidade = "INDICACAO", hojeIso, veDisciplina = true } = {}) {
  const d = dados || {};
  const itens = [];
  const outra = modalidade === "OUTRA_CONVENCAO";
  const presidencial = modalidade === "NOMEACAO_PRESIDENCIAL";
  const iAlvo = ESCADA.indexOf(alvo);
  if (iAlvo <= 0) {
    itens.push(item("degrau", "Cargo de destino", "Art. 71", "FALTA", "O tipo de consagração não leva a um cargo da escada."));
    return fechar(itens, alvo, modalidade);
  }

  // 1. O degrau (Art. 71): vedada a queima de etapas, salvo ministro já ordenado vindo de outra convenção.
  const iAtual = indice(d.cargoAtual);
  if (iAtual < 0) {
    itens.push(item("degrau", "Degrau da escada", "Art. 71", "FALTA", `O cargo atual (${String(d.cargoAtual)}) não faz parte da escada; a Secretaria corrige o cadastro.`));
  } else if (iAlvo <= iAtual) {
    itens.push(item("degrau", "Degrau da escada", "Art. 71", "FALTA", `A pessoa já é ${rotulo(d.cargoAtual)}.`));
  } else if (outra) {
    itens.push(item("degrau", "Degrau da escada", "Art. 71", "DISPENSADO", "Ministro já ordenado vindo de outra convenção: não precisa subir degrau por degrau."));
  } else if (iAlvo > iAtual + 1) {
    itens.push(item("degrau", "Degrau da escada", "Art. 71", "FALTA", `Vedada a "queima de etapas": de ${rotulo(d.cargoAtual)} o próximo degrau é ${rotulo(ESCADA[iAtual + 1])}.`));
  } else {
    itens.push(item("degrau", "Degrau da escada", "Art. 71", "ATENDE", `De ${rotulo(d.cargoAtual)} para ${rotulo(alvo)}.`));
  }

  // 2. Evangelista e Pastor: só por indicação do Pastor Presidente (Art. 72, V, a).
  if (alvo === "EVANGELISTA" || alvo === "PASTOR") {
    itens.push(modalidade === "INDICACAO"
      ? item("prerrogativa", "Indicação do Pastor Presidente", "Art. 72, V, a", "FALTA", "Evangelista e Pastor só por indicação do Pastor Presidente (registre como nomeação direta).")
      : item("prerrogativa", "Indicação do Pastor Presidente", "Art. 72, V, a", "ATENDE", MODALIDADES[modalidade].rotulo + "."));
    itens.push(item("ciadseta", "Homologação da Convenção (CIADSETA)", "Art. 72, V, a", "AVISO", "A ordenação depende da homologação da Convenção Estadual."));
  }

  // 3. Plena comunhão (Art. 72, caput; Estatuto Art. 23): a situação do cadastro (que quem tem "pessoas" já vê) e, à parte, disciplina e carta de mudança.
  // a licença de candidatura não trava a escada (decisão do responsável, 29/10/2026 — Art. 157 §2º afasta das funções, não do processo)
  itens.push((d.status !== "ATIVO" && d.status !== "LICENCA_CANDIDATURA") || !d.emComunhao
    ? item("comunhao", "Membro ativo em plena comunhão", "Art. 72, caput", "FALTA", "A pessoa não está ativa em plena comunhão.")
    : item("comunhao", "Membro ativo em plena comunhão", "Art. 72, caput", "ATENDE"));
  const ROT_DISC = "Sem disciplina em curso nem carta de mudança";
  if (!veDisciplina) itens.push(item("disciplina", ROT_DISC, "Art. 72, caput", "AVISO", "A Secretaria confere no avanço do processo."));
  else if (d.sobDisciplina) itens.push(item("disciplina", ROT_DISC, "Art. 72, caput", "FALTA", "Há disciplina em curso."));
  else if (d.cartaMudanca) itens.push(item("disciplina", ROT_DISC, "Art. 72, caput", "FALTA", "Carta de mudança já emitida (trânsito em curso)."));
  else itens.push(item("disciplina", ROT_DISC, "Art. 72, caput", "ATENDE"));

  // 4. Fidelidade financeira (Art. 72, caput).
  itens.push(d.dizimistaFiel === true
    ? item("dizimo", "Dizimista fiel", "Art. 72, caput", "ATENDE")
    : d.dizimistaFiel === false
      ? item("dizimo", "Dizimista fiel", "Art. 72, caput", "FALTA", "O cadastro diz que não é dizimista fiel.")
      : item("dizimo", "Dizimista fiel", "Art. 72, caput", "SEM_DADO", "O cadastro não diz se é dizimista fiel."));

  // 5. Auxiliar: idade e membresia (Art. 72, I, a).
  if (alvo === "AUXILIAR") {
    const idade = idadeEm(d.dataNascimento, hojeIso);
    itens.push(idade === null
      ? item("idade", `Idade mínima de ${IDADE_MINIMA_AUXILIAR} anos`, "Art. 72, I, a", "SEM_DADO", "Falta a data de nascimento no cadastro.")
      : item("idade", `Idade mínima de ${IDADE_MINIMA_AUXILIAR} anos`, "Art. 72, I, a", idade >= IDADE_MINIMA_AUXILIAR ? "ATENDE" : "FALTA", `${idade} anos.`));
    const admissao = isoDe(d.dataAdmissao);
    const anos = idadeEm(admissao, hojeIso);
    itens.push(anos === null
      ? item("membresia", "1 ano de membresia ininterrupta", "Art. 72, I, a; Art. 131 §4º, II", "SEM_DADO", "Falta a data de admissão (última recepção) no cadastro.")
      : anos >= ANOS_MEMBRESIA_AUXILIAR
        ? item("membresia", "1 ano de membresia ininterrupta", "Art. 72, I, a; Art. 131 §4º, II", "ATENDE", `Membro desde ${dataBr(admissao)}.`)
        : item("membresia", "1 ano de membresia ininterrupta", "Art. 72, I, a; Art. 131 §4º, II", "FALTA", `Membro desde ${dataBr(admissao)}; completa 1 ano em ${dataBr(somarAnos(admissao, ANOS_MEMBRESIA_AUXILIAR))}.`));
  }

  // 6. Interstício (Art. 72, II a IV).
  const inter = INTERSTICIO[alvo];
  if (inter) {
    const r = `${inter.anos} ano${inter.anos > 1 ? "s" : ""} como ${rotulo(inter.anterior)}`;
    const desde = isoDe(d.cargoDesde);
    if (outra) itens.push(item("intersticio", r, inter.artigo, "DISPENSADO", "Ministro já ordenado vindo de outra convenção."));
    else if (d.cargoAtual !== inter.anterior) itens.push(item("intersticio", r, inter.artigo, "FALTA", `A pessoa não é ${rotulo(inter.anterior)}.`));
    else if (!desde) itens.push(item("intersticio", r, inter.artigo, "SEM_DADO", "Falta a data de entrada no cargo atual (a Secretaria informa \"No cargo desde\" no cadastro da pessoa)."));
    else {
      const anos = idadeEm(desde, hojeIso);
      itens.push(anos >= inter.anos
        ? item("intersticio", r, inter.artigo, "ATENDE", `${rotulo(inter.anterior)} desde ${dataBr(desde)}.`)
        : item("intersticio", r, inter.artigo, "FALTA", `${rotulo(inter.anterior)} desde ${dataBr(desde)}; completa em ${dataBr(somarAnos(desde, inter.anos))}.`));
    }
  }

  // 7. Missionária é o teto para obreiras (Art. 71, III). A ressalva "salvo ordenação convencional específica" não é decidida pelo sistema (pode ser a da própria
  // CIADSETA): vale para todas as modalidades, inclusive quem vem de outra convenção — o responsável pode mudar (decisão registrada no plano).
  if (iAlvo > ESCADA.indexOf(TETO_OBREIRAS)) {
    if (d.sexo === "M") itens.push(item("sexo", "Acima de Missionário(a): obreiro", "Art. 71, III", "ATENDE"));
    else if (d.sexo === "F") itens.push(item("sexo", "Acima de Missionário(a): obreiro", "Art. 71, III", "FALTA", "Missionária é a patente máxima para obreiras, salvo ordenação convencional específica."));
    else itens.push(item("sexo", "Acima de Missionário(a): obreiro", "Art. 71, III", "SEM_DADO", "Falta o sexo no cadastro."));
  }

  // 8. Diácono: Batismo no Espírito Santo (Art. 72, III, a — marco do perfil).
  if (alvo === "DIACONO") {
    itens.push(d.batismoEspirito
      ? item("batismoEspirito", "Batismo no Espírito Santo", "Art. 72, III, a", "ATENDE")
      : item("batismoEspirito", "Batismo no Espírito Santo", "Art. 72, III, a", "FALTA", "Registre o marco \"Batismo no Espírito Santo\" no perfil da pessoa."));
  }

  // 8b. v8.6 — a educação continuada do obreiro em dia: a reciclagem anual aprovada (Art. 68 §3º) e o exame bienal sem pendência (Art. 70 §3º — reprovado fica "sob
  // observação" e não sobe; ausente sem justificativa fica suspenso). Não se dispensa em nenhuma modalidade. A ausência JUSTIFICADA é "sem sanção": só avisa.
  const ed = d.educacao || null;
  if (ed && (ed.reciclagemPendente || ed.suspensoExame || ed.sobObservacao)) {
    itens.push(item("educacao", "Educação continuada em dia", "Art. 68 §3º; Art. 70 §3º", "FALTA", ed.pendencias.join(" ")));
  } else if (ed && ed.devendoRepescagem) {
    itens.push(item("educacao", "Educação continuada em dia", "Art. 70 §3º", "AVISO", "Falta a repescagem do exame bienal (a ausência foi justificada: não impede)."));
  }

  // 9. AFM: matrícula, escolaridade e CHM. A matrícula INATIVA (Art. 69 §3º) é suspensão da credencial, não lacuna técnica: nenhuma modalidade dispensa.
  const afm = d.afm || null;
  if (afm && afm.statusMatricula === "INATIVA") {
    itens.push(item("matricula", "Matrícula ativa na AFM", "Art. 72, caput; Art. 69 §3º", "FALTA", alvo === "AUXILIAR"
      ? "A matrícula na AFM está inativa: a Academia matricula a pessoa de novo como candidata."
      : "Obreiro inativo na AFM: precisa de nova matrícula com a reciclagem."));
  } else if (!afm) {
    itens.push(item("matricula", "Matrícula ativa na AFM", alvo === "AUXILIAR" ? "Art. 72, I, b" : "Art. 72, caput", "FALTA",
      alvo === "AUXILIAR" ? "O candidato precisa estar matriculado na AFM cursando o Básico (a Academia matricula o candidato)." : "Sem matrícula na AFM.", true));
  } else {
    itens.push(item("matricula", "Matrícula ativa na AFM", "Art. 72, caput", "ATENDE"));
  }
  // v8.7: o nível vem também do histórico escolar (o curso que a pessoa cursa e o que concluiu — afm.niveisHistorico), junto com o registrado à mão
  const nivel = avaliarNivel(alvo, afm && afm.nivel, afm && afm.concluido, (afm && afm.niveisHistorico) || []);
  const nivelRotulo = rotuloDoPar(nivel.melhor);
  // O curso concluído de Evangelista e Pastor (Art. 72, V, b) é regra do CANDIDATO a ministro: não se dispensa nem na nomeação do Presidente. O ministro já ordenado que
  // vem de outra convenção não é candidato — o assento dele depende só do reconhecimento da função (Regimento Art. 8º e 10) — e faz o nivelamento depois.
  const ministro = (alvo === "EVANGELISTA" || alvo === "PASTOR") && !outra;
  if (nivel.exigido) {
    const artigoNivel = nivel.exigido.split(" — ")[1];
    itens.push(nivel.atende === true
      ? item("escolaridade", `Escolaridade: ${nivel.exigido.split(" — ")[0]}`, artigoNivel, "ATENDE", nivelRotulo)
      : item("escolaridade", `Escolaridade: ${nivel.exigido.split(" — ")[0]}`, artigoNivel, nivel.atende === null ? "SEM_DADO" : "FALTA",
        nivelRotulo ? `Hoje: ${nivelRotulo}.` : "O nível na AFM não foi informado.", !ministro));
  }
  itens.push(afm && afm.chm
    ? item("chm", "Certificado de Habilitação Ministerial (CHM)", "Art. 67 §1º; Art. 74, I", "ATENDE", afm.chmEm ? `Concedido em ${dataBr(isoDe(afm.chmEm))}.` : null)
    : item("chm", "Certificado de Habilitação Ministerial (CHM)", "Art. 67 §1º; Art. 74, I", "FALTA", "A AFM ainda não concedeu o CHM.", true));

  // 10. Estado civil (Art. 73) — avisos para o CEI, que examina na esteira (v8.3).
  if (d.estadoCivil === "DIVORCIADO") {
    itens.push(item("divorcio", "Escrutínio especial do CEI", "Art. 73, III, b", "AVISO", "Histórico de ruptura conjugal: o CEI faz o escrutínio especial antes da consagração."));
  }
  if (alvo === "PASTOR" && d.estadoCivil !== "CASADO") {
    itens.push(item("pastorCasado", "Pastor: casado", "Art. 73, II", "AVISO", "Exige-se, geralmente, que o Pastor seja casado (exceção de celibato reconhecida pela Convenção)."));
  }
  if (alvo === "PRESBITERO") {
    const idade = idadeEm(d.dataNascimento, hojeIso);
    if (idade === null || idade < IDADE_PREFERENCIAL_PRESBITERO) {
      itens.push(item("idadePresbitero", `Idade preferencial de ${IDADE_PREFERENCIAL_PRESBITERO} anos`, "Art. 72, IV, a", "AVISO", idade === null ? "Falta a data de nascimento." : `${idade} anos.`));
    }
  }

  // A nomeação direta do Presidente dispensa os requisitos técnicos (Art. 66 §4º) — o obreiro faz o nivelamento depois da posse (§5º). O curso concluído de Evangelista e
  // Pastor não é dispensado: é regra própria do cargo (Art. 72, V, b), que só nasce por indicação presidencial. Outra convenção: o mesmo, com o reconhecimento da função.
  if (presidencial || outra) {
    for (const it of itens) {
      if (it.tecnico && (it.situacao === "FALTA" || it.situacao === "SEM_DADO")) {
        it.situacao = "DISPENSADO";
        it.detalhe = `${it.detalhe ? it.detalhe + " " : ""}Dispensado na ${presidencial ? "nomeação direta (Art. 66 §4º)" : "recepção de ministro de outra convenção"}: nivelamento obrigatório depois da posse (Art. 66 §5º).`;
      }
    }
  }
  return fechar(itens, alvo, modalidade);
}

function fechar(itens, alvo, modalidade) {
  const travam = itens.filter((i) => i.situacao === "FALTA" || i.situacao === "SEM_DADO");
  return {
    alvo,
    alvoRotulo: rotulo(alvo),
    modalidade,
    itens,
    bloqueado: travam.length > 0,
    nivelamento: itens.some((i) => i.situacao === "DISPENSADO" && i.tecnico),
    mensagemBloqueio: travam.length ? `Requisitos da escada não atendidos (${rotulo(alvo)}): ${travam.map((i) => i.rotulo).join("; ")}.` : null
  };
}

// O avanço (nível geral) confere disciplina e carta de verdade; para quem avança sem a permissão "disciplina" sobre a pessoa, o motivo não aparece.
function mascararParaEscopo(avaliacao) {
  if (!avaliacao) return avaliacao;
  return {
    ...avaliacao,
    itens: avaliacao.itens.map((i) => (i.chave === "disciplina" && i.situacao === "FALTA" ? { ...i, detalhe: "Não está apto(a): quem cuida da disciplina informa o motivo." } : i))
  };
}

// Retrato curto para guardar no processo (cabe em 4000 caracteres): só chave e situação de cada item.
function retrato(avaliacao, hojeIso) {
  const r = { em: hojeIso, alvo: avaliacao.alvo, modalidade: avaliacao.modalidade, itens: avaliacao.itens.map((i) => [i.chave, i.situacao]) };
  return JSON.stringify(r).slice(0, 4000);
}

// Em nivelamento obrigatório (Art. 66 §5º): chegou ao cargo por nomeação direta ou como ministro de outra convenção e ainda não tem o nível que o cargo exige.
function emNivelamento(cargo, origemCargo, nivel, concluido, doHistorico = []) {
  if (origemCargo !== "NOMEACAO_PRESIDENCIAL" && origemCargo !== "OUTRA_CONVENCAO") return false;
  return avaliarNivel(cargo, nivel, concluido, doHistorico).atende !== true;
}

module.exports = {
  ESCADA, ROTULO_CARGO, MODALIDADES, INTERSTICIO, IDADE_MINIMA_AUXILIAR, IDADE_PREFERENCIAL_PRESBITERO, TETO_OBREIRAS,
  proximoDegrau, somarAnos, avaliarAscensao, mascararParaEscopo, retrato, emNivelamento
};
