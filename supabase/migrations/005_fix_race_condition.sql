-- Fix race condition in get_or_create_active_session
-- Uses ON CONFLICT DO NOTHING and re-selects if insert fails

CREATE OR REPLACE FUNCTION public.get_or_create_active_session(
  p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id UUID;
BEGIN
  -- Try to find existing active session first
  SELECT id INTO v_session_id
  FROM public.sessions
  WHERE user_id = p_user_id
    AND status = 'active'
  LIMIT 1;

  -- If found, return it
  IF v_session_id IS NOT NULL THEN
    RETURN v_session_id;
  END IF;

  -- Try to insert, handling race condition
  -- The unique index prevents duplicates, so we catch the conflict
  BEGIN
    INSERT INTO public.sessions (user_id, status)
    VALUES (p_user_id, 'active')
    RETURNING id INTO v_session_id;
  EXCEPTION WHEN unique_violation THEN
    -- Race condition: another request created it, select again
    SELECT id INTO v_session_id
    FROM public.sessions
    WHERE user_id = p_user_id
      AND status = 'active'
    LIMIT 1;
  END;

  RETURN v_session_id;
END;
$$;
