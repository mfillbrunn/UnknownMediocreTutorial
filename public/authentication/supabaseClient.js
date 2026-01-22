// authentication/supabaseClient.js

if (!window.__supabaseInit) {
  window.__supabaseInit = true;

  window.supabase = supabase.createClient(
    "https://zskbwatoxvghyouqjuxi.supabase.co",
    "sb_publishable_1ubwHN-WJJcvYRQb9c5Y9g_1FdOPGAP",
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
      }
    }
  );

  console.log("🔥 Supabase client created");
}
