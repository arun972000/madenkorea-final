// app/api/facebook/adaccounts/route.js
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

function getSupabase() {
  const cookieStore = cookies();
  return createRouteHandlerClient({ cookies: () => cookieStore });
}

// 🔹 GET = just read current connection from DB (no pages list)
export async function GET(req) {
  try {
    const supabase = getSupabase();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) throw userError;
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: account, error: accError } = await supabase
      .from("instagram_accounts")
      .select(
        "id, username, ig_business_account_id, facebook_page_id"
      )
      .eq("owner_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (accError) throw accError;

    if (!account) {
      return NextResponse.json(
        { data: null, message: "No active Instagram/Facebook account found" },
        { status: 200 }
      );
    }

    return NextResponse.json({ data: account }, { status: 200 });
  } catch (err) {
    console.error("GET /api/facebook/adaccounts error", err);
    return NextResponse.json(
      { error: "Failed to load account connection" },
      { status: 500 }
    );
  }
}

// 🔹 POST = fetch Pages + IG Biz from Graph API and store one primary Page in DB
export async function POST(req) {
  try {
    const supabase = getSupabase();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) throw userError;
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // 1️⃣ Get current instagram_accounts row
    const { data: account, error: accError } = await supabase
      .from("instagram_accounts")
      .select("*")
      .eq("owner_id", user.id)
      .eq("is_active", true)
      .single();

    if (accError) {
      console.error("No instagram_accounts row", accError);
      return NextResponse.json(
        { error: "No active instagram account config found" },
        { status: 400 }
      );
    }

    if (!account.access_token) {
      return NextResponse.json(
        { error: "Missing access token on instagram_accounts" },
        { status: 400 }
      );
    }

    const accessToken = account.access_token;

    // 2️⃣ Fetch Facebook Pages + IG Business account
const pagesRes = await fetch(
  `${GRAPH_BASE}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(
    accessToken
  )}`
);

    const pagesText = await pagesRes.text();
    let pagesJson = null;
    try {
      pagesJson = JSON.parse(pagesText);
    } catch {
      // not JSON
    }

    if (!pagesRes.ok) {
      const fbError = pagesJson?.error || pagesText;
      console.error("Error fetching /me/accounts:", fbError);
      return NextResponse.json(
        {
          error: "Failed to fetch Facebook Pages",
          fbError,
        },
        { status: 400 }
      );
    }

    const pages = pagesJson?.data || [];
    const primaryPage = pages[0] || null;
    const igBiz = primaryPage?.instagram_business_account || null;

    // 3️⃣ Update instagram_accounts row with Page + IG info
const updatePayload = {
  facebook_page_id: primaryPage?.id || account.facebook_page_id,
  ig_business_account_id: igBiz?.id || account.ig_business_account_id,
  username: igBiz?.username || account.username,
  page_access_token: primaryPage?.access_token || account.page_access_token,
};


    const { data: updated, error: updateError } = await supabase
      .from("instagram_accounts")
      .update(updatePayload)
      .eq("id", account.id)
      .select(
        "id, username, ig_business_account_id, facebook_page_id"
      )
      .single();

    if (updateError) throw updateError;

    // Return updated row + full pages list so UI can show names
    return NextResponse.json(
      {
        data: updated,
        pages,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("POST /api/facebook/adaccounts error", err);
    return NextResponse.json(
      { error: "Failed to sync Facebook Pages", details: String(err) },
      { status: 500 }
    );
  }
}

// (Optional) DELETE can still clear facebook_page_id if you kept it earlier
