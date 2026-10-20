// cenarios-trava7b.js — o que a Trava de Revisão 7-B (20/10/2026) mudou na tela do check-in: a saúde do visitante só vai na etiqueta com a concordância do pai, da mãe ou do
// tutor(a) (a tela avisa ANTES de enviar, com a mesma regra do servidor) e a busca de criança vai por POST (o nome digitado não vai no endereço).
"use strict";

module.exports = function registrar(H) {
  const { cenario, confere, chamadas, texto, salaPronta, buscar, preencherOutraPessoa, enviarCheckin } = H;

  const visitanteComSaude = async (env, nome = "Visitante Saude") => {
    env.e("chkCiVisNome").value = nome; env.e("chkCiVisNasc").value = "2019-02-02";
    env.doc.digitar(env.e("chkCiVisSaude"), "Alergia a camarão");
    env.doc.marcar(env.e("chkCiVisConcordo"), true);
    env.doc.clicar(env.e("chkCiVisAdicionar")); await env.ocioso();
  };

  cenario("Trava 7-B: saúde do visitante trazido por quem não é pai, mãe nem tutor(a) — a tela recusa antes de enviar, foca o parentesco e diz o que fazer; com a mãe, vai", async () => {
    const { env } = await salaPronta();
    await visitanteComSaude(env);
    for (const par of ["TIO", "AVO", "AMIGO_FAMILIA", "OUTRO", "IRMAO", "PADRINHO"]) {
      preencherOutraPessoa(env, { nome: "Rosa Lima", par, tel: "11999990011" });
      env.limparRegistro(); await enviarCheckin(env);
      confere(chamadas(env, "POST checkin-infantil/checkin").length === 0, `${par}: nada é enviado ao servidor`);
      confere(/só pode ser autorizada pelo pai, pela mãe ou pelo tutor/.test(texto(env, "chkCiMsg")) && env.foco() === env.e("chkCiTrouxePar"), `${par}: a mensagem explica e o foco vai para o parentesco`);
    }
    env.e("chkCiTrouxePar").value = "MAE";
    env.limparRegistro(); await enviarCheckin(env);
    const p = chamadas(env, "POST checkin-infantil/checkin");
    confere(p.length === 1 && p[0].corpo.trouxe.parentesco === "MAE" && !!p[0].corpo.criancas[0].visitante.saude, "com a mãe, o check-in com a saúde vai ao servidor");
  });

  cenario("Trava 7-B: visitante SEM saúde trazido por um tio continua entrando normalmente (a regra é só da saúde)", async () => {
    const { env } = await salaPronta();
    env.e("chkCiVisNome").value = "Visitante Sem Saude"; env.e("chkCiVisNasc").value = "2019-03-03";
    env.doc.clicar(env.e("chkCiVisAdicionar")); await env.ocioso();
    preencherOutraPessoa(env, { nome: "Tio Beto", par: "TIO", tel: "11999990012" });
    env.limparRegistro(); await enviarCheckin(env);
    confere(chamadas(env, "POST checkin-infantil/checkin").length === 1, "o check-in sem saúde vai ao servidor");
  });

  cenario("Trava 7-B: a busca de criança vai por POST, com a sala e o termo no corpo, e nada do nome no endereço", async () => {
    const { env } = await salaPronta();
    env.limparRegistro();
    await buscar(env, "Pedro");
    const b = chamadas(env, "POST checkin-infantil/buscar");
    confere(b.length === 1 && b[0].corpo.q === "Pedro" && Object.keys(b[0].consulta).length === 0 && !/Pedro/.test(b[0].caminho), "POST buscar, termo no corpo, endereço limpo");
    confere(chamadas(env, "GET checkin-infantil/buscar").length === 0, "nenhuma busca por GET");
  });
};
