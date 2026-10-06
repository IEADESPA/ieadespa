# FASE D — Robustez, operação e celular (retrofit das fases 0 a 7)

> Histórico e checklist desta parte do plano de versões. As referências a “seção 2.x” e “seção 4” apontam para o
> [README](../../README.md); cada versão tem seu lugar no [índice do plano](INDICE.md).

**Onde entra:** entre a v7.5 e a 🔒 Trava de Revisão 7-A da FASE 7 — a trava 7-A só abre depois que a FASE D fechar.
Mesmo motivo da FASE B (inserida entre a 4 e a 5): não é tema de negócio novo, é **consertar e reforçar o que já está
construído antes de empilhar mais cinco fases em cima**. Letra, não número, pra nunca colidir com versão existente.

**De onde veio:** da [8ª rodada de pesquisa](../pesquisa/oitava-rodada-2026.md) (06/10/2026), que respondeu à pergunta
"o que separa o sistema de hoje do melhor que ele pode ser?". A resposta não foi "falta função": o sistema já cobre o
Estatuto e o Regimento com mais detalhe do que qualquer produto de mercado comparado nas rodadas anteriores. O que
separa é **robustez**: um front-end de 21.690 linhas num arquivo só, nenhuma prova automática de que cada tela abre,
homologação com banco atrasado, liderança sem segundo fator, ninguém avisado quando o sistema cai, e o membro usando
pelo celular telas desenhadas pro notebook.

**Como ler o custo de cada versão** (o responsável decide por esforço + risco): *Esforço* em sessões de trabalho
(baixo = 1, médio = 2 a 4, alto = 5 ou mais); *Risco* = chance de quebrar o que já funciona; *Depende de você* = o que só
o responsável pode fazer (criar segredo, aprovar custo no Azure, decidir entre duas opções).

**Ordem obrigatória:** vD.1 antes da vD.2 (a prova automática é o que torna a modularização segura); o resto é livre.

## vD.1 — Toda tela abre, provado por máquina (teste de interface no CI)

Hoje a pergunta 2 de toda Trava de Revisão ("toda tela nova abre e mostra dado de verdade?") é respondida clicando à
mão, uma por uma. Com cerca de 190 rotas e centenas de sub-abas, a mão não alcança — e o bug que motivou as travas (um
`id` de botão diferente do que o JavaScript gera derrubou o Financeiro inteiro) é exatamente o tipo que uma máquina pega
em segundos. O equipamento já existe: `tools/csp-e2e` descobre sozinho todo controle da tela (880 pontos de evento),
aciona cada um com a API simulada e comparou 4.782 ações sem divergência quando a CSP forte entrou (04/10/2026). Falta
só torná-lo **permanente**.

- [ ] Rodada do `tools/csp-e2e` no CI (`azure-static-web-apps-white-grass-*.yml`), antes do deploy, com o Chromium do
      próprio runner (hoje usa o Edge da máquina via `puppeteer-core`): plano de ações descoberto no front, API simulada,
      perfis anônimo/geral/membro. **Qualquer erro de JavaScript, `getElementById` nulo, violação de CSP ou tela em
      branco = o deploy não sai.**
- [ ] Linha de base guardada no repositório (`tools/csp-e2e/base/`): o relatório da rodada aprovada vira a referência;
      um push só passa se o resultado for igual à base **ou** se a base for atualizada no mesmo commit (mudança de tela
      intencional fica visível no diff, não escondida).
- [ ] Tempo total abaixo de 10 minutos (modo `--rapido`: uma ação por manipulador distinto); a rodada completa fica
      pra `workflow_dispatch` e pras travas.
- [ ] As Travas de Revisão passam a citar o resultado desta rodada como resposta à pergunta 2 — clicar à mão continua
      valendo pra tela nova, mas deixa de ser a única prova.

*Esforço:* médio. *Risco:* baixo (não toca o sistema, só o CI). *Depende de você:* nada.

## vD.2 — Front-end em módulos (v10.4 trazida pra frente)

