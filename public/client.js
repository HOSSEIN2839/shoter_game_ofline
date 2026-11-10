import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const $ = id => document.getElementById(id);
const screens = ['authScreen','lobbyScreen','roomScreen','gameScreen','resultsScreen'];
const show = id => screens.forEach(s => $(s).classList.toggle('hidden',s!==id));
let token=localStorage.getItem('os_token')||'', user=null, socket=null, currentRoom=null, characters=[], weapons={}, ammoByWeapon={}, authMode='login', selectedCharacter=null, selectedTeam=null, isReady=false;
let scene,camera,renderer,clock,localMesh,remoteMeshes=new Map(),keys={},yaw=0,pitch=0,velocity=0,gameActive=false,weaponKey='rifle',ammo=30,lastFire=0,moveTimer=0,fireHeld=false,sniperScoped=false,minimapTimer=0,weaponView=null,muzzleTimer=null;
const gltfLoader=new GLTFLoader(),gltfCache=new Map(),animationMixers=new Set();
const assetManifestPromise=fetch('/assets/characters/manifest.json').then(r=>r.ok?r.json():{models:{}}).catch(()=>({models:{}}));
const weaponOrder=['rifle','sniper','shotgun','pistol'];
const weaponDefaults={rifle:{name:'ASSAULT RIFLE',magazine:30},sniper:{name:'SNIPER RIFLE',magazine:5},shotgun:{name:'SHOTGUN',magazine:8},pistol:{name:'SIDEARM',magazine:12}};
function message(id,text,ok=false){$(id).textContent=text;$(id).style.color=ok?'#68d6a1':'#ff6b70';}
function connect(){
 if(!token)return;
 socket=io({auth:{token}});
 socket.on('connect',()=>{ $('connection').classList.add('online');$('connection').innerHTML='<i></i> CONNECTED';});
 socket.on('disconnect',()=>{ $('connection').classList.remove('online');$('connection').innerHTML='<i></i> DISCONNECTED';});
 socket.on('connect_error',e=>message('authMessage',e.message));
 socket.on('characters:list',list=>{characters=list;});
 socket.on('weapons:list',list=>{weapons=list;});
 socket.on('rooms:update',renderRooms);
 socket.on('room:update',room=>{currentRoom=room;renderRoom(room);});
 socket.on('game:start',data=>startGame(data));
 socket.on('game:clock',data=>{const m=Math.floor(data.remaining/60),s=data.remaining%60;$('clock').textContent=m+':'+String(s).padStart(2,'0');});
 socket.on('score:update',renderScores);
 socket.on('game:finished',data=>{fireHeld=false;if(document.pointerLockElement)document.exitPointerLock();destroyGame();showResults(data);});
 socket.on('player:moved',data=>{const mesh=remoteMeshes.get(data.id);if(mesh){mesh.userData.targetPosition={x:data.x,z:data.z};mesh.userData.targetYaw=data.yaw;}});
 socket.on('player:correct',data=>{if(localMesh){localMesh.position.x=data.x;localMesh.position.z=data.z;yaw=data.yaw;pitch=data.pitch||0;}});
 socket.on('player:respawn',data=>{if(data.id===user.id){localMesh.position.set(data.x,0,data.z);localMesh.visible=true;$('health').textContent='100';$('healthBar').style.width='100%';$('gameNotice').textContent='RESPAWNED · BACK IN ACTION';}else{const mesh=remoteMeshes.get(data.id);if(mesh){mesh.position.set(data.x,0,data.z);mesh.visible=true;}}});
 socket.on('combat:elimination',data=>{if(data.victim===user.id){localMesh.visible=false;$('gameNotice').textContent='ELIMINATED · RESPAWNING';showKillFeed('YOU WERE ELIMINATED');}else{const victim=remoteMeshes.get(data.victim);if(victim)victim.visible=false;if(data.killer===user.id){$('gameNotice').textContent='TARGET ELIMINATED';showKillFeed('TARGET ELIMINATED');setTimeout(()=>{$('gameNotice').textContent='WASD MOVE · MOUSE AIM · CLICK FIRE';},1200);}else showKillFeed('PLAYER ELIMINATED');}});
 socket.on('combat:hit',data=>{if(data.to===user.id){$('health').textContent=data.health;$('healthBar').style.width=data.health+'%';}});
 socket.on('weapon:reloaded',data=>{ammoByWeapon[data.weapon]=data.ammo;if(data.weapon===weaponKey){ammo=data.ammo;$('ammo').textContent=ammo+' / ∞';}});
}
function authRequest(pathname,body){
 return fetch('/api/'+pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||'Request failed');return d;});
}
$('authForm').addEventListener('submit',async e=>{
 e.preventDefault();message('authMessage','');
 try{const data=await authRequest(authMode==='login'?'login':'register',{username:$('username').value,password:$('password').value});token=data.token;user=data.user;localStorage.setItem('os_token',token);enterLobby();}
 catch(err){message('authMessage',err.message);}
});
document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{authMode=b.dataset.tab;document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===b));$('authSubmit').innerHTML=authMode==='login'?'ENTER THE GAME <span>↗</span>':'CREATE ACCOUNT <span>↗</span>';$('password').autocomplete=authMode==='login'?'current-password':'new-password';}));
function enterLobby(){ $('userBadge').textContent=user.username;$('userBadge').classList.remove('hidden');show('lobbyScreen');connect();loadPlayerPanels();}
async function loadPlayerPanels(){if(!token)return;try{const headers={Authorization:'Bearer '+token};const [me,stats,board]=await Promise.all([fetch('/api/me',{headers}),fetch('/api/me/stats',{headers}),fetch('/api/leaderboard')]);if(!me.ok||!stats.ok)return;const st=await stats.json(),lb=await board.json();$('profileSummary').textContent=st.matches+' MATCHES · '+st.wins+' WINS · '+st.kills+' KILLS · '+st.deaths+' DEATHS';$('winRate').textContent=st.winRate+'% WIN RATE';$('leaderboardList').innerHTML=lb.players.slice(0,8).map((p,i)=>'<div class="leader-row"><span>'+String(i+1).padStart(2,'0')+' · '+escapeHtml(p.username)+'</span><strong>'+p.wins+' W</strong><small>'+p.kills+' K</small></div>').join('')||'<p class="tiny muted">No completed matches yet.</p>';}catch(error){console.warn('Could not load player stats',error);}}
$('logoutBtn').onclick=()=>{if(socket)socket.disconnect();socket=null;token='';user=null;localStorage.removeItem('os_token');$('userBadge').classList.add('hidden');show('authScreen');};
$('createRoom').onclick=()=>socket?.emit('room:create',{name:$('roomName').value,maxPlayers:Number($('maxPlayers').value)},res=>{if(!res.ok)alert(res.error);});
$('refreshRooms').onclick=()=>socket?.emit('rooms:refresh');
function renderRooms(rooms){const list=$('roomList');if(!rooms.length){list.innerHTML='<p class="muted">No open rooms. Create one and invite your friends.</p>';return;}list.innerHTML=rooms.map(r=>'<div class="room-item"><div><strong>'+escapeHtml(r.name)+'</strong><small>HOST: '+escapeHtml(r.host)+' · '+r.players+'/'+r.maxPlayers+' PLAYERS</small></div><button class="join-btn" data-room="'+r.id+'">JOIN ↗</button></div>').join('');list.querySelectorAll('[data-room]').forEach(b=>b.onclick=()=>socket.emit('room:join',b.dataset.room,res=>{if(!res.ok)alert(res.error);}));}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function renderRoom(room){
 show('roomScreen');$('roomTitle').textContent=room.name.toUpperCase();$('roomMeta').textContent=room.players.length+' / '+room.maxPlayers+' OPERATORS · '+room.status.toUpperCase();
 const me=room.players.find(p=>p.id===user.id);selectedCharacter=me?.character||null;selectedTeam=me?.team||null;isReady=!!me?.ready;
 const occupied=new Set(room.players.filter(p=>p.id!==user.id).map(p=>p.character));
 $('characterGrid').innerHTML=characters.map((c,i)=>'<button class="character-card '+(selectedCharacter===c.id?'selected ':'')+(occupied.has(c.id)?'occupied':'')+'" data-char="'+c.id+'" '+(!c.unlocked||occupied.has(c.id)?'disabled':'')+'><div class="character-art style-'+(i%5)+'" style="--c:'+c.color+'"><i></i><b></b></div><strong>'+c.name+'</strong><small>'+(occupied.has(c.id)?'IN USE':c.unlocked?'AVAILABLE':'🔒 LOCKED')+'</small></button>').join('');
 $('characterGrid').querySelectorAll('[data-char]').forEach(b=>b.onclick=()=>socket.emit('player:character',b.dataset.char,res=>{if(!res.ok)message('roomMessage',res.error);else message('roomMessage','Operator selected.',true);}));
 document.querySelectorAll('[data-team]').forEach(b=>b.classList.toggle('active',b.dataset.team===selectedTeam));
 for(const team of ['blue','red']){$(team+'Players').innerHTML=room.players.filter(p=>p.team===team).map(p=>'<div class="player-row"><span>'+escapeHtml(p.username)+'</span><small>'+(p.ready?'READY':'NOT READY')+'</small></div>').join('')||'<p class="tiny muted">No players yet</p>';}
 $('readyBtn').textContent=isReady?'CANCEL READY':"I'M READY ✓";$('readyBtn').disabled=!selectedCharacter||!selectedTeam;
 $('startBtn').classList.toggle('hidden',room.hostId!==user.id);
}
document.querySelectorAll('[data-team]').forEach(b=>b.onclick=()=>socket.emit('player:team',b.dataset.team,res=>{if(!res.ok)message('roomMessage',res.error);}));
$('readyBtn').onclick=()=>socket.emit('player:ready',!isReady,res=>{if(!res.ok)message('roomMessage',res.error);});
$('startBtn').onclick=()=>socket.emit('room:start',res=>{if(!res.ok)message('roomMessage',res.error);});
$('leaveRoom').onclick=()=>{socket.emit('room:leave');currentRoom=null;show('lobbyScreen');};
$('backLobby').onclick=()=>{destroyGame();socket.emit('room:leave');currentRoom=null;show('lobbyScreen');};
function initThree(){
 const host=$('gameCanvas');scene=new THREE.Scene();scene.background=new THREE.Color(0x8797a0);scene.fog=new THREE.Fog(0x8797a0,45,100);
 camera=new THREE.PerspectiveCamera(75,host.clientWidth/host.clientHeight,.1,150);camera.position.set(0,1.65,0);scene.add(camera);
 renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.setSize(host.clientWidth,host.clientHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;host.appendChild(renderer.domElement);
 scene.add(new THREE.HemisphereLight(0xdcecff,0x38412f,2.1));const sun=new THREE.DirectionalLight(0xffe3c1,2.4);sun.position.set(-15,28,10);sun.castShadow=true;scene.add(sun);
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(90,90),new THREE.MeshStandardMaterial({color:0x69745f,roughness:1}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
 const grid=new THREE.GridHelper(90,45,0x73806b,0x58634f);grid.position.y=.015;scene.add(grid);
 const mat=(color)=>new THREE.MeshStandardMaterial({color,roughness:.85});
 function block(x,z,w,h,d,color){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));m.position.set(x,h/2,z);m.castShadow=true;m.receiveShadow=true;scene.add(m);}
 // Compact training-yard arena: perimeter walls, central cover, containers and watch towers.
 // Tactical dressing: concrete lanes, container ribs, barricades and perimeter floodlights.
 const detail=(x,y,z,w,h,d,color,roughness=.82)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness}));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;scene.add(m);return m;};
 // Asphalt firing lanes and painted lane markings.
 detail(0,.012,0,12,.018,66,0x555b59);
 for(let z=-29;z<=29;z+=6){detail(-5.15,.025,z,.12,.025,2.4,0xc7b77c);detail(5.15,.025,z,.12,.025,2.4,0xc7b77c);}
 // Corrugated container faces and corner posts.
 for(const [x,z,w,d,color] of [[-18,-16,8,5,0x536d70],[17,-15,7,6,0x6e5948],[-18,16,7,5,0x596b58],[18,17,8,5,0x59616b]]){
   for(let i=0;i<Math.floor(w/.65);i++)detail(x-w/2+.35+i*.65,1.52,z+d/2+.035,.045,2.9,.07,0x9b9b88);
   for(const sx of [-1,1])for(const sz of [-1,1])detail(x+sx*(w/2-.12),1.5,z+sz*(d/2-.12),.24,3,.24,0x343c3d);
 }
 // Low concrete jersey barriers create readable cover without blocking the whole arena.
 for(const [x,z,rot] of [[-11,-8,.18],[11,8,-.18],[-12,9,-.2],[12,-9,.2]]){
   const b=detail(x,.58,z,5.5,1.16,.72,0x777b73);b.rotation.y=rot;
   for(let i=-2;i<=2;i++)detail(x+i*1.05,1.18,z,.07,.08,.76,0xaaa99a);
 }
 // Sandbag positions near the center and team approaches.
 for(const [x,z] of [[-4,-12],[4,12],[-22,4],[22,-4]]){
   for(let row=0;row<2;row++)for(let i=0;i<3;i++){
     const bag=new THREE.Mesh(new THREE.CapsuleGeometry(.32,.62,3,6),mat(0x8a8063));
     bag.rotation.z=Math.PI/2;bag.position.set(x+(i-1)*.62+(row%2)*.2,.34+row*.38,z);bag.castShadow=true;scene.add(bag);
   }
 }
 // Watchtower frames and bright lamps at the four corners.
 for(const [x,z] of [[-27,-27],[27,-27],[-27,27],[27,27]]){
   for(const sx of [-1,1])for(const sz of [-1,1])detail(x+sx*.9,2.6,z+sz*.9,.13,5.2,.13,0x41494a);
   detail(x,5.15,z,2.2,.18,2.2,0x41494a);
   const lamp=new THREE.PointLight(0xffd99a,22,15,2);lamp.position.set(x,5.45,z);scene.add(lamp);
   detail(x,5.5,z,.42,.18,.42,0xffd99a,.35);
 }
 block(0,-34,70,5,2,0x59615e);block(0,34,70,5,2,0x59615e);block(-34,0,2,5,70,0x59615e);block(34,0,2,5,70,0x59615e);
 [[-18,-16,8,3,5],[17,-15,7,3,6],[-18,16,7,3,5],[18,17,8,3,5],[0,-21,10,2.5,3],[0,21,10,2.5,3],[-8,0,3,2.3,8],[8,0,3,2.3,8],[-25,0,3,4,3],[25,0,3,4,3]].forEach((a,i)=>block(...a,i%2?0x68746c:0x7d6650));
 for(let i=0;i<12;i++){const x=(i%4)*15-22,z=Math.floor(i/4)*18-18;const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.18,.3,2.8,7),mat(0x5c4632));trunk.position.set(x,1.4,z);scene.add(trunk);const crown=new THREE.Mesh(new THREE.ConeGeometry(1.4,3.6,7),mat(0x3e5941));crown.position.set(x,4,z);scene.add(crown);}
 for(let i=0;i<18;i++){const x=(Math.random()-.5)*58,z=(Math.random()-.5)*58;const crate=new THREE.Mesh(new THREE.BoxGeometry(1.2,1.1,1.2),mat(0x8a795a));crate.position.set(x,.55,z);crate.castShadow=true;scene.add(crate);}
 localMesh=makeOperator(0x4b94c8,null,'blue');scene.add(localMesh);localMesh.visible=false;
 if(currentRoom)syncRemotePlayers(currentRoom.players);
 clock=new THREE.Clock();window.addEventListener('resize',resizeGame);animate();
}
async function applyCharacterAsset(fallbackMesh,characterId,team){
 try{
  const manifest=await assetManifestPromise,src=manifest.models?.[characterId];
  if(!src||!src.startsWith('/assets/characters/')||!src.toLowerCase().endsWith('.glb')||!scene||fallbackMesh.parent!==scene)return;
  let pending=gltfCache.get(src);
  if(!pending){pending=gltfLoader.loadAsync(src);gltfCache.set(src,pending);}
  const gltf=await pending;if(!scene||fallbackMesh.parent!==scene)return;
  const model=cloneSkinned(gltf.scene),bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
  if(!Number.isFinite(size.y)||size.y<.2)throw new Error('Invalid character model bounds');
  model.scale.setScalar(1.8/size.y);
  const fitted=new THREE.Box3().setFromObject(model),center=fitted.getCenter(new THREE.Vector3());
  model.position.set(-center.x,-fitted.min.y,-center.z);
  model.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;if(node.material){node.material=Array.isArray(node.material)?node.material.map(m=>m.clone()):node.material.clone();}}});
  const pivot=new THREE.Group();pivot.add(model);pivot.position.copy(fallbackMesh.position);pivot.rotation.copy(fallbackMesh.rotation);pivot.visible=fallbackMesh.visible;
  const band=new THREE.Mesh(new THREE.TorusGeometry(.13,.035,8,18),new THREE.MeshStandardMaterial({color:team==='blue'?0x348be8:0xe04d4d,metalness:.15,roughness:.6}));
  band.rotation.x=Math.PI/2;band.position.set(.22,1.28,0);pivot.add(band);
  pivot.userData.targetPosition=fallbackMesh.userData.targetPosition;pivot.userData.targetYaw=fallbackMesh.userData.targetYaw;
  const mixer=new THREE.AnimationMixer(model),actions={};
  for(const clip of gltf.animations||[]){const key=clip.name.toLowerCase();actions[key]=mixer.clipAction(clip);}
  pivot.userData.animationMixer=mixer;pivot.userData.animationActions=actions;pivot.userData.activeAnimation='';
  if(Object.keys(actions).length){animationMixers.add(mixer);playOperatorAnimation(pivot,'idle');}
  const parent=fallbackMesh.parent;parent.add(pivot);parent.remove(fallbackMesh);
  if(localMesh===fallbackMesh)localMesh=pivot;
  for(const [id,mesh] of remoteMeshes)if(mesh===fallbackMesh)remoteMeshes.set(id,pivot);
 }catch(error){console.warn('GLB operator unavailable; using procedural fallback:',characterId,error.message);gltfCache.delete((await assetManifestPromise).models?.[characterId]);}
}
function playOperatorAnimation(model,state){
 const actions=model?.userData?.animationActions;if(!actions)return;
 const keys=Object.keys(actions),wanted=keys.find(k=>k.includes(state))||(state==='run'?keys.find(k=>k.includes('walk')):null)||(state==='idle'?keys.find(k=>k.includes('stand')):null)||keys[0];
 if(!wanted||model.userData.activeAnimation===wanted)return;
 const next=actions[wanted],current=actions[model.userData.activeAnimation];
 if(current)current.fadeOut(.12);next.reset().fadeIn(.12).play();model.userData.activeAnimation=wanted;
}
function makeOperator(_teamColor,characterId,team){
 const group=new THREE.Group(),index=Math.max(0,characters.findIndex(c=>c.id===characterId));
 const palette=[0x596b4d,0x4d6258,0x7a6650,0x515968,0x68715d,0x76584a,0x465c69,0x77724e,0x66574c,0x4c6864,0x806443,0x594b5c,0x526c78,0x50545a,0x74756c];
 const uniform=palette[index%palette.length],dark=0x252d31,skin=[0xb98263,0xd0a17d,0x9a6d55,0xc18d70][index%4];
 const material=(color,roughness=.88)=>new THREE.MeshStandardMaterial({color,roughness});
 const part=(geometry,color,x,y,z,rx=0,ry=0,rz=0)=>{const mesh=new THREE.Mesh(geometry,material(color));mesh.position.set(x,y,z);mesh.rotation.set(rx,ry,rz);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;};
 part(new THREE.CapsuleGeometry(.34,.72,4,8),uniform,0,1.05,0);
 part(new THREE.BoxGeometry(.64,.62,.28),0x343d3c,0,1.14,-.035);
 part(new THREE.BoxGeometry(.48,.54,.12),uniform,0,1.17,-.205);
 for(let i=-1;i<=1;i++)part(new THREE.BoxGeometry(.115,.17,.055),0x9a8054,i*.15,1.12,-.28);
 for(const side of [-1,1]){part(new THREE.CapsuleGeometry(.105,.48,4,7),uniform,side*.43,1.08,0,0,0,side*.1);part(new THREE.SphereGeometry(.14,8,7),dark,side*.47,.77,-.015);part(new THREE.SphereGeometry(.17,8,7),0x39433e,side*.39,1.34,0);}
 for(const side of [-1,1]){part(new THREE.CapsuleGeometry(.14,.55,4,7),uniform,side*.19,.42,0);part(new THREE.BoxGeometry(.2,.16,.25),0x343b39,side*.19,.39,-.12);part(new THREE.BoxGeometry(.22,.16,.36),dark,side*.19,.11,-.07);}
 part(new THREE.CylinderGeometry(.11,.12,.18,8),skin,0,1.55,0);
 part(new THREE.SphereGeometry(.205,12,10),skin,0,1.76,0);
 if(index%5===0||index%5===3){part(new THREE.SphereGeometry(.235,12,9,0,Math.PI*2,0,Math.PI/2),dark,0,1.86,0);part(new THREE.BoxGeometry(.34,.055,.19),0x303a3c,0,1.82,-.12);}
 else if(index%5===1){const beret=part(new THREE.SphereGeometry(.24,10,7),0x39443c,0,1.91,0);beret.scale.set(1.15,.38,1);part(new THREE.BoxGeometry(.08,.035,.08),0xb08a4e,.13,1.95,-.04);}
 else if(index%5===2){part(new THREE.BoxGeometry(.38,.11,.28),0x354039,0,1.91,0);part(new THREE.BoxGeometry(.28,.035,.22),0x222a2b,0,1.86,-.08);}
 else{part(new THREE.BoxGeometry(.42,.07,.3),0x414a45,0,1.9,0);part(new THREE.SphereGeometry(.08,8,6),0x222a2b,0,1.82,-.17);}
 if(index%3===0)part(new THREE.BoxGeometry(.29,.13,.12),0x303b39,0,1.68,-.15);
 if(index%5===3)part(new THREE.BoxGeometry(.38,.055,.08),0xb08a4e,0,1.72,-.18);
 part(new THREE.BoxGeometry(.12,.055,.09),0xb08a4e,0,1.96,-.02);
 for(const side of [-1,1])part(new THREE.CylinderGeometry(.045,.045,.06,8),0x252a2b,side*.21,1.76,0,Math.PI/2,0,0);
 const pack=part(new THREE.BoxGeometry(index%2===0?.42:.32,index%3===0?.62:.48,.2),0x343f39,0,1.13,.23);
 if(index%4===1)part(new THREE.BoxGeometry(.12,.25,.14),0x6b604b,-.25,1.05,.08);
 if(index%4===2)part(new THREE.BoxGeometry(.12,.18,.14),0x6b604b,.25,1.08,.08);
 part(new THREE.CylinderGeometry(.012,.012,.3,5),0x242a2a,.16,1.65,.25);
 const teamColor=team==='blue'?0x368ce8:team==='red'?0xd84c55:0xaaaaaa;
 part(new THREE.BoxGeometry(.14,.13,.28),teamColor,.47,1.28,0);
 return group;
}
function addRemote(p){if(remoteMeshes.has(p.id))return;const m=makeOperator(0,p.character,p.team);m.position.set(p.x||0,0,p.z||0);scene.add(m);remoteMeshes.set(p.id,m);applyCharacterAsset(m,p.character,p.team);}
function syncRemotePlayers(players){const active=new Set(players.filter(p=>p.id!==user.id).map(p=>p.id));for(const [id,mesh] of remoteMeshes)if(!active.has(id)){scene.remove(mesh);remoteMeshes.delete(id);}for(const p of players)if(p.id!==user.id){if(!remoteMeshes.has(p.id))addRemote(p);else{const mesh=remoteMeshes.get(p.id);mesh.visible=p.health>0;}}}
function startGame(data){currentRoom=data.room;show('gameScreen');if(!scene)initThree();const me=currentRoom.players.find(p=>p.id===user.id);if(localMesh)scene.remove(localMesh);localMesh=makeOperator(0,me?.character,me?.team);scene.add(localMesh);applyCharacterAsset(localMesh,me?.character,me?.team);localMesh.visible=true;localMesh.position.set(me?.x||0,0,me?.z||0);camera.position.set(localMesh.position.x,1.65,localMesh.position.z);yaw=me?.yaw||0;pitch=me?.pitch||0;camera.rotation.set(0,yaw,0);ammoByWeapon={...(me?.ammo||{})};$('health').textContent='100';$('healthBar').style.width='100%';setWeapon('rifle');$('gameNotice').textContent='CLICK TO LOCK MOUSE · WASD MOVE · LEFT CLICK FIRE';$('compassHeading').textContent='N';gameActive=true;syncRemotePlayers(currentRoom.players);renderMinimap();renderScores({players:currentRoom.players,totals:{blue:0,red:0}});}
function resizeGame(){if(!renderer)return;const h=$('gameCanvas');camera.aspect=h.clientWidth/h.clientHeight;camera.updateProjectionMatrix();renderer.setSize(h.clientWidth,h.clientHeight);}
function isBlocked(x,z){const boxes=[[-18,-16,8,5],[17,-15,7,6],[-18,16,7,5],[18,17,8,5],[0,-21,10,3],[0,21,10,3],[-8,0,3,8],[8,0,3,8],[-25,0,3,3],[25,0,3,3],[-11,-8,5.5,1.4],[11,8,5.5,1.4],[-12,9,5.5,1.4],[12,-9,5.5,1.4]];return boxes.some(([cx,cz,w,d])=>Math.abs(x-cx)<w/2+.58&&Math.abs(z-cz)<d/2+.58);}
function animate(){if(!renderer)return;requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05);for(const mixer of animationMixers)mixer.update(dt);for(const mesh of remoteMeshes.values()){const target=mesh.userData.targetPosition;if(target){const distance=Math.hypot(target.x-mesh.position.x,target.z-mesh.position.z);playOperatorAnimation(mesh,distance>.12?'run':'idle');mesh.position.x=THREE.MathUtils.damp(mesh.position.x,target.x,14,dt);mesh.position.z=THREE.MathUtils.damp(mesh.position.z,target.z,14,dt);mesh.rotation.y=THREE.MathUtils.damp(mesh.rotation.y,mesh.userData.targetYaw||0,14,dt);}}if(gameActive&&localMesh){const forward=(keys.KeyW?1:0)-(keys.KeyS?1:0),side=(keys.KeyD?1:0)-(keys.KeyA?1:0);const speed=keys.ShiftLeft?9:5.5,length=Math.hypot(forward,side)||1;playOperatorAnimation(localMesh,(forward||side)?(keys.ShiftLeft?'run':'walk'):'idle');const dx=(-Math.sin(yaw)*forward+Math.cos(yaw)*side)*speed*dt/length,dz=(-Math.cos(yaw)*forward-Math.sin(yaw)*side)*speed*dt/length;const nextX=THREE.MathUtils.clamp(localMesh.position.x+dx,-31,31),nextZ=THREE.MathUtils.clamp(localMesh.position.z+dz,-31,31);if(!isBlocked(nextX,localMesh.position.z))localMesh.position.x=nextX;if(!isBlocked(localMesh.position.x,nextZ))localMesh.position.z=nextZ;localMesh.rotation.y=yaw;camera.position.set(localMesh.position.x,1.65,localMesh.position.z);camera.rotation.order='YXZ';camera.rotation.y=yaw;camera.rotation.x=pitch;moveTimer+=dt;minimapTimer+=dt;if(moveTimer>.08){socket.emit('player:move',{x:localMesh.position.x,z:localMesh.position.z,yaw,pitch});moveTimer=0;}if(minimapTimer>.12){renderMinimap();minimapTimer=0;}if(fireHeld)fire();}renderer.render(scene,camera);}
function renderMinimap(){const map=$('minimap');if(!map||!localMesh)return;map.querySelectorAll('.map-dot').forEach(n=>n.remove());const dot=(x,z,team,local=false)=>{const el=document.createElement('i');el.className='map-dot '+team+(local?' self':'');el.style.left=((x+34)/68*100)+'%';el.style.top=((z+34)/68*100)+'%';map.appendChild(el);};dot(localMesh.position.x,localMesh.position.z,'self',true);for(const [id,mesh] of remoteMeshes){const p=currentRoom?.players.find(x=>x.id===id);if(p&&mesh.visible)dot(mesh.position.x,mesh.position.z,p.team||'red');}const dirs=['N','NE','E','SE','S','SW','W','NW'];$('compassHeading').textContent=dirs[Math.round((((-yaw%(Math.PI*2))+Math.PI*2)%(Math.PI*2))/(Math.PI/4))%8];}
function setWeapon(key){weaponKey=key;const w=weaponDefaults[key];ammo=ammoByWeapon[key]??w.magazine;$('weaponName').textContent=w.name;$('ammo').textContent=ammo+' / ∞';if(sniperScoped&&key!=='sniper')setScope(false);buildWeaponView(key);}
function buildWeaponView(key){
 if(!camera)return;if(weaponView)camera.remove(weaponView);
 const group=new THREE.Group(),metal=new THREE.MeshStandardMaterial({color:0x30383a,metalness:.72,roughness:.36}),polymer=new THREE.MeshStandardMaterial({color:0x20282a,roughness:.72}),accent=new THREE.MeshStandardMaterial({color:0x9a7847,roughness:.65});
 const box=(w,h,d,mat,x,y,z)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=false;group.add(m);return m;};
 const cylinder=(r,len,mat,x,y,z)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,len,10),mat);m.rotation.x=Math.PI/2;m.position.set(x,y,z);group.add(m);return m;};
 const length=key==='sniper'?0.82:key==='shotgun'?.62:key==='pistol'?.34:.55;
 box(key==='shotgun'?.22:.18,.14,.38,polymer,0,0,0);
 box(.17,.1,.28,metal,0,.035,-.12);
 cylinder(key==='shotgun'?.035:.024,length,metal,0,.025,-.18-length/2);
 box(.12,.2,.16,polymer,0,-.13,.07);
 box(.12,.1,.22,polymer,0,-.015,.27);
 if(key==='sniper'){box(.16,.07,.2,polymer,0,.14,-.08);cylinder(.055,.22,metal,0,.17,-.08);box(.08,.08,.08,accent,0,.12,-.08);}
 else if(key==='rifle'){box(.1,.11,.16,polymer,0,.12,-.04);box(.07,.05,.1,accent,0,.19,-.04);}
 else if(key==='shotgun'){box(.11,.1,.16,polymer,0,.1,-.05);}
 const flash=new THREE.Mesh(new THREE.SphereGeometry(.075,8,8),new THREE.MeshBasicMaterial({color:0xffbd55,transparent:true,opacity:.9}));flash.position.set(0,.025,-.18-length-.05);flash.visible=false;group.add(flash);group.userData.flash=flash;
 group.position.set(.34,-.29,-.48);camera.add(group);weaponView=group;
}
function triggerMuzzleFlash(){const flash=weaponView?.userData.flash;if(!flash)return;flash.visible=true;clearTimeout(muzzleTimer);muzzleTimer=setTimeout(()=>{if(flash)flash.visible=false;},55);}
function showKillFeed(text){const feed=$('killFeed');if(!feed)return;const item=document.createElement('div');item.className='kill-feed-item';item.textContent=text;feed.prepend(item);while(feed.children.length>4)feed.lastElementChild.remove();setTimeout(()=>item.remove(),3500);}
function setScope(enabled){sniperScoped=!!enabled&&weaponKey==='sniper';if(camera){camera.fov=sniperScoped?30:75;camera.updateProjectionMatrix();}$('gameScreen').classList.toggle('scoped',sniperScoped);}
function fire(){if(!gameActive||!renderer||document.pointerLockElement!==renderer.domElement)return;const w=weapons[weaponKey]||{rpm:600};if(Date.now()-lastFire<60000/w.rpm)return;lastFire=Date.now();triggerMuzzleFlash();socket.emit('weapon:fire',{weapon:weaponKey,yaw,pitch},res=>{if(res?.ok){ammo=res.ammo;ammoByWeapon[weaponKey]=ammo;$('ammo').textContent=ammo+' / ∞';}else if(res?.error==='Reload required.')$('ammo').textContent='RELOAD (R)';});}
function destroyGame(){gameActive=false;fireHeld=false;setScope(false);clearTimeout(muzzleTimer);animationMixers.clear();if(renderer){window.removeEventListener('resize',resizeGame);renderer.dispose();$('gameCanvas').innerHTML='';renderer=null;scene=null;camera=null;weaponView=null;remoteMeshes.clear();}}
function renderScores(data){$('blueScore').textContent=data.totals.blue;$('redScore').textContent=data.totals.red;const me=data.players.find(p=>p.id===user.id);if(me){$('myKills').textContent=me.kills;$('myDeaths').textContent=me.deaths;}const rows=data.players.slice().sort((a,b)=>b.kills-a.kills||a.deaths-b.deaths).map(p=>'<tr><td>'+escapeHtml(p.username)+'</td><td>'+String(p.team||'').toUpperCase()+'</td><td>'+p.kills+'</td><td>'+p.deaths+'</td><td>'+(p.kills/Math.max(1,p.deaths)).toFixed(2)+'</td></tr>').join('');$('scoreboardRows').innerHTML=rows;}
function showResults(data){gameActive=false;$('winnerTitle').innerHTML=data.winner==='draw'?'MATCH <span class="accent">DRAW</span>':(data.winner==='blue'?'BLUE':'RED')+' <span class="accent">TEAM WINS</span>';const rows=data.players.map(p=>'<div class="final-row"><span>'+escapeHtml(p.username)+' · '+p.team.toUpperCase()+'</span><strong>'+p.kills+' K</strong><strong>'+p.deaths+' D</strong><span>'+((p.kills/Math.max(1,p.deaths)).toFixed(2))+' K/D</span></div>').join('');$('finalScores').innerHTML='<div class="final-row"><strong>PLAYER</strong><strong>KILLS</strong><strong>DEATHS</strong><strong>K/D</strong></div>'+rows;show('resultsScreen');}
window.addEventListener('keydown',e=>{if(e.code==='Tab'&&gameActive){e.preventDefault();$('scoreboard').classList.remove('hidden');return;}keys[e.code]=true;if(e.code.startsWith('Digit')){const n=Number(e.code.slice(5))-1;if(weaponOrder[n])setWeapon(weaponOrder[n]);}if(e.code==='KeyR'&&gameActive)socket.emit('weapon:reload',weaponKey);});
window.addEventListener('keyup',e=>{keys[e.code]=false;if(e.code==='Tab')$('scoreboard').classList.add('hidden');});
$('gameCanvas').addEventListener('click',()=>{if(renderer&&gameActive)renderer.domElement.requestPointerLock();});
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==renderer?.domElement&&gameActive)$('gameNotice').textContent='CLICK TO RESUME';});
document.addEventListener('mousemove',e=>{if(document.pointerLockElement===renderer?.domElement){yaw=THREE.MathUtils.euclideanModulo(yaw-e.movementX*.0022+Math.PI,Math.PI*2)-Math.PI;pitch=THREE.MathUtils.clamp(pitch-e.movementY*.0022,-1.2,1.2);}});
document.addEventListener('mousedown',e=>{if(e.button===0&&gameActive){if(weapons[weaponKey]?.automatic)fireHeld=true;else fire();}if(e.button===2&&gameActive&&weaponKey==='sniper')setScope(true);});
document.addEventListener('mouseup',e=>{if(e.button===0)fireHeld=false;if(e.button===2&&sniperScoped)setScope(false);});
window.addEventListener('blur',()=>{fireHeld=false;keys={};$('scoreboard').classList.add('hidden');if(sniperScoped)setScope(false);});
window.addEventListener('contextmenu',e=>{if(gameActive)e.preventDefault();});
$('backLobby').onclick=()=>{if(socket)socket.emit('room:leave');currentRoom=null;destroyGame();show('lobbyScreen');loadPlayerPanels();};
if(token){fetch('/api/me',{headers:{Authorization:'Bearer '+token}}).then(async r=>{if(!r.ok)throw Error('Session expired');user=await r.json();enterLobby();}).catch(()=>{localStorage.removeItem('os_token');token='';user=null;show('authScreen');});}
