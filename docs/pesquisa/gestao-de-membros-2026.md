# Pesquisa da gestão de membros (v10.1a)

Data: 13/11/2026. Objetivo: juntar as referências e o inventário para desenhar **o melhor sistema de gestão de membros feito
para a Assembleia de Deus** (v10.1b a v10.1e da [FASE 10](../plano/fase-10-experiencia-design-performance.md)).
Fontes: sistemas de gestão de igreja de fora (Planning Center, ChurchSuite, Rock RMS, Breeze, Pushpay, Elvanto/Tithely,
ChurchTrac) e do Brasil (InPeace, inChurch, CHURCH, SINAI, Sige, GI da Igreja Metodista), documentos públicos de
Assembleias de Deus locais, a LGPD e a ANPD, e o próprio código do sistema (`sql/migrations/`, `api/`, `app/`).

**Limitações:** os sistemas brasileiros publicam quase só material de venda (loja de aplicativos e reportagens); nenhum
manual de tela foi achado. Não foi achado na internet um estatuto ou regimento **nacional** da AD (CGADB) com as regras do
rol de membros: a fonte principal sobre a AD é o **Estatuto e o Regimento da própria IEADESPA**, que o sistema já segue
(os artigos citados abaixo vêm do código e de `docs/plano/fase-1-membresia.md`), com exemplos públicos de ADs locais para
comparar. Algumas páginas de ajuda (ChurchSuite) recusaram a leitura direta (erro 403) e foram lidas pelos resumos da
busca. Nenhum banco de dados foi consultado: o inventário da Parte B é leitura do código.

## Leitura em 2 minutos (para o responsável)

1. **Já temos muito mais do que parece.** O sistema guarda da pessoa: dados, contato, endereço, foto, família, batismo,
   forma de admissão, rito de recebimento, cartas, cargos (com a escada), disciplina, abandono, casamento, apresentação de
   criança, credencial com QR e os consentimentos da LGPD. Mais de 240 tabelas apontam para a matrícula da pessoa.
   O que falta mesmo é pouco: o **CPF**, a **mudança de congregação dentro do campo** com registro próprio e uma **linha do
   tempo completa**.
2. **A carteirinha digital já existe.** A credencial da v8.4 vale também para o membro comum (aparece "Membro"); o QR
   mostra a situação **de agora** (se a pessoa sair ou for disciplinada, o QR já mostra inativa, sem papel para recolher).
   É o que os sistemas brasileiros vendem como novidade. O ajuste é de tela e de emissão para todos.
3. **O ponto fraco é a escala.** Hoje a lista de Pessoas busca **todos os membros do campo** e só depois esconde os que
   a pessoa não pode ver; o navegador guarda a lista inteira. Com o rol completo vindo do sistema pago, isso fica lento.
   Exemplo: o dirigente de uma congregação de 80 membros baixaria os milhares do campo para ver os seus 80.
4. **Os melhores de fora ensinam quatro coisas:** um cadastro só por pessoa, com o lugar dela marcado (Pushpay); o membro
   corrige os próprios dados, campo por campo, só nos campos liberados (Planning Center); a vida da pessoa como uma
   sequência de passos com data (Rock: batismo, membresia); e juntar duas fichas repetidas da mesma pessoa, lado a lado
   (Rock).
5. **O que nos põe à frente deles:** a hierarquia de seis níveis (congregação, área, região, quadrante, distrito e geral)
   já existe no sistema; os de fora só têm "campus" (um nível). E as regras da AD (cartas, aclamação, reconciliação,
   integração de 90 dias, escada ministerial, abandono) já estão escritas no código.
6. **CPF com cuidado.** Para a lei, a lista de membros de uma igreja já revela a religião da pessoa, que é **dado
   sensível**. O CPF ligado a essa lista pede o cuidado maior: mostrar mascarado (`***.456.789-**`), inteiro só para quem
   precisa, guardar quem viu e quem mudou, e nunca sair na planilha exportada sem querer.
7. **Um defeito para corrigir antes de desenhar:** o "Cadastrar Pessoa" fica em branco porque o formulário só é colocado
   na tela depois que seis listas (congregações, departamentos, cargos etc.) chegam do servidor; se uma falha, ele nunca
   aparece (detalhes na seção 4.6).
8. **No fim deste documento** está a lista proposta, por prioridade, dividida nas versões v10.1b a v10.1e, marcando o que
   já temos, o que é ajuste e o que é novo, e as **decisões que ficam com você**.

---

## 1. Referências de fora (Parte A)

### 1.1 Planning Center People (Estados Unidos)

- **Ficha:** campos próprios da igreja (data, texto, sim/não, lista), organizados em abas criadas pelo administrador, sem
  programar. O "tipo de membresia" e o campus aparecem no perfil.
  <https://help.planningcenter.com/en/common-uses-for-custom-fields.html> e
  <https://www.planningcenter.com/changelog/people/40152030166427-new-include-custom-fields-membership-type-and-campus-on-church-center-profiles>
- **Família:** "domicílios"; a pessoa pode estar em mais de um (ex.: filho de pais separados), com ações em lote.
  <https://help.planningcenter.com/en/profile-overview.html>
- **Autoatendimento:** pelo aplicativo Church Center o membro atualiza os próprios campos **e os da família**. O
  administrador marca cada campo como "só leitura" ou "editável"; o próprio fabricante recomenda deixar como só leitura
  o que é da igreja (ex.: se a pessoa é presbítero). Não há aprovação das mudanças; há um QR ou link que leva direto ao
  perfil. <https://www.planningcenter.com/blog/2025/09/no-more-form-fatigue-let-people-edit-their-own-information-in-church-center>
- **Relatórios:** "listas" que filtram por qualquer campo de todos os módulos e alimentam "fluxos de acompanhamento"
  (ex.: aniversariantes, visitantes dos últimos 6 meses, quem não serve há tempo). <https://www.planningcenter.com/people>
