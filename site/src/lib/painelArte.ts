/**
 * A lógica da aparência e do certificado na aba "Crachá e certificado" do painel do evento (10/11/2026) — o formulário é
 * `src/components/PainelArte.astro`. Tudo vai dentro de `eventos.cracha_config` (em `visual` e `certificado`), junto do que já ia no
 * crachá; quem grava é a página (um "Salvar" só para a aba inteira). As imagens das assinaturas sobem para o Directus (a função "Editor
 * de eventos" já pode enviar imagem) e ficam guardadas pelo id.
 */
import { CRACHA, CERTIFICADO, desenharCertificado, desenharCracha, prepararRecursos } from "@/lib/arteEvento";
import { directusAssetUrl } from "@/lib/directus";
import { normalizarCertificado, normalizarVisual, problemaCertificado, urlVerificacao, type TemaCor } from "@/lib/arteEventoRegras";
import { problemaDaImagem } from "@/lib/imagemEvento";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const q = <T extends Element>(sel: string, raiz: ParentNode = document) => raiz.querySelector<T>(sel);

const assinantesEl = () => Array.from(document.querySelectorAll<HTMLElement>("[data-assinante]"));

function mostrarAssinatura(bloco: HTMLElement, id: string | null) {
  const hidden = q<HTMLInputElement>("[data-ass-id]", bloco);
  const img = q<HTMLImageElement>("[data-ass-previa]", bloco);
  const remover = q<HTMLButtonElement>("[data-ass-remover]", bloco);
  if (hidden) hidden.value = id ?? "";
  if (img) {
    img.hidden = !id;
    if (id) img.src = directusAssetUrl(id, { width: 360, format: "png" });
    else img.removeAttribute("src");
  }
  if (remover) remover.hidden = !id;
}

/** Preenche a aparência e o certificado com o que está gravado em `cracha_config`. */
export function preencherArte(crachaConfig: unknown) {
  const visual = normalizarVisual(crachaConfig);
  const bruto = crachaConfig && typeof crachaConfig === "object" ? (crachaConfig as Record<string, unknown>) : {};
  const certBruto = bruto.certificado && typeof bruto.certificado === "object" ? (bruto.certificado as Record<string, unknown>) : {};
  const cert = normalizarCertificado(crachaConfig);
  const tema = q<HTMLSelectElement>("[data-arte-tema]");
  if (tema) tema.value = visual.tema;
  const capa = q<HTMLInputElement>("[data-arte-capa]");
  if (capa) capa.checked = visual.usarCapa;
  const campo = (sel: string, v: string) => {
    const el = q<HTMLInputElement | HTMLTextAreaElement>(sel);
    if (el) el.value = v;
  };
  // o que a pessoa escreveu (vazio fica vazio: o padrão aparece como dica, não como texto gravado)
  campo("[data-cert-titulo]", typeof certBruto.titulo === "string" ? cert.titulo : "");
  campo("[data-cert-texto]", typeof certBruto.texto === "string" && certBruto.texto.trim() ? cert.texto : "");
  campo("[data-cert-carga]", cert.carga);
  campo("[data-cert-local]", cert.local);
  assinantesEl().forEach((bloco, i) => {
    const a = cert.assinantes[i];
    const nome = q<HTMLInputElement>("[data-ass-nome]", bloco);
    const cargo = q<HTMLInputElement>("[data-ass-cargo]", bloco);
    if (nome) nome.value = a?.nome ?? "";
    if (cargo) cargo.value = a?.cargo ?? "";
    mostrarAssinatura(bloco, a?.assinatura ?? null);
  });
}

/** O que está na tela agora (para salvar e para a prévia). */
export function lerArte() {
  const v = (sel: string, raiz: ParentNode = document) => (q<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(sel, raiz)?.value ?? "").trim();
  return {
    visual: { tema: (v("[data-arte-tema]") || "azul") as TemaCor, usarCapa: Boolean(q<HTMLInputElement>("[data-arte-capa]")?.checked) },
    certificado: {
      titulo: v("[data-cert-titulo]"),
      texto: v("[data-cert-texto]"),
      carga: v("[data-cert-carga]"),
      local: v("[data-cert-local]"),
      assinantes: assinantesEl()
        .map((bloco) => ({ nome: v("[data-ass-nome]", bloco), cargo: v("[data-ass-cargo]", bloco), assinatura: UUID.test(v("[data-ass-id]", bloco)) ? v("[data-ass-id]", bloco) : null }))
        .filter((a) => a.nome || a.cargo || a.assinatura),
    },
  };
}

/** O problema que impede salvar (texto para a pessoa), ou null. */
export function problemaArte(): string | null {
  const { certificado } = lerArte();
  if (certificado.assinantes.some((a) => a.assinatura && !a.nome)) return "Toda imagem de assinatura precisa do nome de quem assina.";
  return problemaCertificado(certificado);
}

