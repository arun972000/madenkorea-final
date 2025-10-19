'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/lib/contexts/AuthContext';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

function storagePublicUrl(path?: string | null) {
  if (!path) return null;
  const { data } = supabase.storage.from('product-media').getPublicUrl(path);
  return data.publicUrl ?? null;
}
function formatINR(v?: number | null, currency?: string | null) {
  if (v == null) return '';
  const code = (currency ?? 'INR').toUpperCase();
  if (code === 'INR') return `₹${v.toLocaleString('en-IN')}`;
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(v); }
  catch { return `${code} ${v.toLocaleString()}`; }
}

export default function InvoicePage() {
  const { orderId } = useParams<{ orderId: string }>();
  const router = useRouter();
  const { ready, isAuthenticated } = useAuth();

  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [invoice, setInvoice] = useState<any | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated) {
      router.replace(`/auth/login?redirect=/account/orders/${orderId}/invoice`); return;
    }
    (async () => {
      const [{ data: ord }, { data: its }, { data: invs }] = await Promise.all([
        supabase.from('orders').select('id, order_number, status, currency, subtotal, shipping_fee, discount_total, total, address_snapshot, created_at').eq('id', orderId).maybeSingle(),
        supabase.from('order_items').select('name, quantity, unit_price, line_total, mrp, sku, hero_image_path').eq('order_id', orderId),
        supabase.from('invoices').select('*').eq('order_id', orderId).limit(1)
      ]);
      setOrder(ord ?? null);
      setItems(its ?? []);
      setInvoice((invs ?? [])[0] ?? null);
    })();
  }, [ready, isAuthenticated, orderId, router]);

  const itemCount = useMemo(() => items.reduce((n, i) => n + (i.quantity || 1), 0), [items]);

  const handlePrint = () => window.print();

  if (!ready) return <div className="container mx-auto py-16 text-muted-foreground">Loading invoice…</div>;
  if (!isAuthenticated) return null;

  return (
    <div className="container mx-auto py-6 print:py-0">
      <div className="flex justify-between items-center mb-4 print:hidden">
        <h1 className="text-2xl font-bold">Invoice</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()}>Back</Button>
          <Button onClick={handlePrint}>Print / Save PDF</Button>
        </div>
      </div>

      <Card className="shadow print:shadow-none print:border-0">
        <CardContent className="p-6 print:p-0">
          {/* Header */}
          <div className="flex flex-wrap justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Made in Korea</h2>
              <p className="text-sm text-muted-foreground">www.madeinkorea.com</p>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Invoice No.</div>
              <div className="font-semibold">
                {invoice?.invoice_number ?? `INV-${(order?.order_number || '').replace(/[^\w]/g,'')}`}
              </div>
              <div className="text-sm text-muted-foreground mt-2">Date</div>
              <div className="font-semibold">
                {order ? new Date(order.created_at).toLocaleDateString('en-IN') : '--'}
              </div>
            </div>
          </div>

          <Separator className="my-4" />

          {/* Bill To */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <div className="text-sm text-muted-foreground">Bill To</div>
              {order?.address_snapshot ? (
                <div className="mt-1 text-sm">
                  <div className="font-medium">{order.address_snapshot.name}</div>
                  <div>{order.address_snapshot.address}</div>
                  <div>{order.address_snapshot.city}, {order.address_snapshot.state} - {order.address_snapshot.pincode}</div>
                  <div className="text-muted-foreground">{order.address_snapshot.phone} · {order.address_snapshot.email}</div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">—</div>
              )}
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Order</div>
              <div className="font-medium">{order?.order_number}</div>
              <div className="text-sm text-muted-foreground mt-2">Status</div>
              <div className="font-medium">{order?.status}</div>
            </div>
          </div>

          {/* Items table */}
          <div className="mt-6 border rounded overflow-hidden">
            <div className="grid grid-cols-12 bg-muted px-4 py-2 text-sm font-medium">
              <div className="col-span-6">Item</div>
              <div className="col-span-2 text-right">Price</div>
              <div className="col-span-2 text-right">Qty</div>
              <div className="col-span-2 text-right">Total</div>
            </div>
            {items.map((it, idx) => {
              const img = storagePublicUrl(it.hero_image_path) || '/placeholder.png';
              return (
                <div key={idx} className="grid grid-cols-12 px-4 py-3 items-center gap-3">
                  <div className="col-span-6 flex items-center gap-3">
                    <div className="relative h-10 w-10 rounded bg-muted overflow-hidden">
                      <Image src={img} alt={it.name} fill className="object-cover" />
                    </div>
                    <div>
                      <div className="font-medium text-sm">{it.name}</div>
                      {it.sku && <div className="text-xs text-muted-foreground">SKU: {it.sku}</div>}
                    </div>
                  </div>
                  <div className="col-span-2 text-right text-sm">{formatINR(it.unit_price, order?.currency)}</div>
                  <div className="col-span-2 text-right text-sm">{it.quantity}</div>
                  <div className="col-span-2 text-right text-sm font-medium">{formatINR(it.line_total, order?.currency)}</div>
                </div>
              );
            })}
          </div>

          {/* Totals */}
          <div className="mt-4 ml-auto w-full md:w-1/2">
            <div className="flex justify-between text-sm py-1"><span>Items</span><span>{itemCount}</span></div>
            <div className="flex justify-between text-sm py-1"><span>Subtotal</span><span className="font-medium">{formatINR(order?.subtotal, order?.currency)}</span></div>
            <div className="flex justify-between text-sm py-1"><span>Shipping</span><span className="font-medium">{order?.shipping_fee === 0 ? 'FREE' : formatINR(order?.shipping_fee, order?.currency)}</span></div>
            {order?.discount_total > 0 && (
              <div className="flex justify-between text-sm py-1 text-emerald-600">
                <span>Discount</span><span className="font-medium">-{formatINR(order?.discount_total, order?.currency)}</span>
              </div>
            )}
            <Separator className="my-2" />
            <div className="flex justify-between text-base font-bold"><span>Total</span><span>{formatINR(order?.total, order?.currency)}</span></div>
          </div>

          {/* Footer note */}
          <div className="mt-6 text-xs text-muted-foreground">
            This is a computer generated invoice. For support, contact info@madeinkorea.com
          </div>
        </CardContent>
      </Card>

      <style jsx global>{`
        @media print {
          @page { margin: 12mm; }
          button, a, .print\\:hidden { display: none !important; }
          .print\\:py-0 { padding-top: 0 !important; padding-bottom: 0 !important; }
        }
      `}</style>
    </div>
  );
}
