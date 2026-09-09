# Liucai Supabase database

This directory contains the reproducible database contract for Liucai remote sync.
It contains no Supabase secret key, database password, access token, or user data.

## Optional local verification

The production service is the hosted Supabase project. A local Supabase stack is
not required to run the extension; it is only an optional isolated environment for
testing migrations and RLS. Docker must be running if you choose to use it.

```bash
npm run supabase:start
npm run supabase:reset
npm run supabase:test
npm run supabase:lint
npm run supabase:stop
```

The local stack is for development only and must not be exposed to external traffic.

## Link and deploy

Authenticate using the Supabase CLI's browser login, then link this checkout to the
remote project. The link state is kept under the ignored `supabase/.temp/` folder.

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push --dry-run
npx supabase db push
```

Use the database password when the CLI requests it. Do not substitute a publishable
or secret API key for the database password. Never commit credentials to this folder.

## Security boundary

- Authenticated clients can select only their own `pages`, `highlights`, and
  `sync_changes` rows through RLS.
- Clients cannot directly insert, update, or delete sync tables.
- Mutations are accepted only through `apply_sync_batch`, which derives `user_id`
  from `auth.uid()` and ignores any user identifier supplied in a payload.
- The function is `security definer` with an empty search path and explicit schema
  qualification.
