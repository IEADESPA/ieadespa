<!-- 10. MINHA VIDA NA IGREJA (rodada 10, versão final): o membro vê TUDO o que é dele, sem pedir. No centro a LINHA DO TEMPO primeiro e, embaixo,
     o que ele muda sozinho e o que sugere; à direita o menu "Minha ficha" completo (cresce para baixo). No celular, pílulas no alto e o ← do topo.
     As sugestões seguem o fluxo de 4 etapas (rodada 10): o que posso mudar → mudo sozinho → sugiro o resto → a secretaria confere. -->
<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { pedir, qs, avisarFalha } from "../../comum/api";
  import { ponte } from "../../comum/ponte";
  import { tela } from "../../comum/tela.svelte";
  import { anoDe, dataBr, iniciais, mesAnoBr, haQuanto } from "../../comum/formato";
  import Botao from "../../comum/Botao.svelte";
  import Cartao from "../../comum/Cartao.svelte";
  import Chip from "../../comum/Chip.svelte";
  import Icone from "../../comum/Icone.svelte";
  import Dado from "../../comum/Dado.svelte";
  import Aviso from "../../comum/Aviso.svelte";
  import Estado from "../../comum/Estado.svelte";
  import Etapas from "../../comum/Etapas.svelte";
  import Campo from "../../comum/Campo.svelte";
  import Escolha from "../../comum/Escolha.svelte";
  import Pilulas from "../../comum/Pilulas.svelte";
  import LinhaTempo from "../../comum/LinhaTempo.svelte";
  import { situacaoDe, textoDoValor } from "../rotulos";
  import type { EventoVida, VidaEspiritual } from "../tipos";

  interface Props { parteInicial: string }
  let { parteInicial }: Props = $props();

  type Parte = "linha" | "dados" | "familia" | "vida" | "igreja" | "contato" | "transferencias" | "sugestoes" | "sugerir";
  const MENU: readonly { chave: Parte | "carteirinha" | "ebd"; rotulo: string; icone: string }[] = [
    { chave: "linha", rotulo: "Minha linha do tempo", icone: "relogio" }, { chave: "dados", rotulo: "Meus dados", icone: "pessoa" },
    { chave: "familia", rotulo: "Família", icone: "pessoas" }, { chave: "vida", rotulo: "Vida espiritual", icone: "coracao" },
    { chave: "igreja", rotulo: "Na igreja", icone: "igreja" }, { chave: "contato", rotulo: "Contato e endereço", icone: "celular" },
    { chave: "carteirinha", rotulo: "Minha carteirinha", icone: "cartao" }, { chave: "transferencias", rotulo: "Minhas transferências", icone: "seta" },
    { chave: "sugestoes", rotulo: "Minhas sugestões", icone: "lapis" }, { chave: "ebd", rotulo: "Escola Bíblica", icone: "livro" }
  ];
  const TITULOS: Record<Parte, string> = { linha: "Minha linha do tempo", dados: "Meus dados", familia: "Família", vida: "Vida espiritual", igreja: "Na igreja",
    contato: "Contato e endereço", transferencias: "Minhas transferências", sugestoes: "Minhas sugestões", sugerir: "Sugerir alteração" };

  const mat = ponte().sessao().matricula;
  const PARTES: readonly Parte[] = ["linha", "dados", "familia", "vida", "igreja", "contato", "transferencias", "sugestoes", "sugerir"];
  const inicial = untrack(() => String(parteInicial ?? "linha"));
  let parte = $state<Parte>((PARTES as readonly string[]).includes(inicial.split(":")[0] ?? "") ? (inicial.split(":")[0] as Parte) : "linha");
  let campoSugerir = $state<string | null>(inicial.startsWith("sugerir:") ? inicial.slice(8) : null);

  interface CampoMembro { chave: string; rotulo: string; grupo: string; tipo: string; opcoes: string[] | null; modo: "MUDA" | "SUGERE" | "NAO"; sugestaoPendente: boolean }
  interface MeusDados { dados: Record<string, string | null>; campos: CampoMembro[] }
  interface MinhaLinha { nome: string; situacao: string | null; status: string | null; congregacao: string | null; dataAdmissao: string | null; vidaEspiritual: VidaEspiritual | null; eventos: EventoVida[] }
  interface MinhaSug { solicitacaoId: number; dataSolicitacao?: string; campos: { nomeCampo: string; rotulo: string; valorProposto: string | null; status: string; motivo?: string | null }[] }
  interface MeuPedido { transferenciaId: number; origemNome: string; destinoNome: string; situacao: string; pedidoEm: string; motivoRecusa?: string | null; podeCancelar?: boolean }

  let md = $state<MeusDados | null>(null);
  let linha = $state<MinhaLinha | null>(null);
  let sugs = $state<MinhaSug[]>([]);
  let transf = $state<{ congregacaoAtual: string | null; pedidos: MeuPedido[]; congregacoes: { congregacaoId: number; nome: string }[] } | null>(null);
  let vinculos = $state<{ vinculoId: number; outraPessoaNome: string; rotulo: string }[] | null>(null);
  let erro = $state("");
  // cada leitura com o seu erro; numa releitura que falha, o que já estava na tela fica (nunca some logo depois do "salvo")
  const falhas = $state({ dados: "", linha: "", sugestoes: "", transf: "", vinculos: "" });

  async function carregar() {
    erro = "";
    const m = encodeURIComponent(mat);
    const [d, l, s, t] = await Promise.all([
      pedir<MeusDados>(`/meus-dados/${m}`), pedir<MinhaLinha>(`/minha-linha-do-tempo/${m}` + qs({ porPagina: 200 })),
      pedir<MinhaSug[]>(`/solicitacoes-edicao/${m}`), pedir<NonNullable<typeof transf>>(`/minha-transferencia/${m}`)
    ]);
    if (!d.ok && !l.ok && !md && !linha) { erro = d.mensagem; return; }
    if (d.ok) { md = d.dados; falhas.dados = ""; } else falhas.dados = d.mensagem;
    if (l.ok) { linha = l.dados; falhas.linha = ""; } else falhas.linha = l.mensagem;
    if (s.ok && Array.isArray(s.dados)) { sugs = s.dados; falhas.sugestoes = ""; } else if (!s.ok) falhas.sugestoes = s.mensagem;
    if (t.ok) { transf = t.dados; falhas.transf = ""; } else falhas.transf = t.mensagem;
  }
  void carregar();
  // como no desenho: o menu principal recolhido (o trilho) enquanto a ficha está aberta; ao sair, volta a escolha da pessoa
  onMount(() => { ponte().menuRecolhido(true); return () => ponte().menuRecolhido(null); });
  $effect(() => {
    if (parte === "familia" && vinculos === null) {
      void lerVinculos();
    }
  });

  async function lerVinculos() {
    const r = await pedir<unknown>(`/meus-vinculos/${encodeURIComponent(mat)}`);
    if (!r.ok) { falhas.vinculos = r.mensagem; return; }
    falhas.vinculos = "";
    vinculos = (Array.isArray(r.dados) ? r.dados : ((r.dados as { vinculos?: unknown[] }).vinculos ?? [])) as typeof vinculos;
  }
  // o caminho do topo ("Minha vida na igreja › Minha linha do tempo") e o ← no celular (volta ao Início)
  $effect(() => {
    const p = ponte();
    const titulo = parte === "sugerir" && campoSugerir ? `Sugerir: ${rotuloDe(campoSugerir)}` : TITULOS[parte];
    p.trilha([{ rotulo: "Minha vida na igreja", ir: () => irParte("linha") }, { rotulo: titulo }], "Minha vida na igreja",
      parte === "linha" ? () => p.irMeuPainel("perfil") : () => irParte("linha"));
  });
  function irParte(k: string) {
    if (k === "carteirinha") { ponte().irMeuPainel("credencial"); return; }
    if (k === "ebd") { ponte().irMeuPainel("minhaformacao"); return; }
    parte = k as Parte;
    if (k !== "sugerir") campoSugerir = null;
    document.querySelector(".conteudo")?.scrollTo?.({ top: 0 });
  }
  function sugerirCampo(chave: string) { campoSugerir = chave; parte = "sugerir"; editando = null; }

  const dados = $derived(md?.dados ?? {});
  const campo = (k: string) => md?.campos.find((c) => c.chave === k) ?? null;
  const rotuloDe = (k: string) => campo(k)?.rotulo ?? k;
  const pendentes = $derived(sugs.reduce((n, s) => n + s.campos.filter((c) => c.status === "PENDENTE").length, 0));
  const ve = $derived(linha?.vidaEspiritual ?? null);
  const sit = $derived(linha ? situacaoDe({ status: linha.status, situacaoMembro: linha.situacao }) : null);
  const eventos = $derived(linha?.eventos ?? []);

  // ---- o que ele muda sozinho (o contato, o endereço e o que estiver vazio): edição na hora ----
  let editando = $state<"contato" | string | null>(null);
  const ed = $state({ telefone: "", email: "", logradouro: "", numero: "", complemento: "", bairroTexto: "", cidade: "", uf: "PA", cep: "", valor: "" });
  let salvando = $state(false);
  let erroEd = $state("");
  function abrirContato() {
    editando = "contato"; erroEd = "";
    Object.assign(ed, { telefone: dados.telefone ?? "", email: dados.email ?? "", logradouro: dados.enderecoLogradouro ?? "", numero: dados.enderecoNumero ?? "",
      complemento: dados.enderecoComplemento ?? "", bairroTexto: dados.enderecoBairroTexto ?? dados.enderecoBairroNome ?? "", cidade: dados.enderecoCidade ?? "", uf: dados.enderecoUF ?? "PA", cep: dados.enderecoCep ?? "" });
  }
  async function salvarContato() {
    if (salvando) return;
    salvando = true; erroEd = "";
    const corpo: Record<string, unknown> = { telefone: ed.telefone.trim() || null, email: ed.email.trim() || null };
    if (ed.logradouro.trim() || ed.bairroTexto.trim() || ed.cidade.trim()) corpo.enderecoPartes = { logradouro: ed.logradouro.trim(), numero: ed.numero.trim(), complemento: ed.complemento.trim(), bairroTexto: ed.bairroTexto.trim(), cidade: ed.cidade.trim(), uf: ed.uf.trim(), cep: ed.cep.trim() };
    const r = await pedir<{ mensagem?: string }>(`/meus-dados/${encodeURIComponent(mat)}`, { metodo: "POST", corpo });
    salvando = false;
    if (!r.ok) { erroEd = r.mensagem; return; }
    ponte().avisar("Mudou na hora. Fica registrado na sua ficha.", "sucesso");
    editando = null;
    void carregar();
  }
  async function salvarVazio(chave: string) {
    if (salvando) return;
    salvando = true; erroEd = "";
    const r = await pedir<{ mensagem?: string }>(`/meus-dados/${encodeURIComponent(mat)}`, { metodo: "POST", corpo: { [chave]: ed.valor.trim() || null } });
    salvando = false;
    if (!r.ok) { erroEd = r.mensagem; return; }
    ponte().avisar("Salvo na sua ficha.", "sucesso");
    editando = null;
    void carregar();
  }
  // ---- o que ele sugere: vai para a secretaria conferir ----
  let valorSug = $state("");
  let enviando = $state(false);
  let erroSug = $state("");
  $effect(() => { void campoSugerir; valorSug = ""; erroSug = ""; });
  async function enviarSugestao() {
    if (enviando) return;
    if (!campoSugerir || !valorSug.trim()) { erroSug = "Escreva o valor certo."; return; }
    enviando = true; erroSug = "";
    const r = await pedir<{ mensagem?: string }>(`/solicitacoes-edicao/${encodeURIComponent(mat)}`, { metodo: "POST", corpo: { campos: { [campoSugerir]: valorSug.trim() } } });
    enviando = false;
    if (!r.ok) { erroSug = r.mensagem; return; }
    ponte().avisar("Enviada para a secretaria. Você recebe o aviso quando ela responder.", "sucesso");
    await carregar();
    irParte("sugestoes");
  }
  // ---- a minha transferência ----
  let destinoId = $state<number | null>(null);
  let motivoTr = $state("");
  async function pedirTransferencia() {
    if (!destinoId || enviando) return;
    enviando = true;
    const r = await pedir<{ mensagem?: string }>(`/minha-transferencia/${encodeURIComponent(mat)}`, { metodo: "POST", corpo: { congregacaoDestinoId: destinoId, motivo: motivoTr.trim() || null } });
    enviando = false;
    if (!r.ok) { avisarFalha(r); return; }
    ponte().avisar(r.dados.mensagem ?? "Pedido enviado.", "sucesso");
    destinoId = null; motivoTr = "";
    void carregar();
  }
  let cancelando = $state(false);
  async function cancelarTransferencia(id: number) {
    if (cancelando) return;
    cancelando = true;
    const r = await pedir<{ mensagem?: string }>(`/minha-transferencia/${encodeURIComponent(mat)}/cancelar`, { metodo: "POST", corpo: { transferenciaId: id } });
    cancelando = false;
    if (!r.ok) { avisarFalha(r); return; }
    ponte().avisar("Pedido cancelado.", "sucesso");
    void carregar();
  }
  const conversao = $derived(ve?.conversao?.data ? [ve.conversao.aproximada ? anoDe(ve.conversao.data) : mesAnoBr(ve.conversao.data), ve.conversao.detalhe].filter(Boolean).join(" · ") : "");
  const batAguas = $derived(ve?.batismoAguas?.data ? [dataBr(ve.batismoAguas.data), ve.batismoAguas.local].filter(Boolean).join(" · ") : "");
  const batES = $derived(ve?.batismoEspiritoSanto?.data ? dataBr(ve.batismoEspiritoSanto.data) : "");
  const endereco = $derived(dados.endereco ?? "");
  const MODO_ROTULO = { MUDA: "muda sozinho", SUGERE: "sugere", NAO: "a secretaria cuida" } as const;
  const grupos = $derived([...new Set((md?.campos ?? []).map((c) => c.grupo))]);
  const pedidoPendente = $derived((transf?.pedidos ?? []).find((p) => p.situacao === "PENDENTE") ?? null);
