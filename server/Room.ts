import { GIANT_PLAYROOM } from '../src/game-core/arena'
import { GAME_BALANCE } from '../src/game-core/config'
import { blastHitWalls } from '../src/game-core/destruction'
import { cellKey, isCellBlocked, traceExplosion, worldToGrid } from '../src/game-core/grid'
import { itemForRoll, kickDistanceForLevel, piercingFloorCells, stackItemEffect, throwDistanceForLevel, tracePiercingExplosion } from '../src/game-core/powerups'
import type { ItemKind, NetworkCore, NetworkItem, NetworkPlayer, RippleVariant, RoomSnapshot, Team } from '../src/game-core/protocol'
import { matchWinner } from '../src/game-core/rules'
import { fanStateAt, vehicleStateAt } from '../src/game-core/timeline'

type InputState={dx:number;dz:number;seq:number}
type PlayerState=NetworkPlayer&{input:InputState;dashReady:number;nextAction:number;jumpStarted:number;jumpUntil:number;jumpReady:number;jumpBaseY:number;fallVelocity:number}
type CoreState=NetworkCore&{fuse:number;chain:number}

export class Room{
  readonly players=new Map<string,PlayerState>()
  readonly cores=new Map<string,CoreState>()
  readonly items=new Map<string,NetworkItem>()
  readonly holes=new Set<string>()
  readonly events:Array<{event:string;actorId?:string;targetId?:string;coreId?:string;itemId?:string;kind?:ItemKind;x?:number;y?:number;z?:number;team?:Team;chain?:number;piercing?:boolean;damage?:number;hits?:number;remainingHits?:number;maxHits?:number}>=[]
  readonly arena={...GIANT_PLAYROOM,walls:new Set(GIANT_PLAYROOM.walls)}
  readonly destroyedWalls=new Set<string>()
  tick=0
  startedAt:number
  winner:Team|'draw'|null=null
  round=1
  scores:Record<Team,number>={cyan:0,coral:0}
  seriesWinner:Team|null=null
  private lastHumanJoin:number
  private roundEndedAt=0
  private lastFanPush=0
  private lastVehicleCell=-99
  private coreId=0
  private botId=0
  private itemId=0
  private startedEventSent=false

  constructor(readonly id:string,now=Date.now(),private readonly random:()=>number=Math.random){this.startedAt=now;this.lastHumanJoin=now}

  join(id:string,name:string,now=Date.now(),variant:RippleVariant='bloo'){
    if(![...this.players.values()].some(player=>!player.bot)){
      this.players.clear();this.cores.clear();this.items.clear();this.events.length=0;this.tick=0;this.startedAt=now;this.winner=null;this.round=1;this.scores={cyan:0,coral:0};this.seriesWinner=null;this.roundEndedAt=0;this.lastFanPush=0;this.lastVehicleCell=-99;this.startedEventSent=false;this.resetArena()
    }
    const occupied=new Set([...this.players.values()].map(player=>player.slot))
    let slot=[0,1,2,3].find(index=>!occupied.has(index))
    if(slot===undefined){const replaceable=[...this.players.values()].filter(player=>player.bot).sort((a,b)=>a.slot-b.slot)[0];if(replaceable){slot=replaceable.slot;this.leave(replaceable.id)}}
    if(slot===undefined)throw new Error('ROOM_FULL')
    const spawn=GIANT_PLAYROOM.spawnPoints[slot],team:Team=slot<2?'cyan':'coral',yaw=team==='cyan'?Math.PI/2:-Math.PI/2
    const selectedVariant:RippleVariant=['bloo','lumi','coral','vio'].includes(variant)?variant:'bloo'
    const player:PlayerState={id,name:name.slice(0,16)||`RIPPLE-${slot+1}`,slot,bot:false,team,variant:selectedVariant,x:spawn.x,z:spawn.z,yaw,hits:0,bombCapacity:GAME_BALANCE.CORE_CAPACITY,canKick:false,canThrow:false,kickLevel:0,throwLevel:0,pierceCharges:0,jumpY:0,jumpReady:0,buildReady:0,falling:false,downedUntil:0,eliminated:false,lastInput:0,input:{dx:0,dz:0,seq:0},dashReady:0,nextAction:0,jumpStarted:0,jumpUntil:0,jumpBaseY:0,fallVelocity:0}
    this.lastHumanJoin=now
    this.players.set(id,player);this.events.push({event:'PLAYER_JOINED',actorId:id});return player
  }

