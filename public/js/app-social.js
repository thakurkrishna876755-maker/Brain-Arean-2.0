// Social hub
function registerIdentity() {
  const tabName = sessionStorage.getItem("brainArenaTestPlayerName");
  emitAck("social:register", {
    playerId,
    name: tabName || localStorage.getItem("brainArenaName") || "Player",
    avatar: localStorage.getItem("brainArenaAvatar") || "✦",
    bio: localStorage.getItem("brainArenaBio") || "Ready for a new challenge."
  }, response => {
    if (!response.ok) return toast(response.message || "Profile connection failed.", true);
    applyProfile(response.profile);
  });
}
function applyProfile(data) { if (!data) return; profile=data; profileAvatar=data.avatar||"✦"; if(data.id) playerId=data.id; $("myAvatar").textContent=profileAvatar; $("myProfileName").textContent=data.name||"Player"; $("myProfileBio").textContent=data.bio||"Ready for a new challenge."; $("myPlayerCode").textContent=data.code||"--------"; $("onlineToggle").checked=data.status!=="offline"; $("profilePreviewAvatar").textContent=profileAvatar; $("profilePreviewName").textContent=data.name||"Player"; $("profilePreviewBio").textContent=data.bio||"Ready for a new challenge."; $("profilePreviewCode").textContent=data.code||"--------"; if($("profileNameInput"))$("profileNameInput").value=data.name||"Player";if($("profileBioInput"))$("profileBioInput").value=data.bio||"";$$(".avatar-choice").forEach(b=>b.classList.toggle("active",b.dataset.avatar===profileAvatar));renderFriends(data);renderConversationList();updateUnread();updateStats(); }
function renderFriends(data) {
  const requests=data.requests||[];const incoming=requests.filter(r=>r.direction==="incoming");const outgoing=requests.filter(r=>r.direction==="outgoing");$("requestCount").textContent=String(incoming.length);$("friendCount").textContent=String((data.friends||[]).length);
  const renderPerson=(person,actions,subline="")=>`<div class="person-row"><div class="mini-avatar">${ESC(person.avatar||"✦")}</div><div class="person-main"><strong>${ESC(person.name||"Player")}</strong><small>${subline||`<span class="presence-dot ${person.online?"online":""}"></span>${person.online?"Online":"Offline"} · ${ESC(person.code||"")}`}</small></div><div class="person-actions">${actions}</div></div>`;
  $("incomingRequests").classList.toggle("empty-state",!incoming.length);$("incomingRequests").innerHTML=incoming.length?incoming.map(r=>renderPerson(r.person,`<button class="btn btn-primary" data-action="accept" data-request-id="${ESC(r.id)}">Accept</button><button class="btn btn-quiet" data-action="decline" data-request-id="${ESC(r.id)}">Decline</button>`)).join(""):"No incoming requests.";
  $("outgoingRequests").classList.toggle("empty-state",!outgoing.length);$("outgoingRequests").innerHTML=outgoing.length?outgoing.map(r=>renderPerson(r.person,`<button class="btn btn-quiet" data-action="cancel" data-request-id="${ESC(r.id)}">Cancel</button>`)).join(""):"No outgoing requests.";
  const friends=data.friends||[];$("friendsList").classList.toggle("empty-state",!friends.length);$("friendsList").innerHTML=friends.length?friends.map(p=>renderPerson(p,`<button class="btn btn-primary" data-action="message" data-code="${ESC(p.code)}">Message</button><button class="btn btn-quiet" data-action="invite" data-code="${ESC(p.code)}">Invite</button><button class="btn btn-quiet" data-action="remove" data-code="${ESC(p.code)}">Remove</button><button class="btn btn-quiet" data-action="block" data-code="${ESC(p.code)}">Block</button>`)).join(""):"Your circle starts here. Search for a player by name or code.";
}
function searchPlayers(query) { emitAck("social:search",{query},response=>{if(!response.ok)return toast(response.message||"Search failed.",true);const target=$("playerSearchResults");if(!response.results.length){target.className="stack-list empty-state";target.textContent="No players found. Try their exact 8-character code.";return;}target.className="stack-list";target.innerHTML=response.results.map(p=>`<div class="person-row"><div class="mini-avatar">${ESC(p.avatar||"✦")}</div><div class="person-main"><strong>${ESC(p.name)}</strong><small><span class="presence-dot ${p.online?"online":""}"></span>${p.online?"Online":"Offline"} · Code ${ESC(p.code)}</small></div><div class="person-actions">${p.relation==="friend"?`<button class="btn btn-quiet" data-action="message" data-code="${ESC(p.code)}">Message</button>`:p.relation==="outgoing"?`<span class="count-pill">Request sent</span>`:p.relation==="incoming"?`<button class="btn btn-primary" data-action="accept-code" data-code="${ESC(p.code)}">Accept</button>`:`<button class="btn btn-primary" data-action="add" data-code="${ESC(p.code)}">Add friend</button>`}</div></div>`).join("");}); }
$("playerSearchForm")?.addEventListener("submit",e=>{e.preventDefault();searchPlayers($("playerSearch").value.trim());});
$("friendsList")?.addEventListener("click",handleSocialAction);$("incomingRequests")?.addEventListener("click",handleSocialAction);$("outgoingRequests")?.addEventListener("click",handleSocialAction);$("playerSearchResults")?.addEventListener("click",handleSocialAction);
function handleSocialAction(event) { const button=event.target.closest("[data-action]");if(!button)return;const action=button.dataset.action;const code=button.dataset.code;const requestId=button.dataset.requestId;
  if(action==="message"){openConversation(code);navigate("#/messages");return;}
  if(action==="add"){emitAck("social:request",{code},r=>{toast(r.message|| (r.ok?"Request sent.":"Could not send request."),!r.ok);if(r.ok)socket.emit("social:bootstrap",x=>x?.profile&&applyProfile(x.profile));});return;}
  if(action==="accept-code") {
    const request = (profile?.requests || []).find(item => item.direction === "incoming" && item.person?.code === code);
    if (!request) return toast("This request is no longer available.", true);
    emitAck("social:request:respond", { requestId: request.id, action: "accept" }, result => {
      if (!result.ok) return toast(result.message || "Could not accept request.", true);
      socket.emit("social:bootstrap", response => response?.profile && applyProfile(response.profile));
    });
    return;
  }
  if(["accept","decline","cancel"].includes(action)){emitAck(action==="cancel"?"social:request:cancel":"social:request:respond",{requestId,action:action==="accept"?"accept":"decline"},r=>{if(!r.ok)toast(r.message||"Could not update request.",true);else socket.emit("social:bootstrap",x=>x?.profile&&applyProfile(x.profile));});return;}
  if(action==="remove"||action==="block"){const label=action==="block"?"Block this player? They will no longer be able to connect with you.":"Remove this friend?";if(!confirm(label))return;emitAck(action==="block"?"social:block":"social:friend:remove",{code},r=>{if(!r.ok)toast("Could not update friend.",true);else socket.emit("social:bootstrap",x=>x?.profile&&applyProfile(x.profile));});return;}
  if(action==="invite"){openInviteDialog(code);}
}
$("newTestPlayer")?.addEventListener("click", () => {
  const testUrl = `${location.origin}${location.pathname}?testPlayer=1#/friends`;
  const opened = window.open(testUrl, "_blank");
  if (!opened) toast("Your browser blocked the new tab. Allow pop-ups and try again.", true);
  else { opened.opener = null; toast("A separate test player is opening in a new tab."); }
});
$("onlineToggle")?.addEventListener("change",()=>emitAck("social:status",{online:$("onlineToggle").checked},r=>{if(!r.ok){toast("Could not update status.",true);return;}toast(r.online?"You appear online.":"You appear offline.");}));
$("copyPlayerCode")?.addEventListener("click",()=>copyText(profile?.code||""));
function syncProfileForm(){if(!profile)return;$("profileNameInput").value=profile.name||"Player";$("profileBioInput").value=profile.bio||"";profileAvatar=profile.avatar||"✦";$$('.avatar-choice').forEach(b=>b.classList.toggle("active",b.dataset.avatar===profileAvatar));}
$("avatarChoices")?.addEventListener("click",e=>{const button=e.target.closest("[data-avatar]");if(!button)return;profileAvatar=button.dataset.avatar;$$('.avatar-choice').forEach(b=>b.classList.toggle("active",b===button));$("profilePreviewAvatar").textContent=profileAvatar;});
$("profileForm")?.addEventListener("submit",e=>{e.preventDefault();const data={name:$("profileNameInput").value.trim(),avatar:profileAvatar,bio:$("profileBioInput").value.trim()};emitAck("social:profile:update",data,r=>{if(!r.ok){setStatus("profileSaveStatus",r.message||"Could not save profile.");return;}localStorage.setItem("brainArenaName",data.name);localStorage.setItem("brainArenaAvatar",data.avatar);localStorage.setItem("brainArenaBio",data.bio);applyProfile(r.profile);setStatus("profileSaveStatus","Profile saved successfully.");toast("Profile updated.");});});


