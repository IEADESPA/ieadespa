/**
 * Painel de conteúdo — o desenho de cada TIPO DE CAMPO no navegador (ver `painelConteudo.ts`, onde ficam a
 * configuração e as regras que não dependem de tela). `montarCampo` recebe um campo da configuração e devolve
 * um bloco pronto (rótulo, controle, ajuda, erro) com quatro operações: `ler`, `definir`, `erro`, `focar`.
 * Só roda no navegador.
 */
import { directusAssetUrl } from "@/lib/directus";
import {
  MENSAGEM_ASSINATURA,
  REGRA_PDF,
  SLUG_VALIDO,
  SessaoExpiradaErro,
  confereAssinatura,
  dataBR,
  dataHoraBR,
  explicarErroDirectus,
  fotosDeDirectus,
  isoParaLocalInput,
  localInputParaIso,
  paraDirectus,
  renderizarMarkdownSeguro,
  slugify,
  tamanhoLegivel,
  urlSegura,
  validarArquivoPorRegra,
  type ApiPainel,
  type CampoConteudo,
  type FotoLigada,
  type TipoConteudo,
} from "@/lib/painelConteudo";

export type TomAviso = "info" | "ok" | "erro";

/** O que cada campo precisa saber da página que o contém. */
export interface ContextoForm {
  directusUrl: string;
  tipo: TipoConteudo;
  api: ApiPainel;
  /** Item novo (ainda sem id)? */
  novo: boolean;
  /** Id do item que está sendo editado (para conferir o endereço sem se contar). */
  itemId: () => number | null;
  /** O item já estava publicado quando a página abriu? */
  publicadoAoCarregar: () => boolean;
  /** Um campo mudou (digitação, escolha, envio de imagem). */
  aoAlterar: (nome: string) => void;
  /** Valor atual de outro campo do formulário. */
  valorDe: (nome: string) => unknown;
  /** Marca a tela como ocupada (desliga os botões de salvar) até a função devolvida ser chamada. */
  ocupar: () => () => void;
  /** A sessão acabou no meio de uma ação do campo. */
  sessaoExpirou: () => void;
}

export interface CampoMontado {
  campo: CampoConteudo;
  raiz: HTMLElement;
  /** Valor atual, já no formato que o Directus guarda (texto vazio vira `null`). */
  ler: () => unknown;
  /** Põe um valor vindo do Directus (não conta como alteração do usuário). */
  definir: (valor: unknown) => void;
  /** Mostra (ou limpa, com `null`) o erro deste campo. */
  erro: (mensagem: string | null) => void;
  focar: () => void;
  /** Chamado quando OUTRO campo muda (usado pelo endereço, que acompanha o título). */
  aoMudarOutroCampo?: (nome: string) => void;
}

// ----------------------------------------------------------------------------------------------
// Utilidades de DOM
// ----------------------------------------------------------------------------------------------

type Filho = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  atributos: Record<string, string | boolean | undefined> = {},
  ...filhos: Filho[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [nome, valor] of Object.entries(atributos)) {
    if (valor === undefined || valor === false) continue;
    if (nome === "class") el.className = String(valor);
    else if (valor === true) el.setAttribute(nome, "");
    else el.setAttribute(nome, valor);
  }
  for (const f of filhos) {
    if (f === null || f === undefined || f === false) continue;
    el.append(typeof f === "string" ? document.createTextNode(f) : f);
  }
  return el;
}

const idDoCampo = (campo: CampoConteudo) => `pc-f-${campo.nome}`;

interface Casca {
  raiz: HTMLElement;
  erroEl: HTMLElement;
  mostrarErro: (mensagem: string | null) => void;
}

/** Bloco padrão de um campo: rótulo, controle, ajuda e linha de erro. */
function casca(
  campo: CampoConteudo,
  controle: HTMLElement,
  opcoes: { semRotulo?: boolean; rotuloPara?: string } = {},
): Casca {
  const erroEl = h("p", {
    class: "pc-erro",
    role: "alert",
    id: `${idDoCampo(campo)}-erro`,
    hidden: true,
  });
  const rotulo = opcoes.semRotulo
    ? null
    : h(
        "label",
        { class: "pc-rotulo", for: opcoes.rotuloPara ?? idDoCampo(campo) },
        campo.rotulo,
        campo.obrigatorio ? h("span", { class: "pc-obrig", "aria-hidden": "true" }, " *") : null,
      );
  const ajuda = campo.ajuda
    ? h("p", { class: "pc-ajuda", id: `${idDoCampo(campo)}-ajuda` }, campo.ajuda)
    : null;
  const raiz = h(
    "div",
    {
      class: `pc-campo${campo.meia ? " pc-campo-meia" : ""}`,
      "data-campo": campo.nome,
      "data-tipo": campo.tipo,
    },
    rotulo,
    controle,
    ajuda,
    erroEl,
  );
  const mostrarErro = (mensagem: string | null) => {
    erroEl.textContent = mensagem ?? "";
    erroEl.hidden = !mensagem;
    raiz.classList.toggle("pc-campo-com-erro", Boolean(mensagem));
    controle.querySelectorAll<HTMLElement>("input,select,textarea").forEach((c) => {
      if (mensagem) c.setAttribute("aria-invalid", "true");
      else c.removeAttribute("aria-invalid");
    });
  };
  return { raiz, erroEl, mostrarErro };
}

// ----------------------------------------------------------------------------------------------
// Campos simples (texto, número, data, url, select, área de texto)
// ----------------------------------------------------------------------------------------------

