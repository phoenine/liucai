drop function if exists public.confirm_sync_mutations(uuid[]);

drop trigger if exists reject_page_deletion_before_write on public.pages;
drop function if exists public.reject_page_deletion();

update public.pages set deleted_at = null where deleted_at is not null;
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.pages'::regclass
      and conname = 'pages_deleted_at_null'
  ) then
    alter table public.pages
      add constraint pages_deleted_at_null check (deleted_at is null);
  end if;
end;
$$;
