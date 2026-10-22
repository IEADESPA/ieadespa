# Testes do site contra um ambiente de verdade

Baterias que exercitam a API pública do site (camisetas e inscrições) **num site publicado**, com
dados de teste criados e apagados na hora. Nasceram no incidente de 06/10/2026 (vB.17/vD.8): a
regra que fica é que nada sobe para a produção sem passar por elas.

| Script | O que prova |
| --- | --- |
| `camisetas.cjs` | status, pedido, chave do telefone, duplicado, "Meus pedidos" (rápido e antigo), retirada e andamento, prazo e `ativo`, lote único |
| `balcao.cjs` | venda de balcão e função "Gestor de Camisetas": quem pode (401/403), validações, venda sem telefone/e-mail com a campanha fechada, telefone (hash, chave, cifrado, WhatsApp, "Meus pedidos"), repetido, lote aberto/fechado/de outra campanha/avulso |
| `reserva.cjs` | aviso em massa seletivo (só separados, só um lote; só simula, nunca envia e-mail), recusas (lote inválido, token inválido) e o que os botões "Tirar reserva"/"Reenviar aviso" gravam com o token do Gestor de Camisetas |
| `exclusao.cjs` | exclusão em massa dos pedidos não separados: o gestor lê os pedidos completos, apaga em lote, o banco apaga itens e respostas em cascata, o lote fechado mantém os números travados (conta da malharia), a restauração com os mesmos números (e a sequência do banco intacta) e o script `scripts/restaurar-pedidos.mjs` |
| `limite.cjs` | o limite de pedidos pelo HTTP: total e por tamanho, validações, vaga que volta, lote fechado, 10 pedidos ao mesmo tempo para 4 vagas, venda de balcão com o token do gestor e o aviso "esgotado"; exige o esquema do limite no Directus |
| `limite-unidade.cjs` | a regra do limite e o laço da senha contra um Directus de mentira, com centenas de pedidos e várias "instâncias" (sem rede); `node scripts/testes/limite-unidade.cjs` dentro de `site/` |
| `limite-carga.cjs` | prova de carga contra um Directus REAL (de preferência local): vários processos (instâncias) disputando as vagas, conferência no banco; ver o cabeçalho do arquivo |
| `swa-local.cjs` | emulador do Static Web Apps (serve o `dist/` e roteia `/api` para as funções reais) para rodar as baterias contra um Directus de teste, sem tocar a produção |
| `exclusao-unidade.cjs` | a regra da exclusão em massa (quem entra, quem nunca entra, os textos de confirmação, a cópia e a ordem da restauração), **sem rede** (`node scripts/testes/exclusao-unidade.cjs` dentro de `site/`) |
| `conteudo.cjs` | painel de conteúdo (`/painel-conteudo/`): com um usuário temporário da função "Editor de notícias", lê/cria (só rascunho)/altera/apaga notícias, mensagens e perguntas frequentes (FAQ), troca a ordem (`sort`) em lote como as setas ▲/▼, envia imagem (e recusa texto e PDF), lê programação, galeria, ministérios e história, confere pelo mapa `/permissions/me` o que pode e o que NÃO pode escrever (nada é gravado nos tipos sem rascunho), NÃO lê nem escreve nada sigiloso (mural, contas, inscrições, pedidos de camiseta, avisos do navegador, contatos, depoimentos, relatórios, páginas fixas…), confere que as contagens e o texto das páginas fixas não mudaram e que as 5 páginas do painel (inclusive a moderação) respondem no site. **Terceiro lote**, com um segundo usuário temporário "Semi-administrador" (a Diretoria): lê depoimentos, mural e relatórios; as consultas das abas da moderação (Aguardando, Publicados, Confidenciais) acham cada item de teste numa aba só (inclusive `aprovado` vazio e o confidencial fora da fila de aprovação); grava `aprovado: false` e exclui itens de teste; envia imagem e **PDF** (lê nome e tamanho do arquivo, e o PDF é baixado por qualquer pessoa em `/assets`) e tem texto puro e SVG recusados (400). **Nunca grava `aprovado: true`** (o mural é público e em tempo real) **nem nada em `relatorios`**; depoimentos, mural e relatórios têm que voltar à mesma contagem |
| `painel-unidade.cjs` | motor do painel de conteúdo e da moderação, **sem rede** (`node scripts/testes/painel-unidade.cjs` dentro de `site/`; `PC_TZ=America/Belem` ou `Asia/Tokyo` para conferir o fuso): datas, endereço (slug), validação, serialização, URL segura, erros do Directus em português, configuração dos nove tipos, ordem manual (troca, grupos, próximo número), várias fotos, envio de arquivo (PDF: tipo, tamanho, assinatura `%PDF-`, tamanho legível), relatórios e moderação (filtros das abas provados contra um avaliador do filtro do Directus, regras de aprovação, 90 dias do mural, textos de confirmação e cartões da página inicial) |
| `imagens-locais-unidade.cjs` | o passo `scripts/localizar-imagens.mjs` (traz as imagens do Directus para `dist/media` depois do `astro build`), **sem rede** (`node scripts/testes/imagens-locais-unidade.cjs` dentro de `site/`): achar as URLs em `src`/`srcset`/`og:image`/`url()` de CSS/JSON-LD (com `&amp;`, `&quot;` e `&`, usando os ajudantes reais do site), reescrita relativa e `og:image` absoluta, falha de download ou resposta que não é imagem (a URL do Directus fica), SVG recusado, 2 tentativas e tempo limite, deduplicação por URL e por conteúdo, teto de 120 MB e concorrência 4 (inclusive com downloads simultâneos), HTML sem imagem intacto byte a byte, o passo que nunca derruba a montagem e a linha de comando contra um servidor HTTP de mentira; confere também o `build` do `package.json` e a regra `/media/*` do `staticwebapp.config.json`. `LOCALIZAR_IMAGENS_MODULO=<cópia estragada do script>` prova que o teste pega defeito |
| `eventos.cjs` | status com vagas, inscrição, cupom, lista de espera, grupo, faixa, limite por telefone, encerramento e prazo |
| `visitas-unidade.cjs` | contador de visitas em lote (`api/RegistrarVisita` + `api/src/lib/visitas.js`), **sem rede** (`node scripts/testes/visitas-unidade.cjs` dentro de `site/`): validação do caminho e da origem, robôs, buffer com relógio injetável (descarga aos 25 itens ou 10 s), falha do Directus devolvendo as linhas ao buffer sem martelá-lo, teto de 500, rajada de 500 visitas ao mesmo tempo (uma gravação por vez, poucas gravações), limite por IP, 204/400/413/429 e o corpo do POST ao Directus (`fetch` de mentira) |
| `inscricao-vagas.cjs` | a trava de vagas e de cupom pelo HTTP: 16 inscrições ao mesmo tempo para 5 vagas e um cupom de 3 usos (exatamente 5 confirmadas e 3 descontos, uma senha por inscrição), grupo na lista de espera, cupom esgotado e a vaga apagada que volta; exige o esquema `directus-vagas-esquema.mjs` no Directus |
| `vagas-evento-unidade.cjs` | a regra (quem confirma, quem leva o desconto), o laço da senha e a corrida contra um Directus de mentira, com várias "instâncias" (sem rede), mais o teste do teste (sem a trava a corrida estoura); `node scripts/testes/vagas-evento-unidade.cjs` dentro de `site/` |
| `front-espera-unidade.cjs` | a "espera sozinha" dos formulários de pedido de camiseta e de inscrição em evento, sem navegador: 503 "ocupado" (recusa antes de gravar) é repetido sozinho com aviso de espera; 200/4xx/500/502/503 de outro tipo e queda de rede NUNCA são repetidos (podem ter gravado); teto de 12 tentativas; a função tem de ser idêntica nas duas páginas; `node scripts/testes/front-espera-unidade.cjs` dentro de `site/` |
| `status-publico-unidade.cjs` | o status público da camiseta e do evento, sem rede: com a memória vencida e 300 aberturas de página ao mesmo tempo só 2 consultas vão ao Directus (a campanha/evento e a soma/contagem) e todas recebem a mesma resposta; falha do Directus não fica guardada; `node scripts/testes/status-publico-unidade.cjs` dentro de `site/` |
| `mural-unidade.cjs` | o envio do mural de oração (`api/EnviarPedidoMural`, v7.11.1), **sem rede** (`node scripts/testes/mural-unidade.cjs` dentro de `site/`): grava no Directus com o token de admin e avisa o cuidado pastoral do sistema (`x-site-key`, id do item); com sinal de risco o item vira confidencial (nunca publicado); sistema fora do ar ou chave recusada não perde o pedido; sem a chave não chama o sistema; corpo ruim (400), honeypot e limitador de 10 por IP em 5 min |
| `lotes-unidade.cjs` | v7.13, **sem rede**: a regra dos lotes (vencido pelo dia de Brasília, esgotado, rótulo × valor), a recusa do lote dentro da trava (a recusa tirada da memória é relida), a corrida contra um Directus de mentira (1 a 8 "instâncias", 160 inscrições para 40 vagas no lote: sempre exato; grupos na fronteira; dois lotes com o limite geral mandando para a lista de espera), o teste do teste (sem chave única ou contando antes da senha, estoura) e as funções `CriarInscricao`/`StatusInscricao` com `fetch` de mentira; revisão de 22/10/2026: lote obrigatório (400), a trava de vagas continua sem o campo do lote, nomes de lote no painel e o escape da confirmação |
| `esquema-v713-unidade.cjs` | v7.13, **sem rede externa**: roda o script `directus-eventos-v713-esquema.mjs --simular` de verdade contra um Directus de mentira (servidor HTTP local): os campos criados e a conferência de TODAS as linhas de permissão pública (ler/criar/alterar/apagar em inscrições, pedidos, respostas e entradas), com código 1 quando algo está aberto demais |
| `pagamento-unidade.cjs` | v7.13, **sem rede**: validação do "informar pagamento" (datas, meio, valor, nome com caractere de controle), o aviso contra golpe nas 5 páginas, quem/quando da confirmação e da cortesia, a situação/filtros/totais do painel, e as funções `InformarPagamento` (código+telefone, Minha Conta, telefone do pedido, 404 igual para tudo que não confere, 409, 503 sem esquema, limite por IP), `PainelInscricao` (o nome vem do token, nunca da chamada; 401/403/404; nada gravado sem o esquema), `ConsultarMinhaConta` e `ConsultarPedidosCamiseta` |
| `credenciamento-unidade.cjs` | v7.13, **sem rede**: locais com capacidade (formato antigo e novo), chave da entrada por dia de Brasília, contagem por local e aviso de capacidade, ausentes por lote/tipo, configuração e desenho do crachá (QR num jsPDF de mentira) e `VerificarInscricao` devolvendo os dados do crachá |
| `eventos-v713.cjs` | v7.13 pelo HTTP, **só na réplica local** (cria usuário, função e política temporários; recusa outro Directus): 40 inscrições ao mesmo tempo num lote de 10 (exatamente 10), lote vencido, situação dos lotes, informar pagamento, confirmar com quem/quando (token de um usuário de equipe), cortesia, tipo, entradas por local com `user_created` do token e chave única, o público sem acesso, ausentes e crachá; apaga tudo |
| `inscricao-carga.cjs` | prova de carga das inscrições contra um Directus REAL (de preferência local): vários processos disputando as vagas e o cupom, conferência no banco; ver o cabeçalho do arquivo |