function montarEntrada(campo: CampoConteudo, ctx: ContextoForm): CampoMontado {
  const id = idDoCampo(campo);
  const comum: Record<string, string | boolean | undefined> = {
    id,
    class: "field",
    name: campo.nome,
    placeholder: campo.placeholder,
    "aria-describedby": campo.ajuda ? `${id}-ajuda ${id}-erro` : `${id}-erro`,
  };
  let controle: HTMLInputElement | HTMLTextAreaElement;
  if (campo.tipo === "textarea") {
    controle = h("textarea", { ...comum, rows: String(campo.linhas ?? 4) });
  } else {
    const tipoInput =
      { text: "text", url: "url", number: "number", date: "date", datetime: "datetime-local" }[
        campo.tipo as "text"
      ] ?? "text";
    controle = h("input", { ...comum, type: tipoInput, autocomplete: "off" });
    if (campo.tipo === "url") {
      controle.setAttribute("inputmode", "url");
      controle.setAttribute("autocapitalize", "off");
      controle.setAttribute("spellcheck", "false");
    }
    if (campo.tipo === "number") {
      controle.setAttribute("inputmode", "numeric");
      if (campo.min !== undefined) controle.min = String(campo.min);
      if (campo.max !== undefined) controle.max = String(campo.max);
      controle.step = String(campo.passo ?? 1);
    }
  }
  // Sugestões: os valores que já existem nesse campo (ex.: nomes de álbum), para não escrever o mesmo de dois jeitos.
  let sugestoes: HTMLDataListElement | null = null;
  if (campo.sugerirExistentes && campo.tipo === "text") {
    sugestoes = h("datalist", { id: `${id}-sugestoes` });
    controle.setAttribute("list", sugestoes.id);
    const lista = sugestoes;
    void (async () => {
      try {
        const res = await ctx.api(
          `/items/${ctx.tipo.colecao}?fields=${encodeURIComponent(campo.nome)}&limit=-1&sort=${encodeURIComponent(campo.nome)}`,
        );
        if (!res.ok) return;
        const json = (await res.json()) as { data?: Record<string, unknown>[] };
        const vistos = new Set<string>();
        for (const item of json.data ?? []) {
          const v = typeof item[campo.nome] === "string" ? (item[campo.nome] as string).trim() : "";
          if (v && !vistos.has(v)) {
            vistos.add(v);
            lista.append(h("option", { value: v }));
          }
        }
      } catch {
        /* sugestão é só um luxo: sem ela o campo funciona igual */
      }
    })();
  }
  const c = casca(campo, sugestoes ? h("div", {}, controle, sugestoes) : controle);
  controle.addEventListener("input", () => {
    c.mostrarErro(null);
    ctx.aoAlterar(campo.nome);
  });
  return {
    campo,
    raiz: c.raiz,
    ler: () => {
      const v = controle.value;
      if (campo.tipo === "datetime") return paraDirectus(campo, localInputParaIso(v));
      if (campo.tipo === "number")
        return v === "" ? null : controle.validity.badInput ? Number.NaN : paraDirectus(campo, v);
      return paraDirectus(campo, v);
    },
    definir: (valor) => {
      if (valor === null || valor === undefined) controle.value = "";
      else if (campo.tipo === "datetime") controle.value = isoParaLocalInput(valor);
      else if (campo.tipo === "date") controle.value = String(valor).slice(0, 10);
      else controle.value = String(valor);
    },
    erro: c.mostrarErro,
    focar: () => controle.focus(),
  };
}

function montarSelecao(campo: CampoConteudo, ctx: ContextoForm): CampoMontado {
  const id = idDoCampo(campo);
  const sel = h("select", {
    id,
    class: "field",
    name: campo.nome,
    "aria-describedby": campo.ajuda ? `${id}-ajuda ${id}-erro` : `${id}-erro`,
  });
  // Com valor padrão não há opção "em branco": a pessoa não deixa o campo sem valor por engano (a categoria de uma
  // mensagem em branco derrubaria a montagem do site). Obrigatório SEM padrão (ex.: o dia da programação) começa em
  // branco, para a escolha ser consciente, e a validação exige que ela seja feita.
  const semVazio = campo.padrao !== undefined;
  const opcoes = campo.opcoes ?? [];
  const montarOpcoes = (valorAtual: string) => {
    sel.replaceChildren();
    if (!semVazio)
      sel.append(
        h("option", { value: "" }, campo.obrigatorio ? "— Escolha uma opção —" : "— Nenhuma —"),
      );
    for (const o of opcoes) sel.append(h("option", { value: o.valor }, o.rotulo));
    if (valorAtual && !opcoes.some((o) => o.valor === valorAtual))
      sel.append(h("option", { value: valorAtual }, `${valorAtual} (valor antigo)`));
    sel.value = valorAtual || (semVazio && opcoes[0] ? opcoes[0].valor : "");
  };
  montarOpcoes("");
  const c = casca(campo, sel);
  sel.addEventListener("change", () => {
    c.mostrarErro(null);
    ctx.aoAlterar(campo.nome);
  });
  return {
    campo,
    raiz: c.raiz,
    ler: () => paraDirectus(campo, sel.value),
    definir: (valor) => montarOpcoes(valor === null || valor === undefined ? "" : String(valor)),
    erro: c.mostrarErro,
    focar: () => sel.focus(),
  };
}

function montarRelacao(campo: CampoConteudo, ctx: ContextoForm): CampoMontado {
  const id = idDoCampo(campo);
  const sel = h("select", {
    id,
    class: "field",
    name: campo.nome,
    "aria-describedby": campo.ajuda ? `${id}-ajuda ${id}-erro` : `${id}-erro`,
  });
  const aviso = h("p", { class: "pc-ajuda", hidden: true });
  const c = casca(campo, h("div", {}, sel, aviso));
  // O valor "de verdade" fica aqui: não depende de as opções já terem chegado do Directus.
  let valor: number | string | null = null;
  const opcoes: { id: number | string; rotulo: string }[] = [];
  const pintar = () => {
    sel.replaceChildren(h("option", { value: "" }, "— Nenhum —"));
    for (const o of opcoes) sel.append(h("option", { value: String(o.id) }, o.rotulo));
    if (valor !== null && !opcoes.some((o) => String(o.id) === String(valor)))
      sel.append(
        h(
          "option",
          { value: String(valor) },
          typeof valor === "number" ? `Item nº ${valor}` : String(valor),
        ),
      );
    sel.value = valor === null ? "" : String(valor);
  };
  pintar();
  void (async () => {
    const rotuloCampo = campo.campoRotuloRelacionado ?? "id";
    try {
      const res = await ctx.api(
        `/items/${campo.colecaoRelacionada}?fields=id,${rotuloCampo}&sort=${campo.campoOrdemRelacionado ?? rotuloCampo}&limit=-1`,
      );
      if (!res.ok) {
        sel.disabled = true;
        aviso.hidden = false;
        aviso.textContent =
          res.status === 403
            ? "Seu perfil não pode ver esta lista; o valor atual será mantido."
            : "Não foi possível carregar a lista agora.";
        return;
      }
      const json = (await res.json()) as { data?: Record<string, unknown>[] };
      for (const item of json.data ?? [])
        opcoes.push({
          id: item.id as number,
          rotulo: String(item[rotuloCampo] ?? `Item ${item.id}`),
        });
      pintar();
    } catch (e) {
      if (e instanceof SessaoExpiradaErro) ctx.sessaoExpirou();
      sel.disabled = true;
    }
  })();
  sel.addEventListener("change", () => {
    valor = paraDirectus(campo, sel.value) as number | string | null;
    c.mostrarErro(null);
    ctx.aoAlterar(campo.nome);
  });
  return {
    campo,
    raiz: c.raiz,
    ler: () => valor,
    definir: (v) => {
      valor = v === null || v === undefined || v === "" ? null : (v as number | string);
      pintar();
    },
    erro: c.mostrarErro,
    focar: () => sel.focus(),
  };
}

