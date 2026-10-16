// Bateria do LIMITE DE PEDIDOS das camisetas (16/10/2026), contra um site de verdade (pré-visualização, produção, ou o emulador `swa-local.cjs` com um Directus de teste).
// Cria campanhas descartáveis ("teste-limite-…") com limite total e por tamanho e confere: o que entra e o que é recusado (com o motivo), as validações que impedem "devolver" vagas,
// a vaga que volta quando o pedido é apagado, o lote fechado (a contagem recomeça), 10 pedidos AO MESMO TEMPO para 4 vagas (entram exatamente 4), a venda de balcão com o token do
// gestor (o limite vale e a senha é gravada com a permissão dele) e o aviso "esgotado" da página. Apaga tudo no fim.
//
// Variáveis: SITE_URL (padrão: produção), DIRECTUS_URL, DIRECTUS_ADMIN_TOKEN, TELEFONE_CHAVE_SEGREDO (ver README desta pasta).
// Pré-requisito: o esquema do limite no Directus (`site/scripts/directus-limite-esquema.mjs`); sem ele a bateria diz isso e para.
// Cuidado com o limitador por IP da função (40 pedidos em 5 min por IP): a bateria faz cerca de 25 chamadas de criar pedido.
const crypto = require("node:crypto");
const { ambiente, Verificador, esperar } = require("./comum.cjs");

