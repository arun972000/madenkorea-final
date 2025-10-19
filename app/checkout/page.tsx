"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/lib/contexts/CartContext";
import { useAuth } from "@/lib/contexts/AuthContext";
import { toast } from "sonner";
import { createClient } from "@supabase/supabase-js";
import { useRazorpayCheckout } from "@/lib/hooks/useRazorpayCheckout";

type DbProduct = {
  id: string;
  slug: string;
  name: string;
  price?: number | null;
  currency?: string | null;
  compare_at_price?: number | null; // MRP
  sale_price?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
  hero_image_path?: string | null;
  brands?: { name?: string | null } | null;
};

type ViewLine = {
  productId: string;
  name: string;
  brand?: string | null;
  qty: number;
  currency?: string | null;
  unitPrice: number;
  unitMrpToShow?: number | null;
  lineTotal: number;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

function isSaleActive(start?: string | null, end?: string | null) {
  const now = new Date();
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;
  if (s && isNaN(s.getTime())) return false;
  if (e && isNaN(e.getTime())) return false;
  if (s && now < s) return false;
  if (e && now > e) return false;
  return true;
}
function effectiveUnitPrice(p: DbProduct) {
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

export default function CheckoutPage() {
  const router = useRouter();
  const { items } = useCart();
  const { isAuthenticated, ready } = useAuth();
  const { start } = useRazorpayCheckout();

  const [isProcessing, setIsProcessing] = useState(false);
  const [dbProducts, setDbProducts] = useState<Record<string, DbProduct>>({});
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
  });

  // Auth gate: require login (RPCs need auth.uid)
  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated) router.replace("/auth/login?redirect=/checkout");
  }, [ready, isAuthenticated, router]);

  // Redirect if cart empty
  useEffect(() => {
    if (items.length === 0 && ready && isAuthenticated) router.push("/cart");
  }, [items.length, ready, isAuthenticated, router]);

  // Fetch product info from Supabase for all items in cart (guest or authed)
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (items.length === 0) return;
      setLoadingProducts(true);
      const ids = Array.from(new Set(items.map((i) => i.product_id)));
      const { data, error } = await supabase
        .from("products")
        .select(
          `
          id, slug, name,
          price, currency,
          compare_at_price, sale_price, sale_starts_at, sale_ends_at,
          hero_image_path,
          brands ( name )
        `
        )
        .in("id", ids)
        .eq("is_published", true);

      if (cancelled) return;
      if (error) {
        console.error("Load products @ checkout:", error);
        toast.error("Could not load products for checkout");
        setDbProducts({});
      } else {
        const map: Record<string, DbProduct> = {};
        (data ?? []).forEach((p) => {
          map[p.id] = p as DbProduct;
        });
        setDbProducts(map);
      }
      setLoadingProducts(false);
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [items]);

  // Build view lines with effective pricing
  const lines: ViewLine[] = useMemo(() => {
    return items.map((it) => {
      const p = dbProducts[it.product_id];
      if (!p) {
        return {
          productId: it.product_id,
          name: "Product",
          qty: it.quantity,
          unitPrice: 0,
          lineTotal: 0,
          currency: "INR",
        };
      }
      const unit = effectiveUnitPrice(p);
      const mrpToShow =
        p.compare_at_price != null && p.compare_at_price > unit
          ? p.compare_at_price
          : null;
      return {
        productId: p.id,
        name: p.name,
        brand: p.brands?.name ?? null,
        qty: it.quantity,
        currency: p.currency ?? "INR",
        unitPrice: unit,
        unitMrpToShow: mrpToShow,
        lineTotal: unit * it.quantity,
      };
    });
  }, [items, dbProducts]);

  const subtotal = useMemo(
    () => lines.reduce((acc, l) => acc + l.lineTotal, 0),
    [lines]
  );
  const SHIPPING_THRESHOLD = 2000;
  const SHIPPING_FEE = 149;
  const shippingCost = subtotal >= SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  const total = subtotal + shippingCost;

  const savings = useMemo(() => {
    return lines.reduce((acc, l) => {
      const mrp = l.unitMrpToShow ?? 0;
      return acc + Math.max(0, mrp - l.unitPrice) * l.qty;
    }, 0);
  }, [lines]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    // Basic validation
    if (!/^\d{6}$/.test(formData.pincode)) {
      toast.error("Please enter a valid 6-digit pincode.");
      return;
    }
    if (!/^\d{10}$/.test(formData.phone)) {
      toast.error("Please enter a valid 10-digit phone number.");
      return;
    }

    setIsProcessing(true);

    const addressSnapshot = {
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      address: formData.address,
      city: formData.city,
      state: formData.state,
      pincode: formData.pincode,
    };

    try {
      // Opens Razorpay; on success it will verify + redirect to /account/orders/:id
      await start(addressSnapshot, null);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!ready) {
    return (
      <CustomerLayout>
        <div className="container mx-auto py-16 text-muted-foreground">
          Loading checkout…
        </div>
      </CustomerLayout>
    );
  }
  if (!isAuthenticated || items.length === 0) return null;

  return (
    <CustomerLayout>
      {/* Razorpay SDK (safe to include here if not already in layout) */}
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
      />

      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold mb-8">Checkout</h1>

        <form onSubmit={handlePay}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: Shipping & Contact */}
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Contact & Shipping</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="name">Full Name *</Label>
                    <Input
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone">Phone *</Label>
                      <Input
                        id="phone"
                        name="phone"
                        type="tel"
                        inputMode="numeric"
                        maxLength={10}
                        value={formData.phone}
                        onChange={handleChange}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="address">Address *</Label>
                    <Input
                      id="address"
                      name="address"
                      value={formData.address}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="city">City *</Label>
                      <Input
                        id="city"
                        name="city"
                        value={formData.city}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="state">State *</Label>
                      <Input
                        id="state"
                        name="state"
                        value={formData.state}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="pincode">Pincode *</Label>
                      <Input
                        id="pincode"
                        name="pincode"
                        value={formData.pincode}
                        onChange={handleChange}
                        required
                        inputMode="numeric"
                        pattern="\d{6}"
                        maxLength={6}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Payment Method</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  You’ll be redirected to the Razorpay secure checkout to
                  complete your payment.
                </CardContent>
              </Card>
            </div>

            {/* Right: Order Summary */}
            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle>Order Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Items */}
                  <div className="space-y-3">
                    {loadingProducts && (
                      <p className="text-sm text-muted-foreground">
                        Loading items…
                      </p>
                    )}

                    {!loadingProducts &&
                      lines.map((l) => (
                        <div
                          key={`${l.productId}`}
                          className="flex items-start justify-between gap-3 text-sm"
                        >
                          <div className="flex-1">
                            <div className="font-medium">{l.name}</div>
                            {l.brand && (
                              <div className="text-xs text-muted-foreground">
                                {l.brand}
                              </div>
                            )}
                            <div className="text-xs text-muted-foreground">
                              Qty: {l.qty}
                            </div>
                          </div>
                          <div className="text-right">
                            <div>
                              <span className="font-semibold">
                                {formatINR(l.unitPrice, l.currency)}
                              </span>
                              {l.unitMrpToShow != null && (
                                <span className="ml-2 text-muted-foreground line-through">
                                  {formatINR(l.unitMrpToShow, l.currency)}
                                </span>
                              )}
                            </div>
                            <div className="text-xs">
                              × {l.qty} ={" "}
                              <span className="font-medium">
                                {formatINR(l.lineTotal, l.currency)}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>

                  <Separator />

                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span className="font-semibold">
                      {formatINR(subtotal, "INR")}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span>
                      Shipping{" "}
                      {subtotal < 2000 && (
                        <span className="text-xs text-muted-foreground">
                          (Free over ₹2,000)
                        </span>
                      )}
                    </span>
                    <span className="font-semibold">
                      {shippingCost === 0
                        ? "FREE"
                        : formatINR(shippingCost, "INR")}
                    </span>
                  </div>

                  {savings > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>You save</span>
                      <span className="font-semibold">
                        {formatINR(savings, "INR")}
                      </span>
                    </div>
                  )}

                  <Separator />

                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span>{formatINR(total, "INR")}</span>
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    size="lg"
                    disabled={isProcessing || loadingProducts}
                  >
                    {isProcessing ? "Processing…" : "Pay with Razorpay"}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </div>
    </CustomerLayout>
  );
}
