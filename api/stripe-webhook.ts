/**
 * Vercel Serverless Function — Stripe webhook (Web Request API, no Express).
 * Raw body via request.text(); verify with STRIPE_WEBHOOK_SECRET.
 */
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { parseCheckoutCreditMetadata } from '../src/lib/stripeCheckoutMetadata';

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
    console.log('[stripe-webhook:vercel] checkout.session.completed', {
      session_id: session.id,
      mode: session.mode,
      amount_total: session.amount_total,
      payment_status: session.payment_status,
      client_reference_id: session.client_reference_id,
      metadata: session.metadata,
    });

    if (session.mode !== 'payment' || session.payment_status !== 'paid') {
      console.warn('[stripe-webhook:vercel] skip credit — not a paid payment session', {
        mode: session.mode,
        payment_status: session.payment_status,
      });
    } else {
      const parsed = parseCheckoutCreditMetadata(session.metadata ?? undefined);
      if (!parsed) {
        console.error('[stripe-webhook:vercel] invalid or unsafe metadata — NOT crediting', {
          session_id: session.id,
          metadata: session.metadata,
        });
      } else if (session.client_reference_id && session.client_reference_id !== parsed.userId) {
        console.error('[stripe-webhook:vercel] client_reference_id mismatch metadata.user_id — NOT crediting', {
          session_id: session.id,
          client_reference_id: session.client_reference_id,
          metadata_user_id: parsed.userId,
        });
      } else {
        const { userId, coins } = parsed;
        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceKey) {
          console.error('[stripe-webhook:vercel] Supabase URL or SUPABASE_SERVICE_ROLE_KEY missing — NOT crediting');
        } else {
          const admin = createClient(supabaseUrl, serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          console.log('[stripe-webhook:vercel] crediting single user', {
            session_id: session.id,
            userId,
            coins,
          });
          const { error } = await admin.rpc('credit_wallet_coins', {
            p_user_id: userId,
            p_amount: coins,
            p_stripe_session_id: session.id,
          });
          if (error) {
            console.error('[stripe-webhook:vercel] credit_wallet_coins failed', error);
          } else {
            console.log('[stripe-webhook:vercel] credit_wallet_coins success', { userId, coins, session_id: session.id });
          }
        }
      }
    }
  } else {
    console.log('[stripe-webhook:vercel] event type (ignored for credit):', event.type);
  }

  return Response.json({ received: true }, { status: 200 });
}
