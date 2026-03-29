/**
 * Vercel Serverless Function — Stripe webhook (Web Request API, no Express).
 * Raw body via request.text(); verify with STRIPE_WEBHOOK_SECRET.
 */
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!stripeSecret || !webhookSecret) {
    return Response.json({ error: 'Stripe webhook not configured' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return Response.json({ error: 'Missing stripe-signature' }, { status: 400 });
  }

  const rawBody = await request.text();

  const stripe = new Stripe(stripeSecret);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.warn('[stripe-webhook] signature verification failed', err);
    return new Response('Webhook signature verification failed', { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    console.log(
      '[stripe-webhook] checkout.session.completed',
      'session_id:',
      session.id,
      'amount_total:',
      session.amount_total,
      'customer_email:',
      session.customer_email
    );

    const meta = session.metadata ?? {};
    const userId = typeof meta.user_id === 'string' ? meta.user_id.trim() : '';
    const coinsRaw = typeof meta.coins === 'string' ? meta.coins.trim() : '';
    const coins = coinsRaw ? parseInt(coinsRaw, 10) : NaN;

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (userId && Number.isFinite(coins) && coins > 0 && supabaseUrl && serviceKey) {
      const admin = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await admin.rpc('credit_wallet_coins', { p_user_id: userId, p_amount: coins });
      if (error) {
        console.error('[stripe-webhook] credit_wallet_coins failed', error);
      }
    } else if (userId && Number.isFinite(coins) && coins > 0) {
      console.warn('[stripe-webhook] Supabase service role or URL missing — wallet not credited');
    }
  }

  return Response.json({ received: true }, { status: 200 });
}
