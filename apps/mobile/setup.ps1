# One-time setup: installs the packages at the versions that match the Expo SDK in package.json.
# Usage:  .\setup.ps1      (needs Node 22.13 or newer)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$v = [version](node -p "process.versions.node")
if ($v -lt [version]'22.13.0') { throw "Node $v is too old for this Expo SDK. Install Node 22.13+ (nodejs.org) and run this again." }

npm install --legacy-peer-deps
# Expo picks the exact versions that belong to this SDK
npx expo install expo-status-bar expo-secure-store expo-build-properties react-native-safe-area-context react-native-web react-dom "@expo/metro-runtime"
npm install --legacy-peer-deps @tanstack/react-query zustand
npm install --legacy-peer-deps -D typescript "@types/react"
npx expo install --fix

if (-not (Test-Path .env)) { Copy-Item .env.example .env; Write-Host 'Created .env (optional: it only pre-fills the server address; you can type it in the app).' -ForegroundColor Yellow }
Write-Host "`nDone. Next:  npm run web   (browser)   or   npm run android" -ForegroundColor Green
