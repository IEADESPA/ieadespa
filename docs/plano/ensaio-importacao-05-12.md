# O ensaio da importação no tamanho real (05/12/2026): o roteiro

O ensaio é o "vai ou não vai" do Membros no plano até 01/01 ([`plano-ate-01-01-2027.md`](plano-ate-01-01-2027.md)). Ele prova que
a importação do povo inteiro do sistema pago (cerca de 5 mil pessoas) cabe no banco da nuvem antes da importação grande na
produção, de 16 a 18/12. Se falhar, sobram 10 dias para consertar.

Escrito em 26/11/2026 (missão C da fase 10). As ferramentas estão em
[`tools/ensaio-importacao/`](../../tools/ensaio-importacao/README.md). **Este roteiro não roda nada sozinho:** cada passo na
nuvem é feito pela conversa principal, com o OK do responsável.

## 1. O que já foi provado no computador (LocalDB, 26/11/2026)

A massa fictícia tem 6 mil pessoas no formato da planilha do sistema pago, com os casos difíceis plantados: matrícula zerada,
vazia, que não é número ou repetida; congregação desconhecida, "GERAL" ou vazia; aspas, acentos, apóstrofo e datas ruins.
Ela passou inteira pela rota de verdade, no SQL Server local:

| O quê | Medido |
| --- | --- |
| O arquivo | 1,0 MB (o pedido da prévia leva 1,01 MB) |
| A prévia | 1,0 a 1,1 s com a migração 188 (sem ela, de 2,4 a 4,4 s); 26 idas ao banco; pico de 140 MB de memória |
| O gabarito | bateu: 53 de fora, 81 com a próxima matrícula, 55 possíveis repetidas, 5 matrículas que já eram de uma ficha |
| Os lotes de 200 | 30 lotes, média de 3,0 a 6,8 s (o computador varia); **609 idas ao banco por lote** (3 por pessoa) |
| A nuvem longe, simulada | com o orçamento de 1,5 s: 125 chamadas de cerca de 1,5 s cada, o mesmo resultado |
| No fim | 5.947 fichas em arrolamento, uma pendência de arrolamento para cada uma; as linhas da importação sem CPF, celular, mãe nem e-mail |

**O que o ensaio consertou no banco: a migração 188.** A prévia procura as fichas que já existem com o mesmo nome e
nascimento de cada pessoa do arquivo. Sem um índice no nascimento, o caminho que o banco escolhe depende de quantas fichas
ele tem. Com poucas, ele relia o arquivo inteiro para cada ficha: 1,49 milhão de páginas numa consulta só, 2 s no
computador. **Duas estimativas, não medidas:** a produção antes da importação grande deve estar nesse caso (tem poucas
fichas), e no Basic essa consulta levaria bem mais, talvez perto dos 45 s da prévia. Com algumas centenas de fichas
ele muda de caminho sozinho. Por isso **a homologação, com mais de 5 mil fichas, nunca mostraria esse caso.** Com o índice, o
caminho é o mesmo em qualquer tamanho: cerca de 30 mil páginas, uns 50 ms. A 188 vai para a produção junto com o Membros,
antes da importação grande. O ensaio do computador confere sempre que nenhuma consulta passa de 100 mil páginas.

## 2. O risco que só a nuvem responde: a distância entre a API e o banco

Cada ida ao banco custa a distância entre a API e o banco. A API roda no Static Web App, que não tem região no Brasil (o
endereço da homologação diz *eastus2*). O banco fica no Brasil (*brazilsouth*). No computador, a ida custa de 2 a 6 ms; na
nuvem, pode custar 100 ms ou mais. **Ninguém mediu ainda.**

A conta: **o tempo de um lote ≈ as idas × a distância de cada ida.** O lote de 200 faz 609 idas. A partir de 74 ms por ida,
ele passaria de 45 s, o limite anotado para uma chamada (anotado, não medido). A chamada cairia, e a importação não andaria.

**O conserto, já feito (26/11/2026):** cada chamada tem um **orçamento de 10 s**. Passado esse tempo, ela para de pegar
pessoas, grava as que entraram e devolve as que faltam. A tela já chama de novo até terminar, e cada chamada sempre leva ao
menos uma pessoa. A conta para 6 mil pessoas, com a distância que a nuvem tiver:

| Cada ida custa | Pessoas por chamada | Chamadas | Tempo total (aprox.) |
| --- | --- | --- | --- |
| 2 ms (a API perto do banco) | 200 | 30 | 2 min |
| 30 ms | ~108 | ~56 | 10 min |
| 74 ms | ~43 | ~141 | 25 min |
| 120 ms | ~25 | ~236 | 43 min |
| 150 ms | ~20 | ~300 | 55 min |

