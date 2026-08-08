begin;
select plan(8);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'b@example.test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

insert into public.encrypted_items (id, user_id, revision, updated_at, device_id, payload)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 1, now(), 'device-a', '{"ciphertext":"opaque"}');

select results_eq(
  $$ select count(*)::bigint from public.encrypted_items $$,
  $$ values (1::bigint) $$,
  'User A sees their own encrypted row'
);

select throws_ok(
  $$ insert into public.encrypted_items (id, user_id, revision, updated_at, device_id, payload) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 1, now(), 'device-a', '{}') $$,
  '42501', null, 'User A cannot insert for User B'
);

select is_empty(
  $$ update public.encrypted_items set revision = 2 where user_id = '22222222-2222-4222-8222-222222222222' returning id $$,
  'User A cannot update User B rows'
);

select is_empty(
  $$ delete from public.encrypted_items where user_id = '22222222-2222-4222-8222-222222222222' returning id $$,
  'User A cannot delete User B rows'
);

select throws_ok(
  $$ insert into public.vault_headers (user_id, header) values ('22222222-2222-4222-8222-222222222222', '{}') $$,
  '42501', null, 'User A cannot insert User B vault header'
);

select ok(has_table('public', 'encrypted_items'), 'Encrypted item table exists');
select ok(has_table('public', 'vault_headers'), 'Vault header table exists');
select ok((select not public from storage.buckets where id = 'encrypted-attachments'), 'Attachment bucket is private');

select * from finish();
rollback;
