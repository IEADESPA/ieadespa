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

- [ ] Abertura de Extensão da Tenda (nível 0) por congregação-mãe.
- [ ] Emancipação de Extensão → Congregação (CLI).
- [ ] **CME** — Comissão de Missões e Expansão Estratégica (Regimento, Art.
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
Missões). O Dirigente vê e pede só para a congregação dele; a CME e o nível geral veem tudo; a decisão da CLI é só do nível geral. Tela: card novo **"Expansão"**
no portal, com Painel, Pedidos (lista e ficha) e Extensões. ROPA e política de retenção atualizadas (os atos de abertura e emancipação são a certidão de
nascimento da unidade e ficam).

## v9.3 — Distrito e macroexpansão

- [ ] Ativação de Distrito (nível 5) com autonomia financeira + dízimo institucional 10%.
- [ ] Blindagem contra desvinculação (intervenção imediata).

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
