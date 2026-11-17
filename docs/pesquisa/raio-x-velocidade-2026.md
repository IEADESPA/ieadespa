# Raio-x de velocidade do sistema (17/11/2026)

Pedido do responsável em 17/11/2026: "precisamos de um sistema veloz, que não fique travado". Este documento é só
**levantamento e medição**. Nenhuma correção foi feita: cada uma depende do "pode corrigir" dele. As medições podem ser
repetidas com os scripts de [`tools/raio-x/`](../../tools/raio-x/).

## Leitura em 2 minutos (para o responsável)

- **A maior parte do sistema já é rápida.** Medimos 629 pedidos à API com uma igreja de mentira do tamanho da nossa
  (45 congregações, 5.113 pessoas, 3 anos de tesouraria). **579 responderam em menos de 0,2 segundo.** O problema está
  concentrado em **38 pedidos**, que passam de 1 segundo, e em poucas telas.
- **O pior de todos é a lista de lançamentos da tesouraria.**
  - Sem filtro, ela traz **todos** os lançamentos da Igreja: 68.763 linhas e 42 MB, e leva **mais de 5 minutos**.
  - Até a tesouraria de uma congregação só espera mais de 4 minutos, porque o servidor lê a Igreja inteira e só
    depois separa a parte dela.
- **Lista de saídas:** de 31 a 48 segundos.
- **Lista de pessoas sem página:** 46 segundos para a Secretaria Geral.
- **Relatórios dos departamentos:** de 11 a 16 segundos.
- **Elegíveis da assembleia e vínculos de família:** de 8 a 13 segundos.
- **Votações (enquetes):** de 4 a 9 segundos. Elas fazem quase 30 consultas ao banco por pedido.
- **Por que acontece:** três motivos, que se repetem.
  1. O servidor **lê a tabela inteira e filtra depois**, em vez de pedir ao banco só o que interessa.
  2. As tabelas grandes **não têm índice**. O índice é o "sumário" que deixa o banco achar uma linha sem ler todas.
     Os lançamentos (68 mil linhas) e as saídas não têm nenhum.
  3. Algumas telas fazem **uma consulta para cada item** da lista.
- **Abrir o aplicativo pesa:** ao abrir, ele baixa **4,2 MB**.
  - Quase 1 MB é uma ferramenta de planilha Excel, usada só para importar e exportar.
  - Outros 2,5 MB são os 41 módulos, carregados todos de uma vez, mesmo os que a pessoa nunca usa.
  - Num celular comum simulado (4G e processador mais fraco), a primeira abertura leva **5,7 segundos** e as
    seguintes, **3,2 segundos**.
- **O banco de dados na nuvem é o plano mais barato** (Basic, 5 DTU). Hoje, com duas pessoas testando, o maior uso da
  semana foi 30%. Com a Igreja inteira e as consultas pesadas acima, ele **vai lotar**. Consertar as consultas é mais
  barato e resolve mais do que pagar um plano maior.
- **A distância também conta:** cada pedido à API leva uns 0,6 segundo só de ida e volta até o servidor, nos Estados
  Unidos. Por isso, juntar pedidos ajuda: o Início faz 7 pedidos e o módulo Pessoas, 9.

**O que recomendo, nesta ordem (as três primeiras não mudam nada na tela):**

1. **Índices** nas tabelas grandes. É um passo só, de risco baixo, e acelera quase tudo.
2. **Lançamentos e saídas filtrados no banco**, pela congregação e pelo mês, com páginas, e o link do comprovante
   gerado só quando alguém abre o comprovante.
3. **Uma consulta só** nas votações, reuniões, relatórios dos departamentos, elegíveis e vínculos.
4. **O aplicativo baixar só o que usa:** a planilha Excel só quando for exportar, e cada módulo só quando a pessoa
   entrar nele. Isso muda o jeito de carregar, mas não muda o desenho.
