import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

function safePath(p: string | null) {
  if (!p) return null;
  // allow only internal redirects
  if (!p.startsWith("/")) return null;
  // avoid redirecting back to auth endpoints
  if (p.startsWith("/auth")) return null;
  return p;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  // 1) Get redirect target from query or cookie
  const redirectFromQuery = safePath(url.searchParams.get("redirect"));

  const cookieStore = cookies();
  const redirectFromCookie = safePath(
    cookieStore.get("post_login_redirect")?.value ?? null
  );

  const target = redirectFromQuery || redirectFromCookie || "/influencer-request";

  // 2) Exchange code -> sets Supabase cookies on server
  if (code) {
    const supabase = createRouteHandlerClient({ cookies });
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      const loginUrl = new URL("/auth/login", url.origin);
      loginUrl.searchParams.set("redirect", target);
      loginUrl.searchParams.set("error", "oauth_exchange_failed");
      return NextResponse.redirect(loginUrl);
    }
  }

  // 3) Clear cookie (optional)
  cookieStore.set("post_login_redirect", "", { path: "/", maxAge: 0 });

  // 4) Redirect user to the intended page
  return NextResponse.redirect(new URL(target, url.origin));
}
