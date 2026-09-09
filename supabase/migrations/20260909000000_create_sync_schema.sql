create sequence public.sync_sequence as bigint;

create table public.pages (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  canonical_url text not null,
  original_url text not null,
  title text not null default '',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  revision bigint not null,
  constraint pages_canonical_url_length check (char_length(canonical_url) between 1 and 8192),
  constraint pages_original_url_length check (char_length(original_url) between 1 and 8192),
  constraint pages_title_length check (char_length(title) <= 4096),
  constraint pages_revision_positive check (revision > 0),
  constraint pages_user_canonical_unique unique (user_id, canonical_url)
);

create table public.highlights (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  page_id uuid not null references public.pages (id),
  canonical_url text not null,
  text text not null,
  color text not null,
  note text not null default '',
  tags text[] not null default '{}'::text[],
  selector jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  revision bigint not null,
  constraint highlights_canonical_url_length check (char_length(canonical_url) between 1 and 8192),
  constraint highlights_text_length check (char_length(text) between 1 and 1048576),
  constraint highlights_note_length check (char_length(note) <= 1048576),
  constraint highlights_color_valid check (color in ('gold', 'mint', 'coral')),
  constraint highlights_tags_count check (cardinality(tags) <= 100),
  constraint highlights_selector_object check (jsonb_typeof(selector) = 'object'),
  constraint highlights_revision_positive check (revision > 0)
);

create table public.sync_mutations (
  user_id uuid not null references auth.users (id) on delete cascade,
  mutation_id uuid not null,
  sequence bigint not null,
  received_at timestamptz not null default now(),
  primary key (user_id, mutation_id)
);

create table public.sync_changes (
  sequence bigint primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  operation text not null,
  revision bigint not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint sync_changes_entity_type_valid check (entity_type in ('page', 'highlight')),
  constraint sync_changes_operation_valid check (operation in ('upsert', 'delete')),
  constraint sync_changes_revision_matches_sequence check (revision = sequence)
);

create index pages_user_updated_idx on public.pages (user_id, updated_at);
create index highlights_user_canonical_idx on public.highlights (user_id, canonical_url);
create index highlights_user_updated_idx on public.highlights (user_id, updated_at);
create index highlights_user_deleted_idx on public.highlights (user_id, deleted_at)
  where deleted_at is not null;
create index sync_changes_user_sequence_idx on public.sync_changes (user_id, sequence);

alter table public.pages enable row level security;
alter table public.highlights enable row level security;
alter table public.sync_mutations enable row level security;
alter table public.sync_changes enable row level security;

create policy pages_select_own
  on public.pages
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy highlights_select_own
  on public.highlights
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy sync_changes_select_own
  on public.sync_changes
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.pages from anon, authenticated;
revoke all on table public.highlights from anon, authenticated;
revoke all on table public.sync_mutations from anon, authenticated;
revoke all on table public.sync_changes from anon, authenticated;
revoke all on sequence public.sync_sequence from anon, authenticated;

grant select on table public.pages to authenticated;
grant select on table public.highlights to authenticated;
grant select on table public.sync_changes to authenticated;

