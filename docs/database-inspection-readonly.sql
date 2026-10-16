-- docs/database-inspection-readonly.sql
-- READ-ONLY database inspection for The Maroon (accounts, profiles, trips, rounds, tournament identity).
-- Generated 2026-10-16 from 34 repository files, 295 expected objects.
--
-- What it does: ONE select statement that only reads the database's own catalog (the list of tables, columns,
-- functions, policies, triggers, indexes) plus a few COUNTS. It creates, changes and deletes nothing, and it
-- never selects emails, names, password hashes, tokens or any other column of any person's row.
--
-- How to run: Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
-- Then use the results panel's export / download (CSV) and send the file back. If the editor only shows part of
-- the rows, the CSV still has all of them.
--
-- How to read "status":
--   Functions are FINGERPRINTED: the database keeps each function's exact text, so a match with a repository file is
--   strong evidence that file's version was installed.
--     exact            = installed text is identical to this file's version
--     other file       = identical to a DIFFERENT repository file's version (that file ran later / instead)
--     unknown version  = a function with this name exists but matches no repository file (older or hand-edited)
--   Tables, columns, indexes, constraints, policies, triggers and buckets can only be checked for EXISTENCE.
--   Existing proves the object is there, NOT which file created it (several files may create the same object).
--   "missing" may also mean a later file deliberately dropped it.

