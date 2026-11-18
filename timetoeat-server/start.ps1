param([string]$DockerPath = '')
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not $DockerPath) {
  $command = Get-Command docker -ErrorAction SilentlyContinue
  if ($command) { $DockerPath = $command.Source }
  else { $DockerPath = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe' }
}
if (-not (Test-Path -LiteralPath $DockerPath)) { throw 'Docker not found. Pass -DockerPath with the full docker.exe path.' }
$env:PATH = (Split-Path -LiteralPath $DockerPath) + [IO.Path]::PathSeparator + $env:PATH
node scripts/prepare.js
if ($LASTEXITCODE -ne 0) { throw 'Could not prepare local configuration.' }
$apiPort = '8080'
$mysqlPort = '3307'
foreach ($line in Get-Content -LiteralPath '.env') {
  if ($line -match '^API_PORT=(\d+)$') { $apiPort = $Matches[1] }
  if ($line -match '^MYSQL_PORT=(\d+)$') { $mysqlPort = $Matches[1] }
}
& $DockerPath compose up -d --wait mysql
if ($LASTEXITCODE -ne 0) { throw 'MySQL did not become healthy.' }
& $DockerPath compose cp 'sql/003-friend-remarks.sql' 'mysql:/tmp/003-friend-remarks.sql'
if ($LASTEXITCODE -ne 0) { throw 'Could not copy friend remark migration.' }
& $DockerPath compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -u timetoeat --default-character-set=utf8mb4 timetoeat < /tmp/003-friend-remarks.sql'
if ($LASTEXITCODE -ne 0) { throw 'Friend remark migration failed; API was not rebuilt.' }
& $DockerPath compose cp 'sql/004-dish-responses.sql' 'mysql:/tmp/004-dish-responses.sql'
if ($LASTEXITCODE -ne 0) { throw 'Could not copy dish response migration.' }
& $DockerPath compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -u timetoeat --default-character-set=utf8mb4 timetoeat < /tmp/004-dish-responses.sql'
if ($LASTEXITCODE -ne 0) { throw 'Dish response migration failed; API was not rebuilt.' }
& $DockerPath compose cp 'sql/005-dish-response-activity.sql' 'mysql:/tmp/005-dish-response-activity.sql'
if ($LASTEXITCODE -ne 0) { throw 'Could not copy dish response activity migration.' }
& $DockerPath compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -u timetoeat --default-character-set=utf8mb4 timetoeat < /tmp/005-dish-response-activity.sql'
if ($LASTEXITCODE -ne 0) { throw 'Dish response activity migration failed; API was not rebuilt.' }
& $DockerPath compose cp 'sql/006-profile-and-enjoy.sql' 'mysql:/tmp/006-profile-and-enjoy.sql'
if ($LASTEXITCODE -ne 0) { throw 'Could not copy profile and enjoy migration.' }
& $DockerPath compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -u timetoeat --default-character-set=utf8mb4 timetoeat < /tmp/006-profile-and-enjoy.sql'
if ($LASTEXITCODE -ne 0) { throw 'Profile and enjoy migration failed; API was not rebuilt.' }
& $DockerPath compose up -d --build api
if ($LASTEXITCODE -ne 0) { throw 'Docker Compose failed. Check Docker Desktop and container logs.' }
$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  try {
    $response = Invoke-RestMethod "http://127.0.0.1:$apiPort/health" -TimeoutSec 2
    if ($response.data.status -eq 'ok') { $ready = $true; break }
  } catch { Start-Sleep -Seconds 1 }
}
if (-not $ready) { throw 'API health check failed. Check API container logs.' }
Write-Host "Ready: http://127.0.0.1:$apiPort | MySQL: 127.0.0.1:$mysqlPort"
