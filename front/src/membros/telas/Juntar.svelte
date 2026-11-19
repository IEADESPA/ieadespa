<!-- 11b. JUNTAR FICHAS REPETIDAS (rodada 8, opção 3 "só o que é diferente"): um campo por linha, com as duas opções para tocar; os iguais ficam
     escondidos (contados); fica a matrícula mais antiga e o histórico das duas. "Não são a mesma pessoa" tira a dupla da lista. -->
<script lang="ts">
  import { pedir, qs } from "../../comum/api";
  import { ponte } from "../../comum/ponte";
  import Cabecalho from "../../comum/Cabecalho.svelte";
  import Botao from "../../comum/Botao.svelte";
  import Aviso from "../../comum/Aviso.svelte";
  import Icone from "../../comum/Icone.svelte";
  import Estado from "../../comum/Estado.svelte";
  import { ir, lerContadores } from "../estado.svelte";

  interface Props { a: number; b: number; celular: boolean; onnome: (n: string) => void }
  let { a, b, celular, onnome }: Props = $props();

  interface Lado { matricula: number; nome: string; congregacao: string | null; criadaEm: string | null }
  interface CampoJ { campo: string; rotulo: string; grupo: string; fica: string | null; sai: string | null; sugerido: "FICA" | "SAI"; pode: boolean; motivo: string | null }
  interface Comparacao { fica: Lado; sai: Lado; campos: CampoJ[]; iguais: number; bloqueios: string[]; podeJuntar: boolean; versao: string }
  let c = $state<Comparacao | null>(null);
  let erro = $state("");
  let escolhas = $state<Record<string, "FICA" | "SAI">>({});
  let ocupado = $state(false);
  let feito = $state("");

  async function carregar() {
    erro = "";
    const r = await pedir<Comparacao>("/fichas-repetidas/comparar" + qs({ a, b }));
    if (!r.ok) { erro = r.mensagem; return; }
    c = r.dados;
    onnome(r.dados.fica.nome);
    escolhas = Object.fromEntries(r.dados.campos.map((x) => [x.campo, x.sugerido]));
  }
  void carregar();
  async function juntar() {
    if (!c) return;
    ocupado = true;
    const r = await pedir<{ mensagem?: string }>("/fichas-repetidas/juntar", { metodo: "POST", corpo: { a: c.fica.matricula, b: c.sai.matricula, escolhas, versao: c.versao } });
    ocupado = false;
    if (!r.ok) { ponte().avisar(r.mensagem, "erro"); if (r.status === 409) void carregar(); return; }
    feito = r.dados.mensagem ?? `As duas fichas viraram uma só: ${c.fica.matricula}.`;
    void lerContadores();
  }
  async function naoSao() {
    if (!c) return;
    ocupado = true;
    const r = await pedir<{ mensagem?: string }>("/fichas-repetidas/nao-sao-a-mesma", { metodo: "POST", corpo: { a: c.fica.matricula, b: c.sai.matricula } });
    ocupado = false;
    if (!r.ok) { ponte().avisar(r.mensagem, "erro"); return; }
    ponte().avisar("Combinado: a dupla saiu da lista de repetidas.", "sucesso");
    void lerContadores();
    ir({ tela: "repetidas" }, true);
  }
</script>

