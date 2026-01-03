socket.on("lobbyEvent", event => {
  if (event.type === "hideLobby") {
    document.body.classList.add("game-started");
  }
});