/** Liga o envio e a remoção das imagens das assinaturas (sobe ao Directus; o id fica no formulário até o "Salvar"). */
export function ligarAssinaturas(op: { directusUrl: string; token: string; pedir?: (url: string, init: RequestInit) => Promise<Response> }) {
  const pedir = op.pedir ?? ((url: string, init: RequestInit) => fetch(url, init));
  assinantesEl().forEach((bloco) => {
    const arquivo = q<HTMLInputElement>("[data-ass-arquivo]", bloco);
    const status = q<HTMLElement>("[data-ass-status]", bloco);
    const dizer = (t: string) => {
      if (status) status.textContent = t;
    };
    arquivo?.addEventListener("change", async () => {
      const f = arquivo.files?.[0] ?? null;
      const problema = problemaDaImagem(f);
      if (problema || !f) {
        dizer(problema ?? "");
        return;
      }
      arquivo.disabled = true;
      dizer("Enviando…");
      try {
        const nome = (q<HTMLInputElement>("[data-ass-nome]", bloco)?.value ?? "").trim();
        const fd = new FormData();
        fd.append("title", `Assinatura${nome ? ` — ${nome}` : ""}`); // o Directus só lê os campos que vêm ANTES do arquivo
        fd.append("file", f);
        const res = await pedir(`${op.directusUrl}/files`, { method: "POST", headers: { Authorization: `Bearer ${op.token}` }, body: fd });
        if (!res.ok) throw new Error(String(res.status));
        const id = String((await res.json()).data?.id ?? "");
        if (!UUID.test(id)) throw new Error("id");
        mostrarAssinatura(bloco, id);
        dizer("✅ Imagem enviada. Clique em Salvar para guardar.");
      } catch {
        dizer("Não foi possível enviar a imagem agora. Tente de novo.");
      } finally {
        arquivo.disabled = false;
        arquivo.value = "";
      }
    });
    q<HTMLButtonElement>("[data-ass-remover]", bloco)?.addEventListener("click", () => {
      mostrarAssinatura(bloco, null);
      dizer("Imagem tirada. Clique em Salvar para guardar.");
    });
  });
}

export interface EventoParaPrevia {
  titulo: string;
  subtitulo: string;
  capa: string | null;
  periodo: string;
  dataEmissao: string;
  slug: string;
  siteUrl: string;
}

/** Os botões "Ver o crachá" / "Ver o certificado": desenham com um nome de exemplo e o que está na tela (antes de salvar). */
export function ligarPrevias(op: { obterConfig: () => Record<string, unknown>; evento: () => EventoParaPrevia }) {
  const img = q<HTMLImageElement>("[data-previa-img]");
  const aviso = q<HTMLElement>("[data-previa-aviso]");
  const canvas = document.createElement("canvas");
  const mostrar = async (tipo: "cracha" | "certificado") => {
    if (!img) return;
    if (aviso) aviso.textContent = "Desenhando…";
    try {
      const config = op.obterConfig();
      const e = op.evento();
      const cert = normalizarCertificado(config);
      const recursos = await prepararRecursos({ capa: e.capa, assinaturas: cert.assinantes.map((a) => a.assinatura) });
      if (tipo === "cracha") {
        desenharCracha(
          canvas,
          { nome: "Maria Aparecida dos Santos", evento: e.titulo || "Nome do evento", subtitulo: e.subtitulo || null, tipo: config.tipo ? "Participante" : null, linhas: [config.igreja ? "Congregação Exemplo" : "", config.cidade ? "Parauapebas" : ""].filter(Boolean), qr: config.qr ? "0:EXEMPL" : null, codigo: config.qr ? "A3F9K2" : null },
          config,
          recursos,
          720 / CRACHA.largura,
        );
        img.className = "arte-previa arte-previa-em-pe";
      } else {
        desenharCertificado(
          canvas,
          { nome: "Maria Aparecida dos Santos", evento: e.titulo || "Nome do evento", data: e.periodo, dataEmissao: e.dataEmissao, tipo: "Participante", codigo: "A3F9K2", urlVerificacao: urlVerificacao(e.siteUrl, e.slug || "evento", "A3F9K2"), verificacaoCurta: "ieadespa.org.br/verificar-certificado" },
          config,
          recursos,
          1600 / CERTIFICADO.largura,
        );
        img.className = "arte-previa arte-previa-deitada";
      }
      img.src = canvas.toDataURL("image/png");
      img.hidden = false;
      if (aviso) aviso.textContent = e.capa && !recursos.capa && tipo === "cracha" ? "A imagem do evento não carregou aqui (ela aparece no site oficial)." : "Exemplo com um nome fictício. Salve para valer.";
    } catch {
      if (aviso) aviso.textContent = "Não foi possível desenhar a prévia agora.";
    }
  };
  q<HTMLButtonElement>("[data-previa-cracha]")?.addEventListener("click", () => void mostrar("cracha"));
  q<HTMLButtonElement>("[data-previa-certificado]")?.addEventListener("click", () => void mostrar("certificado"));
}
