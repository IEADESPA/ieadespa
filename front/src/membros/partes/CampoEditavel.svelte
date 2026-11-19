<!-- Uma linha da EDIÇÃO CAMPO A CAMPO (rodada 8, opção 3): o rótulo, o valor, "mudou em ... por quem" e o lápis. Tocar o lápis abre a edição
     NA LINHA, com o ✓ (salva na hora) e o ✕ (desiste). O que quem vê não pode mudar mostra o cadeado com o motivo, nunca um botão que falha. -->
<script lang="ts">
  import Icone from "../../comum/Icone.svelte";
  import Escolha from "../../comum/Escolha.svelte";
  import { textoDoValor } from "../rotulos";
  import type { CampoFicha, Departamento, Endereco } from "../tipos";


  interface Props {
    campo: CampoFicha;
    sexo: string | null;
    deps: readonly Departamento[];
    mudou: string;
    aberto: boolean;
    salvando: boolean;
    erro: string;
    onabrir: () => void;
    onfechar: () => void;
    onsalvar: (valor: string | Endereco) => void;
    extra?: import("svelte").Snippet;
    /** as linhas do endereço de agora (a edição começa delas: salvar só a rua não apaga o resto) */
    enderecoAtual?: Endereco | null;
  }
  let { campo, sexo, deps, mudou, aberto, salvando, erro, onabrir, onfechar, onsalvar, extra, enderecoAtual = null }: Props = $props();

  let texto = $state("");
  let escolha = $state<string | null>(null);
  let end = $state<Endereco>({ logradouro: "", numero: "", complemento: "", bairroTexto: "", cidade: "", uf: "PA", cep: "" });
  let campoEl: HTMLInputElement | undefined = $state();

  $effect(() => {
    if (!aberto) return;
    // a edição começa do valor de agora (o CPF começa vazio: o que está na tela é o mascarado)
    texto = campo.tipo === "cpf" ? "" : campo.tipo === "data" ? (campo.valor ?? "") : (campo.valor ?? "");
    escolha = campo.valor;
    if (campo.tipo === "endereco" && enderecoAtual) end = { ...enderecoAtual };
    queueMicrotask(() => campoEl?.focus());
  });
  const valorTela = $derived(textoDoValor(campo.chave, campo.valor, sexo, deps));
  const opcoes = $derived(campo.tipo === "departamento"
    ? deps.map((d) => ({ valor: String(d.departamentoId), rotulo: d.nome }))
    : (campo.opcoes ?? []).map((o) => ({ valor: o, rotulo: textoDoValor(campo.chave, o, sexo, deps) || o })));
  const tipoInput = $derived(campo.tipo === "data" ? "date" : campo.tipo === "email" ? "email" : campo.tipo === "telefone" ? "tel" : "text");
  function salvar() {
    if (salvando) return;   // o Enter repetido não manda duas vezes
    if (campo.tipo === "endereco") {
      // o bairro escolhido na lista vai pelo número dele enquanto o nome não for mexido; mexeu, vai o nome escrito
      const daLista = enderecoAtual?.bairroId && end.bairroTexto.trim() === (enderecoAtual.bairroTexto ?? "").trim();
      onsalvar(daLista ? { ...end, bairroId: enderecoAtual!.bairroId ?? null, bairroTexto: "" } : { ...end, bairroId: null });
      return;
    }
    if (campo.tipo === "lista" || campo.tipo === "departamento") { onsalvar(escolha ?? ""); return; }
    onsalvar(texto.trim());
  }
  function tecla(ev: KeyboardEvent) {
    if (ev.key === "Escape") { ev.preventDefault(); onfechar(); }
    if (ev.key === "Enter" && campo.tipo !== "endereco") { ev.preventDefault(); salvar(); }
  }
</script>

