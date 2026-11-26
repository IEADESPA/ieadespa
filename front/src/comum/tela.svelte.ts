// O aparelho: "celular" segue a mesma linha da casca (até 640 px de largura) e muda sozinho quando a janela muda.
export const tela = $state({ celular: false });

let ligado = false;
export function vigiarTela(): void {
  if (ligado || typeof window === "undefined" || typeof window.matchMedia !== "function") return;
  ligado = true;
  const mq = window.matchMedia("(max-width: 640px)");
  tela.celular = mq.matches;
  mq.addEventListener("change", (e) => { tela.celular = e.matches; });
}

/** a peça que cobre a tela no celular (o seletor "Trocar de congregação"): o título da barra do alto e o voltar dela, que a App do módulo põe
 *  na trilha */
export const sobreposta = $state<{ titulo: string | null; fechar: (() => void) | null }>({ titulo: null, fechar: null });
