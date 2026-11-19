// conferir.js — o script da página PÚBLICA que o QR da carteirinha abre (conferir.html; FASE 10, passo 8). No molde de credencial.js: autônomo, sem cookie nem
// armazenamento local; a resposta da API entra sempre por textContent, nunca como HTML. O relógio do "selo vivo" anda de segundo em segundo: uma captura de tela
// parada não passa por carteirinha válida.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var SVG = "http://www.w3.org/2000/svg";
  var ICONES = { ok: "M5 12.5l4.5 4.5L19 7.5", pend: "M12 4l9 16H3zM12 10v4M12 17.5v.01", erro: "M6 6l12 12M18 6L6 18", info: "M12 8v.01M11 12h1v5h1", nada: "M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17v.01", espera: "M12 7v5l3 2" };

  function limpar(t) { return String(t || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
  function icone(tipo) {
    var s = document.createElementNS(SVG, "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "2.4"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
    var p = document.createElementNS(SVG, "path"); p.setAttribute("d", ICONES[tipo] || ICONES.nada); s.appendChild(p);
    return s;
  }
  function selo(tipo, titulo, texto) {
    $("selo").className = "selo " + tipo;
    $("seloIcone").textContent = "";
    $("seloIcone").appendChild(icone(tipo));
    $("seloTitulo").textContent = titulo;
    $("seloTexto").textContent = texto || "";
  }
  var relogio = null;
  function hora() { return new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Belem", hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
  function pessoa(r, cinza) {
    var f = $("foto");
    f.textContent = "";
    f.className = "foto" + (cinza ? " cinza" : "");
    if (r.foto && /^https:\/\//.test(r.foto)) {
      var img = document.createElement("img");
      img.alt = ""; img.referrerPolicy = "no-referrer"; img.src = r.foto;
      f.appendChild(img);
    } else {
      var b = document.createElement("strong"); b.textContent = r.iniciais || "";
      var s = document.createElement("small"); s.textContent = "foto";
      f.appendChild(b); f.appendChild(s);
    }
    $("nome").textContent = r.nome || "";
    $("pessoa").hidden = false;
    var tic = function () { $("relogio").textContent = "HOJE " + hora(); };
    tic();
    if (!relogio) relogio = setInterval(tic, 1000);
  }
  function dados(pares) {
    var dl = $("dados");
    dl.textContent = "";
    pares.forEach(function (p) {
      if (!p[1]) return;
      var d = document.createElement("div"), dt = document.createElement("dt"), dd = document.createElement("dd");
      dt.textContent = p[0]; dd.textContent = p[1];
      d.appendChild(dt); d.appendChild(dd); dl.appendChild(d);
    });
    dl.hidden = !dl.children.length;
  }
  function lugar(r) { return r.congregacao ? r.congregacao + (r.area ? " · " + r.area : "") : ""; }

  async function conferir(bruto) {
    var codigo = limpar(bruto);
    $("form").hidden = true; $("pessoa").hidden = true; $("dados").hidden = true;
    if (codigo.length !== 16) {
      selo("nada", "Código incompleto", "O código tem 16 letras e números. Aponte a câmera para o QR de novo ou digite o código.");
      $("form").hidden = false;
      return;
    }
    selo("espera", "Conferindo…", "");
    try {
      var res = await fetch("/api/conferencia/" + encodeURIComponent(codigo), { headers: { Accept: "application/json" }, cache: "no-store" });
      if (res.status === 429) { selo("nada", "Muitas leituras seguidas", "Aguarde um minuto e tente de novo."); return; }
      // erro do servidor (a página de erro do Azure vem em HTML): não é falta de internet de quem confere
      if (!/json/i.test(res.headers.get("content-type") || "") || (res.status >= 500)) { selo("nada", "O sistema não respondeu agora", "Tente de novo em instantes. Se continuar, avise a secretaria da Igreja."); return; }
      var r = await res.json();
      if (r.situacao === "EM_COMUNHAO") {
        selo("ok", "Membro em comunhão", r.exerceCargo === false ? (r.cargo || "Obreiro") + " · no momento não exerce o cargo" : (r.cargo || "Membro") + " · pode exercer o cargo e a função");
        pessoa(r, false);
        dados([["Cargo", r.cargo], ["Função", r.funcao], ["Congregação", lugar(r)], ["Membro desde", r.membroDesde]]);
      } else if (r.situacao === "CONGREGADO") {
        selo("info", "Congregado nesta Igreja", "Frequenta a Igreja; ainda não é membro.");
        pessoa(r, false);
        dados([["Congregação", lugar(r)]]);
      } else if (r.situacao === "DISCIPLINA") {
        selo("pend", "Em disciplina", "No momento não exerce cargo nem função. Dúvidas: a secretaria da congregação.");
        pessoa(r, false);
      } else if (r.situacao === "SAIU") {
        selo("erro", "Não é mais membro desta Igreja", "Esta carteirinha não vale mais.");
        pessoa(r, true);
      } else if (r.situacao === "NAO_ENCONTRADA") {
        selo("nada", "Carteirinha não encontrada", "Confira se o QR é desta Igreja. Se estiver certo, o documento pode não ser autêntico.");
        $("form").hidden = false;
      } else {
        selo("nada", "Não foi possível conferir agora", r.mensagem || "Tente de novo em instantes.");
      }
    } catch (e) {
      selo("nada", "Não foi possível conferir agora", "Sem conexão com o servidor. Tente de novo em instantes.");
    }
  }

  $("onde").textContent = location.host + " · sem precisar entrar";
  $("form").addEventListener("submit", function (ev) { ev.preventDefault(); conferir($("codigo").value); });
  var inicial = new URLSearchParams(location.search).get("c");
  if (inicial) conferir(inicial);
  else { selo("nada", "Conferir uma carteirinha", "Aponte a câmera para o QR da carteirinha ou digite o código."); $("form").hidden = false; }
})();
