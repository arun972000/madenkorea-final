"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { Trash2, ShoppingBag, Tag, Check, X } from "lucide-react";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/lib/contexts/CartContext";
import { useAuth } from "@/lib/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  price: number | null;
  currency: string | null;
  compare_at_price: number | null;
  sale_price: number | null;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  hero_image_path: string | null;
  brands?: { name?: string | null } | null;
  hero_image_url?: string | null; // computed client-side
};

type CartLine = { product_id: string; qty: number };

// NEW: totals response shape from the global-promo calc endpoint
type TotalsResponse = null | {
  ok: true;
  currency: string;
  subtotal: number;
  shipping_fee: number;
  discount_total: number;
  total: number;
  commission_total: number; // informational for attribution
  applied: null | {
    type: "promo";
    code: string;
    scope: "global" | "product";
    influencer_id: string;
  };
  lines: Array<{
    product_id: string;
    qty: number;
    unit_price: number;
    line_subtotal: number;
    promo_applied: boolean;
    effective_user_discount_pct: number;
    effective_commission_pct: number;
    line_discount: number;
    line_commission: number;
  }>;
};

function storagePublicUrl(path?: string | null) {
  if (!path) return null;
  const { data } = supabase.storage.from("product-media").getPublicUrl(path);
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
  const saleOk =
    p.sale_price != null && isSaleActive(p.sale_starts_at, p.sale_ends_at);
  return saleOk && p.sale_price != null ? p.sale_price : p.price ?? 0;
}

function formatINR(v?: number | null, currency?: string | null) {
  if (v == null) return "";
  const code = (currency ?? "INR").toUpperCase();
  if (code === "INR") return `₹${v.toLocaleString("en-IN")}`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
    }).format(v);
  } catch {
    return `${code} ${v.toLocaleString()}`;
  }
}

