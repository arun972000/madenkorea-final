export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      app_order_id,
      method,
      raw
    } = await req.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !app_order_id) {
      return NextResponse.json({ ok: false, error: 'Missing fields' }, { status: 400 });
    }

    // Verify signature
    const secret = process.env.RAZORPAY_KEY_SECRET!;
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const expected = hmac.digest('hex');
    if (expected !== razorpay_signature) {
      return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 400 });
    }

    // Admin client
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Fetch amount/currency for record & get order_number for redirect
    const { data: ord } = await admin
      .from('orders')
      .select('id, total, currency, order_number')
      .eq('id', app_order_id)
      .maybeSingle();

    const amount = Number(ord?.total ?? 0);
    const currency = ord?.currency || 'INR';
    const orderNumber = ord?.order_number ?? '';

    const payload = raw ?? { razorpay_order_id, razorpay_payment_id, razorpay_signature };

    const { error: rpcErr } = await admin.rpc('mark_order_paid', {
      p_order_id: app_order_id,
      p_provider_order_id: razorpay_order_id,
      p_provider_payment_id: razorpay_payment_id,
      p_signature: razorpay_signature,
      p_method: method ?? null,
      p_amount: amount,
      p_currency: currency,
      p_raw: payload
    });
    if (rpcErr) {
      return NextResponse.json({ ok: false, error: rpcErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, order_id: app_order_id, order_number: orderNumber });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Failed' }, { status: 500 });
  }
}
