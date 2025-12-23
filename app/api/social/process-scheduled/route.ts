// app/api/social/process-scheduled/route.js
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

// ---------- Shared Supabase + IG helpers (same pattern as /api/instagram/media) ----------

const ADMIN_OWNER_ID = process.env.FB_OWNER_ID || null;

const STATIC_IG_BUSINESS_ID =
  process.env.IG_BUSINESS_ACCOUNT_ID ||
  process.env.NEXT_PUBLIC_IG_BUSINESS_ACCOUNT_ID ||
  "";
const STATIC_IG_ACCESS_TOKEN =
  process.env.IG_ACCESS_TOKEN || process.env.NEXT_PUBLIC_IG_ACCESS_TOKEN || "";
const STATIC_IG_OWNER_ID =
  process.env.IG_OWNER_ID ||
  ADMIN_OWNER_ID ||
  "00000000-0000-0000-0000-000000000000";

function getAdminSupabase() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error(
      "Supabase URL or SERVICE_ROLE key missing in environment variables"
    );
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false },
    }
  );
}

async function resolveInstagramBusinessIdAdmin(supabase) {
  // 1) Env-based config (no DB)
  if (STATIC_IG_BUSINESS_ID && STATIC_IG_ACCESS_TOKEN) {
    return {
      userId: STATIC_IG_OWNER_ID,
      igId: STATIC_IG_BUSINESS_ID,
      accessToken: STATIC_IG_ACCESS_TOKEN,
    };
  }

  // 2) DB-based config
  try {
    let query = supabase
      .from("instagram_accounts")
      .select(
        "id, owner_id, ig_business_account_id, facebook_page_id, access_token"
      )
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1);

    if (ADMIN_OWNER_ID) {
      query = query.eq("owner_id", ADMIN_OWNER_ID);
    }

    const { data: account, error: accError } = await query.maybeSingle();

    if (accError) {
      console.error("instagram_accounts error (Supabase):", accError);
      throw new Error(
        "Failed to load Instagram account config from database (check Supabase URL/key and table)."
      );
    }

    if (!account) {
      throw new Error(
        "No active Instagram account config found (instagram_accounts is empty)."
      );
    }

    let igId = account.ig_business_account_id;
    const pageId = account.facebook_page_id;
    const token = account.access_token;
    const userId = ADMIN_OWNER_ID || account.owner_id;

    if (!token) {
      throw new Error(
        "No IG access token stored in instagram_accounts – please save it in settings."
      );
    }

    const looksLikePage = igId && pageId && igId === pageId;
    const isProbablyNotIG = igId && !String(igId).startsWith("178");

    if ((!igId || looksLikePage || isProbablyNotIG) && pageId) {
      const pageRes = await fetch(
        `${GRAPH_BASE}/${encodeURIComponent(
          pageId
        )}?fields=instagram_business_account&access_token=${encodeURIComponent(
          token
        )}`
      );

      const pageText = await pageRes.text();
      let pageJson = null;
      try {
        pageJson = JSON.parse(pageText);
      } catch {}

      if (!pageRes.ok) {
        const fbError = pageJson?.error || pageText;
        console.error(
          `Error resolving instagram_business_account for page ${pageId}:`,
          fbError
        );
        throw new Error(
          "Failed to resolve Instagram Business Account from Facebook Page (check Page → IG linkage)."
        );
      }

      const newIgId = pageJson?.instagram_business_account?.id;
      if (!newIgId) {
        throw new Error(
          "No instagram_business_account.id found for this Facebook Page – ensure the page is linked to an IG business account."
        );
      }

      igId = newIgId;

      const { error: updateError } = await supabase
        .from("instagram_accounts")
        .update({ ig_business_account_id: igId })
        .eq("id", account.id);

      if (updateError) {
        console.error(
          "Failed to update ig_business_account_id in instagram_accounts:",
          updateError
        );
      }
    }

    if (!igId) {
      throw new Error(
        "No Instagram Business Account ID available – please sync from Facebook / settings again."
      );
    }

    return {
      userId,
      igId,
      accessToken: token,
    };
  } catch (e) {
    if (String(e?.message || e).includes("fetch failed")) {
      console.error(
        "Supabase network error in resolveInstagramBusinessIdAdmin:",
        e
      );
      throw new Error(
        "Failed to connect to Supabase to load Instagram config. " +
          "Either set IG_BUSINESS_ACCOUNT_ID + IG_ACCESS_TOKEN env vars, " +
          "or fix the Supabase connection."
      );
    }
    throw e;
  }
}

