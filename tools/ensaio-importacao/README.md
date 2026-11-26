# O ensaio da importação no tamanho real

Ferramentas do ensaio da importação do sistema pago (o "vai ou não vai" do Membros, marcado para 05/12/2026). O roteiro
do dia está em [`docs/plano/ensaio-importacao-05-12.md`](../../docs/plano/ensaio-importacao-05-12.md). Só dados de mentira.

| Arquivo | Para quê |
| --- | --- |
| `gerar-massa.js` | A massa fictícia no formato da planilha do sistema pago, do tamanho da igreja (6 mil pessoas por padrão), com os casos difíceis em quantidade conhecida e o gabarito do que a prévia tem de dizer |
| `ensaio-localdb.js` | O ensaio inteiro no LocalDB, pela rota de verdade: a prévia, a confirmação e os lotes; mede o tempo, as idas ao banco, a memória e as consultas mais pesadas |
| `conferir-planilha.js` | Confere a planilha de verdade no próprio computador, sem banco e sem rede: só números e códigos, nenhum dado da pessoa |
| `ler-har.js` | Lê o HAR que o navegador grava durante o ensaio na homologação e dá o tempo de cada lote |

## Uso

```bash
# a massa (os nomes das congregações do banco onde ela vai entrar, um por linha)
node tools/ensaio-importacao/gerar-massa.js --linhas 6000 --congregacoes congs.txt --saida massa.csv --plantio plantio.json

# o ensaio no LocalDB (base cenario-187 ou mais nova), sempre com a trava do banco de teste
until mkdir /c/tmp/localdb-trava 2>/dev/null; do sleep 20; done && \
  (cd tools/e2e-localdb && BASE=cenario-187 LINHAS=80 bash rodar.sh roteiro ../ensaio-importacao/ensaio-localdb.js) ; rmdir /c/tmp/localdb-trava

# a planilha de verdade, só no computador de quem a tem (nada sai dele)
node tools/ensaio-importacao/conferir-planilha.js planilha.csv congs.txt
```

O relatório do ensaio no LocalDB vai para `C:/tmp/ieadespa-membros/ensaio/` (fora do repositório; `ENSAIO_SAIDA` muda a pasta).
O HAR e a planilha de verdade nunca entram no repositório.
