$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = "https://raw.githubusercontent.com/cktang88/3d-fps/main/"
$publicRoot = Join-Path $projectRoot "public"
$creditDir = Join-Path $publicRoot "assets\credits"

$assets = @(
    @{ Path="public/assets/models/characters/soldier.glb"; Dest="assets/combat/characters/soldier.glb"; Min=2500000; Magic="glTF" },
    @{ Path="public/assets/models/characters/soldier_tac.glb"; Dest="assets/combat/characters/soldier_tac.glb"; Min=3500000; Magic="glTF" },

    @{ Path="public/assets/models/fp/m4a1.glb"; Dest="assets/combat/weapons/m4a1.glb"; Min=1000000; Magic="glTF" },
    @{ Path="public/assets/models/fp/awm.glb"; Dest="assets/combat/weapons/awm.glb"; Min=900000; Magic="glTF" },
    @{ Path="public/assets/models/fp/m1911.glb"; Dest="assets/combat/weapons/m1911.glb"; Min=1000000; Magic="glTF" },
    @{ Path="public/assets/models/fp/shotgun.glb"; Dest="assets/combat/weapons/shotgun.glb"; Min=800000; Magic="glTF" },
    @{ Path="public/assets/models/fp/mp5a5.glb"; Dest="assets/combat/weapons/mp5a5.glb"; Min=1300000; Magic="glTF" },

    @{ Path="public/assets/models/props/old_military_crate/old_military_crate.glb"; Dest="assets/combat/props/old_military_crate.glb"; Min=250000; Magic="glTF" },
    @{ Path="public/assets/models/props/concrete_road_barrier/concrete_road_barrier.glb"; Dest="assets/combat/props/concrete_road_barrier.glb"; Min=300000; Magic="glTF" },
    @{ Path="public/assets/models/props/portable_generator/portable_generator.glb"; Dest="assets/combat/props/portable_generator.glb"; Min=450000; Magic="glTF" },
    @{ Path="public/assets/models/props/covered_car/covered_car.glb"; Dest="assets/combat/props/covered_car.glb"; Min=250000; Magic="glTF" },
    @{ Path="public/assets/models/props/old_tyre/old_tyre.glb"; Dest="assets/combat/props/old_tyre.glb"; Min=250000; Magic="glTF" },

    @{ Path="public/assets/audio/guns/m4a1_player_near.ogg"; Dest="assets/combat/audio/m4a1_player_near.ogg"; Min=7000; Magic="OggS" },
    @{ Path="public/assets/audio/guns/m4a1_world.ogg"; Dest="assets/combat/audio/m4a1_world.ogg"; Min=7000; Magic="OggS" },
    @{ Path="public/assets/audio/guns/m4a1_enemy_distant.ogg"; Dest="assets/combat/audio/m4a1_enemy_distant.ogg"; Min=8000; Magic="OggS" },
    @{ Path="public/assets/audio/guns/awm_player_near.ogg"; Dest="assets/combat/audio/awm_player_near.ogg"; Min=8000; Magic="OggS" },
    @{ Path="public/assets/audio/guns/awm_world.ogg"; Dest="assets/combat/audio/awm_world.ogg"; Min=8000; Magic="OggS" },
    @{ Path="public/assets/audio/guns/m1911_player_near.ogg"; Dest="assets/combat/audio/m1911_player_near.ogg"; Min=8000; Magic="OggS" },
    @{ Path="public/assets/audio/guns/m1911_world.ogg"; Dest="assets/combat/audio/m1911_world.ogg"; Min=8000; Magic="OggS" },
    @{ Path="public/assets/audio/guns/shotgun_player_near.ogg"; Dest="assets/combat/audio/shotgun_player_near.ogg"; Min=12000; Magic="OggS" },
    @{ Path="public/assets/audio/guns/shotgun_world.ogg"; Dest="assets/combat/audio/shotgun_world.ogg"; Min=12000; Magic="OggS" },
    @{ Path="public/assets/audio/foley/rifle_magout.ogg"; Dest="assets/combat/audio/rifle_magout.ogg"; Min=7000; Magic="OggS" },
    @{ Path="public/assets/audio/foley/rifle_magin.ogg"; Dest="assets/combat/audio/rifle_magin.ogg"; Min=5000; Magic="OggS" },
    @{ Path="public/assets/audio/foley/rifle_rack.ogg"; Dest="assets/combat/audio/rifle_rack.ogg"; Min=7000; Magic="OggS" },
    @{ Path="public/assets/audio/foley/shotgun_pump.ogg"; Dest="assets/combat/audio/shotgun_pump.ogg"; Min=9000; Magic="OggS" },
    @{ Path="public/assets/audio/foley/shotgun_shell.ogg"; Dest="assets/combat/audio/shotgun_shell.ogg"; Min=8000; Magic="OggS" },
    @{ Path="public/assets/audio/foley/pistol_magout.ogg"; Dest="assets/combat/audio/pistol_magout.ogg"; Min=6000; Magic="OggS" },
    @{ Path="public/assets/audio/foley/pistol_magin.ogg"; Dest="assets/combat/audio/pistol_magin.ogg"; Min=6000; Magic="OggS" },
    @{ Path="public/assets/audio/foley/pistol_slide.ogg"; Dest="assets/combat/audio/pistol_slide.ogg"; Min=5000; Magic="OggS" },
    @{ Path="public/assets/audio/impacts/impact_generic_light_000.ogg"; Dest="assets/combat/audio/impact_generic_light.ogg"; Min=5000; Magic="OggS" },
    @{ Path="public/assets/audio/impacts/impact_metal_light_000.ogg"; Dest="assets/combat/audio/impact_metal_light.ogg"; Min=6000; Magic="OggS" },
    @{ Path="public/assets/audio/impacts/impact_wood_light_000.ogg"; Dest="assets/combat/audio/impact_wood_light.ogg"; Min=5000; Magic="OggS" },
    @{ Path="public/assets/audio/steps/footstep_concrete_000.ogg"; Dest="assets/combat/audio/footstep_concrete.ogg"; Min=5000; Magic="OggS" },
    @{ Path="public/assets/audio/steps/footstep_grass_000.ogg"; Dest="assets/combat/audio/footstep_grass.ogg"; Min=7000; Magic="OggS" }
)

