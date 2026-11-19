import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseUrl } from "@/lib/supabase/url";

function addSecurityHeaders(response: NextResponse, secure: boolean) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(self), microphone=(self), geolocation=()",
  );
  if (secure) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000",
    );
  }
  return response;
}

/**
 * Next.js middleware that refreshes the Supabase auth token on every request.
 * This is the official Supabase pattern for Next.js App Router.
 */
export async function middleware(request: NextRequest) {
  const isProduction = process.env.NODE_ENV === "production";
  const appUrl = new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://Bheem-ai.com",
  );
  if (isProduction && appUrl.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_APP_URL must use HTTPS in production");
  }
  const isSecureRequest = request.nextUrl.protocol === "https:";
  if (isProduction && !isSecureRequest) {
    const secureUrl = new URL(appUrl);
    secureUrl.pathname = request.nextUrl.pathname;
    secureUrl.search = request.nextUrl.search;
    return addSecurityHeaders(NextResponse.redirect(secureUrl, 308), false);
  }

  // Skip cookie refresh for mobile requests using Bearer token auth
  if (request.headers.get("authorization")?.startsWith("Bearer ")) {
    return addSecurityHeaders(
      NextResponse.next({ request }),
      isProduction && isSecureRequest,
    );
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    getSupabaseUrl(process.env.SUPABASE_URL),
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              ...(isProduction ? { secure: true } : {}),
            }),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const staleCookies = request.cookies
      .getAll()
      .filter((c) => c.name.startsWith("sb-"));
    for (const { name } of staleCookies) {
      supabaseResponse.cookies.delete(name);
    }
  }

  return addSecurityHeaders(supabaseResponse, isProduction && isSecureRequest);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
