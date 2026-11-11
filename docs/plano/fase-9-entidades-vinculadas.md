# FASE 9 — Entidades Vinculadas e Expansão

> Histórico e checklist desta parte do plano de versões. As referências a “seção 2.x” e “seção 4” apontam para o
> [README](../../README.md); cada versão tem seu lugar no [índice do plano](INDICE.md).

## v9.1 — Entidades vinculadas

- [x] Cadastro de entidades (hospitais, escolas, ONGs com CNPJ próprio — Art. 64-68).
- [x] Vínculo com a IEADESPA e controle de participação.

**Expandido pela varredura normativa (7ª rodada):**

- [x] **Intervenção com prazo fatal de ratificação** (Art. 47-A §§1º-2º): a
      intervenção em entidade vinculada precisa ser **ratificada pela CLI em 15
      dias, sob pena de perder a eficácia**. Contador com caducidade automática —
      é o tipo de prazo que, perdido, derruba o ato inteiro.
- [x] **Requisito legal de formação do gestor** (Art. 153): pedagogia para
      escolas, gestão hospitalar/medicina para hospitais — validado no cadastro
      da entidade, não descoberto numa fiscalização.
- [x] Prestação de contas da entidade vinculada à CLI, com periodicidade e alerta
      de atraso (mesmo mecanismo da v5.4).

### Desenho da v9.1 (contrato, 03/11/2026)

Base legal: Estatuto Art. 64 a 68 (Capítulo XIII: natureza, "cordão umbilical", blindagem, prestação de contas e dissolução), Art. 59 (autonomia econômica),
Art. 61, II (auditoria anual pelos órgãos da própria entidade), Art. 18, VII, "b", e Art. 19 (criação e extinção de entidade vinculada: a CLI delibera com efeito
imediato e a Assembleia Geral ratifica na reunião seguinte), Art. 33, IV (fiscalização e intervenção são do Pastor Presidente) e Art. 76 §2º (nepotismo em cargo
remunerado); Regimento Art. 47-A (intervenção) e Art. 153 (formação do gestor).

**1. O cadastro (o "anexo próprio aprovado pela CLI", Art. 64, parágrafo único).** Cada entidade tem razão social, nome fantasia, **CNPJ próprio de matriz
(0001)** — com os dígitos conferidos, inclusive no CNPJ alfanumérico que a Receita emite desde julho de 2026 —, o **tipo** e a finalidade. O tipo vem de um
catálogo do nível geral (Hospital, Escola, ONG/Associação de assistência social, Outra), cada um com a **natureza** (saúde, educação, assistência social, outra) e a
lista das **formações aceitas para o gestor** (Art. 153: Hospital = Gestão hospitalar ou Medicina; Escola = Pedagogia). A entidade nasce **proposta**; vira
**ativa** quando se registra a reunião da CLI (já realizada e encerrada) que aprovou o vínculo, ou fica **não aprovada** com o motivo. A aprovação da CLI vale na
hora (Art. 19), mas entra na lista **"aguardando a Assembleia"** até se registrar a Assembleia Geral que a ratificou; se a Assembleia não ratificar, o vínculo é
**desfeito**. Documentos (estatuto da entidade, cartão do CNPJ, ata) pelo anexo de sempre.

**2. Vínculo e controle de participação (Art. 65 §1º, Art. 76 §2º, Art. 153).** O controle da IEADESPA sobre a entidade é **quem ela põe na direção**: cada
dirigente tem a função (Diretor-Presidente, Vice, Administrativo, Financeiro, Secretário, **Gestor técnico**, Conselheiro fiscal, outra), é um membro (pela
matrícula) ou um profissional de fora (o Art. 153 permite; guarda-se só o nome, a formação e o registro profissional), e passa por **indicação do Pastor
Presidente** (o ato e a data) e **homologação da CLI** (a reunião), ou é recusado. Mandato com data opcional (vencido aparece, não some). Regras:

- **Gestor técnico com a formação exigida pelo tipo** (Art. 153): a formação precisa ser uma das aceitas — conferido na indicação e de novo na homologação. Um só
  gestor técnico e um só Diretor-Presidente em aberto por entidade. A entidade ativa sem gestor homologado com a formação exigida aparece nas pendências.
- **Nepotismo** (Art. 76 §2º): cargo **remunerado** não vai a parente até o 2º grau de quem está na Diretoria Executiva (o mesmo cálculo de parentesco do
  Conselho Fiscal). Para o profissional de fora, que não está na árvore de famílias, exige-se a **declaração** de que não é parente.
- Ninguém indica nem homologa a si mesmo.

**3. Intervenção (Estatuto Art. 65 §§2º e 3º; Regimento Art. 47-A).** Um processo por entidade de cada vez, em etapas:

- **Apuração** (Art. 47-A §1º): aberta com o motivo — gestão temerária, desvio de finalidade, inadimplência fiscal ou risco à imagem da Igreja — e os fatos.
  Sem apuração aberta não há intervenção. Pode ser arquivada com o motivo.
- **Notificação** do gestor por escrito e **5 dias** para ele se manifestar (Art. 65 §3º); a manifestação fica registrada.
- **Decretação**, **só pelo Pastor Presidente em exercício** (a cadeira de Presidente na Diretoria Executiva): exige a fundamentação escrita (os motivos técnicos,
  disciplinares ou de gestão) e os 5 dias corridos desde a notificação — salvo **urgência** com risco iminente ao patrimônio ou à continuidade dos serviços,
  justificada. Nomeia o interventor e diz se afasta a diretoria. A data é a do dia (não se decreta com data passada).
- **Ratificação pela CLI em 15 dias, sob pena de perder a eficácia** (Art. 47-A §2º): o prazo fatal aparece com a contagem regressiva; a CLI ratifica ou não
  ratifica numa reunião **realizada dentro do prazo**. Passado o 15º dia sem ratificação, a intervenção **caduca sozinha** (o sistema a marca como "perdeu a
  eficácia", registra na auditoria e avisa) e não se ratifica mais — só uma nova decretação, sobre a mesma apuração. Quem decretou não registra a ratificação.
- A diretoria afastada fica **afastada enquanto a intervenção vale**; com a ratificação, os mandatos são **encerrados por destituição**; se caducar ou não for
  ratificada, nada muda neles. Os diretores destituídos têm direito a defesa no Conselho de Ética (Art. 47-A §2º): registra-se a data e a referência.
- **Encerramento** da intervenção (a gestão devolvida), pelo Pastor Presidente, com o motivo.
- Avisos: a decretação avisa na hora quem administra as entidades; enquanto corre o prazo, um aviso **por dia** com quantos dias faltam; a caducidade avisa.

**4. Prestação de contas (Art. 67; Art. 61, II; Art. 66 §3º).** Cada entidade tem a **periodicidade** (anual — o mínimo do Art. 67 —, semestral ou trimestral) e o
**prazo de entrega** em dias depois do fim do período (padrão em Prazos: 120 dias, ou seja, o relatório anual até 30 de abril). Os períodos são **calculados**
a partir da data do vínculo, sem cadastro prévio. Para cada período registra-se a entrega (relatório de atividades e balanço auditado pelo órgão de fiscalização
da própria entidade), a **apreciação da CLI** (aprovada, aprovada com ressalvas ou reprovada, na reunião) e — no período que fecha o ano — a **verificação anual do
Conselho Fiscal** de que não há confusão patrimonial (Art. 66 §3º). Período vencido sem entrega = **atrasada**, calculado na leitura (o mesmo mecanismo da
v5.4: nada a fechar à mão), com aviso mensal. A periodicidade fica fixa depois da primeira prestação registrada.

**5. Extinção (Art. 68; Art. 18, VII, "b").** Registrada com a reunião da CLI e o **destino do patrimônio conforme a natureza**: saúde → outra instituição de
saúde sem fins lucrativos ou a Matriz com afetação exclusiva a fins assistenciais (só se a IEADESPA mantiver atividade assistencial do mesmo tipo); educação →
instituição de ensino congênere; as demais → entidade congênere sem fins econômicos. Os **bens da Matriz cedidos em comodato** são listados e voltam à
IEADESPA (inciso III). Os mandatos se encerram. Também espera a ratificação da Assembleia; se ela não ratificar, a entidade volta a ativa.

**6. Quem faz o quê.** Permissão nova **`entidades_vinculadas`**, só no nível geral (vem para o Presidente e o Secretário Geral; o Conselho Fiscal recebe em
Permissões): cadastro, tipos, dirigentes, apuração, ratificação, prestação de contas, extinção. Decretar e encerrar a intervenção: só o Pastor Presidente em
exercício. Tela: card novo **"Entidades Vinculadas"** no portal, com Painel (pendências: prazo de ratificação correndo, prestações atrasadas, aguardando CLI ou
Assembleia, sem gestor habilitado), Entidades (lista e ficha) e Tipos. Meus Dados mostra à pessoa as funções que ela ocupa em entidade vinculada; ROPA e
política de retenção atualizadas (os atos de nomeação, intervenção e prestação são prova institucional e ficam).

### Como ficou a v9.1 (entregue em 04/11/2026)

**Em produção desde 04/11/2026** (merge `8f5063a`; para desfazer: `git revert -m 1 8f5063a`). Migração **165** (`EntidadeTipos`, `EntidadeTipoFormacoes`,
`EntidadesVinculadas`, `EntidadeDirigentes`, `EntidadeIntervencoes`, `EntidadePrestacoes`; permissão `entidades_vinculadas`; o prazo `ENTIDADE_PRESTACAO_PRAZO_DIAS`; cinco
avisos; a política de retenção). Regra pura em `api/shared/entidadesVinculadas.js`, banco em `api/shared/entidadesVinculadasDb.js`, rota `/api/entidades-vinculadas/<ação>`
(`GestaoEntidadesVinculadas`). Tela: card **Entidades Vinculadas** no portal (Painel, Entidades, Tipos), cartão em Meus Dados. Casca do service worker **v51**.

**O que mudou depois das duas revisões independentes** (servidor: 2 altos, 5 médios, 7 baixos; tela: 4 médios, 10 baixos — tratados):

- **O 5º dia é do gestor** (Art. 65 §3º): notificado no dia 1º, ele se manifesta até o dia 6 inteiro; a decretação sem urgência só a partir do dia 7 (antes saía
  no dia 6). Vale na tela, no servidor e no banco.
- **A recusa da CLI não se contorna:** a nova apuração depois de uma intervenção recusada ou caducada não aproveita a notificação antiga (o gestor é notificado de
  novo e tem outros 5 dias), e a urgência não vale mais naquela entidade.
- **A correção da caducidade** (a CLI ratificou a tempo, mas o registro chegou depois do 15º dia) só cabe até **10 dias** depois do prazo, exige a referência da ata e
  avisa a todos.
- **Extinção e vínculo desfeito encerram** a intervenção em vigor e arquivam a apuração: nada fica valendo nem avisando sobre entidade que não é mais vinculada.
- **Art. 19 §1º:** a extinção que a Assembleia não ratificou fica guardada e só se renova com nova autorização dela; o CNPJ de um vínculo desfeito pela Assembleia só
  volta com a autorização dela; o CNPJ de uma proposta que a CLI recusou fica livre para nova proposta. A recusa da CLI exige a reunião.
- **A destituição** que a ratificação produz vai à Assembleia (Art. 18, VII, "c"); o Painel avisa quando uma Assembleia já passou sem o registro do que ela decidiu.
- **Periodicidade e prazo** da prestação de contas só mudam antes de terminar o primeiro período (depois, mudariam para trás o que está em dia ou atrasado).
- Decretar e encerrar a intervenção pedem a **confirmação recente** (chave do aparelho ou código por e-mail), como os atos da crise. A semente dos tipos só entra com o
  catálogo vazio (renomear "Hospital" não o recria). A data de encerramento de um mandato nunca fica antes da indicação. O aviso de atraso sai um por entidade.
- **Tela:** todo ato que não se desfaz pede confirmação no aviso do sistema, dizendo a consequência; o título do formulário diz de quem é o ato (o dirigente, o
  período, o processo); só aparecem as reuniões que valem para o ato; a recusa aparece dentro do formulário; tabelas no padrão do app (rolagem no celular); UF em
  lista; "Corrigir entrega" vem preenchido; trocar de ficha durante uma gravação não mistura as respostas; botões que o servidor recusaria não aparecem.

**Decisões tomadas por interpretação (o responsável pode mudar qualquer uma):** o nepotismo do Art. 76 §2º é conferido contra quem está na **Diretoria Executiva** (o
Estatuto não diz de quem é o parente); só o Pastor Presidente com a cadeira de Presidente decreta e encerra (na vacância, quem assumir a cadeira); a correção da
caducidade cabe até 10 dias; depois de intervenção recusada ou caducada, sem urgência; a destituição vai à Assembleia; a verificação anual do Conselho Fiscal
(Art. 66 §3º) anda com a prestação do ano (sem prestação entregue, o Painel já acusa o atraso); a prestação é anual por padrão, com 120 dias para entregar; o
profissional de fora tem só nome, formação e registro (sem CPF).

**Provas:** jest 6.267; banco local (`bash rodar.sh preparar-entidades`): `e2e-69` 160 (fluxos, garantias do banco, segurança e lixo), `e2e-70` corridas 11 e 12 com o
READ_COMMITTED_SNAPSHOT do Azure; tela (`tools/front-entidades`) 70, com 16 mutações acusadas; homologação: a 165 aplicada no Azure SQL, rotas com 401, teste de tela
41704106591 só com as diferenças intencionais (base aprovada em `7be3b82`) e 41825543147 (0 divergência, 0 violação de CSP) contra a base nova.

## v9.2 — Expansão (Extensões e novas congregações)

- [x] Abertura de Extensão da Tenda (nível 0) por congregação-mãe.
- [x] Emancipação de Extensão → Congregação (CLI).
- [x] **CME** — Comissão de Missões e Expansão Estratégica (Regimento, Art.
      23): Secretário de Missões + Pastores de Área. Vinha adiada de v2.4
      (Comissões Permanentes) porque dependia do cargo "Secretário de
      Missões", que precisa nascer aqui (Pastor de Área já existe — só falta
      esse cargo). Reaproveita `shared/comissoes.js`, mesmo padrão de CFO/CEP.

