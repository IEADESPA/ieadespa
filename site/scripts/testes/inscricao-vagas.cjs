// Bateria da TRAVA DE VAGAS E DE CUPOM das inscrições em evento (16/10/2026), pelo HTTP, contra um site de verdade (pré-visualização, produção, ou o emulador `swa-local.cjs` com um
// Directus de teste). Cria um evento descartável ("TESTE VAGAS …", rascunho) com 5 vagas e um cupom de 3 usos, dispara 16 inscrições AO MESMO TEMPO e confere NO BANCO: exatamente 5
// confirmadas e 11 na lista de espera (antes da trava as 16 saíam confirmadas), exatamente 3 descontos, uma senha por inscrição; depois um grupo que já nasce na lista de espera, o
// cupom esgotado e o contador `usos` do cupom. Apaga tudo no fim.
//
// Variáveis: SITE_URL (padrão: produção), DIRECTUS_URL, DIRECTUS_ADMIN_TOKEN, TELEFONE_CHAVE_SEGREDO (ver README desta pasta).
// Pré-requisito: o esquema da trava no Directus (`site/scripts/directus-vagas-esquema.mjs`); sem ele a bateria diz isso e para.
// Cuidado com o limitador por IP da função (40 inscrições em 5 min por IP, junto com a bateria `eventos.cjs`): esta faz 21 chamadas de criar inscrição.
const { ambiente, Verificador } = require("./comum.cjs");

