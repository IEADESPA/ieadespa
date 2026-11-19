// Mandar as carteirinhas para a impressora: monta a folha (FolhaImpressao) direto no body, espera as imagens (a foto, o QR, a arte) e chama a impressão do
// navegador; depois desmonta. Nenhum arquivo é gerado nem guardado (decisão do responsável: "vai direto para a impressora").
import { mount, tick, unmount } from "svelte";
import FolhaImpressao from "./FolhaImpressao.svelte";
import type { CartaoImpresso, Material, Modelo } from "./tipos";

let imprimindo = false;

async function esperarImagens(raiz: HTMLElement, ms: number): Promise<void> {
  const imgs = [...raiz.querySelectorAll("img")];
  const prontas = Promise.all(imgs.map((i) => (i.complete ? Promise.resolve() : i.decode().catch(() => undefined))));
  await Promise.race([prontas, new Promise((r) => setTimeout(r, ms))]);
}

/** imprime; devolve false se já havia uma impressão aberta */
export async function imprimirCartoes(p: { cartoes: readonly CartaoImpresso[]; modelos: readonly Modelo[]; material: Material; frenteVerso: boolean }): Promise<boolean> {
  if (imprimindo || !p.cartoes.length) return false;
  imprimindo = true;
  const alvo = document.createElement("div");
  document.body.appendChild(alvo);
  const app = mount(FolhaImpressao, { target: alvo, props: { cartoes: p.cartoes, modelos: p.modelos, material: p.material, frenteVerso: p.frenteVerso } });
  document.body.classList.add("sv-imprimindo");
  const limpar = () => {
    document.body.classList.remove("sv-imprimindo");
    void unmount(app);
    alvo.remove();
    imprimindo = false;
  };
  try {
    await tick();
    await esperarImagens(alvo, 6000);
    // o navegador avisa quando a janela da impressão fecha; se não avisar (alguns celulares), limpa depois de um tempo
    const fim = new Promise<void>((r) => { window.addEventListener("afterprint", () => r(), { once: true }); setTimeout(r, 120000); });
    window.print();
    await fim;
  } finally {
    limpar();
  }
  return true;
}
