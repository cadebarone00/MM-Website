-- READ-ONLY operator handoff. NOT executed by this task. Confirm project identity,
-- authorization, restricted output location and backup before any live review.
begin transaction read only;
select 'submissions_reopened' as finding, count(*) from public.scorecard_submissions where reopened_at is not null
union all select 'approved_requests', count(*) from public.scorecard_correction_requests where status = 'approved'
union all select 'pending_requests', count(*) from public.scorecard_correction_requests where status = 'pending'
union all select 'submission_without_player_lock', count(*) from public.scorecard_submissions s
  left join public.scoring_group_players p on p.group_id=s.group_id and p.profile_id=s.golfer_profile_id
  where p.submitted_at is null;

select s.golf_trip_id,s.golf_trip_round_id,s.group_id,s.golfer_profile_id,s.revision,
  s.reopened_at,p.submitted_at
from public.scorecard_submissions s left join public.scoring_group_players p
  on p.group_id=s.group_id and p.profile_id=s.golfer_profile_id
where s.reopened_at is not null or p.submitted_at is null;

select r.id,r.golf_trip_id,r.group_id,r.golfer_profile_id,r.revision,r.status,r.holes,
  r.requested_at,s.revision as current_revision,s.reopened_at
from public.scorecard_correction_requests r left join public.scorecard_submissions s
  on s.group_id=r.group_id and s.golfer_profile_id=r.golfer_profile_id
where r.status in ('pending','approved');
rollback;
