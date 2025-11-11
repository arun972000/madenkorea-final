import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { order_id, ui_total, attribution } = body || {};

    if (!order_id) {
      return NextResponse.json({ ok: false, error: "Missing order_id" }, { status: 400 });
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1) Load the app order
    const { data: order, error: oErr } = await admin
      .from("orders")
      .select("id, user_id, subtotal, total, currency, status")
      .eq("id", order_id)
      .maybeSingle();

    if (oErr || !order) {
      return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
    }

    if (!["created", "pending_payment"].includes(order.status)) {
      return NextResponse.json(
        { ok: false, error: `Order status ${order.status} not payable` },
        { status: 400 }
      );
    }

    // 2) Determine amount to charge (prefer UI total)
    const clientTotal = Number(ui_total);
    const serverTotal = Number(order.total) || 0;

    let amountToUse = serverTotal;
    if (!isNaN(clientTotal) && clientTotal > 0) {
      amountToUse = clientTotal;
    }

    const amountPaise = Math.round(amountToUse * 100);

    // 3) Build notes and (if promo) resolve influencer + seed attribution
    const notes: Record<string, any> = {
      app_order_id: order.id,
    };

    let promoCodeId: string | null = null;
    let influencerId: string | null = null;
    let discountPercent = 0;
    let commissionPercent = 0;

    if (attribution?.type === "promo" && attribution?.code) {
      // Look up promo by CODE (and optionally scope/product)
      const { data: promo, error: promoErr } = await admin
        .from("promo_codes")
        .select("id, influencer_id, discount_percent, commission_percent, active, starts_at, expires_at")
        .eq("code", attribution.code)
        .eq("active", true)
        .maybeSingle();

      if (promoErr) {
        console.warn("[RZP:create] promo lookup error:", promoErr.message);
      }

      if (promo) {
        // (Optional) time window check
        const now = new Date();
        const inWindow =
          (!promo.starts_at || new Date(promo.starts_at) <= now) &&
          (!promo.expires_at || new Date(promo.expires_at) >= now);

        if (inWindow) {
          promoCodeId = promo.id;
          influencerId = promo.influencer_id;
          discountPercent = Number(promo.discount_percent || 0);
          commissionPercent = Number(promo.commission_percent || 0);

          // 3a) Seed order_attributions row NOW (old behavior)
          await admin
            .from("order_attributions")
            .upsert(
              {
                order_id: order.id,
                influencer_id: influencerId,
                promo_code_id: promoCodeId,
                attributed_by: "promo",
                discount_percent: discountPercent,
                commission_percent: commissionPercent,
                commission_amount: 0,
                currency: order.currency || "INR",
                status: "pending",
              },
              { onConflict: "order_id" }
            );

          // 3b) Also attach promo to the order (so verify can rebuild if needed)
          await admin
            .from("orders")
            .update({
              promo_code_id: promoCodeId,
              promo_snapshot: {
                id: promo.id,
                code: attribution.code,
                discount_percent: discountPercent,
                commission_percent: commissionPercent,
                influencer_id: influencerId,
              },
            })
            .eq("id", order.id);

          // 3c) Put attribution into Razorpay notes (this is where your influencer_id was null before)
          notes.type = "promo";
          notes.code = attribution.code;
          notes.promo_code_id = promoCodeId;
          notes.influencer_id = influencerId;
          notes.discount_percent = discountPercent;
          notes.commission_percent = commissionPercent;
        }
      }
    }

    // 4) Init Razorpay client
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });

    // 5) Create RZP order
    const rzpOrder = await razorpay.orders.create({
      amount: amountPaise,
      currency: order.currency || "INR",
      receipt: order.id,
      notes,
    });

    // 6) Persist payment_orders mapping (best effort)
    await admin.from("payment_orders").insert({
      order_id: order.id,
      provider: "razorpay",
      provider_order_id: rzpOrder.id,
      amount: amountToUse,
      currency: order.currency || "INR",
      status: "created",
      receipt: rzpOrder.receipt || order.id,
    });

    return NextResponse.json({
      ok: true,
      key: process.env.RAZORPAY_KEY_ID,
      razorpay_order: rzpOrder,
    });
  } catch (e: any) {
    console.error("[RZP:create] error", e);
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
  }
}
