# FASE 8 — Ministerial (AFM)

> Histórico e checklist desta parte do plano de versões. As referências a “seção 2.x” e “seção 4” apontam para o
> [README](../../README.md); cada versão tem seu lugar no [índice do plano](INDICE.md).

## v8.1 — AFM (Academia de Formação Ministerial) e CLI: comparecimento e perda de assento (a antiga v7.9)

- [x] Cadastro de Reitor + Corpo Docente.
- [x] Matrícula obrigatória de oficiais (Auxiliares→Pastores/Missionários).
- [x] Matrícula Ativa × Inativa (desmatriculado perde licença de oficiar).
- [x] Níveis de escolaridade: Básico, Médio, Avançado, Bacharel Livre.
- [x] **CDER** — Comissão de Doutrina e Educação Religiosa (Regimento, Art. 22):
      Reitor da AFM + 2 mestres de teologia da CLI. Vinha adiada de v2.4
      (Comissões Permanentes) porque dependia do Reitor, que nasce aqui —
      construir junto com o cadastro de Reitor deste item, reaproveitando
      `shared/comissoes.js` (mesmo padrão de CFO/CEP: calculada quando dá).

> **Fusão decidida pelo responsável em 15/10/2026:** a antiga **v7.9** da FASE 7 foi movida **na íntegra** para cá e passa a fazer parte desta versão. A v8.1 vira uma
> **mega fase**: o módulo da AFM (cadastro de Reitor e docentes, matrícula, escolaridade, CDER) **e** a contagem de faltas da CLI construídos juntos, porque a contagem
> depende de saber quais sessões da CLI são também sessões da AFM (Art. 69). Ver também a nota sobre o contador único de faltas em [fase-2-governanca.md](fase-2-governanca.md).
>
> **Ponto de projeto que estava em aberto — resolvido pelo próprio Regimento (27/10/2026):** o texto da v7.9 abaixo dizia que as sessões da CLI **integradas com a AFM ficam fora**
> da contagem de 3 faltas; a nota “v0.3” da fase 2 dizia que as faltas da CLI e da AFM deveriam **somar**. O Regimento, Art. 69 §1º, fecha a questão: “I — a presença comprovada
> na palestra da Academia **valida automaticamente a presença na reunião da Câmara**; II — a ausência na Academia contabiliza **falta dupla**, sendo na escola e na câmara”. Ou
> seja, a sessão integrada **conta** para a CLI (vale a nota da fase 2, não o “excluindo” da v7.9). O desenho abaixo segue o Art. 69.

### Desenho da v8.1 (contrato, 27/10/2026)

Base legal: Estatuto Art. 15 §1º e Art. 27; Regimento Art. 22, 66 a 69, 72 e 149. Tudo que o Regimento manda “automaticamente” é **apurado pelo sistema** a partir das presenças
(nunca marcado à mão); o que é ato de alguém (nomear o Reitor, reprovar, readmitir) é registrado por quem tem a permissão nova **`afm`** (ou `reunioes`, no caso da CLI), com
auditoria.

**1. Tipo da reunião da CLI.** Ao abrir uma reunião da CLI a Secretaria escolhe: **Ordinária** (a mensal, conta falta), **Extraordinária** (Regimento Art. 147 §2º — registra
presença, **não** conta para as 3 faltas, porque o Estatuto Art. 27 fala das “reuniões mensais”) ou **Sessão Magna da AFM** (Art. 69 — a reunião trimestral integrada à
Academia). O Seminário de novembro (Art. 70 §1º) virou um tipo próprio: ver "Como ficou". Na Sessão Magna esperam-se **duas turmas ao mesmo tempo**: quem compõe a CLI **e** todo obreiro com
matrícula ativa na AFM. Um único registro de presença vale para as duas (Art. 69 §1º, I); a falta de quem está nas duas conta nas duas (falta dupla, §1º, II). Cada presença
guarda se a pessoa era esperada pela CLI e/ou pela AFM **naquele dia**, para que quem virou Presbítero depois não herde falta da época de Diácono.

**2. Três faltas seguidas na CLI (Estatuto Art. 27 §1º).** Conta só reuniões **ordinárias** e **Sessões Magnas** em que a pessoa era da CLI. Presença ou falta justificada
**interrompe** a sequência (é sanção: lê-se de forma restrita — as 3 faltas sem justificativa têm de ser em reuniões seguidas). Na 3ª o sistema **registra a exclusão** (data,
as 3 reuniões e por onde a pessoa entrava na CLI) e ela **sai da composição da CLI** na hora — inclusive quem entra por Ordenação, **sem perder o cargo ministerial** (perder a
cadeira na Câmara ≠ deixar de ser Pastor). Depois disso:

- **Avisos:** a pessoa recebe aviso na 2ª falta seguida (“mais uma e você perde a cadeira”) e na exclusão; a Secretaria Geral recebe a exclusão.
- **Providências que a tela mostra (Art. 27 §2º e Regimento Art. 56 §2º)** conforme por onde a pessoa entrava: cargo **eletivo** da Diretoria Executiva ou do Conselho Fiscal → a
  Secretaria **comunica à CLI**, que aprecia e convoca **AGE de destituição em até 30 dias** (o sistema mostra o prazo e aponta para “Convocar Assembleia” com a matéria
  “Destituição”, que já existe — não convoca sozinho); função de **livre nomeação** (Dirigente, Líder de departamento) → o Pastor Presidente substitui o titular. O sistema
  **não** fecha cadeira nem tira acesso sozinho: aponta a providência e registra quando a Secretaria comunicou a CLI.
- **Justificativa aceita depois:** se uma das 3 faltas for justificada mais tarde e a sequência deixar de existir, a exclusão é **anulada automaticamente** (com registro).
- **Volta (Regimento Art. 149 §1º):** só por novo processo de admissão — a Secretaria registra a **readmissão** com a data e o ato (ata/deliberação); a contagem recomeça dali.
- **Início da contagem:** só contam as reuniões a partir da entrada da v8.1 no ar — as reuniões antigas não tinham o catálogo de justificativas nem o tipo da reunião, e ninguém
  pode ser excluído por uma regra que ainda não estava no sistema.

**3. Catálogo fechado de justificativa (Regimento Art. 149 §2º)** — vale para as reuniões da CLI (inclusive a Sessão Magna), tanto no pedido do próprio obreiro (Meu Painel)
quanto quando a Secretaria justifica. Motivos aceitos: **problema de saúde** (próprio ou de dependente), **viagem profissional civil**, **luto**, **emergência familiar grave** e
**outro fator externo à rotina da igreja** (descrever). Motivos **vedados aparecem bloqueados na própria tela**, com o artigo: atividade de serviço na igreja, escala em
congregação, evento de departamento, ação em entidade vinculada. O servidor recusa um motivo vedado ou fora do catálogo. Na Sessão Magna a Secretaria confirma que viu o
**documento** (Art. 69 §2º, I: “justificativa legal documentada”). A tela pede para **não escrever diagnóstico** (dado de saúde).

**4. AFM — cadastro e matrícula.**

- **Reitor (Art. 68):** nomeado pelo Pastor Presidente, registrado pela Secretaria com a data da **homologação técnica da CLI**; mandato até **31/12** do ano (exercício fiscal =
  ano civil, Estatuto Art. 30 §2º), recondução sem limite; vencido o mandato sem recondução, a Reitoria aparece **vaga**. Um Reitor por vez (garantido no banco).
- **Corpo docente (Art. 68):** mestres com a titulação registrada; entram e saem com data.
- **CDER (Art. 22):** Reitor (calculado do cadastro acima) + **2 mestres de teologia da CLI** cadastrados na tela de Comissões (mesmo padrão da CCJ; a pessoa precisa estar na
  composição da CLI no dia).
- **Matrícula obrigatória (Art. 66 §2º):** todo oficial (Auxiliar, Missionário, Diácono, Presbítero, Evangelista, Pastor) é matriculado **automaticamente** — ninguém
  precisa lembrar de matricular. A tela mostra a lista com situação e nível.
- **Nível de escolaridade (Art. 72):** Básico, Médio, Avançado, Bacharel Livre, “cursando” ou “concluído”; a tela avisa quem está **abaixo do exigido para o cargo** (Auxiliar:
  Básico; Missionário e Diácono: Médio; Presbítero: Avançado ou Bacharel; Evangelista e Pastor: Avançado ou Bacharel **concluído**). Barrar a promoção é da v8.2.
- **Ativa × Inativa (Art. 66 §2º, II e Art. 69 §§2º–3º):** a matrícula fica **inativa** (a) **sozinha**, na 3ª Sessão Magna seguida sem justificativa aceita (mesma apuração e
  mesma anulação automática da CLI), ou (b) por **reprovação técnica** registrada pela AFM. Inativo = “Obreiro Inativo”: **mantém o título**, perde a licença para oficiar e
  os poderes administrativos. No sistema: (i) **não pode ser oficiante de turma de batismo** (o único ato em que o sistema escolhe o oficiante pela matrícula — casamento e
  apresentação guardam o nome em texto livre e mostram o aviso); (ii) quem está na CLI **por Ordenação** sai dela enquanto inativo (Estatuto Art. 15 §1º, I: “desde que
  devidamente credenciados”); (iii) se tem acesso de liderança, a tela aponta a providência “retirar o acesso” (Art. 69 §3º) — não tira sozinho, para nunca trancar a
  Secretaria fora por engano. **Volta:** nova matrícula com a data da **aprovação no curso de reciclagem** (Art. 69 §3º); a contagem recomeça.

**5. Onde aparece.** Aba nova **Academia (AFM)** (permissão `afm`: Matrículas, Corpo docente, Sessões Magnas); na CLI, um quadro **Faltas e cadeiras** (quem está com 1 ou 2
faltas seguidas, exclusões com providências, readmissão); no **Meu Painel**, a situação da pessoa (“faltas seguidas na CLI: 2 de 3”, matrícula ativa/inativa e nível).

### Como ficou (entregue em 27/10/2026)

