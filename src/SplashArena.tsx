import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Bot, Crosshair, Gauge, Heart, RotateCcw, Sparkles, Volume2, VolumeX, Wind, Zap } from 'lucide-react'
import * as THREE from 'three'
import { GIANT_PLAYROOM } from './game-core/arena'
import { GAME_BALANCE } from './game-core/config'
import { blastHitWalls } from './game-core/destruction'
import { isCellBlocked, isInsideCircularBlast, traceExplosion, worldToGrid } from './game-core/grid'
import { itemForRoll, piercingFloorCells, stackItemEffect, throwDistanceForLevel, tracePiercingExplosion, type ItemKind } from './game-core/powerups'
import { canPlaceCore, matchWinner } from './game-core/rules'
import { fanStateAt, vehicleStateAt } from './game-core/timeline'
import { BALL_PIT, BALL_PIT_STEPS, isProtectedFloorAt, JUMP_PADS, jumpPadAt, movementMultiplierAt, movingHazardPushAt, PLAYGROUND_PLATFORMS, PLAYGROUND_RAMPS, PLAYGROUND_ROLLERS, rollerPushAt, slidePushAt, SPINNER, spinnerPushAt, staticPlaygroundCollisionAt, terrainHeightAt, TUBE } from './game-core/playground'
import type { RoomSnapshot, ServerMessage } from './game-core/protocol'
import { NetworkClient, type NetworkSession } from './network/NetworkClient'
import { AudioManager } from './audio/AudioManager'
import { GameMusicPlaylist } from './audio/GameMusicPlaylist'
import { createRippleModel, type RippleRig, type RippleVariant } from './three/RippleModel'
import { poseRippleRig, RIPPLE_GESTURE_DURATION, rippleStepRate, type RippleGestureKind } from './three/RippleAnimator'
import { ACHIEVEMENT_UNLOCKED_EVENT, recordAchievementEvent, type AchievementDefinition, type AchievementUnlockDetail } from './achievements'

const BLUE = '/assets/splash/ripple-blue-keyart-v2-web.png'
const RED = '/assets/splash/ripple-red-keyart-v2-web.png'
const YELLOW = '/assets/splash/ripple-yellow-keyart-v2-web.png'
const VIO = '/assets/splash/ripple-vio-keyart-v1-web.webp'
const VARIANT_INFO:Record<RippleVariant,{name:string;image:string}>={bloo:{name:'BLOO',image:BLUE},lumi:{name:'LUMI',image:YELLOW},coral:{name:'CORAL',image:RED},vio:{name:'VIO',image:VIO}}
const GAME_MUSIC = [
  '/assets/audio/neon-bounce.mp3',
  '/assets/audio/neon-platform-rush-1.mp3',
  '/assets/audio/neon-platform-rush-2.mp3',
]
const ITEM_ICON_PATHS:Record<ItemKind,string>={KICK:'/assets/items/kick-icon-v1.webp',THROW:'/assets/items/throw-icon-v1.webp',CAPACITY:'/assets/items/capacity-icon-v1.webp',PIERCE:'/assets/items/pierce-icon-v1.webp'}
const ACTIVE_ITEM_KINDS:ItemKind[]=['THROW','CAPACITY','PIERCE']
const CORE_VISUAL_RADIUS=.62
const TAUNT_LABELS:Record<RippleVariant,string>={bloo:'ANTENNA SCAN',coral:'CHAOS SHUFFLE',lumi:'HEAVY BOUNCE',vio:'VIO BOW'}
const HALF_X = GIANT_PLAYROOM.halfX, HALF_Z = GIANT_PLAYROOM.halfZ
const ARENA_X = HALF_X*2+1, ARENA_Z = HALF_Z*2+1
const WALLS = GIANT_PLAYROOM.walls

type Team = 'cyan'|'coral'
type Actor = { id:string; name:string; team:Team; isPlayer:boolean; networkId?:string; model:THREE.Group; rig:RippleRig; materials:THREE.MeshStandardMaterial[]; shadow:THREE.Mesh; rescueRing:THREE.Mesh; baseScale:number; x:number; z:number; serverX:number; serverZ:number; renderX:number; renderZ:number; targetX:number; targetZ:number; lastRenderX:number; lastRenderZ:number; walkPhase:number; walkBlend:number; wasAirborne:boolean; landingBlend:number; gesture:RippleGestureKind|null; gestureStarted:number; tauntReady:number; tauntServerStartedAt:number; yaw:number; targetYaw:number; hits:number; bombCapacity:number; canKick:boolean; canThrow:boolean; kickLevel:number; throwLevel:number; pierceCharges:number; jumpY:number; jumpHeight:number; jumpReady:number; jumpStarted:number; jumpUntil:number; jumpBaseY:number; buildReady:number; falling:boolean; fallVelocity:number; lockedUntil:number; downedUntil:number; eliminated:boolean; dashReady:number }
type Flight = { fromX:number; fromY:number; fromZ:number; toX:number; toY:number; toZ:number; start:number; duration:number; arcHeight?:number }
type Core = { id:number; networkId?:string; group:THREE.Group; x:number; y:number; z:number; fuse:number; owner:string; team:Team; piercing:boolean; ring:THREE.Mesh; shellMaterial:THREE.ShaderMaterial; nucleus:THREE.Mesh; halo:THREE.Mesh; energyRings:THREE.Mesh[]; sparks:THREE.Mesh[]; flight?:Flight }
type ItemView={id:string;kind:ItemKind;x:number;z:number;baseY:number;group:THREE.Group;icon:THREE.Sprite}
type Burst = { group:THREE.Group; born:number; material:THREE.MeshBasicMaterial; coreMaterial:THREE.MeshBasicMaterial; beamMaterial:THREE.ShaderMaterial; beamHaloMaterial:THREE.ShaderMaterial; beamCoreMaterial:THREE.MeshBasicMaterial; flameMaterial:THREE.ShaderMaterial; flamePoints:THREE.Points; flamePositions:Float32Array; flameSeeds:Float32Array; pulses:THREE.InstancedMesh; cores:THREE.InstancedMesh; beamHalos:THREE.InstancedMesh; ribbons:THREE.InstancedMesh; beamCores:THREE.InstancedMesh; rings:THREE.InstancedMesh; shards:THREE.InstancedMesh; shock:THREE.Mesh; light:THREE.PointLight; cells:Array<{x:number;z:number}>; beams:Array<{x:number;z:number;length:number}>; active:boolean }
type Debris = {mesh:THREE.Mesh;velocity:THREE.Vector3;spin:THREE.Vector3;born:number}
type UiState = { time:number; countdown:number; localTeam:Team; playerHits:number; health:number; maxHealth:number; jump:number; botHits:number; allyHits:number; rival2Hits:number; alliesAlive:number; rivalsAlive:number; onlineHumans:number; cores:number; capacity:number; canKick:boolean; canThrow:boolean; kickLevel:number; throwLevel:number; pierceCharges:number; chain:number; dash:number; build:number; taunt:number; fan:'CALM'|'WARNING'|'ACTIVE'; vehicle:boolean; fps:number;frameMs:number;drawCalls:number;triangles:number;textures:number;simBodies:number;rtt:number;packetRate:number;pendingInputs:number;serverPos:string;clientPos:string;message:string }
type SeriesState={round:number;scores:Record<Team,number>;winner:Team|null}

const lerpAngle=(from:number,to:number,alpha:number)=>from+Math.atan2(Math.sin(to-from),Math.cos(to-from))*alpha
const initialUi=():UiState=>({time:GAME_BALANCE.MATCH_SECONDS,countdown:3,localTeam:'cyan',playerHits:0,health:GAME_BALANCE.PLAYER_MAX_HITS,maxHealth:GAME_BALANCE.PLAYER_MAX_HITS,jump:1,botHits:0,allyHits:0,rival2Hits:0,alliesAlive:2,rivalsAlive:2,onlineHumans:0,cores:1,capacity:1,canKick:false,canThrow:false,kickLevel:0,throwLevel:0,pierceCharges:0,chain:0,dash:1,build:1,taunt:1,fan:'CALM',vehicle:false,fps:0,frameMs:0,drawCalls:0,triangles:0,textures:0,simBodies:4,rtt:0,packetRate:0,pendingInputs:0,serverPos:'0.00,0.00',clientPos:'0.00,0.00',message:'READY · 시작 신호를 기다리세요'})
const initialSeries=():SeriesState=>({round:1,scores:{cyan:0,coral:0},winner:null})

