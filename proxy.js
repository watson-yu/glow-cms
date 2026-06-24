// Server-side auth gate (Next.js 16 "proxy" — the Node.js-runtime successor to
// `middleware.js`). It MUST run on the Node runtime because the OAuth secret and
// allow-list live in MySQL, which the Edge runtime cannot reach; the `proxy.js`
// filename guarantees the Node runtime.
//
// When OAuth is configured, every matched request must carry a valid, allow-listed
// session. When it is not configured the instance is open (initial-setup state);
// high-risk API routes still fail closed via their own requireAuth() guard.
import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";

export const config = {
  matcher: ["/api/:path*", "/cms-admin/:path*", "/preview/:path*"],
};

export default async function proxy(req) {
  const { pathname } = req.nextUrl;

  // NextAuth endpoints (sign-in, callbacks) and the public auth-status endpoint
  // must stay reachable so the login flow can run.
  if (pathname.startsWith("/api/auth")) return NextResponse.next();

  const { configured, ok } = await authorizeRequest(req);
  if (!configured || ok) return NextResponse.next();

  // Authenticated session required but absent/invalid.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // The admin root hosts the login UI — let it render so the user can sign in.
  if (pathname === "/cms-admin") return NextResponse.next();

  // Deep admin pages and previews redirect to the login surface.
  const url = req.nextUrl.clone();
  url.pathname = "/cms-admin";
  url.search = "";
  return NextResponse.redirect(url);
}
