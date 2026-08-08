# Building

## Requirements

- Node.js 22.13 or newer and npm
- Rust 1.77.2 or newer for desktop
- Supabase CLI and Docker for local RLS tests
- Android Studio/JDK 21 for Android
- macOS, Xcode, and an Apple signing identity for iOS or signed macOS artifacts

## Web worker and static PWA

```bash
npm ci
npm run build
npm run build:pages
```

The Vinext build outputs the Sites/Cloudflare-compatible worker under `dist`. The static PWA outputs `dist-pages` and defaults to `/need-this-later/`. For a root domain or native wrapper, set `BASE_PATH=/` or `BASE_PATH=./` respectively.

## Browser extension

```bash
npm run build:extension
```

Load `dist-extension` as an unpacked Chromium extension. Store submissions require developer accounts and store-specific packaging/signing. The manifest requests no host permissions. Firefox is not a supported target in `v1.0.0`.

## Desktop

From the repository root:

```bash
npm run tauri -- build
```

The npm lockfile supplies the Tauri CLI. Tauri’s `beforeBuildCommand` creates a relative static build. Windows builds require WebView2; Linux requires the distribution packages documented by Tauri; macOS signing/notarization requires Apple credentials. Unsigned CI artifacts should be labeled as such.

## Mobile

Build the relative PWA, then in `apps/mobile`:

```bash
npm run sync
```

The Android and iOS projects are already committed. Use `npx cap add android` or `npx cap add ios` only when regenerating a missing platform project from scratch.

Open the generated native project with the corresponding script. The committed Android project already registers the `ShareIntent` Capacitor plugin and `SEND`/`SEND_MULTIPLE` filters.

The Android debug build is signed with the Android debug key and is only for development. `android/gradlew assembleRelease` produces an unsigned release APK unless `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD` are provided. The release workflow supplies those values through GitHub Actions secrets and publishes a release-key-signed APK.

The iOS source remains a reference implementation and is not distributed as a native binary in `v1.0.0`. Apple mobile devices should use the hosted PWA. Windows cannot compile or sign iOS binaries.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm audit --omit=dev
```

Run the local interaction checklist from the README after a production build, not only through hot reload. Supabase tests require the local stack and `supabase test db`.
