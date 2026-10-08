# 🔐 Segredos de DEV (SOPS + Age)

O repositório é **público**. Os segredos de desenvolvimento (ex.: `api/local.settings.json` —
connection string do SQL e `AUTH_SECRET`) **nunca** vão em texto puro. Em vez disso, o
arquivo **criptografado** (`api/local.settings.enc.json`) é versionado, e cada máquina
descriptografa com a **própria chave privada Age**, que fica fora do repo.

Desde a FASE C (site institucional trazido via `git subtree` pra dentro de `site/`), existem
**três** pares de arquivo no total, cada um com seu próprio jeito de descriptografar, mas as
**mesmas chaves Age** do `.sops.yaml` da raiz (um só, desde 14/09 — não precisa cadastrar nada
duas vezes nem manter dois arquivos de regra):

| App | Texto puro (não versionado) | Criptografado (versionado) |
| --- | --- | --- |
| Sistema de governança | `api/local.settings.json` | `api/local.settings.enc.json` |
| Site institucional (Azure Functions) | `site/api/local.settings.json` | `site/api/local.settings.enc.json` |
| Site institucional (Directus + Azure) | `site/.env.local` | `site/secrets.env` |

O terceiro par guarda o token do Directus e as credenciais do Azure (subscription, tenant,
client id/secret) usadas pelos workflows de notificação do site. Descriptografa/recriptografa
direto com `sops` (não tem `npm run secrets:*` pra esse, é usado pelo CI, não pelo dev local):

```powershell
sops -d --output site/.env.local site/secrets.env
sops -e --output site/secrets.env site/.env.local
```

---

## 1. Como funciona (resumo)

- **Age** gera um par de chaves (pública + privada). A privada fica **na sua máquina**,
  nunca vai pro repo. A pública é compartilhada e fica no `.sops.yaml`.
- **SOPS** criptografa **só os valores** dos arquivos de segredo (as chaves continuam
  legíveis), usando as chaves públicas de todo mundo que precisa acesso.
- Cada pessoa descriptografa com a **própria chave privada** — ninguém precisa compartilhar
  senha nenhuma.

```text
local.settings.json         →  (texto puro, NÃO versionado)
local.settings.enc.json     →  (criptografado, VERSIONADO)
%APPDATA%\sops\age\keys.txt →  (sua chave privada, NÃO versionada)
```

---

## 2. Instalar as ferramentas (Windows)

Só uma vez por máquina:

```powershell
winget install --id FiloSottile.age -e --accept-source-agreements --accept-package-agreements
winget install --id SecretsOPerationS.SOPS -e --accept-source-agreements --accept-package-agreements
```

> Se o comando `age` ou `sops` não funcionar logo depois de instalar, **feche e reabra o
> terminal** (o PATH é atualizado ao abrir uma sessão nova).

---

## 3. A chave Age — o ponto que confunde todo mundo

**Você pode REUTILIZAR uma chave Age que já tenha de outro repositório.**

A chave Age não é "do repositório" — é **da sua máquina**. Se você já usou SOPS/Age em
outro projeto, provavelmente já tem uma chave em `%APPDATA%\sops\age\keys.txt`. **Não
precisa gerar outra**: essa mesma chave serve pra cá também.

### Descobrir se você já tem uma chave

```powershell
# Mostra a sua public key a partir da chave existente (se existir)
age-keygen -y "$env:APPDATA\sops\age\keys.txt"
```

- Se aparecer `age1...`, você **já tem chave** → pule o passo 4 e vá direto pro passo 5.
- Se der erro ("não foi possível ler"), você **não tem** → gere uma no passo 4.

---

## 4. Gerar a chave (só se você ainda NÃO tem)

```powershell
mkdir "$env:APPDATA\sops\age" -Force | Out-Null
age-keygen -o "$env:APPDATA\sops\age\keys.txt"
```

Esse comando imprime a **public key** (começa com `age1...`). Guarde ela.

> ⚠️ **Nunca** compartilhe a linha `AGE-SECRET-KEY-...` (a privada). Só a pública.

---

## 5. Liberar o acesso (uma vez só, com quem administra o repo)

1. Envie a sua **public key** (`age1...`) pra quem administra o repo.
2. O administrador adiciona essa chave na lista `age` do arquivo `.sops.yaml` e roda:

   ```powershell
   sops updatekeys api/local.settings.enc.json
   ```

3. Pronto: a partir daí a sua máquina consegue descriptografar.

---

## 6. Usar no dia a dia

Dentro da pasta `api` (sistema de governança) **ou** `site/api` (site institucional —
mesmo comando, mesma chave):

```powershell
# 1) descriptografar (gera o local.settings.json, que NÃO é versionado)
npm run secrets:decrypt

# 2) ... trabalhe normalmente (func start, etc.) ...

# 3) depois de editar local.settings.json, re-criptografar e commitar
npm run secrets:encrypt
```

Ou direto, sem npm (troque `api/` por `site/api/` conforme o app):

