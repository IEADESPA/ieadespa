# Protótipos de referência — `chamada-ebd/` e `relatorios-departamentos/`

Material de **referência de ideias** para as Fases 5 (Relatórios) e 6 (EBD) do sistema.
**Não é código do produto** e nada daqui é publicado: o sistema real vive em `app/`, `api/`,
`sql/` e `site/`. Os protótipos foram feitos com outra stack (Next.js / Vite) e servem só
como especificação viva — regras de negócio, modelo de dados, telas e textos.

As duas pastas estão na **raiz do repositório**, com o nome original, na versão **enxuta**
(só o fonte, ~0,7 MB no total). As originais passavam de 1,6 GB, quase tudo `node_modules` e
cache.

| Pasta | O que é | Onde olhar primeiro |
|---|---|---|
| [`chamada-ebd/`](chamada-ebd/) | Protótipo de EBD (chamada, turmas, revistas, conquistas, permissões dinâmicas) — Next.js + Prisma + SQLite | `README.md`, `prisma/schema.prisma`, `prisma/seed.ts`, `src/lib/rbac.ts` |
| [`relatorios-departamentos/`](relatorios-departamentos/) | Protótipo de relatórios departamentais e rateio — React + Vite | `docs/` (01 a 08), `frontend/src/domain/` |

## O que foi deixado de fora (de propósito)

- `node_modules/`, `.next/`, `dist/` — dependências e cache, recriados pelo `npm install`.
- `package-lock.json` — regenerado pelo `npm install` (e evita alertas do Dependabot sobre
  protótipo descartável).
- `src/generated/` (Prisma Client) — regenerado por `prisma generate`.
- `dev.db` — banco SQLite local; o `prisma/seed.ts` recria tudo com dados **fictícios**.
- `.env` — segredo local; use o `.env.example`.
- Arquivos de agente/IDE (`.claude/`, `.windsurf/`, `AGENTS.md`, `CLAUDE.md`).
- Os `.rar` originais — passam de 400 MB, acima do limite de 100 MB por arquivo do GitHub, e
  seriam redundantes com as pastas.

> Na máquina onde o `.rar` foi extraído existe ainda a cópia completa antiga **aninhada**
> (`chamada-ebd/chamada-ebd/`, `relatorios-departamentos/relatorios-departamentos/`). Ela é
> ignorada pelo git e nunca sobe; quem clona o repositório não a tem nem precisa dela.

## Rodar um protótipo (só se precisar ver a tela funcionando)

```powershell
# EBD (http://localhost:3000)
cd chamada-ebd
copy .env.example .env
npm install
npm run db:migrate   # cria o banco SQLite local
npm run db:seed      # APAGA e recria a base de demonstração (dados fictícios)
npm run dev

# Relatórios (http://localhost:5173)
cd relatorios-departamentos/frontend
npm install
npm run dev
```

Contas de demonstração do EBD estão no `README.md` do próprio protótipo.

## Regras

- **Não copiar código** daqui para o sistema (Next.js é banido neste projeto) — só ideias.
- **Não adicionar** segredos, bancos (`*.db`), `.env`, `node_modules` nem `.rar` nestas pastas;
  o repositório é público (o `.gitignore` já barra esses artefatos).
