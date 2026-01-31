
$ErrorActionPreference = "Stop"

$env:GITHUB_USERNAME = $env:GITHUB_USERNAME -or "Madhan-1000"

if (-not $env:GITHUB_TOKEN) {
	Write-Warning "GITHUB_TOKEN not set. You may hit GitHub rate limits. Set a token locally or rely on the scheduled workflow."
}

Write-Host "Rendering assets locally..."
node "$PSScriptRoot/scripts/render-assets.js"
Write-Host "Assets rendered under $PSScriptRoot/assets"
