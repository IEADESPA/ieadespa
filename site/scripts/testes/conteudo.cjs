// Bateria do PAINEL DE CONTEÚDO (/painel-conteudo/) contra o Directus de verdade e o site publicado (15/10/2026).
// Cria um usuário temporário com a função "Editor de notícias" e confere, com o token DELE (o mesmo que o painel usa):
//   - o que pode: ler, criar (SÓ rascunho), alterar e apagar notícias e mensagens; ler órgãos; enviar imagem (só imagem);
//   - o que NÃO pode: nada sigiloso (mural de oração, contas, inscrições, pedidos de camiseta, avisos do navegador, mensagens
//     de contato…), nem enviar arquivo que não seja imagem, nem apagar arquivo;
//   - que as quatro páginas do painel respondem no site.
// REGRA DE SEGURANÇA: o Directus daqui é o de produção e um item com draft=false e notificacao_enviada=false dispara notificação
// de verdade para quem ativou os avisos. Por isso TODO item criado aqui nasce `draft: true` E `notificacao_enviada: true`,
// com slug "teste-conteudo-…" (a versão do conteúdo ignora "teste-…") e é apagado no `finally`, junto com o usuário e o arquivo.
//
// Variáveis: SITE_URL (padrão: produção), DIRECTUS_URL, DIRECTUS_ADMIN_TOKEN (ver README desta pasta). Nada de segredo é impresso.
const crypto = require("node:crypto");
const { ambiente, Verificador } = require("./comum.cjs");