<div class="juntar" class:celular>
  {#if erro}<Estado tipo="erro" texto={erro} ontentar={carregar} />
  {:else if !c}<Estado tipo="carregando" linhas={6} />
  {:else if feito}
    <Aviso tom="ok"><strong>{feito}</strong></Aviso>
    <div class="fim"><Botao tipo="ouro" onclick={() => ir({ tela: "ficha", id: c!.fica.matricula, secao: "resumo" })}>Abrir a ficha</Botao><Botao tipo="linha" onclick={() => ir({ tela: "repetidas" }, true)}>Voltar às repetidas</Botao></div>
  {:else}
    {#if !celular}<Cabecalho titulo="Juntar fichas repetidas" sub="{c.fica.nome} · {c.fica.congregacao ?? 'sem congregação'} e {c.sai.congregacao ?? 'sem congregação'}" />{/if}
    <p class="conta"><strong>{c.campos.length} {c.campos.length === 1 ? "campo diferente" : "campos diferentes"}</strong> · {c.iguais} {c.iguais === 1 ? "campo igual nas duas fichas fica como está" : "campos iguais nas duas fichas ficam como estão"}</p>
    {#each c.bloqueios as bl (bl)}<Aviso tom="erro">{bl}</Aviso>{/each}
    <div class="linhas">
      <div class="linha">
        <span class="rot">Matrícula</span>
        <div class="op sel fixo"><span class="radio on" aria-hidden="true"></span><strong class="sv-num">{c.fica.matricula}</strong><small>fica (a mais antiga)</small></div>
        <div class="op fixo"><span class="radio" aria-hidden="true"></span><strong class="sv-num">{c.sai.matricula}</strong><small>deixa de existir</small></div>
      </div>
      {#each c.campos as x (x.campo)}
        <div class="linha" role="radiogroup" aria-label={x.rotulo}>
          <span class="rot">{x.rotulo}</span>
          {#each [["FICA", x.fica, c.fica.matricula], ["SAI", x.sai, c.sai.matricula]] as [lado, valor, mat] (lado)}
            <button type="button" class="op" class:sel={escolhas[x.campo] === lado} role="radio" aria-checked={escolhas[x.campo] === lado} disabled={!x.pode}
              title={x.pode ? undefined : x.motivo ?? undefined} onclick={() => (escolhas = { ...escolhas, [x.campo]: lado as "FICA" | "SAI" })}>
              <span class="radio" class:on={escolhas[x.campo] === lado} aria-hidden="true"></span><strong>{valor ?? `(sem ${x.rotulo.toLowerCase()})`}</strong><small class="sv-num">{mat}</small>
            </button>
          {/each}
        </div>
      {/each}
    </div>
    <div class="pe">
      <Aviso tom="info">As duas viram uma só: a <strong>{c.sai.matricula}</strong> deixa de existir e o histórico das duas fica na <strong>{c.fica.matricula}</strong>. Fica registrado quem juntou.</Aviso>
      <div class="botoes">
        <Botao tipo="linha" ocupado={ocupado} onclick={() => void naoSao()}>Não são a mesma pessoa</Botao>
        <Botao tipo="ouro" icone="check" ocupado={ocupado} desligado={!c.podeJuntar} onclick={() => void juntar()}>Juntar as fichas</Botao>
      </div>
    </div>
  {/if}
</div>

<style>
  .juntar { display: flex; flex-direction: column; gap: 12px; }
  .conta { font-size: 14px; color: var(--sv-suave); }
  .conta strong { color: var(--sv-titulo); }
  .linhas { display: flex; flex-direction: column; gap: 12px; }
  .linha { display: grid; grid-template-columns: 130px 1fr 1fr; gap: 14px; align-items: center; background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: var(--sv-raio); padding: 12px 16px; }
  .rot { font-size: 14.5px; font-weight: 700; color: var(--sv-titulo); }
  .op { display: flex; align-items: center; gap: 10px; min-height: 42px; padding: 0 14px; border: 1px solid var(--sv-borda); border-radius: 10px; background: var(--sv-sup); cursor: pointer; text-align: left; min-width: 0; }
  .op.fixo { cursor: default; }
  .op strong { flex: 1; min-width: 0; font-size: 15px; color: var(--sv-titulo); font-weight: 600; overflow-wrap: anywhere; }
  .op small { font-size: 12.5px; color: var(--sv-suave); }
  .op.sel { border: 2px solid var(--sv-titulo); background: var(--sv-info-fundo); }
  :global(html[data-tema="escuro"]) .op.sel { border-color: var(--sv-ouro); }
  .op:disabled { opacity: .6; cursor: not-allowed; }
  .radio { width: 18px; height: 18px; border-radius: 50%; border: 1.5px solid var(--sv-campo-borda); flex: none; display: flex; align-items: center; justify-content: center; }
  .radio.on { border: 5px solid var(--sv-titulo); }
  :global(html[data-tema="escuro"]) .radio.on { border-color: var(--sv-ouro); }
  .pe { display: flex; gap: 12px; align-items: center; }
  .pe > :global(.aviso) { flex: 1; }
  .botoes { display: flex; gap: 10px; flex: none; }
  .fim { display: flex; gap: 10px; }
  .celular .linha { grid-template-columns: 1fr; }
  .celular .pe { flex-direction: column; align-items: stretch; }
  .celular .botoes { flex-direction: column; }
  :global(.sv) .juntar :global(svg) { flex: none; }
</style>