- **Lição para nós:** o controle **campo a campo** do que o membro pode corrigir. Nós já temos uma versão mais segura
  (campos de baixo risco direto, os da vida na igreja passam pela Fila de Aprovações).

### 1.2 ChurchSuite (Reino Unido)

- **Várias igrejas sob um cadastro:** a pessoa pode pertencer a **mais de um "site"**; o usuário só vê os sites que lhe
  foram dados; só quem tem "todos os sites" põe alguém em todos. A permissão de módulo vale igual para todos os sites da
  pessoa (não dá para dar um módulo só num site). <https://support.churchsuite.com/article/216-multi-site-functionality>
  e <https://churchsuite.com/blog/2021-07-14-multi-site-people>
- **Portal do membro (My ChurchSuite):** a igreja convida; o membro mantém os dados em dia, vê as comunicações que recebeu
  e escolhe o que os outros membros podem ver dele (nome, endereço, telefone, e-mail). Nascimento, estado civil e família
  **só ele vê**. A secretaria pode mudar a privacidade por ele.
  <https://support.churchsuite.com/article/107-managing-privacy-settings-in-my-churchsuite>
- **Lição:** privacidade decidida pelo membro e o aviso de que o dado da família é dele. Nós **não** temos diretório entre
  membros, e não convém ter sem consentimento (seção 3).

### 1.3 Rock RMS (código aberto, Estados Unidos)

- **Perfil:** cabeçalho com a família, endereço e campus; a seção de família lista cada pessoa com link. Atributos
  extras, grupos e etiquetas na mesma tela.
  <https://community.rockrms.com/documentation/church-management/people/person-profile-page/intro-to-the-person-profile>
- **Família como unidade:** o endereço e o campus são **da família**; mudar o campus da família muda o de todos.
  <https://community.rockrms.com/documentation/church-management/people/families>
- **Passos ("Steps"):** a caminhada da pessoa em cartões com data: marcos que acontecem uma vez (batismo, membresia) e
  ritmos contínuos (grupo, serviço). Os passos centrais não podem ser apagados (o relatório fica consistente) e toda
  mudança vai para a aba **Histórico** do perfil.
  <https://community.rockrms.com/documentation/church-management/people/person-profile-page/steps-tab> e
  <https://community.rockrms.com/documentation/engagement/steps/fundamentals/intro-to-steps>
- **Juntar fichas repetidas:** as duas fichas lado a lado, escolhendo valor por valor o que fica; quem não tem
  permissão só **pede** a junção, que cai numa fila.
  <https://community.rockrms.com/documentation/supporting-rock/data/data-integrity/merge-duplicate-records>
- **Segurança:** cada pessoa tem um "perfil de proteção" recalculado toda noite; juntar fichas de quem tem acesso alto
  exige permissão maior.
- **Lição:** a **linha do tempo** com passos que não se apagam, o **histórico de alterações** visível na ficha e o
  **juntar duplicados**.

### 1.4 Breeze (Estados Unidos)

- **Etiquetas e lote:** pôr e tirar etiquetas de muitas pessoas de uma vez e buscar por etiqueta.
  <https://support.breezechms.com/hc/en-us/articles/360049088914-Getting-Started-With-People>
- **Diretório:** publicado aos membros por uma etiqueta; telefone, e-mail e família podem ser escondidos por perfil;
  o diretório impresso agrupa por família.
  <https://support.breezechms.com/hc/en-us/articles/360002438413> e
  <https://support.breezechms.com/hc/en-us/articles/360001128773-Creating-Customizing-a-Printed-Directory>
- **Importação:** alguns campos não entram pela planilha e precisam ser acertados ficha a ficha depois.
  <https://support.breezechms.com/hc/en-us/articles/360035536654>
- **Lição:** simplicidade e ações em lote; o aviso de que **toda importação deixa sobras** que precisam de uma tela de
  pendências.

### 1.5 Pushpay ChMS (antigo Church Community Builder)

- **Várias congregações:** a permissão é dada por **papel e campus**, não pessoa por pessoa; **um cadastro só** com
  etiquetas de campus (a família que dá numa congregação e serve noutra é uma ficha só); o relatório mostra o número da
  igreja toda ou filtra um campus no mesmo relatório. O guia de compra manda testar duas perguntas: **o que o líder do
  campus vê comparado ao líder central** e **o que acontece quando alguém muda de campus**.
  <https://pushpay.com/blog/multi-campus-chms-buying-guide/> (texto do próprio fabricante)
- **Acompanhamento:** "filas de processo" com passos (preparação do batismo, classe de novos membros).
- **Lição:** as duas perguntas do guia viram critério de aceite da v10.1c. Hoje a segunda falha no nosso sistema: trocar
  a congregação é só editar um campo (seção 4.6).

### 1.6 Elvanto e Tithely

- O Elvanto (comprado pela Tithely) lista portal do membro, permissões por papel e várias localidades; avaliações elogiam
  os relatórios e o agrupamento por família. <https://www.capterra.com/p/125780/Elvanto/>
- O cadastro da Tithely é básico no plano grátis; o pago acrescenta etiquetas e "grupos inteligentes" que se montam
  sozinhos por critério (idade, papel). <https://get.tithe.ly/people>
- **Lição:** grupos que se montam por critério (ex.: "jovens de 18 a 29 anos da área 3") servem melhor à AD que grupos
  feitos à mão. Já temos a peça parecida nas audiências da Comunicação (v7.12).

### 1.7 ChurchTrac (Estados Unidos)

- **Importação:** a igreja sobe a planilha, **liga cada coluna a um campo**, confere o resultado e só então grava; a
  família sai da mesma coluna "sobrenome da família"; a situação do membro vem numa palavra e entra numa lista que a
  igreja ajusta. <https://www.churchtrac.com/support/getting_started/import-from-spreadsheet> e
  <https://churchtrac.com/support/people/member-status>
