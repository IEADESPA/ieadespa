<!-- 6. A ESTEIRA DE CADASTROS (rodada 10; notebook opção 1 "quadro por quem completa", celular opção 2 "esteira com os números"): quem chega com o
     mínimo entra sozinho; na fila fica só quem tem pendência, em colunas por quem completa, com o ícone de onde veio. Tocar no cartão abre o que falta. -->
<script lang="ts">
  import { pedir, qs } from "../../comum/api";
  import { ponte } from "../../comum/ponte";
  import { haQuanto, idade, numero, plural } from "../../comum/formato";
  import Cabecalho from "../../comum/Cabecalho.svelte";
  import Botao from "../../comum/Botao.svelte";
  import Escolha from "../../comum/Escolha.svelte";
  import Icone from "../../comum/Icone.svelte";
  import Aviso from "../../comum/Aviso.svelte";
  import Avatar from "../../comum/Avatar.svelte";
  import Estado from "../../comum/Estado.svelte";
  import Campo from "../../comum/Campo.svelte";
  import Opcoes from "../../comum/Opcoes.svelte";
  import { ir, escopo, lerContadores, textoEscopo } from "../estado.svelte";
  import { origemDe, ESTADO_CIVIL } from "../rotulos";
  import type { PaginaPreCadastros, PreCadastro } from "../tipos";

  interface Props { celular: boolean }
  let { celular }: Props = $props();

  const sessao = ponte().sessao();
  let fila = $state<PreCadastro[]>([]);
  let aceitos = $state<PreCadastro[]>([]);
  let aceitosTotal = $state(0);
  let carregando = $state(true);
  let erro = $state("");
  let aberto = $state<PreCadastro | null>(null);
  const comp = $state({ cpf: "", email: "", dataNascimento: "", sexo: "", estadoCivil: "", nome: "", responsavel: false, naoRepete: false, motivo: "" });
  let resolvendo = $state(false);
  let erroResolver = $state("");

  async function carregar() {
    carregando = true; erro = "";
    const [f, a] = await Promise.all([
      pedir<PaginaPreCadastros>("/pre-cadastros" + qs({ caixa: "fila", porPagina: 100 })),
      pedir<PaginaPreCadastros>("/pre-cadastros" + qs({ caixa: "aceitos", porPagina: 30 }))
    ]);
    carregando = false;
    if (!f.ok) { erro = f.mensagem; return; }
    fila = [...f.dados.itens];
    aceitos = a.ok ? [...a.dados.itens] : [];
    aceitosTotal = a.ok ? a.dados.total : 0;
  }
  void carregar();

  const PARECIDA = ["POSSIVEL_REPETICAO", "CPF_REPETIDO", "CPF_EM_OUTRO_PRECADASTRO"];
  const ehParecida = (p: PreCadastro) => (p.pendencias ?? []).some((x) => PARECIDA.includes(x.codigo));
  const voceCompleta = $derived(fila.filter((p) => !ehParecida(p)));
  const parecidas = $derived(fila.filter(ehParecida));
  const hoje = new Date().toISOString().slice(0, 10);
  const entraramHoje = $derived(aceitos.filter((p) => (p.decididoEm ?? p.criadoEm ?? "").slice(0, 10) === hoje));
  const congs = $derived(escopo.resumo?.congregacoes ?? []);
  const lugar = $derived(textoEscopo(escopo.resumo));
  const sub = $derived(`${lugar ? lugar + " · " : ""}hoje: ${numero(entraramHoje.length)} ${plural(entraramHoje.length, "entrou sozinho", "entraram sozinhos")} · ${numero(fila.length)} com pendência`);
  const oQueFalta = (p: PreCadastro) => {
    const r = (p.pendencias ?? []).map((x) => x.rotulo.split(":")[0]!.replace(/^Falta /, "falta ").replace(/ \(.*\)$/, ""));
    const rep = p.repetido;
    if (rep && "matricula" in rep) return `parecida com ${rep.nome} (${rep.matricula})`;
    if (rep && "foraDoEscopo" in rep) return "o CPF já está numa ficha de fora do seu escopo: a Secretaria Geral confere";
    if (rep && "preCadastroId" in rep) return "repete outro pré-cadastro aberto";
    return r.join(" · ") || "conferir";
  };
  const nomeComIdade = (p: PreCadastro) => { const a = idade(p.dataNascimento); return a !== null && a < 18 ? `${p.nome} (${a} anos)` : p.nome; };

  function abrir(p: PreCadastro) {
    aberto = p; erroResolver = "";
    Object.assign(comp, { cpf: "", email: "", dataNascimento: p.dataNascimento ?? "", sexo: p.sexo ?? "", estadoCivil: "", nome: p.nome, responsavel: false, naoRepete: false, motivo: "" });
  }
  const tem = (c: string) => (aberto?.pendencias ?? []).some((x) => x.codigo === c);
  async function resolver(acao: "completar" | "descartar") {
    if (!aberto || resolvendo) return;
    const alvo = aberto;
    resolvendo = true; erroResolver = "";
    const campos: Record<string, string> = {};
    if (tem("FALTA_CPF") && comp.cpf.trim()) campos.cpf = comp.cpf.trim();
    if (tem("FALTA_EMAIL") && comp.email.trim()) campos.email = comp.email.trim();
    if (tem("FALTA_NASCIMENTO") && comp.dataNascimento) campos.dataNascimento = comp.dataNascimento;
    if (tem("FALTA_SEXO") && comp.sexo) campos.sexo = comp.sexo;
    if (tem("FALTA_ESTADO_CIVIL") && comp.estadoCivil) campos.estadoCivil = comp.estadoCivil;
    if (tem("FALTA_NOME") && comp.nome.trim()) campos.nome = comp.nome.trim();
    const corpo = acao === "descartar" ? { motivo: comp.motivo.trim(), versao: aberto.versao }
      : { campos, versao: aberto.versao, ...(comp.naoRepete ? { naoERepeticao: true } : {}), ...(comp.responsavel ? { responsavelConfirmado: true } : {}) };
    const x = await pedir<{ situacao?: string; matricula?: number; mensagem?: string }>(`/pre-cadastros/${alvo.preCadastroId}/${acao}`, { metodo: "POST", corpo });
    resolvendo = false;
    if (!x.ok) { if (aberto === alvo) erroResolver = x.mensagem; if (x.status === 409) void carregar(); return; }
    ponte().avisar(acao === "descartar" ? "Pré-cadastro descartado." : x.dados.matricula ? `Entrou no rol com a matrícula ${x.dados.matricula}.` : (x.dados.mensagem ?? "Salvo. Ainda falta resolver o resto."), "sucesso");
    if (aberto === alvo) aberto = null;
    void carregar();
    void lerContadores();
  }
