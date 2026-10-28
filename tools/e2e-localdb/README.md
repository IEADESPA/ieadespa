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

- **v7.11** (cuidado pastoral), base `cenario-pastoral` (`bash rodar.sh preparar-pastoral` a refaz a partir da `cenario-protecao`, aplicando a 148, a 149, a 150 e a 151 duas vezes): `e2e-23` (migração 148:
  esquema, CHECK, gatilhos, a marca de purga das notas, permissão, papel, prazos, avisos, retenção; e o cenário com a Região, o Superintendente e 30 domingos de EBD), `e2e-24` (fluxos:
  detecção, território, pessoa acompanhada, responsável por PIN, notas e leituras, pedidos, risco, escada, regra dos 30 dias, retenção, LGPD), `e2e-25` (segurança), `e2e-26` (corridas) e `e2e-27` (o que a revisão adversarial
  independente pediu: mudança de congregação, licença, Extensão, urgente, liderança citada, socorro que não se perde, fila com 410 itens, sonda do cadastro, anonimização) e `e2e-28` (v7.11.1, o mural de oração do site: esquema da 149, rota que falha
  fechada, o comum que não grava, o confidencial e o com risco guardados só no nível geral, aviso na hora sem o texto, quem vê, marcação à mão que não cala outro aviso, rotina e retenção),
  `e2e-29` (v7.12, comunicação: esquema da 150, consentimento com a impressão digital do texto, ficha em papel, modelos, grupo vivo cortado pelo território, envio com a fila e as
  cotas, 429, consentimento retirado no meio, cancelamento, convocação com ciência e "não alcançados", link de saída sem login, retenção e exclusão LGPD) e `e2e-30` (corridas: seis
  rodadas da fila juntas sem e-mail repetido e dentro do teto da hora, o mesmo envio em quatro processos, quatro mudanças de consentimento da mesma pessoa),
  `e2e-31` (v7.14, identidade visual: esquema e gatilhos da 151, a porta, o ciclo aberto pela Diretoria, temas já usados, sugestões com igual e parecido, triagem sem
  o nome de quem mandou, a votação que abre sozinha no dia 22 e é votada pela Enquete, o fechamento e a apuração depois da meia-noite do dia 30, cores e artes, o resultado
  do culto, os avisos só à Diretoria, empate e desempate, o botão, LGPD, Meus Dados, retenção e lixo em cada campo; o relógio da regra vai a 2027 e 2028 por
  `usarRelogio`) e `e2e-32` (corridas: seis sugestões da mesma pessoa, o mesmo tema por seis pessoas, a votação aberta por quatro acessos, quatro votos da mesma pessoa,
  a rotina e acessos apurando juntos, quatro artes e dois resultados ao mesmo tempo, cancelar o ciclo e sugerir juntos) e `e2e-39` (o banco com
  READ_COMMITTED_SNAPSHOT ligado, como o Azure SQL: o voto em curso entra na contagem do encerramento e o "no máximo 3" e o tema único seguem valendo; liga e desliga sozinho).
- **v7.15** (crise e porta-voz único; segurança da congregação), base `cenario-crise` (`bash rodar.sh preparar-crise` a refaz a partir da `cenario-pastoral`, aplicando a 152 duas
  vezes): `e2e-33` (esquema da 152 e a categoria CRISE na comunicação; quem entra; abrir com o aviso a toda a liderança — sininho na hora, celular na primeira rodada, e-mail na
  fila passando na frente de um comunicado e dentro do teto da hora —, o motivo que nunca vai no aviso, a crise única no banco, a faixa, o modelo do aviso fora da tela de
  comunicados, a ciência "Li o aviso"; manifestações e correções; pedidos da imprensa com o encaminhamento, a resposta e a correção; trocar o porta-voz cancelando o aviso velho da
  fila; encerrar, com quem saiu da liderança no meio recebendo o fim; a segurança: território, plano em versões, simulado, vistoria com pendência, AVCB e seguro, equipe só de adultos
  da congregação e a saída automática; os avisos do sininho; retenção, exclusão LGPD e Meus Dados; lixo em cada campo; auditoria) e `e2e-34` (corridas: quatro aberturas, seis
  manifestações, quatro correções da mesma, quatro primeiras respostas ao mesmo pedido, dois planos na mesma versão, a mesma pessoa na equipe por quatro, troca de porta-voz × fim
  e quatro encerramentos). Os roteiros `e2e-29` e `e2e-30` (v7.12) também passam sobre a `cenario-crise`.

