/**
 * URL pública do Directus. Não é segredo — as coleções usadas aqui têm
 * leitura liberada para o público (política "Public" no Directus), então o
 * site busca o conteúdo sem precisar de nenhum token.
 */
export const DIRECTUS_URL = "https://ieadespa-directus-gae4hfarf4a4ffcf.brazilsouth-01.azurewebsites.net";

/** Painel administrativo (Directus Studio), onde o conteúdo é editado. */
export const DIRECTUS_ADMIN_URL = `${DIRECTUS_URL}/admin`;

/**
 * Endpoint próprio (Azure Function do próprio site, `/api/verificar-inscricao`
 * — ver `api/src/functions/verificarInscricao.js`) que substituiu o Flow do
 * Directus "Verificar inscrição (código + telefone)". Usado por certificado,
 * crachá, pesquisa de satisfação e o gerador de QR Code, em vez de consultar
 * `inscricoes_eventos` direto (que não tem leitura pública de nome/código/
 * telefone). Mesmo formato de entrada/saída de antes — três modos, todos
 * exigindo `{ evento, modo, ... }` no corpo da requisição:
 * - `modo: "codigo"` — `{ codigo, telefone }`: confirma os dois combinados,
 *   devolve os dados (incluindo o próprio código, útil pro QR Code).
 * - `modo: "nome"` — `{ nome }`: lista candidatos por nome parcial, sem
 *   telefone nem código (nome não é segredo, mas o código nunca aparece
 *   aqui) — usado pra montar uma lista de "foi você?" pra quem esqueceu o
 *   código.
 * - `modo: "id"` — `{ id, telefone }`: depois de escolher um candidato da
 *   lista acima, confirma o telefone pra só então devolver o código —
 *   impede que a busca por nome sozinha revele o código de outra pessoa.
 *
 * Diferente do Flow (sandbox sem `crypto`, incapaz de verificar hash de
 * verdade — ver README, Fase 6), a Function roda em Node.js completo: o
 * telefone é comparado contra um hash real (`scrypt`, ver `api/src/lib/
 * telefone.js`), nunca contra texto puro.
 */
export const VERIFICAR_INSCRICAO_URL = "/api/verificar-inscricao";

/**
 * Mesma Function, endpoint separado (`/api/telefone-hash`) — recebe um
 * telefone em texto (só nesta chamada, nunca fica guardado em lugar nenhum)
 * e devolve o valor já hashado, pronto pra ser salvo no campo `telefone`.
 * Usado no momento de gravar (inscrição pública em `/evento/[slug]/` e edição
 * manual da equipe em `/painel-eventos/`) — quem grava continua sendo quem já
 * gravava antes (o navegador do inscrito ou a equipe autenticada), só que
 * agora envia o valor hashado em vez do telefone puro.
 */
export const TELEFONE_HASH_URL = "/api/telefone-hash";

/**
 * Fase 21 — cancelamento pelo próprio inscrito, sem depender da equipe.
 * Mesma verificação de identidade de `VERIFICAR_INSCRICAO_URL` (código +
 * telefone conferido por hash) — só que, em vez de só consultar, esta
 * apaga a inscrição de verdade e, se a vaga cancelada era confirmada (não
 * uma vaga que já estava na lista de espera), promove sozinha quem está há
 * mais tempo esperando naquele evento (mesma lógica que já existia só pro
 * caminho do admin aumentar o limite de vagas, em `painel-eventos`).
 */
export const CANCELAR_INSCRICAO_URL = "/api/cancelar-inscricao";

/**
 * Fase 21 — e-mail de confirmação de inscrição (opcional). Chamada só
 * depois que a(s) inscrição(ões) já foram gravadas com sucesso no Directus
 * — nunca bloqueia nem faz parte da inscrição em si, e uma falha aqui é
 * ignorada silenciosamente pelo navegador (ver `evento/[slug].astro`).
 * Envia de verdade via Azure Communication Services (Email) — não existe
 * mais fallback de terceiro nem gatilho por Directus Flow (ver README,
 * Fase 21 e Fase 6, sobre por que Flows não servem pra isso).
 */
export const ENVIAR_CONFIRMACAO_URL = "/api/enviar-confirmacao-inscricao";

/**
 * Fase 22 — gestão de camiseta/uniforme. `camiseta_pedidos` não tem leitura
 * pública (protege telefone e valor pago), então a consulta "meus pedidos"
 * passa por aqui — de propósito só com telefone, sem código nenhum (decisão
 * do usuário: simplicidade acima de uma segunda camada de identidade, ver
 * README Fase 22).
 */
export const CONSULTAR_PEDIDOS_CAMISETA_URL = "/api/consultar-pedidos-camiseta";

