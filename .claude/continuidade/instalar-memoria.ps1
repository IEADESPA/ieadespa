# Prepara este computador para trabalhar no repositório da IEADESPA com a mesma bancada de quem começou: o servidor de
# memória, os plugins e as habilidades da lista bancada.json, os programas que eles usam e a memória automática do
# Claude. Pergunta antes de cada mudança na configuração da pessoa. Rodar de novo não estraga nada.
#
# O jeito fácil: dois cliques no INSTALAR.cmd, nesta mesma pasta. Pelo PowerShell, na raiz do repositório:
#   powershell -ExecutionPolicy Bypass -File .\.claude\continuidade\instalar-memoria.ps1
#   ... -SoTestar  só mostra o que faria, sem mudar nada (o nome antigo -Simular também vale)
#   ... -Sim       responde "sim" a todas as perguntas (quando a pessoa já deu a licença)
# Kit de 17/11/2026; bancada, memória versionada e memória automática em 20/11/2026.

param([Alias('Simular')][switch]$SoTestar, [switch]$Sim)

$ErrorActionPreference = 'Stop'
$destino = 'C:\MCP'
$versao = '2.1.1'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$script:semJanela = $false

function Perguntar([string]$texto) {
    if ($SoTestar) { Write-Host "  [só testar] perguntaria: $texto"; return $false }
    if ($Sim) { Write-Host "  $texto -> sim (-Sim)"; return $true }
    try {
        $resposta = Read-Host "  $texto (S/N)"
    } catch {
        # sem janela para perguntar (ex.: rodado por um programa): não muda nada
        $script:semJanela = $true
        Write-Host "  $texto -> pulado (sem janela para perguntar)"
        return $false
    }
    return ($resposta -match '^\s*[sS]')
}

# Roda um programa de fora sem que a saída de erro dele pare o instalador (no PowerShell 5.1, com 'Stop', ela pararia).
function Rodar([scriptblock]$bloco) {
    $ErrorActionPreference = 'Continue'
    $saida = & $bloco 2>&1
    $codigo = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    $texto = ($saida | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] } | Out-String)
    return @{ Saida = $saida; Texto = $texto; Codigo = $codigo }
}

# O instalador mora em .claude\continuidade do repositório; a cópia de C:\MCP\continuidade não sabe qual é o repositório.
$bancadaArq = Join-Path $PSScriptRoot 'bancada.json'
$noRepositorio = (Test-Path (Join-Path $repo '.claude\settings.json')) -and (Test-Path $bancadaArq)
$bancada = $null
if ($noRepositorio) {
    $bancada = Get-Content $bancadaArq -Raw -Encoding UTF8 | ConvertFrom-Json
    Write-Host "Repositório: $repo"
} else {
    Write-Host 'Rodando fora do repositório: os passos da bancada (plugins, habilidades e memória automática) ficam de fora.'
}
if ($SoTestar) { Write-Host 'Modo só testar: nada será mudado.' }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host 'Falta o Node.js. Instale com:  winget install OpenJS.NodeJS.LTS'
    Write-Host 'Depois feche e abra a janela e rode este instalador de novo.'
    exit 1
}

# O Claude Code: o comando do terminal ou o da extensão do VS Code (a versão mais nova).
$claude = (Get-Command claude -ErrorAction SilentlyContinue).Source
if (-not $claude) {
    $claude = Get-ChildItem "$env:USERPROFILE\.vscode\extensions\anthropic.claude-code-*\resources\native-binary\claude.exe" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime | Select-Object -Last 1 -ExpandProperty FullName
}
if (-not $claude) {
    Write-Host 'Não achei o Claude Code. Instale a extensão do VS Code, faça o login e rode de novo.'
    exit 1
}