5. **A lista de pessoas em páginas** na tela, que já está pronta no servidor e vem com a tela nova aprovada.
6. **Juntar os pedidos de cada tela**, para o Início e os módulos fazerem 1 ou 2 pedidos em vez de 7 a 9.
7. **Só depois**, se ainda faltar fôlego em dia de pico (assembleia, evento), **subir o plano do banco**.

---

## 1. Como foi medido

- **Massa:** o gerador da homologação (`api/scripts/semear-homologacao-grande.js`, ramo `homolog`) rodou contra o SQL
  Server LocalDB do notebook, sobre a base de cenário `cenario-173`. Foram 7 minutos e meio, e a base ficou salva como
  `cenario-massa`. Ela tem:
  - 45 congregações em 9 áreas;
  - 5.113 pessoas;
  - 68.763 lançamentos da tesouraria em 36 meses;
  - 8.351 saídas;
  - 131.819 chamadas da EBD;
  - 5.146 relatórios dos departamentos.
- **API:** `tools/raio-x/medir-rotas.js` chama os handlers de verdade (o equipamento de `tools/e2e-localdb`).
  - Mede todas as **157 rotas GET sem parâmetro obrigatório**, chamadas como a tela faz ao abrir a lista, mais quatro
    rotas com matrícula.
  - Usa quatro papéis:

    | Papel | Pessoa | Alcance |
    | --- | --- | --- |
    | Secretaria Geral | 700002 | Igreja toda |
    | Secretaria de área | 700021 | "Área Norte I", 6 congregações |
    | Secretaria local | 700102 | a Sede, 475 pessoas |
    | Membro | — | só a própria pessoa |

  - Cada rota roda duas vezes e vale a segunda, já com o código carregado. Também conta o número de consultas ao banco.
  - Ao todo foram 629 medições, nenhuma com erro ou com 500.
- **Front:** `tools/raio-x/medir-front.js` usa o Edge sem janela (`--disable-gpu`) com a API simulada, que responde
  vazia em 40 ms. Por isso mede **só o peso do próprio aplicativo**. Os perfis medidos foram dois:
  - notebook;
  - celular simulado: processador 4 vezes mais lento e internet 4G (9 Mbps, 80 ms).
- **Código:** `tools/raio-x/varrer-padroes.js` faz uma leitura heurística. Ela aponta onde olhar; quem confirma é a
  medição.
- **Nuvem:** só leitura no Azure (`az sql db list` e as métricas de DTU dos últimos 7 dias) e `curl` em rotas públicas.

**Atenção:** o LocalDB do notebook é **mais forte** que o banco Basic de 5 DTU da produção. Na nuvem, as consultas
pesadas tendem a ser mais lentas do que os números abaixo, e uma segura as outras na fila.

## 2. As 20 rotas mais lentas (massa grande, LocalDB)