- **Lição:** a tela de importação com "ligar coluna a campo" e "conferir antes de gravar" é o modelo da v10.1e.

### 1.8 Brasileiros

- **InPeace:** carteirinha digital no aplicativo com **QR único**; a validação é feita pelo aplicativo do gestor, para
  eventos só de membros (registra entrada e saída). A "jornada do membro" tem etapas configuráveis.
  <https://help.inpeaceapp.com/en/articles/11004031-how-does-the-member-card-work>,
  <https://help.inpeaceapp.com/en/articles/11004039-how-to-validate-the-member-card-using-inpeace-manager> e
  <https://help.inpeaceapp.com/en/articles/11003930-how-to-configure-the-member-journey>
- **inChurch:** aplicativo próprio por igreja, carteirinha digital e um "Perfil" simplificado para a igreja conhecer a
  pessoa; diz atender cerca de 30 mil igrejas. <https://apps.apple.com/mx/app/id6752422929> e
  <https://bpmoney.com.br/negocios/digitalizacao-de-igrejas-e-aposta-da-startup-inchurch/>
- **CHURCH (Church Software, visto no aplicativo "ADMCV"):** credencial digital, **pedido de carta de mudança e de
  recomendação pelo celular**, o membro mantém os dados em dia, pré-aprovação do cadastro, consulta de congregações,
  aniversariantes. É o mais parecido com o que uma AD usa. <https://apps.apple.com/mx/app/admcv/id6477622936>
- **SINAI:** se apresenta como gestão para a Assembleia de Deus; as funções não foram confirmadas.
  <https://apps.apple.com/us/app/id6741535105>
- **Sige Igrejas:** secretaria, área do membro e várias filiais. <https://www.capterra.com/p/10043068/Sige-Igrejas/>
- **GI (Igreja Metodista):** o "Rol de Membros" é o registro digital do **Rol Permanente** e a base de todos os outros
  módulos; o secretário responde por mantê-lo em dia.
  <https://4re.metodista.org.br/wp-content/uploads/2018/04/Secretaria_-_GI.pdf>
- **Estudo acadêmico (AD de Blumenau, 2004):** sistema com setores e congregações em que cada congregação atualizava os
  seus dados pela internet. <https://furb.br/dsc/arquivos/tccs/monografias/2004-2lemuelsantosvf.pdf>
- **Lição:** no Brasil o que vende é **carteirinha + cartas + atualização pelo celular**. Nós já temos as três; falta
  deixar à vista e simples.

### 1.9 Quadro: cada função, a melhor referência achada e onde estamos

| Função | Quem faz bem (referência) | Como | IEADESPA hoje |
| --- | --- | --- | --- |
| Ficha com os campos da igreja | Planning Center | campos próprios em abas, sem programar | campos fixos no código (bom para regra jurídica; campo novo exige migração) |
| Família | Rock, Planning Center | família com endereço e campus comuns; pessoa em mais de uma família | vínculos de dois em dois (`VinculosFamiliares`) e responsável legal; sem "família" com endereço comum |
| Linha do tempo | Rock (Steps) | passos com data que não se apagam; histórico de mudanças na ficha | `HistoricoMembro` junta 6 fontes (inclui consagrações e `MarcosMembro`); faltam casamento, mudança de congregação, credencial e o cargo que não veio de consagração |
| Quem mudou o quê | Rock (aba Histórico) | trilha na própria ficha | `AuditLog` com cadeia de conferência, mas não aparece na ficha |
| Membro corrige os dados | Planning Center, ChurchSuite | campo a campo, editável ou só leitura | contato e estado civil direto; datas da vida na igreja pela Fila de Aprovações (mais seguro que os de fora) |
| Privacidade escolhida pelo membro | ChurchSuite, Breeze | o membro escolhe o que os outros veem | não há diretório entre membros (correto sem consentimento) |
| Carteirinha com QR | InPeace, CHURCH | QR único validado por aplicativo | credencial v8.4 com QR público que mostra a situação **de agora**; emitida só pela Secretaria Geral |
| Cartas pelo celular | CHURCH | pedido de carta de mudança e de recomendação | já temos: recomendação, mudança e atestado supletivo no Meu Painel |
| Várias congregações | Pushpay, ChurchSuite | permissão por papel e local; uma ficha só | seis níveis (mais fundo que os de fora); mas a lista lê tudo e filtra na memória |
| Mudança de congregação | Pushpay (pergunta do guia) | a ficha acompanha a pessoa | só edição do campo; sem data, origem, destino nem quem autorizou |
| Importação | ChurchTrac | ligar coluna a campo, conferir e só então gravar | `ImportarPessoas` só traz matrícula, nome e situação |
| Fichas repetidas | Rock | lado a lado, escolhe o que fica; pedido de junção | só aviso de nome parecido na importação; não há "juntar" |
| Acompanhamento por passos | Pushpay, InPeace | filas e jornadas | turmas de batismo, discipulado (v8.5) e cuidado pastoral (v7.11) |

### 1.10 O que copiar e o que não copiar

- **Copiar:** uma ficha só por pessoa com o lugar dela marcado; controle campo a campo do que o membro corrige; linha do
  tempo com passos fixos; histórico de alterações na ficha; juntar fichas repetidas; importação com "ligar coluna a
  campo" e conferência; tela de pendências do cadastro (sem foto, sem CPF, sem data de batismo); filtros que se montam
  sozinhos.
- **Não copiar:** células e pequenos grupos (a Igreja trabalha com departamentos, decisão de 13/11/2026); campos livres
  criados à vontade (a LGPD pede só o necessário, e foi decidido que **RG não entra**); diretório de membros aberto entre
  membros; a família como dona do endereço sem pensar no caso comum da AD (o filho casado que mora com os pais, o
  cônjuge que não é membro).

---

## 2. O rol de membros na Assembleia de Deus

