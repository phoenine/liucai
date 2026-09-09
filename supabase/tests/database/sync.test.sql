begin;

create extension if not exists pgtap with schema extensions;
select plan(29);

select has_table('public', 'pages', 'pages table exists');
select has_table('public', 'highlights', 'highlights table exists');
select has_table('public', 'sync_mutations', 'sync_mutations table exists');
select has_table('public', 'sync_changes', 'sync_changes table exists');
select has_function(
  'public',
  'apply_sync_batch',
  array['jsonb', 'bigint', 'integer'],
  'sync RPC exists'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.pages'::regclass),
  'pages has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.highlights'::regclass),
  'highlights has RLS enabled'
);
select ok(
  not has_table_privilege('authenticated', 'public.pages', 'INSERT'),
  'authenticated clients cannot directly insert pages'
);
select ok(
  not has_table_privilege('authenticated', 'public.highlights', 'UPDATE'),
  'authenticated clients cannot directly update highlights'
);
select ok(
  not has_function_privilege('anon', 'public.apply_sync_batch(jsonb,bigint,integer)', 'EXECUTE'),
  'anonymous clients cannot execute the sync RPC'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'one@example.com',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '20000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'two@example.com',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $sql$
    select public.apply_sync_batch(
      $json$
      [
        {
          "mutationId": "a0000000-0000-0000-0000-000000000001",
          "entityType": "page",
          "entityId": "30000000-0000-0000-0000-000000000003",
          "operation": "upsert",
          "payload": {
            "id": "30000000-0000-0000-0000-000000000003",
            "userId": "20000000-0000-0000-0000-000000000002",
            "canonicalUrl": "https://example.com/article",
            "originalUrl": "https://example.com/article?from=test",
            "title": "Example",
            "createdAt": "2026-09-09T00:00:00.000Z"
          }
        },
        {
          "mutationId": "a0000000-0000-0000-0000-000000000002",
          "entityType": "highlight",
          "entityId": "40000000-0000-0000-0000-000000000004",
          "operation": "upsert",
          "payload": {
            "id": "40000000-0000-0000-0000-000000000004",
            "pageId": "30000000-0000-0000-0000-000000000003",
            "canonicalUrl": "https://example.com/article",
            "text": "Selected text",
            "color": "gold",
            "note": "A note",
            "tags": ["reading", "sync"],
            "selector": {
              "exact": "Selected text",
              "prefix": "",
              "suffix": "",
              "start": 0,
              "end": 13
            },
            "createdAt": "2026-09-09T00:00:00.000Z"
          }
        }
      ]
      $json$::jsonb,
      0,
      500
    )
  $sql$,
  'an authenticated user can atomically upload a page and highlight'
);

reset role;

select is((select count(*) from public.pages), 1::bigint, 'one page was created');
select is((select count(*) from public.highlights), 1::bigint, 'one highlight was created');
select is((select count(*) from public.sync_changes), 2::bigint, 'two ordered changes were recorded');
select is((select count(*) from public.sync_mutations), 2::bigint, 'two mutation receipts were recorded');
select ok(
  (select bool_and(revision = sequence) from public.sync_changes),
  'server revisions match their change sequences'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select is(
  jsonb_array_length(public.apply_sync_batch('[]'::jsonb, 0, 1) -> 'changes'),
  1,
  'pull honors the requested batch limit'
);
select is(
  (public.apply_sync_batch('[]'::jsonb, 0, 1) ->> 'hasMore')::boolean,
  true,
  'pull reports more changes after a limited batch'
);

select lives_ok(
  $sql$
    select public.apply_sync_batch(
      $json$
      [
        {
          "mutationId": "a0000000-0000-0000-0000-000000000001",
          "entityType": "page",
          "entityId": "30000000-0000-0000-0000-000000000003",
          "operation": "upsert",
          "payload": {
            "id": "30000000-0000-0000-0000-000000000003",
            "canonicalUrl": "https://example.com/article",
            "originalUrl": "https://example.com/article?from=test",
            "title": "Example",
            "createdAt": "2026-09-09T00:00:00.000Z"
          }
        },
        {
          "mutationId": "a0000000-0000-0000-0000-000000000002",
          "entityType": "highlight",
          "entityId": "40000000-0000-0000-0000-000000000004",
          "operation": "upsert",
          "payload": {
            "id": "40000000-0000-0000-0000-000000000004",
            "canonicalUrl": "https://example.com/article",
            "text": "Selected text",
            "color": "gold",
            "note": "A note",
            "tags": ["reading", "sync"],
            "selector": {"exact":"Selected text","prefix":"","suffix":"","start":0,"end":13},
            "createdAt": "2026-09-09T00:00:00.000Z"
          }
        }
      ]
      $json$::jsonb,
      0,
      500
    )
  $sql$,
  'replaying an acknowledged mutation batch succeeds'
);

reset role;
select is((select count(*) from public.sync_changes), 2::bigint, 'replay does not duplicate changes');
select is((select count(*) from public.sync_mutations), 2::bigint, 'replay does not duplicate receipts');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select is((select count(*) from public.pages), 0::bigint, 'RLS hides another user''s pages');
select is(
  jsonb_array_length(public.apply_sync_batch('[]'::jsonb, 0, 500) -> 'changes'),
  0,
  'sync RPC does not return another user''s changes'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $sql$
    select public.apply_sync_batch(
      $json$
      [
        {
          "mutationId": "b0000000-0000-0000-0000-000000000001",
          "entityType": "page",
          "entityId": "50000000-0000-0000-0000-000000000005",
          "operation": "upsert",
          "payload": {
            "id": "50000000-0000-0000-0000-000000000005",
            "canonicalUrl": "https://example.com/rollback",
            "originalUrl": "https://example.com/rollback",
            "title": "Must roll back",
            "createdAt": "2026-09-09T00:00:00.000Z"
          }
        },
        {
          "mutationId": "b0000000-0000-0000-0000-000000000002",
          "entityType": "highlight",
          "entityId": "60000000-0000-0000-0000-000000000006",
          "operation": "upsert",
          "payload": {
            "id": "60000000-0000-0000-0000-000000000006",
            "canonicalUrl": "https://example.com/rollback",
            "text": "Invalid color",
            "color": "blue",
            "note": "",
            "tags": [],
            "selector": {"exact":"Invalid color","prefix":"","suffix":"","start":0,"end":13},
            "createdAt": "2026-09-09T00:00:00.000Z"
          }
        }
      ]
      $json$::jsonb,
      0,
      500
    )
  $sql$,
  '22023',
  'highlight color is invalid',
  'an invalid mutation rejects the complete batch'
);

reset role;
select is(
  (select count(*) from public.pages where canonical_url = 'https://example.com/rollback'),
  0::bigint,
  'a rejected batch rolls back earlier business writes'
);
select is(
  (select count(*) from public.sync_mutations where mutation_id::text like 'b0000000-%'),
  0::bigint,
  'a rejected batch rolls back mutation receipts'
);
select is(
  (select count(*) from public.sync_changes),
  2::bigint,
  'a rejected batch does not append change-log entries'
);
select ok(
  (select max(sequence) > min(sequence) from public.sync_changes),
  'change sequences are monotonically ordered'
);
select is(
  (select count(*) from public.pages where user_id = '20000000-0000-0000-0000-000000000002'),
  0::bigint,
  'sync never assigns records to a payload-supplied user'
);

select * from finish();
rollback;
