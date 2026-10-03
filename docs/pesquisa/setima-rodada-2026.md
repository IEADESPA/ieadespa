# Referência de pesquisa (7ª rodada, 2026) — expansão das Fases 5-11 e consolidação da base

> Histórico e checklist desta parte do plano de versões. As referências a “seção 2.x” e “seção 4” apontam para o
> [README](../../README.md); cada versão tem seu lugar no [índice do plano](../plano/INDICE.md).

Pedido explícito do usuário depois de fechar a v4.10: *"faça uma análise nesse
arquivo, pra saber se está tudo ok, expandindo o mais possível o que se pede em
cada fase, tentando trazer coisas novas pra ser literalmente um sistema auxiliar
de membros, auxiliar técnico para processos administrativos... pode criar mais
versões se for o caso... pesquisa, trazendo referências tanto nacionais como
estrangeiras"*.

**Diagnóstico que motivou esta rodada.** A FASE 4 recebeu seis rodadas de
pesquisa e tem ~900 linhas para 18 versões; as FASES 5 a 11 somadas tinham ~270
linhas para 31 versões — bullets de uma linha, sem fonte, sem justificativa, sem
base normativa. Não é que estivessem erradas: estavam **rasas em comparação**.
As FASES 0 a 3 estão com 139 itens concluídos e 2 pendentes (ambos remanejados de
propósito) — ou seja, foram *fechadas*, não *esgotadas*: várias coisas que hoje
sabemos que fazem falta nunca entraram lá porque ninguém tinha parado pra
perguntar o que faltava.

Quatro frentes de pesquisa de mercado (internacional + nacional) mais uma nova
varredura do Regimento Interno alimentaram esta expansão. **Achado mais grave da
rodada:** existe uma obrigação legal brasileira **vigente desde 12/01/2024** que o
sistema não cobre de forma nenhuma (Lei 14.811/2024 — certidão de antecedentes
semestral de todo voluntário que atua com menores) e outra com **multa por
omissão** (ECA Art. 245). Isso virou a FASE 7 reescrita, não um bullet solto.