function Mark(){ return <span className="splash-mark"><i/><i/><b/></span> }
export default function SplashArena({onExit,networkSession,selectedVariant}:{onExit:()=>void;networkSession?:NetworkSession;selectedVariant:RippleVariant}){
  const hostRef=useRef<HTMLDivElement>(null)
  const networkClientRef=useRef<NetworkClient|null>(null)
  const musicRef=useRef<GameMusicPlaylist|null>(null)
  const roundAdvanceTimerRef=useRef<number|undefined>(undefined)
  const [round,setRound]=useState(0)
  const [result,setResult]=useState<'win'|'lose'|'draw'|null>(null)
  const [series,setSeries]=useState<SeriesState>(initialSeries)
  const seriesRef=useRef(series);seriesRef.current=series
  const [muted,setMuted]=useState(false),mutedRef=useRef(false);mutedRef.current=muted
  const debug=new URLSearchParams(location.search).get('debug')==='true'
  const [ui,setUi]=useState<UiState>(initialUi)
  const [achievementToast,setAchievementToast]=useState<AchievementDefinition|null>(null)
  const achievementToastTimerRef=useRef<number|undefined>(undefined)
  useEffect(()=>musicRef.current?.setMuted(muted),[muted])
  useEffect(()=>()=>{if(roundAdvanceTimerRef.current!==undefined)window.clearTimeout(roundAdvanceTimerRef.current)},[])
  useEffect(()=>{
    const onUnlock=(event:Event)=>{
      const detail=(event as CustomEvent<AchievementUnlockDetail>).detail
      if(!detail?.achievement)return
      setAchievementToast(detail.achievement)
      if(achievementToastTimerRef.current!==undefined)window.clearTimeout(achievementToastTimerRef.current)
      achievementToastTimerRef.current=window.setTimeout(()=>{setAchievementToast(null);achievementToastTimerRef.current=undefined},4600)
    }
    window.addEventListener(ACHIEVEMENT_UNLOCKED_EVENT,onUnlock)
    return()=>{window.removeEventListener(ACHIEVEMENT_UNLOCKED_EVENT,onUnlock);if(achievementToastTimerRef.current!==undefined)window.clearTimeout(achievementToastTimerRef.current)}
  },[])

  useEffect(()=>{
    const host=hostRef.current!
    const rescueWorldPrompt=document.createElement('div')
    rescueWorldPrompt.className='rescue-world-prompt'
    rescueWorldPrompt.setAttribute('role','status')
    rescueWorldPrompt.setAttribute('aria-hidden','true')
    rescueWorldPrompt.hidden=true
    rescueWorldPrompt.innerHTML='<span class="skill-icon skill-rescue"></span><span><kbd>R</kbd><b>팀원 구조</b><small>위에서 눌러 살리기</small></span>'
    host.appendChild(rescueWorldPrompt)
    const audio=new AudioManager(()=>mutedRef.current)
    const music=new GameMusicPlaylist(GAME_MUSIC,()=>mutedRef.current);musicRef.current=music;music.unlock()
    const arenaState={...GIANT_PLAYROOM,walls:new Set(WALLS)}
    const blocked=(x:number,z:number)=>isCellBlocked(arenaState,{x,z})
    const scene=new THREE.Scene()
    scene.background=new THREE.Color('#202b55')
    scene.fog=new THREE.FogExp2('#40355b',.009)
    const camera=new THREE.PerspectiveCamera(58,1,.1,120),rescuePromptPoint=new THREE.Vector3()
    camera.position.set(-17,5.6,6)
    camera.lookAt(0,0,0)
    const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'})
    const renderPixelRatio=Math.min(devicePixelRatio,innerWidth<1200?1.1:1.35)
    renderer.setPixelRatio(renderPixelRatio)
    let currentPixelRatio=renderPixelRatio,slowFrameCount=0,fastFrameCount=0
    // Characters already use soft contact-shadow meshes. Disabling the full
    // scene shadow pass avoids redrawing hundreds of playground meshes.
    renderer.shadowMap.enabled=false
    renderer.outputColorSpace=THREE.SRGBColorSpace
    renderer.toneMapping=THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure=1.18
    renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','Rock Sizzle Preppers 3D arena')
    host.appendChild(renderer.domElement)

    scene.add(new THREE.HemisphereLight('#fff0cf','#362657',3.15))
    const sun=new THREE.DirectionalLight('#ffdba8',5.2)
    sun.position.set(8,18,12);sun.castShadow=false
    scene.add(sun)
    const cyanLight=new THREE.PointLight('#31e8ff',25,12);cyanLight.position.set(-5,2,-3);scene.add(cyanLight)
    const coralLight=new THREE.PointLight('#ff5a63',20,11);coralLight.position.set(5,2,3);scene.add(coralLight)

    const floorMat=new THREE.MeshStandardMaterial({color:'#fff0cf',roughness:.86,metalness:.01})
    const floorCellCount=ARENA_X*ARENA_Z
    const floor=new THREE.InstancedMesh(new THREE.BoxGeometry(.98,.5,.98),floorMat,floorCellCount)
    const floorCellIndices=new Map<string,number>(),floorMatrix=new THREE.Object3D()
    let floorIndex=0
    for(let z=-HALF_Z;z<=HALF_Z;z++)for(let x=-HALF_X;x<=HALF_X;x++){
      floorMatrix.position.set(x,-.25,z);floorMatrix.scale.set(1,1,1);floorMatrix.updateMatrix();floor.setMatrixAt(floorIndex,floorMatrix.matrix)
      const checker=(x+z)&1,edgeTint=Math.abs(x)>15||Math.abs(z)>10,hash=Math.abs(x*17+z*29)%23
      let floorColor=edgeTint?(checker?'#dcae95':'#eac2a8'):(checker?'#efd8b8':'#f7e3c5')
      if(Math.abs(x)<=3&&Math.abs(z)<=2)floorColor=checker?'#8467b5':'#7557a5'
      else if(x<-3&&Math.abs(z)<=2)floorColor=checker?'#df9b89':'#e9b29f'
      else if(x>3&&Math.abs(z)<=2)floorColor=checker?'#86bfd0':'#9dd0d9'
      else if(hash===0)floorColor='#f0bf60'
      else if(hash===7)floorColor='#86bb75'
      floor.setColorAt(floorIndex,new THREE.Color(floorColor))
      floorCellIndices.set(`${x},${z}`,floorIndex++)
    }
    floor.instanceMatrix.setUsage(THREE.DynamicDrawUsage);if(floor.instanceColor)floor.instanceColor.needsUpdate=true;floor.receiveShadow=true;scene.add(floor)
    const setFloorCellVisible=(cell:string,visible:boolean)=>{
      const index=floorCellIndices.get(cell);if(index===undefined)return
      const [x,z]=cell.split(',').map(Number);floorMatrix.position.set(x,-.25,z);floorMatrix.scale.setScalar(visible?1:0);floorMatrix.updateMatrix();floor.setMatrixAt(index,floorMatrix.matrix);floor.instanceMatrix.needsUpdate=true
    }
    const underDeckMat=new THREE.MeshBasicMaterial({color:'#3f315c',side:THREE.DoubleSide})
    const underDeck=new THREE.Mesh(new THREE.BoxGeometry(ARENA_X+1.4,.24,ARENA_Z+1.4),underDeckMat);underDeck.position.y=-3.72;underDeck.receiveShadow=true;scene.add(underDeck)
    const underDeckGrid=new THREE.GridHelper(ARENA_X+1,ARENA_X+1,'#a36fa8','#57416d');underDeckGrid.position.y=-3.58;(underDeckGrid.material as THREE.Material).transparent=true;(underDeckGrid.material as THREE.Material).opacity=.7;scene.add(underDeckGrid)
    const beamMat=new THREE.MeshStandardMaterial({color:'#765077',emissive:'#392543',emissiveIntensity:.62,roughness:.78,metalness:.12})
    for(const z of [-7,-3,1,5]){const beam=new THREE.Mesh(new THREE.BoxGeometry(ARENA_X+1,.28,.32),beamMat);beam.position.set(0,-1.05,z);beam.castShadow=true;scene.add(beam)}
    for(const x of [-12,-6,0,6,12]){const beam=new THREE.Mesh(new THREE.BoxGeometry(.32,.28,ARENA_Z+1),beamMat);beam.position.set(x,-1.28,0);beam.castShadow=true;scene.add(beam)}
    const grid=new THREE.GridHelper(ARENA_X,ARENA_X,'#7ff5ff','#664f7d')
    grid.position.y=.012;(grid.material as THREE.Material).transparent=true;(grid.material as THREE.Material).opacity=.32;grid.visible=debug;scene.add(grid)

    // Giant indoor playground: all gameplay heights are authored in game-core/playground.ts.
    const playground=new THREE.Group();scene.add(playground)
    const padSideMaterial=new THREE.MeshStandardMaterial({color:'#4a3f83',roughness:.58,metalness:.03})
    const padTrimMaterial=new THREE.MeshStandardMaterial({color:'#ffd15d',roughness:.48,metalness:.02})
    const platformCapTransforms:{x:number;y:number;z:number;height:number}[]=[],platformTrimTransforms:{x:number;y:number;z:number;width:number;depth:number}[]=[]
    const platformBaseMaterial=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.62}),platformTopMaterial=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.54})
    const platformBases=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),platformBaseMaterial,PLAYGROUND_PLATFORMS.length),platformTops=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),platformTopMaterial,PLAYGROUND_PLATFORMS.length),platformMatrix=new THREE.Object3D()
    PLAYGROUND_PLATFORMS.forEach((platform,index)=>{
      platformMatrix.position.set(platform.x,platform.height*.5,platform.z);platformMatrix.scale.set(platform.width,platform.height,platform.depth);platformMatrix.updateMatrix();platformBases.setMatrixAt(index,platformMatrix.matrix);platformBases.setColorAt(index,new THREE.Color(platform.color))
      platformMatrix.position.set(platform.x,platform.height+.065,platform.z);platformMatrix.scale.set(platform.width-.16,.13,platform.depth-.16);platformMatrix.updateMatrix();platformTops.setMatrixAt(index,platformMatrix.matrix);platformTops.setColorAt(index,new THREE.Color(platform.accent))
      ;[[-platform.width*.5,0,.18,platform.depth],[platform.width*.5,0,.18,platform.depth],[0,-platform.depth*.5,platform.width,.18],[0,platform.depth*.5,platform.width,.18]].forEach(([ox,oz,w,d])=>platformTrimTransforms.push({x:platform.x+ox,y:platform.height-.02,z:platform.z+oz,width:w,depth:d}))
      ;[[-1,-1],[-1,1],[1,-1],[1,1]].forEach(([sx,sz])=>platformCapTransforms.push({x:platform.x+sx*platform.width*.5,y:platform.height*.5,z:platform.z+sz*platform.depth*.5,height:platform.height+.22}))
    })
    platformBases.instanceMatrix.needsUpdate=true;platformTops.instanceMatrix.needsUpdate=true;if(platformBases.instanceColor)platformBases.instanceColor.needsUpdate=true;if(platformTops.instanceColor)platformTops.instanceColor.needsUpdate=true;playground.add(platformBases,platformTops)
    const platformCaps=new THREE.InstancedMesh(new THREE.CylinderGeometry(.17,.17,1,10),padTrimMaterial,platformCapTransforms.length),platformCapMatrix=new THREE.Object3D()
    platformCapTransforms.forEach((cap,index)=>{platformCapMatrix.position.set(cap.x,cap.y,cap.z);platformCapMatrix.scale.set(1,cap.height,1);platformCapMatrix.updateMatrix();platformCaps.setMatrixAt(index,platformCapMatrix.matrix)});platformCaps.instanceMatrix.needsUpdate=true;playground.add(platformCaps)
    const platformTrims=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),padSideMaterial,platformTrimTransforms.length),platformTrimMatrix=new THREE.Object3D()
    platformTrimTransforms.forEach((trim,index)=>{platformTrimMatrix.position.set(trim.x,trim.y,trim.z);platformTrimMatrix.scale.set(trim.width,.22,trim.depth);platformTrimMatrix.updateMatrix();platformTrims.setMatrixAt(index,platformTrimMatrix.matrix)});platformTrims.instanceMatrix.needsUpdate=true;playground.add(platformTrims)
    const rampMaterial=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.57}),rampSurfaces=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),rampMaterial,PLAYGROUND_RAMPS.length),rampMatrix=new THREE.Object3D()
    PLAYGROUND_RAMPS.forEach((ramp,index)=>{
      const angle=Math.atan(ramp.height/(ramp.axis==='x'?ramp.width:ramp.depth)),slopeLength=Math.hypot(ramp.axis==='x'?ramp.width:ramp.depth,ramp.height)
      rampMatrix.position.set(ramp.x,ramp.height*.5,ramp.z);rampMatrix.rotation.set(0,0,0);if(ramp.axis==='x')rampMatrix.rotation.z=(ramp.highAt==='max'?1:-1)*angle;else rampMatrix.rotation.x=(ramp.highAt==='max'?-1:1)*angle
      rampMatrix.scale.set(ramp.axis==='x'?slopeLength:ramp.width,.18,ramp.axis==='x'?ramp.depth:slopeLength);rampMatrix.updateMatrix();rampSurfaces.setMatrixAt(index,rampMatrix.matrix);rampSurfaces.setColorAt(index,new THREE.Color(ramp.color))
    })
    rampSurfaces.instanceMatrix.needsUpdate=true;if(rampSurfaces.instanceColor)rampSurfaces.instanceColor.needsUpdate=true;playground.add(rampSurfaces)
    const stairRamp=PLAYGROUND_RAMPS.find(ramp=>ramp.id==='stair-ramp')!
    const stairTreads=new THREE.InstancedMesh(new THREE.BoxGeometry(stairRamp.width*.88,.13,.38),new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.56}),7),stairMatrix=new THREE.Object3D()
    for(let step=0;step<7;step++){const z=stairRamp.z-stairRamp.depth*.43+step*(stairRamp.depth*.86/6),height=terrainHeightAt(stairRamp.x,z);stairMatrix.position.set(stairRamp.x,height+.035,z);stairMatrix.updateMatrix();stairTreads.setMatrixAt(step,stairMatrix.matrix);stairTreads.setColorAt(step,new THREE.Color(step%2?'#f28b57':'#ffbe55'))}stairTreads.instanceMatrix.needsUpdate=true;if(stairTreads.instanceColor)stairTreads.instanceColor.needsUpdate=true;playground.add(stairTreads)
    const slideArchMat=new THREE.MeshStandardMaterial({color:'#f6b94c',roughness:.48}),slideArch=new THREE.Mesh(new THREE.TorusGeometry(2.28,.24,12,36,Math.PI),slideArchMat);slideArch.position.set(.05,1.5,-8.85);slideArch.castShadow=true;playground.add(slideArch)
    const slideSlope=Math.atan(1.28/2.5),slideRailLength=Math.hypot(2.5,1.28)-.26
    ;[-1.3,0].forEach((slideX,index)=>{
      const railColor=index?'#70d7f0':'#ffd069',railMaterial=new THREE.MeshStandardMaterial({color:railColor,roughness:.42})
      ;[-.51,.51].forEach(offset=>{const rail=new THREE.Mesh(new THREE.CapsuleGeometry(.13,slideRailLength,7,14),railMaterial);rail.rotation.x=Math.PI*.5+slideSlope;rail.position.set(slideX+offset,.72,-7.25);rail.castShadow=true;playground.add(rail)})
      const landing=new THREE.Mesh(new THREE.CapsuleGeometry(.48,.64,8,18),new THREE.MeshStandardMaterial({color:index?'#47a6d4':'#f0aa3e',roughness:.5}));landing.rotation.x=Math.PI*.5;landing.position.set(slideX,.18,-5.72);landing.scale.set(.9,.56,1);playground.add(landing)
    })
    const stairRailMaterial=new THREE.MeshStandardMaterial({color:'#ffca5d',roughness:.44})
    ;[-.66,.66].forEach(offset=>{const rail=new THREE.Mesh(new THREE.CapsuleGeometry(.11,slideRailLength,7,14),stairRailMaterial);rail.rotation.x=Math.PI*.5+slideSlope;rail.position.set(stairRamp.x+offset,.77,stairRamp.z);rail.castShadow=true;playground.add(rail)})
    const flagPole=new THREE.Mesh(new THREE.CylinderGeometry(.045,.055,1.6,10),padTrimMaterial);flagPole.position.set(.05,4.05,-8.85);playground.add(flagPole)
    const flagShape=new THREE.Shape();flagShape.moveTo(0,0);flagShape.lineTo(1,.18);flagShape.lineTo(0,.42);flagShape.closePath();const flag=new THREE.Mesh(new THREE.ShapeGeometry(flagShape),new THREE.MeshBasicMaterial({color:'#f05458',side:THREE.DoubleSide}));flag.position.set(.08,4.45,-8.85);playground.add(flag)

    const ballPitFloor=new THREE.Mesh(new THREE.BoxGeometry(BALL_PIT.width,.2,BALL_PIT.depth),new THREE.MeshStandardMaterial({color:'#67479a',roughness:.75}));ballPitFloor.position.set(BALL_PIT.x,.1,BALL_PIT.z);playground.add(ballPitFloor)
    ;[[0,-BALL_PIT.depth*.5,BALL_PIT.width+.5,.42],[0,BALL_PIT.depth*.5,BALL_PIT.width+.5,.42],[-BALL_PIT.width*.5,0,.42,BALL_PIT.depth+.4],[BALL_PIT.width*.5,0,.42,BALL_PIT.depth+.4]].forEach(([ox,oz,w,d],index)=>{const rail=new THREE.Mesh(new THREE.BoxGeometry(w,.78,d),new THREE.MeshStandardMaterial({color:index%2?'#7350a9':'#5e56ad',roughness:.58}));rail.position.set(BALL_PIT.x+ox,.39,BALL_PIT.z+oz);rail.castShadow=true;playground.add(rail)})
    const ballColors=['#ef6a4f','#f5b83f','#55b7d8','#74bd59','#785acb'],ballCount=132,ballGeometry=new THREE.SphereGeometry(.22,8,5)
    const ballMaterials=ballColors.map(color=>new THREE.MeshStandardMaterial({color,roughness:.52})),ballMeshes=ballMaterials.map(material=>new THREE.InstancedMesh(ballGeometry,material,Math.ceil(ballCount/ballMaterials.length))),ballCounts=ballMeshes.map(()=>0),ballMatrix=new THREE.Object3D()
    ballMeshes.forEach(mesh=>{mesh.castShadow=true;playground.add(mesh)})
    for(let index=0;index<ballCount;index++){
      const column=index%14,row=Math.floor(index/14),jitterX=Math.sin(index*7.13)*.11,jitterZ=Math.cos(index*4.71)*.11,colorIndex=index%ballMeshes.length,mesh=ballMeshes[colorIndex],instance=ballCounts[colorIndex]++
      ballMatrix.position.set(BALL_PIT.x-BALL_PIT.width*.43+column*(BALL_PIT.width*.86/13)+jitterX,.23+(index%3)*.055,BALL_PIT.z-BALL_PIT.depth*.4+row*(BALL_PIT.depth*.8/11)+jitterZ);ballMatrix.scale.setScalar(.86+(index%5)*.035);ballMatrix.updateMatrix();mesh.setMatrixAt(instance,ballMatrix.matrix)
    }
    ballMeshes.forEach((mesh,index)=>{mesh.count=ballCounts[index];mesh.instanceMatrix.needsUpdate=true})
    BALL_PIT_STEPS.forEach(step=>{const disc=new THREE.Mesh(new THREE.CylinderGeometry(step.radius,step.radius*1.08,step.height,28),new THREE.MeshStandardMaterial({color:step.color,roughness:.48}));disc.position.set(step.x,step.height*.5,step.z);disc.castShadow=true;playground.add(disc);const rim=new THREE.Mesh(new THREE.TorusGeometry(step.radius*.78,.075,9,28),new THREE.MeshStandardMaterial({color:'#ffe7a2',roughness:.44}));rim.rotation.x=Math.PI*.5;rim.position.set(step.x,step.height+.035,step.z);playground.add(rim)})

    const spinnerVisual=new THREE.Group();spinnerVisual.position.set(SPINNER.x,.3,SPINNER.z);playground.add(spinnerVisual)
    const spinnerHub=new THREE.Mesh(new THREE.CylinderGeometry(.55,.7,1.35,24),new THREE.MeshStandardMaterial({color:'#ef813d',roughness:.45}));spinnerHub.position.y=.38;spinnerHub.castShadow=true;spinnerVisual.add(spinnerHub)
    const spinnerArmMaterial=new THREE.MeshStandardMaterial({color:'#ffbd4f',roughness:.5})
    ;[0,Math.PI*.5].forEach(rotation=>{const armGroup=new THREE.Group();armGroup.rotation.y=rotation;const arm=new THREE.Mesh(new THREE.CapsuleGeometry(SPINNER.armWidth*.62,SPINNER.radius*2-.6,8,18),spinnerArmMaterial);arm.rotation.z=Math.PI*.5;arm.position.y=.45;arm.castShadow=true;armGroup.add(arm);for(let stripe=-2;stripe<=2;stripe++){const band=new THREE.Mesh(new THREE.CylinderGeometry(SPINNER.armWidth*.68,SPINNER.armWidth*.68,.27,14),new THREE.MeshStandardMaterial({color:stripe%2?'#ee705e':'#785bc2',roughness:.48}));band.rotation.z=Math.PI*.5;band.position.set(stripe*1.04,.45,0);armGroup.add(band)}spinnerVisual.add(armGroup)})

    const rollerVisuals=PLAYGROUND_ROLLERS.map(roller=>{const mesh=new THREE.Mesh(new THREE.CylinderGeometry(roller.radius,roller.radius,roller.length,24),new THREE.MeshStandardMaterial({color:roller.color,roughness:.48}));mesh.rotation.z=Math.PI*.5;mesh.position.set(roller.x,roller.radius,roller.z);mesh.castShadow=true;playground.add(mesh);for(const side of [-1,1]){const cap=new THREE.Mesh(new THREE.CylinderGeometry(roller.radius*1.06,roller.radius*1.06,.14,24),new THREE.MeshStandardMaterial({color:'#ffd45e',roughness:.4}));cap.rotation.z=Math.PI*.5;cap.position.set(roller.x+side*roller.length*.53,roller.radius,roller.z);playground.add(cap)}return mesh})
    JUMP_PADS.forEach(pad=>{const baseY=terrainHeightAt(pad.x,pad.z),base=new THREE.Mesh(new THREE.CylinderGeometry(pad.radius,pad.radius*1.08,.24,32),new THREE.MeshStandardMaterial({color:pad.color,emissive:pad.color,emissiveIntensity:.18,roughness:.45}));base.position.set(pad.x,baseY+.12,pad.z);base.receiveShadow=true;playground.add(base);const ring=new THREE.Mesh(new THREE.TorusGeometry(pad.radius*.65,.09,10,32),new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.72}));ring.rotation.x=Math.PI*.5;ring.position.set(pad.x,baseY+.27,pad.z);playground.add(ring)})

    const tubeMaterial=new THREE.MeshPhysicalMaterial({color:'#72ddff',transparent:true,opacity:.22,roughness:.12,metalness:.02,transmission:.25,depthWrite:false,side:THREE.DoubleSide})
    const tubeShell=new THREE.Mesh(new THREE.CylinderGeometry(TUBE.radius,TUBE.radius,TUBE.length,30,1,true),tubeMaterial);tubeShell.rotation.z=Math.PI*.5;tubeShell.position.set(TUBE.x,TUBE.radius,TUBE.z);playground.add(tubeShell)
    const tubeRings=new THREE.InstancedMesh(new THREE.TorusGeometry(TUBE.radius,.105,8,24),new THREE.MeshStandardMaterial({color:'#4e92d8',roughness:.38}),5),tubeRingMatrix=new THREE.Object3D()
    for(let step=-2;step<=2;step++){tubeRingMatrix.rotation.y=Math.PI*.5;tubeRingMatrix.position.set(TUBE.x+step*TUBE.length/4,TUBE.radius,TUBE.z);tubeRingMatrix.updateMatrix();tubeRings.setMatrixAt(step+2,tubeRingMatrix.matrix)}tubeRings.instanceMatrix.needsUpdate=true;playground.add(tubeRings)
    const tubeGlow=new THREE.Mesh(new THREE.CylinderGeometry(TUBE.radius*.56,TUBE.radius*.56,TUBE.length*.94,24,1,true),new THREE.MeshBasicMaterial({color:'#b8f8ff',transparent:true,opacity:.16,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));tubeGlow.rotation.z=Math.PI*.5;tubeGlow.position.copy(tubeShell.position);playground.add(tubeGlow)
    const bridgeColors=['#ef715e','#f3ad42','#f4cf58','#8fbd4d','#45a7d1','#725ec7']
    const bridgeSlats=new THREE.InstancedMesh(new THREE.BoxGeometry(.48,.12,2.5),new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.52}),10),bridgeMatrix=new THREE.Object3D()
    for(let slat=0;slat<10;slat++){bridgeMatrix.position.set(-2.16+slat*.48,.8,7.25);bridgeMatrix.updateMatrix();bridgeSlats.setMatrixAt(slat,bridgeMatrix.matrix);bridgeSlats.setColorAt(slat,new THREE.Color(bridgeColors[slat%bridgeColors.length]))}bridgeSlats.instanceMatrix.needsUpdate=true;if(bridgeSlats.instanceColor)bridgeSlats.instanceColor.needsUpdate=true;playground.add(bridgeSlats)

    const spawnArchVisuals:THREE.Group[]=[]
    const addSpawnArch=(x:number,team:Team)=>{const group=new THREE.Group(),color=team==='cyan'?'#38add9':'#ef745f',archMat=new THREE.MeshStandardMaterial({color,roughness:.48}),trimMat=new THREE.MeshStandardMaterial({color:'#ffd25b',roughness:.4});group.position.set(x,.92,0)
      ;[-3.2,3.2].forEach(z=>{const pillar=new THREE.Mesh(new THREE.CylinderGeometry(.25,.34,2.05,16),archMat);pillar.position.set(0,1.02,z);pillar.castShadow=true;group.add(pillar);const cap=new THREE.Mesh(new THREE.SphereGeometry(.34,16,10),trimMat);cap.position.set(0,2.22,z);group.add(cap)})
      const arch=new THREE.Mesh(new THREE.TorusGeometry(3.2,.25,14,40,Math.PI),archMat);arch.rotation.y=Math.PI*.5;arch.rotation.z=team==='cyan'?0:Math.PI;arch.position.y=2.05;group.add(arch)
      const portalPad=new THREE.Mesh(new THREE.CylinderGeometry(1.18,1.32,.18,32),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.62,roughness:.34}));portalPad.position.set(0,.16,0);group.add(portalPad)
      const portalRing=new THREE.Mesh(new THREE.TorusGeometry(.78,.09,10,32),new THREE.MeshBasicMaterial({color:'#d8fbff',transparent:true,opacity:.9,toneMapped:false}));portalRing.rotation.x=Math.PI*.5;portalRing.position.set(0,.27,0);group.add(portalRing)
      for(let star=0;star<5;star++){const shape=new THREE.Shape();for(let point=0;point<10;point++){const angle=-Math.PI*.5+point*Math.PI/5,radius=point%2?.09:.19,px=Math.cos(angle)*radius,py=Math.sin(angle)*radius;if(point===0)shape.moveTo(px,py);else shape.lineTo(px,py)}shape.closePath();const badge=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({color:'#ffe06b',side:THREE.DoubleSide,toneMapped:false}));badge.rotation.y=Math.PI*.5;badge.position.set(team==='cyan'?.26:-.26,2.55+Math.sin(star*.9)*.56,-2.1+star*1.05);group.add(badge)}
      playground.add(group);spawnArchVisuals.push(group)}
    addSpawnArch(-17.2,'cyan');addSpawnArch(17.2,'coral')

    const fenceMaterial=new THREE.MeshStandardMaterial({color:'#4b477d',roughness:.6}),postMaterial=new THREE.MeshStandardMaterial({color:'#ffc957',roughness:.45})
    const fencePostPositions:{x:number;z:number}[]=[]
    for(let x=-18;x<=18;x+=3)for(const z of [-12.55,12.55])fencePostPositions.push({x,z})
    for(let z=-12;z<=12;z+=3)for(const x of [-18.55,18.55])fencePostPositions.push({x,z})
    const fencePosts=new THREE.InstancedMesh(new THREE.CylinderGeometry(.09,.12,1.5,8),postMaterial,fencePostPositions.length),fencePostMatrix=new THREE.Object3D()
    fencePostPositions.forEach((position,index)=>{fencePostMatrix.position.set(position.x,.75,position.z);fencePostMatrix.updateMatrix();fencePosts.setMatrixAt(index,fencePostMatrix.matrix)});fencePosts.instanceMatrix.needsUpdate=true;playground.add(fencePosts)
    ;[[0,1.15,-12.55,36.5,.12,.12],[0,1.15,12.55,36.5,.12,.12],[-18.55,1.15,0,.12,.12,24.5],[18.55,1.15,0,.12,.12,24.5]].forEach(v=>{const rail=new THREE.Mesh(new THREE.BoxGeometry(v[3],v[4],v[5]),fenceMaterial);rail.position.set(v[0],v[1],v[2]);playground.add(rail)})
    const netMaterial=new THREE.LineBasicMaterial({color:'#d7d5ff',transparent:true,opacity:.5})
    const addNetPanel=(x:number,y:number,z:number,length:number,height:number,axis:'x'|'z')=>{const positions:number[]=[]
      for(let offset=-length*.5;offset<=length*.5+.01;offset+=.55){if(axis==='x')positions.push(x+offset,y,z,x+offset,y+height,z);else positions.push(x,y,z+offset,x,y+height,z+offset)}
      for(let offset=0;offset<=height+.01;offset+=.45){if(axis==='x')positions.push(x-length*.5,y+offset,z,x+length*.5,y+offset,z);else positions.push(x,y+offset,z-length*.5,x,y+offset,z+length*.5)}
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));playground.add(new THREE.LineSegments(geometry,netMaterial))}
    addNetPanel(0,.55,-12.48,35.5,1.1,'x');addNetPanel(0,.55,12.48,35.5,1.1,'x');addNetPanel(-18.48,.55,0,23.5,1.1,'z');addNetPanel(18.48,.55,0,23.5,1.1,'z')
    addNetPanel(BALL_PIT.x,.78,BALL_PIT.z-BALL_PIT.depth*.5,BALL_PIT.width,1.05,'x');addNetPanel(BALL_PIT.x-BALL_PIT.width*.5,.78,BALL_PIT.z,BALL_PIT.depth,1.05,'z')

    const bumperPalette=['#426fbd','#7457b8','#e57061','#eaa644'],bumperMaterials=bumperPalette.map(color=>new THREE.MeshStandardMaterial({color,roughness:.6}))
    const horizontalBumpers:{x:number;z:number;material:number}[]=[],verticalBumpers:{x:number;z:number;material:number}[]=[]
    for(let x=-17.2,index=0;x<=17.2;x+=2.15,index++)for(const z of [-12.18,12.18])horizontalBumpers.push({x,z,material:index%bumperMaterials.length})
    for(let z=-10.4,index=0;z<=10.4;z+=2.08,index++)for(const x of [-18.18,18.18])verticalBumpers.push({x,z,material:(index+2)%bumperMaterials.length})
    const addBumperInstances=(items:typeof horizontalBumpers,geometry:THREE.BufferGeometry)=>{
      bumperMaterials.forEach((material,materialIndex)=>{const matching=items.filter(item=>item.material===materialIndex);if(!matching.length)return;const mesh=new THREE.InstancedMesh(geometry,material,matching.length),matrix=new THREE.Object3D();matching.forEach((item,index)=>{matrix.position.set(item.x,.31,item.z);matrix.updateMatrix();mesh.setMatrixAt(index,matrix.matrix)});mesh.instanceMatrix.needsUpdate=true;playground.add(mesh)})
    }
    addBumperInstances(horizontalBumpers,new THREE.BoxGeometry(2.02,.62,.42));addBumperInstances(verticalBumpers,new THREE.BoxGeometry(.42,.62,1.96))

    const roomFloor=new THREE.Mesh(new THREE.BoxGeometry(52,.18,38),new THREE.MeshBasicMaterial({color:'#815a57'}));roomFloor.position.y=-.62;scene.add(roomFloor)
    const roomPlanks=new THREE.GridHelper(50,40,'#c98b77','#9b675f');roomPlanks.position.y=-.515;(roomPlanks.material as THREE.Material).transparent=true;(roomPlanks.material as THREE.Material).opacity=.3;scene.add(roomPlanks)
    const wallMaterial=new THREE.MeshStandardMaterial({color:'#344273',roughness:.82}),backWall=new THREE.Mesh(new THREE.BoxGeometry(46,11,.42),wallMaterial);backWall.position.set(0,4.55,-16.2);scene.add(backWall)
    const sideWall=new THREE.Mesh(new THREE.BoxGeometry(.42,11,35),new THREE.MeshStandardMaterial({color:'#293962',roughness:.84}));sideWall.position.set(22.8,4.55,0);scene.add(sideWall)
    const wainscot=new THREE.Mesh(new THREE.BoxGeometry(46,1.4,.5),new THREE.MeshStandardMaterial({color:'#6f4c72',roughness:.72}));wainscot.position.set(0,.2,-15.92);scene.add(wainscot)
    const verticalWindowFrames:{x:number;y:number}[]=[],horizontalWindowFrames:{x:number;y:number}[]=[]
    for(let x=-15;x<=15;x+=6){
      const warm=x%12===0,windowGlow=new THREE.Mesh(new THREE.PlaneGeometry(4.65,4.7),new THREE.MeshBasicMaterial({color:warm?'#f7ad6b':'#7766aa',toneMapped:false}));windowGlow.position.set(x,5.1,-15.96);scene.add(windowGlow)
      ;[-2.38,0,2.38].forEach(offset=>verticalWindowFrames.push({x:x+offset,y:5.1}))
      ;[-1.25,1.25].forEach(offset=>horizontalWindowFrames.push({x,y:5.1+offset}))
    }
    const addWindowFrameInstances=(positions:{x:number;y:number}[],geometry:THREE.BufferGeometry)=>{const mesh=new THREE.InstancedMesh(geometry,fenceMaterial,positions.length),matrix=new THREE.Object3D();positions.forEach((position,index)=>{matrix.position.set(position.x,position.y,-15.72);matrix.updateMatrix();mesh.setMatrixAt(index,matrix.matrix)});mesh.instanceMatrix.needsUpdate=true;scene.add(mesh)}
    addWindowFrameInstances(verticalWindowFrames,new THREE.BoxGeometry(.16,5.05,.22));addWindowFrameInstances(horizontalWindowFrames,new THREE.BoxGeometry(4.85,.16,.22))
    const lampShadeMaterial=new THREE.MeshStandardMaterial({color:'#eaa13f',emissive:'#ffcf73',emissiveIntensity:.2,roughness:.44,side:THREE.DoubleSide})
    ;[[-12,-11.2,'#4fbcce'],[-4,-13,'#eaa13f'],[5,-12.5,'#de6e62'],[13,-10.8,'#4fbcce']].forEach(([x,z,color])=>{const wire=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,2.3,8),fenceMaterial);wire.position.set(x as number,8.7,z as number);scene.add(wire);const shadeMaterial=lampShadeMaterial.clone();shadeMaterial.color.set(color as string);shadeMaterial.emissive.set(color as string);shadeMaterial.emissiveIntensity=.34;const shade=new THREE.Mesh(new THREE.CylinderGeometry(.26,.72,.58,16,1,true),shadeMaterial);shade.position.set(x as number,7.38,z as number);scene.add(shade)})
    const addCafeTable=(x:number,z:number)=>{const top=new THREE.Mesh(new THREE.CylinderGeometry(1.05,1.05,.16,24),new THREE.MeshStandardMaterial({color:'#9c694d',roughness:.7}));top.position.set(x,.82,z);scene.add(top);const leg=new THREE.Mesh(new THREE.CylinderGeometry(.12,.22,.8,14),fenceMaterial);leg.position.set(x,.38,z);scene.add(leg);for(const offset of [-1.45,1.45]){const chair=new THREE.Mesh(new THREE.BoxGeometry(.72,.14,.72),new THREE.MeshStandardMaterial({color:offset<0?'#4c9e79':'#d16955',roughness:.7}));chair.position.set(x+offset,.48,z);scene.add(chair);const back=chair.clone();back.geometry=new THREE.BoxGeometry(.72,.85,.14);back.position.set(x+offset,.88,z+(offset<0?-.3:.3));scene.add(back)}}
    addCafeTable(-14.5,-14.1);addCafeTable(14.5,-14.1)
    ;[-9.5,9.5].forEach(x=>{const pot=new THREE.Mesh(new THREE.CylinderGeometry(.42,.3,.7,18),new THREE.MeshStandardMaterial({color:'#d56e50',roughness:.72}));pot.position.set(x,.35,-14.1);scene.add(pot);for(let leaf=0;leaf<5;leaf++){const frond=new THREE.Mesh(new THREE.SphereGeometry(.44,14,9),new THREE.MeshStandardMaterial({color:leaf%2?'#65a955':'#4b8d52',roughness:.74}));frond.scale.set(.55,1.1,.36);frond.rotation.z=(leaf-2)*.38;frond.position.set(x+(leaf-2)*.14,1.05+Math.abs(leaf-2)*.06,-14.1);scene.add(frond)}})

    const pathCells=[[-17,2],[-16,2],[-15,2],[-14,2],[-13,2],[-12,2],[-11,2],[-10,2],[-9,2],[-8,2],[-7,2],[-6,2],[-5,2],[-4,2],[-3,2],[-2,2],[-1,2],[0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[8,2],[9,2],[10,2],[11,2],[12,2],[13,2],[14,2],[15,2],[16,2],[17,2]]
    const pathMat=new THREE.MeshStandardMaterial({color:'#2389b7',emissive:'#19cde8',emissiveIntensity:.32,roughness:.58})
    const visiblePathCells=pathCells.filter(([x,z])=>!WALLS.has(`${x},${z}`)),pathTileIndices=new Map<string,number>(),pathTileMatrix=new THREE.Object3D()
    const pathTiles=new THREE.InstancedMesh(new THREE.BoxGeometry(.94,.08,.94),pathMat,visiblePathCells.length)
    visiblePathCells.forEach(([x,z],index)=>{pathTileMatrix.position.set(x,.055,z);pathTileMatrix.scale.setScalar(1);pathTileMatrix.updateMatrix();pathTiles.setMatrixAt(index,pathTileMatrix.matrix);pathTileIndices.set(`${x},${z}`,index)});pathTiles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(pathTiles)
    const setPathTileVisible=(cell:string,visible:boolean)=>{const index=pathTileIndices.get(cell);if(index===undefined)return;const [x,z]=cell.split(',').map(Number);pathTileMatrix.position.set(x,.055,z);pathTileMatrix.scale.setScalar(visible?1:0);pathTileMatrix.updateMatrix();pathTiles.setMatrixAt(index,pathTileMatrix.matrix);pathTiles.instanceMatrix.needsUpdate=true}

    const edgeMat=new THREE.MeshStandardMaterial({color:'#3b345d',roughness:.68})
    ;[[0,.15,-HALF_Z-.72,ARENA_X+1,.48,.28],[0,.15,HALF_Z+.72,ARENA_X+1,.48,.28],[-HALF_X-.72,.15,0,.28,.48,ARENA_Z+1],[HALF_X+.72,.15,0,.28,.48,ARENA_Z+1]].forEach(v=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(v[3],v[4],v[5]),edgeMat);mesh.position.set(v[0],v[1],v[2]);mesh.castShadow=true;scene.add(mesh)})

    const colors=['#eea142','#38c7bd','#7b65d4','#ec5964'],wallViews=new Map<string,{index:number;colorIndex:number}>(),debris:Debris[]=[]
    const wallCapacity=512,wallHeight=GAME_BALANCE.OBSTACLE_TOP_Y-.11,wallMatrix=new THREE.Object3D(),freeWallInstances:number[]=[]
    let nextWallInstance=0
    const wallBlocks=new THREE.InstancedMesh(new THREE.BoxGeometry(.9,wallHeight,.9),new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.68}),wallCapacity)
    const wallStuds=new THREE.InstancedMesh(new THREE.CylinderGeometry(.18,.18,.11,12),new THREE.MeshStandardMaterial({color:'#ffe9bd',roughness:.5}),wallCapacity)
    wallBlocks.count=0;wallStuds.count=0;wallBlocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);wallStuds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(wallBlocks,wallStuds)
    const hideWallInstance=(index:number)=>{wallMatrix.position.set(0,-20,0);wallMatrix.scale.setScalar(0);wallMatrix.updateMatrix();wallBlocks.setMatrixAt(index,wallMatrix.matrix);wallStuds.setMatrixAt(index,wallMatrix.matrix);wallBlocks.instanceMatrix.needsUpdate=true;wallStuds.instanceMatrix.needsUpdate=true}
    const debrisMaterials=colors.map(color=>new THREE.MeshStandardMaterial({color,roughness:.68}))
    const createWallView=(cell:string,index:number)=>{
      if(wallViews.has(cell))return
      const instance=freeWallInstances.pop()??nextWallInstance++;if(instance>=wallCapacity)return
      const [x,z]=cell.split(',').map(Number),terrain=terrainHeightAt(x,z),colorIndex=index%colors.length
      wallMatrix.scale.setScalar(1);wallMatrix.position.set(x,terrain+wallHeight*.5,z);wallMatrix.updateMatrix();wallBlocks.setMatrixAt(instance,wallMatrix.matrix);wallBlocks.setColorAt(instance,new THREE.Color(colors[colorIndex]))
      wallMatrix.position.set(x,terrain+wallHeight+.055,z);wallMatrix.updateMatrix();wallStuds.setMatrixAt(instance,wallMatrix.matrix)
      wallBlocks.count=Math.max(wallBlocks.count,instance+1);wallStuds.count=Math.max(wallStuds.count,instance+1);wallBlocks.instanceMatrix.needsUpdate=true;wallStuds.instanceMatrix.needsUpdate=true;if(wallBlocks.instanceColor)wallBlocks.instanceColor.needsUpdate=true
      wallViews.set(cell,{index:instance,colorIndex})
    }
    Array.from(WALLS).forEach(createWallView)
    const destroyWallView=(cell:string,withDebris=true)=>{
      const view=wallViews.get(cell);if(!view)return
      wallViews.delete(cell);arenaState.walls.delete(cell);hideWallInstance(view.index);freeWallInstances.push(view.index)
      if(withDebris){
        const [x,z]=cell.split(',').map(Number),material=debrisMaterials[view.colorIndex]
        for(let index=0;index<9;index++){
          const mesh=new THREE.Mesh(new THREE.BoxGeometry(.2+index%3*.045,.2,.2),material)
          mesh.position.set(x+(index%3-1)*.18,.35+Math.floor(index/3)*.2,z+((index*2)%3-1)*.15);mesh.castShadow=true;scene.add(mesh)
          debris.push({mesh,velocity:new THREE.Vector3((index%3-1)*(1.5+Math.random()),2.3+Math.random()*1.8,((index*5)%3-1)*(1.4+Math.random())),spin:new THREE.Vector3(Math.random()*7,Math.random()*7,Math.random()*7),born:performance.now()})
        }
      }
    }
    const syncWallViews=(activeWalls:string[])=>{
      const active=new Set(activeWalls)
      for(const cell of [...wallViews.keys()])if(!active.has(cell))destroyWallView(cell,false)
      arenaState.walls.clear();activeWalls.forEach((cell,index)=>{arenaState.walls.add(cell);createWallView(cell,index)})
    }
    type HoleEdges={north:THREE.Group;south:THREE.Group;west:THREE.Group;east:THREE.Group}
    const holeViews=new Map<string,{group:THREE.Group;edges:HoleEdges}>(),holes=new Set<string>()
    const holeRimMat=new THREE.MeshStandardMaterial({color:'#5e3049',emissive:'#180914',roughness:.84})
    const holeShaftMat=new THREE.MeshStandardMaterial({color:'#35233f',emissive:'#170d21',emissiveIntensity:.55,roughness:.9,side:THREE.DoubleSide})
    const createHoleEdge=(horizontal:boolean,offset:number)=>{
      const edge=new THREE.Group()
      const rim=new THREE.Mesh(new THREE.BoxGeometry(horizontal?.98:.07,.07,horizontal?.07:.98),holeRimMat);rim.position.set(horizontal?0:offset,.02,horizontal?offset:0);edge.add(rim)
      const shaft=new THREE.Mesh(new THREE.BoxGeometry(horizontal?.9:.055,3.3,horizontal?.055:.9),holeShaftMat);shaft.position.set(horizontal?0:offset,-1.65,horizontal?offset:0);edge.add(shaft)
      return edge
    }
    const updateHoleConnections=()=>{
      for(const [cell,view] of holeViews){const [x,z]=cell.split(',').map(Number);view.edges.north.visible=!holes.has(`${x},${z-1}`);view.edges.south.visible=!holes.has(`${x},${z+1}`);view.edges.west.visible=!holes.has(`${x-1},${z}`);view.edges.east.visible=!holes.has(`${x+1},${z}`)}
    }
    const addHoleView=(cell:string)=>{
      if(holeViews.has(cell))return
      const [x,z]=cell.split(',').map(Number),group=new THREE.Group()
      setFloorCellVisible(cell,false);setPathTileVisible(cell,false)
      const edges:HoleEdges={north:createHoleEdge(true,-.455),south:createHoleEdge(true,.455),west:createHoleEdge(false,-.455),east:createHoleEdge(false,.455)}
      Object.values(edges).forEach(edge=>group.add(edge));group.position.set(x,0,z);scene.add(group);holeViews.set(cell,{group,edges});holes.add(cell);updateHoleConnections()
    }
    const syncHoleViews=(activeHoles:string[])=>{
      const active=new Set(activeHoles)
      for(const [cell,view] of holeViews)if(!active.has(cell)){scene.remove(view.group);holeViews.delete(cell);holes.delete(cell);setFloorCellVisible(cell,true);setPathTileVisible(cell,true)}
      activeHoles.forEach(addHoleView)
      updateHoleConnections()
    }
    const itemViews=new Map<string,ItemView>()
    const itemColors:Record<ItemKind,string>={KICK:'#39dfff',THROW:'#ff6a54',CAPACITY:'#b7ee36',PIERCE:'#dc58ff'}
    const itemTextureLoader=new THREE.TextureLoader(),itemIconTextures={} as Record<ItemKind,THREE.Texture>
    ;(Object.keys(ITEM_ICON_PATHS) as ItemKind[]).forEach(kind=>{const texture=itemTextureLoader.load(ITEM_ICON_PATHS[kind]);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());itemIconTextures[kind]=texture})
    const addItemView=(id:string,kind:ItemKind,x:number,z:number)=>{
      if(itemViews.has(id))return itemViews.get(id)!
      const group=new THREE.Group()
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.38,.035,8,28),new THREE.MeshBasicMaterial({color:itemColors[kind],transparent:true,opacity:.72,toneMapped:false}));ring.rotation.x=Math.PI/2;ring.position.y=.08;group.add(ring)
      const icon=new THREE.Sprite(new THREE.SpriteMaterial({map:itemIconTextures[kind],transparent:true,alphaTest:.025,depthWrite:false,toneMapped:false}));icon.position.y=.62;icon.scale.setScalar(1.08);icon.renderOrder=5;group.add(icon)
      const baseY=terrainHeightAt(x,z);group.position.set(x,baseY,z);scene.add(group);const view={id,kind,x,z,baseY,group,icon};itemViews.set(id,view);return view
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
    const fanBase=new THREE.Mesh(new THREE.CylinderGeometry(.72,.9,.25,24),edgeMat);fanBase.position.set(20.5,.1,-7);scene.add(fanBase)
    const fanPole=new THREE.Mesh(new THREE.CylinderGeometry(.12,.16,2.7,16),edgeMat);fanPole.position.set(20.5,1.45,-7);scene.add(fanPole)
    const fanRing=new THREE.Mesh(new THREE.TorusGeometry(1.28,.12,12,36),new THREE.MeshStandardMaterial({color:'#7e8fb6',metalness:.22,roughness:.46}));fanRing.position.set(20.5,2.85,-7);fanRing.rotation.y=Math.PI/2;scene.add(fanRing)
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
    const sleeperCount=29,sleepers=new THREE.InstancedMesh(new THREE.BoxGeometry(.08,.045,.8),edgeMat,sleeperCount),sleeperMatrix=new THREE.Object3D()
    for(let index=0;index<sleeperCount;index++){sleeperMatrix.position.set(index-14,.035,1);sleeperMatrix.updateMatrix();sleepers.setMatrixAt(index,sleeperMatrix.matrix)}sleepers.instanceMatrix.needsUpdate=true;scene.add(sleepers)
    const toyVehicle=new THREE.Group()
    const vehicleBody=new THREE.Mesh(new THREE.BoxGeometry(1.05,.38,.72),new THREE.MeshStandardMaterial({color:'#ff9d3e',roughness:.48}));vehicleBody.position.y=.32;vehicleBody.castShadow=true;toyVehicle.add(vehicleBody)
    const vehicleCab=new THREE.Mesh(new THREE.BoxGeometry(.45,.38,.62),new THREE.MeshStandardMaterial({color:'#47cad1',roughness:.42}));vehicleCab.position.set(-.18,.65,0);toyVehicle.add(vehicleCab)
    for(const x of [-.34,.34])for(const z of [-.38,.38]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,.08,16),new THREE.MeshStandardMaterial({color:'#302b4a',roughness:.68}));wheel.rotation.x=Math.PI/2;wheel.position.set(x,.15,z);toyVehicle.add(wheel)}
    toyVehicle.position.set(-9,0,1);toyVehicle.visible=false;scene.add(toyVehicle)

    const shadowGeo=new THREE.CircleGeometry(.52,28)
    const shadowMat=new THREE.MeshBasicMaterial({color:'#281632',transparent:true,opacity:.42,depthWrite:false})
    const createActor=(id:string,name:string,team:Team,isPlayer:boolean,variant:RippleVariant,x:number,z:number,scale=1):Actor=>{
      const {group:model,materials,rig}=createRippleModel(variant),yaw=team==='cyan'?Math.PI/2:-Math.PI/2,spawnY=terrainHeightAt(x,z)
      model.position.set(x,spawnY,z);model.rotation.y=yaw;model.scale.multiplyScalar(scale);scene.add(model)
      const shadow=new THREE.Mesh(shadowGeo,shadowMat);shadow.rotation.x=-Math.PI/2;shadow.position.set(x,.025,z);scene.add(shadow)
      const rescueRing=new THREE.Mesh(new THREE.TorusGeometry(.56,.055,10,32),new THREE.MeshBasicMaterial({color:team==='cyan'?'#68efff':'#ff7884',transparent:true,opacity:.85,depthWrite:false,toneMapped:false}))
      rescueRing.rotation.x=-Math.PI/2;rescueRing.position.set(x,.12,z);rescueRing.visible=false;scene.add(rescueRing)
       return{id,name,team,isPlayer,model,rig,materials,shadow,rescueRing,baseScale:model.scale.x,x,z,serverX:x,serverZ:z,renderX:x,renderZ:z,targetX:x,targetZ:z,lastRenderX:x,lastRenderZ:z,walkPhase:0,walkBlend:0,wasAirborne:false,landingBlend:0,gesture:null,gestureStarted:0,tauntReady:0,tauntServerStartedAt:0,yaw,targetYaw:yaw,hits:0,bombCapacity:GAME_BALANCE.CORE_CAPACITY,canKick:false,canThrow:false,kickLevel:0,throwLevel:0,pierceCharges:0,jumpY:spawnY,jumpHeight:GAME_BALANCE.JUMP_HEIGHT,jumpReady:0,jumpStarted:0,jumpUntil:0,jumpBaseY:spawnY,buildReady:0,falling:false,fallVelocity:0,lockedUntil:0,downedUntil:0,eliminated:false,dashReady:0}
    }
    const [spawnBloo,spawnLumi,spawnCoral,spawnVio]=GIANT_PLAYROOM.spawnPoints
    const player=createActor(selectedVariant,selectedVariant.toUpperCase(),'cyan',true,selectedVariant,spawnBloo.x,spawnBloo.z,1.04)
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
    let controlled=player,cameraTarget=player,cameraYaw=player.yaw,localNetworkId='',inputSequence=0,networkRemaining:number=GAME_BALANCE.MATCH_SECONDS,networkCountdown:number=GAME_BALANCE.COUNTDOWN_SECONDS,networkHumanCount=0
    let pendingInputs:Array<{seq:number;dx:number;dz:number;dt:number}>=[]
    const networkClient=networkSession?new NetworkClient():null
    if(debug&&!networkClient)ACTIVE_ITEM_KINDS.forEach((kind,index)=>addItemView(`debug-${kind}`,kind,player.x+(index-1)*1.4,player.z+2.2))
    networkClientRef.current=networkClient

    const keys=new Set<string>(),cores:Core[]=[]
    const coreShellGeo=new THREE.SphereGeometry(CORE_VISUAL_RADIUS,32,22)
    const coreNucleusGeo=new THREE.IcosahedronGeometry(CORE_VISUAL_RADIUS*.31,2)
    const coreHaloGeo=new THREE.SphereGeometry(CORE_VISUAL_RADIUS*.53,24,16)
    const coreEnergyRingGeo=new THREE.TorusGeometry(CORE_VISUAL_RADIUS*.67,CORE_VISUAL_RADIUS*.065,8,42,Math.PI*1.42)
    const coreSparkGeo=new THREE.TetrahedronGeometry(CORE_VISUAL_RADIUS*.07,0)
    const coreShellVertex=`
      varying vec3 vNormalView;
      varying vec3 vViewDirection;
      varying vec3 vLocalPosition;
      void main(){
        vec4 viewPosition=modelViewMatrix*vec4(position,1.0);
        vNormalView=normalize(normalMatrix*normal);
        vViewDirection=normalize(-viewPosition.xyz);
        vLocalPosition=position;
        gl_Position=projectionMatrix*viewPosition;
      }
    `
    const coreShellFragment=`
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uUrgency;
      varying vec3 vNormalView;
      varying vec3 vViewDirection;
      varying vec3 vLocalPosition;
      void main(){
        float fresnel=pow(1.0-abs(dot(normalize(vNormalView),normalize(vViewDirection))),2.15);
        float current=.5+.5*sin(vLocalPosition.y*17.0+vLocalPosition.x*9.0-uTime*3.4);
        float arc=pow(max(0.0,current),3.0)*fresnel;
        float alpha=.035+fresnel*.34+arc*(.08+uUrgency*.1);
        vec3 color=uColor*(.78+fresnel*.72+uUrgency*.18);
        gl_FragColor=vec4(color,alpha);
      }
    `
    const burstPulseGeometry=new THREE.SphereGeometry(.4,20,14),burstCoreGeometry=new THREE.IcosahedronGeometry(.13,2),burstRibbonGeometry=new THREE.CylinderGeometry(.26,.15,1,14,16,false),burstBeamCoreGeometry=new THREE.CylinderGeometry(.018,.028,1,10,6,false),burstRingGeometry=new THREE.TorusGeometry(.44,.06,8,24),burstShockGeometry=new THREE.SphereGeometry(.76,22,16),burstShardGeometry=new THREE.TetrahedronGeometry(.13,0)
    const burstNoiseGLSL=`
      float hash31(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
      float noise3(vec3 p){
        vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(mix(hash31(i+vec3(0,0,0)),hash31(i+vec3(1,0,0)),f.x),mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      float fbm3(vec3 p){float value=0.0,amp=.5;for(int i=0;i<3;i++){value+=noise3(p)*amp;p=p*2.03+vec3(13.1,7.7,5.3);amp*=.5;}return value;}
    `
    const burstBeamVertexShader=`
      uniform float uTime;
      varying float vTravel;
      varying float vAngle;
      varying float vFacing;
      varying float vSurface;
      ${burstNoiseGLSL}
      void main(){
        vec3 transformed=position;
        float angle=atan(position.z,position.x),travel=position.y+.5;
        float surface=fbm3(vec3(cos(angle)*1.75,sin(angle)*1.75,travel*4.2-uTime*2.35));
        float breath=sin((travel*2.4-uTime*2.1)*6.2831853)*.035;
        transformed.xz*=1.0+(surface-.5)*.38+breath;
        vec4 localPosition=vec4(transformed,1.0);mat3 instanceNormal=mat3(1.0);
        #ifdef USE_INSTANCING
          localPosition=instanceMatrix*localPosition;instanceNormal=mat3(instanceMatrix);
        #endif
        vec4 worldPosition=modelMatrix*localPosition;
        vec3 worldNormal=normalize(mat3(modelMatrix)*instanceNormal*normal);
        vTravel=travel;vAngle=angle;vSurface=surface;vFacing=abs(dot(normalize(cameraPosition-worldPosition.xyz),worldNormal));
        gl_Position=projectionMatrix*viewMatrix*worldPosition;
      }
    `
    const burstBeamFragmentShader=`
      uniform vec3 uColorOuter;
      uniform vec3 uColorInner;
      uniform float uTime;
      uniform float uOpacity;
      uniform float uPass;
      varying float vTravel;
      varying float vAngle;
      varying float vFacing;
      varying float vSurface;
      ${burstNoiseGLSL}
      void main(){
        float stream=fbm3(vec3(vTravel*7.4-uTime*6.2,cos(vAngle)*2.25,sin(vAngle)*2.25));
        float holes=fbm3(vec3(vTravel*4.3-uTime*3.5+17.0,cos(vAngle)*3.1,sin(vAngle)*3.1));
        float streak=pow(1.0-abs(stream*2.0-1.0),3.2);
        float rim=pow(1.0-clamp(vFacing,0.0,1.0),2.15);
        float endSoft=smoothstep(0.0,.045,vTravel)*(1.0-smoothstep(.94,1.0,vTravel));
        float broken=smoothstep(.34,.62,holes+streak*.22+vSurface*.1);
        vec3 color;float alpha;
        if(uPass>1.5){color=mix(uColorOuter,uColorInner,streak*.18);alpha=uOpacity*endSoft*rim*(.42+streak*.28);}
        else{color=mix(uColorOuter,uColorInner,clamp(rim*.18+streak*.48,0.0,1.0));alpha=uOpacity*endSoft*broken*(.12+rim*.44+streak*.28);}
        if(alpha<.012)discard;
        gl_FragColor=vec4(color,alpha);
      }
    `
    const createBurstBeamMaterial=(pass:number)=>new THREE.ShaderMaterial({uniforms:{uColorOuter:{value:new THREE.Color('#008eb9')},uColorInner:{value:new THREE.Color('#69f2fa')},uTime:{value:0},uOpacity:{value:0},uPass:{value:pass}},vertexShader:burstBeamVertexShader,fragmentShader:burstBeamFragmentShader,transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,blending:pass===1?THREE.NormalBlending:THREE.AdditiveBlending,toneMapped:false})
    const burstFlameTexture=new THREE.TextureLoader().load('/assets/vfx/energy-flame-wisp-v1.png');burstFlameTexture.colorSpace=THREE.SRGBColorSpace
    const bursts:Burst[]=Array.from({length:20},()=>{
      const group=new THREE.Group(),material=new THREE.MeshBasicMaterial({color:'#16c9ee',transparent:true,opacity:0,depthWrite:false,toneMapped:false}),coreMaterial=new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}),beamMaterial=createBurstBeamMaterial(1),beamHaloMaterial=createBurstBeamMaterial(2),beamCoreMaterial=new THREE.MeshBasicMaterial({color:'#d8ffff',transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false})
      const flamePositions=new Float32Array(128*3),flameSeeds=new Float32Array(128),flameGeometry=new THREE.BufferGeometry(),flamePositionAttribute=new THREE.BufferAttribute(flamePositions,3)
      for(let index=0;index<flameSeeds.length;index++)flameSeeds[index]=Math.abs(Math.sin((index+1)*12.9898)*43758.5453)%1
      flamePositionAttribute.setUsage(THREE.DynamicDrawUsage);flameGeometry.setAttribute('position',flamePositionAttribute);flameGeometry.setAttribute('aSeed',new THREE.BufferAttribute(flameSeeds,1));flameGeometry.setDrawRange(0,0)
      const flameMaterial=new THREE.ShaderMaterial({
        uniforms:{uColor:{value:new THREE.Color('#11d6e8')},uOpacity:{value:0},uTime:{value:0},uFlameMap:{value:burstFlameTexture}},
        vertexShader:`
          attribute float aSeed;uniform float uOpacity;uniform float uTime;varying float vSeed;
          void main(){
            vSeed=aSeed;vec4 mvPosition=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mvPosition;
            float pulse=.78+.22*sin(uTime*(7.0+aSeed*4.0)+aSeed*31.0);
            gl_PointSize=(.9+aSeed*.8)*pulse*(280.0/max(1.0,-mvPosition.z));
          }
        `,
        fragmentShader:`
          uniform vec3 uColor;uniform float uOpacity;uniform sampler2D uFlameMap;varying float vSeed;
          void main(){
            vec2 uv=gl_PointCoord;if(vSeed>.5)uv.x=1.0-uv.x;
            vec4 flame=texture2D(uFlameMap,uv);float alpha=flame.a*uOpacity;if(alpha<.025)discard;
            vec3 hot=mix(uColor,vec3(1.0),flame.r*.2);gl_FragColor=vec4(hot,alpha);
          }
        `,
        transparent:true,depthWrite:false,depthTest:true,blending:THREE.NormalBlending,toneMapped:false,
      })
      const flamePoints=new THREE.Points(flameGeometry,flameMaterial);flamePoints.frustumCulled=false;flamePoints.renderOrder=7
      const shockMaterial=new THREE.MeshBasicMaterial({color:'#28e6ff',transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,toneMapped:false})
      const pulses=new THREE.InstancedMesh(burstPulseGeometry,material,1),cores=new THREE.InstancedMesh(burstCoreGeometry,coreMaterial,1),beamHalos=new THREE.InstancedMesh(burstRibbonGeometry,beamHaloMaterial,12),ribbons=new THREE.InstancedMesh(burstRibbonGeometry,beamMaterial,12),beamCores=new THREE.InstancedMesh(burstBeamCoreGeometry,beamCoreMaterial,12),rings=new THREE.InstancedMesh(burstRingGeometry,material,1),shards=new THREE.InstancedMesh(burstShardGeometry,coreMaterial,36),shock=new THREE.Mesh(burstShockGeometry,shockMaterial),light=new THREE.PointLight('#28e6ff',0,8)
      pulses.count=0;cores.count=0;beamHalos.count=0;ribbons.count=0;beamCores.count=0;rings.count=0;shards.count=36;[pulses,cores,beamHalos,ribbons,beamCores,rings,shards].forEach(mesh=>{mesh.frustumCulled=false;mesh.renderOrder=6});beamHalos.renderOrder=5;beamCores.renderOrder=7;shock.position.y=.42;shock.renderOrder=5;light.position.y=.55;group.add(beamHalos,ribbons,beamCores,flamePoints,pulses,cores,rings,shards,shock,light);group.visible=false;scene.add(group)
      return{group,born:0,material,coreMaterial,beamMaterial,beamHaloMaterial,beamCoreMaterial,flameMaterial,flamePoints,flamePositions,flameSeeds,pulses,cores,beamHalos,ribbons,beamCores,rings,shards,shock,light,cells:[],beams:[],active:false}
    })
    const burstMatrix=new THREE.Object3D(),burstUpAxis=new THREE.Vector3(0,1,0),burstDirection=new THREE.Vector3()
    let coreId=0,localItemId=0,last=performance.now(),acc=0,elapsed=0,lastUi=0,lastPlace=0,chainBest=0,ended=false,shake=0,lastFanPush=0
    const localHazardHits=new Map<string,number>()
    const localCoreHazardHits=new Map<number,number>()
    const countdownEnds=last+GAME_BALANCE.COUNTDOWN_SECONDS*1000;let lastPresentedCountdown:number=GAME_BALANCE.COUNTDOWN_SECONDS
    let networkRtt=0,snapshotCount=0,snapshotWindow=performance.now(),packetRate=0
    const botPlace=new Map<string,number>(bots.map((actor,index)=>[actor.id,index*620]))
    let fanState:'CALM'|'WARNING'|'ACTIVE'='CALM',vehicleActive=false,vehicleX=-9,lastVehicleCell=-99
    let facing={x:1,z:0}
    const say=(message:string)=>setUi(v=>({...v,message}))
    const finishLocalRound=(winner:Team|'draw')=>{
      if(networkClient||ended)return
      ended=true
      const current=seriesRef.current,scores={...current.scores}
      if(winner!=='draw')scores[winner]++
      const seriesWinner=winner!=='draw'&&scores[winner]>=GAME_BALANCE.SERIES_WINS?winner:null
      const next:SeriesState={round:current.round,scores,winner:seriesWinner};seriesRef.current=next;setSeries(next)
      setResult(winner==='draw'?'draw':winner===controlled.team?'win':'lose')
      if(seriesWinner===controlled.team)recordAchievementEvent({type:'SERIES_WON'})
      if(seriesWinner)return
      roundAdvanceTimerRef.current=window.setTimeout(()=>{
        const active=seriesRef.current,nextRound:SeriesState={...active,round:winner==='draw'?active.round:Math.min(3,active.round+1)}
        seriesRef.current=nextRound;setSeries(nextRound);setResult(null);setUi(value=>({...initialUi(),localTeam:value.localTeam,message:winner==='draw'?`ROUND ${active.round} 재시작 · 이번에는 승부를 내세요`:`ROUND ${nextRound.round} · 먼저 2승을 확보하세요`}));setRound(value=>value+1);roundAdvanceTimerRef.current=undefined
      },GAME_BALANCE.ROUND_BREAK_MS)
    }
    const triggerGesture=(actor:Actor,gesture:RippleGestureKind,now=performance.now())=>{actor.gesture=gesture;actor.gestureStarted=now;if(gesture!=='taunt')actor.tauntServerStartedAt=0}
    const cancelTaunt=(actor:Actor)=>{if(actor.gesture==='taunt'){actor.gesture=null;actor.tauntServerStartedAt=0}}
    const faceDirection=(actor:Actor,dx:number,dz:number)=>{if(Math.hypot(dx,dz)>.01)actor.targetYaw=Math.atan2(dx,dz)}
    const canLocalControl=()=>!controlled.eliminated&&!controlled.falling&&!controlled.downedUntil
    const keepCameraOnTarget=()=>{
      if(!controlled.eliminated){
        if(cameraTarget!==controlled)cameraTarget=controlled
        return
      }
      const candidates=actors.filter(actor=>actor.id!==controlled.id)
      if(candidates.length===0){cameraTarget=controlled;return}
      if(!cameraTarget||cameraTarget.eliminated||cameraTarget===controlled||!candidates.includes(cameraTarget))cameraTarget=candidates[0]
    }
    const cycleCameraTarget=(step:number)=>{
      if(!controlled.eliminated)return
      const candidates=actors.filter(actor=>actor.id!==controlled.id)
      if(!candidates.length){say('추적 가능한 다른 플레이어가 없습니다');return}
      if(!cameraTarget||cameraTarget.eliminated||cameraTarget===controlled||!candidates.includes(cameraTarget))cameraTarget=candidates[0]
      const index=candidates.indexOf(cameraTarget)
      const next=candidates[(index+step+candidates.length)%candidates.length]
      if(next===cameraTarget)return
      cameraTarget=next
      cameraYaw=next.yaw
      say(`카메라 추적 대상: ${next.name}`)
    }
    const setActorDownedVisual=(actor:Actor,downed:boolean)=>{actor.materials.forEach(material=>{if(material.transparent!==downed){material.transparent=downed;material.needsUpdate=true}material.opacity=downed ? .46 : 1;material.depthWrite=!downed});actor.model.scale.setScalar(actor.baseScale*(downed ? .72 : 1))}
    const setActorVariant=(actor:Actor,variant:RippleVariant)=>{
      if(actor.rig.variant===variant)return
      const previous=actor.model,{group:model,materials,rig}=createRippleModel(variant)
      model.position.copy(previous.position);model.rotation.copy(previous.rotation);model.scale.setScalar(actor.baseScale);model.visible=previous.visible;scene.add(model);scene.remove(previous)
      const geometries=new Set<THREE.BufferGeometry>(),oldMaterials=new Set<THREE.Material>()
      previous.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);const material=object.material;if(Array.isArray(material))material.forEach(item=>oldMaterials.add(item));else oldMaterials.add(material)}})
      geometries.forEach(geometry=>geometry.dispose());oldMaterials.forEach(material=>material.dispose())
      actor.model=model;actor.materials=materials;actor.rig=rig;setActorDownedVisual(actor,!!actor.downedUntil)
    }

    const addCoreView=(owner:string,team:Team,gx:number,gz:number,fuse:number,networkId?:string,piercing=false,y=0)=>{
      const group=new THREE.Group(),centerY=CORE_VISUAL_RADIUS+.035
      const energyColor=new THREE.Color(piercing?'#ffd84f':team==='cyan'?'#25e9ff':'#ff5f67')
      const nucleusColor=new THREE.Color(piercing?'#fff8bd':team==='cyan'?'#d9ffff':'#fff0e8')
      const shellMaterial=new THREE.ShaderMaterial({uniforms:{uColor:{value:energyColor},uTime:{value:0},uUrgency:{value:0}},vertexShader:coreShellVertex,fragmentShader:coreShellFragment,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,toneMapped:false})
      const shell=new THREE.Mesh(coreShellGeo,shellMaterial);shell.position.y=centerY;shell.renderOrder=3;group.add(shell)
      const haloMaterial=new THREE.MeshBasicMaterial({color:energyColor,transparent:true,opacity:.14,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false})
      const halo=new THREE.Mesh(coreHaloGeo,haloMaterial);halo.position.y=centerY;halo.renderOrder=2;group.add(halo)
      const nucleusMaterial=new THREE.MeshBasicMaterial({color:nucleusColor,transparent:true,opacity:.96,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false})
      const nucleus=new THREE.Mesh(coreNucleusGeo,nucleusMaterial);nucleus.position.y=centerY;nucleus.renderOrder=5;group.add(nucleus)
      const energyRingMaterial=new THREE.MeshBasicMaterial({color:energyColor,transparent:true,opacity:.76,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false,side:THREE.DoubleSide})
      const energyRings=[0,1,2].map(index=>{const mesh=new THREE.Mesh(coreEnergyRingGeo,energyRingMaterial);mesh.position.y=centerY;mesh.rotation.set(.45+index*.66,index*.72,.2+index*1.9);mesh.renderOrder=4;group.add(mesh);return mesh})
      const sparks=Array.from({length:7},(_,index)=>{const mesh=new THREE.Mesh(coreSparkGeo,energyRingMaterial);const angle=index/7*Math.PI*2;mesh.position.set(Math.cos(angle)*CORE_VISUAL_RADIUS*.9,centerY+(index%3-1)*.12,Math.sin(angle)*CORE_VISUAL_RADIUS*.9);mesh.rotation.set(index*.7,index*1.1,index*.45);mesh.renderOrder=4;group.add(mesh);return mesh})
      const ring=new THREE.Mesh(new THREE.RingGeometry(GAME_BALANCE.CORE_RANGE-.17,GAME_BALANCE.CORE_RANGE+.03,72),new THREE.MeshBasicMaterial({color:energyColor,transparent:true,opacity:.28,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}))
      ring.rotation.x=-Math.PI/2;ring.position.y=.14;ring.renderOrder=2;group.add(ring);group.position.set(gx,y,gz);scene.add(group)
      cores.push({id:++coreId,networkId,group,x:gx,y,z:gz,fuse,owner,team,piercing,ring,shellMaterial,nucleus,halo,energyRings,sparks});return true
    }
    const animateCoreView=(core:Core,dt:number,now:number)=>{
      const urgency=THREE.MathUtils.clamp(1-core.fuse/GAME_BALANCE.CORE_FUSE_SECONDS,0,1)
      const pulse=.5+.5*Math.sin(now*(.009+urgency*.006)+core.id*.8),centerY=CORE_VISUAL_RADIUS+.035
      core.shellMaterial.uniforms.uTime.value=now*.001
      core.shellMaterial.uniforms.uUrgency.value=urgency
      core.nucleus.rotation.x+=dt*(1.8+urgency*2.2);core.nucleus.rotation.y-=dt*(2.5+urgency*2.8)
      core.nucleus.scale.setScalar(.86+pulse*(.16+urgency*.08))
      core.halo.scale.setScalar(.9+pulse*.18+urgency*.12)
      ;(core.halo.material as THREE.MeshBasicMaterial).opacity=.1+pulse*.08+urgency*.06
      core.energyRings.forEach((energyRing,index)=>{const direction=index%2?-1:1;energyRing.rotation.z+=dt*direction*(1.7+index*.55+urgency*2.1);energyRing.rotation.y+=dt*direction*.24})
      core.sparks.forEach((spark,index)=>{const angle=now*.0018*(index%2?-1:1)+index/core.sparks.length*Math.PI*2+core.id*.71,radius=CORE_VISUAL_RADIUS*(.83+(index%3)*.13);spark.position.set(Math.cos(angle)*radius,centerY+Math.sin(angle*1.7+index)*(.16+urgency*.08),Math.sin(angle)*radius);spark.rotation.x+=dt*(2+index*.17);spark.rotation.y-=dt*(1.4+index*.13);spark.scale.setScalar(.72+pulse*.3)})
      const ringPulse=1+Math.sin(now*.018+core.id)*(.012+urgency*.018);core.ring.scale.setScalar(ringPulse);(core.ring.material as THREE.MeshBasicMaterial).opacity=.22+urgency*.48
    }
    const placeCore=(actor:Actor,x:number,z:number,fuse:number=GAME_BALANCE.CORE_FUSE_SECONDS)=>{
      const {x:gx,z:gz}=worldToGrid({x,z})
      const key=`${gx},${gz}`,terrain=terrainHeightAt(gx,gz),onObstacle=arenaState.walls.has(key)&&Math.abs(actor.jumpY-(terrain+GAME_BALANCE.OBSTACLE_TOP_Y))<.18
      if(actor.eliminated||actor.falling||actor.downedUntil||(blocked(gx,gz)&&!onObstacle)||holes.has(key)||cores.some(c=>c.x===gx&&c.z===gz)||!canPlaceCore(cores.filter(c=>c.owner===actor.id).length,actor.bombCapacity))return false
      const piercing=actor.pierceCharges>0;if(piercing)actor.pierceCharges--
      const placed=addCoreView(actor.id,actor.team,gx,gz,fuse,undefined,piercing,onObstacle?terrain+GAME_BALANCE.OBSTACLE_TOP_Y:terrain)
      if(placed)triggerGesture(actor,'place')
      return placed
    }
    const rayCells=(core:Core)=>core.piercing?tracePiercingExplosion(arenaState,{x:core.x,z:core.z},GAME_BALANCE.CORE_RANGE):traceExplosion(arenaState,{x:core.x,z:core.z},GAME_BALANCE.CORE_RANGE)
  const actorJumpHeightAt=(actor:Actor,sampleNow:number,x: number=actor.x,z: number=actor.z)=>{
    const terrain=terrainHeightAt(x,z),support=arenaState.walls.has(`${Math.round(x)},${Math.round(z)}`)?terrain+GAME_BALANCE.OBSTACLE_TOP_Y:terrain
    if(sampleNow<actor.jumpUntil){
      const progress=Math.max(0,Math.min(1,(sampleNow-actor.jumpStarted)/GAME_BALANCE.JUMP_DURATION_MS))
      const airborneHeight=actor.jumpBaseY+Math.sin(progress*Math.PI)*actor.jumpHeight
      const reachedObstacleTop=actor.jumpY>=support-.01||airborneHeight>=support-.01
      return support>0&&reachedObstacleTop?Math.max(airborneHeight,support):airborneHeight
    }
    return support>0&&actor.jumpY>=support-.01?support:actor.jumpY
  }
    const actorCanOccupy=(actor:Actor,x:number,z:number,jumpY:number=actor.jumpY)=>{
      const gx=Math.round(x),gz=Math.round(z)
      const terrain=terrainHeightAt(x,z),support=arenaState.walls.has(`${gx},${gz}`)?terrain+GAME_BALANCE.OBSTACLE_TOP_Y:terrain
      if(Math.abs(x)>HALF_X-GAME_BALANCE.PLAYER_RADIUS-.04||Math.abs(z)>HALF_Z-GAME_BALANCE.PLAYER_RADIUS-.04||support-jumpY>GAME_BALANCE.MAX_WALK_STEP||staticPlaygroundCollisionAt(x,z,jumpY,GAME_BALANCE.PLAYER_RADIUS))return false
      return !actors.some(other=>other!==actor&&!other.eliminated&&!other.falling&&Math.hypot(other.x-x,other.z-z)<GAME_BALANCE.PLAYER_RADIUS*2)
    }
    const knockActor=(actor:Actor,originX:number,originZ:number)=>{
      if(actor.falling)return
      let dx=actor.x-originX,dz=actor.z-originZ,length=Math.hypot(dx,dz)
      if(length<.05){const slot=actors.indexOf(actor);dx=slot%2?-1:1;dz=slot<2?-1:1;length=Math.hypot(dx,dz)}
      dx/=length;dz/=length
      const step=GAME_BALANCE.KNOCKBACK_DISTANCE/8
      for(let index=0;index<8;index++){
        const nx=actor.x+dx*step,nz=actor.z+dz*step
        const jumpY=actorJumpHeightAt(actor,performance.now(),nx,nz)
        if(!actorCanOccupy(actor,nx,nz,jumpY))break
        actor.x=nx;actor.z=nz
      }
      actor.targetX=actor.x;actor.targetZ=actor.z
    }
    const hit=(actor:Actor,now:number,originX:number,originZ:number,originY:number)=>{
      if(actor.eliminated||actor.falling||actor.downedUntil||now<actor.lockedUntil)return
      if(Math.abs(actor.jumpY-originY)<=1.75&&isInsideCircularBlast({x:originX,z:originZ},actor,GAME_BALANCE.CORE_RANGE,GAME_BALANCE.PLAYER_RADIUS)){
        knockActor(actor,originX,originZ);triggerGesture(actor,'hit',now);shake=Math.max(shake,.42)
        actor.hits=Math.min(GAME_BALANCE.PLAYER_MAX_HITS,actor.hits+1)
        if(actor===controlled)audio.hurt()
        if(actor.hits>=GAME_BALANCE.PLAYER_MAX_HITS){
          actor.downedUntil=now+GAME_BALANCE.FLUX_DOWNED_MS;actor.lockedUntil=actor.downedUntil
          setActorDownedVisual(actor,true)
          actor.rescueRing.visible=true
          say(`${actor.name} FLUX LOCKED — 아군이 R로 6초 안에 구조할 수 있습니다`)
          if(actor===controlled)audio.fluxLocked()
        }else{
          actor.lockedUntil=now+GAME_BALANCE.FLUX_SLOW_MS
          const remaining=Math.max(0,GAME_BALANCE.PLAYER_MAX_HITS-actor.hits)
          if(actor===controlled&&remaining===1)recordAchievementEvent({type:'LOW_HEALTH'})
          say(actor===controlled?`HIT! 남은 HP ${remaining}/${GAME_BALANCE.PLAYER_MAX_HITS}`:`${actor.name}에게 폭발 피해 (${remaining} 남음)`)
        }
      }
    }
    const rescue=(rescuer:Actor,target:Actor,now:number)=>{
      if(rescuer.eliminated||rescuer.falling||rescuer.downedUntil||target.eliminated||target.falling||!target.downedUntil||rescuer.team!==target.team)return false
      if(Math.hypot(rescuer.x-target.x,rescuer.z-target.z)>1.45)return false
      target.hits=2;target.downedUntil=0;target.lockedUntil=now+650;setActorDownedVisual(target,false);target.rescueRing.visible=false
      triggerGesture(rescuer,'rescue',now);say(`${rescuer.name} → ${target.name} RESCUE! 팀이 전장에 복귀했습니다`);audio.rescue();shake=Math.max(shake,.2);return true
    }
    const eliminate=(actor:Actor)=>{
      actor.eliminated=true;actor.falling=false;actor.downedUntil=0;actor.model.visible=false;actor.shadow.visible=false;actor.rescueRing.visible=false
      say(`${actor.name} ELIMINATED`)
      if(actor===controlled){keys.clear();keepCameraOnTarget()}
      const cyanAlive=actors.filter(item=>item.team==='cyan'&&!item.eliminated).length
      const coralAlive=actors.filter(item=>item.team==='coral'&&!item.eliminated).length
      if(!ended&&(!cyanAlive||!coralAlive))finishLocalRound(cyanAlive?'cyan':'coral')
    }
    const spawnExplosion=(x:number,z:number,team:Team,now:number,chain:number,piercing=false,y=0)=>{
      const cells=piercing?tracePiercingExplosion(arenaState,{x,z},GAME_BALANCE.CORE_RANGE):traceExplosion(arenaState,{x,z},GAME_BALANCE.CORE_RANGE),burst=bursts.find(item=>!item.active)??bursts.reduce((oldest,item)=>item.born<oldest.born?item:oldest),color=piercing?'#ffe95b':team==='cyan'?'#28e6ff':'#ff5e63'
      const outerColor=piercing?'#c47c0a':team==='cyan'?'#03b8d4':'#ff3c59',innerColor=piercing?'#ffe19a':team==='cyan'?'#a9fdff':'#ffb487'
      burst.active=true;burst.born=now;burst.group.visible=true;burst.group.position.set(x,y,z);burst.group.scale.setScalar(1);burst.material.color.set(color);burst.material.opacity=.94;burst.coreMaterial.color.set(piercing?'#fff9c4':'#ffffff');burst.coreMaterial.opacity=.82
      ;[burst.beamMaterial,burst.beamHaloMaterial].forEach(material=>{material.uniforms.uColorOuter.value.set(outerColor);material.uniforms.uColorInner.value.set(innerColor);material.uniforms.uOpacity.value=material===burst.beamMaterial ? .72 : .2})
      burst.beamCoreMaterial.color.set(piercing?'#ffe586':team==='cyan'?'#75f7ff':'#ffad92');burst.beamCoreMaterial.opacity=.2
      burst.flameMaterial.uniforms.uColor.value.set(piercing?'#ffc64a':team==='cyan'?'#11d6e8':'#ff4d5f');burst.flameMaterial.uniforms.uOpacity.value=.92
      ;(burst.shock.material as THREE.MeshBasicMaterial).color.set(color);(burst.shock.material as THREE.MeshBasicMaterial).opacity=.13;burst.shock.scale.setScalar(.24);burst.light.color.set(color);burst.light.intensity=11
      burst.cells=cells.map(cell=>({x:cell.x-x,z:cell.z-z}))
      burst.beams=Array.from({length:12},(_,index)=>{const angle=index/12*Math.PI*2;return{x:Math.cos(angle),z:Math.sin(angle),length:GAME_BALANCE.CORE_RANGE}})
      burst.flamePoints.geometry.setDrawRange(0,burst.beams.length*10)
      burst.pulses.count=1;burst.cores.count=1;burst.rings.count=1;burst.beamHalos.count=burst.beams.length;burst.ribbons.count=burst.beams.length;burst.beamCores.count=burst.beams.length
      burstMatrix.position.set(0,.42,0);burstMatrix.rotation.set(0,0,0);burstMatrix.scale.setScalar(1.65+chain*.08);burstMatrix.updateMatrix();burst.pulses.setMatrixAt(0,burstMatrix.matrix)
      burstMatrix.position.set(0,.43,0);burstMatrix.rotation.set(0,0,0);burstMatrix.scale.setScalar(1.45);burstMatrix.updateMatrix();burst.cores.setMatrixAt(0,burstMatrix.matrix)
      burstMatrix.position.set(0,.085,0);burstMatrix.rotation.set(Math.PI/2,0,0);burstMatrix.scale.setScalar(.35);burstMatrix.updateMatrix();burst.rings.setMatrixAt(0,burstMatrix.matrix)
      burst.beams.forEach((beam,index)=>{const length=.08;burstDirection.set(beam.x,0,beam.z);burstMatrix.position.set(beam.x*length*.5,.3,beam.z*length*.5);burstMatrix.quaternion.setFromUnitVectors(burstUpAxis,burstDirection);burstMatrix.scale.set(1,length,1);burstMatrix.updateMatrix();burst.ribbons.setMatrixAt(index,burstMatrix.matrix);burst.beamCores.setMatrixAt(index,burstMatrix.matrix);burstMatrix.scale.set(1.55,length,1.55);burstMatrix.updateMatrix();burst.beamHalos.setMatrixAt(index,burstMatrix.matrix)})
      for(let index=0;index<36;index++){const angle=index*2.39996,radius=.04+(index%4)*.025;burstMatrix.position.set(Math.cos(angle)*radius,.38+(index%3)*.025,Math.sin(angle)*radius);burstMatrix.rotation.set(index*.73,index*1.17,index*.41);burstMatrix.scale.setScalar(.75+index%4*.16);burstMatrix.updateMatrix();burst.shards.setMatrixAt(index,burstMatrix.matrix)}
      burst.pulses.instanceMatrix.needsUpdate=true;burst.cores.instanceMatrix.needsUpdate=true;burst.beamHalos.instanceMatrix.needsUpdate=true;burst.ribbons.instanceMatrix.needsUpdate=true;burst.beamCores.instanceMatrix.needsUpdate=true;burst.rings.instanceMatrix.needsUpdate=true;burst.shards.instanceMatrix.needsUpdate=true;audio.explode(team,chain);shake=Math.max(shake,.2+chain*.05);return cells
    }
    const collectLocalItem=(actor:Actor,item:ItemView)=>{
      Object.assign(actor,stackItemEffect(actor,item.kind))
      const level=item.kind==='KICK'?actor.kickLevel:item.kind==='THROW'?actor.throwLevel:item.kind==='CAPACITY'?actor.bombCapacity:actor.pierceCharges
      removeItemView(item.id);say(`${item.kind} ITEM ×${level} · 효과가 누적됐습니다!`)
    }
    const dropLocalItem=(x:number,z:number)=>{const kind=itemForRoll(Math.random());if(kind)addItemView(`local-item-${++localItemId}`,kind,x,z)}
    const explode=(core:Core,now:number,chain:number)=>{
      const cells=spawnExplosion(core.x,core.z,core.team,now,chain,core.piercing,core.y)
      const wallHits=core.piercing?cells.filter(cell=>arenaState.walls.has(`${cell.x},${cell.z}`)):blastHitWalls(arenaState,{x:core.x,z:core.z},GAME_BALANCE.CORE_RANGE)
      actors.forEach(actor=>hit(actor,now,core.x,core.z,core.y));wallHits.forEach(wall=>{destroyWallView(`${wall.x},${wall.z}`);if(!core.piercing)dropLocalItem(wall.x,wall.z)});if(wallHits.length)say(`BLOCK SHATTER ×${wallHits.length} · 아이템을 확인하세요`)
      if(core.piercing)for(const cell of piercingFloorCells(core,cells,GIANT_PLAYROOM.spawnPoints).filter(cell=>!isProtectedFloorAt(cell))){destroyWallView(`${cell.x},${cell.z}`,false);addHoleView(`${cell.x},${cell.z}`)}
      let chained=0
      cores.forEach(other=>{if(other.id!==core.id&&cells.some(cell=>cell.x===other.x&&cell.z===other.z)&&other.fuse>.08){other.fuse=.055;chained++}})
      if(chained){chainBest=Math.max(chainBest,chain+chained);if(core.owner===controlled.id)recordAchievementEvent({type:'CHAIN_REACHED',value:chain+chained});say(`CHAIN ×${chain+chained}! 에너지 경로가 연결됐습니다`)}
      scene.remove(core.group);const index=cores.indexOf(core);if(index>=0)cores.splice(index,1)
    }
    const move=(actor:Actor,dx:number,dz:number,speed:number,dt:number,faceMovement=true,jumpSampleNow: number=performance.now())=>{
      if(actor.eliminated||actor.falling||actor.downedUntil)return
      if(Math.hypot(dx,dz)>.01)cancelTaunt(actor)
      const startX=actor.x,startZ=actor.z
      const output=performance.now()<actor.lockedUntil ? .42 : 1
      const terrainSpeed=movementMultiplierAt(actor.x,actor.z),nx=actor.x+dx*speed*output*terrainSpeed*dt,nz=actor.z+dz*speed*output*terrainSpeed*dt
      const jumpAt=(x:number,z:number)=>actorJumpHeightAt(actor,jumpSampleNow,x,z)
      const occupiedX=jumpAt(nx,actor.z),occupiedZ=jumpAt(actor.x,nz)
      if(actorCanOccupy(actor,nx,actor.z,occupiedX))actor.x=THREE.MathUtils.clamp(nx,-HALF_X-.28,HALF_X+.28)
      if(actorCanOccupy(actor,actor.x,nz,occupiedZ))actor.z=THREE.MathUtils.clamp(nz,-HALF_Z-.28,HALF_Z+.28)
      const movedX=actor.x-startX,movedZ=actor.z-startZ
      if(faceMovement&&Math.hypot(movedX,movedZ)>.0001)actor.targetYaw=Math.atan2(movedX,movedZ)
      actor.shadow.position.set(actor.x,.025,actor.z)
      actor.targetX=actor.x;actor.targetZ=actor.z
    }
    const dash=()=>{
      if(!canLocalControl())return
      if(networkClient){networkClient.send({type:'ACTION',seq:++inputSequence,action:'DASH',direction:cardinalDirection()});audio.dash();say('RIPPLE DASH · SERVER VALIDATING');return}
      const now=performance.now();if(now<controlled.dashReady||now<controlled.lockedUntil)return
      const dashSteps=12,dashStep=GAME_BALANCE.DASH_DISTANCE/dashSteps
      controlled.dashReady=now+GAME_BALANCE.DASH_COOLDOWN_MS
      for(let i=0;i<dashSteps;i++){
        const nx=controlled.x+facing.x*dashStep,nz=controlled.z+facing.z*dashStep
        if(!actorCanOccupy(controlled,nx,nz,actorJumpHeightAt(controlled,now,nx,nz)))break
        controlled.x=nx;controlled.z=nz
      }
      triggerGesture(controlled,'dash',now);audio.dash();shake=.13;say('RIPPLE DASH!')
    }
    const cardinalDirection=()=>Math.abs(facing.x)>=Math.abs(facing.z)?{x:facing.x||1,z:0}:{x:0,z:facing.z||1}
    const getThrowPlan=()=>{
      const nearest=cores.filter(core=>!core.flight).map(core=>({core,distance:Math.hypot(core.x-controlled.x,core.z-controlled.z)})).sort((a,b)=>a.distance-b.distance)[0]
      if(!nearest||nearest.distance>1.65)return null
      const direction=cardinalDirection(),fromX=nearest.core.x,fromZ=nearest.core.z
      let toX=fromX,toZ=fromZ
      const throwRange=throwDistanceForLevel(controlled.throwLevel)
      for(let range=1;range<=throwRange;range++){
        const nx=fromX+direction.x*range,nz=fromZ+direction.z*range
        if(blocked(nx,nz)||cores.some(core=>core!==nearest.core&&core.x===nx&&core.z===nz))break
        toX=nx;toZ=nz
      }
      return toX===fromX&&toZ===fromZ?null:{core:nearest.core,fromX,fromZ,toX,toZ}
    }
    const throwCore=()=>{
      if(!canLocalControl())return
      if(!controlled.canThrow){say('던지기 아이템을 먼저 획득하세요');return}
      const plan=getThrowPlan()
      if(!plan){say('던질 수 있는 가까운 Core 또는 착지 경로가 없습니다');return}
      if(networkClient){networkClient.send({type:'ACTION',seq:++inputSequence,action:'THROW',direction:cardinalDirection()});audio.throwCore();say('CORE THROW · SERVER VALIDATING');return}
      const fromY=plan.core.y,toY=terrainHeightAt(plan.toX,plan.toZ);plan.core.x=plan.toX;plan.core.y=toY;plan.core.z=plan.toZ;plan.core.ring.visible=false
      plan.core.flight={fromX:plan.fromX,fromY,fromZ:plan.fromZ,toX:plan.toX,toY,toZ:plan.toZ,start:performance.now(),duration:GAME_BALANCE.THROW_DURATION_MS}
      faceDirection(controlled,plan.toX-plan.fromX,plan.toZ-plan.fromZ);triggerGesture(controlled,'throw');audio.throwCore();shake=.09;say('CORE THROW! 착지 지점에서 파동 경로를 다시 계산합니다')
    }
    const rescueAlly=()=>{
      if(!canLocalControl())return
      if(networkClient){networkClient.send({type:'ACTION',seq:++inputSequence,action:'RESCUE',direction:cardinalDirection()});say('RESCUE · SERVER VALIDATING');return}
      const target=actors.filter(actor=>actor.team===controlled.team&&actor!==controlled&&actor.downedUntil&&!actor.eliminated).sort((a,b)=>Math.hypot(a.x-controlled.x,a.z-controlled.z)-Math.hypot(b.x-controlled.x,b.z-controlled.z))[0]
      if(!target||!rescue(controlled,target,performance.now()))say('죽은 팀원 위에서 R키를 눌러 살리세요');else faceDirection(controlled,target.x-controlled.x,target.z-controlled.z)
    }
    const jump=()=>{
      if(!canLocalControl())return
      if(networkClient){
        const now=performance.now()
        if(now<controlled.jumpUntil||now<controlled.jumpReady){audio.cooldown();say(`점프 쿨타임입니다 (${Math.ceil((controlled.jumpReady-now)/1000)}초)`);return}
        networkClient.send({type:'ACTION',seq:++inputSequence,action:'JUMP',direction:cardinalDirection()})
        audio.jump()
        return
      }
      const now=performance.now()
      if(now<controlled.jumpUntil||now<controlled.jumpReady){audio.cooldown();say(`점프 쿨타임입니다 (${Math.ceil((controlled.jumpReady-now)/1000)}초)`);return}
      controlled.jumpBaseY=controlled.jumpY;controlled.jumpHeight=GAME_BALANCE.JUMP_HEIGHT;controlled.jumpStarted=now;controlled.jumpUntil=now+GAME_BALANCE.JUMP_DURATION_MS;controlled.jumpReady=now+GAME_BALANCE.JUMP_COOLDOWN_MS;controlled.fallVelocity=0;say('JUMP! 장애물과 구멍을 뛰어넘으세요')
      recordAchievementEvent({type:'JUMPED'})
      audio.jump()
    }
    const buildWall=()=>{
      const now=performance.now();if(now<controlled.buildReady)return
      if(!canLocalControl())return
      if(networkClient){controlled.buildReady=now+GAME_BALANCE.BUILD_COOLDOWN_MS;networkClient.send({type:'ACTION',seq:++inputSequence,action:'BUILD',direction:cardinalDirection()});say('BLOCK BUILD · SERVER VALIDATING');return}
      const direction=cardinalDirection(),cell=worldToGrid({x:controlled.x+direction.x*1.05,z:controlled.z+direction.z*1.05}),key=`${cell.x},${cell.z}`
      if(Math.abs(cell.x)>HALF_X||Math.abs(cell.z)>HALF_Z||arenaState.walls.has(key)||holes.has(key)||cores.some(core=>core.x===cell.x&&core.z===cell.z)||actors.some(actor=>!actor.eliminated&&Math.hypot(actor.x-cell.x,actor.z-cell.z)<.72)){say('그 위치에는 장애물을 설치할 수 없습니다');return}
      arenaState.walls.add(key);createWallView(key,wallViews.size);controlled.buildReady=now+GAME_BALANCE.BUILD_COOLDOWN_MS;faceDirection(controlled,direction.x,direction.z);triggerGesture(controlled,'build',now);recordAchievementEvent({type:'WALL_BUILT'});say('BLOCK BUILD! 방어 경로를 만들었습니다')
    }
    const taunt=()=>{
      if(!canLocalControl())return
      const movementKeys=['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright']
      if(movementKeys.some(key=>keys.has(key))){say('도발하려면 잠시 멈춰 주세요');return}
      const now=performance.now()
      if(now<controlled.tauntReady){say(`도발 쿨타임입니다 (${Math.ceil((controlled.tauntReady-now)/1000)}초)`);return}
      controlled.tauntReady=now+GAME_BALANCE.TAUNT_COOLDOWN_MS;controlled.tauntServerStartedAt=0;triggerGesture(controlled,'taunt',now)
      if(networkClient)networkClient.send({type:'ACTION',seq:++inputSequence,action:'TAUNT',direction:cardinalDirection()})
      say(`${TAUNT_LABELS[controlled.rig.variant]} · 이동하면 취소됩니다`)
    }
    const syncNetworkSnapshot=(snapshot:RoomSnapshot)=>{
      networkRemaining=snapshot.remaining;networkCountdown=snapshot.countdown;elapsed=GAME_BALANCE.MATCH_SECONDS-snapshot.remaining;fanState=snapshot.fan;vehicleActive=snapshot.vehicle.active;vehicleX=snapshot.vehicle.x;networkHumanCount=snapshot.players.filter(state=>!state.bot).length
      const snapshotScores=snapshot.scores??{cyan:0,coral:0},snapshotRound=snapshot.round??1,snapshotRoundWinner=snapshot.roundWinner??snapshot.winner
      const nextSeries:SeriesState={round:snapshotRound,scores:{...snapshotScores},winner:snapshot.winner==='cyan'||snapshot.winner==='coral'?snapshot.winner:null};seriesRef.current=nextSeries;setSeries(nextSeries)
      syncWallViews(snapshot.walls??Array.from(WALLS).filter(cell=>!new Set(snapshot.destroyedWalls??[]).has(cell)))
      syncHoleViews(snapshot.holes??[]);syncItemViews(snapshot.items??[])
      networkRtt=Math.max(0,Date.now()-snapshot.serverTime);snapshotCount++
      const sampleNow=performance.now(),sampleElapsed=sampleNow-snapshotWindow
      if(sampleElapsed>=1000){packetRate=Math.round(snapshotCount*1000/sampleElapsed);snapshotCount=0;snapshotWindow=sampleNow}
      const occupied=new Set(snapshot.players.map(state=>state.slot))
      actors.forEach((actor,slot)=>{if(!occupied.has(slot)){actor.model.visible=false;actor.shadow.visible=false;actor.rescueRing.visible=false}})
      snapshot.players.forEach(state=>{
        const actor=actors[state.slot];if(!actor)return
        if(state.variant)setActorVariant(actor,state.variant)
        actor.targetYaw=state.yaw
        const falling=state.falling??false
        actor.networkId=state.id;actor.x=state.x;actor.z=state.z;actor.serverX=state.x;actor.serverZ=state.z;actor.targetX=state.x;actor.targetZ=state.z;actor.hits=state.hits;actor.bombCapacity=state.bombCapacity;actor.canKick=state.canKick;actor.canThrow=state.canThrow;actor.kickLevel=state.kickLevel??(state.canKick?1:0);actor.throwLevel=state.throwLevel??(state.canThrow?1:0);actor.pierceCharges=state.pierceCharges;actor.jumpY=state.jumpY;actor.buildReady=sampleNow+Math.max(0,(state.buildReady??0)-snapshot.serverTime);actor.jumpReady=sampleNow+Math.max(0,(state.jumpReady??0)-snapshot.serverTime);actor.tauntReady=sampleNow+Math.max(0,(state.tauntReady??0)-snapshot.serverTime);actor.falling=falling;actor.downedUntil=state.downedUntil;actor.eliminated=state.eliminated
        const serverTauntStarted=state.tauntStartedAt??0,serverTauntUntil=state.tauntUntil??0
        if(serverTauntStarted&&serverTauntUntil>snapshot.serverTime){
          if(actor.tauntServerStartedAt!==serverTauntStarted){actor.tauntServerStartedAt=serverTauntStarted;triggerGesture(actor,'taunt',sampleNow-Math.min(GAME_BALANCE.TAUNT_DURATION_MS,Math.max(0,snapshot.serverTime-serverTauntStarted)));actor.tauntServerStartedAt=serverTauntStarted}
        }else if(actor.gesture==='taunt'&&actor.tauntServerStartedAt){cancelTaunt(actor)}
        actor.model.visible=!state.eliminated;actor.shadow.visible=!state.eliminated&&!falling;actor.rescueRing.visible=!!state.downedUntil&&!state.eliminated&&!falling;setActorDownedVisual(actor,!!state.downedUntil)
        if(state.id===localNetworkId){
          const wasAlive=!controlled.eliminated
          controlled=actor;pendingInputs=pendingInputs.filter(input=>input.seq>state.lastInput)
          pendingInputs.forEach(input=>move(actor,input.dx,input.dz,GAME_BALANCE.PLAYER_SPEED,input.dt,false,performance.now()+input.dt*1000*0.5));actor.targetX=actor.x;actor.targetZ=actor.z
          if(wasAlive&&state.eliminated){keys.clear()}
          keepCameraOnTarget()
        }
      })
      const serverCoreIds=new Set(snapshot.cores.map(core=>core.id))
      for(let index=cores.length-1;index>=0;index--){const core=cores[index];if(core.networkId&&!serverCoreIds.has(core.networkId)){scene.remove(core.group);cores.splice(index,1)}}
      snapshot.cores.forEach(state=>{
        let core=cores.find(item=>item.networkId===state.id)
        if(!core){addCoreView(state.owner,state.team,state.x,state.z,state.fuse,state.id,state.piercing,state.y??0);core=cores.at(-1)}
        if(core){
          const movedDistance=Math.hypot(state.x-core.x,state.z-core.z),moved=movedDistance>.2,coreY=state.y??0
          if(moved&&!core.flight){core.flight={fromX:core.x,fromY:core.y,fromZ:core.z,toX:state.x,toY:coreY,toZ:state.z,start:performance.now(),duration:movedDistance>1.1?GAME_BALANCE.THROW_DURATION_MS:220,arcHeight:movedDistance>1.1?1.8:.48};core.ring.visible=false}
          core.owner=state.owner;core.team=state.team;core.x=state.x;core.y=coreY;core.z=state.z;core.fuse=state.fuse;core.piercing=state.piercing;if(!core.flight)core.group.position.set(state.x,coreY,state.z)
        }
      })
      if((snapshot.phase==='ROUND_ENDED'||snapshot.ended)&&snapshotRoundWinner&&!ended){ended=true;setResult(snapshotRoundWinner==='draw'?'draw':snapshotRoundWinner===controlled.team?'win':'lose');if(snapshot.ended&&snapshot.winner===controlled.team)recordAchievementEvent({type:'SERIES_WON'})}
      if((snapshot.phase==='COUNTDOWN'||snapshot.phase==='PLAYING')&&ended){ended=false;pendingInputs=[];setResult(null);say(`ROUND ${snapshotRound} · 같은 방에서 다음 라운드가 시작됩니다`)}
    }
    const onNetworkMessage=(message:ServerMessage)=>{
      if(message.type==='WELCOME'){
        localNetworkId=message.playerId;controlled=actors[message.slot];cameraYaw=controlled.yaw;facing={x:Math.sin(cameraYaw),z:Math.cos(cameraYaw)};actors.forEach(actor=>actor.isPlayer=false);controlled.isPlayer=true
        cameraTarget=controlled
        say(`ROOM ${message.roomId} · SLOT ${message.slot+1} · SERVER CONNECTED`)
      }
      if(message.type==='SNAPSHOT')syncNetworkSnapshot(message.snapshot)
      if(message.type==='ERROR')say(`NETWORK ERROR · ${message.message}`)
      if(message.type==='GAME_EVENT'){
        const labels:Record<string,string>={PLAYER_RESCUED:'TEAM RESCUE!',PLAYER_FLUX_LOCKED:'FLUX LOCKED!',PLAYER_ELIMINATED:'RIPPLE ELIMINATED',PLAYER_FALLING:'VOID FALL · 추락 중!',PLAYER_FELL:'VOID FALL · 탈락!',PLAYER_JUMPED:'JUMP!',PLAYER_KNOCKED:'IMPACT KNOCKBACK',SPINNER_HIT:'SPINNER IMPACT · 회전봉에 밀렸습니다!',HAZARD_CORE_PUSH:'PLAYGROUND IMPACT · 에너지볼 이동!',PLAYER_TAUNTED:'RIPPLE TAUNT!',CORE_THROWN:'SERVER CORE THROW',CORE_KICKED:'SERVER CORE KICK',CORE_EXPLODED:'3D SPLASH DISCHARGE · SERVER SYNC',OBJECT_DESTROYED:'BLOCK SHATTERED · 아이템을 확인하세요',FLOOR_DESTROYED:'PIERCE SPLASH · 바닥 붕괴!',WALL_BUILT:'BLOCK BUILD!',ITEM_COLLECTED:`${message.kind??'POWER'} ITEM 획득!`,VEHICLE_CORE_PUSH:'TOY EXPRESS MOVED A CORE',VEHICLE_PLAYER_PUSH:'TOY EXPRESS IMPACT!',ROUND_ENDED:'ROUND COMPLETE',ROUND_STARTED:'NEXT ROUND · GET READY',MATCH_RESTARTED:'READY · NEW BEST OF 3',MATCH_STARTED:'SPLASH! 예측하고, 연결하고, 탈출하세요'}
        if(message.event==='PLAYER_HIT'||message.event==='PLAYER_FLUX_LOCKED'){
          const maxHealth=message.maxHits??GAME_BALANCE.PLAYER_MAX_HITS
          const remaining=message.remainingHits??Math.max(0,maxHealth-(message.hits??GAME_BALANCE.PLAYER_MAX_HITS))
          const damage=message.damage??0
          const target=message.targetId===localNetworkId?'당신':'아군'
          if(message.targetId===localNetworkId){
            audio.hurt()
            if(message.event==='PLAYER_FLUX_LOCKED'){audio.fluxLocked()}
            if(remaining===1)recordAchievementEvent({type:'LOW_HEALTH'})
            say(`HIT -${damage} · HP ${remaining}/${maxHealth}`)
          }else{
            say(`${target}에게 HIT -${damage}`)
          }
        }
        if(message.event==='CORE_EXPLODED'&&message.x!==undefined&&message.z!==undefined&&message.team)spawnExplosion(message.x,message.z,message.team,performance.now(),message.chain??1,message.piercing,message.y??0)
        if(message.event==='OBJECT_DESTROYED'&&message.x!==undefined&&message.z!==undefined)destroyWallView(`${message.x},${message.z}`)
        if((message.event==='CHAIN_STARTED'||message.event==='CHAIN_EXTENDED')&&message.chain){chainBest=Math.max(chainBest,message.chain);if(message.actorId===localNetworkId)recordAchievementEvent({type:'CHAIN_REACHED',value:message.chain});say(`CHAIN ×${message.chain}! SERVER AUTHORITATIVE`)}
        if(message.event==='CORE_PLACED')audio.place()
        if(message.actorId===localNetworkId){
          if(message.event==='CORE_PLACED')recordAchievementEvent({type:'CORE_PLACED'})
          if(message.event==='PLAYER_JUMPED')recordAchievementEvent({type:'JUMPED'})
          if(message.event==='WALL_BUILT')recordAchievementEvent({type:'WALL_BUILT'})
        }
        if(message.event==='PLAYER_RESCUED')audio.rescue()
        const gestureByEvent:Partial<Record<string,RippleGestureKind>>={CORE_PLACED:'place',WALL_BUILT:'build',CORE_KICKED:'kick',CORE_THROWN:'throw',PLAYER_RESCUED:'rescue',PLAYER_DASHED:'dash',PLAYER_TAUNTED:'taunt'}
        const gesture=gestureByEvent[message.event],gestureActor=message.actorId?actors.find(actor=>actor.networkId===message.actorId):undefined
        if(gesture&&gestureActor&&!(gesture==='taunt'&&gestureActor.gesture==='taunt'))triggerGesture(gestureActor,gesture)
        if(message.event==='PLAYER_HIT'||message.event==='PLAYER_FLUX_LOCKED'||message.event==='PLAYER_KNOCKED'){
          const hitActor=message.targetId?actors.find(actor=>actor.networkId===message.targetId):undefined
          if(hitActor)triggerGesture(hitActor,'hit')
        }
        if(message.event==='SPINNER_HIT'){
          const hitActor=message.actorId?actors.find(actor=>actor.networkId===message.actorId):undefined
          if(hitActor)triggerGesture(hitActor,'hit')
          if(message.actorId===localNetworkId){audio.kick();shake=Math.max(shake,.18)}
        }
        if(message.event==='HAZARD_CORE_PUSH')audio.kick()
        if(labels[message.event]&&message.event!=='PLAYER_FLUX_LOCKED')say(labels[message.event])
      }
    }
    const stopNetwork=networkClient?.onMessage(onNetworkMessage)??(()=>{})
    if(networkClient&&networkSession)networkClient.connect(networkSession).catch(()=>say('NETWORK UNAVAILABLE · 서버를 확인하세요'))
    const onDown=(event:KeyboardEvent)=>{
      audio.unlock();music.unlock()
      if([' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))event.preventDefault()
      if((networkClient?networkCountdown:Math.ceil((countdownEnds-performance.now())/1000))>0||ended)return
      if(controlled.eliminated){
        if(event.key==='ArrowLeft'||event.key==='ArrowUp')cycleCameraTarget(-1)
        if(event.key==='ArrowRight'||event.key==='ArrowDown')cycleCameraTarget(1)
        return
      }
      keys.add(event.key.toLowerCase())
      const lowerKey=event.key.toLowerCase()
      if(debug&&lowerKey==='h'&&!event.repeat){const startX=Math.max(-HALF_X,Math.min(HALF_X-1,Math.round(controlled.x)+4)),startZ=Math.max(-HALF_Z,Math.min(HALF_Z-1,Math.round(controlled.z)-2));for(const x of [startX,startX+1])for(const z of [startZ,startZ+1])addHoleView(`${x},${z}`);say(`DEBUG HOLE 2×2 · ${startX},${startZ}`);return}
      if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' ','shift','f','q','c','r'].includes(lowerKey))cancelTaunt(controlled)
      if(event.code==='Space'&&!event.repeat)jump()
      if(event.key.toLowerCase()==='f'&&!controlled.falling&&!controlled.downedUntil&&performance.now()-lastPlace>280){lastPlace=performance.now();if(networkClient){networkClient.send({type:'ACTION',seq:++inputSequence,action:'PLACE',direction:cardinalDirection()});say('CORE PLACED · SERVER VALIDATING')}else if(placeCore(controlled,controlled.x,controlled.z)){recordAchievementEvent({type:'CORE_PLACED'});audio.place();say('Splash Core 설치 — 기존 Core가 터지면 슬롯이 돌아옵니다')}}
      if(event.key==='Shift')dash()
      if(event.key.toLowerCase()==='q'&&!event.repeat){if(controlled.canThrow)throwCore();else say('던지기 아이템을 먼저 획득하세요')}
      if(event.key.toLowerCase()==='c')buildWall()
      if(event.key.toLowerCase()==='r')rescueAlly()
      if(event.key.toLowerCase()==='t'&&!event.repeat)taunt()
    }
    const onUp=(event:KeyboardEvent)=>{keys.delete(event.key.toLowerCase())}
    const focusArena=()=>{renderer.domElement.focus();audio.unlock();music.unlock()}
    window.addEventListener('keydown',onDown);window.addEventListener('keyup',onUp);renderer.domElement.addEventListener('pointerdown',focusArena)
    const resize=()=>{const width=host.clientWidth,height=host.clientHeight;camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height,false)}
    const observer=new ResizeObserver(resize);observer.observe(host);resize()

    const fixedUpdate=(dt:number,now:number)=>{
      if(ended)return
      if((networkClient?networkCountdown:Math.ceil((countdownEnds-now)/1000))>0)return
      elapsed+=dt
      const jumpSampleNow=now+dt*1000*0.5
      if(!networkClient){
        actors.forEach(actor=>{
        if(actor.eliminated)return
        if(actor.falling){actor.fallVelocity+=GAME_BALANCE.FALL_GRAVITY*dt;actor.jumpY-=actor.fallVelocity*dt;if(actor.jumpY<=GAME_BALANCE.FALL_DEATH_Y)eliminate(actor);return}
        if(jumpSampleNow<actor.jumpUntil){
          actor.fallVelocity=0
          actor.jumpY=actorJumpHeightAt(actor,jumpSampleNow)
        }else{
          const terrain=terrainHeightAt(actor.x,actor.z),support=arenaState.walls.has(`${Math.round(actor.x)},${Math.round(actor.z)}`)?terrain+GAME_BALANCE.OBSTACLE_TOP_Y:terrain
          if(support>0&&actor.jumpY>=support-.01){actor.jumpY=support;actor.fallVelocity=0}
          else if(actor.jumpY>support){
            actor.fallVelocity+=GAME_BALANCE.FALL_GRAVITY*dt
            actor.jumpY=Math.max(support,actor.jumpY-actor.fallVelocity*dt)
            if(actor.jumpY===support)actor.fallVelocity=0
          }else{actor.jumpY=support;actor.fallVelocity=0}
        }
      })
      }
      if(canLocalControl()){
        let side=0,forwardInput=0
        if(keys.has('a')||keys.has('arrowleft'))side--
        if(keys.has('d')||keys.has('arrowright'))side++
        if(keys.has('w')||keys.has('arrowup'))forwardInput++
        if(keys.has('s')||keys.has('arrowdown'))forwardInput--
        const forwardX=Math.sin(cameraYaw),forwardZ=Math.cos(cameraYaw),rightX=-forwardZ,rightZ=forwardX
        let dx=forwardX*forwardInput+rightX*side,dz=forwardZ*forwardInput+rightZ*side
        if(dx||dz){const length=Math.hypot(dx,dz);dx/=length;dz/=length;facing={x:dx,z:dz};move(controlled,dx,dz,GAME_BALANCE.PLAYER_SPEED,dt,true,jumpSampleNow)}
        if(networkClient){
          const seq=++inputSequence;pendingInputs.push({seq,dx,dz,dt});if(pendingInputs.length>90)pendingInputs=pendingInputs.slice(-90);networkClient.send({type:'INPUT',seq,dx,dz})
        }
      }else if(networkClient){
        pendingInputs = []
      }
      const nextFanState=fanStateAt(elapsed)
      if(nextFanState!==fanState){
        fanState=nextFanState
        if(fanState==='WARNING'){audio.warning();say('선풍기 가동 예고 — 오른쪽에서 강풍이 옵니다!')}
        if(fanState==='ACTIVE')say('FAN ACTIVE! 코어와 파이터가 왼쪽으로 밀립니다')
        if(fanState==='CALM'&&(elapsed>=24||elapsed>=60))say('바람이 멎었습니다 — 에너지 경로를 다시 점유하세요')
      }
      if(fanState==='ACTIVE'&&!networkClient){
        actors.forEach(actor=>move(actor,-1,0,actor.isPlayer?1.18:.92,dt,false,jumpSampleNow))
        if(now-lastFanPush>650){
          lastFanPush=now
          cores.filter(core=>!core.flight).sort((a,b)=>a.x-b.x).forEach(core=>{
            const nx=core.x-1
            if(!blocked(nx,core.z)&&!cores.some(other=>other!==core&&other.x===nx&&other.z===core.z)){core.x=nx;core.y=terrainHeightAt(nx,core.z);core.group.position.set(nx,core.y,core.z)}
          })
        }
      }
      if(!networkClient){
        const vehicle=vehicleStateAt(elapsed);vehicleActive=vehicle.active;vehicleX=vehicle.x
        if(vehicleActive){
          const vehicleCell=Math.round(vehicleX)
          if(vehicleCell!==lastVehicleCell){
            lastVehicleCell=vehicleCell
            cores.filter(core=>!core.flight&&Math.abs(core.x-vehicleX)<.8&&Math.abs(core.z-1)<.7).forEach(core=>{const nx=core.x+1;if(!blocked(nx,core.z)&&!cores.some(other=>other!==core&&other.x===nx&&other.z===core.z)){core.x=nx;core.y=terrainHeightAt(nx,core.z);core.group.position.set(nx,core.y,core.z);say('TOY EXPRESS가 Core를 다음 격자로 밀었습니다!')}})
            actors.filter(actor=>!actor.eliminated&&!actor.falling&&Math.abs(actor.x-vehicleX)<.78&&Math.abs(actor.z-1)<.72).forEach(actor=>{knockActor(actor,vehicleX-1,1);say('TOY EXPRESS IMPACT! 트랙에서 벗어나세요')})
          }
        }else lastVehicleCell=-99
        actors.filter(actor=>!actor.eliminated&&!actor.falling&&!actor.downedUntil).forEach(actor=>{
          const roller=rollerPushAt(actor.x,actor.z)
          if(roller)move(actor,roller.x,roller.z,1,dt,false,jumpSampleNow)
          const slide=slidePushAt(actor.x,actor.z)
          if(slide)move(actor,slide.x,slide.z,1,dt,false,jumpSampleNow)
          const pad=jumpPadAt(actor.x,actor.z),support=terrainHeightAt(actor.x,actor.z)
          if(pad&&jumpSampleNow>=actor.jumpUntil&&Math.abs(actor.jumpY-support)<.08){actor.jumpBaseY=actor.jumpY;actor.jumpHeight=GAME_BALANCE.JUMP_PAD_HEIGHT;actor.jumpStarted=now;actor.jumpUntil=now+GAME_BALANCE.JUMP_DURATION_MS;actor.jumpReady=actor.jumpUntil;actor.fallVelocity=0;say(`${actor.name} JUMP PAD!`);if(actor===controlled)audio.jump()}
          const spinnerPush=spinnerPushAt(actor.x,actor.z,elapsed),lastHit=localHazardHits.get(actor.id)??0
          if(spinnerPush&&now-lastHit>=GAME_BALANCE.HAZARD_HIT_COOLDOWN_MS){localHazardHits.set(actor.id,now);knockActor(actor,actor.x-spinnerPush.x,actor.z-spinnerPush.z);triggerGesture(actor,'hit',now);if(actor===controlled)audio.kick();shake=Math.max(shake,.18);say(`${actor.name}이 회전봉에 밀렸습니다!`)}
        })
        cores.filter(core=>!core.flight&&core.y-terrainHeightAt(core.x,core.z)<.28).forEach(core=>{
          const push=movingHazardPushAt(core.x,core.z,elapsed),lastHit=localCoreHazardHits.get(core.id)??0
          if(!push||now-lastHit<GAME_BALANCE.HAZARD_HIT_COOLDOWN_MS)return
          const direction=Math.abs(push.x)>=Math.abs(push.z)?{x:Math.sign(push.x)||1,z:0}:{x:0,z:Math.sign(push.z)||1},nx=core.x+direction.x,nz=core.z+direction.z,key=`${nx},${nz}`
          if(Math.abs(nx)>HALF_X||Math.abs(nz)>HALF_Z||arenaState.walls.has(key)||holes.has(key)||cores.some(other=>other!==core&&other.x===nx&&other.z===nz))return
          const fromX=core.x,fromY=core.y,fromZ=core.z,toY=terrainHeightAt(nx,nz);localCoreHazardHits.set(core.id,now);core.x=nx;core.z=nz;core.y=toY;core.flight={fromX,fromY,fromZ,toX:nx,toY,toZ:nz,start:now,duration:220,arcHeight:.48};core.ring.visible=false;audio.kick();say('움직이는 장애물이 에너지볼을 밀었습니다!')
        })
      }
      if(!networkClient){
        actors.filter(actor=>!actor.eliminated&&!actor.falling&&actor.jumpY<.12&&holes.has(`${Math.round(actor.x)},${Math.round(actor.z)}`)).forEach(actor=>{actor.falling=true;actor.fallVelocity=0;actor.jumpUntil=0;actor.shadow.visible=false;actor.rescueRing.visible=false;say(`${actor.name}이 바닥 구멍으로 추락하고 있습니다!`)})
        for(const item of [...itemViews.values()]){const collector=actors.filter(actor=>!actor.eliminated&&!actor.falling).find(actor=>Math.hypot(actor.x-item.x,actor.z-item.z)<=GAME_BALANCE.ITEM_PICKUP_RADIUS);if(collector)collectLocalItem(collector,item)}
      }
      if(networkClient){
        cores.forEach(core=>animateCoreView(core,dt,now))
        return
      }
      const danger=cores.filter(core=>core.fuse<1.12).flatMap(rayCells)
      bots.forEach((brain,index)=>{
        if(brain.eliminated||brain.falling||brain.downedUntil)return
        const downedAlly=actors.filter(actor=>actor!==brain&&actor.team===brain.team&&actor.downedUntil&&!actor.eliminated).sort((a,b)=>Math.hypot(a.x-brain.x,a.z-brain.z)-Math.hypot(b.x-brain.x,b.z-brain.z))[0]
        const enemy=actors.filter(actor=>actor.team!==brain.team&&!actor.eliminated).sort((a,b)=>Math.hypot(a.x-brain.x,a.z-brain.z)-Math.hypot(b.x-brain.x,b.z-brain.z))[0]
        const target=downedAlly??enemy
        if(!target)return
        const botInDanger=danger.some(cell=>Math.abs(cell.x-brain.x)<.8&&Math.abs(cell.z-brain.z)<.8)
        let botDx=target.x-brain.x,botDz=target.z-brain.z
        if(botInDanger){botDx=-botDx;botDz=-botDz}
        const botLength=Math.hypot(botDx,botDz)||1;botDx/=botLength;botDz/=botLength
        move(brain,botDx,botDz,botInDanger?3.45:downedAlly?2.75:GAME_BALANCE.BOT_SPEED,dt,true,jumpSampleNow)
        if(downedAlly){rescue(brain,downedAlly,now);return}
        const placedAt=botPlace.get(brain.id)??0
        if(now-placedAt>2050+index*180&&Math.hypot(target.x-brain.x,target.z-brain.z)<7.5){botPlace.set(brain.id,now);placeCore(brain,brain.x,brain.z,2.55+index*.12)}
      })
      cores.forEach(core=>{if(!core.flight)core.fuse-=dt;animateCoreView(core,dt,now)})
      cores.filter(core=>core.fuse<=0).forEach(core=>explode(core,now,1))
      actors.filter(actor=>actor.downedUntil&&now>=actor.downedUntil&&!actor.eliminated).forEach(eliminate)
      if(elapsed>=GAME_BALANCE.MATCH_SECONDS&&!ended){
        const winner=matchWinner(actors.map(actor=>({team:actor.team,hits:actor.hits,eliminated:actor.eliminated})))
        finishLocalRound(winner)
      }
    }
    let frame=0
    const loop=(now:number)=>{
      const dt=Math.min((now-last)/1000,.05);last=now;acc+=dt
      if(dt>.024){slowFrameCount++;fastFrameCount=0}else if(dt<.018){fastFrameCount++;slowFrameCount=Math.max(0,slowFrameCount-2)}else{slowFrameCount=Math.max(0,slowFrameCount-1);fastFrameCount=0}
      if(slowFrameCount>=45&&currentPixelRatio>.82){currentPixelRatio=Math.max(.82,currentPixelRatio-.14);renderer.setPixelRatio(currentPixelRatio);resize();slowFrameCount=0}
      else if(fastFrameCount>=360&&currentPixelRatio<renderPixelRatio){currentPixelRatio=Math.min(renderPixelRatio,currentPixelRatio+.08);renderer.setPixelRatio(currentPixelRatio);resize();fastFrameCount=0}
      while(acc>=1/30){fixedUpdate(1/30,now);acc-=1/30}
      const presentedCountdown=Math.max(0,networkClient?networkCountdown:Math.ceil((countdownEnds-now)/1000))
      if(presentedCountdown!==lastPresentedCountdown){lastPresentedCountdown=presentedCountdown;if(!presentedCountdown)say('SPLASH! 예측하고, 연결하고, 탈출하세요')}
      cores.forEach(core=>{
        if(!core.flight)return
        const flight=core.flight,t=Math.min(1,(now-flight.start)/flight.duration),ease=t*t*(3-2*t)
        core.group.position.set(THREE.MathUtils.lerp(flight.fromX,flight.toX,ease),THREE.MathUtils.lerp(flight.fromY,flight.toY,ease)+Math.sin(t*Math.PI)*(flight.arcHeight??1.8),THREE.MathUtils.lerp(flight.fromZ,flight.toZ,ease))
        if(t>=1){core.group.position.set(flight.toX,flight.toY,flight.toZ);core.ring.visible=true;core.flight=undefined}
      })
      let itemFloatIndex=0;for(const item of itemViews.values()){
        const phase=now*.004+itemFloatIndex++,distance=Math.hypot(controlled.x-item.x,controlled.z-item.z),near=THREE.MathUtils.clamp(1-(distance-1.1)/3,0,1)
        item.group.position.y=item.baseY+.08+Math.sin(phase)*.08
        const iconScale=1.08+near*.28+Math.sin(phase*1.35)*.025;item.icon.scale.setScalar(iconScale);item.icon.position.y=.62+near*.04;(item.icon.material as THREE.SpriteMaterial).opacity=.88+near*.12
      }
      fanBlades.rotation.x+=dt*(fanState==='ACTIVE'?17:fanState==='WARNING'?5.5:.8)
      spinnerVisual.rotation.y=elapsed*SPINNER.angularSpeed
      rollerVisuals.forEach((roller,index)=>{roller.rotation.x=elapsed*(2.2+index*.28)+PLAYGROUND_ROLLERS[index].phase})
      toyVehicle.visible=vehicleActive;toyVehicle.position.set(vehicleX,0,1);toyVehicle.rotation.y=Math.sin(now*.01)*.025
      if(vehicleActive)toyVehicle.children.slice(2).forEach(child=>child.rotation.z-=dt*8)
      windStreaks.forEach((streak,index)=>{
        streak.visible=fanState!=='CALM';(streak.material as THREE.MeshBasicMaterial).opacity=fanState==='ACTIVE'?.34:.12
        if(fanState!=='CALM'){
          streak.position.x-=dt*(fanState==='ACTIVE'?8.5:2.4)
          if(streak.position.x<-20){streak.position.x=20.4;streak.position.z=-11+((index*7+Math.floor(now*.001))%22)}
        }
      })
      if(networkClient)actors.forEach(actor=>{
        const blend=1-Math.exp(-dt*(actor===controlled?18:11));actor.renderX=THREE.MathUtils.lerp(actor.renderX,actor.targetX,blend);actor.renderZ=THREE.MathUtils.lerp(actor.renderZ,actor.targetZ,blend)
      })
      actors.forEach((actor,index)=>{
        const x=networkClient?actor.renderX:actor.x,z=networkClient?actor.renderZ:actor.z
        const travel=Math.hypot(x-actor.lastRenderX,z-actor.lastRenderZ),travelSpeed=travel/Math.max(dt,.001),canWalk=!actor.falling&&!actor.downedUntil&&!actor.eliminated
        const terrain=terrainHeightAt(actor.x,actor.z),support=arenaState.walls.has(`${Math.round(actor.x)},${Math.round(actor.z)}`)?terrain+GAME_BALANCE.OBSTACLE_TOP_Y:terrain
        const feetGrounded=Math.abs(actor.jumpY-support)<.09
        const airborne=!feetGrounded&&!actor.eliminated
        if(actor.wasAirborne&&feetGrounded)actor.landingBlend=1
        actor.wasAirborne=airborne
        actor.landingBlend=Math.max(0,actor.landingBlend-dt*4.6)
        const targetWalk=canWalk&&feetGrounded?THREE.MathUtils.clamp(travelSpeed/GAME_BALANCE.PLAYER_SPEED,0,1):0
        actor.walkBlend=THREE.MathUtils.lerp(actor.walkBlend,targetWalk,1-Math.exp(-dt*(targetWalk>actor.walkBlend?9:6.5)))
        if(travel>.0005&&feetGrounded)actor.walkPhase+=travel*rippleStepRate(actor.rig.variant)
        const motionBlend=1-Math.exp(-dt*13)
        const turnIntent=THREE.MathUtils.clamp(Math.atan2(Math.sin(actor.targetYaw-actor.yaw),Math.cos(actor.targetYaw-actor.yaw))*1.5,-1,1)
        let gestureProgress=0
        if(actor.gesture){gestureProgress=(now-actor.gestureStarted)/RIPPLE_GESTURE_DURATION[actor.gesture];if(gestureProgress>=1){actor.gesture=null;gestureProgress=1}}
        poseRippleRig(actor.rig,actor.walkPhase,actor.walkBlend,dt,now,airborne?1:0,actor.landingBlend,turnIntent,actor.gesture,gestureProgress,actor.downedUntil?1:0)
        actor.yaw=lerpAngle(actor.yaw,actor.targetYaw,1-Math.exp(-dt*13));actor.model.rotation.y=actor.yaw
        actor.model.rotation.x=THREE.MathUtils.lerp(actor.model.rotation.x,actor.falling?-.42:0,motionBlend);actor.model.rotation.z=THREE.MathUtils.lerp(actor.model.rotation.z,actor.falling?Math.sin(now*.008+index)*.2:0,motionBlend)
        actor.model.position.set(x,actor.jumpY,z);actor.shadow.position.set(x,support+.025,z);actor.shadow.scale.setScalar(1-THREE.MathUtils.clamp((actor.jumpY-support)*.22,0,.3));(actor.shadow.material as THREE.MeshBasicMaterial).opacity=actor.falling?0:.42-THREE.MathUtils.clamp((actor.jumpY-support)*.14,0,.2);actor.rescueRing.position.set(x,support+.13,z);actor.lastRenderX=x;actor.lastRenderZ=z
        if(actor.rescueRing.visible){const pulse=1+Math.sin(now*.012+index)*.25;actor.rescueRing.scale.setScalar(pulse);actor.rescueRing.rotation.z+=dt*2.5}
      })
      if(debug){
        actors.forEach((actor,index)=>{if(!networkClient){actor.serverX=actor.x;actor.serverZ=actor.z}debugColliders[index].visible=actor.model.visible;debugColliders[index].position.set(networkClient?actor.renderX:actor.x,terrainHeightAt(actor.x,actor.z)+.055,networkClient?actor.renderZ:actor.z)})
        serverGhost.visible=!!networkClient&&controlled.model.visible;serverGhost.position.set(controlled.serverX,.065,controlled.serverZ);serverGhost.rotation.z+=dt*1.2
        bots.forEach((brain,index)=>{
          const path=debugPaths[index],target=actors.filter(actor=>actor.team!==brain.team&&!actor.eliminated).sort((a,b)=>Math.hypot(a.x-brain.x,a.z-brain.z)-Math.hypot(b.x-brain.x,b.z-brain.z))[0]
          path.line.visible=brain.model.visible&&!!target
          if(target){path.positions.set([brain.x,.12,brain.z,target.x,.12,target.z]);path.geometry.attributes.position.needsUpdate=true}
        })
      }
      bursts.forEach(burst=>{
        if(!burst.active)return
        const age=(now-burst.born)/820,fade=Math.max(0,1-age),flash=Math.sin(Math.min(1,age*2.4)*Math.PI),shockMaterial=burst.shock.material as THREE.MeshBasicMaterial
        burst.material.opacity=fade*.76;burst.coreMaterial.opacity=Math.min(.72,fade*1.2);burst.beamMaterial.uniforms.uTime.value=now*.001;burst.beamMaterial.uniforms.uOpacity.value=fade*.72;burst.beamHaloMaterial.uniforms.uTime.value=now*.001;burst.beamHaloMaterial.uniforms.uOpacity.value=fade*.2;burst.beamCoreMaterial.opacity=fade*.18;burst.flameMaterial.uniforms.uTime.value=now*.001;burst.flameMaterial.uniforms.uOpacity.value=fade*.92;shockMaterial.opacity=fade*.13;burst.shock.scale.setScalar(.24+age*4.1);burst.light.intensity=fade*9
        const cellPulse=.82+Math.sin(Math.min(1,age*1.4)*Math.PI)*.58
        burstMatrix.position.set(0,.34+Math.sin(Math.min(1,age)*Math.PI)*.18,0);burstMatrix.rotation.set(age*2.2,age*.37,0);burstMatrix.scale.setScalar(fade*cellPulse*1.42);burstMatrix.updateMatrix();burst.pulses.setMatrixAt(0,burstMatrix.matrix)
        burstMatrix.position.set(0,.4+Math.sin(Math.min(1,age)*Math.PI)*.12,0);burstMatrix.rotation.set(age*4,age*2.1,age*1.3);burstMatrix.scale.setScalar(fade*(.42+flash*.75));burstMatrix.updateMatrix();burst.cores.setMatrixAt(0,burstMatrix.matrix)
        burstMatrix.position.set(0,.08,0);burstMatrix.rotation.set(Math.PI/2,0,age*.8);burstMatrix.scale.setScalar(.3+age*6.55);burstMatrix.updateMatrix();burst.rings.setMatrixAt(0,burstMatrix.matrix)
        const extension=1-Math.pow(1-Math.min(1,age*5),3)
        burst.beams.forEach((beam,index)=>{const length=(beam.length+.72)*extension,thickness=.98+flash*.14;burstDirection.set(beam.x,0,beam.z);burstMatrix.position.set(beam.x*length*.5,.3,beam.z*length*.5);burstMatrix.quaternion.setFromUnitVectors(burstUpAxis,burstDirection);burstMatrix.scale.set(thickness,length,thickness);burstMatrix.updateMatrix();burst.ribbons.setMatrixAt(index,burstMatrix.matrix);burstMatrix.scale.set(thickness*1.72,length,thickness*1.72);burstMatrix.updateMatrix();burst.beamHalos.setMatrixAt(index,burstMatrix.matrix);burstMatrix.scale.set(.72+flash*.06,length,.72+flash*.06);burstMatrix.updateMatrix();burst.beamCores.setMatrixAt(index,burstMatrix.matrix)})
        for(let index=0;index<burst.beams.length*10;index++){
          const beam=burst.beams[Math.floor(index/10)],seed=burst.flameSeeds[index],travel=(age*2.65+seed*1.7+(index%10)*.103)%1,length=(beam.length+.62)*extension,along=length*(.06+travel*.9),side=(seed>.5?1:-1)*(.1+seed*.28)+Math.sin(now*.014+index*2.1)*.07,perpX=-beam.z,perpZ=beam.x
          burst.flamePositions[index*3]=beam.x*along+perpX*side;burst.flamePositions[index*3+1]=.27+.31*seed+.13*Math.abs(Math.sin(now*.012+seed*19));burst.flamePositions[index*3+2]=beam.z*along+perpZ*side
        }
        burst.flamePoints.geometry.attributes.position.needsUpdate=true
        for(let index=0;index<36;index++){
          const angle=index*2.39996,radius=age*(.44+(index%4)*.16)
          burstMatrix.position.set(Math.cos(angle)*radius,.34+age*(1.2+(index%4)*.18)-age*age*1.2,Math.sin(angle)*radius);burstMatrix.rotation.set(age*8+index,age*11+index*.4,age*7);burstMatrix.scale.setScalar(fade*(.58+index%3*.14));burstMatrix.updateMatrix();burst.shards.setMatrixAt(index,burstMatrix.matrix)
        }
        burst.pulses.instanceMatrix.needsUpdate=true;burst.cores.instanceMatrix.needsUpdate=true;burst.beamHalos.instanceMatrix.needsUpdate=true;burst.ribbons.instanceMatrix.needsUpdate=true;burst.beamCores.instanceMatrix.needsUpdate=true;burst.rings.instanceMatrix.needsUpdate=true;burst.shards.instanceMatrix.needsUpdate=true
        if(age>=1){burst.active=false;burst.group.visible=false;burst.flamePoints.geometry.setDrawRange(0,0);burst.light.intensity=0}
      })
      for(let index=debris.length-1;index>=0;index--){
        const piece=debris[index],age=(now-piece.born)/1000
        piece.velocity.y-=7.2*dt;piece.mesh.position.addScaledVector(piece.velocity,dt);piece.mesh.rotation.x+=piece.spin.x*dt;piece.mesh.rotation.y+=piece.spin.y*dt;piece.mesh.rotation.z+=piece.spin.z*dt
        if(piece.mesh.position.y<.11){piece.mesh.position.y=.11;piece.velocity.y=Math.abs(piece.velocity.y)*.34;piece.velocity.x*=.82;piece.velocity.z*=.82}
        if(age>1.35){scene.remove(piece.mesh);piece.mesh.geometry.dispose();debris.splice(index,1)}
      }
      const followTarget=controlled.eliminated&&cameraTarget?cameraTarget:controlled
      const controlledX=networkClient?followTarget.renderX:followTarget.x,controlledZ=networkClient?followTarget.renderZ:followTarget.z
      const cameraForwardX=Math.sin(cameraYaw),cameraForwardZ=Math.cos(cameraYaw)
      const followSupport=terrainHeightAt(controlledX,controlledZ),desiredCamera=new THREE.Vector3(controlledX-cameraForwardX*6.15,followSupport+4.8,controlledZ-cameraForwardZ*6.15)
      if(shake>.002){desiredCamera.x+=(Math.random()-.5)*shake;desiredCamera.y+=(Math.random()-.5)*shake*.45;shake*=.88}
      camera.position.lerp(desiredCamera,1-Math.exp(-dt*6.2));camera.lookAt(controlledX+cameraForwardX*2.85,followSupport+.92,controlledZ+cameraForwardZ*2.85)
      const rescueTarget=actors.find(actor=>actor!==controlled&&actor.team===controlled.team&&!!actor.downedUntil&&!actor.eliminated&&!actor.falling)
      if(rescueTarget){
        const promptX=networkClient?rescueTarget.renderX:rescueTarget.x,promptZ=networkClient?rescueTarget.renderZ:rescueTarget.z
        rescuePromptPoint.set(promptX,rescueTarget.jumpY+2.25,promptZ).project(camera)
        const promptVisible=rescuePromptPoint.z>-1&&rescuePromptPoint.z<1&&Math.abs(rescuePromptPoint.x)<1.15&&Math.abs(rescuePromptPoint.y)<1.15
        rescueWorldPrompt.hidden=!promptVisible
        rescueWorldPrompt.classList.toggle('visible',promptVisible)
        rescueWorldPrompt.setAttribute('aria-hidden',String(!promptVisible))
        if(promptVisible)rescueWorldPrompt.style.transform=`translate(-50%,-100%) translate(${(rescuePromptPoint.x*.5+.5)*host.clientWidth}px,${(-rescuePromptPoint.y*.5+.5)*host.clientHeight}px)`
      }else{rescueWorldPrompt.hidden=true;rescueWorldPrompt.classList.remove('visible');rescueWorldPrompt.setAttribute('aria-hidden','true')}
      spawnArchVisuals.forEach(arch=>{arch.visible=Math.hypot(camera.position.x-arch.position.x,camera.position.z-arch.position.z)>8});renderer.render(scene,camera)
      if(now-lastUi>100){lastUi=now;const ownerId=networkClient?localNetworkId:controlled.id;setUi(v=>({...v,time:Math.max(0,Math.floor(networkClient?networkRemaining:GAME_BALANCE.MATCH_SECONDS-elapsed)),countdown:presentedCountdown,localTeam:controlled.team,playerHits:controlled.hits,maxHealth:GAME_BALANCE.PLAYER_MAX_HITS,health:Math.max(0,GAME_BALANCE.PLAYER_MAX_HITS-controlled.hits),jump:Math.min(1,Math.max(0,(now-controlled.jumpReady+GAME_BALANCE.JUMP_COOLDOWN_MS)/GAME_BALANCE.JUMP_COOLDOWN_MS)),botHits:bot.hits,allyHits:ally.hits,rival2Hits:vio.hits,alliesAlive:actors.filter(actor=>actor.team===controlled.team&&!actor.eliminated&&actor.model.visible).length,rivalsAlive:actors.filter(actor=>actor.team!==controlled.team&&!actor.eliminated&&actor.model.visible).length,onlineHumans:networkHumanCount,cores:Math.max(0,controlled.bombCapacity-cores.filter(core=>core.owner===ownerId).length),capacity:controlled.bombCapacity,canKick:controlled.canKick,canThrow:controlled.canThrow,kickLevel:controlled.kickLevel,throwLevel:controlled.throwLevel,pierceCharges:controlled.pierceCharges,chain:chainBest,dash:Math.min(1,Math.max(0,(now-controlled.dashReady+GAME_BALANCE.DASH_COOLDOWN_MS)/GAME_BALANCE.DASH_COOLDOWN_MS)),build:Math.min(1,Math.max(0,(now-controlled.buildReady+GAME_BALANCE.BUILD_COOLDOWN_MS)/GAME_BALANCE.BUILD_COOLDOWN_MS)),taunt:Math.min(1,Math.max(0,(now-controlled.tauntReady+GAME_BALANCE.TAUNT_COOLDOWN_MS)/GAME_BALANCE.TAUNT_COOLDOWN_MS)),fan:fanState,vehicle:vehicleActive,fps:Math.round(1/Math.max(.001,dt)),frameMs:Number((dt*1000).toFixed(1)),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,textures:renderer.info.memory.textures,simBodies:actors.filter(actor=>actor.model.visible).length+cores.length+itemViews.size,rtt:networkRtt,packetRate:packetRate,pendingInputs:pendingInputs.length,serverPos:`${controlled.serverX.toFixed(2)},${controlled.serverZ.toFixed(2)}`,clientPos:`${controlled.x.toFixed(2)},${controlled.z.toFixed(2)}`}))}
      frame=requestAnimationFrame(loop)
    }
    // Pre-warm the pooled 3D explosion shaders and flame texture off-screen.
    // This prevents the first real explosion from compiling several GPU
    // programs in the middle of active play.
    const warmupBurst=bursts[0]
    warmupBurst.group.position.set(0,-60,0);warmupBurst.group.visible=true;warmupBurst.pulses.count=1;warmupBurst.cores.count=1;warmupBurst.beamHalos.count=1;warmupBurst.ribbons.count=1;warmupBurst.beamCores.count=1;warmupBurst.rings.count=1;warmupBurst.flamePoints.geometry.setDrawRange(0,1)
    renderer.compile(scene,camera);renderer.render(scene,camera)
    warmupBurst.group.visible=false;warmupBurst.pulses.count=0;warmupBurst.cores.count=0;warmupBurst.beamHalos.count=0;warmupBurst.ribbons.count=0;warmupBurst.beamCores.count=0;warmupBurst.rings.count=0;warmupBurst.flamePoints.geometry.setDrawRange(0,0)
    frame=requestAnimationFrame(loop)
    return()=>{
      cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('keydown',onDown);window.removeEventListener('keyup',onUp);renderer.domElement.removeEventListener('pointerdown',focusArena);stopNetwork();networkClient?.close();if(networkClientRef.current===networkClient)networkClientRef.current=null;audio.close();music.close();if(musicRef.current===music)musicRef.current=null
      burstFlameTexture.dispose();Object.values(itemIconTextures).forEach(texture=>texture.dispose());renderer.dispose();scene.traverse(object=>{if(object instanceof THREE.Mesh||object instanceof THREE.Sprite||object instanceof THREE.Points){object.geometry?.dispose?.();const material=(object as THREE.Mesh|THREE.Points).material;if(Array.isArray(material))material.forEach(item=>item.dispose());else material?.dispose()}})
      if(host.contains(renderer.domElement))host.removeChild(renderer.domElement)
      if(host.contains(rescueWorldPrompt))host.removeChild(rescueWorldPrompt)
    }
  },[round,networkSession,selectedVariant])

  const restart=()=>{const next=initialSeries();seriesRef.current=next;setSeries(next);setResult(null);setUi(value=>({...initialUi(),localTeam:value.localTeam,message:networkSession?'새 3판 2선승 경기를 서버에 요청했습니다…':'ROUND 1 · 먼저 2승을 확보하세요'}));if(networkSession&&networkClientRef.current){networkClientRef.current.send({type:'REMATCH'});return}setRound(value=>value+1)}
  const localCyan=ui.localTeam==='cyan'
  const selectedInfo=VARIANT_INFO[selectedVariant]
  const yourTeam=localCyan?{names:`${selectedInfo.name} · LUMI`,images:[selectedInfo.image,YELLOW]}:{names:`${selectedInfo.name} · VIO`,images:[selectedInfo.image,VIO]}
  const rivalTeam=localCyan?{names:'CORAL · VIO',images:[RED,VIO]}:{names:'BLOO · LUMI',images:[BLUE,YELLOW]}
  const winnerTeam=result==='win'?yourTeam:rivalTeam
  const yourWins=localCyan?series.scores.cyan:series.scores.coral,rivalWins=localCyan?series.scores.coral:series.scores.cyan,seriesFinished=!!series.winner
  const cooldownLabel=(ratio:number,ms:number)=>ratio>=.99?'READY':`${Math.max(.1,Number((((1-ratio)*ms)/1000).toFixed(1)))}초`
  return <main className="game">
    <div ref={hostRef} className="three-host"/>
    <header className="game-header"><button onClick={onExit}><ArrowLeft/> 나가기</button><div className="match-brand"><Mark/><span>ROCK SIZZLE PREPPERS<small>CORE SKIRMISH · 30 HZ SIM</small></span></div><button className={`sound ${muted?'muted':''}`} onClick={()=>setMuted(value=>!value)} aria-label={muted?'사운드 켜기':'사운드 끄기'}>{muted?<VolumeX/>:<Volume2/>}</button></header>
    <section className="score"><div className={`team you ${ui.localTeam}`}><span className="avatar-stack"><img src={yourTeam.images[0]}/><img src={yourTeam.images[1]}/></span><span>TEAM YOU<small>{yourTeam.names}</small></span><b>{ui.alliesAlive}</b></div><div className="match-clock"><small>ROUND {series.round} · FIRST TO 2</small><time>{String(Math.floor(ui.time/60)).padStart(2,'0')}:{String(ui.time%60).padStart(2,'0')}</time><span><b className={ui.localTeam}>{yourWins}</b><i>BO3</i><b className={localCyan?'coral':'cyan'}>{rivalWins}</b></span></div><div className={`team rival ${localCyan?'coral':'cyan'}`}><b>{ui.rivalsAlive}</b><span>RIVALS<small>{rivalTeam.names}</small></span><span className="avatar-stack"><img src={rivalTeam.images[0]}/><img src={rivalTeam.images[1]}/></span></div></section>
    <div className="message"><Sparkles/>{ui.message}</div>
    <div className="health-hud"><span>HP</span>{[...Array(ui.maxHealth)].map((_,index)=><Heart key={index} className={index<ui.health?'filled':'empty'}/>)}
      <b>{ui.health}/{ui.maxHealth}</b>
    </div>
    <aside className="status-panel"><span><Bot/> {networkSession?`ONLINE ${ui.onlineHumans}/4 · BOT FILL`:'3 BOT FILL · 2V2'}</span><span><Gauge/> 30 HZ LOGIC</span><span><Crosshair/> {debug?'DEBUG GRID + COLLIDERS':'HIDDEN GRID'}</span><span className={`fan-state ${ui.fan.toLowerCase()}`}><Wind/> FAN {ui.fan}</span>{ui.vehicle&&<span className="vehicle-state"><Zap/> TOY EXPRESS ACTIVE</span>}{debug&&<><span className="debug-stat">FPS {ui.fps} · {ui.frameMs} MS</span><span className="debug-stat">DRAW {ui.drawCalls} · TRIS {ui.triangles.toLocaleString()}</span><span className="debug-stat">TEX {ui.textures} · SIM BODIES {ui.simBodies}</span><span className="debug-stat">SERVER {ui.serverPos} · CLIENT {ui.clientPos}</span>{networkSession&&<><span className="debug-stat">RTT {ui.rtt} MS · RX {ui.packetRate}/S</span><span className="debug-stat">PENDING INPUT {ui.pendingInputs}</span></>}</>}</aside>
    <section className="ability-bar" aria-label="사용 가능한 스킬">
      <div className={`ability-slot ${ui.cores===0?'cooling':''}`} title="F · 에너지 코어 설치"><span className="skill-icon skill-core"/><p><b>에너지 코어</b><small>{ui.cores}/{ui.capacity} 준비</small></p><kbd>F</kbd></div>
      <div className={`ability-slot ${ui.jump<.99?'cooling':''}`} title="SPACE · 점프"><span className="skill-icon skill-jump"/><p><b>점프</b><small>{ui.jump>=.99?'준비':cooldownLabel(ui.jump,GAME_BALANCE.JUMP_COOLDOWN_MS)}</small></p><kbd>SPACE</kbd></div>
      <div className={`ability-slot ${ui.build<.99?'cooling':''}`} title="C · 블록 설치"><span className="skill-icon skill-build"/><p><b>블록 설치</b><small>{ui.build>=.99?'준비':cooldownLabel(ui.build,GAME_BALANCE.BUILD_COOLDOWN_MS)}</small></p><kbd>C</kbd></div>
      <div className={`ability-slot ${ui.dash<.99?'cooling':''}`} title="SHIFT · 대시"><span className="skill-icon skill-dash"/><p><b>대시</b><small>{ui.dash>=.99?'준비':cooldownLabel(ui.dash,GAME_BALANCE.DASH_COOLDOWN_MS)}</small></p><kbd>SHIFT</kbd></div>
      <div className={`ability-slot ${ui.taunt<.99?'cooling':''}`} title="T · 캐릭터 도발"><span className="skill-icon skill-taunt"/><p><b>도발</b><small>{ui.taunt>=.99?'준비':`재사용 ${cooldownLabel(ui.taunt,GAME_BALANCE.TAUNT_COOLDOWN_MS)}`}</small></p><kbd>T</kbd></div>
      {ui.canThrow&&<div className="ability-slot acquired" title="Q · 이동하던 방향으로 코어 투척"><span className="skill-icon skill-throw"/><p><b>코어 투척</b><small>LV.{ui.throwLevel} · {throwDistanceForLevel(ui.throwLevel)}칸</small></p><kbd>Q</kbd></div>}
      {(ui.chain>1||ui.pierceCharges>0)&&<strong>{ui.pierceCharges>0?`PIERCE ×${ui.pierceCharges}`:`CHAIN ×${ui.chain}`}</strong>}
    </section>
    <div className="controls">WASD 이동 <i/> SPACE 점프 <i/> F 코어 <i/> C 블록 <i/> SHIFT 대시 <i/> T 도발 {ui.canThrow&&<><i/> Q 투척</>}</div>
    {achievementToast&&<div className="achievement-toast" role="status"><img src={achievementToast.badge} alt=""/><div><span>BADGE UNLOCKED</span><b>{achievementToast.title}</b><small>{achievementToast.description}</small></div></div>}
    {ui.countdown>0&&<div className="match-countdown"><span>GET READY</span><strong>{ui.countdown}</strong><small>PREDICT · MANIPULATE · ESCAPE</small></div>}
    {result&&<div className="result-overlay"><div className={`result-panel ${result}`}><span>{seriesFinished?'BEST OF 3 COMPLETE':`ROUND ${series.round} COMPLETE`}</span><h1>{result==='draw'?'ROUND DRAW':seriesFinished?`${winnerTeam.names.replace(' · ',' & ')} SERIES WIN!`:result==='win'?'ROUND WON!':'ROUND LOST'}</h1><div className="series-result"><b>{yourWins}</b><i>FIRST TO 2</i><b>{rivalWins}</b></div><p>{seriesFinished?'2승을 먼저 확보해 최종 승리를 차지했습니다.':result==='draw'?'승수 변화 없이 같은 라운드를 다시 진행합니다.':`잠시 후 ROUND ${Math.min(3,series.round+1)}가 자동으로 시작됩니다.`}</p>{seriesFinished&&<div><button onClick={restart}><RotateCcw/> 새 3판 시작</button><button onClick={onExit}>로비로</button></div>}</div></div>}
  </main>
}
