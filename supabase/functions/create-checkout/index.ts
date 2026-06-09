/**
 * Supabase Edge Function: create-checkout
 * 创建 Stripe Checkout Session
 *
 * 部署方式: supabase functions deploy create-checkout
 * 环境变量: STRIPE_SECRET_KEY
 *
 * 调用: supabase.rpc('create-checkout', { p_team_id, p_tier, p_billing })
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Stripe } from 'https://esm.sh/stripe@14?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PRICES: Record<string, Record<string, string>> = {
  pro: {
    monthly: Deno.env.get('STRIPE_PRO_MONTHLY_PRICE_ID') || '',
    yearly: Deno.env.get('STRIPE_PRO_YEARLY_PRICE_ID') || '',
  },
  enterprise: {
    monthly: Deno.env.get('STRIPE_ENTERPRISE_MONTHLY_PRICE_ID') || '',
    yearly: Deno.env.get('STRIPE_ENTERPRISE_YEARLY_PRICE_ID') || '',
  },
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })

    const { p_team_id, p_tier, p_billing } = await req.json()
    const priceId = PRICES[p_tier]?.[p_billing]

    if (!priceId) {
      return new Response(JSON.stringify({ error: 'Invalid tier or billing cycle' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: p_team_id,
      success_url: `${req.headers.get('origin')}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get('origin')}/admin?tab=billing&checkout=canceled`,
      subscription_data: {
        metadata: { tier: p_tier, billing: p_billing, team_id: p_team_id },
      },
    })

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
