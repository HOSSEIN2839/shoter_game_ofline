// OFFLINE SINGLE-PLAYER EDITION — main branch
// Browser-only game logic. No accounts, sockets, API endpoints or Node.js runtime.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

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
const obstacles=[],windFoliage=[],hitParticles=[],damagePopups=[];
const gltfLoader=new GLTFLoader();
const operatorModelIds=['army-general','army-officer','army-sniper','combat-engineer','combat-medic','machine-gunner','recon-scout','rifleman'];
const operatorTemplates=new Map();
function getOperatorTemplate(id){
 if(!operatorTemplates.has(id))operatorTemplates.set(id,gltfLoader.loadAsync('/assets/characters/'+id+'.glb'));
 return operatorTemplates.get(id);
}
async function createOperatorModel(id){
 const gltf=await getOperatorTemplate(id),root=cloneSkinned(gltf.scene);
 const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
 const scale=1.8/Math.max(.1,size.y);root.scale.setScalar(scale);root.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
 root.traverse(object=>{if(object.isMesh){object.castShadow=true;object.receiveShadow=true;}});
 root.updateMatrixWorld(true);
 const mixer=new THREE.AnimationMixer(root),actions={};
 for(const clip of gltf.animations){actions[clip.name.toLowerCase()]=mixer.clipAction(clip);}
 return {root,mixer,actions};
}
function playOperatorAction(enemy,name,loop=true){
 if(!enemy.actions)return;
 const action=enemy.actions[name.toLowerCase()];if(!action)return;
 if(enemy.currentAction===action)return;
 if(enemy.currentAction)enemy.currentAction.fadeOut(.16);
 action.reset();action.setLoop(loop?THREE.LoopRepeat:THREE.LoopOnce,loop?Infinity:1);action.clampWhenFinished=!loop;action.fadeIn(.16).play();enemy.currentAction=action;
}
async function replaceWithAnimatedOperator(enemy,id){
 try{
  const model=await createOperatorModel(id);
  if(!active||!enemies.includes(enemy)||!enemy.alive)return;
  model.root.position.x+=enemy.mesh.position.x;model.root.position.z+=enemy.mesh.position.z;
  const fallback=enemy.mesh;scene.remove(fallback);scene.add(model.root);enemy.mesh=model.root;if(enemy.healthBar)model.root.add(enemy.healthBar);enemy.mixer=model.mixer;enemy.actions=model.actions;enemy.currentAction=null;playOperatorAction(enemy,'Idle');
 }catch(error){console.warn('GLB operator unavailable; procedural fallback retained:',id,error);}
}
const material=(color,roughness=.85)=>new THREE.MeshStandardMaterial({color,roughness});
function show(which){menu.classList.toggle('hidden',which!=='menu');game.classList.toggle('hidden',which!=='game');result.classList.toggle('hidden',which!=='result');document.body.classList.toggle('in-game',which==='game');}
function box(x,y,z,w,h,d,color){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;scene.add(m);return m;}
function blocked(x,z,r=.65){return obstacles.some(o=>Math.abs(x-o.x)<o.w/2+r&&Math.abs(z-o.z)<o.d/2+r);}
function hasLineOfSight(from,to){const delta=to.clone().sub(from),distance=delta.length();if(distance<.01)return true;const ray=new THREE.Raycaster(from.clone(),delta.normalize(),.05,distance-.15);return ray.intersectObjects(obstacles.map(o=>o.mesh).filter(Boolean),false).length===0;}
function makeArena(){
 scene=new THREE.Scene();
 scene.background=new THREE.Color(0x9aa7ad);
 scene.fog=new THREE.FogExp2(0x9aa7ad,.0085);
 const viewWidth=Math.max(1,host.clientWidth||window.innerWidth),viewHeight=Math.max(1,host.clientHeight||window.innerHeight);
 camera=new THREE.PerspectiveCamera(75,viewWidth/viewHeight,.1,180);
 camera.position.set(0,1.7,25);scene.add(camera);

 // First-person weapon placeholder.
 const viewWeapon=new THREE.Group();viewWeapon.name='viewWeapon';
 const receiver=new THREE.Mesh(new THREE.BoxGeometry(.22,.17,.62),material(0x27313a));receiver.position.set(.34,-.27,-.58);viewWeapon.add(receiver);
 const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.035,.04,.55,8),material(0x111820));barrel.rotation.x=Math.PI/2;barrel.position.set(.34,-.22,-1.12);viewWeapon.add(barrel);
 const stock=new THREE.Mesh(new THREE.BoxGeometry(.16,.13,.28),material(0x414b4c));stock.position.set(.34,-.28,-.18);viewWeapon.add(stock);
 const grip=new THREE.Mesh(new THREE.BoxGeometry(.12,.23,.15),material(0x20272c));grip.position.set(.34,-.45,-.42);grip.rotation.x=-.18;viewWeapon.add(grip);
 const sight=new THREE.Mesh(new THREE.BoxGeometry(.07,.08,.12),material(0x101519));sight.position.set(.34,-.16,-.58);viewWeapon.add(sight);
 muzzleFlash=new THREE.Mesh(new THREE.SphereGeometry(.085,8,6),new THREE.MeshBasicMaterial({color:0xffbd54}));muzzleFlash.position.set(.34,-.22,-1.42);muzzleFlash.visible=false;viewWeapon.add(muzzleFlash);camera.add(viewWeapon);

 renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.setSize(host.clientWidth,host.clientHeight);
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;host.replaceChildren(renderer.domElement);

 scene.add(new THREE.HemisphereLight(0xdcecff,0x45402f,2.0));
 const sun=new THREE.DirectionalLight(0xffe1bd,2.35);sun.position.set(-24,36,18);sun.castShadow=true;
 sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-48;sun.shadow.camera.right=48;sun.shadow.camera.top=48;sun.shadow.camera.bottom=-48;sun.shadow.bias=-.0002;scene.add(sun);
 const fill=new THREE.DirectionalLight(0xa8c9e8,.55);fill.position.set(24,12,-20);scene.add(fill);

 obstacles.length=0;windFoliage.length=0;hitParticles.length=0;damagePopups.length=0;
 const mat=(color,roughness=.9)=>new THREE.MeshStandardMaterial({color,roughness});
 const metal=(color)=>new THREE.MeshStandardMaterial({color,roughness:.58,metalness:.48});
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(110,110),mat(0x777967));ground.rotation.x=-Math.PI/2;ground.position.y=-.08;ground.receiveShadow=true;scene.add(ground);
 const add=(x,z,w,h,d,c,opts={})=>{
  const mesh=box(x,h/2,z,w,h,d,c);if(opts.rotation)mesh.rotation.y=opts.rotation;
  obstacles.push({x,z,w,d,mesh});return mesh;
 };
 const decoBox=(x,y,z,w,h,d,materialOrColor,rotation=0)=>{
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),typeof materialOrColor==='number'?mat(materialOrColor):materialOrColor);
  mesh.position.set(x,y,z);mesh.rotation.y=rotation;mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);return mesh;
 };
 const cylinder=(x,y,z,rTop,rBottom,h,color,segments=10)=>{
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(rTop,rBottom,h,segments),mat(color));
  mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);return mesh;
 };
 const line=(x,z,w,d,y,color,opacity=1)=>{
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,side:THREE.DoubleSide,depthWrite:opacity===1}));
  mesh.rotation.x=-Math.PI/2;mesh.position.set(x,y,z);scene.add(mesh);return mesh;
 };

 // Dusty perimeter terrain, concrete apron and a worn asphalt service road.
 const asphalt=mat(0x343b3b),concrete=mat(0x929188),sand=mat(0x8b8268);
 const road=new THREE.Mesh(new THREE.PlaneGeometry(9,72),asphalt);road.rotation.x=-Math.PI/2;road.position.y=.008;road.receiveShadow=true;scene.add(road);
 const apron=new THREE.Mesh(new THREE.PlaneGeometry(62,48),concrete);apron.rotation.x=-Math.PI/2;apron.position.set(0,.012,0);apron.receiveShadow=true;scene.add(apron);
 const shoulder1=new THREE.Mesh(new THREE.PlaneGeometry(13,72),sand);shoulder1.rotation.x=-Math.PI/2;shoulder1.position.set(-11,.004,0);scene.add(shoulder1);
 const shoulder2=shoulder1.clone();shoulder2.position.x=11;scene.add(shoulder2);
 for(let z=-30;z<=30;z+=6){line(0,z,.16,2.7,.025,0xd4c99c,.8);}
 line(-4.15,0,.12,68,.026,0xb9b6a8,.55);line(4.15,0,.12,68,.026,0xb9b6a8,.55);
 // Concrete expansion joints and painted tactical markings.
 for(let x=-27;x<=27;x+=9)line(x,0,.045,44,.022,0x656d68,.45);
 for(let z=-21;z<=21;z+=7)line(0,z,58,.045,.023,0x656d68,.38);
 line(0,-27,12,.35,.03,0xe4d9b5,.9);line(0,-27,.35,8,.031,0xe4d9b5,.9);

 // Perimeter wall, warning stripes and corner watch towers.
 add(0,-36,76,5.2,1.4,0x59615f);add(0,36,76,5.2,1.4,0x59615f);
 add(-37,0,1.4,5.2,72,0x59615f);add(37,0,1.4,5.2,72,0x59615f);
 for(let x=-30;x<=30;x+=10){decoBox(x,3.05,-35.22,3.2,.12,.035,0xd0b66e);decoBox(x,3.05,35.22,3.2,.12,.035,0xd0b66e);}
 for(const [x,z] of [[-34,-33],[34,-33],[-34,33],[34,33]]){
  add(x,z,4.2,7,4.2,0x555d59);
  decoBox(x,7.15,z,5.2,.35,5.2,metal(0x4a5354));
  for(const dx of [-1.25,1.25])for(const dz of [-1.25,1.25])cylinder(x+dx,8.1,z+dz,.045,.045,1.6,0x303a3b,8);
  const lamp=new THREE.PointLight(0xffd28a,.55,9);lamp.position.set(x,6.3,z);scene.add(lamp);
 }

 // Main structures: command building, barracks, vehicle garage and maintenance shed.
 const building=(x,z,w,d,h,wallColor,accentColor)=>{
  add(x,z,w,h,d,wallColor);
  decoBox(x,h+.12,z,w+.35,.24,d+.35,metal(0x454e50));
  // Roof parapets.
  decoBox(x,h+.42,z-d/2,w,.55,.18,accentColor);decoBox(x,h+.42,z+d/2,w,.55,.18,accentColor);
  decoBox(x-w/2,h+.42,z,.18,.55,d,accentColor);
  decoBox(x+w/2,h+.42,z,.18,.55,d,accentColor);
  // Recessed dark windows and a heavy entrance.
  for(let wx=-w*.32;wx<=w*.33;wx+=w*.32){
   decoBox(x+wx,h*.58,z-d/2-.012,1.35,.72,.035,metal(0x263b45));
   decoBox(x+wx,h*.58,z-d/2-.04,1.5,.08,.05,metal(0x596a6d));
  }
  decoBox(x,h*.48,z+d/2+.025,1.55,1.9,.09,metal(0x303b3b));
  decoBox(x,h*.48,z+d/2+.08,.12,1.8,.025,metal(0xa58c5b));
  for(let wx=-w*.38;wx<=w*.39;wx+=w*.19)decoBox(x+wx,h+.65,z,.12,.22,.12,0x737b78);
 };
 building(-23,-20,17,12,6.2,0x77786e,0x4b5553);
 building(23,-20,15,12,5.4,0x817b6c,0x505957);
 building(-24,13,13,10,4.8,0x77766b,0x4b5553);
 building(24,13,14,11,5.1,0x777a72,0x4b5553);

 // Loading dock, roller shutters, rooftop HVAC and fuel storage.
 for(const x of [-27,-23,-19,20,24,28]){
  decoBox(x,1.4,-13,2.2,2.8,.12,metal(0x3c4848));
  for(let y=.35;y<2.7;y+=.32)decoBox(x,y,-13.075,2.05,.035,.035,metal(0x78817d));
 }
 for(const [x,z] of [[-28,-19],[-18,-21],[20,-19],[27,-21],[-27,13],[25,13]]){
  const unit=decoBox(x,6.65,z,2.1,.8,1.25,metal(0x69716d));
  for(let k=-2;k<=2;k++)decoBox(x+k*.3,7.08,z,.055,.08,1.1,metal(0x303b3b));
 }
 for(const [x,z] of [[-13,-25],[13,-25]]){
  cylinder(x,1.5,z,1.05,1.05,3,0x68716e,16);
  cylinder(x,3.05,z,1.1,1.1,.12,0x3f4949,16);
  decoBox(x,2.3,z,2.2,.12,.12,0x4c5654);
 }

 // Shipping containers: stacked ribs, doors and corner castings.
 const container=(x,z,color,rotation=0)=>{
  const body=decoBox(x,1.35,z,9,2.7,3,metal(color),rotation);
  obstacles.push({x,z,w:9,d:3,mesh:body});
  for(let i=-4;i<=4;i++){
   const rib=decoBox(x+i*.92,1.35,z-1.53,.075,2.48,.08,metal(0x9a9b8d),rotation);
   const p=new THREE.Vector3(x+i*.92,1.35,z-1.53).sub(new THREE.Vector3(x,1.35,z));
   p.applyAxisAngle(new THREE.Vector3(0,1,0),rotation);rib.position.set(x+p.x,1.35,z+p.z);
  }
  for(const dx of [-4.35,4.35])for(const dz of [-1.38,1.38]){
   const p=new THREE.Vector3(dx,0,dz).applyAxisAngle(new THREE.Vector3(0,1,0),rotation);
   decoBox(x+p.x,1.35,z+p.z,.18,2.65,.18,metal(0xb0a78b),rotation);
  }
  return body;
 };
 container(-10,-23,0x53665c,.04);container(10,-23,0x8b6848,-.04);
 container(-13,23,0x596b72,.12);container(13,23,0x6c6655,-.12);

 // Combat cover: HESCO barriers, concrete jersey barriers, sandbag nests and crates.
 const hesco=(x,z,w=4)=>{
  add(x,z,w,1.35,1.35,0x8b8066);
  for(let y=.22;y<1.25;y+=.28)decoBox(x, y,z,w+.02,.035,1.38,metal(0xaaa083));
  for(let xx=-w/2+.2;xx<w/2;xx+=.42)decoBox(x+xx,.68,z-0.69,.045,1.22,.035,metal(0x5b625c));
 };
 hesco(-8,-8,5);hesco(8,-8,5);hesco(-8,8,5);hesco(8,8,5);
 const jersey=(x,z,rotation=0)=>{
  const m=decoBox(x,.62,z,5.2,1.24,.72,0x858a82,rotation);
  const cap=decoBox(x,1.27,z,5.3,.12,.8,metal(0xb5b4a8),rotation);
  obstacles.push({x,z,w:5.2,d:.9,mesh:m});
 };
 jersey(-17,-5,.08);jersey(17,-5,-.08);jersey(-17,6,-.08);jersey(17,6,.08);
 for(const [x,z] of [[-3,-14],[3,-14],[-3,14],[3,14],[-25,0],[25,0]]){
  add(x,z,2.2,1.35,2.2,0x8b7659);
  for(let i=-1;i<=1;i++)decoBox(x+i*.58,.7,z-1.12,.08,1.25,.08,metal(0x4b514d));
 }
 const crate=(x,z,s=1)=>{
  add(x,z,1.35*s,1.35*s,1.35*s,0x66533d);
  for(let i=-1;i<=1;i++)decoBox(x+i*.35*s,.68*s,z-0.69*s,.07*s,1.25*s,.04*s,metal(0x9a8058));
 };
 for(const [x,z] of [[-14,-2],[-12,2],[14,-2],[12,2],[-4,20],[4,20],[-4,-20],[4,-20]])crate(x,z,.85);

 // Guard rails, traffic control, barrels and warning bollards.
 for(const [x,z,rot] of [[-5,-29,0],[5,-29,0],[-5,29,0],[5,29,0]]){
  for(let i=-2;i<=2;i++)cylinder(x+i*.8,.62,z,.055,.055,1.24,0xd1b77b,8);
  decoBox(x,.95,z,4.2,.1,.12,metal(0x3f4948),rot);
 }
 for(const [x,z] of [[-6,-3],[6,-3],[-6,3],[6,3],[-30,0],[30,0]]){
  cylinder(x,.52,z,.34,.34,1.04,0x9b603b,12);
  cylinder(x,1.06,z,.35,.35,.08,metal(0x414b4b),12);
  for(let y=.2;y<.95;y+=.28)decoBox(x,y,z,.72,.08,.74,0xd1b36b);
 }

 // Floodlight poles and cables.
 for(const [x,z] of [[-31,-15],[31,-15],[-31,15],[31,15],[-8,-31],[8,-31]]){
  cylinder(x,4.2,z,.11,.17,8.4,metal(0x414b4c),10);
  decoBox(x,8.35,z,1.6,.12,.45,metal(0x303a3b));
  for(const dx of [-.48,.48]){
   const lamp=new THREE.SpotLight(0xffe4b5,1.1,24,.65,.5,1);lamp.position.set(x+dx,8.2,z);lamp.target.position.set(x+dx*.7,0,z);scene.add(lamp,lamp.target);
   const bulb=new THREE.Mesh(new THREE.BoxGeometry(.38,.12,.28),new THREE.MeshBasicMaterial({color:0xffdf9b}));bulb.position.set(x+dx,8.22,z);scene.add(bulb);
  }
 }

 // Sparse perimeter trees, scrub and tufts; foliage sways subtly in the wind.
 for(let i=0;i<34;i++){
  const angle=i/34*Math.PI*2,r=31+(i%3)*1.1,x=Math.cos(angle)*r,z=Math.sin(angle)*r;
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.12,.22,2.2,7),mat(0x594634));trunk.position.set(x,1.1,z);trunk.castShadow=true;scene.add(trunk);
  const crown=new THREE.Mesh(new THREE.ConeGeometry(1.15,3.1,7),mat(i%2?0x40563c:0x526343));crown.position.set(x,3.2,z);crown.castShadow=true;crown.receiveShadow=true;scene.add(crown);
  windFoliage.push({mesh:crown,phase:Math.random()*Math.PI*2,amount:.012+Math.random()*.016});
 }
 for(let i=0;i<85;i++){
  const x=(Math.random()-.5)*68,z=(Math.random()-.5)*68;
  if(Math.abs(x)<5||Math.abs(z)<5)continue;
  const tuft=new THREE.Group();tuft.position.set(x,0,z);
  for(let j=0;j<3;j++){
   const blade=new THREE.Mesh(new THREE.ConeGeometry(.09,.55,4),mat(0x68754c));blade.position.set((Math.random()-.5)*.35,.25,(Math.random()-.5)*.35);blade.rotation.z=(Math.random()-.5)*.55;tuft.add(blade);
  }
  scene.add(tuft);
 }
 // Small navigation lights along the inner perimeter.
 for(let x=-27;x<=27;x+=9){
  for(const z of [-33,33]){
   const post=cylinder(x,.55,z,.07,.07,1.1,metal(0x414b4b),8);
   const lamp=new THREE.Mesh(new THREE.SphereGeometry(.12,8,6),new THREE.MeshBasicMaterial({color:0x8ed8d0}));lamp.position.set(x,1.15,z);scene.add(lamp);
  }
 }
}

