// app/modulos/membros-movimento.js — FASE 10, v10.1b passo 7a, INCREMENTO 3 (18/11/2026), fiel aos desenhos aprovados (rodadas 8 a 10 da gestão de membros):
//   - a TRANSFERÊNCIA DE CONGREGAÇÃO (rodada 8, "pedido simples"): pedir pela ficha da pessoa (o botão "Transferência"), as caixas Chegando / Saindo /
//     Concluídos (e Paradas, da Geral), aceitar ou recusar com o motivo, cancelar, e ACOMPANHAR o pedido passo a passo (/api/transferencias, do passo 3);
//   - a CAIXA DE SUGESTÕES da secretaria (rodada 10, o 4º passo do fluxo): o que o membro sugeriu, antes → depois, aplicar ou recusar com o motivo; o que só
//     a Secretaria Geral muda aparece como "encaminhada" (/api/fila-aprovacoes, do passo 5);
//   - MINHA VIDA NA IGREJA do membro (rodada 10, versão final): a linha do tempo primeiro e "Minha ficha" à direita (no celular, em pílulas no alto); o que
//     é dele de mudar (o contato) muda ali mesmo; o resto ele SUGERE com o motivo; as minhas transferências e as minhas sugestões com a resposta
//     (/api/minha-linha-do-tempo, /api/meus-dados, /api/solicitacoes-edicao, /api/minha-transferencia).
// Mesmo escopo global dos outros módulos (vD.2); usa as ajudas de modulos/membros.js. Ações pelo registrarAcoes (CSP forte).

const MT_CAIXAS = { chegando: "Chegando", saindo: "Saindo", concluidos: "Concluídos", paradas: "Paradas há mais de 7 dias" };
const MT_SITUACAO = { PENDENTE: ["mb-chip mb-chip-ambar", "esperando"], CONCLUIDA: ["mb-chip mb-chip-verde", "feita"], RECUSADA: ["mb-chip mb-chip-vermelho", "recusada"], CANCELADA: ["mb-chip mb-chip-neutro", "cancelada"] };
const MT_REGRA = { MESMA_AREA: "mesma área: entra na hora", ENTRE_AREAS: "áreas diferentes: o destino aceita ou recusa", GERAL: "pedido pela Secretaria Geral: entra na hora" };
let mtCaixa = { caixa: "chegando", itens: [], total: 0, contagem: {}, aberto: null, erro: "", motivo: "", seq: 0 };
let mtPedido = { destinos: null, destinoId: "", motivo: "", erro: "", enviando: false };
let mtSug = { itens: [], situacao: "PENDENTE", motivos: {}, erro: "", seq: 0 };

