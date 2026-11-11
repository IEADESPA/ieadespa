# FASE 10 — Experiência, Design, Desempenho e Indicadores

> Histórico e checklist desta parte do plano de versões. As referências a “seção 2.x” e “seção 4” apontam para o
> [README](../../README.md); cada versão tem seu lugar no [índice do plano](INDICE.md).

**Reescrita em 11/11/2026 com o responsável, antes de começar.** A FASE 10 é a que "coloca ordem na casa": o sistema tem as regras
certas (FASES 0 a 9), mas a tela ainda é feia, com texto quebrado, termos técnicos, dado que não conversa com o outro, menu que rola junto
com o conteúdo e lentidão em algumas abas. O teste automático (máquina) consegue usar a homologação; o objetivo agora é que **o ser humano**
goste de usar: moderno, limpo, responsivo, sem travar.

**Decisões do responsável (11/11/2026):**

- A antiga FASE 12 (indicadores, comparação entre congregações, alerta de evasão, painel do Presidente) **entra nesta fase, no fim**, depois
  da importação do cadastro de membros (indicador sem dado real não mostra nada). O criador de sites passa a ser a **FASE 11**; a nova
  **FASE 12** é a da escuta (comentários de quem usa) e do cadastro de membros próprio. A antiga FASE 11 (sistema campal) saiu do plano.
- **Sem pressa:** uns dois meses, com calma, para ficar excelente. Nada é empurrado para frente por aperto de prazo.
- O site **não é tocado** até o evento que está no ar terminar (fim de novembro): a passagem do site para o sistema fica para depois.
- Continua de pé a decisão de setembro: **não trocar de motor** (o sistema é um painel de cadastro dinâmico; HTML/CSS/JS próprio, sem
  framework). Melhora-se o que existe.

## O que é "excelente" — as metas desta fase (medidas, não adjetivos)

| Meta | Como se mede |
| --- | --- |
| Nenhum código técnico na tela (`EM_PARECER`, sublinhado, sigla de banco) | varredura automática do texto de todas as telas (equipamento `tools/csp-e2e`) |
| Nenhum texto cortado, quebrado no meio ou saindo da caixa; nenhuma rolagem para o lado | varredura automática no computador (1366 px) e no celular (360 px) |
| O menu da esquerda e o conteúdo rolam separados | prova no navegador: rolar o conteúdo não mexe no menu, e vice-versa |
| Abrir qualquer tela em até 1 s (com dados reais), gravar em até 2 s | medido na homologação com o cadastro real importado |
| **100 pessoas usando e gravando ao mesmo tempo sem travar** | teste de carga com 100 usuários de teste na homologação, antes da produção |
| Assembleia com 1.000 membros votando | teste com 1.000 votantes de teste na homologação (o "modo assembleia") |
| Zero erro no console e zero violação de segurança (CSP) | o teste de tela de sempre, completo |
| Leitura confortável (contraste, tamanho de letra, teclado) | régua WCAG AA, conferida tela por tela |
| **Aprovado pelo responsável** | galeria de telas "antes e depois" de cada módulo, aprovada por ele antes de ir ao ar |

**Como se trabalha nesta fase:** cada versão passa pela homologação; a mudança de tela é de propósito, então o teste de tela ganha uma base
nova a cada etapa (como na Trava 9-B); e, além da máquina, o responsável **vê** as telas: uma galeria de capturas (computador e celular,
antes e depois) acompanha cada módulo redesenhado, e só vai à produção o que ele aprovar.

## v10.1 — Raio-x da experiência (a linha de base)

Antes de mudar qualquer coisa, medir o que existe — para saber onde dói e provar depois que melhorou.

- [ ] Varredura automática de **todas** as telas (computador e celular): tempo para abrir, erros no console, texto cortado ou saindo da
      caixa, rolagem para o lado, termos técnicos visíveis (códigos com sublinhado, siglas de banco), artigos de norma no meio do texto.
