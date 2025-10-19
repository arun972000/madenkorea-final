'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { CustomerLayout } from '@/components/CustomerLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useCart } from '@/lib/contexts/CartContext';
import { createClient } from '@supabase/supabase-js';
import { toast } from 'sonner';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

function formatINR(v?: number | null, currency?: string | null) {
  if (v == null) return '';
  const code = (currency ?? 'INR').toUpperCase();
  if (code === 'INR') return `₹${v.toLocaleString('en-IN')}`;
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(v); }
  catch { return `${code} ${v.toLocaleString()}`; }
}

function storagePublicUrl(path?: string | null) {
  if (!path) return null;
  const { data } = supabase.storage.from('product-media').getPublicUrl(path);
  return data.publicUrl ?? null;
}

export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const router = useRouter();
  const { ready, isAuthenticated } = useAuth();
  const { addItem } = useCart();

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [invoice, setInvoice] = useState<any | null>(null);
  const [payment, setPayment] = useState<any | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated) {
      router.replace(`/auth/login?redirect=/account/orders/${orderId}`);
      return;
    }
    (async () => {
      setLoading(true);
      // header + payment + invoice
      const { data: ord } = await supabase
        .from('orders')
        .select('id, order_number, status, currency, subtotal, shipping_fee, discount_total, total, address_snapshot, created_at')
        .eq('id', orderId)
        .maybeSingle();
      setOrder(ord);

      const [{ data: its }, { data: pays }, { data: invs }] = await Promise.all([
        supabase.from('order_items').select('product_id, sku, name, quantity, unit_price, mrp, line_total, hero_image_path').eq('order_id', orderId),
        supabase.from('payments').select('*').eq('order_id', orderId).order('created_at', { ascending: false }).limit(1),
        supabase.from('invoices').select('*').eq('order_id', orderId).limit(1)
      ]);
      setItems(its ?? []);
      setPayment((pays ?? [])[0] ?? null);
      setInvoice((invs ?? [])[0] ?? null);
      setLoading(false);
    })();
  }, [ready, isAuthenticated, orderId, router]);

  const statusVariant = (s?: string) =>
    s === 'delivered' ? 'default'
    : s === 'shipped' ? 'secondary'
    : s === 'processing' || s === 'paid' || s === 'pending_payment'
      ? 'outline'
      : 'outline';

  const itemCount = useMemo(() => items.reduce((n, i) => n + (i.quantity || 1), 0), [items]);

  if (!ready) {
    return (
      <CustomerLayout>
        <div className="container mx-auto py-16 text-muted-foreground">Loading order…</div>
      </CustomerLayout>
    );
  }
  if (!isAuthenticated) return null;

  return (
    <CustomerLayout>
      <div className="container mx-auto py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Order {order?.order_number}</h1>
            <p className="text-muted-foreground">
              Placed on {order ? new Date(order.created_at).toLocaleDateString('en-IN', { year:'numeric', month:'long', day:'numeric' }) : '--'}
            </p>
          </div>
          {order && <Badge variant={statusVariant(order.status)}>{order.status}</Badge>}
        </div>

        {/* Summary */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between"><span>Items</span><span>{itemCount}</span></div>
            <div className="flex justify-between"><span>Subtotal</span><span className="font-semibold">{formatINR(order?.subtotal, order?.currency)}</span></div>
            <div className="flex justify-between"><span>Shipping</span><span className="font-semibold">{order?.shipping_fee === 0 ? 'FREE' : formatINR(order?.shipping_fee, order?.currency)}</span></div>
            {order?.discount_total > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Discount</span><span className="font-semibold">-{formatINR(order?.discount_total, order?.currency)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between text-lg font-bold">
              <span>Total</span><span>{formatINR(order?.total, order?.currency)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Address */}
        <Card className="mb-6">
          <CardHeader><CardTitle>Shipping Address</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {order?.address_snapshot ? (
              <div className="space-y-0.5">
                <div className="font-medium">{order.address_snapshot.name}</div>
                <div>{order.address_snapshot.address}</div>
                <div>{order.address_snapshot.city}, {order.address_snapshot.state} - {order.address_snapshot.pincode}</div>
                <div className="text-muted-foreground">{order.address_snapshot.phone} · {order.address_snapshot.email}</div>
              </div>
            ) : (
              <div className="text-muted-foreground">No address on file for this order.</div>
            )}
          </CardContent>
        </Card>

        {/* Items */}
        <Card className="mb-6">
          <CardHeader><CardTitle>Items</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {items.map((it, idx) => {
              const img = storagePublicUrl(it.hero_image_path) || '/placeholder.png';
              return (
                <div key={idx} className="flex items-center gap-3">
                  <div className="relative h-16 w-16 bg-muted rounded overflow-hidden">
                    <Image src={img} alt={it.name} fill className="object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium line-clamp-2">{it.name}</div>
                    <div className="text-sm text-muted-foreground">Qty: {it.quantity}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{formatINR(it.unit_price, order?.currency)}</div>
                    <div className="text-sm">× {it.quantity} = <span className="font-medium">{formatINR(it.line_total, order?.currency)}</span></div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Payment & actions */}
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => router.push(`/account/orders/${orderId}/invoice`)}>
            View / Download Invoice
          </Button>
          {items.some(i => !!i.product_id) && (
            <Button variant="outline" onClick={async () => {
              for (const it of items) {
                if (it.product_id) await addItem(it.product_id, Math.max(1, it.quantity || 1));
              }
              toast.success('Items added to cart'); router.push('/cart');
            }}>
              Reorder Items
            </Button>
          )}
          {payment && <span className="text-sm text-muted-foreground">Paid via {payment.method ?? 'Razorpay'} · Ref: {payment.provider_payment_id}</span>}
        </div>
      </div>
    </CustomerLayout>
  );
}
