# Builds AMMAS.apk on this Windows PC (no Expo account needed). Safe to run on a teammate's PC: it checks every
# requirement, fixes what it can, and says exactly what to do for the rest.
#
# Usage:  .\build-apk.ps1
# The server address is typed in the app on the sign-in screen (saved on the device, can be changed any time).
# Optional: -Url only sets the address the sign-in screen starts with.
param([string]$Url = $env:EXPO_PUBLIC_API_URL)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$CMAKE = '3.31.6'   # must match app.config.js; its Ninja understands long Windows paths
$env:EXPO_PUBLIC_API_URL = if ($Url) { $Url.TrimEnd('/') } else { '' }
$env:NODE_ENV = 'production'
function Step($t) { Write-Host "`n== $t" -ForegroundColor Cyan }

# ---- 1. Node ----
Step 'Node'
$node = [version](node -p "process.versions.node")
if ($node -lt [version]'22.13.0') { throw "Node $node is too old for this Expo SDK. Install Node 22.13 or newer from nodejs.org." }
if (-not (Test-Path node_modules)) { throw 'Run .\setup.ps1 first (installs the packages).' }
Write-Host "Node $node"

# ---- 2. Windows long paths ----
Step 'Windows long paths'
function Get-LongPaths { try { return (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled -ErrorAction Stop).LongPathsEnabled } catch { return 0 } }
if ((Get-LongPaths) -ne 1) {
  Write-Host 'The Android native build needs Windows "long paths" turned on (one time per PC).' -ForegroundColor Yellow
  $ans = Read-Host 'Turn it on now? Asks for Administrator permission, then Windows must restart [Y/n]'
  if ($ans -eq '' -or $ans -match '^[Yy]') {
    $cmd = "New-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force | Out-Null"
    Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile', '-Command', $cmd
    throw 'Long paths are on now. Restart Windows, then run .\build-apk.ps1 again.'
  }
  throw 'Long paths are required. In an Administrator PowerShell run the command in the README (section "Build on this PC"), restart, and try again.'
}
Write-Host 'On'

# ---- 3. Java ----
Step 'Java'
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
if (-not $jdk) { throw "No Java (JDK) found. Install Android Studio, or run:  winget install EclipseAdoptium.Temurin.17.JDK  then reopen the terminal and run this again." }
$env:JAVA_HOME = $jdk
$env:Path = "$jdk\bin;$env:Path"
Write-Host $jdk

# ---- 4. Android SDK, licences, CMake ----
Step 'Android SDK'
$sdk = @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:LOCALAPPDATA 'Android\Sdk')) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $sdk) { throw 'Android SDK not found. Open Android Studio once and finish its setup wizard (SDK is normally C:\Users\<you>\AppData\Local\Android\Sdk).' }
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
Write-Host $sdk
$sm = Get-ChildItem (Join-Path $sdk 'cmdline-tools') -Directory -ErrorAction SilentlyContinue | ForEach-Object { Join-Path $_.FullName 'bin\sdkmanager.bat' } | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($sm) { (1..30 | ForEach-Object { 'y' }) | & $sm --licenses | Out-Null }
if (-not (Test-Path (Join-Path $sdk "cmake\$CMAKE\bin\ninja.exe"))) {
  if (-not $sm) { throw "CMake $CMAKE is missing. In Android Studio: Settings > Languages & Frameworks > Android SDK > SDK Tools > tick 'Show Package Details' > CMake > $CMAKE > Apply. Then run this again." }
  Write-Host "Installing CMake $CMAKE (one time, about 1 minute)..."
  & $sm "cmake;$CMAKE"
  if (-not (Test-Path (Join-Path $sdk "cmake\$CMAKE\bin\ninja.exe"))) { throw "Could not install CMake $CMAKE. Install it in Android Studio > SDK Tools (tick 'Show Package Details')." }
}
Write-Host "CMake $CMAKE ready"

# ---- 5. Generate the Android project ----
Step 'Prebuild'
$needsClean = (-not (Test-Path android\gradle.properties)) -or (-not (Select-String -Path android\gradle.properties -Pattern 'cmakeVersion' -Quiet))
if ($needsClean) { npx expo prebuild --platform android --no-install --clean } else { npx expo prebuild --platform android --no-install }
if ($LASTEXITCODE -ne 0) { throw 'expo prebuild failed.' }
if (-not (Select-String -Path android\gradle.properties -Pattern 'cmakeVersion' -Quiet)) { throw 'The CMake setting was not applied. Check that app.config.js is present and run again.' }
# tell Gradle where the SDK is (Windows paths need doubled backslashes in this file)
Set-Content -Path android\local.properties -Value ('sdk.dir=' + ($sdk -replace '\\', '\\')) -Encoding ASCII

# ---- 6. Build ----
Step 'Gradle (the first build takes 10+ minutes)'
Push-Location android
try { .\gradlew.bat assembleRelease; $code = $LASTEXITCODE } finally { Pop-Location }
if ($code -ne 0) {
  $log = Get-ChildItem android\app\build\intermediates\cxx -Recurse -Filter build_stderr_targets.txt -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($log -and (Select-String -Path $log.FullName -Pattern 'longer than 260' -Quiet)) {
    throw "The Windows 260-character path limit still applies. Check that you restarted Windows after enabling long paths, then delete android\app\.cxx and android\app\build and run again. Or build in the cloud:  npm run apk:cloud"
  }
  throw "Gradle build failed (exit $code). Read the first error above, or build in the cloud:  npm run apk:cloud"
}

$apk = Get-ChildItem android\app\build\outputs\apk\release\*.apk | Select-Object -First 1
if (-not $apk) { throw 'Build finished but no APK was found.' }
Copy-Item $apk.FullName .\AMMAS.apk -Force
Write-Host "`nDone: $PSScriptRoot\AMMAS.apk" -ForegroundColor Green
Write-Host 'Open the app, type the server address on the sign-in screen (for example http://192.168.1.10:4000), then sign in.'
Write-Host 'Install: copy it to the phone and open it, or run  adb install -r AMMAS.apk'
