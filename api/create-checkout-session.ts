/**
 * Vercel serverless: Stripe Checkout for coin packages (same behavior as server.ts POST /api/create-checkout-session).
 * Deployed only on Vercel; local dev still uses Express in server.ts (Vite proxies /api → :3000).
 */
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const STRIPE_COIN_PACKAGES: Record<number, { cents: number }> = {
  100: { cents: 500 },
  250: { cents: 1000 },
  700: { cents: 2000 },
};

function getSupabaseAnon() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function getAuthUserIdFromJwtHeader(authorization: string | undefined): Promise<string | null> {
  const token =
    typeof authorization === 'string' && authorization.startsWith('Bearer ')
      ? authorization.slice(7).trim()
      : null;
  const supabase = getSupabaseAnon();
  if (!supabase || !token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  const id = String(data.user.id).trim();
  return id || null;
}

function getRequestOrigin(req: VercelRequest): string {
  const xfProto = req.headers['x-forwarded-proto'];
  const xfHost = req.headers['x-forwarded-host'];
  const protoFirst =
    typeof xfProto === 'string' ? xfProto.split(',')[0].trim() : Array.isArray(xfProto) ? xfProto[0] : '';
  const hostFirst =
    typeof xfHost === 'string' ? xfHost.split(',')[0].trim() : Array.isArray(xfHost) ? xfHost[0] : '';
  if (hostFirst) {
    const proto = protoFirst || 'https';
    return `${proto}://${hostFirst}`;
  }
  const host = req.headers.host;
  if (!host) return '';
  return `${protoFirst || 'https'}://${host}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  console.log('[create-checkout-session:vercel] request received', {
    method: req.method,
    hasBody: req.body != null,
  });

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!stripeSecretKey) {
    console.error('[create-checkout-session:vercel] STRIPE_SECRET_KEY missing');
    res.status(503).json({ error: 'Stripe not configured' });
    return;
  }

  const stripe = new Stripe(stripeSecretKey);

  try {
    const authHeader = req.headers.authorization;
    const authorization = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    const userId = await getAuthUserIdFromJwtHeader(authorization);
    if (!userId) {
      console.warn('[create-checkout-session:vercel] Unauthorized — no valid Bearer token');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const body = req.body as { coinsPackage?: unknown } | undefined;
    const rawPkg = body?.coinsPackage;
    const pkgKey = typeof rawPkg === 'string' ? parseInt(rawPkg, 10) : Number(rawPkg);

    console.log('[create-checkout-session:vercel] coins value', {
      rawPkg,
      pkgKey,
      userIdPrefix: userId.slice(0, 8),
    });

    if (!Number.isFinite(pkgKey) || pkgKey <= 0) {
      res.status(400).json({ error: 'Invalid coins package' });
      return;
    }

    const pkg = STRIPE_COIN_PACKAGES[pkgKey];
    if (!pkg || ![100, 250, 700].includes(pkgKey)) {
      res.status(400).json({ error: 'Invalid coins package' });
      return;
    }

    const baseRaw =
      (process.env.NEXT_PUBLIC_APP_URL && String(process.env.NEXT_PUBLIC_APP_URL).trim()) ||
      (process.env.APP_URL && String(process.env.APP_URL).trim()) ||
      (process.env.CLIENT_URL && String(process.env.CLIENT_URL).trim()) ||
      getRequestOrigin(req) ||
      '';
    const base = baseRaw.replace(/\/$/, '') || 'http://localhost:5173';

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: { name: `${pkgKey} AnleySpace coins` },
              unit_amount: pkg.cents,
            },
            quantity: 1,
          },
        ],
        success_url: `${base}/wallet?purchase=success`,
        cancel_url: `${base}/wallet?purchase=cancel`,
        metadata: {
          user_id: userId,
          coins: String(pkgKey),
        },
      });
      console.log('[create-checkout-session:vercel] Stripe session created:', session.id);
      if (!session.url) {
        res.status(500).json({ error: 'No checkout URL from Stripe' });
        return;
      }
      res.status(200).json({ url: session.url });
    } catch (err: unknown) {
      console.error('[create-checkout-session:vercel] Stripe error:', err);
      const message =
        err instanceof Stripe.errors.StripeError
          ? err.message
          : err instanceof Error
            ? err.message
            : typeof err === 'object' &&
                err !== null &&
                'message' in err &&
                typeof (err as { message: unknown }).message === 'string'
              ? (err as { message: string }).message
              : 'Checkout failed';
      res.status(500).json({ error: message });
    }
  } catch (e: unknown) {
    console.error('[create-checkout-session:vercel] unexpected:', e);
    const message = e instanceof Error ? e.message : 'Checkout failed';
    res.status(500).json({ error: message });
  }
}
