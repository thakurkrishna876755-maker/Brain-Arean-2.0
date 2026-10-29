// Messages and editable/deletable chat
function renderConversationList(){if(!profile)return;const list=$("conversationList");const conversations=profile.conversations||[];unreadTotal=conversations.reduce((sum,c)=>sum+(c.unread||0),0);updateUnread();if(!conversations.length){list.innerHTML='<div class="empty-state">Add a friend to start a conversation.</div>';return;}list.innerHTML=conversations.map(c=>`<button class="conversation-item ${activeFriendCode===c.person.code?"active":""}" type="button" data-code="${ESC(c.person.code)}"><div class="mini-avatar">${ESC(c.person.avatar||"✦")}</div><div class="person-main"><strong>${ESC(c.person.name)}</strong><small>${ESC(c.lastMessage||"Start a conversation")}</small></div>${c.unread?`<span class="unread-badge">${c.unread}</span>`:""}</button>`).join("");}
function updateUnread(){const badge=$("navUnread");if(!badge)return;badge.textContent=String(unreadTotal);badge.classList.toggle("hidden",unreadTotal===0);}
$("conversationList")?.addEventListener("click",e=>{const button=e.target.closest("[data-code]");if(button)openConversation(button.dataset.code);});
$("conversationBack")?.addEventListener("click",()=>$("messagesLayout").classList.remove("conversation-open"));
function openConversation(code){activeFriendCode=code;activeConversationKey=null;const friend=(profile?.friends||[]).find(p=>p.code===code);if(!friend){toast("You can message friends only.",true);return;}$("conversationPlaceholder").classList.add("hidden");$("activeConversation").classList.remove("hidden");$("messagesLayout").classList.add("conversation-open");$("conversationAvatar").textContent=friend.avatar||"✦";$("conversationName").textContent=friend.name;$("conversationPresence").textContent=friend.online?"Online":"Offline";$("dmMessages").innerHTML='<div class="empty-state">Loading messages…</div>';emitAck("dm:history",{code},r=>{if(!r.ok){$("dmMessages").textContent=r.message||"Could not load conversation.";return;}activeConversationKey=r.conversationKey;renderChatMessages($("dmMessages"),r.messages||[],"dm");socket.emit("dm:read",{code},()=>{});if(profile?.conversations){const c=profile.conversations.find(x=>x.person.code===code);if(c)c.unread=0;renderConversationList();}});renderConversationList();}
$("dmForm")?.addEventListener("submit",e=>{e.preventDefault();const text=$("dmInput").value.trim();if(!text||!activeFriendCode)return;emitAck("dm:send",{toCode:activeFriendCode,text,retention:$("dmRetention")?.value||"never"},r=>{if(!r.ok){toast(r.message||"Message not sent.",true);return;}$("dmInput").value="";});});
function renderChatMessages(container,messages,type){container.innerHTML=messages.length?messages.map(m=>messageHtml(m,type)).join(""):'<div class="empty-state">No messages yet. Say hello.</div>';container.scrollTop=container.scrollHeight;}
function messageHtml(message,type){const own=message.senderId===playerId;const actions=own&&!message.deleted?`<div class="chat-message-actions"><button type="button" data-chat-action="edit" data-message-id="${ESC(message.id)}" data-chat-type="${type}">Edit</button><button type="button" data-chat-action="delete" data-message-id="${ESC(message.id)}" data-chat-type="${type}">Delete</button></div>`:"";return `<article class="chat-message ${own?"own":""}" data-message-id="${ESC(message.id)}" data-room-code="${ESC(message.roomCode||"")}"><div class="chat-message-author">${ESC(own?"You":message.senderName||"Player")}</div><div class="chat-message-text">${ESC(message.deleted?"message deleted":message.text)}${message.edited&&!message.deleted?' <small>(edited)</small>':""}</div><small>${new Date(message.createdAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</small>${actions}</article>`;}
function refreshActiveMessages(){if(activeFriendCode)openConversation(activeFriendCode);}
document.addEventListener("click", handleChatCrud);
function handleChatCrud(event){const button=event.target.closest("[data-chat-action]");if(!button)return;const messageId=button.dataset.messageId;const type=button.dataset.chatType;const action=button.dataset.chatAction;const article=button.closest(".chat-message");if(action==="edit"){const current=article?.querySelector(".chat-message-text")?.textContent.replace("(edited)","").trim()||"";const input=document.createElement("input");input.value=current;input.maxLength=240;input.className="chat-edit-input";const controls=document.createElement("div");controls.className="chat-message-actions";const save=document.createElement("button");save.textContent="Save";const cancel=document.createElement("button");cancel.textContent="Cancel";controls.append(save,cancel);const textNode=article.querySelector(".chat-message-text");textNode.replaceWith(input);article.querySelector(".chat-message-actions")?.remove();article.append(controls);save.addEventListener("click",()=>{const text=input.value.trim();if(!text)return;if(type==="dm")socket.emit("dm:edit",{messageId,text});else socket.emit("room:chat:edit",{messageId,text});});cancel.addEventListener("click",()=>{if(type==="dm")refreshActiveMessages();else {
      const roomCode = article?.dataset.roomCode || currentRoomCode || ludoRoomCode;
      const targetId = roomCode && roomCode === ludoRoomCode ? "ludoChatMessages" : activeRoute === "game" ? "gameChatMessages" : "duelChatMessages";
      loadRoomChat(roomCode, targetId);
    }});return;}if(action==="delete"){if(!confirm("Delete this message for everyone?"))return;if(type==="dm")socket.emit("dm:delete",{messageId});else socket.emit("room:chat:delete",{messageId});}}
