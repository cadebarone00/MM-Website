-- Run the whole file in Supabase SQL Editor. Safe to rerun.
-- Indicates a password credential exists, not email confirmation or portal use.
begin;

alter table public.player_slots
  add column if not exists password_created boolean not null default false;

comment on column public.player_slots.password_created is
  'Automatically derived from the claimed account: true if a password credential exists. Does not prove email verification or a portal visit. No password or hash is copied here.';

create or replace function public.derive_player_slot_password_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.password_created := exists (
    select 1 from auth.users u
    where u.id = new.claimed_by and coalesce(u.encrypted_password, '') <> ''
  );
  return new;
end;
$$;

revoke all on function public.derive_player_slot_password_created() from public;

drop trigger if exists derive_player_slot_password_created on public.player_slots;
create trigger derive_player_slot_password_created
before insert or update of claimed_by, password_created on public.player_slots
for each row execute function public.derive_player_slot_password_created();

create or replace function public.sync_player_slot_password_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.player_slots
  set password_created = (coalesce(new.encrypted_password, '') <> '')
  where claimed_by = new.id
    and password_created is distinct from (coalesce(new.encrypted_password, '') <> '');
  return new;
end;
$$;

revoke all on function public.sync_player_slot_password_created() from public;

drop trigger if exists sync_player_slot_password_created on auth.users;
create trigger sync_player_slot_password_created
after update of encrypted_password on auth.users
for each row execute function public.sync_player_slot_password_created();

-- Backfill existing accounts through the same derivation used for future links.
update public.player_slots set password_created = false;

commit;