function createEnemyHealthBar(){
 const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;
 const ctx=canvas.getContext('2d');
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false}));
 sprite.scale.set(1.18,.22,1);sprite.position.set(0,2.18,0);sprite.renderOrder=20;
 sprite.userData.canvas=canvas;sprite.userData.ctx=ctx;sprite.userData.texture=texture;
 return sprite;
}
function updateEnemyHealthBar(enemy){
 const bar=enemy.healthBar;if(!bar)return;
 const ctx=bar.userData.ctx,canvas=bar.userData.canvas,pct=THREE.MathUtils.clamp(enemy.health/100,0,1);
 ctx.clearRect(0,0,canvas.width,canvas.height);
 ctx.fillStyle='rgba(5,9,12,.82)';ctx.fillRect(3,9,250,46);
 ctx.fillStyle='#29333a';ctx.fillRect(8,14,240,36);
 ctx.fillStyle=pct>.55?'#64df9a':pct>.25?'#ffbf4a':'#ff4d55';ctx.fillRect(8,14,240*pct,36);
 ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=3;ctx.strokeRect(8,14,240,36);
 ctx.fillStyle='#fff';ctx.font='bold 18px Arial';ctx.textAlign='center';ctx.fillText(Math.max(0,Math.ceil(enemy.health))+' HP',128,5);
 bar.userData.texture.needsUpdate=true;bar.visible=enemy.alive;
}
function spawnDamagePopup(position,amount,headshot=false){
 const canvas=document.createElement('canvas');canvas.width=256;canvas.height=96;
 const ctx=canvas.getContext('2d');ctx.font='900 58px Arial';ctx.textAlign='center';ctx.textBaseline='middle';
 ctx.lineWidth=8;ctx.strokeStyle='#15191d';ctx.strokeText(String(Math.round(amount)),128,48);
 ctx.fillStyle=headshot?'#ff4b4b':'#ffe08a';ctx.fillText(String(Math.round(amount)),128,48);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false}));
 sprite.position.copy(position);sprite.position.y+=.65;sprite.scale.set(.8,.3,1);sprite.renderOrder=21;scene.add(sprite);
 damagePopups.push({sprite,texture,life:.72,maxLife:.72});
}
function spawnHitParticles(position){
 const colors=[0x9e2028,0xd64040,0x6e151d];
 for(let i=0;i<9;i++){
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(.035+Math.random()*.025,6,5),new THREE.MeshBasicMaterial({color:colors[i%colors.length],transparent:true,opacity:.95}));
  mesh.position.copy(position);scene.add(mesh);
  const velocity=new THREE.Vector3((Math.random()-.5)*2.6,Math.random()*2.1+.35,(Math.random()-.5)*2.6);
  hitParticles.push({mesh,velocity,life:.34+Math.random()*.22});
 }
}
function updateHitEffects(dt){
 for(let i=hitParticles.length-1;i>=0;i--){
  const p=hitParticles[i];p.life-=dt;p.velocity.y-=7*dt;p.mesh.position.addScaledVector(p.velocity,dt);
  if(p.life<=0){scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();hitParticles.splice(i,1);}
 }
 for(let i=damagePopups.length-1;i>=0;i--){
  const p=damagePopups[i];p.life-=dt;p.sprite.position.y+=dt*.72;p.sprite.material.opacity=Math.max(0,p.life/p.maxLife);
  if(p.life<=0){scene.remove(p.sprite);p.texture.dispose();p.sprite.material.dispose();damagePopups.splice(i,1);}
 }
}