/**
 * Fase 26 — "Minha Conta": login sem senha (e-mail + código de 6 dígitos,
 * enviado via ACS — mesma infraestrutura da Fase 21). Três chamadas, nessa
 * ordem: `SOLICITAR_CODIGO_CONTA_URL` (pede o código), `CONFIRMAR_CODIGO_CONTA_URL`
 * (confere o código, devolve um token assinado pra guardar no navegador) e
 * `CONSULTAR_MINHA_CONTA_URL` (usa esse token pra listar inscrições em
 * eventos e pedidos de camiseta feitos com aquele e-mail). Ver `contaAuth.ts`.
 */
/**
 * Contador "orando por você" do Mural de oração — antes era um PATCH público
 * direto em `orando_count` com o valor calculado no navegador (bug real:
 * dava pra definir qualquer número chamando a API do Directus manualmente,
 * ver README). Agora o incremento (sempre +1, nunca um valor vindo do
 * cliente) é calculado nesta Function, e a permissão pública de `update` em
 * `mural_oracao` foi removida.
 */
export const ORAR_MURAL_URL = "/api/orar-mural";

/**
 * Cria o pedido público de camiseta inteiro (pedido + itens + respostas),
 * atribuindo-o automaticamente ao lote aberto da campanha (ver
 * `api/src/functions/criarPedidoCamiseta.js`) — a criação direta pelo
 * navegador em `camiseta_pedidos`/`camiseta_itens_pedido`/
 * `respostas_pedido_camiseta` foi removida (sem permissão pública nenhuma
 * mais nessas três coleções).
 */
export const CRIAR_PEDIDO_CAMISETA_URL = "/api/criar-pedido-camiseta";

/**
 * Ferramenta de exercício de direito de exclusão (LGPD, Art. 18) — só a
 * equipe autenticada usa (nunca público). Localiza e apaga tudo que está
 * ligado a um telefone (inscrições em evento, pedidos de camiseta e o que
 * está em cascata debaixo deles), comparando contra o hash guardado —
 * mesma técnica de `verificarInscricao.js`/`cancelarInscricao.js`. Ver
 * `api/src/functions/buscarDadosPessoais.js`/`excluirDadosPessoais.js`.
 */
export const BUSCAR_DADOS_PESSOAIS_URL = "/api/buscar-dados-pessoais";
export const EXCLUIR_DADOS_PESSOAIS_URL = "/api/excluir-dados-pessoais";

export const SOLICITAR_CODIGO_CONTA_URL = "/api/solicitar-codigo-conta";
export const CONFIRMAR_CODIGO_CONTA_URL = "/api/confirmar-codigo-conta";
export const CONSULTAR_MINHA_CONTA_URL = "/api/consultar-minha-conta";

/**
 * Fase 23 — enquetes/opinião pública, construída junto com a Fase 26 (só
 * dava pra impedir voto duplicado com login de verdade). `enquete_votos` não
 * tem leitura/escrita pública nenhuma — tudo passa por aqui, autenticado
 * pelo token da Minha Conta (nunca por um e-mail cru mandado pelo
 * navegador). `consultar-enquete` só devolve a contagem pra quem já votou
 * ou quando a enquete já encerrou; `votar-enquete` grava o voto (um por
 * e-mail por enquete) e devolve a contagem atualizada.
 */
export const CONSULTAR_ENQUETE_URL = "/api/consultar-enquete";
export const VOTAR_ENQUETE_URL = "/api/votar-enquete";

/**
 * Busca uma URL do Directus com tentativas automáticas em caso de erro
 * transitório (5xx ou falha de rede) — o Directus no plano gratuito
 * ocasionalmente fica "sob pressão" por alguns segundos, e sem isso um
 * único soluço passageiro derruba o build inteiro (já aconteceu de
 * verdade: 503 bem na hora de gerar /transparencia/). Erros 4xx (coleção
 * sem permissão, não existe etc.) não são tentados de novo — são erros
 * reais, não transitórios, e tentar de novo só esconderia o problema.
 */
async function fetchWithRetry(url: string, attempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      if (response.status < 500 || attempt === attempts) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      lastError = err;
      if (attempt === attempts) throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
  }
  throw lastError;
}

/**
 * Busca itens de uma coleção pública do Directus. Roda em tempo de build.
 *
 * Sempre sem limite de itens (`limit=-1`) — o Directus, por padrão, corta a
 * resposta em 100 itens, e todo lugar que chama isso aqui espera a coleção
 * inteira, não uma página dela. Sem isso, uma coleção que crescesse além de
 * 100 itens (galeria, eventos, versículos...) passaria a perder conteúdo
 * silenciosamente, sem nenhum erro.
 */
export async function fetchItems<T>(collection: string, query = ""): Promise<T[]> {
  const params = new URLSearchParams(query);
  if (!params.has("limit")) params.set("limit", "-1");
  const url = `${DIRECTUS_URL}/items/${collection}?${params.toString()}`;
  const response = await fetchWithRetry(url);
  if (!response.ok) {
    throw new Error(`Falha ao buscar ${collection} no Directus: ${response.status}`);
  }
  const { data } = (await response.json()) as { data: T[] };
  return data;
}