// ----------------------------------------------------------------------------------------------
// Sim/não e somente leitura
// ----------------------------------------------------------------------------------------------

function montarBooleano(campo: CampoConteudo, ctx: ContextoForm): CampoMontado {
  const id = idDoCampo(campo);
  const caixa = h("input", {
    id,
    type: "checkbox",
    name: campo.nome,
    class: "pc-caixa",
    "aria-describedby": campo.ajuda ? `${id}-ajuda` : undefined,
  });
  const rotulo = h(
    "label",
    { class: "pc-caixa-rotulo", for: id },
    caixa,
    h("span", {}, campo.rotulo),
  );
  const c = casca(campo, rotulo, { semRotulo: true });
  caixa.addEventListener("change", () => ctx.aoAlterar(campo.nome));
  return {
    campo,
    raiz: c.raiz,
    ler: () => caixa.checked,
    definir: (valor) => {
      caixa.checked = Boolean(valor);
    },
    erro: c.mostrarErro,
    focar: () => caixa.focus(),
  };
}

function montarSomenteLeitura(campo: CampoConteudo): CampoMontado {
  const valorEl = h("p", { class: "pc-leitura", id: idDoCampo(campo) });
  const c = casca(campo, valorEl);
  let atual: unknown = null;
  const pintar = () => {
    let texto = "—";
    if (campo.formato === "sim-nao")
      texto = atual ? (campo.rotuloSim ?? "Sim") : (campo.rotuloNao ?? "Não");
    else if (campo.formato === "data") texto = dataBR(atual) || "—";
    else if (campo.formato === "datahora") texto = dataHoraBR(atual) || "—";
    else if (atual !== null && atual !== undefined && atual !== "") texto = String(atual);
    valorEl.textContent = texto;
  };
  pintar();
  return {
    campo,
    raiz: c.raiz,
    ler: () => atual,
    definir: (valor) => {
      atual = valor;
      pintar();
    },
    erro: c.mostrarErro,
    focar: () => undefined,
  };
}

// ----------------------------------------------------------------------------------------------
// Endereço (slug)
// ----------------------------------------------------------------------------------------------

function montarEndereco(campo: CampoConteudo, ctx: ContextoForm): CampoMontado {
  const id = idDoCampo(campo);
  const entrada = h("input", {
    id,
    class: "field",
    name: campo.nome,
    type: "text",
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: "false",
    placeholder: "endereco-da-pagina",
    "aria-describedby": `${id}-ajuda ${id}-erro ${id}-previa`,
  });
  const gerar = h(
    "button",
    { type: "button", class: "btn btn-outline pc-slug-gerar" },
    "Gerar do título",
  );
  const previa = h("p", { class: "pc-slug-previa", id: `${id}-previa` });
  const aviso = h(
    "p",
    { class: "pc-aviso-slug", role: "status", hidden: true },
    "Atenção: este item já está publicado. Se você mudar o endereço, os links antigos (já compartilhados, no WhatsApp, em buscas) deixam de funcionar.",
  );
  const dica = h("p", { class: "pc-slug-dica", role: "status", hidden: true });
  const c = casca(
    campo,
    h("div", {}, h("div", { class: "pc-slug-linha" }, entrada, gerar), previa, aviso, dica),
  );

  // Item novo: o endereço acompanha o título até a pessoa mexer nele. Item existente: nunca muda sozinho.
  let automatico = ctx.novo;
  let original = "";
  let sequencia = 0;
  let temporizador: ReturnType<typeof setTimeout> | undefined;

  const atualizarPrevia = () => {
    const v = entrada.value.trim();
    previa.textContent = v
      ? `Endereço no site: ${ctx.tipo.urlPublica({ [campo.nome]: v }) ?? v}`
      : "";
    aviso.hidden = !(ctx.publicadoAoCarregar() && original !== "" && v !== original);
  };

  const conferirUnico = () => {
    clearTimeout(temporizador);
    const v = entrada.value.trim();
    dica.hidden = true;
    if (!v || !SLUG_VALIDO.test(v) || v === original) return;
    const minha = ++sequencia;
    temporizador = setTimeout(async () => {
      try {
        const eu = ctx.itemId();
        const res = await ctx.api(
          `/items/${ctx.tipo.colecao}?fields=id&limit=1&filter[${campo.nome}][_eq]=${encodeURIComponent(v)}${eu ? `&filter[id][_neq]=${eu}` : ""}`,
        );
        if (minha !== sequencia || !res.ok) return;
        const json = (await res.json()) as { data?: unknown[] };
        if ((json.data ?? []).length > 0) {
          dica.hidden = false;
          dica.textContent =
            "Já existe outro item com este endereço. Troque o endereço para poder salvar.";
        }
      } catch (e) {
        if (e instanceof SessaoExpiradaErro) return; // a tela de edição já avisa quando a pessoa for salvar
      }
    }, 450);
  };

  const gerarDoTitulo = () => {
    const origem = campo.slugDe ? ctx.valorDe(campo.slugDe) : "";
    entrada.value = slugify(typeof origem === "string" ? origem : "", 80);
    c.mostrarErro(null);
    atualizarPrevia();
    conferirUnico();
    ctx.aoAlterar(campo.nome);
  };

  entrada.addEventListener("input", () => {
    // Digitou algo: passa a ser manual. Apagou tudo: volta a acompanhar o título.
    automatico = entrada.value.trim() === "" ? ctx.novo : false;
    c.mostrarErro(null);
    atualizarPrevia();
    conferirUnico();
    ctx.aoAlterar(campo.nome);
  });
  gerar.addEventListener("click", () => {
    automatico = ctx.novo; // clicar em "Gerar" num item novo mantém o acompanhamento
    gerarDoTitulo();
    entrada.focus();
  });

  return {
    campo,
    raiz: c.raiz,
    ler: () => paraDirectus(campo, entrada.value),
    definir: (valor) => {
      entrada.value = valor === null || valor === undefined ? "" : String(valor);
      original = entrada.value;
      atualizarPrevia();
    },
    erro: c.mostrarErro,
    focar: () => entrada.focus(),
    aoMudarOutroCampo: (nome) => {
      if (!ctx.novo || !automatico || nome !== campo.slugDe) return;
      const origem = ctx.valorDe(nome);
      entrada.value = slugify(typeof origem === "string" ? origem : "", 80);
      atualizarPrevia();
      conferirUnico();
      ctx.aoAlterar(campo.nome);
    },
  };
}

// ----------------------------------------------------------------------------------------------
// Imagem (envio + prévia + remover)
// ----------------------------------------------------------------------------------------------

export const IMAGEM_TIPOS_ACEITOS = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const IMAGEM_MAX_BYTES = 8 * 1024 * 1024;

