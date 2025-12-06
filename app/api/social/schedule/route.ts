// app/api/social/schedule/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_OWNER_ID = process.env.FB_OWNER_ID || null; // optional fixed owner

function getAdminSupabase() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("Supabase URL or SERVICE_ROLE_KEY env missing");
  }

  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

// Resolve owner_id used for scheduled posts
async function resolveOwnerId(supabase: ReturnType<typeof createClient>) {
  if (ADMIN_OWNER_ID) return ADMIN_OWNER_ID;

  const { data, error } = await supabase
    .from("instagram_accounts")
    .select("owner_id")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("resolveOwnerId instagram_accounts error:", error);
    throw new Error("Failed to resolve owner_id from instagram_accounts");
  }

  if (!data?.owner_id) {
    throw new Error(
      "No owner_id found – set FB_OWNER_ID env or ensure instagram_accounts has a row"
    );
  }

  return data.owner_id as string;
}

// 🔹 List scheduled posts (for UI)
export async function GET(req: Request) {
  try {
    const supabase = getAdminSupabase();
    const { searchParams } = new URL(req.url);
    const platform = searchParams.get("platform"); // "instagram" | "facebook" | null

    const ownerId = await resolveOwnerId(supabase);

    let query = supabase
      .from("social_scheduled_posts")
      .select(
        "id, platform, channel, scheduled_at, status, payload, last_error"
      )
      .eq("owner_id", ownerId)
      .eq("status", "pending")
      .order("scheduled_at", { ascending: true });

    if (platform) {
      query = query.eq("platform", platform);
    }

    const { data, error } = await query;

    if (error) {
      console.error("GET /api/social/schedule error:", error);
      return NextResponse.json(
        { error: "Failed to load scheduled posts" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (err: any) {
    console.error("GET /api/social/schedule fatal:", err);
    return NextResponse.json(
      { error: "Failed to load scheduled posts", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}

// 🔹 Create a scheduled post
export async function POST(req: Request) {
  try {
    const supabase = getAdminSupabase();
    const body = await req.json();

    const {
      platform,      // "facebook" | "instagram"
      channel,       // optional: "feed" | "reels" | ...
      scheduled_at,  // ISO string
      payload,       // { caption, media_url, media_type, ... }
    } = body;

    if (!platform) {
      return NextResponse.json(
        { error: "platform is required (e.g. 'facebook' or 'instagram')" },
        { status: 400 }
      );
    }

    if (!scheduled_at) {
      return NextResponse.json(
        { error: "scheduled_at is required" },
        { status: 400 }
      );
    }

    const scheduleDate = new Date(scheduled_at);
    if (Number.isNaN(scheduleDate.getTime())) {
      return NextResponse.json(
        { error: "scheduled_at must be a valid date/time" },
        { status: 400 }
      );
    }

    const scheduledIso = scheduleDate.toISOString();
    const payloadJson = payload && typeof payload === "object" ? payload : {};

    const ownerId = await resolveOwnerId(supabase);

    const { data, error } = await supabase
      .from("social_scheduled_posts")
      .insert({
        owner_id: ownerId,
        platform,
        channel: channel || null,
        scheduled_at: scheduledIso,
        status: "pending",
        payload: payloadJson,
      })
      .select("id, platform, channel, scheduled_at, status, payload")
      .single();

    if (error) {
      console.error("INSERT social_scheduled_posts error:", error);
      return NextResponse.json(
        { error: "Failed to save scheduled post", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (err: any) {
    console.error("POST /api/social/schedule fatal:", err);
    return NextResponse.json(
      { error: "Failed to schedule post", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}
