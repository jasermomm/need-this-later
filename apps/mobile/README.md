# Mobile shell

The Capacitor shell uses the static PWA build from `dist-pages`, so Local Mode, encrypted IndexedDB, backups, and sync compatibility are shared with the web app. Run the root Pages build before `npm run sync` in this directory.

Android and iOS share-extension reference implementations live in `native-share/`. Android can be built on Windows, macOS, or Linux after `cap add android`; iOS project generation and signing require macOS/Xcode. The PWA Web Share Target remains the no-store alternative on supported mobile browsers.
