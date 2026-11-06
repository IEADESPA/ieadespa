// modulos/endereco.js — v9.5: o endereço do membro em linhas (rua, número, complemento, bairro, cidade, UF e CEP), usado em dois lugares:
//   - o cadastro de Pessoas (prefixo "pessoaEnd"; a linha única é o campo antigo "pessoaEndereco");
//   - o Meus Dados (prefixo "meuEnd"; a linha única é "meuEndereco").
// O bairro sai de uma lista (o cadastro de bairros do nível geral, na pílula Território); se não está nela, a pessoa escreve o nome e ele entra na fila "bairros a
// cadastrar". Com alguma linha preenchida, a linha única é montada pelo servidor (o campo dela fica só para ler); sem nenhuma linha, a linha única continua valendo
// como antes (é o endereço antigo, ainda não passado para as linhas). Toda regra mora no servidor (api/shared/territorio.js).
const END_LINHA_UNICA = { pessoaEnd: "pessoaEndereco", meuEnd: "meuEndereco" };
const END_OUTRO = "OUTRO";
const END_CAMPOS_TEXTO = ["Logradouro", "Numero", "Complemento", "BairroTexto", "Cidade", "Cep"];
const END_UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
const endBairros = { pessoaEnd: [], meuEnd: [] };
// como a ficha abriu (revisão de 06/11/2026): se ela tinha linhas e a pessoa apagou todas, o endereço é apagado (e não volta pela linha única montada antes)
const endAberta = { pessoaEnd: { tinhaLinhas: false, linha: "" }, meuEnd: { tinhaLinhas: false, linha: "" } };
const endOpcaoForaDaLista = { pessoaEnd: null, meuEnd: null };
const endEl = (p, campo) => document.getElementById(`${p}${campo}`);
const endPrefixoValido = (p) => Object.prototype.hasOwnProperty.call(END_LINHA_UNICA, p);

// A lista dos bairros no seletor (o valor escolhido antes volta, se ainda existe).
function endPreencherBairros(p, bairros) {
  if (!endPrefixoValido(p)) return;
  endBairros[p] = Array.isArray(bairros) ? bairros : [];
  const sel = endEl(p, "Bairro");
  if (!sel) return;
  const antes = sel.value;
  const fora = endOpcaoForaDaLista[p];
  sel.innerHTML = `<option value="">— escolha o bairro —</option>${endBairros[p].map((b) => `<option value="${Number(b.bairroId)}">${escaparHtmlEbd(b.nome)} (${escaparHtmlEbd(b.cidade)}/${escaparHtmlEbd(b.uf)})</option>`).join("")}`
    + `<option value="${END_OUTRO}">O bairro não está na lista (escrever o nome)</option>`;
  // a lista chegou depois de a ficha abrir com um bairro desativado: a opção "fora da lista" volta (senão o bairro sumiria ao salvar)
  if (fora && !Array.from(sel.options).some((o) => o.value === fora.valor)) endInserirForaDaLista(p, sel, fora.valor, fora.nome);
  if (antes && Array.from(sel.options).some((o) => o.value === antes)) sel.value = antes;
  endPreencherUfs(p);
}
function endPreencherUfs(p) {
  const uf = endEl(p, "Uf");
  if (!uf || uf.options.length > 1) return;
  const ufAntes = uf.value;
  uf.innerHTML = `<option value="">— UF —</option>${END_UFS.map((u) => `<option value="${u}">${u}</option>`).join("")}`;
  if (ufAntes) uf.value = ufAntes;
}
function endInserirForaDaLista(p, sel, valor, nome) {
  const op = document.createElement("option");
  op.setAttribute("value", valor);
  op.textContent = `${nome || "Bairro"} (fora da lista)`;
  sel.insertBefore(op, sel.options[1] || null);
}

