// authentication/supabaseClient.js

if (!window.supabaseClient) {
  console.log("🔥 Creating Supabase client");

  window.supabaseClient = supabase.createClient(
    "https://zskbwatoxvghyouqjuxi.supabase.co",
    "sb_publishable_1ubwHN-WJJcvYRQb9c5Y9g_1FdOPGAP",
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storage: window.localStorage
      }
    }
  );
}

if (!window.supabaseClient) {
  console.log("🔥 Creating Supabase client");

  window.supabaseClient = supabase.createClient(
    "https://zskbwatoxvghyouqjuxi.supabase.co",
    "sb_publishable_1ubwHN-WJJcvYRQb9c5Y9g_1FdOPGAP",
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storage: window.localStorage
      }
    }
  );

  // 🔑 REGISTER IMMEDIATELY
  window.supabaseClient.auth.onAuthStateChange((event, session) => {
    console.log("AUTH EVENT:", event);

    window.currentUser = session?.user || null;

    if (event === "INITIAL_SESSION") {
      if (session?.user) {
        window.authReady = true;
      } else {
        window.authReady = false;
      }
    }

    if (event === "SIGNED_IN") {
      window.authReady = true;
    }

    if (event === "SIGNED_OUT") {
      window.authReady = false;
      window.profileReady = false;
      window.currentUser = null;
    }
  });
}
