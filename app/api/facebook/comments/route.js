import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

function getSupabase() {
  const cookieStore = cookies();
  return createRouteHandlerClient({ cookies: () => cookieStore });
}

/**
 * GET /api/facebook/comments?fb_post_id=POST_ID
 *  - Loads comments for a given post from Facebook
 *  - Caches into facebook_page_comments
 */
export async function GET(req) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(req.url);
    const fbPostId = searchParams.get("fb_post_id");

    if (!fbPostId) {
      return NextResponse.json(
        { error: "fb_post_id query param is required" },
        { status: 400 }
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // 1️⃣ Get page + token
    const { data: account, error: accError } = await supabase
      .from("instagram_accounts")
      .select("facebook_page_id, page_access_token")
      .eq("owner_id", user.id)
      .eq("is_active", true)
      .single();

    if (accError) {
      console.error("No instagram_accounts row", accError);
      return NextResponse.json(
        { error: "No active instagram/facebook config found" },
        { status: 400 }
      );
    }

    if (!account.page_access_token) {
      return NextResponse.json(
        { error: "No page access token stored – sync from Facebook again." },
        { status: 400 }
      );
    }

    const pageId = account.facebook_page_id;
    const pageToken = account.page_access_token;

    // 2️⃣ Fetch comments from Graph API
    const commentsUrl = `${GRAPH_BASE}/${encodeURIComponent(
      fbPostId
    )}/comments?fields=id,from,message,created_time,like_count,comment_count,is_hidden&filter=stream&order=reverse_chronological&limit=50&access_token=${encodeURIComponent(
      pageToken
    )}`;

    const fbRes = await fetch(commentsUrl);
    const fbText = await fbRes.text();
    let fbJson = null;
    try {
      fbJson = JSON.parse(fbText);
    } catch {}

    if (!fbRes.ok) {
      const fbError = fbJson?.error || fbText;
      console.error(`Error fetching comments for ${fbPostId}:`, fbError);
      return NextResponse.json(
        { error: "Failed to fetch comments", fbError },
        { status: 400 }
      );
    }

    const comments = fbJson?.data || [];

    // 3️⃣ Upsert into DB
    if (comments.length > 0) {
      const records = comments.map((c) => ({
        owner_id: user.id,
        facebook_page_id: pageId,
        fb_post_id: fbPostId,
        fb_comment_id: c.id,
        parent_comment_id: null, // only top-level for now
        message: c.message || null,
        from_id: c.from?.id || null,
        from_name: c.from?.name || null,
        created_time: c.created_time
          ? new Date(c.created_time).toISOString()
          : null,
        like_count: c.like_count ?? null,
        comment_count: c.comment_count ?? null,
        is_hidden: c.is_hidden ?? null,
      }));

      const { error: upsertError } = await supabase
        .from("facebook_page_comments")
        .upsert(records, {
          onConflict: "owner_id,fb_comment_id",
        });

      if (upsertError) {
        console.error("Upsert facebook_page_comments error:", upsertError);
      }
    }

    // 4️⃣ Read from DB and return
    const { data: cached, error: cachedError } = await supabase
      .from("facebook_page_comments")
      .select(
        "id, fb_comment_id, fb_post_id, message, from_name, from_id, created_time, like_count, comment_count, is_hidden"
      )
      .eq("owner_id", user.id)
      .eq("fb_post_id", fbPostId)
      .order("created_time", { ascending: false });

    if (cachedError) throw cachedError;

    return NextResponse.json({ data: cached }, { status: 200 });
  } catch (err) {
    console.error("GET /api/facebook/comments error", err);
    return NextResponse.json(
      { error: "Failed to load comments", details: String(err) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/facebook/comments
 * body: { fb_post_id OR parent_comment_id, message }
 *  - Adds a comment to the post (or reply to a comment)
 */
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

    const body = await req.json();
    const fbPostId = body.fb_post_id || null;
    const parentCommentId = body.parent_comment_id || null;
    const message = (body.message || "").trim();

    if (!message) {
      return NextResponse.json(
        { error: "Message cannot be empty" },
        { status: 400 }
      );
    }
    const targetId = parentCommentId || fbPostId;
    if (!targetId) {
      return NextResponse.json(
        { error: "fb_post_id or parent_comment_id is required" },
        { status: 400 }
      );
    }

    // 1️⃣ Get page info + token
    const { data: account, error: accError } = await supabase
      .from("instagram_accounts")
      .select("facebook_page_id, page_access_token")
      .eq("owner_id", user.id)
      .eq("is_active", true)
      .single();

    if (accError) {
      console.error("No instagram_accounts row", accError);
      return NextResponse.json(
        { error: "No active instagram/facebook config found" },
        { status: 400 }
      );
    }

    if (!account.page_access_token) {
      return NextResponse.json(
        { error: "No page access token stored – sync from Facebook again." },
        { status: 400 }
      );
    }

    const pageId = account.facebook_page_id;
    const pageToken = account.page_access_token;

    // 2️⃣ Create comment via Graph API
    const url = new URL(
      `${GRAPH_BASE}/${encodeURIComponent(targetId)}/comments`
    );
    const params = new URLSearchParams({
      message,
      access_token: pageToken,
    });

    const fbRes = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const fbText = await fbRes.text();
    let fbJson = null;
    try {
      fbJson = JSON.parse(fbText);
    } catch {}

    if (!fbRes.ok) {
      const fbError = fbJson?.error || fbText;
      console.error(`Error creating comment on ${targetId}:`, fbError);
      return NextResponse.json(
        { error: "Failed to create comment", fbError },
        { status: 400 }
      );
    }

    const newCommentId = fbJson.id;

    // 3️⃣ Fetch comment details
    const detailsRes = await fetch(
      `${GRAPH_BASE}/${encodeURIComponent(
        newCommentId
      )}?fields=id,from,message,created_time,like_count,comment_count,is_hidden&access_token=${encodeURIComponent(
        pageToken
      )}`
    );
    const detailsText = await detailsRes.text();
    let detailsJson = null;
    try {
      detailsJson = JSON.parse(detailsText);
    } catch {}

    const c = detailsJson || { id: newCommentId, message };
    const record = {
      owner_id: user.id,
      facebook_page_id: pageId,
      fb_post_id: fbPostId || null,
      fb_comment_id: c.id,
      parent_comment_id: parentCommentId || null,
      message: c.message || message,
      from_id: c.from?.id || null,
      from_name: c.from?.name || null,
      created_time: c.created_time
        ? new Date(c.created_time).toISOString()
        : new Date().toISOString(),
      like_count: c.like_count ?? null,
      comment_count: c.comment_count ?? null,
      is_hidden: c.is_hidden ?? null,
    };

    const { error: upsertError } = await supabase
      .from("facebook_page_comments")
      .upsert(record, {
        onConflict: "owner_id,fb_comment_id",
      });

    if (upsertError) {
      console.error("Upsert facebook_page_comments error:", upsertError);
    }

    return NextResponse.json({ data: record }, { status: 200 });
  } catch (err) {
    console.error("POST /api/facebook/comments error", err);
    return NextResponse.json(
      { error: "Failed to create comment", details: String(err) },
      { status: 500 }
    );
  }
}


export async function PATCH(req) {
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

    const body = await req.json();
    const fbCommentId = body.fb_comment_id;
    const isHidden = body.is_hidden;

    if (!fbCommentId) {
      return NextResponse.json(
        { error: "fb_comment_id is required" },
        { status: 400 }
      );
    }

    if (typeof isHidden !== "boolean") {
      return NextResponse.json(
        { error: "is_hidden must be true or false" },
        { status: 400 }
      );
    }

    // 1️⃣ Get page token
    const { data: account, error: accError } = await supabase
      .from("instagram_accounts")
      .select("page_access_token")
      .eq("owner_id", user.id)
      .eq("is_active", true)
      .single();

    if (accError) {
      console.error("No instagram_accounts row", accError);
      return NextResponse.json(
        { error: "No active instagram/facebook config found" },
        { status: 400 }
      );
    }

    if (!account.page_access_token) {
      return NextResponse.json(
        { error: "No page access token stored – sync from Facebook again." },
        { status: 400 }
      );
    }

    const pageToken = account.page_access_token;

    // 2️⃣ Call Graph API to hide/unhide
    const url = new URL(`${GRAPH_BASE}/${encodeURIComponent(fbCommentId)}`);
    const params = new URLSearchParams({
      is_hidden: isHidden ? "true" : "false",
      access_token: pageToken,
    });

    const fbRes = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const fbText = await fbRes.text();
    let fbJson = null;
    try {
      fbJson = JSON.parse(fbText);
    } catch {}

    if (!fbRes.ok) {
      const fbError = fbJson?.error || fbText;
      console.error(`Error hiding/unhiding comment ${fbCommentId}:`, fbError);
      return NextResponse.json(
        { error: "Failed to update comment visibility", fbError },
        { status: 400 }
      );
    }

    // 3️⃣ Update cached record
    const { data: updated, error: updateError } = await supabase
      .from("facebook_page_comments")
      .update({ is_hidden: isHidden })
      .eq("owner_id", user.id)
      .eq("fb_comment_id", fbCommentId)
      .select(
        "id, fb_comment_id, fb_post_id, message, from_name, from_id, created_time, like_count, comment_count, is_hidden"
      )
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ data: updated }, { status: 200 });
  } catch (err) {
    console.error("PATCH /api/facebook/comments error", err);
    return NextResponse.json(
      { error: "Failed to update comment", details: String(err) },
      { status: 500 }
    );
  }
}