/** Confere o arquivo antes de enviar. Devolve a mensagem de recusa ou `null` se pode enviar. */
export function validarArquivoImagem(arquivo: {
  type: string;
  size: number;
  name?: string;
}): string | null {
  if (!IMAGEM_TIPOS_ACEITOS.includes(arquivo.type))
    return "Esse tipo de arquivo não serve. Envie uma imagem JPEG, PNG, WebP ou GIF.";
  if (arquivo.size > IMAGEM_MAX_BYTES)
    return `A imagem tem ${(arquivo.size / 1048576).toFixed(1).replace(".", ",")} MB e o limite é 8 MB. Escolha uma imagem menor (ou reduza esta).`;
  if (arquivo.size === 0) return "O arquivo está vazio.";
  return null;
}

/** O que dizer quando o envio de um arquivo dá errado (a frase muda com o tipo: imagem, documento…). */
interface TextosEnvio {
  /** O que a pessoa estava fazendo, para o 403 ("Seu perfil não pode enviar imagens aqui"). */
  acao: string;
  /** O Directus recusou o arquivo (400): o que serve. */
  recusado: string;
  /** Sem conexão. */
  semConexao: string;
}

/** Envia um arquivo ao Directus (token do próprio usuário). Devolve o id do arquivo ou a mensagem do que deu errado. */
async function enviarArquivoAoDirectus(
  ctx: ContextoForm,
  arquivo: File,
  textos: TextosEnvio,
): Promise<{ id: string } | { erro: string; sessao?: boolean }> {
  try {
    const corpo = new FormData();
    corpo.append("file", arquivo, arquivo.name);
    const res = await ctx.api("/files", { method: "POST", body: corpo });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      const e = explicarErroDirectus(res.status, json, textos.acao);
      return { erro: res.status === 400 ? textos.recusado : e.mensagem };
    }
    const json = (await res.json()) as { data?: { id?: string } };
    if (!json.data?.id) throw new Error("resposta sem id");
    return { id: json.data.id };
  } catch (e) {
    if (e instanceof SessaoExpiradaErro) return { erro: "", sessao: true };
    return { erro: textos.semConexao };
  }
}

/** Envia uma imagem ao Directus. */
const enviarArquivoImagem = (ctx: ContextoForm, arquivo: File) =>
  enviarArquivoAoDirectus(ctx, arquivo, {
    acao: "enviar imagens",
    recusado: "O servidor não aceitou este arquivo como imagem. Use JPEG, PNG, WebP ou GIF.",
    semConexao: "Não foi possível enviar a imagem agora (sem conexão?). Tente de novo.",
  });

function montarImagem(campo: CampoConteudo, ctx: ContextoForm): CampoMontado {
  const id = idDoCampo(campo);
  const previa = h("img", { class: "pc-img-previa", alt: "Prévia da imagem", hidden: true });
  const vazio = h("p", { class: "pc-ajuda pc-img-vazio" }, "Nenhuma imagem escolhida.");
  const arquivoEl = h("input", {
    id,
    type: "file",
    class: "pc-img-arquivo",
    accept: IMAGEM_TIPOS_ACEITOS.join(","),
    "aria-describedby": `${id}-ajuda ${id}-erro`,
  });
  const escolher = h(
    "button",
    { type: "button", class: "btn btn-outline pc-img-escolher" },
    "Escolher imagem",
  );
  const remover = h(
    "button",
    { type: "button", class: "btn btn-outline pc-img-remover", hidden: true },
    "Remover imagem",
  );
  const status = h("p", { class: "pc-img-status", role: "status", "aria-live": "polite" });
  const c = casca(
    campo,
    h(
      "div",
      { class: "pc-img" },
      h("div", { class: "pc-img-quadro" }, previa, vazio),
      h("div", { class: "pc-img-botoes" }, escolher, remover),
      arquivoEl,
      status,
    ),
    { rotuloPara: id },
  );

  let valor: string | null = null;
  let urlLocal: string | null = null;

  const pintar = (usarLocal: boolean) => {
    const tem = Boolean(valor);
    previa.hidden = !tem;
    vazio.hidden = tem;
    remover.hidden = !tem;
    escolher.textContent = tem ? "Trocar imagem" : "Escolher imagem";
    if (tem)
      previa.src =
        usarLocal && urlLocal
          ? urlLocal
          : directusAssetUrl(String(valor), { width: 640, quality: 80, format: "webp" });
    else previa.removeAttribute("src");
  };
  const soltarUrlLocal = () => {
    if (urlLocal) URL.revokeObjectURL(urlLocal);
    urlLocal = null;
  };

  escolher.addEventListener("click", () => arquivoEl.click());
  remover.addEventListener("click", () => {
    valor = null;
    soltarUrlLocal();
    status.textContent =
      "Imagem removida deste item (o arquivo continua guardado no Directus). Salve para valer.";
    arquivoEl.value = "";
    c.mostrarErro(null);
    pintar(false);
    ctx.aoAlterar(campo.nome);
  });

  arquivoEl.addEventListener("change", async () => {
    const arquivo = arquivoEl.files?.[0];
    arquivoEl.value = "";
    if (!arquivo) return;
    const recusa = validarArquivoImagem(arquivo);
    if (recusa) {
      c.mostrarErro(recusa);
      status.textContent = "";
      return;
    }
    c.mostrarErro(null);
    status.textContent = "Enviando imagem…";
    const soltar = ctx.ocupar();
    escolher.disabled = true;
    try {
      const r = await enviarArquivoImagem(ctx, arquivo);
      if (!("id" in r)) {
        status.textContent = "";
        if (r.sessao) ctx.sessaoExpirou();
        else c.mostrarErro(r.erro);
        return;
      }
      soltarUrlLocal();
      urlLocal = URL.createObjectURL(arquivo);
      valor = r.id;
      pintar(true);
      status.textContent = "Imagem enviada. Salve o item para valer.";
      ctx.aoAlterar(campo.nome);
    } finally {
      escolher.disabled = false;
      soltar();
    }
  });

  return {
    campo,
    raiz: c.raiz,
    ler: () => valor,
    definir: (v) => {
      valor = typeof v === "string" && v ? v : null;
      soltarUrlLocal();
      pintar(false);
    },
    erro: c.mostrarErro,
    focar: () => escolher.focus(),
  };
}

// ----------------------------------------------------------------------------------------------
// Arquivo (PDF de relatório): envio do aparelho, nome e tamanho, "Abrir / baixar" e "Trocar arquivo"
// ----------------------------------------------------------------------------------------------

