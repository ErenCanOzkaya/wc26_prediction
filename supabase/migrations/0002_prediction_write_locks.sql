-- OPTIONAL hardening (run in the Supabase SQL editor if you want DB-enforced
-- locks). Adds the DESIGN §6 lock to the WITH CHECK of each prediction policy,
-- so a write AFTER the lock is rejected by Postgres itself — not just by the
-- server action. Reads/deletes of your own rows stay allowed.
-- The scoring engine uses the service role and bypasses RLS, so replays are
-- unaffected.

drop policy if exists own_match_preds on match_predictions;
create policy own_match_preds on match_predictions
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from matches m
      where m.id = match_predictions.match_id and m.kickoff > now()
    )
  );

drop policy if exists own_group_preds on group_predictions;
create policy own_group_preds on group_predictions
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and not exists (
      select 1 from matches m
      where m.stage = 'group'
        and m.group_label = group_predictions.group_label
        and m.kickoff <= now()
    )
  );

drop policy if exists own_bracket_preds on bracket_predictions;
create policy own_bracket_preds on bracket_predictions
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and not exists (
      select 1 from matches m where m.stage = 'r32' and m.kickoff <= now()
    )
  );

drop policy if exists own_special_preds on special_predictions;
create policy own_special_preds on special_predictions
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and not exists (select 1 from matches m where m.kickoff <= now())
  );
