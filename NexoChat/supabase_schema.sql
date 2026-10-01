-- NexoChat V1 database schema
-- Run once in Supabase SQL Editor. Safe to re-run.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  full_name text,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(sender_id, receiver_id)
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_a <> user_b),
  unique(user_a, user_b)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'direct' check (kind in ('direct')),
  direct_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key(conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  read_at timestamptz
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  description text,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key(group_id, user_id)
);

create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  read_at timestamptz
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists friend_requests_receiver_idx on public.friend_requests(receiver_id, status, created_at desc);
create index if not exists friend_requests_sender_idx on public.friend_requests(sender_id, status, created_at desc);
create index if not exists friendships_a_idx on public.friendships(user_a);
create index if not exists friendships_b_idx on public.friendships(user_b);
create index if not exists messages_conversation_idx on public.messages(conversation_id, created_at);
create index if not exists group_messages_group_idx on public.group_messages(group_id, created_at);
create index if not exists notifications_user_idx on public.notifications(user_id, read_at, created_at desc);
create index if not exists messages_unread_idx on public.messages(conversation_id, read_at, created_at);
create index if not exists group_messages_unread_idx on public.group_messages(group_id, read_at, created_at);


-- NexoChat AI history, blocks, reports and admin roles.
create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('user','assistant')),
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_messages_user_idx on public.ai_messages(user_id, created_at);