- **Trava 7-C** (migração 153): `e2e-35` sobre a `cenario-crise` (as migrações rodando de novo não desfazem a base legal editada na tela; a 153, duas
  vezes, troca só o texto original; o esquema novo) e, sobre a `cenario-trava7c` (`bash rodar.sh preparar-trava7c`: a 153 duas vezes sobre a
  `cenario-crise`), `e2e-36` (as retenções da v7.2 a v7.4: justificativa da Ceia, ocorrência e administrador de canal, contato do convidado, com o
  gatilho do relógio e a rotina diária de verdade) e `e2e-37` (a rodada da madrugada só com o aviso de crise; a região sem Superintendente; o teto de
  e-mails da crise lido da configuração). Os roteiros da v7.11 a v7.15 (`e2e-24` a `e2e-30`, `e2e-33`, `e2e-34`) passam sobre a `cenario-crise`.
- **Trava 7-C** (costuras entre a proteção, o cuidado pastoral, a comunicação e a crise), sobre a `cenario-trava7c` (a mesma do
  `preparar-trava7c`, que aplica a 153 e a 154 duas vezes): `e2e-40` (o cuidado pastoral × a proteção de crianças: a liderança com pendência reservada fora do item, da nota, do pedido e da busca do menor, o item que sai
  dela e sobe ao degrau de cima; o sinal de risco sobre criança só com o nível geral e o aviso à Proteção; o reenvio do mesmo item do site; a concessão de departamento; a exclusão
  LGPD de quem era o responsável), `e2e-41` (a crise e a comunicação: o menor fora do aviso, o suspenso fora da fila e do fim, a delegação que avisa, a equipe de segurança, a
  leitura que vira prova na exclusão LGPD, os contatos das versões antigas do plano, Meus Dados sem corte, o IP do consentimento) e `e2e-42` (corridas: os tetos do dia do
  pedido de visita e do pedido da imprensa contados dentro da trava).
- **Trava 7-C** (a saúde do check-in, item I1), sobre a `cenario-checkin` (`bash rodar.sh preparar-checkin`): `e2e-38` (revogar o consentimento de saúde e
  apagar a saúde e as cópias na MESMA transação, pelo responsável e pela ficha; o apagar que falha no meio — um gatilho de teste — não deixa a revogação pela metade;
  corridas de revogar × gravar a saúde × check-in em vários processos, sem 500, sem deadlock e sem saúde órfã; e, com READ_COMMITTED_SNAPSHOT ligado como no Azure, a revogação
  a meio caminho segurando a trava enquanto outro processo grava a saúde e faz o check-in — prova determinística da trava). `E2E38_RODADAS` muda o número de rodadas (padrão 6).
- **Trava 7-C, as decisões de 23/10/2026** (migração 155, aplicada duas vezes no `preparar-trava7c`), sobre a `cenario-trava7c`: `e2e-43` (o dinheiro do voluntário só avisa:
  o fornecedor pessoa física ligado à matrícula no território, os avisos de voluntário ativo, pagamento habitual e cachê/comissão que só gravam depois da confirmação, a saída e
  os avisos numa transação, o resumo do mês, Meus Dados), `e2e-44` (funções com menores: as marcas de departamento e cargo, a nomeação que avisa sem o motivo, o painel da
  Diretoria × da Proteção, o aviso pelo motor que nunca vai à própria pessoa e se repete no mês seguinte), `e2e-45` (atores, território, sondas e lixo) e `e2e-46` (corridas).

- **v8.1** (AFM e faltas da CLI, migração 156), base `cenario-afm` (`bash rodar.sh preparar-afm`: a `cenario-trava7c` com a 153 a 155 reaplicadas e a 156 duas
  vezes). Cada roteiro monta o próprio cenário (`lib-afm.js`): `e2e-47` (esquema da 156; tipo da reunião; 3 faltas seguidas com exclusão só pelo sistema, sem perder o
  cargo; providências, comunicação e readmissão que recomeça a contagem pela ordem das reuniões; catálogo da justificativa no pedido e na Secretaria; Extraordinária que não
  conta; Sessão Magna com as duas turmas e a falta dupla; desmatrícula, reprovação, licença para oficiar no batismo, rematrícula; Reitor, docentes e CDER; Meu Painel, Meus
  Dados, avisos, rotina, retenção e auditoria — com `E2E_CONTRATO=1` grava as respostas reais para `tools/front-afm`), `e2e-48` (401 em toda ação, PIN, território, nível
  geral, 404, justificativa só a própria e no território, lixo em cada campo) e `e2e-49` (corridas: seis apurações, justificativas × apurações, readmissões, reprovações,
  rematrículas, nomeações de Reitor, mestres da CDER, matrícula automática) e `e2e-50` (o que a revisão independente do servidor pediu: só o nível geral mexe no que conta
  falta, ninguém na própria falta, uma reunião que conta por dia e "não conta falta", período fora que interrompe, pedido pendente que segura a exclusão, exclusão refeita
  na apuração atrasada, Seminário só da AFM, quórum da Magna só da Câmara, motivo fora da trilha e do nível local, CEI e o certificado na rematrícula).
  Os roteiros põem cada reunião que conta numa data passada diferente (uma por dia, como no sistema).
