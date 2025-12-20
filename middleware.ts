// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";

const PROTECTED_PREFIXES = ["/account", "/dashboard", "/admin"];

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  const { data: { session } } = await supabase.auth.getSession();

  const { pathname, search } = req.nextUrl;
  const currentPath = `${pathname}${search}`;

  // protect only selected routes
  if (isProtected(pathname) && !session) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/auth/login";
    loginUrl.search = ""; // no need redirect param now

    const redirectRes = NextResponse.redirect(loginUrl);

    // store original page
    redirectRes.cookies.set("post_login_redirect", currentPath, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: req.nextUrl.protocol === "https:",
    });

    // keep any sb-* cookies refreshed by Supabase
    for (const c of res.cookies.getAll()) redirectRes.cookies.set(c);

    return redirectRes;
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
