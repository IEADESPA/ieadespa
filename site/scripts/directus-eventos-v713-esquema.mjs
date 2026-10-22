#!/usr/bin/env node
// Prepara o Directus para a v7.13 — EVENTOS, INSCRIÇÕES E CONGRESSOS (22/10/2026). Repetível: confere o que já existe antes de criar, nunca apaga nada.
//
//   DIRECTUS_URL=… DIRECTUS_ADMIN_TOKEN=… node site/scripts/directus-eventos-v713-esquema.mjs [--simular] [--travar-auditoria]
//
// O que cria (só acrescenta):
//   inscricoes_eventos  + faixa_rotulo (o LOTE escolhido), tipo_participante (do crachá), pagamento_informado_* (o aviso da pessoa: data, meio, valor, nome, quando),
//                         pago_conferido_* (quem marcou/desmarcou "pago" e quando), cortesia + cortesia_* (motivo, quem autorizou, quem registrou e quando) e o alias `entradas`;
//   camiseta_pedidos    + pagamento_informado_* (o mesmo aviso, para o pedido de camiseta);
//   eventos             + cracha_config (o que vai no crachá: tipo, igreja/congregação, cidade e QR, e de quais perguntas saem igreja e cidade);
//   evento_entradas     — coleção nova: cada ENTRADA do credenciamento (inscrição, local, hora do aparelho, chave única "inscrição:local:dia"), com `user_created` e
//                         `date_created` preenchidos PELO DIRECTUS a partir do token de quem fez o check-in (ninguém escreve o nome de outra pessoa). Apagar a inscrição ou o
//                         evento apaga as entradas (CASCADE, definido na criação da relação — nunca por PATCH, ver o README do site).
//
// Permissões (só acrescenta; NADA disso fica público):
//   - evento_entradas: criar e ler, para TODA política (fora a pública e as de administrador) que já pode alterar `inscricoes_eventos` — é quem faz o check-in hoje.
//     Com "todos os campos" ("*"): o plano gratuito do Directus recusa lista de campos em permissão nova (RESOURCE_RESTRICTED, medido na réplica local), e não faz falta —
//     `user_created` e `date_created` são preenchidos pelo próprio Directus na criação, por cima do que vier na chamada;
//   - políticas da equipe que leem `inscricoes_eventos`, `camiseta_pedidos` ou `eventos` com uma LISTA de campos (não "*"): os campos novos entram na lista de leitura (e
//     `cracha_config` também na de alteração de `eventos`), senão o painel não os enxerga;
//   - a política PÚBLICA não ganha nada. O script confere e AVISA se a leitura ou a alteração pública de `inscricoes_eventos`/`camiseta_pedidos` for "*" (todos os campos):
//     aí os campos novos (nome de quem pagou, quem confirmou) estariam abertos ao público, e é preciso trocar o "*" por uma lista no Directus antes de publicar o código.
//   - `--travar-auditoria`: nas políticas da equipe que alteram `inscricoes_eventos` com "*", troca o "*" pela lista de todos os campos MENOS os de auditoria (pago_conferido_*,
//     cortesia_*): assim só a função `PainelInscricao` (token de administrador) grava "quem e quando". Sem a opção, o script só avisa.
// Nenhum segredo é impresso.
const URL_BASE = (process.env.DIRECTUS_URL || "").replace(/\/$/, "");
const TOKEN = process.env.DIRECTUS_ADMIN_TOKEN || "";
const SIMULAR = process.argv.includes("--simular");
const TRAVAR_AUDITORIA = process.argv.includes("--travar-auditoria");
if (!URL_BASE || !TOKEN) { console.error("DIRECTUS_URL e DIRECTUS_ADMIN_TOKEN são obrigatórios (variáveis de ambiente)."); process.exit(2); }

