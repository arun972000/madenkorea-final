// app/api/social/process-scheduled/route.ts
import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const ADMIN_OWNER_ID =
  process.env.FB_OWNER_ID || process.env.ADMIN_OWNER_ID || null;

/**
 * Resolve Instagram business account info from instagram_accounts
 * (same pattern as /api/instagram/media).
 */
async function resolveInstagramBusinessIdAdmin(supabase: SupabaseClient) {
  const baseQuery = supabase
    .from("instagram_accounts")
    .select(
      "id, owner_id, ig_business_account_id, facebook_page_id, access_token"
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1);

  const { data: account, error } = ADMIN_OWNER_ID
    ? await baseQuery.eq("owner_id", ADMIN_OWNER_ID).maybeSingle()
    : await baseQuery.maybeSingle();

  if (error) throw error;
  if (!account) {
    throw new Error("No active instagram_accounts row found");
  }

  const userId = account.owner_id as string;
  let igId = account.ig_business_account_id as string | null;
  const pageId = account.facebook_page_id as string | null;
  const accessToken = account.access_token as string | null;

  if (!accessToken) {
    throw new Error("No access_token found on instagram_accounts");
  }

  // If ig_business_account_id is missing, derive from page_id
  if ((!igId || igId === "") && pageId) {
    const pageRes = await fetch(
      `${GRAPH_BASE}/${pageId}?fields=instagram_business_account&access_token=${encodeURIComponent(
        accessToken
      )}`
    );
    const pageJson = await pageRes.json();
    if (!pageRes.ok) {
      console.error(
        "Failed to resolve IG business account from page",
        pageJson
      );
      throw new Error("Failed to resolve instagram_business_account from page");
    }
    igId = pageJson?.instagram_business_account?.id || null;

    if (igId) {
      await supabase
        .from("instagram_accounts")
        .update({ ig_business_account_id: igId })
        .eq("id", account.id);
    }
  }

  if (!igId) {
    throw new Error("Instagram business account ID is not configured");
  }

  return { userId, igId, accessToken };
}

/**
 * Publish a single Instagram post and upsert into instagram_media_posts.
 */
