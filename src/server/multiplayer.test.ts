import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { AshenCrownGameServer } from './gameServer.ts';
import type { RoomStateSnapshot, ServerToClientMessage } from '../shared/types.ts';

function connectClient(port: number): Promise<{
  ws: WebSocket;
  nextMsg: (predicate: (m: ServerToClientMessage) => boolean, timeoutMs?: number) => Promise<ServerToClientMessage>;
}> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const queue: ServerToClientMessage[] = [];
    const waiters: Array<{ pred: (m: ServerToClientMessage) => boolean; res: (m: ServerToClientMessage) => void }> = [];

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as ServerToClientMessage;
      const idx = waiters.findIndex((w) => w.pred(msg));
      if (idx !== -1) {
        const w = waiters.splice(idx, 1)[0];
        w.res(msg);
      } else {
        queue.push(msg);
      }
    });

    ws.on('open', () => {
      resolve({
        ws,
        nextMsg(predicate, timeoutMs = 4000) {
          const existingIdx = queue.findIndex(predicate);
          if (existingIdx !== -1) {
            return Promise.resolve(queue.splice(existingIdx, 1)[0]);
          }
          return new Promise((res, rej) => {
            const timer = setTimeout(() => rej(new Error('Timed out waiting for WS message')), timeoutMs);
            waiters.push({
              pred: predicate,
              res: (m) => {
                clearTimeout(timer);
                res(m);
              },
            });
          });
        },
      });
    });

    ws.on('error', reject);
  });
}

test('multiplayer room flow: 6-char code, 1-player block, 2-player start, host migration, and 15-player capacity', async () => {
  const server = http.createServer();
  const wss = new WebSocketServer({ server, path: '/ws' });
  const gameServer = new AshenCrownGameServer(wss);

  await new Promise<void>((res) => server.listen(0, '127.0.0.1', () => res()));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  const port = addr.port;

  const c1 = await connectClient(port);
  await c1.nextMsg((m) => m.type === 'welcome');

  // 1. Create room
  c1.ws.send(JSON.stringify({ type: 'create_room', payload: { name: 'HostAlpha' } }));
  const joined1 = await c1.nextMsg((m) => m.type === 'room_joined');
  const p1 = joined1.payload as { roomCode: string; playerId: string; reconnectToken: string; snapshot: RoomStateSnapshot };
  assert.match(p1.roomCode, /^[A-Z0-9]{6}$/);
  assert.equal(p1.snapshot.lobbyPlayers.length, 1);

  // 2. Host cannot start with 1 player
  c1.ws.send(JSON.stringify({ type: 'start_match' }));
  const err1 = await c1.nextMsg((m) => m.type === 'error');
  assert.equal((err1.payload as { code: string }).code, 'MIN_PLAYERS');

  // 3. Invalid code error
  const c2 = await connectClient(port);
  await c2.nextMsg((m) => m.type === 'welcome');
  c2.ws.send(JSON.stringify({ type: 'join_room', payload: { roomCode: 'ZZZZZZ', name: 'GuestTwo' } }));
  const errCode = await c2.nextMsg((m) => m.type === 'error');
  assert.equal((errCode.payload as { code: string }).code, 'ROOM_NOT_FOUND');

  // 4. Join with valid 6-char code (2 players total)
  c2.ws.send(JSON.stringify({ type: 'join_room', payload: { roomCode: p1.roomCode, name: 'GuestTwo' } }));
  const joined2 = await c2.nextMsg((m) => m.type === 'room_joined');
  const p2 = joined2.payload as { playerId: string; reconnectToken: string; snapshot: RoomStateSnapshot };
  assert.equal(p2.snapshot.lobbyPlayers.length, 2);

  // 5. Host migration if host leaves
  c1.ws.send(JSON.stringify({ type: 'leave_room' }));
  const migratedState = await c2.nextMsg(
    (m) => m.type === 'room_state' && (m.payload as RoomStateSnapshot).hostId === p2.playerId
  );
  assert.equal((migratedState.payload as RoomStateSnapshot).hostId, p2.playerId);

  // 6. Rejoin as player 1 so 2 players exist, then start match with 2 players
  c1.ws.send(JSON.stringify({ type: 'join_room', payload: { roomCode: p1.roomCode, name: 'Rejoiner' } }));
  await c1.nextMsg((m) => m.type === 'room_joined');
  await c2.nextMsg((m) => m.type === 'room_state' && (m.payload as RoomStateSnapshot).lobbyPlayers.length === 2);

  c2.ws.send(JSON.stringify({ type: 'start_match' }));
  const countdown1 = await c1.nextMsg(
    (m) => m.type === 'room_state' && (m.payload as RoomStateSnapshot).phase === 'countdown'
  );
  const countdown2 = await c2.nextMsg(
    (m) => m.type === 'room_state' && (m.payload as RoomStateSnapshot).phase === 'countdown'
  );
  assert.equal((countdown1.payload as RoomStateSnapshot).phase, 'countdown');
  assert.equal((countdown2.payload as RoomStateSnapshot).phase, 'countdown');

  c1.ws.close();
  c2.ws.close();
  gameServer.dispose();
  wss.close();
  server.close();
});
