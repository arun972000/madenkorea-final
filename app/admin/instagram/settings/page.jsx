"use client";

import { useEffect, useMemo, useState } from "react";

export default function InstagramSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // For showing current connection details
  const [account, setAccount] = useState(null);

  // Manual form (advanced)
  const [form, setForm] = useState({
    ig_business_account_id: "",
    username: "",
    access_token: "",
    token_expires_at: "",
  });
  const [message, setMessage] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Read any ?success or ?error from URL (after OAuth redirect)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const error = params.get("error");

    if (success === "connected") {
      setMessage("Facebook + Instagram account connected successfully.");
    } else if (error) {
      setMessage(decodeURIComponent(error));
    }
  }, []);

  useEffect(() => {
    const loadAccount = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/instagram/account");
        if (!res.ok) {
          throw new Error("Failed to load instagram account");
        }
        const data = await res.json();

        if (data.account) {
          setAccount(data.account);
          setForm((prev) => ({
            ...prev,
            ig_business_account_id:
              data.account.ig_business_account_id || "",
            username: data.account.username || "",
            token_expires_at: data.account.token_expires_at
              ? data.account.token_expires_at.substring(0, 10)
              : "",
          }));
        } else {
          setAccount(null);
        }
      } catch (err) {
        console.error(err);
        setMessage("Could not load existing Instagram settings.");
      } finally {
        setLoading(false);
      }
    };

    loadAccount();
  }, []);

  // ----- STATUS LABEL -----
  const tokenStatus = useMemo(() => {
    if (!account || !account.token_expires_at) {
      return { label: "Not connected", tone: "warning" };
    }
    const expiry = new Date(account.token_expires_at);
    const now = new Date();
    const diffDays = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

    if (diffDays <= 0) {
      return { label: "Expired – please reconnect", tone: "error" };
    }
    if (diffDays < 7) {
      return { label: `Expiring soon (${Math.round(diffDays)} days)`, tone: "warning" };
    }
    return {
      label: `Connected (expires ${expiry.toLocaleDateString()})`,
      tone: "ok",
    };
  }, [account]);

  // ----- Manual form handlers (advanced) -----
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/instagram/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save Instagram account");
      }

      setMessage("Instagram account saved (manual mode).");
      setForm((prev) => ({ ...prev, access_token: "" }));
    } catch (err) {
      console.error(err);
      setMessage(err.message || "Error saving Instagram account.");
    } finally {
      setSaving(false);
    }
  };

  // ----- Click: Connect / Reconnect with Facebook -----
  const handleConnectWithFacebook = () => {
    const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
    const redirectUri =
      process.env.NEXT_PUBLIC_SITE_URL +
      "/api/instagram/oauth-callback";

    const scopes = [
      "instagram_basic",
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "pages_manage_metadata",
    ];

    const authUrl = new URL("https://www.facebook.com/v21.0/dialog/oauth");
    authUrl.searchParams.set("client_id", appId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", scopes.join(","));
    authUrl.searchParams.set("state", "instagram-settings");

    window.location.href = authUrl.toString();
  };

  if (loading) {
    return (
      <main className="min-h-screen px-4 py-10">
        <h1 className="text-2xl font-semibold mb-4">Instagram Settings</h1>
        <p>Loading...</p>
      </main>
    );
  }

  const statusColorClass =
    tokenStatus.tone === "ok"
      ? "text-green-700 bg-green-50 border-green-200"
      : tokenStatus.tone === "warning"
      ? "text-amber-700 bg-amber-50 border-amber-200"
      : "text-red-700 bg-red-50 border-red-200";

  return (
    <main className="min-h-screen px-4 py-10 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Instagram Settings</h1>
      <p className="text-sm text-gray-600 mb-4">
        Connect your Instagram Business account and Facebook Page. Once
        connected, your tokens will be stored securely and you can manage posts
        and comments from the admin panel.
      </p>

      {/* STATUS + CONNECT BUTTON */}
      <div className={`mb-4 border rounded-md px-3 py-2 text-xs ${statusColorClass}`}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="font-medium">Connection status</p>
            <p className="mt-1">
              {tokenStatus.label}
              {account?.username && (
                <>
                  {" "}
                  – <span className="font-mono">@{account.username}</span>
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={handleConnectWithFacebook}
            className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium bg-black text-white"
          >
            {account ? "Reconnect with Facebook" : "Connect with Facebook"}
          </button>
        </div>
      </div>

      {message && (
        <div className="mb-4 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
          {message}
        </div>
      )}

      {/* ADVANCED: MANUAL TOKEN ENTRY */}
      <div className="mt-6 border rounded-md">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium"
        >
          <span>Advanced: manual token setup (developers)</span>
          <span>{showAdvanced ? "▲" : "▼"}</span>
        </button>

        {showAdvanced && (
          <div className="border-t px-3 py-3">
            <p className="text-xs text-gray-500 mb-3">
              Normally you don&apos;t need this. Use it only if you want to
              paste a long-lived token generated manually from Meta tools.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Instagram Business Account ID *
                </label>
                <input
                  type="text"
                  name="ig_business_account_id"
                  value={form.ig_business_account_id}
                  onChange={handleChange}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  placeholder="e.g. 1784xxxxxxxxxxxx"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Instagram Username
                </label>
                <input
                  type="text"
                  name="username"
                  value={form.username}
                  onChange={handleChange}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  placeholder="@yourbusiness"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Access Token *
                </label>
                <textarea
                  name="access_token"
                  value={form.access_token}
                  onChange={handleChange}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  placeholder="Paste long-lived access token here"
                  rows={3}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  This is stored securely in your database and not shown again
                  after save.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Token Expiry (optional)
                </label>
                <input
                  type="date"
                  name="token_expires_at"
                  value={form.token_expires_at}
                  onChange={handleChange}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium bg-black text-white disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save manual token"}
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
