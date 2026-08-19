import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowUp, Bot, Box, Crosshair, Gauge, Heart, HeartPulse, RotateCcw, Send, Sparkles, Volume2, VolumeX, Wind, Zap } from 'lucide-react'
import * as THREE from 'three'
import { createParticleSystem, type LifeTimeCurve, type ParticleSystem, type Shape, type SimulationBackend, type SimulationSpace } from '@newkrok/three-particles'
import { GIANT_PLAYROOM } from './game-core/arena'
import { GAME_BALANCE } from './game-core/config'
import { blastHitWalls } from './game-core/destruction'
import { isCellBlocked, traceExplosion, worldToGrid } from './game-core/grid'
import { itemForRoll, piercingFloorCells, tracePiercingExplosion, type ItemKind } from './game-core/powerups'
import { canPlaceCore, matchWinner } from './game-core/rules'
import { fanStateAt, vehicleStateAt } from './game-core/timeline'
import type { RoomSnapshot, ServerMessage } from './game-core/protocol'
import { NetworkClient, type NetworkSession } from './network/NetworkClient'
import { AudioManager } from './audio/AudioManager'
import { GameMusicPlaylist } from './audio/GameMusicPlaylist'
import { createRippleModel, type RippleRig, type RippleVariant } from './three/RippleModel'

const BLUE = '/assets/splash/ripple-blue-keyart-v2-web.png'
const RED = '/assets/splash/ripple-red-keyart-v2-web.png'
const YELLOW = '/assets/splash/ripple-yellow-keyart-v2-web.png'
const VIO = '/assets/splash/ripple-vio-keyart-v1-web.webp'
const GAME_MUSIC = [
  '/assets/audio/neon-bounce.mp3',
  '/assets/audio/neon-platform-rush-1.mp3',
  '/assets/audio/neon-platform-rush-2.mp3',
]
const HALF_X = GIANT_PLAYROOM.halfX, HALF_Z = GIANT_PLAYROOM.halfZ
const ARENA_X = HALF_X*2+1, ARENA_Z = HALF_Z*2+1
const WALLS = GIANT_PLAYROOM.walls

type Team = 'cyan'|'coral'
type Actor = { id:string; name:string; team:Team; isPlayer:boolean; networkId?:string; model:THREE.Group; rig:RippleRig; materials:THREE.MeshStandardMaterial[]; shadow:THREE.Mesh; rescueRing:THREE.Mesh; baseScale:number; x:number; z:number; serverX:number; serverZ:number; renderX:number; renderZ:number; targetX:number; targetZ:number; lastRenderX:number; lastRenderZ:number; walkPhase:number; walkBlend:number; yaw:number; targetYaw:number; hits:number; bombCapacity:number; canKick:boolean; canThrow:boolean; pierceCharges:number; jumpY:number; jumpStarted:number; jumpUntil:number; jumpBaseY:number; buildReady:number; lockedUntil:number; downedUntil:number; eliminated:boolean; dashReady:number }
type Flight = { fromX:number; fromZ:number; toX:number; toZ:number; start:number; duration:number }
type Core = { id:number; networkId?:string; group:THREE.Group; x:number; z:number; fuse:number; owner:string; team:Team; piercing:boolean; ring:THREE.Mesh; flight?:Flight }
type ItemView={id:string;kind:ItemKind;x:number;z:number;group:THREE.Group}
type Burst = { group:THREE.Group; born:number; material:THREE.MeshStandardMaterial; pulses:THREE.InstancedMesh; ribbons:THREE.InstancedMesh; rings:THREE.InstancedMesh; shards:THREE.InstancedMesh; shock:THREE.Mesh; light:THREE.PointLight; cells:Array<{x:number;z:number}>; active:boolean }
type Debris = {mesh:THREE.Mesh;velocity:THREE.Vector3;spin:THREE.Vector3;born:number}
type ParticleExplosion = {system:ParticleSystem;born:number}
type UiState = { time:number; countdown:number; localTeam:Team; playerHits:number; health:number; botHits:number; allyHits:number; rival2Hits:number; alliesAlive:number; rivalsAlive:number; onlineHumans:number; cores:number; capacity:number; canKick:boolean; canThrow:boolean; pierceCharges:number; chain:number; dash:number; fan:'CALM'|'WARNING'|'ACTIVE'; vehicle:boolean; fps:number;frameMs:number;drawCalls:number;triangles:number;textures:number;simBodies:number;rtt:number;packetRate:number;pendingInputs:number;serverPos:string;clientPos:string;message:string }

const lerpAngle=(from:number,to:number,alpha:number)=>from+Math.atan2(Math.sin(to-from),Math.cos(to-from))*alpha
const initialUi=():UiState=>({time:GAME_BALANCE.MATCH_SECONDS,countdown:3,localTeam:'cyan',playerHits:0,health:3,botHits:0,allyHits:0,rival2Hits:0,alliesAlive:2,rivalsAlive:2,onlineHumans:0,cores:1,capacity:1,canKick:false,canThrow:false,pierceCharges:0,chain:0,dash:1,fan:'CALM',vehicle:false,fps:0,frameMs:0,drawCalls:0,triangles:0,textures:0,simBodies:4,rtt:0,packetRate:0,pendingInputs:0,serverPos:'0.00,0.00',clientPos:'0.00,0.00',message:'READY · 시작 신호를 기다리세요'})