Cada campo da AD tem estatuto e regimento próprios; não há um manual nacional público. Os exemplos achados confirmam o
mesmo desenho que o Estatuto e o Regimento da IEADESPA já trazem:

- Uma **carta de mudança** publicada por uma AD de Goiás declara desde quando a pessoa é membro, que está em plena
  comunhão e que nada a desabona; vale **90 dias** e é assinada pelo pastor dirigente e pelo secretário.
  <https://docs.google.com/document/d/1Y4m_O6mo6Op93cBnIwUwmfjnfVBm3nFD/export?format=pdf>
- O **regimento** de uma AD de Goiás põe a escada em diáconos, presbíteros e missionárias (no mesmo degrau), evangelistas e
  pastores; exige batismo no Espírito Santo para o evangelista; os evangelistas e pastores são credenciados pela
  convenção; e, ao receber membro ou obreiro de outra igreja da mesma organização, o pastor pede a **anuência do pastor de
  origem**. <https://docs.google.com/document/d/1KBiy50iguMO8MXFgH75jp2teIQleANeu/export?format=pdf>
- A **ficha cadastral** pública de uma AD de São Paulo pede: data do batismo nas águas, em que ministério foi batizado,
  quem batizou, data do batismo no Espírito Santo, cada consagração (cooperador, diácono, presbítero, missionário,
  evangelista, pastor) com a igreja e o pastor, CPF, filiação, cônjuge e filhos, foto 3×4 e autorização de imagem.
  <https://form.jotform.com/240205389953057>

| Ato | O que é, em palavras simples | Onde está no nosso sistema | O que falta |
| --- | --- | --- | --- |
| Recebimento por batismo | quem desce às águas entra como membro | `FormaAdmissao = BATISMO` (Estatuto Art. 6º §1º); turma de batismo aprovada grava a data e põe "Em Comunhão" (`shared/batismo.js`) | para quem veio batizado de fora: a igreja e o ministro do batismo |
| Recebimento por carta | quem chega de outra igreja com carta de mudança | `FormaAdmissao = CARTA_MUDANCA` + `IgrejaAnterior`/`Origem` | guardar a carta recebida (foto ou PDF) junto da ficha |
| Reconciliação | quem estava afastado volta à comunhão | `FormaAdmissao = RECONCILIACAO`; readmissão de excluído só pelo nível geral | entrar na linha do tempo como "readmissão" |
| Aclamação | quem não consegue a carta, mas a igreja conhece o testemunho | `FormaAdmissao = ACLAMACAO` | nada |
| Rito de recebimento | o nome lido diante da igreja | `DataRitoRecebimento`, `NomeLidoRito`, `MinistranteRito` (Regimento Art. 130) | nada |
| Integração de 90 dias | o novo membro ainda não vota | calculado em `shared/estatuto.js` (Art. 6º §2º) | nada |
| Batismo no Espírito Santo | marco espiritual, exigido para alguns cargos | só como "marco" manual (`MarcosMembro`, tipo `BATISMO_ESPIRITO_SANTO`) | virar dado à vista na ficha |
| Carta de recomendação | a pessoa visita ou passa um tempo noutra igreja | `SolicitarCarta`, validade de 30 dias (Regimento Art. 131), pedida pelo próprio membro | nada |
| Carta de mudança | a pessoa sai para outra igreja | pedido com declaração de ciência; dados reduzidos ao mínimo 30 dias depois (Art. 132 §2º) | nada |
| Mudança dentro do campo | sai da congregação A e vai para a B, do mesmo campo | só a troca do campo "congregação" na ficha | registro com data, origem, destino e quem autorizou; aceite do dirigente de destino (decisão dele) |
| Consagração e cargos | auxiliar, diácono, presbítero, missionária, evangelista, pastor | esteira de consagração, escada (Art. 71), `CargosMinisteriaisHistorico`, credencial do obreiro | a consagração já entra na linha do tempo; a entrada no cargo por outro caminho (ex.: nomeação, outra convenção) ainda não |
| Disciplina | processo sigiloso, com medidas | `ProcessosDisciplinares`, `MedidasCautelares`; só quem tem a permissão "disciplina" vê | nada (o sigilo fica como está) |
| Desligamento | a pessoa pede para sair | status `DESLIGADO` + causa `DESLIGAMENTO`; cargos e assentos vagam sozinhos (`shared/vacancia.js`) | um assistente de "movimentação" em vez de editar a ficha |
| Abandono | 90 dias sem comunhão (material ou digital) | procedimento com notificação, prazo e homologação; radares (Art. 11 e 12) | nada |
| Falecimento | a pessoa partiu | status `FALECIDO` + causa `FALECIMENTO`; vacância; a Comunicação já só envia a quem está ATIVO | a data do falecimento à vista (hoje fica na "data de saída") |
| Livro do rol | a lista oficial e permanente dos membros | só a planilha exportada (`ExportarPessoas`) | livro do rol em PDF por congregação (decisão dele) |
| Carteirinha | o documento que prova que a pessoa é membro | credencial v8.4 (`CredenciaisEclesiasticas`, vias, QR, `VerificarCredencial`) | tela no celular e emissão para todos depois da migração |

---

## 3. LGPD: CPF e dados sensíveis

- **O rol já é dado sensível.** A lei põe "convicção religiosa" e "filiação a organização de caráter religioso" entre os
  dados sensíveis (Art. 5º, II) e dá regras próprias para eles (Art. 11). A ANPD repete isso nas perguntas frequentes.
  Um artigo jurídico observa que **a simples lista de nomes** de uma comunidade religiosa já revela a convicção.
  <https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm>,
  <https://www.gov.br/anpd/pt-br/perguntas-frequentes.pdf> e
  <https://www.migalhas.com.br/depeso/339566/a-profissionalizacao-para-a-protecao-das-comunidades-religiosas>
