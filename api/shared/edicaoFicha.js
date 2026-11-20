// shared/edicaoFicha.js (FASE 10, v10.1b passo 5, 18/11/2026) — as REGRAS PURAS da edição da ficha CAMPO A CAMPO (nenhuma consulta ao banco aqui; quem lê e
// grava é shared/edicaoFichaDb.js). Desenho aprovado pelo responsável: a secretaria muda um campo por vez, com quem mudou o quê e quando (rodada 8, edição
// opção 3); o membro vê tudo o que é dele, MUDA SOZINHO o contato, o endereço e o que estiver VAZIO, e SUGERE o resto, que a secretaria confere na caixa de
// sugestões (rodada 10, versão final do fluxo). As travas que o cadastro já tinha continuam (GestaoPessoas): ninguém muda o próprio nascimento, admissão,
// estado civil ou sexo; com processo de cargo em andamento, nascimento/admissão/estado civil só a Geral; com exclusão julgada, a data de admissão nova é a
// readmissão (só a Geral); CPF já gravado só a Geral (passo 1). Decisão nova do responsável: a secretaria local NÃO muda o NOME (só a Geral).
const auth = require("./auth");
const { ehGeral } = require("./escopoRotas");
const { secretariaLocalDe } = require("./transferencias");
const { escolaridadeValida, ESCOLARIDADES, lerCpf, mascararCpf, lerNomeFiliacao } = require("./fichaMembro");

const ESTADOS_CIVIS = ["SOLTEIRO", "CASADO", "VIUVO", "DIVORCIADO", "UNIAO_ESTAVEL"];
const FORMAS_ADMISSAO = ["BATISMO", "CARTA_MUDANCA", "RECONCILIACAO", "ACLAMACAO"];
const SEXOS = ["M", "F"];

