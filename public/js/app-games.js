function renderGamePage() {
  const game = GAME_MAP[currentGame] || GAME_MAP.math; const content = $("gamePageContent"); if (!content) return;
  if (game.multiplayerOnly && selectedMode !== "multiplayer") {
    selectedMode = "multiplayer";
    $$(".mode-tab").forEach((tab) => { const active = tab.dataset.mode === "multiplayer"; tab.classList.toggle("active", active); tab.setAttribute("aria-selected", String(active)); });
    $("soloDifficulty")?.classList.add("hidden"); $("multiDifficulty")?.classList.remove("hidden");
  }
  $("gamePageEyebrow").textContent = selectedMode === "solo" ? "SOLO SESSION" : "MULTIPLAYER LOBBY";
  clearSoloTimers();
  if (game.id === "ludo") { renderLudoLanding(content); return; }
  if (selectedMode === "multiplayer") { renderMultiplayerGameLanding(content, game); return; }
  renderSoloGame(content, game.id);
}
$("backToGames")?.addEventListener("click", () => { clearSoloTimers(); navigate("#/"); });
function clearSoloTimers() { if (soloTimer) clearInterval(soloTimer); if (soloInterval) clearInterval(soloInterval); soloTimer = null; soloInterval = null; soloTimeouts.forEach(clearTimeout); soloTimeouts.clear(); }
function later(fn, ms) { const id = setTimeout(() => { soloTimeouts.delete(id); fn(); }, ms); soloTimeouts.add(id); return id; }
function renderSoloGame(content, game) {
  clearSoloTimers(); soloState = { game, score: 0, finished: false, difficulty: soloDifficulty };
  const meta = GAME_MAP[game];
  content.innerHTML = `<div class="game-content-header"><div><span class="eyebrow">SOLO · ${ESC(soloDifficulty.toUpperCase())} MODE</span><h1>${ESC(meta.name)}</h1><p>${ESC(meta.description)}</p></div><span class="difficulty-chip">${ESC(soloDifficulty)}</span></div><div id="soloStage" class="game-stage"></div>`;
  const stage = $("soloStage");
  if (game === "math") startMath(stage);
  else if (game === "memory") startMemoryMatrix(stage);
  else if (game === "simon") startSequence(stage, game);
  else if (game === "pattern") startPatternPulse(stage);
  else if (game === "reaction") startReaction(stage);
  else if (game === "puzzle") startPuzzle(stage);
  else if (game === "word") startWord(stage);
  else if (game === "color") startColor(stage);
  else if (game === "typing") startTyping(stage);
  else if (game === "gk") startGkQuiz(stage);
  else if (game === "higher") startHigher(stage);
  else if (game === "odd") startOdd(stage);
  else if (game === "chaos") startFakeOutFrenzy(stage);
}
function gameStage(stage, inner) { stage.innerHTML = inner; }
function difficultyFactor() { return { easy: 1, medium: 1.5, hard: 2.1, hacker: 3 }[soloDifficulty] || 1; }
function timedStart(stage, game, description, seconds = 30) {
  soloState.timeLeft = seconds; soloState.finished = false;
  gameStage(stage, `<p>${ESC(description)}</p><div class="game-stats"><span class="game-stat">TIME <strong id="soloTime">${seconds}s</strong></span><span class="game-stat">SCORE <strong id="soloScore">0</strong></span></div><div id="soloQuestion" class="game-prompt"></div><div id="soloControls"></div><p id="soloFeedback" class="game-feedback" aria-live="polite"></p>`);
  soloTimer = setInterval(() => { if (soloState.finished) return; soloState.timeLeft -= 1; if ($("soloTime")) $("soloTime").textContent = `${soloState.timeLeft}s`; if (soloState.timeLeft <= 0) finishTimedGame(game); }, 1000);
}
function finishTimedGame(game) { if (soloState.finished) return; soloState.finished = true; clearSoloTimers(); const stage = $("soloStage"); if (!stage) return; const score = soloState.score || 0; stage.insertAdjacentHTML("beforeend", `<div class="game-result"><h2>Session complete</h2><p>You scored <strong>${score}</strong>. Ready for another run?</p><button class="btn btn-primary" id="restartSolo">Play again</button></div>`); $("restartSolo")?.addEventListener("click", () => renderSoloGame($("gamePageContent"), game)); recordGame(score, game); }
function questionDelay(_game, next) {
  const controls = $("soloControls");
  if (controls) $$("button,input", controls).forEach((el) => { el.disabled = true; });
  later(() => { if (!soloState.finished) next(); }, 800);
}
function startMath(stage) {
  timedStart(stage, "math", "Solve as many equations as you can. Wrong answers reveal the solution, then move on.");
  const next = () => { if ($("soloFeedback")) $("soloFeedback").textContent = ""; const factor = difficultyFactor(); const max = Math.round(10 * factor + 10); let a = Math.floor(Math.random() * max) + 1; let b = Math.floor(Math.random() * max) + 1; const ops = soloDifficulty === "easy" ? ["+", "−"] : ["+", "−", "×"]; const op = ops[Math.floor(Math.random() * ops.length)]; if (op === "−" && b > a) [a,b] = [b,a]; soloState.answer = op === "+" ? a+b : op === "−" ? a-b : a*b; $("soloQuestion").textContent = `${a} ${op} ${b} = ?`; $("soloControls").innerHTML = `<form id="answerForm" class="game-answer-form"><input id="answerInput" type="number" required autocomplete="off" placeholder="Your answer"><button class="btn btn-primary" type="submit">Submit</button></form>`; $("answerInput").focus(); $("answerForm").addEventListener("submit", (e) => { e.preventDefault(); if (soloState.finished) return; const value = Number($("answerInput").value); if (value === soloState.answer) { soloState.score++; $("soloScore").textContent = soloState.score; $("soloFeedback").textContent = "Correct. Keep going."; next(); } else { $("soloFeedback").textContent = `Incorrect — the answer was ${soloState.answer}.`; questionDelay("math", next); } }); }; next();
}

