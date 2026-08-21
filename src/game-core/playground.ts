import type { GridCell } from './grid'

export type PlaygroundPlatform={
  id:string;x:number;z:number;width:number;depth:number;height:number;color:string;accent:string
}

export type PlaygroundRamp={
  id:string;x:number;z:number;width:number;depth:number;height:number;axis:'x'|'z';highAt:'min'|'max';color:string
}

export type PlaygroundRoller={
  id:string;x:number;z:number;length:number;radius:number;pushX:number;pushZ:number;color:string;phase:number
}

export type PlaygroundStaticCollider=
  | {id:string;shape:'circle';x:number;z:number;radius:number;topY:number}
  | {id:string;shape:'rect';x:number;z:number;width:number;depth:number;topY:number}

export const PLAYGROUND_PLATFORMS:ReadonlyArray<PlaygroundPlatform>=[
  {id:'cyan-deck',x:-16,z:0,width:4,depth:8,height:.92,color:'#267ec3',accent:'#45c4dc'},
  {id:'coral-deck',x:16,z:0,width:4,depth:8,height:.92,color:'#e86861',accent:'#f09b69'},
  {id:'slide-deck',x:0,z:-10.25,width:8,depth:3.5,height:1.28,color:'#7a58c8',accent:'#ffbe54'},
  {id:'rainbow-bridge',x:0,z:7.25,width:5,depth:3.1,height:.68,color:'#2f84c5',accent:'#ffca51'},
  {id:'step-a',x:8,z:6.1,width:1.7,depth:1.7,height:.28,color:'#f39a43',accent:'#ffd56e'},
  {id:'step-b',x:10.2,z:6.1,width:1.7,depth:1.7,height:.38,color:'#4aaed8',accent:'#8ef2ff'},
  {id:'step-c',x:12.4,z:6.1,width:1.7,depth:1.7,height:.28,color:'#9ecb4b',accent:'#e5ff7b'},
  {id:'step-d',x:12.4,z:3.9,width:1.7,depth:1.7,height:.4,color:'#f3b53f',accent:'#fff08a'},
  {id:'step-e',x:10.2,z:3.9,width:1.7,depth:1.7,height:.3,color:'#755ed0',accent:'#cbbaff'},
  {id:'step-f',x:8,z:3.9,width:1.7,depth:1.7,height:.38,color:'#ed6b58',accent:'#ffb48e'},
]

export const PLAYGROUND_RAMPS:ReadonlyArray<PlaygroundRamp>=[
  {id:'cyan-ramp',x:-13,z:0,width:2,depth:3.4,height:.92,axis:'x',highAt:'min',color:'#36a6d0'},
  {id:'coral-ramp',x:13,z:0,width:2,depth:3.4,height:.92,axis:'x',highAt:'max',color:'#ee7d62'},
  {id:'slide-ramp-left',x:-1.3,z:-7.25,width:1.15,depth:2.5,height:1.28,axis:'z',highAt:'min',color:'#f2a83f'},
  {id:'slide-ramp-right',x:0,z:-7.25,width:1.15,depth:2.5,height:1.28,axis:'z',highAt:'min',color:'#3d9fd5'},
  {id:'stair-ramp',x:1.45,z:-7.25,width:1.35,depth:2.5,height:1.28,axis:'z',highAt:'min',color:'#e86661'},
  {id:'bridge-west',x:-4.25,z:7.25,width:3.5,depth:3.1,height:.68,axis:'x',highAt:'max',color:'#44a9d4'},
  {id:'bridge-east',x:4.25,z:7.25,width:3.5,depth:3.1,height:.68,axis:'x',highAt:'min',color:'#44a9d4'},
]