create or replace function public.apply_sync_batch(
  p_mutations jsonb default '[]'::jsonb,
  p_after_sequence bigint default 0,
  p_batch_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_mutation jsonb;
  v_mutation_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_operation text;
  v_payload jsonb;
  v_revision bigint;
  v_now timestamptz;
  v_created_at timestamptz;
  v_page public.pages%rowtype;
  v_highlight public.highlights%rowtype;
  v_page_id uuid;
  v_tags text[];
  v_change_payload jsonb;
  v_acknowledged jsonb := '[]'::jsonb;
  v_changes jsonb;
  v_next_cursor bigint;
  v_has_more boolean;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if jsonb_typeof(p_mutations) <> 'array' then
    raise exception using errcode = '22023', message = 'mutations must be a JSON array';
  end if;
  if jsonb_array_length(p_mutations) > 100 then
    raise exception using errcode = '22023', message = 'mutation batch exceeds 100 items';
  end if;
  if p_after_sequence < 0 then
    raise exception using errcode = '22023', message = 'after_sequence must be non-negative';
  end if;
  if p_batch_limit < 1 or p_batch_limit > 1000 then
    raise exception using errcode = '22023', message = 'batch_limit must be between 1 and 1000';
  end if;

  for v_mutation in
    select item from jsonb_array_elements(p_mutations) as mutations(item)
  loop
    if jsonb_typeof(v_mutation) <> 'object' then
      raise exception using errcode = '22023', message = 'each mutation must be a JSON object';
    end if;

    begin
      v_mutation_id := nullif(v_mutation ->> 'mutationId', '')::uuid;
      v_entity_id := nullif(v_mutation ->> 'entityId', '')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'mutationId and entityId must be UUIDs';
    end;
    if v_mutation_id is null or v_entity_id is null then
      raise exception using errcode = '22023', message = 'mutationId and entityId are required';
    end if;

    v_entity_type := v_mutation ->> 'entityType';
    v_operation := v_mutation ->> 'operation';
    v_payload := v_mutation -> 'payload';
    if v_entity_type not in ('page', 'highlight') then
      raise exception using errcode = '22023', message = 'unsupported entityType';
    end if;
    if v_operation not in ('upsert', 'delete') then
      raise exception using errcode = '22023', message = 'unsupported operation';
    end if;
    if jsonb_typeof(v_payload) <> 'object' then
      raise exception using errcode = '22023', message = 'payload must be a JSON object';
    end if;
    if v_payload ? 'id' and nullif(v_payload ->> 'id', '')::uuid <> v_entity_id then
      raise exception using errcode = '22023', message = 'payload id must match entityId';
    end if;

    if exists (
      select 1
      from public.sync_mutations
      where user_id = v_user_id and mutation_id = v_mutation_id
    ) then
      v_acknowledged := v_acknowledged || jsonb_build_array(v_mutation_id::text);
      continue;
    end if;

    v_now := clock_timestamp();
    v_revision := nextval('public.sync_sequence');

    begin
      v_created_at := coalesce(nullif(v_payload ->> 'createdAt', '')::timestamptz, v_now);
    exception when invalid_datetime_format then
      raise exception using errcode = '22023', message = 'createdAt must be an ISO timestamp';
    end;

    if v_entity_type = 'page' then
      if coalesce(v_payload ->> 'canonicalUrl', '') = '' then
        raise exception using errcode = '22023', message = 'page canonicalUrl is required';
      end if;
      if coalesce(v_payload ->> 'originalUrl', '') = '' then
        raise exception using errcode = '22023', message = 'page originalUrl is required';
      end if;
      if exists (
        select 1 from public.pages where id = v_entity_id and user_id <> v_user_id
      ) then
        raise exception using errcode = '23505', message = 'entity id is unavailable';
      end if;

      insert into public.pages (
        id,
        user_id,
        canonical_url,
        original_url,
        title,
        created_at,
        updated_at,
        deleted_at,
        revision
      ) values (
        v_entity_id,
        v_user_id,
        v_payload ->> 'canonicalUrl',
        v_payload ->> 'originalUrl',
        coalesce(v_payload ->> 'title', ''),
        v_created_at,
        v_now,
        case when v_operation = 'delete' then v_now else null end,
        v_revision
      )
      on conflict (user_id, canonical_url) do update set
        original_url = excluded.original_url,
        title = excluded.title,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at,
        revision = excluded.revision
      returning * into v_page;

      v_entity_id := v_page.id;
      v_change_payload := jsonb_build_object(
        'id', v_page.id,
        'canonicalUrl', v_page.canonical_url,
        'originalUrl', v_page.original_url,
        'title', v_page.title,
        'createdAt', v_page.created_at,
        'updatedAt', v_page.updated_at,
        'deletedAt', v_page.deleted_at,
        'revision', v_page.revision
      );
    else
      if coalesce(v_payload ->> 'canonicalUrl', '') = '' then
        raise exception using errcode = '22023', message = 'highlight canonicalUrl is required';
      end if;
      select id into v_page_id
      from public.pages
      where user_id = v_user_id
        and canonical_url = v_payload ->> 'canonicalUrl'
        and deleted_at is null;
      if v_page_id is null then
        raise exception using errcode = '23503', message = 'highlight page does not exist';
      end if;
      if coalesce(v_payload ->> 'text', '') = '' then
        raise exception using errcode = '22023', message = 'highlight text is required';
      end if;
      if coalesce(v_payload ->> 'color', '') not in ('gold', 'mint', 'coral') then
        raise exception using errcode = '22023', message = 'highlight color is invalid';
      end if;
      if jsonb_typeof(v_payload -> 'selector') <> 'object' then
        raise exception using errcode = '22023', message = 'highlight selector must be an object';
      end if;
      if jsonb_typeof(coalesce(v_payload -> 'tags', '[]'::jsonb)) <> 'array' then
        raise exception using errcode = '22023', message = 'highlight tags must be an array';
      end if;
      select coalesce(array_agg(tag), '{}'::text[]) into v_tags
      from jsonb_array_elements_text(coalesce(v_payload -> 'tags', '[]'::jsonb)) as tags(tag);
      if cardinality(v_tags) > 100 then
        raise exception using errcode = '22023', message = 'highlight tags exceed 100 items';
      end if;

      insert into public.highlights (
        id,
        user_id,
        page_id,
        canonical_url,
        text,
        color,
        note,
        tags,
        selector,
        created_at,
        updated_at,
        deleted_at,
        revision
      ) values (
        v_entity_id,
        v_user_id,
        v_page_id,
        v_payload ->> 'canonicalUrl',
        v_payload ->> 'text',
        v_payload ->> 'color',
        coalesce(v_payload ->> 'note', ''),
        v_tags,
        v_payload -> 'selector',
        v_created_at,
        v_now,
        case when v_operation = 'delete' then v_now else null end,
        v_revision
      )
      on conflict (id) do update set
        page_id = excluded.page_id,
        canonical_url = excluded.canonical_url,
        text = excluded.text,
        color = excluded.color,
        note = excluded.note,
        tags = excluded.tags,
        selector = excluded.selector,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at,
        revision = excluded.revision
      where public.highlights.user_id = v_user_id
      returning * into v_highlight;

      if v_highlight.id is null then
        raise exception using errcode = '23505', message = 'entity id is unavailable';
      end if;
      v_change_payload := jsonb_build_object(
        'id', v_highlight.id,
        'pageId', v_highlight.page_id,
        'canonicalUrl', v_highlight.canonical_url,
        'text', v_highlight.text,
        'color', v_highlight.color,
        'note', v_highlight.note,
        'tags', to_jsonb(v_highlight.tags),
        'selector', v_highlight.selector,
        'createdAt', v_highlight.created_at,
        'updatedAt', v_highlight.updated_at,
        'deletedAt', v_highlight.deleted_at,
        'revision', v_highlight.revision
      );
    end if;

    insert into public.sync_changes (
      sequence,
      user_id,
      entity_type,
      entity_id,
      operation,
      revision,
      payload,
      created_at
    ) values (
      v_revision,
      v_user_id,
      v_entity_type,
      v_entity_id,
      v_operation,
      v_revision,
      v_change_payload,
      v_now
    );

    insert into public.sync_mutations (user_id, mutation_id, sequence, received_at)
    values (v_user_id, v_mutation_id, v_revision, v_now);
    v_acknowledged := v_acknowledged || jsonb_build_array(v_mutation_id::text);
  end loop;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'sequence', changes.sequence,
          'entityType', changes.entity_type,
          'entityId', changes.entity_id,
          'operation', changes.operation,
          'revision', changes.revision,
          'payload', changes.payload
        ) order by changes.sequence
      ),
      '[]'::jsonb
    ),
    coalesce(max(changes.sequence), p_after_sequence)
  into v_changes, v_next_cursor
  from (
    select *
    from public.sync_changes
    where user_id = v_user_id and sequence > p_after_sequence
    order by sequence
    limit p_batch_limit
  ) as changes;

  select exists (
    select 1
    from public.sync_changes
    where user_id = v_user_id and sequence > v_next_cursor
  ) into v_has_more;

  return jsonb_build_object(
    'acknowledgedMutationIds', v_acknowledged,
    'changes', v_changes,
    'nextCursor', v_next_cursor,
    'hasMore', v_has_more
  );
end;
$$;

revoke all on function public.apply_sync_batch(jsonb, bigint, integer) from public, anon;
grant execute on function public.apply_sync_batch(jsonb, bigint, integer) to authenticated;

comment on function public.apply_sync_batch(jsonb, bigint, integer) is
  'Idempotently applies a local mutation batch and returns ordered changes after a client cursor.';
