addAiBtn.onclick = () => {
  socket.emit("gameAction", {
    type: "ADD_AI",
    userId: myUserId
  });
};
