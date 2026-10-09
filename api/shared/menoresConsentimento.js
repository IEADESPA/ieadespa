// shared/menoresConsentimento.js (v7.7 — Habilitação para Ministério com Menores)
//
// O consentimento ESPECÍFICO e em DESTAQUE do responsável legal para tratar dado de criança ou adolescente (LGPD, art. 14, § 1º; art. 11, I, para dado de saúde).
// Duas finalidades, cada uma com o seu texto e o seu hash — uma não vale pela outra:
//   IMAGEM        a foto do(a) menor no cadastro, no crachá e em materiais internos da Igreja;
//   SAUDE_CRACHA  a alergia ou condição de saúde que o responsável ESCOLHE informar para constar no crachá do check-in infantil (v7.10). Dado sensível: só para
//                 o cuidado e a segurança do(a) menor. O dado em si chega com a v7.10; o consentimento já pode ser dado e revogado.
//
// Regra pura, sem banco (a parte com banco está em shared/menoresConsentimentoDb.js). Princípios:
//  1) TRILHA DE ACRÉSCIMO: cada concessão ou revogação é uma linha nova (tabela MinisterioMenoresConsentimentos, migração 143); o estado atual de cada par
//     (menor, finalidade) é a ÚLTIMA linha. Nada se altera nem se apaga (só o IP é anonimizado depois da retenção).
//  2) A PROVA É O TEXTO QUE A PESSOA VIU: o aceite guarda a versão e o hash do texto MOSTRADO (como o aceite do Termo dos Setores Técnicos). Se o texto mudou entre
//     "abrir a tela" e "marcar a caixa", o aceite é recusado e a pessoa lê de novo (`termoMudou`).
//  3) QUEM CONCEDEU TEM DE CONTINUAR SENDO RESPONSÁVEL: a autorização só vale enquanto quem a deu ainda é responsável ATIVO do menor (VoluntariadoResponsaveis,
//     cadastrado pela Secretaria com o documento conferido). Se ele foi revogado, a autorização deixa de valer — calculado na leitura, a prova não se mexe.
//  4) MENOR É QUEM TEM IDADE CONHECIDA < 18. Idade desconhecida NÃO se presume menor (a mesma regra do aceite do voluntariado): sem data de nascimento no cadastro,
//     a Secretaria completa o cadastro antes.
//  5) É OPCIONAL: nenhum destes consentimentos condiciona a participação do menor em coisa alguma (o texto diz isso, e o sistema nunca trava serviço por causa dele).
//
// Os textos são RASCUNHO JURÍDICO aprovado pelo responsável pelo projeto sem parecer de advogado (a Igreja não tem). Trocar um texto cria outra versão e outro
// hash, sem invalidar o que já foi aceito. Se a mudança AMPLIAR o que a Igreja faz com o dado, suba CONSENTIMENTO_VERSAO e passe a exigir nova autorização.
const crypto = require("crypto");
const vol = require("./voluntariado");
const { inteiroPositivo } = require("./setoresTecnicos");