| Achado | Fonte | Onde entra |
| --- | --- | --- |
| **Certidão de antecedentes de voluntário com menores, renovação semestral** — obrigação legal vigente | Lei 14.811/2024 (art. 59-A do ECA) | v7.7 (nova) |
| **Comunicação obrigatória de suspeita de maus-tratos ao Conselho Tutelar** — multa de 3 a 20 salários por omissão | ECA Art. 13 e 245 | v7.8 (nova) |
| Escuta protegida — igreja acolhe e encaminha, **não** inquire (não revitimizar) | Lei 13.431/2017 | v7.8 (nova) |
| Consentimento específico e destacado para dados de menores | LGPD Art. 14 | v7.7 (nova) |
| Check-in/check-out infantil com código de retirada e cadeia de custódia | Planning Center Check-Ins, FellowshipOne, ChurchSuite | v7.10 (nova) |
| Regra dos dois adultos + proporção adulto/criança como **bloqueio de escala** | Church Answers, Adventist Risk, MinistrySafe | v7.7 (nova) |
| Triagem estruturada de voluntário (aplicação → referências → entrevista → antecedentes → treinamento) | MinistrySafe 5-Part Safety System, Praesidium Safety Equation | v5.7 (nova) |
| Registro de incidentes separado da disciplina + afastamento cautelar automático | Praesidium, Royal Commission (10 Child Safe Standards), Dallas Charter/USCCB | v7.8 (nova) |
| **ECF obrigatória mesmo sendo imune** — multa mínima R$ 500/mês | IN RFB 2.004/2021 | v4.19 (nova) |
| **ECD obrigatória acima de R$ 1,2 mi/ano** de receitas | IN RFB 1.420/2015 art. 3º-A | v4.19 (nova) |
| eSocial (categoria 781, rubrica 3525) + DCTFWeb mesmo sem empregados CLT | Lei 8.212/91 art. 22 §§13-14 | v4.19 / v4.10 |
| EFD-Reinf série R-4000 substituiu a DIRF (extinta em 2025) | IN RFB / EFD-Reinf | v4.19 (nova) |
| **Imunidade se perde por desorganização formal**, não por desvio — escrituração é requisito | CF Art. 150 VI "b" §4º; CTN Art. 14 | v4.20 (nova) |
| Receita acessória (bazar, aluguel de salão) só é imune se aplicada nas finalidades essenciais | Súmula Vinculante 52; RE 578.562 | v4.21 (nova) |
| Ministro: sem vínculo, sem INSS patronal, **com IRPF** e risco de descaracterização | Lei 13.137/2015; Lei 14.647/2023 | v4.10 (expandida) |
| **LGPD dispensa consentimento** para organização religiosa tratar dado de membro | LGPD Art. 11, II, "a" | vB.8 (nova) |
| PLD-FT: doação em espécie acima de limite exige identificação do doador | Lei 9.613/98; GAFI Recomendação 8 | v4.22 (nova) |
| Lei Anticorrupção alcança associações/fundações (programa de integridade) | Lei 12.846/2013; Decreto 11.129/2022 | v4.22 (nova) |
| Motor de workflow/automação genérico (gatilho → ação → status) substitui 20 features pontuais | Rock RMS, Clearstream, Planning Center Workflows | vB.3 (nova) |
| Filas de acompanhamento com **dono e SLA** ("quem está cuidando de quem") | Rock RMS Connections, MinistryPlatform Care Cases, CCB process queues | v7.11 (nova) |
| Detecção de afastamento por **desvio do próprio padrão** da pessoa (não regra fixa) | CDM+ Missing Analysis, Tithely | v7.11 (nova) |
| Portal/app do membro com self-service real (escalas, inscrições, cadastro, filhos) | Church Center (Planning Center), My ChurchSuite | vB.5 (nova) |
| Escala com auto-scheduler, bloqueio de indisponibilidade e **troca entre voluntários** | Planning Center Services, ChurchSuite Rotas | v5.6 (nova) |
| Trilhas de discipulado ("Steps") como entidade de primeira classe, com funil | Rock RMS Steps | v8.5 (nova) |
| LMS interno + educação continuada como pré-requisito de promoção ministerial | Rock RMS LMS, Lifeway Ministry Grid, RightNow Media | v8.6 (nova) |
| Seminário precisa de **SIS** (histórico escolar, CH, aproveitamento), não de LMS | Classter, Populi | v8.7 (nova) |
| Caderneta digital da EBD com os campos da CPAD (presentes, visitantes, bíblias, revistas, oferta) | eScriptura, Domus EBD, CPAD Escola Dominical | v6.8 (nova) |
| Scorecard de saúde por **razões**, não valores absolutos (compara igreja de 80 com a de 900) | The Unstuck Group, Carey Nieuwhof, Lifeway Research | v12.1 (nova fase) |
| Benchmark entre congregações **anonimizado por percentil** (reduz política interna) | Gloo + Barna ChurchPulse | v12.2 (nova fase) |
| Engagement score e previsão de evasão cruzando contribuição + presença + participação | Pushpay Insights, ChurchTechToday 2026 | v12.1 (nova fase) |
| Consentimento de comunicação **por canal E por categoria**, com opt-out granular | Meta/WhatsApp Business API, Infobip, SocialHub (LGPD) | v7.12 (nova) |
| Inscrição paga + credenciamento por QR + lotação em tempo real | Tithely Events, ChMeetings | v7.13 (nova) |
| Dashboard de campo missionário com relatório atrasado **bloqueando repasse** | MissionaryConnect, Missions21 | v9.4 (nova) |
| Notas pastorais com nível de sigilo por papel + versão anonimizada para boletim | CareNote, Notebird Integrity Shield, TouchPoint | v7.11 (nova) |
| Group finder geográfico — mapa mostra onde há membro sem congregação próxima | Churchteams, GroupVitals | v9.5 (nova) |

## Varredura normativa (Estatuto + Regimento, 2ª passada)

