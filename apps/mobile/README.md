# AMMAS app (Expo: web + Android APK)

One React Native / Expo codebase that runs in the browser and as an Android app. It talks to the same server as the web app (`apps/server`).

Screens: sign in, New order (menu, cart, **type-in quantity**, notes, discount, confirm, cash/UPI payment), Orders (header, sort, filters, paginator, order detail, cancel, complete), Kitchen (accept / ready), More (account, sign out). Reports, stock, menu prices and settings stay in the web app.

## 1. Server (one time)

The app signs in with a token instead of a cookie. The server already supports it after this change. For the **browser** version only, allow its address in `apps/server/.env`:

```
APP_ORIGINS=http://localhost:8081
```

(add your real web address too if you host the Expo web build, comma separated; restart the server). The Android app does not need this.

## 2. Install (one time, from the repo root)

Needs Node 22.13+ (Expo SDK 58).

```powershell
npm run mobile:setup
```

No address needs to be set in the code. Type it on the app's sign-in screen (for example `http://192.168.1.10:4000`); it is saved on the device. To change it later, sign out and edit "Server address". `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` is optional and only pre-fills that box.

## 3. Run

```powershell
npm run mobile:web        # browser, http://localhost:8081
npm run mobile:android    # phone / emulator through Expo Go or a dev build
```

On a phone, the server must be reachable from the phone (`http://192.168.x.x:4000` on the shop Wi-Fi, not `localhost`).

## 4. Build the APK

No account, on this PC (needs Android Studio, it provides Java and the SDK):

```powershell
cd apps/mobile
.\build-apk.ps1
```

Output: `apps/mobile/AMMAS.apk`. Copy it to the phone and open it, or `adb install -r AMMAS.apk`.

Or in the cloud (free Expo account, no Android tools needed):

```powershell
npm i -g eas-cli
eas login
npm run apk:cloud
```

## 5. Web build (optional)

```powershell
npm run build:web      # output: apps/mobile/dist
```

Host `dist` on any static host and add its address to `APP_ORIGINS` on the server.

## Notes

- `apps/mobile` is not part of the root npm workspaces on purpose: Expo needs its own `node_modules`.
- The Android build allows plain `http://` (shop Wi-Fi). Use an `https://` address when the server is on the internet.
- Printing: the server prints bills and kitchen tickets through the print bridge, so it works from the app. Browser-print mode is not available in the app.
- Live updates use refresh every few seconds (Orders 15 s, Kitchen 10 s) instead of the web app's socket connection.
- App icon: add a 1024x1024 `assets/icon.png` and set `"icon": "./assets/icon.png"` in `app.json`.
- Signed-in sessions last as long as the server allows (12 hours of inactivity); after that the app returns to the sign-in screen.
