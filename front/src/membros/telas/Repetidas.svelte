<!-- 11. FICHAS REPETIDAS: as duplas que parecem a mesma pessoa (mesmo nome e nascimento, ou marcadas), só as que estão inteiras no escopo de quem vê.
     "Comparar" abre a tela de juntar (só o que é diferente, campo a campo). -->
<script lang="ts">
  import { pedir } from "../../comum/api";
  import { dataBr } from "../../comum/formato";
  import Cabecalho from "../../comum/Cabecalho.svelte";
  import Botao from "../../comum/Botao.svelte";
  import Avatar from "../../comum/Avatar.svelte";
  import Aviso from "../../comum/Aviso.svelte";
  import Estado from "../../comum/Estado.svelte";
  import { ir, escopo, textoEscopo } from "../estado.svelte";
  import { ponte } from "../../comum/ponte";

  interface Props { celular: boolean }
  let { celular }: Props = $props();

  interface Dupla { a: number; b: number; motivo: string; pessoas: { matricula: number; nome: string; congregacao: string | null; nascimento: string | null }[] }
  let duplas = $state<Dupla[] | null>(null);
  let erro = $state("");
  async function carregar() {
    erro = "";
    const r = await pedir<{ itens: Dupla[] }>("/fichas-repetidas");
    if (!r.ok) { erro = r.mensagem; return; }
    duplas = [...r.dados.itens];
  }
  void carregar();
</script>

<div class="rep" class:celular>
  {#if !celular}<Cabecalho titulo="Fichas repetidas" sub="{textoEscopo(escopo.resumo)} · a mesma pessoa em duas fichas: junte antes da assembleia geral" />{/if}
  {#if erro}<Estado tipo="erro" texto={erro} ontentar={carregar} />
  {:else if duplas === null}<div class="caixa pad"><Estado tipo="carregando" linhas={3} /></div>
  {:else if !duplas.length}<div class="caixa pad"><Estado tipo="vazio" texto="Nenhuma ficha repetida no seu escopo." /></div>
  {:else}
    <ul class="caixa">
      {#each duplas as d (`${d.a}-${d.b}`)}
        <li class="linha">
          <div class="par">
            {#each d.pessoas as p (p.matricula)}
              <span class="p"><Avatar nome={p.nome} tam={32} /><span><strong>{p.nome}</strong><small class="sv-num">{p.matricula} · {p.congregacao ?? "sem congregação"}{p.nascimento ? ` · ${dataBr(p.nascimento)}` : ""}</small></span></span>
            {/each}
          </div>
          <span class="motivo">{d.motivo}</span>
          <Botao tipo="ouro" onclick={() => ir({ tela: "juntar", a: d.a, b: d.b })}>Comparar</Botao>
        </li>
      {/each}
    </ul>
  {/if}
  <Aviso tom="info">Fica sempre a matrícula mais antiga; o número que sobra vai para o próximo cadastro novo. {ponte().sessao().geral ? "Fichas de áreas diferentes, só a Secretaria Geral junta." : "Fichas de áreas diferentes vão para a Secretaria Geral."}</Aviso>
</div>

<style>
  .rep { display: flex; flex-direction: column; gap: 14px; }
  .caixa { list-style: none; margin: 0; padding: 0; background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: var(--sv-raio); }
  .pad { padding: 14px 18px; }
  .linha { display: flex; align-items: center; gap: 16px; padding: 12px 18px; border-top: 1px solid var(--sv-linha); flex-wrap: wrap; }
  .linha:first-child { border-top: 0; }
  .par { flex: 1; min-width: 0; display: flex; gap: 20px; flex-wrap: wrap; }
  .p { display: flex; align-items: center; gap: 10px; min-width: 220px; }
  .p > span { display: flex; flex-direction: column; }
  .p strong { font-size: 15px; color: var(--sv-titulo); }
  .p small { font-size: 12.5px; color: var(--sv-suave); }
  .motivo { font-size: 13px; color: var(--sv-suave); }
</style>
