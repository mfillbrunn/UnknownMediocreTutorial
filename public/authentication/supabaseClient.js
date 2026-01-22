// authentication/supabaseClient.js
console.trace("🔥 supabaseClient.js executed");
if (!window.supabaseClient) {
  console.log("🔥 Creating Supabase client");

  window.supabaseClient = supabase.createClient(
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