  leave(id:string){
    this.players.delete(id);for(const [coreId,core] of this.cores)if(core.owner===id)this.cores.delete(coreId);this.events.push({event:'PLAYER_LEFT',actorId:id})
    if(![...this.players.values()].some(player=>!player.bot)){this.players.clear();this.cores.clear();this.items.clear();this.events.length=0;this.tick=0;this.startedAt=Date.now();this.winner=null;this.round=1;this.scores={cyan:0,coral:0};this.seriesWinner=null;this.roundEndedAt=0;this.lastHumanJoin=Date.now();this.startedEventSent=false;this.lastVehicleCell=-99;this.resetArena()}
  }

  input(id:string,seq:number,dx:number,dz:number){
    const player=this.players.get(id);if(!player||seq<=player.input.seq)return
    const length=Math.hypot(dx,dz)||1;player.input={dx:Math.max(-1,Math.min(1,dx/length)),dz:Math.max(-1,Math.min(1,dz/length)),seq};player.lastInput=seq
  }

  action(id:string,action:'PLACE'|'DASH'|'KICK'|'THROW'|'RESCUE'|'JUMP'|'BUILD',direction:{x:number;z:number},now=Date.now()){
    const player=this.players.get(id);if(!player||this.winner||player.eliminated||player.falling||player.downedUntil||now<this.playAt())return false
    const cardinal=Math.abs(direction.x)>=Math.abs(direction.z)?{x:Math.sign(direction.x)||1,z:0}:{x:0,z:Math.sign(direction.z)||1}
    if(action==='PLACE')return this.placeCore(player)
    if(action==='JUMP'){
      if(now<player.jumpUntil||now<player.jumpReady)return false
      player.jumpBaseY=player.jumpY;player.jumpStarted=now;player.jumpUntil=now+GAME_BALANCE.JUMP_DURATION_MS;player.jumpReady=now+GAME_BALANCE.JUMP_COOLDOWN_MS;player.fallVelocity=0;this.events.push({event:'PLAYER_JUMPED',actorId:id});return true
    }
    if(action==='BUILD'){
      if(now<player.buildReady)return false
      const cell=worldToGrid({x:player.x+cardinal.x*1.05,z:player.z+cardinal.z*1.05}),key=cellKey(cell)
      if(Math.abs(cell.x)>this.arena.halfX||Math.abs(cell.z)>this.arena.halfZ||this.arena.walls.has(key)||this.holes.has(key)||this.coreAt(cell.x,cell.z)||[...this.players.values()].some(other=>!other.eliminated&&Math.hypot(other.x-cell.x,other.z-cell.z)<.72))return false
      this.arena.walls.add(key);this.destroyedWalls.delete(key);player.yaw=Math.atan2(cardinal.x,cardinal.z);player.buildReady=now+GAME_BALANCE.BUILD_COOLDOWN_MS;this.events.push({event:'WALL_BUILT',actorId:id,x:cell.x,z:cell.z});return true
    }
    if(action==='DASH'){
      if(now<player.dashReady)return false
      player.yaw=Math.atan2(cardinal.x,cardinal.z)
      player.dashReady=now+GAME_BALANCE.DASH_COOLDOWN_MS
      const steps=12,step=GAME_BALANCE.DASH_DISTANCE/steps
      for(let index=0;index<steps;index++){
        const x=player.x+cardinal.x*step,z=player.z+cardinal.z*step
        if(!this.canOccupy(player,x,z,this.jumpHeightAt(player,now,x,z)))break
        player.x=x;player.z=z
      }
      this.events.push({event:'PLAYER_DASHED',actorId:id});return true
    }
    if(action==='RESCUE'){
      const target=[...this.players.values()].filter(other=>other.team===player.team&&other.id!==id&&other.downedUntil&&!other.eliminated).sort((a,b)=>Math.hypot(a.x-player.x,a.z-player.z)-Math.hypot(b.x-player.x,b.z-player.z))[0]
      if(!target||Math.hypot(target.x-player.x,target.z-player.z)>1.45)return false
      target.hits=2;target.downedUntil=0;player.yaw=Math.atan2(target.x-player.x,target.z-player.z);this.events.push({event:'PLAYER_RESCUED',actorId:id,targetId:target.id});return true
    }
    const nearest=[...this.cores.values()].map(core=>({core,distance:Math.hypot(core.x-player.x,core.z-player.z)})).sort((a,b)=>a.distance-b.distance)[0]
    if(!nearest||nearest.distance>1.65)return false
    if(action==='KICK'){
      if(!player.canKick)return false
      if(!this.moveCoreThroughObstacles(player,nearest.core,cardinal,kickDistanceForLevel(player.kickLevel)))return false
      player.yaw=Math.atan2(cardinal.x,cardinal.z);this.events.push({event:'CORE_KICKED',actorId:id,coreId:nearest.core.id});return true
    }
    if(!player.canThrow)return false
    const throwRange=throwDistanceForLevel(player.throwLevel)
    if(!this.moveCoreThroughObstacles(player,nearest.core,cardinal,throwRange))return false
    player.yaw=Math.atan2(cardinal.x,cardinal.z);this.events.push({event:'CORE_THROWN',actorId:id,coreId:nearest.core.id});return true
  }

