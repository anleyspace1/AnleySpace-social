DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_behavior_action_type_check'
      AND conrelid = 'public.user_behavior'::regclass
  ) THEN
    ALTER TABLE public.user_behavior
      DROP CONSTRAINT user_behavior_action_type_check;
  END IF;
END$$;

ALTER TABLE public.user_behavior
  ADD CONSTRAINT user_behavior_action_type_check
  CHECK (action_type IN ('like', 'view', 'comment', 'follow', 'share'));