function startMemoryMatrix(stage) {
  let level = 1, lit = [], phase = "ready", score = 0;
  const sizeFor = n => n < 4 ? 3 : n < 7 ? 4 : 5;
  const draw = (message = "Memorize the glowing tiles.") => {
    const size = sizeFor(level), total = size * size;
    gameStage(stage, `<p>${ESC(message)} When the tiles fade, tap the same positions.</p><div class="game-stats"><span class="game-stat">LEVEL <strong id="matrixLevel">${level}</strong></span><span class="game-stat">SCORE <strong id="matrixScore">${score}</strong></span><span class="game-stat">GRID <strong>${size} × ${size}</strong></span></div><div class="matrix-grid" style="--matrix-size:${size}" role="group" aria-label="Memory Matrix grid">${Array.from({length:total},(_,i)=>`<button class="matrix-cell" type="button" data-cell="${i}" aria-label="Tile ${i+1}" disabled></button>`).join("")}</div><p id="matrixFeedback" class="game-feedback" aria-live="polite">Get ready…</p><button id="matrixStart" class="btn btn-primary" type="button">${phase === "ready" ? "Start level" : "Show pattern"}</button>`);
    const cells = $$("[data-cell]", stage);
    const start = () => {
      phase = "watch"; const count = Math.min(size + level - 1, Math.floor(total * .55));
      lit = []; while (lit.length < count) { const n = Math.floor(Math.random() * total); if (!lit.includes(n)) lit.push(n); }
      cells.forEach(c => { c.disabled = true; c.classList.toggle("lit", lit.includes(Number(c.dataset.cell))); });
      $("matrixFeedback").textContent = "Remember these positions…"; $("matrixStart").disabled = true;
      later(() => { if (!stage.isConnected) return; phase = "answer"; cells.forEach(c => { c.classList.remove("lit"); c.disabled = false; }); $("matrixFeedback").textContent = "Now tap the positions you remember."; }, Math.max(700, 1500 - level * 80));
    };
    $("matrixStart").addEventListener("click", () => { if (phase === "done") { level = 1; score = 0; phase = "ready"; draw(); } else start(); });
    cells.forEach(cell => cell.addEventListener("click", () => {
      if (phase !== "answer" || cell.disabled) return;
      const idx = Number(cell.dataset.cell); cell.disabled = true;
      if (lit.includes(idx)) { cell.classList.add("lit","matrix-correct"); score++; $("matrixScore").textContent = String(score); if (lit.every(n => cells[n].disabled)) { phase = "done"; level++; $("matrixFeedback").textContent = "Perfect recall! Next level loading…"; recordGame(score,"memory"); later(() => { if (stage.isConnected) { phase = "ready"; draw("Level cleared. Memorize a bigger grid."); } },650); } }
      else { cell.classList.add("matrix-wrong"); phase = "done"; $("matrixFeedback").textContent = `Missed it. You reached level ${level}.`; recordGame(score,"memory"); $("matrixStart").textContent = "Try again"; $("matrixStart").disabled = false; }
    }));
  };
  draw();
}

function startPatternPulse(stage) {
  const puzzles = [
    { seq: [2,4,6,8], answer: 10, rule: "Add 2 each time" }, { seq: [3,6,12,24], answer: 48, rule: "Double each number" },
    { seq: [1,4,9,16], answer: 25, rule: "Square numbers" }, { seq: [5,10,20,40], answer: 80, rule: "Double each number" },
    { seq: [2,5,9,14], answer: 20, rule: "Add 3, then 4, then 5…" }, { seq: [30,27,24,21], answer: 18, rule: "Subtract 3 each time" },
    { seq: [1,1,2,3,5], answer: 8, rule: "Add the previous two numbers" }, { seq: [7,14,21,28], answer: 35, rule: "Multiples of 7" },
    { seq: [1,3,6,10], answer: 15, rule: "Add 2, then 3, then 4…" }, { seq: [81,27,9,3], answer: 1, rule: "Divide by 3" }
  ];
  let score = 0, round = 0, current = null, locked = false, used = new Set();
  const next = () => {
    locked = false;
    if (used.size === puzzles.length) used.clear();
    const choices = puzzles.map((_,i)=>i).filter(i=>!used.has(i)); const index = choices[Math.floor(Math.random()*choices.length)]; used.add(index); current = puzzles[index]; round++;
    const options = new Set([current.answer, current.answer + 2, current.answer - 1, current.answer * 2]);
    while (options.size < 4) options.add(current.answer + Math.floor(Math.random()*13)-6);
    const answers = [...options].sort(()=>Math.random()-.5);
    gameStage(stage, `<p>Find the next number. Every round uses a different rule.</p><div class="game-stats"><span class="game-stat">ROUND <strong>${round}</strong></span><span class="game-stat">SCORE <strong>${score}</strong></span></div><div class="pattern-sequence">${current.seq.map(n=>`<span>${n}</span>`).join('<i>→</i>')}<i>→</i><strong>?</strong></div><div class="choice-grid pattern-choices">${answers.map(n=>`<button class="btn btn-quiet" type="button" data-pattern-answer="${n}">${n}</button>`).join("")}</div><p id="patternFeedback" class="game-feedback" aria-live="polite">Spot the rule.</p><button id="patternNext" class="btn btn-quiet" type="button">Skip puzzle</button>`);
    $$('[data-pattern-answer]',stage).forEach(btn=>btn.addEventListener('click',()=>{if(locked)return;locked=true;const correct=Number(btn.dataset.patternAnswer)===current.answer;if(correct){score++;btn.classList.add('pattern-correct');$('patternFeedback').textContent=`Correct — ${current.rule}.`;}else{$('patternFeedback').textContent=`Not quite. ${current.answer} — ${current.rule}.`;}$$('[data-pattern-answer]',stage).forEach(b=>b.disabled=true);$('patternNext').textContent='Next pattern';}));
    $('patternNext').addEventListener('click',next);
  };
  next();
}

