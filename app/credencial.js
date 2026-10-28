// credencial.js — script da página PÚBLICA que o QR da credencial abre (credencial.html; v8.4, Regimento Art. 76 §1º). Mesmo molde de verificar.js: autônomo, sem
// cookie nem armazenamento local; a resposta da API entra sempre por textContent, nunca como HTML.
(function () {
  var campo = document.getElementById("codigo"), botao = document.getElementById("botao"), saida = document.getElementById("resultado");

  function limpar(texto) { return String(texto || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
  function formatar(texto) { var c = limpar(texto); return c.length === 16 ? c.match(/.{4}/g).join("-") : c; }
  function agora(iso) {
    var d = iso ? new Date(iso) : new Date();
    return d.toLocaleString("pt-BR", { timeZone: "America/Belem", dateStyle: "short", timeStyle: "short" });
  }

  function el(tag, classe, texto) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  function mostrar(classe, titulo, mensagem, dados) {
    saida.textContent = "";
    var caixa = el("div", "selo " + classe);
    caixa.appendChild(el("h2", "", titulo));
    if (mensagem) caixa.appendChild(el("p", "", mensagem));
    if (dados && dados.length) {
      var lista = el("dl");
      dados.forEach(function (par) { lista.appendChild(el("dt", "", par[0])); lista.appendChild(el("dd", "", par[1])); });
      caixa.appendChild(lista);
    }
    saida.appendChild(caixa);
  }

  function dadosDaCredencial(r) {
    var dados = [["Nome", r.nome], ["Categoria", r.categoria]];
    if (r.congregacao) dados.push(["Congregação", r.congregacao]);
    if (r.funcao) dados.push(["Funções ministeriais", r.funcao === "HABILITADO" ? "Habilitado(a) — pode oficiar" : "Obreiro(a) inativo(a) — não pode oficiar no momento"]);
    if (r.via) dados.push(["Via", String(r.via)]);
    dados.push(["Consultado em", agora(r.consultadoEm)]);
    return dados;
  }

  async function conferir(codigoBruto) {
    var codigo = limpar(codigoBruto);
    if (codigo.length !== 16) { mostrar("invalido", "Código incompleto", "O código tem 16 letras e números (formato XXXX-XXXX-XXXX-XXXX). Confira o que está impresso na credencial."); return; }
    campo.value = formatar(codigo);
    botao.disabled = true;
    saida.textContent = "Consultando…";
    try {
      var res = await fetch("/api/verificacao-credencial/" + encodeURIComponent(codigo), { headers: { Accept: "application/json" }, cache: "no-store" });
      var r = await res.json();
      if (r.situacao === "ATIVA" && r.funcao !== "INATIVO") mostrar("valido", "✅ Credencial ativa", "Membro da IEADESPA em plena comunhão, conforme o registro da Sede agora.", dadosDaCredencial(r));
      else if (r.situacao === "ATIVA") mostrar("vencido", "⚠️ Credencial ativa — obreiro(a) inativo(a)", "É membro em comunhão, mas no momento não está habilitado(a) para oficiar atos (Regimento, Art. 69 §3º).", dadosDaCredencial(r));
      else if (r.situacao === "INATIVA") mostrar("invalido", "⛔ Credencial INATIVA", "Esta credencial é da IEADESPA, mas a pessoa não está ativa no momento.", dadosDaCredencial(r));
      else if (r.situacao === "SUBSTITUIDA") mostrar("invalido", "⛔ Credencial substituída", "Esta via foi substituída por uma nova e não vale mais. Peça a credencial atual.", [["Nome", r.nome]]);
      else if (r.situacao === "CANCELADA") mostrar("invalido", "⛔ Credencial cancelada", "Esta credencial foi cancelada pela Secretaria Geral e não tem validade.", [["Nome", r.nome]]);
      else if (r.situacao === "NAO_ENCONTRADA") mostrar("invalido", "Credencial não encontrada", "Nenhuma credencial com este código. Confira o código impresso — se estiver certo, o documento pode não ser autêntico.");
      else mostrar("invalido", "Não foi possível consultar agora", r.mensagem || "Tente novamente em instantes.");
    } catch (e) {
      mostrar("invalido", "Não foi possível consultar agora", "Sem conexão com o servidor. Tente novamente em instantes.");
    } finally {
      botao.disabled = false;
    }
  }

  document.getElementById("form").addEventListener("submit", function (ev) { ev.preventDefault(); conferir(campo.value); });
  var inicial = new URLSearchParams(location.search).get("c");
  if (inicial) conferir(inicial);
})();