- **Diferente da Europa.** A lei europeia (GDPR, Art. 9(2)(d)) tem uma regra que deixa a entidade religiosa tratar os dados
  dos próprios membros. Esta pesquisa não achou regra igual na LGPD: aqui a base precisa ser escolhida e registrada caso a
  caso (consentimento específico e destacado, cumprimento de obrigação legal ou exercício regular de direitos).
  <https://gdpr-info.eu/art-9-gdpr/> e <https://confidata.com.br/blog/dados-sensiveis-lgpd-bases-legais-cuidados>
- **O CPF é comum, mas aqui fica sensível.** Sozinho ele é dado pessoal comum; ligado ao rol, passa a revelar a religião,
  e por isso merece o cuidado do Art. 11. Desde 2023 o CPF é o número único de identificação do cidadão
  (<https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14534.htm>), o que o torna útil para não haver duas
  fichas da mesma pessoa.
- **Só o necessário.** O princípio da necessidade (Art. 6º, III) apoia a decisão de que **RG não entra**. Campo novo só
  com um uso real (a carta, a credencial, o recibo).
- **Termo de consentimento na entrada.** A cartilha da Igreja Presbiteriana recomenda o termo assinado pelo novo membro
  antes de colher os dados e o computador da secretaria com acesso restrito.
  <https://www.ipb.org.br/content/Downloads/LGPD_revisado_v1.pdf>
- **Menores:** o dado da criança pede o consentimento de pelo menos um dos pais ou responsável (Art. 14). O sistema já
  marca o responsável legal (`VinculosFamiliares.ResponsavelLegal`) e tem `GestaoConsentimentoMenor`.
- **Guarda e descarte:** terminado o motivo, o dado é eliminado, salvo o que a lei ou o estatuto mandam guardar (Art. 15 e
  16). O sistema já faz isso para quem sai por carta de mudança (Registro Histórico Mínimo, `PoliticasRetencao`).
- **Direitos do titular** (Art. 18): já atendidos por `MeusDadosLGPD`, `SolicitacoesTitularLGPD` e
  `ExecutarExclusaoLGPD` (que anonimiza o contato e guarda o que o Regimento exige).

### 3.1 Regras propostas para o CPF

1. Um campo só para a pessoa inteira (os outros módulos leem dali, não guardam outro).
2. Conferido pelos dois dígitos verificadores na tela e no servidor; um CPF por pessoa (índice único que aceita vazio).
3. Na tela, sempre mascarado (`***.456.789-**`); inteiro só para quem precisa, com um clique de "mostrar" que **fica
   registrado** (quem, quando, de quem), no mesmo padrão das leituras de nota pastoral (`NotasPastoraisLeituras`).
4. Mudança gravada na trilha (`AuditLog`) só mascarada, como já é feito com o e-mail (`mascararEmail` em `GestaoPessoas`).
5. Fora da planilha exportada, a não ser que o nível geral peça de propósito (a exportação já é registrada desde a vB.8).
6. Nunca no endereço da página, no QR, no e-mail nem em mensagem de erro.
7. O membro vê o próprio CPF mascarado e pode pedir correção pela Fila de Aprovações.

### 3.2 Quem vê o quê (proposta para conferir com o responsável)

| Dado | O próprio membro | Congregação | Área, região, quadrante, distrito | Geral (Secretaria) | QR público |
| --- | --- | --- | --- | --- | --- |
| Nome, foto, congregação, situação | vê | vê os seus | vê os seus | vê todos | nome, congregação e situação (sem foto) |
| Telefone, e-mail, endereço | vê e corrige | vê os seus | vê os seus | vê | nunca |
| CPF | vê mascarado | mascarado | mascarado | inteiro, com registro de quem viu | nunca |
| Datas da vida na igreja | vê e pede correção | vê | vê | vê e corrige | nunca |
| Cargo e escada | vê | vê | vê | vê e corrige | o cargo do obreiro |
| Disciplina e abandono | segue o processo | só quem tem a permissão "disciplina" no escopo | idem | idem | só "inativa", sem motivo |

---

## 4. O que o nosso sistema já tem (Parte B)

### 4.1 A ficha: `MembroReferencia`

A matrícula (`MembroId`) **não é gerada pelo sistema**: é digitada (a mesma do sistema pago). As colunas, pela migração
que as criou:

| Migração | Colunas |
| --- | --- |
| 001 | `MembroId`, `Nome`, `Funcao` (texto antigo), `CongregacaoId`, `Status`, `DataNascimento`, `DataAdmissao`, `DizimistaFiel`, `CriadoEm`, `SituacaoMembro`, `DepartamentoId`, `CargoMinisterial` |
| 008 | `Telefone`, `Email`, `Endereco` (linha única) |
| 009 | `ExtensaoId` (extensão da tenda) |
| 015 | `DataBatismo`, `FormaAdmissao`, `Origem`, `IgrejaAnterior`, `DataRitoRecebimento`, `NomeLidoRito`, `MinistranteRito` |
| 017 | `DataSaida`, `MotivoSaida` |
| 018 | `EstadoCivil` |
| 019 | `DataAfastamento` |
| 022 | `FotoUrl` (arquivo privado, aberto por link assinado de curta duração) |
| 157 | `Sexo` (M/F) |
| 170 | endereço em partes: `EnderecoLogradouro`, `EnderecoNumero`, `EnderecoComplemento`, `EnderecoBairroId`, `EnderecoBairroTexto`, `EnderecoCidade`, `EnderecoUF`, `EnderecoCep` |

Catálogos: `StatusMembro` (ATIVO, LICENÇA, INATIVO, DESLIGADO, FALECIDO, LICENCA_CANDIDATURA) e `SituacoesMembro`
(CONGREGADO, EM_COMUNHAO, SEM_COMUNHAO), editáveis por tela; formas de admissão, causas de saída e estados civis fixos no
código. A "categoria" (Congregado, Comunhão, Capacidade Eleitoral Ativa, Elegível) é calculada em `shared/estatuto.js`.