# 1. O servidor de memória em C:\MCP (o programa, o kit e o servidor com versão fixa).
Write-Host ''
Write-Host "1. O servidor de memória ($destino)"
$kit = Join-Path $destino 'continuidade'
function Igual([string]$a, [string]$b) {
    (Test-Path $a) -and (Test-Path $b) -and ((Get-FileHash $a).Hash -eq (Get-FileHash $b).Hash)
}
$kitIgual = @(Get-ChildItem $PSScriptRoot -File | Where-Object { -not (Igual $_.FullName (Join-Path $kit $_.Name)) }).Count -eq 0
$servidorOk = (Test-Path "$destino\node_modules\@modelcontextprotocol\server-memory\package.json") -and $kitIgual -and
    (Igual "$destino\iniciar-memoria.mjs" (Join-Path $PSScriptRoot 'iniciar-memoria.mjs'))
if ($servidorOk) {
    Write-Host '  Já instalado e atualizado.'
} elseif (Perguntar "Instalar ou atualizar o servidor de memória $versao e o kit em ${destino}?") {
    New-Item -ItemType Directory -Force (Join-Path $destino 'memorias') | Out-Null
    New-Item -ItemType Directory -Force $kit | Out-Null
    if ((Resolve-Path $PSScriptRoot).Path -ne (Resolve-Path $kit).Path) {
        # só os arquivos do kit: as memórias versionadas ficam no repositório
        Get-ChildItem $PSScriptRoot -File | Copy-Item -Destination $kit -Force
    }
    Copy-Item (Join-Path $PSScriptRoot 'iniciar-memoria.mjs') $destino -Force
    $r = Rodar { npm install --prefix $destino --save-exact --no-fund --no-audit "@modelcontextprotocol/server-memory@$versao" }
    if ($r.Codigo -ne 0) { $r.Saida | Write-Host; Write-Host '  A instalação do servidor falhou (internet? permissão?).'; exit 1 }
    Write-Host '  Servidor instalado.'
}

# 2. O registro do servidor no Claude Code, para todos os projetos (configuração do usuário).
Write-Host ''
Write-Host '2. O servidor memoria-projeto no Claude Code'
$r = Rodar { & $claude mcp get memoria-projeto }
if ($r.Codigo -eq 0) {
    Write-Host '  Já estava registrado.'
} elseif (Perguntar 'Registrar o servidor memoria-projeto no Claude Code (vale para todos os seus projetos)?') {
    $r = Rodar { & $claude mcp add --scope user memoria-projeto -- node "$destino\iniciar-memoria.mjs" }
    if ($r.Codigo -ne 0) { $r.Saida | Write-Host; Write-Host '  O registro falhou.'; exit 1 }
    Write-Host '  Registrado.'
}
Write-Host '  Neste repositório ele usa a memória versionada (.claude\continuidade\memoria); nos outros, a de C:\MCP\memorias.'

# 3. Os plugins da bancada (ligar no .claude\settings.json não instala) e os que vêm da conta da organização.
Write-Host ''
Write-Host '3. Os plugins'
$r = Rodar { & $claude plugin list --json }
$instalados = @()
if ($r.Codigo -eq 0) { $instalados = @(($r.Texto | ConvertFrom-Json) | ForEach-Object { $_.id }) }
if (-not $noRepositorio) {
    Write-Host '  Fora do repositório: pulado.'
} else {
    $pedidos = @($bancada.plugins | ForEach-Object { $_.id })
    $ligados = (Get-Content (Join-Path $repo '.claude\settings.json') -Raw -Encoding UTF8 | ConvertFrom-Json).enabledPlugins
    foreach ($p in $pedidos) {
        if (-not ($ligados.PSObject.Properties.Name -contains $p)) { Write-Host "  Aviso: $p está na bancada, mas o .claude\settings.json não o liga (rode tools/conferir-bancada.sh)." }
    }
    $faltam = @($pedidos | Where-Object { $instalados -notcontains $_ })
    if ($faltam.Count -eq 0) {
        Write-Host "  Os $($pedidos.Count) plugins da bancada já estão instalados."
    } elseif (Perguntar "Instalar $($faltam.Count) plugin(s) neste repositório: $($faltam -join ', ')?") {
        Push-Location $repo
        try {
            foreach ($p in $faltam) {
                $r = Rodar { & $claude plugin install $p --scope project }
                if ($r.Codigo -eq 0) { Write-Host "  Instalado: $p" }
                else { $r.Saida | Write-Host; Write-Host "  Não instalou $p. No VS Code: /plugins, procure o nome e 'Install for this project'." }
            }
        } finally { Pop-Location }
    }
    foreach ($c in $bancada.pluginsDaConta) {
        if ($instalados -contains $c.id) { Write-Host "  Da conta da organização: $($c.id) (ok)." }
        else { Write-Host "  Da conta da organização: $($c.id) ainda não chegou. Ele vem $($c.vem): confira o /login e reabra o VS Code." }
    }
}

