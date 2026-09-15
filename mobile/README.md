# CampusGuard — Student Mobile App

A native Expo (React Native) app for students — the mobile equivalent of the web app's
`/student` page. Same features, same backend, packaged as a real installable phone app instead
of a browser page:

- Sign in with your student account
- See your current status (INSIDE / OUTSIDE / SUSPENDED)
- **Generate Entry QR** — a short-lived QR to show a security officer at the gate
- **Scan to Exit** — use your phone's camera to scan the permanent exit QR posted at the gate
- View your entry/exit history

This is a separate project from the main Next.js app (its own `package.json`, its own
`node_modules`, its own TypeScript project — deliberately excluded from the root app's `tsconfig`
and ESLint config so the two never interfere with each other's type-checking). It talks to the
same backend over HTTP.

## Why a separate login endpoint

The web app authenticates with an httpOnly session cookie — a mobile app has no way to read that
cookie, so it needs the JWT itself. `POST /api/auth/mobile-login` (backend) returns the token in
the response body instead of a cookie; this app stores it in the device's secure storage
(`expo-secure-store`, i.e. iOS Keychain / Android Keystore — never `AsyncStorage`, which is
unencrypted) and sends it back as `Authorization: Bearer <token>` on every request. The web app's
own login/cookie flow is completely unchanged; this is an additive endpoint scoped to STUDENT
accounts only (see `src/app/api/auth/mobile-login/route.ts` in the main project).

## Setup

```bash
cd mobile
npm install
cp .env.example .env
```

Edit `.env` and set `EXPO_PUBLIC_API_URL` to your computer's **LAN IP address** (not
`localhost`) — see the comment in `.env.example` for how to find it. This matters because a
physical phone running Expo Go can't reach "localhost" on your computer; it needs your machine's
actual network address, and both devices need to be on the same Wi-Fi network.

Make sure the main backend is running first (`npm run dev` in the project root).

## Running it

```bash
npx expo start
```

This prints a QR code in the terminal. Install the **Expo Go** app on your phone (App Store /
Play Store), then:
- **Android**: open Expo Go, tap "Scan QR code", scan the terminal QR code
- **iOS**: scan the QR code with the regular Camera app, which will offer to open it in Expo Go

The app loads directly on your phone — no App Store submission, no Xcode/Android Studio required
for this kind of testing.

### Building a real installable app (APK/IPA)

Expo Go is for development. To produce something installable outside of Expo Go, use
[EAS Build](https://docs.expo.dev/build/introduction/) (`npx eas build`) — this requires a free
Expo account and runs the actual native build in the cloud. That step wasn't run as part of this
work (it needs your Expo account credentials), but the app is ready for it as-is.

## Project structure

```
mobile/
  App.tsx                     Root: AuthProvider + Login/Status screen switch
  src/
    context/AuthContext.tsx   Token storage, current-user state, login()/logout()
    lib/auth.ts                expo-secure-store wrapper
    lib/api.ts                  fetch wrapper — attaches the Bearer token, typed ApiError
    screens/LoginScreen.tsx
    screens/StatusScreen.tsx    Status, Generate Entry QR, Scan to Exit, History
    components/QrScannerModal.tsx   Full-screen camera QR scanner (expo-camera)
    theme.ts                    Shared colors/spacing matching the web app's design tokens
```

## What was verified in this build

- `npx tsc --noEmit` — clean (strict mode)
- `npx expo export --platform android` and `--platform ios` — both bundle successfully (908+
  modules resolved, no import/compile errors)
- The backend endpoints this app calls (`/api/auth/mobile-login`, and every existing endpoint via
  the new `Authorization: Bearer` support) were exercised directly against the running dev server
  and behave correctly — see the main project's `tests/unit/rbac.test.ts` for the automated
  coverage of the bearer-token auth path.

**Not verified** (no phone/simulator available in this environment): the actual on-device UI,
camera scanning behavior, and QR code rendering. Please run it via Expo Go on your own phone to
confirm those — the setup steps above are the fastest path to seeing it working.