async function main() {
  const { SITE, dx, site } = ambiente();
  const v = new Verificador("vagas e cupom dos eventos");
  const tel = () => "9495" + String(Math.floor(Math.random() * 1e7)).padStart(7, "0");
  const VAGAS = 5;
  const USOS = 3;
  const SIMULTANEAS = 16;

  const esquema = await dx("GET", "/collections/evento_controle");
  v.ok("o Directus tem o livro de senhas dos eventos (rode site/scripts/directus-vagas-esquema.mjs se não)", esquema.ok, esquema.erro || "");
  if (!esquema.ok) { v.fim(); return; }

  const campos = ((await dx("GET", "/fields/eventos")).data || []).map((f) => f.field);
  const base = { title: "TESTE VAGAS (apagar)", slug: "teste-vagas-" + Date.now(), aceita_inscricao: true, inscricoes_encerradas: false, inscricoes_ate: "2030-12-31", vagas_limite: VAGAS, requer_aprovacao: false, permite_inscricao_grupo: true };
  if (campos.includes("status")) base.status = "draft";
  if (campos.includes("event_date")) base.event_date = "2030-12-20";
  const ev = await dx("POST", "/items/eventos", base);
  if (!ev.ok) { console.log("não criou evento:", ev.status, ev.erro); process.exit(1); }
  const E = ev.data.id;
  console.log(`[${SITE}] evento de teste: ${E} (${VAGAS} vagas, cupom de ${USOS} usos, ${SIMULTANEAS} inscrições ao mesmo tempo)`);
  let cupomId = null;
  try {
    const cup = await dx("POST", "/items/cupons_desconto", { evento: E, codigo: "TRAVA10", tipo: "fixo", valor: 10, limite_usos: USOS, usos: 0, ativo: true });
    cupomId = cup.data?.id;
    v.ok("cupom de teste criado", cup.ok, cup.erro || "");

    const inicio = Date.now();
    const rs = await Promise.all(Array.from({ length: SIMULTANEAS }, (_, i) => site("POST", "/api/criar-inscricao", { eventoId: E, nomes: [`Corrida ${i}`], telefone: tel(), valorFaixa: null, cupom: "trava10" })));
    const ms = Date.now() - inicio;
    const porStatus = {};
    for (const r of rs) porStatus[r.status] = (porStatus[r.status] || 0) + 1;
    console.log(`  ${SIMULTANEAS} ao mesmo tempo em ${ms} ms | respostas ${JSON.stringify(porStatus)}`);
    const aceitas = rs.filter((r) => r.status === 200);
    const ocupadas = rs.filter((r) => r.status === 503);
    v.ok("toda inscrição tem resposta clara: aceita (200) ou 'tente de novo' (503)", aceitas.length + ocupadas.length === SIMULTANEAS, JSON.stringify(porStatus));
    v.ok("a maioria é aceita (o 503 é exceção, não regra)", aceitas.length >= SIMULTANEAS - 2, `${aceitas.length} de ${SIMULTANEAS}`);

    const lista = (await dx("GET", `/items/inscricoes_eventos?filter[evento][_eq]=${E}&fields=id,aguardando_vaga,cupom_usado,valor&limit=-1`)).data || [];
    const confirmadas = lista.filter((i) => !i.aguardando_vaga).length;
    const comCupom = lista.filter((i) => i.cupom_usado === "TRAVA10").length;
    v.ok("aceitas = gravadas (nenhuma aceita sem gravar, nenhuma gravada sem resposta)", lista.length === aceitas.length, `${lista.length} no banco, ${aceitas.length} aceitas`);
    // com 16 pedidos e 5 vagas, mesmo que 1 ou 2 recebam o 503 sobram muito mais que 5: as vagas têm de estar exatamente cheias
    v.ok(`EXATAMENTE ${VAGAS} confirmadas (antes da trava as ${SIMULTANEAS} saíam confirmadas)`, confirmadas === VAGAS, `${confirmadas} confirmadas, ${lista.length - confirmadas} na lista de espera`);
    v.ok(`EXATAMENTE ${USOS} descontos do cupom`, comCupom === USOS, `${comCupom} com cupom`);
    v.ok("quem levou o cupom está com o desconto (valor 0: sem faixa de valor, o desconto não deixa negativo)", lista.filter((i) => i.cupom_usado).every((i) => Number(i.valor) === 0));
    const respostasConfirmadas = aceitas.filter((r) => r.j.inscricoes?.[0] && r.j.inscricoes[0].aguardandoVaga === false).length;
    v.ok("o que a pessoa vê na resposta bate com o banco (confirmadas)", respostasConfirmadas === VAGAS, `${respostasConfirmadas} respostas 'confirmada'`);
    const respostasComCupom = aceitas.filter((r) => r.j.cupom?.aplicado === true).length;
    v.ok("o aviso do cupom bate com o banco", respostasComCupom === USOS, `${respostasComCupom} respostas 'cupom aplicado'`);
    const senhas = (await dx("GET", `/items/evento_controle?filter[evento][_eq]=${E}&fields=n,inscricao&limit=-1`)).data || [];
    v.ok("uma senha por inscrição aceita, sem repetir", senhas.length === aceitas.length && new Set(senhas.map((s) => s.n)).size === senhas.length, `${senhas.length} senhas`);
    v.ok("toda senha está ligada a uma inscrição", senhas.every((s) => s.inscricao != null));

    // vagas cheias e cupom esgotado
    let r = await site("POST", "/api/criar-inscricao", { eventoId: E, nomes: ["Depois A", "Depois B"], telefone: tel(), cupom: "TRAVA10" });
    v.ok("grupo depois de tudo cheio: aceito, os dois na lista de espera, sem desconto", r.status === 200 && r.j.inscricoes?.length === 2 && r.j.inscricoes.every((i) => i.aguardandoVaga === true) && r.j.cupom?.aplicado === false, `${r.ms} ms ${r.j.cupom?.mensagem || ""}`);
    r = await site("POST", "/api/criar-inscricao", { eventoId: E, nomes: ["Depois C"], telefone: tel() });
    v.ok("e uma sem cupom também vai para a lista de espera", r.status === 200 && r.j.inscricoes?.[0]?.aguardandoVaga === true, `${r.ms} ms`);
    const uso = (await dx("GET", `/items/cupons_desconto/${cupomId}?fields=usos`)).data;
    v.ok(`o contador de usos do cupom mostra ${USOS}`, Number(uso?.usos) === USOS, `usos = ${uso?.usos}`);

    // a equipe libera uma vaga (apaga uma confirmada): a próxima inscrição, depois de a memória de poucos segundos expirar, volta a ser confirmada
    const uma = (await dx("GET", `/items/inscricoes_eventos?filter[evento][_eq]=${E}&filter[aguardando_vaga][_eq]=false&fields=id&limit=1`)).data?.[0];
    const apagou = await dx("DELETE", `/items/inscricoes_eventos/${uma.id}`);
    v.ok("a equipe apagou uma inscrição confirmada", apagou.ok);
    await new Promise((res) => setTimeout(res, 4500));
    r = await site("POST", "/api/criar-inscricao", { eventoId: E, nomes: ["Vaga que voltou"], telefone: tel() });
    v.ok("a vaga apagada volta: a próxima inscrição é confirmada", r.status === 200 && r.j.inscricoes?.[0]?.aguardandoVaga === false, `${r.ms} ms`);
    const final = (await dx("GET", `/items/inscricoes_eventos?filter[evento][_eq]=${E}&filter[aguardando_vaga][_eq]=false&aggregate[count]=id`)).data;
    v.ok(`e continua em ${VAGAS} confirmadas, nunca mais`, Number(final?.[0]?.count?.id) === VAGAS, `${final?.[0]?.count?.id} confirmadas`);
  } finally {
    const ins = (await dx("GET", `/items/inscricoes_eventos?filter[evento][_eq]=${E}&fields=id&limit=-1`)).data || [];
    const ids = ins.map((x) => x.id);
    if (ids.length) await dx("DELETE", "/items/inscricoes_eventos", ids);
    if (cupomId) await dx("DELETE", `/items/cupons_desconto/${cupomId}`);
    const del = await dx("DELETE", `/items/eventos/${E}`); // apaga também as senhas do evento (CASCADE)
    console.log("limpeza: inscrições", ids.length, "| evento apagado:", del.ok, del.erro || "");
    v.fim();
  }
}

main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