export default function CartPage() {
  const { ready: cartReady, loading, items, setQty, removeItem } = useCart();
  const { isAuthenticated } = useAuth();

  // For guests we fetch product details here
  const [guestProducts, setGuestProducts] = useState<
    Record<string, ProductRow>
  >({});

  const [promoCode, setPromoCode] = useState("");
  const [applyingPromo, startApplyingPromo] = useTransition();

  // server-calculated totals (global promo aware)
  const [totals, setTotals] = useState<TotalsResponse>(null);
  const [loadingTotals, setLoadingTotals] = useState(false);

  // Fetch product details for guest cart
  useEffect(() => {
    if (!cartReady) return;
    const ids = Array.from(new Set(items.map((i) => i.product_id)));
    if (ids.length === 0) {
      setGuestProducts({});
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          `
          id, slug, name, price, currency,
          compare_at_price, sale_price, sale_starts_at, sale_ends_at,
          hero_image_path, brands(name)
        `
        )
        .in("id", ids)
        .eq("is_published", true);
      if (error) {
        console.error(error);
        setGuestProducts({});
        return;
      }
      const map: Record<string, ProductRow> = {};
      (data ?? []).forEach((p: any) => {
        map[p.id] = {
          ...p,
          hero_image_url: storagePublicUrl(p.hero_image_path),
        };
      });
      setGuestProducts(map);
    })();
  }, [cartReady, items]);

  // Build unified rows we can render
  const rows = useMemo(() => {
    return items
      .map((it) => {
        const p: ProductRow | undefined = (it as any).product
          ? {
              ...(it as any).product,
              hero_image_url: storagePublicUrl(
                (it as any).product.hero_image_path
              ),
            }
          : guestProducts[it.product_id];

        if (!p) return null;

        const unit =
         effectiveUnitPrice(p);
       const line = unit * it.quantity;
        const mrp =
          p.compare_at_price && p.compare_at_price > unit
            ? p.compare_at_price
            : null;

        return {
          id: it.id,
          productId: it.product_id,
          quantity: it.quantity,
          product: p,
          unitPrice: unit,
          lineTotal: line,
          mrp,
        };
      })
      .filter(Boolean) as {
      id: string;
      productId: string;
      quantity: number;
      product: ProductRow;
      unitPrice: number;
      lineTotal: number;
      mrp: number | null;
    }[];
  }, [items, guestProducts]);

  // Base subtotal (pre promo)
  const baseSubtotal = rows.reduce((acc, r) => acc + r.lineTotal, 0);

  // Shipping rule (local calc; also passed to API for final totals)
  const SHIPPING_THRESHOLD = 2000;
  const SHIPPING_FEE = 149;
  const shippingFee = baseSubtotal >= SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;

  // Recalc when quantities change (quantity signature)
  const qtySig = useMemo(
    () =>
      rows
        .map((r) => `${r.productId}:${r.quantity}`)
        .sort()
        .join("|"),
    [rows]
  );

  // Ask server to compute totals with global promo logic
  async function recalcTotals() {
    if (rows.length === 0) {
      setTotals(null);
      return;
    }
    setLoadingTotals(true);
    try {
      const res = await fetch("/api/checkout/calc-totals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lines: rows.map((r) => ({
            product_id: r.productId,
            qty: r.quantity,
          })) as CartLine[],
          shippingFee,
        }),
      });
      const data = (await res.json()) as TotalsResponse & { error?: string };
      if (!res.ok || !data || (data as any).ok === false) {
        throw new Error((data as any)?.error || "Failed to calculate totals");
      }
      setTotals(data);
    } catch (e: any) {
      console.error(e);
      toast.error("Failed to calculate totals");
      setTotals(null);
    } finally {
      setLoadingTotals(false);
    }
  }

  useEffect(() => {
    void recalcTotals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qtySig, shippingFee]);

  // Apply/clear promo (server validates & sets/clears HTTP-only cookie)
  async function clearPromo() {
    const res = await fetch("/api/promo/clear", { method: "POST" });
    if (!res.ok) {
      toast.error("Could not remove promo");
      return;
    }
    toast.info("Promo removed");
    await recalcTotals();
  }

  function onApplyPromo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = promoCode.trim().toUpperCase();
    if (!code) return;
    startApplyingPromo(async () => {
      try {
        const res = await fetch("/api/promo/apply", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code }),
        });
        const j = await res.json();
        if (!res.ok || !j?.ok) throw new Error(j?.error || "Invalid code");
        toast.success(`Promo applied: ${j?.promo?.code || code}`);
        setPromoCode("");
        await recalcTotals();
      } catch (err: any) {
        toast.error(err?.message || "Could not apply promo");
      }
    });
  }

  if (!cartReady || loading) {
    return (
      <CustomerLayout>
        <div className="container mx-auto py-16 text-muted-foreground">
          Loading cart…
        </div>
      </CustomerLayout>
    );
  }

  if (rows.length === 0) {
    return (
      <CustomerLayout>
        <div className="container mx-auto py-16">
          <Card className="max-w-md mx-auto text-center">
            <CardHeader>
              <ShoppingBag className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <CardTitle>Your cart is empty</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-6">
                Looks like you haven&apos;t added anything to your cart yet.
              </p>
              <Button asChild>
                <Link href="/">Continue Shopping</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </CustomerLayout>
    );
  }

  // Display numbers (fallback to local if API not ready yet)
  const displayCurrency = totals?.currency || "INR";
  const displaySubtotal = totals?.subtotal ?? baseSubtotal;
  const displayShipping = totals?.shipping_fee ?? shippingFee;
  const displayDiscount = totals?.discount_total ?? 0;
  const displayTotal =
    totals?.total ?? Math.max(0, baseSubtotal + shippingFee - displayDiscount);

  // NEW: detect if an active promo affected any line
  const promoActive = totals?.applied?.type === "promo";
  const promoAffectedAny =
    promoActive && totals?.lines?.some((l) => l.promo_applied) ? true : false;

  return (
    <CustomerLayout>
      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold mb-8">
          Shopping Cart ({rows.reduce((n, r) => n + r.quantity, 0)} items)
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Items */}
          <div className="lg:col-span-2 space-y-4">
            {rows.map((row) => {
              const p = row.product;
              const img =
                p.hero_image_url ||
                storagePublicUrl(p.hero_image_path) ||
                "/placeholder.png";

              // NEW: per-line promo details from totals.lines
              const calcLine = totals?.lines?.find(
                (l) => l.product_id === row.productId
              );
              const promoApplied = !!calcLine?.promo_applied;
              const effectiveUser = calcLine?.effective_user_discount_pct ?? 0;
              const effectiveComm = calcLine?.effective_commission_pct ?? 0;
              const lineDiscount = calcLine?.line_discount ?? 0;

              return (
                <Card key={row.id}>
                  <CardContent className="p-6">
                    <div className="flex gap-4">
                      <div className="relative w-24 h-24 flex-shrink-0 bg-muted rounded-lg overflow-hidden">
                        <Image
                          src={img}
                          alt={p.name}
                          fill
                          className="object-cover"
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/p/${p.slug}`}
                          className="hover:text-primary"
                        >
                          <h3 className="font-semibold mb-1 line-clamp-2">
                            {p.name}
                          </h3>
                        </Link>
                        {p.brands?.name && (
                          <p className="text-sm text-muted-foreground mb-1">
                            {p.brands.name}
                          </p>
                        )}
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="font-bold">
                            {formatINR(row.unitPrice, p.currency)}
                          </span>
                          {row.mrp && (
                            <span className="text-sm text-muted-foreground line-through">
                              {formatINR(row.mrp, p.currency)}
                            </span>
                          )}
                        </div>

                        {/* NEW: per-line badge */}
                        {totals && (
                          <div className="mt-1 text-xs">
                            {promoApplied ? (
                              <span className="inline-flex gap-2 rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
                                Promo applied: user {effectiveUser}% ·
                                commission {effectiveComm}% · saved{" "}
                                {formatINR(lineDiscount, p.currency)}
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-neutral-100 px-2 py-1 text-neutral-600">
                                No promo on this item
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center border rounded-lg">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setQty(row.id, Math.max(0, row.quantity - 1))
                            }
                          >
                            -
                          </Button>
                          <span className="px-3 py-1 min-w-[2.5rem] text-center">
                            {row.quantity}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setQty(row.id, row.quantity + 1)}
                          >
                            +
                          </Button>
                        </div>

                        <p className="font-semibold">
                          {formatINR(row.lineTotal, p.currency)}
                        </p>

                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItem(row.id)}
                            title="Remove"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Summary */}
          <div className="lg:col-span-1">
            <Card className="sticky top-20">
              <CardHeader>
                <CardTitle>Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Promo apply / remove */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      Have a promo code?
                    </span>
                  </div>

                  {!promoActive ? (
                    <form onSubmit={onApplyPromo} className="flex gap-2">
                      <Input
                        placeholder="Enter promo code"
                        value={promoCode}
                        onChange={(e) =>
                          setPromoCode(e.target.value.toUpperCase())
                        }
                        disabled={applyingPromo}
                        className="uppercase"
                      />
                      <Button
                        type="submit"
                        variant="secondary"
                        disabled={applyingPromo || !promoCode.trim()}
                      >
                        {applyingPromo ? "Applying…" : "Apply"}
                      </Button>
                    </form>
                  ) : (
                    <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                        <div>
                          <p className="text-sm font-medium text-green-900 dark:text-green-100">
                            Promo applied: {totals?.applied?.code}
                          </p>
                          <p className="text-xs text-green-700 dark:text-green-300">
                            {totals?.applied?.scope === "global"
                              ? "Global (cart-wide)"
                              : "Product-specific"}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={clearPromo}
                        className="h-8 w-8"
                        title="Remove promo"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  {/* Helpful hint when promo didn’t affect any items */}
                  {!loadingTotals && promoActive && !promoAffectedAny && (
                    <div className="p-2 rounded border text-xs bg-amber-50 border-amber-200 text-amber-700">
                      The promo “{totals?.applied?.code}” didn’t apply to any
                      items in your cart (items may be exempt or capped).
                    </div>
                  )}
                </div>

                <Separator />

                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-semibold">
                    {formatINR(displaySubtotal, displayCurrency)}
                  </span>
                </div>

                {displayDiscount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Discount</span>
                    <span className="font-semibold">
                      -{formatINR(displayDiscount, displayCurrency)}
                    </span>
                  </div>
                )}

                <div className="flex justify-between">
                  <span>Shipping</span>
                  <span className="font-semibold">
                    {displayShipping === 0
                      ? "FREE"
                      : formatINR(displayShipping, displayCurrency)}
                  </span>
                </div>

                {displaySubtotal < SHIPPING_THRESHOLD && (
                  <p className="text-sm text-muted-foreground">
                    Add{" "}
                    {formatINR(
                      SHIPPING_THRESHOLD - displaySubtotal,
                      displayCurrency
                    )}{" "}
                    more for FREE shipping
                  </p>
                )}

                <Separator />

                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span>{formatINR(displayTotal, displayCurrency)}</span>
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-2">
                <Button asChild className="w-full" size="lg">
                  <Link href="/checkout">Proceed to Checkout</Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/">Continue Shopping</Link>
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    </CustomerLayout>
  );
}
