# Threat model

## Assets

Saved item content, URLs, tags, filenames, attachment bytes, source context, vault keys, recovery keys, passwords, auth tokens, and local/remote availability are protected assets.

## Trust boundaries

- The user’s active device and application origin are trusted while uncompromised.
- Supabase Auth is trusted to authenticate accounts but not to keep item plaintext confidential.
- Supabase Database and Storage are untrusted ciphertext transports.
- Browser pages, captured text, URLs, filenames, imports, and sync payloads are untrusted input.
- GitHub, package registries, build runners, and dependency maintainers are supply-chain boundaries.

## Threats and mitigations

| Threat | Mitigation | Residual risk |
| --- | --- | --- |
| Stolen database/bucket | Client-side XChaCha20-Poly1305; wrapped random vault key | Metadata, sizes, timing, and password guessing remain |
| Cross-account access | RLS on every operation; UID-prefixed private objects; pgTAP tests | Provider/admin compromise can copy ciphertext |
| Compromised auth account | Vault password is separate from account password | Attacker can copy or delete ciphertext and attempt offline guessing |
| Brute-force vault password | Argon2id with per-vault salt; 10-character minimum; random master key | Weak user passwords remain guessable |
| XSS/stored HTML | React text rendering; no captured HTML execution; CSP; no `dangerouslySetInnerHTML` | Dependency/origin compromise can use in-memory keys |
| Malicious URLs | Only `http:`/`https:` become link items; external links use `noopener noreferrer` | User can still choose to visit a malicious site |
| Corrupt/replayed sync | AEAD authentication, purpose-bound AAD, schema validation, revisions, idempotent upsert | Availability attacks and old-ciphertext rollback by a malicious server are partly observable, not cryptographically prevented by a transparency log |
| Simultaneous edit | Same-revision divergence creates a conflict copy | Field-level merging is not attempted |
| Malicious filename/path traversal | Names are sanitized and never used as remote object paths | Download destination behavior is browser/OS controlled |
| Oversized attachment/import | 25 MiB per attachment, schema limits, authenticated restore | Large valid backups can still consume memory/storage |
| Extension compromise | Minimal permissions, strict extension CSP, no host permission, session-only vault key | Another privileged extension/browser compromise can read page or profile data |
| Secret leakage | `.env*` ignored except example; no service role; CodeQL, dependency review, secret scanning guidance | Developer workstation or CI secret-store compromise |
| Lost device | Encrypted backup and sync recovery key | Local-only data without backup is unrecoverable; unlocked device may expose active data |
| Dependency compromise | Lockfile, review, audit/CodeQL workflows, small crypto surface | JavaScript/Rust ecosystems remain a supply-chain risk |

## Explicit non-goals

The project does not claim protection against a fully compromised operating system, malicious firmware, a browser engine exploit, coercion, screen capture while unlocked, traffic-analysis anonymity, or a malicious build distributed under a trusted publisher identity.

## Release review checklist

- Search built output and git history for credentials and known test plaintext.
- Verify remote rows/objects are unreadable and plaintext fields are absent.
- Run wrong-password, corruption, recovery-key, backup round-trip, and two-device tests.
- Exercise User A/User B RLS and Storage isolation.
- Review changes to CSP, extension permissions, cryptographic parameters, format versions, and dependency tree.
- Confirm plaintext-export warnings and recovery-key acknowledgement remain visible.