/** Busca uma coleção "singleton" do Directus (um registro único, sem lista). */
export async function fetchSingleton<T>(collection: string): Promise<T> {
  const response = await fetchWithRetry(`${DIRECTUS_URL}/items/${collection}`);
  if (!response.ok) {
    throw new Error(`Falha ao buscar ${collection} no Directus: ${response.status}`);
  }
  const { data } = (await response.json()) as { data: T };
  return data;
}

export interface ImageTransform {
  width?: number;
  height?: number;
  quality?: number;
  fit?: "cover" | "contain" | "inside" | "outside";
  format?: "webp" | "avif" | "jpg" | "png";
}

/**
 * Monta a URL pública de um arquivo (imagem, PDF) enviado no Directus.
 * Passar `transform` faz o Directus redimensionar/comprimir a imagem sob
 * demanda (ex.: uma miniatura de galeria não precisa baixar a foto original
 * de vários MB) — não se aplica a arquivos não-imagem, como PDFs.
 */
export const directusAssetUrl = (fileId: string, transform?: ImageTransform) => {
  const url = `${DIRECTUS_URL}/assets/${fileId}`;
  if (!transform) return url;

  const params = new URLSearchParams();
  if (transform.width) params.set("width", String(transform.width));
  if (transform.height) params.set("height", String(transform.height));
  if (transform.quality) params.set("quality", String(transform.quality));
  if (transform.fit) params.set("fit", transform.fit);
  if (transform.format) params.set("format", transform.format);

  return `${url}?${params.toString()}`;
};

/**
 * Monta um `srcset` com várias larguras da mesma imagem, pra o navegador
 * baixar só o tamanho que precisa (uma tela de celular não precisa da
 * imagem de 1600px pensada pra desktop) — usado nas capas de evento/
 * mensagem/notícia, que antes serviam uma única largura fixa pra qualquer
 * dispositivo.
 */
export const directusAssetSrcset = (
  fileId: string,
  widths: number[],
  transform?: Omit<ImageTransform, "width">,
) => widths.map((width) => `${directusAssetUrl(fileId, { ...transform, width })} ${width}w`).join(", ");

/** Larguras padrão pras capas de evento/mensagem/notícia — celular, tablet, desktop. */
export const COVER_WIDTHS = [640, 1024, 1600];

/** Dados institucionais e de contato, editáveis em Directus → Configurações do Site. */
export interface Configuracoes {
  tagline: string;
  about: string;
  sobre_corpo: string;
  crencas_corpo: string;
  address_line: string;
  address_neighborhood: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  maps_url: string;
  phone: string;
  lat: number | null;
  lng: number | null;
  /** Fase 24 — texto que identifica o perfil real e confirmado da Sede no
   * Google Maps (não só o endereço) — ver README. Null enquanto não
   * confirmado; nesse caso o mapa cai para a busca por endereço de sempre. */
  google_maps_place_query: string | null;
  /** Fase 24.11 — foto manual da fachada (opcional) e a data em que foi
   * tirada, pra comparar com a data da foto do Street View e usar sempre a
   * mais recente das duas. */
  foto_fachada: string | null;
  foto_fachada_data: string | null;
}

export const fetchConfiguracoes = () => fetchSingleton<Configuracoes>("configuracoes");

/** Endereço completo, formatado para exibição. */
export const enderecoCompleto = (c: Configuracoes) =>
  `${c.address_line}, ${c.address_neighborhood}, CEP ${c.address_zip}, ${c.address_city} – ${c.address_state}`;

/** String de busca pro Google Maps, usada como alternativa quando não há `maps_url`. */
export const enderecoMapsQuery = (c: Configuracoes) =>
  `${c.address_line}, ${c.address_neighborhood}, ${c.address_city} - ${c.address_state}, ${c.address_zip}`;

/** Link "Ver rota": usa o link real cadastrado, ou monta uma busca a partir do endereço. */
export const mapsHref = (c: Configuracoes) =>
  c.maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enderecoMapsQuery(c))}`;

interface CongregacaoEndereco {
  address: string | null;
  neighborhood: string | null;
  address_new: string | null;
  neighborhood_new: string | null;
  city: string | null;
  state: string | null;
}

/** Endereço de uma congregação, formatado para exibição — usa o endereço
 * novo (pós-mudança de CEP) quando cadastrado, senão o antigo. Centralizado
 * aqui porque a mesma lógica já existia repetida em /congregacoes/. */
export const congregacaoEndereco = (c: CongregacaoEndereco) => {
  const line = c.address_new || c.address;
  const neighborhood = c.neighborhood_new || c.neighborhood;
  return [line, neighborhood, c.city && c.state ? `${c.city} – ${c.state}` : null].filter(Boolean).join(", ");
};

/** String de busca pro Google Maps de uma congregação — mesma técnica sem
 * chave de API já usada pra sede em `/contato/` (embed via `?q=&output=embed`). */
export const congregacaoMapsQuery = (c: CongregacaoEndereco) => congregacaoEndereco(c);