A v10.4 dizia, com 7.898 linhas: "fazer isso **antes** da FASE 5, não depois: é mais barato modularizar 8 mil linhas do
que 20 mil". Não foi feito. Hoje `app/script.js` tem **21.690 linhas** e `app/index.html` **5.481** — e as FASES 8 a 12
vão empilhar mais. Cada edição num arquivo desse tamanho é um risco de derrubar o painel inteiro, e o navegador baixa
tudo (inclusive o Financeiro) pra um membro que só quer ver a própria escala. O que mudou desde a v10.4 e torna isso
seguro agora: a vD.1 prova equivalência ação por ação, igual provou a CSP (4.782 ações idênticas).

- [ ] `app/script.js` dividido por módulo (os mesmos do objeto `MODULOS`: membresia, território, eclesiástica,
      disciplina, financeiro, EBD, departamentos, saúde, calendário, comunicação, eventos, escalas…), um arquivo por
      módulo em `app/modulos/`, carregado **sob demanda** ao entrar no módulo; o núcleo (login, sessão, navegação,
      toast/modal, utilitários) fica num arquivo pequeno carregado sempre.
- [ ] Mesmo tratamento no `index.html`: o markup de cada módulo em arquivo próprio, montado na navegação — sem
      framework (decisão da FASE 10 continua: melhorar o que existe, não reescrever).
- [ ] Prova de equivalência pela vD.1 **antes e depois de cada módulo extraído** (um módulo por commit): zero
      divergência nas ações, zero violação de CSP, nenhum `id` perdido. O `eventos.js` (despachante com lista fechada)
      continua único — a lista fechada passa a ser montada pelos módulos carregados.
- [ ] O que se repete de verdade (tabela com filtro, formulário mestre-detalhe, badge de status) vira função
      reaproveitável no núcleo — só o que já se repete, sem redesenho visual (isso é v10.1).
- [ ] A v10.4 é marcada como entregue aqui (nota lá apontando pra cá), sem duplicar.

*Esforço:* alto. *Risco:* médio, mitigado pela vD.1 (sem a vD.1 feita, **não começar**). *Depende de você:* nada.

## vD.3 — Homologação igual à produção

Descoberta de 03-04/10/2026 (`docs/PLATAFORMAS.md`): o banco `ieadespa-homolog` está com o esquema **atrasado** (o
fluxo do PR migra o banco de produção, não o de homologação — por isso a lista de documentos dá 500 lá), e a homologação
passou semanas ligada ao Function App antigo sem rodar o código novo. Ou seja: "testado na homologação" não provava nada.
E desde 13/09/2026 a `HOMOLOGACAO.md` pede um seed de dados fictícios que nunca foi escrito.

- [ ] Passo de migração do banco de homologação no fluxo do PR #1 (`homolog`), com a conexão dela guardada como
      segredo do GitHub (`AZURE_SQL_CONNECTION_STRING_HOMOLOG`) — mesmo `scripts/executar-migracoes.js`, mesma ordem.
- [ ] Seed fictício reproduzível (`api/scripts/semear-homologacao.js`): congregações, áreas, 50 a 100 pessoas com
      nomes inventados, um ciclo de tesouraria fechado, uma turma de EBD, uma escala, um processo disciplinar — tudo
      marcado como fictício; nunca roda contra a produção (recusa pela string de conexão).
- [ ] Varredura de rotas (`tools/csp-e2e --remoto`) rodando contra a homologação depois de cada deploy dela — o passo 4
      da rotina de atualização de plataformas passa a ter prova.
- [ ] `HOMOLOGACAO.md` atualizada: o que a homologação prova e o que não prova, sem ambiguidade.

*Esforço:* baixo. *Risco:* nenhum pra produção. *Depende de você:* criar o segredo no GitHub (ou autorizar o `gh secret
set` em modo manual) — o valor sai do portal do Azure, nunca de texto puro no repositório (regra 2 do `CLAUDE.md`).

