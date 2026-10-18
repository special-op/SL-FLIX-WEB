import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyNetworkQuality, calculateRetryDelay } from './utils/networkQuality.js';
import { allowGuessRate, cleanupGuessPosterGame, createGuessPosterGame, getPublicGuessPosterGame, isCorrectGuess, normalizeGuess, scoreForCorrectGuess } from './server/watchPartyGame.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
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
