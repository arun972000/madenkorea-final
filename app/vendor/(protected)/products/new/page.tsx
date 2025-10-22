"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { useAuth } from "@/lib/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { ProductForm } from "@/components/admin/ProductForm";
import { v4 as uuidv4 } from "uuid";
import { useEffect, useState } from "react";

// minimal inline supabase client for auth/vendor check only
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

// get_my_vendor RETURNS TABLE → normalize to a single row
function coerceVendor(data: any) {
  const arr = Array.isArray(data) ? data : data ? [data] : [];
  return arr[0] ?? null;
}

export default function NewProductPage() {
  const router = useRouter();
  const { user, logout } = useAuth();

  // ✅ auth-only addition (no UI changes)
  const [gateOk, setGateOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // wait for session hydration
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        router.replace("/vendor/login?redirect=/vendor/products/new");
        return;
      }

      // fetch vendor row for this user
      const { data, error } = await supabase.rpc("get_my_vendor");
      if (cancelled) return;

      if (error) {
        console.error("get_my_vendor error", error);
        router.replace("/vendor"); // gate page handles state messaging
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

      // approved vendor → allow page
      setGateOk(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      // re-hydrate if auth changes; next render will re-run effect
      setGateOk(false);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  if (!gateOk) return null; // keep page blank while gating (no UI change)

  const handleLogout = async () => {
    await logout();
    toast.success("Logged out successfully");
    router.push("/");
  };

  const handleSave = (productData: any) => {
    // unchanged: local demo persistence then redirect
    const newProduct = {
      id: uuidv4(),
      ...productData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const products = JSON.parse(localStorage.getItem("products") || "[]");
    products.push(newProduct);
    localStorage.setItem("products", JSON.stringify(products));

    toast.success("Product created successfully");
    router.push("/vendor/products");
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
            <h1 className="text-2xl font-bold">Add New Product</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user?.name}</span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto py-8">
        <ProductForm onSave={handleSave} onCancel={handleCancel} />
      </div>
    </div>
  );
}
