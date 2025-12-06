// app/(admin)/social/facebook/CampaignList.jsx
"use client";

import React, { useEffect, useState } from "react";
import {
  Facebook,
  Image as ImageIcon,
  Wand2,
  Send,
  Loader2,
  MessageCircle,
  ThumbsUp,
  Eye,
  Trash2,
  Edit,
  X,
  ChevronDown,
} from "lucide-react";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

export default function CampaignList() {
  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [error, setError] = useState("");

  // create composer
  const [showCreate, setShowCreate] = useState(false);
  const [message, setMessage] = useState("");
  const [tags, setTags] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState("");
  const [mediaType, setMediaType] = useState("IMAGE"); // IMAGE | VIDEO
  const [creating, setCreating] = useState(false);

  // edit
  const [editingId, setEditingId] = useState(null);
  const [editMessage, setEditMessage] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  // comments drawer
  const [activePostForComments, setActivePostForComments] = useState(null);
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentError, setCommentError] = useState("");
  const [newComment, setNewComment] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);

  useEffect(() => {
    fetchPosts();
  }, []);

  async function fetchPosts() {
    try {
      setLoadingPosts(true);
      setError("");
      const res = await fetch("/api/facebook/page-posts");
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to load posts");
      }
      setPosts(json.data || []);
    } catch (err) {
      console.error(err);
      setError(String(err.message || err));
    } finally {
      setLoadingPosts(false);
    }
  }

  function resetCreateForm() {
    setMessage("");
    setTags("");
    setMediaFile(null);
    setMediaPreview("");
    setMediaType("IMAGE");
  }

  async function uploadMediaIfAny() {
    if (!mediaFile) return null;
    const formData = new FormData();
    formData.append("file", mediaFile);
    formData.append("folder", "facebook"); // uses facebook-media bucket
    const res = await fetch("/api/uploads/social", {
      method: "POST",
      body: formData,
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || "Upload failed");
    }
    return json.publicUrl;
  }

  async function handleCreatePost(e) {
    e.preventDefault();

    if (!message.trim() && !mediaFile) {
      alert("Write something or attach a media file before posting.");
      return;
    }

    try {
      setCreating(true);
      setError("");

      const fullMessage = tags ? `${message}\n\n${tags}` : message;
      const mediaUrl = await uploadMediaIfAny();

      const res = await fetch("/api/facebook/page-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: fullMessage,
          media_url: mediaUrl,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to create post");
      }

      resetCreateForm();
      setShowCreate(false);
      fetchPosts();
    } catch (err) {
      console.error(err);
      setError(String(err.message || err));
    } finally {
      setCreating(false);
    }
  }

  // ✅ use SAME AI endpoint as Instagram
  async function handleGenerateCopy() {
    const baseText = message.trim();
    if (!baseText) {
      alert("Base caption / text is required");
      return;
    }

    try {
      setAiLoading(true);
      const res = await fetch("/api/ai/social-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "facebook",
          baseText,
          wantHashtags: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "AI error");

      if (json.optimizedText) setMessage(json.optimizedText);
      if (json.hashtags) setTags(json.hashtags);
    } catch (err) {
      console.error(err);
      alert("AI generation failed: " + (err.message || err));
    } finally {
      setAiLoading(false);
    }
  }

  function onFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
    setMediaType(file.type.startsWith("video") ? "VIDEO" : "IMAGE");
  }

  // edit post
  function openEdit(post) {
    setEditingId(post.fb_post_id);
    setEditMessage(post.message || "");
  }

  async function saveEdit() {
    if (!editingId || !editMessage.trim()) return;
    try {
      setEditLoading(true);
      const res = await fetch("/api/facebook/page-posts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fb_post_id: editingId,
          message: editMessage,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to edit post");
      setEditingId(null);
      setEditMessage("");
      fetchPosts();
    } catch (err) {
      console.error(err);
      alert("Edit failed: " + (err.message || err));
    } finally {
      setEditLoading(false);
    }
  }

  async function deletePost(post) {
    if (!confirm("Delete this Facebook post? This removes it from Facebook.")) {
      return;
    }
    try {
      const res = await fetch(
        `/api/facebook/page-posts?fb_post_id=${encodeURIComponent(
          post.fb_post_id
        )}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to delete");
      fetchPosts();
    } catch (err) {
      console.error(err);
      alert("Delete failed: " + (err.message || err));
    }
  }

  // comments
  async function openCommentsDrawer(post) {
    setActivePostForComments(post);
    setComments([]);
    setCommentError("");
    setLoadingComments(true);
    try {
      const res = await fetch(
        `/api/facebook/comments?fb_post_id=${encodeURIComponent(
          post.fb_post_id
        )}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load comments");
      setComments(json.data || []);
    } catch (err) {
      console.error(err);
      setCommentError(String(err.message || err));
    } finally {
      setLoadingComments(false);
    }
  }

  function closeCommentsDrawer() {
    setActivePostForComments(null);
    setComments([]);
    setNewComment("");
    setCommentError("");
  }

  async function sendComment(parentCommentId = null) {
    if (!activePostForComments || !newComment.trim()) return;
    try {
      setCommentLoading(true);
      const res = await fetch("/api/facebook/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fb_post_id: parentCommentId ? null : activePostForComments.fb_post_id,
          parent_comment_id: parentCommentId,
          message: newComment,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to send comment");
      setComments((prev) => [json.data, ...prev]);
      setNewComment("");
    } catch (err) {
      console.error(err);
      alert("Comment failed: " + (err.message || err));
    } finally {
      setCommentLoading(false);
    }
  }

  async function deleteComment(commentId) {
    if (!confirm("Delete this comment on Facebook?")) return;
    try {
      const res = await fetch(
        `/api/facebook/comments?fb_comment_id=${encodeURIComponent(
          commentId
        )}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to delete comment");
      setComments((prev) => prev.filter((c) => c.fb_comment_id !== commentId));
    } catch (err) {
      console.error(err);
      alert("Delete comment failed: " + (err.message || err));
    }
  }

  async function toggleHideComment(comment, nextHidden) {
    try {
      const res = await fetch("/api/facebook/comments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fb_comment_id: comment.fb_comment_id,
          is_hidden: nextHidden,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update comment");
      setComments((prev) =>
        prev.map((c) =>
          c.fb_comment_id === comment.fb_comment_id ? json.data : c
        )
      );
    } catch (err) {
      console.error(err);
      alert("Hide/unhide failed: " + (err.message || err));
    }
  }

  return (
    <div className="min-h-screen bg-[#18191a] text-[#e4e6eb]">
      {/* top bar */}
      <div className="border-b border-[#3a3b3c] px-6 py-4 flex items-center justify-between sticky top-0 z-20 bg-[#18191a]/90 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#2374e1] flex items-center justify-center">
            <Facebook className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-semibold flex items-center gap-2">
              Facebook Campaigns
              <span className="px-2 py-0.5 text-xs rounded-full bg-[#3a3b3c] text-[#b0b3b8]">
                Admin
              </span>
            </div>
            <div className="text-xs text-[#b0b3b8]">
              Manage posts, comments & AI copy
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#2374e1] hover:bg-[#1b63c9] text-sm font-medium"
        >
          <ImageIcon className="w-4 h-4" />
          {showCreate ? "Close composer" : "Create post"}
        </button>
      </div>

      {error && (
        <div className="px-6 pt-3">
          <div className="bg-[#3a3b3c] text-red-300 text-sm rounded-lg px-4 py-2 border border-red-500/40">
            {error}
          </div>
        </div>
      )}

      {/* composer */}
      {showCreate && (
        <div className="px-6 pt-4">
          <div className="max-w-2xl bg-[#242526] rounded-xl border border-[#3a3b3c] p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-sm">Create post</div>
              <button
                onClick={() => setShowCreate(false)}
                className="text-[#b0b3b8] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreatePost} className="space-y-3">
              <textarea
                className="w-full bg-[#3a3b3c] rounded-lg px-3 py-2 text-sm outline-none resize-none min-h-[80px]"
                placeholder="What's on your mind?"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />

              <textarea
                className="w-full bg-[#3a3b3c] rounded-lg px-3 py-2 text-xs outline-none resize-none min-h-[40px]"
                placeholder="#hashtags (optional)"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />

              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 text-xs px-3 py-2 rounded-full bg-[#3a3b3c] cursor-pointer hover:bg-[#4a4b4d]">
                  <ImageIcon className="w-4 h-4" />
                  <span>Photo / Video</span>
                  <input
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={onFileChange}
                  />
                </label>

                <button
                  type="button"
                  onClick={handleGenerateCopy}
                  disabled={aiLoading}
                  className={cn(
                    "inline-flex items-center gap-2 text-xs px-3 py-2 rounded-full bg-[#3a3b3c] hover:bg-[#4a4b4d]",
                    aiLoading && "opacity-60 cursor-not-allowed"
                  )}
                >
                  {aiLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Wand2 className="w-3 h-3" />
                  )}
                  <span>AI optimize & hashtags</span>
                </button>
              </div>

              {mediaPreview && (
                <div className="rounded-lg overflow-hidden border border-[#3a3b3c] bg-black max-h-64 flex items-center justify-center">
                  {mediaType === "VIDEO" ? (
                    <video
                      src={mediaPreview}
                      controls
                      playsInline
                      className="max-h-64 w-auto"
                    />
                  ) : (
                    <img
                      src={mediaPreview}
                      alt="preview"
                      className="max-h-64 w-auto object-contain"
                    />
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={resetCreateForm}
                  className="px-3 py-1.5 rounded-full text-xs bg-[#3a3b3c] hover:bg-[#4a4b4d]"
                  disabled={creating}
                >
                  Clear
                </button>
                <button
                  type="submit"
                  disabled={creating || (!message.trim() && !mediaFile)}
                  className={cn(
                    "inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium bg-[#2374e1] hover:bg-[#1b63c9]",
                    creating && "opacity-70 cursor-not-allowed"
                  )}
                >
                  {creating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>Post now</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* posts feed */}
      <div className="px-6 pt-4 pb-10 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold flex items-center gap-2">
            Recent posts
            <button
              onClick={fetchPosts}
              className="text-xs px-2 py-1 rounded-full bg-[#3a3b3c] hover:bg-[#4a4b4d]"
            >
              Refresh
            </button>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[#b0b3b8]">
            <ChevronDown className="w-3 h-3" />
            Newest first
          </div>
        </div>

        {loadingPosts && (
          <div className="flex items-center justify-center py-10 text-[#b0b3b8]">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading posts…
          </div>
        )}

        {!loadingPosts && posts.length === 0 && (
          <div className="text-center text-[#b0b3b8] text-sm py-10 bg-[#242526] border border-[#3a3b3c] rounded-xl">
            No posts yet. Create your first campaign post above.
          </div>
        )}

        <div className="space-y-4">
          {posts.map((post) => {
            const created = post.created_time
              ? new Date(post.created_time)
              : null;
            const createdLabel = created
              ? created.toLocaleString()
              : "Unknown date";

            // ✅ better media extraction for playable video
            const rawAttachments = post.attachments;
            const attachment = Array.isArray(rawAttachments?.data)
              ? rawAttachments.data[0]
              : rawAttachments?.data || rawAttachments || null;

            const isVideo =
              attachment?.media_type === "video" ||
              attachment?.type === "video_inline" ||
              attachment?.type === "video";

            const mediaUrl =
              (isVideo && attachment?.media?.source) ||
              attachment?.media?.image?.src ||
              attachment?.media?.source ||
              attachment?.url ||
              null;

            const likes =
              post.reactions_count ??
              post.insights?.find((i) => i.name === "post_engaged_users")
                ?.values?.[0]?.value ??
              0;
            const commentsCount = post.comments_count ?? 0;

            return (
              <article
                key={post.id || post.fb_post_id}
                className="bg-[#242526] rounded-xl border border-[#3a3b3c] overflow-hidden"
              >
                {/* header */}
                <div className="px-4 pt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-[#3a3b3c]" />
                    <div>
                      <div className="text-sm font-semibold">
                        Facebook Page
                      </div>
                      <div className="text-[11px] text-[#b0b3b8]">
                        {createdLabel}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-[#b0b3b8]">
                    {post.permalink_url && (
                      <a
                        href={post.permalink_url}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        View on Facebook
                      </a>
                    )}
                  </div>
                </div>

                {/* body */}
                <div className="px-4 pt-2 pb-1 text-sm whitespace-pre-wrap">
                  {editingId === post.fb_post_id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editMessage}
                        onChange={(e) => setEditMessage(e.target.value)}
                        className="w-full bg-[#3a3b3c] rounded-lg px-3 py-2 text-sm outline-none resize-none min-h-[70px]"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          className="text-xs px-3 py-1 rounded-full bg-[#3a3b3c]"
                          onClick={() => {
                            setEditingId(null);
                            setEditMessage("");
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={saveEdit}
                          disabled={editLoading || !editMessage.trim()}
                          className={cn(
                            "text-xs px-3 py-1 rounded-full bg-[#2374e1] hover:bg-[#1b63c9]",
                            editLoading && "opacity-60 cursor-not-allowed"
                          )}
                        >
                          {editLoading ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>{post.message}</>
                  )}
                </div>

                {/* ✅ media (video now prefers media.source and is playable) */}
                {mediaUrl && (
                  <div className="mt-1 bg-black flex items-center justify-center max-h-[480px]">
                    {isVideo ? (
                      <video
                        key={post.fb_post_id}
                        src={mediaUrl}
                        controls
                        playsInline
                        className="max-h-[480px] w-full object-contain"
                      />
                    ) : (
                      <img
                        src={mediaUrl}
                        alt=""
                        className="max-h-[480px] w-full object-contain"
                      />
                    )}
                  </div>
                )}

                {/* footer */}
                <div className="px-4 pt-2 pb-2 border-t border-[#3a3b3c]">
                  <div className="flex items-center justify-between text-[11px] text-[#b0b3b8] mb-1.5">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1">
                        <ThumbsUp className="w-3 h-3" />
                        {likes || 0} likes
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageCircle className="w-3 h-3" />
                        {commentsCount || 0} comments
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      {post.insights ? "Insights captured" : "No insights"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-[#3a3b3c]/80 mt-1">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openCommentsDrawer(post)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full hover:bg-[#3a3b3c]"
                      >
                        <MessageCircle className="w-3 h-3" />
                        Comments
                      </button>
                      <button
                        onClick={() => openEdit(post)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full hover:bg-[#3a3b3c]"
                      >
                        <Edit className="w-3 h-3" />
                        Edit
                      </button>
                    </div>
                    <button
                      onClick={() => deletePost(post)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full hover:bg-[#3a3b3c] text-red-300"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {/* comments drawer */}
      {activePostForComments && (
        <div className="fixed inset-0 bg-black/50 z-40 flex justify-end">
          <div className="w-full max-w-md h-full bg-[#242526] border-l border-[#3a3b3c] flex flex-col">
            <div className="px-4 py-3 border-b border-[#3a3b3c] flex items-center justify-between">
              <div className="font-semibold text-sm flex items-center gap-2">
                <MessageCircle className="w-4 h-4" />
                Comments
              </div>
              <button
                onClick={closeCommentsDrawer}
                className="text-[#b0b3b8] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 text-sm">
              {loadingComments && (
                <div className="flex items-center justify-center py-4 text-[#b0b3b8]">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Loading comments…
                </div>
              )}
              {commentError && (
                <div className="text-red-300 text-xs">{commentError}</div>
              )}
              {!loadingComments && comments.length === 0 && (
                <div className="text-xs text-[#b0b3b8]">
                  No comments yet on this post.
                </div>
              )}
              {comments.map((c) => (
                <div
                  key={c.fb_comment_id}
                  className={cn(
                    "rounded-lg px-3 py-2 bg-[#3a3b3c]",
                    c.is_hidden && "opacity-60"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-semibold text-xs">
                      {c.from_name || "User"}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-[#b0b3b8]">
                      {c.like_count != null && (
                        <span>{c.like_count} likes</span>
                      )}
                      {c.created_time && (
                        <span>
                          {new Date(c.created_time).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs whitespace-pre-wrap">
                    {c.message}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[11px]">
                    <button
                      onClick={() => setNewComment(`@${c.from_name} `)}
                      className="hover:underline"
                    >
                      Reply
                    </button>
                    <button
                      onClick={() => toggleHideComment(c, !c.is_hidden)}
                      className="hover:underline"
                    >
                      {c.is_hidden ? "Unhide" : "Hide"}
                    </button>
                    <button
                      onClick={() => deleteComment(c.fb_comment_id)}
                      className="text-red-300 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-[#3a3b3c] p-3">
              <div className="flex items-center gap-2">
                <input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Write a comment…"
                  className="flex-1 bg-[#3a3b3c] rounded-full px-3 py-2 text-xs outline-none"
                />
                <button
                  onClick={() => sendComment(null)}
                  disabled={commentLoading || !newComment.trim()}
                  className={cn(
                    "w-9 h-9 rounded-full bg-[#2374e1] flex items-center justify-center",
                    commentLoading && "opacity-60 cursor-not-allowed"
                  )}
                >
                  {commentLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