### Desenho da v9.2 (contrato, 04/11/2026)

Base legal: Estatuto Art. 5º §§2º, 3º e 5º (as congregações são filiais; as Tendas são extensões subordinadas a uma filial; a IEADESPA institui suas unidades
"conforme deliberação da CLI") e Art. 50; Regimento Art. 23 (CME: composição e competência), Art. 24 §2º (15 dias para o parecer; sem ele, só em regime de
urgência por 2/3), Art. 43 e 44 (Secretarias de livre nomeação do Pastor Presidente; SEMIADESPA), Art. 104-B, I (Nível 0), Art. 106, III, Art. 109-A (a Extensão:
Encarregado de confiança do Dirigente, 100% da arrecadação à Congregação-Mãe, sem JAI) e Art. 128 §5º, V (a congregação que gera a filha "arca com o aluguel e a
estrutura inicial").

**1. O cargo e a CME.** Nasce o papel **"Secretário de Missões"** (nível Departamento, o mesmo do Líder Geral: entra na CLI pelo mesmo caminho), dado em
Liderança à pessoa nomeada para a SEMIADESPA. A **CME é calculada** (nunca cadastro manual, o mesmo padrão da CFO e da CEP): quem lidera a SEMIADESPA hoje (o
papel novo ou o Líder Geral antigo) e todos os **Pastores de Área** com o cargo em vigor. Ela aparece na tela das Comissões e passa a ser comissão temática
possível dos Projetos (Art. 24).

**2. O pedido de expansão.** Um processo por pedido, de três tipos:

- **Abertura de Extensão da Tenda** (Nível 0): pedida pelo Dirigente da Congregação-Mãe (ou pelo nível geral), com o nome, o endereço, a justificativa (público,
  local, como a Mãe vai sustentar) e o **Encarregado** — um membro ativo, em comunhão, da própria Congregação-Mãe (Art. 109-A, I). A Mãe precisa ser
  congregação ativa e não rebaixada (a rebaixada pelo PSC perdeu a autonomia, Art. 129 §3º). Não passa pela CME (o Art. 23 fala em congregações e emancipações):
  vai direto à CLI.
- **Emancipação** de uma Extensão em Congregação: pedida pelo Dirigente da Mãe ou pelo nível geral, com o nome da nova congregação (sem homônima) e a Área
  (a da Mãe, por padrão). Uma Extensão só tem um pedido em andamento por vez.
- **Nova congregação** sem passar por Extensão: só o nível geral pede.

**Parecer da CME** (emancipação e nova congregação): favorável ou contrário, com a fundamentação, emitido por um membro da CME que não seja quem pediu. O prazo
de **15 dias** desde o pedido aparece na tela; vencido, o Painel acusa. Sem o parecer, a CLI só decide registrando o **regime de urgência** (2/3, como nos
Projetos).

**Decisão da CLI**: o nível geral registra a reunião da CLI (realizada e encerrada, em data igual ou posterior ao pedido e ao parecer) e o resultado. **Aprovado,
o sistema executa na mesma gravação:** a Extensão nasce ativa com o Encarregado; a nova congregação nasce na Área escolhida; na **emancipação**, a congregação
nasce, os membros da Extensão passam para ela (deixam de estar na Extensão), a Extensão fica inativa com a marca "emancipada em" e o acesso de quem tinha o
escopo daquela Extensão se encerra. Toda sessão aberta cai (o escopo está no bilhete de acesso). Recusado, fica com o motivo. Quem pediu (ou o nível geral) pode
desistir antes da decisão.

**3. Depois de aberta.** O Dirigente da Mãe troca o Encarregado (com o motivo; a troca fica no histórico). Pendências calculadas no Painel: parecer da CME
vencido, pedido esperando a CLI, Extensão ativa sem Encarregado em comunhão, congregação nascida da emancipação ainda sem Dirigente, e o Secretário de Missões
ausente (CME sem a SEMIADESPA).

**4. Quem faz o quê.** Permissão nova **`expansao`** (vem para o Secretário Geral, o Presidente, o Dirigente de Congregação, o Pastor de Área e o Secretário de
Missões). O Dirigente vê e pede só para a congregação dele (a divisão final de quem pede cada tipo está em "Como ficou a v9.2"); a CME e o nível geral veem tudo; a decisão da CLI é só do nível geral. Tela: card novo **"Expansão"**
no portal, com Painel, Pedidos (lista e ficha) e Extensões. ROPA e política de retenção atualizadas (os atos de abertura e emancipação são a certidão de
nascimento da unidade e ficam).

### Como ficou a v9.2 (entregue em 04/11/2026)

**Em produção desde 04/11/2026** (merge `c98a250`; para desfazer: `git revert -m 1 c98a250`). Migração **166** (`PedidosExpansao`, `ExtensaoEncarregados`, o endereço, a
abertura e a emancipação em `ExtensoesTenda`; o papel **Secretário de Missões**; a permissão `expansao`; três avisos; a política de retenção). Regra pura em
`api/shared/expansao.js`, banco em `api/shared/expansaoDb.js`, rota `/api/expansao/<ação>` (`GestaoExpansao`); a CME calculada em `api/shared/comissoes.js`
(`composicaoCME`), na tela das Comissões e como comissão temática dos Projetos. Tela: card **Expansão** no portal (Painel, Pedidos, Extensões), cartão em Meus Dados.
Casca do service worker **v52**.

**Quem faz o quê (como ficou, depois da revisão):** a **abertura de Extensão** e a **troca do Encarregado** são do Dirigente da Congregação-Mãe (ou do nível geral) —
o Encarregado é "de confiança do Dirigente Local" (Art. 109-A, I); a **emancipação** pode ser pedida também pelo Pastor de Área; a **nova congregação**, só pelo nível
geral; o **parecer** é de quem compõe a CME (nunca sobre o pedido que fez); a **decisão da CLI**, só do nível geral, com a confirmação recente (chave do aparelho ou
código por e-mail). O Secretário de Missões age pela CME: o escopo de departamento não alcança congregação. A CME e o nível geral veem todos os pedidos; a pendência e
o histórico do Encarregado ficam com quem cuida da Mãe.

**O que mudou depois das duas revisões independentes** (servidor: 1 alta, 5 médias, 9 baixas; tela: 5 médias, 10 baixas — tratadas):

- **A recusa do Encarregado não conta nada de quem é de fora:** a congregação é conferida primeiro, com a mesma resposta para a matrícula que não existe e a de outra
  congregação. Antes, a ordem das recusas deixava um Dirigente descobrir se uma pessoa de qualquer congregação estava sob disciplina.
- **A emancipação** passa só quem é membro (o desligado e o falecido ficam: a ficha deles é história da Mãe), leva o cadastro do dízimo para a tesouraria nova, cria a
  JAI na hora, confere que a Extensão ainda é da mesma Mãe e encerra as sessões na própria gravação. As decisões são gravadas uma de cada vez (sem travamento cruzado).
- A pendência do Encarregado não diz o motivo (ativo, comunhão, disciplina ou congregação); a CME de outra Área não a vê, nem o histórico.
- "Congregação nova sem Dirigente" só sai com o papel de Dirigente (o Membro da JAI não conta). A CME deixa de fora quem está sob disciplina ou sem comunhão.
- A permissão `expansao` é dada aos papéis **uma vez**: se a administração a tirar em Permissões, o deploy não a devolve.
- Ninguém dá parecer de Projeto sobre o projeto que protocolou. Pessoas e Liderança não usam Extensão emancipada; o cadastro não reativa a emancipada nem exclui
  congregação ou Extensão em uso (sem erro). O endereço da emancipada é completado campo a campo pela Extensão. O primeiro Encarregado se define sem motivo.
- **Tela:** o que falta no formulário é avisado antes da pergunta de confirmação; voltar à aba não apaga o que foi digitado; a mensagem do pedido novo aparece na
  ficha; o tipo do pedido diz se passa pela CME e avisa quando não há Mãe ou Extensão para escolher; a lista que não chegou não manda "registrar a reunião"; o
  histórico tem o seu contador; rolagem no celular, nomes nos botões para o leitor de tela; a saída da sessão volta ao Painel.

**Decisões tomadas por interpretação (o responsável pode mudar qualquer uma):** a abertura de Extensão vai direto à CLI, sem a CME (o Art. 23 fala em congregações
e emancipações); sem o parecer da CME em 15 dias, a CLI só decide registrando a urgência por 2/3 (o mesmo dos Projetos, Art. 24 §2º); na emancipação, a matrícula na
EBD da Mãe e os cargos locais na Mãe não mudam sozinhos (o Superintendente e o Dirigente ajustam); o acesso de escopo da Extensão emancipada termina e todas as
sessões caem; a numeração de abertura das congregações (Estatuto Art. 5º §2º) não está no sistema; o cadastro de Congregações e Extensões continua servindo para
registrar as que já existem.

**Provas:** jest 6.296; banco local (`bash rodar.sh preparar-expansao`): `e2e-71` 172 (fluxos, garantias do banco, segurança e lixo), `e2e-72` corridas 20 e 21 com o
READ_COMMITTED_SNAPSHOT do Azure; tela (`tools/front-expansao`) 79, com 25 mutações acusadas; homologação: a 166 aplicada no Azure SQL, rotas com 401, teste de tela da homologação com 0 divergência e 0 violação de CSP (execução 41855454625, 1.363 ações).

## v9.3 — Distrito e macroexpansão

- [x] Ativação de Distrito (nível 5) com autonomia financeira + dízimo institucional 10%.
- [x] Blindagem contra desvinculação (intervenção imediata).

### Desenho da v9.3 (contrato, 04/11/2026)

Base legal: Estatuto Art. 5º §5º (a CLI institui as unidades); Regimento Art. 6-A, III e IV (Pastores Distritais, Vice-Presidentes de Quadrante e
Superintendentes Regionais são membros natos da CLI), Art. 53-D, I (o NIF recebe e aprova os Balanços Consolidados dos Distritos), Art. 126-K a 126-N (o
Distrito: gatilho, CDE, autonomia, Dízimo Institucional, destituição sumária), Art. 126-P (avocação e intervenção imediata) e Art. 144, II (atraso no repasse
é infração de intervenção). O que já existia e é reaproveitado: o cadastro de Distritos (com Quadrantes ligados a ele) e o órgão CDE criado com ele; o
escopo DISTRITO nos acessos; a tabela de repasses institucionais (v4.15) com o percentual de 10% e a tolerância ajustáveis.

**1. Ativação e desativação pela CLI.** O Distrito só fica ativo por **decreto da CLI** (Art. 126-K §2º), registrado pelo nível geral com a confirmação recente:
a reunião da CLI (realizada e encerrada), o **gatilho** — (a) capital ou região metropolitana fora da sede de origem, ou (b) cidade com mais de 1.000.000 de
habitantes, com a cidade, a UF, a população e a fonte (IBGE) — e o **Pastor Distrital**. O território é o que o cadastro já liga ao Distrito (Quadrantes →
Regiões → Áreas → Congregações); a tela mostra as congregações que ele cobre e recusa o decreto sem nenhuma congregação ativa. A desativação também é decreto
da CLI (com o motivo): encerra o acesso de toda a liderança de escopo do Distrito e derruba as sessões. Cada período de atividade fica no histórico. O cadastro
deixa de ligar e desligar o Distrito (continua criando, renomeando e montando o território). Um Distrito que já estivesse marcado como ativo no cadastro antes
desta versão fica ativo desde a migração, com o aviso "sem o decreto da CLI registrado" no Painel até o nível geral registrar o decreto.

**2. Pastor Distrital e CDE.** Papel novo **"Pastor Distrital"** (nível Distrito, com as permissões do Pastor de Área e a nova `distritos`), nomeado e trocado
**só pelo Pastor Presidente em exercício** ("escolhido a dedo", Art. 126-L, I), com a confirmação recente: membro ativo, em comunhão, sem processo
disciplinar, de cargo ministerial Pastor e com a credencial em dia; o anterior sai na mesma gravação. O papel não se dá nem se tira pela tela de Liderança.
Papel novo **"Vice-Presidente de Quadrante"** (nível Quadrante). O **CDE é calculado** (Art. 126-L, II): o Pastor Distrital (ou o Interventor, durante a
intervenção), os Vice-Presidentes dos Quadrantes do Distrito e os Superintendentes Regionais das Regiões do Distrito. **CLI:** o Pastor Distrital, o
Vice-Presidente de Quadrante e o Superintendente Regional passam a entrar na composição calculada da CLI por função (Art. 6-A, III e IV).

**3. Autonomia financeira e Dízimo Institucional.** Do mês do decreto em diante (e até o mês anterior à desativação), o fechamento das congregações do
território **não entra no Rateio Geral da Sede**: o repasse delas vai para o Distrito, que gere 100% (Art. 126-N, I) na conta dele; a Tesouraria Local mostra
"repasse ao Distrito ...". O **Dízimo Institucional** do mês é **calculado, nunca digitado**: 10% (o percentual ajustável) da soma do Total Final (o mesmo valor
que o repasse institucional da congregação já usa) dos fechamentos do mês das congregações do território; o registro na tela de Repasses só é aceito com
todas as congregações ativas do território com o mês fechado, e mostra quais faltam. Ao ser marcado como repassado, o valor passa a contar no saldo do
Tesouro Geral (antes o repasse de Distrito não creditava em lugar nenhum). **Balanço anual ao NIF** (Art. 126-M, II e 53-D, I): o Distrito (Pastor Distrital,
Tesoureiro de Distrito ou Interventor) envia o balanço consolidado do ano — receitas, despesas, saldo em 31/12 e observações — até 31/03 do ano seguinte, ao
lado do que o sistema já sabe (soma dos fechamentos do ano e Dízimo Institucional repassado); um membro do Conselho Fiscal aprova ou devolve com o motivo;
devolvido, o Distrito reenvia (as versões ficam).

**4. Blindagem e intervenção imediata.** Sinais calculados no Painel, com aviso ao Presidente: **Dízimo Institucional vencido** (mês passado da tolerância sem
repasse: "retenção da cota", Art. 126-N, III), balanço anual não enviado ou devolvido sem reenvio depois de 31/03, Distrito ativo sem Pastor Distrital.
**Intervenção** (Art. 126-N, III e 126-P, II): ato **só do Pastor Presidente em exercício**, com a confirmação recente, o motivo (tentativa de
desvinculação, estatuto próprio, retenção da cota de repasse ou outra ameaça à integridade do Ministério), a fundamentação, o **Interventor** (membro ativo, em
comunhão, sem processo, de fora da liderança destituída) e as medidas determinadas que dependem de gente (bloqueio das contas bancárias, revogação da
procuração, providência policial ou judicial). **Na mesma gravação:** toda a liderança do Distrito é destituída (todo acesso de escopo do Distrito, mais os
Vice-Presidentes de Quadrante e os Superintendentes Regionais do território, que compõem o CDE), as sessões deles caem, o Interventor recebe o papel novo
**"Interventor Distrital"** (as mesmas permissões do Pastor Distrital). Uma intervenção aberta por Distrito. O **encerramento** também é do Presidente, com o
resultado, e pode nomear o novo Pastor Distrital na mesma gravação (o acesso do Interventor termina).

**5. Quem faz o quê e tela.** Permissão nova **`distritos`** (vem para o Presidente, o Secretário Geral, o Pastor Distrital, o Interventor Distrital e o
Tesoureiro de Distrito; o Conselho Fiscal recebe em Permissões). O nível geral vê todos os Distritos; quem tem escopo de Distrito vê só o dele (posição
financeira, balanços, CDE). Tela: aba nova **"Distritos"** dentro do card Expansão (Distritos ativos e no cadastro, a ficha com o território, o mês a mês do
Dízimo Institucional, os balanços, o CDE, os períodos e as intervenções). Avisos, ROPA e política de retenção (os decretos e as intervenções são história
da instituição e ficam).

### Como ficou a v9.3 (entregue em 05/11/2026)

**Em produção desde 05/11/2026** (merge `8434bea`; para desfazer: `git revert -m 1 8434bea`). Migração **167** (`DistritoPeriodos` com o decreto da CLI e o mês
financeiro, `DistritoIntervencoes`, `DistritoBalancos` com as versões, `FechamentosTesouraria.RepasseDistritoId`; os papéis **Pastor Distrital**, **Interventor
Distrital** e **Vice-Presidente de Quadrante**; a permissão `distritos`; três avisos; a política de retenção). Regra pura em `api/shared/distritos.js`, banco em
`api/shared/distritosDb.js`, rota `/api/distritos/<ação>` (`GestaoDistritos`). Tela: pílula **Distritos** na aba Expansão (abre também para quem só tem
`distritos`), o caixa dos Distritos na situação do Tesouro, o repasse ao Distrito na Tesouraria Local, cartão em Meus Dados. Casca do service worker **v53**.

**O que mudou do desenho (durante a construção e depois das duas revisões independentes — servidor: 1 alta, 7 médias, 8 baixas; tela: 2 altas, 3 médias, 6
baixas — tratadas):**

- **O Pastor Distrital e o Interventor recebem o acesso na tela de Liderança** (cada pessoa tem um só acesso, com a senha): lá, só o Pastor Presidente em
  exercício dá, troca ou tira esses dois papéis, com as conferências (Pastor de cargo ministerial, em comunhão, credencial em dia, um por Distrito; o
  Interventor é só a pessoa nomeada na intervenção aberta). Os dois papéis não se renomeiam no cadastro. O decreto e a intervenção não criam acesso: eles
  avisam o que falta fazer em Liderança.
- **O Distrito do repasse fica gravado no fechamento do mês** (na hora em que a Tesouraria Local fecha): mudar um Quadrante, uma Região ou uma Área de lugar
  depois não reescreve o passado (o que a Sede já rateou continua da Sede; o que foi do Distrito continua dele).
- **A igreja tem uma conta só:** o dinheiro do Distrito aparece como **caixa do Distrito** (o repasse das congregações dele menos o Dízimo Institucional
  repassado) na ficha e na situação do Tesouro, fora do Tesouro Geral; os gastos dele vão no balanço anual ao NIF. Só o Dízimo dos meses com decreto entra no
  Tesouro Geral (o repasse de Distrito digitado à mão antes da v9.3 não entra de repente).
- **O Distrito "legado"** (marcado ativo no cadastro antes desta versão) não muda o destino do dinheiro até o decreto ser registrado; o decreto do legado vale
  do mês do registro em diante, com a data da reunião.
- **O mês do Dízimo** só exige as congregações que já fechavam a tesouraria naquele mês (a congregação nova não trava meses antigos); o mês em que falta o
  fechamento local avisa "feche o mês" — só o mês apurável e não repassado fala em retenção e intervenção.
- **Intervenção:** o Interventor que já tem outro cargo de acesso é recusado (trocaria o cargo dele — inclusive o do Presidente); durante a intervenção,
  qualquer acesso novo com escopo do Distrito ou do território dele é só do Presidente; quem faz o ato nunca perde o próprio acesso; a troca das senhas dos
  canais oficiais (Art. 160 §4º) é conferida na hora.
- **Balanço:** desativado o Distrito, o nível geral envia o que ficou devendo; quem é da liderança do Distrito não analisa o balanço dele (nem quem o enviou);
  o aviso da análise chega a cada versão.
- **Tela:** a confirmação reforçada (chave do aparelho ou código) troca o bilhete de acesso no meio do ato — a tela passou a conferir a pessoa (matrícula e
  tipo de sessão), não o bilhete; o mesmo defeito, que deixava a tela muda depois de gravar, foi corrigido na decisão da Expansão (v9.2) e na intervenção das
  Entidades Vinculadas (v9.1), que já estavam em produção. O que foi digitado volta ao repintar a ficha (também na Expansão); as reuniões da CLI são relidas a
  cada abertura; a lista abre pelo nome; o Distrito sem território é avisado antes da confirmação.
- O Pastor Distrital, o Vice-Presidente de Quadrante e o **Superintendente Regional** entram na composição calculada da CLI por função (Regimento Art. 6-A, III e
  IV) — o Superintendente, que já existia desde a v7.11, também passou a contar.

**Decisões tomadas por interpretação (o responsável pode mudar qualquer uma):** o Dízimo Institucional é 10% da soma do Total Final dos fechamentos das
congregações do território (a "arrecadação líquida consolidada", a mesma base do repasse institucional da congregação); o mês financeiro do Distrito começa no
mês em que o decreto é registrado e volta para a Sede no mês da desativação; o balanço anual vai ao NIF até 31/03 do ano seguinte; a intervenção destitui todo
acesso de escopo do Distrito e os Vice-Presidentes de Quadrante e Superintendentes Regionais do território (o CDE), não os Dirigentes nem os Pastores de Área;
as medidas de bloqueio de contas, procuração e polícia ou Justiça só ficam registradas (quem executa é gente); enquanto houver uma conta só, a Tesouraria Geral
continua liberando os 40% das congregações do Distrito; o CDE não cria Áreas, Regiões e Quadrantes sozinho (o cadastro continua com o nível geral, a pedido
dele). **Aceito e registrado:** o NIF precisa receber a permissão `distritos` em Permissões; o Vice-Presidente "em exercício" não é tratado como Presidente; a
Secretaria pode renovar o mandato de um Pastor Distrital que está em vigor (não dar nem tirar); dois pedidos simultâneos do mesmo Presidente em Liderança não
são enfileirados (só ele concede).

**Provas:** jest 6.318; banco local (`bash rodar.sh preparar-distritos`): `e2e-73` 146 (a migração e o legado, o cadastro, o decreto, o Pastor Distrital só
pelo Presidente, a CLI, o repasse fora do Rateio Geral, o Dízimo calculado e creditado, o caixa, o território mudado sem reescrever o passado, o balanço com o
NIF, os avisos, a intervenção, a desativação, os CHECK e os índices, lixo em cada campo, Meus Dados), `e2e-74` corridas 16 e 17 com o READ_COMMITTED_SNAPSHOT
do Azure; `e2e-71` da v9.2 172 sobre a base nova; tela (`tools/front-distritos`) 72, com 32 mutações acusadas (Expansão 79 e Entidades 70 de novo, com as
mutações); homologação: a 167 aplicada no Azure SQL, rotas com 401, teste de tela da homologação com 0 divergência e 0 violação de CSP (execução 41901967482, 1.367 ações).

## 🔒 Trava de Revisão 9-A — antes de avançar para a v9.4

Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da seção 3).
Audita v9.1 a v9.3 pelas 5 perguntas do checklist.