async function dx(metodo, caminho, corpo) {
  const r = await fetch(URL_BASE + caminho, { method: metodo, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: j.data, erro: (j.errors || []).map((e) => e.message).join("; ") };
}
const fazer = async (titulo, metodo, caminho, corpo) => {
  if (SIMULAR) { console.log(`  [simular] ${titulo}`); return { ok: true }; }
  const r = await dx(metodo, caminho, corpo);
  console.log(`  ${r.ok ? "feito  " : "FALHOU "} ${titulo}${r.ok ? "" : ` (${r.status}: ${r.erro})`}`);
  if (!r.ok) process.exitCode = 1;
  return r;
};
const campos = async (colecao) => { const r = await dx("GET", `/fields/${colecao}`); return r.ok ? r.data.map((f) => f.field) : null; };

// ---------- os campos ----------
const MEIOS = [{ text: "Pix", value: "PIX" }, { text: "Transferência", value: "TRANSFERENCIA" }, { text: "Dinheiro", value: "DINHEIRO" }, { text: "Outro", value: "OUTRO" }];
const TIPOS = ["Participante", "Preletor", "Equipe", "Imprensa", "Convidado"].map((t) => ({ text: t, value: t }));
const texto = (field, max, note, extra = {}) => ({ field, type: "string", meta: { interface: "input", note, readonly: extra.readonly || false, ...(extra.meta || {}) }, schema: { is_nullable: true, max_length: max, ...(extra.schema || {}) } });
const quando = (field, note) => ({ field, type: "timestamp", meta: { interface: "datetime", readonly: true, note }, schema: { is_nullable: true } });
const AVISO = [
  { field: "pagamento_informado_data", type: "date", meta: { interface: "datetime", readonly: true, note: "Pagamento informado pela pessoa: o dia em que diz ter pago (a equipe confere no extrato)." }, schema: { is_nullable: true } },
  { field: "pagamento_informado_meio", type: "string", meta: { interface: "select-dropdown", readonly: true, options: { choices: MEIOS }, note: "Pagamento informado: o meio." }, schema: { is_nullable: true, max_length: 20 } },
  { field: "pagamento_informado_valor", type: "decimal", meta: { interface: "input", readonly: true, note: "Pagamento informado: o valor (R$)." }, schema: { is_nullable: true, numeric_precision: 10, numeric_scale: 2 } },
  texto("pagamento_informado_nome", 120, "Pagamento informado: o nome de quem pagou.", { readonly: true }),
  quando("pagamento_informado_em", "Quando a pessoa informou o pagamento (informar de novo substitui)."),
];
const CAMPOS_INSCRICAO = [
  texto("faixa_rotulo", 120, "Lote (faixa de valor) escolhido na inscrição — conta para as vagas do lote.", { readonly: true, schema: { is_indexed: true } }),
  { field: "tipo_participante", type: "string", meta: { interface: "select-dropdown", options: { choices: TIPOS }, note: "Tipo de participante (aparece no crachá)." }, schema: { is_nullable: true, max_length: 30, default_value: "Participante" } },
  ...AVISO,
  quando("pago_conferido_em", "Quando o pagamento foi marcado/desmarcado no painel."),
  texto("pago_conferido_por", 64, "Usuário do Directus que marcou/desmarcou o pagamento (id).", { readonly: true }),
  texto("pago_conferido_por_nome", 120, "Nome de quem marcou/desmarcou o pagamento.", { readonly: true }),
  { field: "cortesia", type: "boolean", meta: { interface: "boolean", readonly: true, note: "Cortesia/isenção: sai da conta do \"a receber\". Só pelo painel de inscritos (motivo + quem autorizou)." }, schema: { is_nullable: false, default_value: false } },
  { field: "cortesia_motivo", type: "text", meta: { interface: "input-multiline", readonly: true, note: "Motivo da cortesia." }, schema: { is_nullable: true } },
  texto("cortesia_autorizada_por", 120, "Quem autorizou a cortesia.", { readonly: true }),
  quando("cortesia_em", "Quando a cortesia foi dada ou tirada."),
  texto("cortesia_registrada_por", 64, "Usuário do Directus que registrou a cortesia (id).", { readonly: true }),
  texto("cortesia_registrada_por_nome", 120, "Nome de quem registrou a cortesia.", { readonly: true }),
];
const CAMPOS_EVENTO = [
  { field: "cracha_config", type: "json", meta: { interface: "input-code", options: { language: "json" }, note: "O que vai no crachá (painel do evento, aba Dados): tipo, igreja/congregação, cidade, QR do credenciamento." }, schema: { is_nullable: true } },
];
const AUDITORIA = ["pago_conferido_em", "pago_conferido_por", "pago_conferido_por_nome", "cortesia", "cortesia_motivo", "cortesia_autorizada_por", "cortesia_em", "cortesia_registrada_por", "cortesia_registrada_por_nome"];

async function garantirCampos(colecao, lista) {
  console.log(colecao);
  const existentes = await campos(colecao);
  if (!existentes) { console.log(`  FALHOU: a coleção ${colecao} não existe neste Directus`); process.exitCode = 1; return; }
  for (const c of lista) {
    if (existentes.includes(c.field)) console.log(`  já existe ${c.field}`);
    else await fazer(`campo ${colecao}.${c.field}`, "POST", `/fields/${colecao}`, c);
  }
}

await garantirCampos("inscricoes_eventos", CAMPOS_INSCRICAO);
await garantirCampos("camiseta_pedidos", AVISO);
await garantirCampos("eventos", CAMPOS_EVENTO);

// ---------- a coleção das entradas ----------
console.log("evento_entradas");
if (!(await campos("evento_entradas"))) {
  await fazer("coleção evento_entradas", "POST", "/collections", {
    collection: "evento_entradas",
    meta: { icon: "how_to_reg", hidden: true, note: "Credenciamento por sala/ala: cada entrada de uma pessoa num local do evento (quem fez o check-in fica em user_created). Não editar à mão." },
    schema: {},
    fields: [
      { field: "id", type: "integer", meta: { hidden: true, readonly: true, interface: "input" }, schema: { is_primary_key: true, has_auto_increment: true } },
      { field: "evento", type: "integer", meta: { interface: "input" }, schema: { is_nullable: false, is_indexed: true } },
      { field: "inscricao", type: "integer", meta: { interface: "input" }, schema: { is_nullable: false, is_indexed: true } },
      { field: "local", type: "string", meta: { interface: "input", note: "Nome do local (sala/ala/portaria). Vazio = o evento não tem locais." }, schema: { is_nullable: true, max_length: 120 } },
      { field: "entrou_em", type: "timestamp", meta: { interface: "datetime", note: "Hora da entrada no aparelho (pode chegar depois, se o aparelho estava sem internet)." }, schema: { is_nullable: true } },
      { field: "chave", type: "string", meta: { interface: "input", hidden: true, note: "inscrição:local:dia — a mesma entrada enviada duas vezes (fila sem internet) não duplica." }, schema: { is_nullable: false, is_unique: true, max_length: 200 } },
      { field: "user_created", type: "uuid", meta: { special: ["user-created"], interface: "select-dropdown-m2o", readonly: true, note: "Quem fez o check-in (preenchido pelo Directus)." }, schema: { is_nullable: true } },
      { field: "date_created", type: "timestamp", meta: { special: ["date-created"], interface: "datetime", readonly: true }, schema: {} },
    ],
  });
} else console.log("  já existe a coleção evento_entradas");
if (!SIMULAR && !(await campos("evento_entradas"))) {
  console.log("  a coleção evento_entradas não existe: as relações e as permissões dela ficam para a próxima vez (rode o script de novo depois de resolver o erro acima)");
  process.exit(1);
}

const relacoes = (await dx("GET", "/relations")).data || [];
const temRelacao = (colecao, campo) => relacoes.some((x) => x.collection === colecao && x.field === campo);
if (!temRelacao("evento_entradas", "evento")) {
  await fazer("relação evento_entradas.evento → eventos (apagar o evento apaga as entradas)", "POST", "/relations", {
    collection: "evento_entradas", field: "evento", related_collection: "eventos", meta: { one_field: null }, schema: { on_delete: "CASCADE" },
  });
} else console.log("  já existe a relação do evento");
if (!temRelacao("evento_entradas", "inscricao")) {
  if (!((await campos("inscricoes_eventos")) || []).includes("entradas")) {
    await fazer("campo-lista inscricoes_eventos.entradas", "POST", "/fields/inscricoes_eventos", {
      field: "entradas", type: "alias", meta: { special: ["o2m"], interface: "list-o2m", readonly: true, note: "Entradas do credenciamento (ver evento_entradas)." },
    });
  }
  await fazer("relação evento_entradas.inscricao → inscricoes_eventos (apagar a inscrição apaga as entradas)", "POST", "/relations", {
    collection: "evento_entradas", field: "inscricao", related_collection: "inscricoes_eventos", meta: { one_field: "entradas" }, schema: { on_delete: "CASCADE" },
  });
} else console.log("  já existe a relação da inscrição");
if (!temRelacao("evento_entradas", "user_created")) {
  await fazer("relação evento_entradas.user_created → directus_users", "POST", "/relations", {
    collection: "evento_entradas", field: "user_created", related_collection: "directus_users", meta: { one_field: null }, schema: { on_delete: "SET NULL" },
  });
} else console.log("  já existe a relação de quem fez o check-in");

// ---------- permissões ----------
console.log("permissões");
const politicas = (await dx("GET", "/policies?fields=id,name,admin_access&limit=-1")).data || [];
const permissoes = (await dx("GET", "/permissions?limit=-1&fields=id,policy,collection,action,fields,permissions,validation,presets")).data || [];
const publica = politicas.find((p) => p.name === "$t:public_label");
const ehEquipe = (id) => { const p = politicas.find((x) => x.id === id); return p && !p.admin_access && (!publica || p.id !== publica.id); };
const nomeDa = (id) => (politicas.find((x) => x.id === id) || {}).name || id;
const achar = (politica, colecao, acao) => permissoes.find((x) => x.policy === politica && x.collection === colecao && x.action === acao);

// a política pública não ganha nada; só conferir o que ela já tem
for (const colecao of ["inscricoes_eventos", "camiseta_pedidos"]) {
  for (const acao of ["read", "update"]) {
    const p = permissoes.find((x) => x.collection === colecao && x.action === acao && (x.policy === null || (publica && x.policy === publica.id)));
    if (!p) { console.log(`  público: ${colecao}.${acao} — nenhuma permissão (ok)`); continue; }
    const lista = p.fields || [];
    if (lista.includes("*")) {
      console.log(`  ATENÇÃO: o público pode ${acao === "read" ? "LER" : "ALTERAR"} TODOS os campos de ${colecao} ("*"). Os campos novos (nome de quem pagou, quem confirmou, cortesia) ficariam abertos.`);
      console.log(`           Troque o "*" por uma lista no Directus antes de publicar o código (leitura: id, evento, aguardando_vaga, presente; alteração: push_endpoint, push_p256dh, push_auth).`);
      process.exitCode = 1;
    } else console.log(`  público: ${colecao}.${acao} — só ${lista.join(", ") || "(nenhum campo)"} (ok: os campos novos não entram)`);
  }
}

// evento_entradas para quem já faz o check-in
const equipeQueAltera = [...new Set(permissoes.filter((x) => x.collection === "inscricoes_eventos" && x.action === "update" && ehEquipe(x.policy)).map((x) => x.policy))];
if (!equipeQueAltera.length) console.log("  nenhuma política da equipe altera inscricoes_eventos (só o administrador fará check-in)");
for (const politica of equipeQueAltera) {
  if (!achar(politica, "evento_entradas", "create")) await fazer(`evento_entradas: criar, para "${nomeDa(politica)}"`, "POST", "/permissions", { policy: politica, collection: "evento_entradas", action: "create", fields: ["*"], permissions: {}, validation: {} });
  else console.log(`  já existe evento_entradas.create para "${nomeDa(politica)}"`);
  if (!achar(politica, "evento_entradas", "read")) await fazer(`evento_entradas: ler, para "${nomeDa(politica)}"`, "POST", "/permissions", { policy: politica, collection: "evento_entradas", action: "read", fields: ["*"], permissions: {}, validation: {} });
  else console.log(`  já existe evento_entradas.read para "${nomeDa(politica)}"`);
}

// leitura (e, em eventos, alteração) dos campos novos para quem lê com lista de campos
async function acrescentarCampos(colecao, acao, novos) {
  for (const p of permissoes.filter((x) => x.collection === colecao && x.action === acao && ehEquipe(x.policy))) {
    const lista = p.fields || [];
    if (lista.includes("*")) { console.log(`  "${nomeDa(p.policy)}" ${colecao}.${acao}: todos os campos (nada a acrescentar)`); continue; }
    const faltam = novos.filter((c) => !lista.includes(c));
    if (!faltam.length) { console.log(`  "${nomeDa(p.policy)}" ${colecao}.${acao}: já tem os campos novos`); continue; }
    const r = await fazer(`"${nomeDa(p.policy)}" ${colecao}.${acao}: + ${faltam.join(", ")}`, "PATCH", `/permissions/${p.id}`, { fields: [...lista, ...faltam] });
    if (!r.ok) console.log(`  ATENÇÃO: acrescente à mão, no Directus (Configurações → Funções e políticas → "${nomeDa(p.policy)}" → ${colecao}), os campos: ${faltam.join(", ")}. Sem isso o painel não os enxerga.`);
  }
}
await acrescentarCampos("inscricoes_eventos", "read", [...CAMPOS_INSCRICAO.map((c) => c.field), "entradas"]);
await acrescentarCampos("camiseta_pedidos", "read", AVISO.map((c) => c.field));
await acrescentarCampos("eventos", "read", ["cracha_config"]);
await acrescentarCampos("eventos", "update", ["cracha_config"]);

// a auditoria: quem pode gravar "quem e quando" direto no Directus?
for (const p of permissoes.filter((x) => x.collection === "inscricoes_eventos" && x.action === "update" && ehEquipe(x.policy))) {
  const lista = p.fields || [];
  const abertos = lista.includes("*") ? AUDITORIA : AUDITORIA.filter((c) => lista.includes(c));
  if (!abertos.length) { console.log(`  "${nomeDa(p.policy)}" não grava os campos de auditoria direto (ok: só a função PainelInscricao grava)`); continue; }
  if (!TRAVAR_AUDITORIA || !lista.includes("*")) {
    console.log(`  aviso: "${nomeDa(p.policy)}" consegue gravar ${abertos.length} campos de auditoria direto no Directus (o registro de atividade do Directus continua mostrando quem foi). Use --travar-auditoria para fechar.`);
    continue;
  }
  const todos = (await campos("inscricoes_eventos")) || [];
  const permitidos = todos.filter((c) => !AUDITORIA.includes(c) && c !== "id");
  const r = await fazer(`"${nomeDa(p.policy)}" inscricoes_eventos.update: "*" → todos menos a auditoria (${permitidos.length} campos)`, "PATCH", `/permissions/${p.id}`, { fields: permitidos });
  if (!r.ok) console.log("  (o plano do Directus pode recusar lista de campos em permissão: a auditoria segue protegida pelo registro de atividade do Directus)");
}
console.log(SIMULAR ? "\n(simulação: nada foi alterado)" : "\nPronto.");
