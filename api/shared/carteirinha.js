// shared/carteirinha.js (FASE 10, v10.1b passo 8, 19/11/2026) — AS CARTEIRINHAS: a regra pura (nenhuma consulta ao banco; quem lê e grava é
// shared/carteirinhaDb.js). Desenho aprovado nas rodadas 9 a 11 da gestão de membros (docs/plano/fase-10-experiencia-design-performance.md):
//  - a FÍSICA leva só o que não muda: nome, nascimento, foto, matrícula, pai e mãe, o tipo do modelo e o QR fixo — o modelo que a Secretaria Geral desenha
//    nunca aceita outro campo (CPF, congregação, cargo, contato, endereço ficam fora: validarDesenho recusa);
//  - a DIGITAL e a página de conferência mostram o que muda (congregação, cargo, função, situação), calculado na hora;
//  - UM QR POR PESSOA, PARA SEMPRE: o código não muda nem vence; a situação de membro vem da mesma regra da credencial da v8.4 (shared/credencial.js:
//    membroEmComunhao; do obreiro, a licença para oficiar de shared/afm.js) — as duas páginas dizem a mesma coisa da mesma pessoa.
const { membroEmComunhao, ehObreiro, STATUS_DE_MEMBRO } = require("./credencial");
const { licencaLiturgica } = require("./afm");
const { ROTULO_CARGO } = require("./escada");

const PUBLICOS = ["MEMBRO", "CONGREGADO", "OBREIRO", "OUTRO"];
const ROTULO_PUBLICO = { MEMBRO: "Membro", CONGREGADO: "Congregado", OBREIRO: "Obreiro", OUTRO: "Outro" };
const MATERIAIS = ["PAPEL", "PVC"];

// ---------------------------------------------------------------- quem é quem
// O tipo da pessoa decide o modelo (o modelo sai sozinho): o obreiro em comunhão usa o de obreiro; o congregado, o de congregado; o resto, o de membro.
function tipoDaPessoa(p) {
  if (!p) return null;
  if (p.situacaoMembro === "CONGREGADO") return "CONGREGADO";
  if (ehObreiro(p.cargo) && p.situacaoMembro === "EM_COMUNHAO") return "OBREIRO";
  return "MEMBRO";
}

// Quem pode ter a carteirinha FÍSICA impressa agora: está no rol (ativo ou de licença), em comunhão ou congregado, sem a marca da disciplina.
// (Quem está em disciplina continua com a sua: o QR mostra a situação de hoje. Só não sai cartão novo enquanto durar.)
function podeImprimir(p) {
  if (!p) return { pode: false, mensagem: "Matrícula não encontrada." };
  if (!STATUS_DE_MEMBRO.has(p.status)) return { pode: false, mensagem: "Só quem está no rol recebe a carteirinha." };
  if (p.excluido || p.foraDaComunhao || p.sobDisciplina) return { pode: false, mensagem: "Em disciplina: a carteirinha nova sai depois." };
  if (p.situacaoMembro === "CONGREGADO") return { pode: true, mensagem: null };
  if (!membroEmComunhao(p)) return { pode: false, mensagem: "Em disciplina: a carteirinha nova sai depois." };
  return { pode: true, mensagem: null };
}

// Por que a pessoa está na lista "para imprimir" (ou null: já tem a sua). `ultima` = a última impressão { publico } ou null; `pedido` = a segunda via pedida.
function motivoParaImprimir(tipo, ultima, pedido) {
  if (pedido) return "SEGUNDA_VIA";
  if (!ultima) return "NOVA";
  if (ultima.publico !== tipo) return "MUDOU";
  return null;
}

// ---------------------------------------------------------------- a página de conferência (o que o QR abre)
const mesAno = (d) => {
  if (!d) return null;
  const s = d instanceof Date ? d.toISOString() : String(d);
  return /^\d{4}-\d{2}/.test(s) ? `${s.slice(5, 7)}/${s.slice(0, 4)}` : null;
};
// `p`: { nome, status, situacaoMembro, cargo, funcao, congregacao, area, dataAdmissao, statusMatricula, sobDisciplina, excluido, foraDaComunhao, educacao }.
// Só o mínimo para quem confere: nunca CPF, endereço, contato, matrícula, motivo de disciplina ou de saída. Quem saiu: só o nome (sem foto, sem congregação).
function situacaoConferencia(p) {
  if (!p) return { situacao: "NAO_ENCONTRADA" };
  if (!STATUS_DE_MEMBRO.has(p.status) || p.excluido) return { situacao: "SAIU", nome: p.nome };
  if (p.situacaoMembro === "CONGREGADO") {
    return { situacao: "CONGREGADO", nome: p.nome, congregacao: p.congregacao || null, area: p.area || null, foto: true };
  }
  if (!membroEmComunhao(p) || p.sobDisciplina) return { situacao: "DISCIPLINA", nome: p.nome, foto: true };
  const r = {
    situacao: "EM_COMUNHAO", nome: p.nome, foto: true,
    cargo: ROTULO_CARGO[p.cargo] || null, funcao: p.funcao || null,
    congregacao: p.congregacao || null, area: p.area || null, membroDesde: mesAno(p.dataAdmissao)
  };
  if (ehObreiro(p.cargo)) {
    const lic = licencaLiturgica({ cargo: p.cargo, statusMatricula: p.statusMatricula, status: p.status, situacaoMembro: p.situacaoMembro,
      excluido: p.excluido, foraDaComunhao: p.foraDaComunhao, afastado: p.sobDisciplina, educacao: p.educacao });
    r.exerceCargo = !!lic.podeOficiar;
  } else {
    r.exerceCargo = null;
  }
  return r;
}

