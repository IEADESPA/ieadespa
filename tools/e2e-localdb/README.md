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

Os roteiros 2 a 6 são os da **v7.6** (Setores Técnicos e Termo de Vistoria); servem de modelo para os das versões seguintes.
O cenário (`e2e-1-setup.js`) cria congregações, pessoas e lideranças fictícias, confere as garantias da migração
142 (gatilhos, `CHECK`, permissões, idempotência) e grava `cenario.json` (ignorado pelo git).

Cada versão parte da base da anterior (`BASE=...`):

- **v7.7** (ministério com menores), base `cenario-menores`: `e2e-7` (setup) e `e2e-8` a `e2e-12`.
- **v7.8** (incidentes de proteção), base `cenario-protecao`: `e2e-13` (setup e migração 144), `e2e-14` (fluxos), `e2e-15` (segurança),
  `e2e-16` (corridas com vários processos) e `e2e-17` (o que a revisão independente pediu: vínculo do envolvido, tetos, regra obrigatória,
  rotina horária, reenvio de e-mail).
- **v7.10** (check-in infantil), base `cenario-checkin` (`bash rodar.sh preparar-checkin` a refaz a partir da `cenario-protecao`): `e2e-18` (migração 145 e cenário),
  `e2e-19` (fluxos), `e2e-20` (segurança), `e2e-21` (corridas com vários processos) e `e2e-22` (a revisão adversarial do servidor: encerrar a sala, autorizados × responsável
  revogado, portão da EBD, retenção, avisos que não falham em silêncio, cache dos prazos). **Cada um parte da base sozinho** (não rode dois no mesmo banco).

- **v7.11** (cuidado pastoral), base `cenario-pastoral` (`bash rodar.sh preparar-pastoral` a refaz a partir da `cenario-protecao`, aplicando a 148, a 149 e a 150 duas vezes): `e2e-23` (migração 148:
  esquema, CHECK, gatilhos, a marca de purga das notas, permissão, papel, prazos, avisos, retenção; e o cenário com a Região, o Superintendente e 30 domingos de EBD), `e2e-24` (fluxos:
  detecção, território, pessoa acompanhada, responsável por PIN, notas e leituras, pedidos, risco, escada, regra dos 30 dias, retenção, LGPD), `e2e-25` (segurança), `e2e-26` (corridas) e `e2e-27` (o que a revisão adversarial
  independente pediu: mudança de congregação, licença, Extensão, urgente, liderança citada, socorro que não se perde, fila com 410 itens, sonda do cadastro, anonimização) e `e2e-28` (v7.11.1, o mural de oração do site: esquema da 149, rota que falha
  fechada, o comum que não grava, o confidencial e o com risco guardados só no nível geral, aviso na hora sem o texto, quem vê, marcação à mão que não cala outro aviso, rotina e retenção),
  `e2e-29` (v7.12, comunicação: esquema da 150, consentimento com a impressão digital do texto, ficha em papel, modelos, grupo vivo cortado pelo território, envio com a fila e as
  cotas, 429, consentimento retirado no meio, cancelamento, convocação com ciência e "não alcançados", link de saída sem login, retenção e exclusão LGPD) e `e2e-30` (corridas: seis
  rodadas da fila juntas sem e-mail repetido e dentro do teto da hora, o mesmo envio em quatro processos, quatro mudanças de consentimento da mesma pessoa).

`bash tudo.sh` roda a bateria inteira, cada grupo sobre a sua base.

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