function montarArquivo(campo: CampoConteudo, ctx: ContextoForm): CampoMontado {
  const id = idDoCampo(campo);
  const regra = campo.regraArquivo ?? REGRA_PDF;
  const rotuloTipo = (regra.extensoes[0] ?? "").replace(/^\./, "").toUpperCase();
  const nomeEl = h("strong", { class: "pc-arquivo-nome" });
  const detalheEl = h("span", { class: "pc-arquivo-detalhe" });
  const abrir = h(
    "a",
    {
      class: "btn btn-outline pc-arquivo-abrir",
      target: "_blank",
      rel: "noopener noreferrer",
    },
    "Abrir / baixar",
  );
  const cartao = h(
    "div",
    { class: "pc-arquivo-cartao", hidden: true },
    h("span", { class: "pc-arquivo-icone", "aria-hidden": "true" }, "📄"),
    h("div", { class: "pc-arquivo-texto" }, nomeEl, detalheEl),
    abrir,
  );
  const vazio = h("p", { class: "pc-ajuda pc-arquivo-vazio" }, "Nenhum arquivo escolhido.");
  const arquivoEl = h("input", {
    id,
    type: "file",
    class: "pc-img-arquivo",
    accept: [...regra.extensoes, ...regra.tipos].join(","),
    "aria-describedby": campo.ajuda ? `${id}-ajuda ${id}-erro` : `${id}-erro`,
  });
  const escolher = h(
    "button",
    { type: "button", class: "btn btn-outline pc-arquivo-escolher" },
    "Escolher arquivo",
  );
  const status = h("p", { class: "pc-img-status", role: "status", "aria-live": "polite" });
  const c = casca(
    campo,
    h(
      "div",
      { class: "pc-arquivo" },
      cartao,
      vazio,
      h("div", { class: "pc-img-botoes" }, escolher),
      arquivoEl,
      status,
    ),
    { rotuloPara: id },
  );

  let valor: string | null = null;
  let meta: { nome: string; tamanho: number | null } | null = null;
  let sequencia = 0;

  const pintar = () => {
    const tem = Boolean(valor);
    cartao.hidden = !tem;
    vazio.hidden = tem;
    escolher.textContent = tem ? "Trocar arquivo" : "Escolher arquivo";
    if (!tem || !valor) return;
    const nome = meta?.nome || "Arquivo enviado";
    nomeEl.textContent = nome;
    detalheEl.textContent = [rotuloTipo, meta?.tamanho != null ? tamanhoLegivel(meta.tamanho) : ""]
      .filter(Boolean)
      .join(" · ");
    abrir.href = directusAssetUrl(valor);
    abrir.setAttribute("aria-label", `Abrir ou baixar ${nome}`);
  };

  /** Nome e tamanho de um arquivo que já estava guardado (se o perfil não pode ler os dados do arquivo, mostra só "Arquivo enviado"). */
  const carregarMeta = async (arquivoId: string) => {
    const minha = ++sequencia;
    try {
      const res = await ctx.api(
        `/files/${encodeURIComponent(arquivoId)}?fields=id,filename_download,filesize`,
      );
      if (minha !== sequencia || !res.ok) return;
      const json = (await res.json()) as {
        data?: { filename_download?: string; filesize?: number | string };
      };
      const d = json.data;
      if (!d) return;
      const tamanho = Number(d.filesize);
      meta = {
        nome: String(d.filename_download ?? ""),
        tamanho: Number.isFinite(tamanho) && tamanho > 0 ? tamanho : null,
      };
      pintar();
    } catch (e) {
      if (e instanceof SessaoExpiradaErro) return; // a tela já avisa quando a pessoa for salvar
    }
  };

  escolher.addEventListener("click", () => arquivoEl.click());
  arquivoEl.addEventListener("change", async () => {
    const arquivo = arquivoEl.files?.[0];
    arquivoEl.value = "";
    if (!arquivo) return;
    const recusa = validarArquivoPorRegra(arquivo, regra);
    if (recusa) {
      c.mostrarErro(recusa);
      status.textContent = "";
      return;
    }
    if (regra.assinatura) {
      // O começo do conteúdo: um PDF de verdade começa com "%PDF-" (barra arquivo de outro tipo só renomeado).
      let bytes: Uint8Array | null = null;
      try {
        bytes = new Uint8Array(await arquivo.slice(0, 1024).arrayBuffer());
      } catch {
        bytes = null; // não deu para ler o começo: segue (o Directus ainda confere o tipo)
      }
      if (bytes && !confereAssinatura(bytes, regra.assinatura)) {
        c.mostrarErro(MENSAGEM_ASSINATURA);
        status.textContent = "";
        return;
      }
    }
    c.mostrarErro(null);
    status.textContent = "Enviando arquivo…";
    const soltar = ctx.ocupar();
    escolher.disabled = true;
    try {
      // Alguns aparelhos não dizem o tipo do arquivo: manda com o tipo certo (a extensão já foi conferida).
      const paraEnviar = arquivo.type
        ? arquivo
        : new File([arquivo], arquivo.name, { type: regra.tipos[0] });
      const r = await enviarArquivoAoDirectus(ctx, paraEnviar, {
        acao: "enviar arquivos",
        recusado: `O servidor não aceitou este arquivo. Envie ${regra.rotulo} de até ${tamanhoLegivel(regra.maxBytes)}.`,
        semConexao: "Não foi possível enviar o arquivo agora (sem conexão?). Tente de novo.",
      });
      if (!("id" in r)) {
        status.textContent = "";
        if (r.sessao) ctx.sessaoExpirou();
        else c.mostrarErro(r.erro);
        return;
      }
      const substituiu = Boolean(valor);
      sequencia++; // uma leitura de dados do arquivo anterior que ainda esteja a caminho perde a validade
      valor = r.id;
      meta = { nome: arquivo.name, tamanho: arquivo.size };
      pintar();
      status.textContent = substituiu
        ? "Arquivo enviado. Salve para valer. O arquivo anterior continua guardado no Directus, mas deixa de estar ligado a este item."
        : "Arquivo enviado. Salve para valer.";
      ctx.aoAlterar(campo.nome);
    } finally {
      escolher.disabled = false;
      soltar();
    }
  });

  return {
    campo,
    raiz: c.raiz,
    ler: () => valor,
    definir: (v) => {
      valor = typeof v === "string" && v ? v : null;
      meta = null;
      sequencia++;
      pintar();
      if (valor) void carregarMeta(valor);
    },
    erro: c.mostrarErro,
    focar: () => escolher.focus(),
  };
}

// ----------------------------------------------------------------------------------------------
// Várias fotos (galeria de um item: tabela de ligação com uma linha por foto)
// ----------------------------------------------------------------------------------------------

