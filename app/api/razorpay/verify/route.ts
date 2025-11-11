import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const money = (n: any) => +(Number(n || 0).toFixed(2));

export async function POST(req: NextRequest) {
  const dbg: any[] = [];
  try {
    const url = new URL(req.url);
    const DEBUG = url.searchParams.get("debug") === "1";
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      app_order_id,
      raw,            // optional from client handler
      __debug,        // optional flag in body
    } = body || {};
    const WANT_DEBUG = DEBUG || !!__debug;

    dbg.push({ step: "init", env: {
      hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasRZPKeyId: !!process.env.RAZORPAY_KEY_ID,
      hasRZPKeySecret: !!process.env.RAZORPAY_KEY_SECRET,
    }});

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !app_order_id) {
      const res = { ok: false, error: "Missing fields", debug: WANT_DEBUG ? dbg : undefined };
      return NextResponse.json(res, { status: 400 });
    }

    // 1) Verify signature
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const sigOk = expected === razorpay_signature;
    dbg.push({ step: "sig", expected, provided: razorpay_signature, ok: sigOk });
    if (!sigOk) {
      const res = { ok: false, error: "Invalid signature", debug: WANT_DEBUG ? dbg : undefined };
      return NextResponse.json(res, { status: 400 });
    }

    // Admin (service role) client
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 2) Load order (+ fields we use)
    const { data: order, error: oErr } = await admin
      .from("orders")
      .select(`
        id,
        user_id,
        status,
        subtotal,
        shipping_fee,
        discount_total,
        total,
        currency,
        order_number,
        promo_code_id,
        promo_snapshot
      `)
      .eq("id", app_order_id)
      .maybeSingle();

    dbg.push({ step: "order.load", error: oErr?.message, order });
    if (oErr || !order) {
      const res = { ok: false, error: "Order not found", debug: WANT_DEBUG ? dbg : undefined };
      return NextResponse.json(res, { status: 404 });
    }
    if (order.status === "paid") {
      const res = { ok: true, order_id: order.id, order_number: order.order_number ?? order.id, debug: WANT_DEBUG ? dbg : undefined };
      return NextResponse.json(res);
    }
    if (!["pending_payment","created"].includes(order.status)) {
      const res = { ok: false, error: `Order status ${order.status}`, debug: WANT_DEBUG ? dbg : undefined };
      return NextResponse.json(res, { status: 400 });
    }

    // 3) Existing attribution?
    const { data: attrib, error: aErr } = await admin
      .from("order_attributions")
      .select("order_id, influencer_id, promo_code_id, attributed_by, discount_percent, commission_percent, commission_amount, currency, status")
      .eq("order_id", order.id)
      .maybeSingle();
    dbg.push({ step: "attrib.load", error: aErr?.message, attrib });

    let discountPct = attrib?.discount_percent ? Number(attrib.discount_percent) : 0;
    let commissionPct = attrib?.commission_percent ? Number(attrib.commission_percent) : 0;
    let influencerId = attrib?.influencer_id || null;
    let promoCodeId = attrib?.promo_code_id || null;
    let attributedBy = attrib?.attributed_by || null;

    console.log(influencerId)

    const tryLoadPromoById = async (id?: string | null) => {
      if (!id) return null;
      const { data: promo, error } = await admin
        .from("promo_codes")
        .select("id, influencer_id, discount_percent, commission_percent")
        .eq("id", id)
        .maybeSingle();
      dbg.push({ step: "promo.lookup", id, error: error?.message, promo });
      return promo || null;
    };

    // 4) Prefer orders.promo_code_id / promo_snapshot, then fallback to RZP notes
    if ((!attrib || !influencerId) && (order.promo_code_id || order.promo_snapshot)) {
      let promo: any = null;
      if (order.promo_code_id) promo = await tryLoadPromoById(order.promo_code_id);
      if (!promo && order.promo_snapshot) {
        const snap = order.promo_snapshot as any;
        const idGuess = snap?.id ?? snap?.promo_code_id ?? null;
        if (idGuess) promo = await tryLoadPromoById(idGuess);
      }
      if (promo) {
        influencerId = promo.influencer_id;
        promoCodeId  = promo.id;
        discountPct  = Number(promo.discount_percent || 0);
        commissionPct= Number(promo.commission_percent || 0);
        attributedBy = "promo";
      }
      dbg.push({ step: "attrib.from.order", influencerId, promoCodeId, discountPct, commissionPct, attributedBy });
    }

    // Fetch RZP order (to get notes + amount_paid)
    let ro: any = null;
    {
      const key_id = process.env.RAZORPAY_KEY_ID!;
      const key_secret = process.env.RAZORPAY_KEY_SECRET!;
      const auth = Buffer.from(`${key_id}:${key_secret}`).toString("base64");
      try {
        const r = await fetch(`https://api.razorpay.com/v1/orders/${razorpay_order_id}`, {
          headers: { Authorization: `Basic ${auth}` },
        });
        ro = await r.json();
        dbg.push({ step: "rzp.order", id: razorpay_order_id, amount: ro?.amount, amount_paid: ro?.amount_paid, notes: ro?.notes });
      } catch (e: any) {
        dbg.push({ step: "rzp.order.error", error: e?.message || String(e) });
      }
    }

    if ((!attrib || !influencerId) && ro?.notes) {
      const notes = ro.notes;
      const promoId = notes?.promo_code_id || notes?.promoId || null;
      if (notes?.type === "promo" && promoId && notes?.influencer_id) {
        const promo = await tryLoadPromoById(promoId);
        if (promo) {
          influencerId = promo.influencer_id;
          promoCodeId  = promo.id;
          discountPct  = Number(promo.discount_percent || 0);
          commissionPct= Number(promo.commission_percent || 0);
          attributedBy = "promo";
        }
      }
      dbg.push({ step: "attrib.from.notes", influencerId, promoCodeId, discountPct, commissionPct, attributedBy });
    }

    // 5) Compute commission from SUBTOTAL
    const base = money(order.subtotal);
    const commissionAmount = money(base * (commissionPct / 100));
    dbg.push({ step: "commission", base, commissionPct, commissionAmount });

    // 5b) Write attribution robustly (insert then update)
    if (influencerId) {
      // INSERT
      const ins = await admin
        .from("order_attributions")
        .insert({
          order_id: order.id,
          influencer_id: influencerId,
          promo_code_id: promoCodeId ?? null,
          attributed_by: (attributedBy ?? (promoCodeId ? "promo" : "link")),
          discount_percent: discountPct,
          commission_percent: commissionPct,
          commission_amount: commissionAmount,
          currency: order.currency || "INR",
          status: "pending",
        });
      dbg.push({ step: "attrib.insert", error: ins.error?.message });

      if (ins.error) {
        // UPDATE fallback by order_id
        const upd = await admin
          .from("order_attributions")
          .update({
            influencer_id: influencerId,
            promo_code_id: promoCodeId ?? null,
            attributed_by: (attributedBy ?? (promoCodeId ? "promo" : "link")),
            discount_percent: discountPct,
            commission_percent: commissionPct,
            commission_amount: commissionAmount,
            currency: order.currency || "INR",
            status: "pending",
          })
          .eq("order_id", order.id);
        dbg.push({ step: "attrib.update", error: upd.error?.message });
      }
    } else {
      dbg.push({ step: "attrib.skip", reason: "no influencerId resolved" });
    }

    // 6) Mark order paid + write actual paid
    const shippingFee   = money(order.shipping_fee);
    const discountAmount= money(base * (discountPct / 100));
    const computedFinal = money(base - discountAmount + shippingFee);

    const paidAmount =
      ro && typeof ro.amount_paid === "number"
        ? money(ro.amount_paid / 100)
        : computedFinal;

    const updOrder = await admin
      .from("orders")
      .update({
        status: "paid",
        discount_total: discountAmount,
        total: paidAmount,
        payment_provider: "razorpay",
        payment_reference: razorpay_payment_id,
        payment_meta: raw ? { raw } : null,
        paid_at: new Date().toISOString(),
      })
      .eq("id", order.id);
    dbg.push({ step: "order.update", error: updOrder.error?.message, write: { discountAmount, paidAmount, shippingFee } });
    if (updOrder.error) {
      const res = { ok: false, error: updOrder.error.message, debug: WANT_DEBUG ? dbg : undefined };
      return NextResponse.json(res, { status: 500 });
    }

    // 7) Promo uses (best-effort)
    if (promoCodeId) {
      const uses = await admin
        .from("promo_codes")
        .update({ uses: undefined })
        .eq("id", promoCodeId);
      dbg.push({ step: "promo.uses", error: uses.error?.message });
    }

    // 8) Clear cart
    if (order.user_id) {
      const cleared = await admin.rpc("cart_clear_for_user", { p_user_id: order.user_id });
      dbg.push({ step: "cart.clear", error: cleared.error?.message });
    }

    const res = {
      ok: true,
      order_id: order.id,
      order_number: order.order_number ?? order.id,
      debug: WANT_DEBUG ? dbg : undefined,
    };
    return NextResponse.json(res);
  } catch (e: any) {
    dbg.push({ step: "fatal", error: e?.message || String(e) });
    return NextResponse.json({ ok: false, error: e?.message || "Failed", debug: dbg }, { status: 500 });
  }
}
