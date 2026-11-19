<!-- 8b. O EDITOR DA CARTEIRINHA FÍSICA (rodada 11, opção 2: os ícones e os menus à esquerda, como nos editores de imagem; à direita, o que muda no item
     escolhido). Frente e verso, as camadas (arrastar para mudar a ordem, mostrar e esconder), os campos que não mudam, a arte de fundo em alta resolução,
     desfazer e refazer, arrastar e redimensionar no cartão (ou pelas setas do teclado). Só no notebook; no celular, só para ver. Só a Secretaria Geral salva
     (o servidor confere o desenho de novo: a física só leva o que não muda, e um QR só). -->
<script lang="ts">
  import { pedir, avisarFalha } from "../../comum/api";
  import { ponte } from "../../comum/ponte";
  import { numero } from "../../comum/formato";
  import Cabecalho from "../../comum/Cabecalho.svelte";
  import Botao from "../../comum/Botao.svelte";
  import Icone from "../../comum/Icone.svelte";
  import Estado from "../../comum/Estado.svelte";
  import Aviso from "../../comum/Aviso.svelte";
  import Opcoes from "../../comum/Opcoes.svelte";
  import Escolha from "../../comum/Escolha.svelte";
  import CartaoFisico from "./CartaoFisico.svelte";
  import { imprimirCartoes } from "./imprimir";
  import { ir } from "../estado.svelte";
  import { EXEMPLO, ROTULO_PUBLICO, type Camada, type CampoFisica, type Desenho, type Lado, type Material, type Modelo, type TipoCamada } from "./tipos";

  interface Props { modeloId: number; celular: boolean; onnome: (n: string) => void }
  let { modeloId, celular, onnome }: Props = $props();

  const geral = ponte().sessao().geral;
  // px por milímetro no editor: o cartão de 85,6 mm ocupa a largura que a mesa tem (até 6,5 px/mm, ~560 px), sem rolar para o lado
  let largMesa = $state(0);
  const ESC = $derived(largMesa > 0 ? Math.max(3, Math.min(6.5, (largMesa - 70) / 85.6)) : 5);
  const FONTES = ["Inter", "Atkinson Hyperlegible Next", "Source Sans 3", "Plus Jakarta Sans"] as const;
  const CORES = ["#0a2342", "#1e3a8a", "#ffb800", "#ffffff", "#14532d", "#5eead4", "#b91c1c", "#1f2937"] as const;
  const FUNDO = "__fundo";

  let modelos = $state<Modelo[] | null>(null);
  let erro = $state("");
  let modelo = $state<Modelo | null>(null);
  let desenho = $state<Desenho | null>(null);
  let nome = $state("");
  let versao = $state<string | null>(null);
  let arte = $state<{ frente: string | null; verso: string | null }>({ frente: null, verso: null });
  // a arte enviada e ainda não salva (o nome do arquivo que o servidor devolveu): só passa a valer no "Salvar o modelo"
  let arteNova = $state<{ frente: string | null; verso: string | null }>({ frente: null, verso: null });
  let lado = $state<Lado>("frente");
  let selecionada = $state<string>("nome");
  let material = $state<Material>("PVC");
  let salvando = $state(false);
  let conflito = $state("");
  let erroSalvar = $state("");
  let enviandoArte = $state(false);
  let abertos = $state({ imagens: false, modelos: false });

  // desfazer e refazer: o desenho inteiro guardado a cada mudança terminada
  let historico = $state<string[]>([]);
  let pos = $state(-1);
  let salvo = $state("");
  const sujo = $derived(!!desenho && (JSON.stringify({ nome, desenho }) !== salvo || !!arteNova.frente || !!arteNova.verso));
  // sair da página com mudanças não salvas: o navegador pergunta antes
  $effect(() => {
    if (!sujo) return;
    const f = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  });
  function abrirModelo(id: number) {
    if (id === modeloId) return;
    if (sujo && !window.confirm("Há mudanças não salvas neste modelo. Abrir o outro e perder o que não foi salvo?")) return;
    ir({ tela: "editor", modeloId: id });
  }

  async function carregar() {
    erro = "";
    const r = await pedir<{ modelos: Modelo[] }>("/carteirinhas/modelos");
    if (!r.ok) { if (!r.cancelado) erro = r.mensagem; return; }
    modelos = r.dados.modelos;
    const m = r.dados.modelos.find((x) => x.modeloId === modeloId) ?? null;
    if (!m || !m.desenho) { erro = "Modelo não encontrado."; return; }
    modelo = m;
    desenho = JSON.parse(JSON.stringify(m.desenho)) as Desenho;
    nome = m.nome;
    versao = m.versao;
    arte = { frente: m.arteFrente, verso: m.arteVerso };
    arteNova = { frente: null, verso: null };
    salvo = JSON.stringify({ nome, desenho });
    historico = [foto()];
    pos = 0;
    conflito = "";
    onnome(m.nome);
    const primeira = desenho.lados.frente.camadas.find((c) => c.tipo === "CAMPO" && c.campo === "NOME") ?? desenho.lados.frente.camadas[0];
    selecionada = primeira?.id ?? FUNDO;
  }
  void carregar();

  // cada passo guarda o desenho E a arte (a enviada e ainda não salva): desfazer o envio de uma arte volta a anterior também
  const foto = () => JSON.stringify({ desenho, arte, arteNova });
  function registrar() {
    if (!desenho) return;
    const atual = foto();
    if (historico[pos] === atual) return;
    historico = [...historico.slice(0, pos + 1), atual].slice(-60);
    pos = historico.length - 1;
  }
  function voltarPara(i: number) {
    const e = JSON.parse(historico[i] ?? "null") as { desenho: Desenho; arte: typeof arte; arteNova: typeof arteNova } | null;
    if (!e) return;
    pos = i;
    desenho = e.desenho;
    arte = e.arte;
    arteNova = e.arteNova;
  }
  function desfazer() { if (pos > 0) voltarPara(pos - 1); }
  function refazer() { if (pos < historico.length - 1) voltarPara(pos + 1); }

  const camadas = $derived(desenho ? desenho.lados[lado].camadas : []);
  const atual = $derived(camadas.find((c) => c.id === selecionada) ?? null);
  const temQr = $derived(!!desenho && (["frente", "verso"] as const).some((l) => desenho!.lados[l].camadas.some((c) => c.tipo === "QR" && c.visivel)));
  const exemplo = $derived({ ...EXEMPLO, tipoRotulo: modelo ? (modelo.publico === "OBREIRO" ? "Obreiro" : ROTULO_PUBLICO[modelo.publico]) : "Membro" });

  const NOME_CAMPO: Record<CampoFisica, string> = { NOME: "Nome", NASCIMENTO: "Nascimento", MATRICULA: "Matrícula", MAE: "Mãe", PAI: "Pai", TIPO: "Tipo" };
  function nomeDa(c: Camada): string {
    if (c.tipo === "CAMPO") return c.campo === "TIPO" ? `Tipo: ${exemplo.tipoRotulo.toUpperCase()}` : NOME_CAMPO[c.campo ?? "NOME"];
    if (c.tipo === "TEXTO") return c.id === "cabecalho" ? "Cabeçalho" : (c.texto ?? "Texto").slice(0, 22);
    return { LOGO: "Logo", FOTO: "Foto", QR: "QR fixo", ASSINATURA: "Assinatura", FORMA: "Forma" }[c.tipo] ?? c.tipo;
  }
  const iconeDa = (c: Camada) => (c.tipo === "FOTO" ? "pessoa" : c.tipo === "QR" ? "qr" : c.tipo === "LOGO" ? "igreja" : c.tipo === "FORMA" ? "paleta" : c.tipo === "ASSINATURA" ? "lapis" : "doc");
  const ehTexto = (c: Camada | null) => !!c && (c.tipo === "CAMPO" || c.tipo === "TEXTO" || c.tipo === "ASSINATURA");

  // ---- mudar uma camada (a tela muda na hora; o histórico guarda quando a mudança termina) ----
  function mudar(id: string, m: Partial<Camada>, guardar = true) {
    if (!desenho) return;
    const l = desenho.lados[lado];
    const i = l.camadas.findIndex((c) => c.id === id);
    if (i < 0) return;
    l.camadas[i] = { ...l.camadas[i]!, ...m };
    if (guardar) registrar();
  }
  const arred = (v: number) => Math.round(v * 2) / 2;
  const limite = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

  // ---- arrastar e redimensionar no cartão ----
  type Modo = "mover" | "no" | "ne" | "so" | "se";
  let arraste: { id: string; modo: Modo; x0: number; y0: number; c0: { x: number; y: number; larg: number; alt: number }; mexeu: boolean } | null = null;
  function comecar(e: PointerEvent, c: Camada, modo: Modo) {
    if (e.button !== 0) return;
    selecionada = c.id;
    if (c.travada) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    arraste = { id: c.id, modo, x0: e.clientX, y0: e.clientY, c0: { x: c.x, y: c.y, larg: c.larg, alt: c.alt }, mexeu: false };
  }
  function mover(e: PointerEvent) {
    if (!arraste || !desenho) return;
    const dx = (e.clientX - arraste.x0) / ESC, dy = (e.clientY - arraste.y0) / ESC;
    if (Math.abs(dx) + Math.abs(dy) > 0.2) arraste.mexeu = true;
    const { x, y, larg, alt } = arraste.c0;
    const W = desenho.largura, H = desenho.altura;
    let n = { x, y, larg, alt };
    if (arraste.modo === "mover") n = { ...n, x: limite(arred(x + dx), -2, W - 2), y: limite(arred(y + dy), -2, H - 2) };
    else {
      const oeste = arraste.modo === "no" || arraste.modo === "so", norte = arraste.modo === "no" || arraste.modo === "ne";
      const nl = limite(arred(oeste ? larg - dx : larg + dx), 2, W), na = limite(arred(norte ? alt - dy : alt + dy), 2, H);
      n = { x: oeste ? arred(x + (larg - nl)) : x, y: norte ? arred(y + (alt - na)) : y, larg: nl, alt: na };
    }
    mudar(arraste.id, n, false);
  }
  function soltar() { if (arraste?.mexeu) registrar(); arraste = null; }
  function teclado(e: KeyboardEvent) {
    if (!atual || atual.travada || !desenho) return;
    const passo = e.shiftKey ? 2 : 0.5;
    const d = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] }[e.key];
    if (d) { e.preventDefault(); mudar(atual.id, { x: arred(atual.x + d[0]!), y: arred(atual.y + d[1]!) }); return; }
    if ((e.key === "Delete" || e.key === "Backspace") && (e.target as HTMLElement).tagName !== "INPUT") { e.preventDefault(); tirar(); }
  }

  // ---- as camadas: ordem, mostrar/esconder, acrescentar, tirar ----
  let arrastandoLista = $state<number | null>(null);
  function reordenar(de: number, para: number) {
    if (!desenho || de === para) return;
    const l = desenho.lados[lado].camadas;
    const [c] = l.splice(de, 1);
    if (c) l.splice(para, 0, c);
    registrar();
  }
  function novoId(base: string) {
    const ids = new Set(desenho ? [...desenho.lados.frente.camadas, ...desenho.lados.verso.camadas].map((c) => c.id) : []);
    for (let i = 1; i < 99; i++) { const id = `${base}-${i}`.slice(0, 24); if (!ids.has(id)) return id; }
    return `${base}-${Date.now().toString(36).slice(-6)}`.slice(0, 24);
  }
  function acrescentar(tipo: TipoCamada, campo?: CampoFisica) {
    if (!desenho) return;
    const texto = tipo === "CAMPO" || tipo === "TEXTO" || tipo === "ASSINATURA";
    const escuro = lado === "verso" && !desenho.lados.verso.fundo.degrade && desenho.lados.verso.fundo.cor1 === "#ffffff";
    const base: Camada = { id: novoId(campo ? campo.toLowerCase() : tipo.toLowerCase()), tipo, x: 30, y: 20, larg: tipo === "FOTO" ? 19 : tipo === "QR" ? 18 : 40, alt: tipo === "FOTO" ? 24 : tipo === "QR" ? 18 : tipo === "FORMA" ? 10 : 5, visivel: true, travada: false };
    if (campo) { base.campo = campo; base.rotulo = campo === "NASCIMENTO" ? "Nascimento" : campo === "MATRICULA" ? "Matrícula" : campo === "MAE" ? "Mãe" : campo === "PAI" ? "Pai" : ""; }
    if (tipo === "TEXTO") base.texto = "Texto livre";
    if (tipo === "ASSINATURA") base.texto = "Assinatura";
    if (texto) Object.assign(base, { fonte: "Inter", tamanho: campo === "NOME" ? 10 : 6, cor: escuro ? "#1f2937" : "#ffffff", negrito: campo === "NOME", italico: false, alinhamento: "esq", fundo: null });
    if (tipo === "FORMA") Object.assign(base, { cor: "#ffffff", opacidade: 0.2, raio: 2 });
    if (tipo === "FOTO") Object.assign(base, { raio: 2, borda: null });
    if (tipo === "QR") Object.assign(base, { borda: null });
    desenho.lados[lado].camadas.push(base);
    selecionada = base.id;
    registrar();
  }
  function tirar() {
    if (!desenho || !atual) return;
    desenho.lados[lado].camadas = desenho.lados[lado].camadas.filter((c) => c.id !== atual.id);
    selecionada = FUNDO;
    registrar();
  }

  // ---- a arte de fundo (guardada como veio, em alta resolução) ----
  let arquivo = $state<HTMLInputElement | null>(null);
  async function enviarArte(ev: Event) {
    const f = (ev.currentTarget as HTMLInputElement).files?.[0];
    (ev.currentTarget as HTMLInputElement).value = "";
    if (!f || !desenho) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(f.type)) { ponte().avisar("A arte precisa ser PNG, JPEG ou WebP.", "erro"); return; }
    if (f.size > 10 * 1024 * 1024) { ponte().avisar("A arte passa de 10 MB.", "erro"); return; }
    enviandoArte = true;
    const base64 = await new Promise<string>((ok, falha) => {
      const fr = new FileReader();
      fr.onload = () => ok(String(fr.result).replace(/^data:[^,]*,/, ""));
      fr.onerror = () => falha(fr.error);
      fr.readAsDataURL(f);
    }).catch(() => "");
    if (!base64) { enviandoArte = false; ponte().avisar("Não deu para ler o arquivo.", "erro"); return; }
    // a arte enviada antes e ainda não salva (trocou de ideia): o servidor apaga, se nenhum modelo usar
    const r = await pedir<{ arte: string; arteId: string; mensagem: string }>(`/carteirinhas/arte/${modeloId}`,
      { metodo: "POST", corpo: { lado, tipo: f.type, imagemBase64: base64, substitui: arteNova[lado] ?? undefined } });
    enviandoArte = false;
    if (!r.ok) { avisarFalha(r); return; }
    arte = { ...arte, [lado]: r.dados.arte };
    arteNova = { ...arteNova, [lado]: r.dados.arteId };
    desenho.lados[lado].fundo.arte = true;
    registrar();
    ponte().avisar(r.dados.mensagem, "sucesso");
  }

  // ---- salvar ----
  async function salvar() {
    if (salvando || !desenho || !versao) return;
    salvando = true;
    erroSalvar = "";
    conflito = "";
    const r = await pedir<{ versao: string; mensagem: string }>(`/carteirinhas/modelos/${modeloId}`,
      { metodo: "PUT", corpo: { nome, desenho, versao,
        arteFrente: desenho.lados.frente.fundo.arte ? arteNova.frente ?? undefined : undefined, arteVerso: desenho.lados.verso.fundo.arte ? arteNova.verso ?? undefined : undefined } });
    salvando = false;
    if (!r.ok) {
      if (r.status === 409) conflito = r.mensagem;
      else erroSalvar = r.mensagem;
      return;
    }
    versao = r.dados.versao;
    arteNova = { frente: null, verso: null };
    salvo = JSON.stringify({ nome, desenho });
    ponte().avisar(r.dados.mensagem, "sucesso");
  }
  async function teste() {
    if (!desenho || !modelo) return;
    const m: Modelo = { ...modelo, desenho: JSON.parse(JSON.stringify(desenho)) as Desenho, arteFrente: arte.frente, arteVerso: arte.verso };
    const res = await imprimirCartoes({ cartoes: [{ ...exemplo, membroId: 0, modeloId: m.modeloId, tipo: m.publico }], modelos: [m], material, frenteVerso: true });
    if (!res.ok) ponte().avisar(res.motivo, "erro");
  }

  const regua = (n: number) => Array.from({ length: Math.floor(n / 10) + 1 }, (_, i) => i * 10);
