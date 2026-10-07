// app/modulos/assistencia.js — módulo extraído do script.js (vD.2, 2026-10-07).
// Script clássico, carregado pelo index.html DEPOIS do script.js e do eventos.js: compartilha o escopo
// global com eles (as funções e constantes abaixo continuam acessíveis pelo nome, como antes). As ações
// que o HTML pede deste módulo são registradas aqui mesmo, no fim do arquivo (registrarAcoes mescla).

// ---- ASSISTÊNCIA SOCIAL / AÇÃO DA FÉ (v5.9) ----
// Dado mais sensível do sistema — a permissão "assistencia_social" (nunca
// concedida por padrão) já esconde a aba inteira no menu; o backend
// (GestaoAssistenciaSocial) recusa de novo se alguém tentar chamar a rota
// direto sem ela — defesa em profundidade, mesmo padrão do resto do sistema.
const ROTULO_TIPO_BENEFICIO_AS = { CESTA_BASICA: "Cesta básica", AUXILIO_FINANCEIRO: "Auxílio financeiro", MEDICAMENTO: "Medicamento", OUTRO: "Outro" };

async function carregarOpcoesAssistenciaSocialAcao() {
  const selCong = document.getElementById("asCongregacao");
  if (selCong && !selCong.dataset.montado) {
    const congs = await listaDaApi(fetchProtegido(`${API_BASE}/catalogos/congregacoes`));
    selCong.innerHTML = congs.filter(c => c.ativa !== false).map(c => `<option value="${c.congregacaoId}">${escaparHtmlEbd(c.nome)}</option>`).join("");
    selCong.dataset.montado = "1";
  }
}

async function carregarFamiliasAssistenciaAcao() {
  const congregacaoId = document.getElementById("asCongregacao").value;
  if (!congregacaoId) return;
  const res = await fetchProtegido(`${API_BASE}/assistencia-social/familias?congregacaoId=${congregacaoId}`);
  const data = await res.json();
  const container = document.getElementById("painelFamiliasAssistencia");
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  container.innerHTML = data.familias.length
    ? `<table class="tabela-frequencia"><thead><tr><th>Id</th><th>Responsável</th><th>Contato</th></tr></thead><tbody>
        ${data.familias.map(f => `<tr><td>${f.familiaId}</td><td>${escaparHtmlEbd(f.responsavelNome)}</td><td>${escaparHtmlEbd(f.responsavelContato) || "-"}</td></tr>`).join("")}
      </tbody></table>`
    : "<p class='subtitle'>Nenhuma família cadastrada nesta congregação ainda.</p>";
}

async function criarFamiliaAssistenciaAcao() {
  const congregacaoId = document.getElementById("asCongregacao").value;
  const responsavelNome = document.getElementById("asFamResponsavelNome").value.trim();
  const responsavelCpf = document.getElementById("asFamResponsavelCpf").value.trim();
  const responsavelContato = document.getElementById("asFamResponsavelContato").value.trim();
  const endereco = document.getElementById("asFamEndereco").value.trim();
  const membroId = document.getElementById("asFamMembroId").value;
  const msg = document.getElementById("resultadoFamiliaAssistencia");
  if (!congregacaoId || !responsavelNome) { msg.textContent = "Escolha a congregação e informe o nome do responsável."; return; }
  const res = await fetchProtegido(`${API_BASE}/assistencia-social/familias`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ congregacaoId: Number(congregacaoId), responsavelNome, responsavelCpf: responsavelCpf || null, responsavelContato: responsavelContato || null, endereco: endereco || null, membroId: membroId ? Number(membroId) : null })
  });
  const data = await res.json();
  msg.textContent = "";
  if (data.sucesso === false) { mostrarToast(data.mensagem, "erro"); return; }
  mostrarToast(data.mensagem, "sucesso");
  document.getElementById("asFamResponsavelNome").value = "";
  document.getElementById("asFamResponsavelCpf").value = "";
  document.getElementById("asFamResponsavelContato").value = "";
  document.getElementById("asFamEndereco").value = "";
  document.getElementById("asFamMembroId").value = "";
  carregarFamiliasAssistenciaAcao();
}