A primeira varredura do texto legal produziu 7 gaps (marcados *"gap da varredura"*
nas v4.16-v4.18, v7.6 e outras). Esta segunda passada, agora com foco nas fases
5-11 — justamente as menos detalhadas — achou **16 dispositivos que criam
obrigação, prazo ou procedimento e não tinham nenhuma versão correspondente**.

O achado mais forte: **o Regimento cita nominalmente este sistema**. O Art. 80
§2º, V exige, como condição de aptidão ao batismo, o preenchimento de "formulário
eletrônico com caixa de aceite do Estatuto e do Regimento" no *"Sistema Oficial de
Gestão da IEADESPA"*. Não é o sistema que decidiu cobrir a norma — é a norma que
manda o sistema existir, e essa peça nunca foi construída.

| Gap normativo | Base | Onde entra |
| --- | --- | --- |
| **Esteira de Batismo** — turma, aptidão cumulativa (idade 12+, certidão de casamento p/ coabitantes, vida pregressa, Curso de Discipulado) e **aceite eletrônico do Estatuto no sistema** | Reg. Art. 80 §§1º-3º | vB.11 (nova) |
| Registro de Apresentação de Crianças — impedimentos (união estável sem certidão, disciplina em curso), janela de idade (preferência 90 dias, **vedado acima de 1 ano**), ato reservado não gera certificado | Reg. Art. 82 §§2º-3º | vB.12 (nova) |
| **Motor do Calendário Oficial** — 5 níveis de precedência, prazo fatal **15/jan**, "Direito Adquirido Temporal" por ordem de chegada, vedadas 2 festas de Nível 4 na mesma Área no mesmo fim de semana, indeferimento por "Esgotamento de Pauta" | Reg. Art. 154 §§1º-4º | v7.2 (expandida) |
| Ciclo Mensal de Governança e Santa Ceia — datas fixas (Conselho Fiscal 3º domingo, CLI último domingo), Ceia Geral em maio/outubro com **fechamento obrigatório de todas as congregações**, AGE da CLI com 48h | Reg. Art. 154-A, 81 §1º, 147 §2º | v7.2 (expandida) |
| **Balancete não entregue bloqueia liberação de recurso** do departamento — saldo virtual individualizado em conta única | Reg. Art. 133-C §§1º-2º; Art. 152 | v5.4 (expandida) |
| **Frota de veículos** — Termo de Autorização de Condução por missão, CNH válida, controle de chaves, multa/pontos transferidos ao condutor, combustível só com NF no CNPJ da Igreja | Reg. Art. 155 §§1º-3º | v4.23 (nova) |
| **Identidade Visual Anual** — sugestões 01-15/nov, triagem, votação 22-30/nov, escolha até 31/12, **vedado repetir tema desde 2006**, fornecedor único, pedido do Dirigente = dívida irrevogável | Reg. Art. 159 §§1º-7º | v7.14 (nova) |
| Assistência Social (Ação da Fé) — programas "sempre mediante cadastro socioeconômico" + triagem por Assistente Social credenciado | Reg. Art. 46; Art. 52, VII | v5.9 (nova) |
| **Obras e licenciamento** — AVCB + Alvará/Habite-se como requisito, **vedada inauguração de templo clandestino**, regras de placa, eficiência energética | Reg. Art. 87 §§1º-3º; Art. 162-A §2º | v4.24 (nova) |
| **Regra das 24 Horas** — omissão do administrador de canal torna a Igreja corresponsável; senhas pertencem à Secretaria Geral (troca imediata na sucessão); "Área Cega"; grupos satélites | Reg. Art. 160 §§1º-5º; Art. 160-A | v7.3 (expandida) |
| Política de Porta-Voz Único — regime de crise com vedação de manifestação dos demais líderes | Reg. Art. 161-B §§1º-2º | v7.15 (nova) |
| **Mediação e Arbitragem Eclesiástica** — via obrigatória antes do Judiciário em conflito patrimonial/administrativo | Reg. Art. 161-A (Lei 9.307/96) | vB.16 (nova) |
| Intervenção em Entidade Vinculada — **ratificação da CLI em 15 dias sob pena de perder eficácia**; formação legal exigida do gestor | Reg. Art. 47-A §§1º-2º; Art. 153 | v9.1 (expandida) |
| Conselho Consultivo Técnico (Parecer de Viabilidade antes de imóvel de alto valor/empréstimo, **vedado parentesco com a Diretoria**) e Colégio de Dirigentes Congregacionais | Reg. Art. 31; Art. 151 §2º | vB.14 (nova) |
| Consolidação normativa — Texto Mestre atualizado em **48h** após registro da ata, nota de vigência, registro integral quando alterações passam de **30%**, revisão sistêmica a cada 4 anos | Reg. Art. 162 §§2º-4º; Art. 162-B | vB.15 (nova) |
| Controle de acesso à Assembleia (impedidos: não-membros, disciplinados, **quem já tem carta de mudança expedida**) + justificativa de falta com motivos vedados (escala/evento de departamento não justifica) | Reg. Art. 142-143; Art. 149 §§1º-2º | vB.13 e v7.9 (expandidas) |