function startSequence(stage, game) {
  soloState.sequence = []; soloState.inputIndex = 0; soloState.accepting = false; soloState.level = 0; const symbols = game === "simon" ? ["🔴","🔵","🟢","🟡"] : game === "pattern" ? ["◆","●","▲","■"] : ["✦","●","◆","▲"];
  gameStage(stage, `<p>Watch the sequence, then repeat it. One wrong input ends the run.</p><div class="game-stats"><span class="game-stat">LEVEL <strong id="sequenceLevel">0</strong></span><span class="game-stat">BEST <strong id="sequenceBest">${localStorage.getItem(`brainArenaBest_${game}`)||0}</strong></span></div><div id="sequenceTiles" class="memory-grid">${symbols.map((s,i)=>`<button type="button" class="memory-tile" data-index="${i}" aria-label="Sequence tile ${i+1}">${s}</button>`).join("")}</div><p id="sequenceFeedback" class="game-feedback" aria-live="polite">Start when you're ready.</p><button id="sequenceStart" class="btn btn-primary" type="button">Start sequence</button>`);
  const tiles = $$(".memory-tile", stage);
  const flash = (index) => { const tile = tiles[index]; tile?.classList.add("active"); later(() => tile?.classList.remove("active"), 260); };
  const play = () => { soloState.accepting = false; soloState.inputIndex = 0; $("sequenceFeedback").textContent = "Watch closely…"; const delay = Math.max(330, 680 - difficultyFactor() * 80); soloState.sequence.forEach((n,i)=>later(()=>flash(n), 350+i*delay)); later(()=>{ if (!soloState.finished) { soloState.accepting = true; $("sequenceFeedback").textContent = "Your turn. Repeat the sequence."; } },350+soloState.sequence.length*delay); };
  const nextLevel = () => { soloState.level++; soloState.sequence.push(Math.floor(Math.random()*symbols.length)); $("sequenceLevel").textContent=soloState.level; play(); };
  $("sequenceStart").addEventListener("click",()=>{soloState.finished=false;soloState.sequence=[];soloState.level=0;$("sequenceLevel").textContent="0";nextLevel();});
  tiles.forEach((tile)=>tile.addEventListener("click",()=>{if(!soloState.accepting||soloState.finished)return;const idx=Number(tile.dataset.index);flash(idx);if(idx!==soloState.sequence[soloState.inputIndex]){soloState.finished=true;soloState.accepting=false;const score=Math.max(0,soloState.level-1);$("sequenceFeedback").textContent=`Run over. You reached level ${score}.`;$("sequenceStart").textContent="Restart sequence";localStorage.setItem(`brainArenaBest_${game}`,String(Math.max(score,Number(localStorage.getItem(`brainArenaBest_${game}`)||0))));recordGame(score,game);return;}soloState.inputIndex++;if(soloState.inputIndex===soloState.sequence.length){soloState.accepting=false;$("sequenceFeedback").textContent="Perfect. Next level…";later(nextLevel,600);}}));
}
function startReaction(stage) {
  soloState.phase="idle"; soloState.finished=false; gameStage(stage, `<p>Wait for the green signal. Clicking early resets the attempt.</p><div class="game-stats"><span class="game-stat">BEST <strong id="reactionBest">${localStorage.getItem("brainArenaReactionBest")||"—"} ms</strong></span></div><button id="reactionPad" class="reaction-pad" type="button">Start reaction test</button><p id="reactionFeedback" class="game-feedback" aria-live="polite"></p><button id="reactionAgain" class="btn btn-quiet" type="button">Try again</button>`);
  const pad=$("reactionPad"); const reset=()=>{if(soloState.timeout)clearTimeout(soloState.timeout);soloState.phase="idle";pad.className="reaction-pad";pad.disabled=false;pad.textContent="Start reaction test";};
  pad.addEventListener("click",()=>{if(soloState.phase==="idle"){soloState.phase="waiting";pad.classList.add("waiting");pad.textContent="Wait for green…";soloState.timeout=later(()=>{if(soloState.phase!=="waiting")return;soloState.phase="go";soloState.startedAt=performance.now();pad.className="reaction-pad go";pad.textContent="CLICK NOW";},900+Math.random()*2600);return;}if(soloState.phase==="waiting"){clearTimeout(soloState.timeout);soloState.phase="idle";pad.className="reaction-pad";pad.textContent="Too early — try again";$("reactionFeedback").textContent="Wait for the green signal.";return;}if(soloState.phase==="go"){const ms=Math.round(performance.now()-soloState.startedAt);soloState.phase="done";pad.disabled=true;pad.textContent=`${ms} ms`;$("reactionFeedback").textContent=`Your reaction time: ${ms} ms`;const best=Number(localStorage.getItem("brainArenaReactionBest")||0);if(!best||ms<best)localStorage.setItem("brainArenaReactionBest",String(ms));recordGame(Math.max(0,1000-ms),"reaction");}});
  $("reactionAgain").addEventListener("click",reset);
}
const PUZZLES=[{q:"2, 4, 6, 8, ?",a:10,h:"Add 2 each time."},{q:"3, 6, 12, 24, ?",a:48,h:"Multiply by 2."},{q:"1, 1, 2, 3, 5, ?",a:8,h:"Add the previous two numbers."},{q:"5, 10, 15, 20, ?",a:25,h:"Count in equal steps."},{q:"1, 4, 9, 16, ?",a:25,h:"Square numbers."},{q:"100, 90, 80, 70, ?",a:60,h:"Subtract 10."}];
function startPuzzle(stage) { const next=()=>{soloState.puzzle=PUZZLES[Math.floor(Math.random()*PUZZLES.length)];soloState.finished=false;gameStage(stage,`<p>Find the missing number. A wrong answer locks this question and reveals the solution.</p><div class="game-prompt">${soloState.puzzle.q}</div><form id="puzzleForm" class="game-answer-form"><input id="puzzleInput" type="number" required placeholder="Your answer"><button class="btn btn-primary" type="submit">Check answer</button></form><p id="puzzleFeedback" class="game-feedback" aria-live="polite"></p><button id="puzzleNext" class="btn btn-quiet" type="button">Next puzzle</button>`);$("puzzleForm").addEventListener("submit",e=>{e.preventDefault();if(soloState.finished)return;soloState.finished=true;const value=Number($("puzzleInput").value);if(value===soloState.puzzle.a){$("puzzleFeedback").textContent="Correct. Great work.";recordGame(1,"puzzle");}else{$("puzzleFeedback").textContent=`Incorrect — answer: ${soloState.puzzle.a}. ${soloState.puzzle.h}`;recordGame(0,"puzzle");later(next,800);}$("puzzleInput").disabled=true;$("puzzleForm").querySelector("button").disabled=true;});$("puzzleNext").addEventListener("click",next);};next(); }
const WORDS=["ORBIT","PLANET","NEBULA","GALAXY","COMET","QUANTUM","COSMOS","ECLIPSE","FOCUS","REASON"];
function shuffleWord(word){let chars=word.split("");for(let i=chars.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[chars[i],chars[j]]=[chars[j],chars[i]];}if(chars.join("")===word)chars.reverse();return chars.join(" ");}
function startWord(stage){timedStart(stage,"word","Unscramble each word. Wrong answers reveal the word and advance after a short pause.");const next=()=>{if($("soloFeedback"))$("soloFeedback").textContent="";const word=WORDS[Math.floor(Math.random()*WORDS.length)];soloState.answer=word;$("soloQuestion").textContent=shuffleWord(word);$("soloControls").innerHTML=`<form id="wordForm" class="game-answer-form"><input id="wordInput" required autocomplete="off" placeholder="Unscrambled word"><button class="btn btn-primary">Submit</button></form>`;$("wordForm").addEventListener("submit",e=>{e.preventDefault();if(soloState.finished)return;if($("wordInput").value.trim().toUpperCase()===word){soloState.score++;$("soloScore").textContent=soloState.score;$("soloFeedback").textContent="Correct!";next();}else{$("soloFeedback").textContent=`The word was ${word}.`;questionDelay("word",next);}});};next();}
function startColor(stage){timedStart(stage,"color","Choose the color named by the word, not its ink color.");const colors=[{name:"RED",ink:"#4d91ee"},{name:"BLUE",ink:"#e95b67"},{name:"GREEN",ink:"#d6a33f"},{name:"GOLD",ink:"#4eb28c"},{name:"VIOLET",ink:"#ed8e53"}];const next=()=>{if($("soloFeedback"))$("soloFeedback").textContent="";const target=colors[Math.floor(Math.random()*colors.length)];const choices=[target,...colors.filter(c=>c.name!==target.name).sort(()=>Math.random()-.5).slice(0,3)].sort(()=>Math.random()-.5);soloState.answer=target.name;$("soloQuestion").innerHTML=`<span style="color:${target.ink}">${target.name}</span>`;$("soloControls").innerHTML=`<div class="choice-grid">${choices.map(c=>`<button class="btn btn-quiet" data-choice="${c.name}" type="button">${c.name}</button>`).join("")}</div>`;$$('[data-choice]',$("soloControls")).forEach(b=>b.addEventListener("click",()=>{if(soloState.finished)return;if(b.dataset.choice===soloState.answer){soloState.score++;$("soloScore").textContent=soloState.score;$("soloFeedback").textContent="Good read.";next();}else{$("soloFeedback").textContent=`Wrong — the word was ${soloState.answer}.`;questionDelay("color",next);}}));};next();}

