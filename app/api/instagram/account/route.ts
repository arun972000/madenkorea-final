// app/api/instagram/account/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("instagram_accounts")
    .select("id, ig_business_account_id, username, profile_picture_url, token_expires_at, is_active")
    .eq("owner_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("GET /api/instagram/account error:", error);
    return NextResponse.json({ error: "Failed to load instagram account" }, { status: 500 });
  }

  return NextResponse.json({ account: data ?? null });
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const {
    ig_business_account_id,
    username,
    access_token,
    token_expires_at, // optional: ISO string or 'YYYY-MM-DD'
  } = body;

  if (!ig_business_account_id || !access_token) {
    return NextResponse.json(
      { error: "ig_business_account_id and access_token are required" },
      { status: 400 }
    );
  }

  // Basic normalization
  const expiresAt =
    token_expires_at ? new Date(token_expires_at).toISOString() : null;

  const { data, error } = await supabase
    .from("instagram_accounts")
    .upsert(
      {
        owner_id: user.id,
        ig_business_account_id,
        username,
        access_token,
        token_expires_at: expiresAt,
        is_active: true,
      },
      {
        onConflict: "owner_id, ig_business_account_id",
      }
    )
    .select("id, ig_business_account_id, username, token_expires_at, is_active")
    .single();

  if (error) {
    console.error("POST /api/instagram/account error:", error);
    return NextResponse.json(
      { error: "Failed to save instagram account" },
      { status: 500 }
    );
  }

  return NextResponse.json({ account: data });
}