### 4.2 Tabelas ligadas à pessoa (as que importam para a gestão de membros)

| Tabela (migração) | O que guarda |
| --- | --- |
| `VinculosFamiliares`, `TiposVinculoFamiliar` (011, 022) | parentesco de dois em dois (cônjuge, pai/mãe, irmão, sogro) e o responsável legal |
| `ConsentimentosLGPD`, `SolicitacoesTitularLGPD` (012) | consentimento com base legal; pedidos de acesso, correção, exclusão, portabilidade |
| `CartasTransito` (017) | recomendação, mudança e atestado supletivo, com a declaração de ciência |
| `ProcedimentosAbandono`, `TentativasContatoAbandono` (019, 020) | abandono material e digital |
| `MarcosMembro` (021) | conversão, ministério anterior, batismo no Espírito Santo; correção só com justificativa |
| `Casamentos`, `LicencasCandidatura` (023), `ApresentacoesCrianca` (087) | registros especiais |
| `SolicitacoesEdicaoPessoa` (024) | o que o membro pediu para corrigir (Fila de Aprovações) |
| `ProcessosDisciplinares` (001), `MedidasCautelares` (029) | disciplina, sigilosa |
| `Consagracoes` (001), `CargosMinisteriaisHistorico` (157) | esteira de consagração e cargos com "desde" e "até" |
| `CredenciaisEclesiasticas` (159) | carteirinha/credencial com vias, código do QR e pedido de impressão |
| `TurmasBatismo`, `CandidatosBatismo`, `OficiantesBatismo` (086) | o caminho até o batismo |
| `CodigosAcessoMembro` (082), `MembroPins` (118), `ChavesAcesso` (140) | entrada do membro (código por e-mail, PIN de 4 dígitos, chave de acesso da liderança) |
| `ComunicacaoConsentimentos` (150) | o "sim" de cada canal e assunto, com a versão do texto |
| `AuditLog` | a trilha de quem mudou o quê (com cadeia de conferência) |

Ao todo, **241 tabelas** têm chave apontando para `MembroReferencia` (inclusive os "criado por"). Isso pesa na hora de
**juntar duas fichas**: a junção precisa mexer em todas.

### 4.3 Rotas da API

| Assunto | Rotas |
| --- | --- |
| Cadastro | `GestaoPessoas` (`/api/pessoas`: listar, criar ou atualizar, desligar), `ImportarPessoas`, `ExportarPessoas` |
| Ficha e histórico | `HistoricoMembro`, `ListarMarcosMembro`, `RegistrarMarcoMembro`, `EditarMarcoMembro`, `HistoricoSiteMembro` |
| Família | `GestaoVinculosFamiliares`, `MeusVinculosFamiliares` |
| Foto | `UploadFotoMembro`, `MinhaFoto` |
| Autoatendimento | `AtualizarMeusDados`, `SolicitarEdicaoPessoa`, `GestaoFilaAprovacoes`, `PainelInicial`, `MinhaFrequencia` |
| Entrada do membro | `MembroEntrar`, `MembroPin`, `GestaoPinMembro`, `SolicitarCodigoAcessoMembro`, `ConfirmarCodigoAcessoMembro`, `VerificarContaMembro` |
| Cartas | `SolicitarCarta`, `GestaoCartas`, `CartaPdf` |
| Saída | `AbrirProcedimentoAbandono`, `EvoluirProcedimentoAbandono`, `ListarProcedimentosAbandono`, `RadarAbandono`, `RadarAbandonoDigital` |
| Registros especiais | `GestaoCasamentos`, `GestaoApresentacaoCriancas`, `GestaoLicencasCandidatura`, `GestaoTurmasBatismo`, `GestaoCandidatosBatismo` |
| Credencial | `GestaoCredenciais`, `VerificarCredencial` (pública, pelo QR) |
| LGPD | `MeusDadosLGPD`, `GestaoConsentimentoLGPD`, `GestaoConsentimentoMenor`, `MinhasSolicitacoesLGPD`, `ListarSolicitacoesLGPD`, `ResponderSolicitacaoLGPD`, `ExecutarExclusaoLGPD` |

O escopo da pessoa mora num lugar só: `api/shared/escopoRotas.js` (`pessoaAlcancavel`, `noEscopoDaPessoa`); fora do
escopo a resposta é igual à de "não existe".

### 4.4 Telas

- **Módulo "Pessoas & Membresia"** (`MODULOS.membresia` em `app/script.js`): abas Pessoas, Cartas, Abandono e Cuidado
  pastoral. A aba Pessoas (`app/modulos/pessoas.js`, 1.864 linhas) tem as subabas Cadastrar Pessoa, Buscar Pessoas, Fila
  de Aprovações, Credenciais (só o geral) e Discipulado.
- **Perfil da pessoa:** nove abas (Dados, Editar, Histórico, Caminhada, Foto, Casamentos, Apresentações, Licença,
  Vínculos). O formulário de cadastro é **um só bloco** (`blocoFormPessoa` em `app/index.html`) que muda de lugar entre
  "Cadastrar" e "Editar" (`moverFormPessoaPara`).
- **Lista:** busca por texto e filtros de categoria, congregação e situação; paginação no navegador.
- **Meu Painel** (`app/modulos/meu-painel.js` e `app/modulos/meus-dados.js`): 24 itens, entre eles Meu Perfil, Meus Dados
  Cadastrais, Minha Credencial, Vínculos Familiares, Minhas Contribuições, Meus Dados (LGPD) e Cartas de Trânsito.

### 4.5 O que falta

- **CPF** na ficha (hoje só existe solto em `Prebendados.Cpf`, `Doacoes.DoadorCpfCnpj` e
  `AssistenciaSocialCadastros.ResponsavelCpf`).
- **Matrícula gerada pelo sistema** para a pessoa nova (hoje é digitada; depois da migração não haverá mais de onde
  copiá-la).
