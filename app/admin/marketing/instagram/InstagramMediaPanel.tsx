"use client";

import React, { useEffect, useState } from "react";
import { format } from "date-fns";

type InstagramMedia = {
  id: string;
  ig_media_id: string;
  caption: string | null;
  media_type: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  permalink: string | null;
  like_count: number | null;
  comments_count: number | null;
  timestamp: string | null;
};

type InstagramComment = {
  id: string;
  ig_comment_id: string;
  ig_media_id: string;
  from_username: string | null;
  message: string | null;
  like_count: number | null;
  created_time: string | null;
};

type AiCopyResponse = {
  caption: string;
  hashtags?: string;
};

/* ---------- Media preview (image / video) ---------- */

function MediaPreview({ media }: { media: InstagramMedia }) {
  const type = (media.media_type || "").toUpperCase();

  if (type === "VIDEO" || type === "REEL") {
    return (
      <div className="w-full aspect-[4/5] bg-black rounded-t-xl overflow-hidden flex items-center justify-center">
        <video
          key={media.ig_media_id}
          controls
          playsInline
          preload="metadata"
          className="w-full h-full object-contain"
        >
          {media.media_url && (
            <source src={media.media_url} type="video/mp4" />
          )}
          Your browser does not support HTML5 video.
        </video>
      </div>
    );
  }

  // image / carousel
  return (
    <div className="w-full aspect-[4/5] bg-gray-900 rounded-t-xl overflow-hidden flex items-center justify-center">
      {media.media_url ? (
        <img
          src={media.media_url}
          alt={media.caption || "Instagram media"}
          className="w-full h-full object-cover"
        />
      ) : media.thumbnail_url ? (
        <img
          src={media.thumbnail_url}
          alt={media.caption || "Instagram media"}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="text-xs text-gray-400">No media preview</div>
      )}
    </div>
  );
}

/* ---------- Main panel ---------- */

