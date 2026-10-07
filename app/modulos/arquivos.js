// app/modulos/arquivos.js — módulo extraído do script.js (vD.2, 2026-10-07).
// Script clássico, carregado pelo index.html DEPOIS do script.js e do eventos.js: compartilha o escopo
// global com eles (as funções e constantes abaixo continuam acessíveis pelo nome, como antes). As ações
// que o HTML pede deste módulo são registradas aqui mesmo, no fim do arquivo (registrarAcoes mescla).

// ---- SECRETARIA / ABA ARQUIVOS (v2.9) — catálogo de referências, sem editor ----
async function carregarOpcoesFormDocumentos() {
  // Publicar para todo mundo é ato da administração geral (o servidor confere; aqui só não oferece a opção a quem não pode).
  document.getElementById("documentoVisibilidadePublico").disabled = !authGeral;
  const res = await fetchProtegido(`${API_BASE}/orgaos`);
  const orgaos = await listaDaApi(res);
  document.getElementById("documentoOrgao").innerHTML = `<option value="">Sem órgão específico</option>` +
    orgaos.map(o => `<option value="${o.orgaoId}">${escaparHtmlEbd(o.nome)}</option>`).join("");

  // vB.6 — categorias de retenção só carregam pra quem tem nível Global
  // (mesma restrição de GestaoPoliticasRetencao) — quem não tem, o select
  // fica só com "(nenhuma)" e o documento entra sem categoria mesmo.
  if (authGeral) {
    const resPol = await fetchProtegido(`${API_BASE}/politicas-retencao`);
    if (resPol.ok) {
      const politicas = await resPol.json();
      document.getElementById("documentoCategoria").innerHTML = `<option value="">(nenhuma)</option>` +
        politicas.filter(p => p.ativo).map(p => `<option value="${escaparHtmlEbd(p.categoria)}">${escaparHtmlEbd(p.categoria)}</option>`).join("");
    }
  }
}

