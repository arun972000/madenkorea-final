// app/api/facebook/page-posts/route.js
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

function getSupabase() {
  const cookieStore = cookies();
  return createRouteHandlerClient({ cookies: () => cookieStore });
}

// 🔹 GET = fetch latest posts from Facebook Page, cache in DB, return list
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

    // 1️⃣ Get page + page_access_token from instagram_accounts
    const { data: account, error: accError } = await supabase
      .from("instagram_accounts")
      .select("id, facebook_page_id, page_access_token")
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

    if (!account.facebook_page_id) {
      return NextResponse.json(
        { error: "No Facebook Page ID found – sync from Facebook first." },
        { status: 400 }
      );
    }

    if (!account.page_access_token) {
      return NextResponse.json(
        {
          error:
            "No page access token stored – re-sync from Facebook to save it.",
        },
        { status: 400 }
      );
    }

    const pageId = account.facebook_page_id;
    const pageToken = account.page_access_token;

    // 2️⃣ Fetch posts from Graph API
    // You can adjust limit and fields as needed
    const postsRes = await fetch(
      `${GRAPH_BASE}/${encodeURIComponent(
        pageId
      )}/posts?fields=id,message,created_time,permalink_url,attachments{media_type,media,url}&limit=20&access_token=${encodeURIComponent(
        pageToken
      )}`
    );

    const postsText = await postsRes.text();
    let postsJson = null;
    try {
      postsJson = JSON.parse(postsText);
    } catch {
      // not JSON
    }

    if (!postsRes.ok) {
      const fbError = postsJson?.error || postsText;
      console.error(`Error fetching /${pageId}/posts:`, fbError);
      return NextResponse.json(
        {
          error: "Failed to fetch Facebook Page posts",
          fbError,
        },
        { status: 400 }
      );
    }

    const posts = postsJson?.data || [];

    // 3️⃣ Upsert into DB (facebook_page_posts)
    if (posts.length > 0) {
      const records = posts.map((p) => ({
        owner_id: user.id,
        facebook_page_id: pageId,
        fb_post_id: p.id,
        message: p.message || null,
        permalink_url: p.permalink_url || null,
        created_time: p.created_time
          ? new Date(p.created_time).toISOString()
          : null,
      }));

      const { error: upsertError } = await supabase
        .from("facebook_page_posts")
        .upsert(records, {
          onConflict: "owner_id,fb_post_id",
        });

      if (upsertError) {
        console.error("Upsert error facebook_page_posts:", upsertError);
        // not fatal – we still return posts
      }
    }

    // 4️⃣ Also read from DB so we have consistent structure
    const { data: cachedPosts, error: cachedError } = await supabase
  .from("facebook_page_posts")
  .select("id, fb_post_id, message, permalink_url, created_time, attachments")
  .eq("owner_id", user.id)
  .eq("facebook_page_id", pageId)
  .order("created_time", { ascending: false })
  .limit(20);


    if (cachedError) throw cachedError;

    return NextResponse.json(
      {
        data: cachedPosts,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("GET /api/facebook/page-posts error", err);
    return NextResponse.json(
      { error: "Failed to load page posts", details: String(err) },
      { status: 500 }
    );
  }
}

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
    const message = (body.message || "").trim();
    const mediaUrl = (body.media_url || "").trim(); // NEW

    if (!message && !mediaUrl) {
      // we allow "media only" posts OR message+media
      return NextResponse.json(
        { error: "Provide at least a message or media_url" },
        { status: 400 }
      );
    }

    // 1️⃣ Get page + page_access_token from instagram_accounts
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

    if (!account.facebook_page_id) {
      return NextResponse.json(
        { error: "No Facebook Page ID found – sync from Facebook first." },
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

    let newPostId = null;

    // 2️⃣ Create the post in Facebook
    if (mediaUrl) {
      // 🔹 Photo post: /{page-id}/photos
      const url = new URL(
        `${GRAPH_BASE}/${encodeURIComponent(pageId)}/photos`
      );
      const params = new URLSearchParams({
        url: mediaUrl,
        access_token: pageToken,
      });

      if (message) {
        params.set("caption", message);
      }

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
        console.error(`Error posting photo to /${pageId}/photos:`, fbError);
        return NextResponse.json(
          {
            error: "Failed to create Facebook photo post",
            fbError,
          },
          { status: 400 }
        );
      }

      // For Page photos, the returned id usually works as the post id for feed queries
      newPostId = fbJson.id;
    } else {
      // 🔹 Text-only post: /{page-id}/feed
      const url = new URL(`${GRAPH_BASE}/${encodeURIComponent(pageId)}/feed`);
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
        console.error(`Error posting to /${pageId}/feed:`, fbError);
        return NextResponse.json(
          {
            error: "Failed to create Facebook post",
            fbError,
          },
          { status: 400 }
        );
      }

      newPostId = fbJson.id; // format: PAGEID_POSTID
    }

    // 3️⃣ Fetch full details (including attachments) for the new post
    const detailsRes = await fetch(
      `${GRAPH_BASE}/${encodeURIComponent(
        newPostId
      )}?fields=id,message,created_time,permalink_url,attachments{media_type,media,url}&access_token=${encodeURIComponent(
        pageToken
      )}`
    );
    const detailsText = await detailsRes.text();
    let detailsJson = null;
    try {
      detailsJson = JSON.parse(detailsText);
    } catch {}

    if (!detailsRes.ok) {
      console.error(
        "Error fetching new post details:",
        detailsJson || detailsText
      );
    }

    const post = detailsJson || { id: newPostId, message, attachments: null };

    // 4️⃣ Cache in DB
    const record = {
      owner_id: user.id,
      facebook_page_id: pageId,
      fb_post_id: post.id,
      message: post.message || message || null,
      permalink_url: post.permalink_url || null,
      created_time: post.created_time
        ? new Date(post.created_time).toISOString()
        : new Date().toISOString(),
      attachments: post.attachments || null,
    };

    const { error: upsertError } = await supabase
      .from("facebook_page_posts")
      .upsert(record, {
        onConflict: "owner_id,fb_post_id",
      });

    if (upsertError) {
      console.error("Upsert error facebook_page_posts:", upsertError);
      // not fatal for the API response
    }

    return NextResponse.json({ data: record }, { status: 200 });
  } catch (err) {
    console.error("POST /api/facebook/page-posts error", err);
    return NextResponse.json(
      { error: "Failed to create page post", details: String(err) },
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
    const fbPostId = body.fb_post_id;
    const message = (body.message || "").trim();

    if (!fbPostId) {
      return NextResponse.json(
        { error: "fb_post_id is required" },
        { status: 400 }
      );
    }

    if (!message) {
      return NextResponse.json(
        { error: "Message cannot be empty" },
        { status: 400 }
      );
    }

    // 1️⃣ Get page access token
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

    const pageToken = account.page_access_token;

    // 2️⃣ Call Graph API to update the post
    const url = new URL(`${GRAPH_BASE}/${encodeURIComponent(fbPostId)}`);
    const params = new URLSearchParams({
      message,
      access_token: pageToken,
    });

    const fbRes = await fetch(url.toString(), {
      method: "POST", // Graph API uses POST for updates
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
      console.error(`Error editing post ${fbPostId}:`, fbError);
      return NextResponse.json(
        { error: "Failed to edit Facebook post", fbError },
        { status: 400 }
      );
    }

    // 3️⃣ Update cached DB record
    const { data: updated, error: updateError } = await supabase
      .from("facebook_page_posts")
      .update({
        message,
        updated_at: new Date().toISOString(),
      })
      .eq("owner_id", user.id)
      .eq("fb_post_id", fbPostId)
      .select("id, fb_post_id, message, permalink_url, created_time")
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ data: updated }, { status: 200 });
  } catch (err) {
    console.error("PATCH /api/facebook/page-posts error", err);
    return NextResponse.json(
      { error: "Failed to edit page post", details: String(err) },
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
    const fbPostId = searchParams.get("fb_post_id");

    if (!fbPostId) {
      return NextResponse.json(
        { error: "fb_post_id query param is required" },
        { status: 400 }
      );
    }

    // 1️⃣ Get page access token
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

    // 2️⃣ Call Graph API to delete post
    const delUrl = `${GRAPH_BASE}/${encodeURIComponent(
      fbPostId
    )}?access_token=${encodeURIComponent(pageToken)}`;

    const fbRes = await fetch(delUrl, { method: "DELETE" });
    const fbText = await fbRes.text();
    let fbJson = null;
    try {
      fbJson = JSON.parse(fbText);
    } catch {}

    if (!fbRes.ok) {
      const fbError = fbJson?.error || fbText;
      console.error(`Error deleting post ${fbPostId}:`, fbError);
      return NextResponse.json(
        { error: "Failed to delete Facebook post", fbError },
        { status: 400 }
      );
    }

    // 3️⃣ Remove from DB cache
    const { error: deleteError } = await supabase
      .from("facebook_page_posts")
      .delete()
      .eq("owner_id", user.id)
      .eq("fb_post_id", fbPostId);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("DELETE /api/facebook/page-posts error", err);
    return NextResponse.json(
      { error: "Failed to delete page post", details: String(err) },
      { status: 500 }
    );
  }
}
