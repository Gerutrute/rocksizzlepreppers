import { describe,expect,it } from 'vitest'
import { GAME_BALANCE } from '../src/game-core/config'
import { Room } from './Room'

describe('authoritative room',()=>{
  it('assigns four deterministic slots and rejects a fifth player',()=>{
    const room=new Room('TEST')
    expect([0,1,2,3].map(index=>room.join(`p${index}`,`Player ${index}`).slot)).toEqual([0,1,2,3])
    expect(()=>room.join('p4','Overflow')).toThrow('ROOM_FULL')
  })

  it('applies sequenced input on a fixed server step',()=>{
    const room=new Room('MOVE',0),player=room.join('p1','Bloo',0)
    room.input(player.id,2,1,0);room.input(player.id,1,-1,0);room.step(1/30,3100)
    expect(player.x).toBeGreaterThan(-11);expect(player.lastInput).toBe(2)
  })

  it('validates Core placement, kick, throw and fuse on the server',()=>{
    const room=new Room('CORE',0),player=room.join('p1','Bloo',0)
    player.canKick=true;player.canThrow=true
    expect(room.action(player.id,'PLACE',{x:1,z:0},3000)).toBe(true)
    expect(room.action(player.id,'KICK',{x:1,z:0},3000)).toBe(true)
    expect(player.yaw).toBeCloseTo(Math.PI/2)
    expect(room.action(player.id,'THROW',{x:0,z:-1},3000)).toBe(true)
    expect(player.yaw).toBeCloseTo(Math.PI)
    expect([...room.cores.values()][0]).toMatchObject({x:-10,z:3})
    room.step(3,6000);expect(room.cores.size).toBe(0)
  })

  it('emits authoritative chain depth for connected Core explosions',()=>{
    const room=new Room('CHAIN',0),player=room.join('p1','Bloo',0)
    player.bombCapacity=2
    expect(room.action(player.id,'PLACE',{x:1,z:0},3000)).toBe(true)
    player.x=-8;player.z=6
    expect(room.action(player.id,'PLACE',{x:1,z:0},3000)).toBe(true)
    room.step(3,6000);room.step(1/30,6034)
    expect(room.events.some(event=>event.event==='CHAIN_STARTED'&&event.chain===2)).toBe(true)
    expect(room.events.some(event=>event.event==='CORE_EXPLODED'&&event.chain===2)).toBe(true)
  })

  it('restarts an ended room in place for every connected player',()=>{
    const room=new Room('AGAIN',0)
    const players=[0,1,2,3].map(index=>room.join(`p${index}`,`Player ${index}`,0))
    players[0].hits=3;players[0].eliminated=true
    room.step(1/30,184_000)
    expect(room.winner).not.toBeNull()
    expect(room.rematch(players[2].id,185_000)).toBe(true)
    expect(room.snapshot(185_000)).toMatchObject({phase:'COUNTDOWN',countdown:3,remaining:180,ended:false,winner:null})
    expect(players.every(player=>player.hits===0&&!player.eliminated)).toBe(true)
    expect(room.events.at(-1)?.event).toBe('MATCH_RESTARTED')
  })

  it('does not allow a bot or an active match to force a restart',()=>{
    const room=new Room('SAFE',0),player=room.join('p1','Player',0)
    expect(room.rematch(player.id,1000)).toBe(false)
    room.step(1/30,1000)
    const bot=[...room.players.values()].find(candidate=>candidate.bot)
    room.winner='cyan'
    expect(bot&&room.rematch(bot.id,2000)).toBe(false)
  })

  it('holds movement and actions until the shared countdown completes',()=>{
    const room=new Room('READY',0),player=room.join('p1','Player',0)
    room.input(player.id,1,1,0);room.step(1/30,2500)
    expect(player.x).toBe(-11)
    expect(room.action(player.id,'PLACE',{x:1,z:0},2500)).toBe(false)
    expect(room.snapshot(2500)).toMatchObject({phase:'COUNTDOWN',countdown:1,remaining:180})
    room.step(1/30,3000)
    expect(player.x).toBeGreaterThan(-11)
    expect(room.events.some(event=>event.event==='MATCH_STARTED')).toBe(true)
  })

  it('prevents players from moving through each other',()=>{
    const room=new Room('COLLIDE',0),a=room.join('a','A',0),b=room.join('b','B',0)
    a.x=4;a.z=0;b.x=4.8;b.z=0
    room.input(a.id,1,1,0);room.step(.1,3100)
    expect(a.x).toBe(4)
    expect(Math.hypot(a.x-b.x,a.z-b.z)).toBeGreaterThanOrEqual(.76)
  })

  it('applies deterministic server knockback when a Core hits a player',()=>{
    const room=new Room('KNOCK',0),player=room.join('p1','Bloo',0)
    const before={x:player.x,z:player.z}
    expect(room.action(player.id,'PLACE',{x:1,z:0},3000)).toBe(true)
    room.step(3,6000)
    expect(Math.hypot(player.x-before.x,player.z-before.z)).toBeGreaterThan(.6)
    expect(room.events.some(event=>event.event==='PLAYER_KNOCKED'&&event.targetId===player.id)).toBe(true)
  })

  it('destroys hit arena blocks and exposes the opened path in snapshots',()=>{
    const room=new Room('BREAK',0),player=room.join('p1','Bloo',0)
    player.x=-10;player.z=3
    expect(room.action(player.id,'PLACE',{x:0,z:-1},3000)).toBe(true)
    room.step(3,6000)
    expect(room.destroyedWalls.has('-10,2')).toBe(true)
    expect(room.arena.walls.has('-10,2')).toBe(false)
    expect(room.snapshot(6000).destroyedWalls).toContain('-10,2')
    expect(room.events.some(event=>event.event==='OBJECT_DESTROYED'&&event.x===-10&&event.z===2)).toBe(true)
  })

  it('runs the Toy Express as an authoritative map-to-Core interaction',()=>{
    const room=new Room('TRAIN',0),player=room.join('p1','Bloo',0)
    player.x=-14;player.z=1
    expect(room.action(player.id,'PLACE',{x:1,z:0},3000)).toBe(true)
    room.step(1/30,33_000)
    expect(room.snapshot(33_000).vehicle).toMatchObject({active:true,x:-14,z:1})
    expect([...room.cores.values()][0]).toMatchObject({x:-13,z:1})
    expect(room.events.some(event=>event.event==='VEHICLE_CORE_PUSH')).toBe(true)
    expect(room.events.some(event=>event.event==='VEHICLE_PLAYER_PUSH')).toBe(true)
  })

  it('keeps the facing direction when fan wind pushes a player',()=>{
    const room=new Room('FACING',0),player=room.join('p1','Bloo',0)
    room.input(player.id,1,0,1);room.step(.1,3100)
    const facingBeforeWind=player.yaw
    room.input(player.id,2,0,0);room.step(.1,19_000)
    expect(facingBeforeWind).toBe(0)
    expect(player.yaw).toBe(facingBeforeWind)
  })

  it('keeps an empty room dormant and starts a fresh round for its next visitor',()=>{
    const room=new Room('REUSE',0),first=room.join('first','First',0)
    room.leave(first.id);room.step(1/30,100_000)
    expect(room.players.size).toBe(0)
    const next=room.join('next','Next',100_000)
    expect(next.slot).toBe(0)
    expect(room.snapshot(100_000)).toMatchObject({phase:'COUNTDOWN',countdown:3,remaining:180,ended:false})
  })

  it('starts with one Core slot and unlocks additional simultaneous placements through capacity',()=>{
    const room=new Room('CAPACITY',0),player=room.join('p1','Bloo',0)
    expect(room.action(player.id,'PLACE',{x:1,z:0},3000)).toBe(true)
    player.x=-9;expect(room.action(player.id,'PLACE',{x:1,z:0},3000)).toBe(false)
    player.bombCapacity=2;expect(room.action(player.id,'PLACE',{x:1,z:0},3000)).toBe(true)
  })

  it('builds an obstacle and allows a jumping player to move over it',()=>{
    const room=new Room('JUMP',0),player=room.join('p1','Bloo',0)
    expect(room.action(player.id,'BUILD',{x:1,z:0},3000)).toBe(true)
    expect(player.yaw).toBeCloseTo(Math.PI/2)
    expect(room.arena.walls.has('-10,6')).toBe(true)
    expect(room.action(player.id,'JUMP',{x:1,z:0},3000)).toBe(true)
    room.input(player.id,1,1,0);room.step(.3,3380)
    expect(player.jumpY).toBeGreaterThan(1)
    expect(player.x).toBeGreaterThan(-10.5)
    room.input(player.id,2,0,0);room.step(.1,3900)
    expect(player.jumpY).toBe(GAME_BALANCE.OBSTACLE_TOP_Y)
    expect(room.action(player.id,'PLACE',{x:1,z:0},3900)).toBe(true)
    expect([...room.cores.values()][0].y).toBe(GAME_BALANCE.OBSTACLE_TOP_Y)
  })

  it('blocks walking up an obstacle until the player actually jumps high enough',()=>{
    const room=new Room('NO-AUTO-CLIMB',0),player=room.join('p1','Bloo',0)
    expect(room.action(player.id,'BUILD',{x:1,z:0},3000)).toBe(true)
    room.input(player.id,1,1,0)
    for(let tick=1;tick<=12;tick++)room.step(1/30,3000+tick*34)
    expect(player.x).toBeLessThan(-10.5)
    expect(player.jumpY).toBe(0)

    expect(room.action(player.id,'JUMP',{x:1,z:0},3500)).toBe(true)
    for(let tick=1;tick<=8;tick++)room.step(1/30,3500+tick*34)
    expect(player.x).toBeGreaterThan(-10.5)
    expect(player.jumpY).toBeGreaterThanOrEqual(GAME_BALANCE.OBSTACLE_TOP_Y)
  })

  it('falls from an obstacle with gravity instead of snapping to the floor',()=>{
    const room=new Room('LEDGE-GRAVITY',0),player=room.join('p1','Bloo',0)
    room.arena.walls.add('0,0');player.x=.45;player.z=0;player.jumpY=GAME_BALANCE.OBSTACLE_TOP_Y
    room.input(player.id,1,1,0);room.step(.1,3100)
    expect(player.x).toBeGreaterThan(.5)
    expect(player.jumpY).toBe(GAME_BALANCE.OBSTACLE_TOP_Y)

    room.input(player.id,2,0,0);room.step(.1,3200)
    expect(player.jumpY).toBeGreaterThan(0)
    expect(player.jumpY).toBeLessThan(GAME_BALANCE.OBSTACLE_TOP_Y)
    expect(player.falling).toBe(false)

    for(let tick=1;tick<=5;tick++)room.step(.1,3200+tick*100)
    expect(player.jumpY).toBe(0)
    expect(player.eliminated).toBe(false)
  })

  it('enforces the obstacle build cooldown',()=>{
    const room=new Room('BUILD-COOLDOWN',0),player=room.join('p1','Bloo',0)
    expect(room.action(player.id,'BUILD',{x:1,z:0},3000)).toBe(true)
    expect(room.action(player.id,'BUILD',{x:0,z:1},4799)).toBe(false)
    expect(room.action(player.id,'BUILD',{x:0,z:1},4800)).toBe(true)
  })

  it('consumes a piercing charge, crosses walls and creates lethal floor holes',()=>{
    const room=new Room('PIERCE',0),player=room.join('p1','Bloo',0)
    player.x=6;player.z=2;player.pierceCharges=1
    expect(room.action(player.id,'PLACE',{x:1,z:0},3000)).toBe(true)
    expect([...room.cores.values()][0].piercing).toBe(true)
    expect(player.pierceCharges).toBe(0)
    room.step(3,6000)
    expect(room.arena.walls.has('7,2')).toBe(false)
    expect(room.holes.has('8,2')).toBe(true)
    player.x=8;player.z=2;room.step(.1,6100)
    expect(player.falling).toBe(true)
    expect(player.eliminated).toBe(false)
    expect(room.events.some(event=>event.event==='PLAYER_FALLING')).toBe(true)
    room.step(.2,6300)
    expect(player.jumpY).toBeLessThan(0)
    expect(player.eliminated).toBe(false)
    room.step(.5,6800)
    expect(player.eliminated).toBe(true)
    expect(room.events.some(event=>event.event==='PLAYER_FELL')).toBe(true)
  })

  it('spawns a deterministic item from a destroyed obstacle and applies it on pickup',()=>{
    const room=new Room('ITEM',0,()=>.4),player=room.join('p1','Bloo',0)
    player.x=-10;player.z=3
    expect(room.action(player.id,'PLACE',{x:0,z:-1},3000)).toBe(true)
    room.step(3,6000)
    expect([...room.items.values()][0]).toMatchObject({kind:'CAPACITY',x:-10,z:2})
    player.x=-10;player.z=2;room.step(1/30,6034)
    expect(player.bombCapacity).toBe(2)
    expect(room.items.size).toBe(0)
    expect(room.events.some(event=>event.event==='ITEM_COLLECTED'&&event.kind==='CAPACITY')).toBe(true)
  })
})
