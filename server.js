'use strict';
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const express = require('express');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const { Server } = require('socket.io');

const PORT = Number(process.env.PORT || 3000);
const SECRET = process.env.JWT_SECRET || 'development-only-change-this-secret-before-deploying';
if (process.env.NODE_ENV === 'production' && SECRET === 'development-only-change-this-secret-before-deploying') throw new Error('Refusing to start in production without a custom JWT_SECRET.');
if (SECRET.length < 32) console.warn('WARNING: Set a strong JWT_SECRET before public deployment.');

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'operation-strike.sqlite'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS player_stats (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  matches INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  kills INTEGER NOT NULL DEFAULT 0,
  deaths INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS match_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_code TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  team TEXT NOT NULL,
  kills INTEGER NOT NULL,
  deaths INTEGER NOT NULL,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false }, pingInterval: 15000, pingTimeout: 10000 });
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '16kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/health', (_req, res) => res.json({ ok: true, game: 'OPERATION: STRIKE', version: '0.4.0' }));
function requireAuth(req,res,next){
  try{const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!token)throw new Error('missing');req.user=jwt.verify(token,SECRET);next();}
  catch{return res.status(401).json({error:'Please sign in again.'});}
}
app.get('/api/me',requireAuth,(req,res)=>res.json({id:req.user.id,username:req.user.username}));
app.get('/api/me/stats',requireAuth,(req,res)=>{
 const stats=db.prepare('SELECT matches,wins,kills,deaths FROM player_stats WHERE user_id=?').get(req.user.id)||{matches:0,wins:0,kills:0,deaths:0};
 res.json({username:req.user.username,...stats,winRate:stats.matches?Math.round(stats.wins/stats.matches*100):0});
});
app.get('/api/leaderboard',(_req,res)=>{
 const rows=db.prepare(`SELECT u.username,COALESCE(s.matches,0) matches,COALESCE(s.wins,0) wins,COALESCE(s.kills,0) kills,COALESCE(s.deaths,0) deaths FROM users u LEFT JOIN player_stats s ON s.user_id=u.id ORDER BY wins DESC,kills DESC,deaths ASC LIMIT 20`).all();
 res.json({players:rows});
});

const authWindows = new Map();
function authRateLimit(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const t = Date.now();
  let entry = authWindows.get(key);
  if (!entry || t - entry.startedAt > 15 * 60 * 1000) entry = { startedAt: t, count: 0 };
  entry.count++;
  authWindows.set(key, entry);
  if (entry.count > 20) return res.status(429).json({ error: 'Too many sign-in attempts. Try again in 15 minutes.' });
  next();
}
setInterval(() => { const t=Date.now(); for (const [key,value] of authWindows) if (t-value.startedAt>15*60*1000) authWindows.delete(key); }, 5*60*1000).unref();

function tokenFor(user) {
  return jwt.sign({ id: user.id, username: user.username }, SECRET, { expiresIn: '7d' });
}
app.post('/api/register', authRateLimit, async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!/^[a-zA-Z0-9_]{3,18}$/.test(username))
    return res.status(400).json({ error: 'Username must be 3–18 letters, numbers or underscores.' });
  if (password.length < 8 || password.length > 72)
    return res.status(400).json({ error: 'Password must contain 8–72 characters.' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare('INSERT INTO users (username,password_hash) VALUES (?,?)').run(username, hash);
    const user = { id: Number(result.lastInsertRowid), username };
    res.status(201).json({ token: tokenFor(user), user });
  } catch (error) {
    if (String(error.code).includes('SQLITE_CONSTRAINT')) return res.status(409).json({ error: 'Username is already taken.' });
    console.error(error); res.status(500).json({ error: 'Could not create account.' });
  }
});
app.post('/api/login', authRateLimit, async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!/^[a-zA-Z0-9_]{3,18}$/.test(username) || password.length < 8 || password.length > 72)
    return res.status(400).json({ error: 'Enter a valid username and a password of 8–72 characters.' });
  const row = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username);
  if (!row || !(await bcrypt.compare(password, row.password_hash)))
    return res.status(401).json({ error: 'Incorrect username or password.' });
  const user = { id: row.id, username: row.username };
  res.json({ token: tokenFor(user), user });
});

