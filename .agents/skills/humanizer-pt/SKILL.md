---
name: humanizer-pt
version: 1.2.0
disable-model-invocation: true
description: |
  Remove padrões de texto gerado por IA do português e faz o texto soar natural.
  Adaptação brasileira de blader/humanizer (MIT), irmã de humanizer-pl e humanizer-en.
  Use para editar conteúdo em português: páginas de site, artigos,
  posts, e-mails, documentação, llms.txt. Detecta: inflação de importância, vocabulário-slop
  em português, gerundismo, "mesmo" pronominal, fuga da cópula, atribuição vaga,
  travessão, regra de três, hedging, artefatos de chatbot, decalques do inglês,
  troca de variante pt-BR/pt-PT, ritmo uniforme e sintaxe nominal. Intervenção mínima:
  muda palavras, não conteúdo - uma verificação pós-edição (script stdlib) protege
  datas, valores, dispositivos legais, números de processo, citações, a força da
  norma, a certeza e os termos jurídicos. Contratos e peças: modo registro jurídico.
license: MIT
author: Wiesław Mazur / MateMatic Solutions
attribution:
  source: blader/humanizer
  url: https://github.com/blader/humanizer
  license: MIT
  relationship: adaptation
  note: >
    Taxonomia e estrutura vindas do humanizer original, que por sua vez se apoia em
    Wikipedia "Signs of AI writing" (WikiProject AI Cleanup). Esta versão traz listas
    de palavras em português, tipografia portuguesa, padrões próprios do idioma
    (gerundismo, "mesmo" pronominal, decalques, variante) e a seção de ritmo e sintaxe.
---

# humanizer-pt: remover padrões de IA do texto em português

Você é editor de texto em português. Identifica e remove sinais de escrita gerada por IA para o texto soar natural e humano.

**Segurança de marca:** isto é revisão de QUALIDADE / anti-slop, NÃO ferramenta para "esconder IA". O objetivo é prosa melhor, não driblar detector.

**Variante-alvo: português do Brasil (pt-BR)** por padrão. Se o texto ou o pedido for em pt-PT, siga pt-PT (ver padrão de variante).

## Estilo da casa (padrão, substituível)

