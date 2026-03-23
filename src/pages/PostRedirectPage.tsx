import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

/**
 * Resolves /post/:id to the author's profile with ?post= for deep-linking.
 */
export default function PostRedirectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!id) {
      navigate('/', { replace: true });
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: post } = await supabase.from('posts').select('user_id').eq('id', id).maybeSingle();
      if (cancelled) return;
      if (!post?.user_id) {
        navigate('/', { replace: true });
        return;
      }
      navigate(`/profile/${post.user_id}?post=${encodeURIComponent(id)}`, { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-gray-500">
      Opening post…
    </div>
  );
}
