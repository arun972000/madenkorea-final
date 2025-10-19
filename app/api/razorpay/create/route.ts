import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const { order_id } = await req.json();

    if (!order_id) {
      return NextResponse.json({ error: 'order_id required' }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! // server-only secret
    );

    // 1) Fetch order header (must exist & be pending)
    const { data: order, error: ordErr } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, total, currency, status')
      .eq('id', order_id)
      .maybeSingle();

    if (ordErr || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    if (order.status !== 'pending_payment') {
      return NextResponse.json({ error: `Order status is ${order.status}` }, { status: 400 });
    }
    if (!order.total || Number(order.total) <= 0) {
      return NextResponse.json({ error: 'Invalid order total' }, { status: 400 });
    }

    // 2) Create Razorpay order
    const key_id = process.env.RAZORPAY_KEY_ID!;
    const key_secret = process.env.RAZORPAY_KEY_SECRET!;
    const auth = Buffer.from(`${key_id}:${key_secret}`).toString('base64');

    const body = {
      amount: Math.round(Number(order.total) * 100), // paise
      currency: order.currency || 'INR',
      receipt: order.order_number,
      payment_capture: 1,
    };

    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const rzp = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: rzp }, { status: 400 });
    }

    // 3) Persist payment_order
    await supabaseAdmin.from('payment_orders').insert({
      order_id: order.id,
      provider: 'razorpay',
      provider_order_id: rzp.id,        // "order_xxx"
      amount: order.total,
      currency: order.currency || 'INR',
      status: rzp.status || 'created',
      receipt: order.order_number,
    });

    // 4) Return public key + Razorpay order to client
    return NextResponse.json({
      key: key_id,
      order_id: order.id,
      razorpay_order: rzp,               // includes id, amount, currency, status
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 });
  }
}
