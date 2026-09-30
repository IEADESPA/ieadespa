# Chamada EBD

Sistema de gestão e chamada da Escola Bíblica Dominical (EBD), com suporte a
múltiplas congregações organizadas em uma hierarquia de **Campo > Área >
Congregação > Turma > Aluno**.

**Princípio central do sistema: todo mundo é aluno primeiro.** Não existe
conta "de fora" — quem usa o sistema (professor, secretário, superintendente,
coordenador, admin) é, antes de tudo, uma matrícula de aluno. Papéis
administrativos são concedidos por cima dessa matrícula, e uma pessoa pode
acumular vários ao mesmo tempo (ex: Superintendente de uma congregação **e**
Coordenador de outra área), alternando entre eles por um seletor de painel —
sem nunca deixar de ter acesso ao próprio "Meu Painel" como aluno.

Rodando 100% localmente hoje (SQLite), pronto para migrar para Azure
(Azure Database for PostgreSQL + Azure App Service) quando você decidir subir
para produção — veja [Deploy no Azure](#deploy-no-azure).

## Login por matrícula

O login **não usa e-mail** — usa a **matrícula** que viria do sistema de
gestão de membros da igreja (aqui simulada com números aleatórios no seed).
Um aluno comum, sem nenhum papel administrativo, **entra só com a
matrícula, sem senha** — é o suficiente para ver a própria presença e
responder atividades. Senha só é exigida a partir do momento em que a pessoa
recebe o primeiro papel acima de aluno (Professor, Secretário,
Superintendente, Coordenador ou Admin).

## Funcionalidades

### Hierarquia e cadastros
Campo → Área → Congregação → Turma → Aluno, com CRUD completo em cada nível.
As telas de Chamada e Turmas usam uma **visão agrupada por Área →
Congregação** (com busca) quando o escopo de quem está olhando abrange mais
de uma congregação — evita a lista achatada de dezenas de turmas que
"quebrava" a organização para Coordenadores e Admin.

### Papéis administrativos e concessão de acesso
Em **Papéis e acesso**, quem já tem permissão de gestão escolhe um aluno já
matriculado (por nome ou matrícula) e concede um papel a mais — nunca cria
uma conta nova "do zero". Para papéis de nível Congregação (Superintendente,
Secretário, Professor, Tesoureiro), a congregação é **sempre a mesma em que a
pessoa já está matriculada** — não existe escolha manual aí, exatamente para
não precisar recadastrar ninguém em outro lugar. Quem concede só pode conceder
papéis **menos sênior que o próprio** (regra genérica por `ordem`, não uma
lista fixa por nome) — assim Superintendentes podem conceder Secretário/
Professor/Tesoureiro na própria congregação sem depender do Admin geral.

### Papéis 100% customizáveis (Admin → Permissões)
Os 7 papéis originais **não são mais um enum fixo no código** — são registros
na tabela `Papel`, e o Admin pode criar quantos papéis quiser pela interface
(ex: "Vice-Superintendente"), escolhendo:
- **Nível** (Global / Campo / Área / Congregação) — dita em qual camada da
  hierarquia o papel enxerga e qual é o escopo (`campoId`/`areaId`/
  `congregacaoId`) que ele recebe ao ser concedido.
- **Ordem** — o número que decide a hierarquia de concessão (quem pode
  conceder o quê) e que já funciona automaticamente para o papel novo, sem
  precisar mexer em código.
- **Escopo amplo ou restrito** (só papéis de nível Congregação) — amplo
  gerencia a congregação inteira (como Superintendente/Secretário/
  Tesoureiro); restrito só enxerga o que está diretamente vinculado à pessoa
  (como Professor, que só vê as turmas em que foi vinculado).

Um papel novo já aparece na matriz de permissões, no seletor de "Papéis e
acesso" e no seletor de painel — nenhuma outra tela precisa ser tocada.

### Permissões dinâmicas (Admin → Permissões)
Cada funcionalidade do sistema tem uma **matriz papel × funcionalidade**
editável pelo Admin em tempo real, mais **exceções por aluno individual**
(liberar ou revogar algo pontual para UMA pessoa, além do papel dela).

### Lições — é isso que "libera" a chamada
O superintendente ou secretário **abre a lição** do trimestre para a
congregação (número, trimestre, ano, título) — abrir uma nova fecha
automaticamente a anterior. **A chamada só pode ser lançada enquanto houver
uma lição aberta** para aquela congregação — sem isso, a tela de chamada
mostra um aviso claro com link direto para abrir a lição (se quem está vendo
tiver permissão) em vez de deixar lançar algo "solto". É essa a resposta pra
"quem libera a chamada e onde": é em **/licoes**, por quem tiver a
funcionalidade `licoes.gerenciar` (Superintendente, Secretário, Coordenadores
e Admin, por padrão).

### Chamada digital
Lista de turmas com indicador de quais já tiveram a chamada do domingo
lançada **e** se a congregação tem lição aberta, busca de aluno, avatares,
alternância estilo toggle para presença/bíblia/revista, barra de progresso
fixa com contagem de presentes em tempo real, visitantes, oferta e
pontualidade.

### Atividades — 5 tipos de exercício
Professores criam atividades por turma com **múltipla escolha, Verdadeiro/
Falso, Ordenar (o aluno reorganiza itens embaralhados), Completar (resposta
digitada) e Correspondência** (o aluno liga cada item da esquerda ao par
certo da direita, que aparece embaralhada) — não só formulário de múltipla
escolha. Alunos respondem pelo **próprio painel** (que também é onde o
professor, sendo aluno da própria turma, responde as suas).

### Gamificação e conquistas configuráveis
Além de pontos por presença/bíblia/revista/atividades, o aluno desbloqueia
**conquistas (badges)** — algumas visíveis desde o início como meta (ex:
"Trimestre Perfeito"), outras **ocultas** até serem descobertas (a surpresa é
parte do incentivo), e outras que só destravam depois de já ter outras
conquistas específicas — uma progressão em cadeia, não um catálogo plano. O
catálogo inteiro (nome, ícone, regra, parâmetro, se é oculta, pré-requisitos)
é configurável pelo Admin em **/conquistas**, sem precisar editar código — a
tela permite criar conquistas novas combinando um dos 10 tipos de regra que o
sistema já sabe avaliar (ex: "sequência de presenças", "nº de atividades
gabaritadas", "trimestres perfeitos seguidos").

### Certificados
Qualquer papel com a funcionalidade `certificados.emitir` (Professor da
própria turma, Superintendente/Secretário da congregação, Coordenadores,
Admin) emite um certificado para um aluno em **/certificados** — fica
disponível numa página imprimível (`/certificados/[id]`) e também aparece no
painel do próprio aluno.

### Transferência de alunos
Em **/alunos**, é possível transferir um aluno para outra turma (inclusive de
outra congregação) — exige que quem transfere tenha acesso tanto à turma de
origem quanto à de destino.

### Pontuação unificada por aluno
Presença + bíblia + revista (por chamada) somadas aos pontos de atividades —
uma régua só, usada tanto no placar pessoal do aluno quanto no **ranking
geral de alunos** dos relatórios. Os pesos de cada componente são
configuráveis por campo (`ScoreConfig`).

### Relatórios
Filtro por congregação e período, gráfico comparativo entre congregações,
ranking de turmas e ranking geral de alunos.

### Financeiro
Ofertas coletadas na chamada somadas a **lançamentos manuais de entrada e
saída** (dízimos, doações, contas, manutenção...) por congregação, com
totais e saldo do período. Papel dedicado **Tesoureiro(a)**, além de
Superintendente/Coordenadores/Admin.

### Revistas — catálogo, pedidos e consolidado para a publicadora
Catálogo com os **três preços**: o que a casa publicadora cobra (fornecedor),
o que é repassado à congregação, e o que o aluno paga (a congregação pode
igualar ao preço-congregação se não quiser lucro). Cada congregação faz
pedidos por trimestre com item por turma e quantidade. Quem consolida
(Coordenador de Campo/Admin) tem:
- **Consolidado por revista** — soma a quantidade de cada título pedida por
  todas as congregações do escopo, pronto para virar o pedido único enviado
  à editora (o mesmo formato do formulário trimestral que as editoras já
  usam).
- **Fechar a janela de pedidos** do trimestre — depois de fechada, ninguém
  adiciona mais item, só resta consolidar e enviar.
- **Aprovação de pagamento em duas etapas** — o superintendente/secretário
  anota que pagou (fica "aguardando aprovação"), e só conta para o saldo do
  pedido depois que um coordenador confirma. Evita fechar um pedido com um
  lançamento errado.

### Painel do aluno
Presença histórica, atividades pendentes/concluídas com nota, ranking da
turma e conquistas desbloqueadas — sempre disponível para qualquer pessoa
logada, independente de ter ou não um papel administrativo.

### Identidade visual
Paleta dourado (primária) + azul-marinho (secundária) + branco (terciária) —
tokens `navy-*` / `gold-*` em `src/app/globals.css`.

## Stack técnica

- **Next.js 16** (App Router, Server Actions) + **React 19** + **TypeScript**
- **Tailwind CSS 4** para estilo, **Recharts** para os gráficos dos relatórios
- **Prisma 7** como ORM, com **SQLite local** (via adaptador `@prisma/adapter-libsql`,
  que não exige compilação nativa — ideal para Windows sem Visual Studio Build Tools)
- **NextAuth (Auth.js) v5** para login por matrícula/senha com sessão JWT
- **Zod** para validação de formulários/Server Actions · **bcryptjs** para hash de senha

## Rodando localmente

```powershell
npm install          # instala dependências (já feito neste setup)
npm run db:migrate   # aplica as migrações no banco SQLite local
npm run db:seed      # ZERA o banco e gera uma massa de dados de demonstração
npm run dev           # inicia o servidor em http://localhost:3000
```

⚠️ `npm run db:seed` **apaga tudo** e recria do zero, de propósito, para
sempre gerar uma base de demonstração consistente. Se o `npm run dev` já
estiver rodando quando você rodar o seed, **reinicie-o depois** — uma conexão
antiga pode não enxergar os dados novos direito.

### Escala dos dados de demonstração

Cada seed gera aleatoriamente (nomes e números variam a cada execução):

- 3 campos, ~6 áreas, ~18 congregações, ~60 turmas, ~500 alunos
- 8 semanas de histórico de chamada por turma, com lições abertas por congregação
- ~15 atividades (quizzes) misturando os 5 tipos de pergunta, com respostas
  simuladas (ranking e conquistas já nascem parcialmente populados)
- Catálogo de revistas + pedidos em ~10 congregações, alternando cenários:
  pago e com janela fechada, parcial com pagamento pendente de aprovação, só
  aguardando aprovação, e sem nenhum pagamento ainda
- Lançamentos financeiros de exemplo (entradas e saídas) em ~12 congregações
- ~125 pessoas com algum papel administrativo — incluindo Tesoureiro(a) —
  concedido em cima de matrículas de aluno, nunca uma conta à parte

### Contas de destaque (login por MATRÍCULA)

| Papel | Matrícula | Senha |
|---|---|---|
| Administrador Geral | `1` | `123456` |
| **Multi-papel** — Coordenador de Área + Superintendente (troque de painel!) | `2` | `123456` |
| Professor(a) (matrícula sempre igual) | `3` | `123456` |
| Aluno puro — sem papel administrativo | `4` | *(nenhuma — só a matrícula)* |

Todas as demais pessoas geradas (coordenadores, superintendentes,
secretários, professores, alunos comuns) têm **matrícula aleatória de 6
dígitos** — a lista completa aparece no terminal ao final do
`npm run db:seed`, e também pode ser consultada em **/alunos** ou
**/usuarios** depois de entrar como admin.

```powershell
npm run db:studio    # abre o Prisma Studio para inspecionar o banco visualmente
```

## Estrutura do projeto

```
prisma/
  schema.prisma          # modelo de dados completo
  seed.ts                  # gerador de dados de demonstração em massa
src/
  lib/
    auth.ts                  # NextAuth — login por matrícula (Node.js)
    auth.config.ts             # configuração "edge-safe" usada pelo proxy/middleware
    prisma.ts                  # cliente Prisma (singleton)
    rbac.ts                     # sessão, painéis administrativos, escopo hierárquico (por nível/ordem)
    papeis.ts                    # regra genérica de concessão de papéis (por ordem)
    papeis-sistema.ts              # constantes dos 7 papéis nativos (chave, nível, ordem)
    permissoes.ts                    # resolução da matriz de permissões dinâmica
    permissoes-catalogo.ts             # catálogo de funcionalidades + matriz padrão (seed)
    score.ts                             # pontuação das chamadas (ranking de turmas)
    pontuacaoAluno.ts                      # pontuação unificada por aluno
    conquistas.ts                           # motor de avaliação de conquistas (lê catálogo do banco)
    conquistas-catalogo.ts                    # catálogo nativo de conquistas (seed)
  components/
    painel-switcher.tsx            # seletor de painel administrativo ativo
  proxy.ts                       # protege rotas exigindo login
  app/
    login/                          # tela de login (matrícula + senha opcional)
    logout/route.ts                  # Route Handler dedicado para encerrar sessão
    painel-actions.ts                 # Server Action que troca o painel ativo
    (app)/                              # área autenticada (layout com menu lateral agrupado)
      dashboard/  relatorios/
      campos/  areas/  congregacoes/  turmas/  alunos/         # alunos/ inclui transferência de turma
      usuarios/                            # conceder papéis a alunos já matriculados
      permissoes/                           # matriz de permissões + criação de papéis customizados (Admin)
      conquistas/                            # catálogo de conquistas configurável (Admin)
      certificados/[id]/                      # emissão + página imprimível de certificado
      licoes/                                  # abrir/fechar lição por congregação
      chamada/[turmaId]/                        # lançamento de chamada (exige lição aberta)
      atividades/[atividadeId]/                  # criação/gestão de quizzes — 5 tipos de pergunta
      revistas/                                   # catálogo + pedidos + consolidado + aprovação
      financeiro/                                  # ofertas + lançamentos manuais por congregação
      meu-painel/                                   # painel do aluno (sempre disponível)
        atividades/[atividadeId]/                    # responder quiz
        presenca/  ranking/
```

## Deploy no Azure

O projeto foi desenhado para migrar sem reescrever nada, apenas trocando o
adaptador do banco de dados:

1. **Banco de dados**: crie um **Azure Database for PostgreSQL – Flexible
   Server**. Troque o adaptador Prisma de `@prisma/adapter-libsql` para
   `@prisma/adapter-pg` (`npm install @prisma/adapter-pg pg`) e o `provider`
   do `datasource` em `prisma/schema.prisma` de `sqlite` para `postgresql`.
   Rode `npx prisma migrate deploy` apontando para a `DATABASE_URL` do Azure.
2. **Hospedagem**: **Azure App Service** (Node 20, `npm run build` /
   `npm run start`) ou **Azure Container Apps** com um `Dockerfile` baseado
   em `node:20-alpine`.
3. **Variáveis de ambiente**: `DATABASE_URL` e um novo `AUTH_SECRET` de
   produção (`npx auth secret`) — nunca reutilize o de desenvolvimento.
4. **Integração com o sistema de membros**: hoje a matrícula é só um campo de
   texto único por aluno. Se a igreja tiver uma API/planilha do sistema de
   gestão de membros, o próximo passo natural é importar/sincronizar as
   matrículas reais em vez do gerador aleatório do seed.
5. **Seed em produção**: rode `npm run db:seed` **apenas** em ambiente de
   demonstração — ele apaga todos os dados antes de recriar. Em produção,
   crie a primeira conta Admin manualmente.

## Roadmap (não incluído nesta versão)

- **Drag-and-drop de verdade** para a pergunta tipo Ordenar — hoje o aluno
  reordena escolhendo a posição de cada item num `<select>` (funciona bem em
  mobile e sem JS extra), não arrastando os itens fisicamente.
- **Upload de áudio/imagem** como formato de pergunta/resposta — não incluído
  nesta versão; os 5 tipos hoje são todos baseados em texto (múltipla
  escolha, Verdadeiro/Falso, Ordenar, Completar, Correspondência).
- Aplicativo mobile nativo — decisão consciente de **não construir**: manter
  só o app web responsivo evita o custo de manutenção de publicar/atualizar
  em loja de aplicativos.
- Exceções de permissão com expiração automática (hoje uma exceção por aluno
  vale até ser removida manualmente).
- Paginação nas listagens muito grandes (hoje /alunos e /usuarios renderizam
  a lista inteira do escopo de uma vez).

## Fontes consultadas

- [Central EBD](https://ebdcentral.com.br/)
- [eScriptura EBD](https://escripturaebd.com.br/)
- [Sistema EBD](https://sistemaebd.com.br/)
- [SigieEBD](https://ebd.dfsistemasweb.com/)
- [EBD Interativa](https://www.ebd-interativa.com/)
- [Portal EBD](https://portalebd.com/) — ranking e estatísticas de EBD
- [Badge Gamification: Why Most Achievement Badges Fail](https://yukaichou.com/gamification-study/badge-gamification-guide/) — conquistas ocultas, encadeadas, e o risco de "inflação de emblemas"
- [Achievements Feature Gamification: 8 Real Examples](https://trophy.so/blog/achievements-feature-gamification-examples) — padrão de conquistas em cadeia (ex: Duolingo)