async function salvarDocumentoAcao() {
  const tipo = document.getElementById("documentoTipo").value;
  const orgaoId = document.getElementById("documentoOrgao").value || undefined;
  const referenciaId = document.getElementById("documentoReferenciaId").value || undefined;
  const descricao = document.getElementById("documentoDescricao").value.trim();
  const categoria = document.getElementById("documentoCategoria").value || undefined;
  const visibilidade = document.getElementById("documentoVisibilidade").value;
  const arquivo = document.getElementById("documentoArquivo").files[0];
  const msg = document.getElementById("resultadoDocumento");
  if (!arquivo) { msg.textContent = "Selecione um arquivo."; return; }

  const arquivoBase64 = await lerArquivoComoBase64(arquivo);
  const res = await fetchProtegido(`${API_BASE}/documentos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipo, orgaoId, referenciaId, descricao: descricao || undefined, categoria, visibilidade, arquivoBase64, mimeType: arquivo.type })
  });
  const data = await res.json();
  msg.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("documentoReferenciaId").value = "";
    document.getElementById("documentoDescricao").value = "";
    document.getElementById("documentoArquivo").value = "";
    carregarDocumentos();
  }
}

// vB.6 — status calculado na leitura (shared/retencao.js), nunca marcação manual.
function badgeStatusRetencao(status) {
  if (!status) return "-";
  if (status.status === "INDETERMINADO") return "<span class='badge-status'>Indeterminado</span>";
  if (status.status === "VENCIDO") return `<span class="badge-status badge-desligado">Vencido (${escaparHtmlEbd(status.vencimentoEm)})</span>`;
  return `<span class="badge-status badge-ativo">Vigente até ${escaparHtmlEbd(status.vencimentoEm)}</span>`;
}

const ROTULO_TIPO_DOCUMENTO = {
  ATA: "Ata", TERMO_POSSE: "Termo de Posse", MEMORANDO: "Memorando", PARECER: "Parecer",
  PARECER_COMPATIBILIDADE: "Parecer de Compatibilidade Ministerial", RELATORIO_TRANSICAO: "Relatório de Transição",
  OFICIO: "Ofício/Representação", REGIMENTO: "Regimento (alteração)", OUTRO: "Outro"
};

async function carregarDocumentos() {
  const container = document.getElementById("resultadoListaDocumentos");
  const tipo = document.getElementById("documentoFiltroTipo").value;
  const res = await fetchProtegido(`${API_BASE}/documentos${tipo ? `?tipo=${tipo}` : ""}`);
  const documentos = await jsonDaTela(res, container, "lista");
  if (documentos === null) return;
  if (!Array.isArray(documentos) || documentos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum documento registrado ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Tipo</th><th>Descrição</th><th>Órgão</th><th>Registrado por</th><th>Data</th><th>Quem vê</th><th>Prazo</th><th>Retenção</th><th></th>
  </tr></thead><tbody>`;
  documentos.forEach(d => {
    let prazoHtml = "-";
    if (d.tipo === "ATA" && d.diasDesdeSessao != null) {
      if (d.prazoCartorioVencido) prazoHtml = `<span style="color:var(--cor-perigo,#c0392b);">⚠️ Prazo de cartório vencido (${escaparHtmlEbd(d.diasDesdeSessao)}d)</span>`;
      else if (d.prazoLavraturaVencido) prazoHtml = `<span style="color:var(--cor-perigo,#c0392b);">⚠️ Prazo de lavratura vencido (${escaparHtmlEbd(d.diasDesdeSessao)}d)</span>`;
      else prazoHtml = `✅ Em dia (${escaparHtmlEbd(d.diasDesdeSessao)}d)`;
    }
    // Quem pode mudar a visibilidade/apagar: a administração geral, ou quem registrou o documento (o servidor confere de novo). Publicar para todos só o geral.
    const podeMexer = authGeral || (d.registradoPor != null && String(d.registradoPor) === String(authMatricula));
    const opcoesVisibilidade = Object.keys(ROTULO_VISIBILIDADE_DOCUMENTO)
      .filter(v => v !== "PUBLICO" || authGeral || d.visibilidade === "PUBLICO")
      .map(v => `<option value="${escaparHtmlEbd(v)}"${v === d.visibilidade ? " selected" : ""}>${ROTULO_VISIBILIDADE_DOCUMENTO[v]}</option>`).join("");
    const quemVe = podeMexer
      ? `<select data-on-change="alterarVisibilidadeDocumentoAcao" data-args-change="${argsAttr(Number(d.documentoId), ARG.valor)}">${opcoesVisibilidade}</select>`
      : (ROTULO_VISIBILIDADE_DOCUMENTO[d.visibilidade] || "-");
    html += `<tr>
      <td>${escaparHtmlEbd(ROTULO_TIPO_DOCUMENTO[d.tipo] || d.tipo)}</td>
      <td>${escaparHtmlEbd(d.descricao || "-")}</td>
      <td>${escaparHtmlEbd(d.orgaoNome || "-")}</td>
      <td>${escaparHtmlEbd(d.registradoPorNome || "-")}</td>
      <td>${d.criadoEm ? escaparHtmlEbd(d.criadoEm.slice(0, 10)) : "-"}</td>
      <td>${quemVe}</td>
      <td>${prazoHtml}</td>
      <td>${badgeStatusRetencao(d.statusRetencao)}</td>
      <td class="acoes-inline">
        <a class="btn-link" href="${urlSegura(d.urlAssinada)}" target="_blank" rel="noopener">Abrir</a>
        ${podeMexer ? `<button class="btn-link btn-link-perigo" data-on-click="excluirDocumentoAcao" data-args-click="${argsAttr(Number(d.documentoId))}">Excluir</button>` : ""}
      </td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

const ROTULO_VISIBILIDADE_DOCUMENTO = { MEMBROS: "👥 Membros", LIDERANCA: "🔒 Liderança", PUBLICO: "🌐 Todos (público)" };

async function alterarVisibilidadeDocumentoAcao(id, visibilidade) {
  const res = await fetchProtegido(`${API_BASE}/documentos/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visibilidade })
  });
  const data = await res.json();
  avisarResultado(data);
  carregarDocumentos();
}