function mtDataHora(iso) {
  const d = new Date(String(iso || ""));
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ================================================================= as caixas da secretaria
async function mtAbrirTransferencias() {
  const caixa = document.getElementById("subPessoasTransferencias");
  if (!caixa) return;
  const seq = ++mtCaixa.seq;
  if (!mtCaixa.itens.length) caixa.innerHTML = `${mbTopoHtml("Mudanças de congregação", "Carregando…", "")}`;
  const nomes = ["chegando", "saindo", "concluidos"].concat(mbEhGeral() ? ["paradas"] : []);
  const ler = async (c, por) => { try { const r = await fetchProtegido(`${API_BASE}/transferencias?caixa=${c}&porPagina=${por}`); const d = await r.json(); return d && d.sucesso ? d : { erro: (d && d.mensagem) || "Não deu para ler." }; } catch (e) { return { erro: "Não deu para ler agora." }; } };
  const respostas = await Promise.all(nomes.map((c) => ler(c, c === mtCaixa.caixa ? 50 : 1)));
  if (seq !== mtCaixa.seq) return;
  mtCaixa.contagem = {};
  nomes.forEach((c, i) => { mtCaixa.contagem[c] = respostas[i] && !respostas[i].erro ? mbNum(respostas[i].total) : 0; });
  const atual = respostas[nomes.indexOf(mtCaixa.caixa)] || {};
  mtCaixa.erro = atual.erro || "";
  mtCaixa.itens = Array.isArray(atual.itens) ? atual.itens : [];
  mtDesenharCaixas();
}
function mtDesenharCaixas() {
  const caixa = document.getElementById("subPessoasTransferencias");
  if (!caixa) return;
  if (mtCaixa.aberto) { mtDesenharAcompanhar(); return; }
  const abas = Object.keys(MT_CAIXAS).filter((c) => mbTem(mtCaixa.contagem, c)).map((c) => `<button type="button" class="mb-pilula${c === mtCaixa.caixa ? " ativa" : ""}"
    data-on-click="mtCaixaAcao" data-args-click="${argsAttr(c)}"${c === mtCaixa.caixa ? " aria-current=\"page\"" : ""}>${escaparHtmlEbd(MT_CAIXAS[c])} (${mbFmt(mtCaixa.contagem[c])})</button>`).join("");
  const linhas = mtCaixa.itens.map((t) => {
    const s = MT_SITUACAO[t.situacao] || MT_SITUACAO.PENDENTE;
    const quando = t.situacao === "PENDENTE" ? (mbNum(t.diasParado) > 0 ? `há ${mbFmt(t.diasParado)} ${mbPlural(t.diasParado, "dia", "dias")}` : "hoje") : mtDataHora(t.decididoEm || t.canceladoEm);
    return `<div class="mt-linha">
      <button type="button" class="mt-quem" data-on-click="mtAcompanharAcao" data-args-click="${argsAttr(t.transferenciaId)}"><span class="mb-avatar" aria-hidden="true">${escaparHtmlEbd(mbIniciais(t.pessoaNome))}</span>
        <span><strong>${escaparHtmlEbd(t.pessoaNome || "")}</strong><span class="mb-dica">${mbNum(t.membroId)} · pedido ${escaparHtmlEbd(t.pedidoComo === "MEMBRO" ? "pelo próprio membro" : t.pedidoPorNome ? `por ${t.pedidoPorNome}` : "pela secretaria")}</span></span></button>
      <span class="mt-rota">${escaparHtmlEbd(t.origemNome || "")}${t.origemAreaNome ? ` <span class="mb-dica">(${escaparHtmlEbd(t.origemAreaNome)})</span>` : ""} → ${escaparHtmlEbd(t.destinoNome || "")}${t.destinoAreaNome ? ` <span class="mb-dica">(${escaparHtmlEbd(t.destinoAreaNome)})</span>` : ""}</span>
      <span class="mt-quando"><span class="${escaparHtmlEbd(s[0])}">${escaparHtmlEbd(s[1])}</span> <span class="mb-dica">${escaparHtmlEbd(quando)}</span></span>
      <span class="mt-acoes">
        <button type="button" class="btn-link" data-on-click="mbAbrirFichaAcao" data-args-click="${argsAttr(mbNum(t.membroId))}">Ver a ficha</button>
        ${t.podeDecidir ? `<button type="button" class="btn-confirmar btn-secundario mb-btn-pequeno" data-on-click="mtAcompanharAcao" data-args-click="${argsAttr(t.transferenciaId)}">Recusar…</button>
          <button type="button" class="btn-confirmar mb-btn-pequeno" data-on-click="mtDecidirAcao" data-args-click="${argsAttr(t.transferenciaId, "aceitar")}">✓ Aceitar</button>` : ""}
      </span></div>`;
  }).join("");
  caixa.innerHTML = `
    ${mbTopoHtml("Mudanças de congregação", `${mbTextoEscopo(mbPainel.dados || {}, "")} · o que chega para você aceitar e o que sai daqui`, "")}
    <nav class="mt-abas" aria-label="Caixas">${abas}</nav>
    ${mtCaixa.erro ? `<p class="subtitle aviso-recusa">⚠️ ${escaparHtmlEbd(mtCaixa.erro)}</p>` : ""}
    <div class="mb-cartao mt-lista">${linhas || `<p class="mb-vazio-lista">${mtCaixa.caixa === "chegando" ? "Nenhum pedido chegando agora." : "Nada aqui."}</p>`}</div>
    <p class="mb-dica mt-nota">ℹ️ Para pedir uma mudança, abra a ficha da pessoa e toque em "Transferência". Na mesma área a mudança entra na hora; entre áreas, a secretaria
      do destino (ou a Secretaria Geral) aceita ou recusa, e até lá a pessoa continua onde está. Ao recusar, quem pediu recebe o motivo.</p>`;
}
function mtCaixaAcao(caixa) {
  if (!mbTem(MT_CAIXAS, String(caixa))) return;
  mtCaixa.caixa = String(caixa);
  mtCaixa.itens = [];
  mtAbrirTransferencias();
}
async function mtAcompanharAcao(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return;
  mtCaixa.motivo = "";
  try {
    const res = await fetchProtegido(`${API_BASE}/transferencias/${encodeURIComponent(String(n))}`);
    const data = await res.json();
    if (!data || !data.sucesso) { mostrarToast((data && data.mensagem) || "Pedido não encontrado.", "erro"); return; }
    mtCaixa.aberto = data.transferencia;
  } catch (e) { mostrarToast("Não deu para abrir o pedido agora.", "erro"); return; }
  mtDesenharCaixas();
}
function mtFecharAcao() { mtCaixa.aberto = null; mtAbrirTransferencias(); }
function mtDesenharAcompanhar() {
  const caixa = document.getElementById("subPessoasTransferencias");
  const t = mtCaixa.aberto;
  if (!caixa || !t) return;
  const s = MT_SITUACAO[t.situacao] || MT_SITUACAO.PENDENTE;
  const feito = t.situacao === "CONCLUIDA";
  const passo = (n, estado, titulo, detalhe) => `<li class="mt-passo mt-passo-${estado}"><span class="mt-passo-num">${estado === "feito" ? "✓" : estado === "parou" ? "✕" : n}</span>
    <span><strong>${escaparHtmlEbd(titulo)}</strong><span class="mb-dica">${escaparHtmlEbd(detalhe)}</span></span></li>`;
  const segundo = t.situacao === "PENDENTE" ? passo(2, "atual", `Esperando ${t.destinoNome || "o destino"} aceitar`, `${mbNum(t.diasParado) > 0 ? `há ${mbFmt(t.diasParado)} ${mbPlural(t.diasParado, "dia", "dias")}` : "desde hoje"} · a secretaria foi avisada`)
    : t.situacao === "RECUSADA" ? passo(2, "parou", "Recusado", `${mtDataHora(t.decididoEm)}${t.motivoRecusa ? ` · motivo: ${t.motivoRecusa}` : ""}`)
      : t.situacao === "CANCELADA" ? passo(2, "parou", "Cancelado", mtDataHora(t.canceladoEm))
        : passo(2, "feito", `${t.destinoNome || "O destino"} aceitou`, `${mtDataHora(t.decididoEm)}${t.regra === "MESMA_AREA" || t.regra === "GERAL" ? " · entrou na hora" : ""}`);
  caixa.innerHTML = `
    <nav class="mb-trilha"><button type="button" class="btn-link" data-on-click="mtFecharAcao">← Mudanças de congregação</button><span>›</span><span>${escaparHtmlEbd(t.pessoaNome || "")}</span></nav>
    <div class="mt-acompanhar">
      <section class="mb-cartao">
        <header class="mb-cartao-cabeca"><h4>${escaparHtmlEbd(t.pessoaNome || "")}</h4><span class="${escaparHtmlEbd(s[0])}">${escaparHtmlEbd(s[1])}</span></header>
        <p class="mb-sub">${escaparHtmlEbd(t.origemNome || "")} → ${escaparHtmlEbd(t.destinoNome || "")} · ${escaparHtmlEbd(MT_REGRA[t.regra] || "")}</p>
        <ol class="mt-passos">
          ${passo(1, "feito", "Pedido feito", `${escaparHtmlEbd(t.origemNome || "")} · ${mtDataHora(t.pedidoEm)}${t.motivo ? ` · motivo: ${t.motivo}` : ""}`)}
          ${segundo}
          ${passo(3, feito ? "feito" : "depois", "Mudança feita", feito ? "a ficha passou para o destino e a carteirinha é atualizada" : "a ficha passa para o destino e a carteirinha é atualizada")}
        </ol>
        <div class="mc-botoes">
          <button type="button" class="btn-link" data-on-click="mbAbrirFichaAcao" data-args-click="${argsAttr(mbNum(t.membroId))}">Ver a ficha ›</button>
          ${t.podeCancelar ? `<button type="button" class="btn-confirmar btn-secundario mb-btn-pequeno" data-on-click="mtDecidirAcao" data-args-click="${argsAttr(t.transferenciaId, "cancelar")}">Cancelar o pedido</button>` : ""}
          ${t.podeDecidir ? `<button type="button" class="btn-confirmar mb-btn-pequeno" data-on-click="mtDecidirAcao" data-args-click="${argsAttr(t.transferenciaId, "aceitar")}">✓ Aceitar</button>` : ""}
        </div>
        ${t.podeDecidir ? `<details class="mc-descartar"><summary>Recusar este pedido</summary>
          <label for="mtMotivo">Motivo (quem pediu recebe)</label>
          <textarea id="mtMotivo" maxlength="300" rows="2" data-on-input="mtMotivoAcao" data-args-input="${argsAttr(ARG.valor)}">${escaparHtmlEbd(mtCaixa.motivo)}</textarea>
          <button type="button" class="btn-confirmar btn-perigo mb-btn-pequeno" data-on-click="mtDecidirAcao" data-args-click="${argsAttr(t.transferenciaId, "recusar")}">Recusar</button></details>` : ""}
      </section>
      <aside class="mb-cartao mt-quem-aceita"><p><strong>Quem aceita:</strong> na mesma área, entra na hora; entre áreas diferentes, a secretaria do destino (ou a
        Secretaria Geral) aceita ou recusa. A pessoa não precisa aceitar. Pedidos parados há mais de 7 dias aparecem para a Secretaria Geral.</p></aside>
    </div>`;
}
function mtMotivoAcao(valor) { mtCaixa.motivo = String(valor || "").slice(0, 300); }
async function mtDecidirAcao(id, acao) {
  if (!["aceitar", "recusar", "cancelar"].includes(acao)) return;
  if (acao === "recusar" && mtCaixa.motivo.trim().length < 3) { mostrarToast("Escreva o motivo da recusa: quem pediu vai ler.", "erro"); return; }
  if (acao === "cancelar" && !(await confirmarAcao("Cancelar este pedido de mudança? A pessoa continua onde está.", "Cancelar o pedido"))) return;
  if (acao === "aceitar" && !(await confirmarAcao("Aceitar a mudança? A ficha passa para a congregação de destino agora.", "Aceitar"))) return;
  let data = null;
  try {
    const res = await fetchProtegido(`${API_BASE}/transferencias/${encodeURIComponent(String(id))}/${acao}`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(acao === "recusar" ? { motivo: mtCaixa.motivo.trim() } : {}) });
    data = await res.json();
  } catch (e) { data = null; }
  if (data && data.sucesso) {
    mostrarToast(acao === "aceitar" ? "Mudança feita: a ficha já está no destino." : acao === "recusar" ? "Pedido recusado; quem pediu recebe o motivo." : "Pedido cancelado.", "sucesso");
    mtCaixa.aberto = null;
    mtCaixa.motivo = "";
    if (mbPainel.avisos) mbPainel.avisos = null;
    mtAbrirTransferencias();
    return;
  }
  mostrarToast((data && data.mensagem) || "Não deu para fazer isso agora.", "erro");
  mtAbrirTransferencias();
}

