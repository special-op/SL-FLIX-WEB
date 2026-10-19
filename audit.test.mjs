import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createUpstreamCircuitBreaker } from './server/upstreamCircuitBreaker.js';
import { classifyNetworkQuality, calculateRetryDelay } from './utils/networkQuality.js';
import { allowGuessRate, buildMovieTriviaQuestions, cleanupGuessPosterGame, classifyGuess, createGuessPosterGame, createMovieTriviaGame, createPartyGame, getPublicGuessPosterGame, getPublicMovieTriviaGame, getPublicPartyGame, isCorrectGuess, nextGuessPosterRound, normalizeGuess, scoreForCorrectGuess, scoreGuess, scorePartyGameGuess, scoreTriviaAnswer } from './server/watchPartyGame.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const classifyGuessForAudit = (guess, candidate) => {
  const result = classifyGuess(guess, candidate);
  return { points: result.points, tier: result.tier };
};
test('manifest and lockfile root dependencies agree', () => {
  const manifest = JSON.parse(read('./package.json'));
  const root = JSON.parse(read('./package-lock.json')).packages[''];
  for (const key of ['dependencies', 'devDependencies', 'engines']) {
    assert.deepEqual(root[key], manifest[key]);
  }
});
test('mobile zoom and bundled assets remain enabled', () => {
  const html = read('./index.html');
  assert.doesNotMatch(html, /user-scalable=no|maximum-scale=1|cdn\.tailwindcss\.com|cdn\.socket\.io/);
  assert.match(read('./index.tsx'), /import '\.\/styles\.css'/);
});
test('external subtitle text is not rendered as raw HTML', () => {
  assert.doesNotMatch(read('./components/VideoPlayer/StreamingPlayer.tsx'), /dangerouslySetInnerHTML/);
});