// Põe na tela o endereço guardado (as linhas e a linha única).
function endPreencher(p, partes, linhaUnica) {
  if (!endPrefixoValido(p)) return;
  const x = partes || {};
  endPreencherUfs(p);
  const pares = { Logradouro: x.logradouro, Numero: x.numero, Complemento: x.complemento, BairroTexto: x.bairroTexto, Cidade: x.cidade, Cep: x.cep };
  for (const [campo, v] of Object.entries(pares)) { const el = endEl(p, campo); if (el) el.value = v || ""; }
  const sel = endEl(p, "Bairro");
  if (sel) {
    // um bairro desativado depois não está mais na lista: ele aparece como opção só desta ficha (para não sumir sem a pessoa ver)
    endOpcaoForaDaLista[p] = null;
    if (x.bairroId && !Array.from(sel.options).some((o) => o.value === String(Number(x.bairroId)))) {
      endOpcaoForaDaLista[p] = { valor: String(Number(x.bairroId)), nome: x.bairroNome };
      endInserirForaDaLista(p, sel, String(Number(x.bairroId)), x.bairroNome);
    }
    sel.value = x.bairroId ? String(Number(x.bairroId)) : (x.bairroTexto ? END_OUTRO : "");
  }
  const uf = endEl(p, "Uf"); if (uf) uf.value = x.uf || "";
  const linha = document.getElementById(END_LINHA_UNICA[p]); if (linha) linha.value = linhaUnica || "";
  // o endereço antigo, só numa linha: vai para a Rua (e o que passar de 200 caracteres, para o complemento), para não se perder quando a pessoa escolher o bairro
  // (a linha única passaria a ser montada só com as linhas — revisão de 06/11/2026)
  const semLinhas = !END_CAMPOS_TEXTO.some((c) => pares[c] || (c === "BairroTexto" && x.bairroTexto)) && !x.bairroId && !x.uf;
  if (semLinhas && linhaUnica && String(linhaUnica).trim()) {
    const t = String(linhaUnica).trim();
    const rua = endEl(p, "Logradouro"); if (rua) rua.value = t.slice(0, 200);
    const comp = endEl(p, "Complemento"); if (comp && t.length > 200) comp.value = t.slice(200, 300);
  }
  endAberta[p] = { tinhaLinhas: endTemLinhas(p), linha: linha ? linha.value : "" };
  endAtualizarAcao(p);
}

function endLimpar(p) { endPreencher(p, null, ""); }

// Alguma linha preenchida? (a linha única não conta)
function endTemLinhas(p) {
  if (!endPrefixoValido(p)) return false;
  if (END_CAMPOS_TEXTO.some((c) => { const el = endEl(p, c); return el && el.value.trim(); })) return true;
  const sel = endEl(p, "Bairro"); const uf = endEl(p, "Uf");
  return !!((sel && sel.value) || (uf && uf.value));
}

// O que vai ao servidor: { enderecoPartes } quando há linhas; { endereco } (a linha única) quando não há.
function endLerParaEnviar(p) {
  if (!endPrefixoValido(p)) return {};
  const linha = document.getElementById(END_LINHA_UNICA[p]);
  if (!endTemLinhas(p)) {
    // tinha linhas e a pessoa apagou todas, sem escrever outra linha única: o endereço é apagado de propósito
    if (endAberta[p].tinhaLinhas && linha && linha.value === endAberta[p].linha) return { enderecoPartes: {} };
    return { endereco: linha ? (linha.value.trim() || null) : null };
  }
  const v = (c) => { const el = endEl(p, c); return el ? el.value.trim() : ""; };
  const bairro = v("Bairro");
  return {
    enderecoPartes: {
      logradouro: v("Logradouro") || null, numero: v("Numero") || null, complemento: v("Complemento") || null,
      bairroId: bairro && bairro !== END_OUTRO ? bairro : null, bairroTexto: bairro === END_OUTRO ? (v("BairroTexto") || null) : null,
      cidade: v("Cidade") || null, uf: v("Uf") || null, cep: v("Cep") || null
    }
  };
}

// A cada mudança: o bairro escrito só aparece com "não está na lista"; o bairro da lista preenche a cidade e a UF (e as trava); a linha única fica só para
// ler quando há linhas (o servidor a monta) e volta a ser editável quando todas as linhas estão vazias.
function endAtualizarAcao(p) {
  if (!endPrefixoValido(p)) return;
  const sel = endEl(p, "Bairro");
  const escolha = sel ? sel.value : "";
  const grupo = endEl(p, "BairroTextoGrupo"); if (grupo) grupo.style.display = escolha === END_OUTRO ? "" : "none";
  const cidade = endEl(p, "Cidade"), uf = endEl(p, "Uf");
  const doBairro = escolha && escolha !== END_OUTRO ? endBairros[p].find((b) => String(Number(b.bairroId)) === escolha) : null;
  if (doBairro) {
    if (cidade) cidade.value = doBairro.cidade;
    if (uf) uf.value = doBairro.uf;
  }
  if (cidade) cidade.readOnly = !!doBairro;
  if (uf) uf.disabled = !!doBairro;
  const linha = document.getElementById(END_LINHA_UNICA[p]);
  const comLinhas = endTemLinhas(p);
  if (linha) linha.readOnly = comLinhas;
  const dica = endEl(p, "Dica");
  if (dica) {
    dica.textContent = comLinhas
      ? "A linha única abaixo é montada pelo sistema com as linhas ao salvar."
      : (linha && linha.value.trim() ? "Com as linhas vazias, a linha única abaixo vale como está (ou, se ela é a de antes, o endereço é apagado ao salvar)." : "");
  }
}

// as UFs já na abertura da página (a lista dos bairros pode chegar depois da ficha)
for (const p of Object.keys(END_LINHA_UNICA)) endPreencherUfs(p);

registrarAcoes({ endAtualizarAcao });