- **Mudança de congregação dentro do campo** como movimento registrado.
- **Linha do tempo completa**: `HistoricoMembro` lê `MembroReferencia`, `CartasTransito`, `Consagracoes`,
  `ProcessosDisciplinares`, `ProcedimentosAbandono` e `MarcosMembro`; ficam de fora o cargo que não veio de consagração
  (`CargosMinisteriaisHistorico`), casamento, apresentação de criança, turma de batismo, vias da credencial, licença e
  mudança de congregação.
- **Histórico de alterações na ficha** (o `AuditLog` existe, mas não aparece).
- **Juntar fichas repetidas** e um detector de repetição no cadastro (hoje só na importação, por nome parecido).
- **Filtros por nível** (distrito, quadrante, região, área) e por cargo, sexo, idade, aniversário, data de admissão.
- **Tela de pendências do cadastro** (sem foto, sem CPF, sem data de batismo, sem congregação).
- **Importação completa** (hoje: matrícula, nome e situação).
- **Livro do rol** impresso por congregação (se ele quiser).

### 4.6 O que existe mas está ruim

- **Defeito do "Cadastrar Pessoa" em branco.** Ao abrir a aba, `mostrarAbaSecretaria` (`app/modulos/meus-dados.js`,
  linha 264) chama `carregarOpcoesFormPessoa().then(() => mostrarSubAbaPessoas(...))`. A subaba "Cadastrar"
  (`subPessoasCadastrar`) já aparece com o título, mas o formulário (`blocoFormPessoa`, escondido) **só é posto no lugar
  dentro de `mostrarSubAbaPessoas`**, isto é, depois que as **seis** listas pedidas em `carregarOpcoesFormPessoa`
  (`app/modulos/pessoas.js`, linhas 16 a 23) chegam. Enquanto o servidor acorda, a página fica em branco; se uma delas
  falha, não há `.catch` e o formulário **nunca** aparece. Trocar de subaba chama `mostrarSubAbaPessoas("cadastrar")`
  direto, por isso "aparece depois de trocar de aba e voltar". Causa provável pela leitura do código (não reproduzida).
  Conserto: pôr o formulário no lugar na hora, com "carregando" nas listas, e carregar cada lista com tratamento de erro
  próprio.
- **A lista não escala.** O `GET /api/pessoas` faz `SELECT ... FROM MembroReferencia ... ORDER BY m.Nome` **sem filtro**,
  filtra o escopo na memória (comparando **nomes** de congregação) e gera um link assinado de foto para cada linha. O
  navegador guarda tudo em `window._pessoasCache`, e o perfil só abre se a pessoa estiver nesse cache (não abre por
  endereço próprio).
- **Três ideias de "situação" na mesma tela:** `Status` (ATIVO, LICENÇA...), `SituacaoMembro` (EM_COMUNHAO...) e a
  categoria calculada; a busca mostra o código `EM_COMUNHAO` cru.
- **Rótulos com artigo do estatuto no meio** (ex.: "Cargo Ministerial (escada — Art. 71; ...)") e data no campo cru do
  navegador (já apontado na FASE 10).
- **Batismo no Espírito Santo** só como marco manual, escondido na aba Histórico.
- **Um departamento por pessoa** na ficha (`DepartamentoId`); conferir com ele se basta.
- **Meu Painel com 24 itens** misturando o que é de todos (meus dados, carteirinha) com o que é de quem tem cargo; o
  desenho aprovado na FASE 10 já separou "Minha vida na igreja" de "Meu trabalho".

### 4.7 O que se repete

- **CPF** em três tabelas de outros módulos, nenhum na ficha.
- **Estado civil** validado em `GestaoPessoas` e de novo em `AtualizarMeusDados` (a mesma lista copiada), com os rótulos
  numa terceira cópia na tela (`ROTULO_ESTADO_CIVIL`).
- **Cônjuge** em `VinculosFamiliares` (tipo CONJUGE) e em `Casamentos` (`MembroConjugeId`/`NomeConjuge`).
- **Endereço** em linha única (`Endereco`) e em partes (v9.5), mantidos juntos à mão.
- **Cargo** em `Funcao` (texto antigo), `CargoMinisterial` e `CargosMinisteriaisHistorico`.
- **Pessoa digitada de novo** em `Dizimistas` (nome + matrícula opcional) e nos cadastros da assistência social.
- **Os dados da própria pessoa em três lugares do Meu Painel:** Meu Perfil, Meus Dados Cadastrais e Meus Dados (LGPD).

---

## 5. A lista proposta do "melhor sistema de membros"

Legenda: **[temos]** já existe e só entra na tela nova; **[ajuste]** existe e precisa mudar; **[novo]** não existe;
**[decisão]** depende do responsável. A ordem dentro de cada versão é a prioridade.

### v10.1b — A ficha completa e o histórico

1. **[novo]** CPF com as regras da seção 3.1 (um lugar só, conferido, único, mascarado, leitura registrada).
2. **[ajuste]** `Prebendados` e os outros módulos passam a ler o CPF da ficha quando a pessoa é membro.
3. **[novo]** Matrícula gerada pelo sistema para a pessoa nova, continuando depois da maior matrícula importada.
4. **[novo]** Movimentação "mudança de congregação": data, de onde, para onde, quem pediu e quem autorizou; a congregação
   da ficha só muda por ela. **[decisão]** precisa do aceite do dirigente de destino?
5. **[ajuste]** Linha do tempo completa, como os passos do Rock: somar cargos, casamento, apresentação, turma de batismo,
   credencial, licença, mudança de congregação, readmissão e falecimento; disciplina continua só para quem pode ver.
6. **[ajuste]** Batismo no Espírito Santo e "onde e por quem foi batizado nas águas" (para quem veio de fora) à vista na
   ficha.