- [ ] Lista do responsável: as telas que mais incomodam, com captura e uma frase do porquê.
- [ ] Mapa do sistema de hoje: cada aba, pílula, sub-aba e formulário, quem usa (papel) e com que frequência — a base para reorganizar
      (v10.5).
- [ ] Relatório com o ranking dos problemas (o que atrapalha mais gente primeiro), registrado aqui.

## v10.2 — Sistema de design (a "identidade" da tela)

- [ ] **Ícones de verdade** (biblioteca servida de dentro do sistema, como as outras) no lugar dos emojis.
- [ ] **Letras:** escala de 7 tamanhos (título de página, de seção, de cartão, corpo, legenda, número em destaque), com peso e contraste
      certos; números de dinheiro alinhados.
- [ ] **Cores:** a base marinho e dourado da Igreja, mais uma cor de apoio por área (Membresia, Financeiro, Ministério, Expansão...) para
      a pessoa saber "onde estou"; cores de estado (ok, atenção, erro, informação) iguais em todo o sistema.
- [ ] **Espaços** numa grade de 8 px, declarados uma vez (`:root`), no lugar dos valores soltos de hoje.
- [ ] **Tema escuro** opcional (a pessoa escolhe; o padrão segue o aparelho).
- [ ] Os estilos escritos dentro do HTML (`style="..."`) viram classes — prepara a v10.14 (CSP sem `'unsafe-inline'`).

## v10.3 — Linguagem limpa

- [ ] **Nada de código na tela:** todo estado aparece em português (`EM_PARECER` → "Aguardando o parecer"), sem sublinhado, sem sigla de
      banco, sem número de versão.
- [ ] **O fundamento vai para o "?":** o artigo do Estatuto ou do Regimento sai do meio do texto e fica num botão de ajuda ao lado do campo
      ou do ato (quem quiser saber, abre; quem não quer, lê limpo). A regra continua sendo aplicada igual.
- [ ] Mensagens de erro e de confirmação humanas: dizem o que aconteceu e o que fazer, sem jargão.
- [ ] Glossário único dos termos da Igreja (Extensão, CLI, CME, AFM...) usado pelo "?".
- [ ] Rótulos e ajudas revistos módulo a módulo, com o mesmo tom.

## v10.4 — Estrutura da tela e navegação (o menu da esquerda e o conteúdo da direita)

Pedido do responsável (11/11/2026): hoje a página inteira rola junto — quem desce pelo menu perde o conteúdo, que "fica lá pra cima".

- [ ] **Duas colunas independentes:** o menu da esquerda fica parado, com a própria rolagem; o conteúdo da direita rola sozinho. Rolar um
      não mexe no outro.
- [ ] **Menu em grupos com setinha:** cada área (ex.: Membresia, Financeiro, Ministério, Expansão, Comunicação) abre e fecha com uma seta;
      dentro dela, os submenus; o sistema lembra o que a pessoa deixou aberto; o item atual fica destacado.
- [ ] Menu recolhível (só os ícones) para ganhar espaço; no celular, o menu vira uma gaveta que abre no botão ☰.
- [ ] **Barra do topo** fixa: título da página, o caminho até ela (ex.: Expansão › Missões › Envios), a busca e o usuário.
- [ ] **Busca rápida** no menu e no sistema (atalho de teclado): digitar "missões" ou o nome de uma pessoa e ir direto.
- [ ] **Início por papel:** a primeira tela mostra o que aquela pessoa faz (Secretaria, Tesouraria, Dirigente, Pastor de Área, membro), com
      as pendências dela — não uma grade de 40 cartões iguais.

## v10.5 — Organização das informações (módulos, submódulos e páginas)

- [ ] **Reorganização dos módulos** a partir do mapa da v10.1: cada coisa no lugar onde a pessoa procura, com módulos, submódulos e páginas
      — no lugar da ordem histórica em que as telas foram feitas.
- [ ] **Página da pessoa:** tudo de um membro num lugar só (cadastro, cargos, disciplina, escada ministerial, EBD, cuidado pastoral, missões,
      contribuição conforme a permissão), com atalhos para cada módulo — resolve o "dado desconectado".
