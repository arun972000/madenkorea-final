import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";

const PROTECTED_PREFIXES = [
  "/influencer-request",
  "/influencer",
];

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

function copyCookies(from: NextResponse, to: NextResponse) {
  for (const c of from.cookies.getAll()) to.cookies.set(c);
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  // refreshes/sets sb-* cookies if possible
  const { data: { session } } = await supabase.auth.getSession();

  const { pathname, search } = req.nextUrl;

  // allow auth routes, public assets, api, etc.
  if (pathname.startsWith("/auth") || pathname.startsWith("/api")) return res;

  if (isProtected(pathname) && !session) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/auth/login";
    loginUrl.searchParams.set("redirect", `${pathname}${search}`);

    const redirectRes = NextResponse.redirect(loginUrl);
    copyCookies(res, redirectRes);
    return redirectRes;
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
