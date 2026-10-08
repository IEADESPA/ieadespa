# ponte.ps1 — liga o Node (shim do mssql) a um SQL Server LocalDB por uma conexão .NET que fica aberta. Protocolo: uma linha JSON por pedido
# (stdin) e uma linha JSON por resposta (stdout). Descartável: não vai para o repositório.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Data
$utf8 = New-Object System.Text.UTF8Encoding($false)
$leitor = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), $utf8)
$escritor = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput(), $utf8)
$escritor.AutoFlush = $true
$escritor.NewLine = "`n"
$inv = [System.Globalization.CultureInfo]::InvariantCulture

$script:conn = $null
$script:tx = $null
$script:ra = $null
$script:msgs = $null

function Abrir {
  if ($script:conn -ne $null) { try { $script:conn.Close() } catch {} ; try { $script:conn.Dispose() } catch {} }
  $script:tx = $null
  $script:conn = New-Object System.Data.SqlClient.SqlConnection($env:E2E_CS)
  $script:conn.FireInfoMessageEventOnUserErrors = $false
  $script:conn.add_InfoMessage({ param($s, $e) if ($script:msgs -ne $null) { [void]$script:msgs.Add([string]$e.Message) } })
  $script:conn.Open()
}

function Esc([string]$s) {
  $sb = New-Object System.Text.StringBuilder
  foreach ($ch in $s.ToCharArray()) {
    $c = [int]$ch
    if ($ch -eq '"') { [void]$sb.Append('\"') }
    elseif ($ch -eq '\') { [void]$sb.Append('\\') }
    elseif ($c -lt 32) { [void]$sb.Append(('\u{0:x4}' -f $c)) }
    else { [void]$sb.Append($ch) }
  }
  return $sb.ToString()
}

function Valor($v) {
  if ($v -eq $null -or $v -is [System.DBNull]) { return 'null' }
  if ($v -is [bool]) { if ($v) { return 'true' } else { return 'false' } }
  if ($v -is [int] -or $v -is [long] -or $v -is [int16] -or $v -is [byte]) { return $v.ToString($inv) }
  if ($v -is [decimal] -or $v -is [double] -or $v -is [single]) { return ([double]$v).ToString('R', $inv) }
  if ($v -is [datetime]) { return '"' + $v.ToString('yyyy-MM-ddTHH:mm:ss.fffZ', $inv) + '"' }
  if ($v -is [guid]) { return '"' + $v.ToString() + '"' }
  if ($v -is [byte[]]) { return '"' + [Convert]::ToBase64String($v) + '"' }
  return '"' + (Esc $v.ToString()) + '"'
}

function TipoDe($nome) {
  switch ($nome) {
    'Int' { [System.Data.SqlDbType]::Int } 'BigInt' { [System.Data.SqlDbType]::BigInt } 'SmallInt' { [System.Data.SqlDbType]::SmallInt } 'TinyInt' { [System.Data.SqlDbType]::TinyInt }
    'Bit' { [System.Data.SqlDbType]::Bit } 'NVarChar' { [System.Data.SqlDbType]::NVarChar } 'VarChar' { [System.Data.SqlDbType]::VarChar } 'Char' { [System.Data.SqlDbType]::Char }
    'NChar' { [System.Data.SqlDbType]::NChar } 'Date' { [System.Data.SqlDbType]::Date } 'DateTime' { [System.Data.SqlDbType]::DateTime } 'DateTime2' { [System.Data.SqlDbType]::DateTime2 }
    'Decimal' { [System.Data.SqlDbType]::Decimal } 'Float' { [System.Data.SqlDbType]::Float } 'UniqueIdentifier' { [System.Data.SqlDbType]::UniqueIdentifier }
    default { throw "tipo nao suportado pela ponte: $nome" }
  }
}

function Executar($pedido) {
  $cmd = $script:conn.CreateCommand()
  $cmd.CommandText = [string]$pedido.sql
  $cmd.CommandTimeout = 120
  if ($script:tx -ne $null) { $cmd.Transaction = $script:tx }
  foreach ($p in $pedido.params) {
    $tipo = TipoDe ([string]$p.tipo)
    $par = New-Object System.Data.SqlClient.SqlParameter
    $par.ParameterName = '@' + [string]$p.nome
    $par.SqlDbType = $tipo
    if ($tipo -eq [System.Data.SqlDbType]::NVarChar -or $tipo -eq [System.Data.SqlDbType]::VarChar -or $tipo -eq [System.Data.SqlDbType]::Char -or $tipo -eq [System.Data.SqlDbType]::NChar) {
      if ($p.tam -ne $null -and [int]$p.tam -gt 0) { $par.Size = [int]$p.tam } else { $par.Size = -1 }
    }
    if ($tipo -eq [System.Data.SqlDbType]::Decimal) { $par.Precision = 18; $par.Scale = 4; if ($p.prec -ne $null) { $par.Precision = [byte]$p.prec }; if ($p.escala -ne $null) { $par.Scale = [byte]$p.escala } }
    if ($p.valor -eq $null) { $par.Value = [System.DBNull]::Value }
    elseif ($tipo -eq [System.Data.SqlDbType]::Date -or $tipo -eq [System.Data.SqlDbType]::DateTime -or $tipo -eq [System.Data.SqlDbType]::DateTime2) {
      $dt = [datetime]::Parse([string]$p.valor, $inv, [System.Globalization.DateTimeStyles]::AdjustToUniversal -bor [System.Globalization.DateTimeStyles]::AssumeUniversal)
      $par.Value = [datetime]::SpecifyKind($dt, [System.DateTimeKind]::Unspecified)
    }
    elseif ($tipo -eq [System.Data.SqlDbType]::Bit) { $par.Value = [bool]$p.valor }
    elseif ($tipo -eq [System.Data.SqlDbType]::UniqueIdentifier) { $par.Value = [guid]([string]$p.valor) }
    elseif ($tipo -eq [System.Data.SqlDbType]::Int -or $tipo -eq [System.Data.SqlDbType]::SmallInt -or $tipo -eq [System.Data.SqlDbType]::TinyInt -or $tipo -eq [System.Data.SqlDbType]::BigInt) { $par.Value = [long]$p.valor }
    elseif ($tipo -eq [System.Data.SqlDbType]::Decimal -or $tipo -eq [System.Data.SqlDbType]::Float) { $par.Value = [double]$p.valor }
    else { $par.Value = [string]$p.valor }
    [void]$cmd.Parameters.Add($par)
  }
  $script:ra = New-Object System.Collections.ArrayList
  $script:msgs = New-Object System.Collections.ArrayList
  $cmd.add_StatementCompleted({ param($s, $e) [void]$script:ra.Add([int]$e.RecordCount) })
  $leitorSql = $cmd.ExecuteReader()
  $conjuntos = New-Object System.Text.StringBuilder
  [void]$conjuntos.Append('[')
  $primeiro = $true
  do {
    if (-not $primeiro) { [void]$conjuntos.Append(',') }
    $primeiro = $false
    $n = $leitorSql.FieldCount
    $nomes = @(); $datas = @()
    for ($i = 0; $i -lt $n; $i++) {
      $nomes += $leitorSql.GetName($i)
      $tn = $leitorSql.GetDataTypeName($i)
      if ($tn -eq 'date' -or $tn -eq 'datetime' -or $tn -eq 'datetime2' -or $tn -eq 'smalldatetime') { $datas += $i }
    }
    [void]$conjuntos.Append('{"colunas":[')
    for ($i = 0; $i -lt $n; $i++) { if ($i -gt 0) { [void]$conjuntos.Append(',') }; [void]$conjuntos.Append('"' + (Esc $nomes[$i]) + '"') }
    [void]$conjuntos.Append('],"datas":[' + ($datas -join ',') + '],"linhas":[')
    $primeiraLinha = $true
    while ($leitorSql.Read()) {
      if (-not $primeiraLinha) { [void]$conjuntos.Append(',') }
      $primeiraLinha = $false
      [void]$conjuntos.Append('[')
      for ($i = 0; $i -lt $n; $i++) { if ($i -gt 0) { [void]$conjuntos.Append(',') }; [void]$conjuntos.Append((Valor $leitorSql.GetValue($i))) }
      [void]$conjuntos.Append(']')
    }
    [void]$conjuntos.Append(']}')
  } while ($leitorSql.NextResult())
  [void]$conjuntos.Append(']')
  $leitorSql.Close()
  $mensagens = '[' + (($script:msgs | ForEach-Object { '"' + (Esc $_) + '"' }) -join ',') + ']'
  return '{"ok":true,"conjuntos":' + $conjuntos.ToString() + ',"afetadas":[' + ($script:ra -join ',') + '],"mensagens":' + $mensagens + '}'
}

Abrir
$escritor.WriteLine('{"pronto":true}')
while ($true) {
  $linha = $leitor.ReadLine()
  if ($linha -eq $null) { break }
  if ($linha.Trim().Length -eq 0) { continue }
  $pedido = $linha | ConvertFrom-Json
  $id = $pedido.id
  try {
    switch ([string]$pedido.op) {
      'query' { $corpo = Executar $pedido }
      'begin' { $script:tx = $script:conn.BeginTransaction(); $corpo = '{"ok":true}' }
      'commit' { if ($script:tx -ne $null) { $script:tx.Commit(); $script:tx = $null }; $corpo = '{"ok":true}' }
      'rollback' { if ($script:tx -ne $null) { try { $script:tx.Rollback() } catch {} ; $script:tx = $null }; $corpo = '{"ok":true}' }
      'sair' { $escritor.WriteLine('{"id":' + $id + ',"ok":true}'); break }
      default { throw "operacao desconhecida: $($pedido.op)" }
    }
    $escritor.WriteLine('{"id":' + $id + ',' + $corpo.Substring(1))
  } catch {
    $e = $_.Exception
    while ($e.InnerException -ne $null) { $e = $e.InnerException }
    $numero = 0; if ($e -is [System.Data.SqlClient.SqlException]) { $numero = $e.Number }
    $escritor.WriteLine('{"id":' + $id + ',"ok":false,"erro":{"mensagem":"' + (Esc $e.Message) + '","numero":' + $numero + '}}')
    # Depois de QUALQUER erro de SQL a conexão é reciclada: senão o próximo comando falha com "já existe um DataReader aberto".
    try { Abrir } catch { Start-Sleep -Milliseconds 300; Abrir }
  }
  if ([string]$pedido.op -eq 'sair') { break }
}
