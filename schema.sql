-- =====================================================================
-- BUILD ARENA — схема Supabase
-- Выполни целиком в Supabase: SQL Editor -> New query -> Run
-- =====================================================================

-- ---------- Таблицы ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text not null unique check (char_length(username) between 3 and 16),
  rating     int  not null default 1000,
  games      int  not null default 0,
  wins       int  not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists profiles_rating_idx on public.profiles (rating desc);

create table if not exists public.matches (
  id          uuid primary key default gen_random_uuid(),
  p1          uuid not null references public.profiles(id),
  p2          uuid not null references public.profiles(id),
  p1_rating   int  not null,
  p2_rating   int  not null,
  started     boolean not null default false,
  r1          boolean not null default false,   -- p1 прислал результат
  r2          boolean not null default false,   -- p2 прислал результат
  w1          uuid,                             -- победитель по версии p1 (null = ничья)
  w2          uuid,                             -- победитель по версии p2
  rep_at      timestamptz,                      -- когда пришёл первый отчёт
  winner      uuid,
  status      text not null default 'active'
              check (status in ('active', 'finished', 'disputed', 'aborted')),
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists matches_p1_idx on public.matches (p1, status);
create index if not exists matches_p2_idx on public.matches (p2, status);

create table if not exists public.queue (
  user_id   uuid primary key references public.profiles(id) on delete cascade,
  rating    int  not null,
  joined_at timestamptz not null default now(),
  seen_at   timestamptz not null default now()
);

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.matches  enable row level security;
alter table public.queue    enable row level security;

drop policy if exists "profiles are public"   on public.profiles;
drop policy if exists "own matches readable"  on public.matches;

-- Таблица лидеров публична. Писать в profiles напрямую нельзя — только через функции ниже.
create policy "profiles are public"  on public.profiles for select using (true);
create policy "own matches readable" on public.matches  for select using (auth.uid() in (p1, p2));
-- у queue политик нет => прямого доступа нет, только через функции.

-- Вторая линия защиты: Supabase по умолчанию выдаёт ролям широкие права на таблицы public,
-- здесь явно забираем всё, кроме чтения. Изменять данные можно только через функции ниже.
revoke insert, update, delete, truncate on public.profiles from anon, authenticated;
revoke insert, update, delete, truncate on public.matches  from anon, authenticated;
revoke all on public.queue from anon, authenticated;

-- ---------- Профиль создаётся автоматически при регистрации ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'username'), ''), 'player_' || substr(new.id::text, 1, 6))
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Elo ----------
create or replace function public._apply_match(p_match uuid, p_winner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m public.matches%rowtype;
  a public.profiles%rowtype;
  b public.profiles%rowtype;
  k  constant int := 32;
  ea float8; sa float8; sb float8;
begin
  select * into m from public.matches where id = p_match;
  select * into a from public.profiles where id = m.p1 for update;
  select * into b from public.profiles where id = m.p2 for update;

  ea := 1.0 / (1.0 + power(10.0::float8, ((b.rating - a.rating) / 400.0)::float8));

  if p_winner is null then sa := 0.5; sb := 0.5;
  elsif p_winner = a.id then sa := 1; sb := 0;
  else sa := 0; sb := 1;
  end if;

  update public.profiles
     set rating = greatest(100, round(a.rating + k * (sa - ea))::int),
         games  = games + 1,
         wins   = wins + (case when sa = 1 then 1 else 0 end)
   where id = a.id;

  update public.profiles
     set rating = greatest(100, round(b.rating + k * (sb - (1 - ea)))::int),
         games  = games + 1,
         wins   = wins + (case when sb = 1 then 1 else 0 end)
   where id = b.id;

  update public.matches
     set status = 'finished', winner = p_winner, finished_at = now()
   where id = p_match;
end $$;

-- ---------- Матчмейкинг ----------
-- Клиент вызывает find_match() раз в ~1.5 c. Возвращает id матча или null (ещё ищем).
create or replace function public.find_match()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me  public.profiles%rowtype;
  opp public.queue%rowtype;
  mid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into me from public.profiles where id = auth.uid();
  if not found then raise exception 'profile not found'; end if;

  -- зависшие матчи закрываем
  update public.matches set status = 'aborted', finished_at = now()
   where status = 'active' and (p1 = me.id or p2 = me.id)
     and created_at < now() - interval '8 minutes';

  -- уже есть активный матч -> возвращаем его
  select id into mid from public.matches
   where status = 'active' and (p1 = me.id or p2 = me.id)
   order by created_at desc limit 1;
  if mid is not null then return mid; end if;

  -- чистим тех, кто перестал опрашивать
  delete from public.queue where seen_at < now() - interval '8 seconds';

  -- ищем ближайшего по рейтингу; окно поиска расширяется с ожиданием
  select * into opp from public.queue q
   where q.user_id <> me.id
     and abs(q.rating - me.rating) <= 150 + 25 * extract(epoch from (now() - q.joined_at))
   order by abs(q.rating - me.rating), q.joined_at
   limit 1
   for update skip locked;

  if not found then
    insert into public.queue (user_id, rating) values (me.id, me.rating)
    on conflict (user_id) do update set seen_at = now(), rating = excluded.rating;
    return null;
  end if;

  delete from public.queue where user_id in (opp.user_id, me.id);
  insert into public.matches (p1, p2, p1_rating, p2_rating)
  values (opp.user_id, me.id, opp.rating, me.rating)
  returning id into mid;
  return mid;
end $$;

create or replace function public.leave_queue()
returns void language sql security definer set search_path = public as $$
  delete from public.queue where user_id = auth.uid();
$$;

-- Хост сообщает, что оба игрока на связи (после этого матч нельзя отменить как «несостоявшийся»)
create or replace function public.start_match(p_match uuid)
returns void language sql security definer set search_path = public as $$
  update public.matches set started = true
   where id = p_match and status = 'active' and auth.uid() in (p1, p2);
$$;

-- Соперник не появился -> матч отменяется без изменения рейтинга
create or replace function public.abort_match(p_match uuid)
returns void language sql security definer set search_path = public as $$
  update public.matches set status = 'aborted', finished_at = now()
   where id = p_match and status = 'active' and not started
     and created_at < now() - interval '20 seconds'
     and auth.uid() in (p1, p2);
$$;

-- ---------- Результат матча ----------
-- Оба игрока присылают, кто победил. Совпало -> Elo считается здесь, в БД. Не совпало -> 'disputed', рейтинг не меняется.
-- p_winner = null означает ничью.
create or replace function public.report_result(p_match uuid, p_winner uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  m   public.matches%rowtype;
  uid uuid := auth.uid();
begin
  select * into m from public.matches where id = p_match for update;
  if not found or uid is null or uid not in (m.p1, m.p2) then
    raise exception 'not your match';
  end if;
  if m.status <> 'active' then return m.status; end if;
  if p_winner is not null and p_winner not in (m.p1, m.p2) then
    raise exception 'bad winner';
  end if;

  if uid = m.p1 then
    update public.matches set r1 = true, w1 = p_winner, rep_at = coalesce(rep_at, now()) where id = m.id;
  else
    update public.matches set r2 = true, w2 = p_winner, rep_at = coalesce(rep_at, now()) where id = m.id;
  end if;

  select * into m from public.matches where id = p_match;
  if m.r1 and m.r2 then
    if m.w1 is not distinct from m.w2 then
      perform public._apply_match(m.id, m.w1);
    else
      update public.matches set status = 'disputed', finished_at = now() where id = m.id;
    end if;
  end if;

  return (select status from public.matches where id = p_match);
end $$;

-- Если соперник отключился и не прислал отчёт: через 25 с принимаем единственный отчёт.
create or replace function public.settle_match(p_match uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  m public.matches%rowtype;
begin
  select * into m from public.matches where id = p_match for update;
  if not found or auth.uid() is null or auth.uid() not in (m.p1, m.p2) then
    raise exception 'not your match';
  end if;
  if m.status = 'active' and (m.r1 <> m.r2) and m.rep_at < now() - interval '25 seconds' then
    perform public._apply_match(m.id, case when m.r1 then m.w1 else m.w2 end);
  end if;
  return (select status from public.matches where id = p_match);
end $$;

-- ---------- Права на вызов функций ----------
revoke all on function public._apply_match(uuid, uuid) from public, anon, authenticated;

revoke all on function public.find_match()            from public, anon;
revoke all on function public.leave_queue()           from public, anon;
revoke all on function public.start_match(uuid)       from public, anon;
revoke all on function public.abort_match(uuid)       from public, anon;
revoke all on function public.report_result(uuid, uuid) from public, anon;
revoke all on function public.settle_match(uuid)      from public, anon;

grant execute on function public.find_match()            to authenticated;
grant execute on function public.leave_queue()           to authenticated;
grant execute on function public.start_match(uuid)       to authenticated;
grant execute on function public.abort_match(uuid)       to authenticated;
grant execute on function public.report_result(uuid, uuid) to authenticated;
grant execute on function public.settle_match(uuid)      to authenticated;
