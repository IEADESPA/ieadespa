/**
 * Crachá e certificado novos (10/11/2026) — o DESENHO, no navegador (canvas), com a fonte do site (Geist) e a logo inteira. Um desenho só
 * vira tudo: a imagem que a pessoa salva no celular ou manda pelo WhatsApp (PNG) e o PDF para imprimir. As regras (cores, textos,
 * configuração) ficam em `arteEventoRegras.ts`.
 *
 * Medidas: o desenho é feito em "décimos de milímetro" (certificado A4 deitado = 2970 × 2100; crachá 105 × 148 mm = 1050 × 1480) e a
 * escala decide a resolução (300 dpi para baixar; menos para a prévia e para o lote).
 */
import { jsPDF } from "jspdf";
import { directusAssetUrl } from "@/lib/directus";
import { bibliotecaQr } from "@/lib/pagamentoNavegador";
import { configurarAcessibilidadePdf } from "@/lib/pdf";
import { PALETAS, corDoTipo, nomesDoCracha, normalizarCertificado, normalizarVisual, textoDoCertificado, type Paleta } from "@/lib/arteEventoRegras";

export const CERTIFICADO = { largura: 2970, altura: 2100 } as const;
export const CRACHA = { largura: 1050, altura: 1480 } as const;
/** décimos de milímetro → pixels a 300 dpi */
export const ESCALA_300DPI = 300 / 254;

const FONTE = "Geist";
const FONTE_MONO = "Geist Mono";
const SITE_CURTO = "ieadespa.org.br";
const IGREJA_LINHA = "IGREJA EVANGÉLICA ASSEMBLEIA DE DEUS · MINISTÉRIO DO SETA · PARAUAPEBAS/PA";

// ---------------------------------------------------------------- recursos (fontes, logo, imagens) ----------------------------------------------------------------

let fontesProntas: Promise<void> | null = null;
/** As fontes do site, uma vez só (a variável cobre do 100 ao 900). Sem elas o canvas cai na fonte do aparelho — feio, mas não quebra. */
export function carregarFontes(): Promise<void> {
  if (!fontesProntas) {
    fontesProntas = (async () => {
      try {
        const geist = new FontFace(FONTE, "url(/fonts/geist/Geist-Variable.woff2)", { weight: "100 900" });
        const mono = new FontFace(FONTE_MONO, "url(/fonts/geist/GeistMono-Variable.woff2)", { weight: "100 900" });
        const [a, b] = await Promise.all([geist.load(), mono.load()]);
        document.fonts.add(a);
        document.fonts.add(b);
      } catch {
        /* segue com a fonte do aparelho */
      }
    })();
  }
  return fontesProntas;
}

const imagens = new Map<string, Promise<HTMLImageElement | null>>();
/** Uma imagem (a logo, a capa do evento, a assinatura). Imagem do Directus vem com CORS; se não vier (ex.: endereço de pré-visualização), devolve null e o desenho segue sem ela. */
export function carregarImagem(url: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  if (!imagens.has(url)) {
    imagens.set(
      url,
      new Promise((ok) => {
        const img = new Image();
        if (/^https?:/.test(url)) img.crossOrigin = "anonymous";
        img.onload = () => ok(img);
        img.onerror = () => ok(null);
        img.src = url;
      }),
    );
  }
  return imagens.get(url)!;
}

export interface Recursos {
  logo: HTMLImageElement | null;
  capa: HTMLImageElement | null;
  assinaturas: (HTMLImageElement | null)[];
}

/** Tudo o que o desenho usa, carregado antes (o canvas não espera imagem). */
export async function prepararRecursos(op: { capa?: string | null; assinaturas?: (string | null)[] } = {}): Promise<Recursos> {
  const [, , logo, capa, ...assinaturas] = await Promise.all([
    carregarFontes(),
    bibliotecaQr().catch(() => undefined),
    carregarImagem("/logo.png"),
    carregarImagem(op.capa ? directusAssetUrl(op.capa, { width: 1400, quality: 85, format: "jpg" }) : null),
    ...(op.assinaturas ?? []).map((id) => carregarImagem(id ? directusAssetUrl(id, { width: 700, format: "png" }) : null)),
  ]);
  return { logo, capa, assinaturas };
}

