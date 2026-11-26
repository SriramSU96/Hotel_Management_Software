# Builds AMMAS.apk on this PC (no Expo account needed).
# Usage:  .\build-apk.ps1
# The server address is typed in the app on the sign-in screen (saved on the device, can be changed any time).
# Optional: -Url sets only the address the sign-in screen starts with.
param([string]$Url = $env:EXPO_PUBLIC_API_URL)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$env:EXPO_PUBLIC_API_URL = if ($Url) { $Url.TrimEnd('/') } else { '' }
$env:NODE_ENV = 'production'

# Java: use the one bundled with Android Studio unless JAVA_HOME is already set
if (-not $env:JAVA_HOME) {
  $jbr = 'C:\Program Files\Android\Android Studio\jbr'
  if (Test-Path $jbr) { $env:JAVA_HOME = $jbr } else { throw 'Install Android Studio (it includes Java), or set JAVA_HOME to a JDK 21.' }
}
if (-not $env:ANDROID_HOME -and -not $env:ANDROID_SDK_ROOT) {
  $sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
  if (Test-Path $sdk) { $env:ANDROID_HOME = $sdk } else { throw 'Android SDK not found. Open Android Studio once and finish its setup wizard.' }
}

if (-not (Test-Path node_modules)) { throw 'Run .\setup.ps1 first.' }
npx expo prebuild --platform android --no-install
Push-Location android
try { .\gradlew.bat assembleRelease } finally { Pop-Location }

$apk = Get-ChildItem android\app\build\outputs\apk\release\*.apk | Select-Object -First 1
if (-not $apk) { throw 'Build finished but no APK was found.' }
Copy-Item $apk.FullName .\AMMAS.apk -Force
Write-Host "`nDone: $PSScriptRoot\AMMAS.apk" -ForegroundColor Green
Write-Host 'Open the app, type the server address on the sign-in screen (for example http://192.168.1.10:4000), then sign in.'
Write-Host 'Install: copy it to the phone and open it, or run  adb install -r AMMAS.apk'