```powershell
sops -d --output api/local.settings.json api/local.settings.enc.json
sops -e --input-type json --output-type json --output api/local.settings.enc.json api/local.settings.json
```

---

## 7. Regras de segurança (não pular)

- ✅ Versionar: `api/local.settings.enc.json`, `site/api/local.settings.enc.json`,
  `site/secrets.env`, e o único `.sops.yaml` (raiz — desde 14/09 não existe mais um
  segundo `.sops.yaml` dentro de `site/`; um arquivo só cobre os três pares acima,
  o SOPS acha o da raiz sozinho mesmo rodando de dentro de `site/`).
- ❌ **Nunca** versionar: `api/local.settings.json`, `site/api/local.settings.json`,
  `site/.env.local` (todos texto puro), a chave privada (`keys.txt`).
- Se uma chave **vazar**, gere outra e o administrador roda `sops updatekeys` (rotação).
- Antes de commitar, confira: `git status` não pode listar `local.settings.json` nem
  `keys.txt`.

---

## 8. Solução de problemas

| Problema | Solução |
| --- | --- |
| `sops`/`age` não reconhecido | Feche e reabra o terminal (PATH novo). |
| `no matching creation rules found` | O arquivo criptografado deve ser o `*.enc.json` e o `.sops.yaml` precisa listar sua public key. |
| `sops: failed to decrypt` | Sua public key não está no `.sops.yaml` / `updatekeys` não foi rodado. Peça pro administrador. |
| Esqueci a public key | `age-keygen -y "$env:APPDATA\sops\age\keys.txt"` mostra de novo. |

---

## 9. Segredos de produção que ficam só nas configurações do Azure

Estes **não** estão em arquivo nenhum do repositório (nem criptografado): são digitados uma vez no portal do Azure,
em *Static Web App → Configuration (Configuração) → Application settings*. Nunca cole o valor num comando, num
arquivo versionado ou numa conversa.

| Configuração | Onde | Para quê |
| --- | --- | --- |
| `AUTH_SECRET` | aplicativo do **sistema** | assina o crachá de sessão e tempera o hash do PIN. Sem ele a API se recusa a subir (`api/shared/segredoSessao.js`). Trocá-lo desconecta todo mundo e invalida todos os PINs já criados. |
| `CHAVE_SITE_SISTEMA` | aplicativo do **sistema** **e** aplicativo do **site** — o **mesmo valor** nos dois | chave combinada para a pergunta "este e-mail é de membro ativo?" que o site faz ao sistema (`api/shared/chaveSiteSistema.js`). Enquanto não estiver definida no sistema, a rota segue só com o limite por origem. |

**Como combinar a chave do site com o sistema (uma vez só):**

1. Gere um valor aleatório e deixe-o na área de transferência, sem aparecer na tela (PowerShell):

   ```powershell
   $b = New-Object byte[] 36; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
   [Convert]::ToBase64String($b).Replace('+','-').Replace('/','_') | Set-Clipboard
   ```

2. No portal do Azure, abra primeiro o aplicativo do **site** e cadastre `CHAVE_SITE_SISTEMA` colando o valor.
3. Depois abra o aplicativo do **sistema** e cadastre `CHAVE_SITE_SISTEMA` colando **o mesmo valor** (não gere outro).
4. Teste criando uma conta de visitante no site com um e-mail de membro: deve recusar com "este e-mail já é de um membro
   ativo". Se aceitar, o log da Function do site mostra o aviso *"O sistema recusou a chave do site"* — os valores diferem.

A ordem importa: se o sistema ganhar a chave antes do site, o site fica sem conseguir perguntar até receber a mesma.

**Gravar sem o portal (feito assim em 03/10/2026).** Com o Azure CLI, num perfil separado e logado pelo próprio
responsável (a credencial de serviço que está em `site/secrets.env` entra no Azure, mas **não enxerga a assinatura**
atual e aponta para outro grupo de recursos: está desatualizada, não serve para isso):

```powershell
$env:AZURE_CONFIG_DIR = "$env:TEMP\az-cfg-usuario"        # perfil isolado: não troca o login da máquina
az login --use-device-code --tenant ieadespa.org.br        # o responsável digita o código na página da Microsoft
az staticwebapp appsettings set --name site-institucional --resource-group ieadespa --setting-names "CHAVE_SITE_SISTEMA=<valor>"
az staticwebapp appsettings set --name app-meusite-web --resource-group ieadespa --setting-names "CHAVE_SITE_SISTEMA=<valor>"
```

O `set` **junta** à lista existente (não a substitui), mas confira depois com `az staticwebapp appsettings list` que nenhuma
configuração antiga sumiu. Gere o valor na memória do próprio script (nunca no comando nem no chat), confira que o valor
lido de volta é idêntico nos dois aplicativos e termine com `az logout` e apagando a pasta do perfil. No PowerShell 5.1, o
aviso "App settings have been redacted" do `az` vai para o stderr: com `$ErrorActionPreference = 'Stop'` ele derruba o
script (a gravação já aconteceu); use `'Continue'` e confira o código de saída. Arquivo `.ps1` com acento precisa de BOM.

