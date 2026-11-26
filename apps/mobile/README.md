# AMMAS app (Expo: web + Android APK)

One React Native / Expo codebase that runs in the browser and as an Android app. It talks to the same server as the web app (`apps/server`).

Screens: sign in, New order (menu, cart, **type-in quantity**, notes, discount, confirm, cash/UPI payment), Orders (header, sort, filters, paginator, order detail, cancel, complete), Kitchen (accept / ready), More (account, sign out). Reports, stock, menu prices and settings stay in the web app.

## 1. Server (one time)

The app signs in with a token instead of a cookie. For the **browser** version only, allow its address in `apps/server/.env`:

```
APP_ORIGINS=http://localhost:8081
```

(add your real web address too if you host the Expo web build, comma separated; restart the server). The Android app does not need this.

## 2. Install (one time per PC, from the repo root)

Needs Node 22.13+ (Expo SDK 58).

```powershell
npm run mobile:setup
```

No server address is set in the code. Type it on the app's sign-in screen (for example `http://192.168.1.10:4000`); it is saved on the device. To change it later, sign out and edit "Server address". `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` is optional and only pre-fills that box.

## 3. Run

```powershell
npm run mobile:web        # browser, http://localhost:8081
npm run mobile:android    # phone / emulator through Expo Go or a dev build
```

On a phone, the server must be reachable from the phone (`http://192.168.x.x:4000` on the shop Wi-Fi, not `localhost`).

## 4. Build the APK: two ways

### A. Cloud build (any PC, nothing to install)

```powershell
cd apps/mobile
npm i -g eas-cli          # once
eas login                 # once, with your own expo.dev account
npm run apk:cloud         # from the repo root:  npm run mobile:apk:cloud
```

Commit your changes first. It takes 10-20 minutes and prints a download link for the APK (also in the expo.dev dashboard).

The project belongs to one Expo account. For a teammate to build in the cloud, the owner must give their expo.dev account access to the project (expo.dev > the project > Access / Account settings > Members). Without that, the teammate uses the local build below.

### B. Local build (Windows PC, no Expo account)

One-time requirements on each PC:

1. **Android Studio**, opened once so it installs the Android SDK (it also provides Java).
2. **Node 22.13+** and `npm run mobile:setup` done.
3. **Windows long paths on + restart.** The script offers to do this for you (asks for Administrator permission). Manual way, in an Administrator PowerShell:
   ```powershell
   New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
   ```
   then restart Windows.
4. **CMake 3.31.6** in the Android SDK. The script installs it by itself; if it cannot: Android Studio > Settings > Languages & Frameworks > Android SDK > SDK Tools > tick "Show Package Details" > CMake > 3.31.6 > Apply.

Then:

```powershell
cd apps/mobile
.\build-apk.ps1
```

The script checks all of the above, fixes what it can and tells you what is missing. The first build takes 10+ minutes. Output: `apps/mobile/AMMAS.apk`. Copy it to the phone and open it, or `adb install -r AMMAS.apk`.

Why these steps: the Android native build creates file paths longer than Windows' default 260-character limit. Long paths must be on **and** the Android SDK's default CMake (3.22.1) is too old to use them, which is why 3.31.6 is needed. `app.config.js` asks for 3.31.6 only on Windows; cloud builds (Linux) keep the default. Details: https://docs.expo.dev/troubleshooting/windows-long-paths/

## 5. Web build (optional)

```powershell
npm run build:web      # output: apps/mobile/dist
```

Host `dist` on any static host and add its address to `APP_ORIGINS` on the server.

## Notes

- `apps/mobile` is not part of the root npm workspaces on purpose: Expo needs its own `node_modules`.
- Commit `apps/mobile/package-lock.json` so everyone (and the cloud build) installs the same versions.
- The Android build allows plain `http://` (shop Wi-Fi). Use an `https://` address when the server is on the internet.
- Printing: the server prints bills and kitchen tickets through the print bridge, so it works from the app. Browser-print mode is not available in the app.
- Live updates use refresh every few seconds (Orders 15 s, Kitchen 10 s) instead of the web app's socket connection.
- App icon: add a 1024x1024 `assets/icon.png` and set `"icon": "./assets/icon.png"` in `app.json`.
- Signed-in sessions last as long as the server allows (12 hours of inactivity); after that the app returns to the sign-in screen.
- Local build says "No Java found": install Android Studio, or `winget install EclipseAdoptium.Temurin.17.JDK`, reopen the terminal.
