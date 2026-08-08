# Contributing

Contributions are welcome when they preserve the product priorities: reliability, privacy, instant capture, retrieval, cross-device usefulness, and simplicity—in that order.

## Development

1. Use Node.js 22.13 or newer and install with `npm ci`.
2. Create a focused branch.
3. Add tests for behavioral or security changes.
4. Run `npm run lint`, `npm run typecheck`, `npm test`, and the relevant production build.
5. Explain user impact, privacy impact, and migration impact in the pull request.

Never commit `.env` files, Supabase service-role keys, access tokens, recovery keys, real user exports, signing credentials, or local databases.

## Design constraints

- The default route stays a ready-to-type capture surface.
- Account creation, tags, folders, and content-type choices may not block Local Mode capture.
- Local writes must finish without waiting for sync.
- Plaintext search indexes or item content may not be sent to a server.
- Captured HTML is rendered as text, never executed.
- New extension permissions require a concrete threat-model update.

## Crypto and sync changes

Do not invent primitives or silently change an encoded format. Changes require test vectors, migration/versioning notes, corruption tests, and review from someone other than the author. Prefer preserving both versions of a conflict to choosing a lossy merge.

Use the security issue process in [SECURITY.md](SECURITY.md) for vulnerabilities, not a public issue.
