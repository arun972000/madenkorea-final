"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { useAuth } from "@/lib/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { ProductForm } from "@/components/admin/ProductForm";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

// get_my_vendor RETURNS TABLE → normalize to single row
function coerceVendor(data: any) {
  const arr = Array.isArray(data) ? data : data ? [data] : [];
  return arr[0] ?? null;
}

type DbProduct = {
  id: string;
  slug: string;
  name: string | null;
  title?: string | null;
  short_description?: string | null;
  description?: string | null;
  sku?: string | null;
  price?: number | null;
  currency?: string | null;
  brand_id?: string | null;
  category_id?: string | null;
  country_of_origin?: string | null;
  volume_ml?: number | null;
  net_weight_g?: number | null;
  hero_image_path?: string | null;
  is_published?: boolean;
  vendor_id?: string | null;
  track_inventory?: boolean | null;
  stock_qty?: number | null;
  updated_at?: string | null;

  // --- extra fields from your schema ---
  compare_at_price?: number | null;
  sale_price?: number | null;
  sale_starts_at?: string | null; // ISO
  sale_ends_at?: string | null; // ISO
  is_featured?: boolean;
  is_trending?: boolean;
  featured_rank?: number | null;
  new_until?: string | null; // ISO (date)
  meta_title?: string | null;
  meta_description?: string | null;
  og_image_path?: string | null;
};

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams();
  const { user, logout } = useAuth();
  const productId = params.id as string;

  // ✅ auth gate
  const [gateOk, setGateOk] = useState(false);

  // 🔄 product load
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<DbProduct | null>(null);

  // 🎛️ extra (edit-only) fields UI state
  const [extra, setExtra] = useState({
    is_published: true,
    compare_at_price: null as number | null,
    sale_price: null as number | null,
    sale_starts_at: "" as string, // datetime-local
    sale_ends_at: "" as string, // datetime-local
    is_featured: false,
    is_trending: false,
    featured_rank: null as number | null,
    new_until: "" as string, // date (yyyy-mm-dd)
    meta_title: "" as string,
    meta_description: "" as string,
    og_image_path: "" as string,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // wait for session hydration
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        router.replace(
          `/vendor/login?redirect=${encodeURIComponent(
            `/vendor/products/${productId}`
          )}`
        );
        return;
      }

      // fetch vendor row for this user
      const { data, error } = await supabase.rpc("get_my_vendor");
      if (cancelled) return;

      if (error) {
        console.error("get_my_vendor error", error);
        router.replace("/vendor");
        return;
      }

      const v = coerceVendor(data);
      if (!v) {
        router.replace("/vendor/register");
        return;
      }
      if (v.status !== "approved") {
        router.replace("/vendor");
        return;
      }

      setGateOk(true); // vendor is approved — allow page

      // fetch product from DB
      const { data: prod, error: perr } = await supabase
        .from("products")
        .select("*")
        .eq("id", productId)
        .maybeSingle();

      if (cancelled) return;

      if (perr) {
        console.error(perr);
        toast.error("Failed to load product");
        router.replace("/vendor/products");
        return;
      }

      if (!prod) {
        toast.error("Product not found");
        router.replace("/vendor/products");
        return;
      }

      // ensure product belongs to this vendor
      if (prod.vendor_id && prod.vendor_id !== v.id) {
        toast.error("You do not have access to this product");
        router.replace("/vendor/products");
        return;
      }

      // seed extra fields state with current values (so if user doesn't touch, we retain)
      setExtra({
        is_published: !!prod.is_published,
        compare_at_price: prod.compare_at_price ?? null,
        sale_price: prod.sale_price ?? null,
        sale_starts_at: prod.sale_starts_at
          ? toLocalDateTimeInput(prod.sale_starts_at)
          : "",
        sale_ends_at: prod.sale_ends_at
          ? toLocalDateTimeInput(prod.sale_ends_at)
          : "",
        is_featured: !!prod.is_featured,
        is_trending: !!prod.is_trending,
        featured_rank: prod.featured_rank ?? null,
        new_until: prod.new_until ? toLocalDateInput(prod.new_until) : "",
        meta_title: prod.meta_title ?? "",
        meta_description: prod.meta_description ?? "",
        og_image_path: prod.og_image_path ?? "",
      });

      setProduct(prod as DbProduct);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      setGateOk(false); // will re-run effect on next render
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [router, productId]);

  if (!gateOk) return null; // keep page blank while gating
  if (loading) {
    return (
      <div className="container mx-auto py-16 text-muted-foreground">
        Loading product…
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Product Not Found</h2>
          <Button onClick={() => router.push("/vendor/products")}>
            Back to Products
          </Button>
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
    await logout();
    toast.success("Logged out successfully");
    router.push("/");
  };

  // Utility: convert ISO to input formats
  function toLocalDateTimeInput(iso: string) {
    const d = new Date(iso);
    // yyyy-MM-ddThh:mm
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
      d.getDate()
    )}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  function toLocalDateInput(iso: string) {
    const d = new Date(iso);
    // yyyy-MM-dd
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  function pad2(n: number) {
    return n < 10 ? `0${n}` : `${n}`;
  }
  function toIsoOrNull(v: string) {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  // Save flow:
  // 1) ProductForm performs its own upsert (no change to your existing functionality)
  // 2) Then we apply ONLY the extra fields below; if user didn't change them, the same values get re-saved (no harm)
  const handleSave = async (saved: any) => {
    const id = saved?.id ?? product.id;
    try {
      const patch: Record<string, any> = {
        is_published: !!extra.is_published,
        compare_at_price: extra.compare_at_price ?? null,
        sale_price: extra.sale_price ?? null,
        sale_starts_at: toIsoOrNull(extra.sale_starts_at),
        sale_ends_at: toIsoOrNull(extra.sale_ends_at),
        is_featured: !!extra.is_featured,
        is_trending: !!extra.is_trending,
        featured_rank: extra.featured_rank ?? null,
        new_until: toIsoOrNull(extra.new_until),
        meta_title: (extra.meta_title || "").trim() || null,
        meta_description: (extra.meta_description || "").trim() || null,
        og_image_path: (extra.og_image_path || "").trim() || null,
      };

      // Write ONLY these fields; everything else was handled by ProductForm
      const { error } = await supabase
        .from("products")
        .update(patch)
        .eq("id", id);
      if (error) throw error;

      toast.success("Product saved");
      router.push("/vendor/products");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to save extra details");
    }
  };

  const handleCancel = () => {
    router.push("/vendor/products");
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => router.push("/vendor/products")}
            >
              ← Back
            </Button>
            <h1 className="text-2xl font-bold">Edit Product</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {user?.name || user?.email}
            </span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: your existing form (kept intact) */}
        <div className="lg:col-span-2">
          <ProductForm
            product={product}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        </div>

        {/* RIGHT: Additional details (edit-only) */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Additional details</CardTitle>
              <CardDescription>
                Only these fields are updated here
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Published</Label>
                <Switch
                  checked={extra.is_published}
                  onCheckedChange={(v) =>
                    setExtra((s) => ({ ...s, is_published: v }))
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Compare at price</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={extra.compare_at_price ?? ""}
                    onChange={(e) =>
                      setExtra((s) => ({
                        ...s,
                        compare_at_price:
                          e.target.value === "" ? null : Number(e.target.value),
                      }))
                    }
                    placeholder="e.g., 1599"
                  />
                </div>
                <div>
                  <Label>Sale price</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={extra.sale_price ?? ""}
                    onChange={(e) =>
                      setExtra((s) => ({
                        ...s,
                        sale_price:
                          e.target.value === "" ? null : Number(e.target.value),
                      }))
                    }
                    placeholder="e.g., 1299"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Sale starts</Label>
                  <Input
                    type="datetime-local"
                    value={extra.sale_starts_at}
                    onChange={(e) =>
                      setExtra((s) => ({
                        ...s,
                        sale_starts_at: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>Sale ends</Label>
                  <Input
                    type="datetime-local"
                    value={extra.sale_ends_at}
                    onChange={(e) =>
                      setExtra((s) => ({ ...s, sale_ends_at: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label>Featured</Label>
                <Switch
                  checked={extra.is_featured}
                  onCheckedChange={(v) =>
                    setExtra((s) => ({ ...s, is_featured: v }))
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>Trending</Label>
                <Switch
                  checked={extra.is_trending}
                  onCheckedChange={(v) =>
                    setExtra((s) => ({ ...s, is_trending: v }))
                  }
                />
              </div>

              <div>
                <Label>Featured rank</Label>
                <Input
                  type="number"
                  value={extra.featured_rank ?? ""}
                  onChange={(e) =>
                    setExtra((s) => ({
                      ...s,
                      featured_rank:
                        e.target.value === "" ? null : Number(e.target.value),
                    }))
                  }
                  placeholder="Lower = higher priority"
                />
              </div>

              <div>
                <Label>New until</Label>
                <Input
                  type="date"
                  value={extra.new_until}
                  onChange={(e) =>
                    setExtra((s) => ({ ...s, new_until: e.target.value }))
                  }
                />
              </div>

              <div>
                <Label>Meta title</Label>
                <Input
                  value={extra.meta_title}
                  onChange={(e) =>
                    setExtra((s) => ({ ...s, meta_title: e.target.value }))
                  }
                  placeholder="SEO title"
                />
              </div>

              <div>
                <Label>Meta description</Label>
                <Textarea
                  value={extra.meta_description}
                  onChange={(e) =>
                    setExtra((s) => ({
                      ...s,
                      meta_description: e.target.value,
                    }))
                  }
                  rows={3}
                  placeholder="SEO description"
                />
              </div>

              <div>
                <Label>OG image path</Label>
                <Input
                  value={extra.og_image_path}
                  onChange={(e) =>
                    setExtra((s) => ({ ...s, og_image_path: e.target.value }))
                  }
                  placeholder="SKU/og-image.jpg (in product-media bucket)"
                />
              </div>

              <Button
                className="w-full"
                onClick={() => handleSave({ id: product.id })}
              >
                Save all changes
              </Button>
              <Button
                className="w-full"
                variant="outline"
                onClick={handleCancel}
              >
                Cancel
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