## 10. Rotação de segredos — procedimento (vD.5, 08/10/2026)

Quando trocar: **uma vez por ano**, ou **na hora** a qualquer suspeita (valor impresso num registro, máquina perdida,
pessoa com acesso que saiu). Toda troca é feita em **modo manual** (o modo automático é barrado em gravação de segredo),
sem nunca mostrar o valor na tela: o valor novo nasce num script e vai direto para onde mora.

| Segredo | Onde mora | O que a troca derruba | Como conferir depois |
| --- | --- | --- | --- |
| `AUTH_SECRET` | sistema (Azure, produção e preview) | **todas as sessões** (todo mundo entra de novo) e o tempero do hash do PIN: cada membro precisa criar o PIN de novo pelo "esqueci meu PIN". Só a qualquer suspeita; avisar antes. | login de liderança e de membro na homologação; `api/shared/segredoSessao.js` recusa valor fraco |
| `CRON_SECRET` | sistema (Azure) **e** segredo do GitHub `CRON_SECRET` | nada para as pessoas; as rotinas das 7h falham até os dois valores baterem | `rotinas-diarias.yml` verde no dia seguinte (ou disparo manual) |
| `CHAVE_SITE_SISTEMA` | sistema **e** site (Azure), o **mesmo** valor | a pergunta "este e-mail é de membro?" do site falha fechado até os dois baterem | seção 9 acima (criar conta de visitante com e-mail de membro: tem de recusar) |
| `DIRECTUS_ADMIN_TOKEN` | site e sistema (Azure), GitHub, SOPS (`site/secrets.env`, `api/local.settings.enc.json`) | nada, se o token novo for gravado no Directus (`PATCH /users/<admin>`) na mesma hora | testes do site (`site-testes.yml`) e `site-conteudo-sync.yml` verdes |
| `TELEFONE_CHAVE_SEGREDO` | site (Azure), GitHub, SOPS | as chaves de busca e o telefone cifrado dos pedidos — **rechavear** antes de trocar (script de 07/10: decifra com o velho, regrava com o novo; item só com chave velha fica nulo e volta na consulta pelo nome) | `camisetas.cjs` e `eventos.cjs` 20/20 e 15/15 |
| `ACS_CONNECTION_STRING` | sistema e site (Azure), GitHub `ACS_CONNECTION_STRING` | e-mail para fora até os três baterem | pedir um código por e-mail no site (conta de visitante) e no login da liderança |
| `VAPID_PRIVATE_KEY` + `VAPID_PUBLIC_KEY` (par) | sistema (Azure); só a privada no GitHub | **todas as inscrições de push**: cada pessoa ativa as notificações de novo no aparelho | ativar push num aparelho e receber um aviso |
| `SQL_CONNECTION_STRING` (senha do SQL) | sistema (Azure, produção e preview 21 — este aponta para o `ieadespa-homolog`), GitHub `AZURE_SQL_CONNECTION_STRING` e `_HOMOLOG`, SOPS do `api/` | API fora até todos baterem (trocar a senha no servidor SQL e os valores em seguida, em minutos) | `/api/saude` 200 e varredura de rotas verde |
| chave `age` do SOPS | `%APPDATA%\sops\age\keys.txt` de cada pessoa | ninguém mais decifra os arquivos até `sops updatekeys` com a chave nova | `sops -d site/secrets.env` com a chave nova |

**Checklist (6 passos, para qualquer sessão futura):**

1. **Contar antes** o que a troca atinge (sessões abertas, pedidos com chave, inscrições de push) e **avisar** quem sente.
2. **Gerar** o valor novo dentro de um script (`crypto.randomBytes`) — nunca no terminal, nunca em texto puro.
3. **Gravar nas configurações do Azure** dos aplicativos certos (produção **e** o preview `21` do sistema, que nasce copiando a
   produção) pelo `python.exe -IBm azure.cli` do próprio CLI com os argumentos em lista (sem shell), `-o none`.
4. **Gravar nos segredos do GitHub** (`gh secret set NOME` com o valor pelo stdin) e **nos arquivos SOPS** do repositório
   (decifrar em memória, trocar, cifrar de novo com `--filename-override`), e commitar os arquivos cifrados.
5. **Conferir** com o que já existe: testes do site contra a produção, varredura de rotas, login na homologação, um
   e-mail de código — e ler os registros das Functions por 10 minutos.
6. **Anotar** data e motivo no plano (vD.8) e aqui; se o valor velho apareceu em algum lugar (registro, conversa), apagar
   o registro.

Exemplo já executado, com script reutilizável: 07/10/2026, `DIRECTUS_ADMIN_TOKEN` e `TELEFONE_CHAVE_SEGREDO` (fases
`gerar → contar → rechavear → trocar-azure → trocar-directus → trocar-github → concluir → conferir`).