- [ ] **Página da congregação:** membros, liderança, tesouraria, EBD, PSC, Extensões, território, patrimônio — idem.
- [ ] Toda menção a uma pessoa ou congregação vira um link para a página dela, em qualquer tela.
- [ ] Telas grandes demais divididas em subpáginas; telas repetidas juntadas.

## v10.6 — Peças padrão (componentes) e celular

- [ ] **Tabela padrão:** busca, filtro, ordenar por coluna, paginação, cabeçalho fixo ao rolar, número alinhado à direita; no celular, cada
      linha vira um cartão (nunca rolagem para o lado).
- [ ] **Formulário padrão:** rótulo, campo, erro na hora embaixo do campo, ajuda "?"; obrigatório, opcional e calculado com aparência
      diferente.
- [ ] **Três estados em toda lista:** carregando (esqueleto, sem travar a tela), vazio (frase e ação sugerida) e erro (só naquele bloco).
- [ ] Cartão, faixa de indicadores, etiqueta de estado, aviso, confirmação e janela padronizados — uma peça só, reaproveitada.
- [ ] As funções que se repetem no código viram peças do núcleo (o item que a vD.2 deixou para cá).

## v10.7 — Aplicação tela por tela (a varredura)

- [ ] Passar o design, a linguagem, a navegação e as peças por **todas** as telas, módulo a módulo, na ordem do ranking da v10.1.
- [ ] Para cada módulo: a galeria antes e depois aprovada pelo responsável, a prova de tela sem navegador do módulo atualizada e a base do
      teste de tela aprovada — registrado aqui (nada fica "meio migrado" sem registro de onde parou).
- [ ] Ao fim, as metas da tabela do início conferidas de novo pela varredura da v10.1.

## 🔒 Trava de Revisão 10-A — antes de avançar para a v10.8

Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da seção 3). Audita v10.1 a v10.7 pelas 5 perguntas do checklist: o teste
de tela completo com a base nova, a varredura de texto e de celular sem nenhum achado e a aprovação do responsável módulo a módulo.

## v10.8 — Desempenho e capacidade (100 pessoas sem travar; assembleia de 1.000)

- [ ] **Medir antes:** as consultas mais pesadas (Query Store do banco), o tempo de cada tela e de cada gravação, com o cadastro real.
- [ ] Índices e consultas revistos onde pesa; uma ida ao banco no lugar de várias; leitura em lote.
- [ ] **Cache dosado** no navegador só do que quase não muda (catálogos, menus), com regra clara de quando renovar — nunca de lista que
      muda a cada clique.
- [ ] Módulos carregados **sob demanda** (o item que a vD.2 deixou para cá): quem só vê a própria escala não baixa o Financeiro.
- [ ] **Teste de carga com 100 usuários** lendo e gravando ao mesmo tempo na homologação; nenhuma gravação perdida, nenhuma trava mútua (as
      corridas do `tools/e2e-localdb` já provam a consistência; aqui se prova o tempo).
- [ ] **Modo assembleia (1.000 votando):** o voto em tempo constante (sem refazer a enquete inteira a cada voto), login sem bloquear o
      servidor, limite por matrícula e não por rede (o Wi-Fi da igreja não pode barrar gente), o banco subindo sozinho no dia da
      convocação e voltando depois — e o teste com 1.000 votantes de teste antes de qualquer assembleia real.
- [ ] O nível do banco decidido com o custo na mão (o teto de R$ 650/mês continua).

## v10.9 — Importação periódica do cadastro de membros (o sistema que a Igreja paga)

Até o cadastro próprio substituir o sistema pago (FASE 12), os dados dos membros chegam por planilha.

- [ ] Tela de importação (só o nível geral): a planilha **do jeito que o sistema pago exporta**; o mapa das colunas é configurado uma vez.
- [ ] Antes de gravar, o sistema mostra o que é **novo**, o que **mudou** (campo a campo) e o que **sumiu** da planilha; nada é apagado
      sozinho; o responsável confirma.
- [ ] A ficha inteira (não só matrícula, nome e situação como a importação da v1.8): endereço em linhas e bairro (v9.5), datas, contatos,
      congregação, cargos.