- [x] **Fechada em 05/11/2026** — auditoria de v9.1 a v9.3. Duas revisões independentes, só de leitura: uma das costuras ENTRE as versões e com o sistema
  antigo (a saída da igreja, a Liderança de uma linha por pessoa, o cadastro, os avisos, o dinheiro) e outra da conformidade com o Estatuto, o Regimento, o
  plano e o README. **Nenhum achado alto; todos os que o código resolve, corrigidos com teste** (migração 168; `e2e-75`, 37 verificações; casca v54). As 5
  perguntas:
  1. **Tudo roda de ponta a ponta no ambiente real?** Sim. A bateria inteira do banco local, recriado do zero (`rodar.sh preparar` e `tudo.sh`, do `e2e-1` ao
     `e2e-75`), toda verde; as migrações 165 a 168 aplicadas duas vezes cada. O roteiro antigo que mudou foi o `e2e-23`: o Pastor Distrital e o Interventor
     Distrital (v9.3) nascem com as permissões do Pastor de Área e passaram a contar entre os papéis do cuidado pastoral — a expectativa antiga travava o
     preparo da base com o banco recriado.
  2. **Toda tela nova abre?** Sim. Antes da trava, teste de tela completo na produção (execução 42026895152): 6.738 ações iguais, 0 divergência, 0 violação de
     CSP. Provas de tela sem navegador: Entidades 70 (16 mutações acusadas), Expansão 83 (27 de 27), Distritos 77 (34 de 34). O teste de tela da homologação e
     o da produção depois do deploy: na homologação, a execução 42054960655 (1.367 ações iguais, 0 divergência, 0 violação de CSP) e na produção, a execução 42057812952 (1.214 ações das telas e 153 do celular iguais, 0 divergência, 0 violação de CSP; o celular repetido uma vez porque o navegador do equipamento não abriu).
  3. **O README e o código contam a mesma história?** Sim, conferido item por item (a contagem de 349 tabelas, as migrações 001 a 168, a seção 4, o índice, as
     datas e os merges, os artigos citados). Corrigidos: a mensagem da intervenção do Distrito citava o Art. 126-L, I (é o 126-N, III e o 126-P, II); um
     comentário da v9.1 dizia "5º dia" (é o 6º); as três políticas de retenção gravavam 5 anos com o texto "sem prazo final" (migração 168: NULL); o ROPA do
     Distrito não listava o Pastor Distrital nem os fechamentos; o plano da v4 dizia que o repasse de Distrito não creditava em lugar nenhum.
  4. **As sobras foram mesmo resolvidas?** As que o código resolve, sim (abaixo). O que ficou são decisões do responsável, listadas no fim.
  5. **Houve deploy real?** Sim: a 168 rodou no deploy da produção em 05/11/2026 (execução 42057813308, merge 75e5be0), com o teste de tela depois do deploy.

  O que mudou:
  - **A saída da igreja alcança a FASE 9 (médio, Reg. Art. 11).** A vacância encerra o Encarregado da Extensão e o mandato de dirigente de entidade vinculada
    (indicado ou homologado; falecimento com o motivo FALECIMENTO); antes, o falecido ou desligado continuava "dirigente atual". Para dirigir entidade, a
    mesma régua do Interventor e do Encarregado: em comunhão, sem processo disciplinar e sem licença de candidatura (Art. 157 §2º).
  - **O aviso de retenção do Distrito chega (médio).** A referência do aviso leva o motivo (falta fechamento, apurável e não registrado, registrado e não
    repassado): antes, o mês que avisou "falta fechar" nunca mais avisava a retenção. O aviso antigo de repasse parado não sai mais em dobro para o Distrito.
  - **Ninguém perde cargo em silêncio (médio).** O Pastor Distrital, como o Interventor, não é dado a quem já tem outro cargo em vigor (a Área ou a
    congregação ficaria sem líder e a CME ou a CLI perderiam a pessoa); nem em Distrito legado, sem o decreto.
  - **Os papéis cujo nome o sistema usa ficam protegidos (médio).** Presidente, Secretário Geral, Dirigente de Congregação, Pastor de Área, Superintendente
    Regional, Vice-Presidente de Quadrante, Pastor e Interventor Distrital, Secretário de Missões, Líder Geral de Departamento/Secretaria, Reitor da AFM e
    Tesoureiro de Distrito não se renomeiam, não mudam de nível nem se excluem (as permissões continuam editáveis); o papel dado a alguém não se exclui.
  - **Conformidade (médio):** a exoneração de dirigente de entidade é só do Pastor Presidente (Estatuto Art. 65); a verificação anual do Conselho Fiscal (Art. 66
    §3º) é registrada só por quem tem assento nele; a reunião do CDE espera só quem o compõe (Art. 126-L, II), não a metrópole inteira; a retenção sem prazo final.
  - **O dinheiro (baixo).** O decreto do Distrito pega também a trava do Rateio Geral (os dois ao mesmo tempo contariam o mesmo fechamento duas vezes); a
    desativação respeita o Dízimo do mês já registrado (a Sede volta no mês seguinte ao último registrado, e o registro não fica órfão).
  - **O cadastro (baixo).** A Área, a Região e o Quadrante com liderança, pedido ou unidade embaixo não se excluem (antes o Pastor de Área de uma Área apagada
    continuava na CME); o território de um Distrito sob intervenção não muda; desativar a Extensão pelo cadastro faz o que a emancipação faz (encerra o
    Encarregado e o acesso de escopo dela; recusa com pedido em andamento).
  - **A intervenção (baixo).** O Interventor pode ser trocado sem encerrar a intervenção; nas Entidades, quem não é o Presidente é recusado antes de pedir a
    confirmação recente, e a ratificação, a extinção e a aprovação do vínculo passaram a pedir a confirmação recente.
  - **Os outros baixos.** A emancipação fica no território da Mãe (a Área de outro Distrito mudaria o destino do repasse sem decreto); a Área herdada inativa diz
    o que fazer; o gatilho (a) do Distrito não aceita a própria sede, Parauapebas/PA (Estatuto Art. 2º); Meus Dados mostra os atos da pessoa nos pedidos de
    expansão, os balanços que analisou e os decretos que registrou; o painel da Expansão avisa o Pastor de Área da CME sem a permissão da tela; a nota da v9.4
    (a CME no envio de missionários, Art. 23, II e 44) e da v9.5 (os critérios de emancipação são decisão do responsável) no plano.

  **Decisões que o responsável pode mudar** (o sistema já está fazendo assim):
  - **O NIF analisa o balanço do Distrito por um conselheiro** (o Regimento, Art. 53 e 54, fala do colegiado de 5 com quórum): o conselheiro registra no sistema
    a deliberação do colegiado, tomada na reunião do Conselho Fiscal. O mesmo para a verificação anual das entidades.
  - **O "Filtro Máximo" do Distrito (Art. 126-M, I) e a dispensa dos balancetes (126-M, II, primeira parte) não estão no sistema:** enquanto houver uma conta só
    e nenhum Distrito de fato, os processos, os relatórios e a prestação de contas mensal das congregações do território continuam como hoje (a Sede mantém a
    avocação do Art. 126-P, I). Fazer quando o primeiro Distrito existir.
  - **A desativação do Distrito e a emancipação encerram acessos de funções não eletivas sem ir à Assembleia** (Estatuto Art. 18, VII, "c" fala da destituição de
    não eletivos): são atos de escopo que acabaram, não destituições de pessoas.
  - **O Secretário de Missões é dado em Liderança pela Secretaria** (o Regimento, Art. 43, diz que os Secretários são de livre nomeação do Pastor Presidente: a
    Secretaria registra a nomeação dele), sem a restrição do Pastor Distrital.
  - **Entidades:** o destino "congênere sem fins lucrativos" para a assistência social e as outras naturezas na extinção (o Estatuto, Art. 68, só fala em saúde,
    educação e comodato); a alienação de participação (Art. 18, VII, "b") e a fiança ou aval (Art. 59 §2º) ficam fora do sistema (atos de cartório e banco).
  - **Aceito:** a mudança de território enquanto um fechamento está sendo gravado (instantes) pode deixar aquele mês com a Sede.
  - **Defeitos do próprio texto das normas, para conhecimento:** o Regimento chama a Sede de nível 5 no Art. 104-B, VI e de nível 6 no Art. 126-O (o sistema
    segue o 126-K: Distrito 5, Sede 6); o Estatuto, Art. 61, II remete aos "arts. 72, § 3º, e 73", que não tratam de entidades (provavelmente o 66 §3º e o 67).

