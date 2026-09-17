import "server-only"
import { createClient } from "@supabase/supabase-js"

export async function checkPassword(
  email: string,
  id: string,
  password: string
) {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  )
  try {
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    })
    return !error && data.user?.id === id
  } finally {
    await client.auth.signOut({ scope: "local" })
  }
}
