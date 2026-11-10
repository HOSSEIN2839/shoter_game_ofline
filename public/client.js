// OFFLINE SINGLE-PLAYER EDITION — main branch
// Browser-only game logic. No accounts, sockets, API endpoints or Node.js runtime.
import * as THREE from 'three';

const $ = id => document.getElementById(id);
const menu=$('menu'), game=$('game'), result=$('result'), host=$('gameCanvas');
let scene,camera,renderer,clock,raf,muzzleFlash=null,active=false,paused=false,health=100,kills=0,wave=1;
let enemies=[],keys={},weapon='rifle',ammo={},lastShot=0,reloading=false,playerSpeed=7,yaw=0,pitch=0;
let velocityY=0,grounded=true,aiming=false,footstepTimer=0,weaponKick=0;
const PLAYER_EYE=1.7,GRAVITY=22,JUMP_SPEED=8.2;
const difficultyLevel=()=>({easy:0,normal:1,hard:2}[$('difficulty').value]??1);
const weapons={
 rifle:{label:'ASSAULT RIFLE',mag:30,ammo:30,damage:28,rate:125,range:65,pellets:1},
 sniper:{label:'SNIPER RIFLE',mag:5,ammo:5,damage:100,rate:850,range:110,pellets:1},
 shotgun:{label:'SHOTGUN',mag:8,ammo:8,damage:17,rate:650,range:19,pellets:7},
 pistol:{label:'SIDEARM',mag:12,ammo:12,damage:24,rate:300,range:35,pellets:1}
};
const obstacles=[];
const material=(color,roughness=.85)=>new THREE.MeshStandardMaterial({color,roughness});
function show(which){menu.classList.toggle('hidden',which!=='menu');game.classList.toggle('hidden',which!=='game');result.classList.toggle('hidden',which!=='result');document.body.classList.toggle('in-game',which==='game');}
function box(x,y,z,w,h,d,color){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;scene.add(m);return m;}
function blocked(x,z,r=.65){return obstacles.some(o=>Math.abs(x-o.x)<o.w/2+r&&Math.abs(z-o.z)<o.d/2+r);}
function makeArena(){
 scene=new THREE.Scene();scene.background=new THREE.Color(0x82929a);scene.fog=new THREE.Fog(0x82929a,48,105);
 const viewWidth=Math.max(1,host.clientWidth||window.innerWidth),viewHeight=Math.max(1,host.clientHeight||window.innerHeight);camera=new THREE.PerspectiveCamera(75,viewWidth/viewHeight,.1,150);camera.position.set(0,1.7,25);scene.add(camera);
 const viewWeapon=new THREE.Group();
 const receiver=new THREE.Mesh(new THREE.BoxGeometry(.22,.17,.62),material(0x27313a));receiver.position.set(.34,-.27,-.58);viewWeapon.add(receiver);
 const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.035,.04,.55,8),material(0x111820));barrel.rotation.x=Math.PI/2;barrel.position.set(.34,-.22,-1.12);viewWeapon.add(barrel);
 const stock=new THREE.Mesh(new THREE.BoxGeometry(.16,.13,.28),material(0x414b4c));stock.position.set(.34,-.28,-.18);viewWeapon.add(stock);
 const grip=new THREE.Mesh(new THREE.BoxGeometry(.12,.23,.15),material(0x20272c));grip.position.set(.34,-.45,-.42);grip.rotation.x=-.18;viewWeapon.add(grip);
 const sight=new THREE.Mesh(new THREE.BoxGeometry(.07,.08,.12),material(0x101519));sight.position.set(.34,-.16,-.58);viewWeapon.add(sight);
 muzzleFlash=new THREE.Mesh(new THREE.SphereGeometry(.085,8,6),new THREE.MeshBasicMaterial({color:0xffbd54}));muzzleFlash.position.set(.34,-.22,-1.42);muzzleFlash.visible=false;viewWeapon.add(muzzleFlash);
 camera.add(viewWeapon);
 renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setSize(host.clientWidth,host.clientHeight);renderer.shadowMap.enabled=true;host.replaceChildren(renderer.domElement);
 scene.add(new THREE.HemisphereLight(0xdcecff,0x38412f,2.1));const sun=new THREE.DirectionalLight(0xffe3c1,2.2);sun.position.set(-15,28,10);sun.castShadow=true;scene.add(sun);
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(90,90),material(0x69745f));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
 const grid=new THREE.GridHelper(90,45,0x73806b,0x58634f);grid.position.y=.02;scene.add(grid);
 obstacles.length=0;
 const add=(x,z,w,h,d,c)=>{box(x,h/2,z,w,h,d,c);obstacles.push({x,z,w,d});};
 add(0,-34,70,5,2,0x59615e);add(0,34,70,5,2,0x59615e);add(-34,0,2,5,70,0x59615e);add(34,0,2,5,70,0x59615e);
 [[-18,-16,8,5],[17,-15,7,6],[-18,16,7,5],[18,17,8,5],[0,-21,10,3],[0,21,10,3],[-8,0,3,8],[8,0,3,8],[-25,0,3,3],[25,0,3,3]].forEach((a,i)=>add(a[0],a[1],a[2],3,a[3],i%2?0x68746c:0x7d6650));
 for(const [x,z] of [[-11,-8],[11,8],[-12,9],[12,-9]]){const b=box(x,.58,z,5.5,1.16,.72,0x777b73);b.rotation.y=.15;obstacles.push({x,z,w:5.5,d:.72});}
 for(let i=0;i<16;i++){const x=(i%4)*15-22,z=Math.floor(i/4)*18-18;const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.18,.3,2.8,7),material(0x5c4632));trunk.position.set(x,1.4,z);scene.add(trunk);const crown=new THREE.Mesh(new THREE.ConeGeometry(1.4,3.6,7),material(0x3e5941));crown.position.set(x,4,z);scene.add(crown);}
}
function makeOperator(color,isEnemy=false){
 const g=new THREE.Group(),body=new THREE.Mesh(new THREE.CapsuleGeometry(.34,.78,4,8),material(color));body.position.y=1.02;body.castShadow=true;g.add(body);
 const head=new THREE.Mesh(new THREE.SphereGeometry(.25,12,10),material(0xc49b78));head.position.y=1.72;g.add(head);
 const helmet=new THREE.Mesh(new THREE.SphereGeometry(.28,12,8,0,Math.PI*2,0,Math.PI/2),material(isEnemy?0x343d42:0x343d39));helmet.position.y=1.86;g.add(helmet);
 const pack=new THREE.Mesh(new THREE.BoxGeometry(.48,.55,.2),material(0x343d37));pack.position.set(0,1.12,-.32);g.add(pack);
 return g;
}
function spawnEnemies(count){
 enemies.forEach(e=>scene.remove(e.mesh));enemies=[];
 const colors=[0x9c594c,0x756d56,0x555e70,0x8b6c4c,0x596d62,0x7b5968,0x66645a,0x4f6872];
 for(let i=0;i<count;i++){let x,z,tries=0;do{x=(Math.random()-.5)*48;z=(Math.random()-.5)*48;tries++;}while((Math.hypot(x,z-25)<12||blocked(x,z))&&tries<80);
 const mesh=makeOperator(colors[i%colors.length],true);mesh.position.set(x,0,z);scene.add(mesh);
 enemies.push({mesh,health:100,speed:1.6+Math.random()*.9,cooldown:1+Math.random()*2,phase:Math.random()*5,alive:true,strafe:Math.random()<.5?-1:1});
 }
 updateHud();
}
function updateHud(){
 $('health').textContent=Math.max(0,Math.ceil(health));$('healthBottom').textContent=Math.max(0,Math.ceil(health))+'%';$('healthBar').style.width=Math.max(0,health)+'%';
 $('kills').textContent=kills;$('hostiles').textContent=enemies.filter(e=>e.alive).length;$('wave').textContent=wave;
 $('weaponName').textContent=weapons[weapon].label;$('ammo').textContent=ammo[weapon]+' / '+weapons[weapon].mag;
}
function start(){
 health=100;kills=0;wave=1;Object.keys(weapons).forEach(k=>ammo[k]=weapons[k].ammo);weapon='rifle';paused=false;active=true;reloading=false;yaw=0;pitch=0;keys={};
 show('game');$('notice').textContent='LOADING BATTLEFIELD…';
 requestAnimationFrame(()=>{try{makeArena();camera.position.set(0,1.7,25);camera.rotation.set(0,0,0);spawnEnemies(Number($('enemyCount').value));clock=new THREE.Clock();$('notice').textContent='CLICK THE ARENA TO CAPTURE MOUSE';cancelAnimationFrame(raf);animate();}catch(error){active=false;show('menu');console.error(error);alert('The 3D scene could not start: '+error.message);}});
}
let audioContext=null;
function soundShot(){try{audioContext=audioContext||new (window.AudioContext||window.webkitAudioContext)();if(audioContext.state==='suspended')audioContext.resume();const t=audioContext.currentTime;const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type='sawtooth';osc.frequency.setValueAtTime(115,t);osc.frequency.exponentialRampToValueAtTime(38,t+.12);gain.gain.setValueAtTime(.16,t);gain.gain.exponentialRampToValueAtTime(.001,t+.16);osc.connect(gain);gain.connect(audioContext.destination);osc.start(t);osc.stop(t+.17);const n=audioContext.createBuffer(1,Math.floor(audioContext.sampleRate*.11),audioContext.sampleRate),d=n.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length);const src=audioContext.createBufferSource(),ng=audioContext.createGain();src.buffer=n;ng.gain.setValueAtTime(.11,t);ng.gain.exponentialRampToValueAtTime(.001,t+.11);src.connect(ng);ng.connect(audioContext.destination);src.start(t);}catch(e){}}
function soundEnemyShot(){try{audioContext=audioContext||new (window.AudioContext||window.webkitAudioContext)();if(audioContext.state==='suspended')audioContext.resume();const o=audioContext.createOscillator(),g=audioContext.createGain();o.type='triangle';o.frequency.setValueAtTime(95,audioContext.currentTime);o.frequency.exponentialRampToValueAtTime(48,audioContext.currentTime+.09);g.gain.setValueAtTime(.035,audioContext.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.1);o.connect(g);g.connect(audioContext.destination);o.start();o.stop(audioContext.currentTime+.11);}catch(e){}}
function soundReload(){try{audioContext=audioContext||new (window.AudioContext||window.webkitAudioContext)();const o=audioContext.createOscillator(),g=audioContext.createGain();o.frequency.value=520;g.gain.value=.035;o.connect(g);g.connect(audioContext.destination);o.start();o.stop(audioContext.currentTime+.07);}catch(e){}}
function shoot(){
 if(!active||paused||document.pointerLockElement!==renderer.domElement||reloading)return;
 const w=weapons[weapon],now=performance.now();if(now-lastShot<w.rate)return;lastShot=now;
 if(ammo[weapon]<=0){reload();return;}ammo[weapon]--;soundShot();if(muzzleFlash){muzzleFlash.visible=true;setTimeout(()=>{if(muzzleFlash)muzzleFlash.visible=false;},55);}updateHud();
 const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(0,0),camera);ray.far=w.range;
 const targets=enemies.filter(e=>e.alive).map(e=>e.mesh);const hit=ray.intersectObjects(targets,true)[0];
 if(hit){let enemy=enemies.find(e=>e.alive&&(e.mesh===hit.object||e.mesh.children.includes(hit.object)));if(enemy){enemy.health-=w.damage;if(enemy.health<=0){enemy.alive=false;enemy.mesh.visible=false;kills++;$('notice').textContent='HOSTILE ELIMINATED';if(enemies.every(e=>!e.alive)){wave++;setTimeout(()=>{if(active){spawnEnemies(Math.min(3+wave*2,12));$('notice').textContent='WAVE '+wave+' — INCOMING HOSTILES';}},1300);}}}}
 updateHud();
}
function reload(){soundReload();if(reloading||ammo[weapon]===weapons[weapon].mag)return;reloading=true;$('notice').textContent='RELOADING';setTimeout(()=>{ammo[weapon]=weapons[weapon].mag;reloading=false;updateHud();$('notice').textContent='';},weapon==='sniper'?1900:1400);}
function damagePlayer(amount){health=Math.max(0,health-amount);updateHud();if(health<=0){active=false;if(document.pointerLockElement)document.exitPointerLock();cancelAnimationFrame(raf);$('resultTitle').textContent='YOU WERE ELIMINATED';$('resultText').textContent='Hostiles eliminated: '+kills+' · Wave reached: '+wave;show('result');}}
function updateEnemies(dt){
 const player={x:camera.position.x,z:camera.position.z};
 for(const e of enemies){if(!e.alive)continue;const p=e.mesh.position,dx=player.x-p.x,dz=player.z-p.z,dist=Math.hypot(dx,dz);e.phase+=dt;
 if(dist>5){const nx=dx/(dist||1),nz=dz/(dist||1),step=e.speed*dt;const tx=p.x+nx*step,tz=p.z+nz*step;if(!blocked(tx,p.z,.5))p.x=tx;if(!blocked(p.x,tz,.5))p.z=tz;}
 else {p.x+=Math.cos(e.phase*1.7)*e.strafe*dt*.5;p.z+=Math.sin(e.phase*1.4)*dt*.35;}
 e.mesh.rotation.y=Math.atan2(dx,dz);
 e.cooldown-=dt;if(dist<30&&e.cooldown<=0){soundEnemyShot();e.cooldown=(difficultyLevel()===2 ? 0.65 : difficultyLevel()===0 ? 1.8 : 1.15)+Math.random()*.65;const accuracy=difficultyLevel()===2 ? 0.72 : difficultyLevel()===0 ? 0.28 : 0.48;if(Math.random()<accuracy)damagePlayer(difficultyLevel()===2 ? 9 : 6);}
 }
}
function animate(){
 if(!active)return;raf=requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05);
 if(!paused){
 const forward=(keys.KeyW?1:0)-(keys.KeyS?1:0),side=(keys.KeyD?1:0)-(keys.KeyA?1:0),len=Math.hypot(forward,side)||1,speed=(keys.ShiftLeft?playerSpeed*1.5:playerSpeed)*(aiming?.62:1);
 const fx=Math.sin(yaw),fz=-Math.cos(yaw),rx=Math.cos(yaw),rz=Math.sin(yaw);
 const dx=(fx*forward+rx*side)/len*speed*dt,dz=(fz*forward+rz*side)/len*speed*dt;
 if(!blocked(camera.position.x+dx,camera.position.z,.55))camera.position.x+=dx;
 if(!blocked(camera.position.x,camera.position.z+dz,.55))camera.position.z+=dz;
 if(keys.Space&&grounded){velocityY=JUMP_SPEED;grounded=false;keys.Space=false;}
 velocityY-=GRAVITY*dt;camera.position.y+=velocityY*dt;if(camera.position.y<=PLAYER_EYE){camera.position.y=PLAYER_EYE;velocityY=0;grounded=true;}
 aiming=!!(keys.MouseRight||keys.KeyC);camera.fov=THREE.MathUtils.lerp(camera.fov,aiming?48:75,Math.min(1,dt*12));camera.updateProjectionMatrix();
 camera.rotation.order='YXZ';camera.rotation.y=yaw;camera.rotation.x=pitch;
 updateEnemies(dt);if(enemies.every(e=>!e.alive)&&active){/* next wave scheduled after last elimination */}
 }
 renderer.render(scene,camera);
}
function finishToMenu(){active=false;cancelAnimationFrame(raf);if(document.pointerLockElement)document.exitPointerLock();if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});show('menu');}
$('start').onclick=start;$('again').onclick=start;$('menuBtn').onclick=finishToMenu;
$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'RESUME':'PAUSE';$('notice').textContent=paused?'PAUSED':'CLICK ARENA TO AIM';if(paused&&document.pointerLockElement)document.exitPointerLock();};
$('fullscreen').onclick=async()=>{try{if(!document.fullscreenElement){await document.documentElement.requestFullscreen();$('fullscreen').textContent='EXIT FULLSCREEN';}else{await document.exitFullscreen();$('fullscreen').textContent='FULLSCREEN';}}catch(error){$('notice').textContent='FULLSCREEN IS NOT AVAILABLE IN THIS BROWSER';}};
document.addEventListener('fullscreenchange',()=>{$('fullscreen').textContent=document.fullscreenElement?'EXIT FULLSCREEN':'FULLSCREEN';});
host.addEventListener('click',()=>{if(active&&!paused)renderer.domElement.requestPointerLock();});
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement===renderer?.domElement)$('notice').textContent='';else if(active&&!paused)$('notice').textContent='CLICK THE ARENA TO RESUME AIM';});
document.addEventListener('mousemove',e=>{if(document.pointerLockElement!==renderer?.domElement||!active||paused)return;yaw-=e.movementX*.0022;pitch=Math.max(-1.25,Math.min(1.25,pitch-e.movementY*.0022));});
document.addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='KeyR')reload();if(/^Digit[1-4]$/.test(e.code)){weapon=['rifle','sniper','shotgun','pistol'][Number(e.code.slice(-1))-1];updateHud();}if(e.code==='Escape'&&active){$('notice').textContent='CLICK THE ARENA TO RESUME';}});
document.addEventListener('keyup',e=>keys[e.code]=false);
document.addEventListener('mousedown',e=>{if(e.button===0)shoot();if(e.button===2)aiming=true;});
document.addEventListener('mouseup',e=>{if(e.button===2)aiming=false;});
document.addEventListener('contextmenu',e=>{if(active)e.preventDefault();});
window.addEventListener('resize',()=>{if(!renderer||!camera)return;const w=Math.max(1,host.clientWidth||window.innerWidth),h=Math.max(1,host.clientHeight||window.innerHeight);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);});
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