## v9.4 — Missões: campos, missionários e prestação de contas *(7ª rodada)*

O risco real em missões não é falta de recurso — é **sustento enviado sem
relatório recebido**, que é exatamente o que a Assembleia cobra e ninguém
consegue responder com número.

- [x] Cadastro de campo missionário (local, status, congregação mantenedora) e de
      missionário sustentado, com valor mensal amarrado ao Contas a Pagar (v4.5) e
      ao Rateio Geral (v4.10).
- [x] **Relatório de campo com periodicidade obrigatória** (batismos, atividades,
      pedidos) — e **relatório atrasado sinaliza/suspende o repasse**, mesma
      lógica do balancete departamental (v5.4). Não é punição: é a condição que a
      própria prestação de contas à Assembleia exige.
- [x] Painel de missões alimentado pelos mesmos dados, sem redigitação — inclusive
      para exibição pública/mural.
- [x] Conexão com a CME (Comissão de Missões e Expansão, v9.2).
      *(Trava 9-A: a v9.2 entrega a CME calculada (`composicaoCME`) e o parecer dela só dentro dos pedidos de expansão — os 3 tipos do CHECK de
      `PedidosExpansao`. O envio de missionários (Reg. Art. 23, II) vai pedir um parecer próprio, o Art. 44 §2º (envio para fora do Estado: só a CLI e o
      Pastor Presidente) e o Art. 44 §1º (a SEMIADESPA abre Frentes de Trabalho Missionário no município com autonomia) — entra no desenho da v9.4.)*
      *(MissionaryConnect; Missions21)*

