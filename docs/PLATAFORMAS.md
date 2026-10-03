# Plataformas, bibliotecas e versões

Levantamento feito em **03/10/2026**, com o que está no ar. O objetivo do responsável: nada desatualizado, e o que ficou
na versão anterior tem motivo escrito aqui. Este arquivo é a referência para a próxima rodada de atualização.

## Ambiente de execução

| Peça | Versão em uso | Última disponível | Situação |
| --- | --- | --- | --- |
| Node.js das Functions do sistema e do site | **22** (runtime Functions 4), fixado em `apiRuntime: node:22` | 24 | O Azure Static Web Apps só aceita **20 e 22** nas Functions gerenciadas (doc de 02/10/2026); o 22 é o mais novo. O 24 exigiria Function App próprio (custo e deploy separado). |
| Node.js do CI (testes) | **22** (igual à produção) | 24 | Antes testava em 24 e rodava em 22: agora igual. |
| Node.js que monta o site (Astro) | 24 (escolhido pelo Oryx a partir de `engines >=22.12`) | 26 (vira LTS em outubro) | Ok. |
| Modelo de programação das Functions | v3 (`function.json`) | v4 (`app.http()`) | v3 está em manutenção, não descontinuado. Migrar são ~200 funções: projeto próprio, só se o Azure anunciar fim de suporte. |
| Pacote de extensões das Functions | `[4.*, 5.0.0)` | 4.x | Ok. |
| Ações do GitHub | `checkout@v7`, `setup-node@v7`, `static-web-apps-deploy@v1` | iguais | Ok (os fluxos do site estavam em v3/v4). |

## Sistema (`api/`)

| Pacote | Versão | Observação |
| --- | --- | --- |
| `mssql` | 12.7.2 | Última. |
| `@azure/storage-blob` | 12.34.0 | Última. |
| `docx` | 9.8.1 | Última. |
| `pdfkit` | **0.20.2** | Era 0.15.2. Mudança que quebra compatibilidade na lista de alterações do autor, mas o uso aqui é um módulo só (`shared/pdfInstitucional.js`). Conferido: 2 páginas de teste desenhadas pelas duas versões, **0 pixels de diferença**. |
| `jest` | 30.5.2 | Última. |
| `npm audit` | 0 vulnerabilidades | |

## Site (`site/`, Astro)

| Pacote | Versão | Observação |
| --- | --- | --- |
| `astro` | 7.3.5 | Última. |
| `vite` | 8.3.2 | Última. |
| `typescript` | **6.0.3** | A 7.0 existe, mas o `@astrojs/check` só aceita 5 ou 6 (peer). Subir quando o Astro liberar. |
| `@types/node` | 22.x | Fica na linha 22 **de propósito**: tipa a API do Node que de fato roda (22); a 26 descreveria recursos que o servidor não tem. |
| `@azure/communication-email` (site/api e notificações) | 1.1.0 | Última. |
| `sharp` | 0.35.5 | Última. |
| `npm audit` | 3 altas, **uma só raiz**: `http-cache-semantics` (via Astro) | Sem correção em nenhuma versão. Só é usada na montagem do site (cache de imagens remotas), nunca no que chega ao visitante. Antes eram 7 (devalue e dompurify corrigidos). |

## Bibliotecas que o navegador carrega

Todas passaram a ser servidas **de dentro** do próprio sistema e do próprio site (pastas `vendor/`), cada uma com a licença ao lado, em
vez de um CDN de terceiros (um CDN comprometido injetaria código nas telas de doação e de administração).

| Biblioteca | Versão | Onde | Observação |
| --- | --- | --- | --- |
| SheetJS (`xlsx`) | **0.20.3** | `app/vendor/` | Era 0.18.5 do jsDelivr (o `npm` parou nela; tem falhas conhecidas de poluição de protótipo e ReDoS, corrigidas na 0.19.3 e 0.20.2). Só o site oficial do SheetJS publica a 0.20. Comparada com a antiga no que o sistema faz: igual. |
| `qrcode-generator` | **2.0.4** | `site/public/vendor/` | Era 1.4.4 do cdnjs. QR do PIX e do check-in: matriz de pontos e imagem **idênticas** em todos os casos testados. |
| `jsQR` | 1.4.0 | `site/public/vendor/` | Última. |
| Leaflet, jsPDF, marked | 1.9.4, 4.2.1, 18.0.14 | pacotes do site | Últimas. |

## Fora do repositório (a levantar com acesso ao Azure)

Não aparecem em nenhum arquivo do projeto: **Directus** (painel de conteúdo do site, App Service), **PostgreSQL** do Directus, o
nível do Azure SQL e do Storage. Para saber a versão de cada um é preciso ler a configuração no Azure.

## Como atualizar (a rotina)

1. `npm outdated` e `npm audit` em `api/`, `site/` e `site/api/`.
2. Faixas já declaradas: `npm update`. Versão maior: ler a lista de mudanças, atualizar uma por vez e **comparar o resultado** com a versão
   anterior no que o sistema faz (foi assim com PDF, planilha e QR).
3. `npx jest` em `api/`; no site, `npm run check` e `npm run build`.
4. Subir primeiro para a homologação (`homolog`, PR #1): ela monta no Azure de verdade e a varredura de rotas acusa módulo que não carrega.
5. Só então `main`, e repetir a conferência em produção.

Fora do escopo: `chamada-ebd/` e `relatorios-departamentos/` são protótipos antigos só para consulta (ver `REFERENCIAS.md`); suas dependências
não são mantidas.