// ---- pedir pela ficha (o botão "Transferência" do cabeçalho da ficha 360) ----
async function mtMostrarPedidoNaFicha() {
  const corpo = document.getElementById("mbFichaCorpo");
  const p = mbFicha.pessoa;
  if (!corpo || !p) return;
  if (!mtPedido.destinos) {
    corpo.innerHTML = "<div class=\"mb-cartao\"><p class=\"subtitle\">Carregando as congregações…</p></div>";
    try {
      const res = await fetchProtegido(`${API_BASE}/transferencias?destinos=1`);
      const data = await res.json();
      mtPedido.destinos = data && Array.isArray(data.congregacoes) ? data.congregacoes : [];
    } catch (e) { mtPedido.destinos = []; }
    if (mbFicha.parte !== "transferencia" || mbFicha.pessoa !== p) return;
  }
  const opcoes = (mtPedido.destinos || []).filter((c) => String(c.congregacaoId) !== String(p.congregacaoId))
    .map((c) => `<option value="${c.congregacaoId}"${String(c.congregacaoId) === String(mtPedido.destinoId) ? " selected" : ""}>${escaparHtmlEbd(c.nome)}${c.areaNome ? ` · ${escaparHtmlEbd(c.areaNome)}` : ""}</option>`).join("");
  corpo.innerHTML = `<section class="mb-cartao mt-pedir">
    <header class="mb-cartao-cabeca"><h4>↪ Pedir mudança de congregação</h4><span class="mb-dica">quem pede: a congregação de onde a pessoa sai, a Secretaria Geral ou a própria pessoa</span></header>
    <form class="mc-form" data-on-submit="mtPedirAcao" data-prevent="submit">
      <div class="mc-grade">
        <div class="mc-campo"><span class="mc-rotulo">Sai de</span><span class="mt-origem">${escaparHtmlEbd(p.congregacao || "—")}</span></div>
        <div class="mc-campo"><label for="mtDestino">Vai para *</label>
          <select id="mtDestino" data-on-change="mtPedidoCampoAcao" data-args-change="${argsAttr("destinoId", ARG.valor)}"><option value="">— escolha —</option>${opcoes}</select></div>
      </div>
      <div class="mc-campo"><label for="mtMotivoPedido">Motivo (opcional)</label>
        <input type="text" id="mtMotivoPedido" maxlength="300" value="${escaparHtmlEbd(mtPedido.motivo)}" placeholder="Ex.: mudou de bairro" data-on-input="mtPedidoCampoAcao" data-args-input="${argsAttr("motivo", ARG.valor)}" /></div>
      <p class="mc-aviso mc-aviso-atencao">⚠️ Na mesma área a mudança entra na hora. Em áreas diferentes, o pedido vai para a secretaria do destino, que aceita ou recusa;
        até lá, ${escaparHtmlEbd(p.nome || "a pessoa")} continua em ${escaparHtmlEbd(p.congregacao || "sua congregação")}.</p>
      ${mtPedido.erro ? `<p class="mb-campo-erro" role="alert">⚠️ ${escaparHtmlEbd(mtPedido.erro)}</p>` : ""}
      <div class="mc-botoes"><button type="submit" class="btn-confirmar mb-btn"${mtPedido.enviando ? " disabled" : ""}>${mtPedido.enviando ? "Enviando…" : "Enviar o pedido"}</button>
        <button type="button" class="btn-link" data-on-click="mbFichaParteAcao" data-args-click="${argsAttr("resumo")}">Cancelar</button></div>
    </form></section>`;
}
function mtPedidoCampoAcao(campo, valor) {
  if (campo === "destinoId") mtPedido.destinoId = String(valor || "").replace(/\D/g, "");
  if (campo === "motivo") mtPedido.motivo = String(valor || "").slice(0, 300);
}
async function mtPedirAcao() {
  const p = mbFicha.pessoa;
  if (!p) return;
  if (!mtPedido.destinoId) { mtPedido.erro = "Escolha para onde a pessoa vai."; mtMostrarPedidoNaFicha(); return; }
  mtPedido.enviando = true;
  mtPedido.erro = "";
  mtMostrarPedidoNaFicha();
  let data = null;
  try {
    const res = await fetchProtegido(`${API_BASE}/transferencias`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ membroId: p.membroId, congregacaoDestinoId: Number(mtPedido.destinoId), motivo: mtPedido.motivo.trim() || null }) });
    data = await res.json();
  } catch (e) { data = null; }
  mtPedido.enviando = false;
  if (data && data.sucesso) {
    const feita = data.situacao === "CONCLUIDA" || (data.transferencia && data.transferencia.situacao === "CONCLUIDA");
    mostrarToast(data.mensagem || (feita ? "Mudança feita." : "Pedido enviado ao destino."), "sucesso");
    mtPedido = { destinos: mtPedido.destinos, destinoId: "", motivo: "", erro: "", enviando: false };
    mbFicha.linha = null;
    mbFicha.parte = "resumo";
    await mbRecarregarPessoa();
    mbMostrarParte();
    return;
  }
  mtPedido.erro = (data && data.mensagem) || "Não deu para enviar agora.";
  mtMostrarPedidoNaFicha();
}