### Desenho da v9.4 (contrato, 05/11/2026)

Base legal: Regimento Art. 23 (a CME dá parecer sobre o envio de missionários antes da decisão da CLI), Art. 24 §2º (15 dias; sem o parecer, só em regime de
urgência por 2/3), Art. 43 e 44 (a SEMIADESPA coordena a obra missionária; §1º abre e gere Frentes de Trabalho Missionário em Parauapebas e nas zonas rurais
adjacentes com autonomia; §2º o envio para outros Estados ou Países e os convênios externos são da CLI e do Pastor Presidente), Art. 126-N, I (o dinheiro da Sede
sustenta "o envio missionário do Ministério"), Art. 133-C (a falta de prestação de contas bloqueia novos recursos) e Art. 134 §6º, I (sustento de missionário só
por determinação expressa da Mesa Diretora). O que já existe e é reaproveitado: a CME calculada e o papel Secretário de Missões (v9.2), as reuniões da CLI
encerradas, o Contas a Pagar com o fornecedor de dados bancários confirmados por outra pessoa (v4.5), o Tesouro Geral que sobra do Rateio Geral (v4.10), a folha
da prebenda como molde da geração mensal (a Saída já aprovada, uma por pessoa e mês, sob trava) e a vacância (Trava 9-A).

**1. Campo missionário.** Cadastro operacional da SEMIADESPA (o Secretário de Missões, o Líder Geral dela ou o nível geral): o nome, onde fica (o país; no
Brasil, a UF e a cidade; a marca "zona rural adjacente a Parauapebas"), a congregação mantenedora (opcional), a divulgação (pública ou restrita; o padrão é
restrita) e uma descrição. A **abrangência é calculada** pelo lugar, nunca escolhida: **Local** (Parauapebas, ou zona rural adjacente no Pará — Art. 44 §1º),
**Estadual** (outra cidade do Pará), **Nacional** (outro Estado) ou **Transcultural** (outro país). O campo se encerra com o motivo, e não com envio vivo nele.

**2. Envio do missionário (o ato controlado).** A SEMIADESPA registra o pedido: o missionário (membro ativo, em comunhão, sem processo disciplinar e sem outro
envio vivo), o campo ativo, o sustento mensal proposto (zero = sem sustento), de onde ele sai (o **Tesouro Geral** ou o **caixa local da congregação
mantenedora**), quem recebe (um fornecedor do Contas a Pagar: a pessoa física do missionário ou a pessoa jurídica de uma agência ou igreja parceira), o
documento do envio (o termo de compromisso, obrigatório com sustento), a periodicidade do relatório (mensal ou trimestral), se o missionário autorizou divulgar
o nome e a justificativa. As etapas são calculadas pelo caso: campo Local sem sustento fica ativo na hora (Art. 44 §1º); campo Local com sustento passa só pela
concordância do Pastor Presidente (Art. 134 §6º, I); campo Estadual passa pelo parecer da CME e pela decisão da CLI (e pelo Presidente, se tiver sustento);
campo Nacional ou Transcultural, ou quem recebe é pessoa jurídica (convênio externo), passa pela CME, pela CLI e **sempre** pelo Presidente (Art. 44 §2º). O
parecer é de quem compõe a CME (nunca de quem pediu); a decisão da CLI é registrada pelo nível geral com a reunião encerrada (a urgência por 2/3 dispensa o
parecer que falta); a concordância ou a recusa (com o motivo) é do Pastor Presidente em exercício, com a confirmação recente. A última etapa ativa o envio: o
sustento e a obrigação do relatório começam no mês da ativação. Quem pediu (ou o nível geral) desiste enquanto o envio não ativou; a SEMIADESPA ou o nível geral
encerra o envio ativo (retorno, troca de campo), com o motivo e o último mês de sustento.

**3. Sustento mensal (Contas a Pagar).** A Tesouraria Geral (permissão `financeiro` do nível geral) gera o sustento do mês na pílula Missões: uma Saída **já
aprovada** por envio (a decisão colegiada é a autorização, como na prebenda), com o documento do envio, na categoria nova **Sustento missionário** (Tesouro
Geral) ou **Sustento missionário (caixa local)** (a congregação mantenedora), paga pelo caminho de sempre (o comprovante, a remessa e o saldo do centro de
custo). Uma por envio e mês (trava de aplicação e restrição no banco). O valor vigente tem histórico: o **reajuste** (o valor, a fonte ou quem recebe) é ato do
Pastor Presidente com a confirmação recente e vale de um mês ainda não gerado em diante.

**4. Relatório de campo e suspensão.** Cada período (o mês ou o trimestre, contado do mês da ativação) tem o seu relatório: batismos, conversões, pessoas em
discipulado, atividades (texto), pedidos (texto, opcional) e um anexo opcional. O prazo é o dia 10 do mês seguinte ao fim do período. A SEMIADESPA lança o que
o missionário envia (a correção fica registrada). **Relatório vencido suspende o sustento**: enquanto houver um período vencido sem relatório, a geração pula
aquele envio e diz o motivo (calculado na leitura, nunca marcação manual); chegou o relatório, a geração volta a ser possível, inclusive a dos meses que ficaram
para trás (suspende, não cancela). Um aviso por período vencido à SEMIADESPA e ao nível geral.

