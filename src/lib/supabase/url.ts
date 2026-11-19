export function getSupabaseUrl(value: string | undefined): string {
  if (!value) {
    throw new Error("Supabase URL is not configured");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Supabase URL is invalid");
  }

  if (
    process.env.NODE_ENV === "production" &&
    url.protocol !== "https:"
  ) {
    throw new Error("Supabase URL must use HTTPS in production");
  }

  return url.toString().replace(/\/$/, "");
}