</script>

{#snippet acaoCampo(chave: string, vazioTexto: string)}
  {@const c = campo(chave)}
  {#if c?.sugestaoPendente}<span class="pend">esperando a secretaria</span>
  {:else if c?.modo === "MUDA"}<button type="button" class="acao muda" onclick={() => { if (chave === "telefone" || chave === "email" || chave === "endereco") { irParte("contato"); abrirContato(); } else { editando = chave; ed.valor = dados[chave] ?? ""; erroEd = ""; irParte("dados"); } }}>{vazioTexto}</button>
  {:else if c?.modo === "SUGERE"}<button type="button" class="acao" onclick={() => sugerirCampo(chave)}>Sugerir</button>{/if}
{/snippet}

{#snippet blocoEspiritual()}
  <Cartao titulo="Vida espiritual" icone="coracao" pad="justo">
    <div class="lista">
      <Dado rotulo="Conversão" valor={conversao} vazio="ainda não informada" />
      <Dado rotulo="Batismo nas águas" valor={batAguas} vazio="ainda não informado">{#snippet acao()}{@render acaoCampo("dataBatismo", batAguas ? "Mudar" : "Completar")}{/snippet}</Dado>
      <Dado rotulo="Batismo no Espírito" valor={batES} vazio="ainda não informado" />
    </div>
  </Cartao>
{/snippet}

{#snippet blocoContato()}
  <Cartao titulo="Contato e endereço" icone="celular" pad="justo">
    <div class="lista">
      <Dado rotulo="Celular" valor={dados.telefone} vazio="não informado">{#snippet acao()}{@render acaoCampo("telefone", "Mudar")}{/snippet}</Dado>
      <Dado rotulo="E-mail" valor={dados.email} vazio="não informado">{#snippet acao()}{@render acaoCampo("email", "Mudar")}{/snippet}</Dado>
      <Dado rotulo="Endereço" valor={endereco} vazio="não informado">{#snippet acao()}{@render acaoCampo("endereco", "Mudar")}{/snippet}</Dado>
    </div>
  </Cartao>
{/snippet}

{#snippet conteudo()}
  {#if parte === "linha"}
    <Cartao titulo="A minha vida na Igreja" nota={tela.celular ? "tudo, por inteiro" : "tudo, por inteiro · você vê o mesmo que a secretaria"}>
      {#if falhas.linha && !linha}<Estado tipo="erro" texto={falhas.linha} ontentar={carregar} />{:else if !linha}<Estado tipo="carregando" linhas={5} />{:else if eventos.length}<LinhaTempo {eventos} max={6} />{:else}<Estado tipo="vazio" texto="Nada registrado ainda." />{/if}
      {#if eventos.length > 6}<Botao tipo="texto" onclick={() => irParte("vida")}>Ver tudo ({eventos.length})</Botao>{/if}
    </Cartao>
    {#if !tela.celular}<div class="duas">{@render blocoEspiritual()}{@render blocoContato()}</div>{/if}
  {:else if parte === "dados"}
    <Etapas rotulo="O que você pode fazer" passos={["O que posso mudar", "Mudo sozinho", "Sugiro o resto", "A secretaria confere"]} atual={0} />
    <p class="expl">O que <strong>você</strong> pode fazer com os seus dados. O que é seu de mudar, você muda aqui mesmo; o resto você sugere, e a secretaria confere.</p>
    {#if falhas.dados && !md}<Estado tipo="erro" texto={falhas.dados} ontentar={carregar} />{:else if !md}<Estado tipo="carregando" linhas={6} />{:else}
      {#each grupos as g (g)}
        <Cartao titulo={g} pad="justo">
          <div class="lista">
            {#each md.campos.filter((c) => c.grupo === g) as c (c.chave)}
              {#if editando === c.chave}
                <div class="ed-linha">
                  <span class="rot">{c.rotulo}</span>
                  {#if c.opcoes}<Escolha rotulo="Escolha" estilo="campo" larga valor={ed.valor || null} opcoes={c.opcoes.map((o) => ({ valor: o, rotulo: textoDoValor(c.chave, o) }))} onescolher={(v) => (ed.valor = v ?? "")} />
                  {:else}<input class="c" type={c.tipo === "data" ? "date" : "text"} aria-label={c.rotulo} bind:value={ed.valor} />{/if}
                  <Botao tipo="ouro" icone="check" ocupado={salvando} onclick={() => void salvarVazio(c.chave)}>Salvar</Botao>
                  <Botao tipo="linha" onclick={() => (editando = null)}>Cancelar</Botao>
                  {#if erroEd}<p class="erro">{erroEd}</p>{/if}
                </div>
              {:else}
                <Dado rotulo={c.rotulo} valor={textoDoValor(c.chave, dados[c.chave] ?? null)} vazio="vazio">
                  {#snippet acao()}
                    <span class="modo {c.modo}">{MODO_ROTULO[c.modo]}</span>
                    {#if c.sugestaoPendente}<span class="pend">esperando a secretaria</span>
                    {:else if c.modo === "MUDA"}<button type="button" class="acao muda" onclick={() => { if (c.grupo === "Contato") { irParte("contato"); abrirContato(); } else { editando = c.chave; ed.valor = dados[c.chave] ?? ""; erroEd = ""; } }}>Mudar</button>
                    {:else if c.modo === "SUGERE"}<button type="button" class="acao" onclick={() => sugerirCampo(c.chave)}>Sugerir</button>{/if}
                  {/snippet}
                </Dado>
              {/if}
            {/each}
          </div>
        </Cartao>
      {/each}
      <Aviso tom="info">A congregação muda pela transferência; o cargo e a situação, a secretaria cuida.</Aviso>
    {/if}
  {:else if parte === "contato"}
    <Etapas rotulo="O que você pode fazer" passos={["O que posso mudar", "Mudo sozinho", "Sugiro o resto", "A secretaria confere"]} atual={1} />
    {#if editando === "contato"}
      <section class="bloco-ouro">
        <div class="bo-topo"><Icone nome="celular" tam={19} traco={2} /><strong>Contato e endereço</strong><span class="verde">você muda sozinho</span></div>
        <div class="duas-c">
          <Campo rotulo="Celular" tipo="tel" valor={ed.telefone} oninput={(v) => (ed.telefone = v)} dica={dados.telefone ? `antes: ${dados.telefone}` : undefined} />
          <Campo rotulo="E-mail" tipo="email" valor={ed.email} oninput={(v) => (ed.email = v)} dica={dados.email ? `antes: ${dados.email}` : undefined} />
          <Campo rotulo="Rua" valor={ed.logradouro} oninput={(v) => (ed.logradouro = v)} />
          <Campo rotulo="Número" valor={ed.numero} oninput={(v) => (ed.numero = v)} />
          <Campo rotulo="Bairro" valor={ed.bairroTexto} oninput={(v) => (ed.bairroTexto = v)} />
          <Campo rotulo="Cidade" valor={ed.cidade} oninput={(v) => (ed.cidade = v)} />
        </div>
        {#if erroEd}<p class="erro" role="alert">{erroEd}</p>{/if}
        <div class="bo-botoes"><Botao tipo="linha" tam="pequeno" onclick={() => (editando = null)}>Cancelar</Botao><Botao tipo="ouro" icone="check" ocupado={salvando} onclick={() => void salvarContato()}>Salvar</Botao></div>
        <small class="nota">Muda na hora, sem esperar ninguém. Fica registrado na ficha quem mudou e quando.</small>
      </section>
    {:else}
      {@render blocoContato()}
      <div><Botao tipo="ouro" icone="lapis" onclick={abrirContato}>Mudar o contato e o endereço</Botao></div>
    {/if}
  {:else if parte === "sugerir" && campoSugerir}
    {@const c = campo(campoSugerir)}
    <Etapas rotulo="O que você pode fazer" passos={["O que posso mudar", "Mudo sozinho", "Sugiro o resto", "A secretaria confere"]} atual={2} />
    <section class="form">
      <h2 class="tit-sug">Sugerir alteração: {c?.rotulo ?? campoSugerir}</h2>
      <Dado rotulo="Hoje está" valor={textoDoValor(campoSugerir, dados[campoSugerir] ?? null)} vazio="vazio" />
      {#if c?.opcoes}<div class="grupo"><span class="rot-f">O certo é <span class="obr">*</span></span><Escolha rotulo="Escolha" estilo="campo" larga valor={valorSug || null} opcoes={c.opcoes.map((o) => ({ valor: o, rotulo: textoDoValor(c.chave, o) }))} onescolher={(v) => (valorSug = v ?? "")} /></div>
      {:else}<Campo rotulo="O certo é" obrigatorio tipo={c?.tipo === "data" ? "date" : "text"} valor={valorSug} oninput={(v) => (valorSug = v)} />{/if}
      <div class="anexo"><Icone nome="doc" tam={18} traco={2} /><span>Anexar a foto do documento</span><small>em construção</small></div>
      {#if erroSug}<p class="erro" role="alert">{erroSug}</p>{/if}
      <div class="bo-botoes"><Botao tipo="ouro" icone="check" ocupado={enviando} onclick={() => void enviarSugestao()}>Enviar para a secretaria</Botao></div>
    </section>
    <Aviso tom="info">Vai para a <strong>secretaria de {linha?.congregacao ?? "sua congregação"}</strong>. Você acompanha em "Minhas sugestões" e recebe o aviso quando for aplicada ou recusada (com o motivo).</Aviso>
  {:else if parte === "sugestoes"}
    <Etapas rotulo="O caminho da sugestão" passos={["O que posso mudar", "Mudo sozinho", "Sugiro o resto", "A secretaria confere"]} atual={3} />
    <Cartao titulo="Minhas sugestões">
      {#snippet direita()}<Botao tipo="texto" onclick={() => irParte("dados")}>Sugerir outra</Botao>{/snippet}
      {#if falhas.sugestoes && !sugs.length}<Estado tipo="erro" texto={falhas.sugestoes} ontentar={carregar} />{:else if !sugs.length}<Estado tipo="vazio" texto="Você ainda não sugeriu nenhuma mudança." />{:else}
        <ul class="sugs">
          {#each sugs.flatMap((s) => s.campos.map((c) => ({ s, c }))) as x, i (i)}
            <li><span><strong>{x.c.rotulo}:</strong> {textoDoValor(x.c.nomeCampo, x.c.valorProposto) || "—"}{#if x.c.motivo}<small>{x.c.motivo}</small>{/if}</span>
              <Chip tom={x.c.status === "PENDENTE" ? "pendente" : x.c.status === "APROVADO" ? "ok" : "atrasado"}>{x.c.status === "PENDENTE" ? "esperando a secretaria" : x.c.status === "APROVADO" ? "aplicada" : "recusada"}</Chip></li>
          {/each}
        </ul>
      {/if}
    </Cartao>
  {:else if parte === "vida"}
    {@render blocoEspiritual()}
    <Cartao titulo="Toda a minha linha do tempo">{#if eventos.length}<LinhaTempo {eventos} />{:else}<Estado tipo="vazio" texto="Nada registrado ainda." />{/if}</Cartao>
  {:else if parte === "igreja"}
    <Cartao titulo="Na igreja" icone="igreja" pad="justo">
      <div class="lista">
        <Dado rotulo="Congregação" valor={linha?.congregacao ?? transf?.congregacaoAtual ?? ""}>{#snippet acao()}<button type="button" class="acao" onclick={() => irParte("transferencias")}>Pedir transferência</button>{/snippet}</Dado>
        <Dado rotulo="Membro desde" valor={dataBr(linha?.dataAdmissao ?? dados.dataAdmissao)} vazio="não informado">{#snippet acao()}{@render acaoCampo("dataAdmissao", "Completar")}{/snippet}</Dado>
        <Dado rotulo="Como entrou" valor={textoDoValor("formaAdmissao", dados.formaAdmissao ?? null)} vazio="não informado">{#snippet acao()}{@render acaoCampo("formaAdmissao", "Completar")}{/snippet}</Dado>
        <Dado rotulo="Situação" valor={sit?.rotulo ?? ""} sub="a secretaria cuida" />
      </div>
    </Cartao>
  {:else if parte === "familia"}
    <Cartao titulo="Filiação" icone="pessoas" pad="justo">
      <div class="lista">
        <Dado rotulo="Mãe" valor={dados.nomeMae} vazio="não informada">{#snippet acao()}{@render acaoCampo("nomeMae", "Completar")}{/snippet}</Dado>
        <Dado rotulo="Pai" valor={dados.nomePai} vazio="não informado">{#snippet acao()}{@render acaoCampo("nomePai", "Completar")}{/snippet}</Dado>
      </div>
    </Cartao>
    <Cartao titulo="Parentes ligados à minha ficha">
      {#if falhas.vinculos}<Estado tipo="erro" texto={falhas.vinculos} ontentar={lerVinculos} />{:else if vinculos === null}<Estado tipo="carregando" linhas={2} />{:else if !vinculos.length}<Estado tipo="vazio" texto="Nenhum parente ligado." />{:else}
        <ul class="sugs">{#each vinculos as v (v.vinculoId)}<li><span><strong>{v.outraPessoaNome}</strong> · {v.rotulo}</span></li>{/each}</ul>{/if}
    </Cartao>
    {#if eventos.filter((e) => e.categoria === "FAMILIA").length}<Cartao titulo="Casamento e filhos"><LinhaTempo eventos={eventos.filter((e) => e.categoria === "FAMILIA")} /></Cartao>{/if}
  {:else if parte === "transferencias"}
    <Cartao titulo="Minhas transferências" nota={transf?.congregacaoAtual ? `hoje: ${transf.congregacaoAtual}` : undefined}>
      {#if falhas.transf && !transf}<Estado tipo="erro" texto={falhas.transf} ontentar={carregar} />{:else if !transf}<Estado tipo="carregando" linhas={2} />{:else}
        {#if transf.pedidos.length}
          <ul class="sugs">{#each transf.pedidos as p (p.transferenciaId)}
            <li><span><strong>{p.origemNome} → {p.destinoNome}</strong><small>{haQuanto(p.pedidoEm)}{p.motivoRecusa ? ` · ${p.motivoRecusa}` : ""}</small></span>
              <Chip tom={p.situacao === "PENDENTE" ? "pendente" : p.situacao === "CONCLUIDA" ? "ok" : "atrasado"}>{p.situacao === "PENDENTE" ? "esperando" : p.situacao === "CONCLUIDA" ? "concluída" : p.situacao === "RECUSADA" ? "recusada" : "cancelada"}</Chip>
              {#if p.situacao === "PENDENTE" && p.podeCancelar}<Botao tipo="texto" ocupado={cancelando} onclick={() => void cancelarTransferencia(p.transferenciaId)}>Cancelar</Botao>{/if}</li>
          {/each}</ul>
        {:else}<Estado tipo="vazio" texto="Nenhum pedido de transferência." />{/if}
        {#if !pedidoPendente}
          <div class="pedir-tr">
            <div class="grupo"><span class="rot-f">Pedir para ir para</span><Escolha rotulo="Escolha a congregação" estilo="campo" larga valor={destinoId} opcoes={transf.congregacoes.map((c) => ({ valor: c.congregacaoId, rotulo: c.nome }))} onescolher={(v) => (destinoId = v)} /></div>
            <Campo rotulo="Motivo" opcional valor={motivoTr} oninput={(v) => (motivoTr = v)} />
            <Botao tipo="ouro" desligado={!destinoId} ocupado={enviando} onclick={() => void pedirTransferencia()}>Pedir a transferência</Botao>
          </div>
        {/if}
      {/if}
    </Cartao>
  {/if}
{/snippet}

<div class="sv minha" class:celular={tela.celular}>
  {#if tela.celular}
    <Pilulas rotulo="Minha ficha" ativa={parte === "linha" || parte === "dados" || parte === "sugestoes" ? parte : null} onescolher={(k) => irParte(k)}
      itens={[{ chave: "linha", rotulo: "Linha do tempo" }, { chave: "dados", rotulo: "Dados" }, { chave: "carteirinha", rotulo: "Carteirinha" }, { chave: "sugestoes", rotulo: "Sugestões", n: pendentes }]} />
  {/if}
  <div class="corpo">
    {#if erro}<Estado tipo="erro" texto={erro} ontentar={carregar} />{:else}
      <div class="centro">
        <div class="cab">
          <div class="foto"><strong>{iniciais(linha?.nome ?? ponte().sessao().nome)}</strong><span>foto</span></div>
          <div class="quem">
            <h1>{linha?.nome ?? ponte().sessao().nome}</h1>
            <p class="sv-num">Matrícula {mat}{linha?.congregacao ? ` · ${linha.congregacao}` : ""}{linha?.dataAdmissao ? ` · membro desde ${anoDe(linha.dataAdmissao)}` : ""}</p>
            {#if sit && linha?.situacao}<div><Chip tom={sit.tom}>{sit.rotulo}</Chip></div>{/if}
          </div>
        </div>
        {@render conteudo()}
      </div>
      {#if !tela.celular}
        <nav class="sub" aria-label="Minha ficha">
          <span class="sub-tit">Minha ficha</span>
          {#each MENU as m (m.chave)}
            <button type="button" class:ativo={m.chave === parte || (parte === "sugerir" && m.chave === "sugestoes")} aria-current={m.chave === parte ? "page" : undefined} onclick={() => irParte(m.chave)}>
              <Icone nome={m.icone} tam={17} traco={2} /><span>{m.rotulo}</span>{#if m.chave === "sugestoes" && pendentes}<span class="n">{pendentes}</span>{/if}
            </button>
          {/each}
          <small class="sub-nota">Tudo o que é seu, sem pedir: muda o contato sozinho e sugere o resto.</small>
        </nav>
      {/if}
    {/if}
  </div>
</div>

<style>
  .minha { display: flex; flex-direction: column; }
  .corpo { display: flex; gap: 16px; align-items: flex-start; }
  .centro { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 14px; }
  .cab { display: flex; gap: 14px; align-items: center; }
  .foto { width: 76px; height: 84px; border-radius: 12px; background: linear-gradient(160deg, #C9D8FB, #7EA2EE); color: #0A2342; display: flex; flex-direction: column; align-items: center; justify-content: center; flex: none; }
  .foto strong { font-size: 24px; font-weight: 800; line-height: 1; }
  .foto span { font-size: 11px; margin-top: 4px; opacity: .8; }
  .quem { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  h1 { font-size: 22px; font-weight: 800; color: var(--sv-titulo); }
  .quem p { font-size: 13.5px; color: var(--sv-suave); }
  .duas { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; }
  .lista { display: flex; flex-direction: column; }
  .lista :global(.dado:first-child) { border-top: 0; }
  .acao { border: 0; background: transparent; font-weight: 700; font-size: 13.5px; color: var(--sv-suave); cursor: pointer; padding: 6px 4px; }
  .acao.muda { color: var(--sv-link); }
  .pend { font-size: 12.5px; font-weight: 700; color: var(--sv-pend); }
  .modo { font-size: 12px; font-weight: 700; padding: 2px 8px; border-radius: 10px; margin-right: 6px; }
  .modo.MUDA { background: var(--sv-ok-fundo); color: var(--sv-ok); }
  .modo.SUGERE { background: var(--sv-pend-fundo); color: var(--sv-pend); }
  .modo.NAO { background: var(--sv-linha); color: var(--sv-suave); }
  .expl { font-size: 14px; color: var(--sv-texto); }
  .ed-linha { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 0; border-top: 1px solid var(--sv-linha); background: var(--sv-ouro-tinta); margin: 0 -16px; padding-left: 16px; padding-right: 16px; }
  .ed-linha .rot { width: 140px; font-size: 14px; color: var(--sv-suave); }
  .c { flex: 1; min-width: 160px; height: 44px; padding: 0 12px; border: 2px solid var(--sv-ouro); border-radius: 10px; background: var(--sv-campo); color: var(--sv-titulo); font: inherit; font-size: 16px; }
  .erro { width: 100%; color: var(--sv-atr); font-weight: 600; font-size: 14px; }
  .bloco-ouro { background: var(--sv-sup); border: 2px solid var(--sv-ouro); border-radius: var(--sv-raio); padding: 14px 18px; display: flex; flex-direction: column; gap: 12px; }
  .bo-topo { display: flex; align-items: center; gap: 10px; color: var(--sv-icone); }
  .bo-topo strong { flex: 1; font-size: 15.5px; color: var(--sv-titulo); }
  .verde { font-size: 12.5px; font-weight: 700; color: var(--sv-ok); }
  .duas-c { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 14px; }
  .bo-botoes { display: flex; gap: 10px; justify-content: flex-end; }
  .nota { font-size: 12.5px; color: var(--sv-suave); }
  .form { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: var(--sv-raio); padding: 18px; display: flex; flex-direction: column; gap: 12px; max-width: 640px; }
  .tit-sug { font-size: 17px; font-weight: 800; color: var(--sv-titulo); }
  .grupo { display: flex; flex-direction: column; gap: 6px; }
  .rot-f { font-size: 14px; font-weight: 700; color: var(--sv-titulo); }
  .obr { color: var(--sv-atr); }
  .anexo { display: flex; align-items: center; gap: 8px; height: 44px; border: 1px dashed var(--sv-campo-borda); border-radius: 10px; padding: 0 12px; font-size: 14px; color: var(--sv-suave); }
  .anexo small { margin-left: auto; font-size: 12px; font-weight: 700; color: var(--sv-pend); }
  .sugs { list-style: none; margin: 0; padding: 0; }
  .sugs li { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-top: 1px solid var(--sv-linha); font-size: 14px; color: var(--sv-texto); }
  .sugs li:first-child { border-top: 0; }
  .sugs li > span:first-child { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .sugs strong { color: var(--sv-titulo); }
  .sugs small { font-size: 12.5px; color: var(--sv-suave); }
  .pedir-tr { display: flex; flex-direction: column; gap: 12px; border-top: 1px solid var(--sv-linha); padding-top: 12px; }
  .sub { width: 242px; flex: none; background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: var(--sv-raio); padding: 10px 8px; display: flex; flex-direction: column; gap: 2px; position: sticky; top: 16px; }
  .sub-tit { font-size: 11.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--sv-suave); padding: 4px 10px 6px; }
  .sub button { display: flex; align-items: center; gap: 10px; min-height: 38px; padding: 0 10px; border-radius: 9px; border: 0; background: transparent; cursor: pointer; font-size: 14.5px; font-weight: 500; color: var(--sv-titulo); text-align: left; }
  .sub button :global(svg) { color: var(--sv-icone); }
  .sub button span:nth-child(2) { flex: 1; }
  @media (hover: hover) { .sub button:hover { background: var(--sv-linha); } }
  .sub button.ativo { font-weight: 700; background: var(--sv-info-fundo); box-shadow: inset 3px 0 0 var(--sv-ouro); }
  .n { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--sv-ouro); color: #0A2342; font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center; }
  .sub-nota { font-size: 11.5px; color: var(--sv-suave); padding: 8px 10px 2px; line-height: 1.35; border-top: 1px solid var(--sv-linha); margin-top: 6px; }
  /* no celular a fileira de pílulas encosta nas bordas, logo abaixo do topo (a página da casca tem 16 px de margem) */
  .celular > :global(.pilulas) { margin: -16px -16px 0; }
  .celular .corpo { padding: 16px 0; }
  .celular .duas, .celular .duas-c { grid-template-columns: 1fr; }
  .celular h1 { font-size: 19px; }
  .celular .foto { width: 70px; height: 78px; }
</style>