async function excluirDocumentoAcao(id) {
  if (!(await confirmarAcao("Excluir este registro? O arquivo permanece no armazenamento, só o catálogo é removido.", "Excluir"))) return;
  const res = await fetchProtegido(`${API_BASE}/documentos/${id}`, { method: "DELETE" });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarDocumentos();
}

// ---- TEXTO MESTRE CONSOLIDADO (vB.15 — Reg. Art. 162 §§2º-4º e 162-B) ----
async function carregarTextoMestre() {
  const res = await fetchProtegido(`${API_BASE}/texto-mestre`);
  const data = await jsonDaTela(res, document.getElementById("painelTextoMestreVigente"), "objeto");
  if (data === null) return;

  const vigenteEl = document.getElementById("painelTextoMestreVigente");
  vigenteEl.innerHTML = data.vigente
    ? `Versão vigente: nº ${escaparHtmlEbd(data.vigente.numeroVersao)} (desde ${escaparHtmlEbd(data.vigente.dataVigencia)}) — <a href="${urlSegura(data.vigente.urlAssinada)}" target="_blank" rel="noopener">abrir PDF</a>`
    : "⚠️ Nenhuma versão consolidada registrada ainda.";

  const pendEl = document.getElementById("painelTextoMestrePendencias");
  const vencidas = (data.pendenciasAtualizacao || []).filter(p => p.prazoVencido);
  pendEl.innerHTML = vencidas.length === 0 ? "" :
    `<p class="subtitle" style="color:var(--cor-perigo,#c0392b);">⚠️ ${vencidas.length} alteração(ões) do Regimento registrada(s) há mais de 48h sem consolidação no Texto Mestre (Art. 162 §2º): ${vencidas.map(v => escaparHtmlEbd(v.descricao) || `documento #${v.documentoId}`).join(", ")}.</p>`;

  const revEl = document.getElementById("painelTextoMestreRevisaoQuadrienal");
  const rev = data.revisaoQuadrienal;
  if (!rev || !rev.definida) {
    revEl.textContent = "Revisão sistêmica quadrienal (Art. 162-B): data-base ainda não definida.";
  } else if (rev.vencida) {
    revEl.innerHTML = `<span style="color:var(--cor-perigo,#c0392b);">⚠️ Revisão sistêmica quadrienal (Art. 162-B) vencida desde ${escaparHtmlEbd(rev.proximaRevisao)}.</span>`;
  } else if (rev.dentroAntecedencia) {
    revEl.innerHTML = `⚠️ Revisão sistêmica quadrienal (Art. 162-B) prevista para ${escaparHtmlEbd(rev.proximaRevisao)} (${escaparHtmlEbd(rev.diasRestantes)} dia(s)).`;
  } else {
    revEl.textContent = `Próxima revisão sistêmica quadrienal (Art. 162-B): ${rev.proximaRevisao}.`;
  }

  const histEl = document.getElementById("resultadoHistoricoTextoMestre");
  if (!Array.isArray(data.historico) || data.historico.length === 0) {
    histEl.innerHTML = "<p class='subtitle'>Nenhuma versão registrada ainda.</p>";
  } else {
    histEl.innerHTML = `<table class="tabela-frequencia"><thead><tr><th>Versão</th><th>Vigência</th><th>Artigos tocados</th></tr></thead><tbody>` +
      data.historico.map(v => `<tr><td>nº ${escaparHtmlEbd(v.numeroVersao)}</td><td>${escaparHtmlEbd(v.dataVigencia)}</td><td>${v.artigosTocados != null ? `${escaparHtmlEbd(v.artigosTocados)} de ${escaparHtmlEbd(v.totalArtigos)}` : "-"}</td></tr>`).join("") +
      `</tbody></table>`;
  }
}