function startFakeOutFrenzy(stage) {
  timedStart(stage, "chaos", "Follow the current rule. The prompt changes often, so don't trust muscle memory.", 30);
  const shapes = ["●", "▲", "■", "◆", "✦", "⬟"];
  const colors = [
    { name: "CYAN", value: "#6ee7f9" }, { name: "PINK", value: "#ff6ba8" },
    { name: "GOLD", value: "#f5cc72" }, { name: "VIOLET", value: "#b7a1ff" },
    { name: "MINT", value: "#7be0bd" }
  ];
  let lastRule = "";
  const next = () => {
    if (soloState.finished) return;
    const rulePool = ["tap the {color} shape", "tap everything except {shape}", "tap the {shape} shape", "avoid the {color} shape"];
    let rule = rulePool[Math.floor(Math.random() * rulePool.length)];
    if (rule === lastRule) rule = rulePool[(rulePool.indexOf(rule) + 1) % rulePool.length];
    lastRule = rule;
    const targetColor = colors[Math.floor(Math.random() * colors.length)];
    const targetShape = shapes[Math.floor(Math.random() * shapes.length)];
    const prompt = rule.replace("{color}", targetColor.name.toLowerCase()).replaceAll("{shape}", targetShape);
    soloState.answerRule = rule;
    const items = Array.from({ length: 6 }, (_, i) => ({
      shape: shapes[Math.floor(Math.random() * shapes.length)],
      color: colors[Math.floor(Math.random() * colors.length)],
      id: i
    }));
    const correctIndex = Math.floor(Math.random() * items.length);
    if (rule.startsWith("tap the {color}")) items[correctIndex] = { shape: shapes[Math.floor(Math.random() * shapes.length)], color: targetColor, id: correctIndex };
    else if (rule.startsWith("tap everything except")) items[correctIndex] = { shape: shapes.filter(x => x !== targetShape)[Math.floor(Math.random() * (shapes.length - 1))], color: colors[Math.floor(Math.random() * colors.length)], id: correctIndex };
    else if (rule.startsWith("tap the {shape}")) items[correctIndex] = { shape: targetShape, color: colors[Math.floor(Math.random() * colors.length)], id: correctIndex };
    else items[correctIndex] = { shape: shapes[Math.floor(Math.random() * shapes.length)], color: colors.filter(x => x.name !== targetColor.name)[Math.floor(Math.random() * (colors.length - 1))], id: correctIndex };
    // Guarantee at least one valid target and mark correctness using the same rule shown to the player.
    const isCorrect = item => rule.startsWith("tap the {color}") ? item.color.name === targetColor.name : rule.startsWith("tap everything except") ? item.shape !== targetShape : rule.startsWith("tap the {shape}") ? item.shape === targetShape : item.color.name !== targetColor.name;
    if (!items.some(isCorrect)) items[correctIndex] = { ...items[correctIndex], ...(rule.startsWith("tap the {color}") ? { color: targetColor } : rule.startsWith("tap everything except") ? { shape: shapes.find(x => x !== targetShape) } : rule.startsWith("tap the {shape}") ? { shape: targetShape } : { color: colors.find(x => x.name !== targetColor.name) }) };
    soloState.chaosCorrect = items.filter(isCorrect).map(x => x.id);
    $("soloQuestion").innerHTML = `<span class="chaos-rule-label">NEW RULE</span><span class="chaos-rule-text">${ESC(prompt)}</span>`;
    $("soloControls").innerHTML = `<div class="chaos-grid">${items.map(item => `<button type="button" class="chaos-target" data-target="${item.id}" aria-label="${item.color.name} ${item.shape}" style="--target-color:${item.color.value}">${item.shape}</button>`).join("")}</div>`;
    $$('[data-target]', $("soloControls")).forEach(button => button.addEventListener("click", () => {
      if (soloState.finished) return;
      const correct = soloState.chaosCorrect.includes(Number(button.dataset.target));
      if (correct) { soloState.score++; $("soloScore").textContent = String(soloState.score); $("soloFeedback").textContent = "Good read. Stay sharp."; }
      else { $("soloFeedback").textContent = "Fake-out! Watch the rule, not the shape."; }
      $$('[data-target]', $("soloControls")).forEach(el => { el.disabled = true; if (soloState.chaosCorrect.includes(Number(el.dataset.target))) el.classList.add("is-correct"); });
      later(next, 420);
    }));
  };
  next();
}

