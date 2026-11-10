'use strict';
const assert = require('node:assert/strict');
const { io } = require('socket.io-client');
const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173';
const password = 'test-password-123';

async function register(username) {
  const response = await fetch(baseUrl + '/api/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const body = await response.json();
  assert.equal(response.status, 201, 'registration should succeed');
  assert.ok(body.token, 'registration should return a JWT');
  return body;
}
function connect(token) {
  const socket = io(baseUrl, { auth: { token }, reconnection: false, timeout: 5000 });
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}
function ack(socket, eventName, ...args) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(eventName + ' acknowledgement timed out')), 5000);
    socket.emit(eventName, ...args, result => { clearTimeout(timer); resolve(result); });
  });
}
function event(socket, name) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(name + ' event timed out')), 7000);
    socket.once(name, payload => { clearTimeout(timer); resolve(payload); });
  });
}
(async () => {
  let host, guest;
  try {
    const [hostAccount, guestAccount] = await Promise.all([register('ci_host_01'), register('ci_guest_01')]);
    [host, guest] = await Promise.all([connect(hostAccount.token), connect(guestAccount.token)]);
    const created = await ack(host, 'room:create', { name: 'CI Arena', maxPlayers: 4 });
    assert.ok(created.ok, 'host should create a room');
    assert.ok((await ack(guest, 'room:join', created.room.id)).ok, 'guest should join');
    const duplicateJoin = await ack(guest, 'room:join', created.room.id);
    assert.ok(duplicateJoin.ok, 'joining the same room twice should be idempotent');
    assert.equal(duplicateJoin.room.players.length, 2, 'duplicate join must not duplicate or reset membership');

    assert.ok((await ack(host, 'player:character', 'operator-01')).ok, 'host selects operator');
    assert.equal((await ack(guest, 'player:character', 'operator-01')).ok, false, 'operator must be exclusive');
    assert.ok((await ack(guest, 'player:character', 'operator-02')).ok, 'guest selects free operator');

    assert.ok((await ack(host, 'player:team', 'blue')).ok, 'host joins blue');
    assert.equal((await ack(guest, 'player:team', 'blue')).ok, false, 'teams must stay balanced');
    assert.ok((await ack(guest, 'player:team', 'red')).ok, 'guest joins red');
    assert.ok((await ack(host, 'player:ready', true)).ok, 'host readies');
    assert.ok((await ack(guest, 'player:ready', true)).ok, 'guest readies');

    const hostStarted = event(host, 'game:start'), guestStarted = event(guest, 'game:start');
    assert.ok((await ack(host, 'room:start')).ok, 'host starts match');
    const [hostGame, guestGame] = await Promise.all([hostStarted, guestStarted]);
    assert.equal(hostGame.room.status, 'playing');
    assert.equal(guestGame.room.players.length, 2);
    assert.equal(hostGame.remaining, 600, 'match duration is ten minutes');
    const profile = await fetch(baseUrl + '/api/me', { headers: { Authorization: 'Bearer ' + hostAccount.token } });
    assert.equal(profile.status, 200, 'Bearer token profile endpoint should work');
    assert.equal((await profile.json()).username, 'ci_host_01');
    const stats = await fetch(baseUrl + '/api/me/stats', { headers: { Authorization: 'Bearer ' + hostAccount.token } });
    assert.equal(stats.status, 200, 'Bearer token stats endpoint should work');
    assert.equal((await stats.json()).matches, 0, 'new account starts with zero matches');
    const unauthenticatedStats = await fetch(baseUrl + '/api/me/stats');
    assert.equal(unauthenticatedStats.status, 401, 'private stats must reject anonymous requests');

    const corrected = event(host, 'player:correct');
    host.emit('player:move', { x: 999, z: 999, yaw: 0, pitch: 0 });
    const correction = await corrected;
    assert.ok(Math.abs(correction.x) <= 31 && Math.abs(correction.z) <= 31, 'server corrects impossible client positions');

    const fired = await ack(host, 'weapon:fire', { weapon: 'rifle', yaw: 0, pitch: 0 });
    assert.ok(fired.ok, 'valid rifle shot is accepted');
    const rejectedTurn = event(host, 'player:correct');
    host.emit('player:move', { x: correction.x, z: correction.z, yaw: Math.PI, pitch: 0 });
    const turnCorrection = await rejectedTurn;
    assert.ok(Math.abs(turnCorrection.yaw) < 0.01, 'server rejects impossible instant 180-degree turns');
    const spoofedAim = await ack(host, 'weapon:fire', { weapon: 'rifle', yaw: Math.PI, pitch: 0 });
    assert.equal(spoofedAim.ok, false, 'server must reject aim direction that differs from replicated player aim');
    assert.equal(fired.ammo, 29, 'rifle magazine decrements');
    const reloadDone = event(host, 'weapon:reloaded');
    assert.ok((await ack(host, 'weapon:reload', 'rifle')).ok, 'reload is accepted');
    assert.equal((await reloadDone).ammo, 30, 'reload restores the magazine');
    console.log('Multiplayer smoke test passed: accounts, sockets, rooms, operator exclusivity, team balance, ready/start, firing and reload.');
  } catch (error) {
    console.error(error); process.exitCode = 1;
  } finally {
    if (host) host.disconnect();
    if (guest) guest.disconnect();
  }
})();