// ---------------------------------------------------------------- ajudantes de desenho ----------------------------------------------------------------

type Ctx = CanvasRenderingContext2D;

function fonte(ctx: Ctx, peso: number, tamanho: number, mono = false, espaco = 0) {
  ctx.font = `${peso} ${tamanho}px "${mono ? FONTE_MONO : FONTE}", system-ui, sans-serif`;
  (ctx as unknown as { letterSpacing: string }).letterSpacing = `${espaco}px`;
}

/** O maior tamanho (entre min e max) em que o texto cabe na largura. */
function ajustar(ctx: Ctx, texto: string, larguraMax: number, peso: number, max: number, min: number, espaco = 0): number {
  for (let t = max; t > min; t -= 2) {
    fonte(ctx, peso, t, false, espaco);
    if (ctx.measureText(texto).width <= larguraMax) return t;
  }
  fonte(ctx, peso, min, false, espaco);
  return min;
}

/** Quebra o texto em linhas que cabem na largura (com a fonte atual); a última linha leva "…" se passar do máximo de linhas. */
function quebrar(ctx: Ctx, texto: string, larguraMax: number, maxLinhas = 99): string[] {
  const palavras = texto.split(" ").filter(Boolean);
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    const teste = atual ? `${atual} ${p}` : p;
    if (ctx.measureText(teste).width <= larguraMax || !atual) atual = teste;
    else {
      linhas.push(atual);
      atual = p;
    }
  }
  if (atual) linhas.push(atual);
  if (linhas.length > maxLinhas) {
    const corte = linhas.slice(0, maxLinhas);
    let ultima = corte[maxLinhas - 1];
    while (ultima && ctx.measureText(`${ultima}…`).width > larguraMax) ultima = ultima.slice(0, -1);
    corte[maxLinhas - 1] = `${ultima.trimEnd()}…`;
    return corte;
  }
  return linhas;
}

/**
 * Quebra equilibrada: a mesma quantidade de linhas, mas sem a última sobrando com uma palavra só ("… de" / "2026.") — estreita a largura
 * aos poucos enquanto o número de linhas não muda, e fica com a de menor diferença entre a linha mais longa e a última.
 */
function quebrarEquilibrado(ctx: Ctx, texto: string, larguraMax: number, maxLinhas = 99): string[] {
  const base = quebrar(ctx, texto, larguraMax, maxLinhas);
  if (base.length < 2) return base;
  let melhor = base;
  let melhorNota = Infinity;
  for (let l = larguraMax; l >= larguraMax * 0.55; l -= larguraMax * 0.03) {
    const tentativa = quebrar(ctx, texto, l, maxLinhas);
    if (tentativa.length !== base.length) break;
    const larguras = tentativa.map((t) => ctx.measureText(t).width);
    const nota = Math.max(...larguras) - larguras[larguras.length - 1];
    if (nota < melhorNota) {
      melhor = tentativa;
      melhorNota = nota;
    }
  }
  return melhor;
}

function retanguloArredondado(ctx: Ctx, x: number, y: number, l: number, a: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + l, y, x + l, y + a, r);
  ctx.arcTo(x + l, y + a, x, y + a, r);
  ctx.arcTo(x, y + a, x, y, r);
  ctx.arcTo(x, y, x + l, y, r);
  ctx.closePath();
}

/** A imagem cobrindo o retângulo (como `object-fit: cover`). */
function cobrir(ctx: Ctx, img: HTMLImageElement, x: number, y: number, l: number, a: number) {
  const escala = Math.max(l / img.naturalWidth, a / img.naturalHeight);
  const sl = l / escala;
  const sa = a / escala;
  ctx.drawImage(img, (img.naturalWidth - sl) / 2, (img.naturalHeight - sa) / 2, sl, sa, x, y, l, a);
}

/** O QR (biblioteca do site) em quadradinhos nítidos; false se a biblioteca não estiver carregada. */
function desenharQr(ctx: Ctx, texto: string, x: number, y: number, tamanho: number, cor = "#111111"): boolean {
  const gerador = (window as unknown as { qrcode?: (t: number, c: string) => { addData(d: string): void; make(): void; getModuleCount(): number; isDark(l: number, c: number): boolean } }).qrcode;
  if (!gerador || !texto) return false;
  const qr = gerador(0, "M");
  qr.addData(texto);
  qr.make();
  const n = qr.getModuleCount();
  const m = tamanho / n;
  ctx.fillStyle = cor;
  for (let l = 0; l < n; l += 1) for (let c = 0; c < n; c += 1) if (qr.isDark(l, c)) ctx.fillRect(x + c * m, y + l * m, m + 0.4, m + 0.4);
  return true;
}