function Mark(){ return <span className="splash-mark"><i/><i/><b/></span> }
export default function SplashArena({onExit,networkSession}:{onExit:()=>void;networkSession?:NetworkSession}){
  const hostRef=useRef<HTMLDivElement>(null)
  const networkClientRef=useRef<NetworkClient|null>(null)
  const musicRef=useRef<GameMusicPlaylist|null>(null)
  const [round,setRound]=useState(0)
  const [result,setResult]=useState<'win'|'lose'|null>(null)
  const [muted,setMuted]=useState(false),mutedRef=useRef(false);mutedRef.current=muted
  const debug=new URLSearchParams(location.search).get('debug')==='true'
  const [ui,setUi]=useState<UiState>(initialUi)
  useEffect(()=>musicRef.current?.setMuted(muted),[muted])

  useEffect(()=>{
    const host=hostRef.current!
    const audio=new AudioManager(()=>mutedRef.current)
    const music=new GameMusicPlaylist(GAME_MUSIC,()=>mutedRef.current);musicRef.current=music;music.unlock()
    const arenaState={...GIANT_PLAYROOM,walls:new Set(WALLS)}
    const blocked=(x:number,z:number)=>isCellBlocked(arenaState,{x,z})
    const scene=new THREE.Scene()
    scene.background=new THREE.Color('#25264f')
    scene.fog=new THREE.FogExp2('#342b52',.012)
    const camera=new THREE.PerspectiveCamera(58,1,.1,120)
    camera.position.set(-17,5.6,6)
    camera.lookAt(0,0,0)
    const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'})
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.7))
    renderer.shadowMap.enabled=true
    renderer.shadowMap.type=THREE.PCFShadowMap
    renderer.outputColorSpace=THREE.SRGBColorSpace
    renderer.toneMapping=THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure=1.18
    renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','Rock Sizzle Preppers 3D arena')
    host.appendChild(renderer.domElement)

    scene.add(new THREE.HemisphereLight('#fff2d3','#352252',2.9))
    const sun=new THREE.DirectionalLight('#ffdba8',5.2)
    sun.position.set(8,18,12);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048)
    sun.shadow.camera.left=-24;sun.shadow.camera.right=24;sun.shadow.camera.top=18;sun.shadow.camera.bottom=-18
    scene.add(sun)
    const cyanLight=new THREE.PointLight('#31e8ff',25,12);cyanLight.position.set(-5,2,-3);scene.add(cyanLight)
    const coralLight=new THREE.PointLight('#ff5a63',20,11);coralLight.position.set(5,2,3);scene.add(coralLight)

    const floorMat=new THREE.MeshStandardMaterial({color:'#a76764',roughness:.82,metalness:.02})
    const floorCellCount=ARENA_X*ARENA_Z
    const floor=new THREE.InstancedMesh(new THREE.BoxGeometry(.98,.5,.98),floorMat,floorCellCount)
    const floorCellIndices=new Map<string,number>(),floorMatrix=new THREE.Object3D()
    let floorIndex=0
    for(let z=-HALF_Z;z<=HALF_Z;z++)for(let x=-HALF_X;x<=HALF_X;x++){
      floorMatrix.position.set(x,-.25,z);floorMatrix.scale.set(1,1,1);floorMatrix.updateMatrix();floor.setMatrixAt(floorIndex,floorMatrix.matrix);floorCellIndices.set(`${x},${z}`,floorIndex++)
    }
    floor.instanceMatrix.setUsage(THREE.DynamicDrawUsage);floor.receiveShadow=true;scene.add(floor)
    const setFloorCellVisible=(cell:string,visible:boolean)=>{
      const index=floorCellIndices.get(cell);if(index===undefined)return
      const [x,z]=cell.split(',').map(Number);floorMatrix.position.set(x,-.25,z);floorMatrix.scale.setScalar(visible?1:0);floorMatrix.updateMatrix();floor.setMatrixAt(index,floorMatrix.matrix);floor.instanceMatrix.needsUpdate=true
    }
    const underDeckMat=new THREE.MeshStandardMaterial({color:'#302747',emissive:'#211932',emissiveIntensity:.8,roughness:.92,metalness:.08,side:THREE.DoubleSide})
    const underDeck=new THREE.Mesh(new THREE.BoxGeometry(ARENA_X+1.4,.18,ARENA_Z+1.4),underDeckMat);underDeck.position.y=-2.15;underDeck.receiveShadow=true;scene.add(underDeck)
    const beamMat=new THREE.MeshStandardMaterial({color:'#765077',emissive:'#392543',emissiveIntensity:.62,roughness:.78,metalness:.12})
    for(const z of [-7,-3,1,5]){const beam=new THREE.Mesh(new THREE.BoxGeometry(ARENA_X+1,.28,.32),beamMat);beam.position.set(0,-1.05,z);beam.castShadow=true;scene.add(beam)}
    for(const x of [-12,-6,0,6,12]){const beam=new THREE.Mesh(new THREE.BoxGeometry(.32,.28,ARENA_Z+1),beamMat);beam.position.set(x,-1.28,0);beam.castShadow=true;scene.add(beam)}
    const grid=new THREE.GridHelper(ARENA_X,ARENA_X,'#7ff5ff','#664f7d')
    grid.position.y=.012;(grid.material as THREE.Material).transparent=true;(grid.material as THREE.Material).opacity=.32;grid.visible=debug;scene.add(grid)

    const pathCells=[[-13,6],[-12,6],[-11,6],[-10,6],[-9,6],[-8,6],[-8,5],[-8,4],[-8,3],[-7,3],[-6,3],[-5,3],[-4,3],[-4,2],[-4,1],[-3,1],[-2,1],[-1,1],[1,1],[2,1],[3,1],[4,1],[4,2],[4,3],[5,3],[6,3],[7,3],[8,3],[8,4],[8,5],[8,6],[9,6],[10,6],[11,6],[12,6],[13,6]]
    const pathMat=new THREE.MeshStandardMaterial({color:'#2389b7',emissive:'#19cde8',emissiveIntensity:.32,roughness:.58})
    const pathTileViews=new Map<string,THREE.Mesh>()
    pathCells.forEach(([x,z])=>{const cell=`${x},${z}`;if(WALLS.has(cell))return;const tile=new THREE.Mesh(new THREE.BoxGeometry(.94,.08,.94),pathMat);tile.position.set(x,.055,z);tile.receiveShadow=true;scene.add(tile);pathTileViews.set(cell,tile)})

    const edgeMat=new THREE.MeshStandardMaterial({color:'#3b345d',roughness:.68})
    ;[[0,.15,-HALF_Z-.72,ARENA_X+1,.48,.28],[0,.15,HALF_Z+.72,ARENA_X+1,.48,.28],[-HALF_X-.72,.15,0,.28,.48,ARENA_Z+1],[HALF_X+.72,.15,0,.28,.48,ARENA_Z+1]].forEach(v=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(v[3],v[4],v[5]),edgeMat);mesh.position.set(v[0],v[1],v[2]);mesh.castShadow=true;scene.add(mesh)})

    const colors=['#eea142','#38c7bd','#7b65d4','#ec5964'],wallViews=new Map<string,THREE.Group>(),debris:Debris[]=[]
    const createWallView=(cell:string,index:number)=>{
      if(wallViews.has(cell))return
      const [x,z]=cell.split(',').map(Number)
      const group=new THREE.Group()
      const height=GAME_BALANCE.OBSTACLE_TOP_Y-.11
      const block=new THREE.Mesh(new THREE.BoxGeometry(.9,height,.9),new THREE.MeshStandardMaterial({color:colors[index%colors.length],roughness:.68}))
      block.position.y=height*.5;block.castShadow=true;block.receiveShadow=true;group.add(block)
      const stud=new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,.11,20),new THREE.MeshStandardMaterial({color:'#ffe9bd',roughness:.5}))
      stud.position.y=height+.055;group.add(stud);group.position.set(x,0,z);scene.add(group);wallViews.set(cell,group)
    }
    Array.from(WALLS).forEach(createWallView)
    const destroyWallView=(cell:string,withDebris=true)=>{
      const group=wallViews.get(cell);if(!group)return
      wallViews.delete(cell);arenaState.walls.delete(cell);scene.remove(group)
      if(withDebris){
        const [x,z]=cell.split(',').map(Number),color=(group.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial
        for(let index=0;index<9;index++){
          const material=color.clone(),mesh=new THREE.Mesh(new THREE.BoxGeometry(.2+index%3*.045,.2,.2),material)
          mesh.position.set(x+(index%3-1)*.18,.35+Math.floor(index/3)*.2,z+((index*2)%3-1)*.15);mesh.castShadow=true;scene.add(mesh)
          debris.push({mesh,velocity:new THREE.Vector3((index%3-1)*(1.5+Math.random()),2.3+Math.random()*1.8,((index*5)%3-1)*(1.4+Math.random())),spin:new THREE.Vector3(Math.random()*7,Math.random()*7,Math.random()*7),born:performance.now()})
        }
      }
      group.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();const material=object.material;if(Array.isArray(material))material.forEach(item=>item.dispose());else material.dispose()}})
    }
    const syncWallViews=(activeWalls:string[])=>{
      const active=new Set(activeWalls)
      for(const cell of [...wallViews.keys()])if(!active.has(cell))destroyWallView(cell,false)
      arenaState.walls.clear();activeWalls.forEach((cell,index)=>{arenaState.walls.add(cell);createWallView(cell,index)})
    }
    const holeViews=new Map<string,THREE.Group>(),holes=new Set<string>()
    const addHoleView=(cell:string)=>{
      if(holeViews.has(cell))return
      const [x,z]=cell.split(',').map(Number),group=new THREE.Group()
      setFloorCellVisible(cell,false);const pathTile=pathTileViews.get(cell);if(pathTile)pathTile.visible=false
      const rimMat=new THREE.MeshStandardMaterial({color:'#5e3049',emissive:'#180914',roughness:.84})
      const shaftMat=new THREE.MeshStandardMaterial({color:'#35233f',emissive:'#170d21',emissiveIntensity:.55,roughness:.9,side:THREE.DoubleSide})
      for(const side of [-1,1]){
        const horizontalRim=new THREE.Mesh(new THREE.BoxGeometry(.98,.07,.07),rimMat);horizontalRim.position.set(0,.02,side*.455);group.add(horizontalRim)
        const verticalRim=new THREE.Mesh(new THREE.BoxGeometry(.07,.07,.84),rimMat);verticalRim.position.set(side*.455,.02,0);group.add(verticalRim)
        const horizontalShaft=new THREE.Mesh(new THREE.BoxGeometry(.9,1.55,.055),shaftMat);horizontalShaft.position.set(0,-.78,side*.46);group.add(horizontalShaft)
        const verticalShaft=new THREE.Mesh(new THREE.BoxGeometry(.055,1.55,.9),shaftMat);verticalShaft.position.set(side*.46,-.78,0);group.add(verticalShaft)
      }
      group.position.set(x,0,z);scene.add(group);holeViews.set(cell,group);holes.add(cell)
    }
    const syncHoleViews=(activeHoles:string[])=>{
      const active=new Set(activeHoles)
      for(const [cell,group] of holeViews)if(!active.has(cell)){scene.remove(group);holeViews.delete(cell);holes.delete(cell);setFloorCellVisible(cell,true);const pathTile=pathTileViews.get(cell);if(pathTile)pathTile.visible=true}
      activeHoles.forEach(addHoleView)
    }
    const itemViews=new Map<string,ItemView>()
    const itemColors:Record<ItemKind,string>={KICK:'#ff9b4a',THROW:'#c982ff',CAPACITY:'#56f1b7',PIERCE:'#fff36c'}
    const addItemView=(id:string,kind:ItemKind,x:number,z:number)=>{
      if(itemViews.has(id))return itemViews.get(id)!
      const group=new THREE.Group(),orb=new THREE.Mesh(new THREE.OctahedronGeometry(.27,0),new THREE.MeshStandardMaterial({color:itemColors[kind],emissive:itemColors[kind],emissiveIntensity:1.5,roughness:.25,metalness:.12}))
      orb.position.y=.42;orb.castShadow=true;group.add(orb)
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.34,.035,8,24),new THREE.MeshBasicMaterial({color:itemColors[kind],transparent:true,opacity:.8,toneMapped:false}));ring.rotation.x=Math.PI/2;ring.position.y=.18;group.add(ring)
      group.position.set(x,0,z);scene.add(group);const view={id,kind,x,z,group};itemViews.set(id,view);return view
    }
    const removeItemView=(id:string)=>{const view=itemViews.get(id);if(!view)return;scene.remove(view.group);itemViews.delete(id)}
    const syncItemViews=(items:RoomSnapshot['items'])=>{
      const ids=new Set(items.map(item=>item.id));for(const id of itemViews.keys())if(!ids.has(id))removeItemView(id)
      items.forEach(item=>addItemView(item.id,item.kind,item.x,item.z))
    }

    // Giant-playroom silhouettes from the reference art.
    for(let i=0;i<5;i++){
      const book=new THREE.Mesh(new THREE.BoxGeometry(3.1,.3,1.4),new THREE.MeshStandardMaterial({color:colors[i%4],roughness:.8}))
      book.position.set(-17.4,.12+i*.31,-8+i*.05);book.rotation.y=-.08;book.castShadow=true;scene.add(book)
    }
    const tubeMat=new THREE.MeshStandardMaterial({color:'#508fba',roughness:.46,metalness:.08})
    const tube=new THREE.Mesh(new THREE.CylinderGeometry(.72,.72,2.5,28,1,true),tubeMat)
    tube.rotation.z=Math.PI/2;tube.position.set(17.2,.72,6.5);scene.add(tube)
    const fanBase=new THREE.Mesh(new THREE.CylinderGeometry(.72,.9,.25,24),edgeMat);fanBase.position.set(17.5,.1,-7);scene.add(fanBase)
    const fanPole=new THREE.Mesh(new THREE.CylinderGeometry(.12,.16,2.7,16),edgeMat);fanPole.position.set(17.5,1.45,-7);scene.add(fanPole)
    const fanRing=new THREE.Mesh(new THREE.TorusGeometry(1.28,.12,12,36),new THREE.MeshStandardMaterial({color:'#7e8fb6',metalness:.22,roughness:.46}));fanRing.position.set(17.5,2.85,-7);fanRing.rotation.y=Math.PI/2;scene.add(fanRing)
    const fanBlades=new THREE.Group();fanBlades.position.copy(fanRing.position);scene.add(fanBlades)
    const fanHub=new THREE.Mesh(new THREE.SphereGeometry(.22,18,12),new THREE.MeshStandardMaterial({color:'#aab9d4',metalness:.22,roughness:.38}));fanBlades.add(fanHub)
    for(let i=0;i<4;i++){
      const pivot=new THREE.Group();pivot.rotation.x=i*Math.PI/2
      const blade=new THREE.Mesh(new THREE.CapsuleGeometry(.18,.72,5,12),new THREE.MeshStandardMaterial({color:'#8498bd',transparent:true,opacity:.86,roughness:.38}))
      blade.rotation.z=Math.PI/2;blade.position.set(0,.59,0);blade.scale.set(1,.72,.2);pivot.add(blade);fanBlades.add(pivot)
    }
    const windStreaks:THREE.Mesh[]=[]
    const windMaterial=new THREE.MeshBasicMaterial({color:'#8ef7ff',transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false})
    for(let i=0;i<12;i++){
      const streak=new THREE.Mesh(new THREE.BoxGeometry(1.65,.025,.035),windMaterial.clone())
      streak.position.set(15-(i%6)*5.2,.26+(i%3)*.42,-9+((i*7)%18));streak.visible=false;scene.add(streak);windStreaks.push(streak)
    }
    const railMaterial=new THREE.MeshStandardMaterial({color:'#725a64',metalness:.16,roughness:.62})
    ;[-.3,.3].forEach(offset=>{const rail=new THREE.Mesh(new THREE.BoxGeometry(ARENA_X-.6,.055,.07),railMaterial);rail.position.set(0,.055,1+offset);scene.add(rail)})
    for(let x=-14;x<=14;x++){const sleeper=new THREE.Mesh(new THREE.BoxGeometry(.08,.045,.8),edgeMat);sleeper.position.set(x,.035,1);scene.add(sleeper)}
    const toyVehicle=new THREE.Group()
    const vehicleBody=new THREE.Mesh(new THREE.BoxGeometry(1.05,.38,.72),new THREE.MeshStandardMaterial({color:'#ff9d3e',roughness:.48}));vehicleBody.position.y=.32;vehicleBody.castShadow=true;toyVehicle.add(vehicleBody)
    const vehicleCab=new THREE.Mesh(new THREE.BoxGeometry(.45,.38,.62),new THREE.MeshStandardMaterial({color:'#47cad1',roughness:.42}));vehicleCab.position.set(-.18,.65,0);toyVehicle.add(vehicleCab)
    for(const x of [-.34,.34])for(const z of [-.38,.38]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,.08,16),new THREE.MeshStandardMaterial({color:'#302b4a',roughness:.68}));wheel.rotation.x=Math.PI/2;wheel.position.set(x,.15,z);toyVehicle.add(wheel)}
    toyVehicle.position.set(-9,0,1);toyVehicle.visible=false;scene.add(toyVehicle)

    const shadowGeo=new THREE.CircleGeometry(.52,28)
    const shadowMat=new THREE.MeshBasicMaterial({color:'#281632',transparent:true,opacity:.42,depthWrite:false})
    const createActor=(id:string,name:string,team:Team,isPlayer:boolean,variant:RippleVariant,x:number,z:number,scale=1):Actor=>{
      const {group:model,materials,rig}=createRippleModel(variant),yaw=team==='cyan'?Math.PI/2:-Math.PI/2
      model.position.set(x,0,z);model.rotation.y=yaw;model.scale.multiplyScalar(scale);scene.add(model)
      const shadow=new THREE.Mesh(shadowGeo,shadowMat);shadow.rotation.x=-Math.PI/2;shadow.position.set(x,.025,z);scene.add(shadow)
      const rescueRing=new THREE.Mesh(new THREE.TorusGeometry(.56,.055,10,32),new THREE.MeshBasicMaterial({color:team==='cyan'?'#68efff':'#ff7884',transparent:true,opacity:.85,depthWrite:false,toneMapped:false}))
      rescueRing.rotation.x=-Math.PI/2;rescueRing.position.set(x,.12,z);rescueRing.visible=false;scene.add(rescueRing)
      return{id,name,team,isPlayer,model,rig,materials,shadow,rescueRing,baseScale:model.scale.x,x,z,serverX:x,serverZ:z,renderX:x,renderZ:z,targetX:x,targetZ:z,lastRenderX:x,lastRenderZ:z,walkPhase:0,walkBlend:0,yaw,targetYaw:yaw,hits:0,bombCapacity:GAME_BALANCE.CORE_CAPACITY,canKick:false,canThrow:false,pierceCharges:0,jumpY:0,jumpStarted:0,jumpUntil:0,jumpBaseY:0,buildReady:0,lockedUntil:0,downedUntil:0,eliminated:false,dashReady:0}
    }
    const [spawnBloo,spawnLumi,spawnCoral,spawnVio]=GIANT_PLAYROOM.spawnPoints
    const player=createActor('bloo','BLOO','cyan',true,'bloo',spawnBloo.x,spawnBloo.z,1.04)
    const ally=createActor('lumi','LUMI','cyan',false,'lumi',spawnLumi.x,spawnLumi.z,.98)
    const bot=createActor('coral','CORAL','coral',false,'coral',spawnCoral.x,spawnCoral.z,.98)
    const vio=createActor('vio','VIO','coral',false,'vio',spawnVio.x,spawnVio.z,.98)
    const actors=[player,ally,bot,vio],bots=[ally,bot,vio]
    const debugColliders=actors.map(actor=>{
      const ring=new THREE.Mesh(new THREE.RingGeometry(GAME_BALANCE.PLAYER_RADIUS-.025,GAME_BALANCE.PLAYER_RADIUS+.025,28),new THREE.MeshBasicMaterial({color:actor.team==='cyan'?'#7ff7ff':'#ff8290',transparent:true,opacity:.82,depthTest:false,toneMapped:false}))
      ring.rotation.x=-Math.PI/2;ring.position.set(actor.x,.055,actor.z);ring.visible=debug;ring.renderOrder=9;scene.add(ring);return ring
    })
    const serverGhost=new THREE.Mesh(new THREE.RingGeometry(.48,.54,32),new THREE.MeshBasicMaterial({color:'#fff59b',transparent:true,opacity:.9,depthTest:false,toneMapped:false}))
    serverGhost.rotation.x=-Math.PI/2;serverGhost.position.y=.065;serverGhost.visible=false;serverGhost.renderOrder=10;scene.add(serverGhost)
    const debugPaths=bots.map(()=>{const positions=new Float32Array(6),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:'#c697ff',transparent:true,opacity:.7,depthTest:false}));line.visible=debug;line.renderOrder=8;scene.add(line);return{line,positions,geometry}})
    let controlled=player,cameraYaw=player.yaw,localNetworkId='',inputSequence=0,networkRemaining:number=GAME_BALANCE.MATCH_SECONDS,networkCountdown:number=GAME_BALANCE.COUNTDOWN_SECONDS,networkHumanCount=0
    let pendingInputs:Array<{seq:number;dx:number;dz:number;dt:number}>=[]
    const networkClient=networkSession?new NetworkClient():null
    networkClientRef.current=networkClient

    const keys=new Set<string>(),cores:Core[]=[]
    const coreGeo=new THREE.IcosahedronGeometry(.34,2)
    const coreMaterials:Record<Team,THREE.MeshStandardMaterial>={
      cyan:new THREE.MeshStandardMaterial({color:'#50ecff',emissive:'#20cce9',emissiveIntensity:3,roughness:.2,metalness:.16}),
      coral:new THREE.MeshStandardMaterial({color:'#ff796a',emissive:'#f03c4e',emissiveIntensity:2.8,roughness:.2,metalness:.16}),
    }
    const burstPulseGeometry=new THREE.SphereGeometry(.3,18,12),burstRibbonGeometry=new THREE.CapsuleGeometry(.12,.72,5,10),burstRingGeometry=new THREE.TorusGeometry(.34,.045,8,22),burstShockGeometry=new THREE.SphereGeometry(.72,22,16),burstShardGeometry=new THREE.TetrahedronGeometry(.13,0)
    const bursts:Burst[]=Array.from({length:20},()=>{
      const group=new THREE.Group(),material=new THREE.MeshStandardMaterial({color:'#0aa9d6',emissive:'#087ba8',emissiveIntensity:.8,roughness:.22,metalness:.06,transparent:true,opacity:0,depthWrite:false})
      const shockMaterial=new THREE.MeshBasicMaterial({color:'#16c9ee',transparent:true,opacity:0,wireframe:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false})
      const pulses=new THREE.InstancedMesh(burstPulseGeometry,material,13),ribbons=new THREE.InstancedMesh(burstRibbonGeometry,material,12),rings=new THREE.InstancedMesh(burstRingGeometry,material,13),shards=new THREE.InstancedMesh(burstShardGeometry,material,36),shock=new THREE.Mesh(burstShockGeometry,shockMaterial),light=new THREE.PointLight('#16c9ee',0,7)
      pulses.count=0;ribbons.count=0;rings.count=0;shards.count=36;pulses.frustumCulled=false;ribbons.frustumCulled=false;rings.frustumCulled=false;shards.frustumCulled=false;shock.position.y=.42;light.position.y=.55;group.add(pulses,ribbons,rings,shards,shock,light);group.visible=false;scene.add(group)
      return{group,born:0,material,pulses,ribbons,rings,shards,shock,light,cells:[],active:false}
    })
    const particleExplosions:ParticleExplosion[]=[]
    const spawnParticleExplosion=(x:number,z:number,team:Team,now:number)=>{
      const cyan=team==='cyan'
      const system=createParticleSystem({
        duration:.9,looping:false,maxParticles:72,simulationBackend:'CPU' as SimulationBackend,simulationSpace:'LOCAL' as SimulationSpace,
        startLifetime:{min:.38,max:.78},startSpeed:{min:2.4,max:5.6},startSize:{min:.12,max:.28},startOpacity:{min:.72,max:1},gravity:5.4,
        startColor:cyan?{min:{r:.08,g:.62,b:1},max:{r:.62,g:1,b:1}}:{min:{r:1,g:.12,b:.2},max:{r:1,g:.72,b:.38}},
        emission:{rateOverTime:0,bursts:[{time:.01,count:{min:52,max:68}}]},shape:{shape:'SPHERE' as Shape,sphere:{radius:.09,radiusThickness:1,arc:Math.PI*2}},
        sizeOverLifetime:{isActive:true,lifetimeCurve:{type:'BEZIER' as LifeTimeCurve.BEZIER,scale:1,bezierPoints:[{x:0,y:.35,percentage:0},{x:.18,y:1,percentage:.18},{x:1,y:.08,percentage:1}]}},
        opacityOverLifetime:{isActive:true,lifetimeCurve:{type:'BEZIER' as LifeTimeCurve.BEZIER,scale:1,bezierPoints:[{x:0,y:1,percentage:0},{x:.58,y:.82,percentage:.58},{x:1,y:0,percentage:1}]}},
        renderer:{blending:THREE.AdditiveBlending,discardBackgroundColor:false,backgroundColorTolerance:1,backgroundColor:{r:0,g:0,b:0},transparent:true,depthTest:true,depthWrite:false},
      })
      system.instance.position.set(x,.42,z);system.instance.frustumCulled=false;system.instance.renderOrder=6;scene.add(system.instance);system.update({now,delta:0,elapsed:0});particleExplosions.push({system,born:now})
    }
    const burstMatrix=new THREE.Object3D()
    const aimSegments=20,aimPositions=new Float32Array((aimSegments+1)*3)
    const aimGeometry=new THREE.BufferGeometry();aimGeometry.setAttribute('position',new THREE.BufferAttribute(aimPositions,3))
    const aimMaterial=new THREE.LineBasicMaterial({color:'#fff3a3',transparent:true,opacity:.82,depthTest:false,toneMapped:false})
    const aimArc=new THREE.Line(aimGeometry,aimMaterial);aimArc.visible=false;aimArc.renderOrder=8;scene.add(aimArc)
    const aimMarker=new THREE.Mesh(new THREE.RingGeometry(.34,.48,32),new THREE.MeshBasicMaterial({color:'#fff3a3',transparent:true,opacity:.86,side:THREE.DoubleSide,depthTest:false,toneMapped:false}))
    aimMarker.rotation.x=-Math.PI/2;aimMarker.position.y=.075;aimMarker.visible=false;aimMarker.renderOrder=8;scene.add(aimMarker)
    let coreId=0,localItemId=0,last=performance.now(),acc=0,elapsed=0,lastUi=0,lastPlace=0,chainBest=0,ended=false,shake=0,lastFanPush=0
    const countdownEnds=last+GAME_BALANCE.COUNTDOWN_SECONDS*1000;let lastPresentedCountdown:number=GAME_BALANCE.COUNTDOWN_SECONDS
    let networkRtt=0,snapshotCount=0,snapshotWindow=performance.now(),packetRate=0
    const botPlace=new Map<string,number>(bots.map((actor,index)=>[actor.id,index*620]))
    let fanState:'CALM'|'WARNING'|'ACTIVE'='CALM',vehicleActive=false,vehicleX=-9,lastVehicleCell=-99
    let facing={x:1,z:0},aiming=false
    const say=(message:string)=>setUi(v=>({...v,message}))
    const setActorDownedVisual=(actor:Actor,downed:boolean)=>{actor.materials.forEach(material=>{material.opacity=downed ? .46 : 1;material.depthWrite=!downed});actor.model.scale.setScalar(actor.baseScale*(downed ? .72 : 1))}

    const addCoreView=(owner:string,team:Team,gx:number,gz:number,fuse:number,networkId?:string,piercing=false)=>{
      const group=new THREE.Group()
      const orbMaterial=piercing?coreMaterials[team].clone():coreMaterials[team],orb=new THREE.Mesh(coreGeo,orbMaterial);orb.position.y=.41;orb.castShadow=true;group.add(orb)
      const ring=new THREE.Mesh(new THREE.RingGeometry(.43,.52,32),new THREE.MeshBasicMaterial({color:team==='cyan'?'#baffff':'#ffc1b7',transparent:true,opacity:.82,side:THREE.DoubleSide}))
      ring.rotation.x=-Math.PI/2;ring.position.y=.035;group.add(ring);group.position.set(gx,0,gz);scene.add(group)
      if(piercing){orb.scale.setScalar(1.14);(orb.material as THREE.MeshStandardMaterial).color.set('#fff36c');(orb.material as THREE.MeshStandardMaterial).emissive.set('#ff8a24')}
      cores.push({id:++coreId,networkId,group,x:gx,z:gz,fuse,owner,team,piercing,ring});return true
    }
    const placeCore=(actor:Actor,x:number,z:number,fuse:number=GAME_BALANCE.CORE_FUSE_SECONDS)=>{
      const {x:gx,z:gz}=worldToGrid({x,z})
      if(actor.eliminated||actor.downedUntil||blocked(gx,gz)||holes.has(`${gx},${gz}`)||cores.some(c=>c.x===gx&&c.z===gz)||!canPlaceCore(cores.filter(c=>c.owner===actor.id).length,actor.bombCapacity))return false
      const piercing=actor.pierceCharges>0;if(piercing)actor.pierceCharges--
      return addCoreView(actor.id,actor.team,gx,gz,fuse,undefined,piercing)
    }
    const rayCells=(core:Core)=>core.piercing?tracePiercingExplosion(arenaState,{x:core.x,z:core.z},GAME_BALANCE.CORE_RANGE):traceExplosion(arenaState,{x:core.x,z:core.z},GAME_BALANCE.CORE_RANGE)
    const actorCanOccupy=(actor:Actor,x:number,z:number)=>{
      const gx=Math.round(x),gz=Math.round(z)
      if(Math.abs(gx)>HALF_X||Math.abs(gz)>HALF_Z||((arenaState.walls.has(`${gx},${gz}`))&&actor.jumpY<GAME_BALANCE.OBSTACLE_TOP_Y-.12))return false
      return !actors.some(other=>other!==actor&&!other.eliminated&&Math.hypot(other.x-x,other.z-z)<GAME_BALANCE.PLAYER_RADIUS*2)
    }
    const knockActor=(actor:Actor,originX:number,originZ:number)=>{
      let dx=actor.x-originX,dz=actor.z-originZ,length=Math.hypot(dx,dz)
      if(length<.05){const slot=actors.indexOf(actor);dx=slot%2?-1:1;dz=slot<2?-1:1;length=Math.hypot(dx,dz)}
      dx/=length;dz/=length
      const step=GAME_BALANCE.KNOCKBACK_DISTANCE/8
      for(let index=0;index<8;index++){const nx=actor.x+dx*step,nz=actor.z+dz*step;if(!actorCanOccupy(actor,nx,nz))break;actor.x=nx;actor.z=nz}
      actor.targetX=actor.x;actor.targetZ=actor.z
    }
    const hit=(actor:Actor,cells:{x:number;z:number}[],now:number,originX:number,originZ:number)=>{
      if(actor.eliminated||actor.downedUntil||now<actor.lockedUntil)return
      if(cells.some(cell=>Math.abs(cell.x-actor.x)<.62&&Math.abs(cell.z-actor.z)<.62)){
        knockActor(actor,originX,originZ);actor.hits++;shake=Math.max(shake,.42)
        if(actor.hits>=3){
          actor.downedUntil=now+GAME_BALANCE.FLUX_DOWNED_MS;actor.lockedUntil=actor.downedUntil
          setActorDownedVisual(actor,true)
          actor.rescueRing.visible=true
          say(`${actor.name} FLUX LOCKED — 아군이 R로 6초 안에 구조할 수 있습니다`)
        }else{
          actor.lockedUntil=now+GAME_BALANCE.FLUX_SLOW_MS
          say(actor===controlled?'FLUX LOCK! 이동 출력이 저하됩니다':`${actor.name}의 이동 출력이 저하됩니다`)
        }
      }
    }
    const rescue=(rescuer:Actor,target:Actor,now:number)=>{
      if(rescuer.eliminated||rescuer.downedUntil||target.eliminated||!target.downedUntil||rescuer.team!==target.team)return false
      if(Math.hypot(rescuer.x-target.x,rescuer.z-target.z)>1.45)return false
      target.hits=2;target.downedUntil=0;target.lockedUntil=now+650;setActorDownedVisual(target,false);target.rescueRing.visible=false
      say(`${rescuer.name} → ${target.name} RESCUE! 팀이 전장에 복귀했습니다`);audio.rescue();shake=Math.max(shake,.2);return true
    }
    const eliminate=(actor:Actor)=>{
      actor.eliminated=true;actor.downedUntil=0;actor.model.visible=false;actor.shadow.visible=false;actor.rescueRing.visible=false
      say(`${actor.name} ELIMINATED`)
      const cyanAlive=actors.filter(item=>item.team==='cyan'&&!item.eliminated).length
      const coralAlive=actors.filter(item=>item.team==='coral'&&!item.eliminated).length
      if(!ended&&(!cyanAlive||!coralAlive)){ended=true;setResult(cyanAlive?'win':'lose')}
    }
    const spawnExplosion=(x:number,z:number,team:Team,now:number,chain:number,piercing=false)=>{
      const cells=piercing?tracePiercingExplosion(arenaState,{x,z},GAME_BALANCE.CORE_RANGE):traceExplosion(arenaState,{x,z},GAME_BALANCE.CORE_RANGE),burst=bursts.find(item=>!item.active)??bursts.reduce((oldest,item)=>item.born<oldest.born?item:oldest),color=piercing?'#fff36c':team==='cyan'?'#0aa9d6':'#d92f4d'
      burst.active=true;burst.born=now;burst.group.visible=true;burst.group.position.set(x,0,z);burst.group.scale.setScalar(1);burst.material.color.set(color);burst.material.emissive.set(color);burst.material.opacity=.88
      ;(burst.shock.material as THREE.MeshBasicMaterial).color.set(color);(burst.shock.material as THREE.MeshBasicMaterial).opacity=.38;burst.shock.scale.setScalar(.3);burst.light.color.set(color);burst.light.intensity=20
      burst.cells=cells.map(cell=>({x:cell.x-x,z:cell.z-z}));burst.pulses.count=cells.length;burst.ribbons.count=Math.max(0,cells.length-1);burst.rings.count=cells.length
      cells.forEach((cell,index)=>{
        burstMatrix.position.set(cell.x-x,.42,cell.z-z);burstMatrix.rotation.set(0,0,0);burstMatrix.scale.setScalar(index?1:1.65+chain*.08);burstMatrix.updateMatrix();burst.pulses.setMatrixAt(index,burstMatrix.matrix)
        if(index){const horizontal=cell.z===z;burstMatrix.position.set(cell.x-x,.38,cell.z-z);burstMatrix.rotation.set(horizontal?0:Math.PI/2,0,horizontal?Math.PI/2:0);burstMatrix.scale.setScalar(1);burstMatrix.updateMatrix();burst.ribbons.setMatrixAt(index-1,burstMatrix.matrix)}
        burstMatrix.position.set(cell.x-x,.09,cell.z-z);burstMatrix.rotation.set(Math.PI/2,0,0);burstMatrix.scale.setScalar(.35);burstMatrix.updateMatrix();burst.rings.setMatrixAt(index,burstMatrix.matrix)
      })
      for(let index=0;index<36;index++){const cell=burst.cells[index%burst.cells.length];burstMatrix.position.set(cell.x,.34,cell.z);burstMatrix.rotation.set(index*.73,index*1.17,index*.41);burstMatrix.scale.setScalar(.75+index%4*.16);burstMatrix.updateMatrix();burst.shards.setMatrixAt(index,burstMatrix.matrix)}
      burst.pulses.instanceMatrix.needsUpdate=true;burst.ribbons.instanceMatrix.needsUpdate=true;burst.rings.instanceMatrix.needsUpdate=true;burst.shards.instanceMatrix.needsUpdate=true;spawnParticleExplosion(x,z,team,now);audio.explode(team,chain);shake=Math.max(shake,.2+chain*.05);return cells
    }
    const collectLocalItem=(actor:Actor,item:ItemView)=>{
      if(item.kind==='KICK')actor.canKick=true
      if(item.kind==='THROW')actor.canThrow=true
      if(item.kind==='CAPACITY')actor.bombCapacity=Math.min(GAME_BALANCE.MAX_CORE_CAPACITY,actor.bombCapacity+1)
      if(item.kind==='PIERCE')actor.pierceCharges=Math.min(3,actor.pierceCharges+1)
      removeItemView(item.id);say(`${item.kind} ITEM 획득!`)
    }
    const dropLocalItem=(x:number,z:number)=>{const kind=itemForRoll(Math.random());if(kind)addItemView(`local-item-${++localItemId}`,kind,x,z)}
    const explode=(core:Core,now:number,chain:number)=>{
      const cells=spawnExplosion(core.x,core.z,core.team,now,chain,core.piercing)
      const wallHits=core.piercing?cells.filter(cell=>arenaState.walls.has(`${cell.x},${cell.z}`)):blastHitWalls(arenaState,{x:core.x,z:core.z},GAME_BALANCE.CORE_RANGE)
      actors.forEach(actor=>hit(actor,cells,now,core.x,core.z));wallHits.forEach(wall=>{destroyWallView(`${wall.x},${wall.z}`);if(!core.piercing)dropLocalItem(wall.x,wall.z)});if(wallHits.length)say(`BLOCK SHATTER ×${wallHits.length} · 아이템을 확인하세요`)
      if(core.piercing)for(const cell of piercingFloorCells(core,cells,GIANT_PLAYROOM.spawnPoints)){destroyWallView(`${cell.x},${cell.z}`,false);addHoleView(`${cell.x},${cell.z}`)}
      let chained=0
      cores.forEach(other=>{if(other.id!==core.id&&cells.some(cell=>cell.x===other.x&&cell.z===other.z)&&other.fuse>.08){other.fuse=.055;chained++}})
      if(chained){chainBest=Math.max(chainBest,chain+chained);say(`CHAIN ×${chain+chained}! 에너지 경로가 연결됐습니다`)}
      scene.remove(core.group);const index=cores.indexOf(core);if(index>=0)cores.splice(index,1)
    }
    const move=(actor:Actor,dx:number,dz:number,speed:number,dt:number,faceMovement=true)=>{
      if(actor.eliminated||actor.downedUntil)return
      const output=performance.now()<actor.lockedUntil ? .42 : 1
      const nx=actor.x+dx*speed*output*dt,nz=actor.z+dz*speed*output*dt
      if(actorCanOccupy(actor,nx,actor.z))actor.x=THREE.MathUtils.clamp(nx,-HALF_X-.28,HALF_X+.28)
      if(actorCanOccupy(actor,actor.x,nz))actor.z=THREE.MathUtils.clamp(nz,-HALF_Z-.28,HALF_Z+.28)
      if(faceMovement&&(dx||dz))actor.targetYaw=Math.atan2(dx,dz)
      actor.shadow.position.set(actor.x,.025,actor.z)
      actor.targetX=actor.x;actor.targetZ=actor.z
    }
    const dash=()=>{
      if(networkClient){networkClient.send({type:'ACTION',seq:++inputSequence,action:'DASH',direction:cardinalDirection()});audio.dash();say('RIPPLE DASH · SERVER VALIDATING');return}
      const now=performance.now();if(now<controlled.dashReady||now<controlled.lockedUntil)return
      controlled.dashReady=now+GAME_BALANCE.DASH_COOLDOWN_MS
      const dashSteps=12,dashStep=GAME_BALANCE.DASH_DISTANCE/dashSteps
      for(let i=0;i<dashSteps;i++){const nx=controlled.x+facing.x*dashStep,nz=controlled.z+facing.z*dashStep;if(!actorCanOccupy(controlled,nx,nz))break;controlled.x=nx;controlled.z=nz}
      audio.dash();shake=.13;say('RIPPLE DASH!')
    }
    const cardinalDirection=()=>Math.abs(facing.x)>=Math.abs(facing.z)?{x:facing.x||1,z:0}:{x:0,z:facing.z||1}
    const getThrowPlan=()=>{
      const nearest=cores.filter(core=>!core.flight).map(core=>({core,distance:Math.hypot(core.x-controlled.x,core.z-controlled.z)})).sort((a,b)=>a.distance-b.distance)[0]
      if(!nearest||nearest.distance>1.65)return null
      const direction=cardinalDirection(),fromX=nearest.core.x,fromZ=nearest.core.z
      let toX=fromX,toZ=fromZ
      for(let range=1;range<=GAME_BALANCE.THROW_RANGE;range++){
        const nx=fromX+direction.x*range,nz=fromZ+direction.z*range
        if(blocked(nx,nz)||cores.some(core=>core!==nearest.core&&core.x===nx&&core.z===nz))break
        toX=nx;toZ=nz
      }
      return toX===fromX&&toZ===fromZ?null:{core:nearest.core,fromX,fromZ,toX,toZ}
    }
    const kick=()=>{
      if(!controlled.canKick){say('밀기 아이템을 먼저 획득하세요');return}
      if(networkClient){networkClient.send({type:'ACTION',seq:++inputSequence,action:'KICK',direction:cardinalDirection()});audio.kick();say('CORE KICK · SERVER VALIDATING');return}
      const nearest=cores.filter(core=>!core.flight).map(core=>({core,distance:Math.hypot(core.x-controlled.x,core.z-controlled.z)})).sort((a,b)=>a.distance-b.distance)[0]
      if(!nearest||nearest.distance>1.55){say('가까운 Core가 없습니다');return}
      const direction=cardinalDirection(),nx=nearest.core.x+direction.x,nz=nearest.core.z+direction.z
      if(!blocked(nx,nz)&&!cores.some(core=>core!==nearest.core&&core.x===nx&&core.z===nz)){nearest.core.x=nx;nearest.core.z=nz;nearest.core.group.position.set(nx,0,nz);audio.kick();say('Core를 밀어 경로를 바꿨습니다!')}
    }
    const throwCore=()=>{
      if(!controlled.canThrow){say('던지기 아이템을 먼저 획득하세요');return}
      const plan=getThrowPlan()
      if(!plan){say('던질 수 있는 가까운 Core 또는 착지 경로가 없습니다');return}
      if(networkClient){networkClient.send({type:'ACTION',seq:++inputSequence,action:'THROW',direction:cardinalDirection()});audio.throwCore();say('CORE THROW · SERVER VALIDATING');return}
      plan.core.x=plan.toX;plan.core.z=plan.toZ;plan.core.ring.visible=false
      plan.core.flight={fromX:plan.fromX,fromZ:plan.fromZ,toX:plan.toX,toZ:plan.toZ,start:performance.now(),duration:GAME_BALANCE.THROW_DURATION_MS}
      audio.throwCore();shake=.09;say('CORE THROW! 착지 지점에서 파동 경로를 다시 계산합니다')
    }
    const rescueAlly=()=>{
      if(networkClient){networkClient.send({type:'ACTION',seq:++inputSequence,action:'RESCUE',direction:cardinalDirection()});say('RESCUE · SERVER VALIDATING');return}
      const target=actors.filter(actor=>actor.team===controlled.team&&actor!==controlled&&actor.downedUntil&&!actor.eliminated).sort((a,b)=>Math.hypot(a.x-controlled.x,a.z-controlled.z)-Math.hypot(b.x-controlled.x,b.z-controlled.z))[0]
      if(!target||!rescue(controlled,target,performance.now()))say('구조할 수 있는 아군에게 더 가까이 가세요')
    }
    const jump=()=>{
      if(networkClient){networkClient.send({type:'ACTION',seq:++inputSequence,action:'JUMP',direction:cardinalDirection()});return}
      const now=performance.now();if(now<controlled.jumpUntil)return
      controlled.jumpBaseY=controlled.jumpY;controlled.jumpStarted=now;controlled.jumpUntil=now+GAME_BALANCE.JUMP_DURATION_MS;say('JUMP! 장애물과 구멍을 뛰어넘으세요')
    }
    const buildWall=()=>{
      if(networkClient){networkClient.send({type:'ACTION',seq:++inputSequence,action:'BUILD',direction:cardinalDirection()});say('BLOCK BUILD · SERVER VALIDATING');return}
      const now=performance.now();if(now<controlled.buildReady)return
      const direction=cardinalDirection(),cell=worldToGrid({x:controlled.x+direction.x*1.05,z:controlled.z+direction.z*1.05}),key=`${cell.x},${cell.z}`
      if(Math.abs(cell.x)>HALF_X||Math.abs(cell.z)>HALF_Z||arenaState.walls.has(key)||holes.has(key)||cores.some(core=>core.x===cell.x&&core.z===cell.z)||actors.some(actor=>!actor.eliminated&&Math.hypot(actor.x-cell.x,actor.z-cell.z)<.72)){say('그 위치에는 장애물을 설치할 수 없습니다');return}
      arenaState.walls.add(key);createWallView(key,wallViews.size);controlled.buildReady=now+GAME_BALANCE.BUILD_COOLDOWN_MS;say('BLOCK BUILD! 방어 경로를 만들었습니다')
    }
    const syncNetworkSnapshot=(snapshot:RoomSnapshot)=>{
      networkRemaining=snapshot.remaining;networkCountdown=snapshot.countdown;elapsed=GAME_BALANCE.MATCH_SECONDS-snapshot.remaining;fanState=snapshot.fan;vehicleActive=snapshot.vehicle.active;vehicleX=snapshot.vehicle.x;networkHumanCount=snapshot.players.filter(state=>!state.bot).length
      syncWallViews(snapshot.walls??Array.from(WALLS).filter(cell=>!new Set(snapshot.destroyedWalls??[]).has(cell)))
      syncHoleViews(snapshot.holes??[]);syncItemViews(snapshot.items??[])
      networkRtt=Math.max(0,Date.now()-snapshot.serverTime);snapshotCount++
      const sampleNow=performance.now(),sampleElapsed=sampleNow-snapshotWindow
      if(sampleElapsed>=1000){packetRate=Math.round(snapshotCount*1000/sampleElapsed);snapshotCount=0;snapshotWindow=sampleNow}
      const occupied=new Set(snapshot.players.map(state=>state.slot))
      actors.forEach((actor,slot)=>{if(!occupied.has(slot)){actor.model.visible=false;actor.shadow.visible=false;actor.rescueRing.visible=false}})
      snapshot.players.forEach(state=>{
        const actor=actors[state.slot];if(!actor)return
        actor.targetYaw=state.yaw
        actor.networkId=state.id;actor.x=state.x;actor.z=state.z;actor.serverX=state.x;actor.serverZ=state.z;actor.targetX=state.x;actor.targetZ=state.z;actor.hits=state.hits;actor.bombCapacity=state.bombCapacity;actor.canKick=state.canKick;actor.canThrow=state.canThrow;actor.pierceCharges=state.pierceCharges;actor.jumpY=state.jumpY;actor.downedUntil=state.downedUntil;actor.eliminated=state.eliminated
        actor.model.visible=!state.eliminated;actor.shadow.visible=!state.eliminated;actor.rescueRing.visible=!!state.downedUntil&&!state.eliminated;setActorDownedVisual(actor,!!state.downedUntil)
        if(state.id===localNetworkId){
          controlled=actor;pendingInputs=pendingInputs.filter(input=>input.seq>state.lastInput)
          pendingInputs.forEach(input=>move(actor,input.dx,input.dz,GAME_BALANCE.PLAYER_SPEED,input.dt));actor.targetX=actor.x;actor.targetZ=actor.z
        }
      })
      const serverCoreIds=new Set(snapshot.cores.map(core=>core.id))
      for(let index=cores.length-1;index>=0;index--){const core=cores[index];if(core.networkId&&!serverCoreIds.has(core.networkId)){scene.remove(core.group);cores.splice(index,1)}}
      snapshot.cores.forEach(state=>{
        let core=cores.find(item=>item.networkId===state.id)
        if(!core){addCoreView(state.owner,state.team,state.x,state.z,state.fuse,state.id,state.piercing);core=cores.at(-1)}
        if(core){
          const moved=Math.hypot(state.x-core.x,state.z-core.z)>1.1
          if(moved&&!core.flight){core.flight={fromX:core.x,fromZ:core.z,toX:state.x,toZ:state.z,start:performance.now(),duration:GAME_BALANCE.THROW_DURATION_MS};core.ring.visible=false}
          core.owner=state.owner;core.team=state.team;core.x=state.x;core.z=state.z;core.fuse=state.fuse;core.piercing=state.piercing;if(!core.flight)core.group.position.set(state.x,0,state.z)
        }
      })
      if(snapshot.ended&&snapshot.winner&&!ended){ended=true;setResult(snapshot.winner==='draw'||snapshot.winner===controlled.team?'win':'lose')}
      if(!snapshot.ended&&ended){ended=false;pendingInputs=[];setResult(null);say('SPLASH! 같은 방에서 재경기가 시작됐습니다')}
    }
    const onNetworkMessage=(message:ServerMessage)=>{
      if(message.type==='WELCOME'){
        localNetworkId=message.playerId;controlled=actors[message.slot];cameraYaw=controlled.yaw;facing={x:Math.sin(cameraYaw),z:Math.cos(cameraYaw)};actors.forEach(actor=>actor.isPlayer=false);controlled.isPlayer=true
        say(`ROOM ${message.roomId} · SLOT ${message.slot+1} · SERVER CONNECTED`)
      }
      if(message.type==='SNAPSHOT')syncNetworkSnapshot(message.snapshot)
      if(message.type==='ERROR')say(`NETWORK ERROR · ${message.message}`)
      if(message.type==='GAME_EVENT'){
        const labels:Record<string,string>={PLAYER_RESCUED:'TEAM RESCUE!',PLAYER_FLUX_LOCKED:'FLUX LOCKED!',PLAYER_ELIMINATED:'RIPPLE ELIMINATED',PLAYER_FELL:'VOID FALL · 즉시 탈락!',PLAYER_JUMPED:'JUMP!',PLAYER_KNOCKED:'IMPACT KNOCKBACK',CORE_THROWN:'SERVER CORE THROW',CORE_KICKED:'SERVER CORE KICK',CORE_EXPLODED:'3D SPLASH DISCHARGE · SERVER SYNC',OBJECT_DESTROYED:'BLOCK SHATTERED · 아이템을 확인하세요',FLOOR_DESTROYED:'PIERCE SPLASH · 바닥 붕괴!',WALL_BUILT:'BLOCK BUILD!',ITEM_COLLECTED:`${message.kind??'POWER'} ITEM 획득!`,VEHICLE_CORE_PUSH:'TOY EXPRESS MOVED A CORE',VEHICLE_PLAYER_PUSH:'TOY EXPRESS IMPACT!',MATCH_RESTARTED:'READY · ROOM REMATCH',MATCH_STARTED:'SPLASH! 예측하고, 연결하고, 탈출하세요'}
        if(message.event==='CORE_EXPLODED'&&message.x!==undefined&&message.z!==undefined&&message.team)spawnExplosion(message.x,message.z,message.team,performance.now(),message.chain??1,message.piercing)
        if(message.event==='OBJECT_DESTROYED'&&message.x!==undefined&&message.z!==undefined)destroyWallView(`${message.x},${message.z}`)
        if((message.event==='CHAIN_STARTED'||message.event==='CHAIN_EXTENDED')&&message.chain){chainBest=Math.max(chainBest,message.chain);say(`CHAIN ×${message.chain}! SERVER AUTHORITATIVE`)}
        if(message.event==='CORE_PLACED')audio.place()
        if(message.event==='PLAYER_RESCUED')audio.rescue()
        if(labels[message.event])say(labels[message.event])
      }
    }
    const stopNetwork=networkClient?.onMessage(onNetworkMessage)??(()=>{})
    if(networkClient&&networkSession)networkClient.connect(networkSession).catch(()=>say('NETWORK UNAVAILABLE · 서버를 확인하세요'))
    const onDown=(event:KeyboardEvent)=>{
      audio.unlock();music.unlock()
      if([' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))event.preventDefault()
      if((networkClient?networkCountdown:Math.ceil((countdownEnds-performance.now())/1000))>0||ended)return
      keys.add(event.key.toLowerCase())
      if(event.code==='Space'&&!event.repeat)jump()
      if(event.key.toLowerCase()==='f'&&performance.now()-lastPlace>280){lastPlace=performance.now();if(networkClient){networkClient.send({type:'ACTION',seq:++inputSequence,action:'PLACE',direction:cardinalDirection()});say('CORE PLACED · SERVER VALIDATING')}else if(placeCore(controlled,controlled.x,controlled.z)){audio.place();say('Splash Core 설치 — 기존 Core가 터지면 슬롯이 돌아옵니다')}}
      if(event.key==='Shift')dash()
      if(event.key.toLowerCase()==='e')kick()
      if(event.key.toLowerCase()==='q'&&!event.repeat){if(controlled.canThrow){aiming=true;say('CORE THROW · Q를 누른 채 마우스로 착지 방향을 조준하세요')}else say('던지기 아이템을 먼저 획득하세요')}
      if(event.key.toLowerCase()==='c')buildWall()
      if(event.key.toLowerCase()==='r')rescueAlly()
    }
    const onUp=(event:KeyboardEvent)=>{keys.delete(event.key.toLowerCase());if(event.key.toLowerCase()==='q'&&aiming){aiming=false;throwCore()}}
    const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0),pointerHit=new THREE.Vector3()
    const onPointerMove=(event:PointerEvent)=>{
      const bounds=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-bounds.left)/bounds.width*2-1,-((event.clientY-bounds.top)/bounds.height)*2+1)
      raycaster.setFromCamera(pointer,camera)
      if(raycaster.ray.intersectPlane(groundPlane,pointerHit)){
        const dx=pointerHit.x-controlled.x,dz=pointerHit.z-controlled.z,length=Math.hypot(dx,dz)
        if(length>.18){facing={x:dx/length,z:dz/length};if(aiming)controlled.targetYaw=Math.atan2(facing.x,facing.z)}
      }
    }
    const focusArena=()=>{renderer.domElement.focus();audio.unlock();music.unlock()}
    window.addEventListener('keydown',onDown);window.addEventListener('keyup',onUp);renderer.domElement.addEventListener('pointermove',onPointerMove);renderer.domElement.addEventListener('pointerdown',focusArena)
    const resize=()=>{const width=host.clientWidth,height=host.clientHeight;camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height,false)}
    const observer=new ResizeObserver(resize);observer.observe(host);resize()

    const fixedUpdate=(dt:number,now:number)=>{
      if(ended)return
      if((networkClient?networkCountdown:Math.ceil((countdownEnds-now)/1000))>0)return
      elapsed+=dt
      if(!networkClient)actors.forEach(actor=>{actor.jumpY=now<actor.jumpUntil?actor.jumpBaseY+Math.sin(Math.max(0,Math.min(1,(now-actor.jumpStarted)/GAME_BALANCE.JUMP_DURATION_MS))*Math.PI)*GAME_BALANCE.JUMP_HEIGHT:(arenaState.walls.has(`${Math.round(actor.x)},${Math.round(actor.z)}`)?GAME_BALANCE.OBSTACLE_TOP_Y:0)})
      let side=0,forwardInput=0
      if(keys.has('a')||keys.has('arrowleft'))side--
      if(keys.has('d')||keys.has('arrowright'))side++
      if(keys.has('w')||keys.has('arrowup'))forwardInput++
      if(keys.has('s')||keys.has('arrowdown'))forwardInput--
      const forwardX=Math.sin(cameraYaw),forwardZ=Math.cos(cameraYaw),rightX=-forwardZ,rightZ=forwardX
      let dx=forwardX*forwardInput+rightX*side,dz=forwardZ*forwardInput+rightZ*side
      if(dx||dz){const length=Math.hypot(dx,dz);dx/=length;dz/=length;facing={x:dx,z:dz};move(controlled,dx,dz,GAME_BALANCE.PLAYER_SPEED,dt)}
      if(networkClient){const seq=++inputSequence;pendingInputs.push({seq,dx,dz,dt});if(pendingInputs.length>90)pendingInputs=pendingInputs.slice(-90);networkClient.send({type:'INPUT',seq,dx,dz})}
      const nextFanState=fanStateAt(elapsed)
      if(nextFanState!==fanState){
        fanState=nextFanState
        if(fanState==='WARNING'){audio.warning();say('선풍기 가동 예고 — 오른쪽에서 강풍이 옵니다!')}
        if(fanState==='ACTIVE')say('FAN ACTIVE! 코어와 파이터가 왼쪽으로 밀립니다')
        if(fanState==='CALM'&&(elapsed>=24||elapsed>=60))say('바람이 멎었습니다 — 에너지 경로를 다시 점유하세요')
      }
      if(fanState==='ACTIVE'&&!networkClient){
        actors.forEach(actor=>move(actor,-1,0,actor.isPlayer?1.18:.92,dt,false))
        if(now-lastFanPush>650){
          lastFanPush=now
          cores.filter(core=>!core.flight).sort((a,b)=>a.x-b.x).forEach(core=>{
            const nx=core.x-1
            if(!blocked(nx,core.z)&&!cores.some(other=>other!==core&&other.x===nx&&other.z===core.z)){core.x=nx;core.group.position.x=nx}
          })
        }
      }
      if(!networkClient){
        const vehicle=vehicleStateAt(elapsed);vehicleActive=vehicle.active;vehicleX=vehicle.x
        if(vehicleActive){
          const vehicleCell=Math.round(vehicleX)
          if(vehicleCell!==lastVehicleCell){
            lastVehicleCell=vehicleCell
            cores.filter(core=>!core.flight&&Math.abs(core.x-vehicleX)<.8&&Math.abs(core.z-1)<.7).forEach(core=>{const nx=core.x+1;if(!blocked(nx,core.z)&&!cores.some(other=>other!==core&&other.x===nx&&other.z===core.z)){core.x=nx;core.group.position.x=nx;say('TOY EXPRESS가 Core를 다음 격자로 밀었습니다!')}})
            actors.filter(actor=>!actor.eliminated&&Math.abs(actor.x-vehicleX)<.78&&Math.abs(actor.z-1)<.72).forEach(actor=>{knockActor(actor,vehicleX-1,1);say('TOY EXPRESS IMPACT! 트랙에서 벗어나세요')})
          }
        }else lastVehicleCell=-99
      }
      if(!networkClient){
        actors.filter(actor=>!actor.eliminated&&actor.jumpY<.12&&holes.has(`${Math.round(actor.x)},${Math.round(actor.z)}`)).forEach(actor=>{say(`${actor.name}이 바닥 구멍으로 추락했습니다!`);eliminate(actor)})
        for(const item of [...itemViews.values()]){const collector=actors.filter(actor=>!actor.eliminated).find(actor=>Math.hypot(actor.x-item.x,actor.z-item.z)<=GAME_BALANCE.ITEM_PICKUP_RADIUS);if(collector)collectLocalItem(collector,item)}
      }
      if(networkClient){
        cores.forEach(core=>{core.group.rotation.y+=dt*2.6;const pulse=1+Math.sin(now*.018)*.14;core.ring.scale.setScalar(pulse);(core.ring.material as THREE.MeshBasicMaterial).opacity=.35+Math.max(0,1-core.fuse/GAME_BALANCE.CORE_FUSE_SECONDS)*.6})
        return
      }
      const danger=cores.filter(core=>core.fuse<1.12).flatMap(rayCells)
      bots.forEach((brain,index)=>{
        if(brain.eliminated||brain.downedUntil)return
        const downedAlly=actors.filter(actor=>actor!==brain&&actor.team===brain.team&&actor.downedUntil&&!actor.eliminated).sort((a,b)=>Math.hypot(a.x-brain.x,a.z-brain.z)-Math.hypot(b.x-brain.x,b.z-brain.z))[0]
        const enemy=actors.filter(actor=>actor.team!==brain.team&&!actor.eliminated).sort((a,b)=>Math.hypot(a.x-brain.x,a.z-brain.z)-Math.hypot(b.x-brain.x,b.z-brain.z))[0]
        const target=downedAlly??enemy
        if(!target)return
        const botInDanger=danger.some(cell=>Math.abs(cell.x-brain.x)<.8&&Math.abs(cell.z-brain.z)<.8)
        let botDx=target.x-brain.x,botDz=target.z-brain.z
        if(botInDanger){botDx=-botDx;botDz=-botDz}
        const botLength=Math.hypot(botDx,botDz)||1;botDx/=botLength;botDz/=botLength
        move(brain,botDx,botDz,botInDanger?3.45:downedAlly?2.75:GAME_BALANCE.BOT_SPEED,dt)
        if(downedAlly){rescue(brain,downedAlly,now);return}
        const placedAt=botPlace.get(brain.id)??0
        if(now-placedAt>2050+index*180&&Math.hypot(target.x-brain.x,target.z-brain.z)<7.5){botPlace.set(brain.id,now);placeCore(brain,brain.x,brain.z,2.55+index*.12)}
      })
      cores.forEach(core=>{if(!core.flight)core.fuse-=dt;core.group.rotation.y+=dt*2.6;const pulse=1+Math.sin(now*.018)*.14;core.ring.scale.setScalar(pulse);(core.ring.material as THREE.MeshBasicMaterial).opacity=.35+Math.max(0,1-core.fuse/2.4)*.6})
      cores.filter(core=>core.fuse<=0).forEach(core=>explode(core,now,1))
      actors.filter(actor=>actor.downedUntil&&now>=actor.downedUntil&&!actor.eliminated).forEach(eliminate)
      if(elapsed>=GAME_BALANCE.MATCH_SECONDS&&!ended){
        ended=true
        const winner=matchWinner(actors.map(actor=>({team:actor.team,hits:actor.hits,eliminated:actor.eliminated})))
        setResult(winner===controlled.team||winner==='draw'?'win':'lose')
      }
    }
    let frame=0
    const loop=(now:number)=>{
      const dt=Math.min((now-last)/1000,.05);last=now;acc+=dt
      while(acc>=1/30){fixedUpdate(1/30,now);acc-=1/30}
      const presentedCountdown=Math.max(0,networkClient?networkCountdown:Math.ceil((countdownEnds-now)/1000))
      if(presentedCountdown!==lastPresentedCountdown){lastPresentedCountdown=presentedCountdown;if(!presentedCountdown)say('SPLASH! 예측하고, 연결하고, 탈출하세요')}
      cores.forEach(core=>{
        if(!core.flight)return
        const flight=core.flight,t=Math.min(1,(now-flight.start)/flight.duration),ease=t*t*(3-2*t)
        core.group.position.set(THREE.MathUtils.lerp(flight.fromX,flight.toX,ease),Math.sin(t*Math.PI)*1.8,THREE.MathUtils.lerp(flight.fromZ,flight.toZ,ease))
        if(t>=1){core.group.position.set(flight.toX,0,flight.toZ);core.ring.visible=true;core.flight=undefined}
      })
      let itemFloatIndex=0;for(const item of itemViews.values()){item.group.position.y=.08+Math.sin(now*.004+itemFloatIndex++)*.08;item.group.rotation.y+=dt*1.7}
      const throwPlan=aiming?getThrowPlan():null
      aimArc.visible=!!throwPlan;aimMarker.visible=!!throwPlan
      if(throwPlan){
        for(let index=0;index<=aimSegments;index++){
          const t=index/aimSegments,offset=index*3
          aimPositions[offset]=THREE.MathUtils.lerp(throwPlan.fromX,throwPlan.toX,t);aimPositions[offset+1]=.45+Math.sin(t*Math.PI)*1.8;aimPositions[offset+2]=THREE.MathUtils.lerp(throwPlan.fromZ,throwPlan.toZ,t)
        }
        aimGeometry.attributes.position.needsUpdate=true;aimMarker.position.set(throwPlan.toX,.075,throwPlan.toZ);aimMarker.scale.setScalar(1+Math.sin(now*.014)*.12);aimMarker.rotation.z+=dt*1.8
      }
      fanBlades.rotation.x+=dt*(fanState==='ACTIVE'?17:fanState==='WARNING'?5.5:.8)
      toyVehicle.visible=vehicleActive;toyVehicle.position.set(vehicleX,0,1);toyVehicle.rotation.y=Math.sin(now*.01)*.025
      if(vehicleActive)toyVehicle.children.slice(2).forEach(child=>child.rotation.z-=dt*8)
      windStreaks.forEach((streak,index)=>{
        streak.visible=fanState!=='CALM';(streak.material as THREE.MeshBasicMaterial).opacity=fanState==='ACTIVE'?.34:.12
        if(fanState!=='CALM'){
          streak.position.x-=dt*(fanState==='ACTIVE'?8.5:2.4)
          if(streak.position.x<-16.5){streak.position.x=16.8;streak.position.z=-9+((index*7+Math.floor(now*.001))%18)}
        }
      })
      if(networkClient)actors.forEach(actor=>{
        const blend=1-Math.exp(-dt*(actor===controlled?18:11));actor.renderX=THREE.MathUtils.lerp(actor.renderX,actor.targetX,blend);actor.renderZ=THREE.MathUtils.lerp(actor.renderZ,actor.targetZ,blend)
      })
      actors.forEach((actor,index)=>{
        const x=networkClient?actor.renderX:actor.x,z=networkClient?actor.renderZ:actor.z
        const travel=Math.hypot(x-actor.lastRenderX,z-actor.lastRenderZ),travelSpeed=travel/Math.max(dt,.001),canWalk=!actor.downedUntil&&!actor.eliminated
        const targetWalk=canWalk?THREE.MathUtils.clamp(travelSpeed/GAME_BALANCE.PLAYER_SPEED,0,1):0
        actor.walkBlend=THREE.MathUtils.lerp(actor.walkBlend,targetWalk,1-Math.exp(-dt*(targetWalk>actor.walkBlend?9:6.5)))
        if(travel>.0005)actor.walkPhase+=travel*8.4
        const stride=Math.sin(actor.walkPhase)*actor.walkBlend,leftLift=Math.max(0,stride),rightLift=Math.max(0,-stride),motionBlend=1-Math.exp(-dt*11)
        actor.rig.leftArm.rotation.x=THREE.MathUtils.lerp(actor.rig.leftArm.rotation.x,stride*.46,motionBlend)
        actor.rig.rightArm.rotation.x=THREE.MathUtils.lerp(actor.rig.rightArm.rotation.x,-stride*.46,motionBlend)
        actor.rig.leftArm.rotation.z=THREE.MathUtils.lerp(actor.rig.leftArm.rotation.z,-1.02+stride*.22,motionBlend)
        actor.rig.rightArm.rotation.z=THREE.MathUtils.lerp(actor.rig.rightArm.rotation.z,1.02+stride*.22,motionBlend)
        actor.rig.leftLeg.rotation.x=THREE.MathUtils.lerp(actor.rig.leftLeg.rotation.x,-stride*.68,motionBlend)
        actor.rig.rightLeg.rotation.x=THREE.MathUtils.lerp(actor.rig.rightLeg.rotation.x,stride*.68,motionBlend)
        actor.rig.leftLeg.rotation.z=THREE.MathUtils.lerp(actor.rig.leftLeg.rotation.z,-stride*.1,motionBlend)
        actor.rig.rightLeg.rotation.z=THREE.MathUtils.lerp(actor.rig.rightLeg.rotation.z,stride*.1,motionBlend)
        actor.rig.leftLeg.position.y=THREE.MathUtils.lerp(actor.rig.leftLeg.position.y,.2+leftLift*.06,motionBlend)
        actor.rig.rightLeg.position.y=THREE.MathUtils.lerp(actor.rig.rightLeg.position.y,.2+rightLift*.06,motionBlend)
        actor.rig.body.rotation.z=THREE.MathUtils.lerp(actor.rig.body.rotation.z,stride*.026,motionBlend)
        actor.yaw=lerpAngle(actor.yaw,actor.targetYaw,1-Math.exp(-dt*13));actor.model.rotation.y=actor.yaw
        actor.model.rotation.x=THREE.MathUtils.lerp(actor.model.rotation.x,actor.walkBlend*.028,motionBlend)
        actor.model.position.set(x,actor.jumpY+(leftLift+rightLift)*.006+Math.sin(now*.003+index)*.003,z);actor.shadow.position.set(x,.025,z);actor.shadow.scale.setScalar(1-THREE.MathUtils.clamp(actor.jumpY*.22,0,.3));(actor.shadow.material as THREE.MeshBasicMaterial).opacity=.42-THREE.MathUtils.clamp(actor.jumpY*.14,0,.2);actor.rescueRing.position.set(x,.13,z);actor.lastRenderX=x;actor.lastRenderZ=z
        if(actor.rescueRing.visible){const pulse=1+Math.sin(now*.012+index)*.25;actor.rescueRing.scale.setScalar(pulse);actor.rescueRing.rotation.z+=dt*2.5}
      })
      if(debug){
        actors.forEach((actor,index)=>{if(!networkClient){actor.serverX=actor.x;actor.serverZ=actor.z}debugColliders[index].visible=actor.model.visible;debugColliders[index].position.set(networkClient?actor.renderX:actor.x,.055,networkClient?actor.renderZ:actor.z)})
        serverGhost.visible=!!networkClient&&controlled.model.visible;serverGhost.position.set(controlled.serverX,.065,controlled.serverZ);serverGhost.rotation.z+=dt*1.2
        bots.forEach((brain,index)=>{
          const path=debugPaths[index],target=actors.filter(actor=>actor.team!==brain.team&&!actor.eliminated).sort((a,b)=>Math.hypot(a.x-brain.x,a.z-brain.z)-Math.hypot(b.x-brain.x,b.z-brain.z))[0]
          path.line.visible=brain.model.visible&&!!target
          if(target){path.positions.set([brain.x,.12,brain.z,target.x,.12,target.z]);path.geometry.attributes.position.needsUpdate=true}
        })
      }
      bursts.forEach(burst=>{
        if(!burst.active)return
        const age=(now-burst.born)/720,fade=Math.max(0,1-age),shockMaterial=burst.shock.material as THREE.MeshBasicMaterial
        burst.material.opacity=fade*.88;shockMaterial.opacity=fade*.34;burst.shock.scale.setScalar(.3+age*3.2);burst.light.intensity=fade*20
        burst.cells.forEach((cell,index)=>{
          const cellPulse=.72+Math.sin(Math.min(1,age*1.35)*Math.PI)*.7
          burstMatrix.position.set(cell.x,.26+Math.sin(Math.min(1,age)*Math.PI)*.36,cell.z);burstMatrix.rotation.set(age*3,index*.37,0);burstMatrix.scale.setScalar(fade*cellPulse*(index?1:1.35));burstMatrix.updateMatrix();burst.pulses.setMatrixAt(index,burstMatrix.matrix)
          burstMatrix.position.set(cell.x,.08,cell.z);burstMatrix.rotation.set(Math.PI/2,0,index*.21);burstMatrix.scale.setScalar(.3+age*1.75);burstMatrix.updateMatrix();burst.rings.setMatrixAt(index,burstMatrix.matrix)
        })
        for(let index=0;index<36;index++){
          const cell=burst.cells[index%burst.cells.length],angle=index*.91,radius=age*(.34+(index%4)*.13)
          burstMatrix.position.set(cell.x+Math.cos(angle)*radius,.32+age*(1.15+(index%4)*.18)-age*age*1.15,cell.z+Math.sin(angle)*radius);burstMatrix.rotation.set(age*8+index,age*11+index*.4,age*7);burstMatrix.scale.setScalar(fade*(.58+index%3*.14));burstMatrix.updateMatrix();burst.shards.setMatrixAt(index,burstMatrix.matrix)
        }
        burst.pulses.instanceMatrix.needsUpdate=true;burst.rings.instanceMatrix.needsUpdate=true;burst.shards.instanceMatrix.needsUpdate=true
        if(age>=1){burst.active=false;burst.group.visible=false;burst.light.intensity=0}
      })
      for(let index=particleExplosions.length-1;index>=0;index--){
        const effect=particleExplosions[index],age=(now-effect.born)/1000
        effect.system.update({now,delta:dt,elapsed:age})
        if(age>1.05){scene.remove(effect.system.instance);effect.system.dispose();particleExplosions.splice(index,1)}
      }
      for(let index=debris.length-1;index>=0;index--){
        const piece=debris[index],age=(now-piece.born)/1000
        piece.velocity.y-=7.2*dt;piece.mesh.position.addScaledVector(piece.velocity,dt);piece.mesh.rotation.x+=piece.spin.x*dt;piece.mesh.rotation.y+=piece.spin.y*dt;piece.mesh.rotation.z+=piece.spin.z*dt
        if(piece.mesh.position.y<.11){piece.mesh.position.y=.11;piece.velocity.y=Math.abs(piece.velocity.y)*.34;piece.velocity.x*=.82;piece.velocity.z*=.82}
        if(age>1.35){scene.remove(piece.mesh);piece.mesh.geometry.dispose();(piece.mesh.material as THREE.Material).dispose();debris.splice(index,1)}
      }
      const controlledX=networkClient?controlled.renderX:controlled.x,controlledZ=networkClient?controlled.renderZ:controlled.z
      const cameraForwardX=Math.sin(cameraYaw),cameraForwardZ=Math.cos(cameraYaw)
      const desiredCamera=new THREE.Vector3(controlledX-cameraForwardX*6.4,4.25,controlledZ-cameraForwardZ*6.4)
      if(shake>.002){desiredCamera.x+=(Math.random()-.5)*shake;desiredCamera.y+=(Math.random()-.5)*shake*.45;shake*=.88}
      camera.position.lerp(desiredCamera,1-Math.exp(-dt*6.2));camera.lookAt(controlledX+cameraForwardX*2.4,1.05,controlledZ+cameraForwardZ*2.4);renderer.render(scene,camera)
      if(now-lastUi>100){lastUi=now;const ownerId=networkClient?localNetworkId:controlled.id;setUi(v=>({...v,time:Math.max(0,Math.floor(networkClient?networkRemaining:GAME_BALANCE.MATCH_SECONDS-elapsed)),countdown:presentedCountdown,localTeam:controlled.team,playerHits:controlled.hits,health:Math.max(0,3-controlled.hits),botHits:bot.hits,allyHits:ally.hits,rival2Hits:vio.hits,alliesAlive:actors.filter(actor=>actor.team===controlled.team&&!actor.eliminated&&actor.model.visible).length,rivalsAlive:actors.filter(actor=>actor.team!==controlled.team&&!actor.eliminated&&actor.model.visible).length,onlineHumans:networkHumanCount,cores:Math.max(0,controlled.bombCapacity-cores.filter(core=>core.owner===ownerId).length),capacity:controlled.bombCapacity,canKick:controlled.canKick,canThrow:controlled.canThrow,pierceCharges:controlled.pierceCharges,chain:chainBest,dash:Math.min(1,Math.max(0,(now-controlled.dashReady+GAME_BALANCE.DASH_COOLDOWN_MS)/GAME_BALANCE.DASH_COOLDOWN_MS)),fan:fanState,vehicle:vehicleActive,fps:Math.round(1/Math.max(.001,dt)),frameMs:Number((dt*1000).toFixed(1)),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,textures:renderer.info.memory.textures,simBodies:actors.filter(actor=>actor.model.visible).length+cores.length+itemViews.size,rtt:networkRtt,packetRate,pendingInputs:pendingInputs.length,serverPos:`${controlled.serverX.toFixed(2)},${controlled.serverZ.toFixed(2)}`,clientPos:`${controlled.x.toFixed(2)},${controlled.z.toFixed(2)}`}))}
      frame=requestAnimationFrame(loop)
    }
    frame=requestAnimationFrame(loop)
    return()=>{
      cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('keydown',onDown);window.removeEventListener('keyup',onUp);renderer.domElement.removeEventListener('pointermove',onPointerMove);renderer.domElement.removeEventListener('pointerdown',focusArena);stopNetwork();networkClient?.close();if(networkClientRef.current===networkClient)networkClientRef.current=null;audio.close();music.close();if(musicRef.current===music)musicRef.current=null;particleExplosions.forEach(effect=>effect.system.dispose());particleExplosions.length=0
      renderer.dispose();scene.traverse(object=>{if(object instanceof THREE.Mesh||object instanceof THREE.Sprite){object.geometry?.dispose?.();const material=(object as THREE.Mesh).material;if(Array.isArray(material))material.forEach(item=>item.dispose());else material?.dispose()}})
      if(host.contains(renderer.domElement))host.removeChild(renderer.domElement)
    }
  },[round,networkSession])

  const restart=()=>{setResult(null);setUi(value=>({...initialUi(),localTeam:value.localTeam,message:networkSession?'재경기를 서버에 요청했습니다…':'F로 Core를 설치하고 SPACE로 위험을 뛰어넘으세요'}));if(networkSession&&networkClientRef.current){networkClientRef.current.send({type:'REMATCH'});return}setRound(value=>value+1)}
  const localCyan=ui.localTeam==='cyan'
  const yourTeam=localCyan?{names:'BLOO · LUMI',images:[BLUE,YELLOW]}:{names:'CORAL · VIO',images:[RED,VIO]}
  const rivalTeam=localCyan?{names:'CORAL · VIO',images:[RED,VIO]}:{names:'BLOO · LUMI',images:[BLUE,YELLOW]}
  const winnerTeam=result==='win'?yourTeam:rivalTeam
  return <main className="game">
    <div ref={hostRef} className="three-host"/>
    <header className="game-header"><button onClick={onExit}><ArrowLeft/> 나가기</button><div className="match-brand"><Mark/><span>ROCK SIZZLE PREPPERS<small>CORE SKIRMISH · 30 HZ SIM</small></span></div><button className={`sound ${muted?'muted':''}`} onClick={()=>setMuted(value=>!value)} aria-label={muted?'사운드 켜기':'사운드 끄기'}>{muted?<VolumeX/>:<Volume2/>}</button></header>
    <section className="score"><div className={`team you ${ui.localTeam}`}><span className="avatar-stack"><img src={yourTeam.images[0]}/><img src={yourTeam.images[1]}/></span><span>TEAM YOU<small>{yourTeam.names}</small></span><b>{ui.alliesAlive}</b></div><time>{String(Math.floor(ui.time/60)).padStart(2,'0')}:{String(ui.time%60).padStart(2,'0')}</time><div className={`team rival ${localCyan?'coral':'cyan'}`}><b>{ui.rivalsAlive}</b><span>RIVALS<small>{rivalTeam.names}</small></span><span className="avatar-stack"><img src={rivalTeam.images[0]}/><img src={rivalTeam.images[1]}/></span></div></section>
    <div className="message"><Sparkles/>{ui.message}</div>
    <div className="health-hud"><span>HP</span>{[0,1,2].map(index=><Heart key={index} className={index<ui.health?'filled':'empty'}/>)}</div>
    <aside className="status-panel"><span><Bot/> {networkSession?`ONLINE ${ui.onlineHumans}/4 · BOT FILL`:'3 BOT FILL · 2V2'}</span><span><Gauge/> 30 HZ LOGIC</span><span><Crosshair/> {debug?'DEBUG GRID + COLLIDERS':'HIDDEN GRID'}</span><span className={`fan-state ${ui.fan.toLowerCase()}`}><Wind/> FAN {ui.fan}</span>{ui.vehicle&&<span className="vehicle-state"><Zap/> TOY EXPRESS ACTIVE</span>}{debug&&<><span className="debug-stat">FPS {ui.fps} · {ui.frameMs} MS</span><span className="debug-stat">DRAW {ui.drawCalls} · TRIS {ui.triangles.toLocaleString()}</span><span className="debug-stat">TEX {ui.textures} · SIM BODIES {ui.simBodies}</span><span className="debug-stat">SERVER {ui.serverPos} · CLIENT {ui.clientPos}</span>{networkSession&&<><span className="debug-stat">RTT {ui.rtt} MS · RX {ui.packetRate}/S</span><span className="debug-stat">PENDING INPUT {ui.pendingInputs}</span></>}</>}</aside>
    <section className="ability-bar"><div><kbd>F</kbd><span className="core-orb"/><p><b>SPLASH CORE</b><small>{ui.cores} / {ui.capacity} READY</small></p></div><div><kbd>SPACE</kbd><ArrowUp/><p><b>JUMP</b><small>벽과 구멍 넘기</small></p></div><div><kbd>C</kbd><Box/><p><b>BLOCK BUILD</b><small>기본 장애물 설치</small></p></div><div className={ui.dash<.99?'cooling':''}><kbd>SHIFT</kbd><Zap/><p><b>RIPPLE DASH</b><small>{ui.dash>=.99?'READY':'RECHARGING'}</small></p></div><div className={ui.canKick?'':'locked'}><kbd>E</kbd><HeartPulse/><p><b>CORE KICK</b><small>{ui.canKick?'ITEM READY':'ITEM LOCKED'}</small></p></div><div className={ui.canThrow?'':'locked'}><kbd>Q</kbd><Send/><p><b>CORE THROW</b><small>{ui.canThrow?'ITEM READY':'ITEM LOCKED'}</small></p></div>{(ui.chain>1||ui.pierceCharges>0)&&<strong>{ui.pierceCharges>0?`PIERCE ×${ui.pierceCharges}`:`CHAIN ×${ui.chain}`}</strong>}</section>
    <div className="controls">WASD 이동 <i/> SPACE 점프 <i/> F 폭탄 <i/> C 장애물 <i/> SHIFT 대시 <i/> E 밀기 <i/> Q 투척 <i/> R 구조</div>
    {ui.countdown>0&&<div className="match-countdown"><span>GET READY</span><strong>{ui.countdown}</strong><small>PREDICT · MANIPULATE · ESCAPE</small></div>}
    {result&&<div className="result-overlay"><div className={`result-panel ${result}`}><span>{result==='win'?'YOUR TEAM SECURED':'YOUR TEAM FLUX LOCKED'}</span><h1>{winnerTeam.names.replace(' · ',' & ')} WIN!</h1><p>{result==='win'?'연쇄 파동과 구조 타이밍으로 팀이 끝까지 살아남았습니다.':'아군이 잠긴 6초 동안 접근해 R로 구조하면 흐름을 뒤집을 수 있습니다.'}</p><div><button onClick={restart}><RotateCcw/> 한 판 더</button><button onClick={onExit}>로비로</button></div></div></div>}
  </main>
}