**Conclusão da pesquisa.** O sistema tem hoje 113 endpoints, 95 tabelas e 59
migrações — e **nenhum teste automatizado**, nenhum mecanismo de notificação
(nada no sistema avisa ninguém de nada; tudo é "calculado na leitura", mas a
pessoa precisa abrir a tela certa pra descobrir), nenhuma busca global, nenhum
motor de workflow reaproveitável, e um `app/script.js` de 7.898 linhas em arquivo
único. Isso não é dívida técnica pontual: é a **base** que as fases 5-11 vão
carregar. Daí a FASE B abaixo, inserida de propósito entre a FASE 4 e a FASE 5.

## 🔒 Trava de Revisão 4-C — antes de encerrar a FASE 4 e avançar para a FASE B

- [x] Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da
      seção 3). Auditou v4.21 a v4.24 pelas 5 perguntas do checklist e fez
      uma varredura final na FASE 4 **inteira** (v4.1 a v4.24).

  **1-2-3-4 (v4.21 a v4.24): limpo.** README×código coerente em todas as 4
  versões (toda tabela/rota citada existe de fato); nenhuma tela nova
  órfã (todo `id` de `script.js` bate com `index.html`, inclusive o
  cuidado de renomear os campos de marco da obra —
  `obraMarcoDescricao`/`obraMarcoData` — pra não colidir com os campos de
  marco do PDQ já existentes); sem `TODO`/gambiarra deixada pra trás.
  Deploy de ponta a ponta confirmado a cada push (CI verde).

  **5. Varredura final da FASE 4 — achado real, corrigido nesta trava:**
  Doações (v4.22) e receitas acessórias avulsas (v4.21) são dinheiro que
  entra de verdade no caixa institucional, mas não estavam sendo somadas
  nas Demonstrações Contábeis (`shared/demonstracoes.js`, v4.9) — Balanço
  (Caixa e Equivalentes), DRP e Fluxo de Caixa ficavam subavaliados.
  **Corrigido**: as três funções agora somam `Doacoes` e `ReceitasAcessorias`
  (excluindo as que já nascem de uma Cessão de Templo onerosa via
  `CessaoTemploId` — essas já são contabilizadas pela trilha existente
  `ContasAReceber` → `LancamentosTesouraria`, e somar de novo contaria o
  mesmo dinheiro duas vezes). Demais mecanismos financeiros continuam
  batendo: 60/40 do Art. 118 e Rateio Geral (`shared/tesouraria.js`,
  `GestaoRateioGeral`) usam `SUM` com colunas nomeadas, não tocados pelas
  colunas novas de v4.21-v4.24; PDQ e CNAB 240 (`GestaoRemessasBancarias`)
  não referenciam nenhuma tabela alterada nesta rodada. Corrigido também um
  comentário desatualizado em `shared/tesouraria.js` (apontava pra um
  módulo `shared/rateioGeral.js` que nunca existiu — o Rateio Geral sempre
  viveu em `GestaoRateioGeral`).