# 4. As habilidades da bancada: vêm com o repositório, nas duas pastas (Claude Code e Codex).
Write-Host ''
Write-Host '4. As habilidades'
if (-not $noRepositorio) {
    Write-Host '  Fora do repositório: pulado.'
} else {
    $pessoais = Join-Path $env:USERPROFILE '.claude\skills'
    $prontas = 0
    foreach ($h in $bancada.habilidades) {
        $doProjeto = Join-Path $repo ".claude\skills\$($h.nome)\SKILL.md"
        if (-not ((Test-Path $doProjeto) -and (Test-Path (Join-Path $repo ".agents\skills\$($h.nome)\SKILL.md")))) {
            Write-Host "  Falta no repositório: $($h.nome) (faça git pull)."
            continue
        }
        $prontas++
        # uma habilidade pessoal com o mesmo nome ganha da do projeto: só avisa, nunca apaga
        $pessoal = Join-Path $pessoais "$($h.nome)\SKILL.md"
        if ((Test-Path $pessoal) -and (Get-FileHash $pessoal).Hash -ne (Get-FileHash $doProjeto).Hash) {
            Write-Host "  Atenção: a sua cópia pessoal de $($h.nome) ($pessoais) é diferente e ganha da do projeto: atualize ou apague a pessoal."
        }
    }
    Write-Host "  $prontas de $(@($bancada.habilidades).Count) habilidades da bancada prontas no repositório (.claude\skills e .agents\skills)."
}

# 5. Os programas que os plugins usam (npm global).
Write-Host ''
Write-Host '5. Os programas dos plugins'
foreach ($g in @($bancada.programas | Where-Object { $_ })) {
    if (Get-Command $g.comando -ErrorAction SilentlyContinue) {
        Write-Host "  $($g.comando): já instalado."
    } elseif (Perguntar "Instalar no npm global $($g.npm -join ' e ') (para $($g.para))?") {
        $pacotes = @($g.npm)
        $r = Rodar { npm install -g @pacotes }
        if ($r.Codigo -ne 0) { $r.Saida | Write-Host; Write-Host '  A instalação falhou: o resto continua.' } else { Write-Host '  Instalado.' }
    }
}

