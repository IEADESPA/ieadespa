// Mandar as carteirinhas para a impressora: monta a folha (FolhaImpressao) direto no body, espera TUDO o que o cartão desenha (a foto, o QR, o logo, a arte de
// fundo e as letras) e só então chama a impressão do navegador; depois desmonta. Nenhum arquivo é gerado nem guardado (decisão do responsável: "vai direto para
// a impressora"). Se alguma imagem não abrir, NÃO imprime (um cartão de PVC sem a foto é um cartão perdido) e diz de quem é.
// Quem chama registra a impressão só DEPOIS, com o que a pessoa disser que saiu certo (o servidor: preparar → imprimir → confirmar).
import { mount, tick, unmount } from "svelte";
import FolhaImpressao from "./FolhaImpressao.svelte";
import type { CartaoImpresso, Material, Modelo } from "./tipos";

export type ResultadoImpressao = { readonly ok: true } | { readonly ok: false; readonly motivo: string };

let imprimindo = false;

// uma imagem (pelo endereço) aberta de verdade, com prazo
function abrir(src: string, ms: number): Promise<boolean> {
  return new Promise((ok) => {
    const img = new Image();
    const prazo = setTimeout(() => ok(false), ms);
    img.onload = () => { clearTimeout(prazo); ok(img.naturalWidth > 0); };
    img.onerror = () => { clearTimeout(prazo); ok(false); };
    img.src = src;
  });
}

export async function imprimirCartoes(p: { cartoes: readonly CartaoImpresso[]; modelos: readonly Modelo[]; material: Material; frenteVerso: boolean }): Promise<ResultadoImpressao> {
  if (imprimindo) return { ok: false, motivo: "Já há uma impressão aberta. Termine ou feche a janela da impressora antes." };
  if (!p.cartoes.length) return { ok: false, motivo: "Nada para imprimir." };
  const porId = new Map(p.modelos.map((m) => [m.modeloId, m]));
  const semModelo = p.cartoes.filter((c) => !porId.get(c.modeloId)?.desenho);
  if (semModelo.length) return { ok: false, motivo: `Sem o modelo de ${semModelo.map((c) => c.nome).join(", ")}: nada foi impresso. Tente de novo.` };
  imprimindo = true;
  const alvo = document.createElement("div");
  document.body.appendChild(alvo);
  let app: ReturnType<typeof mount> | null = null;
  try {
    // as artes de fundo (são fundo em CSS: o navegador não espera sozinho) e as letras
    const artes = [...new Set(p.modelos.flatMap((m) => [m.desenho?.lados.frente.fundo.arte ? m.arteFrente : null, m.desenho?.lados.verso.fundo.arte ? m.arteVerso : null]).filter((x): x is string => !!x))];
    const artesOk = await Promise.all(artes.map((a) => abrir(a, 15000)));
    if (artesOk.some((x) => !x)) return { ok: false, motivo: "A arte de fundo do modelo não abriu. Nada foi impresso: confira a internet e tente de novo." };
    app = mount(FolhaImpressao, { target: alvo, props: { cartoes: p.cartoes, modelos: p.modelos, material: p.material, frenteVerso: p.frenteVerso } });
    await tick();
    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 5000))]);
    // cada imagem do cartão (a foto, o QR, o logo) aberta de verdade
    const imgs = [...alvo.querySelectorAll("img")];
    const falhas = (await Promise.all(imgs.map(async (i) => {
      if (!i.complete) await i.decode().catch(() => undefined);
      return i.complete && i.naturalWidth > 0 ? null : (i.closest("[aria-label]")?.getAttribute("aria-label") ?? "um cartão");
    }))).filter((x): x is string => !!x);
    if (falhas.length) return { ok: false, motivo: `Uma imagem não abriu (${[...new Set(falhas)].slice(0, 3).join("; ")}). Nada foi impresso: tente de novo.` };
    document.body.classList.add("sv-imprimindo");
    // o navegador avisa quando a janela da impressão fecha; se não avisar (alguns celulares), segue depois de um tempo
    const fim = new Promise<void>((r) => { window.addEventListener("afterprint", () => r(), { once: true }); setTimeout(r, 60000); });
    window.print();
    await fim;
    return { ok: true };
  } catch (e) {
    console.error("impressão das carteirinhas", e);
    return { ok: false, motivo: "A folha da impressão não pôde ser montada. Nada foi impresso: recarregue a página e tente de novo." };
  } finally {
    document.body.classList.remove("sv-imprimindo");
    if (app) void unmount(app);
    alvo.remove();
    imprimindo = false;
  }
}