export const BALL_PIT={x:-9.25,z:-8.3,width:6.5,depth:5.1,slowMultiplier:.56} as const
export const BALL_PIT_STEPS=[
  {id:'pit-step-orange',x:-11,z:-9.3,radius:.82,height:.62,color:'#f68a43'},
  {id:'pit-step-lime',x:-9.4,z:-7.8,radius:.82,height:.62,color:'#8fc851'},
  {id:'pit-step-blue',x:-7.7,z:-9.1,radius:.82,height:.62,color:'#4baed9'},
  {id:'pit-step-gold',x:-6.8,z:-6.8,radius:.82,height:.62,color:'#f1b44d'},
] as const
export const SPINNER={x:0,z:0,radius:3.15,armWidth:.46,angularSpeed:1.38} as const
export const JUMP_PADS=[
  {id:'jump-cyan',x:-7,z:-4.8,radius:1.05,color:'#62d8e8'},
  {id:'jump-coral',x:7,z:-4.8,radius:1.05,color:'#ff8c65'},
  {id:'deck-trampoline-left',x:-1.65,z:-10.25,radius:1.0,color:'#ff8ab6'},
  {id:'deck-trampoline-right',x:1.65,z:-10.25,radius:1.0,color:'#6ddcf4'},
] as const
export const PLAYGROUND_ROLLERS:ReadonlyArray<PlaygroundRoller>=[
  {id:'roller-orange',x:-9,z:5.25,length:2.25,radius:.62,pushX:0,pushZ:-1.15,color:'#ee7f38',phase:0},
  {id:'roller-lime',x:-6.2,z:5.25,length:2.25,radius:.62,pushX:0,pushZ:1.05,color:'#9cbd3d',phase:1.2},
  {id:'roller-blue',x:-3.4,z:5.25,length:2.25,radius:.62,pushX:0,pushZ:-1.2,color:'#3f9fd5',phase:2.4},
]
export const TUBE={x:7.25,z:-8.6,length:5.2,radius:1.05} as const

export const PLAYGROUND_STATIC_COLLIDERS:ReadonlyArray<PlaygroundStaticCollider>=[
  ...PLAYGROUND_PLATFORMS.flatMap((platform):PlaygroundStaticCollider[]=>[[-1,-1],[-1,1],[1,-1],[1,1]].map(([sideX,sideZ],index)=>({id:`${platform.id}-corner-${index+1}`,shape:'circle',x:platform.x+sideX*platform.width*.5,z:platform.z+sideZ*platform.depth*.5,radius:.18,topY:platform.height+.22}))),
  ...PLAYGROUND_RAMPS.filter(ramp=>ramp.id.startsWith('slide-ramp')||ramp.id==='stair-ramp').flatMap((ramp):PlaygroundStaticCollider[]=>{
    const topY=ramp.height+.24
    return ramp.axis==='x'
      ? [-1,1].map((side,index)=>({id:`${ramp.id}-rail-${index+1}`,shape:'rect',x:ramp.x,z:ramp.z+side*ramp.depth*.5,width:ramp.width+.12,depth:.18,topY}))
      : [-1,1].map((side,index)=>({id:`${ramp.id}-rail-${index+1}`,shape:'rect',x:ramp.x+side*ramp.width*.5,z:ramp.z,width:.18,depth:ramp.depth+.12,topY}))
  }),
  {id:'spinner-hub',shape:'circle',x:SPINNER.x,z:SPINNER.z,radius:.72,topY:1.36},
  {id:'ball-pit-north-rail',shape:'rect',x:BALL_PIT.x,z:BALL_PIT.z-BALL_PIT.depth*.5,width:BALL_PIT.width+.5,depth:.42,topY:.8},
  {id:'ball-pit-south-rail',shape:'rect',x:BALL_PIT.x,z:BALL_PIT.z+BALL_PIT.depth*.5,width:BALL_PIT.width+.5,depth:.42,topY:.8},
  {id:'ball-pit-west-rail',shape:'rect',x:BALL_PIT.x-BALL_PIT.width*.5,z:BALL_PIT.z,width:.42,depth:BALL_PIT.depth+.4,topY:.8},
  {id:'ball-pit-east-rail',shape:'rect',x:BALL_PIT.x+BALL_PIT.width*.5,z:BALL_PIT.z,width:.42,depth:BALL_PIT.depth+.4,topY:.8},
  {id:'tube-north-wall',shape:'rect',x:TUBE.x,z:TUBE.z-TUBE.radius,width:TUBE.length+.2,depth:.24,topY:TUBE.radius*2.05},
  {id:'tube-south-wall',shape:'rect',x:TUBE.x,z:TUBE.z+TUBE.radius,width:TUBE.length+.2,depth:.24,topY:TUBE.radius*2.05},
  {id:'cyan-arch-north-pillar',shape:'circle',x:-17.2,z:-3.2,radius:.35,topY:3},
  {id:'cyan-arch-south-pillar',shape:'circle',x:-17.2,z:3.2,radius:.35,topY:3},
  {id:'coral-arch-north-pillar',shape:'circle',x:17.2,z:-3.2,radius:.35,topY:3},
  {id:'coral-arch-south-pillar',shape:'circle',x:17.2,z:3.2,radius:.35,topY:3},
]

