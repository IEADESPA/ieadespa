// mapa-territorial.js — v9.5: a página do mapa do Google (mapa-territorial.html), presa numa moldura com sandbox dentro do sistema (modulos/territorio.js).
// Conversa só com a moldura-mãe por mensagens:
//   recebe  { fonte: "ieadespa-sistema", tipo: "desenhar", chave, modo: "ver" | "marcar", bairros[], unidades[], raioKm, ponto }
//   devolve { fonte: "ieadespa-mapa", tipo: "pronto" }  ao abrir;  { tipo: "clique", lat, lng }  no modo marcar;  { tipo: "erro", motivo }  se o Google falhar.
// Só aceita mensagem da própria moldura-mãe (window.parent) e só uma vez o "desenhar" com a chave (a chave carrega o script do Google uma vez só).
(function () {
  "use strict";
  var mae = window.parent;
  var dados = null;
  var mapa = null;
  var marcador = null;
  var carregou = false;
  var aviso = document.getElementById("aviso");
  // a origem do sistema (o endereço desta página: a moldura é sempre do mesmo site); só ela fala com esta página e só a ela esta página responde
  var ORIGEM = /^https?:\/\//.test(location.origin) ? location.origin : (location.protocol + "//" + location.host);
  var PRAZO_MS = 15000;

  function avisar(texto) { if (!aviso) return; aviso.textContent = texto || ""; aviso.hidden = !texto; }
  function enviar(msg) { msg.fonte = "ieadespa-mapa"; try { mae.postMessage(msg, ORIGEM); } catch (e) { /* a mãe saiu */ } }
  function numero(v) { return typeof v === "number" && isFinite(v) ? v : null; }
  function pontoValido(p) { return p && numero(p.lat) !== null && numero(p.lng) !== null && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180; }

  // o Google chama esta função quando a chave é recusada (endereço não autorizado, cota, chave errada)
  window.gm_authFailure = function () {
    avisar("O Google recusou a chave do mapa. Use \"Lista e desenho\".");
    enviar({ tipo: "erro", motivo: "chave" });
  };

  window.terMapaPronto = function () {
    try { desenhar(); } catch (e) { avisar("Não foi possível desenhar o mapa."); enviar({ tipo: "erro", motivo: "desenho" }); }
  };

  function carregarGoogle(chave) {
    if (carregou) { if (window.google && window.google.maps) desenhar(); return; }
    carregou = true;
    if (typeof chave !== "string" || !/^[A-Za-z0-9_-]{20,80}$/.test(chave)) { avisar("Sem a chave do mapa."); enviar({ tipo: "erro", motivo: "sem-chave" }); return; }
    var s = document.createElement("script");
    s.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(chave) + "&callback=terMapaPronto&loading=async&language=pt-BR&region=BR&v=weekly";
    s.async = true;
    s.onerror = function () { avisar("Não foi possível falar com o Google agora."); enviar({ tipo: "erro", motivo: "rede" }); };
    document.head.appendChild(s);
    // o Google não chamou nem o "pronto" nem o "recusou" no prazo: avisa a moldura-mãe (ela volta à lista e desenho)
    setTimeout(function () { if (!mapa) { avisar("O mapa do Google não respondeu."); enviar({ tipo: "erro", motivo: "tempo" }); } }, PRAZO_MS);
  }

  function limites(pontos) {
    var b = new google.maps.LatLngBounds();
    for (var i = 0; i < pontos.length; i++) b.extend({ lat: pontos[i].lat, lng: pontos[i].lng });
    return b;
  }

  function desenhar() {
    if (!dados || !window.google || !window.google.maps) return;
    var g = window.google.maps;
    var bairros = (Array.isArray(dados.bairros) ? dados.bairros : []).filter(pontoValido);
    var unidades = (Array.isArray(dados.unidades) ? dados.unidades : []).filter(pontoValido);
    var todos = bairros.concat(unidades);
    if (pontoValido(dados.ponto)) todos.push(dados.ponto);
    var centro = todos.length ? todos[0] : { lat: -6.0675, lng: -49.9025 };   // Parauapebas, quando não há ponto nenhum
    mapa = new g.Map(document.getElementById("mapa"), { center: { lat: centro.lat, lng: centro.lng }, zoom: 13, clickableIcons: false, streetViewControl: false, mapTypeControl: false });
    if (todos.length > 1) mapa.fitBounds(limites(todos), 40);
    var maior = 1;
    for (var i = 0; i < bairros.length; i++) maior = Math.max(maior, Number(bairros[i].membros) || 0);
    var info = new g.InfoWindow();
    bairros.forEach(function (b) {
      var n = Number(b.membros) || 0;
      var circulo = new g.Circle({
        map: mapa, center: { lat: b.lat, lng: b.lng }, radius: 120 + 480 * Math.sqrt(n / maior),
        strokeColor: b.descoberto ? "#b3261e" : "#1b5e20", strokeOpacity: 0.9, strokeWeight: 1,
        fillColor: b.descoberto ? "#e57373" : "#81c784", fillOpacity: n ? 0.45 : 0.15, clickable: dados.modo !== "marcar"
      });
      circulo.addListener("click", function () {
        var texto = document.createElement("div");
        texto.textContent = b.nome + ": " + n + " membro(s)" + (b.distanciaKm != null ? " — " + String(b.distanciaKm).replace(".", ",") + " km da unidade mais perto" : "") + (b.descoberto ? " (descoberto)" : "");
        info.setContent(texto);
        info.setPosition({ lat: b.lat, lng: b.lng });
        info.open({ map: mapa });
      });
    });
    unidades.forEach(function (u) {
      new g.Marker({ map: mapa, position: { lat: u.lat, lng: u.lng }, title: (u.tipo === "EXTENSAO" ? "Extensão: " : "Congregação: ") + u.nome, label: u.tipo === "EXTENSAO" ? "E" : "C", clickable: false });
    });
    if (dados.modo === "marcar") {
      if (pontoValido(dados.ponto)) marcador = new g.Marker({ map: mapa, position: { lat: dados.ponto.lat, lng: dados.ponto.lng } });
      mapa.addListener("click", function (ev) {
        if (!ev || !ev.latLng) return;
        var p = { lat: Math.round(ev.latLng.lat() * 1e6) / 1e6, lng: Math.round(ev.latLng.lng() * 1e6) / 1e6 };
        if (marcador) marcador.setPosition(p); else marcador = new g.Marker({ map: mapa, position: p });
        enviar({ tipo: "clique", lat: p.lat, lng: p.lng });
      });
      avisar("Clique no mapa para marcar o ponto.");
    } else avisar("");
    enviar({ tipo: "desenhado" });
  }

  window.addEventListener("message", function (ev) {
    if (ev.source !== mae || ev.origin !== ORIGEM) return;
    var m = ev.data;
    if (!m || typeof m !== "object" || m.fonte !== "ieadespa-sistema" || m.tipo !== "desenhar") return;
    dados = { modo: m.modo === "marcar" ? "marcar" : "ver", bairros: m.bairros, unidades: m.unidades, ponto: m.ponto || null };
    carregarGoogle(m.chave);
  });

  if (mae === window) avisar("Esta página só funciona dentro do sistema (aba Expansão → Território).");
  else enviar({ tipo: "pronto" });
})();