  rematch(id:string,now=Date.now()){
    const requester=this.players.get(id)
    if(!requester||requester.bot||!this.seriesWinner)return false
    this.round=1;this.scores={cyan:0,coral:0};this.seriesWinner=null;this.resetRound(now)
    this.events.push({event:'MATCH_RESTARTED',actorId:id});return true
  }

  step(dt:number,now=Date.now()){
    if(![...this.players.values()].some(player=>!player.bot))return
    this.fillBots(now)
    this.tick++
    if(this.winner){if(!this.seriesWinner&&now-this.roundEndedAt>=GAME_BALANCE.ROUND_BREAK_MS)this.advanceRound(now);return}
    if(now<this.playAt())return
    if(!this.startedEventSent){this.startedEventSent=true;this.events.push({event:'MATCH_STARTED'})}
    const elapsed=(now-this.playAt())/1000,fan=fanStateAt(elapsed)
    const danger=[...this.cores.values()].filter(core=>core.fuse<1.1).flatMap(core=>traceExplosion(this.arena,core,GAME_BALANCE.CORE_RANGE))
    for(const brain of this.players.values()){
      if(!brain.bot||brain.eliminated||brain.falling||brain.downedUntil)continue
      const ally=[...this.players.values()].filter(player=>player.team===brain.team&&player.id!==brain.id&&player.downedUntil&&!player.eliminated).sort((a,b)=>Math.hypot(a.x-brain.x,a.z-brain.z)-Math.hypot(b.x-brain.x,b.z-brain.z))[0]
      const enemy=[...this.players.values()].filter(player=>player.team!==brain.team&&!player.eliminated).sort((a,b)=>Math.hypot(a.x-brain.x,a.z-brain.z)-Math.hypot(b.x-brain.x,b.z-brain.z))[0]
      const target=ally??enemy;if(!target)continue
      let dx=target.x-brain.x,dz=target.z-brain.z
      const inDanger=danger.some(cell=>Math.abs(cell.x-brain.x)<.8&&Math.abs(cell.z-brain.z)<.8)
      if(inDanger){dx=-dx;dz=-dz}
      const length=Math.hypot(dx,dz)||1;brain.input={dx:dx/length,dz:dz/length,seq:brain.input.seq+1}
      if(ally&&Math.hypot(ally.x-brain.x,ally.z-brain.z)<1.45)this.action(brain.id,'RESCUE',{x:dx,z:dz},now)
      if(inDanger&&now>=brain.dashReady)this.action(brain.id,'DASH',{x:dx,z:dz},now)
      if(!ally&&now>=brain.nextAction&&Math.hypot(target.x-brain.x,target.z-brain.z)<7.5){
        brain.nextAction=now+2200+brain.slot*170
        const nearCore=[...this.cores.values()].some(core=>Math.hypot(core.x-brain.x,core.z-brain.z)<1.65)
        if(nearCore)this.action(brain.id,(this.tick+brain.slot)%3?'KICK':'THROW',{x:target.x-brain.x,z:target.z-brain.z},now)
        else this.placeCore(brain)
      }
    }
    const movementSampleTime=now+dt*1000*0.5
    for(const player of this.players.values()){
      if(player.eliminated)continue
      if(player.falling){
        player.fallVelocity+=GAME_BALANCE.FALL_GRAVITY*dt;player.jumpY-=player.fallVelocity*dt
        if(player.jumpY<=GAME_BALANCE.FALL_DEATH_Y){player.eliminated=true;player.falling=false;player.downedUntil=0;this.events.push({event:'PLAYER_FELL',actorId:player.id,x:player.x,y:player.jumpY,z:player.z})}
        continue
      }
      if(movementSampleTime<player.jumpUntil){
        player.fallVelocity=0
        player.jumpY=this.jumpHeightAt(player,movementSampleTime,player.x,player.z)
      }else{
        const support=this.supportHeightAt(player.x,player.z)
        if(support>0&&player.jumpY>=support-.01){player.jumpY=support;player.fallVelocity=0}
        else if(player.jumpY>support){
          player.fallVelocity+=GAME_BALANCE.FALL_GRAVITY*dt
          player.jumpY=Math.max(support,player.jumpY-player.fallVelocity*dt)
          if(player.jumpY===support)player.fallVelocity=0
        }else{player.jumpY=support;player.fallVelocity=0}
      }
      if(player.downedUntil&&now>=player.downedUntil){player.eliminated=true;player.downedUntil=0;this.events.push({event:'PLAYER_ELIMINATED',actorId:player.id});continue}
      if(player.downedUntil)continue
      const movementStartX=player.x,movementStartZ=player.z
      const speed=GAME_BALANCE.PLAYER_SPEED*dt,nx=player.x+player.input.dx*speed,nz=player.z+player.input.dz*speed
      const occupancyJumpYFor=(x:number,z:number)=>this.jumpHeightAt(player,movementSampleTime,x,z)
      if(this.canOccupy(player,nx,player.z,occupancyJumpYFor(nx,player.z))){player.x=Math.max(-GIANT_PLAYROOM.halfX-.28,Math.min(GIANT_PLAYROOM.halfX+.28,nx))}
      if(this.canOccupy(player,player.x,nz,occupancyJumpYFor(player.x,nz))){player.z=Math.max(-GIANT_PLAYROOM.halfZ-.28,Math.min(GIANT_PLAYROOM.halfZ+.28,nz))}
      const movedX=player.x-movementStartX,movedZ=player.z-movementStartZ
      if(Math.hypot(movedX,movedZ)>.0001)player.yaw=Math.atan2(movedX,movedZ)
      if(fan==='ACTIVE'){
        const windX=player.x-1.05*dt
        if(this.canOccupy(player,windX,player.z,occupancyJumpYFor(windX,player.z)))player.x=Math.max(-GIANT_PLAYROOM.halfX-.28,windX)
      }
      const key=cellKey(worldToGrid(player))
      if(this.holes.has(key)&&player.jumpY<.12){player.falling=true;player.fallVelocity=0;player.jumpUntil=0;player.input={dx:0,dz:0,seq:player.input.seq};this.events.push({event:'PLAYER_FALLING',actorId:player.id,x:player.x,y:player.jumpY,z:player.z});continue}
      for(const item of this.items.values())if(Math.hypot(item.x-player.x,item.z-player.z)<=GAME_BALANCE.ITEM_PICKUP_RADIUS){this.collectItem(player,item);break}
    }
    if(fan==='ACTIVE'&&now-this.lastFanPush>650){
      this.lastFanPush=now
      for(const core of [...this.cores.values()].sort((a,b)=>a.x-b.x)){const x=core.x-1;if(!isCellBlocked(this.arena,{x,z:core.z})&&!this.coreAt(x,core.z,core.id)){core.x=x;core.y=0}}
    }
    const vehicle=vehicleStateAt(elapsed)
    if(vehicle.active){
      const vehicleCell=Math.round(vehicle.x)
      if(vehicleCell!==this.lastVehicleCell){
        this.lastVehicleCell=vehicleCell
        for(const core of [...this.cores.values()].filter(core=>Math.abs(core.x-vehicle.x)<.8&&Math.abs(core.z-vehicle.z)<.7)){
          const x=core.x+1;if(!isCellBlocked(this.arena,{x,z:core.z})&&!this.coreAt(x,core.z,core.id)){core.x=x;core.y=0;this.events.push({event:'VEHICLE_CORE_PUSH',coreId:core.id,x:core.x,y:core.y,z:core.z})}
        }
        for(const player of this.players.values())if(!player.eliminated&&!player.falling&&Math.abs(player.x-vehicle.x)<.78&&Math.abs(player.z-vehicle.z)<.72){this.knockback(player,vehicle.x-1,vehicle.z);this.events.push({event:'VEHICLE_PLAYER_PUSH',targetId:player.id,x:player.x,z:player.z})}
      }
    }else this.lastVehicleCell=-99
    for(const core of this.cores.values())core.fuse-=dt
    const exploding=[...this.cores.values()].filter(core=>core.fuse<=0)
    for(const core of exploding)this.explode(core,now)
    const cyanAlive=[...this.players.values()].some(player=>player.team==='cyan'&&!player.eliminated),coralAlive=[...this.players.values()].some(player=>player.team==='coral'&&!player.eliminated)
    if(elapsed>=GAME_BALANCE.MATCH_SECONDS||((!cyanAlive||!coralAlive)&&this.players.size===4)){
      this.finishRound(matchWinner([...this.players.values()].map(player=>({team:player.team,hits:player.hits,eliminated:player.eliminated}))),now)
    }
  }