# 6. A memória automática do Claude: a pasta versionada, só neste repositório (settings.local.json, fora do Git).
Write-Host ''
Write-Host '6. A memória automática do Claude (como trabalhar com o responsável)'
$memoriaClaude = Join-Path $repo '.claude\continuidade\memoria-claude'
$local = Join-Path $repo '.claude\settings.local.json'
$atual = $null
if ($noRepositorio -and (Test-Path $local)) { $atual = (Get-Content $local -Raw -Encoding UTF8 | ConvertFrom-Json).autoMemoryDirectory }
if (-not $noRepositorio) {
    Write-Host '  Fora do repositório: pulado.'
} elseif ($atual -eq $memoriaClaude) {
    Write-Host '  Já aponta para a pasta versionada.'
} else {
    # A memória pessoal que o Claude usa hoje neste repositório: avisa o que ela tem de diferente da versionada.
    $pessoal = Join-Path $env:USERPROFILE (".claude\projects\" + ($repo -replace '[^A-Za-z0-9]', '-') + '\memory')
    if (Test-Path $pessoal) {
        $diferentes = @(Get-ChildItem $pessoal -Filter *.md | Where-Object {
            $par = Join-Path $memoriaClaude $_.Name
            -not (Test-Path $par) -or (Get-FileHash $_.FullName).Hash -ne (Get-FileHash $par).Hash
        } | ForEach-Object { $_.Name })
        if ($diferentes.Count -gt 0) {
            Write-Host "  A sua memória pessoal ($pessoal) tem $($diferentes.Count) nota(s) diferente(s) da versionada:"
            $diferentes | Select-Object -First 15 | ForEach-Object { Write-Host "    $_" }
            Write-Host '  Se alguma for mais nova, junte à mão na pasta versionada antes (sem senha nem dado pessoal).'
        }
    }
    if ($atual) { Write-Host "  Hoje o autoMemoryDirectory aponta para: $atual" }
    if (Perguntar "Apontar a memória automática do Claude deste repositório para $memoriaClaude ?") {
        $r = Rodar { node (Join-Path $PSScriptRoot 'ajustar-config.mjs') $local autoMemoryDirectory $memoriaClaude }
        $r.Saida | Write-Host
    }
}

# 7. As configurações pessoais da bancada (economia de créditos), em ~\.claude\settings.json.
Write-Host ''
Write-Host '7. As configurações pessoais (~\.claude\settings.json)'
$usuario = Join-Path $env:USERPROFILE '.claude\settings.json'
$doUsuario = $null
if (Test-Path $usuario) { $doUsuario = Get-Content $usuario -Raw -Encoding UTF8 | ConvertFrom-Json }
foreach ($c in @($bancada.configuracoesPessoais | Where-Object { $_ })) {
    $hoje = $null
    if ($doUsuario) { $hoje = $doUsuario.($c.chave) }
    if ($hoje -eq $c.valor) {
        Write-Host "  $($c.chave) = $($c.valor): já está."
    } elseif (Perguntar "Gravar $($c.chave) = $($c.valor) nas suas configurações (para $($c.para))? Hoje: $(if ($null -eq $hoje) { 'sem valor' } else { $hoje })") {
        $valorJson = ConvertTo-Json $c.valor -Compress
        $r = Rodar { node (Join-Path $PSScriptRoot 'ajustar-config.mjs') $usuario $c.chave $valorJson --json }
        $r.Saida | Write-Host
    }
}
if (-not $noRepositorio) { Write-Host '  Fora do repositório: pulado.' }

# 8. As regras globais, só se ainda não houver.
Write-Host ''
Write-Host '8. As regras globais (~\.claude\CLAUDE.md)'
$regras = Join-Path $env:USERPROFILE '.claude\CLAUDE.md'
if (Test-Path $regras) {
    Write-Host "  Você já tem regras globais: não mexi. Compare com $PSScriptRoot\regras-globais.md e junte à mão."
} elseif (Perguntar "Instalar as regras globais da IEADESPA em ${regras}?") {
    New-Item -ItemType Directory -Force (Split-Path $regras) | Out-Null
    Copy-Item (Join-Path $PSScriptRoot 'regras-globais.md') $regras
    Write-Host '  Instaladas.'
}

Write-Host ''
if ($script:semJanela) {
    Write-Host 'Algumas perguntas ficaram sem resposta (sem janela). Rode de novo com dois cliques no INSTALAR.cmd,'
    Write-Host 'ou, se a pessoa já deu a licença para tudo, com -Sim.'
}
Write-Host 'Pronto. No VS Code: Ctrl+Shift+P, "Recarregar Janela". Numa conversa nova do Claude, confira:'
Write-Host '  /mcp (memoria-projeto conectado), /plugins (os da bancada) e /memory (a pasta da memória automática).'
Write-Host 'Antes de começar: git pull e a linha "Em uso por" no alto do HANDOFF.md.'