function montarFotos(campo: CampoConteudo, ctx: ContextoForm): CampoMontado {
  const id = idDoCampo(campo);
  const maximo = campo.maximo ?? 30;
  const lista = h("ul", { class: "pc-fotos-lista", "aria-label": campo.rotulo });
  const vazio = h("p", { class: "pc-ajuda pc-fotos-vazio" }, "Nenhuma foto adicionada.");
  const arquivoEl = h("input", {
    id,
    type: "file",
    multiple: true,
    class: "pc-img-arquivo",
    accept: IMAGEM_TIPOS_ACEITOS.join(","),
    "aria-describedby": `${id}-ajuda ${id}-erro`,
  });
  const adicionar = h(
    "button",
    { type: "button", class: "btn btn-outline pc-fotos-adicionar" },
    "Adicionar fotos",
  );
  const status = h("p", { class: "pc-img-status", role: "status", "aria-live": "polite" });
  const c = casca(
    campo,
    h(
      "div",
      { class: "pc-fotos" },
      lista,
      vazio,
      h("div", { class: "pc-img-botoes" }, adicionar),
      arquivoEl,
      status,
    ),
    { rotuloPara: id },
  );

  let fotos: FotoLigada[] = [];
  const locais = new Map<string, string>(); // arquivo enviado agora → endereço local para a miniatura

  const soltarLocais = () => {
    for (const u of locais.values()) URL.revokeObjectURL(u);
    locais.clear();
  };

  const pintar = (focoEm?: { arquivo: string; acao: "esq" | "dir" | "remover" }) => {
    lista.replaceChildren();
    vazio.hidden = fotos.length > 0;
    adicionar.disabled = fotos.length >= maximo;
    fotos.forEach((foto, i) => {
      const num = i + 1;
      const img = h("img", {
        class: "pc-foto-img",
        alt: `Foto ${num} de ${fotos.length}`,
        width: "96",
        height: "96",
        loading: "lazy",
      });
      img.src =
        locais.get(foto.arquivo) ??
        directusAssetUrl(foto.arquivo, {
          width: 192,
          height: 192,
          fit: "cover",
          quality: 70,
          format: "webp",
        });
      const botao = (acao: "esq" | "dir" | "remover", texto: string, dica: string, off = false) =>
        h(
          "button",
          {
            type: "button",
            class: `btn btn-outline pc-foto-btn${acao === "remover" ? " pc-btn-perigo" : ""}`,
            "data-foto-acao": acao,
            "aria-label": dica,
            title: dica,
            disabled: off,
          },
          texto,
        );
      const esq = botao("esq", "◀", `Mover a foto ${num} para antes`, i === 0);
      const dir = botao("dir", "▶", `Mover a foto ${num} para depois`, i === fotos.length - 1);
      const rem = botao("remover", "Remover", `Remover a foto ${num} deste item`);
      const mover = (de: number, para: number, acao: "esq" | "dir") => {
        const novo = [...fotos];
        const [x] = novo.splice(de, 1);
        novo.splice(para, 0, x);
        fotos = novo;
        c.mostrarErro(null);
        status.textContent = `Foto movida para a posição ${para + 1}. Salve para valer.`;
        pintar({ arquivo: x.arquivo, acao });
        ctx.aoAlterar(campo.nome);
      };
      esq.addEventListener("click", () => mover(i, i - 1, "esq"));
      dir.addEventListener("click", () => mover(i, i + 1, "dir"));
      rem.addEventListener("click", () => {
        fotos = fotos.filter((_, j) => j !== i);
        c.mostrarErro(null);
        status.textContent =
          "Foto tirada deste item (o arquivo continua guardado no Directus). Salve para valer.";
        pintar();
        ctx.aoAlterar(campo.nome);
        adicionar.focus();
      });
      lista.append(
        h(
          "li",
          { class: "pc-foto", "data-foto": foto.arquivo },
          img,
          h("div", { class: "pc-foto-botoes" }, esq, dir, rem),
        ),
      );
    });
    if (focoEm) {
      const alvo = Array.from(lista.querySelectorAll<HTMLElement>(".pc-foto")).find(
        (li) => li.dataset.foto === focoEm.arquivo,
      );
      const preferido = alvo?.querySelector<HTMLButtonElement>(`[data-foto-acao="${focoEm.acao}"]`);
      (preferido && !preferido.disabled
        ? preferido
        : alvo?.querySelector<HTMLButtonElement>("button:not(:disabled)")
      )?.focus();
    }
  };
  pintar();

  adicionar.addEventListener("click", () => arquivoEl.click());
  arquivoEl.addEventListener("change", async () => {
    const escolhidos = Array.from(arquivoEl.files ?? []);
    arquivoEl.value = "";
    if (!escolhidos.length) return;
    const vagas = maximo - fotos.length;
    const recusas: string[] = [];
    const aceitos: File[] = [];
    for (const arq of escolhidos) {
      const recusa = validarArquivoImagem(arq);
      if (recusa) recusas.push(`${arq.name}: ${recusa}`);
      else if (aceitos.length >= vagas)
        recusas.push(`${arq.name}: passou do limite de ${maximo} fotos neste item.`);
      else aceitos.push(arq);
    }
    c.mostrarErro(recusas.length ? recusas.join(" ") : null);
    if (!aceitos.length) {
      status.textContent = "";
      return;
    }
    const soltar = ctx.ocupar();
    adicionar.disabled = true;
    let enviadas = 0;
    try {
      for (const arq of aceitos) {
        status.textContent = `Enviando foto ${enviadas + 1} de ${aceitos.length}…`;
        const r = await enviarArquivoImagem(ctx, arq);
        if (!("id" in r)) {
          if (r.sessao) ctx.sessaoExpirou();
          else c.mostrarErro([...recusas, `${arq.name}: ${r.erro}`].join(" "));
          break;
        }
        locais.set(r.id, URL.createObjectURL(arq));
        fotos = [...fotos, { id: null, arquivo: r.id, ordem: null }];
        enviadas++;
        pintar();
        ctx.aoAlterar(campo.nome);
      }
      status.textContent = enviadas
        ? `${enviadas === 1 ? "1 foto enviada" : `${enviadas} fotos enviadas`}. Salve o item para valer.`
        : "";
    } finally {
      adicionar.disabled = fotos.length >= maximo;
      soltar();
    }
  });

  return {
    campo,
    raiz: c.raiz,
    ler: () => fotos.map((f) => ({ ...f })),
    definir: (valor) => {
      soltarLocais();
      fotos = fotosDeDirectus(campo, valor);
      pintar();
    },
    erro: c.mostrarErro,
    focar: () => adicionar.focus(),
  };
}

// ----------------------------------------------------------------------------------------------
// Markdown: barra de formatação + prévia ao vivo (sanitizada)
// ----------------------------------------------------------------------------------------------

interface Selecao {
  inicio: number;
  fim: number;
}

