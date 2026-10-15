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
