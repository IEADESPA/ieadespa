// Bateria de verificação da inscrição em evento no servidor (06/10/2026).
// Cria um evento de teste só pela API (título "TESTE …", ignorado pela versão do conteúdo),
// exercita /api/criar-inscricao e /api/status-inscricao, e apaga tudo no fim.
const { ambiente, Verificador, esperar } = require("./comum");

async function main() {
  const { SITE, dx, site } = ambiente();
  const v = new Verificador("eventos");
  const tel = () => "9496" + String(Math.floor(Math.random() * 1e7)).padStart(7, "0");

  const campos = ((await dx("GET", "/fields/eventos")).data || []).map((f) => f.field);
  const base = { title: "TESTE DE INSCRIÇÃO (apagar)", slug: "teste-inscricao-" + Date.now(), aceita_inscricao: true, inscricoes_encerradas: false, inscricoes_ate: "2026-12-31", vagas_limite: 2, requer_aprovacao: false, permite_inscricao_grupo: true, faixas_valor: [{ descricao: "Inteira", valor: 50 }, { descricao: "Meia", valor: 25 }] };
  if (campos.includes("status")) base.status = "draft";
  if (campos.includes("event_date")) base.event_date = "2026-12-20";
  const ev = await dx("POST", "/items/eventos", base);
  if (!ev.ok) { console.log("não criou evento:", ev.status, ev.erro); process.exit(1); }
  const E = ev.data.id; console.log(`[${SITE}] evento de teste: ${E}`);
  let cupomId = null;
  try {
    const cup = await dx("POST", "/items/cupons_desconto", { evento: E, codigo: "TESTE10", tipo: "fixo", valor: 10, limite_usos: 1, usos: 0, ativo: true });
    cupomId = cup.data?.id; v.ok("cupom de teste criado", cup.ok, cup.erro || "");
    let r = await site("GET", `/api/status-inscricao/${E}`); v.ok("status aberto com vagas", r.status === 200 && r.j.aberto === true && r.j.vagasRestantes === 2, `${r.ms} ms`);
    const t1 = tel();
    r = await site("POST", "/api/criar-inscricao", { eventoId: E, nomes: ["Teste Um"], telefone: t1, email: "Teste@Exemplo.com", valorFaixa: 50, cupom: "teste10", respostas: [] });
    v.ok("inscrição simples criada", r.status === 200 && r.j.inscricoes?.length === 1 && r.j.inscricoes[0].codigo?.length === 6, `${r.ms} ms`);
    v.ok("cupom aplicado e valor com desconto", r.j.cupom?.aplicado === true && Number(r.j.inscricoes?.[0]?.valor) === 40);
    const i1 = r.j.inscricoes?.[0];
    const grav = (await dx("GET", `/items/inscricoes_eventos/${i1.id}?fields=telefone,telefone_chave,email,aguardando_vaga`)).data;
    v.ok("telefone protegido (scrypt + chave) e e-mail minúsculo", /:/.test(grav?.telefone || "") && (grav?.telefone_chave || "").length === 64 && grav?.email === "teste@exemplo.com");
    const cupomDepois = (await dx("GET", `/items/cupons_desconto/${cupomId}?fields=usos`)).data; v.ok("contador de usos do cupom = 1", Number(cupomDepois?.usos) === 1);
    r = await site("POST", "/api/criar-inscricao", { eventoId: E, nomes: ["Teste Dois"], telefone: tel(), valorFaixa: 25, cupom: "TESTE10" });
    v.ok("segunda: cupom esgotado, sem desconto", r.status === 200 && r.j.cupom?.aplicado === false && Number(r.j.inscricoes?.[0]?.valor) === 25, `${r.ms} ms`);
    r = await site("POST", "/api/criar-inscricao", { eventoId: E, nomes: ["Teste Tres"], telefone: tel(), valorFaixa: 25 });
    v.ok("terceira: lista de espera (2 vagas)", r.status === 200 && r.j.inscricoes?.[0]?.aguardandoVaga === true, `${r.ms} ms`);
    const tg = tel();
    r = await site("POST", "/api/criar-inscricao", { eventoId: E, nomes: ["Grupo A", "Grupo B"], telefone: tg, respostas: [{ pergunta: 999999, valor: "x" }] });
    v.ok("grupo de 2 criado", r.status === 200 && r.j.inscricoes?.length === 2 && r.j.inscricoes.every((i) => i.aguardandoVaga === true), `${r.ms} ms`);
    r = await site("POST", "/api/criar-inscricao", { eventoId: E, nomes: ["Teste Faixa"], telefone: tel(), valorFaixa: 99 });
    v.ok("faixa de valor inválida → 400", r.status === 400, `${r.ms} ms`);
    r = await site("POST", "/api/criar-inscricao", { eventoId: E, nomes: Array.from({ length: 9 }, (_, i) => "Muitos " + i), telefone: tg });
    v.ok("11 inscrições no mesmo telefone → 400", r.status === 400, `${r.ms} ms`);
    await dx("PATCH", `/items/eventos/${E}`, { permite_inscricao_grupo: false });
    await esperar(11000);
    r = await site("POST", "/api/criar-inscricao", { eventoId: E, nomes: ["X", "Y"], telefone: tel() });
    v.ok("grupo em evento sem grupo → 400 (cache 10 s)", r.status === 400, `${r.ms} ms`);
    await dx("PATCH", `/items/eventos/${E}`, { inscricoes_encerradas: true });
    await esperar(11000);
    r = await site("POST", "/api/criar-inscricao", { eventoId: E, nomes: ["Teste Fim"], telefone: tel() });
    v.ok("inscrições encerradas → 403", r.status === 403 && r.j.motivo === "inativo", `${r.ms} ms`);
    await dx("PATCH", `/items/eventos/${E}`, { inscricoes_encerradas: false, inscricoes_ate: "2026-10-05" });
    await esperar(11000);
    r = await site("POST", "/api/criar-inscricao", { eventoId: E, nomes: ["Teste Prazo"], telefone: tel() });
    v.ok("prazo vencido → 403", r.status === 403 && r.j.motivo === "prazo", `${r.ms} ms`);
    r = await site("POST", "/api/verificar-inscricao", { evento: E, modo: "codigo", codigo: i1.codigo, telefone: `(94) ${t1.slice(2, 7)}-${t1.slice(7)}` });
    v.ok("verificar-inscricao acha por código + telefone", r.status === 200 && r.j.encontrado === true && r.j.id === i1.id, `${r.ms} ms`);
  } finally {
    const ins = (await dx("GET", `/items/inscricoes_eventos?filter[evento][_eq]=${E}&fields=id&limit=-1`)).data || [];
    const ids = ins.map((x) => x.id);
    if (ids.length) { const resp = (await dx("GET", `/items/respostas_inscricao?filter[inscricao][_in]=${ids.join(",")}&fields=id&limit=-1`)).data || []; if (resp.length) await dx("DELETE", "/items/respostas_inscricao", resp.map((x) => x.id)); await dx("DELETE", "/items/inscricoes_eventos", ids); }
    if (cupomId) await dx("DELETE", `/items/cupons_desconto/${cupomId}`);
    const del = await dx("DELETE", `/items/eventos/${E}`);
    console.log("limpeza: inscrições", ids.length, "| evento apagado:", del.ok, del.erro || "");
    v.fim();
  }
}

main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