<div class="linha" class:aberto>
  <span class="rot">{campo.rotulo}</span>
  {#if aberto}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="edita" role="group" aria-label="Editar {campo.rotulo}" onkeydown={tecla}>
      {#if campo.tipo === "lista" || campo.tipo === "departamento"}
        <Escolha rotulo={campo.rotulo} estilo="campo" larga valor={escolha} {opcoes} onescolher={(v) => (escolha = v)} />
      {:else if campo.tipo === "endereco"}
        <div class="end">
          <input class="c" placeholder="Rua" aria-label="Rua" bind:value={end.logradouro} bind:this={campoEl} />
          <input class="c curto" placeholder="Nº" aria-label="Número" bind:value={end.numero} />
          <input class="c" placeholder="Complemento" aria-label="Complemento" bind:value={end.complemento} />
          <input class="c" placeholder="Bairro" aria-label="Bairro" bind:value={end.bairroTexto} />
          <input class="c" placeholder="Cidade" aria-label="Cidade" bind:value={end.cidade} />
          <input class="c curto" placeholder="UF" aria-label="UF" maxlength="2" bind:value={end.uf} />
          <input class="c" placeholder="CEP" aria-label="CEP" inputmode="numeric" bind:value={end.cep} />
        </div>
      {:else}
        <input class="c" type={tipoInput} aria-label={campo.rotulo} bind:value={texto} bind:this={campoEl}
          placeholder={campo.tipo === "cpf" ? "Só os 11 números" : ""} inputmode={campo.tipo === "cpf" || campo.tipo === "telefone" ? "numeric" : undefined}
          autocomplete="off" />
      {/if}
      <button type="button" class="ok" aria-label="Salvar {campo.rotulo}" disabled={salvando} onclick={salvar}><Icone nome="check" tam={18} traco={2.6} /></button>
      <button type="button" class="x" aria-label="Desistir" disabled={salvando} onclick={onfechar}><Icone nome="fechar" tam={18} traco={2.4} /></button>
      {#if erro}<p class="erro" role="alert">{erro}{#if extra}{@render extra()}{/if}</p>{/if}
    </div>
  {:else}
    <div class="val">
      <strong class:nada={!valorTela}>{valorTela || "—"}</strong>
      {#if mudou}<small>{mudou}</small>{/if}
    </div>
    {#if campo.pode}
      <button type="button" class="lapis" aria-label="Mudar {campo.rotulo}" title="Mudar" onclick={onabrir}><Icone nome="lapis" tam={18} traco={2} /></button>
    {:else}
      <span class="trava" title={campo.motivo ?? "Você não muda este campo."} aria-label={campo.motivo ?? "Você não muda este campo."}><Icone nome="cadeado" tam={17} traco={2} /></span>
    {/if}
  {/if}
</div>

<style>
  .linha { display: flex; align-items: center; gap: 12px; min-height: 51px; padding: 6px 18px; border-top: 1px solid var(--sv-linha); }
  .rot { width: 140px; flex: none; font-size: 14px; color: var(--sv-suave); }
  .val { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  strong { font-size: 15px; font-weight: 700; color: var(--sv-titulo); overflow-wrap: anywhere; }
  .nada { font-weight: 500; color: var(--sv-suave); }
  small { font-size: 12.5px; color: var(--sv-suave); }
  .lapis, .trava { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex: none; color: var(--sv-icone); }
  .lapis { border: 0; background: transparent; cursor: pointer; }
  @media (hover: hover) { .lapis:hover { background: var(--sv-linha); } }
  .trava { color: var(--sv-suave); }
  .edita { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .c { flex: 1; min-width: 120px; height: 46px; padding: 0 14px; border: 2px solid var(--sv-ouro); border-radius: 12px; background: var(--sv-campo); color: var(--sv-titulo); font: inherit; font-size: 16px; }
  .end { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; gap: 8px; }
  .end .c { border-width: 1.5px; border-color: var(--sv-campo-borda); min-width: 140px; }
  .end .c:first-child { border-color: var(--sv-ouro); }
  .c.curto { flex: 0 0 72px; min-width: 72px; }
  .ok, .x { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex: none; transition: transform .12s ease; }
  .ok:active, .x:active { transform: scale(.95); }
  .ok { border: 0; background: var(--sv-ouro); color: #0A2342; }
  .x { border: 1px solid var(--sv-campo-borda); background: var(--sv-sup); color: var(--sv-titulo); }
  .erro { width: 100%; font-size: 13.5px; color: var(--sv-atr); }
  .aberto { background: var(--sv-ouro-tinta); }
  @media (max-width: 640px) {
    .linha { padding: 6px 14px; flex-wrap: wrap; }
    .rot { width: 110px; font-size: 13.5px; }
    .aberto .rot { width: 100%; }
  }
</style>