// ================================================================= a CAIXA DE SUGESTÕES (o 4º passo do fluxo, na secretaria)
async function mtAbrirSugestoes() {
  const caixa = document.getElementById("mtSugestoes");
  if (!caixa) return;
  const seq = ++mtSug.seq;
  if (!mtSug.itens.length) caixa.innerHTML = `${mbTopoHtml("Caixa de sugestões", "Carregando…", "")}`;
  let data = null;
  try {
    const res = await fetchProtegido(`${API_BASE}/fila-aprovacoes${mtSug.situacao === "DECIDIDAS" ? "?situacao=DECIDIDAS" : ""}`);
    data = await res.json();
  } catch (e) { data = null; }
  if (seq !== mtSug.seq) return;
  mtSug.erro = Array.isArray(data) ? "" : (data && data.mensagem) || "Não deu para ler a caixa agora.";
  mtSug.itens = Array.isArray(data) ? data : [];
  mtDesenharSugestoes();
}
function mtDesenharSugestoes() {
  const caixa = document.getElementById("mtSugestoes");
  if (!caixa) return;
  const valor = (c, v) => { const t = mbTextoDoValor(c.nomeCampo, v); return t ? escaparHtmlEbd(t) : "<em class=\"mb-vazio\">vazio</em>"; };
  const linhas = [];
  for (const s of mtSug.itens) {
    for (const c of (s.campos || [])) {
      const pendente = c.status === "PENDENTE";
      const chave = `${s.solicitacaoId}:${c.campoId}`;
      linhas.push(`<div class="mt-sugestao">
        <span class="mt-quem"><span class="mb-avatar" aria-hidden="true">${escaparHtmlEbd(mbIniciais(s.nome))}</span><span>
          <button type="button" class="btn-link" data-on-click="mbAbrirFichaAcao" data-args-click="${argsAttr(mbNum(s.membroId))}">${escaparHtmlEbd(s.nome || "")}</button>
          <span class="mb-dica">${escaparHtmlEbd(c.rotulo || c.nomeCampo)}${s.congregacao ? ` · ${escaparHtmlEbd(s.congregacao)}` : ""} · ${escaparHtmlEbd(mcQuandoFoi(s.dataSolicitacao))}</span></span></span>
        <span class="mt-mudanca"><s class="mb-dica">${valor(c, c.valorAnterior)}</s> <span aria-hidden="true">→</span> <strong>${valor(c, c.valorProposto)}</strong></span>
        <span class="mt-acoes">${pendente ? (c.podeAplicar || c.podeRecusar ? `
          ${c.podeRecusar ? `<input type="text" class="mt-motivo" maxlength="300" placeholder="motivo, se for recusar" aria-label="Motivo da recusa" value="${escaparHtmlEbd(mtSug.motivos[chave] || "")}"
            data-on-input="mtSugMotivoAcao" data-args-input="${argsAttr(chave, ARG.valor)}" />
          <button type="button" class="btn-confirmar btn-secundario mb-btn-pequeno" data-on-click="mtSugDecidirAcao" data-args-click="${argsAttr(s.solicitacaoId, c.campoId, "REJEITADO")}">Recusar</button>` : ""}
          ${c.podeAplicar ? `<button type="button" class="btn-confirmar mb-btn-pequeno" data-on-click="mtSugDecidirAcao" data-args-click="${argsAttr(s.solicitacaoId, c.campoId, "APROVADO")}">✓ Aplicar</button>` : ""}
          ${!c.podeAplicar && c.motivoNaoAplica ? `<span class="mb-trava">🔒 ${escaparHtmlEbd(c.motivoNaoAplica)}</span>` : ""}`
        : `<span class="mb-trava">🔒 ${escaparHtmlEbd(c.motivoNaoAplica || "Você acompanha.")}</span>`)
        : `<span class="${c.status === "APROVADO" ? "mb-chip mb-chip-verde" : "mb-chip mb-chip-neutro"}">${c.status === "APROVADO" ? "aplicada" : "recusada"}</span>${c.motivo ? ` <span class="mb-dica">${escaparHtmlEbd(c.motivo)}</span>` : ""}`}</span>
      </div>`);
    }
  }
  caixa.innerHTML = `
    ${mbTopoHtml("Caixa de sugestões", "O que os membros pediram para mudar na ficha: aplicar muda na hora e fica registrado quem aplicou", "")}
    <nav class="mt-abas" aria-label="Quais sugestões">
      <button type="button" class="mb-pilula${mtSug.situacao === "PENDENTE" ? " ativa" : ""}" data-on-click="mtSugSituacaoAcao" data-args-click="${argsAttr("PENDENTE")}">Esperando</button>
      <button type="button" class="mb-pilula${mtSug.situacao === "DECIDIDAS" ? " ativa" : ""}" data-on-click="mtSugSituacaoAcao" data-args-click="${argsAttr("DECIDIDAS")}">Já decididas</button>
    </nav>
    ${mtSug.erro ? `<p class="subtitle aviso-recusa">⚠️ ${escaparHtmlEbd(mtSug.erro)}</p>` : ""}
    <div class="mb-cartao mt-lista">${linhas.join("") || `<p class="mb-vazio-lista">${mtSug.situacao === "PENDENTE" ? "Nenhuma sugestão esperando." : "Nenhuma decidida ainda."}</p>`}</div>
    <p class="mb-dica mt-nota">ℹ️ Recusar avisa o membro com o motivo. O que só a Secretaria Geral muda (o nome, o CPF já gravado) aparece aqui travado e segue para ela.</p>`;
}
function mtSugSituacaoAcao(s) { mtSug.situacao = s === "DECIDIDAS" ? "DECIDIDAS" : "PENDENTE"; mtSug.itens = []; mtAbrirSugestoes(); }
function mtSugMotivoAcao(chave, valor) { mtSug.motivos[String(chave)] = String(valor || "").slice(0, 300); }
async function mtSugDecidirAcao(solicitacaoId, campoId, decisao) {
  if (decisao !== "APROVADO" && decisao !== "REJEITADO") return;
  const motivo = (mtSug.motivos[`${solicitacaoId}:${campoId}`] || "").trim();
  if (decisao === "REJEITADO" && motivo.length < 3) { mostrarToast("Escreva o motivo da recusa: o membro vai ler.", "erro"); return; }
  let data = null;
  try {
    const res = await fetchProtegido(`${API_BASE}/fila-aprovacoes/${encodeURIComponent(String(solicitacaoId))}/decidir`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decisoes: [Object.assign({ campoId: Number(campoId), decisao }, decisao === "REJEITADO" ? { motivo } : {})] }) });
    data = await res.json();
  } catch (e) { data = null; }
  mostrarToast((data && data.mensagem) || (data && data.sucesso ? "Feito." : "Não deu para decidir agora."), data && data.sucesso ? "sucesso" : "erro");
  if (mbPainel.avisos) mbPainel.avisos = null;
  mtAbrirSugestoes();
}

