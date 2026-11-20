# site/ — o site público (Astro + Tailwind, conteúdo no Directus)

`www.ieadespa.org.br`: estático, gerado no build (`app_location: /site`, saída `dist`). O conteúdo (mensagens,
eventos, congregações, galeria...) vem do **Directus** (App Service + PostgreSQL no Azure). Referência completa:
`site/README.md`.

## Peças principais

- `src/pages/` (as páginas `.astro` e as rotas geradas como `rss.xml.ts`), `src/components/`, `src/layouts/`,
  `src/lib/` (leitura do Directus e ajudantes), `src/config/`, `src/styles/`.
- `api/` (Azure Functions do site): o que o estático não faz com segurança: inscrições e vagas, camisetas e venda de
  balcão, Minha Conta (código por e-mail), mural de oração, enquetes, visitas. Regras em `api/src/lib/`.
- `scripts/`: esquemas do Directus (`directus-*-esquema.mjs`), avisos por e-mail, `localizar-imagens.mjs` (no build)
  e `testes/` (as baterias).
- Robôs do GitHub: o site **remonta sozinho** quando o conteúdo do Directus muda (consulta periódica por hash,
  `site-conteudo-sync.yml`), sem token pessoal.

## Regras

- **Rota pública que grava nunca confia na página:** aberto/fechado, vagas e limites são decididos na API, com a
  "senha única" no livro de controle (`evento_controle`, `camiseta_controle`): nunca passa do número.
- Telefone e dados pessoais: hash/HMAC e cifra (ver `site/README.md`); nunca em texto puro nem em log.
- Segredos: `site/secrets.env` e `api/local.settings.enc.json` (SOPS + Age). Para ler: `sops exec-env`.
- Teste que grava no Directus de produção só com grupo/evento descartável e `draft: true` (nunca dispara aviso real).
- Várias baterias no mesmo Directus ao mesmo tempo dão falha falsa: **um PR por vez**.

## Testes

```bash
cd site && npm ci
npm run check && npm run build                      # tipos do Astro + build
node scripts/testes/<nome>-unidade.cjs              # unidade, sem rede (os *-unidade.cjs)
```

As baterias sem `-unidade` falam com o Directus e rodam no CI (`site-testes.yml`). Local, use a réplica:
`C:/tmp/directus-local` + `scripts/testes/swa-local.cjs`.