- [ ] Repetível a cada tantos dias, com histórico de cada importação na auditoria.
- [ ] **LGPD:** a planilha vai direto ao sistema (nunca por conversa ou e-mail); para montar a tela basta o cabeçalho com os nomes das
      colunas, sem nenhuma linha de pessoa.

## v10.10 — Indicadores de saúde e comparação entre congregações *(a antiga v12.1 e v12.2)*

- [ ] **Métricas em proporção, não em número solto** — para comparar uma congregação de 80 membros com uma de 900 de forma justa: % em
      classe de EBD ou grupo, % servindo como voluntário, % que contribuiu ao menos uma vez no trimestre, retenção de visitantes.
- [ ] **Indicador que avisa cedo:** crescimento de voluntários costuma vir antes do crescimento da contribuição.
- [ ] Série por trimestre, com tendência (não a foto de um mês); os 5 Sinais Vitais do PSC (v7.1) com lastro no dado real.
- [ ] **Comparação sem disputa:** o Dirigente vê a própria congregação em detalhe e as outras só como faixa (percentil); o Pastor de Área vê
      as dele pelo nome; comparação por porte, não só por território.

## v10.11 — Alerta de evasão e painel do Presidente *(a antiga v12.3 e v12.4)*

- [ ] **Alerta de quem está se afastando** pelo próprio padrão da pessoa (presença, contribuição, departamento, voluntariado), abrindo item
      no Cuidado Pastoral (v7.11, que já detecta afastamento — aqui ganha os outros sinais). Interno, restrito por papel, nunca ranking de
      membro nem uso disciplinar.
- [ ] **Painel do Presidente, da CLI e da Diretoria:** crescimento, saúde financeira, conformidade e o PDQ num lugar só.
- [ ] **Semáforo por congregação:** balancete, voluntários habilitados, AVCB, prestação de contas e relatório de departamento em dia — uma
      linha por congregação, três cores.
- [ ] Exportação para a prestação de contas anual da Assembleia (Estatuto Art. 36 §1º), com as demonstrações da v4.9.

## v10.12 — Impressão e planilhas padronizadas *(a antiga v10.5)*

- [ ] Todo relatório com versão impressa padronizada (cabeçalho da Igreja, quem emitiu, data e hora, protocolo da vB.4).
- [ ] Exportação em planilha padronizada em todos os módulos, respeitando o escopo de quem exporta e registrando a exportação (vB.8).

## 🔒 Trava de Revisão 10-B — antes de avançar para a v10.13

Audita v10.8 a v10.12 pelas 5 perguntas do checklist: o teste de carga com 100 usuários e o de 1.000 votantes registrados aqui, a
importação conferida (contagens antes e depois) e cada número dos indicadores batendo com o módulo de origem.

## v10.13 — O site vira conteúdo; o que é "vivo" vai para o sistema *(a antiga v10.6; só depois do evento que está no ar)*

Decisão do responsável (22/10/2026): as coisas "vivas" do site (Directus) — inscrições em evento, camisetas e o gestor de camisetas,
mural de oração, enquetes, Minha Conta — passam para o sistema, e o site fica sendo páginas de conteúdo. **Nenhum evento em andamento muda
de casa:** a mudança acontece com o site sem evento aberto.

- [ ] Inscrições em evento (lotes, informar pagamento, confirmação, cortesia, credenciamento por sala, crachá e certificado) no sistema,
      ligadas ao evento do Calendário (v7.2) e ao caixa do evento (v7.4).
- [ ] Camisetas (pedidos, lotes, separação, venda de balcão, limite de pedidos) no sistema.
- [ ] Mural de oração, enquetes e Minha Conta no sistema (o membro entra com o acesso que já tem).
- [ ] **Ensaio completo na homologação** e a migração dos dados do Directus com conferência (contagens antes e depois), com o plano de
      volta pronto; as páginas do site passam a ler do sistema.
- [ ] Hospedagem e transporte de eventos (ônibus, alojamento) com vagas e lista de embarque — só para evento fora da cidade.

