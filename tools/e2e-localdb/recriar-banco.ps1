# Recria o banco ieadespa_local do zero no LocalDB psc7 (descartável).
Add-Type -AssemblyName System.Data
$mestre = New-Object System.Data.SqlClient.SqlConnection('Server=(localdb)\psc7;Database=master;Integrated Security=true;Connect Timeout=30')
$mestre.Open()
$c = $mestre.CreateCommand()
$c.CommandText = "IF DB_ID('ieadespa_local') IS NOT NULL BEGIN ALTER DATABASE ieadespa_local SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE ieadespa_local; END; CREATE DATABASE ieadespa_local;"
$c.CommandTimeout = 120
[void]$c.ExecuteNonQuery()
$mestre.Close()
Write-Output 'banco recriado'