async function carregarDetalheFamiliaAssistenciaAcao() {
  const familiaId = document.getElementById("asFamiliaIdDetalhe").value;
  const container = document.getElementById("painelDetalheFamiliaAssistencia");
  if (!familiaId) { container.innerHTML = ""; return; }
  const res = await fetchProtegido(`${API_BASE}/assistencia-social/familia?familiaId=${familiaId}`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }

  const cadastroAtivo = (data.cadastros || []).find(c => c.status === "ATIVO");
  const alertas = (data.recorrencia || []).filter(r => r.alertaRecorrencia);

  container.innerHTML = `
    <h4>${escaparHtmlEbd(data.familia.responsavelNome)}</h4>
    ${alertas.length ? `<p class="subtitle">⚠️ Recorrência: ${alertas.map(a => `${ROTULO_TIPO_BENEFICIO_AS[a.tipoBeneficio] || escaparHtmlEbd(a.tipoBeneficio)} há ${escaparHtmlEbd(a.mesesConsecutivos)} meses seguidos`).join("; ")}</p>` : ""}

    <h5>Cadastro socioeconômico (Art. 46)</h5>
    ${cadastroAtivo
      ? `<p>Núcleo: ${escaparHtmlEbd(cadastroAtivo.qtdPessoasNucleo)} pessoa(s) — Situação de moradia: ${escaparHtmlEbd(cadastroAtivo.situacaoMoradia)} — Base legal: ${escaparHtmlEbd(cadastroAtivo.baseLegal)}</p>
         <p class="subtitle">${escaparHtmlEbd(cadastroAtivo.observacoes) || ""}</p>
         <div class="barra-lista">
           <input type="number" id="asProfissionalMatricula_${cadastroAtivo.cadastroId}" placeholder="Matrícula do Assistente Social" style="max-width:220px;" />
           <select id="asParecerResultado_${cadastroAtivo.cadastroId}"><option value="APROVADO">Aprovado</option><option value="NEGADO">Negado</option><option value="PENDENTE_DOCUMENTACAO">Pendente de documentação</option></select>
           <input type="text" id="asParecerTexto_${cadastroAtivo.cadastroId}" placeholder="Parecer técnico" style="min-width:260px;" />
           <button class="btn-confirmar" style="width:auto;margin:0;" data-on-click="registrarParecerAssistenciaAcao" data-args-click="${argsAttr(cadastroAtivo.cadastroId, data.familia.familiaId)}">✍️ Registrar Parecer</button>
         </div>`
      : `<div class="barra-lista">
           <input type="number" id="asCadastroQtd_${data.familia.familiaId}" placeholder="Pessoas no núcleo" style="max-width:160px;" />
           <input type="number" id="asCadastroRenda_${data.familia.familiaId}" placeholder="Renda mensal (opcional)" style="max-width:180px;" />
           <select id="asCadastroSituacao_${data.familia.familiaId}"><option value="PROPRIA">Própria</option><option value="ALUGADA">Alugada</option><option value="CEDIDA">Cedida</option><option value="SITUACAO_RISCO">Situação de risco</option><option value="OUTRO">Outro</option></select>
           <input type="text" id="asCadastroObs_${data.familia.familiaId}" placeholder="Observações" style="min-width:220px;" />
           <button class="btn-confirmar" style="width:auto;margin:0;" data-on-click="abrirCadastroSocioeconomicoAcao" data-args-click="${argsAttr(data.familia.familiaId)}">📋 Abrir Cadastro (com consentimento)</button>
         </div>`}
    <p id="resultadoCadastroAssistencia_${data.familia.familiaId}" class="subtitle"></p>

    <h5>Pareceres</h5>
    <div id="painelPareceresAssistencia_${data.familia.familiaId}"></div>

    <h5>Entregas de benefício</h5>
    <div class="barra-lista">
      <select id="asEntregaTipo_${data.familia.familiaId}">${Object.entries(ROTULO_TIPO_BENEFICIO_AS).map(([v, r]) => `<option value="${v}">${r}</option>`).join("")}</select>
      <input type="date" id="asEntregaData_${data.familia.familiaId}" style="max-width:160px;" />
      <input type="number" id="asEntregaValor_${data.familia.familiaId}" placeholder="Valor (opcional)" style="max-width:150px;" />
      <input type="text" id="asEntregaDescricao_${data.familia.familiaId}" placeholder="Descrição (opcional)" style="min-width:200px;" />
      <button class="btn-confirmar" style="width:auto;margin:0;" data-on-click="registrarEntregaAssistenciaAcao" data-args-click="${argsAttr(data.familia.familiaId)}">➕ Registrar Entrega</button>
    </div>
    ${(data.entregas || []).length
      ? `<table class="tabela-frequencia"><thead><tr><th>Data</th><th>Tipo</th><th>Valor</th><th>Descrição</th></tr></thead><tbody>
          ${data.entregas.map(e => `<tr><td>${new Date(e.dataEntrega).toLocaleDateString("pt-BR")}</td><td>${ROTULO_TIPO_BENEFICIO_AS[e.tipoBeneficio] || escaparHtmlEbd(e.tipoBeneficio)}</td><td>${e.valor != null ? "R$ " + Number(e.valor).toFixed(2) : "-"}</td><td>${escaparHtmlEbd(e.descricao) || "-"}</td></tr>`).join("")}
        </tbody></table>`
      : "<p class='subtitle'>Nenhuma entrega registrada ainda.</p>"}
  `;
  if (cadastroAtivo) carregarPareceresAssistenciaAcao(cadastroAtivo.cadastroId, data.familia.familiaId);
}