  snapshot(now=Date.now()):RoomSnapshot{
    const countdown=Math.max(0,Math.ceil((this.playAt()-now)/1000)),elapsed=Math.max(0,(now-this.playAt())/1000)
    return {roomId:this.id,tick:this.tick,serverTime:now,phase:this.seriesWinner?'ENDED':this.winner?'ROUND_ENDED':countdown?'COUNTDOWN':'PLAYING',round:this.round,scores:{...this.scores},roundWinner:this.winner,countdown,remaining:Math.max(0,GAME_BALANCE.MATCH_SECONDS-elapsed),fan:fanStateAt(elapsed),vehicle:vehicleStateAt(elapsed),ended:!!this.seriesWinner,winner:this.seriesWinner,players:[...this.players.values()].map(({input,dashReady,nextAction,jumpStarted,jumpUntil,jumpBaseY,fallVelocity,...player})=>player),cores:[...this.cores.values()].map(core=>({...core})),items:[...this.items.values()],holes:[...this.holes],walls:[...this.arena.walls],destroyedWalls:[...this.destroyedWalls]}
  }

  private finishRound(winner:Team|'draw',now:number){
    this.winner=winner;this.roundEndedAt=now
    if(winner!=='draw'){
      this.scores[winner]++
      if(this.scores[winner]>=GAME_BALANCE.SERIES_WINS)this.seriesWinner=winner
    }
    this.events.push({event:'ROUND_ENDED',team:winner==='draw'?undefined:winner})
    if(this.seriesWinner)this.events.push({event:'MATCH_ENDED',team:this.seriesWinner})
  }
  private advanceRound(now:number){
    if(this.winner!=='draw')this.round++
    this.resetRound(now);this.events.push({event:'ROUND_STARTED'})
  }
  private resetRound(now:number){
    this.cores.clear();this.items.clear();this.winner=null;this.roundEndedAt=0;this.startedAt=now;this.tick=0;this.lastFanPush=0;this.lastVehicleCell=-99;this.lastHumanJoin=now;this.startedEventSent=false;this.resetArena()
    for(const player of this.players.values()){
      const spawn=GIANT_PLAYROOM.spawnPoints[player.slot]
      player.x=spawn.x;player.z=spawn.z;player.yaw=player.team==='cyan'?Math.PI/2:-Math.PI/2;player.hits=0;player.bombCapacity=GAME_BALANCE.CORE_CAPACITY;player.canKick=false;player.canThrow=false;player.kickLevel=0;player.throwLevel=0;player.pierceCharges=0;player.jumpY=0;player.jumpReady=0;player.jumpStarted=0;player.jumpUntil=0;player.jumpBaseY=0;player.buildReady=0;player.falling=false;player.fallVelocity=0;player.downedUntil=0;player.eliminated=false;player.dashReady=0;player.nextAction=now+800+player.slot*350
      player.input={dx:0,dz:0,seq:player.input.seq};player.lastInput=player.input.seq
    }
    this.events.length=0
  }

