<!-- O menu do módulo Financeiro na barra da esquerda: o aprovado "por tipo de trabalho" (rodada 13, opção 1, com os acréscimos da rodada 17).
     Cada nível vê só o que é seu; só o grupo da tela aberta vem aberto (os outros mostram quantos itens têm). -->
<script lang="ts">
  import MenuModulo from "../comum/MenuModulo.svelte";
  import { nav, irItem, itemDoMenu, menuDoNivel, nivelDaSessao, type ChaveMenu } from "./estado.svelte";
  import { ponte } from "../comum/ponte";

  const grupos = menuDoNivel(nivelDaSessao());

  function escolher(k: ChaveMenu) {
    irItem(k);
    ponte().fecharGavetaCelular();
  }
</script>

<MenuModulo rotulo="Menu de Finanças" chaveGuardada="ieadespaFinancasGruposFechados" soAtivoAberto {grupos} ativo={itemDoMenu(nav.rota)} onescolher={escolher} />
