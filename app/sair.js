// app/sair.js (v7.12) — a página do link "não quero mais receber" do e-mail de comunicado (sair.html). Sem login e sem nada do aplicativo: lê o link (?t=), pergunta ao servidor
// o que ele é (GET só lê) e grava o "não" só no botão (POST). Tudo entra na página por textContent.
(function () {
  const el = (id) => document.getElementById(id);
  const msg = (texto) => { el("sairMsg").textContent = texto; };
  let token = "";
  try { token = new URLSearchParams(window.location.search).get("t") || ""; } catch (e) { token = ""; }
  if (!token || token.length > 400) { msg("Link incompleto. Abra de novo o link do e-mail."); return; }
  const url = "/api/comunicacao-sair";
  fetch(`${url}?t=${encodeURIComponent(token)}`, { headers: { Accept: "application/json" } })
    .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
      if (!ok || !d || !d.valido) { msg((d && d.mensagem) || "Este link não vale mais. Mude suas escolhas em Meu Painel → Comunicações."); return; }
      el("sairCategoria").textContent = String(d.rotulo || "");
      el("sairTexto").textContent = String(d.texto || "");
      if (d.jaSaiu) { msg("Você já não recebe esta categoria por e-mail. Nada a fazer."); return; }
      msg("");
      el("sairConteudo").hidden = false;
    })
    .catch(() => msg("Não foi possível falar com o servidor agora. Tente de novo em instantes."));
  el("sairBotao").addEventListener("click", () => {
    const botao = el("sairBotao");
    botao.disabled = true;
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: token }) })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok || !d || !d.sucesso) { botao.disabled = false; msg((d && d.mensagem) || "Não foi possível gravar agora. Tente de novo."); return; }
        el("sairConteudo").hidden = true;
        msg(`Pronto: você não recebe mais "${String(d.rotulo || "")}" por e-mail. A convocação oficial continua chegando, porque é obrigação do Estatuto.`);
      })
      .catch(() => { botao.disabled = false; msg("Não foi possível falar com o servidor agora. Tente de novo em instantes."); });
  });
})();