  private playAt(){return this.startedAt+GAME_BALANCE.COUNTDOWN_SECONDS*1000}
  private jumpHeightAt(player:PlayerState,now:number,x: number=player.x,z: number=player.z){
    const support=this.supportHeightAt(x,z)
    if(now<player.jumpUntil){
      const progress=Math.max(0,Math.min(1,(now-player.jumpStarted)/GAME_BALANCE.JUMP_DURATION_MS))
      const airborneHeight=player.jumpBaseY+Math.sin(progress*Math.PI)*GAME_BALANCE.JUMP_HEIGHT
      const reachedObstacleTop=player.jumpY>=support-.01||airborneHeight>=support-.01
      return support>0&&reachedObstacleTop?Math.max(airborneHeight,support):airborneHeight
    }
    return support>0&&player.jumpY>=support-.01?support:player.jumpY
  }
  private canOccupy(player:PlayerState,x:number,z:number,jumpY:number=player.jumpY){
    const cell=worldToGrid({x,z})
    if(Math.abs(cell.x)>this.arena.halfX||Math.abs(cell.z)>this.arena.halfZ)return false
    if(this.arena.walls.has(cellKey(cell))&&jumpY<GAME_BALANCE.OBSTACLE_TOP_Y-.01)return false
    return ![...this.players.values()].some(other=>other.id!==player.id&&!other.eliminated&&!other.falling&&Math.hypot(other.x-x,other.z-z)<GAME_BALANCE.PLAYER_RADIUS*2)
  }
  private moveCoreThroughObstacles(player:PlayerState,core:CoreState,direction:{x:number;z:number},steps:number){
    let moved=false,x=core.x,z=core.z
    for(let step=0;step<steps;step++){
      const nextX=x+direction.x,nextZ=z+direction.z
      if(Math.abs(nextX)>this.arena.halfX||Math.abs(nextZ)>this.arena.halfZ)break
      if(this.coreAt(nextX,nextZ,core.id))break
      if(this.arena.walls.has(cellKey({x:nextX,z:nextZ}))){
        if(!this.destroyObstacle(player,nextX,nextZ))break
        x=nextX;z=nextZ;moved=true
        continue
      }
      x=nextX;z=nextZ;moved=true
    }
    if(!moved)return false
    core.x=x;core.z=z;core.y=0
    return true
  }
  private destroyObstacle(player:PlayerState,x:number,z:number){
    const key=cellKey({x,z})
    if(!this.arena.walls.has(key))return false
    this.arena.walls.delete(key)
    this.destroyedWalls.add(key)
    this.events.push({event:'OBJECT_DESTROYED',actorId:player.id,x,z,team:player.team})
    this.spawnItem(x,z)
    return true
  }
  private supportHeightAt(x:number,z:number){return this.arena.walls.has(cellKey(worldToGrid({x,z})))?GAME_BALANCE.OBSTACLE_TOP_Y:0}
  private knockback(player:PlayerState,originX:number,originZ:number){
    let dx=player.x-originX,dz=player.z-originZ,length=Math.hypot(dx,dz)
    if(length<.05){dx=player.slot%2?-1:1;dz=player.slot<2?-1:1;length=Math.hypot(dx,dz)}
    dx/=length;dz/=length
    const steps=8,distance=GAME_BALANCE.KNOCKBACK_DISTANCE/steps
    for(let index=0;index<steps;index++){
      const x=player.x+dx*distance,z=player.z+dz*distance
      if(!this.canOccupy(player,x,z))break
      player.x=x;player.z=z
    }
    this.events.push({event:'PLAYER_KNOCKED',targetId:player.id,x:player.x,z:player.z})
  }
  private coreAt(x:number,z:number,exclude=''){return [...this.cores.values()].some(core=>core.id!==exclude&&core.x===x&&core.z===z)}

