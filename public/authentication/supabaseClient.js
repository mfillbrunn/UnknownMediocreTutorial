// authentication/supabaseClient.js

if (!window.supabase) {
  console.log("🔥 Creating Supabase client");

  window.supabase = supabase.createClient(
    "https://zskbwatoxvghyouqjuxi.supabase.co",
    "sb_publishable_1ubwHN-WJJcvYRQb9c5Y9g_1FdOPGAP",
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    }
  );
}