// ---------------------------------------------------------------- o desenho do modelo (o JSON do editor)
// Os campos que a física aceita — SÓ o que não muda. A congregação, o cargo, a função e a situação ficam na digital.
const CAMPOS_FISICA = ["NOME", "NASCIMENTO", "MATRICULA", "MAE", "PAI", "TIPO"];
const TIPOS_CAMADA = ["CAMPO", "TEXTO", "FOTO", "QR", "LOGO", "ASSINATURA", "FORMA"];
const FONTES = ["Inter", "Atkinson Hyperlegible Next", "Source Sans 3", "Plus Jakarta Sans"];
const COR = /^#[0-9a-fA-F]{6}$/;
const TAMANHOS = { CARTAO: { largura: 85.6, altura: 54 } };   // o de cartão de banco (ISO/IEC 7810 ID-1)
const MAX_CAMADAS = 30;
const MAX_JSON = 60000;

const limpar = (t, max) => String(t == null ? "" : t).replace(/[\u0000-\u001F\u007F<>]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const numeroEntre = (v, min, max) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const arred = (v) => Math.round(v * 10) / 10;

function validarFundo(f, onde) {
  const fundo = f && typeof f === "object" ? f : {};
  const cor1 = COR.test(fundo.cor1) ? fundo.cor1.toLowerCase() : null;
  if (!cor1) return { erro: `${onde}: escolha a cor do fundo.` };
  const degrade = fundo.degrade === true;
  const cor2 = degrade ? (COR.test(fundo.cor2) ? fundo.cor2.toLowerCase() : null) : null;
  if (degrade && !cor2) return { erro: `${onde}: escolha a segunda cor do degradê.` };
  const angulo = numeroEntre(fundo.angulo, 0, 360) ? Math.round(fundo.angulo) : 135;
  return { fundo: { cor1, degrade, cor2, angulo, arte: fundo.arte === true } };
}

function validarCamada(c, i, onde, larg, alt) {
  if (!c || typeof c !== "object" || Array.isArray(c)) return { erro: `${onde}: a camada ${i + 1} está quebrada.` };
  const tipo = String(c.tipo || "");
  if (!TIPOS_CAMADA.includes(tipo)) return { erro: `${onde}: a camada ${i + 1} tem um tipo que a carteirinha não aceita.` };
  const id = /^[a-z0-9-]{1,24}$/.test(String(c.id || "")) ? String(c.id) : `c${i + 1}`;
  if (!numeroEntre(c.x, -5, larg) || !numeroEntre(c.y, -5, alt) || !numeroEntre(c.larg, 1, larg + 5) || !numeroEntre(c.alt, 1, alt + 5)) {
    return { erro: `${onde}: a camada ${i + 1} está fora do cartão.` };
  }
  const k = { id, tipo, x: arred(c.x), y: arred(c.y), larg: arred(c.larg), alt: arred(c.alt), visivel: c.visivel !== false, travada: c.travada === true };
  if (tipo === "CAMPO") {
    if (!CAMPOS_FISICA.includes(c.campo)) return { erro: `${onde}: a carteirinha física só leva o que não muda (nome, nascimento, matrícula, pai, mãe e o tipo).` };
    k.campo = c.campo;
    k.rotulo = limpar(c.rotulo, 30);
  }
  if (tipo === "TEXTO" || tipo === "ASSINATURA") {
    k.texto = limpar(c.texto, 120);
    if (tipo === "TEXTO" && !k.texto) return { erro: `${onde}: o texto livre da camada ${i + 1} está vazio.` };
  }
  if (["CAMPO", "TEXTO", "ASSINATURA"].includes(tipo)) {
    k.fonte = FONTES.includes(c.fonte) ? c.fonte : "Inter";
    k.tamanho = numeroEntre(c.tamanho, 4, 32) ? arred(c.tamanho) : 8;
    k.cor = COR.test(c.cor) ? c.cor.toLowerCase() : "#ffffff";
    k.negrito = c.negrito === true;
    k.italico = c.italico === true;
    k.alinhamento = ["esq", "centro", "dir"].includes(c.alinhamento) ? c.alinhamento : "esq";
    k.fundo = COR.test(c.fundo) ? c.fundo.toLowerCase() : null;
  }
  if (tipo === "FORMA") {
    k.cor = COR.test(c.cor) ? c.cor.toLowerCase() : "#ffffff";
    k.opacidade = numeroEntre(c.opacidade, 0, 1) ? Math.round(c.opacidade * 100) / 100 : 1;
  }
  if (tipo === "FOTO" || tipo === "FORMA") k.raio = numeroEntre(c.raio, 0, 20) ? arred(c.raio) : 2;
  if (tipo === "FOTO" || tipo === "FORMA" || tipo === "QR") k.borda = COR.test(c.borda) ? c.borda.toLowerCase() : null;
  return { camada: k };
}

// Confere o desenho vindo do editor e devolve a versão limpa (só o que a tela desenha). { ok, desenho } ou { ok: false, mensagem }.
function validarDesenho(entrada) {
  let d = entrada;
  if (typeof d === "string") {
    if (d.length > MAX_JSON) return { ok: false, mensagem: "O desenho ficou grande demais: tire algumas camadas." };
    try { d = JSON.parse(d); } catch (e) { return { ok: false, mensagem: "O desenho está quebrado." }; }
  }
  if (!d || typeof d !== "object" || Array.isArray(d)) return { ok: false, mensagem: "O desenho está quebrado." };
  const { largura, altura } = TAMANHOS.CARTAO;
  const saida = { tamanho: "CARTAO", largura, altura, lados: {} };
  for (const lado of ["frente", "verso"]) {
    const onde = lado === "frente" ? "Frente" : "Verso";
    const l = d.lados && d.lados[lado];
    if (!l || typeof l !== "object") return { ok: false, mensagem: `${onde}: falta o lado do cartão.` };
    const f = validarFundo(l.fundo, onde);
    if (f.erro) return { ok: false, mensagem: f.erro };
    const camadas = Array.isArray(l.camadas) ? l.camadas : [];
    if (camadas.length > MAX_CAMADAS) return { ok: false, mensagem: `${onde}: no máximo ${MAX_CAMADAS} camadas.` };
    const lista = [];
    const ids = new Set();
    for (let i = 0; i < camadas.length; i++) {
      const r = validarCamada(camadas[i], i, onde, largura, altura);
      if (r.erro) return { ok: false, mensagem: r.erro };
      if (ids.has(r.camada.id)) r.camada.id = `${r.camada.id}-${i + 1}`;
      ids.add(r.camada.id);
      lista.push(r.camada);
    }
    saida.lados[lado] = { fundo: f.fundo, camadas: lista };
  }
  const qrs = ["frente", "verso"].reduce((n, l) => n + saida.lados[l].camadas.filter((c) => c.tipo === "QR" && c.visivel).length, 0);
  if (qrs !== 1) return { ok: false, mensagem: qrs ? "O QR aparece uma vez só (na frente ou no verso)." : "Ponha o QR fixo na frente ou no verso: é por ele que se confere a carteirinha." };
  if (JSON.stringify(saida).length > MAX_JSON) return { ok: false, mensagem: "O desenho ficou grande demais: tire algumas camadas." };
  return { ok: true, desenho: saida };
}

function validarNome(nome) {
  const n = limpar(nome, 60);
  if (n.length < 3) return { ok: false, mensagem: "Dê um nome ao modelo (pelo menos 3 letras)." };
  return { ok: true, nome: n };
}

// O modelo novo já nasce como o do desenho aprovado (rodada 10/11): faixa de cima com o logo e o nome da Igreja, o selo do tipo, a foto à esquerda e o
// nome, o nascimento e a matrícula à direita; no verso, a filiação, a assinatura e o QR fixo.
const CORES_PADRAO = {
  MEMBRO: { cor1: "#0f2a5c", cor2: "#1e3a8a", selo: "#fbbf24", seloTexto: "#1f2937" },
  CONGREGADO: { cor1: "#14532d", cor2: "#0f766e", selo: "#5eead4", seloTexto: "#134e4a" },
  OBREIRO: { cor1: "#3b0764", cor2: "#6b21a8", selo: "#fbbf24", seloTexto: "#1f2937" },
  OUTRO: { cor1: "#1f2937", cor2: "#334155", selo: "#e5e7eb", seloTexto: "#111827" }
};
function desenhoPadrao(publico) {
  const c = CORES_PADRAO[publico] || CORES_PADRAO.MEMBRO;
  const branco = "#ffffff";
  const fundo = { cor1: c.cor1, degrade: true, cor2: c.cor2, angulo: 135, arte: false };
  return {
    tamanho: "CARTAO", largura: 85.6, altura: 54,
    lados: {
      frente: {
        fundo,
        camadas: [
          { id: "logo", tipo: "LOGO", x: 4, y: 3.5, larg: 7, alt: 7, visivel: true, travada: false },
          { id: "cabecalho", tipo: "TEXTO", texto: "IGREJA EVANGÉLICA ASSEMBLEIA DE DEUS", x: 12.5, y: 4, larg: 50, alt: 3, fonte: "Inter", tamanho: 4.6, cor: branco, negrito: true, italico: false, alinhamento: "esq", fundo: null, visivel: true, travada: false },
          { id: "igreja", tipo: "TEXTO", texto: "IEADESPA", x: 12.5, y: 7, larg: 40, alt: 4, fonte: "Inter", tamanho: 7, cor: branco, negrito: true, italico: false, alinhamento: "esq", fundo: null, visivel: true, travada: false },
          { id: "tipo", tipo: "CAMPO", campo: "TIPO", rotulo: "", x: 64, y: 4, larg: 18, alt: 4.2, fonte: "Inter", tamanho: 5, cor: c.seloTexto, negrito: true, italico: false, alinhamento: "centro", fundo: c.selo, visivel: true, travada: false },
          { id: "foto", tipo: "FOTO", x: 5, y: 17, larg: 19, alt: 24, raio: 2, borda: null, visivel: true, travada: false },
          { id: "nome", tipo: "CAMPO", campo: "NOME", rotulo: "", x: 27, y: 21, larg: 54, alt: 6, fonte: "Inter", tamanho: 10, cor: branco, negrito: true, italico: false, alinhamento: "esq", fundo: null, visivel: true, travada: false },
          { id: "nascimento", tipo: "CAMPO", campo: "NASCIMENTO", rotulo: "Nascimento", x: 27, y: 27.5, larg: 54, alt: 4, fonte: "Inter", tamanho: 6, cor: branco, negrito: false, italico: false, alinhamento: "esq", fundo: null, visivel: true, travada: false },
          { id: "matricula", tipo: "CAMPO", campo: "MATRICULA", rotulo: "Matrícula", x: 27, y: 33, larg: 30, alt: 4.6, fonte: "Inter", tamanho: 6.5, cor: branco, negrito: true, italico: false, alinhamento: "esq", fundo: "#334155", visivel: true, travada: false }
        ]
      },
      verso: {
        fundo: { cor1: "#ffffff", degrade: false, cor2: null, angulo: 135, arte: false },
        camadas: [
          { id: "mae", tipo: "CAMPO", campo: "MAE", rotulo: "Mãe", x: 5, y: 8, larg: 50, alt: 4, fonte: "Inter", tamanho: 6, cor: "#1f2937", negrito: false, italico: false, alinhamento: "esq", fundo: null, visivel: true, travada: false },
          { id: "pai", tipo: "CAMPO", campo: "PAI", rotulo: "Pai", x: 5, y: 14, larg: 50, alt: 4, fonte: "Inter", tamanho: 6, cor: "#1f2937", negrito: false, italico: false, alinhamento: "esq", fundo: null, visivel: true, travada: false },
          { id: "assinatura", tipo: "ASSINATURA", texto: "Secretaria Geral", x: 5, y: 36, larg: 40, alt: 8, fonte: "Inter", tamanho: 5, cor: "#1f2937", negrito: false, italico: false, alinhamento: "centro", fundo: null, visivel: true, travada: false },
          { id: "qr", tipo: "QR", x: 60, y: 8, larg: 20, alt: 20, borda: null, visivel: true, travada: false },
          { id: "aviso", tipo: "TEXTO", texto: "Aponte a câmera para o QR: ele mostra a situação de hoje.", x: 52, y: 31, larg: 30, alt: 8, fonte: "Inter", tamanho: 4.4, cor: "#475569", negrito: false, italico: false, alinhamento: "centro", fundo: null, visivel: true, travada: false }
        ]
      }
    }
  };
}
const NOMES_PADRAO = { MEMBRO: "Membro", CONGREGADO: "Congregado", OBREIRO: "Credencial de obreiro" };

module.exports = {
  PUBLICOS, ROTULO_PUBLICO, MATERIAIS, CAMPOS_FISICA, TIPOS_CAMADA, FONTES, NOMES_PADRAO,
  tipoDaPessoa, podeImprimir, motivoParaImprimir, situacaoConferencia, validarDesenho, validarNome, desenhoPadrao, mesAno
};
