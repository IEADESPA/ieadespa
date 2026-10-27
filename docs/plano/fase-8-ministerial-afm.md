# FASE 8 — Ministerial (AFM)

> Histórico e checklist desta parte do plano de versões. As referências a “seção 2.x” e “seção 4” apontam para o
> [README](../../README.md); cada versão tem seu lugar no [índice do plano](INDICE.md).

## v8.1 — AFM (Academia de Formação Ministerial) e CLI: comparecimento e perda de assento (a antiga v7.9)

- [ ] Cadastro de Reitor + Corpo Docente.
- [ ] Matrícula obrigatória de oficiais (Auxiliares→Pastores/Missionários).
- [ ] Matrícula Ativa × Inativa (desmatriculado perde licença de oficiar).
- [ ] Níveis de escolaridade: Básico, Médio, Avançado, Bacharel Livre.
- [ ] **CDER** — Comissão de Doutrina e Educação Religiosa (Regimento, Art. 22):
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
Academia; o Seminário de novembro, Art. 70 §1º, também é aberto assim). Na Sessão Magna esperam-se **duas turmas ao mesmo tempo**: quem compõe a CLI **e** todo obreiro com
matrícula ativa na AFM. Um único registro de presença vale para as duas (Art. 69 §1º, I); a falta de quem está nas duas conta nas duas (falta dupla, §1º, II). Cada presença
guarda se a pessoa era esperada pela CLI e/ou pela AFM **naquele dia**, para que quem virou Presbítero depois não herde falta da época de Diácono.

**2. Três faltas seguidas na CLI (Estatuto Art. 27 §1º).** Conta só reuniões **ordinárias** e **Sessões Magnas** em que a pessoa era da CLI. Presença ou falta justificada
**interrompe** a sequência (é sanção: lê-se de forma restrita — as 3 faltas sem justificativa têm de ser em reuniões seguidas). Na 3ª o sistema **registra a exclusão** (data,
as 3 reuniões e por onde a pessoa entrava na CLI) e ela **sai da composição da CLI** na hora — inclusive quem entra por Ordenação, **sem perder o cargo ministerial** (perder a
cadeira na Câmara ≠ deixar de ser Pastor). Depois disso:

- **Avisos:** a pessoa recebe aviso na 2ª falta seguida (“mais uma e você perde a cadeira”) e na exclusão; a Secretaria Geral recebe a exclusão.
- **Providências que a tela mostra (Art. 27 §2º e Regimento Art. 310)** conforme por onde a pessoa entrava: cargo **eletivo** da Diretoria Executiva ou do Conselho Fiscal → a
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

### Absorvido da antiga v7.9 — CLI: comparecimento obrigatório e perda de assento por faltas (Art. 27)

Movido de v2.3 de propósito — ver nota lá. Constrói **junto** com v8.1 (AFM),
não antes: precisa primeiro saber marcar uma sessão da CLI como "integrada com
AFM" (Art. 69) pra não contar errado a cada 3 meses.

- [ ] 3 faltas consecutivas sem justificativa aceita nas reuniões da CLI
      (excluindo as integradas com AFM — *texto original; superado pelo Art. 69 §1º: as
      integradas contam, ver o desenho acima*) = perda automática do assento (Art. 27
      §1º) — calculado a partir de `Presencas`, igual mandato vencido de
      Assento (nunca marcação manual). Quem entra por Ordenação (Pastor/
      Evangelista/Presbítero) precisa de um jeito de sair da composição da CLI
      sem perder o `CargoMinisterial` (são coisas diferentes: perder assento
      na Câmara ≠ deixar de ser Pastor); quem entra por Função já sai
      naturalmente encerrando o Assento (mecanismo já existe).
- [ ] Art. 27 §2º: se a exclusão for de quem está na CLI por cargo eletivo da
      Diretoria Executiva ou Conselho Fiscal, a CLI aprecia e, sendo o caso,
      convoca AGE de destituição em até 30 dias (matéria "Destituição", já
      existente desde v2.2) — o sistema só aponta pro fluxo existente, não
      automatiza a convocação.
- [ ] **Taxonomia fechada de justificativa de falta** (Art. 149 §2º, gap da
      varredura): só fator externo justifica — **escala ou evento de departamento
      não é justificativa válida**. Catálogo com os motivos vedados bloqueados na
      própria tela, não conferidos depois por alguém que talvez não conheça o §2º.

## v8.2 — Escada ministerial e ascensão

- [ ] Escada: Membro → Auxiliar → Missionário → Diácono → Presbítero → Evangelista → Pastor.
- [ ] Interstícios e requisitos por cargo (idade, tempo, escolaridade, batismo no Espírito).
- [ ] Veto técnico da AFM (CHM) + soberania presidencial.

## v8.3 — Consagração e documentação

- [ ] Esteira de consagrações (PROTOCOLADO → EM_ANALISE → AGUARDANDO_PLENARIO → CONCLUÍDO).
- [ ] Consagração coletiva (Comissão de Unção) + diplomação.
- [ ] Documentação: CHM (Certificado de Habilitação Ministerial).

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
