-- Photo framing, 2026-10-26: where each photo is centered and how far it's zoomed in, set by dragging and pinching
-- on the edit page. Nothing is cut from the photo itself; the site frames it with these numbers wherever it shows.
-- A framing is {"x": 0-100, "y": 0-100, "z": 1-4}: the point of the photo kept in place (from its left and top
-- edges, in percent) and the zoom. Empty means centered, not zoomed.
alter table public.animals add column if not exists photo_frame jsonb check (photo_frame is null or jsonb_typeof(photo_frame) = 'object');
alter table public.goals add column if not exists photo_frame jsonb check (photo_frame is null or jsonb_typeof(photo_frame) = 'object');
alter table public.collabs add column if not exists photo_frame jsonb check (photo_frame is null or jsonb_typeof(photo_frame) = 'object');
alter table public.videos add column if not exists photo_frame jsonb check (photo_frame is null or jsonb_typeof(photo_frame) = 'object');
alter table public.places add column if not exists photo_frame jsonb check (photo_frame is null or jsonb_typeof(photo_frame) = 'object');
-- a day out's photos, by their address: {"https://…": {"x": 50, "y": 30, "z": 1.4}}
alter table public.adventures add column if not exists frames jsonb not null default '{}'::jsonb check (jsonb_typeof(frames) = 'object');
-- Photos added to the pages keep their framing with each photo ({"url", "alt", "w", "h", "x", "y", "z"}), and
-- full width, small and beside-the-text photos can be cut to a shape: the photo's own, square, wide (16:9) or tall (4:5).
alter table public.page_photos add column if not exists shape text not null default 'original' check (shape in ('original', 'square', 'wide', 'tall'));