New-Item -ItemType Directory -Force -Path $creditDir | Out-Null
$ok = 0
foreach ($asset in $assets) {
    $destination = Join-Path $publicRoot $asset.Dest
    $folder = Split-Path -Parent $destination
    New-Item -ItemType Directory -Force -Path $folder | Out-Null

    if (Test-Path $destination) {
        $existing = Get-Item $destination
        if ($existing.Length -ge $asset.Min) {
            $bytes = [System.IO.File]::ReadAllBytes($destination)
            $magic = [System.Text.Encoding]::ASCII.GetString($bytes, 0, 4)
            if ($magic -eq $asset.Magic) {
                Write-Host "[SKIP] $($asset.Dest) already valid" -ForegroundColor DarkGray
                $ok++
                continue
            }
        }
    }

    $url = $sourceRoot + $asset.Path
    $temporary = "$destination.download"
    Write-Host "[GET] $($asset.Dest)" -ForegroundColor Cyan
    Invoke-WebRequest -Uri $url -OutFile $temporary -UseBasicParsing
    $file = Get-Item $temporary
    if ($file.Length -lt $asset.Min) {
        Remove-Item $temporary -Force -ErrorAction SilentlyContinue
        throw "Downloaded file is too small: $($asset.Dest) ($($file.Length) bytes)"
    }
    $bytes = [System.IO.File]::ReadAllBytes($temporary)
    $magic = [System.Text.Encoding]::ASCII.GetString($bytes, 0, 4)
    if ($magic -ne $asset.Magic) {
        Remove-Item $temporary -Force -ErrorAction SilentlyContinue
        throw "Invalid file signature: $($asset.Dest) expected $($asset.Magic), got $magic"
    }
    Move-Item -Force $temporary $destination
    Write-Host "[OK] $($asset.Dest) ($($file.Length) bytes)" -ForegroundColor Green
    $ok++
}

$creditFile = Join-Path $creditDir "IRONLINE_ASSET_CREDITS.md"
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/cktang88/3d-fps/main/README.md" -OutFile $creditFile -UseBasicParsing
if ((Get-Item $creditFile).Length -lt 5000) { throw "Source credit file download looks incomplete." }

Write-Host ""
Write-Host "Imported and verified $ok / $($assets.Count) game assets." -ForegroundColor Green
Write-Host "Credits saved to: $creditFile" -ForegroundColor Green
Write-Host "These files are local only until you commit and push them to GitHub." -ForegroundColor Yellow