/** Troca o trecho selecionado do textarea por `texto`, mantendo o "desfazer" do navegador quando possível. */
function substituir(
  area: HTMLTextAreaElement,
  sel: Selecao,
  texto: string,
  selecionar?: Selecao,
): void {
  area.focus();
  area.setSelectionRange(sel.inicio, sel.fim);
  let feito = false;
  try {
    feito = document.execCommand("insertText", false, texto);
  } catch {
    feito = false;
  }
  if (!feito) {
    area.setRangeText(texto, sel.inicio, sel.fim, "end");
    area.dispatchEvent(new Event("input", { bubbles: true }));
  }
  if (selecionar)
    area.setSelectionRange(sel.inicio + selecionar.inicio, sel.inicio + selecionar.fim);
}

function envolver(area: HTMLTextAreaElement, marca: string, exemplo: string): void {
  const sel = { inicio: area.selectionStart, fim: area.selectionEnd };
  const escolhido = area.value.slice(sel.inicio, sel.fim);
  const texto = escolhido || exemplo;
  substituir(area, sel, `${marca}${texto}${marca}`, {
    inicio: marca.length,
    fim: marca.length + texto.length,
  });
}

/** Põe (ou tira, se todas as linhas já têm) um prefixo no começo de cada linha tocada pela seleção. */
function prefixarLinhas(area: HTMLTextAreaElement, prefixo: string, exemplo: string): void {
  const v = area.value;
  const ini = v.lastIndexOf("\n", area.selectionStart - 1) + 1;
  let fimBusca = v.indexOf("\n", area.selectionEnd);
  if (fimBusca === -1) fimBusca = v.length;
  const trecho = v.slice(ini, fimBusca);
  const linhas = (trecho || exemplo).split("\n");
  const todas = linhas.every((l) => l.startsWith(prefixo));
  const novas = linhas.map((l) =>
    todas ? l.slice(prefixo.length) : l.startsWith(prefixo) ? l : prefixo + l,
  );
  const texto = novas.join("\n");
  substituir(area, { inicio: ini, fim: fimBusca }, texto, { inicio: 0, fim: texto.length });
}