async function publishInstagramPost(
  supabase: SupabaseClient,
  ownerId: string,
  igId: string,
  accessToken: string,
  payload: {
    caption: string | null;
    media_url: string;
    media_type: "IMAGE" | "VIDEO";
  }
) {
  const { caption, media_url, media_type } = payload;

  // 1) Create media container
  const form = new URLSearchParams();

  if (media_type === "VIDEO") {
    form.append("media_type", "VIDEO");
    form.append("video_url", media_url);
  } else {
    form.append("image_url", media_url);
  }

  if (caption) {
    form.append("caption", caption);
  }

  // 🔑 FIX: include the access token on the container creation call
  form.append("access_token", accessToken);

  const containerRes = await fetch(`${GRAPH_BASE}/${igId}/media`, {
    method: "POST",
    body: form,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  const containerJson = await containerRes.json();
  if (!containerRes.ok) {
    console.error("IG create container error", containerJson);
    throw new Error(
      containerJson.error?.message ||
        "Failed to create Instagram media container"
    );
  }

  const creationId = containerJson.id;
  if (!creationId) {
    throw new Error("No creation_id returned from IG");
  }

  // NOTE: For large videos you may need polling; for now we publish immediately,
  // same as your manual /api/instagram/media flow.
  const publishRes = await fetch(
    `${GRAPH_BASE}/${igId}/media_publish?creation_id=${encodeURIComponent(
      creationId
    )}&access_token=${encodeURIComponent(accessToken)}`,
    { method: "POST" }
  );
  const publishJson = await publishRes.json();
  if (!publishRes.ok) {
    console.error("IG media_publish error", publishJson);
    throw new Error(
      publishJson.error?.message || "Failed to publish Instagram media"
    );
  }

  const igMediaId = publishJson.id;
  if (!igMediaId) {
    throw new Error("No ig_media_id returned from media_publish");
  }

  // 3) Fetch full media details
  const fields =
    "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count";
  const mediaRes = await fetch(
    `${GRAPH_BASE}/${igMediaId}?fields=${fields}&access_token=${encodeURIComponent(
      accessToken
    )}`
  );
  const mediaJson = await mediaRes.json();
  if (!mediaRes.ok) {
    console.error("IG get media detail error", mediaJson);
    throw new Error(mediaJson.error?.message || "Failed to load IG media");
  }

  const record = {
    owner_id: ownerId,
    ig_business_account_id: igId,
    ig_media_id: mediaJson.id,
    caption: mediaJson.caption || null,
    media_type: mediaJson.media_type || null,
    media_url: mediaJson.media_url || null,
    thumbnail_url: mediaJson.thumbnail_url || null,
    permalink: mediaJson.permalink || null,
    like_count: mediaJson.like_count ?? null,
    comments_count: mediaJson.comments_count ?? null,
    timestamp: mediaJson.timestamp
      ? new Date(mediaJson.timestamp).toISOString()
      : null,
  };

  const { data, error } = await supabase
    .from("instagram_media_posts")
    .upsert(record, {
      onConflict: "owner_id,ig_media_id",
    })
    .select(
      "id, ig_media_id, caption, media_type, media_url, thumbnail_url, permalink, like_count, comments_count, timestamp"
    )
    .single();

  if (error) {
    console.error("instagram_media_posts upsert error", error);
    throw new Error("Failed to upsert instagram_media_posts");
  }

  return { dbMedia: data, igMediaId };
}

/**
 * POST /api/social/process-scheduled
 * Called periodically (e.g. from frontend interval) to publish due Instagram posts.
 */
export async function POST() {
  try {
    const { userId, igId, accessToken } =
      await resolveInstagramBusinessIdAdmin(supabaseAdmin);

    const nowIso = new Date().toISOString();

    // Fetch due posts: platform='instagram', status='pending', scheduled_at <= now
    const { data: duePosts, error } = await supabaseAdmin
      .from("social_scheduled_posts")
      .select("*")
      .eq("platform", "instagram")
      .eq("status", "pending")
      .lte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(5);

    if (error) {
      console.error("fetch due scheduled posts error", error);
      return NextResponse.json(
        { error: "Failed to fetch scheduled posts" },
        { status: 500 }
      );
    }

    if (!duePosts || duePosts.length === 0) {
      return NextResponse.json({ processed: 0, posted: 0, failed: 0 });
    }

    let posted = 0;
    let failed = 0;

    for (const post of duePosts as any[]) {
      try {
        // Optional: mark as processing to avoid double-run if multiple workers
        await supabaseAdmin
          .from("social_scheduled_posts")
          .update({ status: "processing" })
          .eq("id", post.id)
          .eq("status", "pending");

        const payload = (post.payload || {}) as any;

        // Derive caption/message + media info
        const caption: string | null =
          (post.message as string | null) ||
          (payload.caption as string | undefined) ||
          null;

        const mediaUrl: string | null =
          (post.media_url as string | null) ||
          (payload.media_url as string | undefined) ||
          null;

        const mediaType: "IMAGE" | "VIDEO" =
          ((post.media_type as string | null) ||
            payload.media_type ||
            "IMAGE") === "VIDEO"
            ? "VIDEO"
            : "IMAGE";

        if (!mediaUrl) {
          throw new Error("Scheduled post has no media_url");
        }

        const { igMediaId } = await publishInstagramPost(
          supabaseAdmin,
          userId,
          igId,
          accessToken,
          {
            caption,
            media_url: mediaUrl,
            media_type: mediaType,
          }
        );

        await supabaseAdmin
          .from("social_scheduled_posts")
          .update({
            status: "posted",
            posted_at: new Date().toISOString(),
            ig_media_id: igMediaId,
            last_error: null,
            error_message: null,
            payload: {
              ...payload,
              published_ig_media_id: igMediaId,
            },
          })
          .eq("id", post.id);

        posted += 1;
      } catch (err: any) {
        console.error("scheduled post failed", post.id, err);
        await supabaseAdmin
          .from("social_scheduled_posts")
          .update({
            status: "failed",
            last_error: err.message || "Unknown error",
            error_message: err.message || "Unknown error",
          })
          .eq("id", post.id);
        failed += 1;
      }
    }

    return NextResponse.json({
      processed: duePosts.length,
      posted,
      failed,
    });
  } catch (err: any) {
    console.error("/api/social/process-scheduled error", err);
    return NextResponse.json(
      { error: err.message || "Failed to process scheduled posts" },
      { status: 500 }
    );
  }
}
