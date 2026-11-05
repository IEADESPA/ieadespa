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

## v9.4 — Missões: campos, missionários e prestação de contas *(7ª rodada)*

O risco real em missões não é falta de recurso — é **sustento enviado sem
relatório recebido**, que é exatamente o que a Assembleia cobra e ninguém
consegue responder com número.

- [ ] Cadastro de campo missionário (local, status, congregação mantenedora) e de
      missionário sustentado, com valor mensal amarrado ao Contas a Pagar (v4.5) e
      ao Rateio Geral (v4.10).
- [ ] **Relatório de campo com periodicidade obrigatória** (batismos, atividades,
      pedidos) — e **relatório atrasado sinaliza/suspende o repasse**, mesma
      lógica do balancete departamental (v5.4). Não é punição: é a condição que a
      própria prestação de contas à Assembleia exige.
- [ ] Painel de missões alimentado pelos mesmos dados, sem redigitação — inclusive
      para exibição pública/mural.
- [ ] Conexão com a CME (Comissão de Missões e Expansão, v9.2).
      *(MissionaryConnect; Missions21)*

## v9.5 — Mapa territorial e inteligência de expansão *(7ª rodada)*

- [ ] **Mapa de cobertura**: onde há membros cadastrados sem congregação próxima —
      insumo direto e objetivo para abertura de Extensão da Tenda (v9.2), em vez
      de decidir por percepção.
- [ ] Densidade de membresia por região e distância média até a congregação de
      vínculo.
- [ ] Simulação de emancipação: quais Extensões já atendem os critérios para virar
      Congregação, calculado a partir dos dados que já existem (membresia, PSC da
      v7.1, arrecadação da FASE 4). *(Churchteams; GroupVitals — group finder)*

## v9.6 — Parcerias públicas, CEBAS e projetos sociais *(7ª rodada)*

Só se aplica se a igreja mantiver ação assistencial estruturada (v5.9) — mas se
mantiver, há um regime jurídico próprio que hoje não tem nenhuma cobertura.

- [ ] **Contabilidade segregada por parceria/convênio** (exigência do MROSC,
      Lei 13.019/2014) — centro de custo carimbado por termo de fomento ou
      colaboração, reaproveitando o motor de Centro de Custo da FASE 4.
- [ ] Prestação de contas no formato MROSC: relatório de execução do objeto +
      execução financeira, com prazos e alertas.
- [ ] Controle de vigência e renovação de certificações (**CEBAS** — LC 187/2021;
      Utilidade Pública Federal/Estadual/Municipal; inscrição no CMAS/CNEAS),
      com alerta antecipado — certificação vencida derruba benefício fiscal.
- [ ] Requisitos cumulativos do CEBAS monitorados de forma contínua, não
      conferidos só na hora de renovar.

## 🔒 Trava de Revisão 9-B — antes de encerrar a FASE 9 e avançar para a FASE 10

Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da seção 3).
Audita v9.4 a v9.6 pelas 5 perguntas do checklist, e faz uma varredura final
na FASE 9 inteira antes de fechar — v9.6 (CEBAS/MROSC) lida com parceria
pública, então consistência de dado aqui tem peso extra.