  private fillBots(now:number){
    if(![...this.players.values()].some(player=>!player.bot))return
    if(now-this.lastHumanJoin<900)return
    const names=['BLOO BOT','LUMI BOT','CORAL BOT','VIO BOT'],variants:RippleVariant[]=['bloo','lumi','coral','vio']
    for(let slot=0;slot<4;slot++){
      if([...this.players.values()].some(player=>player.slot===slot))continue
      const spawn=GIANT_PLAYROOM.spawnPoints[slot],team:Team=slot<2?'cyan':'coral',id=`bot-${++this.botId}`,yaw=team==='cyan'?Math.PI/2:-Math.PI/2
      this.players.set(id,{id,name:names[slot],slot,bot:true,team,variant:variants[slot],x:spawn.x,z:spawn.z,yaw,hits:0,bombCapacity:GAME_BALANCE.CORE_CAPACITY,canKick:false,canThrow:false,kickLevel:0,throwLevel:0,pierceCharges:0,jumpY:0,jumpReady:0,buildReady:0,falling:false,downedUntil:0,eliminated:false,lastInput:0,input:{dx:0,dz:0,seq:0},dashReady:0,nextAction:now+800+slot*350,jumpStarted:0,jumpUntil:0,jumpBaseY:0,fallVelocity:0})
      this.events.push({event:'BOT_FILLED',actorId:id})
    }
  }