| # | Rota | Papel | Tempo | Consultas | Linhas | Tamanho |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `tesouraria-lancamentos/{id?}` | Geral | 327 s | 1 | 68.763 | 42.585 KB |
| 2 | `tesouraria-lancamentos/{id?}` | Local | 275 s | 1 | 5.952 | 3.628 KB |
| 3 | `tesouraria-lancamentos/{id?}` | Área | 253 s | 1 | 11.341 | 6.956 KB |
| 4 | `saidas/{id?}` | Geral | 48 s | 1 | 8.351 | 8.540 KB |
| 5 | `pessoas/{membroId?}` | Geral | 46 s | 2 | 5.113 | 6.972 KB |
| 6 | `saidas/{id?}` | Área | 39 s | 1 | 1.040 | 1.059 KB |
| 7 | `saidas/{id?}` | Local | 31 s | 1 | 217 | 222 KB |
| 8 | `relatorios-departamentais/{id?}/{acao?}` | Geral | 16 s | 1 | 5.146 | 2.455 KB |
| 9 | `assembleia/elegiveis` | Local | 13 s | 3 | 329 | 72 KB |
| 10 | `vinculos-familiares/{id?}` | Área | 12 s | 1 | 730 | 145 KB |
| 11 | `vinculos-familiares/{id?}` | Geral | 12 s | 1 | 4.563 | 907 KB |
| 12 | `relatorios-departamentais/{id?}/{acao?}` | Local | 11 s | 1 | 133 | 63 KB |
| 13 | `relatorios-departamentais/{id?}/{acao?}` | Área | 11 s | 1 | 597 | 283 KB |
| 14 | `enquetes/{id?}/{acao?}` | Área | 9,3 s | 26 | 6 | 66 KB |
| 15 | `assembleia/elegiveis` | Geral | 8,3 s | 3 | 3.427 | 1.808 KB |
| 16 | `vinculos-familiares/{id?}` | Local | 8,1 s | 1 | 443 | 88 KB |
| 17 | `assembleia/elegiveis` | Área | 7,5 s | 3 | 539 | 119 KB |
| 18 | `enquetes/{id?}/{acao?}` | Membro | 7,4 s | 28 | 6 | 5 KB |
| 19 | `pessoas/{membroId?}` | Área | 6,1 s | 3 | 793 | 1.084 KB |
| 20 | `enquetes/{id?}/{acao?}` | Local | 5,5 s | 26 | 6 | 41 KB |

Logo abaixo vêm:

| Rota | Tempo | Consultas |
| --- | --- | --- |
| `tesouraria-fechamentos` | 2,9 a 4,4 s | — |
| `dossie-fiscal` | 4,2 s | 42 |
| `prestacoes-contas` | 3,2 s | — |
| `reunioes` | 1,0 a 1,5 s | 45 |
| `comissoes` | 1,5 s | 17 |

Por número de consultas num só pedido:

| Rota | Consultas |
| --- | --- |
| `lgpd/ropa` | 167 |
| `meus-orgaos-locais` | 79 |
| `reunioes` | 45 |
| `dossie-fiscal` | 42 |
| `enquetes` | 26 a 28 |

## 3. Por que cada uma é lenta

- **Lançamentos da tesouraria** (`GestaoLancamentosTesouraria`, GET).
  - Sem `congregacaoId` na URL, o `SELECT` lê **toda** a `LancamentosTesouraria`, com as junções de dizimista, categoria
    e campanha, e ordena tudo.
  - Só depois o Node filtra o escopo (`auth.estaNoEscopo` linha a linha) e gera um link assinado do comprovante
    (`urlDocumentoComSas`) para cada linha.
  - A tabela não tem nenhum índice não clusterizado.
  - A secretaria local também paga a leitura da Igreja inteira.
- **Saídas** (`GestaoSaidas`): o mesmo padrão. Lê a tabela inteira, filtra o escopo na memória e gera os links dos
  documentos por linha. A `SaidasTesouraria` também não tem índice.
- **Pessoas sem página** (`GestaoPessoas`, GET sem `?pagina`):
  - desde 13/11/2026 o escopo é filtrado no banco;
  - mas a tela de hoje ainda pede a lista **inteira**, e para cada pessoa o servidor gera o link assinado da foto e
    calcula a capacidade eleitoral;
  - o modo em páginas (`?pagina=N`) já existe e é rápido; falta a tela usá-lo, o que vem com a tela nova aprovada (lista
    com 20 por página).
- **Relatórios dos departamentos** (`GestaoRelatoriosDepartamentais`): lê todos os relatórios e os valores dos campos
  (92 mil linhas) e filtra o escopo na memória, com laços de consulta.
  `AprovacoesRelatorioDepartamental`, com 13.790 linhas, não tem índice.
- **Elegíveis da assembleia** (`GestaoElegiveisAssembleia`): lê a `MembroReferencia` inteira e calcula a elegibilidade
  de cada pessoa a cada pedido.
- **Vínculos de família** (`GestaoVinculosFamiliares` e `shared/vinculosFamiliares.js`): lê todos os vínculos e filtra
  na memória.