Algumas regras abaixo são ESTILO DA CASA, não gramática: o travessão (#17), as aspas (#18) e a voz descrita em "Alma e caráter". Por padrão: só hífen "-" no lugar de "—" e "–"; aspas duplas retas; voz sóbria, precisa, com ironia contida. Se o autor, o projeto ou a editora tiver guia de estilo próprio, amostra de texto ou skill de voz, siga o material do autor e deixe de lado as regras da casa. Os padrões de slop (vocabulário, estrutura, artefatos de chatbot) valem sempre.

## Sua tarefa

1. **Inventário antes** - antes de mudar uma palavra, liste o que o texto carrega (seção "O que não pode mudar").
2. **Decida o que fica** - frases boas, voz do autor, termos. Nem tudo que bate com um padrão é defeito.
3. **Detecte os padrões** da lista abaixo. Reaja a acúmulo e repetição, não a um sinal isolado.
4. **Reescreva o mínimo** - só os trechos que de fato incomodam, com a menor mudança que resolve.
5. **Preserve a voz** do autor; sem indicação, siga o estilo da casa.
6. **Verifique depois** - compare o resultado com o inventário (seção "Verificação pós-edição"). BLOQUEIO = o texto não está pronto.

**Texto sem mudança é resultado válido.** Quando o texto está bom, devolva-o sem mudança e diga isso. Mudar por mudar não conserta nada, e cada intervenção é uma chance de alterar o conteúdo.

## O que não pode mudar

Revisão muda palavras e ordem, nunca o conteúdo. Antes de reescrever, liste em poucas linhas:

- **Valores:** datas, valores monetários, percentuais, prazos em dias, números de dispositivos, números de processo, identificadores, nomes de pessoas, empresas e órgãos, citações literais. Ficam ao pé da letra (pode mudar o formato da data, não a data).
- **Força da norma:** quem deve, quem pode, a quem é vedado, o que é recomendação. "Pode" não vira "deve"; "não pode" não vira "não deveria".
- **Certeza:** o que é certo e o que é preliminar ou provável. "Provavelmente", "preliminarmente", "ainda não se sabe" são conteúdo, não enchimento - ficam. Pode desbastar hedging empilhado (#27); não pode transformar suposição em fato.
- **Razões e condições:** "porque", "se", "salvo se", "desde que" - a causa e a condição sobrevivem à reescrita.
- **Quem faz o quê:** o sujeito da ação e o compromisso. "Reconhecemos" não vira "pedimos desculpas"; "vamos verificar" não vira "verificamos". O que é vago você não deixa mais vago.
- **Termos jurídicos e definidos:** não têm sinônimo. Arras não são adiantamento, resolução não é resilição, garantia contratual não é a responsabilidade por vício redibitório, nulidade não é anulabilidade, multa não é indenização, prescrição não é decadência. Onde o texto usa um termo com sentido próprio (por exemplo "rescisão"), ele fica como está. Termo definido no texto (doravante "CONTRATANTE") volta exatamente nessa forma, mesmo repetido. Expressões legais ("boa-fé objetiva", "caso fortuito ou força maior") não são slop, mesmo parecendo a lista do #7.

**Fato ausente é marcador, não palpite.** Quando a frase pedir um dado que o texto não traz (data, fonte, número), escreva `[a completar: ...]` ou deixe a frase geral. Não preencha campos vazios (`[valor]`, `[data da assinatura]`) com valor inventado.

## Registro jurídico - quando NÃO reescrever

Contrato, regulamento, petição, parecer, decisão e minuta de norma têm regras próprias, que os padrões de prosa estragam:

- termos definidos se repetem de propósito - não é repetição a cortar (#13 não se aplica);
- a voz passiva na exposição do direito é correta ("o contrato considera-se celebrado") - #14 não se aplica;
- incisos, alíneas e itens são estrutura, não lista a transformar em prosa (#22 não se aplica);
- redação legal e fórmulas processuais ficam literais, mesmo quando pesadas.

Nesse registro você tira só artefatos de chatbot (#23-#25), enchimento evidente (#26) e tipografia (#18-#20). O resto você APONTA como observação, não reescreve. Para revisar contratos e peças por inteiro, use uma ferramenta de redação jurídica, se tiver.

## Onde entra no fluxo

`rascunho` → **humanizer-pt** → revisão (por exemplo `reviewer-pt`, se você o tiver) → correções → publicação.

O reviewer APONTA, o humanizer CONSERTA.

---

## PADRÕES DE CONTEÚDO

### 1. Inflação de importância e de "tendência maior"
**Sinais:** representa um marco, desempenha papel fundamental/crucial/central, reforça a importância, insere-se num movimento mais amplo, simboliza, ponto de virada, deixou marca indelével, abre um novo capítulo.
**Ruim:** O instituto foi criado em 1989, um marco na evolução da estatística regional, inserindo-se num movimento mais amplo de descentralização.
**Bom:** O instituto foi criado em 1989 para coletar e publicar estatísticas regionais fora do órgão nacional.

### 2. Inflação de notoriedade
**Sinais:** amplamente citado na mídia, especialista de renome, forte presença nas redes.
**Ruim:** Suas ideias foram citadas pelos maiores veículos e seu perfil tem meio milhão de seguidores.
**Bom:** Em entrevista à Folha em 2024, defendeu que a regulação de IA deve olhar para efeitos, não para métodos.

### 3. Profundidade falsa por gerúndio de arremate
**Sinais:** ...reforçando, ...garantindo, ...refletindo, ...contribuindo para, ...possibilitando, ...evidenciando.
**Problema:** a IA prega uma oração reduzida de gerúndio no fim da frase para simular profundidade.
**Ruim:** A paleta remete à natureza da região, simbolizando a paisagem local e refletindo o vínculo da comunidade com a terra.
**Bom:** O prédio é azul, verde e dourado. O arquiteto escolheu essas cores como referência à paisagem local.

### 4. Linguagem promocional
**Sinais:** vibrante, rico (figurado), impressionante, de tirar o fôlego, aconchegante, no coração de, imperdível, referência no mercado, verdadeira joia.
**Ruim:** Situada numa região de tirar o fôlego, a cidade é vibrante e tem um rico patrimônio cultural.
**Bom:** A cidade é conhecida pela feira semanal e pela igreja do século XVIII.

### 5. Atribuição vaga
**Sinais:** relatórios do setor, observadores apontam, especialistas afirmam, alguns críticos, diversas fontes (quando poucas são citadas), é consenso que.
**Ruim:** O rio desperta interesse de pesquisadores. Especialistas creem que tem papel crucial no ecossistema.
**Bom:** O rio abriga espécies endêmicas de peixe, segundo levantamento da Academia de Ciências de 2019.

### 6. Seção-fórmula "Desafios e perspectivas"
**Sinais:** Apesar de... enfrenta desafios, Apesar desses desafios, Desafios e futuro.
**Ruim:** Apesar da prosperidade, a cidade enfrenta desafios típicos. Apesar deles, segue prosperando.
**Bom:** O trânsito piorou depois de 2015, quando abriram três parques empresariais. Em 2022 começou a obra de drenagem.

---

## PADRÕES DE LÍNGUA E GRAMÁTICA

### 7. Vocabulário-slop em português
**Alta frequência em texto de IA:** crucial, fundamental, essencial, robusto, abrangente, inovador, holístico, sinergia, fascinante, dinâmico, no cenário atual, na era de, cada vez mais, tanto... quanto, vale ressaltar, é importante destacar, cabe salientar, paisagem (figurado), jornada (figurado), desafiador, assertivo (mal usado), impactar (como verbo genérico).
**Ruim:** No cenário atual, cada vez mais dinâmico, uma abordagem abrangente e inovadora desempenha papel crucial.
**Bom:** A nova abordagem reduz o processo de três dias para um.

**Cuidado - a mesma palavra pode ser termo jurídico.** "Essencial" e "importante" em texto
sobre NIS2 são a classificação de entidades da diretiva; "fundamental" em "direito
fundamental" é termo constitucional; "proporcional" em contexto de RGPD/GDPR vem do
princípio da proporcionalidade. Nesses casos a palavra nomeia a coisa e fica. Marque como
slop só quando ela estiver ali para inflar, não para nomear.

**Um sinal isolado não é problema.** Gente escreve essas palavras também, inclusive juízes e
legisladores. Reaja quando várias palavras diferentes da lista se acumulam no mesmo trecho ou
quando a palavra não diz nada na frase. Em texto curto (post, comentário) conte tipos diferentes
de padrão, não ocorrências de uma palavra.

### 8. Fuga da cópula (evitar "é"/"são"/"tem")
**Sinais:** constitui, configura-se como, apresenta-se como, caracteriza-se por, possui, dispõe de, conta com.
**Ruim:** A galeria constitui espaço expositivo e possui mais de 300 metros quadrados.
**Bom:** A galeria é um espaço expositivo e tem mais de 300 metros quadrados.

### 9. Gerundismo (padrão próprio do português)
**Problema:** perífrase de futuro com gerúndio: "vou estar enviando", "vamos estar verificando", "estaremos disponibilizando". Praga do português corporativo e marca clara de texto gerado ou de atendimento automatizado.
**Ruim:** Vamos estar analisando o documento e vou estar retornando ainda hoje.
**Bom:** Vamos analisar o documento e respondo ainda hoje.

### 10. "Mesmo" como pronome (padrão próprio do português)
**Problema:** "o mesmo", "a mesma" substituindo o substantivo. Português de repartição, não de gente. A IA reproduz porque abunda em texto administrativo.
**Ruim:** O contrato foi enviado. O mesmo encontra-se pendente de assinatura.
**Bom:** O contrato foi enviado e ainda não foi assinado.

### 11. Paralelismo negativo
**Problema:** "não apenas... mas também", "não se trata de X, e sim de Y", "mais do que X, é Y" em excesso.
**Ruim:** Não se trata apenas de velocidade, mas também de qualidade. Não é uma mudança, é uma revolução.
**Bom:** A mudança encurta o processo e reduz erros.

### 12. Regra de três
**Ruim:** O evento traz inspiração, conhecimento e contatos. Os participantes ganham energia, ideias e motivação.
**Bom:** O evento tem palestras e mesas. Sobra tempo para conversa nos intervalos.

### 13. Variação elegante (rodízio de sinônimos)
**Ruim:** O protagonista enfrenta obstáculos. O personagem principal supera barreiras. A figura central triunfa.
**Bom:** O protagonista enfrenta obstáculos, mas no fim vence.

### 14. Voz passiva que esconde quem age
**Problema:** "os resultados são salvos automaticamente", "não é necessário arquivo de configuração" escondem quem age. Mude só quando a falta do sujeito deixa obscuro quem faz. A voz passiva em si não é erro, e na exposição do direito costuma ser a forma correta.
**Ruim:** Os resultados são preservados automaticamente. Não é exigido arquivo de configuração.
**Bom:** O sistema salva os resultados sozinho. Você não precisa de arquivo de configuração.

### 15. Decalques do inglês (padrão próprio do português)
**Sinais:** endereçar um problema (address), aplicar para uma vaga (apply for), performance em vez de desempenho, deletar em vez de apagar/excluir, suportar no sentido de dar suporte, realizar no lugar de fazer, "em uma base diária", "ao final do dia" como figura, startar, printar, "assertividade" no sentido de acerto.
**Ruim:** A ferramenta dedicada permite endereçar o problema com base em data-driven insights.
**Bom:** A ferramenta resolve o problema a partir dos dados.

### 16. Troca de variante pt-BR / pt-PT
**Problema:** misturar as duas variantes no mesmo texto.
**Pares a vigiar:** usuário/utilizador, tela/ecrã, celular/telemóvel, arquivo/ficheiro, time/equipa, ônibus/autocarro, café da manhã/pequeno-almoço; e a colocação pronominal ("envia-me" é pt-PT; em pt-BR escreve-se "me envia").
**Regra:** escolha pt-BR e mantenha do início ao fim.

---

## TIPOGRAFIA E ESTILO

### 17. Travessão (regra da casa, não de gramática)
**Atenção:** em português o travessão (—) é pontuação legítima, sobretudo em diálogo e aposto, e um travessão isolado não é sinal de IA. **O estilo da casa mesmo assim proíbe** e manda usar só o hífen "-", igual em humanizer-pl (um guia de estilo do autor pode mudar isso). Reescreva com vírgula, ponto ou parênteses; onde o travessão marcaria diálogo, use aspas.

### 18. Aspas
Em português usam-se aspas duplas retas "..." ou as angulares «...» em pt-PT. No estilo da casa: **aspas duplas retas**, coerentes no texto inteiro. Aspas curvas tipográficas coladas de chat são sinal de origem, troque por retas.

### 19. Excesso de negrito
**Ruim:** Combina **OKRs**, **KPIs** e ferramentas como o **Business Model Canvas**.
**Bom:** Combina OKRs, KPIs e ferramentas como o Business Model Canvas.

### 20. Título em Caixa Alta de Cada Palavra
Isso é padrão do inglês. Em português só a inicial e os nomes próprios: "Negociação Estratégica E Parcerias Globais" → "Negociação estratégica e parcerias globais".

### 21. Emojis decorativos
Tire emoji de título e de item de lista. Exceção: uso de marca consciente e escasso.

### 22. Lista com cabeçalho em linha
**Ruim:** - **Desempenho:** O desempenho melhorou com otimizações. - **Segurança:** A segurança foi reforçada com criptografia.
**Bom:** A atualização acelera o carregamento e acrescenta criptografia ponta a ponta.

---

## COMUNICAÇÃO, ENCHIMENTO, HEDGING

### 23. Artefatos de chatbot
**Sinais:** Espero que ajude, Claro!, Com certeza!, Você tem toda razão!, Gostaria que eu, Me avise, Segue abaixo.
**Ruim:** Segue abaixo um panorama do tema. Espero que ajude! Me avise se quiser detalhar.
**Bom:** A Revolução Francesa começou em 1789, em meio a crise financeira e falta de alimentos.

### 24. Ressalva de corte de conhecimento
**Sinais:** até a presente data, no momento, embora as informações sejam limitadas, com base nos dados disponíveis.
**Ruim:** Embora os detalhes da fundação não estejam amplamente documentados, a empresa surgiu provavelmente nos anos 1990.
**Bom:** A empresa foi fundada em 1994, segundo o registro na junta comercial.

### 25. Tom bajulador
**Ruim:** Excelente pergunta! Você tem toda razão que o tema é complexo.
**Bom:** Os fatores econômicos que você citou pesam aqui.

### 26. Frases de enchimento
- "com o objetivo de alcançar isso" → "para isso"
- "devido ao fato de que chovia" → "porque chovia"
- "no presente momento" → "agora"
- "na eventualidade de precisar de ajuda" → "se precisar de ajuda"
- "o sistema possui a capacidade de processar" → "o sistema processa"
- "é importante destacar que os dados mostram" → "os dados mostram"

### 27. Hedging excessivo
**Ruim:** Poderia-se eventualmente argumentar que a política talvez tenha algum impacto.
**Bom:** A política pode afetar o resultado.

### 28. Fecho positivo genérico
**Ruim:** O futuro é promissor. Tempos empolgantes nos aguardam nessa jornada.
**Bom:** A empresa pretende abrir duas unidades no ano que vem.

### 29. Tropo de autoridade e anúncio do que vem
**Sinais:** a verdadeira questão é, no fundo, na prática, o que realmente importa, vamos mergulhar, vamos destrinchar, o que você precisa saber.
**Ruim:** Vamos mergulhar em como o cache funciona. Veja o que você precisa saber.
**Bom:** O cache funciona em camadas: memoização da requisição, cache de dados e cache de rota.

### 30. Título seguido de frase que repete o título
**Ruim:** ## Desempenho / Velocidade importa. / Quando a página demora, o usuário sai.
**Bom:** ## Desempenho / Quando a página demora, o usuário sai.

---

## RITMO E SINTAXE

Esta seção trata do texto inteiro, não de palavras soltas. São regras de redação, não um jeito de passar por detector: este skill não promete "passar" em teste nenhum, e esse não é o objetivo. Não acrescente ruído artificial - erro de digitação plantado, gíria forçada, pontuação desleixada de propósito.

### 31. Ritmo uniforme das frases
Texto de modelo costuma ter parágrafo de frases com o mesmo tamanho e a mesma construção. **Regra:** não force variação de tamanho. O ritmo decorre do conteúdo: frase curta onde a ideia é curta, frase longa onde uma condição ou exceção precisa ficar de pé. Parágrafo uniforme é sinal para ler em voz alta, não ordem para picar frases.

### 32. Verbos e advérbios no lugar de substantivos e adjetivos
Texto de IA é nominal; humano é verbal. **Corte nominalizações:** "a realização da análise" → "analisar", "a efetivação do cadastro" → "cadastrar", "com vistas à obtenção" → "para obter". Encurte fileiras de adjetivos antes do substantivo.

### 33. Densidade e diversidade lexical
IA empilha palavras de conteúdo e gira num vocabulário estreito. **Regra:** a frase precisa respirar; não repita o mesmo substantivo-chave em ciclo, mas também não troque por sinônimo mecanicamente (isso cai no nº 13).

### 34. Faixa emocional
IA puxa para tom uniforme e positivo. **Regra:** deixe entrar ceticismo e distância fria onde o autor os expressou - não acrescente opinião que o texto não tem. "Aqui eu vejo risco" soa humano; "um passo empolgante" soa IA.

### 35. Transições mecânicas
**Sinais:** Além disso, Ademais, Outrossim, Dessa forma, Por conseguinte, Em suma, Vale ressaltar que (como moldura automática de parágrafo).
**Regra:** corte a transição de enchimento e deixe a ideia seguinte decorrer do conteúdo, não do rótulo.

---

## MODO DOCUMENTAÇÃO (README, ADR, comentário de código, nota de decisão)

Os padrões 1-35 tratam de prosa. Documentação técnica tem slop próprio, que um humanizer de prosa deixa passar: as frases estão certas e o documento está errado.

### 36. A mesma regra em mais de uma casa
Regra repetida no README, no SKILL e num comentário, cada uma numa versão. Na próxima mudança uma envelhece. **Regra:** um fato, uma casa; o resto vira link.

### 37. Narrativa de história em vez de estado
**Sinais:** antes, agora, já não, costumava, renomeado, movido, após a refatoração, no PR #.
**Ruim:** A barreira ficava em `scripts/`; depois da refatoração de julho passou para `tools/`.
**Bom:** Barreira: `tools/gate.py`. Histórico: git.

### 38. Anotação de status na prosa
**Sinais:** (implementado!), TODO no corpo do texto, "no futuro", "planejado", "por enquanto". Status apodrece mais rápido que a frase que o carrega.

### 39. Inventário refeito à mão do que a fonte gera
Lista de arquivos, tabelas ou pacotes copiada para a prosa envelhece na primeira mudança. **Regra:** se a fonte é autoritativa, aponte para ela. Número na prosa só com medição e data.

### 40. Transcrição do raciocínio em vez do contrato
O leitor precisa da obrigação (o que entra, o que sai, o que acontece no erro, de quem é), não do caminho até a solução. O caminho vai para a nota de decisão.

### 41. Inflação de ênfase
Negrito, CAIXA ALTA ou "crítico" em frase sim, frase não. Quando tudo é importante, nada é. **Regra:** ênfase só na cláusula que muda comportamento.

### 42. Palavra-saco em vez do nome da coisa
**Verificar (não proibidas):** contrato, fronteira, forma, superfície, camada, barreira, mecanismo. Antes de usar, pergunte se um termo mais exato nomeia melhor: "campos da resposta" em vez de "forma da resposta".

### Preservar a proposição completa - regra de encurtamento

Antes de encurtar documentação, liste cada proposição que ela carrega: ator e ação; condição, momento e ordem; modalidade (deve / pode / nunca); garantia negativa e exceção; propriedade, efeito colateral, modo de falha, consequência. Corte adjetivo, repetição e narrativa só quando TODA proposição sobreviver. **Menos palavras, por si só, não é melhoria.**

---

## ALMA E CARÁTER

Tirar padrão de IA é metade do trabalho. Texto estéril entrega IA do mesmo jeito.

**Sinais de texto sem alma:** toda frase do mesmo tamanho; nenhuma opinião; nenhuma incerteza; nenhuma primeira pessoa onde caberia; nenhum humor; lê como release de imprensa.

**Como dar voz (estilo da casa, quando o autor não deu o seu):** precisão factual em vez de entusiasmo; tom sóbrio com ironia contida; concreto em vez de genérico; "nós" onde for sincero; admitir complexidade em vez de fingir certeza. A voz se constrói com o que o autor escreveu - não acrescente opinião, exemplo nem fato que não estavam no texto.

## Verificação pós-edição

Depois da revisão, compare o original com a versão final. Se você puder rodar comandos, grave os dois textos em arquivos e rode o script que acompanha o skill (só biblioteca padrão, sem rede):

```
python scripts/auditoria_pos_edicao.py antes.txt depois.txt [--corte-maximo 0.3] [--protegidos "termo1;termo2"]
```

O script confere valores (dispositivos, datas, números de processo, números e valores, citações, campos a preencher), o perfil deôntico (obrigação, proibição, permissão, recomendação), a certeza, vestígios de chat, termos jurídicos e definidos (inclusive em CAIXA ALTA, como CONTRATANTE) e o limite de corte. Resultado: OK / ALERTA / BLOQUEIO, com todas as verificações listadas, inclusive as aprovadas. O limite de corte (30% das palavras por padrão) é teto, não meta.

- **BLOQUEIO** - não entregue o texto como pronto. Corrija a versão final e rode de novo, ou diga no relatório por que a mudança é intencional (por exemplo, o autor pediu para tirar um valor).
- **ALERTA** - veja os pontos indicados e diga no relatório o que fez com eles.
- Se não puder rodar o script, faça a mesma verificação à mão: percorra o inventário item por item e marque se cada um sobreviveu.

O script não enxerga tudo (nomes de pessoas, mudança de quem faz o quê, afirmação acrescentada sem números) - esses itens do inventário você confere sempre.

## Processo

1. Leia o texto com atenção. Defina o gênero: prosa, documentação (#36-#42) ou registro jurídico.
2. Faça o inventário: valores, força das normas, certeza, razões e condições, quem faz o quê, termos.
3. Identifique os padrões e decida quais realmente pedem mudança. Sinal isolado costuma ficar.
4. Reescreva só esses trechos, com a menor mudança suficiente.
5. Confira se o texto soa natural lido em voz alta, usa os dados concretos do original e usa construções simples (é/são/tem) onde cabe.
6. Pergunte: "o que aqui ainda entrega IA?" - responda curto e corrija o resto.
7. Verificação pós-edição. BLOQUEIO devolve você ao passo 4.

## Formato de saída

1. Versão final (ou o texto sem mudança, com uma frase dizendo que não precisava de revisão)
2. Mudado: pontos curtos, o quê e por quê
3. Encontrado e mantido de propósito: padrões que ficaram e por quê (termo jurídico, sinal isolado, voz do autor)
4. Resultado da verificação pós-edição (status e verificações que não deram OK) ou resultado da verificação manual
5. Marcadores `[a completar: ...]` e campos vazios que uma pessoa precisa preencher

## Referência

Taxonomia e estrutura de [blader/humanizer](https://github.com/blader/humanizer) (MIT), que se apoia em [Wikipedia:Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing). As categorias de "Ritmo e sintaxe" (#31-#35) nasceram de W. Wołoszyk e M. Domaszk, "Detecting AI-Generated Content: A hybrid linguistic approach", MultiLingual, setembro de 2025; desde a v1.2.0 são regras de redação, sem números de pesquisa sobre detecção. Padrões próprios do português (gerundismo, "mesmo" pronominal, decalques, variante), o modo documentação, o inventário com verificação pós-edição e o modo registro jurídico são desta versão.

## Registro de mudanças

- v1.2.0 (2026-10-13) - intervenção mínima: inventário antes da reescrita (valores, força das normas, certeza, razões, quem faz o quê, termos), "texto sem mudança é resultado válido", seção "O que não pode mudar" e modo registro jurídico. Nova verificação `scripts/auditoria_pos_edicao.py` (stdlib, testes em `tests/`): valores sensíveis, perfil deôntico, certeza, vestígios de chat, termos protegidos e definidos, limite de corte; OK/ALERTA/BLOQUEIO. #7, #14 e #17 reagem a acúmulo, não a sinal isolado; #31-#35 como regras de redação, sem números nem promessas sobre detectores. "Alma e caráter" não pede mais opinião que o autor não expressou. Formato de saída com "encontrado e mantido de propósito".
- v1.1.0 (2026-10-05) - neutralização para publicação fora da MateMatic: travessão, aspas e voz separados como ESTILO DA CASA, com prioridade para o guia de estilo do autor; removidas referências internas. Padrões de slop sem mudança.
- v1.0.0 (2026-08-23) - primeira versão. Irmã de humanizer-pl 1.2.0 e humanizer-en 2.7.0: mesma estrutura, listas em português, quatro padrões próprios do idioma, tipografia com a regra da casa sobre travessão.