**5. Painel e mural.** O painel usa os mesmos dados, sem redigitar: os campos ativos por abrangência, os missionários ativos, o sustento mensal comprometido, o
sustento pago no ano, **os meses de sustento pago sem relatório recebido** (o número que a Assembleia cobra), os relatórios em dia e atrasados, os sustentos
suspensos, os batismos e as conversões do ano e os pedidos em andamento (parecer vencido, aguardando a CLI, aguardando o Presidente). A **versão mural** (para
imprimir e expor) mostra só os campos públicos, com o lugar e os números do ano; o nome do missionário só com a autorização registrada; os campos restritos
entram só na contagem; nenhum valor por pessoa, só o total investido no ano.

**6. Costuras.** A vacância encerra o envio vivo da pessoa. Meus Dados mostra os envios da pessoa e os atos dela (pediu, deu o parecer, registrou a decisão,
concordou). ROPA e retenção (sem prazo final: é a história da obra missionária e a prestação de contas à Assembleia). A permissão nova `missoes` vai ao
Presidente, ao Secretário Geral, ao Secretário de Missões e aos Pastores de Área (a CME); a pílula Missões entra na aba Expansão.

**Fora desta versão (escopo):** o missionário que não é membro (sem ficha não entra no cadastro), o relatório enviado pelo próprio missionário no Meu Painel, a
retenção de imposto sobre o sustento (a natureza fiscal fica com a contabilidade; o sistema paga o valor decidido), o site público (o mural impresso cobre a
"exibição pública") e um percentual do Rateio Geral reservado para missões (a Tesouraria pode criar esse destino em Catálogos).

### Como ficou a v9.4 (entregue em 06/11/2026)

**Em produção desde 06/11/2026** (merge `a052c5e`; para desfazer: `git revert -m 1 a052c5e`). Migração **169** (`CamposMissionarios`,
`EnviosMissionarios`, `EnvioSustentoValores`, `RelatoriosCampo`, `SustentoGeracoes`; as categorias de Saída **Sustento missionário** e **Sustento missionário
(caixa local)** na conta 5.1.5; a permissão `missoes`; cinco avisos; a política de retenção). Regra pura em `api/shared/missoes.js`, banco em
`api/shared/missoesDb.js`, rota `/api/missoes/<ação>` (`GestaoMissoes`). Tela: pílula **Missões** na aba Expansão (painel, envios, campos, sustento do mês e
mural para imprimir), cartão em Meus Dados. Casca do service worker **v55**.

**O que mudou do desenho (depois das duas revisões independentes — costuras: 1 alta, 5 médias, 2 baixas; conformidade: 1 alta, 6 médias, 4 baixas —
tratadas):**

- **A Saída cancelada não perde o mês:** se a Tesouraria cancela ou rejeita no Contas a Pagar uma Saída de sustento, o mês volta a ser gerado (a Saída
  desfeita fica lá, com o motivo); o reajuste e o encerramento não esbarram nela.
- **O Tesoureiro não recebe a permissão `missoes`:** a Tesouraria Geral (a permissão `financeiro` do nível geral) vê só a prévia e gera o sustento do mês.
  Assim, quem paga não lança o relatório que levanta a suspensão nem registra a decisão da CLI.
- **Quem recebe:** a pessoa física é sempre o próprio missionário (o fornecedor ligado à matrícula dele, em Fornecedores); outra pessoa só recebe como pessoa
  jurídica (agência ou igreja parceira), que é convênio externo e passa pela CME, pela CLI e pelo Presidente. O caixa local é sempre o da congregação
  mantenedora do campo (não se escolhe outra). O reajuste não transforma em convênio externo um envio que não passou pela CLI.
- **O Pastor Presidente não concorda com o envio que ele mesmo pediu** (pede-se pela SEMIADESPA).
- **A zona rural adjacente** vale para Parauapebas e os municípios que fazem divisa com ele (Canaã dos Carajás, Curionópolis, Eldorado do Carajás, Marabá,
  Água Azul do Norte e São Félix do Xingu): marcar a zona rural em outra cidade é recusado (a marca não vira escolha para fugir da CME e da CLI).
- **O sustento para enquanto a pessoa não pode recebê-lo:** licença de candidatura, sem comunhão ou processo disciplinar em curso deixam o mês impedido;
  resolvida a situação, volta (não se perde).
- **Vacância:** encerra o envio no mês dela (esse mês ainda é gerado) e dispensa o relatório que faltava (não há mais quem o mande); o motivo cita o Estatuto,
  Art. 11 §7º.
- **O nome no mural** se autoriza e se retira a qualquer momento (botão na ficha, LGPD Art. 8º §5º); o mural não mostra o total investido no ano quando há
  um só missionário pago (seria o valor dele); a Saída do campo de divulgação restrita não leva o nome nem o campo.
- **A CME** (sem outro papel) vê os pedidos aguardando o parecer, os que ela analisou e os números gerais — não o sustento, os relatórios nem a prévia do
  pagamento.
- **O sustento não se lança à mão** no Contas a Pagar (só nasce da geração do mês); o painel de imunidade aceita a rubrica do sustento.
- As etapas do envio são calculadas pelo campo lido dentro da transação (a mudança do lugar do campo no meio de um pedido não o faz passar pelas etapas
  erradas); a pessoa é travada antes do envio (a mesma ordem da vacância). Meus Dados mostra também a justificativa, o parecer, os motivos e os pagamentos (ao
  missionário) e os relatórios, os reajustes, as gerações e os campos (a quem agiu).

**Decisões tomadas por interpretação (o responsável pode mudar qualquer uma):** a "determinação expressa da Mesa Diretora" (Regimento Art. 134 §6º, I) é a
concordância do Pastor Presidente (não se exige também o 1º Tesoureiro nem a ata da Diretoria Executiva); a frente local (Art. 44 §1º) é da SEMIADESPA, sem
CME nem CLI; outra cidade do Pará passa pela CME e pela CLI; pagar a pessoa jurídica é convênio externo; o parecer da CME é dado por um membro dela (como na
v9.2); o sustento sai do Tesouro Geral ou do caixa local da mantenedora (não da tesouraria da SEMIADESPA); a licença de candidatura para o sustento sem
encerrar o envio; o relatório vence no dia 10 do mês seguinte ao período; os pedidos recusados e as desistências ficam guardados sem prazo final, como o
resto. **Aceito e registrado:** o Líder Geral antigo da SEMIADESPA conta na CME, mas só entra na tela com a permissão `missoes` (o caminho é o papel
Secretário de Missões); a remessa ao exterior (fornecedor estrangeiro) continua acusada no painel de imunidade, de propósito.

**Provas:** jest 6.348; banco local (`bash rodar.sh preparar-missoes`): `e2e-76` 203 (a migração, quem entra, os campos e a abrangência, cada caminho do
envio, as recusas, o sustento gerado, suspenso, impedido e cancelado, o relatório e a correção, o reajuste e o encerramento, o painel, o mural, a autorização
do nome, a vacância, os avisos, os CHECK e os índices, lixo em cada campo, Meus Dados), `e2e-77` corridas 19 e 20 com o READ_COMMITTED_SNAPSHOT do Azure; a
bateria inteira do banco recriado do zero, do `e2e-1` ao `e2e-77`, verde; tela (`tools/front-missoes`) 114, com 39 mutações acusadas (Distritos 77,
Expansão 83 e Entidades 70 de novo); homologação: a primeira execução do teste de tela (42218344325) mostrou só as diferenças de propósito (a pílula e a seção de Missões, escondidas, em toda tela), a base nova foi aprovada e a segunda (42220757930) deu 1.237 e 153 ações iguais, 0 divergência e 0 violação de CSP; produção: a migração 169 aplicada, a rota responde 401 sem login, a casca v55 e o teste de tela (42229580970) com 1.237 e 153 ações iguais, 0 divergência e 0 violação de CSP.

## v9.5 — Mapa territorial e inteligência de expansão *(7ª rodada)*

- [x] **Mapa de cobertura**: onde há membros cadastrados sem congregação próxima —
      insumo direto e objetivo para abertura de Extensão da Tenda (v9.2), em vez
      de decidir por percepção.
- [x] Densidade de membresia por região e distância média até a congregação de
      vínculo.
- [x] Simulação de emancipação: quais Extensões já atendem os critérios para virar
      Congregação, calculado a partir dos dados que já existem (membresia, PSC da
      v7.1, arrecadação da FASE 4). *(Churchteams; GroupVitals — group finder)*
      *(Trava 9-A: nem o Regimento nem a v9.2 fixam critérios de emancipação — a v9.2 decide caso a caso, pela CME e pela CLI. Os critérios da
      simulação são decisão do responsável, a pedir no desenho da v9.5.)*

### Desenho da v9.5 (contrato, 06/11/2026)

Decisões do responsável (06/11/2026): o endereço do membro passa a ter **todas as linhas separadas** (não só o bairro); o mapa usa a **chave do Google Maps**,
com a opção **lista e desenho simples** ao lado, escolhida na hora conforme a conveniência; os critérios de emancipação ficam numa **tabela que ele monta**
(nenhuma régua fixa no código). O que já existe e é reaproveitado: a posição (latitude e longitude) das congregações em Catálogos (vC.2), o endereço das
Extensões e a data de abertura (v9.2), o escopo da aba Expansão (o nível geral e a CME veem tudo; o Dirigente e o Pastor de Área, só as congregações que o
escopo cobre por inteiro), o pedido de emancipação da v9.2, o dízimo confirmado da Tesouraria Local (v4) e a avaliação homologada do PSC (v7.1).

**1. Endereço do membro em linhas.** O cadastro (Pessoas) e o Meus Dados ganham: logradouro, número, complemento, **bairro** (escolhido numa lista; se o
bairro não está nela, a pessoa escreve o nome e ele entra na fila "bairros a cadastrar"), cidade, UF e CEP. A linha única de hoje (`Endereco`) continua e passa
a ser **montada pelo sistema** com as linhas (tudo o que já lê o endereço segue funcionando); um endereço antigo, só com a linha única, aparece como está e
conta como "sem localização" até ganhar o bairro. A anonimização e a exclusão da LGPD limpam as linhas novas junto com a antiga.