function preparar(canvas: HTMLCanvasElement, base: { largura: number; altura: number }, escala: number): Ctx {
  canvas.width = Math.round(base.largura * escala);
  canvas.height = Math.round(base.altura * escala);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas sem contexto 2d");
  ctx.setTransform(escala, 0, 0, escala, 0, 0);
  ctx.textBaseline = "alphabetic";
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

// ---------------------------------------------------------------- certificado ----------------------------------------------------------------

export interface DadosCertificado {
  nome: string;
  evento: string;
  /** "28 de novembro de 2026" ou "28 a 29 de novembro de 2026" */
  data: string;
  /** a data ao lado do local, embaixo do texto (o último dia do evento); sem ela, vale `data` */
  dataEmissao?: string | null;
  tipo?: string | null;
  codigo?: string | null;
  /** o endereço da verificação pública (vai no QR) */
  urlVerificacao?: string | null;
  /** o caminho curto mostrado embaixo do QR */
  verificacaoCurta?: string | null;
}

/** Desenha o certificado inteiro no canvas. `crachaConfig` é o `eventos.cracha_config` cru (aparência e certificado vêm de dentro dele). */
export function desenharCertificado(canvas: HTMLCanvasElement, dados: DadosCertificado, crachaConfig: unknown, recursos: Recursos, escala = ESCALA_300DPI) {
  const { largura: L, altura: A } = CERTIFICADO;
  const ctx = preparar(canvas, CERTIFICADO, escala);
  const cert = normalizarCertificado(crachaConfig);
  const p: Paleta = PALETAS[normalizarVisual(crachaConfig).tema];

  // fundo
  ctx.fillStyle = "#FCFBF8";
  ctx.fillRect(0, 0, L, A);
  // a logo grande e quase transparente, ao fundo
  if (recursos.logo) {
    ctx.save();
    ctx.globalAlpha = 0.035;
    ctx.drawImage(recursos.logo, L / 2 + 40 - 650, A / 2 - 600, 1300, 1300);
    ctx.restore();
  }
  // a faixa da esquerda, em diagonal, com o filete dourado
  const faixa = ctx.createLinearGradient(0, 0, 300, A);
  faixa.addColorStop(0, p.principal);
  faixa.addColorStop(1, p.escuro);
  ctx.fillStyle = faixa;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(290, 0);
  ctx.lineTo(170, A);
  ctx.lineTo(0, A);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = p.destaque;
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(318, 0);
  ctx.lineTo(198, A);
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.moveTo(346, 0);
  ctx.lineTo(226, A);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // "IEADESPA" de pé, na faixa
  ctx.save();
  ctx.translate(118, A / 2);
  ctx.rotate(-Math.PI / 2);
  fonte(ctx, 800, 74, false, 30);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.textAlign = "center";
  ctx.fillText("IEADESPA", 0, 26);
  ctx.restore();
  // o canto de baixo, à direita (fora da moldura, para não encostar no QR)
  ctx.fillStyle = p.principal;
  ctx.beginPath();
  ctx.moveTo(L, A);
  ctx.lineTo(L, A - 170);
  ctx.lineTo(L - 170, A);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = p.destaque;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(L, A - 215);
  ctx.lineTo(L - 215, A);
  ctx.stroke();
  // a moldura fina
  ctx.strokeStyle = p.destaque;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 3;
  ctx.strokeRect(400, 90, L - 490, A - 180);
  ctx.globalAlpha = 1;

  const cx = (400 + L - 90) / 2;
  const larguraTexto = L - 490 - 260;
  ctx.textAlign = "center";

  // a logo e a igreja
  if (recursos.logo) ctx.drawImage(recursos.logo, cx - 165, 150, 330, 330);
  fonte(ctx, 500, 30, false, 5);
  ctx.fillStyle = p.texto;
  ctx.globalAlpha = 0.75;
  ctx.fillText(IGREJA_LINHA, cx, 545);
  ctx.globalAlpha = 1;

  // o título
  fonte(ctx, 800, 150, false, 26);
  ctx.fillStyle = p.principal;
  ctx.fillText("CERTIFICADO", cx + 13, 735);
  ajustar(ctx, `DE ${cert.titulo.toUpperCase()}`, larguraTexto, 600, 50, 30, 16);
  ctx.fillStyle = p.destaque;
  ctx.fillText(`DE ${cert.titulo.toUpperCase()}`, cx + 8, 820);

  // a quem
  fonte(ctx, 400, 44);
  ctx.fillStyle = p.texto;
  ctx.fillText("Certificamos que", cx, 955);
  const nome = dados.nome.trim();
  ajustar(ctx, nome, larguraTexto, 700, 140, 64);
  ctx.fillStyle = p.principal;
  ctx.fillText(nome, cx, 1120);
  // o traço dourado com o losango
  const traco = ctx.createLinearGradient(cx - 620, 0, cx + 620, 0);
  traco.addColorStop(0, "rgba(201,162,39,0)");
  traco.addColorStop(0.5, p.destaque);
  traco.addColorStop(1, "rgba(201,162,39,0)");
  ctx.fillStyle = traco;
  ctx.fillRect(cx - 620, 1166, 1240, 5);
  ctx.fillStyle = p.destaque;
  ctx.beginPath();
  ctx.moveTo(cx, 1152);
  ctx.lineTo(cx + 16, 1168);
  ctx.lineTo(cx, 1184);
  ctx.lineTo(cx - 16, 1168);
  ctx.closePath();
  ctx.fill();

  // o texto
  const local = cert.local || "Parauapebas/PA";
  const corpo = textoDoCertificado(cert.texto, { evento: dados.evento, data: dados.data, carga: cert.carga, local, tipo: dados.tipo });
  fonte(ctx, 400, 44);
  ctx.fillStyle = p.texto;
  const linhas = quebrarEquilibrado(ctx, corpo, larguraTexto - 160, 4);
  let y = 1290;
  for (const linha of linhas) {
    ctx.fillText(linha, cx, y);
    y += 66;
  }
  fonte(ctx, 400, 36);
  ctx.globalAlpha = 0.8;
  ctx.fillText(`${local}, ${dados.dataEmissao || dados.data || new Date().toLocaleDateString("pt-BR")}.`, cx, y + 40);
  ctx.globalAlpha = 1;

  // as assinaturas
  const assinantes = cert.assinantes;
  const linhaY = 1800;
  const posicoes = assinantes.length === 2 ? [cx - 600, cx + 560] : [cx - 20];
  assinantes.forEach((a, i) => {
    const ax = posicoes[i];
    const img = recursos.assinaturas[i];
    if (img) {
      const escalaImg = Math.min(460 / img.naturalWidth, 170 / img.naturalHeight);
      const l = img.naturalWidth * escalaImg;
      const h = img.naturalHeight * escalaImg;
      ctx.save();
      ctx.globalCompositeOperation = "multiply"; // fundo branco da foto da assinatura some no papel
      ctx.drawImage(img, ax - l / 2, linhaY - h - 6, l, h);
      ctx.restore();
    }
    ctx.fillStyle = p.texto;
    ctx.fillRect(ax - 290, linhaY, 580, 3);
    fonte(ctx, 600, 36);
    ctx.fillStyle = p.principal;
    ctx.fillText(quebrar(ctx, a.nome, 640, 1)[0] ?? "", ax, linhaY + 52);
    fonte(ctx, 400, 30);
    ctx.fillStyle = p.texto;
    ctx.fillText(quebrar(ctx, a.cargo, 640, 1)[0] ?? "", ax, linhaY + 94);
  });

  // a verificação: o QR e o código
  if (dados.urlVerificacao && dados.codigo) {
    const t = 190;
    const qx = L - 90 - 150 - t;
    const qy = A - 90 - 70 - t - 80;
    ctx.fillStyle = "#FFFFFF";
    retanguloArredondado(ctx, qx - 16, qy - 16, t + 32, t + 32, 14);
    ctx.fill();
    desenharQr(ctx, dados.urlVerificacao, qx, qy, t, p.escuro);
    ctx.textAlign = "center";
    fonte(ctx, 500, 22, false, 1);
    ctx.fillStyle = p.texto;
    ctx.fillText("Confira a autenticidade", qx + t / 2, qy + t + 52);
    fonte(ctx, 600, 26, true, 4);
    ctx.fillText(dados.codigo, qx + t / 2, qy + t + 88);
  }
  if (dados.verificacaoCurta) {
    ctx.textAlign = "center";
    fonte(ctx, 400, 22, false, 1);
    ctx.fillStyle = p.texto;
    ctx.globalAlpha = 0.65;
    ctx.fillText(`Verificação pública: ${dados.verificacaoCurta}`, cx, A - 120);
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- crachá ----------------------------------------------------------------

export interface DadosCracha {
  nome: string;
  evento: string;
  /** "28 e 29 de novembro · Templo Central" */
  subtitulo?: string | null;
  tipo?: string | null;
  /** igreja/congregação e cidade (as que o evento escolheu e a pessoa respondeu) */
  linhas?: string[];
  /** o texto do QR do credenciamento ("<evento>:<código>"), ou null */
  qr?: string | null;
  codigo?: string | null;
}

/** Desenha um crachá (105 × 148 mm) no canvas. */
export function desenharCracha(canvas: HTMLCanvasElement, dados: DadosCracha, crachaConfig: unknown, recursos: Recursos, escala = ESCALA_300DPI) {
  const { largura: L, altura: A } = CRACHA;
  const ctx = preparar(canvas, CRACHA, escala);
  const visual = normalizarVisual(crachaConfig);
  const p = PALETAS[visual.tema];
  const corTipo = corDoTipo(dados.tipo, p);
  const topo = 560;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, L, A);

  // o topo: a imagem do evento (escurecida) ou a cor do tema com listras finas
  if (visual.usarCapa && recursos.capa) {
    // A imagem do evento costuma ser o CARTAZ (cheio de texto: horários, programação, preço) — nítida, ela briga com o título. Vai
    // DESFOCADA: reduzida a uma miniatura e ampliada de volta (funciona em todo navegador, inclusive no iPhone, que não tem ctx.filter),
    // ficando só as cores do cartaz, sem letra legível.
    const mini = document.createElement("canvas");
    mini.width = 40;
    mini.height = Math.max(1, Math.round((40 * topo) / L));
    const mctx = mini.getContext("2d");
    if (mctx) {
      mctx.imageSmoothingQuality = "high";
      cobrir(mctx, recursos.capa, 0, 0, mini.width, mini.height);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(mini, 0, 0, L, topo);
      ctx.restore();
    }
    // um véu da cor do tema e um escurecimento para baixo: o título fica legível em qualquer imagem
    ctx.save();
    ctx.globalAlpha = 0.62;
    ctx.fillStyle = p.escuro;
    ctx.fillRect(0, 0, L, topo);
    ctx.restore();
    const veu = ctx.createLinearGradient(0, 0, 0, topo);
    veu.addColorStop(0, "rgba(8,10,25,0.15)");
    veu.addColorStop(0.5, "rgba(8,10,25,0.45)");
    veu.addColorStop(1, "rgba(8,10,25,0.85)");
    ctx.fillStyle = veu;
    ctx.fillRect(0, 0, L, topo);
  } else {
    const g = ctx.createLinearGradient(0, 0, L, topo);
    g.addColorStop(0, p.principal);
    g.addColorStop(1, p.escuro);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, L, topo);
    ctx.save();
    ctx.strokeStyle = p.destaque;
    ctx.globalAlpha = 0.12;
    ctx.lineWidth = 6;
    for (let x = -topo; x < L; x += 70) {
      ctx.beginPath();
      ctx.moveTo(x, topo);
      ctx.lineTo(x + topo, 0);
      ctx.stroke();
    }
    ctx.restore();
  }
  // o filete dourado embaixo do topo
  ctx.fillStyle = p.destaque;
  ctx.fillRect(0, topo, L, 10);
  // a marca do furo do cordão
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = 3;
  retanguloArredondado(ctx, L / 2 - 75, 38, 150, 34, 17);
  ctx.stroke();

  // a logo num cartão branco de cantos redondos (a logo é quadrada: num círculo, o "IEADESPA" de baixo ficava cortado)
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = "#FFFFFF";
  retanguloArredondado(ctx, L / 2 - 118, 90, 236, 236, 40);
  ctx.fill();
  ctx.restore();
  if (recursos.logo) ctx.drawImage(recursos.logo, L / 2 - 104, 104, 208, 208);

  // o evento
  ctx.textAlign = "center";
  ctx.fillStyle = "#FFFFFF";
  fonte(ctx, 700, 54);
  let tamanho = 54;
  let linhasEvento = quebrar(ctx, dados.evento, L - 140, 2);
  while (linhasEvento.length > 1 && tamanho > 38 && linhasEvento.some((l) => ctx.measureText(l).width > L - 140)) {
    tamanho -= 2;
    fonte(ctx, 700, tamanho);
    linhasEvento = quebrar(ctx, dados.evento, L - 140, 2);
  }
  let y = linhasEvento.length > 1 ? 392 : 420;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 14;
  for (const l of linhasEvento) {
    ctx.fillText(l, L / 2, y);
    y += tamanho * 1.18;
  }
  ctx.restore();
  if (dados.subtitulo) {
    fonte(ctx, 500, 28, false, 1);
    ctx.globalAlpha = 0.88;
    ctx.fillText(quebrar(ctx, dados.subtitulo, L - 140, 1)[0] ?? "", L / 2, Math.min(y + 8, topo - 34));
    ctx.globalAlpha = 1;
  }

  // o nome: o primeiro em destaque e o completo embaixo, e a igreja/cidade (o tipo vai na faixa de baixo, na cor dele)
  const rodape = 92;
  const { destaque, completo } = nomesDoCracha(dados.nome);
  const linhas = (dados.linhas ?? []).filter(Boolean).slice(0, 2);
  const tNome = ajustar(ctx, destaque.toUpperCase(), L - 120, 800, 150, 64, 2);
  const alturaNome = tNome * 0.95 + (completo ? 56 : 0) + (linhas.length ? 52 : 0);
  const tamanhoQr = dados.qr ? 300 : 0;
  const alturaQr = dados.qr ? tamanhoQr + 44 + (dados.codigo ? 56 : 0) : 0;
  const livre = A - rodape - (topo + 10);
  // com QR: o nome logo abaixo do topo e o QR embaixo; sem QR: o nome no meio da parte branca
  let cursor = dados.qr ? topo + 10 + Math.max(60, (livre - alturaNome - alturaQr) / 2.2) : topo + 10 + (livre - alturaNome) / 2;
  cursor += tNome * 0.95;
  fonte(ctx, 800, tNome, false, 2);
  ctx.fillStyle = p.principal;
  ctx.fillText(destaque.toUpperCase(), L / 2, cursor);
  if (completo) {
    fonte(ctx, 500, 34);
    ctx.fillStyle = p.texto;
    cursor += 56;
    ctx.fillText(quebrar(ctx, completo, L - 120, 1)[0] ?? "", L / 2, cursor);
  }
  if (linhas.length) {
    fonte(ctx, 400, 30);
    ctx.fillStyle = p.texto;
    ctx.globalAlpha = 0.78;
    cursor += 52;
    ctx.fillText(quebrar(ctx, linhas.join(" · "), L - 120, 1)[0] ?? "", L / 2, cursor);
    ctx.globalAlpha = 1;
  }

  // o QR do credenciamento, embaixo
  if (dados.qr) {
    const t = tamanhoQr;
    const qx = L / 2 - t / 2;
    const qy = A - rodape - (dados.codigo ? 78 : 40) - t;
    ctx.fillStyle = p.suave;
    retanguloArredondado(ctx, qx - 22, qy - 22, t + 44, t + 44, 22);
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(qx - 8, qy - 8, t + 16, t + 16);
    desenharQr(ctx, dados.qr, qx, qy, t, "#111111");
    if (dados.codigo) {
      fonte(ctx, 600, 30, true, 8);
      ctx.fillStyle = p.texto;
      ctx.fillText(dados.codigo, L / 2 + 4, A - rodape - 26);
    }
  }

  // a faixa de baixo, na cor do tipo
  ctx.fillStyle = corTipo;
  ctx.fillRect(0, A - rodape, L, rodape);
  fonte(ctx, 700, 30, false, 10);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(dados.tipo ? dados.tipo.toUpperCase() : SITE_CURTO.toUpperCase(), L / 2 + 5, A - rodape / 2 + 11);
}

// ---------------------------------------------------------------- saída: imagem, PDF, compartilhar ----------------------------------------------------------------

export const canvasParaBlob = (canvas: HTMLCanvasElement, tipo = "image/png", qualidade = 0.92) =>
  new Promise<Blob>((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error("imagem"))), tipo, qualidade));

