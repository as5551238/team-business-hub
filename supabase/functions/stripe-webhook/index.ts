/**
 * Supabase Edge Function: stripe-webhook
 * 处理 Stripe Webhook 事件，更新 subscriptions 表
 *
 * 部署方式: supabase functions deploy stripe-webhook
 * 环境变量: STRIPE_WEBHOOK_SECRET, STRIPE_SECRET_KEY
 *
 * 支持事件:
 *   - checkout.session.completed → 创建/激活订阅
 *   - customer.subscription.updated → 更新订阅
 *   - customer.subscription.deleted → 取消订阅
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Stripe } from 'https://esm.sh/stripe@14?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
    const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Verify webhook signature
    const body = await req.text()
    const signature = req.headers.get('stripe-signature')!
    const event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET)

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const teamId = session.client_reference_id
        if (!teamId) break

        const subscription = await stripe.subscriptions.retrieve(session.subscription as string)
        const tier = subscription.metadata.tier || 'pro'
        const billing = subscription.metadata.billing || 'monthly'

        await supabase.from('subscriptions').upsert({
          team_id: teamId,
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: subscription.id,
          tier,
          billing_cycle: billing,
          status: 'active',
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        }, { onConflict: 'team_id' })
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        await supabase.from('subscriptions').update({
          status: subscription.status === 'active' ? 'active' : subscription.status,
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        }).eq('stripe_subscription_id', subscription.id)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        await supabase.from('subscriptions').update({
          status: 'canceled',
        }).eq('stripe_subscription_id', subscription.id)
        break
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err) {
    console.error('Webhook error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
