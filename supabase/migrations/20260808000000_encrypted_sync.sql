create table public.vault_headers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  header jsonb not null,
  updated_at timestamptz not null default now(),
  constraint vault_header_size check (octet_length(header::text) <= 16384)
);

create table public.encrypted_items (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null check (revision > 0),
  updated_at timestamptz not null,
  device_id text not null check (length(device_id) between 1 and 100),
  deleted boolean not null default false,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint encrypted_payload_size check (octet_length(payload::text) <= 4194304)
);

create index encrypted_items_owner_updated_idx on public.encrypted_items (user_id, updated_at);

alter table public.vault_headers enable row level security;
alter table public.encrypted_items enable row level security;

create policy "owners read their vault header"
  on public.vault_headers for select
  using ((select auth.uid()) = user_id);

create policy "owners create their vault header"
  on public.vault_headers for insert
  with check ((select auth.uid()) = user_id);

create policy "owners update their vault header"
  on public.vault_headers for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "owners delete their vault header"
  on public.vault_headers for delete
  using ((select auth.uid()) = user_id);

create policy "owners read their encrypted items"
  on public.encrypted_items for select
  using ((select auth.uid()) = user_id);

create policy "owners create their encrypted items"
  on public.encrypted_items for insert
  with check ((select auth.uid()) = user_id);

create policy "owners update their encrypted items"
  on public.encrypted_items for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "owners delete their encrypted items"
  on public.encrypted_items for delete
  using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit)
values ('encrypted-attachments', 'encrypted-attachments', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create policy "owners read encrypted attachment objects"
  on storage.objects for select to authenticated
  using (bucket_id = 'encrypted-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "owners create encrypted attachment objects"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'encrypted-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "owners update encrypted attachment objects"
  on storage.objects for update to authenticated
  using (bucket_id = 'encrypted-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'encrypted-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "owners delete encrypted attachment objects"
  on storage.objects for delete to authenticated
  using (bucket_id = 'encrypted-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

revoke all on public.vault_headers from anon;
revoke all on public.encrypted_items from anon;
grant select, insert, update, delete on public.vault_headers to authenticated;
grant select, insert, update, delete on public.encrypted_items to authenticated;
