-- Phase 7: league-mates can see each other's predictions immediately (the value
-- is banter/discussion, not secrecy). Drops the per-lock gating from the
-- co-member READ policies — now any league-mate can read your picks as soon as
-- you make them. (Owner write rules and the lock on WRITING are unchanged.)

drop policy if exists read_comember_match_preds on match_predictions;
create policy read_comember_match_preds on match_predictions
  for select using (shares_league_with(user_id));

drop policy if exists read_comember_group_preds on group_predictions;
create policy read_comember_group_preds on group_predictions
  for select using (shares_league_with(user_id));

drop policy if exists read_comember_bracket_preds on bracket_predictions;
create policy read_comember_bracket_preds on bracket_predictions
  for select using (shares_league_with(user_id));

drop policy if exists read_comember_special_preds on special_predictions;
create policy read_comember_special_preds on special_predictions
  for select using (shares_league_with(user_id));