// ================================================================= MINHA VIDA NA IGREJA (o membro)
const MV_PARTES = [["linha", "🕒", "Minha linha do tempo"], ["dados", "👤", "Meus dados"], ["vinculos", "👪", "Família"], ["mudar", "✏️", "O que eu posso mudar"],
  ["credencial", "🪪", "Minha carteirinha"], ["transferencias", "↪", "Minhas transferências"], ["sugestoes", "💬", "Minhas sugestões"]];
// as partes que já têm tela no Meu Painel abrem lá; as outras são desenhadas aqui
const MV_ABRE_NO_PAINEL = { dados: "dados", vinculos: "vinculos", credencial: "credencial" };
let mv = { parte: "linha", linha: null, dados: null, campos: null, transf: null, sugestoes: null, pagina: 1, sugerir: null, valor: "", erro: "", seq: 0 };
async function mvAbrir() {
  const caixa = document.getElementById("mvFicha");
  if (!caixa || !authMatricula) return;
  const seq = ++mv.seq;
  if (!mv.dados) caixa.innerHTML = "<p class=\"subtitle\">Carregando a sua ficha…</p>";
  const ler = async (url) => { try { const r = await fetchProtegido(url); return await r.json(); } catch (e) { return null; } };
  const mat = encodeURIComponent(String(authMatricula));
  const [dados, linha, transf, sug] = await Promise.all([ler(`${API_BASE}/meus-dados/${mat}`), ler(`${API_BASE}/minha-linha-do-tempo/${mat}?pagina=${mv.pagina}&porPagina=8`),
    ler(`${API_BASE}/minha-transferencia/${mat}`), ler(`${API_BASE}/solicitacoes-edicao/${mat}`)]);
  if (seq !== mv.seq) return;
  mv.dados = dados && dados.sucesso ? dados.dados : null;
  mv.campos = dados && Array.isArray(dados.campos) ? dados.campos : [];
  mv.linha = linha && linha.sucesso ? linha : null;
  mv.transf = transf && transf.sucesso ? transf : null;
  mv.sugestoes = Array.isArray(sug) ? sug : sug && Array.isArray(sug.solicitacoes) ? sug.solicitacoes : sug && Array.isArray(sug.itens) ? sug.itens : [];
  mvDesenhar();
}
function mvPendentes() { return (mv.sugestoes || []).reduce((n, s) => n + (s.campos || []).filter((c) => c.status === "PENDENTE").length, 0); }
function mvDesenhar() {
  const caixa = document.getElementById("mvFicha");
  if (!caixa) return;
  const d = mv.dados || {};
  const pend = mvPendentes();
  const menu = MV_PARTES.map(([chave, icone, rotulo]) => `<button type="button" class="mb-ficha-menu-item${chave === mv.parte ? " ativo" : ""}" data-on-click="mvParteAcao" data-args-click="${argsAttr(chave)}"${chave === mv.parte ? " aria-current=\"page\"" : ""}>
    <span aria-hidden="true">${escaparHtmlEbd(icone)}</span>${escaparHtmlEbd(rotulo)}${chave === "sugestoes" && pend ? ` <span class="mb-contador">${mbFmt(pend)}</span>` : ""}</button>`).join("");
  caixa.innerHTML = `<div class="mb-ficha">
    <div class="mb-ficha-principal">
      <div class="mb-cartao mb-ficha-cabeca mv-cabeca">
        <div class="mb-ficha-foto"><span aria-hidden="true">${escaparHtmlEbd(mbIniciais(d.nome || authNome || "?"))}</span></div>
        <div class="mb-ficha-quem"><h3 class="mb-ficha-nome">${escaparHtmlEbd(d.nome || authNome || "")}</h3>
          <p class="mb-sub">Matrícula ${escaparHtmlEbd(String(authMatricula || ""))}${mv.transf && mv.transf.congregacaoAtual ? ` · ${escaparHtmlEbd(mv.transf.congregacaoAtual)}` : ""}${d.dataAdmissao ? ` · membro desde ${escaparHtmlEbd(String(d.dataAdmissao).slice(0, 4))}` : ""}</p></div>
      </div>
      <div id="mvCorpo">${mvCorpoHtml()}</div>
    </div>
    <nav class="mb-ficha-menu" aria-label="Minha ficha"><p class="mb-ficha-menu-rotulo">Minha ficha</p>${menu}
      <p class="mb-dica mb-ficha-menu-nota">Tudo o que é seu, sem pedir: muda o contato sozinho e sugere o resto.</p></nav>
  </div>`;
}
function mvCorpoHtml() {
  if (mv.parte === "transferencias") return mvTransferenciasHtml();
  if (mv.parte === "sugestoes") return mvSugestoesHtml();
  if (mv.parte === "mudar") return mvMudarHtml();
  const l = mv.linha || {};
  const eventos = Array.isArray(l.eventos) ? l.eventos : [];
  const total = mbNum(l.total);
  const paginas = Math.max(1, Math.ceil(total / 8));
  const itens = eventos.map((e) => `<li class="mb-tempo-item mb-tempo-${escaparHtmlEbd(String(e.categoria || "").toLowerCase())}">
    <span class="mb-tempo-icone" aria-hidden="true">${escaparHtmlEbd(MB_ICONE_CATEGORIA[e.categoria] || "•")}</span>
    <span class="mb-tempo-texto"><strong>${escaparHtmlEbd(e.titulo)}</strong> <span class="mb-tempo-data">${e.aproximada ? `por volta de ${escaparHtmlEbd(String(e.data || "").slice(0, 4))}` : escaparHtmlEbd(mbDataBr(e.data))}</span>${e.detalhe ? `<span class="mb-tempo-detalhe">${escaparHtmlEbd(e.detalhe)}</span>` : ""}</span></li>`).join("");
  const ve = l.vidaEspiritual || {};
  const modo = (chave) => ((mv.campos || []).find((c) => c.chave === chave) || {}).modo || "NAO";
  const acao = (chave) => (modo(chave) === "MUDA" ? `<button type="button" class="btn-link" data-on-click="mvSugerirAcao" data-args-click="${argsAttr(chave)}">Mudar</button>`
    : modo(chave) === "SUGERE" ? `<button type="button" class="btn-link" data-on-click="mvSugerirAcao" data-args-click="${argsAttr(chave)}">Sugerir</button>` : "");
  const linha = (rotulo, valor, chave) => `<div class="mb-campo"><span class="mb-campo-rotulo">${escaparHtmlEbd(rotulo)}</span><span class="mb-campo-valor">${valor ? escaparHtmlEbd(valor) : "<em class=\"mb-vazio\">ainda não informado</em>"}</span><span class="mb-campo-acao">${chave ? acao(chave) : ""}</span></div>`;
  const d = mv.dados || {};
  return `${mv.sugerir ? mvSugerirHtml() : ""}
    <section class="mb-cartao mb-tempo"><header class="mb-cartao-cabeca"><h4>A minha vida na Igreja</h4><span class="mb-dica">tudo, por inteiro · você vê o mesmo que a secretaria</span></header>
      ${itens ? `<ol class="mb-tempo-lista">${itens}</ol>` : "<p class=\"subtitle\">Nada registrado ainda.</p>"}
      ${paginas > 1 ? `<div class="mb-paginacao"><span class="mb-dica">${mbFmt(total)} acontecimentos</span><span class="mb-paginas">
        <button type="button" class="mb-pagina"${mv.pagina <= 1 ? " disabled" : ""} data-on-click="mvPaginaAcao" data-args-click="${argsAttr(mv.pagina - 1)}">‹ Mais recentes</button>
        <button type="button" class="mb-pagina"${mv.pagina >= paginas ? " disabled" : ""} data-on-click="mvPaginaAcao" data-args-click="${argsAttr(mv.pagina + 1)}">Mais antigos ›</button></span></div>` : ""}
    </section>
    <div class="mv-cartoes">
      <section class="mb-cartao"><header class="mb-cartao-cabeca"><h4>🕊️ Vida espiritual</h4></header>
        ${linha("Conversão", ve.conversao ? mbDataBr(ve.conversao.data) || String(ve.conversao.data || "").slice(0, 4) : "", "")}
        ${linha("Batismo nas águas", d.dataBatismo ? mbDataBr(d.dataBatismo) : "", "dataBatismo")}
        ${linha("Batismo no Espírito Santo", ve.batismoEspiritoSanto ? mbDataBr(ve.batismoEspiritoSanto.data) : "", "")}
      </section>
      <section class="mb-cartao"><header class="mb-cartao-cabeca"><h4>📱 Contato</h4><button type="button" class="btn-link" data-on-click="mostrarSubAbaMeupainel" data-args-click="${argsAttr("dados")}">Endereço ›</button></header>
        ${linha("Celular", d.telefone || "", "telefone")}
        ${linha("E-mail", d.email || "", "email")}
      </section>
    </div>`;
}
// o que eu posso mudar: cada campo com o modo (muda sozinho, sugere, pela transferência, a secretaria cuida)
function mvMudarHtml() {
  const modos = { MUDA: ["mb-chip mb-chip-verde", "muda sozinho"], SUGERE: ["mb-chip mb-chip-ambar", "sugere"], NAO: ["mb-chip mb-chip-neutro", "a secretaria cuida"] };
  const linhas = (mv.campos || []).filter((c) => c.tipo !== "endereco").map((c) => {
    const m = modos[c.modo] || modos.NAO;
    const v = mbTextoDoValor(c.chave, (mv.dados || {})[c.chave]);
    return `<div class="mb-campo"><span class="mb-campo-rotulo">${escaparHtmlEbd(c.rotulo)}</span><span class="mb-campo-valor"><span>${v ? escaparHtmlEbd(v) : "<em class=\"mb-vazio\">vazio</em>"}</span>
      ${c.sugestaoPendente ? "<span class=\"mb-trava\">sugestão esperando a secretaria</span>" : ""}</span>
      <span class="mb-campo-acao"><span class="${escaparHtmlEbd(m[0])}">${escaparHtmlEbd(m[1])}</span>${c.modo !== "NAO" && !c.sugestaoPendente ? `<button type="button" class="btn-link" data-on-click="mvSugerirAcao" data-args-click="${argsAttr(c.chave)}">${c.modo === "MUDA" ? "Mudar" : "Sugerir"}</button>` : ""}</span></div>`;
  }).join("");
  return `${mv.sugerir ? mvSugerirHtml() : ""}<section class="mb-cartao"><header class="mb-cartao-cabeca"><h4>✏️ O que eu posso mudar</h4><span class="mb-dica">igual para todos</span></header>
    ${linhas || "<p class=\"subtitle\">Carregando…</p>"}
    <div class="mb-campo"><span class="mb-campo-rotulo">Congregação</span><span class="mb-campo-valor">${escaparHtmlEbd((mv.transf && mv.transf.congregacaoAtual) || "")}</span>
      <span class="mb-campo-acao"><span class="mb-chip mb-chip-azul">pela transferência</span><button type="button" class="btn-link" data-on-click="mvParteAcao" data-args-click="${argsAttr("transferencias")}">Pedir</button></span></div>
    <p class="mb-dica">O endereço muda em "Meus dados". Cargo e situação, a secretaria cuida.</p></section>`;
}
// mudar (o que é seu) ou sugerir (o resto, com o porquê)
function mvSugerirHtml() {
  const c = (mv.campos || []).find((x) => x.chave === mv.sugerir);
  if (!c) return "";
  const muda = c.modo === "MUDA";
  const atual = mbTextoDoValor(c.chave, (mv.dados || {})[c.chave]);
  const tipo = c.tipo === "data" ? "date" : c.tipo === "email" ? "email" : c.tipo === "telefone" ? "tel" : "text";
  const entrada = c.tipo === "lista" ? `<select id="mvValor" data-on-change="mvValorAcao" data-args-change="${argsAttr(ARG.valor)}"><option value="">— escolha —</option>${(c.opcoes || []).map((o) => `<option value="${escaparHtmlEbd(o)}"${o === mv.valor ? " selected" : ""}>${escaparHtmlEbd(mbTextoDoValor(c.chave, o))}</option>`).join("")}</select>`
    : `<input type="${tipo}" id="mvValor" maxlength="200" value="${escaparHtmlEbd(mv.valor)}" data-on-input="mvValorAcao" data-args-input="${argsAttr(ARG.valor)}" />`;
  return `<section class="mb-cartao mv-sugerir"><header class="mb-cartao-cabeca"><h4>${muda ? "Mudar" : "Sugerir alteração"}: ${escaparHtmlEbd(c.rotulo)}</h4><span class="mb-dica">${muda ? "muda na hora; fica registrado na ficha" : "vai para a secretaria da sua congregação conferir"}</span></header>
    <form class="mc-form" data-on-submit="mvEnviarAcao" data-prevent="submit">
      <div class="mb-campo"><span class="mb-campo-rotulo">Hoje está</span><span class="mb-campo-valor">${atual ? escaparHtmlEbd(atual) : "<em class=\"mb-vazio\">vazio</em>"}</span><span></span></div>
      <div class="mc-campo"><label for="mvValor">${muda ? "O novo" : "O certo é"} *</label>${entrada}</div>
      ${mv.erro ? `<p class="mb-campo-erro" role="alert">⚠️ ${escaparHtmlEbd(mv.erro)}</p>` : ""}
      <div class="mc-botoes"><button type="submit" class="btn-confirmar mb-btn">${muda ? "Salvar" : "Enviar para a secretaria"}</button>
        <button type="button" class="btn-link" data-on-click="mvSugerirAcao" data-args-click="${argsAttr("")}">Cancelar</button></div>
      ${muda ? "" : "<p class=\"mb-dica\">Você acompanha em \"Minhas sugestões\" e recebe o aviso quando for aplicada ou recusada (com o motivo).</p>"}
    </form></section>`;
}
function mvTransferenciasHtml() {
  const t = mv.transf || {};
  const pedidos = Array.isArray(t.pedidos) ? t.pedidos : [];
  const aberto = pedidos.some((p) => p.situacao === "PENDENTE");
  const opcoes = (Array.isArray(t.congregacoes) ? t.congregacoes : []).filter((c) => c.nome !== t.congregacaoAtual)
    .map((c) => `<option value="${c.congregacaoId}"${String(c.congregacaoId) === String(mv.valor) ? " selected" : ""}>${escaparHtmlEbd(c.nome)}</option>`).join("");
  const lista = pedidos.map((p) => { const s = MT_SITUACAO[p.situacao] || MT_SITUACAO.PENDENTE; return `<li><span>${escaparHtmlEbd(p.origemNome || "")} → <strong>${escaparHtmlEbd(p.destinoNome || "")}</strong>
    <span class="mb-dica"> · ${escaparHtmlEbd(mtDataHora(p.pedidoEm))}${p.motivoRecusa ? ` · motivo da recusa: ${escaparHtmlEbd(p.motivoRecusa)}` : ""}</span></span>
    <span class="${escaparHtmlEbd(s[0])}">${escaparHtmlEbd(s[1])}</span>${p.situacao === "PENDENTE" && p.podeCancelar !== false ? ` <button type="button" class="btn-link" data-on-click="mvCancelarTransferenciaAcao" data-args-click="${argsAttr(p.transferenciaId)}">Cancelar</button>` : ""}</li>`; }).join("");
  return `<section class="mb-cartao"><header class="mb-cartao-cabeca"><h4>↪ Minhas transferências</h4><span class="mb-dica">hoje em ${escaparHtmlEbd(t.congregacaoAtual || "—")}</span></header>
    ${aberto ? "<p class=\"mc-aviso mc-aviso-atencao\">Você já tem um pedido esperando resposta.</p>" : `<form class="mc-form" data-on-submit="mvPedirTransferenciaAcao" data-prevent="submit">
      <div class="mc-grade"><div class="mc-campo"><label for="mvDestino">Quero ir para</label><select id="mvDestino" data-on-change="mvValorAcao" data-args-change="${argsAttr(ARG.valor)}"><option value="">— escolha —</option>${opcoes}</select></div></div>
      <p class="mb-dica">Na mesma área a mudança entra na hora; em áreas diferentes, a secretaria do destino aceita ou recusa, e até lá você continua onde está.</p>
      ${mv.erro ? `<p class="mb-campo-erro" role="alert">⚠️ ${escaparHtmlEbd(mv.erro)}</p>` : ""}
      <div class="mc-botoes"><button type="submit" class="btn-confirmar mb-btn">Pedir a mudança</button></div></form>`}
    ${lista ? `<ul class="mc-meus">${lista}</ul>` : "<p class=\"mb-dica\">Nenhum pedido ainda.</p>"}</section>`;
}
function mvSugestoesHtml() {
  const itens = [];
  for (const s of mv.sugestoes || []) for (const c of (s.campos || [])) {
    const st = c.status === "PENDENTE" ? ["mb-chip mb-chip-ambar", "esperando a secretaria"] : c.status === "APROVADO" ? ["mb-chip mb-chip-verde", "aplicada"] : ["mb-chip mb-chip-vermelho", "recusada"];
    itens.push(`<li><span><strong>${escaparHtmlEbd(c.rotulo || mbRotuloDaChave(c.nomeCampo, ""))}</strong>: ${escaparHtmlEbd(mbTextoDoValor(c.nomeCampo, c.valorProposto) || "—")}
      ${c.motivo ? `<span class="mb-dica"> · ${escaparHtmlEbd(c.motivo)}</span>` : ""}</span><span class="${escaparHtmlEbd(st[0])}">${escaparHtmlEbd(st[1])}</span></li>`);
  }
  return `<section class="mb-cartao"><header class="mb-cartao-cabeca"><h4>💬 Minhas sugestões</h4><button type="button" class="btn-link" data-on-click="mvParteAcao" data-args-click="${argsAttr("mudar")}">Sugerir outra ›</button></header>
    ${itens.length ? `<ul class="mc-meus">${itens.join("")}</ul>` : "<p class=\"mb-dica\">Nenhuma sugestão ainda.</p>"}</section>`;
}
function mvParteAcao(parte) {
  if (!MV_PARTES.some((p) => p[0] === parte)) return;
  if (mbTem(MV_ABRE_NO_PAINEL, parte)) { mostrarSubAbaMeupainel(MV_ABRE_NO_PAINEL[parte]); return; }
  mv.parte = parte;
  mv.sugerir = null;
  mv.valor = "";
  mv.erro = "";
  mvDesenhar();
}
function mvPaginaAcao(p) { const n = Number(p); if (Number.isInteger(n) && n >= 1) { mv.pagina = n; mvAbrir(); } }
function mvSugerirAcao(chave) {
  mv.sugerir = chave && (mv.campos || []).some((c) => c.chave === chave) ? chave : null;
  mv.valor = "";
  mv.erro = "";
  mvDesenhar();
  const el = document.getElementById("mvValor");
  if (el) el.focus();
}
function mvValorAcao(valor) { mv.valor = String(valor == null ? "" : valor).slice(0, 200); }
async function mvEnviarAcao() {
  const c = (mv.campos || []).find((x) => x.chave === mv.sugerir);
  if (!c) return;
  if (!mv.valor.trim()) { mv.erro = "Preencha o valor."; mvDesenhar(); return; }
  const mat = encodeURIComponent(String(authMatricula));
  const muda = c.modo === "MUDA";
  let data = null;
  try {
    const res = await fetchProtegido(muda ? `${API_BASE}/meus-dados/${mat}` : `${API_BASE}/solicitacoes-edicao/${mat}`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(muda ? { [c.chave]: mv.valor.trim() } : { campos: { [c.chave]: mv.valor.trim() } }) });
    data = await res.json();
  } catch (e) { data = null; }
  if (data && data.sucesso) {
    mostrarToast(data.mensagem || (muda ? "Salvo." : "Sugestão enviada à secretaria."), "sucesso");
    mv.sugerir = null; mv.valor = ""; mv.erro = "";
    mvAbrir();
    return;
  }
  mv.erro = (data && data.mensagem) || "Não deu para enviar agora.";
  mvDesenhar();
}
async function mvPedirTransferenciaAcao() {
  if (!mv.valor) { mv.erro = "Escolha para onde quer ir."; mvDesenhar(); return; }
  if (!(await confirmarAcao("Pedir a mudança de congregação?", "Pedir"))) return;
  let data = null;
  try {
    const res = await fetchProtegido(`${API_BASE}/minha-transferencia/${encodeURIComponent(String(authMatricula))}`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ congregacaoDestinoId: Number(mv.valor) }) });
    data = await res.json();
  } catch (e) { data = null; }
  if (data && data.sucesso) { mostrarToast(data.mensagem || "Pedido enviado.", "sucesso"); mv.valor = ""; mv.erro = ""; mvAbrir(); return; }
  mv.erro = (data && data.mensagem) || "Não deu para pedir agora.";
  mvDesenhar();
}
async function mvCancelarTransferenciaAcao(id) {
  if (!(await confirmarAcao("Cancelar o seu pedido de mudança?", "Cancelar o pedido"))) return;
  let data = null;
  try {
    const res = await fetchProtegido(`${API_BASE}/minha-transferencia/${encodeURIComponent(String(authMatricula))}/cancelar`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transferenciaId: Number(id) }) });
    data = await res.json();
  } catch (e) { data = null; }
  mostrarToast((data && data.mensagem) || (data && data.sucesso ? "Pedido cancelado." : "Não deu para cancelar."), data && data.sucesso ? "sucesso" : "erro");
  mvAbrir();
}

registrarAcoes({
  mtAcompanharAcao, mtCaixaAcao, mtDecidirAcao, mtFecharAcao, mtMotivoAcao, mtPedidoCampoAcao, mtPedirAcao, mtSugDecidirAcao, mtSugMotivoAcao, mtSugSituacaoAcao,
  mvCancelarTransferenciaAcao, mvEnviarAcao, mvPaginaAcao, mvParteAcao, mvPedirTransferenciaAcao, mvSugerirAcao, mvValorAcao
});