const insideRect=(x:number,z:number,rect:{x:number;z:number;width:number;depth:number})=>Math.abs(x-rect.x)<=rect.width*.5&&Math.abs(z-rect.z)<=rect.depth*.5

export const staticPlaygroundCollisionAt=(x:number,z:number,feetY:number,bodyRadius=.38)=>PLAYGROUND_STATIC_COLLIDERS.find(collider=>{
  if(feetY>=collider.topY-.04)return false
  if(collider.shape==='circle')return Math.hypot(x-collider.x,z-collider.z)<collider.radius+bodyRadius
  return Math.abs(x-collider.x)<collider.width*.5+bodyRadius&&Math.abs(z-collider.z)<collider.depth*.5+bodyRadius
})??null

export const terrainHeightAt=(x:number,z:number)=>{
  let height=0
  for(const platform of PLAYGROUND_PLATFORMS)if(insideRect(x,z,platform))height=Math.max(height,platform.height)
  for(const ramp of PLAYGROUND_RAMPS){
    if(!insideRect(x,z,ramp))continue
    const span=ramp.axis==='x'?ramp.width:ramp.depth
    const coordinate=ramp.axis==='x'?x-ramp.x:z-ramp.z
    const normalized=Math.max(0,Math.min(1,coordinate/span+.5))
    const ratio=ramp.highAt==='max'?normalized:1-normalized
    height=Math.max(height,ramp.height*ratio)
  }
  for(const step of BALL_PIT_STEPS)if(Math.hypot(x-step.x,z-step.z)<=step.radius)height=Math.max(height,step.height)
  return height
}

export const movementMultiplierAt=(x:number,z:number)=>insideRect(x,z,BALL_PIT)&&!BALL_PIT_STEPS.some(step=>Math.hypot(x-step.x,z-step.z)<=step.radius)?BALL_PIT.slowMultiplier:1

export const slidePushAt=(x:number,z:number)=>{
  const slide=PLAYGROUND_RAMPS.find(ramp=>ramp.id.startsWith('slide-ramp')&&insideRect(x,z,ramp))
  return slide?{x:0,z:1.35}:null
}

export const jumpPadAt=(x:number,z:number)=>JUMP_PADS.find(pad=>Math.hypot(x-pad.x,z-pad.z)<=pad.radius)

export const rollerPushAt=(x:number,z:number)=>{
  for(const roller of PLAYGROUND_ROLLERS)if(Math.abs(x-roller.x)<=roller.length*.5&&Math.abs(z-roller.z)<=roller.radius+.38)return{x:roller.pushX,z:roller.pushZ}
  return null
}

const armPush=(x:number,z:number,angle:number)=>{
  const dx=x-SPINNER.x,dz=z-SPINNER.z,c=Math.cos(angle),s=Math.sin(angle)
  const along=dx*c+dz*s,perpendicular=-dx*s+dz*c
  if(Math.abs(along)>SPINNER.radius||Math.abs(perpendicular)>SPINNER.armWidth+.38)return null
  // Three.js positive Y rotation moves the +X end toward -Z. The opposite
  // end must therefore receive the exact opposite tangential impulse.
  const armEnd=Math.abs(along)>.05?Math.sign(along):1
  const pushX=s*armEnd,pushZ=-c*armEnd
  return{x:Math.abs(pushX)<1e-9?0:pushX,z:Math.abs(pushZ)<1e-9?0:pushZ}
}

export const spinnerPushAt=(x:number,z:number,elapsed:number)=>{
  const visualAngle=-elapsed*SPINNER.angularSpeed
  return armPush(x,z,visualAngle)??armPush(x,z,visualAngle+Math.PI*.5)
}

export const movingHazardPushAt=(x:number,z:number,elapsed:number)=>spinnerPushAt(x,z,elapsed)??rollerPushAt(x,z)??slidePushAt(x,z)

export const isProtectedFloorAt=(cell:GridCell)=>{
  const {x,z}=cell
  if(terrainHeightAt(x,z)>.01||insideRect(x,z,BALL_PIT))return true
  if(Math.hypot(x-SPINNER.x,z-SPINNER.z)<1.25)return true
  if(JUMP_PADS.some(pad=>Math.hypot(x-pad.x,z-pad.z)<=pad.radius+.25))return true
  if(Math.abs(x-TUBE.x)<=TUBE.length*.5+.5&&Math.abs(z-TUBE.z)<=TUBE.radius+.45)return true
  return false
}