## 🔒 Trava de Revisão D-A — antes de avançar para a vD.4

Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da seção 3 do README). Audita vD.1 a vD.3 pelas 5
perguntas do checklist. Atenção especial à vD.2: a pergunta 2 (toda tela abre) tem que ser respondida pela rodada
completa da vD.1 (não só o modo rápido) **e** por um clique manual em cada módulo extraído.

## vD.4 — Segundo fator para quem aprova dinheiro e concede acesso

Hoje a liderança entra só com matrícula + senha. Quem tem nível geral aprova saída, gera remessa bancária (dinheiro de
todas as congregações), concede permissão e vê dado de disciplina e de menor. Senha vazada (reuso em outro site,
telefone perdido com a senha salva) = tudo isso nas mãos de quem achou. A infraestrutura do segundo fator **já existe**:
o membro recebe código de 6 dígitos por e-mail (`shared/codigoAcesso.js`, vB.5) pelo mesmo serviço de e-mail do Azure.

- [ ] **Segundo fator no login de liderança** (quem tem registro em `Lideranca`): depois da senha, código de 6 dígitos
      enviado ao e-mail do cadastro, válido por 10 minutos, 5 tentativas; dispositivo lembrado por 30 dias (cookie
      assinado, revogável na tela de sessões da vB.9). Membro comum (PIN) **não muda** — o PIN já é um fator próprio
      e o que ele alcança é só o dele.
- [ ] **Confirmação reforçada ("step-up") em quatro atos**, mesmo com dispositivo lembrado: aprovar saída acima do
      valor dos quatro olhos (`ParametrosCompliance`), gerar remessa bancária, conceder/retirar permissão ou cargo
      (`GestaoLideranca`/`GestaoDelegacoes`) e executar exclusão LGPD. Código novo na hora, registrado na auditoria
      com o ato.
- [ ] Opção sem e-mail: aplicativo autenticador (TOTP, padrão RFC 6238, Google Authenticator/Microsoft Authenticator)
      — sem custo, funciona sem internet no telefone. Cadastro com QR na tela "Meus Dados", códigos de recuperação
      de uso único guardados só como hash.
- [ ] Tela de administração: quem tem segundo fator ativo, quem não tem, último uso — e a rede de segurança: o
      Presidente e o Secretário Geral **não ficam trancados fora** (código de recuperação emitido pela Secretaria
      Geral com registro de dois olhos, mesmo princípio da migração 122).

*Esforço:* médio. *Risco:* baixo no código; **usabilidade** é o ponto a decidir (uma pessoa que entra 10 vezes por dia
sente o código a cada 30 dias, não a cada entrada). *Depende de você:* escolher **e-mail** (já existe, custo zero, depende
do e-mail chegar) ou **aplicativo autenticador** (mais seguro, exige instalar um app no telefone de cada líder) — ou os
dois, à escolha de cada pessoa.

## vD.5 — Operação: saber que caiu antes de alguém reclamar, e entrar sem esperar

Hoje existe **um** alerta (`ieadespa-api-falhas`: mais de 5 falhas em 15 minutos). Se o sistema sair do ar num domingo
de manhã (hora da chamada da EBD), ninguém é avisado — só quem tentar usar. O login leva de 10 a 30 segundos no primeiro
acesso do dia (partida a frio das Functions + banco serverless pausado), e a tentativa de resolver por infraestrutura
(20/09) esbarrou num defeito do Azure sem solução. A restauração do banco foi ensaiada **uma vez** (13/09/2026) e os
segredos (`AUTH_SECRET`, `CRON_SECRET`) nunca foram trocados.

- [ ] **Teste de disponibilidade** do Application Insights a cada 5 minutos, de 3 regiões, numa rota **que não toca o
      banco** (ex.: `GET /api/versao`, nova, só devolve a versão publicada) — alerta por e-mail quando falhar de 2
      regiões seguidas. Efeito colateral útil: a chamada mantém as Functions **quentes** o dia inteiro (some a partida
      a frio de 15-30 s) **sem acordar o banco**, que continua pausando de madrugada como hoje. Custo: o teste de
      disponibilidade é gratuito até o limite da camada; o banco não muda.
