# Verificação ponta a ponta contra o SQL Server local (LocalDB)

Roda os **handlers reais** (`api/Gestao…/index.js`) contra um SQL Server de verdade, sem tocar na produção nem
na homologação. Nasceu na v7.5 e foi refeito na v7.6 como ferramenta guardada aqui, para a próxima versão não
precisar recriá-lo. Só funciona no Windows com o **SQL Server Express LocalDB** (`sqllocaldb`) instalado.

## Por que existe

Os testes de unidade (`npx jest` em `api/`) simulam o banco: não exercitam os gatilhos, os `CHECK`, os índices
únicos, as transações nem as corridas. Cada versão com migração achou, aqui, defeitos que os testes de unidade não
viam (na v7.6: o nome de uma permissão acima do limite da coluna, que derrubaria o deploy).

## Como funciona

- `shim-mssql.js` troca o módulo `mssql` (com `node -r`) por uma ponte para `ponte.ps1`, um PowerShell que mantém
  **uma** conexão `System.Data.SqlClient` aberta e conversa por linhas JSON. O driver do Node não conecta no LocalDB.
- `lib.js` tem os ajudantes dos roteiros (sessões assinadas, `chamar`, o fuzz com lixo em todo campo, o "retrato" do banco).
- `worker.js` + `e2e-6-corridas.js` fazem **corridas de verdade**: cada processo tem a sua conexão.
- `bases.ps1` salva e restaura cópias do banco (LocalDB Express não aceita `COMPRESSION`).
- Instância padrão: `(localdb)\psc7`, banco `ieadespa_local` (mude com a variável `E2E_CS`).

## Uso

```bash
sqllocaldb start psc7                       # uma vez
bash rodar.sh preparar                      # ~15 min: migra do zero (executor do deploy) + cenário + salva a base
bash rodar.sh roteiro e2e-3-atos.js e2e-5-seguranca.js   # segundos para restaurar; o 5 continua o estado do 3
bash rodar.sh roteiro e2e-2-vinculos.js
bash rodar.sh roteiro e2e-4-vistoria.js
bash rodar.sh roteiro e2e-6-corridas.js
```

Os roteiros são os da **v7.6** (Setores Técnicos e Termo de Vistoria): servem de modelo para o da versão seguinte.
O cenário (`e2e-1-setup.js`) cria congregações, pessoas e lideranças fictícias, confere as garantias da migração
142 (gatilhos, `CHECK`, permissões, idempotência) e grava `cenario.json` (ignorado pelo git).

## Armadilhas já pagas

- O executor de migrações **não termina sozinho** se a ponte ficar viva: o `pool.close()` do shim a encerra.
- Depois de **qualquer** erro de SQL a ponte recicla a conexão (senão "já existe um DataReader aberto").
- Script de shell perde barras invertidas: regex e `(localdb)\psc7` só por arquivo ou pelas ferramentas de edição.
- Rodar roteiros sempre sobre banco restaurado: dados da rodada anterior atrapalham as contagens.
- Quem emite mais de 3 atos por dia esbarra no teto (é a regra funcionando): use outra pessoa nos roteiros.
- Mudou uma regra no servidor? Os roteiros quebram por **expectativa defasada**, não por defeito: leia cada ✗ antes de "consertar" o servidor
  (na v7.6 o teste estava errado duas vezes: uma cadeia `x-forwarded-for` cujo penúltimo valor era público e um número aceito como texto).
- O aceite digital exige o hash do texto que a tela mostrou: o `POST` do `lib.js` o busca em Meu Painel (`termoHashDo`) sozinho; passe `termoHash` no
  corpo só para testar hash velho ou forjado. Nas corridas (`e2e-6`), calcule o hash no processo principal e leve-o no corpo de cada chamada.
- "Líder" = liderança territorial **com a permissão `pessoas`**: o token dos roteiros só com as permissões dos setores não é líder.
- Quem indicou ou aprovou a pessoa não registra a ficha dela em setor com poder: registre com outra pessoa da Diretoria (`GERAL(1002, TUDO)`).
