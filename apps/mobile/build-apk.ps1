# Builds AMMAS.apk on this PC (no Expo account needed).
# Usage:  .\build-apk.ps1
# The server address is typed in the app on the sign-in screen (saved on the device, can be changed any time).
# Optional: -Url sets only the address the sign-in screen starts with.
param([string]$Url = $env:EXPO_PUBLIC_API_URL)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$env:EXPO_PUBLIC_API_URL = if ($Url) { $Url.TrimEnd('/') } else { '' }
$env:NODE_ENV = 'production'

# ---- Java: find a working JDK (a wrong JAVA_HOME in Windows settings is ignored for this build) ----
function Test-Jdk($p) { return [bool]($p -and (Test-Path (Join-Path $p 'bin\java.exe'))) }
function Find-Jdk {
  $c = @()
  if ($env:JAVA_HOME) { $c += $env:JAVA_HOME }
  $c += 'C:\Program Files\Android\Android Studio\jbr'
  $c += (Join-Path $env:LOCALAPPDATA 'Programs\Android Studio\jbr')
  foreach ($root in 'C:\Program Files\Android', 'C:\Program Files\Java', 'C:\Program Files\Eclipse Adoptium', 'C:\Program Files\Microsoft', 'C:\Program Files\Zulu', 'C:\Program Files\Amazon Corretto') {
    if (Test-Path $root) { Get-ChildItem $root -Directory -ErrorAction SilentlyContinue | ForEach-Object { $c += $_.FullName; $c += (Join-Path $_.FullName 'jbr') } }
  }
  $tb = Join-Path $env:LOCALAPPDATA 'JetBrains\Toolbox\apps\AndroidStudio'
  if (Test-Path $tb) { Get-ChildItem $tb -Recurse -Directory -Filter jbr -ErrorAction SilentlyContinue | ForEach-Object { $c += $_.FullName } }
  $j = Get-Command java -ErrorAction SilentlyContinue
  if ($j) { $c += (Split-Path (Split-Path $j.Source)) }
  return ($c | Where-Object { Test-Jdk $_ } | Select-Object -First 1)
}
$jdk = Find-Jdk
if (-not $jdk) {
  throw "No Java (JDK) found. Install one, close and reopen the terminal, and run this again:`n  winget install EclipseAdoptium.Temurin.17.JDK`n(or in Android Studio: Settings > Build Tools > Gradle shows the JDK it uses)"
}
$env:JAVA_HOME = $jdk
$env:Path = "$jdk\bin;$env:Path"
Write-Host "Java: $jdk" -ForegroundColor Cyan

# ---- Android SDK ----
$sdk = @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:LOCALAPPDATA 'Android\Sdk')) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $sdk) { throw 'Android SDK not found. Open Android Studio once and finish its setup wizard (the SDK is normally C:\Users\<you>\AppData\Local\Android\Sdk).' }
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
Write-Host "Android SDK: $sdk" -ForegroundColor Cyan
# accept the SDK licences once so Gradle can download what it needs
$sm = Join-Path $sdk 'cmdline-tools\latest\bin\sdkmanager.bat'
if (Test-Path $sm) { (1..30 | ForEach-Object { 'y' }) | & $sm --licenses | Out-Null }

if (-not (Test-Path node_modules)) { throw 'Run .\setup.ps1 first.' }
npx expo prebuild --platform android --no-install
if ($LASTEXITCODE -ne 0) { throw 'expo prebuild failed.' }

# tell Gradle where the SDK is (Windows paths need doubled backslashes in this file)
Set-Content -Path android\local.properties -Value ('sdk.dir=' + ($sdk -replace '\\', '\\')) -Encoding ASCII

Push-Location android
try { .\gradlew.bat assembleRelease; $code = $LASTEXITCODE } finally { Pop-Location }
if ($code -ne 0) {
  $log = Get-ChildItem android\app\build\intermediates\cxx -Recurse -Filter build_stderr_targets.txt -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($log -and (Select-String -Path $log.FullName -Pattern 'longer than 260' -Quiet)) {
    throw "Windows' 260-character path limit stopped the native build (React Native paths are longer than that, even at the drive root).`nEasiest fix: build in the cloud, no Android tools needed:  eas login  then  npm run apk:cloud`n(Local alternative, not verified: enable Windows long paths in an admin PowerShell, restart, and install CMake 3.31 from Android Studio > SDK Manager > SDK Tools.)"
  }
  throw "Gradle build failed (exit $code). Read the first error above."
}

$apk = Get-ChildItem android\app\build\outputs\apk\release\*.apk | Select-Object -First 1
if (-not $apk) { throw 'Build finished but no APK was found.' }
Copy-Item $apk.FullName .\AMMAS.apk -Force
Write-Host "`nDone: $PSScriptRoot\AMMAS.apk" -ForegroundColor Green
Write-Host 'Open the app, type the server address on the sign-in screen (for example http://192.168.1.10:4000), then sign in.'
Write-Host 'Install: copy it to the phone and open it, or run  adb install -r AMMAS.apk'
