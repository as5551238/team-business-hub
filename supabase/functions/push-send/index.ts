/**
 * Supabase Edge Function: push-send
 * 向指定用户发送 Web Push 通知
 *
 * 调用方式: POST /functions/v1/push-send
 * Body: { "userId": "xxx", "title": "提醒", "body": "你有新任务", "url": "/tasks", "actions": [...] }
 *
 * 需要设置以下 Secrets:
 *   VAPID_PUBLIC_KEY  — VAPID 公钥
 *   VAPID_PRIVATE_KEY — VAPID 私钥
 *   VAPID_SUBJECT     — mailto:your@email.com
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webPush from 'https://esm.sh/web-push@3.6.7';

interface PushRequest {
  userId?: string;
  endpoint?: string; // 发给特定端点
  title: string;
  body: string;
  url?: string;
  actions?: { action: string; title: string }[];
  tag?: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
      },
    });
  }

  try {
    const { userId, endpoint, title, body, url, actions, tag }: PushRequest = await req.json();

    if (!title || !body) {
      return new Response(JSON.stringify({ error: 'title and body are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Configure web-push with VAPID
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:as5551238@126.com';

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(JSON.stringify({ error: 'VAPID keys not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Query subscriptions
    let query = supabase.from('push_subscriptions').select('endpoint, p256dh, auth');
    if (userId) {
      query = query.eq('user_id', userId);
    } else if (endpoint) {
      query = query.eq('endpoint', endpoint);
    } else {
      return new Response(JSON.stringify({ error: 'userId or endpoint is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data: subscriptions, error: dbError } = await query;
    if (dbError) {
      return new Response(JSON.stringify({ error: dbError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: 'No subscriptions found' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Build push payload
    const payload = JSON.stringify({
      title,
      body,
      url: url || '/tasks',
      actions: actions || [
        { action: 'complete', title: '完成' },
        { action: 'snooze', title: '稍后提醒' },
      ],
      tag: tag || 'tbh-notification',
    });

    // Send push to all matching subscriptions
    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
          {
            TTL: 86400, // 1 day
            urgency: 'normal',
          },
        ),
      ),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    // Remove invalid subscriptions (410 Gone / 404 Not Found)
    const invalidEndpoints = results
      .map((r, i) => (r.status === 'rejected' ? subscriptions[i].endpoint : null))
      .filter(Boolean);

    if (invalidEndpoints.length > 0) {
      await supabase.from('push_subscriptions').delete().in('endpoint', invalidEndpoints);
    }

    return new Response(
      JSON.stringify({ sent: succeeded, failed, removed: invalidEndpoints.length }),
      { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