## v10.14 — Domínio, DNS e segurança da borda *(a antiga v10.7)*

Medido em 22/10/2026: os dois sites já têm o cadeado obrigatório (HSTS com preload), a CSP e a proteção contra moldura. Faltam DNSSEC, CAA e
DMARC. Decisão do responsável (22/10/2026): **nenhum registro de DNS é mexido antes desta versão**; tudo de uma vez aqui.

- [ ] Comparar e decidir: domínio novo para o e-mail da Microsoft 365 **ou** levar `ieadespa.org.br` inteiro para o Azure DNS recriando os
      registros do e-mail (sem trocar o e-mail de ninguém).
- [ ] Inventário de todos os registros de hoje e a troca num horário calmo, com volta rápida se algo falhar; o e-mail automático do sistema
      (`DoNotReply@ieadespa.org.br`) reconfigurado.
- [ ] Azure DNS com DNSSEC e o DS no Registro.br; CAA; DMARC endurecido em todos os domínios; SPF do `ieadespa.org` com o Google.
- [ ] CSP do site sem script escrito dentro da página; CSP do **sistema** sem `style-src 'unsafe-inline'` (os estilos já viraram classes na
      v10.2 e na v10.7), conferida pela prova do navegador (`tools/csp-e2e`) com 0 violação.
- [ ] Confirmação em duas etapas em todas as contas que mandam no domínio (Registro.br, Microsoft 365, Google, Azure).

## v10.15 — Pagamento online pelo Pix (conta da Igreja no banco Cora) *(a antiga v10.8)*

Aprovado pelo Presidente (cerca de R$ 1 a 2 por Pix e R$ 50 por mês), **depois da v10.14** (com dinheiro real e o CPF de quem paga, a
segurança da borda vem antes). A Cora exige o CPF de quem paga e o valor mínimo de R$ 5.

- [ ] Cobrança Pix (QR e "copia e cola") para a inscrição ou o pedido, com baixa automática pelo aviso do banco (conferido) e conciliação
      no financeiro.
- [ ] CPF pedido só na hora do Pix, guardado protegido e apagado depois de pago (respeitando o estorno).
- [ ] Certificado e chave só no fluxo criptografado (SOPS); testes no ambiente de teste da Cora antes do real.
- [ ] Estorno e cancelamento; o "informar pagamento" continua para quem paga em mãos.

## 🔒 Trava de Revisão 10-C — antes de encerrar a FASE 10

Audita v10.13 a v10.15 pelas 5 perguntas do checklist e faz a varredura final da FASE 10 inteira: as metas da tabela do início medidas de
novo, o teste de tela completo, a bateria inteira do banco e o teste de carga.

## Números antigos desta fase (para quem achar uma citação antiga)

Os planos das fases anteriores e alguns comentários do código citam a numeração de antes de 11/11/2026. Equivalência:

| Número antigo | Agora |
| --- | --- |
| v10.1 (fundamentos do design) | v10.2 |
| v10.1.1 (navegação) | v10.4 |
| v10.1.2 (componentes) | v10.6 |
| v10.1.3 (aplicação módulo a módulo) | v10.7 |
| v10.2 (desempenho e cache) | v10.8 — a parte de infraestrutura e as 5 consultas em paralelo do login foram adiantadas em setembro (`HOMOLOGACAO.md`) |
| v10.3 (celular) | v10.6 — o essencial para o membro foi adiantado na vD.6 |
| v10.4 (modularização do front) | entregue na vD.2 (07/10/2026); o que sobrou (sob demanda, peças reaproveitáveis) está na v10.8 e na v10.6 |
| v10.5 (impressão e exportação) | v10.12 |
| v10.6 (site para o sistema) | v10.13 |
| v10.7 (domínio e DNS) | v10.14 |
| v10.8 (Pix Cora) | v10.15 |
| v12.1 e v12.2 (indicadores e comparação) | v10.10 |
| v12.3 e v12.4 (alerta de evasão e painel executivo) | v10.11 |