**Em produção desde 27/10/2026** (merge `e4e5ea2`; para desfazer: `git revert -m 1 e4e5ea2`). Migração **156**; regra pura em `api/shared/afm.js`, banco em `api/shared/afmDb.js`, rota `/api/afm/<ação>` (`GestaoAFM`), tela em `app/modulos/afm.js` (aba
**Academia (AFM)** em Vida Eclesiástica; quadro **Faltas e cadeiras** em Órgãos Centrais → CLI; catálogo da justificativa na frequência e no Meu Painel; CDER em Comissões),
casca do service worker **v42**. A apuração roda ao encerrar a reunião, ao justificar, recusar pedido ou corrigir presença, ao marcar "não conta falta" e, como rede de
segurança, na rotina das 7h (que também apaga o detalhe escrito das justificativas com mais de 2 anos). Avisos: `CLI_FALTAS_ALERTA`, `CLI_EXCLUSAO_FALTAS`,
`AFM_FALTAS_ALERTA`, `AFM_DESMATRICULA` (obrigatórios) e `AFM_REITORIA`.

**O que mudou no desenho depois das duas revisões independentes** (servidor: 1 crítico, 4 altos, 9 médios, 8 baixos; tela: 5 médios, 9 baixos — todos tratados):

- **Só o nível geral** (Secretaria Geral) abre e encerra reunião da CLI, justifica, recusa pedido, corrige presença e marca "não conta falta". Antes, um Dirigente (que tem
  "reuniões" na congregação) conseguiria abrir e encerrar 3 reuniões da CLI em minutos e excluir todo mundo. E **ninguém justifica nem corrige a própria falta** (Estatuto
  Art. 27 §1º: a justificativa é apresentada à Secretaria).
- **O tipo da reunião da CLI é obrigatório** e **só uma reunião que conta falta por dia** (Regimento Art. 79, III, b: a da CLI ou da AFM é no último domingo). A reunião
  aberta ou encerrada por engano é marcada pelo nível geral como **"não conta falta"** (com o motivo; não se desfaz) e a apuração é refeita na hora.
- **Seminário de novembro** é um tipo próprio: conta para a Academia, **não para a CLI** (Art. 70 §1º: "suspende-se a pauta administrativa ordinária da CLI").
- **Período fora interrompe a sequência:** reunião que conta, mas em que a pessoa não era esperada (fora da CLI, sob disciplina, ainda não oficial), quebra a contagem —
  duas faltas de 2026 e uma de 2028, depois de anos fora, não somam 3.
- **Pedido de justificativa pendente segura a exclusão** até a Secretaria decidir; recusado, a apuração refaz e exclui. O pedido sozinho não desfaz uma exclusão já feita.
- Se as faltas da sequência mudam e ela continua chegando a 3 (apuração atrasada), a exclusão é **refeita** com as reuniões e a data certas (o prazo da AGE corre da nova).
- **Quórum e minuta de ata da Sessão Magna contam só a Câmara** (antes somavam os Auxiliares e Diáconos que bateram ponto na palestra).
- O **documento** da justificativa (Art. 69 §2º, I) só é exigido de quem a Academia esperava; para quem é só da CLI, basta o escrito (Estatuto Art. 27).
- **Dado de saúde:** a trilha de auditoria guarda só o código do motivo; fora do nível geral a frequência mostra só "justificada"; a ata leva o rótulo, nunca o detalhe.
- A **CEI** passou a exigir a matrícula ATIVA (Art. 72) e a **rematrícula leva o Certificado de Habilitação** junto. O papel "Reitor da AFM" (Global) não corrige marco
  de ninguém (`EditarMarcoMembro` exige "pessoas"). O quadro da CLI (faltas e exclusões da igreja inteira) é só do nível geral.
- A citação do Regimento sobre a perda por tabela é o **Art. 56 §2º** (o rascunho dizia "Art. 310", que era o número da linha do arquivo, não do artigo).
- Tela: o tipo volta a "Ordinária" depois de abrir; atos só com o "geral" da permissão `afm`; o quadro da CLI é relido depois de cada ato; a tela limpa ao sair e
  descarta resposta atrasada de outro login; cada botão da frequência leva o tipo da própria reunião (sem corrida); detalhe até 250 caracteres (cabe inteiro); duplo
  clique, foco, rótulos e o campo de data no celular.

**Decisões tomadas pelo Regimento ou por interpretação (o responsável pode mudar qualquer uma):** a sessão integrada à AFM conta para a CLI (Art. 69 §1º); falta justificada
interrompe a sequência; Extraordinária não conta (Estatuto Art. 27, "reuniões mensais"); só contam as reuniões abertas depois da v8.1 no ar; a exclusão não fecha cadeira
nem tira acesso sozinha (aponta as providências: comunicar a CLI, AGE em 30 dias para cargo eletivo, substituição pelo Presidente na livre nomeação); o inativo na AFM sai da
CLI por Ordenação e não oficia batismo, e o aviso à AFM aponta a retirada do acesso de liderança (não é automática, para nunca trancar a Secretaria fora); a presença na
reunião continua sendo marcada na portaria com a matrícula e a senha da sala (quem marcar presença por outro só livra a falta dele — não cria falta para ninguém — e a
Secretaria corrige à mão).

**Provas:** jest 6.082 testes; banco local (LocalDB, `bash rodar.sh preparar-afm`): `e2e-47` fluxos 212, `e2e-48` segurança e lixo 104, `e2e-49` corridas 19 (a corrida
achou a comissão passando do limite com 4 inclusões ao mesmo tempo — CCJ, PMO e CDER passaram a contar e gravar sob trava), `e2e-50` o que a revisão do servidor pediu 48;
tela (`tools/front-afm`, com as respostas reais gravadas pelo `e2e-47`) 80, com duas mutações acusadas.

### Absorvido da antiga v7.9 — CLI: comparecimento obrigatório e perda de assento por faltas (Art. 27)

Movido de v2.3 de propósito — ver nota lá. Constrói **junto** com v8.1 (AFM),
não antes: precisa primeiro saber marcar uma sessão da CLI como "integrada com
AFM" (Art. 69) pra não contar errado a cada 3 meses.

- [x] 3 faltas consecutivas sem justificativa aceita nas reuniões da CLI
      (excluindo as integradas com AFM — *texto original; superado pelo Art. 69 §1º: as
      integradas contam, ver o desenho acima*) = perda automática do assento (Art. 27
      §1º) — calculado a partir de `Presencas`, igual mandato vencido de
      Assento (nunca marcação manual). Quem entra por Ordenação (Pastor/
      Evangelista/Presbítero) precisa de um jeito de sair da composição da CLI
      sem perder o `CargoMinisterial` (são coisas diferentes: perder assento
      na Câmara ≠ deixar de ser Pastor); quem entra por Função já sai
      naturalmente encerrando o Assento (mecanismo já existe).
- [x] Art. 27 §2º: se a exclusão for de quem está na CLI por cargo eletivo da
      Diretoria Executiva ou Conselho Fiscal, a CLI aprecia e, sendo o caso,
      convoca AGE de destituição em até 30 dias (matéria "Destituição", já
      existente desde v2.2) — o sistema só aponta pro fluxo existente, não
      automatiza a convocação.
- [x] **Taxonomia fechada de justificativa de falta** (Art. 149 §2º, gap da
      varredura): só fator externo justifica — **escala ou evento de departamento
      não é justificativa válida**. Catálogo com os motivos vedados bloqueados na
      própria tela, não conferidos depois por alguém que talvez não conheça o §2º.

## v8.2 — Escada ministerial e ascensão

- [x] Escada: Membro → Auxiliar → Missionário → Diácono → Presbítero → Evangelista → Pastor.
- [x] Interstícios e requisitos por cargo (idade, tempo, escolaridade, batismo no Espírito).
- [x] Veto técnico da AFM (CHM) + soberania presidencial.

### Desenho da v8.2 (contrato, 28/10/2026)

Base legal: Regimento Art. 66 §§3º–5º, 67, 71, 72, 73 e 74; Estatuto Art. 6º e 23. Hoje a esteira de consagração (protocolo → Conselho → Plenário → concluído, `CriarConsagracao`
e `EvoluirConsagracao`) troca o cargo de quem chega ao fim **sem conferir requisito nenhum** além da formação da v6.9. A v8.2 põe a escada **dentro** dessa esteira: o sistema
confere os requisitos ao protocolar e **de novo a cada avanço** (um requisito que deixou de valer no meio do caminho trava a etapa seguinte; reprovar nunca é travado).

**1. A escada (Art. 71).** Membro → Auxiliar → Missionário(a) → Diácono → Presbítero → Evangelista → Pastor. O cargo de destino vem do tipo de consagração (catálogo
`TiposConsagracao`, campo "cargo resultante"; a migração cria os tipos que faltam: Auxiliar, Missionário(a) e Pastor). **Vedada a queima de etapas:** só se sobe para o degrau
seguinte ao cargo atual. Missionário(a) fica entre Auxiliar e Diácono para todos (o Art. 72, III fala em "patente anterior"). **Missionária é o teto para obreiras** (Art. 71,
III) — por isso o cadastro ganha o campo **Sexo**; sem ele preenchido, não se sobe acima de Missionário(a).

**2. Requisitos por degrau (Art. 72 e 73)** — cada um aparece numa lista com ✔ atende, ✖ falta, ⚠ aviso (não trava) e o artigo:

| Para | Requisitos que travam | Avisos (não travam) |
| --- | --- | --- |
| Todos | membro ativo em plena comunhão, sem disciplina em curso e sem carta de mudança emitida; dizimista fiel (Art. 72, *caput*); matrícula da AFM não inativa; CHM válido (Art. 67 §1º; Art. 74, I) | divorciado(a): escrutínio especial do CEI antes da consagração (Art. 73, III, b) |
| Auxiliar | 17 anos; 1 ano de membresia ininterrupta (data da última recepção — Regimento Art. 131 §4º, II); matriculado na AFM cursando o Básico | — |
| Missionário(a) | 1 ano como Auxiliar; Médio cursando | — |
| Diácono | 2 anos como Missionário(a); **Batismo no Espírito Santo** (marco do perfil); Médio cursando; sexo masculino | — |
| Presbítero | 2 anos como Diácono; Avançado ou Bacharel cursando | menos de 30 anos ("idade preferencial") |
| Evangelista e Pastor | só por **indicação do Pastor Presidente** (Art. 72, V, a); Avançado ou Bacharel **concluído** (V, b) | homologação da CIADSETA; Pastor não casado ("exige-se, geralmente" — Art. 73, II) |

