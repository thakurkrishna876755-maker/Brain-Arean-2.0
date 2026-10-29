// Ludo board: same rules module for local pass-and-play and online authoritative play
const DICE_PIPS={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
function renderLudoLanding(content){clearSoloTimers();content.innerHTML=`<div class="game-content-header"><div><span class="eyebrow">LUDO CLASSIC · STRATEGY</span><h1>Ludo Classic</h1><p>Four colours. One home. Play locally or invite friends online.</p></div><span class="difficulty-chip">Turn-based</span></div><div class="ludo-layout"><div><div id="ludoBoardWrap" class="ludo-board-wrap"></div><p id="ludoNotice" class="game-feedback" aria-live="polite">Choose a mode to begin.</p></div><aside class="ludo-side"><h2>Game controls</h2><div class="ludo-controls"><label class="field local-player-count"><span>Local players</span><select id="ludoLocalPlayerCount"><option value="2">2 players</option><option value="3">3 players</option><option value="4">4 players</option></select></label><button id="ludoLocalStart" class="btn btn-primary">Local pass & play</button><button id="ludoOnlineCreate" class="btn btn-quiet">Create online room</button></div><div class="field"><span>Join online room</span><input id="ludoJoinCode" maxlength="5" placeholder="5-character code"></div><button id="ludoOnlineJoin" class="btn btn-quiet btn-full" style="margin-top:9px">Join Ludo room</button><div id="ludoRoomInfo" class="status-line"></div><div id="ludoLobbyPlayers" class="player-chips"></div><div class="ludo-controls"><button id="ludoStartOnline" class="btn btn-primary hidden">Start Ludo</button><button id="ludoRoll" class="dice-button hidden" aria-label="Roll die"><span id="ludoDieFace" class="die-face" aria-label="Die not rolled"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span><small>ROLL</small></button><div id="ludoDiceResult" class="ludo-dice-result" aria-live="polite"><span class="dice-result-label">LAST ROLL</span><strong id="ludoDiceNumber">—</strong><span id="ludoDiceCaption">Roll the die to begin</span></div></div><p id="ludoTurnInfo" class="status-line">The active player's turn appears here.</p><label class="status-toggle"><span>Block rule</span><input id="ludoBlockRule" type="checkbox"><i></i></label><label class="status-toggle"><span>Auto-move if only one token can move</span><input id="ludoAutoMove" type="checkbox"><i></i></label><label class="status-toggle"><span>End at first winner</span><input id="ludoFinishFirst" type="checkbox" checked><i></i></label><div id="ludoTokenOptions" class="ludo-controls"></div><div id="ludoGameChat" class="game-chat mobile-drawer hidden"><div class="chat-heading"><strong>Table chat</strong><span id="ludoChatUnread" class="count-pill hidden">0</span><button id="ludoChatToggle" class="btn btn-small btn-quiet" type="button" aria-expanded="true">Collapse</button></div><div id="ludoChatMessages" class="chat-messages"></div><div id="ludoEmojiPicker" class="emoji-picker hidden"></div><form id="ludoChatForm" class="chat-compose"><button class="emoji-toggle" type="button" data-emoji-target="ludoChatInput" aria-label="Choose emoji">☺</button><input id="ludoChatInput" maxlength="240" placeholder="Chat with the table"><button class="btn btn-primary btn-small">Send</button></form></div></aside></div>`;
  $("ludoLocalStart").addEventListener("click",()=>startLocalLudo());$("ludoOnlineCreate").addEventListener("click",()=>{emitAck("ludo:create",{name:profile?.name||"Player",blockRule:$("ludoBlockRule").checked,finishOnFirst:$("ludoFinishFirst").checked,autoMove:$("ludoAutoMove").checked},r=>{if(!r.ok)return setStatus("ludoRoomInfo",r.message);ludoRoomCode=r.code;$("ludoRoomInfo").textContent=`Room ${r.code} created. Invite friends and share this code.`;$("ludoStartOnline").classList.remove("hidden");$("ludoGameChat").classList.remove("hidden");setupRoomChat("ludoChatForm","ludoChatInput","ludoChatMessages","ludoEmojiPicker");setupChatCollapse("ludoGameChat","ludoChatToggle","ludoChatUnread","ludo");loadRoomChat(r.code,"ludoChatMessages");});});
  $("ludoOnlineJoin").addEventListener("click",()=>{const code=$("ludoJoinCode").value.trim().toUpperCase();emitAck("ludo:join",{code,name:profile?.name||"Player"},r=>{if(!r.ok)return setStatus("ludoRoomInfo",r.message);ludoRoomCode=r.code;$("ludoRoomInfo").textContent=`Joined Ludo room ${r.code}.`;$("ludoGameChat").classList.remove("hidden");setupRoomChat("ludoChatForm","ludoChatInput","ludoChatMessages","ludoEmojiPicker");setupChatCollapse("ludoGameChat","ludoChatToggle","ludoChatUnread","ludo");loadRoomChat(r.code,"ludoChatMessages");});});
  $("ludoStartOnline").addEventListener("click",()=>emitAck("ludo:start",{code:ludoRoomCode},r=>{if(!r.ok)setStatus("ludoRoomInfo",r.message);}));
  $("ludoRoll").addEventListener("click",()=>{
    const rollButton=$("ludoRoll");
    rollButton.disabled=true;
    rollButton.classList.add("dice-rolling");
    const faceNode=$("ludoDieFace");
    const resultPanel=$("ludoDiceResult");
    const numberNode=$("ludoDiceNumber");
    const captionNode=$("ludoDiceCaption");
    const showRoll=(value,rolling=false)=>{
      if(faceNode){faceNode.dataset.value=String(value||0);faceNode.setAttribute("aria-label",rolling?"Dice rolling":`Dice showing ${value}`);faceNode.querySelectorAll("i").forEach((pip,index)=>pip.classList.toggle("on",(DICE_PIPS[value]||[]).includes(index)));}
      if(numberNode)numberNode.textContent=value?String(value):"—";
      if(resultPanel)resultPanel.classList.toggle("has-result",Boolean(value)&&!rolling);
      if(captionNode)captionNode.textContent=rolling?"Rolling…":value?"Your roll":"Roll the die to begin";
    };
    let spin=0;
    const spinTimer=setInterval(()=>{spin=spin%6+1;showRoll(spin,true);},75);
    const finish=(r)=>{
      clearInterval(spinTimer);
      rollButton.classList.remove("dice-rolling");
      rollButton.disabled=false;
      if(!r||!r.ok&&r.roll===undefined){showRoll(null,false);if(r?.message)toast(r.message,true);return;}
      currentLudoRollResult=r;
      showRoll(r.roll,false);
      if(captionNode)captionNode.textContent=r.forfeited?"Three sixes — turn forfeited":r.autoMoved?"Automatic move completed":"Choose a highlighted token";
      if(ludoLocal){
        if($("ludoAutoMove").checked&&r.legalMoves?.length===1){try{const player=ludoLocalGame.players[ludoLocalGame.turn];const moved=window.LudoRules.moveToken(ludoLocalGame,player.id,r.legalMoves[0]);setStatus("ludoNotice",moved.captured.length?"😢 Token captured! Back to the yard.":"Auto-move completed.");}catch(e){toast(e.message,true);}}
        setStatus("ludoNotice",r.forfeited?"Three sixes — turn forfeited.":`🎲 You rolled ${r.roll}. Select a highlighted token.`);
        renderLudo();showRoll(r.roll,false);
      } else {
        if(!r.ok){toast(r.message||"Could not roll the die.",true);return;}
        setStatus("ludoNotice",r.forfeited?"Three sixes — turn forfeited.":r.autoMoved?"The only legal token moved automatically.":`🎲 You rolled ${r.roll}. Choose a highlighted token.`);
      }
    };
    if(ludoLocal){
      try{const player=ludoLocalGame.players[ludoLocalGame.turn];const r=window.LudoRules.rollDice(ludoLocalGame,player.id);setTimeout(()=>finish(r),650);}catch(e){clearInterval(spinTimer);rollButton.disabled=false;rollButton.classList.remove("dice-rolling");toast(e.message,true);}
    } else {
      emitAck("ludo:roll",{code:ludoRoomCode},r=>setTimeout(()=>finish(r),650));
    }
  });
  setupRoomChat("ludoChatForm","ludoChatInput","ludoChatMessages","ludoEmojiPicker");
  if(ludoRoomCode)emitAck("ludo:join",{code:ludoRoomCode,name:profile?.name||"Player"},()=>{});
  renderLudo();
}
function startLocalLudo(){ludoLocal=true;ludoRoomCode=null;const count=Number($("ludoLocalPlayerCount")?.value||2);const labels=[profile?.name||"Player 1","Player 2","Player 3","Player 4"];ludoLocalPlayers=labels.slice(0,count).map((name,index)=>({id:`local-${index+1}`,name}));ludoLocalGame=window.LudoRules.createGame(ludoLocalPlayers.map(p=>p.id),{blockRule:$("ludoBlockRule").checked,finishOnFirst:$("ludoFinishFirst").checked,autoMove:$("ludoAutoMove").checked});ludoState={code:null,status:"playing",players:ludoLocalPlayers.map(p=>({...p,color:ludoLocalGame.players.find(g=>g.id===p.id).color})),state:ludoLocalGame};$("ludoRoomInfo").textContent="Local pass-and-play started. Pass the device after each turn.";$("ludoRoll").classList.remove("hidden");$("ludoGameChat").classList.add("hidden");$("ludoStartOnline").classList.add("hidden");renderLudo();}
function renderLudo(){const face=$("ludoDieFace");const diceFaces={1:"⚀",2:"⚁",3:"⚂",4:"⚃",5:"⚄",6:"⚅"};const liveRoll=ludoLocalGame?.dice||ludoState?.state?.dice||null;const lastRoll=liveRoll||currentLudoRollResult?.roll||null;if(face){const shown=lastRoll||0;face.dataset.value=String(shown);face.setAttribute("aria-label",shown?`Dice showing ${shown}`:"Die not rolled");face.querySelectorAll("i").forEach((pip,index)=>pip.classList.toggle("on",(DICE_PIPS[shown]||[]).includes(index)));}const number=$("ludoDiceNumber");const caption=$("ludoDiceCaption");if(number)number.textContent=lastRoll?String(lastRoll):"—";if(caption)caption.textContent=lastRoll?(liveRoll?"Move a highlighted token":"Most recent roll") : "Roll the die to begin";const resultPanel=$("ludoDiceResult");if(resultPanel)resultPanel.classList.toggle("has-result",Boolean(lastRoll));const wrap=$("ludoBoardWrap");if(!wrap)return;const previousTokens=new Map([...wrap.querySelectorAll(".ludo-token")].map(token=>[`${token.dataset.tokenPlayer}:${token.dataset.tokenIndex}`,{cx:Number(token.dataset.cx),cy:Number(token.dataset.cy),progress:Number(token.dataset.progress)}]));const state=ludoLocal?ludoLocalGame:ludoState?.state;const players=ludoLocal?ludoLocalPlayers.map(p=>({...p,color:state?.players.find(g=>g.id===p.id)?.color})):ludoState?.players||[];if(!state){wrap.innerHTML='<div class="empty-state">Start local play or create/join an online room to see the board.</div>';$("ludoRoll").classList.add("hidden");return;}
  const cell=40;let svg=`<svg class="ludo-board" viewBox="0 0 600 600" role="img" aria-label="Ludo board">`;
  svg+='<rect width="600" height="600" rx="14" fill="#f9f4e9"/>';
  const yards={red:[0,0],green:[360,0],yellow:[360,360],blue:[0,360]};
  Object.entries(yards).forEach(([color,[x,y]])=>{svg+=`<rect x="${x}" y="${y}" width="240" height="240" rx="8" fill="${COLORS[color]}"/><rect x="${x+30}" y="${y+30}" width="180" height="180" rx="9" fill="#fffdf7" stroke="#d9d1c2" stroke-width="2"/>`;const slots=yardSlots(color);slots.forEach(([cx,cy],i)=>{svg+=`<circle cx="${cx}" cy="${cy}" r="22" fill="#f1ece2" stroke="${COLORS[color]}" stroke-width="2"/>`;});});
  window.LudoRules.TRACK.forEach(([row,col],index)=>{const x=col*cell,y=row*cell;const safe=window.LudoRules.SAFE_INDICES.has(index);let fill="#fffdf8";const startColor=Object.keys(window.LudoRules.START_INDEX).find(c=>window.LudoRules.START_INDEX[c]===index);if(startColor)fill=COLORS[startColor];svg+=`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${fill}" stroke="#d8d1c4" stroke-width="1.2"/>`;if(safe&&!startColor)svg+=`<text x="${x+20}" y="${y+26}" text-anchor="middle" font-size="21" fill="#a69b87">★</text>`;});
  Object.entries(window.LudoRules.HOME_PATH).forEach(([color,points])=>points.forEach(([row,col])=>{svg+=`<rect x="${col*cell}" y="${row*cell}" width="${cell}" height="${cell}" fill="${COLORS[color]}" fill-opacity=".82" stroke="#fff9" stroke-width="1.3"/>`;}));
  // Four-colour centre triangle
  svg+='<rect x="240" y="240" width="120" height="120" fill="#fffdf8" stroke="#d8d1c4" stroke-width="2"/>';
  svg+='<path d="M240 240 L360 240 L300 300 Z" fill="#2e9c78"/><path d="M360 240 L360 360 L300 300 Z" fill="#e8b94f"/><path d="M360 360 L240 360 L300 300 Z" fill="#568de0"/><path d="M240 360 L240 240 L300 300 Z" fill="#df5965"/>';
  const coords=[];players.forEach(p=>{const gamePlayer=state.players.find(g=>g.id===p.id)||state.players.find(g=>g.color===p.color);if(!gamePlayer)return;gamePlayer.tokens.forEach((progress,tokenIndex)=>{let position;if(progress<0){position={type:"yard",...yardSlots(p.color)[tokenIndex].reduce((o,v,i)=>{o[i===0?"cx":"cy"]=v;return o;},{})};}else{const pos=window.LudoRules.tokenPosition(p.color,progress);position={type:pos.type,cx:pos.col*cell+20,cy:pos.row*cell+20};}if(position.type==="yard"){position.cx=position.cx;position.cy=position.cy;}coords.push({...position,baseCx:position.cx,baseCy:position.cy,color:p.color,playerId:p.id,tokenIndex,progress});});});
  const tokenPiles=new Map();coords.forEach(token=>{const key=`${token.baseCx}:${token.baseCy}`;const pile=tokenPiles.get(key)||[];pile.push(token);tokenPiles.set(key,pile);});
  tokenPiles.forEach(pile=>{const count=pile.length;if(count===1){pile[0].cx=pile[0].baseCx;pile[0].cy=pile[0].baseCy;pile[0].radius=12;return;}const columns=Math.ceil(Math.sqrt(count));const rows=Math.ceil(count/columns);const radius=count<=4?8.5:Math.max(4,Math.min(7,28/columns/2));const spacing=radius*2.05;pile.forEach((token,index)=>{const col=index%columns;const row=Math.floor(index/columns);token.cx=token.baseCx+(col-(columns-1)/2)*spacing;token.cy=token.baseCy+(row-(rows-1)/2)*spacing;token.radius=radius;});});
  coords.forEach(token=>{
    const current=state.players[state.turn];
    const canMove=Boolean(state.dice&&current&&current.id===token.playerId&&(ludoLocal||token.playerId===playerId)&&(ludoLocal?window.LudoRules.legalMoves(state,current.id,state.dice):ludoCurrentLegalMoves).includes(token.tokenIndex));
    const previous=previousTokens.get(`${token.playerId}:${token.tokenIndex}`);
    let animation="";
    if(previous&&token.progress>=0&&token.progress>previous.progress){
      const positions=[[previous.cx,previous.cy]];
      const firstProgress=previous.progress<0?0:previous.progress+1;
      for(let progress=firstProgress;progress<=token.progress;progress++){
        const point=window.LudoRules.tokenPosition(token.color,progress);
        positions.push([point.col*cell+20,point.row*cell+20]);
      }
      const last=positions[positions.length-1];
      if(last[0]!==token.cx||last[1]!==token.cy)positions.push([token.cx,token.cy]);
      const deltas=positions.map(([x,y])=>`${x-token.cx} ${y-token.cy}`);
      if(deltas[deltas.length-1]!=="0 0")deltas.push("0 0");
      const keyTimes=deltas.map((_,index)=>index/(deltas.length-1)).join(";");
      const duration=Math.min(1.6,Math.max(.18,(deltas.length-1)*.12));
      animation=`<animateTransform attributeName="transform" attributeType="XML" type="translate" values="${deltas.join(";")}" keyTimes="${keyTimes}" dur="${duration}s" fill="freeze"/>`;
    }
    svg+=`<g class="ludo-token ${canMove?"movable":""}" data-token-index="${token.tokenIndex}" data-token-player="${ESC(token.playerId)}" data-cx="${token.cx}" data-cy="${token.cy}" data-progress="${token.progress}" tabindex="${canMove?0:-1}" role="${canMove?"button":"img"}" aria-label="${ESC(token.color)} token ${token.tokenIndex+1}${canMove?", move token":""}">${animation}<circle cx="${token.cx}" cy="${token.cy+2}" r="${token.radius}" fill="#000" opacity=".18"/><circle cx="${token.cx}" cy="${token.cy}" r="${token.radius}" fill="${COLORS[token.color]}" stroke="#fffdf7" stroke-width="${token.radius<7?1:2.5}"/><text x="${token.cx}" y="${token.cy+Math.max(2.5,token.radius*.34)}" text-anchor="middle" font-size="${Math.max(5,token.radius*.82)}" font-weight="800" fill="#fff">${token.tokenIndex+1}</text>${canMove?`<circle cx="${token.cx}" cy="${token.cy}" r="${token.radius+5}" fill="none" stroke="#9c702d" stroke-width="2.5" stroke-dasharray="3 3"/>`:""}</g>`;
  });
  svg+='</svg>';wrap.innerHTML=svg;wrap.querySelectorAll("[data-token-index]").forEach(token=>{const move=()=>onLudoTokenClick(token.dataset.tokenPlayer,Number(token.dataset.tokenIndex));token.addEventListener("click",move);token.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();move();}});});
  const active=state.players[state.turn];const activeRoomPlayer=players.find(p=>p.id===active?.id);$("ludoTurnInfo").textContent=state.status==="finished"?`Game over. Winner: ${state.winners?.[0]||"—"}.`:active?`${activeRoomPlayer?.name||active.color} (${active.color}) to move${state.dice?` · dice ${state.dice}`:" · roll the die"}.`:"Waiting for players.";
  $("ludoRoll").classList.toggle("hidden",state.status!=="playing"||(!ludoLocal&&active?.id!==playerId)||Boolean(state.dice));$("ludoTokenOptions").innerHTML=state.dice?`<span class="game-stat">Dice: <strong>${state.dice}</strong> · Tap a highlighted pawn.</span>`:"";
  $("ludoLobbyPlayers").innerHTML=players.map(p=>`<span class="player-chip">${ESC(p.name)} · <span style="color:${COLORS[p.color]}">${p.color}</span></span>`).join("");
}
function showLudoMoment(emoji, title, message) { const old=$("ludoMoment"); old?.remove(); const node=document.createElement("div"); node.id="ludoMoment"; node.className="ludo-moment"; node.innerHTML=`<div class="ludo-moment-card"><span>${emoji}</span><h2>${title}</h2><p>${message}</p><button type="button" class="btn btn-primary" id="closeLudoMoment">Continue</button></div>`;document.body.append(node);$("closeLudoMoment").addEventListener("click",()=>node.remove()); }
function yardSlots(color) {
  const slots = {
    red: [[75,75],[165,75],[75,165],[165,165]],
    green: [[435,75],[525,75],[435,165],[525,165]],
    yellow: [[435,435],[525,435],[435,525],[525,525]],
    blue: [[75,435],[165,435],[75,525],[165,525]]
  };
  return slots[color];
}
function onLudoTokenClick(tokenPlayer,tokenIndex){const state=ludoLocal?ludoLocalGame:ludoState?.state;if(!state||!state.dice)return;const active=state.players[state.turn];if(!active||active.id!==tokenPlayer)return;const moves=ludoLocal?window.LudoRules.legalMoves(state,active.id,state.dice):ludoCurrentLegalMoves;if(!moves.includes(tokenIndex))return;if(ludoLocal){try{const result=window.LudoRules.moveToken(state,active.id,tokenIndex);setStatus("ludoNotice",result.captured.length?"😢 Token captured! Back to the yard.":result.reachedHome?"🏆 HOME! Victory is getting closer.":result.extraTurn?"✨ Extra turn!":"Token moved.");if(result.captured.length)showLudoMoment("😢", "Token captured!", "Your opponent sent a pawn back to the yard.");if(ludoLocalGame.status==="finished")showLudoMoment("🏆", "VICTORY!", "You conquered the Ludo board.");renderLudo();}catch(e){toast(e.message,true);}return;}emitAck("ludo:move",{code:ludoRoomCode,tokenIndex},r=>{if(!r.ok)toast(r.message,true);});}

