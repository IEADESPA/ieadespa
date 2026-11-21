# front/ — as telas novas da FASE 10 (Svelte 5 + TypeScript)

O fonte das telas refeitas (o primeiro módulo é **Membros**). Decisão do responsável (19/11/2026): as telas novas em
Svelte + TypeScript; o servidor (`api/`) e o banco ficam. O código está no ramo `v10-membros-svelte` (worktree
`C:/tmp/ieadespa-svelte` no computador do responsável) e na homologação; vem para a `main` com a ida à produção.

## Peças principais

- `src/membros.ts`: a entrada do módulo; `src/membros/` (o `App.svelte`, o `Menu.svelte`, o estado em
  `estado.svelte.ts`, `telas/`, `partes/`, `carteirinhas/`, `minha-vida/`).
- `src/comum/`: as **peças comuns** a todos os módulos (`Botao`, `Campo`, `Cartao`, `Chip`, `Pilulas`, `Etapas`,
  `Icone`, `MenuModulo`...), `api.ts` (chamadas à API), `ponte.ts` (a conversa com a casca do `app/`) e
  `tokens.css` (cores, letras e espaços). Peça usada por dois módulos vai para `comum/`.
- `vite.config.ts`: cada módulo é uma entrada e sai em `app/svelte/<módulo>.js` + `.css`; a casca
  (`app/modulos/casca.js`, `abrirModuloSvelte`) carrega o módulo só quando a pessoa entra nele.
- `scripts/carimbo.mjs`: grava `app/svelte/carimbo.json` com o hash do fonte; `--conferir` diz se a saída bate.

## Regras

- **A saída `app/svelte/` é versionada:** depois de mexer em `front/`, `npm run build` e commit do fonte e da saída
  juntos. O `npm run conferir` falha se esquecer.
- Tipos em tudo (`tipos.ts`); `npm run check` sem nenhum aviso.
- Construir exatamente o desenho aprovado (`design/propostas`): cada tela com os níveis local, área e Geral (e o
  membro), notebook e celular (com a barra do telefone), claro e escuro.
- Nada de dado de membro no código nem nas capturas.

## Comandos

```bash
cd front && npm ci
npm run check      # svelte-check + tsc, sem avisos
npm run build      # vite build + carimbo (gera app/svelte)
npm run conferir   # app/svelte corresponde ao fonte?
```

Node 22.12 ou mais novo. A prova das telas na homologação é o teste de telas do CI (base aprovada por ele).
