# Índice da memória (uma linha curta por anotação; o detalhe está em cada arquivo)

## Como trabalhar com ele

- [Sempre em português](sempre-em-portugues.md) — respostas e perguntas SEMPRE em português
- [Responsável leigo](responsavel-leigo-sem-advogado.md) — explicar simples, com exemplo da igreja; ele decide por custo
- [Padrão profissional](padrao-profissional-nao-vibe.md) — 20/11: sistema empresarial, código organizado, nada de "vibe"
- [Nada em aberto](nada-em-aberto.md) — fechar o que o código resolve; só sobra decisão dele ou ação externa
- [Fase de teste, duas pessoas](fase-de-teste-duas-pessoas.md) — 2 pessoas no sistema; segurança como produção
- [Ritmo e limites de uso](ritmo-e-limites-de-uso.md) — ser econômico; pausa = Monitor, não sleep
- [Colaboração pública e créditos](colaboracao-publica-e-creditos.md) — 20/11: esforço máximo; sem fork longo; repo público
- [Varredura em pedaços de 30 min](varredura-em-pedacos-de-30-min.md) — caça de defeitos em pedaços; ele diz quando
- [Sem Bedrock](sem-bedrock-ficar-na-assinatura.md) — ficar na assinatura; não reabrir
- [Habilidades instaladas](habilidades-de-design-instaladas.md) — design, Svelte, Postgres, TDD, LGPD (docs na bancada privada), plugins
- [Não cobrar cadastros de pessoas](nao-cobrar-cadastros-de-pessoas.md) — até a importação do cadastro

## Regras de entrega e teste

- [Conferir o deploy](conferir-resultado-do-deploy.md) — só vale "DEPLOY OK" do tools/conferir-deploy.sh
- [Empurrar o ramo](empurrar-ramo-durante-o-servico.md) — push a cada commit; ele só vê o GitHub
- [Bateria rápida por versão](bateria-rapida-por-versao.md) — testes da versão; a completa só nas Travas
- [Verificação e2e no LocalDB](verificacao-e2e-localdb.md) — tools/e2e-localdb; corridas; revisor adversarial
- [Testar SQL na homologação](testar-sql-na-homologacao.md) — local.settings.json aponta p/ PRODUÇÃO
- [URLs produção × homologação](urls-producao-e-homologacao.md) — NUNCA mesclar homolog na main
- [Regex e barras no shell](regex-e-barras-no-shell.md) — regex só por Edit/Write
- [README sem avisos](readme-sem-avisos-markdownlint.md) — markdownlint-cli2 (MD013 off) antes do commit
- [README enxuto](readme-enxuto-historico-em-docs.md) — README <600 linhas; histórico em docs/plano
- [Telas azuis do notebook](notebook-telas-azuis-19-10.md) — navegador sempre com --disable-gpu
- [Cópias pesadas locais](copias-pesadas-locais-nao-apagar.md) — pastas aninhadas e .rar no notebook; só apagar com pedido
- [Senha SQL de produção é real](senha-sql-producao-e-real.md) — fica no cofre SOPS; não trocar sem pedido

## FASE 10: desenho e construção

- [Nada sem aprovação dele](fase10-nada-sem-aprovacao.md) — ele VÊ e aprova antes da produção
- [Perguntar antes de desenhar](perguntar-antes-de-desenhar.md) — 20/11: dúvida de regra se pergunta ANTES de desenhar
- [Construir exatamente o aprovado](construir-exatamente-o-aprovado.md) — par aprovado × construído de toda tela
- [Realidade financeira](realidade-financeira-nao-o-regimento.md) — sem culto/malote/cofre; Regimento não é a realidade
- [Propostas em artefato](propostas-de-tela-em-artefato.md) — página leve KMeb…; a antiga G1gj… é só arquivo
- [Um módulo por vez](um-modulo-por-vez-sem-republicar.md) — não republicar enquanto ele comenta
- [Agentes em paralelo](desenho-em-paralelo-a-construcao.md) — 23/11: 3 agentes: desenha, constrói (Membros, depois Financeiro), revisa
- [Conselheiro e alto padrão](conselheiro-e-padrao-alto.md) — 23/11: Fable aconselha o Opus (funciona no VS Code); agentes padrão, ganchos e fluxos com muitos agentes quando ajudar
- [Ordem fixa de módulos](ordem-fixa-de-modulos.md) — 1 Membros, 2 Financeiro, 3 Estrutura...
- [Telas com níveis](telas-com-niveis-e-celular-real.md) — local/área/geral; celular com a barra
- [Roteiro das fases 10–12](roteiro-fases-10-11-12.md) — 10 experiência + Membros; 11 escuta; 12 sites
- [Massa grande da homologação](homolog-massa-grande.md) — gerador no ramo homolog

