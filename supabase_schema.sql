create extension if not exists pgcrypto;
create table if not exists public.profiles(id uuid primary key references auth.users(id) on delete cascade,full_name text,is_admin boolean not null default false,created_at timestamptz not null default now());
create table if not exists public.power_tenders(id uuid primary key default gen_random_uuid(),tender_name text not null,capacity_mw numeric(12,2),employer text,consultant text,estimated_tonnage numeric(14,2),bidder text,tender_time_prediction text,notes text,tracking_stage text not null default 'شناسایی',final_result text not null default 'در حال بررسی',tender_number text,created_by uuid references auth.users(id),updated_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create or replace function public.set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;
drop trigger if exists power_tenders_updated_at on public.power_tenders;create trigger power_tenders_updated_at before update on public.power_tenders for each row execute function public.set_updated_at();
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$begin insert into public.profiles(id,full_name) values(new.id,coalesce(new.raw_user_meta_data->>'full_name','')) on conflict(id) do nothing;return new;end$$;
drop trigger if exists on_auth_user_created on auth.users;create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
alter table public.profiles enable row level security;alter table public.power_tenders enable row level security;
drop policy if exists profiles_self_read on public.profiles;create policy profiles_self_read on public.profiles for select to authenticated using(id=auth.uid());
drop policy if exists tenders_read on public.power_tenders;create policy tenders_read on public.power_tenders for select to authenticated using(true);
drop policy if exists tenders_insert on public.power_tenders;create policy tenders_insert on public.power_tenders for insert to authenticated with check(exists(select 1 from public.profiles where id=auth.uid() and is_admin=true));
drop policy if exists tenders_update on public.power_tenders;create policy tenders_update on public.power_tenders for update to authenticated using(exists(select 1 from public.profiles where id=auth.uid() and is_admin=true)) with check(exists(select 1 from public.profiles where id=auth.uid() and is_admin=true));
drop policy if exists tenders_delete on public.power_tenders;create policy tenders_delete on public.power_tenders for delete to authenticated using(exists(select 1 from public.profiles where id=auth.uid() and is_admin=true));
grant select on public.profiles to authenticated;grant select,insert,update,delete on public.power_tenders to authenticated;
alter table public.power_tenders replica identity full;
do $$ begin alter publication supabase_realtime add table public.power_tenders; exception when duplicate_object then null; end $$;
-- بعد از ساخت کاربر مدیر، UUID را جایگزین کنید:
-- update public.profiles set is_admin=true where id='USER_UUID_HERE';