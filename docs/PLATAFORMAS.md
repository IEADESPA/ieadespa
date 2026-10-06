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

## Fora do repositório (levantado em 03/10/2026, só leitura, no Azure da igreja)

| Peça | Versão em uso | Última | Situação |
| --- | --- | --- | --- |
| **Directus** (painel do site, App Service Linux, contêiner `directus/directus`) | **12.4.1** (atualizado em 03/10/2026; era 12.3.1) | 12.4.1 (23/09/2026) | **Em dia.** A 12.4.0 avisa de mudança potencialmente incompatível: o mapa do painel e o campo de geometria passam a exigir WebGL2 (Safari 14 ou anterior e Android antigo deixam de desenhar mapa no painel; o mapa do site é o Leaflet, outra coisa). A 12.4.1 corrige a leitura de pastas por quem não é administrador. Na subida o Directus aplicou duas atualizações internas do banco ("Add Flow Folders", "Add Flows Module"); **voltar para a 12.3.1 agora exigiria restaurar o banco** (cópia completa diária e restauração a qualquer ponto). Conferido depois da troca: ping, tela de login, o site lendo do Directus, nenhum erro no registro, e a remontagem do site (120 páginas) buscando todo o conteúdo. |
| **PostgreSQL** do Directus (servidor flexível, Standard_B1ms, 32 GB) | **18.6** | 18.6 | Em dia; suporte da comunidade até 14/11/2030. |
| **Azure SQL** do sistema (`app-db-prod`, `ieadespa-homolog`, serverless GP_S_Gen5, pausa em 60 min) | motor 12.0 (o Azure mantém no mais novo) | — | Em dia, TLS mínimo 1.2. |
| **Banco de homologação** (`ieadespa-homolog`) | esquema **antigo** (faltam as migrações recentes) | 139 | O fluxo do PR migra o banco de **produção**, não este; por isso a lista de documentos dá 500 na homologação. Para a homologação provar também o SQL, falta um passo de migração dela (exige guardar a conexão dela como segredo no GitHub). |
| Static Web Apps (`app-meusite-web`, `site-institucional`) | plano Standard | — | Em dia; domínios `app.`, `www.` e raiz. |
| Armazenamento `ieadespaarmazenamento` | StorageV2, TLS mínimo 1.2, sem acesso público a blob | — | Em dia. |
| ~~Function App `func-ieadespa-api`~~ e o que era só dele (armazenamento `ieadespaapifunc01`, plano `ASP-ieadespa-c292`, monitoramento próprio) | **removidos em 04/10/2026** | — | Era a experiência de **20/09/2026** para tirar o cold start de ~30 s (≈ US$ 10/mês, "Always Ready"), abandonada (ver `HOMOLOGACAO.md`). Antes de apagar: 13 chamadas em 30 dias (todas de teste), nenhuma configuração apontava para ele, e o armazenamento tinha só arquivos internos. Guardava cópia dos segredos de produção e do código anterior às correções de segurança. |
| Application Insights, alertas, e-mail (ACS) | — | — | Sem versão a conferir. |

Ferramentas desta máquina (desenvolvimento): Node 26.10.0 (Current; a LTS é a 24.21.0), npm 11.19.1, Azure CLI 2.90.0 (última),
SOPS 3.13.3 (última), `age` **1.3.2** e GitHub CLI **2.102.0** (atualizados em 03/10/2026; o SOPS segue descriptografando), Git **2.56.0**
(atualizado em 05/10/2026; ver abaixo). Node 22 das Functions: a montagem usou 22.23.2 e a última 22.x é 22.23.3 (entra sozinha no próximo deploy).

**Feito em 03/10/2026, com o responsável no modo manual de aprovação (no modo automático o controle de permissões do Claude Code bloqueia
mudança em produção no Azure):** Directus 12.3.1 para 12.4.1 (só a etiqueta da imagem do contêiner `main` do App Service `ieadespa-directus`
mudou; as demais configurações do contêiner ficaram idênticas) e TLS mínimo 1.2 na conta `ieadespaapifunc01` (conta apagada depois, em 04/10/2026,
junto com o Function App antigo). Antes da troca: cópia completa automática diária do banco e restauração a qualquer ponto desde 04/09/2026 (o
servidor "burstable" não aceita cópia sob demanda).

**Feito em 05/10/2026 (modo manual):** Git for Windows 2.55.0.5 para **2.56.0.windows.1**. O catálogo do `winget` ainda não tinha a 2.56 (só a 2.55.0.5),
então o instalador veio da página oficial de versões do Git for Windows no GitHub; antes de rodar, conferiu-se o SHA-256 publicado
(`bfe94e7b…e286a6`) e a assinatura digital (válida, do mantenedor do projeto). Instalado em silêncio, sem reiniciar o computador; depois disso o
repositório, o login do GitHub e o `bash.exe` continuaram funcionando. Foi uma versão de correções de defeitos, sem correção de segurança. Também
foram fechados, sem aplicar (a versão já estava na `main`), os pedidos automáticos do Dependabot #12 (`yaml` 2.9.1) e #15 (`marked` 18.0.14); só
resta aberto o #1 (homologação, que não se fecha).

**Ainda por fazer nesta lista:** nada que dependa só do código; o que segue travado é de plataforma (TypeScript 7, Node 24 nas Functions do SWA).

**Descoberta de 04/10/2026:** a homologação (PR #1) estava ligada ao Function App antigo e por isso **não rodava o código novo da API** (rotas novas
davam 404/comportamento antigo). Desfeita a ligação, ela voltou a rodar a API do projeto. As conferências "na homologação" feitas até 03/10 não
provavam o código novo; a produção, conferida logo após cada deploy, é que provou. Com isso o passo 4 da rotina abaixo passou a valer de verdade.

## Como atualizar (a rotina)

1. `npm outdated` e `npm audit` em `api/`, `site/` e `site/api/`.
2. Faixas já declaradas: `npm update`. Versão maior: ler a lista de mudanças, atualizar uma por vez e **comparar o resultado** com a versão
   anterior no que o sistema faz (foi assim com PDF, planilha e QR).
3. `npx jest` em `api/`; no site, `npm run check` e `npm run build`.
4. Subir primeiro para a homologação (`homolog`, PR #1): ela monta no Azure de verdade e a varredura de rotas acusa módulo que não carrega.
5. Só então `main`, e repetir a conferência em produção.

Fora do escopo: `chamada-ebd/` e `relatorios-departamentos/` são protótipos antigos só para consulta (ver `REFERENCIAS.md`); suas dependências
não são mantidas.
