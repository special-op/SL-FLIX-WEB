import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
