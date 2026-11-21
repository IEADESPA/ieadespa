# FASE 10 em uma página (resumo para começar o dia)

Estado em 20/11/2026. O plano completo, com o porquê de cada decisão, está em
[`fase-10-experiencia-design-performance.md`](fase-10-experiencia-design-performance.md) (≈1.460 linhas): leia só a
seção que o trabalho do dia pede. Este resumo é atualizado junto com o plano a cada marco.

Como ler: **Feito** = em produção ou aprovado por ele. **Homologação** = no ar só no preview do PR #21 (ramo `homolog`,
que nunca é mesclado na `main`). **Falta** = ainda não começou.

## Como a FASE 10 trabalha (decisões que valem para tudo)

- **Um módulo por vez, numa ordem fixa** (17/11): sem perguntar "qual o próximo". Cada módulo passa por:
  1. **desenho** em rodadas na página de propostas (`design/propostas`): no mínimo 3 opções por tela, os níveis local,
     área e Geral (e o membro), notebook e celular (com a barra do telefone), claro e escuro;
  2. **construção** na homologação, **exatamente** como foi aprovado (par "aprovado × construído" de toda tela);
  3. **produção** só com o OK dele, depois de ele ver.
- **Nada vai à produção sem ele ver e aprovar** (homologação ou artefato). Os documentos seguem com push na hora.
- **As telas novas em Svelte 5 + TypeScript** (19/11, em `front/`); o servidor (`api/`) e o banco ficam.
- **A realidade da Igreja vale mais que o Regimento** (o Regimento não foi aprovado): o desenho segue o que se vive hoje.
- **Desenho em paralelo à construção:** um agente desenha a próxima rodada enquanto outro constrói; só o de
  construção mexe no Git do código.

**A ordem dos módulos:** 1 Pessoas e Membresia → 2 Financeiro → 3 Estrutura e Territórios → 4 Departamentos e
Relatórios → 5 EBD → 6 Calendário Oficial → 7 Escalas e Habilitação de Voluntários → 8 Eventos e Congressos → 9 Vida
Eclesiástica → 10 Órgãos Centrais e Regionais → 11 Disciplina e Ética → 12 Assistência Social → 13 Saúde
Congregacional e cuidado pastoral → 14 Canais e Comunicação → 15 Crise e Segurança → 16 Formação e Certificação → 17
Setores Técnicos → 18 Entidades Vinculadas → 19 Expansão e Missões → 20 Conformidade e Auditoria → 21 Administração
de Acesso → 22 Conquistas.

## Módulo 1: Pessoas e Membresia (Membros)

