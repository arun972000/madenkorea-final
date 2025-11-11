// app/api/checkout/calc-totals/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getPromoCodeFromCookie } from "@/lib/promo-cookie";
import { roundMoney } from "@/lib/currency";

type LineInput = { product_id: string; qty: number };

// --- helper: check sale window ---
function isSaleActive(start?: string | null, end?: string | null) {
  const now = new Date();
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;
  if (s && now < s) return false;
  if (e && now > e) return false;
  return true;
}

// --- helper: choose unit price (sale if active, else price) ---
function effectiveUnitPrice(p: any) {
  const saleOk =
    p?.sale_price != null &&
    isSaleActive(p?.sale_starts_at ?? null, p?.sale_ends_at ?? null);
  return saleOk && p?.sale_price != null ? Number(p.sale_price) : Number(p.price ?? 0);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const lines: LineInput[] = Array.isArray(body?.lines) ? body.lines : [];
  const shipping_fee = Number(body?.shippingFee || 0);
  if (!lines.length) return NextResponse.json({ ok: false, error: "EMPTY_CART" }, { status: 400 });
  if (!lines.every(l => l.product_id && Number(l.qty) > 0)) return NextResponse.json({ ok: false, error: "BAD_LINES" }, { status: 400 });

  const sb = createAdminClient();
  const productIds = [...new Set(lines.map(l => l.product_id))];

  // Products (trusted prices) — add sale fields
  const { data: products, error: pErr } = await sb
    .from("products")
    .select(
      "id,name,price,currency,is_published,promo_exempt,sale_price,sale_starts_at,sale_ends_at"
    )
    .in("id", productIds);

  if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });
  const prodMap = new Map(products!.map((p: any) => [p.id, p]));
  if (prodMap.size !== productIds.length) return NextResponse.json({ ok: false, error: "PRODUCT_NOT_FOUND" }, { status: 404 });

  // Currency + publish checks
  const currency = products![0].currency;
  for (const p of products as any[]) {
    if (!p.is_published) return NextResponse.json({ ok: false, error: "UNPUBLISHED_ITEM" }, { status: 400 });
    if (p.currency !== currency) return NextResponse.json({ ok: false, error: "MIXED_CURRENCY_NOT_SUPPORTED" }, { status: 400 });
  }

  // Caps
  const { data: caps, error: cErr } = await sb
    .from("influence_caps")
    .select("product_id,cap_percent")
    .in("product_id", productIds);
  if (cErr) return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 });
  const capMap = new Map((caps as any[]).map(c => [c.product_id, Number(c.cap_percent)]));

  // Promo (optional)
  const code = getPromoCodeFromCookie();
  let promo: any = null;
  if (code) {
    const { data: pd, error: perr } = await sb.rpc("get_promo_details", { p_code: code });
    if (perr) return NextResponse.json({ ok: false, error: perr.message }, { status: 500 });
    const row = (Array.isArray(pd) ? pd[0] : pd) as any;
    if (row) {
      promo = {
        id: row.id,
        code: row.code,
        scope: row.scope,                 // 'global' | 'product'
        influencer_id: row.influencer_id,
        product_id: row.product_id,
        user_discount_percent: Number(row.user_discount_percent),
        commission_percent: Number(row.commission_percent),
      };
    }
  }

  // Compute (now using effective sale price)
  const lineResults: any[] = [];
  let subtotal = 0, discount_total = 0, commission_total = 0;

  for (const l of lines) {
    const p = prodMap.get(l.product_id)!;
    const qty = Number(l.qty);

    // KEY FIX: compute unit and line subtotal from sale price (if active), else price
    const unit = effectiveUnitPrice(p);
    const lineSub = roundMoney(unit * qty);
    subtotal = roundMoney(subtotal + lineSub);

    let effUserPct = 0, effCommPct = 0;
    const eligible =
      !!promo &&
      !p.promo_exempt &&
      (promo.scope === "global" || promo.product_id === p.id);

    if (eligible) {
      const cap = capMap.get(p.id) ?? 20.0;
      effCommPct = Math.min(promo.commission_percent, cap);
      effUserPct = Math.max(0, Math.min(promo.user_discount_percent, cap - effCommPct));
    }

    const lineDiscount = roundMoney(lineSub * (effUserPct / 100));
    const lineCommission = roundMoney(lineSub * (effCommPct / 100));

    discount_total = roundMoney(discount_total + lineDiscount);
    commission_total = roundMoney(commission_total + lineCommission);

    lineResults.push({
      product_id: p.id,
      qty,
      unit_price: unit,          // reflect effective unit used in calc
      line_subtotal: lineSub,
      promo_applied: eligible,
      effective_user_discount_pct: effUserPct,
      effective_commission_pct: effCommPct,
      line_discount: lineDiscount,
      line_commission: lineCommission,
    });
  }

  const total = roundMoney(subtotal + shipping_fee - discount_total);

  return NextResponse.json({
    ok: true,
    currency,
    subtotal,
    shipping_fee: roundMoney(shipping_fee),
    discount_total,
    total,
    commission_total, // for attribution/payouts
    applied: promo
      ? { type: "promo", code: promo.code, scope: promo.scope, influencer_id: promo.influencer_id }
      : null,
    lines: lineResults,
  });
}
