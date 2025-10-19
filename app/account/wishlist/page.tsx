'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { CustomerLayout } from '@/components/CustomerLayout';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useCart } from '@/lib/contexts/CartContext';
import { ProductCard } from '@/components/ProductCard';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Heart, ShoppingCart, Trash2, Star, Search,
} from 'lucide-react';

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  price?: number | null;
  currency?: string | null;
  compare_at_price?: number | null;
  sale_price?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
  hero_image_path?: string | null;
  brands?: { name?: string | null } | null;
};

type WishlistRow = {
  id: string;
  product_id: string;
  note?: string | null;
  priority: number;
  created_at: string;
  product: ProductRow;
  hero_image_url?: string | null; // computed
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

function storagePublicUrl(path?: string | null) {
  if (!path) return null;
  const { data } = supabase.storage.from('product-media').getPublicUrl(path);
  return data.publicUrl ?? null;
}

function isSaleActive(start?: string | null, end?: string | null) {
  const now = new Date();
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;
  if (s && now < s) return false;
  if (e && now > e) return false;
  return true;
}

function effectiveUnitPrice(p: ProductRow) {
  const saleOk = p.sale_price != null && isSaleActive(p.sale_starts_at, p.sale_ends_at);
  return saleOk && p.sale_price != null ? p.sale_price : p.price ?? 0;
}

function formatINR(v?: number | null, currency?: string | null) {
  if (v == null) return '';
  const code = (currency ?? 'INR').toUpperCase();
  if (code === 'INR') return `₹${v.toLocaleString('en-IN')}`;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(v);
  } catch {
    return `${code} ${v.toLocaleString()}`;
  }
}