## Sistema: fatos técnicos

- [Plataformas e versões](plataformas-e-versoes.md) — Node 22, TS 6; libs servidas de dentro
- [CSP forte](csp-forte-em-andamento.md) — no ar; como reverter; armadilhas
- [Front em módulos (vD.2)](vd2-modularizacao-do-front.md) — script.js + app/modulos
- [Rotas por matrícula e escopo](rotas-por-matricula-sem-login.md) — PIN, exigirTitular, escopoRotas
- [Azure SWA: fatos medidos](azure-swa-fatos-medidos.md) — IP do cliente; config vale em app/
- [Azure: duas contas](azure-duas-contas-config-dir.md) — AZURE_CONFIG_DIR=~/.azure-ieadespa
- [Custo Azure](custo-azure-e-pico-do-servidor.md) — banco pausa; teto do orçamento
- [Capacidade para 1.000](capacidade-mil-pessoas.md) — assembleia online ainda não pronta
- [Visão futura](visao-futura-integracao-total.md) — integração total sem Directus; não é prioridade
- [Chave de acesso (vD.4)](vd4-chave-de-acesso.md) — passkey da liderança

## Site

- [Eventos em novembro](site-eventos-novembro.md) — seminário de novembro CANCELADO (20/11)
- [Camisetas e inscrições](camisetas-site-regras-na-api.md) — regra na API
- [Gestor de camisetas](site-gestor-camisetas-venda-balcao.md) — venda de balcão, limites, exclusão em massa
- [Trava de vagas e cupom](site-trava-vagas-inscricoes.md) — senha única em evento_controle
- [Painel de conteúdo](site-painel-conteudo.md) — /painel-conteudo/ em produção
- [Site remonta sozinho](site-remonta-sozinho-sem-token.md) — polling; nunca propor PAT
- [Directus local](directus-local-para-testes.md) — réplica para testes

## Versões entregues (em produção; reverter com revert -m 1)

- [v7.6 Setores Técnicos](v76-setores-tecnicos.md) · [v7.7 Menores](v77-ministerio-menores.md) · [v7.8 Proteção](v78-incidentes-protecao.md)
- [v7.9→v8.1](v79-movida-para-v81.md) · [v7.10 Check-in](v710-checkin-infantil.md) · [v7.11 Cuidado](v711-cuidado-pastoral.md)
- [v7.11.1 Mural](v7111-mural-do-site-wip.md) · [v7.12 Comunicação](v712-comunicacao.md) · [v7.13 Eventos](v713-eventos-no-site.md)
- [v7.14 Identidade](v714-identidade-visual.md) · [v7.15 Crise](v715-crise-porta-voz.md) · [Trava 7-C](trava-7c.md)
- [v8.1 AFM](v81-afm-faltas-cli-wip.md) · [v8.2 Escada](v82-escada-ministerial.md) · [v8.3 Consagração](v83-consagracao-documentacao.md)
- [v8.4 Credencial](v84-credencial-digital.md) · [Trava 8-A](trava-8a.md) · [v8.5 Discipulado](v85-trilha-discipulado.md)
- [v8.6 Educação](v86-educacao-continuada.md) · [v8.7 Seminário](v87-seminario.md) · [Trava 8-B](trava-8b.md)
- [v9.1 Entidades](v91-entidades-vinculadas-wip.md) · [v9.2 Expansão](v92-expansao-wip.md) · [v9.3 Distrito](v93-distritos-wip.md)
- [Trava 9-A](trava-9a.md) · [v9.4 Missões](v94-missoes-wip.md) · [v9.5 Território](v95-territorio.md) · [Trava 9-B](trava-9b.md)
