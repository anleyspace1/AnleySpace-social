CREATE UNIQUE INDEX IF NOT EXISTS reports_unique_user_post
ON public.reports (reporter_id, post_id);
