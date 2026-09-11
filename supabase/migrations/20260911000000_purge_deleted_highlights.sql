create table if not exists public.highlight_tombstones (
  user_id uuid not null references auth.users (id) on delete cascade,
  highlight_id uuid not null,
  deleted_at timestamptz not null,
  revision bigint not null,
  primary key (user_id, highlight_id),
  constraint highlight_tombstones_revision_positive check (revision > 0)
);

create index if not exists highlight_tombstones_deleted_idx
  on public.highlight_tombstones (deleted_at);

alter table public.highlight_tombstones enable row level security;
revoke all on table public.highlight_tombstones from anon, authenticated;

insert into public.highlight_tombstones as tombstones (
  user_id,
  highlight_id,
  deleted_at,
  revision
)
select user_id, id, deleted_at, revision
from public.highlights
where deleted_at is not null
on conflict (user_id, highlight_id) do update set
  deleted_at = least(tombstones.deleted_at, excluded.deleted_at),
  revision = greatest(tombstones.revision, excluded.revision);

delete from public.highlights where deleted_at is not null;
drop index if exists public.highlights_user_deleted_idx;

create or replace function public.prevent_deleted_highlight_resurrection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted_at timestamptz;
begin
  if new.entity_type = 'highlight' and new.operation = 'upsert' then
    select deleted_at into v_deleted_at
    from public.highlight_tombstones
    where user_id = new.user_id and highlight_id = new.entity_id;

    if found then
      new.operation := 'delete';
      delete from public.highlights
      where user_id = new.user_id
        and id = new.entity_id
        and revision = new.revision;
    end if;
  end if;
  if new.entity_type = 'highlight' and new.operation = 'delete' then
    v_deleted_at := coalesce(
      v_deleted_at,
      (new.payload ->> 'deletedAt')::timestamptz,
      new.created_at
    );
    new.payload := jsonb_build_object(
      'id', new.entity_id,
      'deletedAt', v_deleted_at
    );
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_deleted_highlight_resurrection() from public, anon, authenticated;

drop trigger if exists prevent_deleted_highlight_resurrection_before_change on public.sync_changes;
create trigger prevent_deleted_highlight_resurrection_before_change
before insert on public.sync_changes
for each row
execute function public.prevent_deleted_highlight_resurrection();

create or replace function public.record_deleted_highlight()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.entity_type = 'highlight' and new.operation = 'delete' then
    insert into public.highlight_tombstones (
      user_id,
      highlight_id,
      deleted_at,
      revision
    ) values (
      new.user_id,
      new.entity_id,
      (new.payload ->> 'deletedAt')::timestamptz,
      new.revision
    )
    on conflict (user_id, highlight_id) do update set
      revision = excluded.revision;

    delete from public.highlights
    where user_id = new.user_id
      and id = new.entity_id
      and deleted_at is not null
      and revision = new.revision;
  end if;
  return new;
end;
$$;

revoke all on function public.record_deleted_highlight() from public, anon, authenticated;

drop trigger if exists record_deleted_highlight_after_change on public.sync_changes;
create trigger record_deleted_highlight_after_change
after insert on public.sync_changes
for each row
execute function public.record_deleted_highlight();

comment on table public.highlight_tombstones is
  'Minimal deletion metadata used to prevent stale clients from resurrecting highlights.';
comment on function public.prevent_deleted_highlight_resurrection() is
  'Turns a stale upsert for a deleted highlight into a fresh delete change.';
comment on function public.record_deleted_highlight() is
  'Records one durable tombstone per deleted highlight and removes its business row.';