// O catálogo dos campos que mudam por aqui. tipo: texto | data | lista | cpf | email | telefone | departamento | endereco.
// membro: DIRETO (sempre muda sozinho), VAZIO (muda sozinho só se estiver vazio; preenchido = sugere), SUGERIR (sempre sugere), NAO (não é dele mudar).
// escada: o campo conta para a escada ministerial / CEI (as travas do cadastro). soGeral: só a Secretaria Geral muda. soGeralSePreenchido: vazio qualquer um
// da secretaria preenche; preenchido só a Geral.
const CAMPOS = {
  nome: { coluna: "Nome", rotulo: "Nome", tipo: "texto", max: 200, grupo: "Dados pessoais", membro: "SUGERIR", soGeral: true },
  dataNascimento: { coluna: "DataNascimento", rotulo: "Data de nascimento", tipo: "data", grupo: "Dados pessoais", membro: "VAZIO", escada: true, proprioNao: true },
  sexo: { coluna: "Sexo", rotulo: "Sexo", tipo: "lista", lista: SEXOS, grupo: "Dados pessoais", membro: "VAZIO", proprioNao: true },
  estadoCivil: { coluna: "EstadoCivil", rotulo: "Estado civil", tipo: "lista", lista: ESTADOS_CIVIS, grupo: "Dados pessoais", membro: "VAZIO", escada: true, proprioNao: true },
  escolaridade: { coluna: "Escolaridade", rotulo: "Escolaridade", tipo: "lista", lista: ESCOLARIDADES.map((e) => e.codigo), grupo: "Dados pessoais", membro: "VAZIO" },
  cpf: { coluna: "Cpf", rotulo: "CPF", tipo: "cpf", grupo: "Dados pessoais", membro: "VAZIO", soGeralSePreenchido: true },
  nomeMae: { coluna: "NomeMae", rotulo: "Nome da mãe", tipo: "filiacao", quem: "da mãe", grupo: "Filiação", membro: "VAZIO" },
  nomePai: { coluna: "NomePai", rotulo: "Nome do pai", tipo: "filiacao", quem: "do pai", grupo: "Filiação", membro: "VAZIO" },
  telefone: { coluna: "Telefone", rotulo: "Celular", tipo: "telefone", grupo: "Contato", membro: "DIRETO" },
  email: { coluna: "Email", rotulo: "E-mail", tipo: "email", grupo: "Contato", membro: "DIRETO" },
  endereco: { coluna: "Endereco", rotulo: "Endereço", tipo: "endereco", grupo: "Contato", membro: "DIRETO" },
  departamentoId: { coluna: "DepartamentoId", rotulo: "Departamento", tipo: "departamento", grupo: "Na igreja", membro: "NAO" },
  dataAdmissao: { coluna: "DataAdmissao", rotulo: "Membro desde (admissão)", tipo: "data", grupo: "Na igreja", membro: "SUGERIR", escada: true, proprioNao: true, readmissao: true },
  formaAdmissao: { coluna: "FormaAdmissao", rotulo: "Como entrou", tipo: "lista", lista: FORMAS_ADMISSAO, grupo: "Na igreja", membro: "SUGERIR" },
  dataBatismo: { coluna: "DataBatismo", rotulo: "Batismo nas águas", tipo: "data", grupo: "Vida espiritual", membro: "SUGERIR" },
  origem: { coluna: "Origem", rotulo: "Procedência", tipo: "texto", max: 150, grupo: "Vida espiritual", membro: "SUGERIR" },
  igrejaAnterior: { coluna: "IgrejaAnterior", rotulo: "Igreja anterior", tipo: "texto", max: 150, grupo: "Vida espiritual", membro: "SUGERIR" },
  dataRitoRecebimento: { coluna: "DataRitoRecebimento", rotulo: "Rito de recebimento", tipo: "data", grupo: "Na igreja", membro: "SUGERIR" },
  nomeLidoRito: { coluna: "NomeLidoRito", rotulo: "Nome lido no rito", tipo: "texto", max: 200, grupo: "Na igreja", membro: "SUGERIR" },
  ministranteRito: { coluna: "MinistranteRito", rotulo: "Ministrante do rito", tipo: "texto", max: 150, grupo: "Na igreja", membro: "SUGERIR" }
};
// O que NÃO muda por aqui e por onde muda (a tela mostra o caminho certo). Sem protótipo: "constructor" ou "__proto__" vindos de fora não viram mensagem.
const OUTRO_CAMINHO = Object.assign(Object.create(null), {
  congregacaoId: "A congregação muda pela transferência.",
  cargoMinisterial: "O cargo muda pela esteira de consagração (a Secretaria Geral corrige no cadastro completo).",
  status: "A situação no rol muda pelo desligamento, pela carta ou pelo processo.",
  situacaoMembro: "A situação no rol muda pelo desligamento, pela carta ou pelo processo.",
  dizimistaFiel: "\"Dizimista fiel\" só a Secretaria Geral afirma, no cadastro completo.",
  extensaoId: "A Extensão da Tenda muda pelo cadastro completo ou pela transferência.",
  motivoSaida: "A saída é registrada pelo desligamento.",
  dataSaida: "A saída é registrada pelo desligamento."
});

const ehCampo = (chave) => typeof chave === "string" && Object.prototype.hasOwnProperty.call(CAMPOS, chave);

// O papel de quem edita a ficha: GERAL (Secretaria Geral) ou SECRETARIA (qualquer outra concessão de "pessoas" que alcança a pessoa — a congregação, a área).
// `visao` = a visão da permissão "pessoas" já conferida no escopo da pessoa.
const papelNaFicha = (visao) => (!visao ? null : ehGeral(visao) ? "GERAL" : "SECRETARIA");

// Quem APLICA uma sugestão do membro (a caixa): a Geral (tudo) ou a secretaria LOCAL da congregação da pessoa — a mesma regra da transferência
// (shared/transferencias.js, secretariaLocalDe: concessão de nível CONGREGAÇÃO que cobre a congregação inteira; a presa a uma Extensão da Tenda acompanha).
// A área e os outros níveis ACOMPANHAM (veem, não aplicam). Decisão do responsável (rodada 10).
function podeAplicarSugestao(visao, congregacaoNome) {
  if (!visao) return false;
  if (ehGeral(visao)) return true;
  return secretariaLocalDe(visao, congregacaoNome);
}

const vazio = (v) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

