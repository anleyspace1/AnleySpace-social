import React, { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import type { ActiveAdRow } from '../lib/activeAds';

type AdCardProps = {
  ad: Pick<ActiveAdRow, 'id' | 'title' | 'image_url' | 'link_url' | 'clicks'>;
  /** Card wrapper classes (e.g. Home `homeCard` vs Reels dark). */
  className?: string;
  imageClassName?: string;
  /** Home feed vs Reels (dark) styling. */
  tone?: 'light' | 'dark';
};

/**
 * Sponsored feed unit: image, title, link; tracks impression + click via RPC / fallback update.
 */
export function AdCard({ ad, className, imageClassName, tone = 'light' }: AdCardProps) {
  const title = String(ad.title || 'Sponsored').trim() || 'Sponsored';

  useEffect(() => {
    let cancelled = false;
    const trackImpression = async () => {
      if (cancelled) return;
      try {
        await supabase.rpc('increment_ads_impressions', { p_ad_id: ad.id });
      } catch {
        /* non-fatal */
      }
    };
    void trackImpression();
    return () => {
      cancelled = true;
    };
  }, [ad.id]);

  const handleAdClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    try {
      await supabase.rpc('increment_ads_clicks', { p_ad_id: ad.id });
    } catch {
      const { data } = await supabase.from('ads').select('clicks').eq('id', ad.id).maybeSingle();
      const nextClicks = Number((data as { clicks?: number | null } | null)?.clicks ?? ad.clicks ?? 0) + 1;
      await supabase.from('ads').update({ clicks: nextClicks }).eq('id', ad.id);
    } finally {
      window.open(ad.link_url, '_blank', 'noopener,noreferrer');
    }
  };

  const dark = tone === 'dark';
  return (
    <article className={cn('overflow-hidden', className)}>
      <a
        href={ad.link_url}
        target="_blank"
        rel="noreferrer noopener"
        className="block"
        onClick={handleAdClick}
      >
        <img
          src={ad.image_url}
          alt={title}
          className={cn('w-full max-h-[360px] object-cover', imageClassName)}
          referrerPolicy="no-referrer"
        />
        <div className="p-3">
          <p
            className={cn(
              'text-[10px] font-black uppercase tracking-wider',
              dark ? 'text-indigo-400' : 'text-indigo-600 dark:text-indigo-400'
            )}
          >
            Sponsored
          </p>
          <p
            className={cn(
              'mt-1 text-sm font-semibold',
              dark ? 'text-white' : 'text-gray-900 dark:text-gray-100'
            )}
          >
            {title}
          </p>
        </div>
      </a>
    </article>
  );
}
