"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Hourglass, ShieldAlert } from "lucide-react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

type VendorInfo = {
  id: string;
  display_name: string;
  slug: string | null;
  status: "pending" | "approved" | "rejected" | "disabled";
  role: "owner" | "manager" | "staff" | null;
  rejected_reason?: string | null;
  email?: string | null;
};

// RPC (RETURNS TABLE) → normalize to first row
function coerceVendor(data: any): VendorInfo | null {
  const arr = Array.isArray(data) ? data : data ? [data] : [];
  const v = arr[0];
  if (!v || !v.id) return null;
  return {
    id: v.id,
    display_name: v.display_name,
    slug: v.slug ?? null,
    status: v.status,
    role: v.role ?? null,
    rejected_reason: v.rejected_reason ?? null,
    email: v.email ?? null,
  };
}

type Phase =
  | "checking"
  | "redirecting"
  | "no-vendor"
  | "pending"
  | "rejected"
  | "disabled"
  | "approved"
  | "error";

// ✅ Public vendor pages should never be gated
const PUBLIC_VENDOR_PREFIXES = [
  "/vendor/login",
  "/vendor/register",
  "/vendor/forgot-password",
];

// robust startsWith that also matches trailing slashes
const isPublic = (pathname: string) =>
  PUBLIC_VENDOR_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

export default function VendorGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname() || "";
  const mounted = useRef(true);

  // If we’re on a public vendor route, bypass everything immediately
  if (isPublic(pathname)) {
    return <>{children}</>;
  }

  const [phase, setPhase] = useState<Phase>("checking");
  const [vendor, setVendor] = useState<VendorInfo | null>(null);

  const gotoLogin = () => {
    // (Defensive) never redirect away from public pages
    if (isPublic(pathname)) return;
    setPhase("redirecting");
    router.replace(`/vendor/login?redirect=${encodeURIComponent(pathname)}`);
  };

  const checkVendor = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!mounted.current) return;

    if (!session?.user) {
      gotoLogin();
      return;
    }

    const { data, error } = await supabase.rpc("get_my_vendor");
    if (!mounted.current) return;

    if (error) {
      console.error("get_my_vendor error", error);
      setVendor(null);
      setPhase("error");
      return;
    }

    const v = coerceVendor(data);
    setVendor(v);

    if (!v) {
      setPhase("no-vendor");
      return;
    }
    if (v.status === "approved") {
      setPhase("approved");
      return;
    }
    if (v.status === "pending") {
      setPhase("pending");
      return;
    }
    if (v.status === "rejected") {
      setPhase("rejected");
      return;
    }
    setPhase("disabled");
  };

  useEffect(() => {
    mounted.current = true;

    // run only for protected pages (public are returned above)
    checkVendor();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (!mounted.current) return;

      if (event === "SIGNED_OUT") {
        setVendor(null);
        // after logout, protected pages go to login;
        // public pages render immediately (but we never reach here on public)
        gotoLogin();
        return;
      }

      if (
        event === "SIGNED_IN" ||
        event === "INITIAL_SESSION" ||
        event === "USER_UPDATED" ||
        event === "TOKEN_REFRESHED"
      ) {
        setPhase("checking");
        checkVendor();
      }
    });

    return () => {
      mounted.current = false;
      sub.subscription.unsubscribe();
    };
    // re-run if protected path changes
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Protected render states ----------
  if (phase === "checking" || phase === "redirecting") {
    return (
      <div className="container mx-auto py-16 text-muted-foreground">
        Loading vendor workspace…
      </div>
    );
  }

  if (phase === "no-vendor") {
    return (
      <div className="container mx-auto py-16">
        <Card className="max-w-xl mx-auto text-center">
          <CardHeader>
            <CardTitle className="text-2xl">Become a Vendor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              You don’t have a vendor account yet.
            </p>
            <Button asChild size="lg">
              <Link href="/vendor/register">Create Vendor Account</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (phase === "pending") {
    return (
      <div className="container mx-auto py-16">
        <Card className="max-w-xl mx-auto text-center">
          <CardHeader>
            <Hourglass className="mx-auto h-10 w-10 text-amber-500" />
            <CardTitle className="text-2xl mt-2">
              Application in Review
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-muted-foreground">
              Thanks for applying
              {vendor?.display_name ? `, ${vendor.display_name}` : ""}. We’ll
              notify you once approved.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (phase === "rejected" || phase === "disabled") {
    return (
      <div className="container mx-auto py-16">
        <Card className="max-w-xl mx-auto text-center">
          <CardHeader>
            <ShieldAlert className="mx-auto h-10 w-10 text-red-500" />
            <CardTitle className="text-2xl mt-2">
              {phase === "rejected"
                ? "Application Rejected"
                : "Account Disabled"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {vendor?.rejected_reason ? (
              <p className="text-sm text-muted-foreground">
                Reason: {vendor.rejected_reason}
              </p>
            ) : (
              <p className="text-muted-foreground">Please contact support.</p>
            )}
            <Button asChild variant="outline">
              <Link href="/">Back to Home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="container mx-auto py-16 text-destructive">
        Something went wrong. Please refresh or try again.
      </div>
    );
  }

  // ✅ Approved → render the vendor area
  return <>{children}</>;
}