**2. Bairros e posições.** Um cadastro de **bairros** (nome, cidade, UF e o ponto central, marcado uma vez), do nível geral. Ao cadastrar um bairro que estava na
fila, o sistema liga a ele, de uma vez, os membros que escreveram aquele nome na mesma cidade. As **Extensões** ganham o ponto no mapa, marcado pelo Dirigente
da Mãe ou pelo nível geral; as congregações continuam com o ponto de Catálogos (a tela avisa a que não tem). Marcar o ponto: um clique no mapa do Google, ou
colar o link do Google Maps do lugar, ou digitar a latitude e a longitude.

**3. Mapa de cobertura.** Uma pílula nova **Território** na aba Expansão (permissão `expansao` ou a CME, como a v9.2). Duas formas, escolhidas na hora: **Google
Maps** (ruas de verdade, as congregações e as Extensões com o ponto, e um círculo em cada bairro com o número de membros, maior quanto mais gente) e **lista e
desenho** (a tabela por bairro e um desenho simples dos pontos, sem nada de fora). Cada bairro com ponto mostra os membros que moram nele, a unidade mais perto
(congregação ou Extensão ativa) e a distância em linha reta; **bairro descoberto** é o que tem membros e nenhuma unidade dentro do raio de cobertura
(parâmetro do nível geral, começa em 3 km). Contagem, nunca nome: o mapa não mostra quem mora onde. O nível geral e a CME veem todos os membros; o Dirigente e o
Pastor de Área, os das congregações deles (as unidades de todos aparecem, porque são públicas). Do bairro descoberto sai o atalho para o pedido de abertura de
Extensão da v9.2.

**4. Densidade e distância.** Por bairro: os membros e o descoberto. Por unidade (congregação ou Extensão): os membros com bairro marcado, a **distância média**
do bairro deles até a unidade e **quantos moram mais perto de outra unidade**. No total: os membros sem localização (a medida de quanto o cadastro ainda
precisa ser completado) e os bairros sem ponto.

**5. Simulação de emancipação (a tabela que o responsável monta).** Os critérios são linhas de uma tabela do nível geral: o **indicador** (escolhido de uma
lista que o sistema sabe calcular), a comparação (**pelo menos**, **no máximo** ou, nos de sim/não, **precisa ser sim**), o valor, ativo ou não, a ordem e uma
observação. Pode-se criar, mudar, desligar e apagar linhas; cada mudança fica registrada (quem e quando). Indicadores: meses desde a abertura da Extensão;
membros em comunhão; Encarregado em comunhão (sim/não); obreiros consagrados entre os membros (auxiliar a pastor); dízimo confirmado dos membros na média dos
últimos 12 meses fechados; dizimistas (membros que deram dízimo nos últimos 12 meses); distância até a Mãe (km); nível do PSC homologado mais recente da Mãe.
Para cada Extensão ativa no alcance, a simulação mostra cada critério ativo com o valor medido e se atende, não atende ou **não dá para medir** (falta o dado:
sem data de abertura, sem ponto no mapa, Mãe sem PSC homologado); **atende tudo** só quando todos os ativos atendem. A simulação **só aponta**: quem decide
continua sendo a CME e a CLI pelo pedido da v9.2 (o atalho abre o pedido de emancipação já com a Extensão escolhida). Sem nenhum critério ativo, a tela diz
isso em vez de apontar. Para começar, a tabela vem com a régua média sugerida em 06/11 (2 anos de aberta, 50 membros em comunhão, Encarregado em comunhão, 1
obreiro, R$ 3.000 de dízimo médio) — ele muda ou apaga.

**6. O mapa do Google e a segurança.** O sistema roda com a política de segurança forte (CSP: só scripts dele mesmo). O mapa do Google precisa de scripts do
Google, então mora numa **página separada** (`mapa-territorial.html`), presa numa moldura dentro do sistema, com a política dela (só os endereços do Google
que o mapa usa) e sem o acesso de quem está logado: o sistema manda para a moldura só o que é para desenhar (os pontos e as contagens) e recebe dela só o clique
de marcar um ponto, conferindo a origem das mensagens dos dois lados. A chave do Maps fica nas configurações do servidor (`GOOGLE_MAPS_CHAVE_NAVEGADOR`), fora
do código público, e só é entregue a quem entra na pílula; ela precisa aceitar o endereço do sistema (`app.ieadespa.org.br`) e o da homologação no Google
Cloud. Sem a chave, ou se o Google recusar, a tela diz o motivo e fica na lista e desenho.

**7. Costuras.** Meus Dados mostra o endereço em linhas e os atos da pessoa no território (bairros cadastrados, critérios mudados, pontos marcados). ROPA: a
finalidade "planejamento territorial (contagem por bairro, sem nome)" no cadastro de membros; o cadastro de bairros e os critérios não têm dado pessoal. A
emancipação da v9.2 leva o ponto da Extensão para a congregação que nasce. O teste de tela ganha a pílula nova (base a aprovar, como na v9.4).

**Fora desta versão (escopo):** localizar a casa exata do membro (mandaria os endereços a um serviço de fora — o bairro basta para a cobertura), rota e tempo
de viagem (só a linha reta), o contorno desenhado dos bairros (o ponto central basta), a importação do cadastro antigo de membros (quando vier, já preenche as
linhas e o bairro) e aviso automático de Extensão que passou a atender os critérios (o painel mostra).

### Como ficou a v9.5

**Em produção desde 11/11/2026** (merge `0d16ee7`; para desfazer: `git revert -m 1 0d16ee7`). Parada de 09/11 a 10/11/2026 para o trabalho dos eventos
no site (PRs #58 a #64); retomada em 10/11 a partir do ponto seguro. Migração **170** (`Bairros`, o endereço do membro em
linhas em `MembroReferencia`, o ponto das Extensões em `ExtensoesTenda`, `TerritorioParametros` e `CriteriosEmancipacao` com a régua inicial semeada uma vez
só). Regra pura em `api/shared/territorio.js`, banco em `api/shared/territorioDb.js`, rota `/api/territorio/<ação>` (`GestaoTerritorio`). Tela: pílula
**Território** na aba Expansão (Mapa, Simulação de emancipação, Critérios, Pontos das Extensões e, no nível geral, Bairros), o endereço em linhas na Pessoas e
no Meus Dados (`app/modulos/endereco.js`), o cartão em Meus Dados e a página do mapa do Google à parte (`app/mapa-territorial.*`, moldura com sandbox e a
política de segurança só dessa rota). Casca do service worker **v56**.

**O que mudou do desenho (depois das duas revisões independentes — costuras: 3 médias, 5 baixas; conformidade: 1 alta, 3 médias, 6 baixas — tratadas):**

- **O mapa e a simulação contam membros:** o congregado e o novo convertido não entram (Estatuto Art. 7º, I: o congregado "não integra o quadro de membros"),
  o mesmo recorte do rol do PSC e da credencial; "em comunhão" é a régua do estatuto (em comunhão e sem disciplina), também para o Encarregado.
- **Unidade sem ponto não vira "descoberto":** o bairro cujos moradores são de uma congregação ou Extensão ainda sem ponto no mapa fica **"a conferir"**, sem
  o atalho de pedir Extensão, e o resumo avisa onde marcar o ponto (Extensão em Pontos das Extensões; congregação em Catálogos).
- **O dízimo na simulação:** só saem do servidor as medidas dos critérios ativos; com menos de 3 dizimistas na Extensão, o dízimo médio aparece só como
  "atende / não atende" (o valor seria o de uma pessoa). "Não dá para medir" diz o que falta.
- **O endereço não se perde:** o endereço antigo numa linha vai para a Rua quando a ficha abre (escolher o bairro não apaga a rua e o número); apagar todas as
  linhas apaga o endereço de propósito; o nome escrito que já é um bairro cadastrado vira o bairro da lista (não fica na fila para sempre) e editar o bairro
  liga a fila; a ficha grava o bairro travado (a renomeação do bairro e a ficha nunca se travam uma à outra, e a linha única sai com o nome novo); as UFs e o
  bairro "fora da lista" não somem quando a lista dos bairros chega depois da ficha.
- **O mapa do Google:** sem resposta em 20 s, volta à lista e desenho; no erro, a escolha guardada volta para a lista; a página do mapa confere a janela e a
  origem e só responde à origem do sistema; a tela só aceita uma chave com a forma de chave de verdade (a mesma regra do servidor — o teste de tela usa
  uma chave de mentira e a moldura ficava esperando o Google). A congregação que nasce da emancipação herda o ponto da Extensão só quando o pedido não
  trouxe outro endereço.
- Documentados a configuração da chave do Maps (`SECRETS.md`) e a exceção do script do Google (`docs/PLATAFORMAS.md`).

**Decisões tomadas por interpretação (o responsável pode mudar qualquer uma):** a localização é **pelo bairro** (ponto central marcado uma vez), não a casa
exata (o endereço nunca sai do sistema); a distância é em linha reta; o raio de cobertura começa em **3 km** (muda na sub-aba Critérios); a tabela de critérios
começou com a régua média sugerida (2 anos de aberta, 50 membros em comunhão, Encarregado em comunhão, 1 obreiro, R$ 3.000 de dízimo médio) — ele muda, desliga
ou apaga; o mapa conta só membros; o dízimo médio só aparece com 3 ou mais dizimistas; o Dirigente e o Pastor de Área veem os membros das congregações deles e
as unidades de todos; só o nível geral cadastra bairros, muda o raio e os critérios; o Dirigente da Mãe marca o ponto das Extensões; os atos em Meus Dados
mostram quem cadastrou e quem mudou por último (o histórico inteiro fica na auditoria). **Ação humana:** no Google Cloud, a chave do Maps precisa aceitar o
endereço do sistema (`app.ieadespa.org.br`) e o da homologação; e a chave precisa ser gravada nas configurações do Azure (`GOOGLE_MAPS_CHAVE_NAVEGADOR`, em
produção e na homologação). Até lá, a pílula funciona na lista e desenho.

