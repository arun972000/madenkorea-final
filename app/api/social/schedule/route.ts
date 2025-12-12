// app/api/social/schedule/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const ADMIN_OWNER_ID =
  process.env.FB_OWNER_ID || process.env.ADMIN_OWNER_ID || null;

export async function POST(req: Request) {
  try {
    const body = await req.json();

    let {
      channel,
      platform,
      caption,
      message,
      media_url,
      media_type,
      scheduled_at,
    } = body as {
      channel?: string;
      platform?: string;
      caption?: string;
      message?: string;
      media_url?: string;
      media_type?: string;
      scheduled_at?: string;
    };

    // Map channel/platform -> your enum column
    const effectivePlatform = (platform || channel || "instagram") as string;

    if (!media_url || !media_type || !scheduled_at) {
      return NextResponse.json(
        { error: "media_url, media_type and scheduled_at are required" },
        { status: 400 }
      );
    }

    if (effectivePlatform !== "instagram") {
      return NextResponse.json(
        { error: "Only instagram scheduling is supported for now" },
        { status: 400 }
      );
    }

    const scheduledDate = new Date(scheduled_at);
    if (Number.isNaN(scheduledDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid scheduled_at format" },
        { status: 400 }
      );
    }

    // ---- resolve owner_id (required, NOT NULL) ----
    let ownerId = ADMIN_OWNER_ID as string | null;

    if (!ownerId) {
      const { data: account, error: accErr } = await supabaseAdmin
        .from("instagram_accounts")
        .select("owner_id")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (accErr) {
        console.error("resolve owner_id error", accErr);
        throw new Error("Failed to determine owner_id");
      }
      if (!account) {
        throw new Error(
          "No active instagram_accounts row found to determine owner_id"
        );
      }
      ownerId = account.owner_id;
    }

    // Use your message column as the caption text
    const finalMessage =
      (message && message.trim()) ||
      (caption && caption.trim()) ||
      null;

    const payload = {
      caption: caption ?? finalMessage ?? "",
      media_url,
      media_type,
    };

    const { data, error } = await supabaseAdmin
      .from("social_scheduled_posts")
      .insert({
        owner_id: ownerId,
        platform: effectivePlatform, // must be 'instagram' | 'facebook'
        channel: effectivePlatform,  // optional helper
        message: finalMessage,
        media_url,
        media_type,
        scheduled_at: scheduledDate.toISOString(),
        status: "pending",
        payload,
      })
      .select("*")
      .single();

    if (error) {
      console.error("social_scheduled_posts insert error", error);
      return NextResponse.json(
        { error: "Failed to insert scheduled post" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (err: any) {
    console.error("/api/social/schedule error", err);
    return NextResponse.json(
      { error: err.message || "Failed to schedule post" },
      { status: 500 }
    );
  }
}
