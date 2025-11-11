import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

async function withUser(req: NextRequest) {
  const cookieStore = cookies();
  const sbCookies = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
  let { data: { user } } = await sbCookies.auth.getUser();
  let sb = sbCookies;

  if (!user) {
    const auth = req.headers.get("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (token) {
      const sbBearer = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false }
      });
      const { data } = await sbBearer.auth.getUser(token);
      if (data.user) { user = data.user; sb = sbBearer as any; }
    }
  }
  return { user, sb };
}

export async function GET(req: NextRequest) {
  const { user, sb } = await withUser(req);
  if (!user) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });

  // lifetime
  const { data: lifeAgg } = await sb
    .from("order_attributions")
    .select("commission_amount, status")
    .eq("influencer_id", user.id);

  const lifetime = (lifeAgg || []).reduce((a, r:any) => a + Number(r.commission_amount || 0), 0);
  const paid = (lifeAgg || []).filter((r:any) => r.status === "paid")
    .reduce((a, r:any) => a + Number(r.commission_amount || 0), 0);
  const pending = (lifeAgg || []).filter((r:any) => r.status === "pending" || r.status === "approved")
    .reduce((a, r:any) => a + Number(r.commission_amount || 0), 0);

  // payouts debited
  const { data: payoutsAgg } = await sb
    .from("influencer_payouts")
    .select("amount, status")
    .eq("influencer_id", user.id)
    .in("status", ["initiated","processing","paid"]);

  const debited = (payoutsAgg || []).reduce((a, r:any) => a + Number(r.amount || 0), 0);

  // available: approved commissions – payouts(not failed)
  const available = Math.max(0, 
    (lifeAgg || []).filter((r:any)=> r.status === "approved")
      .reduce((a, r:any) => a + Number(r.commission_amount || 0), 0) - debited
  );

  return NextResponse.json({
    ok: true,
    lifetime_commission: lifetime,
    paid_total: paid,
    pending_total: pending,
    available_to_withdraw: available,
  });
}