Os testes que leem `src/lib/*.ts` (`painel-unidade.cjs` e os da v7.13) usam o pacote `typescript` quando ele está instalado
(`npm ci` em `site/`); os da v7.13 também rodam SEM ele, pelo "tirar os tipos" do próprio Node (`carregar-ts.cjs`, Node 22.13 ou
mais novo) — num worktree sem `node_modules`, basta `node scripts/testes/lotes-unidade.cjs` (sem `NODE_PATH`). Cada verificação
nascida de uma revisão leva `[revisão N]` no texto; um bloco que quebra (rodando contra o código de antes) conta como falha e o teste segue.

## Onde rodam

- **Automático** (`.github/workflows/site-testes.yml`): depois de cada montagem do site, contra o
  endereço que acabou de ser publicado — a **pré-visualização** do branch `homolog-site` (PR de
  homologação, não fechar) ou a **produção** (`main`).
- **À mão**, de qualquer máquina com acesso ao Directus:

```bash
export SITE_URL=https://ieadespa.org.br   # ou o endereço da pré-visualização
export DIRECTUS_URL=... DIRECTUS_ADMIN_TOKEN=... TELEFONE_CHAVE_SEGREDO=...   # dos segredos, nunca em texto no repositório
node site/scripts/testes/camisetas.cjs
node site/scripts/testes/balcao.cjs
node site/scripts/testes/reserva.cjs
node site/scripts/testes/exclusao.cjs
node site/scripts/testes/eventos.cjs
node site/scripts/testes/conteudo.cjs
node site/scripts/testes/painel-unidade.cjs   # sem rede nem segredos
```

## Regras

- Dados de teste têm `slug` começando com `teste-` (camisetas, conteúdo), título começando com `TESTE`
  (eventos) ou, no FAQ, pergunta começando com `TESTE`; em depoimentos o `nome` e no mural o `texto`
  começam com `TESTE`: a versão do conteúdo (`conteudo-versao.mjs`) ignora esses itens, então o teste não
  remonta o site; e tudo é apagado no `finally`, mesmo quando uma verificação falha.
- **Moderação (depoimentos e mural de oração)**: o mural público atualiza em tempo real, então nenhum teste
  grava `aprovado: true` (nem em depoimentos); itens de teste nascem `aprovado: false` pela mão do
  administrador e duram segundos. `relatorios` não tem rascunho (o que se grava vai ao site na montagem
  seguinte): nenhum teste grava nele — só lê, confere permissões e envia arquivos de teste, que o
  administrador apaga no `finally`.
- A API guarda a campanha/evento em cache por 10 s e o status por 20 s: depois de mudar prazo ou
  `ativo` no Directus, as baterias esperam esse tempo antes de conferir.
- Não há Directus de homologação (custo); os testes gravam no Directus de produção, só em itens de
  teste descartáveis.
