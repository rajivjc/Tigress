import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "./env";
import { MOCK_SESSION_COOKIE } from "@/lib/auth/mock-users";

// Public routes — reachable without a valid session.
const PUBLIC_ROUTES = new Set([
  "/",
  "/login",
  "/forgot-password",
  "/register",
]);

// API routes and Next.js internals that the middleware should never gate.
function isAlwaysAllowed(pathname: string): boolean {
  return (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico"
  );
}

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.has(pathname)) return true;
  return false;
}

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always let Next internals + API through untouched.
  if (isAlwaysAllowed(pathname)) {
    return NextResponse.next({ request: { headers: request.headers } });
  }

  const isPublic = isPublicRoute(pathname);

  // ---- Mock mode -----------------------------------------------------------
  // When Supabase isn't configured, there's no real session to refresh. We
  // still enforce the "no session = redirect to /login" rule using a cookie
  // written by the mock AuthProvider.
  if (!isSupabaseConfigured()) {
    const hasMockSession = Boolean(
      request.cookies.get(MOCK_SESSION_COOKIE)?.value
    );
    if (!isPublic && !hasMockSession) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request: { headers: request.headers } });
  }

  // ---- Real Supabase mode --------------------------------------------------
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isPublic && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}
