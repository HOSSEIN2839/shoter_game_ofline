$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
$vendor = Join-Path $root 'public/vendor/three'
$addons = Join-Path $vendor 'examples/jsm'
$characters = Join-Path $root 'public/assets/characters'
New-Item -ItemType Directory -Force -Path (Join-Path $vendor 'build'), (Join-Path $addons 'loaders'), (Join-Path $addons 'utils'), $characters | Out-Null

$downloads = @(
  @{ Url='https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js'; Path=(Join-Path $vendor 'build/three.module.js'); Min=300000 },
  @{ Url='https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js'; Path=(Join-Path $addons 'loaders/GLTFLoader.js'); Min=50000 },
  @{ Url='https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/utils/SkeletonUtils.js'; Path=(Join-Path $addons 'utils/SkeletonUtils.js'); Min=10000 },
  @{ Url='https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/utils/BufferGeometryUtils.js'; Path=(Join-Path $addons 'utils/BufferGeometryUtils.js'); Min=10000 },
  @{ Url='https://raw.githubusercontent.com/mrdoob/three.js/r170/LICENSE'; Path=(Join-Path $vendor 'LICENSE.txt'); Min=500 }
)
foreach ($item in $downloads) {
  Write-Host "Downloading $($item.Url)" -ForegroundColor Cyan
  Invoke-WebRequest -Uri $item.Url -OutFile $item.Path
  if ((Get-Item $item.Path).Length -lt $item.Min) { throw "Downloaded file is unexpectedly small: $($item.Path)" }
}

$models = @(
  @{ Id='army-general'; File='ArmyGeneral.glb' },
  @{ Id='army-officer'; File='ArmyOfficer.glb' },
  @{ Id='army-sniper'; File='ArmySniper.glb' },
  @{ Id='combat-engineer'; File='CombatEngineer.glb' },
  @{ Id='combat-medic'; File='CombatMedic.glb' },
  @{ Id='machine-gunner'; File='MachineGunner.glb' },
  @{ Id='recon-scout'; File='ReconScout.glb' },
  @{ Id='rifleman'; File='Rifleman.glb' }
)
foreach ($model in $models) {
  $url = "https://gobkit.com/freebies/human004/$($model.File)"
  $out = Join-Path $characters "$($model.Id).glb"
  Write-Host "Downloading $($model.File)" -ForegroundColor Cyan
  Invoke-WebRequest -Uri $url -OutFile $out
  if ((Get-Item $out).Length -lt 10000) { throw "Invalid or incomplete GLB: $out" }
}

$manifest = @{
  source = 'Gobkit Free Character Pack Vol.4'
  sourceUrl = 'https://gobkit.com/freebies/human004/gobkit-human004-pack.zip'
  license = 'CC0 1.0 Universal'
  licenseUrl = 'https://creativecommons.org/publicdomain/zero/1.0/'
  downloadedAt = (Get-Date).ToUniversalTime().ToString('o')
  fps = 30
  animations = @('Idle','Walk','Run','Death','Hit','Attack','Special')
  characters = @($models | ForEach-Object { @{ id=$_.Id; file=("$($_.Id).glb") } })
}
$manifest | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 (Join-Path $characters 'manifest.json')
Write-Host ''
Write-Host 'Asset download completed. Review the files, then commit and push the generated public/vendor and public/assets folders.' -ForegroundColor Green