Dado que falta no cadastro (data de nascimento, data de admissão, sexo, dízimo, data de entrada no cargo atual) **não conta como atendido**: o item aparece como "falta o
dado" e trava, como já faz a capacidade eleitoral (Estatuto Art. 23). "Idoneidade moral" (1 Tm 3) e a castidade não são dados do sistema: são do parecer do CEI (v8.3).

**3. Tempo no cargo (interstício).** Nasce o histórico de cargos (`CargosMinisteriaisHistorico`): de quando a quando cada pessoa ocupou cada cargo e por onde chegou
(consagração, nomeação do Presidente, outra convenção, cadastro). A consagração concluída fecha a linha anterior e abre a nova com a data. Para quem já tem cargo, a migração
aproveita a data da consagração concluída quando existe; senão a data fica em branco e a **Secretaria informa "no cargo desde"** no cadastro da pessoa.

**4. Quem pode trocar o cargo fora da esteira.** Hoje quem tem a permissão "pessoas" numa congregação troca o cargo ministerial no cadastro — inclusive para Pastor, o que
põe a pessoa na CLI por Ordenação. Passa a ser **só o nível geral** (a Secretaria, para importar e corrigir o cadastro), e toda troca entra no histórico.

**5. Modalidades do processo.** **Indicação** (o comum: JAI e Dirigente, Art. 74, II — tudo vale, inclusive o veto da AFM); **Nomeação direta do Pastor Presidente** (Art. 66
§4º — só o nível geral registra, com a referência do ato; dispensa os requisitos **técnicos** — escolaridade, CHM e matrícula de candidato — e a AFM não veta; o obreiro fica
em **nivelamento obrigatório** depois da posse, §5º, e aparece assim na Academia até atingir o nível do cargo. Os demais requisitos continuam valendo, e para Evangelista e
Pastor o curso concluído também, porque o Art. 72, V, b é regra própria do cargo que só nasce por indicação presidencial); **Ministro de outra convenção** (ver "Como ficou": dispensa também o técnico) (Art. 71, parte
final — já ordenado fora: dispensa o degrau e o interstício; só o nível geral, com a igreja ou convenção de origem).

**6. Veto técnico da AFM (Art. 66 §3º e 67 §2º).** Quem tem o nível geral da permissão `afm` vê na aba Academia os processos por **indicação** em andamento e pode **vetar**
um, com o motivo (reprovou na avaliação bíblica, regimental ou litúrgica; não atinge o requisito técnico). O veto encerra o processo (fica "vetado pela AFM"); nova indicação
só por novo protocolo. Nomeação direta do Presidente não aparece para veto. A AFM também passa a **conceder e revogar o CHM** de cada matrícula (com a data) e a **matricular
candidatos** que ainda não são oficiais (o membro que vai a Auxiliar precisa estar cursando o Básico) — o candidato não entra na contagem de faltas das Sessões Magnas, que
continua sendo dos oficiais.

**7. Onde aparece.** Consagrações: escolher a modalidade, botão **"Conferir requisitos"** (lista antes de protocolar) e, se travar, a lista do que falta; na lista dos
processos, a modalidade e o veto. Cadastro da pessoa: **Sexo** e **"No cargo desde"** (este só no nível geral). Academia: CHM, candidatos, nivelamento obrigatório e os
processos que podem ser vetados.

### Como ficou (entregue em 28/10/2026)

