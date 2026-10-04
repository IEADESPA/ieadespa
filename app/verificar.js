// verificar.js — script da página PÚBLICA de verificação de certificado (verificar.html). Saiu do <script> em linha da página: com a CSP forte
// (script-src 'self', sem 'unsafe-inline') o navegador não roda script escrito dentro do HTML. Mesmo código, sem mudança: autônomo, sem cookie nem
// armazenamento local; a resposta da API entra sempre por textContent, nunca como HTML.
(function () {
  var campo = document.getElementById("codigo"), botao = document.getElementById("botao"), saida = document.getElementById("resultado");

  function limpar(texto) { return String(texto || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
  function formatar(texto) { var c = limpar(texto); return c.length === 16 ? c.match(/.{4}/g).join("-") : c; }
  function dataBr(iso) { return iso ? String(iso).slice(8, 10) + "/" + String(iso).slice(5, 7) + "/" + String(iso).slice(0, 4) : ""; }

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

  function dadosDoCertificado(r) {
    var dados = [["Titular", r.nome], ["Certificado", r.titulo], ["Protocolo", r.protocolo], ["Emitido em", dataBr(r.dataEmissao)]];
    dados.push(["Validade", r.validoAte ? "até " + dataBr(r.validoAte) : "não vence"]);
    if (r.revogadoEm) dados.push(["Revogado em", dataBr(r.revogadoEm)]);
    return dados;
  }

  async function verificar(codigoBruto) {
    var codigo = limpar(codigoBruto);
    if (codigo.length !== 16) { mostrar("invalido", "Código incompleto", "O código tem 16 letras e números (formato XXXX-XXXX-XXXX-XXXX). Confira o que está impresso no certificado."); return; }
    campo.value = formatar(codigo);
    botao.disabled = true;
    saida.textContent = "Verificando…";
    try {
      var res = await fetch("/api/verificacao-certificado/" + encodeURIComponent(codigo), { headers: { Accept: "application/json" }, cache: "no-store" });
      var r = await res.json();
      if (r.situacao === "VALIDO") mostrar("valido", "✅ Certificado autêntico e válido", "Os dados abaixo conferem com o registro da IEADESPA.", dadosDoCertificado(r));
      else if (r.situacao === "VENCIDO") mostrar("vencido", "⏰ Certificado autêntico, mas com a validade vencida", "Foi emitido pela IEADESPA, porém a validade acabou.", dadosDoCertificado(r));
      else if (r.situacao === "REVOGADO") mostrar("invalido", "⛔ Certificado REVOGADO", "Este certificado foi emitido, mas foi revogado e não tem mais validade.", dadosDoCertificado(r));
      else if (r.situacao === "INTEGRIDADE_FALHOU") mostrar("invalido", "⚠️ Não foi possível confirmar este certificado", r.mensagem);
      else if (r.situacao === "NAO_ENCONTRADO") mostrar("invalido", "Certificado não encontrado", "Nenhum certificado com este código. Confira o código impresso — se estiver certo, o documento pode não ser autêntico.");
      else mostrar("invalido", "Não foi possível verificar agora", r.mensagem || "Tente novamente em instantes.");
    } catch (e) {
      mostrar("invalido", "Não foi possível verificar agora", "Sem conexão com o servidor. Tente novamente em instantes.");
    } finally {
      botao.disabled = false;
    }
  }

  document.getElementById("form").addEventListener("submit", function (ev) { ev.preventDefault(); verificar(campo.value); });
  var inicial = new URLSearchParams(location.search).get("c");
  if (inicial) verificar(inicial);
})();

