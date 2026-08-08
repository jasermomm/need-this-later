# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow semantic versioning.

## [1.0.0] - 2026-08-08

### Added

- Capture-first local PWA with encrypted IndexedDB persistence.
- Notes, links, images, files, tags, reminders, pin/archive/trash, and undo.
- Unicode-aware local search and lightweight domain resurfacing.
- Portable exports and Argon2id/XChaCha20-Poly1305 encrypted backups.
- Optional Supabase Auth, encrypted sync, recovery keys, conflict preservation, tombstones, and attachment transport.
- Chromium extension, Tauri 2 desktop shell, and Capacitor mobile architecture.
- Supabase migrations, Row Level Security policies, storage policies, and pgTAP isolation checks.
- Automated unit, integration, crypto compatibility, backup, and two-device sync tests.
- GitHub Actions for quality checks, Pages deployment, CodeQL, and release artifacts.

### Fixed

- Release-key-signed Android production APK packaging with consistent `1.0.0` metadata.
- Reliable PWA offline precaching and network-first navigation updates for hashed application shells.
- Reproducible Rust dependency resolution through a committed lockfile.
- Browser extension documentation narrowed to the verified Chromium target.
