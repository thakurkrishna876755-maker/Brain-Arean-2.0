# Brain Arena

Brain Arena is a responsive brain-game website built with **Node.js 22+, Express 5, Socket.IO, and vanilla JavaScript**. It has no frontend framework and no additional runtime dependency beyond Express and Socket.IO.

## Run locally

1. Install Node.js 22 or newer.
2. Open a terminal in the project directory.
3. Install dependencies:

   ```bash
   npm ci
   ```

4. Start the server:

   ```bash
   npm start
   ```

5. Open [http://localhost:3000](http://localhost:3000).

For development with automatic server restarts, use `npm run dev`.

## Tests

Run the complete automated suite:

```bash
npm test
```

The suite includes Ludo rules tests, real HTTP endpoint tests, live Socket.IO integration tests for direct messages and room chat CRUD, duel wrong-answer behaviour, and online Ludo room/turn validation. It uses Node's built-in test runner and WebSocket implementation; it does not require a separate test framework.

## Features

- Premium dark interface with gold/violet accents, light/dark theme toggle, persistent top navigation, and a mobile bottom tab bar.
- Separate Home/Games, Friends, Messages, Leaderboard, and Profile sections.
- Individual game pages for Quick Math, Memory, Word Scramble, Color Clash, Typing Sprint, Number Puzzle, Odd One Out, Simon Tap, Higher or Lower, Pattern Pulse, Reaction, and Ludo Classic.
- Separate solo and multiplayer difficulty settings.
- `public/app.js` sequentially loads feature scripts from `public/js/`, separated into core navigation, games, social pages, messaging/chat, duel controls, Ludo, leaderboard, emoji controls, and socket events.
- Friends: profile card, public 8-character player code, presence preference, player search, friend requests, block/remove, room invites, and a same-computer test player that opens in its own tab/session.
- Direct messages and in-room chat with server-generated message IDs, 240-character message limit, sender-only edit/delete, soft-delete placeholders, live updates, and five messages per five seconds per player.
- Leaderboard: explicit refresh, cache bypass, game filter, loading/error/retry states, current-player highlighting, top-three medals, score bounds, per-IP submission limits, and 30-second refresh while the page is open.
- Challenge Mode: automatic best-of-five multiplayer match that rotates through Quick Math, Number Pattern, Memory Sequence, Reaction Test, and Word Scramble; no game voting is required.
- Player progression: locally saved XP, levels, daily play streaks, personal bests, and achievements for first run, ten runs, high score, three-day streak, and trying five game types.
- Ludo: 15×15 SVG board, four coloured yards, four home lanes, safe squares, numbered pawns, square-by-square movement animation, animated die, 2–4 local or online players, server-side dice and move validation, captures, extra turns, three-sixes penalty, exact home finish, optional block rule, optional single-move auto-play, 30-second turn timer, and 60-second reconnect grace.
- Duel wrong-answer rules: a wrong answer immediately locks that player out of the current round. The opponent may still answer; two wrong answers end the round immediately without a winner. Timed solo questions reveal the correct answer briefly and advance without ending the overall session.


## Deploying to Vercel

This repository has a Vercel-compatible HTTP-server entry point: `server.js` exports the HTTP server so the Express app and Socket.IO can share the same function. Vercel supports WebSocket connections on Fluid Compute; clients must still handle reconnects when a function reaches its maximum duration. See the official [Express deployment guide](https://vercel.com/docs/frameworks/backend/express) and [WebSocket guide](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections).

### Deploy steps

1. Extract the project ZIP.
2. Create a new **private or public GitHub repository** and upload the extracted project files (the `package.json` file must be at the repository root).
3. Open [Vercel New Project](https://vercel.com/new), import that repository, and keep the detected Node.js/Express settings. No frontend build command is required.
4. Deploy, then open the generated `.vercel.app` URL and verify `/api/health` returns `{"ok":true,"service":"brain-arena"}`.
5. Test the site in two separate browser sessions, especially Socket.IO reconnects, friend invites, duels, chat, and Ludo.

### Vercel Socket.IO connection fix

- The browser client now connects using WebSocket directly (`transports: ["websocket"]`) instead of starting with HTTP long-polling. This addresses the observed `POST /socket.io/?EIO=4&transport=polling&sid=...` `400 Bad Request` symptom when a polling session is not recognized by the server handling the next request.
- The client logs `connect_error` messages and automatically retries failed connections.
- After deployment, hard-refresh the page (`Ctrl+Shift+R`) and verify the Network tab shows a WebSocket connection (`wss://.../socket.io/`) with status `101 Switching Protocols`. Then test a room with two different browser sessions.
- This is a targeted client-side mitigation, not a guarantee of error-free multiplayer: shared room state across server instances and reconnect/resume behavior still need production-grade architecture and live testing.

## Important Vercel limitations for this version

- Vercel function filesystems are ephemeral. The default Vercel data directory is `/tmp/brain-arena-data` so writes do not target the read-only project bundle, but this is **temporary storage**, not durable storage. Profiles, messages, and leaderboard entries can disappear after an instance restart and may differ between instances.
- Realtime rooms, player presence, and rate-limit maps are in memory. Vercel can pin each WebSocket connection to an instance, but separate players can connect to different instances. Reliable public multiplayer needs shared state (for example, Redis plus a Socket.IO adapter) and a persistent database for social data and scores.
- Therefore this package can be deployed as a preview/demo, but do not advertise the current deployment as production-ready multiplayer until shared state and durable persistence are configured and verified.
- Vercel WebSocket connections close at the function's maximum duration; the client must reconnect and resynchronize game state after reconnects.

## Configuration and persistence

- `PORT` — HTTP port; defaults to `3000`.
- `DATA_DIR` — directory for JSON persistence; defaults to `./data`.
- `social.json` — profiles, friend requests, friend lists, and blocks.
- `messages.json` — direct-message conversations (up to 200 messages per conversation).
- `leaderboard.json` — leaderboard entries.
- Room chat is kept in memory for the lifetime of its room, as specified.

**Deployment note:** configure `DATA_DIR` to a persistent disk/volume on your hosting provider. Ephemeral filesystem storage can lose profiles, messages, and scores on redeploy. Run one server instance unless you add shared storage and a Socket.IO adapter for multi-instance coordination.

## Important limitations

- There are no real accounts or password-based authentication. A browser-stored player ID is the current identity, so clearing browser storage or using another browser creates a different player. Player codes are for discovery, not proof of identity.
- The application sanitizes user input, limits chat/score submissions, and validates room actions, but a production launch should add authenticated accounts, stronger abuse controls, persistent database storage, TLS, and monitoring.
- Automated HTTP and Socket.IO integration tests cover the server endpoints, duel behavior, chat ownership, and Ludo rules. A full interactive browser QA pass across physical devices and deployed infrastructure has not been completed.


## Latest requested enhancements

- Friend invitation dialog lets the sender choose a game and difficulty, creates the room, and sends the invite. Duel rooms now start automatically when the second player accepts/joins; voting is no longer required.
- Added a daily featured game, saved by local date, plus a GK Quiz that requests a fresh random general-knowledge question from Open Trivia Database. The GK feature needs internet access and displays a retry state if the provider is unavailable.
- Typing Master now offers words, punctuation, and code-symbol modes.
- Direct messages have an Auto-clear selector: Never, After view, or When either user goes offline. These settings apply to new messages. Clearing replaces message content with a soft-deleted notice, rather than erasing conversation metadata from disk.
- Ludo shows a graphical die face, creator branding, capture reactions, and victory overlays.

## Limitations to know

- Player identity remains browser-stored and is not a verified account.
- Quick Ludo rooms still use the host's Start Ludo action so a 2–4 player room can be filled; duel games start as soon as the second player joins.
- The GK feed is provided by Open Trivia Database and may be unavailable or rate-limited. No API key is required.
- If messages use Auto-clear, the server marks their text as cleared; backups and previously exported copies outside the app cannot be recalled.

### Typing test modes (updated)
- **Words** uses plain lowercase words without punctuation or numbers.
- **Punctuation** builds fresh sentence-style passages with capitalization and punctuation throughout.
- **Numbers** mixes words with numeric values.
- A new passage is generated when the typing game opens, when settings change, on restart, and when a passage is completed. The generator avoids repeating the immediately previous passage for each mode during the current page session.

Typing text generation is implemented in `public/js/typing-text.js` and covered by `test/typing-text.test.js`.


## October 2026 gameplay and UI improvement pass

- Added individual illustrated-style arcade card art using CSS, with a featured badge for the new challenge.
- Split the previously similar memory/sequence experiences: Memory Matrix is now a spatial grid recall game, Simon Tap remains a growing signal sequence, and Pattern Pulse uses number-rule puzzles.
- Added Fake-Out Frenzy, a 30-second attention-switching game where the instruction changes between color, shape, and avoidance rules.
- Added responsive styles for the new cards, matrix grid, sequence puzzle, and fast reaction targets.
- For this Vercel adaptation, all 39 automated tests pass after using the project's declared dependencies; JavaScript syntax checks also pass. Live browser QA on the deployed Vercel URL is still required, especially for two-player multiplayer and reconnect behavior.


## Production readiness and deployment checklist

This is a tested release candidate, **not yet a fully production-ready service**. Before opening it to the public, complete these items:

- Add real authenticated accounts and authorization; browser-stored player IDs are not secure identities.
- Move social profiles, messages, scores, and progression to a durable database with backups and migrations. XP and streaks currently live in browser storage and can be edited by the user.
- Add stronger abuse protection and operational monitoring; current in-memory rate limits reset on restart and do not coordinate across server instances.
- Deploy behind HTTPS with a persistent `DATA_DIR`, configure origin restrictions, and test reconnects and load under the real hosting setup.
- Complete manual browser QA for 360px, 768px, and desktop layouts, including keyboard navigation and screen-reader flows.

Security headers are set by the server, and HTML/CSS/JS assets use revalidation-friendly caching to reduce stale UI after updates.