export function baixarBlob(blob: Blob, nomeArquivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** Compartilhar a imagem (WhatsApp, etc.) pelo próprio celular; false se o aparelho não deixa — aí a página oferece baixar. */
export async function compartilharImagem(blob: Blob, nomeArquivo: string, titulo: string): Promise<boolean> {
  const arquivo = new File([blob], nomeArquivo, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (typeof nav.share !== "function" || typeof nav.canShare !== "function" || !nav.canShare({ files: [arquivo] })) return false;
  try {
    await nav.share({ files: [arquivo], title: titulo });
    return true;
  } catch {
    return true; // a pessoa fechou a janela de compartilhar: não é erro
  }
}

/**
 * As páginas públicas (crachá e certificado): mostra a prévia do desenho e liga os botões — "Baixar PDF" (imprimir), "Salvar imagem"
 * (o PNG no celular) e "Compartilhar" (só aparece no aparelho que compartilha arquivo: WhatsApp e afins). Liga cada botão uma vez só.
 */
export async function ligarSaida(op: {
  canvas: HTMLCanvasElement;
  previa: HTMLImageElement;
  nomeBase: string;
  titulo: string;
  pdf: () => jsPDF;
  botaoPdf: HTMLButtonElement | null;
  botaoImagem: HTMLButtonElement | null;
  botaoCompartilhar: HTMLButtonElement | null;
  avisar: (texto: string) => void;
}) {
  const png = await canvasParaBlob(op.canvas, "image/png");
  if (op.previa.dataset.urlAntiga) URL.revokeObjectURL(op.previa.dataset.urlAntiga);
  const url = URL.createObjectURL(png);
  op.previa.src = url;
  op.previa.dataset.urlAntiga = url;
  const nomePng = `${op.nomeBase}.png`;
  const trocar = (b: HTMLButtonElement | null, acao: () => void | Promise<void>) => {
    if (!b) return;
    const novo = b.cloneNode(true) as HTMLButtonElement; // a próxima pessoa (outro código) não herda o clique da anterior
    b.replaceWith(novo);
    novo.addEventListener("click", () => void acao());
    return novo;
  };
  trocar(op.botaoPdf, () => {
    op.pdf().save(`${op.nomeBase}.pdf`);
    op.avisar("✅ PDF baixado.");
  });
  trocar(op.botaoImagem, () => {
    baixarBlob(png, nomePng);
    op.avisar("✅ Imagem salva.");
  });
  const arquivo = new File([png], nomePng, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  const podeCompartilhar = typeof nav.share === "function" && typeof nav.canShare === "function" && nav.canShare({ files: [arquivo] });
  const comp = trocar(op.botaoCompartilhar, async () => {
    const ok = await compartilharImagem(png, nomePng, op.titulo);
    if (!ok) {
      baixarBlob(png, nomePng);
      op.avisar("Este aparelho não compartilha arquivo direto: a imagem foi salva, é só enviar.");
    }
  });
  if (comp) comp.hidden = !podeCompartilhar;
}

const novoPdfCertificados = (titulo: string) => {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  configurarAcessibilidadePdf(doc, titulo);
  return doc;
};
const novoPdfCrachas = (titulo: string) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  configurarAcessibilidadePdf(doc, titulo);
  return doc;
};
/** Um certificado na página (a primeira já existe; as outras são criadas). */
function poeCertificado(doc: jsPDF, canvas: HTMLCanvasElement, indice: number, qualidade: number) {
  if (indice > 0) doc.addPage();
  doc.addImage(canvas.toDataURL("image/jpeg", qualidade), "JPEG", 0, 0, 297, 210, undefined, "FAST");
}
function linhaDeCorte(doc: jsPDF, x: number, y: number, l: number, a: number) {
  doc.setDrawColor(150);
  doc.setLineWidth(0.2);
  doc.setLineDashPattern([1.5, 1.5], 0);
  doc.rect(x, y, l, a);
  doc.setLineDashPattern([], 0);
}
/** Quatro crachás por folha A4 (2 × 2, um pouco menores que o real para caber na margem da impressora), com a linha de corte. */
function poeCrachaNaGrade(doc: jsPDF, canvas: HTMLCanvasElement, indice: number, qualidade: number) {
  const l = 98;
  const a = (98 * 148) / 105;
  const mx = (210 - l * 2) / 2;
  const my = (297 - a * 2) / 2;
  const pos = indice % 4;
  if (indice > 0 && pos === 0) doc.addPage();
  const x = mx + (pos % 2) * l;
  const y = my + Math.floor(pos / 2) * a;
  doc.addImage(canvas.toDataURL("image/jpeg", qualidade), "JPEG", x, y, l, a, undefined, "FAST");
  linhaDeCorte(doc, x, y, l, a);
}

/** Um certificado em PDF (A4 deitado). */
export function certificadosEmPdf(canvases: HTMLCanvasElement[], titulo: string): jsPDF {
  const doc = novoPdfCertificados(titulo);
  canvases.forEach((c, i) => poeCertificado(doc, c, i, 0.9));
  return doc;
}

/** Crachá em PDF: um só no tamanho real (105 × 148 mm) no meio da folha; vários, quatro por folha. Sempre com a linha de corte. */
export function crachasEmPdf(canvases: HTMLCanvasElement[], titulo: string): jsPDF {
  const doc = novoPdfCrachas(titulo);
  if (canvases.length === 1) {
    const x = (210 - 105) / 2;
    const y = (297 - 148) / 2;
    doc.addImage(canvases[0].toDataURL("image/jpeg", 0.92), "JPEG", x, y, 105, 148, undefined, "FAST");
    linhaDeCorte(doc, x, y, 105, 148);
    return doc;
  }
  canvases.forEach((c, i) => poeCrachaNaGrade(doc, c, i, 0.88));
  return doc;
}

/** Quantos vão em cada arquivo do lote (um PDF de centenas de páginas fica pesado demais para abrir e imprimir). */
export const POR_ARQUIVO = 100;
/** A resolução do lote: um pouco menor que a do download individual (o PDF de centenas fica leve), ainda nítida no papel. */
export const ESCALA_LOTE_CRACHA = 220 / 254;
export const ESCALA_LOTE_CERTIFICADO = 160 / 254;

/**
 * O lote do painel (crachás de todos os confirmados, certificados de todos os presentes): desenha UM de cada vez no mesmo canvas e já
 * põe no PDF (centenas de canvas abertos estourariam a memória do celular), em arquivos de até `POR_ARQUIVO` pessoas, avisando o
 * andamento. Devolve quantos arquivos saíram.
 */
export async function lotesEmPdf<T>(op: {
  tipo: "certificado" | "cracha";
  itens: T[];
  nomeBase: string;
  titulo: string;
  desenhar: (canvas: HTMLCanvasElement, item: T) => void;
  andamento?: (feitos: number, total: number) => void;
}): Promise<number> {
  const canvas = document.createElement("canvas");
  const partes = Math.max(1, Math.ceil(op.itens.length / POR_ARQUIVO));
  for (let parte = 0; parte < partes; parte += 1) {
    const fatia = op.itens.slice(parte * POR_ARQUIVO, (parte + 1) * POR_ARQUIVO);
    const doc = op.tipo === "certificado" ? novoPdfCertificados(op.titulo) : novoPdfCrachas(op.titulo);
    for (let i = 0; i < fatia.length; i += 1) {
      op.desenhar(canvas, fatia[i]);
      if (op.tipo === "certificado") poeCertificado(doc, canvas, i, 0.85);
      else poeCrachaNaGrade(doc, canvas, i, 0.85);
      op.andamento?.(parte * POR_ARQUIVO + i + 1, op.itens.length);
      if (i % 4 === 3) await new Promise((ok) => setTimeout(ok, 0)); // deixa a tela respirar (o andamento aparece)
    }
    doc.save(partes > 1 ? `${op.nomeBase}-parte-${parte + 1}-de-${partes}.pdf` : `${op.nomeBase}.pdf`);
  }
  canvas.width = 0;
  canvas.height = 0;
  return partes;
}