function openInviteDialog(friendCode) {
  $("inviteDialog")?.remove();
  const dialog = document.createElement("dialog"); dialog.id = "inviteDialog"; dialog.className = "invite-dialog";
  dialog.innerHTML = `<form method="dialog" class="invite-card"><button class="invite-close" value="cancel" aria-label="Close invitation">×</button><span class="eyebrow">CHALLENGE A FRIEND</span><h2>Choose your arena</h2><p>Send a direct invitation. Duel starts as soon as your friend accepts.</p><label class="field"><span>Game</span><select id="inviteGame"><option value="math">Quick Math</option><option value="memory">Memory Matrix</option><option value="reaction">Reaction Test</option><option value="puzzle">Number Puzzle</option><option value="word">Word Scramble</option><option value="color">Color Clash</option><option value="typing">Typing Master</option><option value="higher">Higher or Lower</option><option value="odd">Odd One Out</option><option value="simon">Simon Tap</option><option value="pattern">Pattern Pulse</option><option value="gk">GK Quiz</option><option value="ludo">Ludo Classic</option></select></label><label class="field"><span>Difficulty</span><select id="inviteDifficulty"><option value="easy">Easy</option><option value="medium" selected>Medium</option><option value="hard">Hard</option><option value="hacker">Hacker</option></select></label><button id="sendGameInvite" class="btn btn-primary btn-full" type="button">Create room & send invite</button><p id="inviteDialogStatus" class="status-line" aria-live="polite"></p></form>`;
  document.body.append(dialog); dialog.showModal();
  $("sendGameInvite").addEventListener("click", () => {
    const game = $("inviteGame").value; const difficulty = $("inviteDifficulty").value; const button = $("sendGameInvite"); button.disabled = true; button.textContent = "Creating invitation…";
    const send = (roomCode, roomType) => emitAck("social:invite", { code: friendCode, roomCode }, result => {
      if (!result.ok) { $("inviteDialogStatus").textContent = result.message || "Could not send invitation."; button.disabled = false; button.textContent = "Try again"; return; }
      currentRoomGame = game; currentRoomCode = roomType === "duel" ? roomCode : currentRoomCode; ludoRoomCode = roomType === "ludo" ? roomCode : ludoRoomCode;
      $("inviteDialogStatus").textContent = `Invitation sent. Room code: ${roomCode}`; toast("Invitation sent!"); setTimeout(() => dialog.close(), 900);
    });
    if (game === "ludo") emitAck("ludo:create", { name: profile?.name || "Player", blockRule: false, finishOnFirst: true, autoMove: false }, r => { if (!r.ok) { $("inviteDialogStatus").textContent = r.message; button.disabled = false; return; } send(r.code, "ludo"); });
    else emitAck("room:create", { name: profile?.name || "Player", difficulty, game }, r => { if (!r.ok) { $("inviteDialogStatus").textContent = r.message; button.disabled = false; return; } currentRoomCode = r.code; send(r.code, "duel"); });
  });
}
