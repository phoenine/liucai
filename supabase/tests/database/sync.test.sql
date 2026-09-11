begin;

create extension if not exists pgtap with schema extensions;
select plan(46);

select has_table('public', 'pages', 'pages table exists');
select has_table('public', 'highlights', 'highlights table exists');
select has_table('public', 'sync_mutations', 'sync_mutations table exists');
select has_table('public', 'sync_changes', 'sync_changes table exists');
select has_table('public', 'highlight_tombstones', 'highlight tombstones table exists');
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
  (select relrowsecurity from pg_class where oid = 'public.highlight_tombstones'::regclass),
  'highlight tombstones have RLS enabled'
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
  not has_table_privilege('authenticated', 'public.highlight_tombstones', 'SELECT'),
  'authenticated clients cannot directly read highlight tombstones'
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

select throws_ok(
  $sql$
    select public.apply_sync_batch(
      $json$
      [
        {
          "mutationId": "a0000000-0000-0000-0000-000000000005",
          "entityType": "page",
          "entityId": "30000000-0000-0000-0000-000000000003",
          "operation": "delete",
          "payload": {
            "id": "30000000-0000-0000-0000-000000000003",
            "canonicalUrl": "https://example.com/article",
            "originalUrl": "https://example.com/article?from=test",
            "title": "Example",
            "createdAt": "2026-09-09T00:00:00.000Z"
          }
        }
      ]
      $json$::jsonb,
      0,
      500
    )
  $sql$,
  '23514',
  'new row for relation "pages" violates check constraint "pages_deleted_at_null"',
  'page deletion is explicitly rejected instead of producing an unreadable tombstone'
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
          "mutationId": "a0000000-0000-0000-0000-000000000003",
          "entityType": "highlight",
          "entityId": "40000000-0000-0000-0000-000000000004",
          "operation": "delete",
          "payload": {
            "id": "40000000-0000-0000-0000-000000000004",
            "pageId": "30000000-0000-0000-0000-000000000003",
            "canonicalUrl": "https://example.com/article",
            "text": "Selected text",
            "color": "gold",
            "note": "A note",
            "tags": ["reading", "sync"],
            "selector": {"exact":"Selected text","prefix":"","suffix":"","start":0,"end":13},
            "createdAt": "2026-09-09T00:00:00.000Z",
            "updatedAt": "2026-09-11T00:00:00.000Z",
            "deletedAt": "2026-09-11T00:00:00.000Z"
          }
        }
      ]
      $json$::jsonb,
      2,
      500
    )
  $sql$,
  'a highlight delete mutation succeeds'
);

reset role;
select is(
  (select count(*) from public.highlights where id = '40000000-0000-0000-0000-000000000004'),
  0::bigint,
  'a deleted highlight is physically removed from the cloud table'
);
select is(
  (select operation from public.sync_changes where entity_id = '40000000-0000-0000-0000-000000000004' order by sequence desc limit 1),
  'delete',
  'the delete operation remains in the cross-device change log'
);
select ok(
  (select (payload ->> 'deletedAt') is not null
   from public.sync_changes
   where entity_id = '40000000-0000-0000-0000-000000000004'
   order by sequence desc
   limit 1),
  'the retained delete tombstone includes deletedAt'
);
select ok(
  (select not (payload ? 'text')
   from public.sync_changes
   where entity_id = '40000000-0000-0000-0000-000000000004'
   order by sequence desc
   limit 1),
  'the retained delete change does not keep highlight content'
);
select is(
  (select count(*) from public.highlight_tombstones where highlight_id = '40000000-0000-0000-0000-000000000004'),
  1::bigint,
  'one minimal tombstone is recorded for the deleted highlight'
);

update public.sync_mutations
set received_at = '2000-01-01T00:00:00Z'
where mutation_id = 'a0000000-0000-0000-0000-000000000001';

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
          "mutationId": "a0000000-0000-0000-0000-000000000004",
          "entityType": "highlight",
          "entityId": "40000000-0000-0000-0000-000000000004",
          "operation": "upsert",
          "payload": {
            "id": "40000000-0000-0000-0000-000000000004",
            "pageId": "30000000-0000-0000-0000-000000000003",
            "canonicalUrl": "https://example.com/article",
            "text": "Stale offline edit",
            "color": "mint",
            "note": "Must not resurrect",
            "tags": [],
            "selector": {"exact":"Stale offline edit","prefix":"","suffix":"","start":0,"end":18},
            "createdAt": "2026-09-09T00:00:00.000Z",
            "updatedAt": "2026-09-10T00:00:00.000Z"
          }
        }
      ]
      $json$::jsonb,
      0,
      500
    )
  $sql$,
  'a stale offline upsert is acknowledged without resurrecting the highlight'
);

reset role;
select is(
  (select count(*) from public.highlights where id = '40000000-0000-0000-0000-000000000004'),
  0::bigint,
  'the stale upsert does not recreate the highlight row'
);
select is(
  (select operation from public.sync_changes where entity_id = '40000000-0000-0000-0000-000000000004' order by sequence desc limit 1),
  'delete',
  'the stale upsert becomes a fresh delete change for the offline client'
);
select is(
  (select count(*) from public.highlight_tombstones where highlight_id = '40000000-0000-0000-0000-000000000004'),
  1::bigint,
  'reaffirming deletion does not create another tombstone row'
);
select is(
  (select count(*) from public.sync_mutations where mutation_id = 'a0000000-0000-0000-0000-000000000004'),
  1::bigint,
  'the stale mutation is recorded as processed and will not retry forever'
);
select is(
  (select count(*) from public.sync_changes),
  2::bigint,
  'the change log retains only the latest page and highlight snapshots'
);
select is(
  (select count(*) from public.sync_mutations where mutation_id = 'a0000000-0000-0000-0000-000000000001'),
  0::bigint,
  'a new mutation prunes receipts older than the 180-day idempotency window'
);

select * from finish();
rollback;
