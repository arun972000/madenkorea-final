// app/admin/marketing/facebook/components/CampaignList.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {supabase} from "@/lib/supabaseClient";
import {
  Loader2,
  Plus,
  RefreshCw,
  MessageCircle,
  Pencil,
  Trash2,
  Eye,
} from "lucide-react";

const POSTS_PAGE_SIZE = 5;

// Helper to extract primary media from post.attachments
function getPrimaryAttachment(post) {
  const att = post.attachments;
  const first = att?.data?.[0];
  if (!first) return null;

  const mediaType = first.media_type || null;
  const imageSrc =
    first.media?.image?.src || first.media?.source || null;
  const url = first.url || imageSrc || null;

  return {
    mediaType,
    imageSrc,
    url,
  };
}

export default function CampaignList() {
  // Posts + loading
  const [loading, setLoading] = useState(false);
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState(null);

  // Filters / pagination
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(POSTS_PAGE_SIZE);

  // New post
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState(null);

  // media via URL or file
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaUrlTouched, setMediaUrlTouched] = useState(false);
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  // Edit post
  const [editingPost, setEditingPost] = useState(null);
  const [editMessage, setEditMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState(null);

  // Comments & replies
  const [selectedPost, setSelectedPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState(null);

  const [replyMessage, setReplyMessage] = useState("");
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState(null);

  // Comment moderation
  const [commentBusyId, setCommentBusyId] = useState(null);
  const [commentActionError, setCommentActionError] = useState(null);

  // -------- Load posts --------
  const loadPosts = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/facebook/page-posts");
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Failed to load Facebook posts");
        setPosts([]);
      } else {
        setPosts(json.data || []);
      }
    } catch (err) {
      console.error(err);
      setError("Network error while loading posts");
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, []);

  // Reset visible count when search changes
  useEffect(() => {
    setVisibleCount(POSTS_PAGE_SIZE);
  }, [search]);

  // Filter + slice posts
  const filteredPosts = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return posts;
    return posts.filter((p) =>
      (p.message || "").toLowerCase().includes(s)
    );
  }, [posts, search]);

  const visiblePosts = filteredPosts.slice(0, visibleCount);
  const hasMore = filteredPosts.length > visibleCount;

  // -------- New post: file handler --------
  const handleMediaFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      setMediaFile(null);
      setMediaPreview(null);
      return;
    }

    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
    setMediaUrl("");
    setMediaUrlTouched(false);
  };

  // -------- New post: create --------
  const handleCreatePost = async () => {
    const trimmedMessage = message.trim();
    let finalMediaUrl = mediaUrl.trim() || null;

    if (!trimmedMessage && !finalMediaUrl && !mediaFile) {
      setPostError("Provide at least a message or an image file/URL");
      return;
    }

    setPosting(true);
    setPostError(null);

    try {
      // 1️⃣ If file chosen, upload to Supabase Storage
      if (mediaFile) {
        setUploadingMedia(true);

        const fileExt = mediaFile.name.split(".").pop();
        const fileName = `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.${fileExt}`;
        const filePath = `facebook/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("facebook-media")
          .upload(filePath, mediaFile, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          console.error("Supabase upload error", uploadError);
          setPostError("Failed to upload image. Please try again.");
          setUploadingMedia(false);
          setPosting(false);
          return;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from("facebook-media").getPublicUrl(filePath);

        finalMediaUrl = publicUrl;
        setUploadingMedia(false);
      }

      // 2️⃣ Call API to create Facebook post
      const res = await fetch("/api/facebook/page-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmedMessage || null,
          media_url: finalMediaUrl || null,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setPostError(json.error || "Failed to create post");
      } else {
        await loadPosts();
        // reset form
        setMessage("");
        setMediaUrl("");
        setMediaUrlTouched(false);
        setMediaFile(null);
        setMediaPreview(null);
        setShowForm(false);
      }
    } catch (err) {
      console.error(err);
      setPostError("Network error while creating post");
    } finally {
      setPosting(false);
      setUploadingMedia(false);
    }
  };

  // -------- Edit post handlers --------
  const startEdit = (p) => {
    setEditingPost(p);
    setEditMessage(p.message || "");
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingPost(null);
    setEditMessage("");
    setEditError(null);
  };

  const handleSaveEdit = async () => {
    const trimmed = editMessage.trim();
    if (!trimmed) {
      setEditError("Message cannot be empty");
      return;
    }
    if (!editingPost) return;

    setEditing(true);
    setEditError(null);

    try {
      const res = await fetch("/api/facebook/page-posts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fb_post_id: editingPost.fb_post_id,
          message: trimmed,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setEditError(json.error || "Failed to edit post");
      } else {
        await loadPosts();
        if (
          selectedPost &&
          selectedPost.fb_post_id === editingPost.fb_post_id
        ) {
          setSelectedPost((prev) =>
            prev ? { ...prev, message: trimmed } : prev
          );
        }
        cancelEdit();
      }
    } catch (err) {
      console.error(err);
      setEditError("Network error while editing post");
    } finally {
      setEditing(false);
    }
  };

  const handleDeletePost = async (post) => {
    if (!window.confirm("Delete this post on Facebook as well?")) return;

    try {
      const res = await fetch(
        `/api/facebook/page-posts?fb_post_id=${encodeURIComponent(
          post.fb_post_id
        )}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "Failed to delete post");
      } else {
        await loadPosts();
        if (selectedPost && selectedPost.fb_post_id === post.fb_post_id) {
          setSelectedPost(null);
          setComments([]);
        }
      }
    } catch (err) {
      console.error(err);
      alert("Network error while deleting post");
    }
  };

  // -------- Comments handlers --------
  const loadComments = async (post) => {
    setSelectedPost(post);
    setComments([]);
    setReplyMessage("");
    setCommentsLoading(true);
    setCommentsError(null);
    setCommentActionError(null);

    try {
      const res = await fetch(
        `/api/facebook/comments?fb_post_id=${encodeURIComponent(
          post.fb_post_id
        )}`
      );
      const json = await res.json();
      if (!res.ok) {
        setCommentsError(json.error || "Failed to load comments");
      } else {
        setComments(json.data || []);
      }
    } catch (err) {
      console.error(err);
      setCommentsError("Network error while loading comments");
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleReply = async () => {
    const trimmed = replyMessage.trim();
    if (!trimmed) {
      setReplyError("Reply cannot be empty");
      return;
    }
    if (!selectedPost) return;

    setReplying(true);
    setReplyError(null);

    try {
      const res = await fetch("/api/facebook/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fb_post_id: selectedPost.fb_post_id,
          message: trimmed,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setReplyError(json.error || "Failed to post reply");
      } else {
        setReplyMessage("");
        await loadComments(selectedPost);
      }
    } catch (err) {
      console.error(err);
      setReplyError("Network error while posting reply");
    } finally {
      setReplying(false);
    }
  };

  const handleToggleHide = async (comment) => {
    if (!selectedPost) return;
    setCommentBusyId(comment.fb_comment_id);
    setCommentActionError(null);

    try {
      const res = await fetch("/api/facebook/comments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fb_comment_id: comment.fb_comment_id,
          is_hidden: !comment.is_hidden,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setCommentActionError(json.error || "Failed to update comment");
      } else {
        await loadComments(selectedPost);
      }
    } catch (err) {
      console.error(err);
      setCommentActionError("Network error while updating comment");
    } finally {
      setCommentBusyId(null);
    }
  };

  const handleDeleteComment = async (comment) => {
    if (!selectedPost) return;
    if (!window.confirm("Delete this comment on Facebook as well?")) return;

    setCommentBusyId(comment.fb_comment_id);
    setCommentActionError(null);

    try {
      const res = await fetch(
        `/api/facebook/comments?fb_comment_id=${encodeURIComponent(
          comment.fb_comment_id
        )}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok) {
        setCommentActionError(json.error || "Failed to delete comment");
      } else {
        await loadComments(selectedPost);
      }
    } catch (err) {
      console.error(err);
      setCommentActionError("Network error while deleting comment");
    } finally {
      setCommentBusyId(null);
    }
  };

  // -------- UI helpers --------
  const postsSubtitle = useMemo(() => {
    if (loading) return "Loading latest posts…";
    if (error) return "";
    const total = posts.length;
    if (!total) return "No posts found yet for this Facebook Page.";
    const showing = visiblePosts.length;
    if (search.trim()) {
      return `Showing ${showing} of ${filteredPosts.length} matching posts`;
    }
    return `Showing latest ${showing} of ${total} posts`;
  }, [
    loading,
    error,
    posts.length,
    visiblePosts.length,
    filteredPosts.length,
    search,
  ]);

  const hasPostsPagination = filteredPosts.length > POSTS_PAGE_SIZE;

  return (
    <Card className="h-full">
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Facebook Page Posts</CardTitle>
            <p className="text-xs text-muted-foreground">{postsSubtitle}</p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={loadPosts}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  Refreshing
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-3 w-3" />
                  Refresh
                </>
              )}
            </Button>
            <Button size="sm" onClick={() => setShowForm((v) => !v)}>
              <Plus className="mr-1.5 h-4 w-4" />
              {showForm ? "Close" : "New Post"}
            </Button>
          </div>
        </div>

        {/* Search bar */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search posts by text…"
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* New post form */}
        {showForm && (
          <div className="space-y-3 rounded-md border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">
              Create a new post on your Facebook Page. You can publish{" "}
              <span className="font-semibold">text only</span> or{" "}
              <span className="font-semibold">text + image</span>.
            </p>

            {/* Message */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium">Post message</label>
              <textarea
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Write your post content…"
              />
            </div>

            {/* File upload */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium">
                Image file (optional)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleMediaFileChange}
                className="w-full text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                The image will be uploaded to Supabase Storage and posted to
                Facebook as a photo.
              </p>
            </div>

            {/* Manual image URL (fallback) */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium">
                Image URL (optional, if you don&apos;t upload a file)
              </label>
              <input
                type="url"
                value={mediaUrl}
                onChange={(e) => {
                  setMediaUrl(e.target.value);
                  setMediaUrlTouched(true);
                  if (e.target.value) {
                    setMediaFile(null);
                    setMediaPreview(null);
                  }
                }}
                placeholder="https://example.com/your-image.jpg"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            {/* Preview */}
            {(mediaPreview || (mediaUrlTouched && mediaUrl.trim())) && (
              <div className="space-y-1">
                <p className="text-[11px] font-medium">Preview</p>
                <div className="overflow-hidden rounded-md border bg-background">
                  <img
                    src={mediaPreview || mediaUrl.trim()}
                    alt="Post preview"
                    className="max-h-48 w-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                </div>
              </div>
            )}

            {postError && (
              <p className="text-xs text-red-500">{postError}</p>
            )}

            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setMessage("");
                  setMediaUrl("");
                  setMediaUrlTouched(false);
                  setMediaFile(null);
                  setMediaPreview(null);
                  setPostError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreatePost}
                disabled={posting || uploadingMedia}
              >
                {uploadingMedia
                  ? "Uploading…"
                  : posting
                  ? "Posting…"
                  : "Post to Facebook"}
              </Button>
            </div>
          </div>
        )}

        {/* Edit form */}
        {editingPost && (
          <div className="space-y-2 rounded-md border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">
              Editing post from{" "}
              {editingPost.created_time
                ? new Date(editingPost.created_time).toLocaleString()
                : "—"}
            </p>
            <textarea
              rows={3}
              value={editMessage}
              onChange={(e) => setEditMessage(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {editError && (
              <p className="text-xs text-red-500">{editError}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={cancelEdit}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveEdit} disabled={editing}>
                {editing ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        )}

        {/* Main layout: posts list + details/comments */}
        <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          {/* Posts list */}
          <div className="space-y-2">
            {loading && (
              <p className="text-sm text-muted-foreground">Loading posts…</p>
            )}
            {!loading && error && (
              <p className="text-sm text-red-500">{error}</p>
            )}
            {!loading && !error && visiblePosts.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No posts match your filters yet.
              </p>
            )}

            {!loading &&
              !error &&
              visiblePosts.map((p) => {
                const isSelected =
                  selectedPost && selectedPost.fb_post_id === p.fb_post_id;
                const attachment = getPrimaryAttachment(p);

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => loadComments(p)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-xs shadow-sm transition hover:bg-muted ${
                      isSelected ? "border-primary bg-muted" : "bg-background"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      {/* Thumbnail */}
                      <div className="flex-shrink-0">
                        {attachment?.imageSrc ? (
                          <img
                            src={attachment.imageSrc}
                            alt={attachment.mediaType || "Media"}
                            className="h-10 w-10 rounded-md object-cover"
                          />
                        ) : attachment?.mediaType === "video" ? (
                          <div className="flex h-10 w-10 items-center justify-center rounded-md border text-[10px] text-muted-foreground">
                            Video
                          </div>
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-md border text-[10px] text-muted-foreground">
                            Text
                          </div>
                        )}
                      </div>

                      {/* Text + meta */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {p.message
                              ? p.message.slice(0, 60) +
                                (p.message.length > 60 ? "…" : "")
                              : "No text"}
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {p.created_time
                            ? new Date(p.created_time).toLocaleString()
                            : "—"}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col items-end gap-1">
                        {p.permalink_url && (
                          <a
                            href={p.permalink_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] text-primary underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Eye className="h-3 w-3" />
                            View
                          </a>
                        )}
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              startEdit(p);
                            }}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="destructive"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePost(p);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}

            {/* Load more / show less */}
            {!loading && !error && hasPostsPagination && (
              <div className="flex items-center justify-between pt-1">
                <p className="text-[11px] text-muted-foreground">
                  Showing {visiblePosts.length} of {filteredPosts.length} posts
                </p>
                <div className="flex gap-2">
                  {hasMore && (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() =>
                        setVisibleCount((c) => c + POSTS_PAGE_SIZE)
                      }
                    >
                      Load more
                    </Button>
                  )}
                  {visibleCount > POSTS_PAGE_SIZE && (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => setVisibleCount(POSTS_PAGE_SIZE)}
                    >
                      Show less
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Details + comments */}
          <div className="space-y-3 rounded-lg border bg-muted/40 p-3 text-xs">
            {!selectedPost && (
              <p className="text-xs text-muted-foreground">
                Select a post on the left to see full content, media preview,
                reply as your Page, and manage comments.
              </p>
            )}

            {selectedPost && (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 space-y-1">
                    <p className="text-[11px] font-semibold">
                      Selected post details
                    </p>
                    <p className="whitespace-pre-wrap">
                      {selectedPost.message || "No text"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {selectedPost.created_time
                        ? new Date(
                            selectedPost.created_time
                          ).toLocaleString()
                        : "—"}
                    </p>
                  </div>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => {
                      setSelectedPost(null);
                      setComments([]);
                      setReplyMessage("");
                    }}
                  >
                    Clear
                  </Button>
                </div>

                {/* Media preview */}
                {(() => {
                  const attachment = getPrimaryAttachment(selectedPost);
                  if (!attachment) return null;

                  if (attachment.mediaType === "video") {
                    return (
                      <div className="mt-2 overflow-hidden rounded-md border bg-background">
                        <video
                          src={attachment.url || attachment.imageSrc}
                          controls
                          className="max-h-64 w-full"
                        />
                      </div>
                    );
                  }

                  if (attachment.imageSrc) {
                    return (
                      <div className="mt-2 overflow-hidden rounded-md border bg-background">
                        <img
                          src={attachment.imageSrc}
                          alt={attachment.mediaType || "Post media"}
                          className="max-h-64 w-full object-cover"
                        />
                      </div>
                    );
                  }

                  return null;
                })()}

                {/* Reply box */}
                <div className="mt-3 space-y-2 rounded-md bg-background p-2">
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <MessageCircle className="h-3 w-3" />
                    <span>Reply to this post as your Page</span>
                  </div>
                  <textarea
                    rows={2}
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Type your reply…"
                  />
                  {replyError && (
                    <p className="text-[11px] text-red-500">{replyError}</p>
                  )}
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={handleReply}
                      disabled={replying}
                    >
                      {replying ? "Replying…" : "Reply as Page"}
                    </Button>
                  </div>
                </div>

                {/* Comments list */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold">Comments</p>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => loadComments(selectedPost)}
                      disabled={commentsLoading}
                    >
                      {commentsLoading ? "Refreshing…" : "Reload"}
                    </Button>
                  </div>
                  {commentsLoading && (
                    <p className="text-[11px] text-muted-foreground">
                      Loading comments…
                    </p>
                  )}
                  {!commentsLoading && commentsError && (
                    <p className="text-[11px] text-red-500">
                      {commentsError}
                    </p>
                  )}
                  {!commentsLoading &&
                    !commentsError &&
                    comments.length === 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        No comments on this post yet.
                      </p>
                    )}

                  {!commentsLoading &&
                    !commentsError &&
                    comments.length > 0 && (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {commentActionError && (
                          <p className="text-[11px] text-red-500">
                            {commentActionError}
                          </p>
                        )}
                        {comments.map((c) => (
                          <div
                            key={c.id}
                            className={`rounded-md border bg-background px-2 py-1.5 ${
                              c.is_hidden ? "opacity-60" : ""
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
                                {c.from_name || "Unknown user"}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {c.created_time
                                  ? new Date(
                                      c.created_time
                                    ).toLocaleString()
                                  : ""}
                              </span>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-[11px]">
                              {c.message || ""}
                            </p>
                            <div className="mt-1 flex items-center justify-between">
                              <span className="text-[10px] text-muted-foreground">
                                {c.is_hidden ? "Hidden" : "Visible"}
                              </span>
                              <div className="flex gap-1">
                                <Button
                                  size="xs"
                                  variant="outline"
                                  className="h-6 px-2"
                                  onClick={() => handleToggleHide(c)}
                                  disabled={
                                    commentBusyId === c.fb_comment_id
                                  }
                                >
                                  {c.is_hidden ? "Unhide" : "Hide"}
                                </Button>
                                <Button
                                  size="xs"
                                  variant="destructive"
                                  className="h-6 px-2"
                                  onClick={() => handleDeleteComment(c)}
                                  disabled={
                                    commentBusyId === c.fb_comment_id
                                  }
                                >
                                  Delete
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                </div>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
