# Self-hosting encrypted sync

Local Mode needs no server. These steps add optional cross-device transport.

## 1. Start Supabase

Use a hosted Supabase project or the open-source local stack. Install the Supabase CLI, then from the repository root:

```bash
supabase start
supabase db reset
supabase test db
```

`db reset` applies `supabase/migrations/20260808000000_encrypted_sync.sql`. It creates `vault_headers`, `encrypted_items`, their RLS policies, a private `encrypted-attachments` bucket, and object policies. The pgTAP file checks representative account-isolation cases.

## 2. Configure Auth

Enable email/password sign-up. Use a minimum authentication password length of ten characters. Set the Site URL and allowed redirects to the actual application origins. Decide whether email confirmation is required; when enabled, a new user must confirm before the app receives a session.

Do not enable public Storage access. Do not weaken RLS to work around a client error.

## 3. Configure the client

Copy `.env.example` to `.env.local` and set:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key
```

The anonymous key is intended for clients and is constrained by RLS. Never use `SUPABASE_SERVICE_ROLE_KEY`, database credentials, or a management token in a web, desktop, mobile, or extension build.

The Settings screen also accepts a Supabase URL and anonymous key at runtime, which is useful for a self-hosted build without defaults. The extension asks for the same endpoint when the user unlocks sync.

## 4. Verify isolation

Create two test accounts. With User A’s access token, verify that selecting, inserting, updating, and deleting User B’s UUID returns no rows or an RLS error. Repeat against object paths beginning with User B’s UUID. Inspect a database payload and downloaded object: neither should contain the test note, URL, filename, or attachment signature.

## 5. Deploy the app

For GitHub Pages, set repository Actions variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` only if a convenient default is desired. The app remains usable without them. The included workflow builds with the repository subpath.

For a custom origin, update Supabase Auth redirect allowlists and the application CSP `connect-src` policy. Serve HTTPS in production.

## Backups and operations

Supabase database/storage backups contain ciphertext but still expose metadata and should remain private. Retain vault headers with encrypted rows; losing a header prevents password/recovery-key unwrapping. Do not log request bodies. Monitor auth abuse and rate-limit password attempts through Supabase settings.