Sem linha recusada, cada chamada fica perto de 10 a 12 s. Com uma linha que o banco recusa, a chamada refaz o lote uma vez
(para deixar a linha de fora só com a prova de que é ela, e não o banco) e chega a uns 20 s. Se a recusa vem depois da metade
do orçamento, a chamada grava só as pessoas de antes dela, e a linha recusada fica em primeiro na chamada seguinte, onde a
prova custa uma linha. Assim, nem com várias recusadas seguidas uma chamada passa de uns 20 s: longe dos 45 s, seja qual
for a distância. O próprio ensaio mede a distância: ela é cerca de 10 s ÷ (3 × as pessoas por chamada + 10).

## 3. Antes do dia (até 04/12)

1. **O ramo com os dois consertos na homologação.** O orçamento de 10 s e a migração 188 (o índice do nascimento das fichas,
   item 1) estão no ramo `v10-membros-svelte`; a conversa principal mescla no `homolog` e confere o deploy ("DEPLOY OK"). O
   deploy roda as migrações: a 188 entra na homologação sozinha.
2. **A massa da homologação.** Tire a lista das congregações da homologação, um nome por linha, e escolha 5 matrículas de
   fichas que já existem lá (a massa grande vai de 700000 a 799999). Depois:

   ```bash
   node tools/ensaio-importacao/gerar-massa.js --linhas 6000 --congregacoes congs-homolog.txt \
     --colidir-com 700101,700102,700103,700104,700105 --codificacao 1252 --saida massa-homolog.csv --plantio plantio-homolog.json
   ```

   O `--codificacao 1252` grava como o Excel do Windows grava, para provar que a tela lê os acentos certos. O `plantio`
   traz o gabarito.
3. **A homologação sem importação.** A tela "Importar do sistema pago" tem de dizer que nada foi feito. A importação é uma
   vez só: se já houver uma, desfaça antes (item 7).
4. **Quem faz:** uma conta da Secretaria Geral da homologação, com a confirmação reforçada (a chave ou o código), porque
   o confirmar pede o 428.
5. **A decisão do banco no ensaio** (item 5): fica como está ou passa para o Basic durante o ensaio.

## 4. No dia, passo a passo

1. **Anote a hora de início** (o "ponto de volta" para desfazer, item 7).
2. **Acorde o banco:** abra a homologação e entre. O banco da homologação pausa sozinho; o primeiro pedido leva até 1 min.
3. **Abra o F12 → Rede**, marque "Preservar log" e filtre por `importacao-membros`.
4. **A prévia:** em Membros → "Importar do sistema pago", escolha `massa-homolog.csv`. Confira com o `plantio-homolog.json`:
   o total, as de fora e as com a próxima matrícula iguais ao gabarito; as possíveis repetidas, pelo menos o do gabarito.
   Se sair alguma de fora a mais, veja o motivo na lista antes de chamar de defeito: pode ser um CPF ou uma matrícula que a
   massa grande da homologação já tinha.
5. **Confirme** (o 428). Os lotes rodam sozinhos: não feche a aba. Anote a hora do fim.
6. **O resultado:** as importadas são o `entram` do gabarito; as de fora, o `problemas`.
7. **Os tempos:** no F12, use "Exportar HAR" e rode `node tools/ensaio-importacao/ler-har.js ensaio.har`. Ele dá a prévia,
   cada lote, a média, o p95, o maior e quantos passaram de 30 s e de 45 s. **Apague o HAR depois:** ele tem o arquivo inteiro.
