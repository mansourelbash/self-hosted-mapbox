$ErrorActionPreference = 'Stop'
cmd /c "docker info >nul 2>&1"
if ($LASTEXITCODE -ne 0) {
  throw 'Docker Linux engine is unavailable. Open Docker Desktop and wait for the engine to start, then run this script again.'
}
$projectRoot = Split-Path -Parent $PSScriptRoot
$dataPath = Join-Path $projectRoot 'data'
New-Item -ItemType Directory -Force -Path $dataPath | Out-Null
$pbfPath = Join-Path $dataPath 'jordan-latest.osm.pbf'
if (-not (Test-Path -LiteralPath $pbfPath)) {
  Invoke-WebRequest -Uri 'https://download.geofabrik.de/asia/jordan-latest.osm.pbf' -OutFile "$pbfPath.download"
  Move-Item -LiteralPath "$pbfPath.download" -Destination $pbfPath
}
$osrmImage = 'ghcr.io/project-osrm/osrm-backend:v5.27.1'
$volumeName = 'masar-osrm-jordan-data'
docker volume create $volumeName | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to create OSRM data volume' }
# Copy through Docker's API; no Windows directory sharing is required.
$copyContainer = docker create -v "${volumeName}:/data" $osrmImage /bin/true
if ($LASTEXITCODE -ne 0) { throw 'Failed to create data transfer container' }
try {
  docker cp $pbfPath "${copyContainer}:/data/jordan-latest.osm.pbf"
  if ($LASTEXITCODE -ne 0) { throw 'Failed to copy OSM data into Docker volume' }
} finally {
  docker rm $copyContainer | Out-Null
}
docker run --rm -v "${volumeName}:/data" $osrmImage osrm-extract --threads 2 -p /opt/car.lua /data/jordan-latest.osm.pbf
if ($LASTEXITCODE -ne 0) { throw 'OSRM extraction failed' }
docker run --rm -v "${volumeName}:/data" $osrmImage osrm-partition --threads 2 /data/jordan-latest.osrm
if ($LASTEXITCODE -ne 0) { throw 'OSRM partition failed' }
docker run --rm -v "${volumeName}:/data" $osrmImage osrm-customize --threads 2 /data/jordan-latest.osrm
if ($LASTEXITCODE -ne 0) { throw 'OSRM customization failed' }
Write-Host 'Routing data ready. Run docker compose up -d osrm'