</script>

{#snippet cartao(p: PreCadastro)}
  {@const o = origemDe(p.origem)}
  <button type="button" class="card" class:sel={aberto?.preCadastroId === p.preCadastroId} onclick={() => abrir(p)}>
    <strong>{nomeComIdade(p)}</strong>
    <span class="origem"><Icone nome={o.icone} tam={15} traco={2} />{o.texto}</span>
    <span class="falta">{oQueFalta(p)}</span>
    <small>{haQuanto(p.criadoEm)} · {p.podeResolver === false ? "a Geral resolve" : ehParecida(p) ? "você: é a mesma pessoa?" : "você"}{sessao.geral || congs.length > 1 ? ` · ${p.congregacao ?? ""}` : ""}</small>
  </button>
{/snippet}

{#snippet resolverPainel()}
  {#if aberto}
    <section class="resolver" aria-label="Resolver o cadastro de {aberto.nome}">
      <div class="r-topo"><strong>{aberto.nome}</strong><button type="button" class="fechar" aria-label="Fechar" onclick={() => (aberto = null)}><Icone nome="fechar" tam={18} traco={2.4} /></button></div>
      <ul class="pend">{#each aberto.pendencias ?? [] as x (x.codigo)}<li>{x.rotulo} <small>· {x.quem}</small></li>{/each}</ul>
      {#if aberto.repetido && "matricula" in aberto.repetido}
        {@const rep = aberto.repetido}
        <Aviso tom="alerta">Parece com <strong>{rep.nome}</strong> (matrícula {rep.matricula}{rep.congregacao ? `, ${rep.congregacao}` : ""}).
          {#snippet acao()}<Botao tipo="linha" tam="pequeno" onclick={() => ir({ tela: "ficha", id: rep.matricula, secao: "resumo" })}>Ver a ficha</Botao>{/snippet}
        </Aviso>
      {:else if aberto.repetido && "foraDoEscopo" in aberto.repetido}
        <Aviso tom="alerta">{aberto.repetido.mensagem}</Aviso>
      {:else if aberto.repetido}
        <Aviso tom="alerta">Este cadastro repete outro pré-cadastro que ainda está aberto: corrija junto com o mais antigo.</Aviso>
      {/if}
      {#if aberto.podeResolver !== false}
        <div class="r-campos">
          {#if tem("FALTA_NOME")}<Campo rotulo="Nome completo" valor={comp.nome} oninput={(v) => (comp.nome = v)} />{/if}
          {#if tem("FALTA_CPF")}<Campo rotulo="CPF" valor={comp.cpf} oninput={(v) => (comp.cpf = v)} inputmode="numeric" />{/if}
          {#if tem("FALTA_EMAIL")}<Campo rotulo="E-mail" tipo="email" valor={comp.email} oninput={(v) => (comp.email = v)} />{/if}
          {#if tem("FALTA_NASCIMENTO")}<Campo rotulo="Nascimento" tipo="date" valor={comp.dataNascimento} oninput={(v) => (comp.dataNascimento = v)} />{/if}
          {#if tem("FALTA_SEXO")}<Opcoes rotulo="Sexo" valor={comp.sexo || null} opcoes={[{ valor: "F", rotulo: "Feminino" }, { valor: "M", rotulo: "Masculino" }]} onescolher={(v) => (comp.sexo = v)} />{/if}
          {#if tem("FALTA_ESTADO_CIVIL")}<Escolha rotulo="Estado civil" estilo="campo" larga valor={comp.estadoCivil || null} opcoes={Object.entries(ESTADO_CIVIL).map(([v, [m]]) => ({ valor: v, rotulo: m }))} onescolher={(v) => (comp.estadoCivil = v ?? "")} />{/if}
          {#if tem("MENOR_DE_IDADE")}<label class="conf"><input type="checkbox" bind:checked={comp.responsavel} /> O responsável pela criança consentiu.</label>{/if}
          {#if tem("POSSIVEL_REPETICAO")}<label class="conf"><input type="checkbox" bind:checked={comp.naoRepete} /> Conferi: não é a mesma pessoa da ficha parecida.</label>{/if}
        </div>
        {#if erroResolver}<p class="erro" role="alert">{erroResolver}</p>{/if}
        <div class="r-acoes">
          <Campo rotulo="Motivo para descartar" opcional valor={comp.motivo} oninput={(v) => (comp.motivo = v)} />
          <div class="r-botoes">
            <Botao tipo="linha" desligado={!comp.motivo.trim()} ocupado={resolvendo} onclick={() => void resolver("descartar")}>Descartar</Botao>
            <Botao tipo="ouro" icone="check" ocupado={resolvendo} onclick={() => void resolver("completar")}>Completar e aceitar</Botao>
          </div>
        </div>
      {:else}
        <p class="nota">Este cadastro é de outra congregação: quem completa é a secretaria de lá (ou a Geral).</p>
      {/if}
    </section>
  {/if}
{/snippet}

<div class="fila" class:celular>
  {#if !celular}
    <Cabecalho titulo="Esteira de cadastros" {sub}>
      {#snippet acoes()}
        <Botao tipo="linha" icone="mais" onclick={() => ir({ tela: "rapido" })}>Cadastro rápido</Botao>
        {#if congs.length === 1 && congs[0]}<Escolha rotulo={congs[0].nome} icone="cadeado" estilo="trava" valor={null} opcoes={[]} onescolher={() => {}} />{/if}
      {/snippet}
    </Cabecalho>
  {/if}
  <div class="regra"><Icone nome="check" tam={18} traco={2.6} /><span><strong>Entra sozinho</strong> quem chega com o mínimo (nome, CPF, e-mail, nascimento, congregação e departamento) e não é parecido com ninguém: a matrícula nasce na hora e a pessoa recebe o e-mail para criar a senha.</span></div>
  {#if erro}<Estado tipo="erro" texto={erro} ontentar={carregar} />
  {:else if carregando && !fila.length}<Estado tipo="carregando" linhas={5} />
  {:else if celular}
    <div class="esteira" aria-label="O caminho do cadastro hoje">
      <div><strong class="sv-num">{numero(fila.length + entraramHoje.length)}</strong><span>chegaram</span></div><Icone nome="seta" tam={14} traco={2} />
      <div><strong class="sv-num">{numero(entraramHoje.length)}</strong><span>entraram sozinhos</span></div><Icone nome="seta" tam={14} traco={2} />
      <div class="ouro"><strong class="sv-num">{numero(fila.length)}</strong><span>com pendência</span></div>
    </div>
    <Botao tipo="linha" icone="mais" largo onclick={() => ir({ tela: "rapido" })}>Cadastro rápido</Botao>
    <div class="lista-cel">
      {#each fila as p (p.preCadastroId)}{@render cartao(p)}{:else}<Estado tipo="vazio" texto="Nenhum cadastro com pendência." />{/each}
    </div>
    {@render resolverPainel()}
  {:else}
    <div class="quadro">
      <section class="col"><h2><i class="d marrom"></i>Falta dado: você completa<span class="sv-num">{voceCompleta.length}</span></h2>
        {#each voceCompleta as p (p.preCadastroId)}{@render cartao(p)}{:else}<p class="vazio">Nada aqui.</p>{/each}</section>
      <section class="col"><h2><i class="d azul"></i>Falta dado: a pessoa completa<span class="sv-num">0</span></h2>
        <p class="vazio">Pedir à própria pessoa que complete pelo e-mail: em construção.</p></section>
      <section class="col"><h2><i class="d vermelho"></i>Parecida com outra ficha<span class="sv-num">{parecidas.length}</span></h2>
        {#each parecidas as p (p.preCadastroId)}{@render cartao(p)}{:else}<p class="vazio">Nada aqui.</p>{/each}</section>
      <section class="col"><h2><i class="d verde"></i>Entraram sozinhos hoje<span class="sv-num">{entraramHoje.length}</span></h2>
        <div class="entraram">
          {#each entraramHoje.slice(0, 3) as p (p.preCadastroId)}
            {@const o = origemDe(p.origem)}
            <button type="button" class="ent" onclick={() => p.matricula && ir({ tela: "ficha", id: p.matricula, secao: "resumo" })}>
              <Avatar nome={p.nome} tam={30} /><span><strong>{p.nome}</strong><small>{o.texto}{p.matricula ? ` · matrícula ${p.matricula}` : ""}</small></span><span class="ok"><Icone nome="check" tam={16} traco={2.6} /></span>
            </button>
          {:else}<p class="vazio">Ninguém ainda hoje.</p>{/each}
          {#if entraramHoje.length > 3}<span class="mais">+ {entraramHoje.length - 3} mais hoje · {numero(aceitosTotal)} no total</span>{/if}
        </div></section>
    </div>
    {@render resolverPainel()}
  {/if}
</div>

<style>
  .fila { display: flex; flex-direction: column; gap: 14px; }
  .regra { display: flex; align-items: flex-start; gap: 10px; padding: 10px 14px; border-radius: 12px; background: var(--sv-ok-caixa); border: 1px solid var(--sv-ok-borda); color: var(--sv-ok); }
  .regra span { flex: 1; font-size: 13.5px; line-height: 1.45; color: var(--sv-texto); }
  .regra strong { color: var(--sv-titulo); }
  .quadro { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; align-items: start; }
  .col { background: var(--sv-linha); border-radius: var(--sv-raio); padding: 10px; display: flex; flex-direction: column; gap: 8px; }
  .col h2 { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700; color: var(--sv-titulo); padding: 2px 4px 4px; }
  .col h2 span { margin-left: auto; color: var(--sv-suave); font-size: 13px; }
  .d { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; }
  .marrom { background: #B45309; } .azul { background: #1D4ED8; } .vermelho { background: #B91C1C; } .verde { background: #15803D; }
  .card { display: flex; flex-direction: column; gap: 4px; text-align: left; background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: 12px; padding: 12px; cursor: pointer; width: 100%; transition: border-color .15s ease, transform .12s ease; }
  .card:active { transform: scale(.98); }
  .card.sel { border-color: var(--sv-ouro); box-shadow: 0 0 0 2px var(--sv-ouro); }
  .card strong { font-size: 15px; color: var(--sv-titulo); }
  .origem { display: flex; align-items: center; gap: 6px; font-size: 13.5px; color: var(--sv-texto); }
  .falta { font-size: 13.5px; font-weight: 700; color: var(--sv-pend); }
  .card small { font-size: 12.5px; color: var(--sv-suave); }
  .vazio { font-size: 13px; color: var(--sv-suave); padding: 6px 4px; }
  .entraram { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: 12px; padding: 4px 12px; display: flex; flex-direction: column; }
  .ent { display: flex; align-items: center; gap: 10px; padding: 9px 0; border: 0; border-top: 1px solid var(--sv-linha); background: transparent; text-align: left; cursor: pointer; }
  .ent:first-child { border-top: 0; }
  .ent span:nth-child(2) { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .ent strong { font-size: 14px; color: var(--sv-titulo); }
  .ent small { font-size: 12.5px; color: var(--sv-suave); }
  .ok { color: var(--sv-ok); display: flex; }
  .mais { font-size: 13px; font-weight: 700; color: var(--sv-link); padding: 8px 0; border-top: 1px solid var(--sv-linha); }
  .resolver { background: var(--sv-sup); border: 2px solid var(--sv-ouro); border-radius: var(--sv-raio); padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; max-width: 760px; }
  .r-topo { display: flex; align-items: center; }
  .r-topo strong { flex: 1; font-size: 17px; color: var(--sv-titulo); }
  .fechar { border: 0; background: transparent; color: var(--sv-suave); cursor: pointer; display: flex; padding: 6px; }
  .pend { margin: 0; padding-left: 18px; font-size: 14px; color: var(--sv-texto); display: flex; flex-direction: column; gap: 3px; }
  .pend small { color: var(--sv-suave); }
  .r-campos { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .conf { display: flex; gap: 8px; align-items: center; font-size: 14px; color: var(--sv-texto); grid-column: 1 / -1; }
  .r-acoes { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; border-top: 1px solid var(--sv-linha); padding-top: 12px; }
  .r-acoes > :global(.campo) { flex: 1; min-width: 200px; }
  .r-botoes { display: flex; gap: 8px; }
  .erro { color: var(--sv-atr); font-weight: 600; font-size: 14px; }
  .nota { font-size: 13.5px; color: var(--sv-suave); }
  .esteira { display: flex; align-items: center; gap: 4px; color: var(--sv-suave); }
  .esteira div { flex: 1; min-width: 0; border-radius: 10px; padding: 8px 10px; background: var(--sv-sup); border: 1px solid var(--sv-borda); display: flex; flex-direction: column; }
  .esteira div.ouro { background: var(--sv-ouro); border-color: var(--sv-ouro); }
  .esteira strong { font-size: 19px; font-weight: 800; color: var(--sv-titulo); }
  .esteira .ouro strong, .esteira .ouro span { color: #0A2342; }
  .esteira span { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; color: var(--sv-suave); }
  .lista-cel { display: flex; flex-direction: column; gap: 8px; }
  .celular .r-campos { grid-template-columns: 1fr; }
  @media (max-width: 1100px) { .quadro { grid-template-columns: 1fr 1fr; } }
</style>
