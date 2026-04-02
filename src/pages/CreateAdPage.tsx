import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { incrementCoins, platformSpendCoins, revertPlatformSpend } from '../lib/coinsWallet';
import { resolveStorageExtension, storageUploadContentType } from '../lib/storageUpload';

const AD_DURATION_OPTIONS = [
  { days: 1, coins: 50 },
  { days: 3, coins: 120 },
  { days: 7, coins: 200 },
  { days: 30, coins: 600 },
] as const;

function adCostForDays(days: number): number {
  if (days === 1) return 50;
  if (days === 3) return 120;
  if (days === 7) return 200;
  if (days === 30) return 600;
  return 50;
}

/** Comma-separated list: safe when value is undefined/null. */
function splitCommaTags(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((i) => i.trim())
    .filter(Boolean);
}

export default function CreateAdPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: '',
    linkUrl: '',
    targetCountry: '',
    targetInterest: '',
    targetMinAge: '',
    targetMaxAge: '',
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [durationDays, setDurationDays] = useState<number>(1);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const safeTitle = (form.title ?? '').trim();
    const safeLink = (form.linkUrl ?? '').trim();
    if (!safeLink) {
      alert('Please add a link URL');
      return;
    }
    if (!imageFile) {
      alert('Please upload an image');
      return;
    }

    setSubmitting(true);
    let deducted = false;
    const adCostCoins = adCostForDays(durationDays);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const authUser = authData.user;
      if (!authUser?.id) {
        alert('Please login first');
        return;
      }

      const spend = await platformSpendCoins(authUser.id, adCostCoins, 'ads');
      if (!spend.ok) {
        alert(spend.error === 'insufficient_coins' ? 'Not enough coins' : spend.error || 'Payment failed');
        return;
      }
      deducted = true;

      const ext = resolveStorageExtension(imageFile);
      const path = `ads/${authUser.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('posts').upload(path, imageFile, {
        upsert: false,
        cacheControl: '3600',
        contentType: storageUploadContentType(imageFile),
      });
      if (uploadError) throw uploadError;

      const { data: pub } = supabase.storage.from('posts').getPublicUrl(path);
      const imageUrl = pub?.publicUrl || '';
      if (!imageUrl) throw new Error('Failed to build ad image URL');

      const endsAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
      const countryTags = splitCommaTags(form.targetCountry);
      const interestTags = splitCommaTags(form.targetInterest);
      const targetCountryStored = countryTags.length ? countryTags.join(', ') : null;
      const targetInterestStored = interestTags.length ? interestTags.join(', ') : null;
      const minAgeRaw = (form.targetMinAge ?? '').trim();
      const maxAgeRaw = (form.targetMaxAge ?? '').trim();
      const { error: insertError } = await supabase.from('ads').insert({
        user_id: authUser.id,
        title: safeTitle || null,
        image_url: imageUrl,
        link_url: safeLink,
        is_active: true,
        status: 'approved',
        ends_at: endsAt,
        target_country: targetCountryStored,
        target_interest: targetInterestStored,
        target_min_age: minAgeRaw ? Number(minAgeRaw) : null,
        target_max_age: maxAgeRaw ? Number(maxAgeRaw) : null,
      });
      if (insertError) throw insertError;

      alert('Your ad is live.');
      navigate('/profile');
    } catch (err: any) {
      if (deducted) {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData.user?.id;
        if (uid) {
          await incrementCoins(uid, adCostCoins);
          await revertPlatformSpend(adCostCoins);
        }
      }
      alert(err?.message || 'Failed to submit ad');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-4 md:p-8">
      <h1 className="text-2xl font-black mb-2">Create Ad</h1>
      <p className="text-sm text-gray-500 mb-6">
        Submitting an ad costs {adCostForDays(durationDays)} coins. It goes live in the feed after payment.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-bold">Title</label>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Optional ad title"
            className="mt-1 w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm font-bold">Link URL</label>
          <input
            value={form.linkUrl}
            onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))}
            placeholder="https://example.com"
            className="mt-1 w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm font-bold">Duration</label>
          <select
            value={durationDays}
            onChange={(e) => setDurationDays(Number(e.target.value) || 1)}
            className="mt-1 w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
          >
            {AD_DURATION_OPTIONS.map((opt) => (
              <option key={opt.days} value={opt.days}>
                {opt.days} day{opt.days > 1 ? 's' : ''} - {opt.coins} coins
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-bold">Target Country (optional)</label>
          <select
            value={form.targetCountry}
            onChange={(e) => setForm((f) => ({ ...f, targetCountry: e.target.value }))}
            className="mt-1 w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
          >
            <option value="">Any country</option>
            <option value="US">United States</option>
            <option value="CA">Canada</option>
            <option value="BR">Brazil</option>
            <option value="FR">France</option>
            <option value="IN">India</option>
            <option value="HT">Haiti</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-bold">Target Interest (optional)</label>
          <input
            value={form.targetInterest}
            onChange={(e) => setForm((f) => ({ ...f, targetInterest: e.target.value }))}
            placeholder="e.g. sports, music"
            className="mt-1 w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-bold">Min age (optional)</label>
            <input
              type="number"
              min={0}
              value={form.targetMinAge}
              onChange={(e) => setForm((f) => ({ ...f, targetMinAge: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-bold">Max age (optional)</label>
            <input
              type="number"
              min={0}
              value={form.targetMaxAge}
              onChange={(e) => setForm((f) => ({ ...f, targetMaxAge: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="text-sm font-bold">Image</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setImageFile(e.target.files?.[0] || null)}
            className="mt-1 block w-full text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-indigo-600 text-white py-2.5 font-bold disabled:opacity-50"
        >
          {submitting ? 'Submitting...' : `Submit Ad (${adCostForDays(durationDays)} coins)`}
        </button>
      </form>
    </div>
  );
}