function makeOperator(color,isEnemy=false){
 const g=new THREE.Group(),body=new THREE.Mesh(new THREE.CapsuleGeometry(.34,.78,4,8),material(color));body.name='body';body.position.y=1.02;body.castShadow=true;g.add(body);
 const head=new THREE.Mesh(new THREE.SphereGeometry(.25,12,10),material(0xc49b78));head.name='head';head.position.y=1.72;head.castShadow=true;g.add(head);
 const helmet=new THREE.Mesh(new THREE.SphereGeometry(.28,12,8,0,Math.PI*2,0,Math.PI/2),material(isEnemy?0x343d42:0x343d39));helmet.position.y=1.86;g.add(helmet);
 const pack=new THREE.Mesh(new THREE.BoxGeometry(.48,.55,.2),material(0x343d37));pack.position.set(0,1.12,-.32);g.add(pack);
 return g;
}
function spawnEnemies(count){
 enemies.forEach(e=>scene.remove(e.mesh));enemies=[];
 const colors=[0x9c594c,0x756d56,0x555e70,0x8b6c4c,0x596d62,0x7b5968,0x66645a,0x4f6872];
 for(let i=0;i<count;i++){let x,z,tries=0;do{x=(Math.random()-.5)*48;z=(Math.random()-.5)*48;tries++;}while((Math.hypot(x,z-25)<12||blocked(x,z))&&tries<80);
 const mesh=makeOperator(colors[i%colors.length],true);mesh.position.set(x,0,z);scene.add(mesh);
 const enemy={mesh,health:100,healthBar:null,speed:1.6+Math.random()*.9,cooldown:1+Math.random()*2,phase:Math.random()*5,alive:true,strafe:Math.random()<.5?-1:1,mixer:null,actions:null,currentAction:null,actionLockUntil:0};
 enemy.healthBar=createEnemyHealthBar();mesh.add(enemy.healthBar);updateEnemyHealthBar(enemy);enemies.push(enemy);replaceWithAnimatedOperator(enemy,operatorModelIds[i%operatorModelIds.length]);
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
let audioContext=null,damageFlashTimer=null,hitMarkerTimer=null;
function showHitMarker(headshot=false){const marker=$('crosshair');if(!marker)return;marker.classList.remove('hit-confirm','headshot-confirm');void marker.offsetWidth;marker.classList.add(headshot?'headshot-confirm':'hit-confirm');clearTimeout(hitMarkerTimer);hitMarkerTimer=setTimeout(()=>marker.classList.remove('hit-confirm','headshot-confirm'),150);}
function soundShot(){try{audioContext=audioContext||new (window.AudioContext||window.webkitAudioContext)();if(audioContext.state==='suspended')audioContext.resume();const t=audioContext.currentTime;const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type='sawtooth';osc.frequency.setValueAtTime(115,t);osc.frequency.exponentialRampToValueAtTime(38,t+.12);gain.gain.setValueAtTime(.16,t);gain.gain.exponentialRampToValueAtTime(.001,t+.16);osc.connect(gain);gain.connect(audioContext.destination);osc.start(t);osc.stop(t+.17);const n=audioContext.createBuffer(1,Math.floor(audioContext.sampleRate*.11),audioContext.sampleRate),d=n.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length);const src=audioContext.createBufferSource(),ng=audioContext.createGain();src.buffer=n;ng.gain.setValueAtTime(.11,t);ng.gain.exponentialRampToValueAtTime(.001,t+.11);src.connect(ng);ng.connect(audioContext.destination);src.start(t);}catch(e){}}
function soundEnemyShot(){try{audioContext=audioContext||new (window.AudioContext||window.webkitAudioContext)();if(audioContext.state==='suspended')audioContext.resume();const o=audioContext.createOscillator(),g=audioContext.createGain();o.type='triangle';o.frequency.setValueAtTime(95,audioContext.currentTime);o.frequency.exponentialRampToValueAtTime(48,audioContext.currentTime+.09);g.gain.setValueAtTime(.035,audioContext.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.1);o.connect(g);g.connect(audioContext.destination);o.start();o.stop(audioContext.currentTime+.11);}catch(e){}}
function soundReload(){try{audioContext=audioContext||new (window.AudioContext||window.webkitAudioContext)();const o=audioContext.createOscillator(),g=audioContext.createGain();o.frequency.value=520;g.gain.value=.035;o.connect(g);g.connect(audioContext.destination);o.start();o.stop(audioContext.currentTime+.07);}catch(e){}}
function shoot(){
 if(!active||paused||document.pointerLockElement!==renderer.domElement||reloading)return;
 const w=weapons[weapon],now=performance.now();if(now-lastShot<w.rate)return;lastShot=now;
 if(ammo[weapon]<=0){reload();return;}ammo[weapon]--;soundShot();if(muzzleFlash){muzzleFlash.visible=true;setTimeout(()=>{if(muzzleFlash)muzzleFlash.visible=false;},55);}updateHud();
 const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(0,0),camera);ray.far=w.range;
 const targets=enemies.filter(e=>e.alive).map(e=>e.mesh),hit=ray.intersectObjects([...obstacles.map(o=>o.mesh).filter(Boolean),...targets],true)[0];weaponKick=Math.min(.14,weaponKick+.055);
 if(hit){let enemy=enemies.find(e=>e.alive&&(e.mesh===hit.object||e.mesh.getObjectById(hit.object.id)));if(enemy){const headshot=hit.object.name.toLowerCase().includes('head')||hit.point.y>enemy.mesh.position.y+1.55;showHitMarker(headshot);$('notice').textContent=headshot?'HEADSHOT':'TARGET HIT';const dealt=w.damage*(headshot?2:1);enemy.health=Math.max(0,enemy.health-dealt);updateEnemyHealthBar(enemy);spawnHitParticles(hit.point);spawnDamagePopup(hit.point,dealt,headshot);enemy.hitUntil=performance.now()+180;enemy.actionLockUntil=performance.now()+420;playOperatorAction(enemy,'Hit',false);enemy.mesh.traverse(part=>{if(part.isMesh&&part.material&&part.material.emissive){part.material.emissive.setHex(0x661111);setTimeout(()=>part.material.emissive?.setHex(0x000000),150);}});if(enemy.health<=0){enemy.alive=false;playOperatorAction(enemy,'Death',false);if(!enemy.mixer)enemy.mesh.visible=false;else setTimeout(()=>{if(enemy.mesh)enemy.mesh.visible=false;},2300);kills++;$('notice').textContent='HOSTILE ELIMINATED';if(enemies.every(e=>!e.alive)){wave++;setTimeout(()=>{if(active){spawnEnemies(Math.min(3+wave*2,12));$('notice').textContent='WAVE '+wave+' — INCOMING HOSTILES';}},1300);}}}}
 updateHud();
}
function reload(){soundReload();if(reloading||ammo[weapon]===weapons[weapon].mag)return;reloading=true;$('notice').textContent='RELOADING';setTimeout(()=>{ammo[weapon]=weapons[weapon].mag;reloading=false;updateHud();$('notice').textContent='';},weapon==='sniper'?1900:1400);}
function damagePlayer(amount){health=Math.max(0,health-amount);document.body.classList.add('taking-damage');clearTimeout(damageFlashTimer);damageFlashTimer=setTimeout(()=>document.body.classList.remove('taking-damage'),240);updateHud();if(health<=0){active=false;if(document.pointerLockElement)document.exitPointerLock();cancelAnimationFrame(raf);$('resultTitle').textContent='YOU WERE ELIMINATED';$('resultText').textContent='Hostiles eliminated: '+kills+' · Wave reached: '+wave;show('result');}}
function updateEnemies(dt){
 const player={x:camera.position.x,z:camera.position.z};
 for(const e of enemies){if(e.mixer)e.mixer.update(dt);if(!e.alive)continue;const p=e.mesh.position,dx=player.x-p.x,dz=player.z-p.z,dist=Math.hypot(dx,dz);e.phase+=dt;
 const moving=dist>5;
 if(moving){const nx=dx/(dist||1),nz=dz/(dist||1),step=e.speed*dt;const tx=p.x+nx*step,tz=p.z+nz*step;if(!blocked(tx,p.z,.5))p.x=tx;if(!blocked(p.x,tz,.5))p.z=tz;}
 else {p.x+=Math.cos(e.phase*1.7)*e.strafe*dt*.5;p.z+=Math.sin(e.phase*1.4)*dt*.35;}
 if(performance.now()>e.actionLockUntil)playOperatorAction(e,moving?'Walk':'Idle');
 e.mesh.rotation.y=Math.atan2(dx,dz);
 e.cooldown-=dt;if(dist<30&&e.cooldown<=0&&hasLineOfSight(p.clone().add(new THREE.Vector3(0,1.25,0)),camera.position.clone())){soundEnemyShot();e.cooldown=(difficultyLevel()===2 ? 0.65 : difficultyLevel()===0 ? 1.8 : 1.15)+Math.random()*.65;const accuracy=difficultyLevel()===2 ? 0.72 : difficultyLevel()===0 ? 0.28 : 0.48;if(Math.random()<accuracy)damagePlayer(difficultyLevel()===2 ? 9 : 6);}
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
 const weaponModel=camera.children.find(o=>o.name==='viewWeapon');if(weaponModel){weaponModel.position.z=weaponKick;weaponKick*=Math.pow(.025,dt);weaponModel.position.y=aiming?-.035:0;}
 updateEnemies(dt);updateHitEffects(dt);for(const leaf of windFoliage)leaf.mesh.rotation.z=Math.sin(clock.elapsedTime*.85+leaf.phase)*leaf.amount;if(enemies.every(e=>!e.alive)&&active){/* next wave scheduled after last elimination */}
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
document.addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='Space'&&active)e.preventDefault();if(e.code==='KeyR')reload();if(/^Digit[1-4]$/.test(e.code)){weapon=['rifle','sniper','shotgun','pistol'][Number(e.code.slice(-1))-1];updateHud();}if(e.code==='Escape'&&active){$('notice').textContent='CLICK THE ARENA TO RESUME';}});
document.addEventListener('keyup',e=>keys[e.code]=false);
document.addEventListener('mousedown',e=>{if(e.button===0)shoot();if(e.button===2){keys.MouseRight=true;aiming=true;}});
document.addEventListener('mouseup',e=>{if(e.button===2){keys.MouseRight=false;aiming=false;}});
document.addEventListener('contextmenu',e=>{if(active)e.preventDefault();});
window.addEventListener('resize',()=>{if(!renderer||!camera)return;const w=Math.max(1,host.clientWidth||window.innerWidth),h=Math.max(1,host.clientHeight||window.innerHeight);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);});
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
