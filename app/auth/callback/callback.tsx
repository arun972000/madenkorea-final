"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

function safeRedirect(v: string | null) {
  // prevent open-redirects
  if (!v) return null;
  return v.startsWith("/") ? v : null;
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const redirectFromQuery = safeRedirect(searchParams.get("redirect"));
  const [checking, setChecking] = useState(true);

  const attachAfterAuth = async () => {
    const { data: s } = await supabase.auth.getSession();
    const at = s?.session?.access_token;
    const rt = s?.session?.refresh_token;
    if (!at || !rt) return;

    await fetch("/api/auth/attach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ access_token: at, refresh_token: rt }),
    }).catch(() => {});
  };

  useEffect(() => {
    console.log("[CALLBACK] landed url:", window.location.href);
console.log("[CALLBACK] search:", window.location.search);
console.log("[CALLBACK] redirect param:", searchParams.get("redirect"));
console.log("[CALLBACK] code exists:", !!searchParams.get("code"));

    (async () => {
      try {
        // ✅ PKCE: exchange code -> session
        const code = searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        // fallback redirect from localStorage if query param missing
        const redirectFromStorage =
          safeRedirect(localStorage.getItem("postLoginRedirect")) || null;

        const finalRedirect =
          redirectFromQuery || redirectFromStorage || "/account";

        // cleanup
        localStorage.removeItem("postLoginRedirect");

        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          toast.error("Could not complete sign in. Please try again.");
          router.replace(
            `/auth/login?redirect=${encodeURIComponent(finalRedirect)}`
          );
          return;
        }

        await attachAfterAuth();
        router.replace(finalRedirect);
      } catch (err) {
        console.error(err);
        toast.error("Something went wrong while signing you in.");
        const fallback = redirectFromQuery || "/account";
        router.replace(`/auth/login?redirect=${encodeURIComponent(fallback)}`);
      } finally {
        setChecking(false);
      }
    })();
  }, [router, searchParams, redirectFromQuery]);

  return (
    <CustomerLayout>
      <div className="container mx-auto py-16">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle>Signing you in…</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {checking
                ? "Completing your login. Please wait…"
                : "Redirecting…"}
            </p>
          </CardContent>
        </Card>
      </div>
    </CustomerLayout>
  );
}