with expected(file, kind, parent, name, fp_lf, fp_raw) as (
  values
    ('schema.sql', 'table', null, 'public.profiles', null, null),
    ('schema.sql', 'table', null, 'public.player_slots', null, null),
    ('schema.sql', 'index', 'public.profiles', 'profiles_username_lower_idx', null, null),
    ('schema.sql', 'policy', 'public.profiles', 'profiles_select_own', null, null),
    ('player_slots_email.sql', 'column', 'public.player_slots', 'email', null, null),
    ('player_slots_full_name.sql', 'column', 'public.player_slots', 'full_name', null, null),
    ('player_slots_password_created.sql', 'column', 'public.player_slots', 'password_created', null, null),
    ('player_slots_password_created.sql', 'trigger', 'public.player_slots', 'derive_player_slot_password_created', null, null),
    ('player_slots_password_created.sql', 'trigger', 'auth.users', 'sync_player_slot_password_created', null, null),
    ('player_slots_password_created.sql', 'function', 'public', 'derive_player_slot_password_created', '42ae70572aba20cb31d1295a7cc381ae', '42ae70572aba20cb31d1295a7cc381ae'),
    ('player_slots_password_created.sql', 'function', 'public', 'sync_player_slot_password_created', 'e08f84aba4aa15b17f71f521b370ba45', 'e08f84aba4aa15b17f71f521b370ba45'),
    ('platform_foundation.sql', 'table', null, 'public.platform_plans', null, null),
    ('platform_foundation.sql', 'table', null, 'public.platform_settings', null, null),
    ('platform_foundation.sql', 'table', null, 'public.tournament_creator_access', null, null),
    ('platform_foundation.sql', 'table', null, 'public.organizations', null, null),
    ('platform_foundation.sql', 'table', null, 'public.tournaments', null, null),
    ('platform_foundation.sql', 'table', null, 'public.tournament_editions', null, null),
    ('platform_foundation.sql', 'table', null, 'public.tournament_members', null, null),
    ('platform_foundation.sql', 'table', null, 'public.tournament_players', null, null),
    ('platform_foundation.sql', 'table', null, 'public.edition_teams', null, null),
    ('platform_foundation.sql', 'table', null, 'public.edition_roster', null, null),
    ('platform_foundation.sql', 'table', null, 'public.edition_settings', null, null),
    ('platform_foundation.sql', 'table', null, 'public.edition_courses', null, null),
    ('platform_foundation.sql', 'table', null, 'public.edition_rounds', null, null),
    ('platform_foundation.sql', 'column', 'public.profiles', 'platform_role', null, null),
    ('platform_foundation.sql', 'constraint', 'public.profiles', 'profiles_platform_role_check', null, null),
    ('platform_foundation.sql', 'column', 'public.edition_settings', 'plan', null, null),
    ('platform_foundation.sql', 'constraint', 'public.edition_settings', 'edition_settings_plan_check', null, null),
    ('platform_foundation.sql', 'column', 'public.edition_settings', 'media', null, null),
    ('platform_foundation.sql', 'constraint', 'public.edition_settings', 'edition_settings_media_check', null, null),
    ('platform_foundation.sql', 'column', 'public.tournament_editions', 'published_at', null, null),
    ('platform_foundation.sql', 'index', 'public.tournaments', 'tournaments_organization_idx', null, null),
    ('platform_foundation.sql', 'index', 'public.tournament_editions', 'tournament_editions_legacy_slug_idx', null, null),
    ('platform_foundation.sql', 'index', 'public.tournament_members', 'tournament_members_profile_idx', null, null),
    ('platform_foundation.sql', 'index', 'public.edition_roster', 'edition_roster_team_idx', null, null),
    ('platform_editions.sql', 'constraint', 'public.tournament_editions', 'tournament_editions_id_season_year_key', null, null),
    ('platform_editions.sql', 'column', 'public.public', 'edition_id', null, null),
    ('platform_editions.sql', 'index', 'public.tournaments', 'tournaments_single_legacy_idx', null, null),
    ('platform_editions.sql', 'trigger', 'public.public', 'set_edition_id', null, null),
    ('platform_editions.sql', 'function', 'public', 'legacy_edition_id', 'fb82bdeac93d7890770ea36a53dcafa0', 'fb82bdeac93d7890770ea36a53dcafa0'),
    ('platform_editions.sql', 'function', 'public', 'set_legacy_edition_id', '1c473b180693a4822ce0816e3548ebd9', '1c473b180693a4822ce0816e3548ebd9'),
    ('platform_create_tournament.sql', 'function', 'public', 'create_tournament_shell', 'ddf0275dc7656baf8e2d686554b4ba45', 'ddf0275dc7656baf8e2d686554b4ba45'),
    ('platform_dashboard.sql', 'function', 'public', 'can_manage_edition', '65684ae63f9a33dbe8e2bd94fa46373e', '65684ae63f9a33dbe8e2bd94fa46373e'),
    ('platform_dashboard.sql', 'function', 'public', 'get_tournament_setup', '3e20ff4aee906d080aab11b033249837', '3e20ff4aee906d080aab11b033249837'),
    ('platform_dashboard.sql', 'function', 'public', 'save_tournament_section', 'f493560abae2b49230c5bfa3184c00f5', 'f493560abae2b49230c5bfa3184c00f5'),
    ('platform_dashboard.sql', 'function', 'public', 'set_edition_published', '99ee02381cbe68f5e99c20698a580f0f', '99ee02381cbe68f5e99c20698a580f0f'),
    ('platform_dashboard.sql', 'function', 'public', 'list_managed_editions', '760dd361280ee478b8dc14bddb541abf', '760dd361280ee478b8dc14bddb541abf'),
    ('platform_public_site.sql', 'function', 'public', 'can_view_tournament', 'ff3b95568c249c5ee46756c23f626bdc', 'bd29699bdeb16fe296546a94c275d57d'),
    ('platform_public_site.sql', 'function', 'public', 'get_public_tournament_years', '39c9db4b1b2b2a8c806fe825d3f96340', 'be398eedf2b9ab524ed08e619402148c'),
    ('platform_public_site.sql', 'function', 'public', 'tournament_site_projection', 'd3f5f653d69a5de9cd2b1fead0703115', 'd8c7f3e1e2674ba86992f9ed8c88ad55'),
    ('platform_public_site.sql', 'function', 'public', 'get_public_tournament_site', 'ce051c506a4fae0c974c3aaf037fa7c1', '7d90d92ad733405170ff137074164418'),
    ('platform_public_site.sql', 'function', 'public', 'get_tournament_site_preview', '86c8f8c4c1ca2e692ad667f386b12a65', 'e622aae8e76b86e3c7ccaa5292b6d279'),
    ('platform_access_requests.sql', 'table', null, 'public.tournament_access_requests', null, null),
    ('platform_access_requests.sql', 'index', 'public.tournament_access_requests', 'tournament_access_requests_one_pending', null, null),
    ('platform_access_requests.sql', 'index', 'public.tournament_access_requests', 'tournament_access_requests_status_idx', null, null),
    ('platform_access_requests.sql', 'function', 'public', 'can_create_tournament', 'd1a0734baae161723d841f27ef32091f', 'd1a0734baae161723d841f27ef32091f'),
    ('platform_access_requests.sql', 'function', 'public', 'get_my_tournament_access', 'f104c0c53a666be3cffd2dffd4d0160f', 'f104c0c53a666be3cffd2dffd4d0160f'),
    ('platform_access_requests.sql', 'function', 'public', 'submit_tournament_access_request', '71751081e1303aa94d223f1cbc0761e9', '71751081e1303aa94d223f1cbc0761e9'),
    ('platform_access_requests.sql', 'function', 'public', 'list_tournament_access_requests', '6019f791fecfe967108dd9e00fd8bfd4', '6019f791fecfe967108dd9e00fd8bfd4'),
    ('platform_access_requests.sql', 'function', 'public', 'review_tournament_access_request', 'd947b51175f0b7660a9d390377e0d75b', 'd947b51175f0b7660a9d390377e0d75b'),
    ('platform_past_editions.sql', 'function', 'public', 'list_my_past_editions', 'c01e97e4bb028cfa67f27fbb2b113b37', 'c01e97e4bb028cfa67f27fbb2b113b37'),
    ('platform_active_editions.sql', 'function', 'public', 'list_my_active_editions', 'a06792afab99990c9602dd666b8a0408', 'a06792afab99990c9602dd666b8a0408'),
    ('platform_activity.sql', 'table', null, 'public.tournament_activity', null, null),
    ('platform_activity.sql', 'constraint', 'public.tournament_activity', 'tournament_activity_type_check', null, null),
    ('platform_activity.sql', 'index', 'public.tournament_activity', 'tournament_activity_edition_idx', null, null),
    ('platform_activity.sql', 'function', 'public', 'get_tournament_activity', 'a71ccab23403acf6f959db086b531e9b', '85f4add9bb0c52c14c73101d9b563f3b'),
    ('platform_activity.sql', 'function', 'public', 'post_commissioner_announcement', '53526656eaf075da98b00600e58f44c3', 'dfa38872aea570d4fd67597ce407549d'),
    ('platform_activity.sql', 'function', 'public', 'record_edition_activity', '066ab9105f241db8909667ae70993ec1', 'a04aeabc33e8f03076aee26691bcbdab'),
    ('platform_next_edition.sql', 'function', 'public', 'get_next_edition_draft', 'e653e963aa1c6d35f3fdfe6742b25346', 'e653e963aa1c6d35f3fdfe6742b25346'),
    ('platform_next_edition.sql', 'function', 'public', 'create_next_edition', 'e84f0aaadc598e86bc8d34aa2dc3f214', 'e84f0aaadc598e86bc8d34aa2dc3f214'),
    ('profile_identity.sql', 'index', 'public.profiles', 'profiles_player_slug_key', null, null),
    ('profile_identity.sql', 'index', 'public.player_slots', 'player_slots_claimed_by_key', null, null),
    ('profile_identity.sql', 'index', 'public.tournament_players', 'tournament_players_tournament_profile_key', null, null),
    ('tournament_player_identity.sql', 'column', 'public.tournament_players', 'invite_token_hash', null, null),
    ('tournament_player_identity.sql', 'column', 'public.tournament_players', 'invited_by', null, null),
    ('tournament_player_identity.sql', 'column', 'public.tournament_players', 'claimed_at', null, null),
    ('tournament_player_identity.sql', 'column', 'public.tournament_players', 'declined_at', null, null),
    ('tournament_player_identity.sql', 'constraint', 'public.tournament_members', 'tournament_members_role_check', null, null),
    ('tournament_player_identity.sql', 'index', 'public.tournament_players', 'tournament_players_tournament_profile_key', null, null),
    ('tournament_player_identity.sql', 'index', 'public.tournament_players', 'tournament_players_invite_token_key', null, null),
    ('tournament_player_identity.sql', 'trigger', 'public.tournament_players', 'keep_tournament_player_profile', null, null),
    ('tournament_player_identity.sql', 'trigger', 'public.player_slots', 'sync_legacy_tournament_player_profile', null, null),
    ('tournament_player_identity.sql', 'function', 'public', 'keep_tournament_player_profile', '97e85798f975ff4e18ba77779e05dc61', '5831ed47a70a134eb02ac4c9095c33a6'),
    ('tournament_player_identity.sql', 'function', 'public', 'sync_legacy_tournament_player_profile', '386ef2352e808a326aca85125a8dc070', '645606cd396499fed40bf3e51fcc7f9a'),
    ('tournament_player_identity.sql', 'function', 'public', 'tournament_invite_hash', 'a094681f5cff9ac4ce3359f5f58fc393', '7c691f362441220e558a95cd1df4df81'),
    ('tournament_player_identity.sql', 'function', 'public', 'can_manage_tournament_players', 'fb31d0dd3df05c60e553c4940b76cab8', 'a3d54fd518e70c8831813bfd0db66bc5'),
    ('tournament_player_identity.sql', 'function', 'public', 'invite_tournament_player', 'd3013dab43aabd4c778fd103dd9024f9', 'c7fd78ac5905ff24eab73adcc972693f'),
    ('tournament_player_identity.sql', 'function', 'public', 'list_edition_player_invites', '3004aea0138a32a9621607896e5367ed', 'faafdea22513d8427d86fab8b14db81d'),
    ('tournament_player_identity.sql', 'function', 'public', 'list_tournament_player_pool', '0e9d743b9fe1631e88422b40824b89e4', '1bedc5762a2f2a95326f095f89d741cd'),
    ('tournament_player_identity.sql', 'function', 'public', 'decline_tournament_player_invitation', '8f9adb9e4f14f4b7e01872ee9bb1cd17', '5b00992790dd610fb2f5f3317658a8d7'),
    ('tournament_player_identity.sql', 'function', 'public', 'get_tournament_player_invitation', '0a2d3ef51fbffb081a26e59babb08096', 'e804471a003a7fc60737298c377ffd02'),
    ('tournament_player_identity.sql', 'function', 'public', 'accept_tournament_player_invitation', '4167b684235f7bcdf18d69223e425297', '465d9de7231529dce7b55444171ba2d2'),
    ('golf_trips.sql', 'table', null, 'public.golf_trips', null, null),
    ('golf_trips.sql', 'table', null, 'public.golf_trip_members', null, null),
    ('golf_trips.sql', 'table', null, 'public.golf_trip_rounds', null, null),
    ('golf_trips.sql', 'column', 'public.golf_trips', 'latitude', null, null),
    ('golf_trips.sql', 'column', 'public.golf_trips', 'longitude', null, null),
    ('golf_trips.sql', 'column', 'public.golf_trips', 'external_place_id', null, null),
    ('golf_trips.sql', 'constraint', 'public.golf_trips', 'golf_trips_coordinates_pair', null, null),
    ('golf_trips.sql', 'constraint', 'public.golf_trip_members', 'golf_trip_members_role_check', null, null),
    ('golf_trips.sql', 'index', 'public.golf_trips', 'golf_trips_created_by_idx', null, null),
    ('golf_trips.sql', 'index', 'public.golf_trip_members', 'golf_trip_members_trip_profile_idx', null, null),
    ('golf_trips.sql', 'index', 'public.golf_trip_members', 'golf_trip_members_profile_idx', null, null),
    ('golf_trips.sql', 'policy', 'public.golf_trips', 'golf_trips_select_members', null, null),
    ('golf_trips.sql', 'policy', 'public.golf_trip_rounds', 'golf_trip_rounds_select_members', null, null),
    ('golf_trips.sql', 'function', 'public', 'is_golf_trip_member', '8252230aaf6add8e20d3ef1ddf292214', 'e330856eaebd8a3eda6b746516ca195c'),
    ('golf_trips.sql', 'function', 'public', 'is_my_golf_trip_member', '61c93ce8c1e135460b59b6edb47f90a4', 'bc20e69a0f74429c2c9e4c193bf6587e'),
    ('golf_trips.sql', 'function', 'public', 'create_golf_trip', '1f08129e9b0793dc858c075c95403b27', 'a61345f402445d97ecaacf01cb589943'),
    ('golf_trips.sql', 'function', 'public', 'get_golf_trip', '59fb570aa74c089f2709aaf5faf4b0eb', '9e5eba8a5ea2806530196a260736456d'),
    ('golf_trips.sql', 'function', 'public', 'list_my_golf_trips', '14f100e81c914fe93d8fd5d8b030b90d', '4050228063b0510e1c867b1e5ae8dc93'),
    ('golf_trips.sql', 'function', 'public', 'delete_golf_trip', '1faf21503a667cd71a0af52d055d5fc1', '01f39d5782656baeb7aad3e4d6023973'),
    ('golf_trip_flights.sql', 'table', null, 'public.golf_trip_flights', null, null),
    ('golf_trip_flights.sql', 'index', 'public.golf_trip_flights', 'golf_trip_flights_member_idx', null, null),
    ('golf_trip_flights.sql', 'index', 'public.golf_trip_flights', 'golf_trip_flights_trip_idx', null, null),
    ('golf_trip_flights.sql', 'policy', 'public.golf_trip_flights', 'golf_trip_flights_select_own', null, null),
    ('golf_trip_flights.sql', 'function', 'public', 'golf_trip_member_id', '3c2c3189b072c802dee2e0834a9abdd6', 'd3c10c00a5b17492e5a36206aeb1f58e'),
    ('golf_trip_flights.sql', 'function', 'public', 'list_my_golf_trip_flights', 'b6235c3dc7c623885acb957c63486fbe', '640674dc5852d50befbcf4788e6ac071'),
    ('golf_trip_flights.sql', 'function', 'public', 'save_golf_trip_flight', '4539944fbce1c135f560ce4de16b76ff', '07122c035fae93a4ef86a12500155fa4'),
    ('golf_trip_flights.sql', 'function', 'public', 'delete_golf_trip_flight', '4cd53d427ab3713256aa840a6dcbc6bb', 'fd78be9b097312eaab1c78496ea5aa41'),
    ('golf_trip_invitations.sql', 'column', 'public.golf_trip_members', 'invite_token_hash', null, null),
    ('golf_trip_invitations.sql', 'column', 'public.golf_trip_members', 'invited_by', null, null),
    ('golf_trip_invitations.sql', 'column', 'public.golf_trip_members', 'claimed_at', null, null),
    ('golf_trip_invitations.sql', 'column', 'public.golf_trip_members', 'declined_at', null, null),
    ('golf_trip_invitations.sql', 'index', 'public.golf_trip_members', 'golf_trip_members_one_organizer_key', null, null),
    ('golf_trip_invitations.sql', 'index', 'public.golf_trip_members', 'golf_trip_members_trip_email_key', null, null),
    ('golf_trip_invitations.sql', 'index', 'public.golf_trip_members', 'golf_trip_members_invite_token_key', null, null),
    ('golf_trip_invitations.sql', 'trigger', 'public.golf_trip_members', 'keep_golf_trip_member_profile', null, null),
    ('golf_trip_invitations.sql', 'function', 'public', 'keep_golf_trip_member_profile', '3f5b888956e975d53339d60b587fc3e2', '3c7793874d9c288119d78aa3efecbb34'),
    ('golf_trip_invitations.sql', 'function', 'public', 'golf_trip_invite_hash', 'a094681f5cff9ac4ce3359f5f58fc393', '7c691f362441220e558a95cd1df4df81'),
    ('golf_trip_invitations.sql', 'function', 'public', 'invite_golf_trip_member', 'd52892339c1dcda755a588e20ef9290a', '94419efa854fa78407a53067b6a2257d'),
    ('golf_trip_invitations.sql', 'function', 'public', 'get_golf_trip_invitation', 'c86de6dc65be710b8e3e9e9f59ff59cb', 'cbbd492ca93a9d2a730aa23f4efc9790'),
    ('golf_trip_invitations.sql', 'function', 'public', 'accept_golf_trip_invitation', '51f07500f0acb0e0bf855633f2d2e3dd', '47028403c98f3602352f4d6eccd8b9f5'),
    ('golf_trip_invitations.sql', 'function', 'public', 'decline_golf_trip_invitation', '682adb64e0bc2b33d8cc530b3a313bfc', '2fe80051e4fc2aa4680b6f66b1661481'),
    ('golf_trip_invitations.sql', 'function', 'public', 'regenerate_golf_trip_invite', 'a09ec19868fe75cacc49b0b8522c323b', '83cf6db332569115c441fa7732eccb20'),
    ('golf_trip_invitations.sql', 'function', 'public', 'remove_golf_trip_member', 'b1c364817f6620e946e598d92d109897', '0e18eef6d231648c6a2e147b31b5a709'),
    ('golf_trip_invitations.sql', 'function', 'public', 'leave_golf_trip', '1d17a6067302921dff79e5de60ae9649', '8b17277e7d0dcf2c8ec6c164b8e384a3'),
    ('golf_trip_setup.sql', 'table', null, 'public.golf_trip_setup', null, null),
    ('golf_trip_setup.sql', 'table', null, 'public.golf_trip_personal_plans', null, null),
    ('golf_trip_setup.sql', 'function', 'public', 'save_golf_trip_setup', '3650efd6dcff08510234c81ff55220f9', '3650efd6dcff08510234c81ff55220f9'),
    ('golf_trip_setup.sql', 'function', 'public', 'save_golf_trip_personal_plans', 'bf48b067343ee6b103f4c955d4e96de9', 'bf48b067343ee6b103f4c955d4e96de9'),
    ('golf_trip_scoring.sql', 'table', null, 'public.scoring_groups', null, null),
    ('golf_trip_scoring.sql', 'table', null, 'public.scoring_group_players', null, null),
    ('golf_trip_scoring.sql', 'table', null, 'public.hole_score_entries', null, null),
    ('golf_trip_scoring.sql', 'index', 'public.scoring_groups', 'scoring_groups_trip_idx', null, null),
    ('golf_trip_scoring.sql', 'index', 'public.scoring_group_players', 'scoring_group_players_profile_idx', null, null),
    ('golf_trip_scoring.sql', 'index', 'public.hole_score_entries', 'hole_score_entries_scored_idx', null, null),
    ('golf_trip_scoring.sql', 'policy', 'public.scoring_groups', 'scoring_groups_select', null, null),
    ('golf_trip_scoring.sql', 'policy', 'public.scoring_group_players', 'scoring_group_players_select', null, null),
    ('golf_trip_scoring.sql', 'policy', 'public.hole_score_entries', 'hole_score_entries_select', null, null),
    ('golf_trip_scoring.sql', 'function', 'public', 'is_scoring_group_player', 'f1a12e885acf28c6c81c452b29c8b447', 'f1a12e885acf28c6c81c452b29c8b447'),
    ('golf_trip_scoring.sql', 'function', 'public', 'can_see_scoring_group', 'bfd773e6587975794422855609c9b2a8', 'bfd773e6587975794422855609c9b2a8'),
    ('golf_trip_scoring.sql', 'function', 'public', 'get_trip_round_scoring', 'eb5e08b1dcf0b846b18780fb8e83ba04', 'eb5e08b1dcf0b846b18780fb8e83ba04'),
    ('golf_trip_scoring.sql', 'function', 'public', 'save_trip_scoring_groups', '47395a22e185fc55c074c3388023921a', '47395a22e185fc55c074c3388023921a'),
    ('golf_trip_scoring.sql', 'function', 'public', 'save_hole_scores', '0b9b9e1735d401507eac806fa6a7c8b5', '0b9b9e1735d401507eac806fa6a7c8b5'),
    ('golf_trip_scoring_submission.sql', 'table', null, 'public.scorecard_submissions', null, null),
    ('golf_trip_scoring_submission.sql', 'index', 'public.scorecard_submissions', 'scorecard_submissions_trip_idx', null, null),
    ('golf_trip_scoring_submission.sql', 'policy', 'public.scorecard_submissions', 'scorecard_submissions_select', null, null),
    ('golf_trip_scoring_submission.sql', 'function', 'public', 'submit_trip_scorecard', '5ac53da078d7017d0b9d2159e874fd6f', '5ac53da078d7017d0b9d2159e874fd6f'),
    ('golf_trip_scoring_offline.sql', 'column', 'public.hole_score_entries', 'last_op_id', null, null),
    ('golf_trip_scoring_offline.sql', 'function', 'public', 'save_hole_score_ops', 'e70be65c5edb5a898d1bee95cd80c009', 'e70be65c5edb5a898d1bee95cd80c009'),
    ('golf_trip_scoring_fix_groups.sql', 'function', 'public', 'save_trip_scoring_groups', '47395a22e185fc55c074c3388023921a', '47395a22e185fc55c074c3388023921a'),
    ('golf_trip_scoring_corrections.sql', 'table', null, 'public.scorecard_submission_revisions', null, null),
    ('golf_trip_scoring_corrections.sql', 'table', null, 'public.scorecard_correction_requests', null, null),
    ('golf_trip_scoring_corrections.sql', 'column', 'public.scorecard_submissions', 'revision', null, null),
    ('golf_trip_scoring_corrections.sql', 'column', 'public.scorecard_submissions', 'reopened_at', null, null),
    ('golf_trip_scoring_corrections.sql', 'constraint', 'public.scorecard_correction_requests', 'scorecard_correction_requests_denial_reason', null, null),
    ('golf_trip_scoring_corrections.sql', 'column', 'public.hole_score_entries', 'correction_request_id', null, null),
    ('golf_trip_scoring_corrections.sql', 'index', 'public.scorecard_correction_requests', 'scorecard_correction_requests_open_idx', null, null),
    ('golf_trip_scoring_corrections.sql', 'trigger', 'public.scorecard_submission_revisions', 'scorecard_revisions_immutable', null, null),
    ('golf_trip_scoring_corrections.sql', 'trigger', 'public.hole_score_entries', 'hole_score_entries_correction_guard', null, null),
    ('golf_trip_scoring_corrections.sql', 'policy', 'public.scorecard_submission_revisions', 'scorecard_submission_revisions_select', null, null),
    ('golf_trip_scoring_corrections.sql', 'policy', 'public.scorecard_correction_requests', 'scorecard_correction_requests_select', null, null),
    ('golf_trip_scoring_corrections.sql', 'function', 'public', 'scorecard_revisions_immutable', '1a7da0c94f2b96d55374c72c428d7d09', '1a7da0c94f2b96d55374c72c428d7d09'),
    ('golf_trip_scoring_corrections.sql', 'function', 'public', 'can_view_scorecard_corrections', '9aedd220268b92c5d81048e0bf304489', '9aedd220268b92c5d81048e0bf304489'),
    ('golf_trip_scoring_corrections.sql', 'function', 'public', 'hole_score_entries_correction_guard', '71e7b6b772c1e8488bee7709f9bdb9e7', '71e7b6b772c1e8488bee7709f9bdb9e7'),
    ('golf_trip_scoring_corrections.sql', 'function', 'public', 'can_decide_scorecard_correction', '2e3cbae0ac9f8e66d690951dd7d8745a', '2e3cbae0ac9f8e66d690951dd7d8745a'),
    ('golf_trip_scoring_corrections.sql', 'function', 'public', 'correction_request_json', '15acdac87e6abbe71613818a23360dbc', '15acdac87e6abbe71613818a23360dbc'),
    ('golf_trip_scoring_corrections.sql', 'function', 'public', 'correction_request_view', '1841c2efc4001dee71e96765a54a961a', '1841c2efc4001dee71e96765a54a961a'),
    ('golf_trip_scoring_corrections.sql', 'function', 'public', 'request_scorecard_correction', '2108539696716bc82ce0539d9ab0eb80', '2108539696716bc82ce0539d9ab0eb80'),
    ('golf_trip_scoring_corrections.sql', 'function', 'public', 'decide_scorecard_correction', '94d293887065063262e50365f3d5f92b', '94d293887065063262e50365f3d5f92b'),
    ('golf_trip_scoring_corrections.sql', 'function', 'public', 'submission_revision_view', 'a387342126d2b0825bba13f74388481c', 'a387342126d2b0825bba13f74388481c'),
    ('golf_trip_scoring_corrections.sql', 'function', 'public', 'get_scorecard_corrections', 'e723bc1759f93205879263174ee433b8', 'e723bc1759f93205879263174ee433b8'),
    ('golf_trip_scoring_corrections.sql', 'function', 'public', 'list_trip_corrections', '89feecb754d682abbe77c0d0a953fb37', '89feecb754d682abbe77c0d0a953fb37'),
    ('golf_trip_scoring_corrections.sql', 'function', 'public', 'trip_submission_round', 'd8572a60fe26992604890f95986ac6c6', 'd8572a60fe26992604890f95986ac6c6'),
    ('golf_trip_scoring_corrections.sql', 'function', 'public', 'publish_trip_submission', 'b295883cd913e8f1906127cdda92dfa1', 'b295883cd913e8f1906127cdda92dfa1'),
    ('golf_trip_scoring_corrections.sql', 'function', 'public', 'submit_trip_scorecard', '891f8ce296df9f43a636619abc820909', '891f8ce296df9f43a636619abc820909'),
    ('golf_trip_scoring_corrections.sql', 'function', 'public', 'save_hole_score_ops', '641ebc08637d10a81852fdbcb595335d', '641ebc08637d10a81852fdbcb595335d'),
    ('golf_trip_scoring_corrections.sql', 'function', 'public', 'save_hole_scores', '1aa741aef40f9674eeaa4dc9e1899478', '1aa741aef40f9674eeaa4dc9e1899478'),
    ('golf_trip_momentum.sql', 'table', null, 'public.trip_push_subscriptions', null, null),
    ('golf_trip_momentum.sql', 'table', null, 'public.trip_momentum_events', null, null),
    ('golf_trip_momentum.sql', 'table', null, 'public.trip_push_deliveries', null, null),
    ('golf_trip_momentum.sql', 'column', 'public.trip_momentum_events', 'cause', null, null),
    ('golf_trip_momentum.sql', 'column', 'public.trip_momentum_events', 'subject_name', null, null),
    ('golf_trip_momentum.sql', 'column', 'public.trip_momentum_events', 'withdrawn_at', null, null),
    ('golf_trip_momentum.sql', 'column', 'public.trip_momentum_events', 'result_label', null, null),
    ('golf_trip_momentum.sql', 'column', 'public.golf_trip_rounds', 'momentum_pars', null, null),
    ('golf_trip_momentum.sql', 'index', 'public.trip_momentum_events', 'trip_momentum_recent', null, null),
    ('golf_trip_momentum.sql', 'trigger', 'public.hole_score_entries', 'trip_momentum_score', null, null),
    ('golf_trip_momentum.sql', 'trigger', 'public.scoring_group_players', 'trip_momentum_submission', null, null),
    ('golf_trip_momentum.sql', 'trigger', 'public.hole_score_entries', 'trip_confirmed_moments', null, null),
    ('golf_trip_momentum.sql', 'trigger', 'public.live_match_official_state', 'trip_early_match', null, null),
    ('golf_trip_momentum.sql', 'function', 'public', 'queue_trip_momentum', 'd70622a6e874ca1eda4f7aa4d11e4849', 'd70622a6e874ca1eda4f7aa4d11e4849'),
    ('golf_trip_momentum.sql', 'function', 'public', 'queue_trip_submission', '371835a3a8ec381dfee4a1e58fd6ea17', '371835a3a8ec381dfee4a1e58fd6ea17'),
    ('golf_trip_momentum.sql', 'function', 'public', 'claim_trip_push', 'db6c34379e5f423b29b28de6c5df8cda', 'db6c34379e5f423b29b28de6c5df8cda'),
    ('golf_trip_momentum.sql', 'function', 'public', 'save_trip_push', 'a02e0a572206aab6f254a1d5712726d1', 'a02e0a572206aab6f254a1d5712726d1'),
    ('golf_trip_momentum.sql', 'function', 'public', 'queue_trip_confirmed_moments', 'eb270656a8a562e892a41e39725a74a5', 'eb270656a8a562e892a41e39725a74a5'),
    ('golf_trip_momentum.sql', 'function', 'public', 'set_trip_momentum_pars', '6671bbce062544272fb3931ed75e1b23', '6671bbce062544272fb3931ed75e1b23'),
    ('golf_trip_momentum.sql', 'function', 'public', 'queue_trip_early_match', 'dbde291c046b3f770478365bbec30320', 'dbde291c046b3f770478365bbec30320'),
    ('player_rounds.sql', 'table', null, 'public.player_rounds', null, null),
    ('player_rounds.sql', 'column', 'public.player_rounds', 'golf_trip_id', null, null),
    ('player_rounds.sql', 'column', 'public.player_rounds', 'golf_trip_round_id', null, null),
    ('player_rounds.sql', 'column', 'public.player_rounds', 'edition_id', null, null),
    ('player_rounds.sql', 'column', 'public.player_rounds', 'edition_round_id', null, null),
    ('player_rounds.sql', 'column', 'public.player_rounds', 'tournament_player_id', null, null),
    ('player_rounds.sql', 'column', 'public.player_rounds', 'personal_round_id', null, null),
    ('player_rounds.sql', 'column', 'public.player_rounds', 'scorecard_submission_id', null, null),
    ('player_rounds.sql', 'column', 'public.player_rounds', 'submission_revision', null, null),
    ('player_rounds.sql', 'column', 'public.player_rounds', 'visibility', null, null),
    ('player_rounds.sql', 'column', 'public.player_rounds', 'removed_from_profile', null, null),
    ('player_rounds.sql', 'column', 'public.player_rounds', 'updated_at', null, null),
    ('player_rounds.sql', 'constraint', 'public.player_rounds', 'player_rounds_source_identity', null, null),
    ('player_rounds.sql', 'constraint', 'public.player_rounds', 'player_rounds_source_check', null, null),
    ('player_rounds.sql', 'column', 'public.player_rounds', 'provenance', null, null),
    ('player_rounds.sql', 'column', 'public.player_rounds', 'imported_at', null, null),
    ('player_rounds.sql', 'constraint', 'public.player_rounds', 'player_rounds_legacy_provenance', null, null),
    ('player_rounds.sql', 'column', 'public.profiles', 'rounds_visibility', null, null),
    ('player_rounds.sql', 'constraint', 'public.profiles', 'profiles_rounds_visibility_check', null, null),
    ('player_rounds.sql', 'index', 'public.player_rounds', 'player_rounds_profile_idx', null, null),
    ('player_rounds.sql', 'index', 'public.player_rounds', 'player_rounds_submission_idx', null, null),
    ('player_rounds.sql', 'function', 'public', 'player_round_json', 'c2723cbc89832499b6234087cd0342a6', '748a6a2006e1e6e6bab0591df9c01edd'),
    ('player_rounds.sql', 'function', 'public', 'assert_player_round', '4503a5288cf3f20c7d1ae9d44f999a94', '8e6f21ecef29f592e07282136f111210'),
    ('player_rounds.sql', 'function', 'public', 'save_player_round', '9bfd3f90d58fb3241efa268a7f54d44f', '6e8cab95c908318d5d666b69096277eb'),
    ('player_rounds.sql', 'function', 'public', 'list_my_player_rounds', '6c3e29f5fcde74ac2fb18bd39dee7460', '3eb1143bc83a85bc2151118f072581c1'),
    ('player_rounds.sql', 'function', 'public', 'publish_player_round', '2989de76366709a03797fdd21c5f8cf7', '5dab0b2e898addafa3f9e654c53c4a53'),
    ('player_rounds.sql', 'function', 'public', 'list_profile_rounds', '299ddb39b2b8e22be2a7f25160a747e8', '4242a3087e91197b7c9c3a24a4e9d3b6'),
    ('player_rounds.sql', 'function', 'public', 'get_rounds_visibility', 'c4682274b5bfb4c42f49cc089ff84362', 'd99e82204dec73aea2b8df4f1aa968b7'),
    ('player_rounds.sql', 'function', 'public', 'set_rounds_visibility', '752e396d0674689edee1e54d49f5f33a', '71a960b1d8e16b76004eecd4055aa7b5'),
    ('profile_read_model.sql', 'function', 'public', 'get_profile_history', 'cccac704aa225d783d556651d3f1d526', 'f764f8caf551660831a7b027486c9d61'),
    ('profile_v1.sql', 'column', 'public.profiles', 'bio', null, null),
    ('profile_v1.sql', 'constraint', 'public.profiles', 'profiles_bio_length', null, null),
    ('profile_v1.sql', 'function', 'public', 'profile_username_problem', '5df816031496d630b2e00d77fe0e7c59', '5df816031496d630b2e00d77fe0e7c59'),
    ('profile_v1.sql', 'function', 'public', 'profile_display_name_problem', '414d794d35548099f862819eef7966a2', '414d794d35548099f862819eef7966a2'),
    ('profile_v1.sql', 'function', 'public', 'create_my_profile', '4bdc3ff36b71308e919d4ef8d28f9ed3', '4bdc3ff36b71308e919d4ef8d28f9ed3'),
    ('profile_v1.sql', 'function', 'public', 'update_my_profile', 'ea25829a977479d06f55c2911c24dca8', 'ea25829a977479d06f55c2911c24dca8'),
    ('profile_v1.sql', 'function', 'public', 'profile_id_for_username', '0e4996be51866f133b01cbe6f833e758', '0e4996be51866f133b01cbe6f833e758'),
    ('profile_v1.sql', 'function', 'public', 'list_edition_player_profiles', '7ebadde85a9bd2dc44231970889c92f4', '7ebadde85a9bd2dc44231970889c92f4'),
    ('profile_photos.sql', 'column', 'public.profiles', 'avatar_path', null, null),
    ('profile_photos.sql', 'bucket', 'storage.buckets', 'profile-photos', null, null),
    ('shared_rounds.sql', 'table', null, 'public.shared_rounds', null, null),
    ('shared_rounds.sql', 'table', null, 'public.shared_round_players', null, null),
    ('shared_rounds.sql', 'table', null, 'public.shared_round_holes', null, null),
    ('shared_rounds.sql', 'table', null, 'public.shared_round_picks', null, null),
    ('shared_rounds.sql', 'index', 'public.shared_round_players', 'shared_round_players_invites', null, null),
    ('shared_rounds.sql', 'function', 'public', 'shared_round_active_count', '9bed2b51068be6b42fb292d6bd3b61c2', '3203a81410de5f1461f54a3d02506c2f'),
    ('shared_rounds.sql', 'function', 'public', 'shared_round_is_host', 'd7d2fa6498469aa63e43613b8637c711', '28afb72b5c9ad4db71450bcc276a3185'),
    ('shared_rounds.sql', 'function', 'public', 'create_shared_round', '2a9290b6ffa2f8e5f7c557b569e848c8', '3e5e1a3b270b6300faf0895d33ceee08'),
    ('shared_rounds.sql', 'function', 'public', 'invite_to_shared_round', '23d5f8e6c8b828938d24bafaa060ad31', 'e57ce7f17be1aeec30a42c9bb08fecdc'),
    ('shared_rounds.sql', 'function', 'public', 'remove_from_shared_round', 'b7bebf9b7ac6a566a72229672c35b636', '56edee72b6b88c7a54cdbc108580ab09'),
    ('shared_rounds.sql', 'function', 'public', 'answer_shared_round_invite', '3ae0711f916148ab7581a8ff6abfcf2a', '9a4e3b72c755628d58e9884fabc809e0'),
    ('shared_rounds.sql', 'function', 'public', 'list_my_round_invites', '30ff6decc1a58546f87dd2a5d6e4f6c8', '14e90144c8ca4b9d6e361e6107238a2c'),
    ('shared_rounds.sql', 'function', 'public', 'get_shared_round', '72494d5b678acd2759a342ea132b03de', '6e9a7fa4bd3502aa4b3563c162ebf444'),
    ('shared_rounds.sql', 'function', 'public', 'my_live_shared_round', '37e00077fa9e17c41d181b7757f23dfb', '40b7d1f064279f28ad348af0feca0b4e'),
    ('shared_rounds.sql', 'function', 'public', 'set_shared_round_strokes', '26a4ecfd7d751b97ead4243fd6fcd142', '68b81845aa78426ca7d69ba7f687d774'),
    ('shared_rounds.sql', 'function', 'public', 'set_shared_round_pick', '81184a253ef8d3d5c69ae42b0a9b9cae', 'c4105bf2a39d3d7181eb4325bb721631'),
    ('shared_rounds.sql', 'function', 'public', 'update_shared_round', 'b364f5efe8fbee02975436b26ef4bc7c', '5d6d6b0d40b8e35f2862e34166e7b12d'),
    ('historical_import.sql', 'table', null, 'public.historical_imports', null, null),
    ('historical_import.sql', 'table', null, 'public.historical_events', null, null),
    ('historical_import.sql', 'table', null, 'public.historical_participants', null, null),
    ('historical_import.sql', 'table', null, 'public.historical_editions', null, null),
    ('historical_import.sql', 'table', null, 'public.historical_roster', null, null),
    ('historical_import.sql', 'table', null, 'public.historical_rounds', null, null),
    ('historical_import.sql', 'table', null, 'public.historical_scores', null, null),
    ('historical_import.sql', 'table', null, 'public.historical_matches', null, null),
    ('historical_import.sql', 'table', null, 'public.historical_link_requests', null, null),
    ('historical_import.sql', 'table', null, 'public.historical_link_events', null, null),
    ('historical_import.sql', 'index', 'public.historical_participants', 'historical_participants_profile_idx', null, null),
    ('historical_import.sql', 'index', 'public.historical_participants', 'historical_participants_linked_idx', null, null),
    ('historical_import.sql', 'index', 'public.historical_link_requests', 'historical_link_requests_open_idx', null, null),
    ('historical_import.sql', 'trigger', 'public.historical_link_events', 'historical_link_events_append_only', null, null),
    ('historical_import.sql', 'function', 'public', 'historical_link_events_append_only', '4c378dfc44c62ec2093f4bacecc362c1', '2c5e3244ee56c4f6a3c640208b134a51'),
    ('historical_import.sql', 'function', 'public', 'is_platform_admin', '8fc6c3636c45cb48e5dcea196237dd88', '7f330492f7fe1580a371d9eac63c88c6'),
    ('historical_import.sql', 'function', 'public', 'import_historical_package', 'dae39fdc40ee06595f1d064583d188dd', 'd1377706b4eeabc635f2baee2bc40cb6'),
    ('historical_import.sql', 'function', 'public', 'historical_link_check', '836df90201499eec0534f9a017ea2940', '4d43de4b05cb52d15ff7bea8ef82f5a9'),
    ('historical_import.sql', 'function', 'public', 'can_manage_historical_event', '9ac371188d78ff7ff6c381475c486198', '7b864bac97e82821198407adebb58ed2'),
    ('historical_import.sql', 'function', 'public', 'propose_historical_link', '26c26dd373ff57afcf0112c1a769dc8a', 'f35f7cac283b20051c517cc013c6db64'),
    ('historical_import.sql', 'function', 'public', 'request_historical_link', '6b529e44f54fda01479ba05bbb44fe88', 'a8351b0518dd562ff5e40a69274d1786'),
    ('historical_import.sql', 'function', 'public', 'answer_historical_link', 'f8fbf8a61127e48e51e4e88245689ffe', '5139fc962f69e2f9dab6420b3ac9dd7e'),
    ('historical_import.sql', 'function', 'public', 'admin_link_historical_participant', 'ba8909bdcfed1c1aeeca97657d493bef', '179d3444af9496b24d6d1e7a93ebfce4'),
    ('historical_import.sql', 'function', 'public', 'unlink_historical_participant', '098c481c21bb0d6cee419354aeec260a', 'e351ef53b215e06732a873fd1a0570d1'),
    ('historical_import.sql', 'function', 'public', 'list_profile_historical_rounds', '01dd65ec4e6f0f6821934f5714ffb978', 'bef23a0ea0d6e246cf4b8408224ed6ff'),
    ('historical_import.sql', 'function', 'public', 'list_historical_participants', 'fafdbcb48794fedbd5f98d9cafde161d', '0b6afb93b7c5bbccb92be3a82ed0eeac'),
    ('legacy_round_import.sql', 'function', 'public', 'legacy_own_ball_format', '83da576a3d91d9535c8633d4203054e7', 'dbc05c519a3608ddd5193e2f60004b7f'),
    ('legacy_round_import.sql', 'function', 'public', 'legacy_player_mapping', '37f39aed56bac19d14d6ee17d6255100', '5f2e0dace59772488fd365f341a19ebf'),
    ('legacy_round_import.sql', 'function', 'public', 'legacy_round_candidates', '605a5df4f18a3c0958daa1c8282ba521', 'cf8d86de9ba402ee8112c3c3bed2ff04'),
    ('legacy_round_import.sql', 'function', 'public', 'import_legacy_rounds', '091f1aa667a31c02f89a2e8744d68bd4', '92444e0da511a3f4f21880eb6d5223bf')
),
fn as (
  select n.nspname as schema, p.proname as name, md5(p.prosrc) as fp
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname not in ('pg_catalog', 'information_schema')
),
checked as (
  select e.*,
    case e.kind
      when 'table' then to_regclass(e.name) is not null
      when 'column' then exists (select 1 from information_schema.columns c
        where c.table_schema = split_part(e.parent, '.', 1) and c.table_name = split_part(e.parent, '.', 2) and c.column_name = e.name)
      when 'index' then exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where c.relkind in ('i', 'I') and c.relname = e.name and n.nspname = split_part(e.parent, '.', 1))
      when 'constraint' then exists (select 1 from pg_constraint con join pg_class r on r.oid = con.conrelid join pg_namespace n on n.oid = r.relnamespace
        where con.conname = e.name and r.relname = split_part(e.parent, '.', 2) and n.nspname = split_part(e.parent, '.', 1))
      when 'trigger' then exists (select 1 from pg_trigger t join pg_class r on r.oid = t.tgrelid join pg_namespace n on n.oid = r.relnamespace
        where not t.tgisinternal and t.tgname = e.name and r.relname = split_part(e.parent, '.', 2) and n.nspname = split_part(e.parent, '.', 1))
      when 'policy' then exists (select 1 from pg_policies p
        where p.schemaname = split_part(e.parent, '.', 1) and p.tablename = split_part(e.parent, '.', 2) and p.policyname = e.name)
      when 'bucket' then exists (select 1 from storage.buckets b where b.id = e.name)
      when 'function' then exists (select 1 from fn where fn.schema = e.parent and fn.name = e.name)
    end as present,
    case when e.kind = 'function' then exists (select 1 from fn where fn.schema = e.parent and fn.name = e.name and fn.fp in (e.fp_lf, e.fp_raw)) end as exact,
    case when e.kind = 'function' then (
      select string_agg(distinct o.file, ', ' order by o.file) from expected o
      where o.kind = 'function' and o.parent = e.parent and o.name = e.name and o.file <> e.file
        and exists (select 1 from fn where fn.schema = o.parent and fn.name = o.name and fn.fp in (o.fp_lf, o.fp_raw))
    ) end as matches_other,
    case when e.kind = 'function' then (
      select string_agg(distinct o.file, ', ' order by o.file) from expected o
      where o.kind = 'function' and o.parent = e.parent and o.name = e.name and o.file <> e.file
    ) end as also_defined_in
  from expected e
),
detail_rows as (
  select 2 as section_order, 'B. Object check' as section, file, kind,
    coalesce(parent || ' / ', '') || name as object,
    case
      when not present then 'missing'
      when kind <> 'function' then 'present'
      when exact then 'exact'
      when matches_other is not null then 'other file'
      else 'unknown version'
    end as status,
    concat_ws('; ',
      case when kind = 'function' and matches_other is not null then 'installed text matches: ' || matches_other end,
      case when kind = 'function' and also_defined_in is not null then 'also defined in: ' || also_defined_in end) as detail
  from checked
),
file_summary as (
  select file,
    count(*) as objects,
    count(*) filter (where present) as present,
    count(*) filter (where kind = 'function') as fns,
    count(*) filter (where kind = 'function' and present and exact) as fn_exact,
    count(*) filter (where kind = 'function' and present and not exact and matches_other is not null) as fn_other,
    count(*) filter (where kind = 'function' and present and not exact and matches_other is null) as fn_unknown,
    count(*) filter (where not present) as missing
  from checked group by file
),
summary_rows as (
  select 1 as section_order, 'A. File verdict' as section, file, 'file' as kind, file as object,
    case
      when present = 0 then 'NOT INSTALLED'
      when missing > 0 then 'PARTIAL'
      when fn_unknown > 0 then 'PRESENT, DIFFERENT VERSION'
      when fns > 0 and fn_exact = fns then 'PROVEN (current version)'
      when fns > 0 and fn_exact + fn_other = fns then 'PRESENT (some functions replaced by other files)'
      else 'PRESENT (existence only, not proof)'
    end as status,
    format('%s/%s objects present; functions: %s exact, %s other file, %s unknown version; %s missing',
      present, objects, fn_exact, fn_other, fn_unknown, missing) as detail
  from file_summary
),
migration_log as (
  select 3 as section_order, 'C. Migration log' as section, null::text as file, 'log' as kind,
    'supabase_migrations.schema_migrations' as object,
    case when to_regclass('supabase_migrations.schema_migrations') is null then 'absent' else 'exists' end as status,
    case when to_regclass('supabase_migrations.schema_migrations') is null
      then 'No CLI migration history: file-by-file proof must come from section A/B.'
      else 'rows: ' || (xpath('/row/c/text()', query_to_xml('select count(*) as c from supabase_migrations.schema_migrations', false, true, '')))[1]::text
    end as detail
),
table_rows as (
  select 4 as section_order, 'D. Public tables (RLS)' as section, null::text as file, 'table' as kind,
    'public.' || c.relname as object,
    case
      when not c.relrowsecurity and (has_table_privilege('anon', c.oid, 'select,insert,update,delete')
        or has_table_privilege('authenticated', c.oid, 'select,insert,update,delete')) then 'RLS OFF - OPEN TO BROWSER KEYS'
      when not c.relrowsecurity then 'RLS off (no browser grants)'
      else 'RLS on'
    end as status,
    format('policies=%s; anon=%s; authenticated=%s; est_rows=%s',
      (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname),
      concat_ws(',', case when has_table_privilege('anon', c.oid, 'select') then 'select' end,
        case when has_table_privilege('anon', c.oid, 'insert') then 'insert' end,
        case when has_table_privilege('anon', c.oid, 'update') then 'update' end,
        case when has_table_privilege('anon', c.oid, 'delete') then 'delete' end),
      concat_ws(',', case when has_table_privilege('authenticated', c.oid, 'select') then 'select' end,
        case when has_table_privilege('authenticated', c.oid, 'insert') then 'insert' end,
        case when has_table_privilege('authenticated', c.oid, 'update') then 'update' end,
        case when has_table_privilege('authenticated', c.oid, 'delete') then 'delete' end),
      greatest(c.reltuples, 0)::bigint) as detail
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
),
fk_rows as (
  select 5 as section_order, 'E. Links to accounts/profiles' as section, null::text as file, 'foreign key' as kind,
    r.relname || '.' || con.conname as object,
    'on delete ' || case con.confdeltype when 'a' then 'NO ACTION (blocks delete)' when 'r' then 'RESTRICT (blocks delete)'
      when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT' end as status,
    pg_get_constraintdef(con.oid) as detail
  from pg_constraint con join pg_class r on r.oid = con.conrelid
  where con.contype = 'f' and con.confrelid in (to_regclass('public.profiles'), to_regclass('auth.users'))
),
definer_rows as (
  select 6 as section_order, 'F. SECURITY DEFINER functions' as section, null::text as file, 'function' as kind,
    p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as object,
    case
      when has_function_privilege('anon', p.oid, 'execute') then 'callable by anon (signed-out browsers)'
      when has_function_privilege('authenticated', p.oid, 'execute') then 'callable by signed-in browsers'
      else 'server only (service role)'
    end as status,
    case when exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) s where s like 'search_path=%')
      then 'search_path pinned' else 'search_path NOT pinned' end as detail
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
),
trigger_rows as (
  select 7 as section_order, 'G. Triggers on accounts/profiles' as section, null::text as file, 'trigger' as kind,
    n.nspname || '.' || r.relname || ' / ' || t.tgname as object,
    case t.tgenabled when 'D' then 'disabled' else 'enabled' end as status,
    'calls ' || t.tgfoid::regproc::text as detail
  from pg_trigger t join pg_class r on r.oid = t.tgrelid join pg_namespace n on n.oid = r.relnamespace
  where not t.tgisinternal and t.tgrelid in (to_regclass('auth.users'), to_regclass('public.profiles'))
),
bucket_rows as (
  select 8 as section_order, 'H. Storage buckets' as section, null::text as file, 'bucket' as kind, b.id as object,
    case when b.public then 'public read' else 'private' end as status,
    format('file_size_limit=%s; types=%s', b.file_size_limit, array_to_string(b.allowed_mime_types, ',')) as detail
  from storage.buckets b
),
count_rows as (
  select 9 as section_order, 'I. Counts (numbers only)' as section, null::text as file, 'count' as kind, label as object,
    case when ready then (xpath('/row/c/text()', query_to_xml(sql, false, true, '')))[1]::text else 'table not installed' end as status,
    note as detail
  from (values
    ('accounts (auth.users)', to_regclass('auth.users') is not null, 'select count(*) as c from auth.users', 'login accounts'),
    ('accounts not yet email-verified', to_regclass('auth.users') is not null, 'select count(*) as c from auth.users where email_confirmed_at is null', 'signed up, never verified'),
    ('accounts with NO profile', to_regclass('public.profiles') is not null, 'select count(*) as c from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id)', 'need Finish setup (recovery path)'),
    ('profiles', to_regclass('public.profiles') is not null, 'select count(*) as c from public.profiles', ''),
    ('profiles linked to a legacy player slot', to_regclass('public.profiles') is not null, 'select count(*) as c from public.profiles where player_slug is not null', 'old Maroon identity'),
    ('profiles with an auto-made username (golfer_...)', to_regclass('public.profiles') is not null, 'select count(*) as c from public.profiles where username like ''golfer\_%''', 'never finished choosing a username'),
    ('golf trips', to_regclass('public.golf_trips') is not null, 'select count(*) as c from public.golf_trips', ''),
    ('golf trip member rows', to_regclass('public.golf_trip_members') is not null, 'select count(*) as c from public.golf_trip_members', 'includes pending invitations'),
    ('saved player rounds', to_regclass('public.player_rounds') is not null, 'select count(*) as c from public.player_rounds', ''),
    ('tournament players', to_regclass('public.tournament_players') is not null, 'select count(*) as c from public.tournament_players', '')
  ) as t(label, ready, sql, note)
)
select section, file, kind, object, status, detail from (
  select * from summary_rows
  union all select * from detail_rows
  union all select * from migration_log
  union all select * from table_rows
  union all select * from fk_rows
  union all select * from definer_rows
  union all select * from trigger_rows
  union all select * from bucket_rows
  union all select * from count_rows
) everything
order by section_order, file nulls first, kind, object;
