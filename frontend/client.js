document.getElementById("status").textContent = "JS Loaded!";

const socket = io("https://unknownmediocretutorial-production.up.railway.app", {
  path: "/socket.io/"
});

socket.on("connect", () => {
  document.getElementById("status").textContent = "Connected to backend!";
});

socket.on("connect_error", (err) => {
  document.getElementById("status").textContent = "Connection error: " + err.message;
});