Plano: [v10.1a a v10.1e](fase-10-experiencia-design-performance.md#v101a-a-v101e--gestão-de-membros-o-primeiro-módulo-trazida-da-fase-11-em-13112026)
e [o que falta para a produção](fase-10-experiencia-design-performance.md#membros-em-svelte-aprovado-no-visual-por-ele-19112026-e-o-que-falta-para-a-produção).

- **Feito:** o desenho (fechado em 14/11). Refeito do zero em Svelte e **aprovado no visual** por ele em 19/11 ("ficou
  bom, bem rápido").
- **Homologação:** a casca nova (igual ao desenho, com as fontes e os efeitos), Membros completo, as Carteirinhas e as
  sobras 1 a 5 (inclusive o "Quero me cadastrar" do site). Ramo `v10-membros-svelte`.
- **Falta, nesta ordem:**
  1. o seletor de congregação final (a área primeiro, depois a congregação, com a procura), como peça comum;
  2. os Desligamentos (o assistente: o que aconteceu, a data e o documento, e o que o sistema faz sozinho);
  3. o **importador** do sistema pago (passo 9);
  4. a **ida à produção**: as migrações 174 a 179, a permissão ALTER para juntar fichas (não provada no Azure), a
     importação real e a troca do sistema pago.
- **Antes da produção:** as 4 pendências das revisões do "Quero me cadastrar" (2 de segurança, 2 de consistência).
- **Decisões que valem:** CPF inteiro só para a Secretaria Geral e a própria pessoa (mascarado no resto); CPF repetido
  bloqueia e manda confirmar; um departamento por pessoa, por faixa etária; o membro muda sozinho o contato, o endereço
  e o que está vazio, e o resto vira sugestão; nada de e-mail com a matrícula depois do cadastro pelo site (revelaria
  quem não tem ficha).
- **Esperando ele:** carteirinha de obreiro só a Secretaria Geral imprime; o QR de quem saiu mostra só o nome; o teste
  da impressora de PVC; o OK final de Membros na homologação.
- **Rodada de desenho de Membros (aprovada em 19/11),** depois do Financeiro: a família como unidade, as listas
  inteligentes e o assistente de movimentação (desligamento, falecimento, readmissão).

## Módulo 2: Financeiro

Plano: [o desenho aprovado e o que a Igreja vive hoje](fase-10-experiencia-design-performance.md#financeiro-módulo-2-o-desenho-aprovado-e-o-que-a-igreja-vive-hoje),
[a realidade do dinheiro](fase-10-experiencia-design-performance.md#a-realidade-do-dinheiro-que-vale-mais-que-o-regimento-ele-19112026)
e [a rodada 20](fase-10-experiencia-design-performance.md#rodada-20-o-que-ele-aprovou-e-o-que-muda-20112026).

- **Desenho:** a rodada 19 foi reprovada inteira (trouxe do Regimento o que não existe). A 20 foi respondida. A **21
  está publicada** (20/11) na página leve, com os acertos da 20.
- **Aprovados:** o caminho do repasse, o seletor de congregação, a folha do recebimento, os relatórios ("Monte o seu
  gráfico"), o lançamento de dízimos, o dízimo digital (a lista própria em 3 passos), o contador ("o ano numa linha") e
  o caixa único em 4 passos.
- **Decisões que valem (a realidade do dinheiro):**
  - NÃO existe no Financeiro: culto, malote, contagem no domingo à noite, cofre, duas pessoas contando, depósito
    semanal, "oferta da ceia". As ofertas são a **de culto** (genérica) e a **voluntária**;
  - a espécie vira Pix logo; o caixa único separa espécie e Pix e termina o dia com a espécie em zero; **só a
    Tesouraria Geral tem caixa** (a congregação, quando tiver CNPJ de filial e conta própria);
  - o repasse é mensal ou parcial, e todo mês tem de vir; não existe "atrasado" no meio do mês;
  - o rateio divide só os **60% da Geral**; os 40% da congregação já saíram no repasse; o retido sai dos 40% depois
    das despesas; o dízimo do pastor sai dos 30% do Presidente;
  - **departamentos e secretarias ficam fora do 60/40** (Missões é secretaria), com centenas de centros de custo;
  - o dízimo digital: a congregação liga primeiro; a Geral só **fecha** o repasse e o mês depois de ligar cada um a
    um recibo do bloco ou excluí-lo com motivo (e o membro é avisado);
  - a congregação e a área veem para onde foram os 60% delas, por centro de custo;
  - os comprovantes de Pix vão pelo sistema (acaba o telefone); do dia 1 ao 5, o lançamento tem o mês de referência;
  - o mural: 50 nomes por folha, sem importar o bloco, e validação (QR) em cada folha;
  - o contador é **anual** (o formato que a Receita recebe); trabalho voluntário não entra.
- **Esperando ele:** as escolhas da rodada 21 (página leve, coleção `escolhas`) e as 5 dúvidas da 20 (a espécie da
  congregação vai para a conta dela ou para a geral; o retido fica em dinheiro ou é depositado; o Pix dos membros cai
  direto na geral; receitas acima de R$ 4,8 milhões e a ECD; mostrar "atrasada").
- **Próximo:** com a 21 aprovada, a construção do núcleo em Svelte: entradas, repasse, caixa, recibo, rateio, tesouro
  e mural.

## Módulos 3 a 22

Falta: o desenho começa depois do Financeiro, um por vez, na ordem acima.

## Fora dos módulos

- **Logo depois do módulo em curso:** o celular das telas principais (menu em abas no alto, nada preso embaixo) e o
  Meu Perfil (espera as observações dele).
- **Velocidade:** as correções 1 a 3 estão em produção; as 4 a 7 esperam a ordem dele.
- **Conciliação bancária** (casar pelo valor com sinal): só na homologação, esperando o "pode corrigir".
- **Varredura de segurança e de defeitos:**
  [o plano](fase-10-experiencia-design-performance.md#varredura-de-segurança-e-de-defeitos-do-que-já-existe-plano-de-18112026)
  roda em pedaços de 30 minutos, com vários agentes; começa só quando ele disser.
- **As versões transversais** (v10.2 a v10.16): a entrada sem código por e-mail a cada vez, o sistema de design, a
  linguagem limpa, a navegação, as peças padrão, o desempenho (100 pessoas sem travar e a assembleia de 1.000), a
  importação periódica, os indicadores, a impressão, o site como conteúdo (depois do evento de novembro), o domínio e a
  borda, e o Pix pela Cora. Entram nos módulos à medida que cada tela é refeita; as Travas de Revisão 10-A, 10-B e 10-C
  fecham a fase.
