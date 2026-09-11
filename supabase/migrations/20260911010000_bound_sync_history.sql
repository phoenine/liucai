create index if not exists sync_mutations_user_received_idx
  on public.sync_mutations (user_id, received_at);
create index if not exists sync_changes_entity_latest_idx
  on public.sync_changes (user_id, entity_type, entity_id, sequence desc);

delete from public.sync_changes as older
using public.sync_changes as newer
where older.user_id = newer.user_id
  and older.entity_type = newer.entity_type
  and older.entity_id = newer.entity_id
  and older.sequence < newer.sequence;

update public.sync_changes
set payload = jsonb_build_object(
  'id', entity_id,
  'deletedAt', payload -> 'deletedAt'
)
where entity_type = 'highlight' and operation = 'delete';

delete from public.sync_mutations
where received_at < clock_timestamp() - interval '180 days';

create or replace function public.compact_sync_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.sync_changes
  where user_id = new.user_id
    and entity_type = new.entity_type
    and entity_id = new.entity_id
    and sequence < new.sequence;
  return new;
end;
$$;

revoke all on function public.compact_sync_changes() from public, anon, authenticated;

drop trigger if exists compact_sync_changes_after_change on public.sync_changes;
create trigger compact_sync_changes_after_change
after insert on public.sync_changes
for each row
execute function public.compact_sync_changes();

create or replace function public.prune_old_sync_mutations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.sync_mutations
  where user_id = new.user_id
    and received_at < new.received_at - interval '180 days';
  return new;
end;
$$;

revoke all on function public.prune_old_sync_mutations() from public, anon, authenticated;

drop trigger if exists prune_old_sync_mutations_after_insert on public.sync_mutations;
create trigger prune_old_sync_mutations_after_insert
after insert on public.sync_mutations
for each row
execute function public.prune_old_sync_mutations();

comment on function public.compact_sync_changes() is
  'Keeps only the latest sync snapshot for each user entity.';
comment on function public.prune_old_sync_mutations() is
  'Retains a rolling 180-day mutation idempotency window per active user.';
