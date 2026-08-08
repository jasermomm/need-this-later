# Desktop shell

The Tauri 2 shell packages the same local-first web application for Windows, macOS, and Linux. It registers `Cmd/Ctrl + Shift + Space` to show or hide the quick-capture window and exposes a tray icon. The web vault remains the source of truth; the desktop shell does not receive plaintext item data.

From the repository root, install Tauri CLI 2 and run `npm run tauri -- build`. The pre-build hook creates the relative static web bundle before the native installer is assembled.
