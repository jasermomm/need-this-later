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

Load `dist-extension` as an unpacked Chromium extension or as a temporary Firefox add-on. Store submissions require developer accounts and store-specific packaging/signing. The manifest requests no host permissions.

## Desktop

From the repository root:

```bash
cargo install tauri-cli --version "^2" --locked
npm run tauri -- build
```

Tauri’s `beforeBuildCommand` creates a relative static build. Windows builds require WebView2; Linux requires the distribution packages documented by Tauri; macOS signing/notarization requires Apple credentials. Unsigned CI artifacts should be labeled as such.

## Mobile

Build the relative PWA, then in `apps/mobile`:

```bash
npx cap add android
npx cap add ios
npm run sync
```

Open the generated native project with the corresponding script. The committed Android project already registers the `ShareIntent` Capacitor plugin and `SEND`/`SEND_MULTIPLE` filters; `android/gradlew assembleDebug` produces an unsigned development APK when an Android SDK is installed. The iOS share extension reference requires an App Group matching `group.app.needthislater.mobile` and must be added as an Xcode extension target. Windows cannot sign or compile iOS binaries.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm audit --omit=dev
```

Run the local interaction checklist from the README after a production build, not only through hot reload. Supabase tests require the local stack and `supabase test db`.