async function registrarVersaoTextoMestreAcao() {
  const dataVigencia = document.getElementById("textoMestreDataVigencia").value;
  const totalArtigos = document.getElementById("textoMestreTotalArtigos").value || null;
  const artigosTocados = document.getElementById("textoMestreArtigosTocados").value || null;
  const arquivo = document.getElementById("textoMestreArquivo").files[0];
  const resultado = document.getElementById("resultadoTextoMestre");
  if (!dataVigencia || !arquivo) { resultado.textContent = "Informe a data de vigência e o arquivo PDF consolidado."; return; }

  const body = {
    dataVigencia, totalArtigos: totalArtigos ? Number(totalArtigos) : undefined, artigosTocados: artigosTocados ? Number(artigosTocados) : undefined,
    arquivoBase64: await arquivoParaBase64(arquivo), mimeType: arquivo.type
  };
  const res = await fetchProtegido(`${API_BASE}/texto-mestre`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("textoMestreDataVigencia").value = "";
    document.getElementById("textoMestreTotalArtigos").value = "";
    document.getElementById("textoMestreArtigosTocados").value = "";
    document.getElementById("textoMestreArquivo").value = "";
    carregarTextoMestre();
  }
}

// ---- POLÍTICAS DE RETENÇÃO (vB.6 — Arquivo Institucional, nível Global) ----
// vB.8 — achado real: existia uma SEGUNDA tela editando PoliticasRetencao
// (o catálogo genérico de GestaoCatalogos, aba Proteção de Dados), aberta
// a qualquer um com a permissão "pessoas" — sem relação com esta tela
// (vB.6, restrita a nível Global) e sem essa restrição. Corrigido: a
// entrada 'politicasRetencao' saiu de GestaoCatalogos (única fonte de
// edição agora é esta, nível Global) e a aba Proteção de Dados passou a
// chamar esta mesma função, só com o container diferente.
let idContainerPoliticasRetencaoAtual = "resultadoListaPoliticasRetencao";
async function carregarPoliticasRetencao(idContainer) {
  idContainerPoliticasRetencaoAtual = idContainer || idContainerPoliticasRetencaoAtual;
  const container = document.getElementById(idContainerPoliticasRetencaoAtual);
  if (!authGeral) { container.innerHTML = "<p class='subtitle'>Só a administração geral da igreja administra as políticas de retenção.</p>"; return; }
  const res = await fetchProtegido(`${API_BASE}/politicas-retencao`);
  const politicas = await jsonDaTela(res, container, "objeto");
  if (politicas === null) return;
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Categoria</th><th>Base Legal</th><th>Dias de retenção</th><th>Ativa</th><th></th>
  </tr></thead><tbody>`;
  politicas.forEach(p => {
    html += `<tr>
      <td>${escaparHtmlEbd(p.categoria)}</td>
      <td style="max-width:360px;">${escaparHtmlEbd(p.baseLegal)}</td>
      <td>${p.diasRetencao != null ? escaparHtmlEbd(p.diasRetencao) : "Indeterminado"}</td>
      <td><input type="checkbox" ${p.ativo ? "checked" : ""} data-on-change="atualizarPoliticaRetencao" data-args-change="${argsAttr(p.politicaId, { ativo: ARG.marcado })}" /></td>
      <td class="acoes-inline">
        <button class="btn-link" data-on-click="editarDiasRetencaoAcao" data-args-click="${argsAttr(p.politicaId, (p.diasRetencao != null) ? Number(p.diasRetencao) : null)}">Editar dias</button>
      </td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function atualizarPoliticaRetencao(politicaId, alteracoes) {
  const res = await fetchProtegido(`${API_BASE}/politicas-retencao/${politicaId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(alteracoes)
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarPoliticasRetencao(idContainerPoliticasRetencaoAtual);
}

async function editarDiasRetencaoAcao(politicaId, diasAtual) {
  const novo = await pedirTexto("Dias de retenção (vazio = indeterminado)", "Ex: 1825 (5 anos)", diasAtual != null ? String(diasAtual) : "");
  if (novo === null) return;
  const diasRetencao = novo.trim() === "" ? null : Number(novo);
  if (novo.trim() !== "" && (!Number.isFinite(diasRetencao) || diasRetencao <= 0)) {
    mostrarToast("Informe um número de dias válido, ou deixe vazio pra indeterminado.", "erro");
    return;
  }
  await atualizarPoliticaRetencao(politicaId, { diasRetencao });
}

registrarAcoes({
  alterarVisibilidadeDocumentoAcao, atualizarPoliticaRetencao, carregarDocumentos, editarDiasRetencaoAcao, excluirDocumentoAcao,
  registrarVersaoTextoMestreAcao, salvarDocumentoAcao
});