// PNG de 1 pixel (o menor arquivo de imagem válido).
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function main() {
  const { SITE, URL, dx } = ambiente();
  const v = new Verificador("painel de conteúdo");
  const prefixo = "teste-conteudo-" + Date.now();
  let usuarioId = null;
  const arquivos = [];

  // O Directus (plano pequeno) devolve 503/429 de vez em quando: a limpeza tenta de novo, para não deixar lixo de teste em produção.
  async function tentar(fn) {
    let r;
    for (let i = 0; i < 5; i++) {
      r = await fn();
      if (r.ok || r.status === 404) return r;
      await new Promise((ok) => setTimeout(ok, 1500 * (i + 1)));
    }
    return r;
  }

  async function limpar() {
    for (const col of ["noticias", "mensagens"]) {
      const r = await tentar(() =>
        dx("GET", `/items/${col}?filter[slug][_starts_with]=${prefixo}&fields=id&limit=-1`),
      );
      const ids = (r.data || []).map((x) => x.id);
      if (ids.length) await tentar(() => dx("DELETE", `/items/${col}`, ids));
    }
    if (usuarioId) {
      const f = await tentar(() =>
        dx("GET", `/files?filter[uploaded_by][_eq]=${usuarioId}&fields=id&limit=-1`),
      );
      for (const x of f.data || []) if (!arquivos.includes(x.id)) arquivos.push(x.id);
    }
    for (const id of arquivos) await tentar(() => dx("DELETE", `/files/${id}`));
    if (usuarioId) await tentar(() => dx("DELETE", `/users/${usuarioId}`));
  }

  try {
    const papeis = (await dx("GET", "/roles?limit=-1&fields=id,name")).data || [];
    const papel = papeis.find((p) => String(p.name).includes("Editor de not"));
    v.ok("a função 'Editor de notícias' existe no Directus", !!papel);
    if (!papel) return;

    const senha = crypto.randomBytes(18).toString("base64url");
    const email = `teste-conteudo-${Date.now()}@exemplo.com`;
    const u = await dx("POST", "/users", {
      email,
      password: senha,
      first_name: "TESTE",
      last_name: "conteúdo (apagar)",
      role: papel.id,
      status: "active",
    });
    if (!u.ok) throw new Error("não criou o usuário de teste: " + u.status + " " + u.erro);
    usuarioId = u.data.id;
    const lg = await fetch(URL + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: senha, mode: "json" }),
    });
    const lj = await lg.json().catch(() => ({}));
    const token = lj.data && lj.data.access_token;
    if (!token) throw new Error("login do usuário de teste falhou: " + lg.status);

    // Chamada com o token do próprio usuário (como o painel faz).
    const como = async (metodo, caminho, corpo, extra = {}) => {
      const r = await fetch(URL + caminho, {
        method: metodo,
        headers: {
          Authorization: "Bearer " + token,
          ...(corpo && !(corpo instanceof FormData) ? { "Content-Type": "application/json" } : {}),
        },
        body: corpo ? (corpo instanceof FormData ? corpo : JSON.stringify(corpo)) : undefined,
        ...extra,
      });
      const j = await r.json().catch(() => ({}));
      return {
        status: r.status,
        j,
        erro:
          j.errors &&
          j.errors[0] &&
          ((j.errors[0].extensions && j.errors[0].extensions.code) || j.errors[0].message),
      };
    };

    // ---- o que o Editor de notícias PODE (leitura)
    for (const c of ["noticias", "mensagens", "orgao_membros", "orgao_categorias"]) {
      const r = await como("GET", `/items/${c}?limit=1&fields=id`);
      v.ok(`lê ${c} (200)`, r.status === 200, r.status);
    }

    // ---- ciclo completo em RASCUNHO (nunca publicado) nas duas coleções
    const modelos = {
      noticias: { category: "institucional" },
      mensagens: { category: "Notícias e Avisos" },
    };
    for (const [col, extra] of Object.entries(modelos)) {
      const slug = `${prefixo}-${col}`;
      const base = {
        title: `TESTE conteúdo (apagar) ${col}`,
        slug,
        excerpt: "teste",
        body: "**teste**",
        date: new Date().toISOString().slice(0, 10),
        draft: true,
        ...extra,
      };
      const c = await como("POST", `/items/${col}`, base);
      const id = c.j.data && c.j.data.id;
      v.ok(
        `cria rascunho em ${col} (200)`,
        c.status === 200 && !!id,
        `${c.status} ${c.erro || ""}`,
      );
      if (!id) continue;
      // O editor NÃO escreve "notificacao_enviada" (15/10/2026: quem a controla é o robô de avisos; um editor poderia religar o aviso de uma
      // notícia antiga para todos). Quem marca o item de teste como "já notificado" é o administrador, logo depois de criado.
      await dx("PATCH", `/items/${col}/${id}`, { notificacao_enviada: true });
      const comAviso = await como("POST", `/items/${col}`, { ...base, slug: `${slug}-aviso`, notificacao_enviada: false });
      v.ok(`${col}: o editor NÃO consegue criar item escrevendo "notificacao_enviada" (403)`, comAviso.status === 403, `${comAviso.status}`);
      // (se um dia a trava falhar, o item de teste — sempre rascunho — não fica para trás)
      if (comAviso.j.data && comAviso.j.data.id) await dx("DELETE", `/items/${col}/${comAviso.j.data.id}`);
      const religar = await como("PATCH", `/items/${col}/${id}`, { notificacao_enviada: false });
      v.ok(`${col}: o editor NÃO consegue religar o aviso de um item (403)`, religar.status === 403, `${religar.status}`);
      const noAdmin =
        (await dx("GET", `/items/${col}/${id}?fields=draft,notificacao_enviada,slug`)).data || {};
      v.ok(
        `${col}: o item de teste nasceu RASCUNHO e já "notificado" (nenhum aviso real pode sair)`,
        noAdmin.draft === true && noAdmin.notificacao_enviada === true && noAdmin.slug === slug,
        JSON.stringify(noAdmin),
      );
      const dup = await como("POST", `/items/${col}`, {
        ...base,
        title: "TESTE conteúdo duplicado (apagar)",
      });
      v.ok(
        `${col}: endereço (slug) repetido é recusado com 400 RECORD_NOT_UNIQUE (o painel mostra a mensagem certa)`,
        dup.status === 400 && dup.erro === "RECORD_NOT_UNIQUE",
        `${dup.status} ${dup.erro || ""}`,
      );
      const p = await como("PATCH", `/items/${col}/${id}`, { excerpt: "alterado pelo teste" });
      v.ok(
        `altera em ${col} (200)`,
        p.status === 200 && p.j.data && p.j.data.excerpt === "alterado pelo teste",
        p.status,
      );
      const d = await como("DELETE", `/items/${col}/${id}`);
      v.ok(`apaga em ${col} (204)`, d.status === 204, d.status);
      const some = await dx("GET", `/items/${col}?filter[slug][_eq]=${slug}&fields=id`);
      v.ok(`${col}: o item de teste sumiu mesmo`, (some.data || []).length === 0);
    }

    // ---- envio de arquivo: só imagem
    const fd = new FormData();
    fd.append("file", new Blob([PNG_1PX], { type: "image/png" }), "teste-conteudo-1px.png");
    const up = await como("POST", "/files", fd);
    const arquivoId = up.j.data && up.j.data.id;
    if (arquivoId) arquivos.push(arquivoId);
    v.ok(
      "envia uma imagem PNG de 1 pixel para /files (200)",
      up.status === 200 && !!arquivoId,
      `${up.status} ${up.erro || ""}`,
    );
    if (arquivoId) {
      const meta = await como("GET", `/files/${arquivoId}?fields=id,type`);
      v.ok(
        "e consegue ler o arquivo que enviou",
        meta.status === 200 && meta.j.data && meta.j.data.type === "image/png",
        meta.status,
      );
      const del = await como("DELETE", `/files/${arquivoId}`);
      v.ok(
        "mas NÃO apaga arquivo (403): quem apaga é a Secretaria",
        del.status === 403,
        del.status,
      );
      const ativo = await fetch(`${URL}/assets/${arquivoId}`);
      v.ok(
        "o arquivo enviado é servido ao público em /assets (200)",
        ativo.status === 200,
        ativo.status,
      );
    }
    const fdTexto = new FormData();
    fdTexto.append(
      "file",
      new Blob(["isto não é uma imagem"], { type: "text/plain" }),
      "teste-conteudo.txt",
    );
    const upTexto = await como("POST", "/files", fdTexto);
    if (upTexto.j.data && upTexto.j.data.id) arquivos.push(upTexto.j.data.id);
    v.ok(
      "envio de text/plain é recusado (400): a função só envia imagem",
      upTexto.status === 400,
      upTexto.status,
    );
    const fdPdf = new FormData();
    fdPdf.append("file", new Blob(["%PDF-1.4"], { type: "application/pdf" }), "teste-conteudo.pdf");
    const upPdf = await como("POST", "/files", fdPdf);
    if (upPdf.j.data && upPdf.j.data.id) arquivos.push(upPdf.j.data.id);
    v.ok("envio de PDF também é recusado (400)", upPdf.status === 400, upPdf.status);

    // ---- o que NÃO pode: nada sigiloso
    for (const c of [
      "mural_oracao",
      "contas",
      "contas_codigos",
      "inscricoes_eventos",
      "camiseta_pedidos",
      "push_subscriptions",
      "contato_mensagens",
      "depoimentos",
      "configuracoes",
      "eventos",
    ]) {
      const r = await como("GET", `/items/${c}?limit=1&fields=id`);
      v.ok(`NÃO lê ${c} (403)`, r.status === 403, r.status);
    }
    // Contas de outras pessoas: o Directus deixa todo usuário do painel ver a PRÓPRIA conta (e só ela).
    const us = await como("GET", "/users?limit=-1&fields=id");
    v.ok(
      "só enxerga a própria conta de usuário (nenhuma outra pessoa aparece)",
      us.status === 403 ||
        (us.status === 200 &&
          Array.isArray(us.j.data) &&
          us.j.data.length === 1 &&
          us.j.data[0].id === usuarioId),
      `${us.status} ${us.j.data ? us.j.data.length + " conta(s)" : ""}`,
    );

    // ---- as páginas do painel respondem no site (e são noindex)
    for (const [caminho, marca] of [
      ["/painel-conteudo/", "data-pc-inicio"],
      ["/painel-conteudo/entrar/", "data-pc-entrar"],
      ["/painel-conteudo/lista/", "data-pc-lista"],
      ["/painel-conteudo/editar/", "data-pc-editar"],
    ]) {
      const t0 = Date.now();
      const r = await fetch(SITE + caminho);
      const html = await r.text();
      v.ok(
        `${caminho} responde 200, é a tela certa e tem noindex`,
        r.status === 200 && html.includes(marca) && /name="robots" content="noindex/.test(html),
        `${r.status} ${Date.now() - t0} ms`,
      );
    }
  } finally {
    await limpar();
    // Conferência final: nada de teste ficou no Directus.
    const sobra = [];
    for (const col of ["noticias", "mensagens"]) {
      const r = await dx("GET", `/items/${col}?filter[slug][_starts_with]=${prefixo}&fields=id`);
      sobra.push(...(r.data || []));
    }
    v.ok("limpeza: nenhum item de teste ficou no Directus", sobra.length === 0, sobra.length);
    const usuariosSobra = await dx(
      "GET",
      `/users?filter[email][_starts_with]=teste-conteudo-&fields=id&limit=-1`,
    );
    const arquivosSobra = await dx(
      "GET",
      `/files?filter[filename_download][_starts_with]=teste-conteudo&fields=id&limit=-1`,
    );
    v.ok(
      "limpeza: nenhum usuário nem arquivo de teste ficou no Directus",
      (usuariosSobra.data || []).length === 0 && (arquivosSobra.data || []).length === 0,
      `${(usuariosSobra.data || []).length} usuário(s), ${(arquivosSobra.data || []).length} arquivo(s)`,
    );
    v.fim();
  }
}

main().catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});