create table if not exists public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_id, blocked_id),
  check(blocker_id <> blocked_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid references auth.users(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  group_id uuid references public.groups(id) on delete set null,
  reason text not null,
  details text,
  status text not null default 'open' check(status in ('open','reviewed','resolved','dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check(role in ('admin','superadmin')),
  created_at timestamptz not null default now()
);

alter table public.ai_messages enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.admin_users enable row level security;

drop policy if exists ai_messages_select on public.ai_messages;
create policy ai_messages_select on public.ai_messages for select to authenticated using(user_id=auth.uid());
drop policy if exists ai_messages_insert on public.ai_messages;
create policy ai_messages_insert on public.ai_messages for insert to authenticated with check(user_id=auth.uid());
drop policy if exists ai_messages_delete on public.ai_messages;
create policy ai_messages_delete on public.ai_messages for delete to authenticated using(user_id=auth.uid());

drop policy if exists blocks_select on public.blocks;
create policy blocks_select on public.blocks for select to authenticated using(blocker_id=auth.uid());
drop policy if exists blocks_insert on public.blocks;
create policy blocks_insert on public.blocks for insert to authenticated with check(blocker_id=auth.uid());
drop policy if exists blocks_delete on public.blocks;
create policy blocks_delete on public.blocks for delete to authenticated using(blocker_id=auth.uid());

drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated with check(reporter_id=auth.uid());
drop policy if exists reports_select_own on public.reports;
create policy reports_select_own on public.reports for select to authenticated using(reporter_id=auth.uid());

drop policy if exists admin_users_select_self on public.admin_users;
create policy admin_users_select_self on public.admin_users for select to authenticated using(user_id=auth.uid());

grant select,insert,delete on public.ai_messages to authenticated;
grant select,insert,delete on public.blocks to authenticated;
grant select,insert on public.reports to authenticated;
grant select on public.admin_users to authenticated;

-- updated_at helper
create or replace function public.nexo_set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.nexo_set_updated_at();
drop trigger if exists friend_requests_updated_at on public.friend_requests;
create trigger friend_requests_updated_at before update on public.friend_requests for each row execute function public.nexo_set_updated_at();
drop trigger if exists conversations_updated_at on public.conversations;
create trigger conversations_updated_at before update on public.conversations for each row execute function public.nexo_set_updated_at();
drop trigger if exists groups_updated_at on public.groups;
create trigger groups_updated_at before update on public.groups for each row execute function public.nexo_set_updated_at();

-- Automatically create profile after signup.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id, full_name) values(new.id, nullif(trim(new.raw_user_meta_data->>'full_name'), '')) on conflict(id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Notify the receiver when a new friend request arrives.
create or replace function public.notify_friend_request() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.status='pending' then
    insert into public.notifications(user_id,type,title,body,data)
    values(new.receiver_id,'friend_request','New friend request','Someone wants to connect with you.',jsonb_build_object('request_id',new.id,'sender_id',new.sender_id));
  end if;
  return new;
end; $$;
drop trigger if exists friend_request_notification on public.friend_requests;
create trigger friend_request_notification after insert on public.friend_requests for each row execute function public.notify_friend_request();

-- Friend accept helper: creates symmetric friendship rows and notification.
create or replace function public.accept_friend_request(p_request_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare r public.friend_requests;
begin
  select * into r from public.friend_requests where id=p_request_id and receiver_id=auth.uid() and status='pending' for update;
  if not found then raise exception 'Friend request not found'; end if;
  update public.friend_requests set status='accepted' where id=r.id;
  insert into public.friendships(user_a,user_b) values(r.sender_id,r.receiver_id),(r.receiver_id,r.sender_id) on conflict do nothing;
  insert into public.notifications(user_id,type,title,body,data) values(r.sender_id,'friend_accepted','Friend request accepted','You are now friends.',jsonb_build_object('user_id',auth.uid()));
end; $$;

-- Direct conversation helper. Only a friend can create/open one.
create or replace function public.get_or_create_direct_conversation(p_other_user uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare cid uuid; k text;
begin
  if not exists (select 1 from public.friendships where user_a=auth.uid() and user_b=p_other_user) then
    raise exception 'You can only chat with a friend';
  end if;
  k := least(auth.uid()::text,p_other_user::text)||':'||greatest(auth.uid()::text,p_other_user::text);
  select id into cid from public.conversations where direct_key=k limit 1;
  if cid is null then
    insert into public.conversations(kind,direct_key) values('direct',k) returning id into cid;
    insert into public.conversation_members(conversation_id,user_id) values(cid,auth.uid()),(cid,p_other_user);
  end if;
  return cid;
end; $$;

-- RLS
alter table public.profiles enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_messages enable row level security;
alter table public.notifications enable row level security;

-- Profiles: authenticated users may search profiles; edits are self-only.
drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated on public.profiles for select to authenticated using (true);
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert to authenticated with check (auth.uid()=id);
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated using(auth.uid()=id) with check(auth.uid()=id);

-- Friend requests
 drop policy if exists friend_requests_select on public.friend_requests;
create policy friend_requests_select on public.friend_requests for select to authenticated using(sender_id=auth.uid() or receiver_id=auth.uid());
drop policy if exists friend_requests_insert on public.friend_requests;
create policy friend_requests_insert on public.friend_requests for insert to authenticated with check(sender_id=auth.uid() and receiver_id<>auth.uid());
drop policy if exists friend_requests_update on public.friend_requests;
create policy friend_requests_update on public.friend_requests for update to authenticated using(receiver_id=auth.uid() or sender_id=auth.uid()) with check(receiver_id=auth.uid() or sender_id=auth.uid());
drop policy if exists friend_requests_delete on public.friend_requests;
create policy friend_requests_delete on public.friend_requests for delete to authenticated using(sender_id=auth.uid() or receiver_id=auth.uid());

-- Friendships
 drop policy if exists friendships_select on public.friendships;
create policy friendships_select on public.friendships for select to authenticated using(user_a=auth.uid() or user_b=auth.uid());

-- Membership helpers avoid recursive RLS checks.
create or replace function public.is_conversation_member(p_conversation_id uuid, p_user_id uuid) returns boolean
language sql security definer set search_path=public stable as $$
  select exists(select 1 from public.conversation_members where conversation_id=p_conversation_id and user_id=p_user_id);
$$;
create or replace function public.is_group_member(p_group_id uuid, p_user_id uuid) returns boolean
language sql security definer set search_path=public stable as $$
  select exists(select 1 from public.group_members where group_id=p_group_id and user_id=p_user_id);
$$;
grant execute on function public.is_conversation_member(uuid,uuid) to authenticated;
grant execute on function public.is_group_member(uuid,uuid) to authenticated;

-- Conversations and members
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations for select to authenticated using(public.is_conversation_member(id,auth.uid()));
drop policy if exists conversation_members_select on public.conversation_members;
create policy conversation_members_select on public.conversation_members for select to authenticated using(user_id=auth.uid() or public.is_conversation_member(conversation_id,auth.uid()));

-- Messages
 drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated using(exists(select 1 from public.conversation_members cm where cm.conversation_id=messages.conversation_id and cm.user_id=auth.uid()));
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated with check(sender_id=auth.uid() and exists(select 1 from public.conversation_members cm where cm.conversation_id=messages.conversation_id and cm.user_id=auth.uid()));
drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages for update to authenticated using(sender_id=auth.uid()) with check(sender_id=auth.uid());
drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages for delete to authenticated using(sender_id=auth.uid());

-- Groups
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups for select to authenticated using(owner_id=auth.uid() or public.is_group_member(id,auth.uid()));
drop policy if exists groups_insert on public.groups;
create policy groups_insert on public.groups for insert to authenticated with check(owner_id=auth.uid());
drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups for update to authenticated using(owner_id=auth.uid() or public.is_group_member(id,auth.uid()));
drop policy if exists group_members_select on public.group_members;
create policy group_members_select on public.group_members for select to authenticated using(user_id=auth.uid() or public.is_group_member(group_id,auth.uid()));
drop policy if exists group_members_insert on public.group_members;
create policy group_members_insert on public.group_members for insert to authenticated with check(exists(select 1 from public.group_members gm where gm.group_id=group_id and gm.user_id=auth.uid() and gm.role in ('owner','admin')));

-- Group owners/admins can remove members; owners can promote/demote roles.
drop policy if exists group_members_update on public.group_members;
create policy group_members_update on public.group_members for update to authenticated using(exists(select 1 from public.group_members gm where gm.group_id=group_id and gm.user_id=auth.uid() and gm.role='owner')) with check(exists(select 1 from public.group_members gm where gm.group_id=group_id and gm.user_id=auth.uid() and gm.role='owner'));
drop policy if exists group_members_delete on public.group_members;
create policy group_members_delete on public.group_members for delete to authenticated using(exists(select 1 from public.group_members gm where gm.group_id=group_id and gm.user_id=auth.uid() and gm.role in ('owner','admin')));

-- Group messages: members only.
drop policy if exists group_messages_select on public.group_messages;
create policy group_messages_select on public.group_messages for select to authenticated using(public.is_group_member(group_messages.group_id,auth.uid()));
drop policy if exists group_messages_insert on public.group_messages;
create policy group_messages_insert on public.group_messages for insert to authenticated with check(sender_id=auth.uid() and public.is_group_member(group_messages.group_id,auth.uid()));
drop policy if exists group_messages_update on public.group_messages;
create policy group_messages_update on public.group_messages for update to authenticated using(sender_id=auth.uid()) with check(sender_id=auth.uid());
drop policy if exists group_messages_delete on public.group_messages;
create policy group_messages_delete on public.group_messages for delete to authenticated using(sender_id=auth.uid());

-- Notifications
 drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated using(user_id=auth.uid());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

-- Grants
 grant select,insert,update on public.profiles to authenticated;
grant select,insert,update,delete on public.friend_requests to authenticated;
grant select on public.friendships to authenticated;
grant select on public.conversations, public.conversation_members to authenticated;
grant select,insert,update,delete on public.messages to authenticated;
grant select,insert,update on public.groups to authenticated;
grant select,insert on public.group_members to authenticated;
grant select,insert,update,delete on public.group_messages to authenticated;
grant select,update on public.notifications to authenticated;
grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.mark_group_read(uuid) to authenticated;

-- Keep list ordering fresh when a new message arrives.
create or replace function public.touch_conversation_from_message() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  update public.conversations set updated_at=now() where id=new.conversation_id;
  return new;
end; $$;
drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation after insert on public.messages for each row execute function public.touch_conversation_from_message();

create or replace function public.touch_group_from_message() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  update public.groups set updated_at=now() where id=new.group_id;
  return new;
end; $$;
drop trigger if exists group_messages_touch_group on public.group_messages;
create trigger group_messages_touch_group after insert on public.group_messages for each row execute function public.touch_group_from_message();

-- Read-receipt helpers run with controlled server-side privileges so users cannot edit other message content.
create or replace function public.mark_conversation_read(p_conversation_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_conversation_member(p_conversation_id, auth.uid()) then raise exception 'Not a conversation member'; end if;
  update public.messages set read_at=now() where conversation_id=p_conversation_id and sender_id<>auth.uid() and read_at is null;
end; $$;
create or replace function public.mark_group_read(p_group_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_group_member(p_group_id, auth.uid()) then raise exception 'Not a group member'; end if;
  update public.group_messages set read_at=now() where group_id=p_group_id and sender_id<>auth.uid() and read_at is null;
end; $$;

grant execute on function public.handle_new_user() to service_role;

-- Realtime (safe to re-run)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages') then alter publication supabase_realtime add table public.messages; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='group_messages') then alter publication supabase_realtime add table public.group_messages; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='friend_requests') then alter publication supabase_realtime add table public.friend_requests; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then alter publication supabase_realtime add table public.notifications; end if;
end $$;
