const emailInput = $("authEmail");
const passwordInput = $("authPassword");
const status = $("authStatus");
const logoutBtn = $("logoutBtn");

$("signupBtn").onclick = async () => {
  const { error } = await supabase.auth.signUp({
    email: emailInput.value,
    password: passwordInput.value
  });

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
    status.textContent = `Logged in as ${window.currentUser.email}`;
  }
});