// A secretaria pode mudar este campo desta pessoa? ctx: { papel, ehProprio, valorAtual, emProcessoDeCargo, temExclusao }. Devolve { pode, motivo }.
function podeSecretariaMudar(chave, ctx) {
  if (!ehCampo(chave)) return { pode: false, motivo: OUTRO_CAMINHO[chave] || "Este campo não muda por aqui." };
  const c = CAMPOS[chave];
  const geral = ctx.papel === "GERAL";
  if (!ctx.papel) return { pode: false, motivo: "Sem acesso a esta ficha." };
  if (c.proprioNao && ctx.ehProprio) return { pode: false, motivo: `Ninguém altera ${c.rotulo.toLowerCase()} do próprio cadastro: peça a outra pessoa da Secretaria.` };
  if (c.soGeral && !geral) return { pode: false, motivo: `${c.rotulo}: só a Secretaria Geral muda.` };
  if (c.soGeralSePreenchido && !geral && !vazio(ctx.valorAtual)) return { pode: false, motivo: `${c.rotulo} já gravado: só a Secretaria Geral troca.` };
  if (c.escada && ctx.emProcessoDeCargo && !geral) return { pode: false, motivo: `Esta pessoa tem um processo de cargo em andamento: ${c.rotulo.toLowerCase()} só a Secretaria Geral altera.` };
  // (a mensagem não diz "exclusão": quem vê a ficha sem a permissão "disciplina" não fica sabendo do processo por aqui)
  if (c.readmissao && ctx.temExclusao && !geral) return { pode: false, motivo: `${c.rotulo}: nesta ficha, só a Secretaria Geral altera.` };
  return { pode: true, motivo: null };
}

// O que o MEMBRO faz com o próprio campo: DIRETO (muda sozinho), SUGERIR (manda para a secretaria) ou NAO (não é dele). O VAZIO vira DIRETO se estiver vazio —
// menos o que conta para a escada (nascimento, estado civil) quando há um processo de cargo em andamento: aí até o vazio vai como sugestão (Trava 8-A).
function modoDoMembro(chave, valorAtual, { emProcessoDeCargo = false } = {}) {
  if (!ehCampo(chave)) return "NAO";
  const c = CAMPOS[chave];
  if (c.membro === "VAZIO") return vazio(valorAtual) && !(c.escada && emProcessoDeCargo) ? "DIRETO" : "SUGERIR";
  return c.membro;
}

// A tabela "quem muda o quê" (para a tela): por campo, o que a Secretaria Geral, a secretaria (congregação ou área) e o próprio membro podem fazer.
// MUDA | SE_VAZIO (preenche o vazio; preenchido, só a Geral) | SO_GERAL | SUGERE | NAO. `travas` = as condições que ainda podem barrar.
function tabelaDePapeis() {
  return Object.entries(CAMPOS).map(([chave, c]) => {
    const travas = [];
    if (c.proprioNao) travas.push("Ninguém muda no próprio cadastro.");
    if (c.escada) travas.push("Com processo de cargo em andamento, só a Secretaria Geral.");
    if (c.readmissao) travas.push("Com exclusão julgada, a admissão nova é a readmissão: só a Secretaria Geral.");
    return {
      chave, rotulo: c.rotulo, grupo: c.grupo,
      geral: "MUDA",
      secretaria: c.soGeral ? "SO_GERAL" : c.soGeralSePreenchido ? "SE_VAZIO" : "MUDA",
      membro: c.membro === "DIRETO" ? "MUDA" : c.membro === "VAZIO" ? "SE_VAZIO" : c.membro === "SUGERIR" ? "SUGERE" : "NAO",
      travas
    };
  });
}

const dataISOValida = (txt) => typeof txt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(txt) && !Number.isNaN(Date.parse(`${txt}T00:00:00Z`))
  && new Date(`${txt}T00:00:00Z`).toISOString().slice(0, 10) === txt;