- **Votações** (`GestaoEnquetes`): para cada votação, uma consulta das perguntas, outra das opções, outra dos
  participantes. É o padrão "N+1".
- **Reuniões, órgãos locais, ROPA e dossiê fiscal:** o mesmo N+1, de 42 a 167 consultas num pedido.

### Índices: as tabelas grandes da massa

| Tabela | Linhas | Índices de busca (não clusterizados) |
| --- | --- | --- |
| `EbdChamadas` | 131.819 | 2 (só os únicos) |
| `ConquistasEventos` | 127.348 | 2 |
| `ValoresCampoRelatorioDepartamental` | 92.498 | 1 (só o único) |
| `LancamentosTesouraria` | 68.763 | **0** |
| `EbdCadernetas` | 16.900 | 1 |
| `ComunicacaoEntregas` | 16.638 | 3 |
| `AprovacoesRelatorioDepartamental` | 13.790 | **0** |
| `EscalasAlocacoes` | 11.162 | 1 |
| `MarcosMembro` | 8.817 | 1 |
| `ExtratoLinhas` | 8.657 | **0** |
| `SaidasTesouraria` | 8.351 | **0** |
| `MembroReferencia` | 5.113 | 2 (bairro e CPF; nenhum por congregação, situação ou nome) |

No SQL Server, a chave estrangeira **não cria índice sozinha**. As colunas pelas quais as telas filtram
(`CongregacaoId`, `MesReferencia`, `Status`, `MembroId`) estão sem índice nas tabelas de dinheiro e de relatórios.

### O que a leitura do código achou

O varredor heurístico (`node tools/raio-x/varrer-padroes.js`) apontou:

- 114 laços com consulta dentro. Nem todos são problema: muitos estão em gravações de um item só ou em rotinas da
  madrugada.
- 10 `SELECT` de tabela grande sem `WHERE`:
  - `GestaoAuditoria`, `GestaoCartas`, `GestaoDoacoes` (duas);
  - `GestaoElegiveisAssembleia`;
  - `GestaoPessoas` (a base do `SELECT`, com o `WHERE` acrescentado depois);
  - `GestaoVinculosFamiliares`;
  - `shared/protecaoDb.js`, `shared/universo.js`, `shared/vinculosFamiliares.js`.
- 1 link de foto gerado por linha, na lista de pessoas.

A medição confirma os que pesam (seção 2).

## 4. O aplicativo (front)

| Medida | Notebook | Celular simulado (4G, processador 4x mais lento) |
| --- | --- | --- |
| Primeira abertura (sem nada guardado) | 0,6 s (servidor local) | **5,7 s** |
| Aberturas seguintes (com o que o navegador guardou) | 0,4 s | **3,2 s** |
| Pedidos ao abrir | 48 | 48 |
| Baixado ao abrir (sem compressão) | 4.217 KB | 4.217 KB |
| Pedidos à API ao abrir o Início | 7 | 7 |
| Pedidos à API ao abrir o módulo Pessoas / Departamentos / Vida Eclesiástica | 9 / 7 / 7 | 9 / 7 / 7 |

O que compõe o peso:

| Arquivo | Tamanho | Comprimido | Observação |
| --- | --- | --- | --- |
| `index.html` | 575 KB | 117 KB | todas as telas num arquivo só |
| `script.js` | 124 KB | 36 KB | |
| `style.css` | 100 KB | — | |
| 41 módulos em `app/modulos/` | 2.550 KB | 600 KB | carregados **todos** na abertura, sem `defer` |
| `vendor/xlsx.full.min.js` | **952 KB** | — | a planilha Excel, carregada **em toda abertura**; só serve para importar e exportar |

- O Azure já entrega comprimido: `index.html` chegou em brotli com 114 KB.
- No celular, o que pesa nas aberturas seguintes é **ler e montar** os 3,6 MB de código a cada vez, não baixar.
  Por isso a casca guardada pelo service worker ajuda pouco.

