-- supabase/maroon_theme_colors.sql
-- The Maroon Tournament's theme colors → the approved preset
-- (MAROON_THEME_PRESET in lib/theme/tournamentTheme.ts; a test keeps the two in sync).
--   primary #500001 (maroon), secondary #f7f4ee (cream), accent #d6a75c (gold)
--   Team Maroon #500001, Team White #f7f4ee
-- Replaces the original seed values (secondary/Team White #fbf8f1, accent #b8945a).
-- Data only, no schema change. Other branding keys (logoUrl, etc.) are kept.
--
-- PREPARED, NOT RUN. Apply only after the backup/restore and production
-- migration process is approved.
--
-- Prerequisites: platform_foundation.sql. Safe to run more than once.

begin;

update public.tournaments
set branding = branding || jsonb_build_object('primary', '#500001', 'secondary', '#f7f4ee', 'accent', '#d6a75c'),
    updated_at = now()
where slug = 'the-maroon-tournament';

update public.edition_teams et
set color = case et.key when 'maroon' then '#500001' when 'white' then '#f7f4ee' end
from public.tournament_editions e
join public.tournaments t on t.id = e.tournament_id and t.slug = 'the-maroon-tournament'
where et.edition_id = e.id and et.key in ('maroon', 'white');

commit;
