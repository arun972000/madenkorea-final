"use client";

import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type AddressSnapshot = Record<string, any> | null;

export function useRazorpayCheckout() {
  const router = useRouter();
  let busy = false;

  const start = async (
    address: AddressSnapshot = null,
    notes: string | null = null
  ) => {
    if (busy) return;
    busy = true;

    try {
      // 1) Create app order from cart
      const { data: created, error: cErr } = await supabase.rpc(
        "create_order_from_cart",
        {
          p_address: address ?? null,
          p_notes: notes ?? null,
        }
      );
      if (cErr || !created || !created[0]) {
        toast.error(cErr?.message || "Could not create order");
        return;
      }
      const info = created[0] as {
        order_id: string;
        order_number: string;
        total: number;
        currency: string;
      };

      // 2) Ask server to create a Razorpay order
      const res = await fetch("/api/razorpay/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: info.order_id }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error("Payment init failed");
        return;
      }
      const { key, razorpay_order } = json;

      // 3) Ensure SDK available
      if (!window.Razorpay) {
        toast.error("Razorpay SDK not loaded");
        return;
      }

      // 4) Open Razorpay widget
      const rzp = new window.Razorpay({
        key, // public key id
        amount: razorpay_order.amount, // paise
        currency: razorpay_order.currency,
        name: "Made in Korea",
        description: `Order ${info.order_number}`,
        order_id: razorpay_order.id, // "order_xxx"
        theme: { color: "#111827" },
        // You can prefill with your profile fields
        // prefill: { name, email, contact },
        handler: async (resp: any) => {
          // 5) Verify signature on server
          const verify = await fetch("/api/razorpay/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
              app_order_id: info.order_id,
              raw: resp,
            }),
          });
          const vj = await verify.json();
          if (!verify.ok || !vj.ok) {
            toast.error(vj.error || "Payment verification failed");
            // send to failure page with reason
            router.replace(
              `/order/failure?reason=verification&order_id=${encodeURIComponent(
                info.order_id
              )}`
            );
            return;
          }

          // ✅ route to success page with real info
          router.replace(
            `/order/success?order_id=${encodeURIComponent(
              vj.order_id
            )}&order_no=${encodeURIComponent(
              vj.order_number || info.order_number
            )}`
          );
        },
        modal: {
          ondismiss: () => toast.info("Payment cancelled"),
        },
        notes: { app_order_id: info.order_id },
      });

      rzp.open();
    } finally {
      busy = false;
    }
  };

  return { start };
}
