-- supabase/profile_photos.sql
-- Profile photos (Settings → Profile photo). Each profile can have one photo, stored in the public-read
-- "profile-photos" storage bucket at <profile id>/<time>.<ext>; profiles.avatar_path points at the current one.
--
-- Access: photos are public to read (they show on profiles, like any profile picture). Nobody uploads from the browser:
-- the server checks the signed-in user, the file type and size, then uploads with the service-role key
-- (lib/profile/profilePhoto.ts, app/api/account/photo/route.ts). Privacy still applies on the page: a Private profile's
-- photo isn't shown to other people.
--
-- Prerequisite: schema.sql (profiles). Safe to run more than once.
-- Undo: alter table public.profiles drop column if exists avatar_path;  (and delete the bucket in Storage)

begin;

alter table public.profiles add column if not exists avatar_path text check (avatar_path is null or (length(avatar_path) between 1 and 300));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

commit;
