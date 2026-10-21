import { createServerClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const createClient = (request: any, responseObj?: any) => {
  const cookies = request.cookies;
  const supabase = createServerClient(
    supabaseUrl!,
    supabaseKey!,
    {
      cookies: {
        getAll() {
          return cookies.getAll?.() ?? [];
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => cookies.set?.(name, value));
          if (responseObj) {
            cookiesToSet.forEach(({ name, value, options }) =>
              responseObj.cookies?.set?.(name, value, options)
            );
          }
        },
      },
    },
  );

  return supabase;
};
