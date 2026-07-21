// client/friends.js — Friends, Requests, Invites

(function () {
  const sb = () => window.supabaseClient;

  // ── Supabase helpers ──────────────────────────────────────────────────
  async function fetchFriends(userId) {
    const { data } = await sb()
      .from("friendships")
      .select(`
        id, requester_id, addressee_id,
        requester:profiles!friendships_requester_id_fkey(id, username),
        addressee:profiles!friendships_addressee_id_fkey(id, username)
      `)
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .eq("status", "accepted");
    return (data || []).map(row => {
      const f = row.requester_id === userId ? row.addressee : row.requester;
      return { friendshipId: row.id, ...f };
    });
  }

  async function fetchIncoming(userId) {
    const { data } = await sb()
      .from("friendships")
      .select(`id, requester:profiles!friendships_requester_id_fkey(id, username)`)
      .eq("addressee_id", userId).eq("status", "pending");
    return (data || []).map(r => ({ friendshipId: r.id, ...r.requester }));
  }

  async function fetchSent(userId) {
    const { data } = await sb()
      .from("friendships")
      .select(`id, addressee:profiles!friendships_addressee_id_fkey(id, username)`)
      .eq("requester_id", userId).eq("status", "pending");
    return (data || []).map(r => ({ friendshipId: r.id, ...r.addressee }));
  }

  async function fetchInvites(userId) {
    const { data } = await sb()
      .from("game_invites")
      .select(`id, room_id, sender:profiles!game_invites_from_user_fkey(id, username)`)
      .eq("to_user", userId).eq("status", "pending")
      .order("created_at", { ascending: false });
    return data || [];
  }

  async function searchUsers(query, myId) {
    const { data } = await sb()
      .from("profiles")
      .select("id, username")
      .ilike("username", `%${query}%`)
      .neq("id", myId)
      .limit(10);
    return data || [];
  }

  async function sendRequest(myId, toId) {
    const { error } = await sb()
      .from("friendships")
      .insert({ requester_id: myId, addressee_id: toId, status: "pending" });
    return !error;
  }

  async function acceptRequest(id) {
    const { error } = await sb()
      .from("friendships").update({ status: "accepted" }).eq("id", id);
    return !error;
  }

  async function deleteRequest(id) {
    const { error } = await sb()
      .from("friendships").delete().eq("id", id);
    return !error;
  }

  async function sendInvite(myId, toId, roomId) {
    await sb().from("game_invites")
      .insert({ from_user: myId, to_user: toId, room_id: roomId, status: "pending" });
  }

  async function declineInvite(inviteId) {
    await sb().from("game_invites")
      .update({ status: "declined" }).eq("id", inviteId);
  }

  async function acceptInvite(inviteId, targetRoomId) {
    await sb().from("game_invites")
      .update({ status: "accepted" }).eq("id", inviteId);
    const username = window.myProfile?.username || window.currentUser?.email || "Player";
    return new Promise(resolve => {
      socket.emit("joinRoom", { roomId: targetRoomId, userId: window.currentUser.id, name: username }, resp => {
        if (resp?.ok) {
          // Not just window.roomId — see the identical fix in
          // my-games.js's _resumeMyGame for why the plain global binding
          // (client.js's `let roomId`) matters too.
          roomId = targetRoomId;
          window.roomId = targetRoomId;
          persistRoom(targetRoomId);
          enterLobbyAfterJoin();
        } else {
          toast(resp?.error || "Could not join room");
        }
        resolve(!!resp?.ok);
      });
    });
  }

  // Exposed so my-games.js can surface pending invites there too, without
  // duplicating the Supabase query/update logic.
  window._fetchGameInvites = fetchInvites;
  window._acceptGameInvite = acceptInvite;
  window._declineGameInvite = declineInvite;

  // ── State ────────────────────────────────────────────────────────────
  let _tab = "friends";
  let _searchTimer = null;

  // ── Entry point ──────────────────────────────────────────────────────
  window.showFriendsScreen = async function () {
    if (!window.currentUser) return toast("Please log in first");
    showScreen("friendsScreen");
    _buildShell();
    _loadTab(_tab);
  };

  function _buildShell() {
    const screen = document.getElementById("friendsScreen");
    if (!screen) return;
    screen.innerHTML = `
      <div class="menu-center friends-center">
        <div class="friends-header">
          <button class="menu-btn friends-back" onclick="showStartup()">← Back</button>
          <h2 class="menu-title" style="flex:1;text-align:center">Friends</h2>
        </div>
        <div class="friends-tabs">
          <button class="friends-tab${_tab === "friends"  ? " active" : ""}" data-tab="friends">Friends</button>
          <button class="friends-tab${_tab === "requests" ? " active" : ""}" data-tab="requests">Requests</button>
          <button class="friends-tab${_tab === "invites"  ? " active" : ""}" data-tab="invites">Invites</button>
        </div>
        <div id="friendsContent" class="friends-content">Loading…</div>
      </div>
    `;
    screen.querySelectorAll(".friends-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        _tab = btn.dataset.tab;
        screen.querySelectorAll(".friends-tab")
          .forEach(b => b.classList.toggle("active", b.dataset.tab === _tab));
        _loadTab(_tab);
      });
    });
  }

  async function _loadTab(tab) {
    const content = document.getElementById("friendsContent");
    if (!content) return;
    content.innerHTML = "<p class='friends-empty'>Loading…</p>";
    const uid = window.currentUser.id;

    // ── Friends tab ────────────────────────────────────────────────────
    if (tab === "friends") {
      const friends = await fetchFriends(uid);
      let html = friends.length ? friends.map(f => `
        <div class="friends-row">
          <span class="friends-name">${f.username || "—"}</span>
          <button class="secondary-btn small" data-invite-uid="${f.id}" data-invite-name="${f.username}">
            Invite to Game
          </button>
        </div>`).join("") : `<p class="friends-empty">No friends yet. Search below to add.</p>`;

      html += `
        <div class="friends-search-wrap">
          <input id="friendSearchInput" class="menu-input" placeholder="Search by username…" autocomplete="off" />
          <div id="friendSearchResults" class="friends-search-results"></div>
        </div>`;

      content.innerHTML = html;

      content.querySelectorAll("[data-invite-uid]").forEach(btn => {
        btn.addEventListener("click", () => _handleInvite(btn.dataset.inviteUid, btn.dataset.inviteName));
      });

      const input   = document.getElementById("friendSearchInput");
      const results = document.getElementById("friendSearchResults");
      input?.addEventListener("input", () => {
        clearTimeout(_searchTimer);
        const q = input.value.trim();
        if (q.length < 2) { results.innerHTML = ""; return; }
        _searchTimer = setTimeout(async () => {
          const users = await searchUsers(q, uid);
          if (!users.length) { results.innerHTML = `<p class="friends-empty">No users found</p>`; return; }
          results.innerHTML = users.map(u => `
            <div class="friends-row">
              <span class="friends-name">${u.username}</span>
              <button class="secondary-btn small" data-add-id="${u.id}">Add Friend</button>
            </div>`).join("");
          results.querySelectorAll("[data-add-id]").forEach(b => {
            b.addEventListener("click", async () => {
              const ok = await sendRequest(uid, b.dataset.addId);
              b.disabled = true;
              b.textContent = ok ? "Sent ✓" : "Error";
              toast(ok ? "Friend request sent!" : "Could not send request");
            });
          });
        }, 350);
      });
    }

    // ── Requests tab ───────────────────────────────────────────────────
    else if (tab === "requests") {
      const [incoming, sent] = await Promise.all([fetchIncoming(uid), fetchSent(uid)]);
      let html = "";
      if (incoming.length) {
        html += `<p class="friends-section-label">Incoming</p>`;
        html += incoming.map(r => `
          <div class="friends-row">
            <span class="friends-name">${r.username}</span>
            <button class="primary-btn small" data-accept="${r.friendshipId}">Accept</button>
            <button class="secondary-btn small" data-decline="${r.friendshipId}">Decline</button>
          </div>`).join("");
      }
      if (sent.length) {
        html += `<p class="friends-section-label">Sent</p>`;
        html += sent.map(r => `
          <div class="friends-row">
            <span class="friends-name">${r.username}</span>
            <span class="friends-status">Pending…</span>
            <button class="secondary-btn small" data-cancel="${r.friendshipId}">Cancel</button>
          </div>`).join("");
      }
      if (!html) html = `<p class="friends-empty">No pending requests</p>`;
      content.innerHTML = html;

      content.querySelectorAll("[data-accept]").forEach(btn => {
        btn.addEventListener("click", async () => {
          const ok = await acceptRequest(btn.dataset.accept);
          toast(ok ? "Friend added!" : "Error");
          _loadTab("requests");
        });
      });
      content.querySelectorAll("[data-decline], [data-cancel]").forEach(btn => {
        btn.addEventListener("click", async () => {
          await deleteRequest(btn.dataset.decline || btn.dataset.cancel);
          _loadTab("requests");
        });
      });
    }

    // ── Invites tab ────────────────────────────────────────────────────
    else if (tab === "invites") {
      const invites = await fetchInvites(uid);
      if (!invites.length) {
        content.innerHTML = `<p class="friends-empty">No pending game invites</p>`;
        return;
      }
      content.innerHTML = invites.map(inv => `
        <div class="friends-row">
          <span class="friends-name">${inv.sender?.username || "?"} invited you</span>
          <button class="primary-btn small" data-room="${inv.room_id}" data-inv="${inv.id}">Join</button>
          <button class="secondary-btn small" data-decline-inv="${inv.id}">Decline</button>
        </div>`).join("");
      content.querySelectorAll("[data-room]").forEach(btn => {
        btn.addEventListener("click", () => acceptInvite(btn.dataset.inv, btn.dataset.room));
      });
      content.querySelectorAll("[data-decline-inv]").forEach(btn => {
        btn.addEventListener("click", async () => {
          await declineInvite(btn.dataset.declineInv);
          _loadTab("invites");
        });
      });
    }
  }

  async function _handleInvite(friendId, friendName) {
    if (!window.roomId) {
      const username = window.myProfile?.username || window.currentUser?.email || "Player";
      socket.emit("createRoom", { userId: window.currentUser.id, name: username }, async resp => {
        if (!resp?.ok) return toast("Could not create room");
        window.roomId = resp.roomId;
        persistRoom(resp.roomId);
        enterLobbyAfterJoin();
        await sendInvite(window.currentUser.id, friendId, resp.roomId);
        toast(`Invite sent to ${friendName}`);
      });
    } else {
      await sendInvite(window.currentUser.id, friendId, window.roomId);
      toast(`Invite sent to ${friendName}`);
    }
  }
})();
