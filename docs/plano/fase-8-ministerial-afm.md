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
- **O tipo da reunião da CLI é obrigatório** e **só uma reunião que conta falta por dia** (Regimento Art. 78, III, b: a da CLI ou da AFM é no último domingo). A reunião
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

- [ ] Identidade Eclesiástica digital (Art. 76 Regimento).
- [ ] Validação de status Ativo/Inativo via QR Code em tempo real.
- [ ] Emissão centralizada na Secretaria Geral (anti-fraude).

## 🔒 Trava de Revisão 8-A — antes de avançar para a v8.5

Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da seção 3).
Audita v8.1 a v8.4 pelas 5 perguntas do checklist.

## v8.5 — Trilha de discipulado como entidade de primeira classe *(7ª rodada)*

A escada ministerial (v8.2) cobre do Auxiliar pra cima. Falta o percurso que vem
**antes** e que hoje só existe na memória do pastor: conversão, batismo com
Espírito Santo, curso de novos convertidos, primeira participação em
departamento, primeiro serviço voluntário.

- [ ] Catálogo de **tipos de marco** configurável (único vs. repetível,
      pré-requisitos), com marcos datados no perfil — a tabela `MarcosMembro`
      (v1.6) já existe e hoje é usada só para eventos avulsos; aqui ela vira
      trilha estruturada.
- [ ] **Funil por congregação**: quantos pararam entre "convertido" e "batizado",
      entre "batizado" e "primeiro serviço". É o número que mostra onde a
      assimilação trava — e ele é invisível hoje.
- [ ] Conclusão de etapa disparando o próximo passo na fila de acompanhamento
      (v7.11), em vez de depender de alguém lembrar.
- [ ] Integração com a esteira de batismo (vB.11) e com as trilhas de formação
      (v6.9). *(Rock RMS Steps)*

## v8.6 — Educação continuada e requisito verificável de promoção *(7ª rodada)*

- [ ] Carga horária mínima periódica por cargo ministerial para manter a
      credencial ativa — padrão consolidado em denominações internacionais, e
      que dá sentido prático à AFM (v8.1) além da formação inicial.
- [ ] **Pré-requisito verificado automaticamente** no fluxo de consagração
      (v8.3): o veto técnico da AFM (v8.2) deixa de depender de conferência
      manual de certificado em papel.
- [ ] Histórico de formação no perfil, com certificados verificáveis (v6.9).
- [ ] Alerta de credencial em risco por educação continuada vencida — antes de
      expirar, não depois.

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
- [ ] Corpo docente com titulação registrada (conecta com a CDER, v8.1).
      *(Classter; Populi — SIS para seminários)*

## 🔒 Trava de Revisão 8-B — antes de encerrar a FASE 8 e avançar para a FASE 9

Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da seção 3).
Audita v8.5 a v8.7 pelas 5 perguntas do checklist, e faz uma varredura final
na FASE 8 inteira antes de fechar.