// ---------- Helper: wait until IG media container is ready ----------

async function waitForContainerReady(creationId, igToken, options = {}) {
  const { maxAttempts = 8, delayMs = 2000 } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const statusRes = await fetch(
      `${GRAPH_BASE}/${encodeURIComponent(
        creationId
      )}?fields=status_code,status&access_token=${encodeURIComponent(igToken)}`
    );

    const statusText = await statusRes.text();
    let statusJson = null;
    try {
      statusJson = JSON.parse(statusText);
    } catch {
      // ignore parse error
    }

    if (!statusRes.ok) {
      console.warn(
        `Container status check failed (attempt ${attempt}):`,
        statusJson?.error || statusText
      );
    } else {
      const statusCode = statusJson?.status_code;
      if (statusCode === "FINISHED") {
        return; // ready
      }
      if (statusCode === "ERROR" || statusCode === "EXPIRED") {
        throw new Error(
          `Media container status is ${statusCode} – Instagram could not process this media.`
        );
      }
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error(
    "Media is still not ready after multiple attempts – Instagram says to wait longer or try again."
  );
}

// ---------- IG publisher (used by scheduler) ----------

async function publishInstagramPost(row, supabase) {
  const { userId, igId, accessToken: igToken } =
    await resolveInstagramBusinessIdAdmin(supabase);

  const caption =
    (row.message || row.caption || row.payload?.caption || "").trim();
  const mediaUrl = (row.media_url || "").trim();
  const mediaType = (row.media_type || "IMAGE").toUpperCase(); // IMAGE | VIDEO

  if (!mediaUrl) {
    throw new Error("media_url missing on scheduled row");
  }

  // 1) Create container
  const containerUrl = new URL(
    `${GRAPH_BASE}/${encodeURIComponent(igId)}/media`
  );
  const params = new URLSearchParams({
    access_token: igToken,
  });

  if (mediaType === "VIDEO") {
    params.set("media_type", "VIDEO");
    params.set("video_url", mediaUrl);
  } else {
    params.set("image_url", mediaUrl);
  }

  if (caption) {
    params.set("caption", caption);
  }

  const containerRes = await fetch(containerUrl.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const containerText = await containerRes.text();
  let containerJson = null;
  try {
    containerJson = JSON.parse(containerText);
  } catch {}

  if (!containerRes.ok) {
    const fbError = containerJson?.error || containerText;
    console.error(
      `Error creating IG media container for ${igId} (scheduled):`,
      fbError
    );
    throw new Error(
      containerJson?.error?.message ||
        "Failed to create Instagram media container"
    );
  }

  const creationId = containerJson.id;
  if (!creationId) {
    throw new Error("No creation_id returned from Instagram (scheduled)");
  }

  // 2) Wait until container is FINISHED
  await waitForContainerReady(creationId, igToken, {
    maxAttempts: 8,
    delayMs: 2000,
  });

  // 3) Publish – with special handling for error 9007 / 2207027
  async function doPublish() {
    const publishUrl = new URL(
      `${GRAPH_BASE}/${encodeURIComponent(igId)}/media_publish`
    );
    const publishParams = new URLSearchParams({
      creation_id: creationId,
      access_token: igToken,
    });

    const publishRes = await fetch(publishUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: publishParams.toString(),
    });

    const publishText = await publishRes.text();
    let publishJson = null;
    try {
      publishJson = JSON.parse(publishText);
    } catch {}

    if (!publishRes.ok) {
      const err = publishJson?.error || publishText;
      console.error("IG media_publish error", err);

      // Specific case: Media not ready yet (your production error)
      if (
        err &&
        err.code === 9007 &&
        err.error_subcode === 2207027
      ) {
        throw new Error("Media ID is not available");
      }

      throw new Error(err?.message || "Failed to publish Instagram media");
    }

    return publishJson;
  }

  let publishJson;
  try {
    publishJson = await doPublish();
  } catch (err) {
    // If it's the "Media ID is not available" error, give it one more chance
    if (String(err?.message || "").includes("Media ID is not available")) {
      // wait a bit longer and retry once
      await waitForContainerReady(creationId, igToken, {
        maxAttempts: 5,
        delayMs: 3000,
      });
      publishJson = await doPublish(); // if this fails again, it throws out
    } else {
      throw err;
    }
  }

  const igMediaId = publishJson.id;
  if (!igMediaId) {
    throw new Error("Media ID is not available after publish");
  }

  // Optional: upsert into instagram_media_posts so it appears immediately
  try {
    const detailsRes = await fetch(
      `${GRAPH_BASE}/${encodeURIComponent(
        igMediaId
      )}?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&access_token=${encodeURIComponent(
        igToken
      )}`
    );
    const detailsText = await detailsRes.text();
    let detailsJson = null;
    try {
      detailsJson = JSON.parse(detailsText);
    } catch {}

    const media = detailsJson || {
      id: igMediaId,
      caption,
      media_type: mediaType,
      media_url: mediaUrl,
    };

    const record = {
      owner_id: userId,
      ig_business_account_id: igId,
      ig_media_id: media.id,
      caption: media.caption || caption || null,
      media_type: media.media_type || mediaType || null,
      media_url: media.media_url || mediaUrl || null,
      thumbnail_url: media.thumbnail_url || null,
      permalink: media.permalink || null,
      like_count:
        typeof media.like_count === "number" ? media.like_count : null,
      comments_count:
        typeof media.comments_count === "number"
          ? media.comments_count
          : null,
      timestamp: media.timestamp
        ? new Date(media.timestamp).toISOString()
        : new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from("instagram_media_posts")
      .upsert(record, { onConflict: "owner_id,ig_media_id" });

    if (upsertError) {
      console.error(
        "Upsert error instagram_media_posts (scheduled):",
        upsertError
      );
    }
  } catch (detailsErr) {
    console.error(
      "Failed to fetch / upsert IG details for scheduled post:",
      detailsErr
    );
  }

  // Mark scheduled row as posted
  await supabase
    .from("social_scheduled_posts")
    .update({
      status: "posted",
      posted_at: new Date().toISOString(),
      ig_media_id: igMediaId,
      last_error: null,
      error_message: null,
    })
    .eq("id", row.id);

  return igMediaId;
}

// ---------- (Optional) stub for Facebook – keep / replace with your existing logic ----------

async function publishFacebookPost(row, supabase) {
  // If you already had a working FB publishing flow, keep that code instead.
  // Here we just mark it as "failed" if not implemented.
  throw new Error("Facebook scheduled publishing is not implemented here.");
}

// ---------- Main scheduler endpoint ----------

export async function POST() {
  const supabase = getAdminSupabase();

  try {
    const nowIso = new Date().toISOString();

    // Grab a few due & pending jobs
    const { data: jobs, error } = await supabase
      .from("social_scheduled_posts")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(5);

    if (error) {
      console.error("Error loading pending scheduled posts:", error);
      return NextResponse.json(
        { error: "Failed to load pending scheduled posts" },
        { status: 500 }
      );
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json(
        { processed: 0, results: [] },
        { status: 200 }
      );
    }

    const results = [];

    for (const job of jobs) {
      // Mark as processing to avoid double-processing
      await supabase
        .from("social_scheduled_posts")
        .update({
          status: "processing",
          last_error: null,
          error_message: null,
        })
        .eq("id", job.id);

      try {
        if (job.platform === "instagram") {
          const igMediaId = await publishInstagramPost(job, supabase);
          results.push({
            id: job.id,
            platform: job.platform,
            success: true,
            ig_media_id: igMediaId,
          });
        } else if (job.platform === "facebook") {
          await publishFacebookPost(job, supabase);
          results.push({
            id: job.id,
            platform: job.platform,
            success: true,
          });
        } else {
          throw new Error(`Unsupported platform: ${job.platform}`);
        }
      } catch (err) {
        console.error("scheduled post failed", job.id, err);
        await supabase
          .from("social_scheduled_posts")
          .update({
            status: "failed",
            last_error: String(err?.message || err),
            error_message: String(err?.message || err),
          })
          .eq("id", job.id);

        results.push({
          id: job.id,
          platform: job.platform,
          success: false,
          error: String(err?.message || err),
        });
      }
    }

    return NextResponse.json(
      { processed: results.length, results },
      { status: 200 }
    );
  } catch (err) {
    console.error("POST /api/social/process-scheduled error", err);
    return NextResponse.json(
      { error: "Failed to process scheduled posts", details: String(err) },
      { status: 500 }
    );
  }
}
