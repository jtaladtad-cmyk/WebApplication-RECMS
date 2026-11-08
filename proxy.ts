import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only (cookie present). Real session validation happens
// server-side in lib/auth.ts on every page and action.
const PUBLIC = ["/login", "/register"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has("recms_session");
  const isPublic = PUBLIC.some((p) => pathname === p);
  if (!hasSession && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
