---
name: guias-web-modernas
description: Guias da equipe do Google Chrome com as práticas mais novas da web (CSS moderno, diálogos e popovers, view transitions, animação guiada pela rolagem, formulários e preenchimento automático, acessibilidade, desempenho e Core Web Vitals, PWA, modo escuro, segurança e privacidade), em cópia local fixada. Use ao construir ou revisar uma tela ou componente web em HTML, CSS ou JavaScript do navegador, para usar o padrão moderno em vez de solução caseira ou biblioteca pesada. Não use para banco de dados, rotas do servidor ou CI.
---

# Guias web modernas (Google Chrome), cópia local

Responder sempre em português do Brasil. Os guias estão em inglês, numa cópia fixada (ver `ORIGEM.md`).

## Como usar

1. **Procure o guia** pelo assunto, com busca de texto na pasta `guides/` ao lado deste arquivo. Cada guia é um `.md`
   cujo nome é o identificador (`guides/<tema>/<id>.md`). Por exemplo, procure "view transition", "popover", "dialog",
   "autofill", "LCP", "dark mode" ou "reduced motion". Os temas são accessibility, css, forms, html, js, performance,
   privacy, pwa, security, ui-atoms, ui-behaviors, ui-components, visual-design e outros.
2. **Leia o guia** inteiro e aplique o padrão e as alternativas que ele manda para navegador sem suporte.
3. **Quando um guia citar outro** com `npx -y modern-web-guidance@latest retrieve "<id>"`, NÃO rode esse comando:
   abra o arquivo local `guides/**/<id>.md`. Esta cópia existe justamente para nada ser baixado da internet.
4. **Adapte ao projeto:** sem framework (JavaScript puro e CSS) quando o projeto for assim; nada de biblioteca, fonte
   ou script carregado de fora; respeite a política de segurança de conteúdo (CSP) do projeto. Recursos "Baseline
   Widely available" podem ser usados direto; os mais novos, só com a alternativa do guia.
5. **Ao entregar,** diga em uma linha quais guias foram aplicados e por quê.
