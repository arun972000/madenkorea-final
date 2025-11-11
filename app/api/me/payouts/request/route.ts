export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { headers, cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

const json = (d:any, s=200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

async function getUserOr401() {
  const supabase = createRouteHandlerClient({ cookies });
  const h = headers();
  let user: any = null;

  const auth = h.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    const { data, error } = await supabase.auth.getUser(token);
    if (!error) user = data.user;
  }
  if (!user) {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }
  if (!user) return { supabase, user: null, error: json({ ok:false, error:"UNAUTH" }, 401) };
  return { supabase, user, error: null };
}

export async function POST(req: Request) {
  const { supabase, user, error } = await getUserOr401();
  if (!user) return error!;
  const body = await req.json().catch(() => ({}));

  const method = (body.method === "store_credit" ? "store_credit" : "manual") as "store_credit"|"manual";
  const amount = Number(body.amount ?? 0);
  const contact_email = body.contact_email ? String(body.contact_email) : null;
  const request_note = body.request_note ? String(body.request_note) : null;

  if (!(amount > 0)) return json({ ok:false, error:"Enter a valid amount." }, 400);

  // Compute available = lifetime commission - (all requested/processing/paid)
  const { data: sumL } = await supabase
    .from("order_attributions")
    .select("commission_amount")
    .eq("influencer_id", user.id);

  const lifetime = (sumL ?? []).reduce((t, r:any) => t + Number(r.commission_amount || 0), 0);

  const { data: sumP } = await supabase
    .from("influencer_payouts")
    .select("amount, status")
    .eq("influencer_id", user.id);

  const reserved = (sumP ?? []).reduce((t, r:any) => {
    const s = String(r.status || "");
    return (s === "initiated" || s === "processing" || s === "paid")
      ? t + Number(r.amount || 0)
      : t;
  }, 0);

  const available = Math.max(0, lifetime - reserved);
  if (amount > available) {
    return json({ ok:false, error:`Amount exceeds available ₹${Math.floor(available)}.` }, 400);
  }

  const payload = {
    influencer_id: user.id,
    amount,
    currency: "INR",
    status: "initiated",        // Pending
    method,
    contact_email,
    request_note,
    settled_reference: null as any,
    notes: null as any,
  };

  const { data, error: err } = await supabase
    .from("influencer_payouts")
    .insert(payload)
    .select("id, amount, status, method, created_at")
    .single();

  if (err) return json({ ok:false, error: err.message }, 400);
  return json({ ok:true, payout: data });
}