function applyMessageUpdate(payload) {
  if (!payload?.message) return;
  const message = payload.message;
  if (payload.conversationKey && payload.conversationKey === activeConversationKey) {
    const container = $("dmMessages");
    const old = container?.querySelector(`[data-message-id="${CSS.escape(message.id)}"]`);
    if (old) old.outerHTML = messageHtml(message, "dm");
    else if (container) container.insertAdjacentHTML("beforeend", messageHtml(message, "dm"));
    if (container) container.scrollTop = container.scrollHeight;
    return;
  }
  if (!message.roomCode) return;
  const targets = message.roomCode === ludoRoomCode
    ? ["ludoChatMessages"]
    : message.roomCode === currentRoomCode ? [activeRoute === "game" ? "gameChatMessages" : "duelChatMessages"] : [];
  targets.forEach(id => {
    const container = $(id);
    const old = container?.querySelector(`[data-message-id="${CSS.escape(message.id)}"]`);
    if (old) old.outerHTML = messageHtml(message, "room");
  });
}
const roomChatUnread = { duel: 0, game: 0, ludo: 0 };
function setupChatCollapse(panelId, toggleId, badgeId, kind) {
  const panel = $(panelId);
  const toggle = $(toggleId);
  if (!panel || !toggle || toggle.dataset.bound) return;
  toggle.dataset.bound = "1";
  if (matchMedia("(max-width: 760px)").matches) panel.classList.add("chat-collapsed");
  const sync = () => {
    const collapsed = panel.classList.contains("chat-collapsed");
    toggle.textContent = collapsed ? "Open chat" : "Collapse";
    toggle.setAttribute("aria-expanded", String(!collapsed));
    const badge = $(badgeId);
    if (badge) {
      badge.textContent = String(roomChatUnread[kind] || 0);
      badge.classList.toggle("hidden", !roomChatUnread[kind]);
    }
    if (!collapsed) roomChatUnread[kind] = 0;
  };
  toggle.addEventListener("click", () => {
    panel.classList.toggle("chat-collapsed");
    sync();
  });
  panel.dataset.chatKind = kind;
  sync();
}
function showRoomChatMessage(message) {
  if (!message?.roomCode) return;
  let targetIds = [];
  let kind = "";
  if (message.roomCode === ludoRoomCode) {
    targetIds = ["ludoChatMessages"];
    kind = "ludo";
  } else if (message.roomCode === currentRoomCode) {
    kind = activeRoute === "game" ? "game" : "duel";
    targetIds = [kind === "game" ? "gameChatMessages" : "duelChatMessages"];
  }
  if (!targetIds.length) return;
  targetIds.forEach(id => {
    const container = $(id);
    if (!container) return;
    if (container.querySelector(".empty-state")) container.innerHTML = "";
    container.insertAdjacentHTML("beforeend", messageHtml(message, "room"));
    container.scrollTop = container.scrollHeight;
  });
  if (message.senderId !== playerId) {
    const panelId = kind === "ludo" ? "ludoGameChat" : kind === "game" ? "gameRoomChat" : "duelChat";
    const panel = $(panelId);
    if (panel?.classList.contains("chat-collapsed")) {
      roomChatUnread[kind] = (roomChatUnread[kind] || 0) + 1;
      const badge = $(kind === "ludo" ? "ludoChatUnread" : kind === "game" ? "gameChatUnread" : "duelChatUnread");
      if (badge) { badge.textContent = String(roomChatUnread[kind]); badge.classList.remove("hidden"); }
    }
  }
}

function setupRoomChat(formId,inputId,messagesId,pickerId){const form=$(formId);if(!form||form.dataset.bound)return;form.dataset.bound="1";form.addEventListener("submit",e=>{e.preventDefault();const text=$(inputId).value.trim();if(!text)return;emitAck("room:chat:send",{text},r=>{if(!r.ok)toast(r.message||"Message not sent.",true);else $(inputId).value="";});});const picker=$(pickerId);const toggle=form.querySelector("[data-emoji-target]");toggle?.addEventListener("click",()=>{picker.classList.toggle("hidden");picker.innerHTML=["😀","😂","😍","🤝","🔥","⚡","🎯","👏","💯","😎","🥳","👑","💪","❤️","🙌","😅"].map(emoji=>`<button type="button" data-emoji="${emoji}">${emoji}</button>`).join("");});picker?.addEventListener("click",e=>{const b=e.target.closest("[data-emoji]");if(!b)return;const input=$(inputId);input.value+=b.dataset.emoji;input.focus();picker.classList.add("hidden");});}
function loadRoomChat(code,messagesId){if(!code)return;const roomName=messagesId==="duelChatMessages"?"duelChatMessages":messagesId;emitAck("room:chat:history",{code},r=>{if(r.ok&&$(roomName))renderChatMessages($(roomName),r.messages||[],"room");});}
function setupAllChat(){setupRoomChat("duelChatForm","duelChatInput","duelChatMessages","duelEmojiPicker");setupChatCollapse("duelChat","duelChatToggle","duelChatUnread","duel");}
function copyText(value){if(!value)return toast("Nothing to copy yet.",true);if(navigator.clipboard?.writeText)navigator.clipboard.writeText(value).then(()=>toast("Copied to clipboard.")).catch(()=>toast(`Copy this: ${value}`));else toast(`Copy this: ${value}`);}


if($("dmRetention"))$("dmRetention").value=localStorage.getItem("brainArenaDmRetention")||"never";$("dmRetention")?.addEventListener("change",()=>localStorage.setItem("brainArenaDmRetention",$("dmRetention").value));