**Provas:** jest 6.368; banco local (`bash rodar.sh preparar-territorio`): `e2e-78` 190 (a régua semeada uma vez, mesmo apagada; quem entra; o endereço em
linhas e a tela antiga; a fila; os bairros; os pontos; o mapa, o "a conferir", o descoberto pelo raio e o escopo do Dirigente; a densidade; os critérios; a
simulação com cada indicador medido de verdade, o congregado e o novo convertido fora, o dízimo oculto; a emancipação levando o ponto; a LGPD; os CHECK; lixo em
cada campo), `e2e-79` corridas 16 (17 quando a corrida deixa a sobra) e 17 ou 18 com o READ_COMMITTED_SNAPSHOT do Azure (inclusive a renomeação do bairro
com três fichas gravando nele); a bateria inteira do banco recriado do zero, do `e2e-1` ao `e2e-79`: 80 roteiros e 6.777 verificações ok — a sobra rara
do `e2e-79` achou um defeito do próprio roteiro (juntava no bairro B, que as junções cruzadas às vezes desativam; juntar num desativado é recusado de
propósito), corrigido e provado forçando a sobra (`61cd0c8`); e a `tudo.sh` agora recria as bases de partida antes de tudo (a primeira rodada de 10/11
usou as bases de 05/11, sem a 169 e a 170, e acusou a tabela `Bairros` faltando); tela (`tools/front-territorio`) 122, com
46 mutações acusadas (Expansão 83, Distritos 77, Missões 114 e Entidades 70 de novo); homologação: a primeira execução do teste de tela (42274057968) mostrou
só as diferenças de propósito (a pílula e a seção do Território e o endereço em linhas) e a base foi aprovada; a segunda (42276436948) teve 5 divergências só de
tempo (o aviso do Google sem resposta caindo em momentos diferentes), corrigidas pela chave com forma de chave e a base nova aprovada; a terceira
(42290840200) deu 1.277 e 155 ações iguais, 0 divergência e 0 violação de CSP; produção: o deploy `43019675987` aplicou a 170, a rota
`/api/territorio/mapa` responde 401 sem login, a casca é a v56 e a página do mapa tem a política própria com sandbox; o teste de tela `43019675966` deu 1.277 e
155 ações iguais, 0 divergência e 0 violação de CSP.

## v9.6 — Parcerias públicas, CEBAS e projetos sociais *(7ª rodada — fora do plano em 11/11/2026)*

**FORA DO PLANO por decisão do responsável (11/11/2026): "se não melhora o financeiro, pode deixar quieto".** A igreja não tem convênio com dinheiro
público hoje. A comparação que embasou a decisão: o MROSC (Lei 13.019/2014, Art. 2º, I, "c") aceita organização religiosa em parceria para projeto
social distinto do culto (em geral por uma associação própria — cabe nas entidades vinculadas da v9.1), e o CEBAS é, em regra, para a entidade cuja
atividade principal é a assistência; o financeiro já tem a essência do que a lei pede (fundo restrito que só se gasta na finalidade, orçamento com
previsto × realizado, contas a pagar com comprovante e alçada, demonstrações na ITG 2002, trilha de auditoria inviolável, parecer do Conselho Fiscal e
prazo de prestação de contas). O que só um convênio exigiria, se um dia vier: (1) a conta bancária só da parceria; (2) o plano de trabalho aprovado, com
metas e itens de gasto, cada despesa ligada a um item; (3) o relatório de execução do objeto com as provas (fotos, lista de presença) e o financeiro;
(4) a devolução do saldo com o rendimento; (5) a divulgação da parceria no site (Art. 11); e, se a entidade social tiver CEBAS ou títulos de utilidade
pública, o alerta de vencimento. Nada disso muda o financeiro do dia a dia.

## 🔒 Trava de Revisão 9-B — antes de encerrar a FASE 9 e avançar para a FASE 10

Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da seção 3).
Audita v9.4 e v9.5 pelas 5 perguntas do checklist (a v9.6 saiu do plano em
11/11/2026), e faz uma varredura final na FASE 9 inteira antes de fechar.

- [ ] **EM ANDAMENTO (11/11/2026, ramo `trava-9b`)** — auditoria de v9.4 e v9.5 e varredura da FASE 9. Duas revisões independentes, só de leitura: uma das
  costuras (Missões e Território entre si e com o sistema antigo: a vacância, o dinheiro, a LGPD, o escopo, os avisos) e outra da conformidade (o Estatuto, o
  Regimento, o plano, o README). **Um achado alto (o dinheiro da vacância) e os médios e baixos — todos os que o código resolve, corrigidos com teste**
  (migração 171; `e2e-80`, 48 verificações; casca v57). As 5 perguntas: *(a completar na entrega)*.

  O que mudou:
  - **A vacância não solta mais os meses parados (alto).** Antes, o envio encerrado pela vacância dispensava TODO relatório e ignorava o impedimento de todos os
    meses: os meses suspensos por falta de relatório, ou parados pelo processo disciplinar que terminou na saída, ficavam "a gerar" e seriam pagos. Agora só o
    relatório ainda no prazo no dia da vacância é dispensado, e os meses em que o processo já corria ficam impedidos (não se pagam); o mês da vacância segue pago.
  - **Todo sustento passa pela CLI (médio, Estatuto Art. 58 §4º).** O pagamento a obreiros só não é distribuição de resultado (§3º) com a prévia aprovação da
    CLI: o envio com sustento, inclusive o Local, vai à CLI (sem a CME) antes do Presidente; o **aumento** do sustento cita a reunião da CLI que o aprovou
    (gravada com o valor, migração 171); a redução e a troca de quem recebe não pedem. O reajuste para pessoa jurídica (convênio externo) passa a conferir a CME
    e a CLI.
  - **O congregado não é membro (médio, Estatuto Art. 7º, I).** Missionário, Encarregado, Interventor e dirigente de entidade seguem uma régua só
    (`membroEmComunhao`): antes só o "sem comunhão" era recusado, e o congregado passava (o Encarregado aceito na v9.2 aparecia como "não atende" na v9.5).
  - **O caixa da mantenedora (médio).** A mantenedora não muda (nem sai) enquanto um envio tira o sustento do caixa dela — o Presidente reajusta a fonte antes;
    a mantenedora sob tutela (Extensão da Tenda) deixa o mês impedido já na prévia (antes nascia a Saída que o pagamento barrava).
  - **A edição do campo tem versão (médio, migração 171).** O formulário velho não desfaz a mudança do outro (a divulgação RESTRITA voltava a PÚBLICA).
  - **Conflito de interesse (médio).** O próprio missionário não dá o parecer, não registra a decisão, não concorda, não reajusta nem lança ou corrige o relatório
    do próprio envio.
  - **O que o titular vê (médio, LGPD Art. 18).** O cartão de Missões em Meus Dados mostra a justificativa, o parecer, as decisões, a desistência, o
    encerramento e os pagamentos que a API já entregava.
  - **Os baixos.** A CME que só é CME não vê o sustento nem os relatórios também na lista; gerir como SEMIADESPA exige a permissão `missoes` (antes o Secretário
    sem a permissão geria pela API); a decisão da CLI pede a confirmação recente; o sustento e a prebenda não disparam o alerta de fracionamento; o missionário
    no campo não vira item de afastamento no Cuidado Pastoral; a pílula Extensões conta só os membros ativos (o recorte do mapa); o motivo da vacância cita o
    artigo do caso (Regimento Art. 95 §2º na decisão disciplinar, Art. 157 §2º na licença, Estatuto Art. 11 §7º na saída do rol); o ROPA de Expansão, Distritos
    e Missões no Art. 11, II, "d" da LGPD; a v9.6 não é mais chamada de "futura" na tela da Assistência Social; a ajuda da aba Expansão fala do Território; o
    README (as tabelas que "ainda não existem", os 41 módulos).
  - **O equipamento.** O `e2e-79` juntava num bairro que a corrida às vezes desativa (defeito do roteiro, `61cd0c8`); a `tudo.sh` recria as bases de partida
    sozinha; a bateria completa fica para as Travas e cada versão roda a rápida (decisão do responsável, 11/11/2026).

  **Decisões que o responsável pode mudar** (o sistema já está fazendo assim):
  - **Missões (v9.4):** a "determinação expressa da Mesa Diretora" (Reg. Art. 134 §6º, I) é a concordância do Pastor Presidente; a frente Local fica com a
    SEMIADESPA sem a CME (Art. 44 §1º) — com sustento, a CLI aprova; outra cidade do Pará passa pela CME e pela CLI (o Art. 44 §2º só fala de outro Estado e
    país); pagar a pessoa jurídica é convênio externo; a zona rural adjacente inclui a de seis municípios vizinhos; o parecer da CME é registrado por um membro
    e o Líder Geral da SEMIADESPA conta na CME; o sustento sai do Tesouro Geral ou do caixa da mantenedora (nunca do da SEMIADESPA, Art. 133-C §1º); a licença
    de candidatura para o sustento sem encerrar o envio; o relatório vence no dia 10 do mês seguinte e a suspensão segue o Art. 133-C §2º por analogia; a
    urgência por 2/3 (Art. 24 §2º) vale para o envio; o mês da vacância é pago (também na exclusão e na Disciplina Rigorosa), mas não os meses em que o
    processo já corria; o missionário não precisa ter o cargo de Missionário nem ser obreiro; a retenção de INSS e IR sobre o sustento fica fora (o Art. 134
    §3º trata da prebenda); o missionário no campo continua na contagem de faltas da CLI (Art. 27) e no aviso de ausência da EBD (a justificativa ou a saída
    da turma é ato humano).
  - **O sustento a outro país × Estatuto Art. 58 §3º** ("aplicando-os integralmente, no território nacional"): o Regimento (Art. 44 §2º) prevê o envio a outros
    países com a CLI e o Presidente; o sistema aceita o sustento Transcultural e o painel de imunidade avisa. Se a leitura for a de que o §3º proíbe, basta
    não aprovar sustento Transcultural (ou pedir para o sistema bloquear).
  - **O CRA decide onde abrir frentes missionárias (Regimento Art. 126-B, II, "a"):** sem Região ativa, a Sede acumula a função (Art. 126-O §1º) e a SEMIADESPA
    abre a frente Local com autonomia (Art. 44 §1º); quando houver Região ativa, o parecer do CRA entra no pedido.
  - **Território (v9.5):** localização pelo bairro, linha reta, raio de 3 km, a régua inicial dos critérios; o mapa conta o membro sem comunhão e os obreiros só
    entre os em comunhão; o dízimo médio só com 3 ou mais dizimistas; o Dirigente e o Pastor de Área veem os membros das congregações deles e as unidades de
    todos; só o nível geral cadastra bairros e critérios, e o Dirigente da Mãe marca o ponto da Extensão; a congregação nascida da emancipação herda o ponto só
    quando o pedido não trouxe outro endereço.