8. **O banco:** no portal do Azure, no `ieadespa-homolog`, olhe as métricas da janela do ensaio (CPU, E/S de log, E/S de
   dados, sessões e workers) e o Query Performance Insight (as 5 consultas mais pesadas pela CPU, pela duração e pelo
   número de execuções). **O Query Performance Insight não mostra as páginas lidas:** elas estão no Query Store do próprio
   banco. Leia-as com uma consulta só de leitura, no editor de consultas do portal, no `ieadespa-homolog` (nunca na
   produção), logo depois dos lotes:

   ```sql
   SELECT TOP 5 LEFT(qt.query_sql_text, 120) AS consulta, rs.count_executions AS execucoes,
          rs.max_logical_io_reads AS paginas_no_maximo, CAST(rs.avg_logical_io_reads AS INT) AS paginas_em_media,
          rs.max_duration / 1000 AS ms_no_maximo
   FROM sys.query_store_runtime_stats rs
   JOIN sys.query_store_runtime_stats_interval i ON i.runtime_stats_interval_id = rs.runtime_stats_interval_id
   JOIN sys.query_store_plan p ON p.plan_id = rs.plan_id
   JOIN sys.query_store_query q ON q.query_id = p.query_id
   JOIN sys.query_store_query_text qt ON qt.query_text_id = q.query_text_id
   WHERE i.start_time >= DATEADD(HOUR, -3, SYSUTCDATETIME())
   ORDER BY rs.max_logical_io_reads DESC;
   ```

   Antes, confirme que o Query Store está gravando: `SELECT actual_state_desc FROM sys.database_query_store_options`
   deve dizer `READ_WRITE` (no Azure ele vem ligado). Ele captura no modo `AUTO`: a consulta barata que roda poucas vezes
   pode não aparecer, e não aparecer quer dizer que ela foi leve. A consulta acima foi conferida no LocalDB em 26/11/2026:
   roda e tem as colunas certas (lá o Query Store fica desligado, então não volta linha).

   A procura do mesmo nome e nascimento da prévia (a do índice da 188) e o `SELECT TOP` das linhas de cada lote são as que
   o ensaio do computador mais vigiou.
9. **A prova da permissão de ALTER** (juntar fichas, item 6).
10. **Amostra:** abra 3 fichas importadas. Confira o nome com acento e apóstrofo, "Arrolamento a completar" e nenhum CPF
    inválido.

## 5. Homologação × produção

A homologação é *serverless* (1 vCore, pausa em 60 min); a produção é **Basic, 5 DTU**, bem menor. A distância entre a API e
o banco é a mesma nas duas (o mesmo servidor `srv-app-sql`), então o tempo das chamadas vale para a produção. O trabalho do
próprio banco não vale: o que passa folgado no *serverless* pode apertar no Basic.

Duas formas de levar o resultado à produção (decisão da conversa principal):

- **A (sem mexer no banco):** fazer o ensaio como está e olhar a CPU e a E/S de log da homologação. Se ficarem baixas
  (abaixo de 25% de 1 vCore), o Basic aguenta.
- **B (recomendada, o teste honesto):** passar a homologação para o Basic só durante o ensaio e voltar depois. Leva alguns
  minutos, e a homologação fica fora do ar nesse tempo. O espaço usado precisa caber nos 2 GB do Basic (confira antes).
  Os comandos `az` vão com a conta da igreja (`export AZURE_CONFIG_DIR="$HOME/.azure-ieadespa"`; ver `HOMOLOGACAO.md`):

  ```bash
  # anote como está (o nível, o mínimo de vCore e a pausa) e o espaço usado
  az sql db show -g ieadespa -s srv-app-sql -n ieadespa-homolog \
    --query "{sku:currentServiceObjectiveName, minimo:minCapacity, pausa:autoPauseDelay, teto:maxSizeBytes}"
  az sql db list-usages -g ieadespa -s srv-app-sql -n ieadespa-homolog
  az sql db update -g ieadespa -s srv-app-sql -n ieadespa-homolog --edition Basic --service-objective Basic --max-size 2GB
  # depois do ensaio, de volta ao que o primeiro comando mostrou (o mínimo, a pausa e o teto anotados)
  az sql db update -g ieadespa -s srv-app-sql -n ieadespa-homolog --edition GeneralPurpose --compute-model Serverless \
    --family Gen5 --capacity 1 --min-capacity <o mínimo anotado> --auto-pause-delay 60 --max-size <o teto anotado>
  ```

## 6. A prova da permissão de ALTER (juntar fichas)

Juntar fichas desliga por um instante a proteção do histórico (`DISABLE TRIGGER`). Isso exige a permissão de ALTER nas
tabelas, e ela nunca foi provada no Azure.

- **A prova:** em Membros → Cuidados → Fichas repetidas, escolha um par que a importação marcou como possível repetida.
  Junte as duas, confira a ficha que ficou e use "desfazer a junção".
- **Deu certo:** o ALTER existe para o usuário do banco da homologação.
- **Falhou** com "O banco não deixou desligar a proteção do histórico": falta o ALTER. A importação pode ir; o juntar
  espera a permissão, que se dá no banco com o OK do responsável.
