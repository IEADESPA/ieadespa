# tools/ — as ferramentas de prova e de operação

Nada aqui vai para o ar: são equipamentos para provar o sistema antes de publicar. Cada pasta tem o próprio
`README.md` com o uso e o resultado de referência.

## Peças principais

- `conferir-deploy.sh`: espera o deploy do sistema de um commit e diz o resultado final (repete sozinho a recusa do
  firewall do banco). **Vale a última linha:** "DEPLOY OK" ou "DEPLOY FALHOU".
- `conferir-bancada.sh`: confere a porta da bancada neste repositório: igual ao modelo de `C:\MCP\bancada\porta`, sem
  cópia velha do kit nem habilidades copiadas, e o gancho da porta no `.claude/settings.json`.
- `e2e-localdb/`: os handlers REAIS de `api/` contra um SQL Server local (LocalDB `psc7`): gatilhos, `CHECK`,
  transações, corridas com vários processos e a bateria de segurança. Um roteiro `e2e-NN-*.js` por versão; as bases
  salvas (`bases.ps1`) deixam rodar só o da versão.
- `front-<tema>/` (~20 pastas, uma por versão de tela): roteiro da tela em DOM simulado com a API simulada nos
  formatos reais, `mutacoes.js` (cada proteção desfeita TEM de ser acusada) e `navegador.js` (Edge sem tela, com a
  CSP, a 390 e a 1280 px).
- `csp-e2e/`: o equipamento da CSP forte (servidor local, cobertura, comparação de respostas); o `puppeteer-core`
  dos outros navegadores vem daqui (`npm ci` nesta pasta).
- `raio-x/`: medições de velocidade (front, rotas, tesouraria) e varredura de padrões.
- `modularizar/`: os scripts que tiraram o `script.js` gigante em módulos (vD.2).
- `vd4/`: a prova da chave de acesso (passkey) com autenticador virtual.

## Regras

- Ferramenta nova fica aqui, com `README.md`, e nunca leva dado real (nomes "(Fictício)", matrículas de teste).
- **Bateria rápida por versão:** a versão roda só os testes dela e os que usam o código mexido; a completa só nas
  Travas de Revisão.
- Navegador sempre com `--disable-gpu`.
- Regex só por arquivo (Edit/Write), nunca dentro de um `node -e` no shell: o shell come as barras.

## Comandos

```bash
bash tools/conferir-deploy.sh HEAD          # depois de cada push na main
bash tools/conferir-bancada.sh
cd tools/e2e-localdb && bash rodar.sh roteiro e2e-NN-*.js
cd tools/front-<tema> && node mutacoes.js
```