- **v8.2** (Escada ministerial, migração 157), base `cenario-escada` (`bash rodar.sh preparar-escada`: a `cenario-afm` com a 157 duas vezes). Cada roteiro monta o
  próprio cenário (`lib-escada.js`): `e2e-51` (esquema da 157; prévia, protocolo e cada avanço conferindo os requisitos; a conclusão que troca cargo, Função e histórico
  juntos; interstício pelo histórico; queima de etapas; teto das obreiras; nomeação do Presidente com o nivelamento; outra convenção; Evangelista e Pastor só por indicação
  do Presidente; disciplina com o motivo só ao nível geral; "no cargo desde"; candidato, CHM concedido e revogado no meio do processo; veto técnico; cadastro com cargo e
  dízimo só no nível geral; vacância e minimização; Meus Dados — com `E2E_CONTRATO=1` grava as respostas reais para `tools/front-escada`), `e2e-52` (401, PIN, geral sem
  a permissão, Dirigente fora do escopo e sem os atos do geral; lixo em todo campo sem 500 nem mudança no banco) e `e2e-53` (corridas: quatro protocolos, quatro
  "avançar" na última etapa, vetos contra avanços, "no cargo desde", trocas de cargo, matrículas de candidato e CHM ao mesmo tempo) e `e2e-54` (o que as revisões
  independentes pediram: o próprio no cadastro, a ficha velha que não desfaz a promoção, o sexo que não se apaga, a data antes de 2000, a 157 reaplicada sem refazer o
  preenchimento, o CHM usado na promoção e levado na rematrícula, o teto das obreiras em toda modalidade, veto só em processo de cargo, candidato, data de Brasília,
  conclusão refeita dentro da trava). Desde a v8.3, `concluir()` percorre a esteira nova inteira (CEI, homologação, taxa e cerimônia).
- **v8.3** (Consagração e documentação, migração 158), mesma base `cenario-escada` (a `preparar-escada` aplica a 158 duas vezes). `e2e-55` (documentos da indicação; fila
  e parecer do CEI com sabatina, escrutínio do divorciado e INAPTO; processo antigo sem parecer; homologação do Presidente e da CLI, em lote; taxa com centavos, remoção e
  quem registra; CHM como documento — emitido, substituído, usado na subida, quem baixa; cerimônia — comissão, candidatos, roteiro com casal e diplomação, diplomas
  impressos com o código reservado, presença, ausência que perde no ano, taxa fora do prazo, retirar, cancelar; diploma verificável; Meus Dados; minimização), `e2e-56`
  (401, PIN, liderança local, geral sem a permissão certa; ids ruins; ninguém no próprio processo; a disciplina que não vaza pelo parecer; lixo em todo campo sem 500 nem
  mudança no banco) e `e2e-57` (corridas: pareceres, homologações, o mesmo processo em duas cerimônias, impressões dos diplomas, registrar × cancelar × retirar, CHM).
  O cadastro assina o link da foto: o `lib.js` usa a conexão pública de desenvolvimento do armazenamento (`UseDevelopmentStorage=true`), que assina sem rede.
- **v8.4** (Credencial digital, migração 159), mesma base `cenario-escada` (a `preparar-escada` aplica a 159 duas vezes). `e2e-59` (emitir; a credencial no Meu
  Painel com o QR e o PDF; a leitura pública do QR só com o mínimo e a situação de agora — AFM inativa, processo só aberto que não aparece, afastamento, sem comunhão —;
  códigos ruins; o limitador; nova via, cancelar; pedido e registro de impressão; lote; Meus Dados; a minimização que recolhe a credencial; quem pode o quê; lixo) e
  `e2e-60` (corridas: emitir, nova via, emitir × cancelar × nova via, dois lotes). Com `E2E_CONTRATO=1` o `e2e-59` grava as respostas reais para
  `tools/front-credencial`.

`bash tudo.sh` roda a bateria inteira, cada grupo sobre a sua base.

**Banco compartilhado:** quando dois trabalhos rodam ao mesmo tempo na mesma máquina, o LocalDB (e o banco `ieadespa_local`) é UM só. Pegue a trava antes de restaurar, migrar ou
rodar roteiro (`until mkdir C:/tmp/localdb-trava 2>/dev/null; do sleep 20; done && ...`) e solte no fim (`rmdir C:/tmp/localdb-trava`). Encadeie com `&&`, nunca com `;`: se a
trava não foi pega, nada pode rodar (v7.15: um `;` deixou uma restauração passar por cima do banco de outro trabalho).

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