- [ ] **Decisão separada, com número**: manter o banco acordado em horário de uso (6h às 23h) tira os segundos de
      retomada do serverless no primeiro login do dia, mas o banco passa a cobrar o mínimo (0,5 vCore) o tempo todo nesse
      horário — medir no portal o custo de um mês com e sem, e só então decidir. A opção gratuita (um `curl` por GitHub
      Actions a cada 15 minutos em horário de uso, como o aquecimento que `rotinas-diarias.yml` já faz às 7h) fica
      documentada como alternativa.
- [ ] **Anexos com rede de segurança**: exclusão suave (soft delete) e versionamento de blob na conta
      `ieadespaarmazenamento` (anexos da vB.4, fotos, documentos) — hoje o banco tem restauração a qualquer ponto, os
      arquivos não. Custo: só o espaço das versões (centavos neste volume).
- [ ] **Ensaio semestral de restauração** (banco + anexos) registrado na tabela da `HOMOLOGACAO.md`, com o tempo
      medido — e um lembrete pelo motor de notificações (vB.2) 30 dias antes de vencer, pra Secretaria Geral.
- [ ] **Rotação de segredos com procedimento escrito** no `SECRETS.md`: `AUTH_SECRET` (derruba todas as sessões —
      avisar antes), `CRON_SECRET`, `CHAVE_SITE_SISTEMA` e as chaves `age` do SOPS; periodicidade anual ou a qualquer
      suspeita; checklist de 6 passos que qualquer sessão futura consegue seguir.
- [ ] Alerta quando a rotina diária (`rotinas-diarias.yml`) falhar duas vezes seguidas — hoje o GitHub só manda
      e-mail pra quem fez o último commit, que pode não ser quem cuida do sistema.

*Esforço:* baixo. *Risco:* nenhum pro código. *Depende de você:* tudo que é no Azure roda em **modo manual** (o modo
automático bloqueia mudança em produção, como em 03/10/2026) e a decisão de custo do banco acordado é sua.

## vD.6 — Celular de verdade pro membro (parte da v10.3 trazida pra frente)

O membro entra pelo celular (matrícula + PIN, PWA instalável) — e encontra telas desenhadas pro notebook. A classe
`.rolagem-tabela` (rolagem lateral) existe e está em 129 tabelas do `index.html`, mas das **213 tabelas que o
`script.js` gera**, só 23 a usam: no telefone, a maioria corta a última coluna sem aviso. A v10.3 previa só isso, no fim
do roteiro; o membro já usa hoje.

- [ ] Toda tabela gerada pelo `script.js` nasce dentro de `.rolagem-tabela` — uma função única de montar tabela
      (reaproveitada na vD.2), não 190 edições à mão.
- [ ] As telas que o membro comum usa (Meu Painel: perfil, dados, família, contribuições, LGPD, cartas, escalas,
      eventos, EBD do aluno, notificações) revisadas em **360 px de largura** com prova de tela (captura antes/depois
      guardada em `docs/plano/capturas/vD.6/`): nada cortado, botão alcançável com o polegar, formulário sem zoom.
- [ ] Os mesmos testes da vD.1 rodando também em janela de celular (360×740) pro perfil **membro** — regressão de
      layout vira erro de CI, não reclamação.
- [ ] O que é só da liderança (Financeiro, Disciplina, Catálogos) fica como está até a v10.3/v10.1.3 — não é o que o
      membro usa, e redesenhar tudo agora é a FASE 10.

*Esforço:* baixo a médio. *Risco:* baixo. *Depende de você:* nada.

## 🔒 Trava de Revisão D-B — antes de encerrar a FASE D e voltar à Trava 7-A

Ponto de parada obrigatório. Audita vD.4 a vD.6 pelas 5 perguntas, e faz a varredura final da FASE D inteira. Atenção
especial à vD.4: um segundo fator mal feito tranca o Presidente fora do sistema ou, pior, deixa um atalho que o anula —
testar o caminho de recuperação de verdade, com uma conta de teste, antes de ligar pra todo mundo. Fechada esta trava,
abre-se a 🔒 Trava 7-A e a FASE 7 segue pra v7.6.