function startTyping(stage) {
  soloState.timeLeft = 30;
  soloState.score = 0;
  soloState.finished = false;

  let mode = localStorage.getItem("brainArenaTypingMode") || "words";
  if (!['words', 'punctuation', 'numbers'].includes(mode)) mode = 'words';
  let duration = Number(localStorage.getItem('brainArenaTypingDuration') || 30);
  if (![15, 30, 60, 120].includes(duration)) duration = 30;
  soloState.timeLeft = duration;
  let target = '';
  let typed = '';
  let startedAt = 0;
  let correctChars = 0;
  let totalChars = 0;
  let mistakes = 0;
  let lastTarget = '';
  let timerStarted = false;

  const makeTarget = () => window.TypingText.generate(mode, 70, lastTarget);
  const escapeChar = ch => ch === ' ' ? '&nbsp;' : ch === '\n' ? '↵<br>' : ESC(ch);
  const renderTarget = () => {
    const visible = target.slice(0, Math.max(typed.length + 180, 420));
    $('typingPassage').innerHTML = [...visible].map((ch, i) => {
      let state = '';
      if (i < typed.length) state = typed[i] === ch ? 'correct' : 'incorrect';
      else if (i === typed.length) state = 'current';
      return `<span class="typing-char ${state}">${escapeChar(ch)}</span>`;
    }).join('');
    $('typingPassage').setAttribute('aria-label', 'Typing test text. Click here and type the displayed words.');
    $('typingPassage').querySelector('.current')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  const updateStats = () => {
    const elapsedMinutes = startedAt ? Math.max((Date.now() - startedAt) / 60000, 1 / 60) : 1;
    const wpm = startedAt ? Math.round((correctChars / 5) / elapsedMinutes) : 0;
    const accuracy = totalChars ? Math.round(correctChars / totalChars * 100) : 100;
    $('typingWpm').textContent = String(wpm);
    $('typingAccuracy').textContent = `${accuracy}%`;
    $('typingErrors').textContent = String(mistakes);
    soloState.score = Math.max(0, Math.round(wpm * accuracy / 100));
    $('typingProgress').style.width = `${Math.min(100, typed.length / target.length * 100)}%`;
  };

  gameStage(stage, `
    <div class="typing-game-shell monkeytype-shell">
      <div class="typing-topline"><span class="eyebrow">BRAIN ARENA / TYPE TEST</span><span class="typing-live-pill"><i></i> READY TO FOCUS</span></div>
      <div class="typing-settings" aria-label="Typing test settings">
        <div class="typing-setting-group"><span class="typing-setting-label">TIME</span><div class="typing-segments" id="typingDurations"><button type="button" data-duration="15">15</button><button type="button" data-duration="30">30</button><button type="button" data-duration="60">60</button><button type="button" data-duration="120">120</button></div></div>
        <div class="typing-setting-group"><span class="typing-setting-label">MODE</span><div class="typing-segments" id="typingModes"><button type="button" data-mode="words">words</button><button type="button" data-mode="punctuation">punctuation</button><button type="button" data-mode="numbers">numbers</button></div></div>
      </div>
      <div class="typing-metrics monkeytype-metrics"><div><small>TIME</small><strong id="typingTime">${duration}</strong></div><div><small>WPM</small><strong id="typingWpm">0</strong></div><div><small>ACCURACY</small><strong id="typingAccuracy">100%</strong></div><div><small>ERRORS</small><strong id="typingErrors">0</strong></div></div>
      <div class="typing-progress-track"><span id="typingProgress"></span></div>
      <button id="typingPassage" class="typing-passage monkeytype-passage" type="button" aria-label="Click to focus the typing test"></button>
      <textarea id="typingInput" class="typing-capture" rows="1" maxlength="5000" placeholder="Click the words and start typing…" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Typing input"></textarea>
      <div class="typing-footer"><p id="typingFeedback" class="game-feedback" aria-live="polite">Click the text or press any key to begin. Backspace works normally.</p><button id="typingRestart" class="btn btn-quiet" type="button" aria-label="Restart typing test">↻ Restart</button></div>
      <div id="typingResult" class="typing-result hidden" aria-live="polite"></div>
    </div>`);

  const input = $('typingInput');
  const modeButtons = [...document.querySelectorAll('#typingModes [data-mode]')];
  const durationButtons = [...document.querySelectorAll('#typingDurations [data-duration]')];
  const setSelected = () => {
    modeButtons.forEach(b => b.classList.toggle('selected', b.dataset.mode === mode));
    durationButtons.forEach(b => b.classList.toggle('selected', Number(b.dataset.duration) === duration));
  };
  const reset = (keepSettings = true) => {
    clearSoloTimers();
    modeButtons.concat(durationButtons).forEach(button => button.disabled = false);
    soloState.timeLeft = duration;
    soloState.score = 0;
    soloState.finished = false;
    target = makeTarget(); lastTarget = target; typed = ''; startedAt = 0;
    correctChars = 0; totalChars = 0; mistakes = 0; timerStarted = false;
    $('typingTime').textContent = String(duration);
    $('typingResult').classList.add('hidden');
    $('typingFeedback').textContent = 'Click the text or press any key to begin. Backspace works normally.';
    $('typingPassageCount')?.remove();
    input.value = ''; input.disabled = false;
    setSelected(); renderTarget(); updateStats();
  };
  modeButtons.forEach(button => button.addEventListener('click', () => {
    mode = button.dataset.mode; localStorage.setItem('brainArenaTypingMode', mode); reset();
  }));
  durationButtons.forEach(button => button.addEventListener('click', () => {
    duration = Number(button.dataset.duration); localStorage.setItem('brainArenaTypingDuration', String(duration)); reset();
  }));
  $('typingRestart').addEventListener('click', () => reset());
  $('typingPassage').addEventListener('click', () => input.focus());
  input.addEventListener('keydown', event => {
    if (['Tab', 'Escape'].includes(event.key)) event.preventDefault();
    if (!timerStarted && event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      timerStarted = true; startedAt = Date.now();
      $('typingLivePill')?.classList.add('is-running');
      const pill = document.querySelector('.typing-live-pill'); if (pill) pill.innerHTML = '<i></i> TEST IN PROGRESS';
      soloTimer = setInterval(() => {
        if (soloState.finished) return;
        soloState.timeLeft = Math.max(0, soloState.timeLeft - 1);
        $('typingTime').textContent = String(soloState.timeLeft);
        updateStats();
        if (soloState.timeLeft <= 0) finish();
      }, 1000);
    }
  });
  input.addEventListener('input', () => {
    if (soloState.finished) return;
    const value = input.value;
    typed = value;
    correctChars = 0; totalChars = value.length; mistakes = 0;
    for (let i = 0; i < value.length; i++) {
      if (value[i] === target[i]) correctChars++;
      else mistakes++;
    }
    renderTarget(); updateStats();
    if (typed.length >= target.length) {
      $('typingFeedback').textContent = 'Text complete. Keep going for another fresh set of words.';
      lastTarget = target; target = makeTarget(); lastTarget = target; input.value = ''; typed = '';
      totalChars = 0; correctChars = 0; mistakes = 0; renderTarget(); updateStats();
    } else if (mistakes) $('typingFeedback').textContent = 'Red characters are incorrect. Use Backspace to correct them, or keep moving.';
    else $('typingFeedback').textContent = 'Clean typing. Keep your rhythm.';
  });
  function finish() {
    if (soloState.finished) return;
    soloState.finished = true; clearSoloTimers(); input.disabled = true;
    modeButtons.concat(durationButtons).forEach(button => button.disabled = true);
    const wpm = Number($('typingWpm').textContent);
    const accuracy = $('typingAccuracy').textContent;
    const result = $('typingResult');
    result.classList.remove('hidden');
    result.innerHTML = `<span class="eyebrow">TEST COMPLETE</span><strong>${wpm} <small>WPM</small></strong><p>${accuracy} accuracy · ${mistakes} errors · ${duration}s test</p><button id="typingAgain" class="btn btn-primary" type="button">Try again ↻</button>`;
    $('typingFeedback').textContent = 'Session complete. Ready for another run?';
    recordGame(soloState.score, 'typing');
    $('typingAgain').addEventListener('click', () => { modeButtons.concat(durationButtons).forEach(button => button.disabled = false); reset(); input.focus(); });
  }
  // Clicking anywhere on the test focuses the hidden capture field, like a focused typing-test surface.
  $('typingPassage').addEventListener('keydown', () => input.focus());
  setSelected(); target = makeTarget(); lastTarget = target; renderTarget(); updateStats();
}
function startHigher(stage){timedStart(stage,"higher","Pick the higher number. Every correct choice adds to your score.");const next=()=>{if($("soloFeedback"))$("soloFeedback").textContent="";const max=Math.round(20*difficultyFactor()+10);let a=Math.floor(Math.random()*max)+1,b=Math.floor(Math.random()*max)+1;while(a===b)b=Math.floor(Math.random()*max)+1;soloState.answer=String(Math.max(a,b));$("soloQuestion").textContent=`${a}  or  ${b}`;$("soloControls").innerHTML=`<div class="choice-grid"><button class="btn btn-quiet" data-choice="${a}">${a}</button><button class="btn btn-quiet" data-choice="${b}">${b}</button></div>`;$$('[data-choice]',$("soloControls")).forEach(btn=>btn.addEventListener("click",()=>{if(soloState.finished)return;if(btn.dataset.choice===soloState.answer){soloState.score++;$("soloScore").textContent=soloState.score;$("soloFeedback").textContent="Correct.";next();}else{$("soloFeedback").textContent=`Incorrect — ${soloState.answer} was higher.`;questionDelay("higher",next);}}));};next();}
const ODD=[{items:["Apple","Pear","Carrot","Plum"],answer:"Carrot"},{items:["Triangle","Square","Circle","Blue"],answer:"Blue"},{items:["2","4","6","9"],answer:"9"},{items:["Mercury","Venus","Mars","Pacific"],answer:"Pacific"}];
function startOdd(stage){timedStart(stage,"odd","Find the item that does not belong. A wrong answer reveals the answer and advances.");const next=()=>{if($("soloFeedback"))$("soloFeedback").textContent="";const q=ODD[Math.floor(Math.random()*ODD.length)];soloState.answer=q.answer;const choices=[...q.items].sort(()=>Math.random()-.5);$("soloQuestion").textContent="Which one is different?";$("soloControls").innerHTML=`<div class="choice-grid">${choices.map(x=>`<button class="btn btn-quiet" data-choice="${ESC(x)}">${ESC(x)}</button>`).join("")}</div>`;$$('[data-choice]',$("soloControls")).forEach(btn=>btn.addEventListener("click",()=>{if(soloState.finished)return;if(btn.dataset.choice===soloState.answer){soloState.score++;$("soloScore").textContent=soloState.score;$("soloFeedback").textContent="Exactly.";next();}else{$("soloFeedback").textContent=`Not this time — ${soloState.answer} was the odd one out.`;questionDelay("odd",next);}}));};next();}
async function startGkQuiz(stage) {
  timedStart(stage, "gk", "Random general-knowledge questions. Questions are fetched live and shuffled.", 60);
  let request = 0;
  const next = async () => {
    const thisRequest = ++request;
    if ($("soloFeedback")) $("soloFeedback").textContent = "Fetching a fresh question…";
    $("soloControls").innerHTML = "";
    try {
      const response = await fetch(`/api/quiz/gk?nonce=${Date.now()}-${Math.random()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "Question feed unavailable.");
      if (soloState.finished || thisRequest !== request) return;
      soloState.answer = data.answer;
      $("soloQuestion").textContent = data.question;
      $("soloControls").innerHTML = `<div class="choice-grid">${data.choices.map(choice => `<button type="button" class="btn btn-quiet" data-gk-choice="${ESC(choice)}">${ESC(choice)}</button>`).join("")}</div>`;
      $("soloFeedback").textContent = data.category || "General Knowledge";
      $$('[data-gk-choice]', $("soloControls")).forEach(button => button.addEventListener("click", () => {
        if (soloState.finished) return;
        if (button.dataset.gkChoice === soloState.answer) { soloState.score++; $("soloScore").textContent = soloState.score; $("soloFeedback").textContent = "Correct! Next random question…"; }
        else $("soloFeedback").textContent = `Not quite — ${soloState.answer}`;
        questionDelay("gk", next);
      }));
    } catch (error) { $("soloQuestion").textContent = "GK question feed unavailable"; $("soloFeedback").textContent = error.message; $("soloControls").innerHTML = '<button class="btn btn-primary" id="retryGk">Retry question</button>'; $("retryGk").addEventListener("click", next); }
  };
  await next();
}
function renderMultiplayerGameLanding(content, game) {
  clearSoloTimers(); content.innerHTML = `<div class="game-content-header"><div><span class="eyebrow">MULTIPLAYER · ${ESC(multiplayerDifficulty.toUpperCase())}</span><h1>${ESC(game.name)}</h1><p>${ESC(game.description)}</p></div><span class="difficulty-chip">${ESC(multiplayerDifficulty)}</span></div><div class="game-stage"><p>Challenge a friend from another device. Share a room code and play together.</p><div class="lobby-controls"><label class="field"><span>Display name</span><input id="gamePlayerName" maxlength="20" placeholder="${ESC(profile?.name || "Your name")}"></label><button id="gameCreateRoom" class="btn btn-primary">Create room</button><div class="join-group"><label class="field"><span>Room code</span><input id="gameRoomCode" maxlength="5" placeholder="ABCDE"></label><button id="gameJoinRoom" class="btn btn-quiet">Join room</button></div></div><p id="gameLobbyStatus" class="status-line" aria-live="polite"></p><div id="gameRoomPanel"></div></div>`;
  if (game.id === "ludo") { renderLudoLanding(content); return; }
  $("gameCreateRoom").addEventListener("click",()=>{const name=$("gamePlayerName").value.trim()||profile?.name||"Player";emitAck("room:create",{name,difficulty:multiplayerDifficulty,game:game.id},response=>{if(!response.ok)return setStatus("gameLobbyStatus",response.message);currentRoomCode=response.code;currentRoomGame=game.id;showDuelRoomInGame();setStatus("gameLobbyStatus",`Room ${response.code} created. Share the code. The game starts automatically when your friend joins.`);});});
  $("gameJoinRoom").addEventListener("click",()=>{const code=$("gameRoomCode").value.trim().toUpperCase();emitAck("room:join",{code,name:profile?.name||"Player"},response=>{if(!response.ok)return setStatus("gameLobbyStatus",response.message);currentRoomCode=response.code;currentRoomGame=game.id;showDuelRoomInGame();setStatus("gameLobbyStatus",`Joined ${response.code}.`);});});
  if (currentRoomCode && currentRoomGame === game.id) showDuelRoomInGame();
}
function showDuelRoomInGame(){const target=$("gameRoomPanel");if(!target)return;target.innerHTML=`<div class="room-panel"><div class="room-header"><div><span class="eyebrow">ROOM CODE</span><div class="room-code">${ESC(currentRoomCode||"-----")}</div></div><button id="gameCopyCode" class="btn btn-quiet">Copy code</button></div><div id="gameRoomPlayers" class="player-chips"></div><p id="gameDuelStatus" class="status-line">Waiting for your opponent…</p><div id="gameDuelRound" class="duel-game"></div><div id="gameRoomChat" class="game-chat mobile-drawer"><div class="chat-heading"><strong>In-game chat</strong><span id="gameChatUnread" class="count-pill hidden">0</span><button id="gameChatToggle" class="btn btn-small btn-quiet" type="button" aria-expanded="true">Collapse</button></div><div id="gameChatMessages" class="chat-messages"></div><div id="gameEmojiPicker" class="emoji-picker hidden"></div><form id="gameChatForm" class="chat-compose"><button class="emoji-toggle" data-emoji-target="gameChatInput" type="button" aria-label="Choose emoji">☺</button><input id="gameChatInput" maxlength="240" placeholder="Message your opponent…"><button class="btn btn-primary btn-small">Send</button></form></div></div>`;$("gameCopyCode").addEventListener("click",()=>copyText(currentRoomCode));setupRoomChat("gameChatForm","gameChatInput","gameChatMessages","gameEmojiPicker");setupChatCollapse("gameRoomChat","gameChatToggle","gameChatUnread","game");loadRoomChat(currentRoomCode,"gameChatMessages");}

