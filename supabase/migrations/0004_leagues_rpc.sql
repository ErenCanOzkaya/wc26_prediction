-- Phase 5: league create/join as SECURITY DEFINER RPCs.
-- Joining needs to look up a league by invite code BEFORE membership exists,
-- which RLS can't allow on the table directly — so we do it in a definer
-- function that runs with elevated rights but keys off the caller's auth.uid().

create or replace function public.create_league(p_name text)
returns leagues
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code   text;
  v_league leagues;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'League name is required';
  end if;

  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from leagues where invite_code = v_code);
  end loop;

  insert into leagues (name, owner_id, invite_code)
  values (trim(p_name), auth.uid(), v_code)
  returning * into v_league;

  insert into league_members (league_id, user_id, role)
  values (v_league.id, auth.uid(), 'owner');

  return v_league;
end;
$$;

create or replace function public.join_league_by_code(p_code text)
returns leagues
language plpgsql
security definer
set search_path = public
as $$
declare
  v_league leagues;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_league
  from leagues
  where invite_code = upper(trim(p_code));

  if v_league.id is null then
    raise exception 'Invalid invite code';
  end if;

  insert into league_members (league_id, user_id, role)
  values (v_league.id, auth.uid(), 'member')
  on conflict (league_id, user_id) do nothing;

  return v_league;
end;
$$;

grant execute on function public.create_league(text) to authenticated;
grant execute on function public.join_league_by_code(text) to authenticated;