  private placeCore(player:PlayerState){
    const cell=worldToGrid(player),key=cellKey(cell),active=[...this.cores.values()].filter(core=>core.owner===player.id).length
    const onObstacle=this.arena.walls.has(key)&&Math.abs(player.jumpY-GAME_BALANCE.OBSTACLE_TOP_Y)<.18
    if(active>=player.bombCapacity||(isCellBlocked(this.arena,cell)&&!onObstacle)||this.holes.has(key)||this.coreAt(cell.x,cell.z))return false
    const piercing=player.pierceCharges>0;if(piercing)player.pierceCharges--
    const y=onObstacle?GAME_BALANCE.OBSTACLE_TOP_Y:0,id=`${this.id}-${++this.coreId}`;this.cores.set(id,{id,owner:player.id,team:player.team,x:cell.x,z:cell.z,y,fuse:GAME_BALANCE.CORE_FUSE_SECONDS,piercing,chain:1});this.events.push({event:'CORE_PLACED',actorId:player.id,coreId:id,x:cell.x,y,z:cell.z});return true
  }

  private explode(core:CoreState,now:number){
    if(!this.cores.has(core.id))return
    const cells=core.piercing?tracePiercingExplosion(this.arena,core,GAME_BALANCE.CORE_RANGE):traceExplosion(this.arena,core,GAME_BALANCE.CORE_RANGE),keys=new Set(cells.map(cellKey))
    const wallHits=core.piercing?cells.filter(cell=>this.arena.walls.has(cellKey(cell))):blastHitWalls(this.arena,core,GAME_BALANCE.CORE_RANGE)
    this.cores.delete(core.id);this.events.push({event:'CORE_EXPLODED',actorId:core.owner,coreId:core.id,x:core.x,y:core.y,z:core.z,team:core.team,chain:core.chain,piercing:core.piercing})
    for(const wall of wallHits){const key=cellKey(wall);this.arena.walls.delete(key);this.destroyedWalls.add(key);this.events.push({event:'OBJECT_DESTROYED',x:wall.x,z:wall.z,team:core.team});if(!core.piercing)this.spawnItem(wall.x,wall.z)}
    if(core.piercing)for(const floorCell of piercingFloorCells(core,cells,GIANT_PLAYROOM.spawnPoints)){const key=cellKey(floorCell);this.arena.walls.delete(key);this.holes.add(key);this.events.push({event:'FLOOR_DESTROYED',x:floorCell.x,z:floorCell.z,team:core.team})}
    for(const player of this.players.values()){
      if(player.eliminated||player.falling||player.downedUntil||!cells.some(cell=>Math.abs(cell.x-player.x)<.62&&Math.abs(cell.z-player.z)<.62))continue
      this.knockback(player,core.x,core.z)
      const beforeHits=player.hits
      player.hits=Math.min(GAME_BALANCE.PLAYER_MAX_HITS,player.hits+GAME_BALANCE.CORE_HIT_DAMAGE)
      const damage=player.hits-beforeHits
      if(player.hits>=GAME_BALANCE.PLAYER_MAX_HITS)player.downedUntil=now+GAME_BALANCE.FLUX_DOWNED_MS
      this.events.push({event:player.hits>=GAME_BALANCE.PLAYER_MAX_HITS?'PLAYER_FLUX_LOCKED':'PLAYER_HIT',actorId:core.owner,targetId:player.id,damage,hits:player.hits,remainingHits:GAME_BALANCE.PLAYER_MAX_HITS-player.hits,maxHits:GAME_BALANCE.PLAYER_MAX_HITS})
    }
    let chained=0
    for(const other of this.cores.values())if(keys.has(cellKey(other))){other.fuse=Math.min(other.fuse,.001);other.chain=Math.max(other.chain,core.chain+1);chained++}
    if(chained)this.events.push({event:core.chain===1?'CHAIN_STARTED':'CHAIN_EXTENDED',actorId:core.owner,coreId:core.id,team:core.team,chain:core.chain+1})
  }
  private spawnItem(x:number,z:number){
    const kind=itemForRoll(this.random());if(!kind)return
    const id=`item-${++this.itemId}`;this.items.set(id,{id,kind,x,z});this.events.push({event:'ITEM_SPAWNED',itemId:id,kind,x,z})
  }
  private collectItem(player:PlayerState,item:NetworkItem){
    Object.assign(player,stackItemEffect(player,item.kind))
    this.items.delete(item.id);this.events.push({event:'ITEM_COLLECTED',actorId:player.id,itemId:item.id,kind:item.kind,x:item.x,z:item.z})
  }
  private resetArena(){this.arena.walls.clear();for(const wall of GIANT_PLAYROOM.walls)this.arena.walls.add(wall);this.destroyedWalls.clear();this.holes.clear();this.items.clear()}
}