7. **[novo]** Histórico de alterações na ficha (lendo o `AuditLog` do registro), só para o nível geral.
8. **[novo]** Aviso de possível repetição ao cadastrar (mesmo CPF; ou nome parecido com a mesma data de nascimento).
9. **[ajuste]** Uma lista só para estado civil, formas de admissão e causas de saída (em `api/shared/`), usada pelas rotas
   e pela tela.
10. **[ajuste]** Uma "situação" só na tela, em palavras simples, juntando status, situação e categoria.
11. **[decisão]** Campos que a Igreja usa e ainda não temos (ex.: naturalidade, nome da mãe, profissão): só entram os que
    ele confirmar, como foi com o RG.
12. **[decisão]** Juntar fichas repetidas (lado a lado, como o Rock): caro, porque mexe em 241 tabelas; pode ficar para
    depois da migração.

### v10.1c — A escala dos níveis

1. **[ajuste]** A lista vem paginada e filtrada **no banco**, pelo `CongregacaoId` do escopo (não pelo nome), sem
   carregar o campo inteiro.
2. **[ajuste]** A ficha abre pelo endereço próprio (matrícula), sem depender da lista.
3. **[novo]** Filtros por distrito, quadrante, região, área, congregação e extensão, e por situação, cargo, sexo, faixa de
   idade, aniversariantes do mês e admitidos no período, com a busca do alto (`Ctrl+K`) aprovada na rodada 6.
4. **[novo]** Contagens por nível (membros por situação, por cargo, por congregação), que alimentam os indicadores da
   v10.11.
5. **[temos]** Fora do escopo, a mesma resposta de "não existe".
6. **[novo]** Critério de aceite com as duas perguntas do guia da Pushpay: o dirigente vê só os seus e o geral vê todos
   no mesmo relatório, com filtro; a pessoa que muda de congregação some de uma lista e aparece na outra, com o
   histórico junto.
7. **[novo]** Medida de tempo da lista com o rol inteiro, dentro da meta da v10.9.

### v10.1d — As telas (três opções cada, notebook e celular)

1. **[ajuste]** Consertar o "Cadastrar Pessoa" em branco antes de redesenhar (seção 4.6).
2. **[ajuste]** Lista: tabela no notebook, cartões no celular, estados vazio, carregando e erro desenhados.
3. **[ajuste]** Ficha da pessoa: um cabeçalho (foto, nome, matrícula, congregação, situação, cargo) e menos abas,
   agrupando as nove de hoje (ex.: Dados, Vida na igreja, Família, Documentos, Ministério e Sigiloso).
4. **[novo]** Cadastro em etapas (quem é, contato, vida na igreja, família, confirmação), com o aviso de repetição.
5. **[ajuste]** Edição em duas colunas, com os rótulos sem artigo do estatuto (o artigo vai para o "?").
6. **[ajuste]** Meu Perfil nos quatro cartões, juntando Meu Perfil, Meus Dados Cadastrais e Meus Dados (LGPD).
7. **[novo]** Minha vida na igreja: a própria linha do tempo (batismo, admissão, cargos, cartas) e os próximos
   compromissos.
8. **[ajuste]** Carteirinha digital com QR: a credencial v8.4 na tela do celular, com foto e situação, pronta para mostrar
   na porta. **[decisão]** guardar também na carteira do celular (Google ou Apple)?
9. **[novo]** Movimentações num assistente só: mudança de congregação, carta de mudança, desligamento, falecimento e
   readmissão, cada um com as perguntas certas e os efeitos que já existem (vacância, minimização).
10. **[novo]** Pendências do cadastro por congregação (sem foto, sem CPF, sem data de batismo), para a secretaria
    completar aos poucos.
11. **[decisão]** Livro do rol em PDF por congregação.

### v10.1e — A migração única do sistema pago

1. **[novo]** Com o cabeçalho da exportação (só os nomes das colunas), montar a tela de "ligar coluna a campo", como a
   do ChurchTrac.
2. **[temos]** A matrícula do sistema pago continua sendo a matrícula aqui (`MembroId`).
3. **[ajuste]** `ImportarPessoas` passa a trazer a ficha inteira (datas, forma de admissão, cargo com "desde", família,
   CPF conferido), primeiro em modo de ensaio que só mostra o que faria, depois gravando em lote numa transação.
4. **[novo]** Relatório de conferência campo a campo por congregação (diferenças e linhas recusadas), visto na tela do
   nível geral, nunca enviado por conversa ou e-mail.
5. **[novo]** Tempo com os dois sistemas juntos, com a regra clara de onde se edita, e a tela de pendências para o que a
   planilha não trouxe.
6. **[temos]** A planilha sobe direto ao sistema e a exportação fica registrada (vB.8).
7. **[novo]** Emissão da carteirinha para todos os membros em comunhão, em lote (a ação de lote já existe na tela de
   credenciais).
8. **[decisão]** O dia de desligar a parte de membros do sistema pago, com ele conferindo.

### Fora desta versão (e por quê)

- Células e pequenos grupos: a Igreja trabalha com departamentos.
- RG e campos que ninguém usa: princípio da necessidade da LGPD.
- Diretório de membros aberto entre membros: só com consentimento e decisão dele.
- Campos livres criados por tela: a ficha da AD tem regra jurídica; campo novo passa por ele.
- Valores de dízimo na ficha: ficam no Financeiro (Minhas Contribuições); na ficha fica só o "dizimista fiel" que a
  escada exige.

### Decisões que ficam com o responsável

1. Quem vê o CPF inteiro: só a Secretaria Geral, ou também o dirigente da congregação?
2. Quais campos a mais entram na ficha (naturalidade, nome da mãe, profissão, escolaridade)?
3. A mudança de congregação dentro do campo precisa do aceite do dirigente de destino?
4. Livro do rol em PDF por congregação: sim ou não?
5. Juntar fichas repetidas agora ou depois da migração?
6. Carteirinha também na carteira do celular: sim ou não?
7. Um departamento por pessoa basta, ou a pessoa pode estar em vários?