export async function DELETE(req) {
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

    const { searchParams } = new URL(req.url);
    const fbCommentId = searchParams.get("fb_comment_id");

    if (!fbCommentId) {
      return NextResponse.json(
        { error: "fb_comment_id query param is required" },
        { status: 400 }
      );
    }

    // 1️⃣ Get page token
    const { data: account, error: accError } = await supabase
      .from("instagram_accounts")
      .select("page_access_token")
      .eq("owner_id", user.id)
      .eq("is_active", true)
      .single();

    if (accError) {
      console.error("No instagram_accounts row", accError);
      return NextResponse.json(
        { error: "No active instagram/facebook config found" },
        { status: 400 }
      );
    }

    if (!account.page_access_token) {
      return NextResponse.json(
        { error: "No page access token stored – sync from Facebook again." },
        { status: 400 }
      );
    }

    const pageToken = account.page_access_token;

    // 2️⃣ Delete comment in Graph
    const delUrl = `${GRAPH_BASE}/${encodeURIComponent(
      fbCommentId
    )}?access_token=${encodeURIComponent(pageToken)}`;

    const fbRes = await fetch(delUrl, { method: "DELETE" });
    const fbText = await fbRes.text();
    let fbJson = null;
    try {
      fbJson = JSON.parse(fbText);
    } catch {}

    if (!fbRes.ok) {
      const fbError = fbJson?.error || fbText;
      console.error(`Error deleting comment ${fbCommentId}:`, fbError);
      return NextResponse.json(
        { error: "Failed to delete comment", fbError },
        { status: 400 }
      );
    }

    // 3️⃣ Remove from DB cache
    const { error: deleteError } = await supabase
      .from("facebook_page_comments")
      .delete()
      .eq("owner_id", user.id)
      .eq("fb_comment_id", fbCommentId);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("DELETE /api/facebook/comments error", err);
    return NextResponse.json(
      { error: "Failed to delete comment", details: String(err) },
      { status: 500 }
    );
  }
}
