"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Trash2,
  ShoppingBag,
  Tag,
  Check,
  X,
  ShoppingCart as CartIcon,
} from "lucide-react";
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
import { mockCoupons } from "@/lib/mock-data"; // optional; remove if you don't want coupons

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
function effectivePrice(p: ProductRow) {
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
  const {
    ready: cartReady,
    loading,
    items,
    totals,
    setQty,
    removeItem,
  } = useCart();
  const { isAuthenticated } = useAuth();

  // For guests we fetch product details here
  const [guestProducts, setGuestProducts] = useState<
    Record<string, ProductRow>
  >({});

  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [isApplying, setIsApplying] = useState(false);

  // Fetch product details for guest cart
  useEffect(() => {
    if (!cartReady || isAuthenticated) return;
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
  }, [cartReady, isAuthenticated, items]);

  // Build a unified array of rows we can render for both guest & authed
  const rows = useMemo(() => {
    return items
      .map((it) => {
        const p: ProductRow | undefined = (it as any).product // authed items have joined product
          ? {
              ...(it as any).product,
              hero_image_url: storagePublicUrl(
                (it as any).product.hero_image_path
              ),
            }
          : guestProducts[it.product_id];

        if (!p) return null;

        const unit =
          (it as any).unit_price != null
            ? (it as any).unit_price
            : effectivePrice(p);
        const line =
          (it as any).line_total != null
            ? (it as any).line_total
            : unit * it.quantity;
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

  // Totals (server when authed, client when guest)
  const clientSubtotal = rows.reduce((acc, r) => acc + r.lineTotal, 0);
  const baseSubtotal = isAuthenticated ? totals?.subtotal ?? 0 : clientSubtotal;
  const shipping = isAuthenticated
    ? totals?.shipping_fee_estimate ?? 0
    : baseSubtotal < 2000
    ? 149
    : 0;

  // Coupons are client-side for now
  let discount = 0;
  if (appliedCoupon) {
    if (appliedCoupon.type === "percentage") {
      discount = (baseSubtotal * appliedCoupon.value) / 100;
      if (appliedCoupon.max_discount && discount > appliedCoupon.max_discount) {
        discount = appliedCoupon.max_discount;
      }
    } else {
      discount = appliedCoupon.value;
    }
  }

  const grandTotal = Math.max(
    0,
    (isAuthenticated
      ? totals?.total_estimate ?? baseSubtotal + shipping
      : baseSubtotal + shipping) - discount
  );

  const applyCoupon = () => {
    setIsApplying(true);
    setTimeout(() => {
      const coupon = mockCoupons.find(
        (c) => c.code.toUpperCase() === couponCode.toUpperCase() && c.active
      );
      if (!coupon) {
        toast.error("Invalid coupon code");
        setIsApplying(false);
        return;
      }
      if (coupon.min_purchase && baseSubtotal < coupon.min_purchase) {
        toast.error(
          `Minimum purchase of ₹${coupon.min_purchase.toLocaleString(
            "en-IN"
          )} required`
        );
        setIsApplying(false);
        return;
      }
      const now = new Date();
      const validFrom = new Date(coupon.valid_from);
      const validTo = new Date(coupon.valid_to);
      if (now < validFrom || now > validTo) {
        toast.error("Coupon has expired or is not yet valid");
        setIsApplying(false);
        return;
      }
      setAppliedCoupon(coupon);
      toast.success("Coupon applied!");
      setIsApplying(false);
    }, 300);
  };
  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode("");
    toast.info("Coupon removed");
  };

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
                          <p className="text-sm text-muted-foreground mb-2">
                            {p.brands.name}
                          </p>
                        )}
                        <div className="flex items-baseline gap-2">
                          <span className="font-bold">
                            {formatINR(row.unitPrice, p.currency)}
                          </span>
                          {row.mrp && (
                            <span className="text-sm text-muted-foreground line-through">
                              {formatINR(row.mrp, p.currency)}
                            </span>
                          )}
                        </div>
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
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Have a coupon?</span>
                  </div>

                  {!appliedCoupon ? (
                    <div className="flex gap-2">
                      <Input
                        placeholder="Enter coupon code"
                        value={couponCode}
                        onChange={(e) =>
                          setCouponCode(e.target.value.toUpperCase())
                        }
                        onKeyDown={(e) => e.key === "Enter" && applyCoupon()}
                        className="uppercase"
                      />
                      <Button
                        onClick={applyCoupon}
                        disabled={!couponCode.trim() || isApplying}
                        variant="secondary"
                      >
                        {isApplying ? "Applying…" : "Apply"}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                        <div>
                          <p className="text-sm font-medium text-green-900 dark:text-green-100">
                            {appliedCoupon.code}
                          </p>
                          <p className="text-xs text-green-700 dark:text-green-300">
                            {appliedCoupon.type === "percentage"
                              ? `${appliedCoupon.value}% off`
                              : `₹${appliedCoupon.value} off`}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={removeCoupon}
                        className="h-8 w-8"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-semibold">
                    {formatINR(baseSubtotal)}
                  </span>
                </div>

                {discount > 0 && (
                  <div className="flex justify-between text-green-600 dark:text-green-400">
                    <span>Discount</span>
                    <span className="font-semibold">
                      -{formatINR(discount)}
                    </span>
                  </div>
                )}

                <div className="flex justify-between">
                  <span>Shipping</span>
                  <span className="font-semibold">
                    {shipping === 0 ? "FREE" : formatINR(shipping)}
                  </span>
                </div>

                {baseSubtotal < 2000 && (
                  <p className="text-sm text-muted-foreground">
                    Add {formatINR(2000 - baseSubtotal)} more for FREE shipping
                  </p>
                )}

                <Separator />

                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span>{formatINR(grandTotal)}</span>
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
