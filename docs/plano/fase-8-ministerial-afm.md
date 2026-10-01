# FASE 8 — Ministerial (AFM)

> Histórico e checklist desta parte do plano de versões. As referências a “seção 2.x” e “seção 4” apontam para o
> [README](../../README.md); cada versão tem seu lugar no [índice do plano](INDICE.md).

## v8.1 — AFM (Academia de Formação Ministerial)

- [ ] Cadastro de Reitor + Corpo Docente.
- [ ] Matrícula obrigatória de oficiais (Auxiliares→Pastores/Missionários).
- [ ] Matrícula Ativa × Inativa (desmatriculado perde licença de oficiar).
- [ ] Níveis de escolaridade: Básico, Médio, Avançado, Bacharel Livre.
- [ ] **CDER** — Comissão de Doutrina e Educação Religiosa (Regimento, Art. 22):
      Reitor da AFM + 2 mestres de teologia da CLI. Vinha adiada de v2.4
      (Comissões Permanentes) porque dependia do Reitor, que nasce aqui —
      construir junto com o cadastro de Reitor deste item, reaproveitando
      `shared/comissoes.js` (mesmo padrão de CFO/CEP: calculada quando dá).

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