- **Para valer na produção:** confirmar se a produção e a homologação usam o **mesmo usuário do SQL** (o `SECRETS.md` fala
  de uma senha só no servidor). Se for o mesmo, a prova da homologação vale para a produção. Se não, a primeira junção na
  produção é a prova, logo depois da importação grande, com o "desfazer" à mão.

## 7. Como desfazer na homologação

A massa é fictícia, e a homologação é de teste: **o padrão é deixar como ficou.** Para repetir o ensaio (a importação é uma
vez só), volte o banco ao ponto de antes, com a restauração para um momento (cerca de 40 min; ver `HOMOLOGACAO.md`):

```bash
az sql db restore -g ieadespa -s srv-app-sql -n ieadespa-homolog --dest-name ieadespa-homolog-antes --time "<hora de início, ISO 8601, UTC>"
az sql db rename -g ieadespa -s srv-app-sql -n ieadespa-homolog --new-name ieadespa-homolog-ensaio
az sql db rename -g ieadespa -s srv-app-sql -n ieadespa-homolog-antes --new-name ieadespa-homolog
# conferir a homologação (entrar, a tela da importação diz "nada feito") e só então:
az sql db delete -g ieadespa -s srv-app-sql -n ieadespa-homolog-ensaio --yes
```

O banco restaurado volta com o nível escolhido na restauração: confira se é o *serverless* de antes (o primeiro comando do
item 5 mostra).

## 8. O critério: vai ou não vai

**Vai**, se tudo isto acontecer:

- a prévia passa em menos de 30 s, e o resumo bate com o gabarito;
- nenhuma chamada de lote dá erro nem passa de 30 s, e o p95 fica em até 15 s;
- as 6 mil pessoas entram em até 60 min;
- o resultado bate com o gabarito: as importadas, as de fora e as pendências;
- o banco fica com a CPU e a E/S de log médias abaixo de 80% durante os lotes (no Basic, o DTU médio abaixo de 90%);
- nenhuma consulta lê mais de 100 mil páginas numa execução (a consulta do Query Store do item 4, passo 8);
- juntar e desfazer a junção funcionam.

**Não vai**, se acontecer qualquer um destes:

- chamadas com erro ou tempo esgotado, mais de 3 seguidas, ou a importação presa;
- as 6 mil pessoas levam mais de 90 min;
- alguma conta diferente do gabarito (é defeito: corrigir antes de 16/12);
- o juntar recusado por falta de ALTER (só o juntar não vai; a importação pode ir).

**Se não for**, nesta ordem, até 16/12:

1. juntar as 3 idas de cada pessoa numa só (o lote faz 3 vezes mais pessoas por chamada);
2. gravar o lote em conjunto (poucas idas por chamada; muda o tratamento da linha recusada, com teste novo);
3. a API numa Function App no Brasil, junto do banco. Tem custo; é decisão do responsável.

## 9. A planilha de verdade não entra na homologação

A homologação é um ambiente de teste, com contas de teste conhecidas pela equipe: **dado real de membro não entra lá.** No
ensaio vai só a massa fictícia, do mesmo tamanho e com os mesmos defeitos.

A planilha de verdade, até 02/12, passa pela conferência local, no computador de quem a tem. A conferência não usa banco nem
rede e mostra só números e códigos:

```bash
node tools/ensaio-importacao/conferir-planilha.js planilha-do-sistema-pago.csv congregacoes.txt
```

Ela diz quantas pessoas ficam de fora e por quê, e quais nomes de congregação não batem com o sistema. Esses nomes se
corrigem antes de 16/12. A importação de verdade é feita direto na produção.

## 10. Perguntas abertas

1. **A planilha do ensaio.** O plano fala de "a planilha do sistema pago para o ensaio de 05/12". A proposta deste roteiro:
   no ensaio, só a fictícia; a real só na conferência local (item 9).
2. **O mesmo usuário do SQL** na produção e na homologação? É o que diz se a prova do ALTER vale para a produção (item 6).
3. **A importação complementar de 29 e 30/12** (no plano) não tem caminho hoje. Depois de uma importação concluída, a
   prévia recusa: "a importação do sistema pago já foi feita (é uma vez só)" (decisão de 22/11/2026). A importação "das
   linhas que faltaram" só serve à importação que parou no meio. Quem foi cadastrado no sistema pago depois da importação
   grande precisa de outra regra: uma decisão do responsável antes de 16/12.
4. **O limite de 45 s por chamada** é uma anotação, não uma medida. Com o orçamento de 10 s ele deixa de decidir, mas a prévia
   (uma chamada só) ainda depende dele.
5. **O Basic durante o ensaio** (item 5, forma B): sim ou não.