async function abrirCadastroSocioeconomicoAcao(familiaId) {
  const qtd = document.getElementById(`asCadastroQtd_${familiaId}`).value;
  const renda = document.getElementById(`asCadastroRenda_${familiaId}`).value;
  const situacaoMoradia = document.getElementById(`asCadastroSituacao_${familiaId}`).value;
  const observacoes = document.getElementById(`asCadastroObs_${familiaId}`).value.trim();
  const msg = document.getElementById(`resultadoCadastroAssistencia_${familiaId}`);
  if (!qtd) { msg.textContent = "Informe a quantidade de pessoas do núcleo."; return; }
  if (!confirm("Confirma que o consentimento do titular/responsável (LGPD Art. 7º, I) foi obtido antes de registrar este cadastro socioeconômico?")) return;
  const res = await fetchProtegido(`${API_BASE}/assistencia-social/cadastro`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      familiaId, qtdPessoasNucleo: Number(qtd), rendaFamiliarMensal: renda ? Number(renda) : null,
      situacaoMoradia, observacoes: observacoes || null, baseLegal: "CONSENTIMENTO", consentimentoObtidoEm: new Date().toISOString()
    })
  });
  const data = await res.json();
  if (data.sucesso === false) { mostrarToast(data.mensagem, "erro"); return; }
  mostrarToast(data.mensagem, "sucesso");
  document.getElementById("asFamiliaIdDetalhe").value = familiaId;
  carregarDetalheFamiliaAssistenciaAcao();
}

