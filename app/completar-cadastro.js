// completar-cadastro.js — o script da página PÚBLICA em que a própria pessoa completa o pré-cadastro pelo link do e-mail (completar-cadastro.html; FASE 10, as
// sobras). No molde de conferir.js: autônomo, sem cookie nem armazenamento local; a resposta da API entra sempre por textContent, nunca como HTML.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var codigo = new URLSearchParams(location.search).get("c") || "";
  var falta = [];
  var CAIXAS = { cpf: "cpfCaixa", dataNascimento: "nascCaixa", sexo: "sexoCaixa", estadoCivil: "ecCaixa" };
  var ROTULO = { cpf: "o CPF", dataNascimento: "a data de nascimento", sexo: "o sexo", estadoCivil: "o estado civil" };

  function aviso(titulo, texto) { $("titulo").textContent = titulo; $("texto").textContent = texto || ""; }
  function lista(itens) {
    var r = itens.map(function (k) { return ROTULO[k] || k; });
    return r.length > 1 ? r.slice(0, -1).join(", ") + " e " + r[r.length - 1] : r[0] || "";
  }
  async function lerJson(res) {
    if (!/json/i.test(res.headers.get("content-type") || "")) return null;
    try { return await res.json(); } catch (e) { return null; }
  }

  async function abrir() {
    if (!/^[A-Za-z0-9_-]{32}$/.test(codigo)) { aviso("Este link não vale", "Confira se o endereço do e-mail foi copiado inteiro, ou fale com a secretaria da sua congregação."); return; }
    try {
      var res = await fetch("/api/completar-cadastro/" + encodeURIComponent(codigo), { headers: { Accept: "application/json" }, cache: "no-store" });
      var r = await lerJson(res);
      if (res.status === 429) { aviso("Muitas tentativas seguidas", "Aguarde um minuto e abra o link de novo."); return; }
      if (!r || !r.sucesso) { aviso("Este link não vale mais", (r && r.mensagem) || "Tente de novo em instantes."); return; }
      falta = r.falta || [];
      aviso("Graça e paz, " + (r.nome || "") + "!", "Para terminar o seu cadastro na Igreja, falta " + lista(falta) + ".");
      falta.forEach(function (k) { if (CAIXAS[k]) $(CAIXAS[k]).hidden = false; });
      $("nasc").max = new Date().toISOString().slice(0, 10);
      $("form").hidden = false;
    } catch (e) {
      aviso("Não foi possível abrir agora", "Confira a internet e tente de novo.");
    }
  }

  $("cpf").addEventListener("input", function () {
    var d = this.value.replace(/\D/g, "").slice(0, 11);
    this.value = d.length > 9 ? d.slice(0, 3) + "." + d.slice(3, 6) + "." + d.slice(6, 9) + "-" + d.slice(9) : d.length > 6 ? d.slice(0, 3) + "." + d.slice(3, 6) + "." + d.slice(6) : d.length > 3 ? d.slice(0, 3) + "." + d.slice(3) : d;
  });

  $("form").addEventListener("submit", async function (ev) {
    ev.preventDefault();
    var corpo = {};
    if (falta.indexOf("cpf") >= 0) corpo.cpf = $("cpf").value.replace(/\D/g, "");
    if (falta.indexOf("dataNascimento") >= 0) corpo.dataNascimento = $("nasc").value;
    if (falta.indexOf("sexo") >= 0) { var s = document.querySelector("input[name=sexo]:checked"); corpo.sexo = s ? s.value : ""; }
    if (falta.indexOf("estadoCivil") >= 0) corpo.estadoCivil = $("ec").value;
    $("erro").textContent = "";
    $("botao").disabled = true;
    try {
      var res = await fetch("/api/completar-cadastro/" + encodeURIComponent(codigo), { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(corpo), cache: "no-store" });
      var r = await lerJson(res);
      if (res.status === 429) { $("erro").textContent = "Muitas tentativas seguidas: aguarde um minuto."; return; }
      if (!r) { $("erro").textContent = "O sistema não respondeu agora. Tente de novo em instantes."; return; }
      if (r.sucesso) { $("form").hidden = true; aviso("Pronto, recebemos!", r.mensagem || ""); return; }
      if (res.status === 404) { $("form").hidden = true; aviso("Este link não vale mais", r.mensagem || ""); return; }
      $("erro").textContent = r.mensagem || "Confira o que foi preenchido.";
    } catch (e) {
      $("erro").textContent = "Sem conexão com o servidor. Tente de novo em instantes.";
    } finally {
      $("botao").disabled = false;
    }
  });

  abrir();
})();