export default function WishlistPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { addItem } = useCart();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<WishlistRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'added_desc'|'added_asc'|'price_asc'|'price_desc'|'prio_desc'|'prio_asc'>('added_desc');

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/login?redirect=/account/wishlist');
      return;
    }
    (async () => {
      setLoading(true);
      // Join wishlist_items -> products via explicit FK name (works with PostgREST)
      const { data, error } = await supabase
        .from('wishlist_items')
        .select(`
          id, product_id, note, priority, created_at,
          product:products!wishlist_items_product_id_fkey (
            id, slug, name, price, currency,
            compare_at_price, sale_price, sale_starts_at, sale_ends_at,
            hero_image_path, brands ( name )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error(error);
        toast.error('Failed to load wishlist');
        setRows([]);
        setLoading(false);
        return;
      }

      const mapped = (data ?? [])
        .filter((r: any) => r.product) // safety
        .map((r: any) => ({
          ...r,
          hero_image_url: storagePublicUrl(r.product.hero_image_path),
        })) as WishlistRow[];

      setRows(mapped);
      setLoading(false);
    })();
  }, [isAuthenticated, router]);

  if (!isAuthenticated) return null;

  const toggleSelect = (id: string, checked: boolean) => {
    setSelected(prev => {
      const copy = new Set(prev);
      if (checked) copy.add(id); else copy.delete(id);
      return copy;
    });
  };

  const selectAll = (checked: boolean) => {
    setSelected(checked ? new Set(rows.map(r => r.id)) : new Set());
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = !s
      ? rows
      : rows.filter(r =>
          r.product.name.toLowerCase().includes(s) ||
          (r.product.brands?.name || '').toLowerCase().includes(s)
        );

    // sort
    list = [...list].sort((a, b) => {
      if (sort === 'added_desc') return +new Date(b.created_at) - +new Date(a.created_at);
      if (sort === 'added_asc')  return +new Date(a.created_at) - +new Date(b.created_at);
      if (sort === 'prio_desc')  return b.priority - a.priority;
      if (sort === 'prio_asc')   return a.priority - b.priority;
      const ap = effectiveUnitPrice(a.product);
      const bp = effectiveUnitPrice(b.product);
      if (sort === 'price_asc')  return ap - bp;
      if (sort === 'price_desc') return bp - ap;
      return 0;
    });

    return list;
  }, [rows, q, sort]);

  const onRemove = async (id: string) => {
    const { error } = await supabase.from('wishlist_items').delete().eq('id', id);
    if (error) {
      toast.error('Could not remove from wishlist');
      return;
    }
    setRows(prev => prev.filter(r => r.id !== id));
    setSelected(prev => { const c = new Set(prev); c.delete(id); return c; });
    toast.success('Removed');
  };

  const onUpdatePriority = async (id: string, priority: number) => {
    const { error } = await supabase.from('wishlist_items').update({ priority }).eq('id', id);
    if (error) {
      toast.error('Could not update priority');
      return;
    }
    setRows(prev => prev.map(r => r.id === id ? { ...r, priority } : r));
  };

  const onSaveNote = async (id: string, note: string) => {
    const { error } = await supabase.from('wishlist_items').update({ note: note || null }).eq('id', id);
    if (error) {
      toast.error('Could not save note');
      return;
    }
    setRows(prev => prev.map(r => r.id === id ? { ...r, note } : r));
    toast.success('Note saved');
  };

  const addToCartOne = (productId: string) => {
    addItem(productId, undefined, 1);
    toast.success('Added to cart');
  };

  const addSelectedToCart = () => {
    if (selected.size === 0) return;
    rows.forEach(r => { if (selected.has(r.id)) addItem(r.product.id, undefined, 1); });
    toast.success('Selected items added to cart');
    router.push('/cart');
  };

  const removeSelected = async () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const { error } = await supabase.from('wishlist_items').delete().in('id', ids);
    if (error) {
      toast.error('Could not remove selected');
      return;
    }
    setRows(prev => prev.filter(r => !selected.has(r.id)));
    setSelected(new Set());
    toast.success('Removed selected');
  };

  return (
    <CustomerLayout>
      <div className="container mx-auto py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Heart className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">My Wishlist</h1>
          </div>
          <p className="text-muted-foreground">
            {rows.length} {rows.length === 1 ? 'item' : 'items'} saved
          </p>
        </div>

        {/* Toolbar */}
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Manage</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <Checkbox
                id="selectAll"
                checked={selected.size === rows.length && rows.length > 0}
                onCheckedChange={(v: any) => selectAll(!!v)}
              />
              <label htmlFor="selectAll" className="text-sm">Select all</label>
              {selected.size > 0 && (
                <Badge variant="secondary" className="ml-2">{selected.size} selected</Badge>
              )}
            </div>

            <div className="flex flex-1 items-center gap-2 md:max-w-md">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or brand…" />
            </div>

            <div className="flex items-center gap-2">
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={sort}
                onChange={(e) => setSort(e.target.value as any)}
              >
                <option value="added_desc">Newest</option>
                <option value="added_asc">Oldest</option>
                <option value="price_asc">Price: Low → High</option>
                <option value="price_desc">Price: High → Low</option>
                <option value="prio_desc">Priority: High → Low</option>
                <option value="prio_asc">Priority: Low → High</option>
              </select>

              <Button variant="outline" size="sm" onClick={removeSelected} disabled={selected.size === 0}>
                <Trash2 className="mr-2 h-4 w-4" />
                Remove
              </Button>
              <Button size="sm" onClick={addSelectedToCart} disabled={selected.size === 0}>
                <ShoppingCart className="mr-2 h-4 w-4" />
                Add to cart
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Content */}
        {loading ? (
          <div className="text-center py-16 text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Heart className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Your wishlist is empty</h2>
            <p className="text-muted-foreground mb-6">Save items you love to easily find them later</p>
            <Button asChild><Link href="/">Continue Shopping</Link></Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {filtered.map((row) => {
              const p = row.product;
              const unit = effectiveUnitPrice(p);
              const mrpToShow = p.compare_at_price != null && p.compare_at_price > unit ? p.compare_at_price : null;

              return (
                <div key={row.id} className="group relative rounded-xl border bg-background overflow-hidden hover:shadow-lg transition-shadow">
                  {/* Select checkbox */}
                  <div className="absolute top-2 left-2 z-10">
                    <Checkbox
                      checked={selected.has(row.id)}
                      onCheckedChange={(v: any) => toggleSelect(row.id, !!v)}
                    />
                  </div>

                  {/* Use your ProductCard (already handles pricing & sale) */}
                  <ProductCard product={{ ...p, hero_image_url: row.hero_image_url } as any} />

                  {/* Overlay footer actions */}
                  <div className="px-4 pb-4 -mt-2">
                    {/* Price summary (ensures visible even if ProductCard layout differs) */}
                    <div className="flex items-baseline gap-2">
                      <span className="text-base font-semibold">{formatINR(unit, p.currency)}</span>
                      {mrpToShow != null && (
                        <span className="text-sm text-muted-foreground line-through">
                          {formatINR(mrpToShow, p.currency)}
                        </span>
                      )}
                    </div>

                    {/* Brand */}
                    {p.brands?.name && (
                      <div className="text-xs text-muted-foreground mt-0.5">{p.brands.name}</div>
                    )}

                    <Separator className="my-3" />

                    {/* Actions */}
                    <div className="flex items-center justify-between gap-2">
                      {/* Priority */}
                      <div className="flex items-center gap-1">
                        {[1,2,3,4,5].map(n => (
                          <button
                            key={n}
                            onClick={() => onUpdatePriority(row.id, n)}
                            className={`p-0.5 ${n <= row.priority ? 'text-yellow-500' : 'text-muted-foreground'} hover:text-yellow-500`}
                            title={`Priority ${n}`}
                          >
                            <Star className="h-4 w-4" />
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => onRemove(row.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button size="sm" onClick={() => addToCartOne(p.id)}>
                          <ShoppingCart className="mr-2 h-4 w-4" />
                          Add
                        </Button>
                      </div>
                    </div>

                    {/* Note editor */}
                    <div className="mt-3">
                      <details>
                        <summary className="text-xs cursor-pointer text-primary"> {row.note ? 'Edit note' : 'Add note'} </summary>
                        <div className="mt-2">
                          <textarea
                            defaultValue={row.note ?? ''}
                            placeholder="Add a short note for yourself (e.g., gift idea)"
                            className="w-full rounded-md border bg-background p-2 text-sm"
                            rows={2}
                            onBlur={(e) => onSaveNote(row.id, e.target.value)}
                          />
                          <p className="text-[11px] text-muted-foreground mt-1">Tip: Click outside to save</p>
                        </div>
                      </details>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