**Em produção desde 28/10/2026** (merge `9ee1968`; para desfazer: `git revert -m 1 9ee1968`). Migração **157**; regra pura em `api/shared/escada.js`, banco em `api/shared/escadaDb.js`, rota nova `/api/escada/requisitos` (`RequisitosEscada`) e as ações `vetaveis`,
`chm`, `matricular-candidato` e `vetar` em `/api/afm/<ação>`; `CriarConsagracao`, `EvoluirConsagracao`, `ListarConsagracoes`, `GestaoPessoas`, a vacância e a minimização
mudaram. Tela: Consagrações (modalidade, "Conferir requisitos", destino e veto na esteira), cadastro (Sexo, "No cargo desde"), Academia (coluna CHM, filtros "Nivelamento
obrigatório", "Sem CHM" e "Candidatos", seção **Escada e veto**), Meus Dados (histórico de cargos). Casca do service worker **v43**. O login passou a dizer em quais
permissões a pessoa é do nível geral (`permissoesGerais`): a tela não oferece a quem é geral só no financeiro o que é do geral das consagrações ou do cadastro.

**O que mudou depois das duas revisões independentes** (servidor: 2 altos, 5 médios, 9 baixos; tela: 1 alto, 4 médios, 8 baixos — todos tratados):

- **Ninguém mexe no que conta para a própria escada:** protocolar, avançar, conceder CHM, vetar, matricular-se como candidato e, no cadastro, o próprio cargo, a data no
  cargo, o dízimo e o sexo.
- **Ficha aberta antes de uma conclusão não desfaz a promoção:** a tela manda o cargo que leu; se o banco já tem outro, a resposta é 409 ("abra a ficha de novo").
- **Disciplina não vaza pela lista:** quem não tem a permissão "disciplina" sobre a pessoa vê, para todos, o mesmo aviso ("a Secretaria confere no avanço") e o protocolo
  segue; o avanço, do nível geral, confere de verdade (e, para quem avança sem "disciplina", diz que travou sem dizer o motivo).
- A conclusão **refaz a conferência dentro da trava** (um CHM revogado ou uma disciplina aberta no meio não deixa o cargo mudar) e usa a **data de Brasília**.
- O **CHM é usado na promoção**: a próxima subida pede um novo ("válido e atualizado", Art. 67 §1º). A rematrícula leva o CHM com a data e quem concedeu.
- O preenchimento inicial do histórico roda **uma vez só** (as migrações rodam a cada publicação). "No cargo desde" aceita datas desde 1950. O sexo não se apaga quando o
  pedido não o traz. Veto só em processo que leva a cargo. Candidato só membro em plena comunhão (congregado não). Matrícula inexistente nunca "passa".
- **Trocar o cargo no cadastro limpa a data** do cargo antigo e pede a do novo; cargo fora do catálogo não se perde ao salvar; a lista de requisitos e o formulário saem da
  página na troca de login; "Aguarde" em vez de clique perdido; o avanço travado mostra o nome da pessoa e leva a tela até a lista.
- **Ministro de outra convenção** dispensa o degrau, o interstício e os requisitos técnicos (escolaridade, matrícula e CHM, com nivelamento depois da posse), **mas não o
  teto das obreiras**: a ressalva "salvo ordenação convencional específica" (Art. 71, III) pode ser a da própria CIADSETA, e o sistema não a decide.

**Decisões tomadas por interpretação (o responsável pode mudar qualquer uma):** Missionário(a) é degrau obrigatório entre Auxiliar e Diácono (Art. 72, III, "patente
anterior"); Missionária é o teto também para quem vem de outra convenção; a nomeação direta do Presidente dispensa só o técnico (interstício, idade, membresia, batismo no
Espírito, dízimo e comunhão continuam), e Evangelista e Pastor precisam do curso concluído mesmo nomeados; idade preferencial de 30 anos do Presbítero e o Pastor casado são
só avisos (o Regimento diz "preferencial" e "geralmente"); divorciado(a) gera aviso do escrutínio do CEI (a análise é da v8.3); dado que falta no cadastro trava; o CHM vale
para uma subida; o veto encerra a indicação (nova só por novo protocolo); quem não tem a permissão "disciplina" protocola sem ver a disciplina. Processos de Evangelista ou
Pastor protocolados **antes** da v8.2 como indicação travam no avanço: reprova-se e protocola-se de novo como nomeação direta.

**Provas:** jest 6.112 testes; banco local (`bash rodar.sh preparar-escada`): `e2e-51` fluxos 122, `e2e-52` segurança e lixo 53, `e2e-53` corridas 22, `e2e-54` o que as
revisões pediram 25; tela (`tools/front-escada`, com as respostas reais gravadas pelo `e2e-51`) 75, com duas mutações acusadas.

## v8.3 — Consagração e documentação

- [x] Esteira de consagrações (PROTOCOLADO → EM_ANALISE → AGUARDANDO_PLENARIO → CONCLUÍDO).
- [x] Consagração coletiva (Comissão de Unção) + diplomação.
- [x] Documentação: CHM (Certificado de Habilitação Ministerial).

### Desenho da v8.3 (contrato, 28/10/2026)

Base legal: Regimento Art. 7º, III; 9º; 10; 67; 73, II e III; 74 e 75. A v8.2 pôs os requisitos dentro da esteira, mas cada etapa ainda é um clique de "Avançar" do nível
geral, sem dizer **quem** decidiu. A v8.3 dá a cada etapa o seu dono, como o Art. 74 manda ("fica abolido o papelório"), e leva a consagração até o altar e o diploma.
Vale para os processos que levam a cargo; Integração e Reintegração (sem cargo) continuam com a esteira simples de hoje.

**1. Proposta digital (Art. 74, II).** O processo protocolado ganha os **documentos da indicação**: foto atualizada (a do cadastro da pessoa) e cópia dos documentos
pessoais (anexo no próprio processo, PDF ou imagem). O certificado da Academia é o **CHM**, que o sistema já conhece — não se anexa. "Enviar ao CEI" só com a foto e pelo menos
um documento.

**2. Parecer do CEI (Art. 74, III; Art. 9º; Art. 73, III).** Em "Em análise", só quem tem a permissão **`cei`** (nível geral) registra o parecer: **APTO** ou **INAPTO**, a
data da sabatina e a fundamentação (sigilosa: só quem tem `cei` lê). Para Presbítero, Evangelista e Pastor, a sabatina do Art. 9º §1º: vida pregressa e antecedentes,
regularidade financeira (dízimo) e alinhamento doutrinário, cada um marcado. **Escrutínio especial** (Art. 73, III) quando o cadastro diz divorciado(a) ou quando o CEI marca
que há histórico de ruptura conjugal: o fundamento (no "tempo da ignorância", antes da conversão, ou cláusula de exceção bíblica), a verificação documental e, se recasado(a),
o casamento atual estável e legalizado — sem isso não há APTO. **Pastor não casado** (Art. 73, II): o CEI escreve o motivo da exceção (b: celibato) ou não há APTO.
INAPTO arquiva o processo (Art. 9º §2º); APTO leva à homologação. Ninguém dá parecer no próprio processo.

**3. Homologação (Art. 74, IV; Art. 7º, III).** Auxiliar, Missionário(a) e Diácono: o Pastor Presidente valida a lista dos aptos — a Secretaria (nível geral de
`consagracoes`) registra o ato, podendo marcar vários de uma vez. Presbítero, Evangelista e Pastor: homologação **da CLI** em plenário — o registro aponta a reunião da CLI
(já realizada) em que foi votada. Homologado, o processo espera a cerimônia.

**4. Taxa de consagração (Art. 75, I).** Valor da cerimônia (R$ 70,00 em 2026, corrigido a cada ano), pago por PIX ou boleto até **45 dias antes** da cerimônia. A
Secretaria ou a tesouraria (nível geral de `consagracoes` ou `financeiro`) registra o pagamento (data, valor, forma; o comprovante vai como documento do processo). Sem
pagamento no prazo, a pessoa não é consagrada naquela cerimônia: o processo continua homologado e espera a próxima. O lançamento no caixa continua sendo da tesouraria, no
financeiro, como hoje.

**5. Cerimônia de consagração (Art. 75).** Nasce a cerimônia: data, local, ocasião (Assembleia Geral Ordinária, Sessão Magna ou Sessão Solene da CLI), valor da taxa e a
**Comissão de Unção** (no mínimo 4 pastores titulares em atividade, nenhum deles candidato). Entram os processos homologados. A tela monta o **roteiro**: candidatos por
patente, casais consagrados na mesma cerimônia lado a lado (Art. 75, III, b), quem vem de outra convenção como **diplomação** (Art. 10, parágrafo único — não há nova unção),
a conta das **insígnias** por patente e quem está com a taxa pendente. Depois do culto, a Secretaria registra **quem estava presente**: presente e com a taxa em dia →
consagrado (cargo, histórico e diploma, com os requisitos conferidos de novo dentro da trava); **ausente → perde a consagração naquele ano** (Art. 75, II, b: "não existe
justificativa"), o processo é encerrado e um novo protocolo para a pessoa só no ano seguinte.

**6. Documentos (Art. 67; Art. 75, IV, e).** O **CHM** passa a ser um documento de verdade: quando a AFM concede, o sistema emite o certificado com QR e código de
verificação pública (o mesmo dos certificados da v6.9); revogado ou usado numa subida, o certificado é revogado junto. Cada consagração concluída emite o **diploma** (ou o
diploma de reconhecimento, para quem vem de outra convenção), também verificável, que o titular baixa em Meus Certificados.

**7. Onde aparece.** Consagrações: em cada processo, "Documentos", "Enviar ao CEI", "Parecer do CEI" (só `cei`), "Homologar" (com seleção em lote), "Taxa"; o diploma no
concluído; seção nova **Cerimônias** (criar, comissão, incluir candidatos, roteiro para imprimir, registrar presença). Academia: o CHM com o link do certificado.

### Como ficou a v8.3 (entregue em 28/10/2026)

**Em produção desde 28/10/2026** (merge `83994c8`; para desfazer: `git revert -m 1 83994c8`). Migração **158**; regra pura em `api/shared/consagracao.js`, banco em `api/shared/consagracaoDb.js`, rotas novas `/api/esteira-consagracao/<ação>` (`EsteiraConsagracao`:
fila e parecer do CEI, reuniões da CLI, homologação, taxa) e `/api/cerimonias-consagracao/<ação>` (`CerimoniasConsagracao`); a página dos documentos em
`api/shared/pdfDocumentoMinisterial.js`. "Avançar" passou a ser "Enviar ao CEI" nos processos que levam a cargo (e só com a foto e um documento); os de Integração e
Reintegração seguem a esteira antiga. Tela: a aba Consagrações também para quem só tem `cei` (vê só os pareceres); cerimônias só no nível geral. Casca do service worker
**v44**.

**O que mudou depois da revisão independente do servidor** (1 alto, 4 médios, 8 baixos — todos tratados):

- **A cerimônia exige a lista inteira** (presentes **e** ausentes). Se alguém entrou na cerimônia por outra tela depois que a Secretaria a abriu, o registro volta sem
  mudar nada — ninguém perde o ano por um nome que não viu. A tela já marca como presente quem está com a taxa em dia e pergunta quantos perdem o ano antes de gravar.
- A cerimônia **nunca fica antes da homologação** nem da entrada no cargo atual (incluir, alterar a data e registrar conferem). A homologação não é anterior ao parecer do CEI.
- O registro relê os candidatos **com trava** (a taxa e o código do diploma de agora); o código que valeu fica no processo.
- **Dossiê da indicação:** ninguém vê nem mexe no próprio; depois do envio ao CEI só o nível geral acrescenta (o comprovante da taxa) e ninguém apaga; sai na minimização.
- O **CEI não vê o próprio processo** na fila nem lê o próprio parecer. Reprovar e vetar tiram o processo da cerimônia e soltam o código reservado. Ex-cônjuge não fica
  lado a lado (só o casamento mais recente conta). Dois casamentos registrados pedem o escrutínio, mesmo com o cadastro dizendo "casado". A minimização apaga também as
  marcas do escrutínio e da sabatina.

**O que mudou depois da revisão independente da tela** (4 médios, 8 baixos): o botão "Homologar os marcados" aparecia para todos no navegador de verdade (o
estilo da barra vencia o "escondido"); um ato sobre a cerimônia podia ir para outra aberta depois (agora vai a que estava na tela no clique); a fila do CEI que chegava
depois da saída aparecia (agora é descartada, e o formulário do parecer é limpo); o resultado de cada pessoa sumia depois do registro; a presença desmarcada voltava a
ficar marcada depois de imprimir os diplomas ou salvar a comissão; o valor da taxa que o navegador não entende não vira R$ 70,00 calado; aviso para quem é do CEI fora
do nível geral; rótulos com o nome em cada caixinha; a lista do que falta perto do painel da homologação; reuniões da CLI relidas ao homologar. A taxa pela tela fica
com a Secretaria (o servidor aceita também o nível geral do financeiro, mas a tesouraria não chega à aba Consagrações).

**Decisões tomadas por interpretação (o responsável pode mudar qualquer uma):** o "Conselho" da esteira é o **CEI** (Art. 74, III) e quem dá o parecer é quem tem a
permissão `cei` no nível geral; o parecer vale também para a nomeação do Presidente e para quem vem de outra convenção (o Art. 66 §4º só dispensa o veto da AFM); Auxiliar,
Missionário(a) e Diácono são homologados pelo **ato do Presidente** (a Secretaria registra) e Presbítero, Evangelista e Pastor **pela CLI** (a reunião já encerrada); o
**Pastor não casado** só passa com o motivo escrito pelo CEI; a taxa só vale se paga **até 45 dias antes** e no valor da cerimônia (quem pagou depois espera a próxima, não
perde o ano); a cerimônia pode ser criada com data passada (até 1 ano) para registrar a que já aconteceu; quem falta **perde no ano civil** e o registro **não se desfaz**
pelo sistema; o diploma é impresso antes com o código reservado e só vale depois do registro; o CHM usado numa subida é **revogado** (a verificação pública diz
"revogado"); o lançamento da taxa no caixa continua com a tesouraria, no financeiro; em Meus Dados o titular vê o resultado e a data do parecer, não a fundamentação.

**Provas:** jest 6.136 testes; banco local (`bash rodar.sh preparar-escada`, que já aplica a 158): `e2e-55` fluxos 112, `e2e-56` segurança e lixo 86, `e2e-57` corridas 19,
`e2e-58` o que a revisão pediu 25; os da v8.2 passam pela esteira nova (`e2e-51` 121, `e2e-52` 53, `e2e-53` 25, `e2e-54` 26); tela (`tools/front-consagracao`, com as
respostas reais gravadas pelo `e2e-55`) 98, com três mutações acusadas; as outras provas de tela continuam passando.

## v8.4 — Credencial digital com QR Code

- [x] Identidade Eclesiástica digital (Art. 76 Regimento).
- [x] Validação de status Ativo/Inativo via QR Code em tempo real.
- [x] Emissão centralizada na Secretaria Geral (anti-fraude).

### Desenho da v8.4 (contrato, 28/10/2026)

Base legal: Regimento Art. 76 (credencial digital, QR, sem validade impressa, gratuita, impressão só na Secretaria Geral); Art. 69 §3º e 77 (credencial suspensa do
obreiro inativo e reativada na volta); Art. 95 §2º, IV, a (exclusão: recolhimento da credencial); Art. 10 (Credencial Ministerial na diplomação).

**1. A credencial.** Cada membro tem no máximo **uma credencial válida**, com um **código de segurança** de 16 caracteres (o mesmo tipo de código dos certificados
da v6.9: não se adivinha) que vai no QR. Ela não tem data de validade (Art. 76 §1º): quem a lê vê a situação **de agora**, consultada no banco na hora. Perdeu, foi
roubada, mudou a foto ou o cargo: a Secretaria **emite uma nova via** e a anterior deixa de valer na mesma hora (o QR antigo passa a dizer "credencial substituída").

**2. Quem emite (Art. 76 §2º, anti-fraude).** Só a **Secretaria Geral** (nível geral da permissão `pessoas`) emite, reemite, cancela e gera o PDF para impressão; a
congregação não emite nem imprime. Emissão em lote para todos os membros ativos que ainda não têm. A pessoa vê a própria credencial digital no **Meu Painel** (com o QR e
a foto do cadastro), baixa o PDF e pode **pedir a impressão** — o pedido aparece na lista da Secretaria, que registra quando imprimiu. Gratuita: nenhuma taxa.

**3. O que o QR mostra (página pública, sem login).** Só o necessário para conferir quem está na frente: nome, se é **membro** ou **obreiro** (com o cargo), a
congregação, e a situação: **Ativa** ou **Inativa** — e, para obreiro, **Habilitado** (pode oficiar) ou **Obreiro inativo** (Art. 69 §3º: matrícula da AFM inativa, ou
afastado). Nunca o motivo, a matrícula, a foto nem dado de contato. Credencial substituída ou cancelada diz isso. Membro desligado ou excluído: "Inativa" (o
recolhimento do Art. 95 §2º, IV, a vira automático). Limite de consultas por origem, como a verificação de certificados.

**4. Onde aparece.** Meu Painel: "Minha credencial". Pessoas (nível geral): a seção **Credenciais** — emitir, emitir em lote, nova via, cancelar, PDF para impressão e os
pedidos de impressão. A página pública `credencial.html`.

### Como ficou a v8.4 (entregue em 28/10/2026)

**Em produção desde 29/10/2026** (merge `ab26201`; para desfazer: `git revert -m 1 ab26201`). Migração **159** (`CredenciaisEclesiasticas`); regra pura em `api/shared/credencial.js`, banco em `api/shared/credencialDb.js`, o cartão em PDF (tamanho de cartão de
crédito, para a impressora de PVC) em `api/shared/pdfCredencial.js`; rotas `/api/credenciais/<ação>` (`GestaoCredenciais`) e a pública
`/api/verificacao-credencial/{código}` (`VerificarCredencial`, com limite de 30 leituras por minuto por origem); a página `app/credencial.html` (autônoma, como a de
certificados, e fora do cache do aparelho: o endereço leva o código). Tela: "Minha Credencial" no Meu Painel e a sub-aba **Credenciais** da Pessoas (só o nível geral).
Casca do service worker **v45**.

**O que mudou depois da revisão independente** (2 altos, 6 médios, 9 baixos — tratados):

- **A disciplina não muda o cadastro** (Status e Situação continuam "ativo"): por isso a credencial lê o próprio processo. Exclusão em vigor e Disciplina Rigorosa em
  vigor deixam a credencial **inativa** (sem dizer por quê); a exclusão homologada, o desligamento registrado e o abandono **recolhem** a credencial na hora (a via fica
  "cancelada"). Exclusão ainda pendente de homologação do CEI não vale. O **recurso não suspende a pena**: o obreiro suspenso continua inativo até o recurso ser julgado.
- **O lote não desfaz o cancelamento**: só emite para quem nunca teve credencial (a cancelada à mão só volta pela emissão individual), só para adultos, 60 por clique.
- **Licença** (inclusive a de candidatura): a pessoa continua membro ativo; o obreiro fica sem licença para oficiar enquanto ela durar.
- A lista da Secretaria tem **busca no servidor** (nome ou matrícula): nenhuma credencial fica fora do alcance, por maior que seja a igreja.
- O PDF só usa a foto que está no cadastro (a retirada por consentimento não volta pelo arquivo que sobrou). Datas de emissão em horário de Brasília. A página do QR não
  fica guardada no aparelho de quem leu. Sem desvio para tela em branco na Pessoas; o PDF de uma sessão não baixa depois da saída.

**Decisões tomadas por interpretação (o responsável pode mudar qualquer uma):** uma credencial só para membro e obreiro (a categoria diz o cargo); processo
disciplinar **apenas aberto** não aparece no QR (só a sanção aplicada ou o afastamento cautelar suspendem o obreiro — presunção de inocência); a página pública mostra
nome, categoria, congregação e o número da via; o **lote é só para adultos** (o menor recebe pela emissão individual, a pedido da família); a credencial é **recolhida**
na exclusão, no desligamento e no abandono, mas na Disciplina Rigorosa só fica inativa enquanto ela durar. *(A volta automática a "habilitado" ao fim da suspensão
temporária foi decidida pelo responsável na Trava 8-A: agora exige a Prova de Reintegração — Art. 77.)*

**Provas:** jest 6.151 testes; banco local (`bash rodar.sh preparar-escada`, que já aplica a 159): `e2e-59` fluxos, segurança e lixo 68, `e2e-60` corridas 9; tela
(`tools/front-credencial`, com as respostas reais gravadas pelo `e2e-59`) 42, com três mutações acusadas.

## 🔒 Trava de Revisão 8-A — antes de avançar para a v8.5

Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da seção 3).
Audita v8.1 a v8.4 pelas 5 perguntas do checklist.

- [x] **Fechada em 29/10/2026** — auditoria de v8.1 a v8.4. Duas revisões independentes, só de leitura: uma das costuras ENTRE as versões
  (quem conta como "ativo", o que a saída da igreja desfaz, o que cada pessoa pode mexer em si mesma) e outra da lei, do plano e do README;
  depois das correções, uma terceira revisão do próprio diff. **Nenhum achado crítico; 4 altos, 15 médios e 21 baixos, todos corrigidos com
  teste** (migração 160; `e2e-61`, 90 verificações; casca v46). Em produção desde 29/10/2026 (merge `b8af4e1`; reverter =
  `git revert -m 1 b8af4e1`). As 5 perguntas:
  1. **Tudo roda de ponta a ponta no ambiente real?** Sim. A bateria da fase 8 inteira contra o banco local (`e2e-47` a `e2e-61`, 1.018
     verificações) com as migrações 156 a 160 aplicadas duas vezes cada. A trava achou um defeito na própria ferramenta: a restauração da base
     falhava calada e os roteiros rodavam sobre base suja; agora o `rodar.sh` para quando a base ou a migração não fica pronta, e os roteiros
     da v8.1 rodam sobre o esquema completo (o código da AFM já lê o CHM da 158).
  2. **Toda tela nova abre?** Sim. Teste de tela completo na produção (execução 40880685665): 5.678 ações iguais, 0 divergência, 0 violação
     de CSP. Na homologação, a única diferença foram os dois painéis novos e escondidos (+5 botões, +5 campos em toda tela) — base aprovada
     (execução 40894991238; confirmação 40900701520, 0 divergência). Provas de tela sem navegador: AFM 80, escada 75, consagração 116 (5 mutações
     acusadas), credencial 42.
  3. **O README e o código contam a mesma história?** Agora sim: "Planejadas: FASES 9 a 12", 318 tabelas (migrações 001 a 160), a v8.4 em
     29/10; o rótulo da Sessão Magna não fala mais do Seminário; três artigos corrigidos (Art. 79, III, b; Art. 56 §2º no lugar da "linha
     310"; Art. 75 e 15, II); o README dos roteiros com o `e2e-58` e o `e2e-61`.
  4. **As sobras foram mesmo resolvidas?** As que o código resolve, sim: a taxa pela tesouraria, a homologação da CIADSETA, a indicação
     antiga que vira nomeação, a credencial na diplomação. O que ficou são decisões do responsável (abaixo) e dois itens novos do Regimento
     que entraram na v8.6 (reciclagem anual, Art. 68 §3º; exame bienal, Art. 70 §3º).
  5. **Houve deploy real?** Sim: as migrações 156 a 159 rodaram no deploy da produção (log), as rotas novas respondem 401 sem sessão, a
     página pública do QR responde, a casca estava na v45; a 160 e a casca v46 entraram com esta trava.

  O que mudou:
  - **Uma regra só para "quem está nas funções" (alto).** A licença para oficiar (batismo, Meu Painel, Academia), a Comissão de Unção e o QR
    da credencial passaram a ler o mesmo lugar (`api/shared/habilitacao.js`): sanção ou afastamento cautelar, Disciplina Rigorosa, exclusão,
    licença e matrícula da AFM inativa tiram a pessoa das funções em todos eles. Antes, um Pastor suspenso podia batizar e ungir enquanto o
    QR dizia "obreiro inativo". A recusa mostrada à liderança local nunca diz o motivo.
  - **A recusa do CEI ficou gravada (alto, de antes da fase 8).** "Não homologar" gravava o mesmo valor de "pendente": a pessoa ficava sob
    disciplina para sempre e podia ser homologada depois. Agora a recusa tem data (`CEIRecusouEm`) e tira o efeito da decisão em toda parte.
  - **Ninguém mexe no que conta para a própria escada (alto).** O nível, a reprovação e a rematrícula da AFM; o batismo no Espírito Santo
    (só o nível geral lança); nascimento, admissão e estado civil (com processo de cargo aberto, só o nível geral). A data de admissão nova de
    quem tem exclusão julgada é a readmissão: só o nível geral a registra, e ela vale igual na credencial, na escada, na CLI e na assembleia.
  - **LGPD (alto).** ROPA com a escada e a consagração e com a credencial; RIPD do parecer do CEI e das páginas públicas; retenção na 160.
  - **A saída da igreja desfaz o que tem de desfazer (médios).** A vacância fecha os processos de cargo em andamento (antes eles ficavam na
    fila do CEI e na cerimônia para sempre) e revoga o CHM — primeiro os processos, para a cerimônia nunca escrever o cargo depois da
    vacância; o abandono pega a trava da escada. A minimização elimina o diploma, o CHM, o parecer e os processos (Regimento Art. 132 §2º,
    II: "registros eclesiásticos de conversão e consagração"); a verificação pública passa a dizer "não encontrado".
  - **A matrícula inativa não é beco sem saída:** o candidato reprovado recomeça numa matrícula nova.
  - **CLI:** não homologa no Seminário de novembro nem na reunião marcada "não conta falta".
  - **CIADSETA (Art. 72, V, a):** a Secretaria registra a data e o ato; sem ela, Evangelista e Pastor não entram na cerimônia, a data não muda
    para antes dela e o registro devolve à fila.
  - **Sobras fechadas:** a lista da tesouraria para a taxa; "Virar nomeação" para a indicação antiga; a credencial na diplomação (Art. 10 —
    a primeira, ou uma nova via já pedida para impressão quando o cartão impresso tinha o cargo anterior); o PDF que a pessoa baixa sai
    "via digital"; o processo antigo sem destino segura um segundo processo; o CEI conta o tempo de Presbítero pelo histórico e o CHM usado;
    Meus Dados com o CHM, a modalidade, o veto, a CIADSETA e a Comissão de Unção.

  **Decididas pelo responsável (29/10/2026, depois da trava):**
  - **Art. 77 — toda suspensão temporária exige o ato de retorno:** terminado o prazo, a punição acaba (a pessoa volta a ser membro em
    dia: Ceia, voto), mas o obreiro fica em **Carência Administrativa**, fora das funções (não oficia, não unge, não sobe na escada, o QR
    diz "obreiro inativo"), até a aprovação na **Prova de Reintegração Ética** da AFM (§ 2º) — como a Disciplina Rigorosa. "Quando você é
    suspenso, você saiu; ninguém sabe depois do prazo como essa pessoa está." A prova só se registra depois do fim do prazo; o processo em
    carência continua na lista da Disciplina, com o botão da prova.
  - **Outra convenção também passa pela CIADSETA:** o ministro que vem de outra convenção precisa da homologação da nossa Convenção
    Estadual antes da cerimônia, como os demais Evangelistas e Pastores ("a gente não sabe como era essa outra convenção").
  - **Licença de candidatura (Art. 157 §2º) afasta das funções e da liderança, não do processo:** enquanto dura, o obreiro não oficia
    (púlpito, Ceia, dirigir culto) e sai dos cargos que poderiam servir à campanha (dirigente, tesouraria, diretoria, conselho — Assentos
    e Liderança); o **título fica** (o Presbítero continua Presbítero e volta a exercer depois do pleito, a critério da Diretoria), o CHM
    fica e **os processos de consagração seguem** — a escada não trava pela licença.

  **Decisões tomadas por interpretação (o responsável pode mudar qualquer uma):**
  - A exclusão julgada pelo TER e ainda pendente do CEI já afasta das funções (não oficia, não unge, o QR diz "obreiro inativo"), mas a
    pessoa continua membro até o CEI homologar.
  - O celibato do Pastor "reconhecido pela Convenção" (Art. 73, II, b) fica registrado só no parecer do CEI.
  - A minimização também apaga os processos de Integração e Reintegração da pessoa.

## v8.5 — Trilha de discipulado como entidade de primeira classe *(7ª rodada)*

A escada ministerial (v8.2) cobre do Auxiliar pra cima. Falta o percurso que vem
**antes** e que hoje só existe na memória do pastor: conversão, batismo com
Espírito Santo, curso de novos convertidos, primeira participação em
departamento, primeiro serviço voluntário.

- [x] Catálogo de **tipos de marco** configurável (único vs. repetível,
      pré-requisitos), com marcos datados no perfil — a tabela `MarcosMembro`
      (v1.6) já existe e hoje é usada só para eventos avulsos; aqui ela vira
      trilha estruturada.
- [x] **Funil por congregação**: quantos pararam entre "convertido" e "batizado",
      entre "batizado" e "primeiro serviço". É o número que mostra onde a
      assimilação trava — e ele é invisível hoje.
- [x] Conclusão de etapa disparando o próximo passo na fila de acompanhamento
      (v7.11), em vez de depender de alguém lembrar.
- [x] Integração com a esteira de batismo (vB.11) e com as trilhas de formação
      (v6.9). *(Rock RMS Steps)*

### Desenho da v8.5 (contrato, 29/10/2026)

**Base legal:** Regimento Art. 70 §4º (a AFM conduz o Curso de Discipulado para novos convertidos em todas as congregações) e §5º (no batismo de
urgência, o "Discipulado Pós-Batismal" vem depois); Art. 80, IV (ninguém é batizado sem o curso); Art. 128 (a classe de novos convertidos e a
"Busca Ativa" medem a congregação); Art. 132 §2º, II (na saída, os "registros eclesiásticos de conversão" são eliminados).

1. **Catálogo de tipos de marco** (`TiposMarco`): os quatro de hoje (Conversão, Ministério/Igreja anterior, Batismo no Espírito Santo, Outro) mais
   **Curso de Discipulado** e **Primeira participação em departamento**. Cada tipo diz se é **único** (Conversão, Curso, Batismo no Espírito Santo,
   Departamento — um segundo é recusado) ou **repetível**, e se é **só do nível geral** (Batismo no Espírito Santo, que conta para a escada). O nível
   geral de "pessoas" cria, renomeia e desativa tipos; os do sistema não se apagam.
2. **A trilha** (`EtapasDiscipulado`): etapas em ordem, cada uma com a **fonte** de onde o sistema sabe que ela foi feita, sem ninguém lançar duas
   vezes — um **marco** do perfil, o **batismo nas águas** (a data do batismo no cadastro, que a esteira de batismo já grava), uma **trilha de
   formação** concluída (v6.9: quando a AFM configurar o curso como trilha, a etapa passa a ler a conclusão dela) ou o **primeiro serviço
   voluntário** (a primeira escala aceita ou confirmada, já realizada). Trilha inicial: Conversão → Curso de Discipulado → Batismo nas águas →
   Batismo no Espírito Santo → Primeira participação em departamento → Primeiro serviço voluntário. Pré-requisitos são informativos: a ordem
   real é a que aconteceu (o batismo de urgência antes do curso aparece como "curso pendente — Discipulado Pós-Batismal").
3. **A caminhada da pessoa**: no perfil (aba "Caminhada"), cada etapa feita com a data e de onde veio, e o **próximo passo**. A própria pessoa vê
   a sua em "Minha Formação" no Meu Painel, e em Meus Dados.
4. **Funil por congregação** (sub-aba Discipulado da Pessoas, liderança com "pessoas" no seu território; o nível geral vê todas): quantos fizeram
   cada etapa, quantos passaram para a seguinte e **quantos estão parados** entre uma e outra há mais de N dias (90 por padrão), com a lista
   nominal de quem parou (só do território de quem vê).
5. **O próximo passo vira acompanhamento** (v7.11): a rotina diária abre um item **"Próximo passo do discipulado"** na fila do cuidado pastoral
   para quem deu um passo **recente** (nos últimos 180 dias) e tem o seguinte pendente, se a etapa seguinte pede acompanhamento; o item tem o
   responsável e a escada de sempre, e **fecha sozinho** quando a pessoa dá o passo. Um item por pessoa; nunca reabre para a mesma etapa; no
   máximo 20 novos por congregação por dia (o primeiro dia não inunda a fila com o histórico de quem já é membro antigo).
6. **LGPD:** os marcos da trilha são dados da membresia (ROPA "DISCIPULADO"); a minimização do ex-membro elimina os marcos (Art. 132 §2º, II:
   "registros eclesiásticos de conversão") — o batismo nas águas fica, como assentamento do sacramento.

**Decisões por interpretação (o responsável pode mudar):** a trilha **começa na conversão** — o membro antigo que só tem o batismo no cadastro ou
uma escala, sem a conversão lançada, não entra no funil nem na fila (senão o rol inteiro apareceria "parado antes da conversão"); o curso conta pelo
marco, pela trilha de formação que a AFM configurar e pelo discipulado atestado na esteira de batismo (nada é lançado duas vezes); "parado" = sem
nenhum passo há 90 dias; o acompanhamento só abre quando o passo **anterior** ao próximo foi nos últimos 180 dias (um passo recente lá na frente —
uma escala — não reabre a trilha antiga) e o marco sem data não conta como passo recente; no máximo 20 itens novos por congregação **por dia**; o
funil e os nomes de quem parou são da liderança territorial (a concessão de Extensão e a de Departamento não os veem, como no cuidado pastoral; quem
cuida da Extensão é o Dirigente da congregação-mãe); os tipos de marco do sistema não se desativam; a pessoa registra marcos de outros só no seu
território, e nunca os "só do nível geral" em si mesma.

### Como ficou a v8.5 (entregue em 30/10/2026)

**Em produção desde 30/10/2026** (merge `2e2ea5d`; para desfazer: `git revert -m 1 2e2ea5d`). Migração **161** (`TiposMarco`, `EtapasDiscipulado`,
`EtapasDiscipuladoPreRequisitos`; na fila do cuidado, o tipo `DISCIPULADO`, a origem `DISCIPULADO`, o desfecho `PASSO_DADO`, a etapa do item e o prazo
`CUIDADO_PRAZO_DISCIPULADO_DIAS`, 30 dias, em Catálogos → Prazos). Regra pura em `api/shared/discipulado.js`, banco em `api/shared/discipuladoDb.js`, rota
`/api/discipulado/<ação>` (`GestaoDiscipulado`). Os marcos do perfil passaram a vir do catálogo (`RegistrarMarcoMembro`: tipo inativo recusado, o "único" com
trava, o "só do nível geral" nunca em si mesmo, data no futuro recusada — também na correção). Tela: sub-aba **Discipulado** da Pessoas (o funil, quem parou e,
para o nível geral, o catálogo), aba **Caminhada** no perfil, **Minha caminhada** em Minha Formação e a trilha em Meus Dados (módulo novo
`app/modulos/discipulado.js`). Casca do service worker **v47**. A rotina diária do cuidado pastoral roda a da trilha (abre e fecha os "próximos passos").

**O que mudou depois das revisões independentes** (servidor: 2 altos, 3 médios, 6 baixos; tela: 4 médios, 7 baixos — tratados):

- O índice único "um item por pessoa e etapa" saiu: com a anonimização da exclusão LGPD e da retenção (que zeram a pessoa no item), ele travaria a exclusão a
  partir da segunda pessoa e, daqui a 5 anos, a retenção inteira. O "um aberto por pessoa" segura a duplicata; o "nunca reabre para a mesma etapa" é da rotina.
- O funil e os nomes de quem parou são da liderança **territorial**: a concessão de Extensão e a de Departamento não os veem (o mesmo critério do cuidado
  pastoral).
- A trilha **começa na conversão**: o rol antigo, só com o batismo do cadastro, não aparece "parado antes da conversão". O acompanhamento mede a data do passo
  **anterior** ao próximo (uma escala recente não reabre a trilha antiga); o marco sem data é data desconhecida; no máximo 20 por congregação **por dia**; quem
  teve a exclusão LGPD atendida não volta à fila; o item que muda de congregação leva a etapa e fecha sozinho na congregação nova.
- O curso também vem da **esteira de batismo** (o discipulado atestado no candidato e a trilha configurada como requisito do batismo) — nada é lançado duas vezes;
  e, quando a AFM liga o curso a uma trilha de formação, o marco antigo continua valendo.
- Tela: toda resposta confere se o login ainda é o mesmo e se é a do pedido mais recente; o Discipulado Pós-Batismal (Art. 70 §5º) aparece para quem foi batizado
  antes do curso; o "Corrigir marco" usa o nome do catálogo (o teste de tela da homologação achou ele quebrando com um catálogo de outro formato — corrigido).
- A base do cuidado pastoral nos testes do banco local passou a ter o esquema inteiro (156 a 161), como no deploy.

**Decisões tomadas por interpretação (o responsável pode mudar qualquer uma):** a trilha começa na conversão lançada (o membro antigo sem a conversão no
perfil não entra no funil nem na fila); "parado" = nenhum passo há 90 dias (a tela deixa escolher 30, 60, 90 ou 180); o acompanhamento só abre quando o passo
anterior ao próximo foi nos últimos 180 dias; no máximo 20 acompanhamentos novos por congregação por dia; Extensão e Departamento não veem o funil (quem cuida da
Extensão é o Dirigente da congregação-mãe); os tipos de marco do sistema não se desativam; o batismo no Espírito Santo e a conversão não pedem acompanhamento na
trilha inicial (o nível geral pode mudar no catálogo).

**Provas:** jest 6.186 testes; banco local (`bash rodar.sh preparar-escada`, que já aplica a 161): `e2e-62` fluxos, segurança e lixo 66, `e2e-63` corridas 10
(em processos separados); o cuidado pastoral (`e2e-23` a `e2e-28`) segue verde sobre a base com o esquema inteiro; tela (`tools/front-discipulado`, com as
respostas reais gravadas pelo `e2e-62`) 52, com seis mutações acusadas; teste de tela da homologação 40953092973 sem divergência e sem violação de CSP (base
aprovada na execução 40943177680).

## v8.6 — Educação continuada e requisito verificável de promoção *(7ª rodada)*

- [x] Carga horária mínima periódica por cargo ministerial para manter a
      credencial ativa — padrão consolidado em denominações internacionais, e
      que dá sentido prático à AFM (v8.1) além da formação inicial.
- [x] **Curso anual de Reciclagem e Prática Pastoral** (Regimento Art. 68 §3º):
      "critério indispensável e eliminatório para a renovação e manutenção da
      credencial de obreiro ativo no exercício seguinte" — a aprovação do ano
      registrada por obreiro; sem ela, o QR (v8.4) passa a "obreiro inativo" no
      exercício seguinte. *(achado da Trava 8-A: nem implementado nem planejado)*
- [x] **Exame bienal de proficiência** (Regimento Art. 70 §3º): reprovado fica
      "sob observação" (I) — uma situação nova no QR e na escada —, e a ausência
      "equivale à reprovação por abandono … suspensão imediata" (II).
      *(achado da Trava 8-A)*
- [x] Os requisitos de formação da v6.9 (trilhas) ligados aos cursos da AFM: o
      CHM e o nível já são conferidos sozinhos na escada e na esteira (v8.2 e
      v8.3); conferir as disciplinas cursadas **passou para a v8.7** (as
      disciplinas só existem com ela — item na lista da v8.7).
- [x] Histórico de formação no perfil, com certificados verificáveis (v6.9).
- [x] Alerta de credencial em risco por educação continuada vencida — antes de
      expirar, não depois.

### Desenho da v8.6 (contrato, 30/10/2026)

**Base legal:** Regimento Art. 68 §3º (o Curso de Reciclagem e Prática Pastoral, anual, com "frequência mínima e aprovação", é "critério indispensável e
eliminatório para a renovação e manutenção da credencial de obreiro ativo no exercício seguinte"); Art. 70 §3º (a cada 2 anos, no Seminário de novembro, a
Prova de Suficiência e Reciclagem "para todos os obreiros e membros da Câmara": I — reprovado fica "sob observação" até a repescagem; II — a ausência
injustificada "equivale à reprovação por abandono, sujeitando o infrator à suspensão imediata das funções ministeriais"); Art. 70 §2º (o currículo de
Liderança, Administração Eclesiástica e Compliance Estatutário); Estatuto Art. 30 §2º (o exercício é o ano civil).

1. **Reciclagem anual** (Art. 68 §3º): a AFM (nível geral) registra a edição do ano (data, carga horária, frequência mínima em %) e, por obreiro, as horas
   presentes e o resultado (aprovado, reprovado, ausente). A carga horária mínima periódica é esta: sem a frequência mínima, não há aprovação. Quem não foi
   aprovado na edição do ano anterior fica **sem a credencial renovada** no exercício seguinte: **obreiro inativo** (não oficia, não unge, não sobe na escada,
   o QR diz "Obreiro inativo") até o resultado da edição ser corrigido para aprovado (a reposição). Só vale para quem já era obreiro na data da edição (quem foi
   consagrado depois não tinha como ir — e a promoção não zera essa contagem: vale o primeiro dia como oficial sem interrupção) e só a partir do primeiro ano
   em que a edição foi registrada (nada retroage).
2. **Exame bienal** (Art. 70 §3º): a AFM registra o exame (data, e se é o bienal ou uma repescagem dele) e o resultado de cada obreiro e membro da Câmara
   (aprovado, reprovado, ausente com justificativa, ausente sem justificativa). Reprovado → **sob observação** (continua oficiando; o QR diz "sob
   observação"; não sobe na escada) até ser aprovado numa repescagem; ausente sem justificativa → **suspenso das funções** (não oficia) até a repescagem;
   ausente com justificativa → deve a repescagem, sem sanção (a escada só avisa). A sanção só cai com uma **aprovação**: faltar com justificativa à
   repescagem, ser reprovado nela depois de faltar ou o bienal seguinte sem registro da pessoa não a tiram. O sistema não presume ausência: só vale o que a
   AFM registrou.
3. **A mesma regra em todo lugar** (a regra única da Trava 8-A): a licença para oficiar, a Comissão de Unção, o QR da credencial e a escada leem a educação
   continuada do mesmo lugar.
4. **Alerta antes, não depois**: de 1º de outubro a 31 de dezembro, o obreiro sem a reciclagem do ano aprovada recebe um aviso por mês ("sem ela, a
   credencial não é renovada em 1º de janeiro"); a AFM do nível geral recebe a contagem, e a lista com os nomes fica na seção da Academia. Quem está sob
   observação ou suspenso pelo exame é avisado uma vez por mês até a repescagem.
5. **Histórico de formação**: no perfil (aba Caminhada) e na Minha Formação, as reciclagens, os exames, a situação de agora e as trilhas de formação
   concluídas com o código do certificado verificável (v6.9); em Meus Dados.
6. **Fica para a v8.7**: ligar os requisitos de formação (v6.9) às disciplinas da AFM — as disciplinas só existem quando a v8.7 criar a estrutura acadêmica.

**Decisões por interpretação (o responsável pode mudar):** "sob observação" não suspende as funções (o texto só suspende na ausência sem justificativa),
mas impede a promoção na escada; o exame alcança os obreiros e quem está na Câmara (o membro da Câmara que não é obreiro fica com o resultado registrado, sem
efeito na credencial); a reposição da reciclagem é a correção do resultado da mesma edição (não há "edição extra"); a ausência justificada que ainda deve a
repescagem não impede a promoção (só avisa); a justificativa da ausência (pode citar saúde) sai 2 anos depois do exame (prazo ajustável em Proteção de
Dados → Políticas de retenção).

### Como ficou a v8.6 (entregue em 30/10/2026)

**Em produção desde 30/10/2026** (merge `3b6ab7a`; para desfazer: `git revert -m 1 3b6ab7a`). Migração **162** (`AFMReciclagemEdicoes`,
`AFMReciclagemResultados`, `AFMExames`, `AFMExameResultados`; os avisos `AFM_RECICLAGEM_PENDENTE` e `AFM_EXAME_PENDENTE`; a política de retenção "AFM —
justificativa de ausência no exame", 730 dias). Regra pura em `api/shared/educacaoContinuada.js`, banco em `api/shared/educacaoContinuadaDb.js`, rota
`/api/educacao-continuada/<ação>` (`GestaoEducacaoContinuada`). A regra única da Trava 8-A (`habilitacao.js` → `afm.licencaLiturgica`) passou a ler a
educação continuada: a licença para oficiar, a Comissão de Unção, o QR (agora com "sob observação"), a lista da AFM e a escada dizem o mesmo. Tela: seção
**Educação continuada** na aba Academia (só o nível geral: quem está pendente, quem ainda não foi aprovado na reciclagem do ano, as edições, os exames e o
lançamento dos resultados), **Minha educação continuada** em Minha Formação, a **formação ministerial** na aba Caminhada do perfil (com o link do certificado
das trilhas) e o "sob observação" na credencial do Meu Painel (módulo novo `app/modulos/educacao-continuada.js`). Casca do service worker **v48**. A rotina
diária da AFM roda a retenção da justificativa; a exclusão LGPD a apaga na hora; Meus Dados mostra tudo.

**O que mudou depois das revisões independentes** (servidor: 4 altos, 3 médios, 5 baixos; tela: 1 alto, 4 médios, 4 baixos — tratados):

- A sanção do exame **só cai com uma aprovação**: antes, faltar com justificativa à repescagem tirava a suspensão, e um bienal novo em que a pessoa não foi
  registrada apagava a pendência antiga. Agora vale a sequência inteira dos exames da pessoa.
- A **promoção não zera** o "já era obreiro na data da edição": vale o primeiro dia como oficial sem interrupção (o Diácono reprovado em março e promovido a
  Presbítero em dezembro continua devendo a reciclagem).
- A ausência justificada só **avisa** na escada (o texto diz "sem sanção").
- Mudar a carga ou a frequência de uma edição que deixaria um "aprovado" abaixo do novo mínimo é recusado; a auditoria guarda o antes; resultado de exame ou
  de reciclagem que ainda não aconteceu é recusado; edição ou exame inexistente dá 404.
- O prazo da justificativa ficou em **Proteção de Dados → Políticas de retenção** (como o da CLI), e o ROPA o descreve.
- Tela: a credencial do Meu Painel dizia "sem licença" para quem está sob observação (corrigido); o painel mostra os nomes de quem ainda não foi aprovado
  na reciclagem do ano (o aviso mensal só leva a contagem); a linha recusada volta com o que foi digitado; o ano inteiro vai em lotes de 100; a própria
  linha vem travada; as horas aceitam vírgula; a seção só do nível geral fecha na saída; o bloco não aparece para quem não é obreiro e nunca teve registro.
- Nos testes do banco local, o setup do cuidado (`e2e-23`) abre a linha de cargo dos oficiais que cria — o `e2e-51` falhava desde a v8.5 por isso (só a base
  de teste; o sistema sempre abre a linha no cadastro e na consagração).

**Decisões tomadas por interpretação (o responsável pode mudar qualquer uma):** "sob observação" não suspende as funções, mas impede a promoção; o exame vale
para os obreiros e para quem está na Câmara (o membro da Câmara que não é obreiro só fica com o resultado registrado); a reposição da reciclagem é corrigir o
resultado da mesma edição (não há "edição extra"); a ausência justificada que ainda deve a repescagem não impede a promoção; quem virou oficial depois da
data da edição não deve aquela edição; nada retroage (antes da primeira edição registrada, ninguém fica pendente); a justificativa sai 2 anos depois do exame.

**Provas:** jest 6.204 testes; banco local (`bash rodar.sh preparar-escada`, que já aplica a 162): `e2e-64` fluxos, segurança e lixo 57, `e2e-65` corridas
11 (em processos separados); a bateria da fase 8 (`e2e-47` a `e2e-63`), o cuidado (`e2e-23` a `e2e-28`) e a Trava 7-C (`e2e-36`, `e2e-40`) verdes sobre as
bases recriadas do zero; tela (`tools/front-educacao`, com as respostas reais gravadas pelo `e2e-64`) 65, com dezesseis mutações acusadas; teste de tela da
homologação 41068846668 sem divergência e sem violação de CSP (base aprovada na execução 41066251721).

## v8.7 — Seminário como sistema acadêmico, não como curso online *(7ª rodada)*

Achado de pesquisa que muda o desenho: formação ministerial séria precisa de
**SIS** (histórico escolar), não de LMS. Curso online entrega vídeo e quiz;
seminário precisa entregar **declaração, histórico e aproveitamento** — que é o
que a Convenção e outras instituições vão pedir.

- [ ] Estrutura acadêmica: curso → disciplina (carga horária, pré-requisito) →
      turma → matrícula → nota e frequência → **histórico escolar**.
- [ ] Emissão de declaração de matrícula, histórico e diploma.
- [ ] **Aproveitamento de disciplina** cursada em outra instituição, com parecer
      registrado de quem aprovou — hoje isso é decisão informal do Reitor.
- [ ] Cada disciplina com o seu docente (o corpo docente com a titulação, o
      Reitor e a CDER já existem desde a v8.1).
- [ ] Os requisitos de formação da v6.9 (trilhas) e da escada conferindo as
      disciplinas cursadas *(veio da v8.6: lá só existiam a reciclagem e o exame)*.
      *(Classter; Populi — SIS para seminários)*

### Desenho da v8.7 (contrato, 30/10/2026)

**Base legal:** Regimento Art. 66 (a AFM é o órgão oficial de ensino e habilitação), Art. 68 (o Reitor dirige a parte pedagógica, com o Corpo Docente), Art. 70 §2º
(o currículo obrigatório abrange Liderança, Administração Eclesiástica e Compliance Estatutário) e Art. 72 (os quatro níveis — Básico, Médio, Avançado, Bacharel Livre —
"matriculado e cursando" para Auxiliar a Presbítero; o **certificado de conclusão** do Avançado ou do Bacharel para Evangelista e Pastor). O Regimento não fala de notas,
turmas nem aproveitamento: o resto é decisão da Academia, e fica configurável.

1. **Cursos e currículo.** Os **quatro cursos** são os níveis do Art. 72 (a migração cria os quatro; não se criam outros). Cada curso tem a nota mínima (7,0 de 10) e a
   frequência mínima (75%) — a Academia muda. As **disciplinas** de cada curso (nome, área, carga horária, obrigatória ou optativa, ementa, ativa) e os **pré-requisitos**
   entre disciplinas (até de outro curso; sem ciclo) são cadastrados pela Academia — a migração não inventa currículo. Área: Bíblia e Teologia, Liturgia, Liderança,
   Administração Eclesiástica, Compliance Estatutário (Regimento) ou outra; a tela **avisa** o curso cujas obrigatórias ainda não cobrem as três áreas do Art. 70 §2º.
2. **Matrícula no curso.** Só quem tem a **matrícula ativa na AFM** (todo oficial, sozinho; quem ainda não é oficial, matriculado antes como candidato — v8.2). Situação:
   cursando, concluído ou cancelado (com o motivo); cancelado pode voltar numa matrícula nova, e as disciplinas já aprovadas continuam valendo.
3. **Turma** = a oferta de uma disciplina, **com o seu docente** (Reitor ou docente em exercício no Corpo Docente — v8.1), as datas, o local e a regra de aprovação
   congelada do curso no dia da abertura (nota, frequência e carga horária: mudar o curso depois não muda a turma). Inscrição: matriculado no curso **cursando**, com os
   pré-requisitos aprovados, sem já ter sido aprovado na disciplina e sem estar em outra turma aberta dela; o docente não é aluno da própria turma.
4. **Nota e frequência.** Lança-se a nota (0 a 10, com vírgula) e as horas presentes; o resultado sai sozinho: **aprovado**, **reprovado por nota** ou **reprovado por
   frequência**. Lança e encerra quem tem o nível geral da Academia **ou o docente da turma** (em Minha Formação, "Turmas em que leciono"); ninguém lança a própria nota.
   Só a turma **encerrada** vale para o histórico, os pré-requisitos, a conclusão e os requisitos (a nota de turma aberta ainda pode mudar). Reabrir a turma é do nível
   geral, com o motivo; a nota de quem já concluiu o curso com aquela disciplina não pode deixar de ser "aprovado" (anule a conclusão antes).
5. **Aproveitamento de disciplina** cursada em outra instituição: o nível geral registra a instituição, a disciplina e a carga de origem, o ano, a decisão (deferido ou
   indeferido) e o **parecer escrito de quem decidiu** — o Reitor ou um docente em exercício (nunca o próprio aluno), com o documento de origem conferido. O deferido vale
   como disciplina cumprida ("AP" no histórico); anular pede o motivo e tem a mesma trava da conclusão.
6. **Conclusão e documentos.** O nível geral registra a conclusão quando **todas as obrigatórias** do curso estão aprovadas ou aproveitadas (o sistema confere) e o
   **diploma** sai na hora, com código de verificação público (como o CHM e o diploma de consagração). A **declaração de matrícula** (vale 30 dias) e o **histórico escolar**
   (a fotografia do dia em que foi emitido: a correção posterior não muda um histórico já emitido) são emitidos pela própria pessoa (Minha Formação) ou pela Academia,
   em PDF com QR. Anular a conclusão (motivo) revoga o diploma e devolve o curso a "cursando".
7. **A escada e os requisitos conferem o que foi cursado.** O nível do Art. 72 passa a vir **também do histórico**: "cursando" o curso em que a pessoa está matriculada, e
   "concluído" o que ela concluiu — junto com o nível registrado à mão até hoje (para quem estudou antes do sistema), valendo o que atender o cargo (quem concluiu o Avançado e
   cursa o Bacharel atende o Pastor). A mesma leitura vale para a lista da Academia, o Meu Painel, o nivelamento e o CEI. E o **requisito de formação** (v6.9: consagração,
   liderança, escala, professor da EBD, voluntariado, batismo) passa a poder exigir **uma disciplina da AFM**, além de uma trilha — a disciplina aprovada (turma encerrada) ou
   aproveitada atende. *Exemplo: o tipo de consagração "Diácono" exige a disciplina "Liturgia" (Art. 72, III, b: "com foco em liturgia").*
8. **Onde aparece.** Seção nova **Seminário** na aba Academia (só o nível geral): currículo, turmas, alunos (histórico, matrícula no curso, conclusão, documentos,
   aproveitamento) e os requisitos de disciplina. **Meu histórico escolar** e **Turmas em que leciono** em Minha Formação; o histórico escolar no perfil (aba Caminhada) e em
   Meus Dados.

**Decisões por interpretação (o responsável pode mudar):** os cursos são exatamente os quatro níveis do Art. 72; nota mínima 7,0 e frequência 75% (configuráveis por curso);
só a turma encerrada conta; o docente lança e encerra a própria turma (reabrir é só do nível geral); o parecer do aproveitamento é do Reitor ou de um docente em exercício;
a declaração vale 30 dias; o histórico emitido não muda depois; o nível registrado à mão continua valendo para quem estudou antes do sistema; o aviso das três áreas do
Art. 70 §2º é por curso e não trava nada; o histórico escolar é assentamento da Academia e fica (a exclusão LGPD tira a identificação da pessoa, como nas matrículas).

## 🔒 Trava de Revisão 8-B — antes de encerrar a FASE 8 e avançar para a FASE 9

Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da seção 3).
Audita v8.5 a v8.7 pelas 5 perguntas do checklist, e faz uma varredura final
na FASE 8 inteira antes de fechar.
