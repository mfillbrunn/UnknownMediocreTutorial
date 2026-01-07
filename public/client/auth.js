const emailInput = $("authEmail");
const passwordInput = $("authPassword");
const status = $("authStatus");
const logoutBtn = $("logoutBtn");

$("signupBtn").onclick = async () => {
  const { data, error } = await supabase.auth.signUp({
  email,
  password
});

if (!error) {
  await supabase.from("profiles").insert({
    id: data.user.id,
    username: email.split("@")[0],
    rating_bullet: 1200,
    rating_blitz: 1200,
    rating_notime: 1200,
    rating_deep: 1200,
    games_played_bullet: 0,
    games_played_blitz: 0,
    games_played_notime: 0,
    games_played_deep: 0,
    wins_bullet: 0,
    wins_blitz: 0,
    wins_notime: 0,
    wins_deep: 0
  });
}
  status.textContent = error ? error.message : "Account created!";
};

$("loginBtn").onclick = async () => {
  const { error } = await supabase.auth.signInWithPassword({
    email: emailInput.value,
    password: passwordInput.value
  });

  status.textContent = error ? error.message : "Logged in!";
};

logoutBtn.onclick = async () => {
  await supabase.auth.signOut();
  status.textContent = "Logged out";
};

supabase.auth.onAuthStateChange((_event, session) => {
  window.currentUser = session?.user || null;

  $("logoutBtn").classList.toggle("hidden", !window.currentUser);

  if (window.currentUser) {
    loadMyProfile();
  } else{
    window.myProfile = null;
  }
});

async function loadMyProfile() {
  if (!window.currentUser) return;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", window.currentUser.id)
    .single();

  if (!error) {
    window.myProfile = data;
  }
}