</script>

{#snippet secao(t: string)}<h5 class="sec"><Icone nome="setaBaixo" tam={14} traco={2.4} />{t}</h5>{/snippet}

{#if erro}<Estado tipo="erro" texto={erro} ontentar={carregar} />
{:else if !desenho || !modelo}<Estado tipo="carregando" linhas={6} />
{:else if celular || !geral}
  <div class="pilha">
    <Cabecalho titulo={modelo.nome} sub={celular ? "Os modelos se criam e se mudam no computador." : "Os modelos são da Secretaria Geral: aqui você só confere."} />
    <div class="ver-so">
      <CartaoFisico desenho={desenho} lado="frente" dados={exemplo} arte={arte.frente} mm={celular ? 3.9 : 5} sombra />
      <CartaoFisico desenho={desenho} lado="verso" dados={exemplo} arte={arte.verso} mm={celular ? 3.9 : 5} sombra />
    </div>
  </div>
{:else}
  <div class="pilha">
    <Cabecalho titulo="Editor da carteirinha física" sub="À esquerda, os menus da carteirinha; à direita, o que muda no item escolhido">
      {#snippet acoes()}
        <Opcoes rotulo="Lado do cartão" valor={lado} onescolher={(v) => { lado = v; selecionada = FUNDO; }} opcoes={[{ valor: "frente", rotulo: "Frente" }, { valor: "verso", rotulo: "Verso" }]} />
        <Escolha rotulo="Modelo" prefixo="Modelo: " valor={modeloId} opcoes={(modelos ?? []).map((m) => ({ valor: m.modeloId, rotulo: m.nome, sub: m.ativo ? undefined : "guardado" }))}
          onescolher={(v) => { if (v) abrirModelo(v); }} />
        <button type="button" class="redondo" aria-label="Desfazer" title="Desfazer" disabled={pos <= 0} onclick={desfazer}><Icone nome="voltar" tam={18} traco={2.2} /></button>
        <button type="button" class="redondo" aria-label="Refazer" title="Refazer" disabled={pos >= historico.length - 1} onclick={refazer}><span class="espelho"><Icone nome="voltar" tam={18} traco={2.2} /></span></button>
      {/snippet}
    </Cabecalho>

    <div class="editor">
      <!-- à esquerda: os menus da carteirinha -->
      <aside class="painel esq">
        <div class="topo-painel"><strong>A carteirinha</strong><small>{ROTULO_PUBLICO[modelo.publico]} · {lado}</small></div>
        {@render secao("Camadas")}
        <ul class="camadas">
          <li class:ativa={selecionada === FUNDO}>
            <span class="grip"></span><Icone nome="doc" tam={16} />
            <button type="button" class="nome-camada" onclick={() => (selecionada = FUNDO)}>Arte de fundo</button>
            <span class="ic-dir" title="Sempre embaixo"><Icone nome="cadeado" tam={14} traco={2} /></span>
          </li>
          {#each camadas as c, i (c.id)}
            <li class:ativa={selecionada === c.id} class:oculta={!c.visivel} draggable="true"
              ondragstart={() => (arrastandoLista = i)} ondragover={(e) => e.preventDefault()} ondrop={(e) => { e.preventDefault(); if (arrastandoLista !== null) reordenar(arrastandoLista, i); arrastandoLista = null; }}>
              <span class="grip" title="Arraste para mudar a ordem"><Icone nome="menu" tam={14} traco={2} /></span><Icone nome={iconeDa(c)} tam={16} />
              <button type="button" class="nome-camada" onclick={() => (selecionada = c.id)}>{nomeDa(c)}</button>
              <button type="button" class="ic-dir" aria-label={c.visivel ? `Esconder ${nomeDa(c)}` : `Mostrar ${nomeDa(c)}`} title={c.visivel ? "Esconder" : "Mostrar"} onclick={() => mudar(c.id, { visivel: !c.visivel })}><Icone nome="busca" tam={14} traco={2} /></button>
            </li>
          {/each}
        </ul>
        {@render secao("Campos que não mudam")}
        <div class="campos">
          {#each [["NOME", "Nome"], ["NASCIMENTO", "Nascimento"], ["MATRICULA", "Matrícula"]] as [k, r] (k)}<button type="button" onclick={() => acrescentar("CAMPO", k as CampoFisica)}>+ {r}</button>{/each}
          <button type="button" onclick={() => acrescentar("FOTO")}>+ Foto</button>
          <button type="button" onclick={() => acrescentar("CAMPO", "MAE")}>+ Mãe</button>
          <button type="button" onclick={() => acrescentar("CAMPO", "PAI")}>+ Pai</button>
          <button type="button" disabled={temQr} title={temQr ? "O QR aparece uma vez só (na frente ou no verso)" : undefined} onclick={() => acrescentar("QR")}>+ QR fixo</button>
          <button type="button" onclick={() => acrescentar("ASSINATURA")}>+ Assinatura</button>
          <button type="button" onclick={() => acrescentar("TEXTO")}>+ Texto livre</button>
          <button type="button" onclick={() => acrescentar("FORMA")}>+ Forma</button>
        </div>
        <button type="button" class="dobra" aria-expanded={abertos.imagens} onclick={() => (abertos.imagens = !abertos.imagens)}><Icone nome="setaBaixo" tam={14} traco={2.4} />Imagens</button>
        {#if abertos.imagens}
          <div class="dobra-corpo">
            <p>A arte de fundo do {lado}: PNG, JPEG ou WebP com pelo menos 1.011 × 638 px (300 dpi). Ela entra como veio.</p>
            <input bind:this={arquivo} type="file" accept="image/png,image/jpeg,image/webp" class="escondido" onchange={enviarArte} />
            <Botao tipo="linha" tam="pequeno" icone="mais" ocupado={enviandoArte} onclick={() => arquivo?.click()}>Enviar a arte do {lado}</Botao>
            {#if desenho.lados[lado].fundo.arte}<Botao tipo="texto" tam="pequeno" onclick={() => { desenho!.lados[lado].fundo.arte = false; registrar(); }}>Tirar a arte (fica a cor)</Botao>{/if}
          </div>
        {/if}
        <button type="button" class="dobra" aria-expanded={abertos.modelos} onclick={() => (abertos.modelos = !abertos.modelos)}><Icone nome="setaBaixo" tam={14} traco={2.4} />Modelos</button>
        {#if abertos.modelos}
          <ul class="dobra-corpo outros">
            {#each modelos ?? [] as m (m.modeloId)}
              <li><button type="button" class="link" class:atual={m.modeloId === modeloId} onclick={() => abrirModelo(m.modeloId)}>{m.nome}</button><small>{m.ativo ? `usado por ${numero(m.usadoPor)}` : "guardado"}</small></li>
            {/each}
          </ul>
        {/if}
      </aside>

      <!-- no meio: o cartão, com as réguas em milímetros -->
      <section class="meio" bind:clientWidth={largMesa}>
        <!-- a mesa é uma "aplicação" de verdade (o cartão em edição): recebe o foco e as setas do teclado movem a camada escolhida -->
        <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
        <div class="mesa" role="application" aria-label="Cartão em edição: clique numa camada para escolher; as setas movem 0,5 mm (com Shift, 2 mm)" tabindex="0" onkeydown={teclado}>
          <div class="regua-x" style:width="{desenho.largura * ESC}px">{#each regua(desenho.largura) as n (n)}<span style:left="{n * ESC}px">{n}</span>{/each}</div>
          <div class="regua-y" style:height="{desenho.altura * ESC}px">{#each regua(desenho.altura) as n (n)}<span style:top="{n * ESC}px">{n}</span>{/each}</div>
          <div class="palco" style:width="{desenho.largura * ESC}px" style:height="{desenho.altura * ESC}px"
            onpointerdown={(e) => { if (e.target === e.currentTarget) selecionada = FUNDO; }} onpointermove={mover} onpointerup={soltar} onpointercancel={soltar} role="presentation">
            <CartaoFisico desenho={desenho} {lado} dados={exemplo} arte={arte[lado]} mm={ESC} sombra />
            {#each camadas as c (c.id)}
              {#if c.visivel}
                <div class="alca" class:sel={selecionada === c.id} class:travada={c.travada} role="presentation"
                  style:left="{c.x * ESC}px" style:top="{c.y * ESC}px" style:width="{c.larg * ESC}px" style:height="{c.alt * ESC}px"
                  onpointerdown={(e) => comecar(e, c, "mover")}>
                  {#if selecionada === c.id}
                    <span class="etiqueta">{nomeDa(c)}{ehTexto(c) && c.tamanho ? ` · ${String(c.tamanho).replace(".", ",")} pt` : ""}</span>
                    {#each ["no", "ne", "so", "se"] as k (k)}<span class="no-{k} canto" role="presentation" onpointerdown={(e) => comecar(e, c, k as Modo)}></span>{/each}
                  {/if}
                </div>
              {/if}
            {/each}
            {#if atual}<span class="guia" style:left="{atual.x * ESC}px"></span>{/if}
          </div>
        </div>
        <Aviso tom="info"><strong>Alta resolução do começo ao fim:</strong> o logo e os textos saem do próprio desenho e a arte de fundo entra como veio. A impressão sai do desenho, sem reabrir PNG e salvar de novo — nada perde qualidade.</Aviso>
        {#if conflito}<Aviso tom="alerta">{conflito} {#snippet acao()}<Botao tipo="linha" tam="pequeno" onclick={carregar}>Abrir de novo</Botao>{/snippet}</Aviso>{/if}
        {#if erroSalvar}<Aviso tom="erro">{erroSalvar}</Aviso>{/if}
      </section>

      <!-- à direita: o que muda no item escolhido -->
      <aside class="painel dir">
        <div class="topo-painel"><strong>Personalizar: {atual ? nomeDa(atual) : "Arte de fundo"}</strong><small>o item escolhido</small></div>
        {#if !atual}
          {@const f = desenho.lados[lado].fundo}
          {@render secao("Cor, degradê e arte")}
          <div class="cores">{#each CORES as cor (cor)}<button type="button" class="cor" class:on={f.cor1 === cor} style:background={cor} aria-label="Cor {cor}" onclick={() => { f.cor1 = cor; registrar(); }}></button>{/each}</div>
          <label class="interruptor"><input type="checkbox" checked={f.degrade} onchange={(e) => { f.degrade = e.currentTarget.checked; if (f.degrade && !f.cor2) f.cor2 = "#1e3a8a"; registrar(); }} /><span>Degradê</span></label>
          {#if f.degrade}
            <div class="cores">{#each CORES as cor (cor)}<button type="button" class="cor" class:on={f.cor2 === cor} style:background={cor} aria-label="Segunda cor {cor}" onclick={() => { f.cor2 = cor; registrar(); }}></button>{/each}</div>
            <label class="linha-campo"><span>Ângulo</span><input type="range" min="0" max="360" step="15" value={f.angulo} oninput={(e) => (f.angulo = Number(e.currentTarget.value))} onchange={registrar} /><span class="sv-num">{f.angulo}°</span></label>
          {/if}
          <p class="nota">A arte de fundo (a imagem) fica em "Imagens", à esquerda.</p>
        {:else}
          {#if ehTexto(atual)}
            {@render secao("Texto")}
            {#if atual.tipo === "TEXTO" || atual.tipo === "ASSINATURA"}
              <label class="linha-campo col"><span>Texto</span><input type="text" maxlength="120" value={atual.texto ?? ""} oninput={(e) => mudar(atual.id, { texto: e.currentTarget.value }, false)} onchange={registrar} /></label>
            {:else if atual.campo !== "NOME" && atual.campo !== "TIPO"}
              <label class="linha-campo col"><span>Rótulo antes do valor</span><input type="text" maxlength="30" value={atual.rotulo ?? ""} oninput={(e) => mudar(atual.id, { rotulo: e.currentTarget.value }, false)} onchange={registrar} /></label>
            {/if}
            <div class="linha-campo"><span>Fonte</span><Escolha rotulo="Fonte" valor={atual.fonte ?? "Inter"} opcoes={FONTES.map((f) => ({ valor: f, rotulo: f }))} onescolher={(v) => v && mudar(atual.id, { fonte: v })} /></div>
            <div class="linha-campo"><span>Tamanho</span>
              <span class="passo"><button type="button" aria-label="Diminuir" onclick={() => mudar(atual.id, { tamanho: Math.max(4, (atual.tamanho ?? 8) - 0.5) })}>−</button><strong class="sv-num">{String(atual.tamanho ?? 8).replace(".", ",")} pt</strong><button type="button" aria-label="Aumentar" onclick={() => mudar(atual.id, { tamanho: Math.min(32, (atual.tamanho ?? 8) + 0.5) })}>+</button></span>
            </div>
            <div class="linha-campo"><span>Estilo</span>
              <span class="estilos">
                <button type="button" class:on={atual.negrito} aria-pressed={!!atual.negrito} onclick={() => mudar(atual.id, { negrito: !atual.negrito })}><strong>N</strong></button>
                <button type="button" class:on={atual.italico} aria-pressed={!!atual.italico} onclick={() => mudar(atual.id, { italico: !atual.italico })}><em>I</em></button>
                {#each [["esq", "À esquerda"], ["centro", "Ao centro"], ["dir", "À direita"]] as [a, r] (a)}
                  <button type="button" class:on={(atual.alinhamento ?? "esq") === a} aria-label={r} title={r} onclick={() => mudar(atual.id, { alinhamento: a as Camada["alinhamento"] })}><span class="alinha {a}"><i></i><i></i><i></i></span></button>
                {/each}
              </span>
            </div>
          {/if}
          {#if atual.tipo !== "LOGO" && atual.tipo !== "QR" && atual.tipo !== "FOTO"}
            {@render secao(atual.tipo === "FORMA" ? "Cor e transparência" : "Cor e fundo")}
            <div class="cores">{#each CORES as cor (cor)}<button type="button" class="cor" class:on={atual.cor === cor} style:background={cor} aria-label="Cor {cor}" onclick={() => mudar(atual.id, { cor })}></button>{/each}</div>
            {#if atual.tipo === "FORMA"}
              <label class="linha-campo"><span>Opacidade</span><input type="range" min="0.05" max="1" step="0.05" value={atual.opacidade ?? 1} oninput={(e) => mudar(atual.id, { opacidade: Number(e.currentTarget.value) }, false)} onchange={registrar} /></label>
            {:else}
              <label class="interruptor"><input type="checkbox" checked={!!atual.fundo} onchange={(e) => mudar(atual.id, { fundo: e.currentTarget.checked ? "#334155" : null })} /><span>Fundo atrás do texto</span></label>
            {/if}
          {/if}
          {#if atual.tipo === "FOTO" || atual.tipo === "QR" || atual.tipo === "FORMA"}
            <label class="interruptor"><input type="checkbox" checked={!!atual.borda} onchange={(e) => mudar(atual.id, { borda: e.currentTarget.checked ? "#ffffff" : null })} /><span>Borda</span></label>
          {/if}
          {@render secao("Posição e tamanho")}
          <div class="medidas">
            {#each [["x", "x"], ["y", "y"], ["larg", "larg."], ["alt", "alt."]] as [k, r] (k)}
              <label><span>{r}</span><input type="number" step="0.5" value={atual[k as "x" | "y" | "larg" | "alt"]} disabled={atual.travada}
                onchange={(e) => { const v = Number(e.currentTarget.value); if (Number.isFinite(v)) mudar(atual.id, { [k as "x" | "y" | "larg" | "alt"]: arred(v) }); }} /></label>
            {/each}
            <small>mm</small>
          </div>
          <label class="interruptor"><input type="checkbox" checked={atual.travada} onchange={(e) => mudar(atual.id, { travada: e.currentTarget.checked })} /><span>Travar no lugar</span></label>
          <Botao tipo="texto" tam="pequeno" icone="fechar" onclick={tirar}>Tirar esta camada</Botao>
        {/if}
        <div class="rodape-painel">
          <p class="cartao-info">Cartão: <strong>85,6 × 54 mm</strong> (o de cartão de banco)</p>
          <Opcoes rotulo="Material do teste" valor={material} onescolher={(v) => (material = v)} opcoes={[{ valor: "PAPEL", rotulo: "Papel" }, { valor: "PVC", rotulo: "PVC" }]} />
          <label class="linha-campo col"><span>Nome do modelo</span><input type="text" maxlength="60" bind:value={nome} /></label>
          <Botao tipo="ouro" icone="check" largo desligado={!sujo} ocupado={salvando} onclick={salvar}>Salvar o modelo</Botao>
          {#if sujo}<small class="nao-salvo">Há mudanças ainda não salvas.</small>{/if}
          <button type="button" class="link centro" onclick={teste}>Imprimir um teste</button>
        </div>
      </aside>
    </div>
  </div>
{/if}

<style>
  .pilha { display: flex; flex-direction: column; gap: 14px; }
  .ver-so { display: flex; flex-wrap: wrap; gap: 18px; justify-content: center; }
  .editor { display: grid; grid-template-columns: 270px minmax(0, 1fr) 290px; gap: 14px; align-items: start; }
  .painel { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: var(--sv-raio); padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .topo-painel { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .topo-painel strong { color: var(--sv-titulo); font-size: 16px; }
  .topo-painel small { color: var(--sv-suave); font-size: 12.5px; white-space: nowrap; }
  .sec { display: flex; align-items: center; gap: 6px; margin: 8px 0 2px; font-size: 12px; letter-spacing: .07em; text-transform: uppercase; color: var(--sv-suave); font-weight: 800; border-top: 1px solid var(--sv-linha); padding-top: 10px; }
  .camadas { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .camadas li { display: flex; align-items: center; gap: 8px; padding: 5px 6px; border-radius: 8px; color: var(--sv-texto); border-left: 3px solid transparent; }
  .camadas li.ativa { background: var(--sv-mod-fundo); border-left-color: var(--sv-ouro); }
  .camadas li.oculta .nome-camada { opacity: .5; text-decoration: line-through; }
  .grip { width: 14px; display: flex; color: var(--sv-suave); cursor: grab; }
  .nome-camada { flex: 1; background: none; border: 0; padding: 0; font: inherit; font-size: 14px; text-align: left; color: inherit; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  li.ativa .nome-camada { font-weight: 700; color: var(--sv-titulo); }
  .ic-dir { background: none; border: 0; padding: 2px; color: var(--sv-suave); display: flex; cursor: pointer; }
  .campos { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .campos button { background: var(--sv-sup); border: 1px solid var(--sv-campo-borda); border-radius: 8px; padding: 6px 4px; font: inherit; font-size: 13px; font-weight: 600; color: var(--sv-titulo); cursor: pointer; }
  .campos button:hover:not(:disabled) { background: var(--sv-campo); }
  .campos button:disabled { opacity: .45; cursor: not-allowed; }
  .dobra { display: flex; align-items: center; gap: 6px; background: none; border: 0; border-top: 1px solid var(--sv-linha); padding: 10px 0 2px; font: inherit; font-size: 12px; letter-spacing: .07em; text-transform: uppercase; color: var(--sv-suave); font-weight: 800; cursor: pointer; }
  .dobra[aria-expanded="false"] :global(svg) { transform: rotate(-90deg); }
  .dobra-corpo { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--sv-suave); }
  .dobra-corpo p { margin: 0; }
  .outros { list-style: none; margin: 0; padding: 0; }
  .outros li { display: flex; justify-content: space-between; gap: 8px; }
  .escondido { display: none; }
  .link { background: none; border: 0; padding: 0; font: inherit; color: var(--sv-link); font-weight: 700; cursor: pointer; text-align: left; }
  .link.atual { color: var(--sv-titulo); }
  .link.centro { text-align: center; }
  .meio { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  .mesa { position: relative; background: var(--sv-campo); border: 1px solid var(--sv-borda); border-radius: var(--sv-raio); padding: 34px 20px 24px 40px; display: flex; justify-content: center; overflow: auto; outline: none;
    background-image: radial-gradient(var(--sv-campo-borda) 1px, transparent 1px); background-size: 14px 14px; }
  .mesa:focus-visible { box-shadow: 0 0 0 3px var(--sv-mod-fundo); }
  .palco { position: relative; flex: none; touch-action: none; }
  .regua-x { position: absolute; top: 10px; height: 14px; left: 50%; transform: translateX(-50%); font-size: 11px; color: var(--sv-suave); }
  .regua-x span { position: absolute; transform: translateX(-50%); }
  .regua-y { position: absolute; left: 12px; top: 34px; width: 20px; font-size: 11px; color: var(--sv-link); }
  .regua-y span { position: absolute; transform: translateY(-50%); }
  .alca { position: absolute; cursor: move; border: 1px solid transparent; border-radius: 2px; }
  .alca:hover { border-color: rgba(255, 184, 0, .6); }
  .alca.travada { cursor: default; }
  .alca.sel { border: 2px dashed var(--sv-ouro); }
  .etiqueta { position: absolute; bottom: 100%; left: -2px; margin-bottom: 3px; background: var(--sv-ouro); color: var(--sv-ouro-texto); font-size: 11.5px; font-weight: 800; padding: 1px 7px; border-radius: 4px; white-space: nowrap; pointer-events: none; }
  .canto { position: absolute; width: 10px; height: 10px; background: #fff; border: 2px solid var(--sv-ouro); border-radius: 2px; }
  .no-no { left: -6px; top: -6px; cursor: nwse-resize; }
  .no-ne { right: -6px; top: -6px; cursor: nesw-resize; }
  .no-so { left: -6px; bottom: -6px; cursor: nesw-resize; }
  .no-se { right: -6px; bottom: -6px; cursor: nwse-resize; }
  .guia { position: absolute; top: -24px; bottom: -14px; width: 0; border-left: 1px solid #e11d8f; pointer-events: none; }
  .redondo { width: 40px; height: 40px; border-radius: 10px; border: 1px solid var(--sv-borda); background: var(--sv-sup); color: var(--sv-titulo); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
  .redondo:disabled { opacity: .45; cursor: not-allowed; }
  .espelho { display: inline-flex; transform: scaleX(-1); }
  .linha-campo { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 14px; color: var(--sv-texto); }
  .linha-campo.col { flex-direction: column; align-items: stretch; gap: 4px; }
  .linha-campo input[type="text"] { border: 1px solid var(--sv-campo-borda); background: var(--sv-campo); border-radius: 8px; padding: 7px 9px; font: inherit; color: var(--sv-texto); }
  .linha-campo input[type="range"] { flex: 1; accent-color: var(--sv-marinho); }
  .passo { display: inline-flex; align-items: center; gap: 8px; }
  .passo button { width: 28px; height: 28px; border-radius: 8px; border: 1px solid var(--sv-campo-borda); background: var(--sv-sup); font: inherit; font-weight: 800; color: var(--sv-titulo); cursor: pointer; }
  .estilos { display: inline-flex; gap: 4px; }
  .estilos button { min-width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--sv-campo-borda); background: var(--sv-sup); color: var(--sv-titulo); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font: inherit; }
  .estilos button.on { background: var(--sv-escolha); color: var(--sv-escolha-texto); border-color: var(--sv-escolha); }
  .alinha { display: inline-flex; flex-direction: column; gap: 2px; width: 14px; }
  .alinha i { display: block; height: 2px; background: currentColor; border-radius: 1px; }
  .alinha i:nth-child(2) { width: 65%; }
  .alinha.centro i:nth-child(2) { align-self: center; }
  .alinha.dir i:nth-child(2) { align-self: flex-end; }
  .cores { display: flex; flex-wrap: wrap; gap: 6px; }
  .cor { width: 28px; height: 28px; border-radius: 8px; border: 1px solid var(--sv-campo-borda); cursor: pointer; }
  .cor.on { outline: 3px solid var(--sv-ouro); outline-offset: 1px; }
  .interruptor { display: flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; }
  .interruptor input { width: 18px; height: 18px; accent-color: var(--sv-marinho); }
  .medidas { display: flex; align-items: flex-end; gap: 6px; flex-wrap: wrap; }
  .medidas label { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--sv-suave); }
  .medidas input { width: 54px; border: 1px solid var(--sv-campo-borda); background: var(--sv-campo); border-radius: 8px; padding: 5px 6px; font: inherit; font-size: 13px; color: var(--sv-texto); }
  .medidas small { color: var(--sv-suave); padding-bottom: 6px; }
  .nota { margin: 0; font-size: 12.5px; color: var(--sv-suave); }
  .rodape-painel { display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--sv-linha); padding-top: 10px; margin-top: 6px; }
  .cartao-info { margin: 0; font-size: 13px; color: var(--sv-suave); }
  .cartao-info strong { color: var(--sv-titulo); }
  .nao-salvo { color: var(--sv-pend); font-size: 12.5px; text-align: center; }
  @media (max-width: 1250px) { .editor { grid-template-columns: 240px minmax(0, 1fr); } .painel.dir { grid-column: 1 / -1; } }
</style>