async function main() {
  const { SITE, URL, dx, site } = ambiente();
  const v = new Verificador("limite de pedidos");
  const tel = () => "9497" + String(Math.floor(Math.random() * 1e7)).padStart(7, "0");
  const grupos = [];
  const usuarios = [];

  const novaCampanha = (extra) => dx("POST", "/items/camiseta_grupos", {
    slug: `teste-limite-${Date.now()}-${Math.floor(Math.random() * 1e4)}`, nome: "TESTE LIMITE (apagar)", ativo: true, destaque: false, pedir_congregacao: false, limite_uma_por_pessoa: false,
    retirada_liberada: false, tamanhos: ["P", "M", "G"], modelos: ["Unico"], ...extra,
  });
  const pedir = (grupoId, itens, extra = {}) => site("POST", "/api/criar-pedido-camiseta", { grupoId, nome: "Teste limite", telefone: tel(), itens, respostas: [], ...extra });
  const item = (tamanho, quantidade) => ({ tamanho, modelo: "Unico", quantidade });
  const pecasDoGrupo = async (g) => {
    const r = await dx("GET", `/items/camiseta_itens_pedido?filter[pedido][grupo][_eq]=${g}&aggregate[sum]=quantidade&groupBy[]=tamanho`);
    const porTamanho = {};
    let total = 0;
    for (const l of r.data || []) { porTamanho[l.tamanho || ""] = Number(l.sum.quantidade); total += Number(l.sum.quantidade); }
    return { total, porTamanho };
  };

  async function limpar() {
    for (const g of grupos) await dx("DELETE", `/items/camiseta_grupos/${g}`);
    for (const u of usuarios) await dx("DELETE", `/users/${u}`);
    console.log(`limpeza: ${grupos.length} campanha(s) e ${usuarios.length} usuário(s) de teste apagados`);
  }

  try {
    // ---- o esquema existe? ----
    const A = await novaCampanha({ limite_total: 6, limites_tamanho: { M: 3, G: 2 } });
    v.ok("o Directus tem os campos do limite (rode site/scripts/directus-limite-esquema.mjs se não)", A.ok, A.erro || "");
    if (!A.ok) { await limpar(); v.fim(); return; }
    grupos.push(A.data.id);
    const a = A.data.id;
    console.log(`[${SITE}] campanha de teste A: ${a} (limite 6; M 3; G 2)`);

    const st0 = await site("GET", `/api/status-camiseta/${a}`);
    v.ok("status: aberta e sem esgotar nada", st0.status === 200 && st0.j.aberto === true && st0.j.limite && st0.j.limite.esgotado === false && st0.j.limite.tamanhosEsgotados.length === 0, JSON.stringify(st0.j));

    // ---- total e por tamanho, na ordem ----
    const p1 = await pedir(a, [item("M", 2)]);
    v.ok("pedido de 2 M entra", p1.status === 200 && p1.j.pedidoId, `${p1.status} ${p1.ms} ms`);
    const ctl1 = (await dx("GET", `/items/camiseta_controle?filter[grupo][_eq]=${a}&fields=n,chave,pecas,pedido&limit=-1`)).data || [];
    v.ok("a senha do pedido foi gravada junto (n=1, chave '<campanha>:1', 2 peças, ligada ao pedido)", ctl1.length === 1 && ctl1[0].n === 1 && ctl1[0].chave === `${a}:1` && ctl1[0].pecas === 2 && ctl1[0].pedido === p1.j.pedidoId, JSON.stringify(ctl1));
    const p2 = await pedir(a, [item("M", 1)]);
    v.ok("mais 1 M entra (M 3 de 3)", p2.status === 200, `${p2.status}`);
    const p3 = await pedir(a, [item("M", 1)]);
    v.ok("M esgotou: 409 tamanho_esgotado", p3.status === 409 && p3.j.motivo === "tamanho_esgotado" && p3.j.tamanho === "M" && /esgotou/.test(p3.j.erro), JSON.stringify(p3.j));
    const p4 = await pedir(a, [item("G", 3)]);
    v.ok("3 G quando restam 2: 409 tamanho_quantidade, restam 2", p4.status === 409 && p4.j.motivo === "tamanho_quantidade" && p4.j.restam === 2, JSON.stringify(p4.j));
    const p5 = await pedir(a, [item("G", 2)]);
    v.ok("2 G entram (G 2 de 2; total 5 de 6)", p5.status === 200, `${p5.status}`);
    const p6 = await pedir(a, [item("P", 2)]);
    v.ok("2 P quando resta 1 no total: 409 quantidade, restam 1", p6.status === 409 && p6.j.motivo === "quantidade" && p6.j.restam === 1, JSON.stringify(p6.j));
    const p7 = await pedir(a, [item("P", 1)]);
    v.ok("1 P entra (total 6 de 6)", p7.status === 200, `${p7.status}`);
    const p8 = await pedir(a, [item("P", 1)]);
    v.ok("agora esgotou tudo: 409 esgotado", p8.status === 409 && p8.j.motivo === "esgotado", JSON.stringify(p8.j));
    const soma1 = await pecasDoGrupo(a);
    v.ok("no banco: 6 peças (M 3, G 2, P 1), nenhuma a mais", soma1.total === 6 && soma1.porTamanho.M === 3 && soma1.porTamanho.G === 2 && soma1.porTamanho.P === 1, JSON.stringify(soma1));
    const ctl2 = (await dx("GET", `/items/camiseta_controle?filter[grupo][_eq]=${a}&fields=n,chave&sort=n&limit=-1`)).data || [];
    v.ok("uma senha por pedido aceito (4), 1..4 sem buraco", ctl2.length === 4 && ctl2.every((c, i) => c.n === i + 1), JSON.stringify(ctl2.map((c) => c.n)));

    // ---- validações: nada de "devolver" vagas ----
    const bad1 = await pedir(a, [item("P", -1), item("P", 3)]);
    const bad2 = await pedir(a, [item("P", 1.5)]);
    const bad3 = await pedir(a, [item("XXL", 1)]);
    v.ok("quantidade negativa, quebrada ou tamanho inventado: 400 (não abre vaga para os outros)", [bad1, bad2, bad3].every((r) => r.status === 400), [bad1, bad2, bad3].map((r) => r.status).join(","));

    // ---- a página ----
    await esperar(6000); // o status guarda as peças por 5 s
    const st1 = await site("GET", `/api/status-camiseta/${a}`);
    v.ok("status: esgotado, com M e G esgotados", st1.status === 200 && st1.j.limite && st1.j.limite.esgotado === true && ["M", "G"].every((t) => st1.j.limite.tamanhosEsgotados.includes(t)), JSON.stringify(st1.j));

    // ---- pedido apagado libera a vaga (a senha não volta) ----
    const apagou = await dx("DELETE", `/items/camiseta_pedidos/${p1.j.pedidoId}`);
    const livre = (await dx("GET", `/items/camiseta_controle?filter[grupo][_eq]=${a}&fields=n,pedido&sort=n&limit=-1`)).data || [];
    v.ok("apagar o pedido não apaga a senha dele (o livro só cresce)", apagou.ok && livre.length === 4 && livre[0].n === 1 && livre[0].pedido === null, JSON.stringify(livre));
    await esperar(4000); // a memória da função vale 3 s
    const p9 = await pedir(a, [item("M", 2)]);
    v.ok("vaga liberada: 2 M entram de novo", p9.status === 200, `${p9.status} ${JSON.stringify(p9.j)}`);
    const ctl3 = (await dx("GET", `/items/camiseta_controle?filter[grupo][_eq]=${a}&fields=n&sort=-n&limit=1`)).data || [];
    v.ok("e a senha nova é a 5 (nunca reaproveita)", ctl3[0] && ctl3[0].n === 5, JSON.stringify(ctl3));

    // ---- lote fechado: a contagem recomeça ----
    const lotes = (await dx("GET", `/items/camiseta_lotes?filter[grupo][_eq]=${a}&fields=id,numero,status&limit=-1`)).data || [];
    v.ok("um lote aberto só", lotes.length === 1 && lotes[0].status === "aberto", JSON.stringify(lotes));
    await dx("PATCH", `/items/camiseta_lotes/${lotes[0].id}`, { status: "fechado", fechado_em: new Date().toISOString() });
    await esperar(4000);
    const p10 = await pedir(a, [item("M", 3)]);
    const lotes2 = (await dx("GET", `/items/camiseta_lotes?filter[grupo][_eq]=${a}&fields=id,numero,status&sort=numero&limit=-1`)).data || [];
    v.ok("fechou o lote: 3 M entram num lote NOVO (a contagem recomeça do zero)", p10.status === 200 && lotes2.length === 2 && lotes2[1].status === "aberto" && lotes2[1].numero === 2, `${p10.status} ${JSON.stringify(lotes2)}`);

    // ---- muitos ao mesmo tempo: 10 pedidos para 4 vagas ----
    const B = await novaCampanha({ limite_total: 4 });
    grupos.push(B.data.id);
    const b = B.data.id;
    const rajada = await Promise.all(Array.from({ length: 10 }, () => pedir(b, [item("M", 1)])));
    const aceitos = rajada.filter((r) => r.status === 200).length;
    const recusados = rajada.filter((r) => r.status === 409 && r.j.motivo === "esgotado").length;
    const outros = rajada.filter((r) => ![200, 409].includes(r.status));
    const somaB = await pecasDoGrupo(b);
    const senhasB = (await dx("GET", `/items/camiseta_controle?filter[grupo][_eq]=${b}&fields=n&limit=-1`)).data || [];
    v.ok("10 pedidos ao mesmo tempo para 4 vagas: entram EXATAMENTE 4 e os outros 6 recebem 'esgotado'", aceitos === 4 && recusados === 6 && outros.length === 0, `aceitos ${aceitos}, esgotado ${recusados}, outros ${outros.map((r) => r.status).join(",")} | tempos ${rajada.map((r) => r.ms).sort((x, y) => x - y).join(" ")} ms`);
    v.ok("no banco: 4 peças, 4 senhas diferentes", somaB.total === 4 && senhasB.length === 4 && new Set(senhasB.map((s) => s.n)).size === 4, `${JSON.stringify(somaB)} senhas ${senhasB.map((s) => s.n).join(",")}`);

    // ---- venda de balcão: o limite vale, com o token do gestor ----
    const papeis = (await dx("GET", "/roles?limit=-1&fields=id,name")).data || [];
    const papelGestor = papeis.find((p) => p.name === "Gestor de Camisetas");
    v.ok("a função 'Gestor de Camisetas' existe", !!papelGestor);
    if (papelGestor) {
      const senha = crypto.randomBytes(18).toString("base64url");
      const email = `teste-limite-${Date.now()}@exemplo.com`;
      const u = await dx("POST", "/users", { email, password: senha, first_name: "TESTE", last_name: "limite (apagar)", role: papelGestor.id, status: "active" });
      if (u.ok) usuarios.push(u.data.id);
      const login = await fetch(URL + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: senha, mode: "json" }) });
      const token = ((await login.json().catch(() => ({}))).data || {}).access_token;
      v.ok("gestor de teste entrou", !!token);
      const C = await novaCampanha({ limite_total: 3 });
      grupos.push(C.data.id);
      const c = C.data.id;
      const balcao = async (itens, lote = "aberto") => {
        const r = await fetch(SITE + "/api/registrar-venda-balcao", { method: "POST", headers: { "Content-Type": "application/json", "x-painel-token": token }, body: JSON.stringify({ grupoId: c, nome: "Cliente de balcão", itens, lote }) });
        return { status: r.status, j: await r.json().catch(() => ({})) };
      };
      const b1 = await balcao([item("M", 2)]);
      v.ok("balcão: 2 M entram (o gestor grava a senha com a permissão dele)", b1.status === 200 && b1.j.pedidoId, JSON.stringify(b1.j));
      const ctlC = (await dx("GET", `/items/camiseta_controle?filter[grupo][_eq]=${c}&fields=n,pedido&limit=-1`)).data || [];
      v.ok("e a senha ficou no livro, ligada ao pedido", ctlC.length === 1 && ctlC[0].pedido === b1.j.pedidoId, JSON.stringify(ctlC));
      const pc = await pedir(c, [item("P", 1)]);
      v.ok("o público pede 1 (a campanha chega em 3 de 3, contando o balcão)", pc.status === 200, `${pc.status}`);
      const b2 = await balcao([item("M", 1)]);
      v.ok("balcão além do limite: 409, com a mensagem para o gestor e nada gravado", b2.status === 409 && b2.j.limiteDoLote === true && /limite de pedidos \(3 peças\)/.test(b2.j.erro) && /aumente o limite/i.test(b2.j.erro), JSON.stringify(b2.j));
      const b3 = await balcao([item("M", 1)], "avulso");
      v.ok("venda AVULSA (sem lote) não conta no limite e entra", b3.status === 200 && b3.j.avulso === true, JSON.stringify(b3.j));
      const pc2 = await pedir(c, [item("G", 1)]);
      v.ok("o público depois disso: esgotado", pc2.status === 409 && pc2.j.motivo === "esgotado", JSON.stringify(pc2.j));
      const somaC = await pecasDoGrupo(c);
      v.ok("no banco: 3 peças nos lotes + 1 avulsa (4 no total, só 3 contam)", somaC.total === 4, JSON.stringify(somaC));
    }
  } finally {
    await limpar();
  }
  v.fim();
}

main().catch((e) => { console.error("ERRO:", e.stack || e.message); process.exit(1); });