const sha256 = (txt) => crypto.createHash("sha256").update(txt).digest("hex");
// Só texto e número viram texto: lista e objeto não (String({}) daria "[object Object]", que passaria como referência de ficha).
const limpar = (v) => (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const temMarca = (s) => /[<>]/.test(s);

const CONSENTIMENTO_VERSAO = 1;
const MAIORIDADE = vol.MAIORIDADE;
const IP_RETENCAO_DIAS_PADRAO = vol.IP_RETENCAO_DIAS_PADRAO;
const IP_ANONIMIZADO = "anonimizado";
// Revogar é um direito (LGPD art. 8º, § 5º: "procedimento gratuito e facilitado"): se por algum motivo técnico o IP não chegou, a revogação NÃO fica bloqueada.
// O banco exige um valor no IP do aceite digital; este marcador diz que a origem não foi identificada. Conceder, ao contrário, sempre exige IP público.
const IP_INDISPONIVEL = "indisponivel";
const MAX_REFERENCIA = 200;
const LIMITE_LISTA = 300;

// ---------------------------------------------------------------
// Catálogos
// ---------------------------------------------------------------

const FINALIDADES = {
  IMAGEM: "Uso da imagem (foto) no cadastro, no crachá e em materiais internos",
  SAUDE_CRACHA: "Alergia ou condição de saúde no crachá do check-in infantil"
};
const CODIGOS_FINALIDADE = Object.keys(FINALIDADES);
const FORMAS = {
  CLICK_RESP: "Autorização digital do responsável (com IP, data e hora)",
  FICHA_FISICA: "Ficha assinada pelo responsável, registrada pela Secretaria"
};
const SITUACOES = {
  CONCEDIDO: "Autorizado",
  REVOGADO: "Revogado",
  NUNCA_DADO: "Não autorizado",
  SEM_RESPONSAVEL_ATIVO: "Sem responsável ativo"
};

const MENSAGENS = {
  NAO_E_RESPONSAVEL: "Você não é o responsável cadastrado desta pessoa. Procure a Secretaria da congregação.",
  FORA_DO_ESCOPO: "Fora do seu escopo de atuação.",
  MENOR_NAO_ACHADO: "Menor não encontrado.",
  SEM_IP: "Não foi possível registrar a origem da conexão (IP), que a Igreja guarda como prova da sua autorização. Tente de novo ou peça à Secretaria para registrar a ficha assinada.",
  TEXTO_MUDOU: "O texto da autorização mudou desde que você abriu a tela (ou a tela está desatualizada): recarregue, leia de novo e autorize.",
  CONCORRENCIA: "O cadastro mudou enquanto você autorizava (outra pessoa já registrou, ou o cadastro de responsável foi alterado): atualize a tela e confira."
};

// ---------------------------------------------------------------
// Os textos (um por finalidade). `base` é o fundamento legal de cada item; o hash cobre versão, finalidade, título, itens e a frase de aceite.
// ---------------------------------------------------------------

const ITEM_RESPONSAVEL = {
  codigo: "RESPONSAVEL", base: "LGPD, art. 14, § 1º; Código Civil, arts. 1.634, VII, e 1.747, I",
  texto: "Declaro que sou o pai, a mãe, o tutor ou o responsável legal do(a) menor indicado(a) nesta tela e que tenho poder para decidir sobre os dados dele(a)."
};
const ITEM_REGISTRO = {
  codigo: "REGISTRO", base: "Regimento Art. 133 § 8º, II; LGPD, art. 16",
  texto: "Entendo que marcar a caixa de aceite vale como a minha assinatura eletrônica e que a Igreja guarda, como prova, a minha matrícula como responsável, o IP, a data e a hora do aceite e o texto que li. O IP é anonimizado 5 anos depois do registro."
};

const TEXTOS_BRUTOS = {
  IMAGEM: {
    titulo: "Autorização do responsável: uso da imagem de criança ou adolescente",
    itens: [
      ITEM_RESPONSAVEL,
      {
        codigo: "O_QUE", base: "LGPD, art. 14, § 1º (consentimento específico e em destaque)",
        texto: "O que será feito: a Igreja guarda uma foto do rosto do(a) menor no cadastro dele(a) neste sistema e a usa para identificá-lo(a): no crachá e em materiais internos da Igreja (por exemplo, a lista da sala e a identificação na entrada e na saída). Esta autorização vale só para isso e não depende de nenhuma outra."
      },
      {
        codigo: "QUEM_VE", base: "LGPD, art. 6º, III (necessidade), e art. 14 (melhor interesse da criança)",
        texto: "Quem pode ver: só quem cuida do cadastro e do ministério com crianças e adolescentes (Secretaria, liderança e equipe da sala) e quem confere o crachá. A foto não é publicada na internet, nas redes sociais nem no site, e não é entregue a terceiros. O crachá impresso fica com o(a) menor durante o serviço: quem o vir poderá ver a foto."
      },
      {
        codigo: "PRAZO", base: "LGPD, arts. 15 e 16",
        texto: "Por quanto tempo: até eu revogar. Se eu deixar de ser o responsável cadastrado do(a) menor, ou quando ele(a) completar 18 anos, esta autorização deixa de valer: um novo responsável cadastrado (ou o próprio jovem, aos 18 anos) precisa decidir de novo."
      },
      {
        codigo: "OPCIONAL", base: "LGPD, art. 5º, XII (consentimento livre), e art. 8º",
        texto: "É opcional: dar esta autorização NÃO é condição para o(a) menor participar das atividades, do ministério ou de qualquer serviço da Igreja. Sem ela, ele(a) participa normalmente, só sem foto no cadastro e no crachá."
      },
      {
        codigo: "REVOGAR", base: "LGPD, art. 8º, § 5º (revogação a qualquer momento, gratuita e facilitada)",
        texto: "Como revogar: posso revogar a qualquer momento, de graça e sem dar explicação, em Meu Painel → Ministério com menores (ou pedindo à Secretaria). Ao revogar, o arquivo da foto é apagado e a imagem deixa de ser usada."
      },
      ITEM_REGISTRO
    ],
    aceite: "Li, entendi e, como responsável legal, autorizo o uso da imagem do(a) menor da forma descrita acima."
  },
  SAUDE_CRACHA: {
    titulo: "Autorização do responsável: alergia ou condição de saúde no crachá",
    itens: [
      ITEM_RESPONSAVEL,
      {
        codigo: "O_QUE", base: "LGPD, art. 14, § 1º (consentimento específico e em destaque)",
        texto: "O que será feito: se eu quiser, informo uma alergia ou uma condição de saúde do(a) menor (por exemplo, alergia a amendoim ou a leite, ou necessidade de remédio) para a Igreja imprimir no crachá do check-in infantil, de modo que a equipe da sala saiba cuidar dele(a). Informo só o que eu escolher: não preciso entregar laudo nem diagnóstico. O check-in infantil com crachá ainda está sendo preparado: a autorização fica registrada desde já, vale só para essa finalidade e não depende de nenhuma outra."
      },
      {
        codigo: "DADO_SENSIVEL", base: "LGPD, art. 11, I (dado sensível: consentimento específico e destacado), e art. 14, § 1º",
        texto: "Dado sensível: informação de saúde é dado pessoal sensível. Por isso só é tratada com esta autorização específica e em destaque, e só para o cuidado e a segurança do(a) menor durante as atividades. Nunca é usada para outra coisa, como lista, cobrança, divulgação ou decisão sobre a participação dele(a)."
      },
      {
        codigo: "QUEM_VE", base: "LGPD, art. 6º, III (necessidade), e art. 14 (melhor interesse da criança)",
        texto: "Quem pode ver: a equipe que cuida do(a) menor naquele serviço (quem confere o crachá na entrada, na sala e na saída) e a coordenação do ministério com crianças e adolescentes. O crachá fica com o(a) menor durante o serviço: quem o vir poderá ler o que estiver impresso nele. A informação não é entregue a terceiros."
      },
      {
        codigo: "PRAZO", base: "LGPD, arts. 15 e 16",
        texto: "Por quanto tempo: só enquanto esta autorização estiver valendo e o(a) menor participar das atividades. Se eu deixar de ser o responsável cadastrado do(a) menor, ou quando ele(a) completar 18 anos, a autorização deixa de valer."
      },
      {
        codigo: "OPCIONAL", base: "LGPD, art. 5º, XII (consentimento livre), e art. 8º",
        texto: "É opcional: dar esta autorização NÃO é condição para o(a) menor participar das atividades, do ministério ou de qualquer serviço da Igreja. Sem ela, ele(a) participa normalmente, só sem essa informação no crachá (e eu posso avisar a equipe pessoalmente)."
      },
      {
        codigo: "REVOGAR", base: "LGPD, art. 8º, § 5º (revogação a qualquer momento, gratuita e facilitada)",
        texto: "Como revogar: posso revogar a qualquer momento, de graça e sem dar explicação, em Meu Painel → Ministério com menores (ou pedindo à Secretaria). Ao revogar, a informação de saúde deixa de ser usada no crachá e é apagada."
      },
      ITEM_REGISTRO
    ],
    aceite: "Li, entendi e, como responsável legal, autorizo o uso da informação de saúde do(a) menor no crachá, da forma descrita acima."
  }
};

// O hash é o mesmo desenho de shared/voluntariado.js::TERMO_MENOR_HASH e de setoresTecnicos.js::termoDoSetor: sha256 do JSON do que a pessoa leu.
const TEXTOS = {};
for (const finalidade of CODIGOS_FINALIDADE) {
  const t = TEXTOS_BRUTOS[finalidade];
  TEXTOS[finalidade] = {
    versao: CONSENTIMENTO_VERSAO, finalidade, titulo: t.titulo, itens: t.itens, aceite: t.aceite,
    hash: sha256(JSON.stringify({ v: CONSENTIMENTO_VERSAO, finalidade, titulo: t.titulo, itens: t.itens, aceite: t.aceite }))
  };
}

const ehFinalidade = (f) => typeof f === "string" && Object.prototype.hasOwnProperty.call(FINALIDADES, f);

// O texto vigente de uma finalidade ({ versao, finalidade, rotulo, titulo, itens[{codigo,base,texto}], aceite, hash }) ou null. Devolve cópia: quem chama não muda o texto.
function textoDe(finalidade) {
  if (!ehFinalidade(finalidade)) return null;
  const t = TEXTOS[finalidade];
  return { versao: t.versao, finalidade, rotulo: FINALIDADES[finalidade], titulo: t.titulo, itens: t.itens.map((i) => ({ ...i })), aceite: t.aceite, hash: t.hash };
}
const textosVigentes = () => CODIGOS_FINALIDADE.map(textoDe);

// O hash enviado é o do texto desta versão? (Só a versão atual tem texto em código; o hash enviado é o do texto que a tela mostrou.)
function hashConfere(finalidade, hashEnviado) {
  const t = TEXTOS[finalidade];
  return !!t && typeof hashEnviado === "string" && hashEnviado.trim().toLowerCase() === t.hash;
}

// Como a prova de um registro se confere com o texto de hoje. A ficha assinada tem o documento arquivado como prova (o sistema guarda a versão e o hash do texto
// que a ficha deveria trazer, mas a assinatura está no papel).
function avaliarIntegridade({ forma, textoVersao, textoHash } = {}, finalidade) {
  if (forma === "FICHA_FISICA") return { status: "DOCUMENTO_EXTERNO", mensagem: "A prova é a ficha assinada, apontada na referência (guardada pela Secretaria)." };
  const t = TEXTOS[finalidade];
  if (!t || !textoHash) return { status: "SEM_HASH", mensagem: "Registro sem o hash do texto." };
  if (Number(textoVersao) < t.versao) return { status: "VERSAO_ANTERIOR", mensagem: `Autorizou a versão ${textoVersao} do texto; a vigente é a ${t.versao}. O hash guardado prova o texto da época.` };
  if (Number(textoVersao) === t.versao && textoHash !== t.hash) return { status: "DIVERGENTE", mensagem: "O texto da versão vigente mudou sem trocar o número da versão: avise a equipe técnica." };
  return { status: "OK", mensagem: "Íntegro: o texto aceito é o da versão vigente." };
}

// ---------------------------------------------------------------
// Idade
// ---------------------------------------------------------------

// Menor = idade CONHECIDA abaixo de 18. Sem data de nascimento não se presume (nem menor, nem adulto).
const ehMenor = (idade) => idade != null && idade < MAIORIDADE;
const ehAdulto = (idade) => idade != null && idade >= MAIORIDADE;
function condicaoDoMenor(idade) {
  if (idade == null) return { menor: false, motivo: "O cadastro não tem a data de nascimento, e sem ela não se sabe se a pessoa é menor de 18 anos. Peça à Secretaria para completar o cadastro." };
  if (idade >= MAIORIDADE) return { menor: false, motivo: "Esta pessoa já tem 18 anos ou mais: ela mesma decide sobre a própria imagem e os próprios dados." };
  return { menor: true, motivo: null };
}
function condicaoDoResponsavel(idade) {
  if (idade == null || idade < MAIORIDADE) return { pode: false, motivo: "A autorização só vale com um responsável de 18 anos ou mais e com a data de nascimento no cadastro. Procure a Secretaria." };
  return { pode: true, motivo: null };
}

// ---------------------------------------------------------------
// Estado atual de um par (menor, finalidade)
// ---------------------------------------------------------------

// `linha`: a ÚLTIMA linha da trilha do par ({ concedido, responsavelId, textoVersao, textoHash, forma, registradoEm }) ou null.
// `responsaveisAtivosIds`: matrículas dos responsáveis ATIVOS do menor (lista ou Set).
//   CONCEDIDO              a última linha concede E quem concedeu ainda é responsável ativo;
//   REVOGADO               a última linha revoga;
//   NUNCA_DADO             nenhuma linha, e há responsável que possa dar;
//   SEM_RESPONSAVEL_ATIVO  não há responsável ativo para decidir, ou quem concedeu deixou de ser responsável (a autorização dele não vale mais);
//                          nos dois casos `vigente` é falso até um responsável ativo autorizar.
function estadoDoConsentimento(linha, responsaveisAtivosIds) {
  const lista = responsaveisAtivosIds instanceof Set ? [...responsaveisAtivosIds] : Array.isArray(responsaveisAtivosIds) ? responsaveisAtivosIds : [];
  // Estrito também aqui: "0x28" não é a matrícula 40 (Number("0x28") daria 40).
  const ativos = new Set(lista.map(inteiroPositivo).filter(Boolean));
  const podeConceder = ativos.size > 0;
  const base = { podeConceder, quemAutorizouSaiu: false };
  const detalhes = (l) => ({
    textoVersao: l.textoVersao == null ? null : Number(l.textoVersao), desatualizado: l.textoVersao != null && Number(l.textoVersao) < CONSENTIMENTO_VERSAO,
    forma: l.forma || null, rotuloForma: l.forma ? FORMAS[l.forma] || null : null, registradoEm: l.registradoEm || null
  });
  const montar = (situacao, mensagem, vigente, extra = {}) => ({ situacao, rotulo: SITUACOES[situacao], vigente, mensagem, ...base, ...extra });

  if (!linha) {
    return podeConceder
      ? montar("NUNCA_DADO", "Ainda não há autorização registrada.", false)
      : montar("SEM_RESPONSAVEL_ATIVO", "Este(a) menor está sem responsável cadastrado: procure a Secretaria da congregação.", false);
  }
  if (!linha.concedido) return montar("REVOGADO", "A autorização foi revogada.", false, detalhes(linha));
  if (ativos.has(inteiroPositivo(linha.responsavelId))) return montar("CONCEDIDO", "Autorizado.", true, detalhes(linha));
  return montar(
    "SEM_RESPONSAVEL_ATIVO",
    podeConceder
      ? "Quem deu a autorização deixou de ser o responsável cadastrado: um responsável atual precisa autorizar de novo."
      : "Este(a) menor está sem responsável cadastrado: a autorização antiga não vale mais. Procure a Secretaria da congregação.",
    false, { ...detalhes(linha), quemAutorizouSaiu: true }
  );
}

// ---------------------------------------------------------------
// Validações de forma (ids estritos: "0x10", "1e1", true e [5] não são identificadores)
// ---------------------------------------------------------------

function validarFinalidade(valor) {
  const f = typeof valor === "string" ? valor.trim().toUpperCase() : "";
  if (!ehFinalidade(f)) return { valido: false, mensagem: `Escolha o que está sendo autorizado: ${CODIGOS_FINALIDADE.join(" ou ")}.` };
  return { valido: true, finalidade: f };
}

// O responsável concede (aceite digital). `ip`: o IP PÚBLICO identificado pela conexão (vol.extrairIp) — sem ele não há prova, e a autorização é recusada.
function validarConceder({ menorId, responsavelId, finalidade, aceito, termoHash, ip } = {}) {
  const mn = inteiroPositivo(menorId);
  if (!mn) return { valido: false, mensagem: "Informe o(a) menor." };
  const rs = inteiroPositivo(responsavelId);
  if (!rs) return { valido: false, mensagem: MENSAGENS.NAO_E_RESPONSAVEL };
  // A própria pessoa menor nunca é "o responsável" dela mesma: a mesma recusa de quem não é responsável (403).
  if (mn === rs) return { valido: false, proibido: true, mensagem: MENSAGENS.NAO_E_RESPONSAVEL };
  const f = validarFinalidade(finalidade);
  if (!f.valido) return f;
  if (aceito !== true) return { valido: false, mensagem: "Marque a caixa de aceite para autorizar." };
  // O hash do texto que a tela MOSTROU: se o texto mudou desde então (ou a tela é antiga), a pessoa lê de novo — ninguém autoriza um texto que não leu.
  if (!hashConfere(f.finalidade, termoHash)) return { valido: false, termoMudou: true, mensagem: MENSAGENS.TEXTO_MUDOU };
  if (!ip) return { valido: false, mensagem: MENSAGENS.SEM_IP };
  const t = TEXTOS[f.finalidade];
  return { valido: true, dados: { menorId: mn, responsavelId: rs, finalidade: f.finalidade, textoVersao: t.versao, textoHash: t.hash } };
}

// Revogar não exige caixa, hash nem IP: é um direito e nunca fica refém de detalhe técnico.
function validarRevogar({ menorId, responsavelId, finalidade } = {}) {
  const mn = inteiroPositivo(menorId);
  if (!mn) return { valido: false, mensagem: "Informe o(a) menor." };
  const rs = inteiroPositivo(responsavelId);
  if (!rs) return { valido: false, mensagem: MENSAGENS.NAO_E_RESPONSAVEL };
  if (mn === rs) return { valido: false, proibido: true, mensagem: MENSAGENS.NAO_E_RESPONSAVEL };
  const f = validarFinalidade(finalidade);
  if (!f.valido) return f;
  return { valido: true, dados: { menorId: mn, responsavelId: rs, finalidade: f.finalidade } };
}

// A Secretaria registra a ficha assinada (concede ou revoga). Quem registra não é o responsável que assinou, nem o(a) próprio(a) menor (separação de funções;
// o banco também recusa: CK_MenoresConsent_Ficha). `referencia`: onde está a ficha (número, pasta ou arquivo) — é a prova.
function validarRegistroManual({ menorId, responsavelId, finalidade, concedido, referencia, por } = {}) {
  const mn = inteiroPositivo(menorId);
  if (!mn) return { valido: false, mensagem: "Informe o(a) menor." };
  const rs = inteiroPositivo(responsavelId);
  if (!rs) return { valido: false, mensagem: "Informe o responsável que assinou a ficha." };
  const quem = inteiroPositivo(por);
  if (!quem) return { valido: false, mensagem: "Quem registra precisa estar identificado." };
  if (mn === rs) return { valido: false, mensagem: "O responsável não pode ser a própria pessoa menor de idade." };
  const f = validarFinalidade(finalidade);
  if (!f.valido) return f;
  if (typeof concedido !== "boolean") return { valido: false, mensagem: "Informe se a ficha autoriza ou revoga (true ou false)." };
  const ref = limpar(referencia);
  if (ref.length < 3 || ref.length > MAX_REFERENCIA || temMarca(ref)) return { valido: false, mensagem: `Informe onde está a ficha assinada (número, pasta ou arquivo digital): de 3 a ${MAX_REFERENCIA} caracteres, sem < ou >.` };
  if (quem === rs) return { valido: false, proibido: true, mensagem: "Quem registra a ficha não pode ser o próprio responsável que assinou: peça a outra pessoa da Secretaria." };
  if (quem === mn) return { valido: false, proibido: true, mensagem: "Ninguém registra a autorização sobre si mesmo: peça a outra pessoa da Secretaria." };
  const t = TEXTOS[f.finalidade];
  return { valido: true, dados: { menorId: mn, responsavelId: rs, finalidade: f.finalidade, concedido, referencia: ref, registradoPor: quem, textoVersao: t.versao, textoHash: t.hash } };
}

// ---------------------------------------------------------------
// Textos curtos dos avisos (o que a pessoa lê na resposta)
// ---------------------------------------------------------------

const nomeOu = (nome) => (limpar(nome) ? limpar(nome) : "o(a) menor");
function mensagemConcedido({ finalidade, menorNome }) {
  return finalidade === "SAUDE_CRACHA"
    ? `Autorização registrada. A informação de saúde de ${nomeOu(menorNome)} poderá constar no crachá do check-in infantil, só para o cuidado e a segurança. Você pode revogar quando quiser.`
    : `Autorização registrada. A imagem de ${nomeOu(menorNome)} poderá ser usada no cadastro, no crachá e em materiais internos da Igreja. Você pode revogar quando quiser.`;
}
function mensagemRevogado({ finalidade, menorNome, fotoApagada = false }) {
  return finalidade === "SAUDE_CRACHA"
    ? `Autorização revogada. A informação de saúde de ${nomeOu(menorNome)} deixa de ser usada no crachá. A participação dele(a) não muda.`
    : `Autorização revogada. ${fotoApagada ? `A foto de ${nomeOu(menorNome)} foi apagada e a imagem` : `A imagem de ${nomeOu(menorNome)}`} deixa de ser usada. A participação dele(a) não muda.`;
}
function mensagemJaRevogado({ finalidade, fotoApagada = false }) {
  return `A autorização já estava revogada.${finalidade === "IMAGEM" && fotoApagada ? " Havia uma foto guardada e ela foi apagada." : ""}`;
}
function mensagemJaConcedido() {
  return "Esta autorização já está registrada com este mesmo texto: não é preciso autorizar de novo.";
}
function mensagemRegistroManual({ finalidade, menorNome, concedido, fotoApagada = false }) {
  if (concedido) return `Ficha registrada: a autorização (${FINALIDADES[finalidade].toLowerCase()}) de ${nomeOu(menorNome)} passa a valer.`;
  return `Ficha registrada: a autorização (${FINALIDADES[finalidade].toLowerCase()}) de ${nomeOu(menorNome)} foi revogada${finalidade === "IMAGEM" && fotoApagada ? " e a foto foi apagada" : ""}.`;
}
// O que o menor lê quando tenta enviar a foto e o responsável ainda não autorizou (MinhaFoto) e o que a Secretaria lê (UploadFotoMembro).
const MSG_FOTO_MENOR_PROPRIO = "Você tem menos de 18 anos: o seu responsável precisa autorizar o uso da sua imagem (em Meu Painel → Ministério com menores) antes de você enviar a foto.";
const MSG_FOTO_MENOR_SECRETARIA = "Esta pessoa tem menos de 18 anos: o responsável precisa autorizar o uso da imagem (em Meu Painel → Ministério com menores, ou pela ficha assinada registrada pela Secretaria) antes do envio da foto.";

module.exports = {
  CONSENTIMENTO_VERSAO, MAIORIDADE, IP_RETENCAO_DIAS_PADRAO, IP_ANONIMIZADO, IP_INDISPONIVEL, MAX_REFERENCIA, LIMITE_LISTA,
  FINALIDADES, CODIGOS_FINALIDADE, FORMAS, SITUACOES, MENSAGENS, TEXTOS,
  ehFinalidade, textoDe, textosVigentes, hashConfere, avaliarIntegridade,
  ehMenor, ehAdulto, condicaoDoMenor, condicaoDoResponsavel, estadoDoConsentimento,
  validarFinalidade, validarConceder, validarRevogar, validarRegistroManual,
  mensagemConcedido, mensagemRevogado, mensagemJaRevogado, mensagemJaConcedido, mensagemRegistroManual, MSG_FOTO_MENOR_PROPRIO, MSG_FOTO_MENOR_SECRETARIA,
  inteiroPositivo, sha256
};