export default function InstagramMediaPanel() {
  const [media, setMedia] = useState<InstagramMedia[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New post modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newMediaUrl, setNewMediaUrl] = useState("");
  const [newMediaType, setNewMediaType] = useState<"IMAGE" | "VIDEO">("IMAGE");
  const [newCaption, setNewCaption] = useState("");
  const [newTags, setNewTags] = useState("");
  const [aiLoadingNew, setAiLoadingNew] = useState(false);

  // Edit caption modal
  const [editMedia, setEditMedia] = useState<InstagramMedia | null>(null);
  const [editCaption, setEditCaption] = useState("");
  const [editTags, setEditTags] = useState("");
  const [aiLoadingEdit, setAiLoadingEdit] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Comments drawer
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsMedia, setCommentsMedia] = useState<InstagramMedia | null>(
    null
  );
  const [comments, setComments] = useState<InstagramComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);

  /* ---------- Helpers ---------- */

  const parseUploadResponse = (json: any, file?: File) => {
    // Support both {url, mimeType} and {publicUrl, contentType} etc.
    const url: string =
      json?.url || json?.publicUrl || json?.publicURL || json?.path || "";
    const mime: string =
      json?.mimeType || json?.contentType || file?.type || "";
    const isVideo =
      mime.startsWith("video/") || (file && file.type.startsWith("video/"));
    return { url, mime, isVideo };
  };

  const resetNewPostState = () => {
    setNewFileName("");
    setNewMediaUrl("");
    setNewMediaType("IMAGE");
    setNewCaption("");
    setNewTags("");
    setAiLoadingNew(false);
    setUploading(false);
  };

  /* ---------- Load media ---------- */

  const fetchMedia = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/instagram/media");
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to load Instagram media");
      }
      setMedia(json.data || []);
    } catch (e: any) {
      console.error("fetchMedia error", e);
      setError(e.message || "Failed to load Instagram media");
    } finally {
      setLoading(false);
    }
  };

  const refreshMedia = async () => {
    try {
      setRefreshing(true);
      setError(null);
      const res = await fetch("/api/instagram/media");
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to refresh Instagram media");
      }
      setMedia(json.data || []);
    } catch (e: any) {
      console.error("refreshMedia error", e);
      setError(e.message || "Failed to refresh Instagram media");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMedia();
  }, []);

  /* ---------- AI caption helper ---------- */

  const runAiOptimization = async (
  baseText: string,
  setterCaption: (v: string) => void,
  setterTags: (v: string) => void,
  setLoadingFlag: (v: boolean) => void
) => {
  const text = baseText.trim();
  if (!text) {
    alert("Base caption / text is required");
    return;
  }

  try {
    setLoadingFlag(true);
    const res = await fetch("/api/ai/social-copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseText: text,
        channel: "instagram",
      }),
    });

    const json: AiCopyResponse & { error?: string } = await res.json();
    if (!res.ok) {
      throw new Error(json.error || "AI optimization failed");
    }

    // Always keep caption as string
    if (json.caption) {
      setterCaption(String(json.caption));
    }

    // 🔑 Normalize hashtags into a single string
    if (json.hashtags !== undefined) {
      let tags = "";
      if (Array.isArray(json.hashtags)) {
        tags = json.hashtags.join(" ");
      } else {
        tags = String(json.hashtags);
      }
      setterTags(tags);
    }
  } catch (e: any) {
    console.error("AI optimize error", e);
    alert(e.message || "AI optimization failed");
  } finally {
    setLoadingFlag(false);
  }
};


  /* ---------- New post: upload + publish ---------- */

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      setNewFileName(file.name);

      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/uploads/social", {
        method: "POST",
        body: fd,
      });

      const json = await res.json();
      if (!res.ok) {
        console.error("Upload error:", json);
        throw new Error(json.error || "Upload failed");
      }

      const { url, isVideo } = parseUploadResponse(json, file);
      if (!url) {
        throw new Error("Upload did not return a URL");
      }

      setNewMediaUrl(url);
      setNewMediaType(isVideo ? "VIDEO" : "IMAGE");
    } catch (e: any) {
      console.error("handleFileChange error", e);
      alert(e.message || "Upload failed");
      setNewFileName("");
      setNewMediaUrl("");
    } finally {
      setUploading(false);
    }
  };

  const handleCreatePost = async () => {
    if (!newMediaUrl) {
      alert("Please upload an image or video first.");
      return;
    }

    const finalCaption =
      newCaption.trim() +
      (newTags.trim() ? "\n\n" + newTags.trim() : "");

    try {
      setUploading(true);
      const res = await fetch("/api/instagram/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caption: finalCaption,
          media_url: newMediaUrl,
          media_type: newMediaType,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        console.error("POST /api/instagram/media", json);
        throw new Error(json.error || "Failed to publish Instagram media");
      }

      // add to top of feed
      if (json.data) {
        setMedia((prev) => [json.data, ...prev]);
      }

      resetNewPostState();
      setShowNewModal(false);
    } catch (e: any) {
      console.error("handleCreatePost error", e);
      alert(e.message || "Failed to publish Instagram media");
    } finally {
      setUploading(false);
    }
  };

  /* ---------- Edit caption ---------- */

  const openEditModal = (item: InstagramMedia) => {
    setEditMedia(item);
    setEditCaption(item.caption || "");
    setEditTags("");
    setAiLoadingEdit(false);
    setSavingEdit(false);
  };

  const handleSaveEdit = async () => {
    if (!editMedia) return;

    const finalCaption =
      editCaption.trim() +
      (editTags.trim() ? "\n\n" + editTags.trim() : "");

    if (!finalCaption) {
      alert("Caption cannot be empty.");
      return;
    }

    try {
      setSavingEdit(true);
      const res = await fetch("/api/instagram/media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ig_media_id: editMedia.ig_media_id,
          caption: finalCaption,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        console.error("PATCH /api/instagram/media", json);
        throw new Error(json.error || "Failed to update caption");
      }

      if (json.data) {
        setMedia((prev) =>
          prev.map((m) =>
            m.ig_media_id === editMedia.ig_media_id
              ? { ...m, caption: json.data.caption }
              : m
          )
        );
      }

      setEditMedia(null);
    } catch (e: any) {
      console.error("handleSaveEdit error", e);
      alert(e.message || "Failed to update caption");
    } finally {
      setSavingEdit(false);
    }
  };


  
  /* ---------- Comments ---------- */

  const openComments = async (item: InstagramMedia) => {
    setCommentsMedia(item);
    setCommentsOpen(true);
    setReplyText("");
    try {
      setCommentsLoading(true);
      const res = await fetch(
        `/api/instagram/comments?ig_media_id=${encodeURIComponent(
          item.ig_media_id
        )}`
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to load comments");
      }
      setComments(json.data || []);
    } catch (e: any) {
      console.error("openComments error", e);
      alert(e.message || "Failed to load comments");
    } finally {
      setCommentsLoading(false);
    }
  };

  const sendReply = async () => {
    if (!commentsMedia) return;
    const msg = replyText.trim();
    if (!msg) {
      alert("Reply cannot be empty");
      return;
    }
    try {
      setReplySending(true);
      const res = await fetch("/api/instagram/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ig_media_id: commentsMedia.ig_media_id,
          message: msg,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to send reply");
      }

      if (json.data) {
        setComments((prev) => [json.data, ...prev]);
      }
      setReplyText("");
    } catch (e: any) {
      console.error("sendReply error", e);
      alert(e.message || "Failed to send reply");
    } finally {
      setReplySending(false);
    }
  };

  /* ---------- Render ---------- */

  return (
    <div className="w-full px-6 py-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            Instagram Manager
          </h1>
          <p className="text-sm text-gray-500">
            Post with AI help and manage comments & replies.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={refreshMedia}
            disabled={refreshing}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>

          <button
            type="button"
            onClick={() => {
              resetNewPostState();
              setShowNewModal(true);
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-pink-500 to-rose-500 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:brightness-110"
          >
            + New Instagram Post
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Grid of media */}
      {loading ? (
        <div className="py-10 text-center text-gray-500 text-sm">
          Loading Instagram media…
        </div>
      ) : media.length === 0 ? (
        <div className="py-10 text-center text-gray-500 text-sm">
          No Instagram media found. Try refreshing after posting.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {media.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-xl shadow-sm flex flex-col overflow-hidden border border-gray-100"
            >
              <MediaPreview media={item} />

              <div className="p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>
                    {item.timestamp
                      ? format(new Date(item.timestamp), "dd MMM yyyy, hh:mm a")
                      : "Unknown date"}
                  </span>
                  {item.permalink && (
                    <a
                      href={item.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-500 hover:underline"
                    >
                      View on IG
                    </a>
                  )}
                </div>

                {item.caption && (
                  <p className="text-sm text-gray-800 whitespace-pre-wrap line-clamp-3">
                    {item.caption}
                  </p>
                )}

                <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                  <span>❤️ {item.like_count ?? 0}</span>
                  <span>💬 {item.comments_count ?? 0}</span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openEditModal(item)}
                    className="px-3 py-1 text-xs rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    Edit caption
                  </button>

                  <button
                    type="button"
                    onClick={() => openComments(item)}
                    className="px-3 py-1 text-xs rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    Comments
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      if (
                        !confirm(
                          "Remove this media from the dashboard list? (Instagram post itself will NOT be deleted.)"
                        )
                      ) {
                        return;
                      }
                      try {
                        const res = await fetch(
                          `/api/instagram/media?ig_media_id=${encodeURIComponent(
                            item.ig_media_id
                          )}`,
                          { method: "DELETE" }
                        );
                        const json = await res.json();
                        if (!res.ok) {
                          throw new Error(
                            json.error || "Failed to remove from dashboard"
                          );
                        }
                        setMedia((prev) =>
                          prev.filter(
                            (m) => m.ig_media_id !== item.ig_media_id
                          )
                        );
                      } catch (e: any) {
                        console.error("remove error", e);
                        alert(
                          e.message ||
                            "Failed to remove media from dashboard cache"
                        );
                      }
                    }}
                    className="ml-auto px-3 py-1 text-xs rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                  >
                    Remove from dashboard
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------- New Post Modal ---------- */}
      {showNewModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl p-6 relative">
            <button
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
              onClick={() => {
                setShowNewModal(false);
                resetNewPostState();
              }}
            >
              ✕
            </button>

            <h2 className="text-lg font-semibold mb-3">
              New Instagram Post
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Media file
                </label>
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleFileChange}
                  className="block w-full text-xs text-gray-700 file:mr-3 file:rounded-lg file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-gray-700 hover:file:bg-gray-50"
                />
                {newFileName && (
                  <p className="mt-1 text-xs text-gray-500">
                    Selected: {newFileName} ({newMediaType})
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Caption
                </label>
                <textarea
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-pink-500"
                  value={newCaption}
                  onChange={(e) => setNewCaption(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Need help with caption & tags?</span>
                <button
                  type="button"
                  disabled={aiLoadingNew}
                  onClick={() =>
                    runAiOptimization(
                      newCaption,
                      setNewCaption,
                      setNewTags,
                      setAiLoadingNew
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-full border border-pink-300 px-3 py-1 text-xs font-medium text-pink-600 hover:bg-pink-50 disabled:opacity-60"
                >
                  {aiLoadingNew ? "Optimizing…" : "Use AI to optimize"}
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Hashtags (optional)
                </label>
                <textarea
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-pink-500"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  placeholder="#kbeauty #skincare ..."
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewModal(false);
                    resetNewPostState();
                  }}
                  className="px-4 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={handleCreatePost}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 text-sm text-white font-medium shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                >
                  {uploading ? "Posting…" : "Post now"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Edit Caption Modal ---------- */}
      {editMedia && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl p-6 relative">
            <button
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
              onClick={() => setEditMedia(null)}
            >
              ✕
            </button>

            <h2 className="text-lg font-semibold mb-3">
              Edit caption
            </h2>

            <div className="space-y-4">
              <div className="text-xs text-gray-500">
                Editing post:{" "}
                <span className="font-mono">
                  {editMedia.ig_media_id}
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Caption
                </label>
                <textarea
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-pink-500"
                  value={editCaption}
                  onChange={(e) => setEditCaption(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Need better copy?</span>
                <button
                  type="button"
                  disabled={aiLoadingEdit}
                  onClick={() =>
                    runAiOptimization(
                      editCaption,
                      setEditCaption,
                      setEditTags,
                      setAiLoadingEdit
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-full border border-pink-300 px-3 py-1 text-xs font-medium text-pink-600 hover:bg-pink-50 disabled:opacity-60"
                >
                  {aiLoadingEdit ? "Optimizing…" : "Use AI to optimize"}
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Extra hashtags (optional)
                </label>
                <textarea
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-pink-500"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  placeholder="#kbeauty #skincare ..."
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditMedia(null)}
                  className="px-4 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingEdit}
                  onClick={handleSaveEdit}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 text-sm text-white font-medium shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                >
                  {savingEdit ? "Saving…" : "Save caption"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Comments Drawer ---------- */}
      {commentsOpen && commentsMedia && (
        <div className="fixed inset-0 z-40 flex">
          <div
            className="flex-1 bg-black/40"
            onClick={() => setCommentsOpen(false)}
          />
          <div className="w-full max-w-md bg-white shadow-xl h-full flex flex-col">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">
                  Comments
                </h3>
                <p className="text-xs text-gray-500 line-clamp-1">
                  {commentsMedia.caption}
                </p>
              </div>
              <button
                className="text-gray-400 hover:text-gray-600"
                onClick={() => setCommentsOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {commentsLoading ? (
                <div className="text-xs text-gray-500">
                  Loading comments…
                </div>
              ) : comments.length === 0 ? (
                <div className="text-xs text-gray-500">
                  No comments yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {comments.map((c) => (
                    <div key={c.id} className="text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-800">
                          {c.from_username || "User"}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {c.created_time
                            ? format(
                                new Date(c.created_time),
                                "dd MMM, HH:mm"
                              )
                            : ""}
                        </span>
                      </div>
                      <p className="text-gray-700 text-sm whitespace-pre-wrap">
                        {c.message}
                      </p>
                      <div className="text-[11px] text-gray-400 mt-1">
                        ❤️ {c.like_count ?? 0}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t px-4 py-3">
              <textarea
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-pink-500"
                placeholder="Reply as page…"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
              />
              <div className="flex justify-end mt-2">
                <button
                  type="button"
                  disabled={replySending}
                  onClick={sendReply}
                  className="px-4 py-1.5 rounded-lg bg-pink-600 text-xs font-medium text-white shadow-sm hover:bg-pink-700 disabled:opacity-60"
                >
                  {replySending ? "Sending…" : "Reply"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