const CHARACTERS = Array.from({ length: 15 }, (_, i) => ({
  id: 'operator-' + String(i + 1).padStart(2, '0'),
  name: ['Vanguard','Ranger','Nomad','Phantom','Sentinel','Raptor','Ghost','Falcon','Titan','Warden','Striker','Reaper','Scout','Onyx','Atlas'][i],
  color: ['#d1a46b','#7b9a70','#c28b62','#777d91','#9caa9b','#bb7659','#788aa8','#a7a06c','#a67b65','#718e86','#b58c57','#8b6f7e','#7291a0','#777777','#a0a0a0'][i],
  unlocked: true
}));
const WEAPONS = {
  rifle: { name:'Assault Rifle', damage:24, rpm:600, range:55, magazine:30, reloadMs:1800, automatic:true },
  sniper: { name:'Sniper', damage:90, rpm:50, range:110, magazine:5, reloadMs:2600, automatic:false },
  shotgun: { name:'Shotgun', damage:12, rpm:90, range:18, magazine:8, reloadMs:2200, automatic:false },
  pistol: { name:'Pistol', damage:20, rpm:300, range:32, magazine:12, reloadMs:1300, automatic:false }
};
const COLLIDERS = [
  [-18,-16,8,5],[17,-15,7,6],[-18,16,7,5],[18,17,8,5],[0,-21,10,3],[0,21,10,3],
  [-8,0,3,8],[8,0,3,8],[-25,0,3,3],[25,0,3,3],
  [-11,-8,5.5,1.4],[11,8,5.5,1.4],[-12,9,5.5,1.4],[12,-9,5.5,1.4]
];
function isBlocked(x,z){return COLLIDERS.some(([cx,cz,w,d])=>Math.abs(x-cx)<w/2+.58&&Math.abs(z-cz)<d/2+.58);}
function segmentHitsBox(x1,z1,x2,z2,cx,cz,w,d,pad=.58){
 const minX=cx-w/2-pad,maxX=cx+w/2+pad,minZ=cz-d/2-pad,maxZ=cz+d/2+pad;
 const dx=x2-x1,dz=z2-z1;let tMin=0,tMax=1;
 for(const [origin,delta,min,max] of [[x1,dx,minX,maxX],[z1,dz,minZ,maxZ]]){
  if(Math.abs(delta)<1e-9){if(origin<min||origin>max)return false;continue;}
  let a=(min-origin)/delta,b=(max-origin)/delta;if(a>b)[a,b]=[b,a];tMin=Math.max(tMin,a);tMax=Math.min(tMax,b);if(tMin>tMax)return false;
 }
 return tMax>=0&&tMin<=1;
}
function pathBlocked(x1,z1,x2,z2){return COLLIDERS.some(([cx,cz,w,d])=>segmentHitsBox(x1,z1,x2,z2,cx,cz,w,d));}
function pointSegmentDistance(px,pz,x1,z1,x2,z2){const dx=x2-x1,dz=z2-z1,len=dx*dx+dz*dz;if(!len)return Math.hypot(px-x1,pz-z1);const t=Math.max(0,Math.min(1,((px-x1)*dx+(pz-z1)*dz)/len));return Math.hypot(px-(x1+t*dx),pz-(z1+t*dz));}
function hasLineOfSight(shooter,target){return !COLLIDERS.some(([cx,cz,w,d])=>segmentHitsBox(shooter.x,shooter.z,target.x,target.z,cx,cz,w,d,0));}
const rooms = new Map();
const socketsByUser = new Map();
function allowSocketEvent(socket,key,limit=8,windowMs=1000){
 const t=now(), buckets=socket.data.rateBuckets||(socket.data.rateBuckets={});
 const recent=(buckets[key]||[]).filter(stamp=>t-stamp<windowMs);
 if(recent.length>=limit){buckets[key]=recent;return false;}
 recent.push(t);buckets[key]=recent;return true;
}
const now = () => Date.now();
const safePlayer = p => ({ id:p.id, username:p.username, character:p.character, team:p.team, ready:p.ready, kills:p.kills, deaths:p.deaths, health:p.health, x:p.x, y:p.y, z:p.z, yaw:p.yaw, pitch:p.pitch||0, ammo:p.ammo||{} });
function roomView(room) {
  return { id:room.id, name:room.name, hostId:room.hostId, status:room.status, duration:room.duration,
    players:[...room.players.values()].map(safePlayer), maxPlayers:room.maxPlayers, createdAt:room.createdAt };
}
function broadcastRoom(room) { io.to(room.id).emit('room:update', roomView(room)); }
function sendLobby() {
  io.emit('rooms:update', [...rooms.values()].filter(r=>r.status==='waiting').map(r=>({
    id:r.id,name:r.name,players:r.players.size,maxPlayers:r.maxPlayers,host:r.players.get(r.hostId)?.username || 'Host'
  })));
}
function releasePlayer(socket) {
  const roomId = socket.data.roomId;
  if (!roomId) return;
  const room = rooms.get(roomId);
  socket.leave(roomId); socket.data.roomId = null;
  if (!room) return;
  room.players.delete(socket.data.user.id);
  if (room.players.size === 0) {
    clearInterval(room.timer); rooms.delete(roomId);
  } else {
    if (room.hostId === socket.data.user.id) room.hostId = room.players.keys().next().value;
    broadcastRoom(room);
  }
  sendLobby();
}
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Please sign in first.'));
    socket.data.user = jwt.verify(token, SECRET);
    next();
  } catch { next(new Error('Session expired. Please sign in again.')); }
});
io.on('connection', socket => {
  const user = socket.data.user;
  const previousSocket = socketsByUser.get(user.id);
  if (previousSocket && previousSocket.id !== socket.id) previousSocket.disconnect(true);
  socketsByUser.set(user.id, socket);
  socket.emit('characters:list', CHARACTERS);
  socket.emit('weapons:list', WEAPONS);
  socket.emit('rooms:update', [...rooms.values()].filter(r=>r.status==='waiting').map(r=>({id:r.id,name:r.name,players:r.players.size,maxPlayers:r.maxPlayers,host:r.players.get(r.hostId)?.username||'Host'})));

  socket.on('rooms:refresh',()=>socket.emit('rooms:update',[...rooms.values()].filter(r=>r.status==='waiting').map(r=>({id:r.id,name:r.name,players:r.players.size,maxPlayers:r.maxPlayers,host:r.players.get(r.hostId)?.username||'Host'}))));
  socket.on('room:create', (payload={}, ack=()=>{}) => {
    if(!allowSocketEvent(socket,'room:create',3,10000))return ack({ok:false,error:'Please wait before creating another room.'});
    releasePlayer(socket);
    let id;do{id=Math.random().toString(36).slice(2,8).toUpperCase();}while(rooms.has(id));
    const roomName = String(payload.name || 'Combat Room').replace(/[<>]/g, '').trim().slice(0,28) || 'Combat Room';
    const requestedSize = Number(payload.maxPlayers);
    const maxPlayers = Number.isFinite(requestedSize) ? Math.max(2, Math.min(20, Math.floor(requestedSize))) : 10;
    const room = { id, name:roomName, hostId:user.id, status:'waiting',
      duration:600, maxPlayers, players:new Map(), createdAt:now(), timer:null, endsAt:null };
    room.players.set(user.id, makePlayer(user));
    rooms.set(id,room); socket.data.roomId=id; socket.join(id);
    ack({ok:true,room:roomView(room)}); broadcastRoom(room); sendLobby();
  });
  socket.on('room:join', (id, ack=()=>{}) => {
    if(!allowSocketEvent(socket,'room:join',6,10000))return ack({ok:false,error:'Too many join attempts. Wait a moment.'});
    const room=rooms.get(String(id||'').toUpperCase());
    if (!room || room.status!=='waiting') return ack({ok:false,error:'Room is not available.'});
    if(socket.data.roomId===room.id)return ack({ok:true,room:roomView(room)});
    if (room.players.size>=room.maxPlayers) return ack({ok:false,error:'Room is full.'});
    if (socket.data.roomId) releasePlayer(socket);
    room.players.set(user.id,makePlayer(user)); socket.data.roomId=room.id; socket.join(room.id);
    ack({ok:true,room:roomView(room)}); broadcastRoom(room); sendLobby();
  });
  socket.on('room:leave',()=>releasePlayer(socket));
  socket.on('player:character',(characterId,ack=()=>{})=>{
    if(!allowSocketEvent(socket,'player:character',8,10000))return ack({ok:false,error:'Too many character changes. Wait a moment.'});
    const room=rooms.get(socket.data.roomId), player=room?.players.get(user.id);
    if(!room||room.status!=='waiting') return ack({ok:false,error:'Character selection is closed.'});
    const character=CHARACTERS.find(c=>c.id===characterId);
    if(!character) return ack({ok:false,error:'Unknown character.'});
    if(!character.unlocked) return ack({ok:false,error:'This operator is locked in this prototype.'});
    const occupied=[...room.players.values()].some(p=>p.id!==user.id&&p.character===characterId);
    if(occupied) return ack({ok:false,error:'Another player has selected this operator.'});
    player.character=characterId; ack({ok:true}); broadcastRoom(room);
  });
  socket.on('player:team',(team,ack=()=>{})=>{
    if(!allowSocketEvent(socket,'player:team',8,10000))return ack({ok:false,error:'Too many team changes. Wait a moment.'});
    const room=rooms.get(socket.data.roomId), player=room?.players.get(user.id);
    if(!room||room.status!=='waiting'||!['blue','red'].includes(team)) return ack({ok:false,error:'Team cannot be changed.'});
    const count=[...room.players.values()].filter(p=>p.team===team&&p.id!==user.id).length;
    const other=[...room.players.values()].filter(p=>p.team!==team&&p.id!==user.id).length;
    if(count>=Math.ceil(room.maxPlayers/2)) return ack({ok:false,error:'That team is full. Choose the other team.'});
    if(count>other) return ack({ok:false,error:'Choose the smaller team to keep the match balanced.'});
    player.team=team; player.ready=false; ack({ok:true}); broadcastRoom(room);
  });
  socket.on('player:ready',(ready,ack=()=>{})=>{
    if(!allowSocketEvent(socket,'player:ready',10,10000))return ack({ok:false,error:'Too many ready changes. Wait a moment.'});
    const room=rooms.get(socket.data.roomId), player=room?.players.get(user.id);
    if(!room||room.status!=='waiting') return ack({ok:false,error:'Room is not waiting.'});
    if(ready&&(!player.character||!player.team)) return ack({ok:false,error:'Choose an operator and a team before readying up.'});
    player.ready=!!ready; ack({ok:true}); broadcastRoom(room);
  });
  socket.on('room:start',(ack=()=>{})=>{
    if(!allowSocketEvent(socket,'room:start',3,10000))return ack({ok:false,error:'Too many start requests.'});
    const room=rooms.get(socket.data.roomId);
    if(!room||room.hostId!==user.id) return ack({ok:false,error:'Only the room host can start.'});
    if(room.players.size<2) return ack({ok:false,error:'At least 2 players are required.'});
    if([...room.players.values()].some(p=>!p.ready||!p.character||!p.team)) return ack({ok:false,error:'Every player must choose an operator, join a team and be ready.'});
    if(new Set([...room.players.values()].map(p=>p.team)).size<2) return ack({ok:false,error:'Both teams need players.'});
    const blueCount=[...room.players.values()].filter(p=>p.team==='blue').length;
    const redCount=room.players.size-blueCount;
    if(Math.abs(blueCount-redCount)>1) return ack({ok:false,error:'Teams must be balanced before the match starts.'});
    room.status='playing'; room.endsAt=now()+room.duration*1000;room.participants=new Map(room.players);
    for(const p of room.players.values()){p.health=100;p.kills=0;p.deaths=0;p.x=p.team==='blue'?-12:12;p.z=(Math.random()-.5)*10;p.y=0;p.ready=true;p.ammo=Object.fromEntries(Object.entries(WEAPONS).map(([key,w])=>[key,w.magazine]));p.reloadingUntil=0;p.respawnAt=0;}
    room.timer=setInterval(()=>{
      const remaining=Math.max(0,Math.ceil((room.endsAt-now())/1000));
      io.to(room.id).emit('game:clock',{remaining});
      if(remaining<=0){clearInterval(room.timer);room.status='finished';persistMatch(room);io.to(room.id).emit('game:finished',resultFor(room));broadcastRoom(room);sendLobby();}
    },1000);
    ack({ok:true}); io.to(room.id).emit('game:start',{room:roomView(room),weapons:WEAPONS,remaining:room.duration});
  });
  socket.on('player:move',(input={})=>{
    const room=rooms.get(socket.data.roomId), p=room?.players.get(user.id);
    if(!room||room.status!=='playing'||!p||p.health<=0)return;
    const correct=()=>socket.emit('player:correct',{x:p.x,z:p.z,yaw:p.yaw,pitch:p.pitch||0});
    if(!allowSocketEvent(socket,'player:move',20,1000)){correct();return;}
    const x=Number(input.x),z=Number(input.z),yaw=Number(input.yaw),pitch=Number(input.pitch||0);
    if(![x,z,yaw,pitch].every(Number.isFinite)||Math.abs(yaw)>Math.PI||Math.abs(pitch)>1.25){correct();return;}
    const dt=Math.min(0.25,Math.max(.02,(now()-(p.lastMove||now()))/1000));
    const turnDelta=Math.atan2(Math.sin(yaw-(p.yaw||0)),Math.cos(yaw-(p.yaw||0)));
    if(Math.abs(turnDelta)>8*dt+.25){correct();return;}
    if(Math.abs(x)>31||Math.abs(z)>31||isBlocked(x,z)||pathBlocked(p.x,p.z,x,z)){correct();return;}
    const max=9.5*dt+0.25;
    for(const other of room.players.values())if(other.id!==p.id&&other.health>0&&pointSegmentDistance(other.x,other.z,p.x,p.z,x,z)<0.72){correct();return;}
    const dist=Math.hypot(x-p.x,z-p.z);
    if(dist>max){correct();return;}
    p.x=x;p.z=z;p.yaw=yaw;p.pitch=pitch;p.lastMove=now();
    socket.to(room.id).emit('player:moved',{id:p.id,x:p.x,z:p.z,yaw:p.yaw});
  });
  socket.on('weapon:fire',(input={},ack=()=>{})=>{
    const room=rooms.get(socket.data.roomId), shooter=room?.players.get(user.id);
    if(!room||room.status!=='playing'||!shooter||shooter.health<=0)return ack({ok:false,error:'You are not active in this match.'});
    if(!allowSocketEvent(socket,'weapon:fire',30,1000))return ack({ok:false,error:'Shot rate limited.'});
    const key=WEAPONS[input.weapon]?input.weapon:'rifle', weapon=WEAPONS[key], t=now();
    const requestedYaw=Number(input.yaw),requestedPitch=Number(input.pitch);
    const angleDelta=Math.atan2(Math.sin(requestedYaw-(shooter.yaw||0)),Math.cos(requestedYaw-(shooter.yaw||0)));
    if(!Number.isFinite(requestedYaw)||!Number.isFinite(requestedPitch)||Math.abs(angleDelta)>.28||Math.abs(requestedPitch-(shooter.pitch||0))>.28) return ack({ok:false,error:'Aim state rejected. Keep your aim synchronized.'});
    const yaw=shooter.yaw||0,pitch=shooter.pitch||0;
    if(shooter.reloadingUntil>t)return ack({ok:false,error:'Reloading.'});
    if(t-(shooter.lastShot||0)<60000/weapon.rpm*.85)return ack({ok:false,error:'Fire rate limited.'});
    if(shooter.ammo[key]===undefined)shooter.ammo[key]=weapon.magazine;
    if(shooter.ammo[key]<=0)return ack({ok:false,error:'Reload required.'});
    shooter.lastShot=t;shooter.ammo[key]--;
    const dir={x:-Math.sin(yaw)*Math.cos(pitch),y:Math.sin(pitch),z:-Math.cos(yaw)*Math.cos(pitch)};
    let target=null,best=weapon.range;
    for(const p of room.players.values()){
      if(p.team===shooter.team||p.health<=0)continue;
      const dx=p.x-shooter.x,dy=-0.55,dz=p.z-shooter.z;
      const along=dx*dir.x+dy*dir.y+dz*dir.z;
      if(along<=0||along>weapon.range)continue;
      const perpendicular=Math.sqrt(Math.max(0,dx*dx+dy*dy+dz*dz-along*along));
      const radius=key==='shotgun'?1.5:.75;
      if(perpendicular<radius&&along<best&&hasLineOfSight(shooter,p)){best=along;target=p;}
    }
    if(target){
      const damage=key==='shotgun'?weapon.damage*5:weapon.damage;
      target.health=Math.max(0,target.health-damage);
      io.to(room.id).emit('combat:hit',{from:user.id,to:target.id,damage,health:target.health});
      if(target.health===0){shooter.kills++;target.deaths++;target.health=0;target.respawnAt=now()+3500;io.to(room.id).emit('combat:elimination',{killer:user.id,victim:target.id});}
      broadcastScores(room);
    }
    ack({ok:true,ammo:shooter.ammo[key],hit:!!target});
  });
  socket.on('weapon:reload',(key,ack=()=>{})=>{
    const room=rooms.get(socket.data.roomId),p=room?.players.get(user.id),w=WEAPONS[key];
    if(!room||room.status!=='playing'||!p||!w||p.health<=0)return ack({ok:false,error:'Cannot reload now.'});
    if(!allowSocketEvent(socket,'weapon:reload',5,3000))return ack({ok:false,error:'Reload request rate limited.'});
    if(p.reloadingUntil>now())return ack({ok:false,error:'Already reloading.'});
    p.reloadingUntil=now()+w.reloadMs;
    setTimeout(()=>{if(rooms.get(room.id)!==room||room.status!=='playing'||room.players.get(user.id)!==p||!socket.connected)return;p.ammo[key]=w.magazine;p.reloadingUntil=0;socket.emit('weapon:reloaded',{weapon:key,ammo:w.magazine});},w.reloadMs);
    ack({ok:true});
  });
  socket.on('disconnect',()=>{releasePlayer(socket);if(socketsByUser.get(user.id)===socket)socketsByUser.delete(user.id);});
});
function makePlayer(user){return {id:user.id,username:user.username,character:null,team:null,ready:false,kills:0,deaths:0,health:100,x:0,y:0,z:0,yaw:0,pitch:0,ammo:{},lastShot:0,lastMove:now(),reloadingUntil:0,respawnAt:0};}
function broadcastScores(room){io.to(room.id).emit('score:update',resultFor(room));}
function persistMatch(room){
 if(room.statsSaved)return;room.statsSaved=true;
 const participants=[...(room.participants||room.players).values()];
 const totals={blue:0,red:0};for(const p of participants)if(p.team)totals[p.team]+=p.kills;
 const winner=totals.blue===totals.red?'draw':totals.blue>totals.red?'blue':'red';
 const save=db.transaction(()=>{for(const p of participants){db.prepare(`INSERT INTO player_stats(user_id,matches,wins,kills,deaths) VALUES(?,1,?,?,?) ON CONFLICT(user_id) DO UPDATE SET matches=matches+1,wins=wins+excluded.wins,kills=kills+excluded.kills,deaths=deaths+excluded.deaths`).run(p.id,p.team===winner&&winner!=='draw'?1:0,p.kills,p.deaths);db.prepare('INSERT INTO match_history(room_code,user_id,team,kills,deaths,result) VALUES(?,?,?,?,?,?)').run(room.id,p.id,p.team||'none',p.kills,p.deaths,p.team===winner?'win':winner==='draw'?'draw':'loss');}});
 save();
}
function resultFor(room){
 const players=[...(room.status==='finished'&&room.participants?room.participants:room.players).values()].sort((a,b)=>b.kills-a.kills);
 const totals={blue:0,red:0};for(const p of players)if(p.team)totals[p.team]+=p.kills;
 return {players:players.map(p=>({id:p.id,username:p.username,team:p.team,kills:p.kills,deaths:p.deaths,health:p.health})),totals,winner:totals.blue===totals.red?'draw':totals.blue>totals.red?'blue':'red'};
}
setInterval(()=>{
 for(const room of rooms.values())if(room.status==='playing')for(const p of room.players.values()){
  if(p.health===0&&p.respawnAt&&now()>=p.respawnAt){p.health=100;p.x=p.team==='blue'?-12:12;p.z=(Math.random()-.5)*10;p.respawnAt=0;io.to(room.id).emit('player:respawn',{id:p.id,x:p.x,z:p.z});}
 }
},250);
server.listen(PORT,'0.0.0.0',()=>console.log('OPERATION: STRIKE listening on port '+PORT));