// Confere e normaliza o valor de um campo (o endereço é conferido por shared/territorioDb.js, o departamento no banco). Devolve { ok, valor, mensagem }.
// `hoje` = AAAA-MM-DD (Brasília), para recusar data no futuro.
function validar(chave, valor, hoje) {
  if (!ehCampo(chave)) return { ok: false, mensagem: OUTRO_CAMINHO[chave] || "Campo desconhecido." };
  const c = CAMPOS[chave];
  if (c.tipo === "endereco") return { ok: true, valor };   // conferido na gravação (territorioDb.prepararEnderecoMembro)
  if (c.tipo === "departamento") {
    if (vazio(valor)) return { ok: true, valor: null };
    const id = auth.idDeRota(valor);
    return id ? { ok: true, valor: id } : { ok: false, mensagem: "Departamento inválido." };
  }
  if (c.tipo === "cpf") { const r = lerCpf(valor); return r.ok ? { ok: true, valor: r.cpf } : { ok: false, mensagem: r.mensagem }; }
  if (c.tipo === "filiacao") { const r = lerNomeFiliacao(valor, c.quem); return r.ok ? { ok: true, valor: r.nome } : { ok: false, mensagem: r.mensagem }; }
  if (valor !== null && valor !== undefined && typeof valor !== "string" && typeof valor !== "number") return { ok: false, mensagem: `${c.rotulo}: valor inválido.` };
  const txt = vazio(valor) ? null : String(valor).replace(/\s+/g, " ").trim();
  if (c.tipo === "data") {
    if (txt === null) return chave === "dataNascimento" ? { ok: false, mensagem: "A data de nascimento não pode ficar vazia." } : { ok: true, valor: null };
    if (!dataISOValida(txt)) return { ok: false, mensagem: `${c.rotulo}: informe dia, mês e ano.` };
    if (hoje && txt > hoje) return { ok: false, mensagem: `${c.rotulo}: a data não pode ser no futuro.` };
    if (txt < "1900-01-01") return { ok: false, mensagem: `${c.rotulo}: a data está antiga demais.` };
    return { ok: true, valor: txt };
  }
  if (c.tipo === "lista") {
    if (txt === null) return { ok: true, valor: null };
    if (chave === "escolaridade" ? !escolaridadeValida(txt) : !c.lista.includes(txt)) return { ok: false, mensagem: `${c.rotulo}: escolha uma opção da lista.` };
    return { ok: true, valor: txt };
  }
  if (c.tipo === "email") {
    if (txt === null) return { ok: true, valor: null };
    if (txt.length > 150 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(txt)) return { ok: false, mensagem: "E-mail inválido." };
    return { ok: true, valor: txt };
  }
  if (c.tipo === "telefone") {
    if (txt === null) return { ok: true, valor: null };
    if (txt.length > 20 || !/^[\d\s()+-]+$/.test(txt) || txt.replace(/\D/g, "").length < 8) return { ok: false, mensagem: "Telefone inválido." };
    return { ok: true, valor: txt };
  }
  // texto
  if (txt === null) return chave === "nome" ? { ok: false, mensagem: "O nome não pode ficar vazio." } : { ok: true, valor: null };
  if (txt.length > (c.max || 200)) return { ok: false, mensagem: `${c.rotulo}: passa de ${c.max || 200} letras.` };
  if (/[<>]/.test(txt)) return { ok: false, mensagem: `${c.rotulo}: tem caracteres que não podem ser usados.` };
  if (chave === "nome" && txt.length < 2) return { ok: false, mensagem: "O nome está curto demais." };
  return { ok: true, valor: txt };
}

// O valor como o banco devolve -> texto para comparar e mostrar (datas em AAAA-MM-DD, números em texto, nada -> null).
function valorParaTexto(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const t = String(v).trim();
  return t === "" ? null : t;
}

// Mascara para a trilha e para a caixa (quem não é a Geral): o CPF, o e-mail e o telefone nunca saem inteiros num histórico.
function mascarar(chave, v) {
  if (v === null || v === undefined || v === "") return v === undefined ? undefined : null;
  if (chave === "cpf") return mascararCpf(v) || "***";
  if (chave === "email") { const m = /^([^@])([^@]*)(@.*)$/.exec(String(v)); return m ? `${m[1]}${"*".repeat(Math.min(m[2].length, 6))}${m[3]}` : "***"; }
  if (chave === "telefone") { const d = String(v).replace(/\D/g, ""); return d.length >= 4 ? `${"*".repeat(Math.max(0, d.length - 4))}${d.slice(-4)}` : "***"; }
  return v;
}

module.exports = { CAMPOS, OUTRO_CAMINHO, ESTADOS_CIVIS, FORMAS_ADMISSAO, ehCampo, papelNaFicha, podeAplicarSugestao, podeSecretariaMudar, modoDoMembro, tabelaDePapeis,
  validar, valorParaTexto, mascarar, vazio, dataISOValida };