## 5. O banco na nuvem e a distância

- **Produção** (`app-db-prod`): plano **Basic, 5 DTU**, sempre ligado.
  - Nos últimos 7 dias, o maior uso foi **30%** e a média, **0,2%** (duas pessoas usando).
  - 5 DTU é uma fração pequena de um processador: uma consulta que lê 68 mil linhas e ordena tudo ocupa o banco
    inteiro por segundos, e as outras esperam na fila.
  - Com a Igreja inteira usando, sobretudo em dia de assembleia, evento ou fechamento do mês, o limite aparece — ver a
    memória "Capacidade para 1.000 pessoas".
- **Homologação** (`ieadespa-homolog`): serverless, 1 vCore, **pausa sozinha depois de 15 minutos** sem uso. O primeiro
  acesso depois da pausa espera o banco acordar, cerca de 1 minuto. Isso só acontece na homologação.
- **Distância:** um pedido à API da produção que não toca no banco (resposta 401) leva **0,63 s**, dos quais 0,2 s são
  só para abrir a conexão. Cada pedido a mais numa tela soma.

## 6. As correções, por prioridade

| # | O quê | Ganho | Esforço | Risco | Muda a tela? |
| --- | --- | --- | --- | --- | --- |
| 1 | Índices: `LancamentosTesouraria` (congregação + mês; status), `SaidasTesouraria` (congregação + status/data), `MembroReferencia` (congregação + status; nome), `AprovacoesRelatorioDepartamental` (relatório), `ExtratoLinhas` (conciliação), `ValoresCampoRelatorioDepartamental` (relatório) | grande, em quase tudo | baixo (uma migração) | baixo | **não** |
| 2 | Lançamentos e saídas: escopo no `WHERE` (como `condicaoSqlEscopoPessoa`), congregação e mês obrigatórios ou com limite, páginas, e o link do comprovante só ao abrir | de minutos para menos de 1 s | médio | baixo | não (se a tela já manda congregação e mês; senão, um ajuste pequeno) |
| 3 | Uma consulta só (ou um lote) nas votações, reuniões, órgãos locais, relatórios dos departamentos, elegíveis, vínculos, ROPA e dossiê fiscal | de 5 a 15 s para menos de 1 s | médio | médio (mexe em regras) | não |
| 4 | O aplicativo baixar só o que usa: a planilha Excel só quando importar ou exportar; cada módulo ao entrar nele | celular: de 3,2 s para cerca de 1 s nas aberturas seguintes | médio | médio | não (o desenho é o mesmo) |
| 5 | A lista de pessoas em páginas na tela, com o servidor já pronto | 46 s para menos de 1 s (Geral) | junto com a tela nova | baixo | sim, a tela nova já aprovada |
| 6 | Juntar os pedidos de cada tela (Início e módulos: 1 ou 2 pedidos em vez de 7 a 9) | celular: 2 a 4 s a menos por tela | médio | médio | não |
| 7 | Plano do banco maior, só se ainda faltar fôlego em dia de pico | depende | baixo (é configuração) | baixo | não (custa por mês) |

## 7. Para repetir a medição

```bash
# a massa (uma vez; ~8 min) — o gerador fica no ramo homolog: copie para api/scripts/ só para rodar, sem registrar no Git
git show origin/homolog:api/scripts/semear-homologacao-grande.js > api/scripts/semear-homologacao-grande.js
cd tools/e2e-localdb
powershell -File bases.ps1 restaurar cenario-173
E2E_LOCALDB=1 node -r ./shim-mssql.js ../../api/scripts/semear-homologacao-grande.js
powershell -File bases.ps1 salvar cenario-massa
# a API (~3 min)
powershell -File bases.ps1 restaurar cenario-massa
node -r ./shim-mssql.js ../raio-x/medir-rotas.js > raio-x-rotas.json
# o aplicativo e o código
cd ../.. && node tools/raio-x/medir-front.js && node tools/raio-x/varrer-padroes.js
```