async function registrarParecerAssistenciaAcao(cadastroId, familiaId) {
  const profissionalMembroId = document.getElementById(`asProfissionalMatricula_${cadastroId}`).value;
  const resultado = document.getElementById(`asParecerResultado_${cadastroId}`).value;
  const parecer = document.getElementById(`asParecerTexto_${cadastroId}`).value.trim();
  if (!profissionalMembroId || !parecer) { mostrarToast("Informe a matrícula do Assistente Social credenciado e o texto do parecer.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/assistencia-social/parecer`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cadastroId, profissionalMembroId: Number(profissionalMembroId), resultado, parecer })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  if (data.sucesso !== false) carregarPareceresAssistenciaAcao(cadastroId, familiaId);
}

async function carregarPareceresAssistenciaAcao(cadastroId, familiaId) {
  const res = await fetchProtegido(`${API_BASE}/assistencia-social/pareceres?cadastroId=${cadastroId}`);
  const data = await res.json();
  const container = document.getElementById(`painelPareceresAssistencia_${familiaId}`);
  if (!container) return;
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  container.innerHTML = data.pareceres.length
    ? `<table class="tabela-frequencia"><thead><tr><th>Data</th><th>Profissional</th><th>Resultado</th><th>Parecer</th></tr></thead><tbody>
        ${data.pareceres.map(p => `<tr><td>${new Date(p.assinadoEm).toLocaleDateString("pt-BR")}</td><td>${escaparHtmlEbd(p.profissionalNome)} (CRESS ${escaparHtmlEbd(p.numeroCredencial)})</td><td>${escaparHtmlEbd(p.resultado)}</td><td>${escaparHtmlEbd(p.parecer)}</td></tr>`).join("")}
      </tbody></table>`
    : "<p class='subtitle'>Nenhum parecer registrado ainda.</p>";
}

async function registrarEntregaAssistenciaAcao(familiaId) {
  const tipoBeneficio = document.getElementById(`asEntregaTipo_${familiaId}`).value;
  const dataEntrega = document.getElementById(`asEntregaData_${familiaId}`).value;
  const valor = document.getElementById(`asEntregaValor_${familiaId}`).value;
  const descricao = document.getElementById(`asEntregaDescricao_${familiaId}`).value.trim();
  if (!dataEntrega) { mostrarToast("Informe a data da entrega.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/assistencia-social/entrega`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ familiaId, tipoBeneficio, dataEntrega, valor: valor ? Number(valor) : null, descricao: descricao || null })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  if (data.sucesso !== false) carregarDetalheFamiliaAssistenciaAcao();
}

async function credenciarProfissionalAssistenciaAcao() {
  const membroId = document.getElementById("asCredenciarMatricula").value;
  const numeroCredencial = document.getElementById("asCredenciarNumero").value.trim();
  const msg = document.getElementById("resultadoCredenciamentoAssistencia");
  if (!membroId || !numeroCredencial) { msg.textContent = "Informe a matrícula e o número de registro (CRESS)."; return; }
  const res = await fetchProtegido(`${API_BASE}/assistencia-social/profissionais`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId: Number(membroId), numeroCredencial })
  });
  const data = await res.json();
  msg.textContent = "";
  if (data.sucesso === false) { mostrarToast(data.mensagem, "erro"); return; }
  mostrarToast(data.mensagem, "sucesso");
  document.getElementById("asCredenciarMatricula").value = "";
  document.getElementById("asCredenciarNumero").value = "";
  carregarProfissionaisAssistenciaAcao();
}

async function carregarProfissionaisAssistenciaAcao() {
  const res = await fetchProtegido(`${API_BASE}/assistencia-social/profissionais`);
  const data = await res.json();
  const container = document.getElementById("painelProfissionaisAssistencia");
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  container.innerHTML = data.profissionais.length
    ? `<table class="tabela-frequencia"><thead><tr><th>Nome</th><th>CRESS</th><th>Situação</th><th></th></tr></thead><tbody>
        ${data.profissionais.map(p => `<tr><td>${escaparHtmlEbd(p.membroNome)}</td><td>${escaparHtmlEbd(p.numeroCredencial)}</td><td>${p.ativo ? "✅ Ativo" : "⛔ Inativo"}</td>
          <td>${p.ativo ? `<button class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="descredenciarProfissionalAssistenciaAcao" data-args-click="${argsAttr(p.profissionalId)}">Descredenciar</button>` : ""}</td></tr>`).join("")}
      </tbody></table>`
    : "<p class='subtitle'>Nenhum Assistente Social credenciado ainda.</p>";
}

async function descredenciarProfissionalAssistenciaAcao(profissionalId) {
  const motivo = prompt("Motivo do descredenciamento:");
  if (!motivo) return;
  const res = await fetchProtegido(`${API_BASE}/assistencia-social/profissionais/descredenciar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profissionalId, motivo })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  carregarProfissionaisAssistenciaAcao();
}

async function carregarPrestacaoContasAssistenciaAcao() {
  const mes = document.getElementById("asPrestacaoMes").value;
  const ano = document.getElementById("asPrestacaoAno").value;
  const container = document.getElementById("painelPrestacaoContasAssistencia");
  if (!mes || !ano) { container.innerHTML = "<p class='subtitle'>Informe mês e ano.</p>"; return; }
  const res = await fetchProtegido(`${API_BASE}/assistencia-social/prestacao-contas?mes=${mes}&ano=${ano}`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (data.sucesso === false || data.departamentoEncontrado === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem) || "Erro ao carregar."}</p>`; return; }
  container.innerHTML = `
    <p><strong>Famílias atendidas no mês:</strong> ${escaparHtmlEbd(data.totalFamiliasAtendidas)} — <strong>Valor total das entregas:</strong> R$ ${Number(data.totalValorEntregas || 0).toFixed(2)}</p>
    <p>${Object.entries(data.totalEntregasPorTipo || {}).map(([tipo, qtd]) => `${ROTULO_TIPO_BENEFICIO_AS[tipo] || escaparHtmlEbd(tipo)}: ${escaparHtmlEbd(qtd)}`).join(" · ") || "Nenhuma entrega no período."}</p>
    <p class="subtitle">Fechamento departamental (v5.4, Ação da Fé — separado do caixa comum): ${data.fechamentoMensal ? `Total de despesas R$ ${Number(data.fechamentoMensal.TotalDespesas || 0).toFixed(2)}` : "mês ainda não fechado."}</p>
  `;
}

registrarAcoes({
  abrirCadastroSocioeconomicoAcao, carregarDetalheFamiliaAssistenciaAcao, carregarFamiliasAssistenciaAcao, carregarPrestacaoContasAssistenciaAcao,
  credenciarProfissionalAssistenciaAcao, criarFamiliaAssistenciaAcao, descredenciarProfissionalAssistenciaAcao, registrarEntregaAssistenciaAcao,
  registrarParecerAssistenciaAcao
});