test('server hardening protects event and watch-party surfaces', () => {
  const server = read('./server.js');
  assert.doesNotMatch(server, /app\.post\(['"]\/api\/event/);
  assert.doesNotMatch(server, /app\.get\(['"]\/api\/visitors/);
  assert.match(server, /Content-Security-Policy/);
  assert.match(server, /maxHttpBufferSize: 64 \* 1024/);
  assert.match(server, /socket\.data\.identity/);
  assert.match(server, /isRoomMember\(room, socket\)/);
  assert.doesNotMatch(server, /room\.creator\.toLowerCase\(\) === String\(creatorUsername/);
});

test('watch-party invites support share links, codes, and host approval', () => {
  const server = read('./server.js');
  const client = read('./components/WatchPartyView.tsx');
  assert.match(server, /room_join_request_decision/);
  assert.match(server, /room_request_pending/);
  assert.match(server, /room_join_request/);
  assert.match(client, /request=1/);
  assert.match(client, /handleJoinRequestDecision/);
  assert.match(client, /navigator\.share/);
  assert.match(client, /Copy link/);
  assert.match(client, /Copy code/);
  assert.match(client, /Request to Join/);
});

test('watch-party entry mode is server-authoritative and visible in the host UI', () => {
  const server = read('./server.js');
  const client = read('./components/WatchPartyView.tsx');
  assert.match(server, /entryMode: cleanRoomEntryMode\(payload\.entryMode\)/);
  assert.match(server, /const requiresApproval = room\.entryMode === 'manual' && !isCreatorUser/);
  assert.match(server, /Auto-Enter is enforced here rather than trusting the request flag/);
  assert.match(server, /socket\.on\('set_room_entry_mode'/);
  assert.match(server, /const host = isRoomMember\(room, socket\)/);
  assert.match(server, /room\.pendingRequests = \[\]/);
  assert.match(client, /set_room_entry_mode/);
  assert.match(client, /Manual Approval/);
  assert.match(client, /Auto-Enter/);
  assert.match(client, /isAutoEntry \? '' : '&request=1'/);
});

test('watch-party host refresh keeps the room through the reconnect grace window', () => {
  const server = read('./server.js');
  const client = read('./components/WatchPartyView.tsx');
  assert.match(server, /ROOM_EMPTY_GRACE_MS = 10 \* 60 \* 1000/);
  assert.match(server, /hostToken: randomUUID\(\)/);
  assert.match(server, /now - \(r\.updatedAt \|\| now\) < ROOM_EMPTY_GRACE_MS/);
  assert.match(server, /room\.users\.length > 0/);
  assert.match(client, /localStorage\.getItem\(`slflix_host_token_\$\{cleanParam\}`\)/);
  assert.match(client, /s\.emit\('join_room'/);
});

test('watch-party wait timer closes abandoned rooms and clears when a guest joins', () => {
  const server = read('./server.js');
  const client = read('./components/WatchPartyView.tsx');
  assert.match(server, /ROOM_WAIT_MS = 30 \* 60 \* 1000/);
  assert.match(server, /room\.waitExpiresAt && now > room\.waitExpiresAt/);
  assert.match(server, /watchRooms\.delete\(roomId\)/);
  assert.match(server, /if \(!isCreatorUser\) room\.waitExpiresAt = null/);
  assert.match(client, /setWaitExpiresAt\(null\)/);
});

test('watch-party host seat cannot be claimed by a duplicate display name', () => {
  const server = read('./server.js');
  assert.match(server, /const isRoomHostName = room\.creator\.toLowerCase\(\) === cleanUsername\.toLowerCase\(\)/);
  assert.match(server, /isRoomHostName && !isHostReconnect/);
  assert.match(server, /That display name is already in use in this room/);
  assert.doesNotMatch(server, /room\.users\[0\]\.isCreator = true; \/\/ hand over host/);
});

test('watch-party room creation and join requests are idempotent with scoped entry UI', () => {
  const server = read('./server.js');
  const client = read('./components/WatchPartyView.tsx');
  assert.match(server, /socket\.data\.roomCreationRequests = new Map\(\)/);
  assert.match(server, /const clientRequestId = cleanText\(payload\.clientRequestId/);
  assert.match(server, /const previousRoom = previousRequest \? watchRooms\.get\(previousRequest\.roomId\) : null/);
  assert.match(server, /request\.socketId === socket\.id\n\s*\|\| request\.username\.toLowerCase\(\) === cleanUsername\.toLowerCase\(\)/);
  assert.match(server, /existing: true/);
  assert.match(server, /status: 'full'/);
  assert.match(client, /createInFlightRef/);
  assert.match(client, /Join by code/);
  assert.match(client, /setTargetRoomId\(cleanId\)/);
  assert.match(client, /'Submitted'/);
  assert.match(client, /disabled=\{requestInFlight \|\| !socket\}/);
});

test('movie search ranks exact and near-exact titles before unrelated results', () => {
  const api = read('./services/api.ts');
  assert.match(api, /const normalizeSearchTitle/);
  assert.match(api, /normalizedTitle === normalizedQuery/);
  assert.match(api, /const prioritizeSearchResults/);
  assert.match(api, /result\.results = prioritizeSearchResults\(query, result\.results\)/);
});

test('watch-party fetch timeout failures have a visible error state', () => {
  const client = read('./components/WatchPartyView.tsx');
  const api = read('./services/api.ts');
  assert.match(api, /SHARED_FETCH_TIMEOUT_MS = 10_000/);
  assert.match(client, /const \[streamError, setStreamError\]/);
  assert.match(client, /setStreamError\('Unable to load the stream right now/);
  assert.match(client, /role="alert"/);
});

test('watch-party viewers correct drift and publish participant buffering state', () => {
  const client = read('./components/VideoPlayer/StreamingPlayer.tsx');
  const types = read('./components/VideoPlayer/VideoPlayerTypes.ts');
  const view = read('./components/WatchPartyView.tsx');
  const hud = read('./components/VideoPlayer/VideoHud.tsx');
  const server = read('./server.js');
  assert.match(client, /watchPartyProps\.isHost/);
  assert.match(client, /absoluteDiff > 1\.5/);
  assert.match(client, /playbackRate = .*diff > 0/);
  assert.match(types, /onBufferingChange/);
  assert.match(view, /room_buffering_status/);
  assert.match(view, /u\.buffering/);
  assert.match(hud, /Buffering:/);
  assert.match(server, /socket\.on\('room_buffering_status'/);
  assert.match(server, /buffering: false/);
});

test('network quality hysteresis and retry backoff are bounded', () => {
  assert.deepEqual(classifyNetworkQuality('good', true, 1, 0, 0), { quality: 'good', goodSince: 0 });
  assert.deepEqual(classifyNetworkQuality('good', true, 2, 1_000, 0), { quality: 'slow', goodSince: null });
  assert.deepEqual(classifyNetworkQuality('slow', true, 0, 20_000, null), { quality: 'slow', goodSince: 20_000 });
  assert.deepEqual(classifyNetworkQuality('slow', true, 0, 50_000, 0), { quality: 'good', goodSince: 0 });
  assert.deepEqual(classifyNetworkQuality('good', false, 0, 60_000, 0), { quality: 'offline', goodSince: null });
  assert.equal(calculateRetryDelay(0, 300, 10_000, () => 0.5), 300);
  assert.equal(calculateRetryDelay(5, 300, 10_000, () => 0.5), 9_600);
});

test('guess poster normalisation, fuzzy matching, scoring, privacy, rate limiting, and cleanup', () => {
  assert.equal(normalizeGuess(' The Princess Bride! '), 'princess bride');
  assert.equal(isCorrectGuess('princes bride', 'The Princess Bride'), true);
  assert.equal(isCorrectGuess('wrong', 'The Princess Bride'), false);
  assert.deepEqual([0, 1, 2, 3, 4].map(scoreForCorrectGuess), [3, 2, 1, 0, 0]);

  const game = createGuessPosterGame([{ id: '1', title: 'Hidden Title', posterUrl: '/poster.jpg' }], 1000);
  const publicGame = getPublicGuessPosterGame(game);
  assert.equal('answerTitle' in publicGame, false);
  assert.equal(publicGame.posterUrl, '/poster.jpg');

  let rate = allowGuessRate([], 1000);
  rate = allowGuessRate(rate.timestamps, 1100);
  rate = allowGuessRate(rate.timestamps, 1200);
  assert.equal(rate.allowed, true);
  rate = allowGuessRate(rate.timestamps, 1300);
  assert.equal(rate.allowed, false);

  const room = { guessPosterGame: game };
  cleanupGuessPosterGame(room);
  assert.equal('guessPosterGame' in room, false);
});

test('guess poster server flow protects answer data and cleans game state', () => {
  const server = read('./server.js');
  assert.match(server, /socket\.on\('guess_poster_start'/);
  assert.match(server, /room\.users\.length < 2/);
  assert.match(server, /GUESS_POSTER_MAX_PLAYERS/);
  assert.match(server, /socket\.on\('guess_poster_submit'/);
  assert.match(server, /GUESS_POSTER_MAX_GUESS_LENGTH/);
  assert.match(server, /allowGuessRate/);
  assert.match(server, /guess_poster_round_revealed/);
  assert.match(server, /clearGuessPosterGame\(room\)/);
  assert.match(server, /guess_poster_finished/);
});

test('watch-party public discovery, privacy, games, and scoring rules are covered', () => {
  const server = read('./server.js');
  const client = read('./components/WatchPartyView.tsx');
  assert.match(server, /function cleanRoomPrivacy/);
  assert.match(server, /\.filter\(r => r\.privacy !== 'private'\)/);
  assert.match(server, /io\.emit\('public_rooms_list'/);
  assert.match(server, /roomNameIsReserved/);
  assert.match(server, /socket\.on\('movie_trivia_start'/);
  assert.match(server, /socket\.on\('movie_trivia_submit'/);
  assert.match(client, /createVisibility/);
  assert.match(client, /entryTab === 'discover'/);
  assert.match(client, /posterCandidatePool/);
  assert.match(client, /Movie Trivia/);
});

test('guess poster awards five for full title and three for accepted non-full answers', () => {
  const candidate = { title: 'The Princess Bride', aliases: ['Princess Bride'] };
  assert.equal(scoreGuess('The Princess Bride', candidate), 5);
  assert.equal(scoreGuess('Princess Bride', candidate), 3);
  assert.equal(scoreGuess('Princess', candidate), 3);
  assert.equal(scoreGuess('Completely Wrong', candidate), 0);
});

test('title scoring exposes exact, close, initial, and wrong tiers', () => {
  const candidate = { title: 'The Princess Bride', aliases: ['The PB Movie'] };
  assert.deepEqual(classifyGuessForAudit('The Princess Bride', candidate), { points: 5, tier: 'exact' });
  assert.deepEqual(classifyGuessForAudit('Princess', candidate), { points: 3, tier: 'close' });
  assert.deepEqual(classifyGuessForAudit('PB', candidate), { points: 1, tier: 'initial' });
  assert.deepEqual(classifyGuessForAudit('TPB', candidate), { points: 1, tier: 'initial' });
  assert.deepEqual(classifyGuessForAudit('???', candidate), { points: 0, tier: 'wrong' });
});

test('generic party games cover every type and keep answers private until reveal', () => {
  const candidates = [
    { id: 'a', title: 'The Star', quote: 'A safe line', emoji: '⭐' },
    { id: 'b', title: 'Night Road', quote: 'Another safe line' }
  ];
  const characters = [{ id: 'c', name: 'Captain Example', title: 'The Star', imageUrl: '/cast.jpg' }];
  for (const gameType of ['emoji', 'quote', 'character', 'scramble']) {
    const game = createPartyGame({ gameType, rounds: 5, roundMs: 5000, candidates, characters }, 1000);
    const hidden = getPublicPartyGame(game);
    assert.equal(hidden.gameType, gameType);
    assert.equal(hidden.revealed, false);
    assert.equal('answer' in hidden, false);
    assert.ok(hidden.prompt);
    game.status = 'reveal';
    game.revealed = true;
    assert.ok(getPublicPartyGame(game).answer);
  }
  const mixed = createPartyGame({ gameType: 'mixed', rounds: 10, candidates, characters }, 1000);
  assert.deepEqual(mixed.rounds.map(round => round.roundType), ['emoji', 'quote', 'character']);
  assert.equal(mixed.maxRounds, 3);
  assert.equal(new Set(mixed.rounds.map(round => normalizeGuess(round.answer))).size, mixed.maxRounds);
  assert.equal('answer' in getPublicPartyGame(mixed), false);
  mixed.scores = { Player: 0 };
  assert.equal(scorePartyGameGuess(mixed, 'Player', 'The Star').points, 5);
  assert.equal(scorePartyGameGuess(mixed, 'Player', 'The Star').duplicate, true);
});

test('movie trivia generates varied, sanitized rounds with unique answers and options', () => {
  const candidates = Array.from({ length: 7 }, (_, index) => ({
    id: `movie-${index + 1}`,
    title: `Movie ${index + 1}`,
    genre: `Genre ${index + 1}`,
    releaseDate: `20${10 + index}-01-01`,
    type: 'Movie',
    countryName: `Country ${index + 1}`,
    cast: [{ name: `Actor ${index + 1}`, character: `Character ${index + 1}` }],
    description: `Description ${index + 1}`,
    tagline: `Tagline ${index + 1}`
  }));
  const questions = buildMovieTriviaQuestions({ movie: candidates[0], candidates, maxRounds: 7 });
  assert.equal(questions.length, 7);
  assert.equal(new Set(questions.map(question => question.id)).size, questions.length);
  assert.equal(new Set(questions.map(question => question.question)).size, questions.length);
  assert.equal(new Set(questions.map(question => question.options[question.answerIndex])).size, questions.length);
  for (const question of questions) {
    assert.ok(question.options.every(option => typeof option === 'string' && option.trim()));
    assert.equal(new Set(question.options.map(option => normalizeGuess(option))).size, question.options.length);
  }
  const game = createMovieTriviaGame(questions, 1000);
  const hidden = getPublicMovieTriviaGame(game);
  assert.equal(hidden.answerIndex, undefined);
  assert.equal(hidden.correctChoice, undefined);
  assert.deepEqual(hidden.question.options, game.questions[0].options);
});

test('movie trivia caps an unusable single-candidate pool instead of inventing rounds', () => {
  const questions = buildMovieTriviaQuestions({
    movie: { id: 'only', title: 'Only Movie', genre: 'Drama', description: 'A single candidate.' },
    candidates: [{ id: 'only', title: 'Only Movie' }],
    maxRounds: 5
  });
  assert.deepEqual(questions, []);
});

test('guess poster caps rounds and never reuses an answer before exhaustion', () => {
  const game = createGuessPosterGame([
    { id: 'one', title: 'One', posterUrl: '/one.jpg' },
    { id: 'two', title: 'Two', posterUrl: '/two.jpg' },
    { id: 'two-copy', title: 'Two', posterUrl: '/two-copy.jpg' }
  ], 1000);
  assert.equal(game.maxRounds, 2);
  const next = nextGuessPosterRound(game, 2000);
  assert.ok(next);
  assert.equal(next.usedAnswerIds.length, 2);
  assert.equal(new Set(next.usedAnswerIds).size, 2);
  assert.equal(nextGuessPosterRound(next, 3000), null);
});

test('generic party games cap usable unique rounds and character answers use names', () => {
  const candidates = [
    { id: 'a', title: 'Same Title', quote: 'Line A', emoji: '⭐' },
    { id: 'b', title: 'Same Title', quote: 'Line B', emoji: '⭐' },
    { id: 'c', title: 'Other Title', quote: 'Line C', emoji: '✨' }
  ];
  const emoji = createPartyGame({ gameType: 'emoji', rounds: 5, candidates }, 1000);
  assert.equal(emoji.maxRounds, 2);
  assert.equal(new Set(emoji.rounds.map(round => normalizeGuess(round.answer))).size, emoji.maxRounds);
  assert.equal(new Set(emoji.rounds.map(round => round.clue)).size, emoji.maxRounds);

  const character = createPartyGame({
    gameType: 'character',
    rounds: 5,
    candidates: [{ id: 'movie', title: 'The Movie' }],
    characters: [
      { id: 'hero', name: 'Hero', title: 'The Movie' },
      { id: 'villain', character: 'Villain', title: 'The Movie' }
    ]
  }, 1000);
  assert.equal(character.maxRounds, 2);
  assert.deepEqual(character.rounds.map(round => round.answer), ['Hero', 'Villain']);
  assert.ok(character.rounds.every(round => round.answer !== 'The Movie'));

  const unavailableQuote = createPartyGame({ gameType: 'quote', rounds: 5, candidates: [{ id: 'x', title: 'No Quote' }] }, 1000);
  assert.equal(unavailableQuote.maxRounds, 0);
});

test('generic party game server protocol is wired with host lifecycle and privacy events', () => {
  const server = read('./server.js');
  assert.match(server, /socket\.on\('party_game_start'/);
  assert.match(server, /socket\.on\('party_game_submit'/);
  assert.match(server, /socket\.on\('party_game_end'/);
  for (const event of ['party_game_started', 'party_game_round_started', 'party_game_score', 'party_game_round_revealed', 'party_game_finished', 'party_game_ended']) {
    assert.match(server, new RegExp(`['"]${event}['"]`));
  }
  assert.match(server, /getPublicPartyGame/);
  assert.match(server, /clearPartyGame\(room\)/);
});

test('watch-party navigation keeps discovery, creation, and games focused', () => {
  const client = read('./components/WatchPartyView.tsx');
  assert.match(client, /entryTab === 'discover'/);
  assert.match(client, /Public watch parties/);
  assert.match(client, /entryTab !== 'create'/);
  assert.match(client, /aria-label="Room workspace"/);
  assert.match(client, /roomView === 'games'/);
  assert.match(client, /Room arcade/);
  assert.match(client, /Access & privacy/);
  assert.match(client, /Choose a title/);
  assert.match(client, /aria-label="Playback and session controls"/);
  assert.match(client, /aria-label="Invite and room controls"/);
});

test('movie trivia keeps the answer private until reveal and prevents duplicate scoring', () => {
  const game = createMovieTriviaGame([{ question: 'Which is a movie?', options: ['Film', 'Book'], answerIndex: 0 }], 1_000, 20_000);
  game.scores = { Viewer: 0 };
  const hidden = getPublicMovieTriviaGame(game);
  assert.equal(hidden.answerIndex, undefined);
  assert.equal(scoreTriviaAnswer(game, 'Viewer', 0).points, 1);
  assert.equal(scoreTriviaAnswer(game, 'Viewer', 0).duplicate, true);
  game.status = 'reveal';
  assert.equal(getPublicMovieTriviaGame(game).answerIndex, 0);
});

test('audited proxy routes use provider host allowlists and private-address checks', { skip: 'proxy lockdown pending (branch wip/proxy-and-hud)' }, () => {
  const api = read('./server/api.js');
  const server = read('./server.js');
  assert.match(api, /function isAllowedProxyHost\(/);
  assert.match(api, /function isPrivateAddress\(/);
  assert.match(api, /api\.omegatech\.app/);
  assert.match(api, /h5-api\.aoneroom\.com/);
  assert.match(api, /xnxx-cdn\.com/);
  assert.match(api, /parseAllowedProxyUrl\(decodedUrl, IMAGE_PROXY_HOSTS\)/);
  assert.match(api, /parseAllowedProxyUrl\(decodedUrl, ANIME_STREAM_HOSTS\)/);
  assert.match(api, /parseAllowedProxyUrl\(decodedUrl, ADULT_STREAM_HOSTS\)/);
  assert.match(server, /function isAllowedProxyHost\(/);
  assert.match(server, /function isPrivateAddress\(/);
  assert.match(server, /FIXED_PROXY_HOSTS/);
});

test('audited proxy redirects are bounded and revalidated at every hop', { skip: 'proxy lockdown pending (branch wip/proxy-and-hud)' }, () => {
  const api = read('./server/api.js');
  const server = read('./server.js');
  assert.match(api, /MAX_PROXY_REDIRECTS = 3/);
  assert.match(api, /redirect: 'manual'/);
  assert.match(api, /new URL\(location, parsed\)/);
  assert.match(api, /new URL\(proxyRes\.headers\.location, parsedUrl\)/);
  assert.match(api, /hop >= MAX_PROXY_REDIRECTS/);
  assert.match(server, /MAX_PROXY_REDIRECTS = 3/);
  assert.match(server, /new URL\(proxyRes\.headers\.location, targetUrl\)/);
  assert.match(server, /redirectHop \+ 1/);
  assert.match(server, /redirectUrl\.protocol !== 'https:'/);
});

test('audited proxy endpoints have endpoint-specific rate limits', { skip: 'proxy lockdown pending (branch wip/proxy-and-hud)' }, () => {
  const api = read('./server/api.js');
  const server = read('./server.js');
  assert.match(api, /router\.get\('\/subtitle', subtitleLimiter/);
  assert.match(api, /router\.get\('\/tv\/img', imageProxyLimiter/);
  assert.match(api, /router\.get\('\/anime\/stream-proxy', animeStreamLimiter/);
  assert.match(api, /router\.get\('\/adult\/stream', adultStreamLimiter/);
  assert.match(server, /metadataProxyLimiter/);
  assert.match(server, /playerProxyLimiter/);
  assert.match(server, /app\.use\('\/api-metadata', metadataProxyLimiter/);
  assert.match(server, /app\.use\('\/api-player', playerProxyLimiter/);
});

test('audited proxy responses have strict timeout and practical size protections', { skip: 'proxy lockdown pending (branch wip/proxy-and-hud)' }, () => {
  const api = read('./server/api.js');
  const server = read('./server.js');
  assert.match(api, /AbortSignal\.timeout\(timeoutMs\)/);
  assert.match(api, /MAX_SUBTITLE_BYTES = 2 \* 1024 \* 1024/);
  assert.match(api, /MAX_IMAGE_BYTES = 5 \* 1024 \* 1024/);
  assert.match(api, /readResponseBody\(response, MAX_SUBTITLE_BYTES\)/);
  assert.match(api, /readResponseBody\(response, MAX_IMAGE_BYTES\)/);
  assert.match(api, /STREAM_PROXY_IDLE_TIMEOUT_MS/);
  assert.match(api, /proxyReq\.on\('timeout'/);
  assert.match(server, /MAX_PROXY_RESPONSE_BYTES = 4 \* 1024 \* 1024/);
  assert.match(server, /PROXY_RESPONSE_IDLE_TIMEOUT_MS/);
  assert.match(server, /proxyReq\.on\('timeout'/);
  assert.match(server, /declaredLength > MAX_PROXY_RESPONSE_BYTES/);
});

test('upstream circuit opens after three failures and permits one successful half-open trial', () => {
  const breaker = createUpstreamCircuitBreaker({ openMs: 60_000, failureCacheMs: 0 });
  const host = 'api.omegatech.app';
  let upstreamCalls = 0;
  for (let i = 0; i < 3; i += 1) {
    const gate = breaker.beforeRequest(host, `${host}/sources/${i}`);
    assert.equal(gate.allowed, true);
    upstreamCalls += 1;
    breaker.recordFailure(host, `${host}/sources/${i}`, 1000 + i);
  }
  const blocked = breaker.beforeRequest(host, `${host}/sources/next`, 2000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.response.error, 'upstream_unavailable');
  assert.equal(upstreamCalls, 3);
  assert.equal(breaker.beforeRequest(host, `${host}/sources/next`, 62_001).allowed, true);
  breaker.recordSuccess(host);
  assert.equal(breaker.beforeRequest(host, `${host}/sources/final`, 62_002).allowed, true);
});

test('home and source clients expose failure states instead of empty success data', () => {
  const home = read('./components/HomePage.tsx');
  const api = read('./services/api.ts');
  assert.match(home, /Couldn't load this section/);
  assert.match(home, /onRetry/);
  assert.match(api, /Sources returned no playable streams/);
  assert.match(api, /throw e/);
});