function montarMarkdown(campo: CampoConteudo, ctx: ContextoForm): CampoMontado {
  const id = idDoCampo(campo);
  const area = h("textarea", {
    id,
    class: "field pc-md-texto",
    name: campo.nome,
    rows: String(campo.linhas ?? 12),
    spellcheck: "true",
    placeholder: "Escreva aqui. Use os botões acima para formatar.",
    "aria-describedby": campo.ajuda ? `${id}-ajuda ${id}-erro` : `${id}-erro`,
  });
  const previa = h("div", { class: "prose pc-md-previa", "aria-live": "off" });
  const avisoPrevia = h(
    "p",
    { class: "pc-ajuda pc-md-aviso", hidden: true },
    "Alguns trechos de código (HTML) foram ignorados nesta prévia por segurança.",
  );
  const abaEscrever = h(
    "button",
    {
      type: "button",
      class: "pc-md-aba is-active",
      "data-md-aba": "escrever",
      role: "tab",
      "aria-selected": "true",
    },
    "Escrever",
  );
  const abaPrevia = h(
    "button",
    {
      type: "button",
      class: "pc-md-aba",
      "data-md-aba": "previa",
      role: "tab",
      "aria-selected": "false",
    },
    "Prévia",
  );

  const botao = (acao: string, texto: string, dica: string) =>
    h(
      "button",
      { type: "button", class: "pc-md-btn", "data-md-acao": acao, title: dica, "aria-label": dica },
      texto,
    );
  const barra = h(
    "div",
    { class: "pc-md-barra", role: "toolbar", "aria-label": "Formatação do texto" },
    botao("negrito", "Negrito", "Negrito"),
    botao("italico", "Itálico", "Itálico"),
    botao("titulo", "Título", "Título"),
    botao("lista", "Lista", "Lista"),
    botao("citacao", "Citação", "Citação"),
    botao("link", "Link", "Inserir link"),
    botao("imagem", "Imagem", "Inserir imagem por endereço (URL)"),
  );

  // Pequena caixa para link/imagem (no celular, melhor que a janelinha do navegador).
  const popTexto = h("input", {
    class: "field",
    type: "text",
    id: `${id}-pop-texto`,
    autocomplete: "off",
  });
  const popUrl = h("input", {
    class: "field",
    type: "url",
    id: `${id}-pop-url`,
    autocomplete: "off",
    inputmode: "url",
    autocapitalize: "off",
    placeholder: "https://…",
  });
  const popTextoRotulo = h(
    "label",
    { class: "pc-rotulo", for: `${id}-pop-texto` },
    "Texto do link",
  );
  const popUrlRotulo = h(
    "label",
    { class: "pc-rotulo", for: `${id}-pop-url` },
    "Endereço (começa com https://)",
  );
  const popErro = h("p", { class: "pc-erro", role: "alert", hidden: true });
  const popOk = h("button", { type: "button", class: "btn btn-solid" }, "Inserir");
  const popCancelar = h("button", { type: "button", class: "btn btn-outline" }, "Cancelar");
  // Só para imagem: enviar do aparelho (quem escreve pelo celular tem a foto no aparelho, não um endereço na mão).
  const popArquivo = h("input", {
    type: "file",
    class: "pc-img-arquivo",
    id: `${id}-pop-arquivo`,
    accept: IMAGEM_TIPOS_ACEITOS.join(","),
    tabindex: "-1",
  });
  const popEnviar = h(
    "button",
    { type: "button", class: "btn btn-outline" },
    "Enviar imagem do aparelho",
  );
  const popStatus = h("p", { class: "pc-ajuda", role: "status", "aria-live": "polite" });
  const popEnvio = h(
    "div",
    { class: "pc-campo", hidden: true },
    popEnviar,
    popArquivo,
    popStatus,
    h(
      "p",
      { class: "pc-ajuda" },
      "O site só mostra imagens guardadas no próprio Directus: uma imagem de outro site pode não aparecer. Prefira enviar do aparelho.",
    ),
  );
  const pop = h(
    "div",
    { class: "pc-md-pop", hidden: true },
    h("div", { class: "pc-campo" }, popTextoRotulo, popTexto),
    popEnvio,
    h("div", { class: "pc-campo" }, popUrlRotulo, popUrl),
    popErro,
    h("div", { class: "pc-md-pop-botoes" }, popOk, popCancelar),
  );

  const c = casca(
    campo,
    h(
      "div",
      { class: "pc-md", "data-modo": "escrever" },
      h("div", { class: "pc-md-abas", role: "tablist" }, abaEscrever, abaPrevia),
      barra,
      pop,
      h("div", { class: "pc-md-painel pc-md-painel-escrever" }, area),
      h("div", { class: "pc-md-painel pc-md-painel-previa" }, avisoPrevia, previa),
    ),
  );
  const md = c.raiz.querySelector<HTMLElement>(".pc-md") as HTMLElement;

  // --- prévia ao vivo
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const pintarPrevia = () => {
    if (!area.value.trim()) {
      previa.replaceChildren(
        h("p", { class: "pc-ajuda" }, "A prévia aparece aqui quando você começar a escrever."),
      );
      avisoPrevia.hidden = true;
      return;
    }
    const { fragmento, removidos } = renderizarMarkdownSeguro(area.value);
    previa.replaceChildren(fragmento);
    avisoPrevia.hidden = removidos === 0;
  };
  const agendarPrevia = () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(pintarPrevia, 120);
  };
  pintarPrevia();
  area.addEventListener("input", () => {
    c.mostrarErro(null);
    agendarPrevia();
    ctx.aoAlterar(campo.nome);
  });

  // --- abas (só aparecem no celular; no computador os dois painéis ficam lado a lado)
  const mudarModo = (modo: "escrever" | "previa") => {
    md.dataset.modo = modo;
    abaEscrever.classList.toggle("is-active", modo === "escrever");
    abaPrevia.classList.toggle("is-active", modo === "previa");
    abaEscrever.setAttribute("aria-selected", String(modo === "escrever"));
    abaPrevia.setAttribute("aria-selected", String(modo === "previa"));
    if (modo === "previa") pintarPrevia();
  };
  abaEscrever.addEventListener("click", () => mudarModo("escrever"));
  abaPrevia.addEventListener("click", () => mudarModo("previa"));

  // --- caixa de link/imagem
  let acaoPop: "link" | "imagem" | null = null;
  let selecaoPop: Selecao = { inicio: 0, fim: 0 };
  const fecharPop = () => {
    pop.hidden = true;
    acaoPop = null;
    popErro.hidden = true;
  };
  const abrirPop = (acao: "link" | "imagem") => {
    acaoPop = acao;
    selecaoPop = { inicio: area.selectionStart, fim: area.selectionEnd };
    const escolhido = area.value.slice(selecaoPop.inicio, selecaoPop.fim);
    popTextoRotulo.textContent =
      acao === "link" ? "Texto do link" : "Descrição da imagem (para quem não enxerga)";
    popTexto.value = escolhido;
    popUrl.value = "";
    popEnvio.hidden = acao !== "imagem";
    popStatus.textContent = "";
    popErro.hidden = true;
    pop.hidden = false;
    (acao === "link" && escolhido ? popUrl : popTexto).focus();
  };
  const confirmarPop = () => {
    if (!acaoPop) return;
    const url = urlSegura(popUrl.value, acaoPop === "link");
    if (!url) {
      popErro.hidden = false;
      popErro.textContent =
        acaoPop === "link"
          ? "Digite um endereço começando com https:// (ou http://, mailto:)."
          : "Digite o endereço da imagem, começando com https://.";
      popUrl.focus();
      return;
    }
    const texto = popTexto.value.trim().replace(/([\[\]\\])/g, "\\$1"); // [, ] e \ no texto não podem quebrar o Markdown
    const destino = /[\s()]/.test(url) ? `<${url}>` : url; // espaço ou parênteses no endereço: forma <…> do Markdown
    const marcado =
      acaoPop === "link" ? `[${texto || url}](${destino})` : `![${texto}](${destino})`;
    const sel = selecaoPop;
    fecharPop();
    substituir(area, sel, marcado);
  };
  popOk.addEventListener("click", confirmarPop);
  popEnviar.addEventListener("click", () => popArquivo.click());
  popArquivo.addEventListener("change", async () => {
    const arquivo = popArquivo.files?.[0];
    popArquivo.value = "";
    if (!arquivo) return;
    const recusa = validarArquivoImagem(arquivo);
    if (recusa) {
      popErro.hidden = false;
      popErro.textContent = recusa;
      return;
    }
    popErro.hidden = true;
    popStatus.textContent = "Enviando imagem…";
    popEnviar.disabled = true;
    const soltar = ctx.ocupar();
    try {
      const r = await enviarArquivoImagem(ctx, arquivo);
      if (!("id" in r)) {
        popStatus.textContent = "";
        if (r.sessao) ctx.sessaoExpirou();
        else {
          popErro.hidden = false;
          popErro.textContent = r.erro;
        }
        return;
      }
      popUrl.value = directusAssetUrl(r.id, { width: 1600, quality: 80, format: "webp" });
      popStatus.textContent = "Imagem enviada. Confira a descrição e toque em Inserir.";
      (popTexto.value.trim() ? popOk : popTexto).focus();
    } finally {
      popEnviar.disabled = false;
      soltar();
    }
  });
  popCancelar.addEventListener("click", () => {
    fecharPop();
    area.focus();
  });
  for (const e of [popTexto, popUrl]) {
    e.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        confirmarPop();
      } else if (ev.key === "Escape") {
        fecharPop();
        area.focus();
      }
    });
  }

  // --- botões da barra
  barra.addEventListener("click", (ev) => {
    const alvo = (ev.target as HTMLElement).closest<HTMLElement>("[data-md-acao]");
    if (!alvo) return;
    mudarModo("escrever");
    switch (alvo.dataset.mdAcao) {
      case "negrito":
        envolver(area, "**", "texto em negrito");
        break;
      case "italico":
        envolver(area, "*", "texto em itálico");
        break;
      case "titulo":
        prefixarLinhas(area, "## ", "Título");
        break;
      case "lista":
        prefixarLinhas(area, "- ", "Item da lista");
        break;
      case "citacao":
        prefixarLinhas(area, "> ", "Texto da citação");
        break;
      case "link":
        abrirPop("link");
        break;
      case "imagem":
        abrirPop("imagem");
        break;
    }
  });

  return {
    campo,
    raiz: c.raiz,
    ler: () => paraDirectus(campo, area.value),
    definir: (valor) => {
      area.value = valor === null || valor === undefined ? "" : String(valor);
      pintarPrevia();
    },
    erro: c.mostrarErro,
    focar: () => {
      mudarModo("escrever");
      area.focus();
    },
  };
}

// ----------------------------------------------------------------------------------------------
// Fábrica: um tipo de campo → o desenho certo
// ----------------------------------------------------------------------------------------------

export function montarCampo(campo: CampoConteudo, ctx: ContextoForm): CampoMontado {
  switch (campo.tipo) {
    case "markdown":
      return montarMarkdown(campo, ctx);
    case "select":
      return montarSelecao(campo, ctx);
    case "m2o":
      return montarRelacao(campo, ctx);
    case "boolean":
      return montarBooleano(campo, ctx);
    case "image":
      return montarImagem(campo, ctx);
    case "imagens":
      return montarFotos(campo, ctx);
    case "arquivo":
      return montarArquivo(campo, ctx);
    case "readonly":
      return montarSomenteLeitura(campo);
    case "slug":
      return montarEndereco(campo, ctx);
    default:
      return montarEntrada(campo, ctx);
  }
}
