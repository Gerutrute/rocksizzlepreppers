import { describe,expect,it } from 'vitest'
import { GAME_BALANCE } from '../src/game-core/config'
import { Room } from './Room'

describe('authoritative room',()=>{
  it('assigns four deterministic slots and rejects a fifth player',()=>{
    const room=new Room('TEST')
    expect([0,1,2,3].map(index=>room.join(`p${index}`,`Player ${index}`).slot)).toEqual([0,1,2,3])
    expect(()=>room.join('p4','Overflow')).toThrow('ROOM_FULL')
  })

  it('preserves a selected character variant in authoritative snapshots',()=>{
    const room=new Room('VARIANT',0),player=room.join('p1','Vio Player',0,'vio')
    expect(player.variant).toBe('vio')
    expect(room.snapshot(0).players[0].variant).toBe('vio')
  })

  it('applies sequenced input on a fixed server step',()=>{
    const room=new Room('MOVE',0),player=room.join('p1','Bloo',0)
    room.input(player.id,2,1,0);room.input(player.id,1,-1,0);room.step(1/30,3100)
    expect(player.x).toBeGreaterThan(-16);expect(player.lastInput).toBe(2)
  })

  it('synchronizes taunts, enforces cooldown and cancels them on movement',()=>{
    const room=new Room('TAUNT',0),player=room.join('p1','Bloo',0)
    expect(room.action(player.id,'TAUNT',{x:1,z:0},3000)).toBe(true)
    expect(room.snapshot(3100).players[0]).toMatchObject({tauntStartedAt:3000,tauntUntil:3000+GAME_BALANCE.TAUNT_DURATION_MS,tauntReady:3000+GAME_BALANCE.TAUNT_COOLDOWN_MS})
    expect(room.action(player.id,'TAUNT',{x:1,z:0},3200)).toBe(false)
    room.input(player.id,1,1,0)
    expect(room.snapshot(3300).players[0]).toMatchObject({tauntStartedAt:0,tauntUntil:0})
    room.input(player.id,2,0,0)
    expect(room.action(player.id,'TAUNT',{x:1,z:0},3000+GAME_BALANCE.TAUNT_COOLDOWN_MS)).toBe(true)
    expect(room.events.filter(event=>event.event==='PLAYER_TAUNTED')).toHaveLength(2)
  })

  it('validates Core placement, kick, throw and fuse on the server',()=>{
    const room=new Room('CORE',0),player=room.join('p1','Bloo',0)
    player.canKick=true;player.canThrow=true
    expect(room.action(player.id,'PLACE',{x:1,z:0},3000)).toBe(true)
    expect(room.action(player.id,'KICK',{x:1,z:0},3000)).toBe(true)
    expect(player.yaw).toBeCloseTo(Math.PI/2)
    expect(room.action(player.id,'THROW',{x:0,z:-1},3000)).toBe(true)
    expect(player.yaw).toBeCloseTo(Math.PI)
    expect([...room.cores.values()][0]).toMatchObject({x:-15,z:-1})
    room.step(3,6000);expect(room.cores.size).toBe(0)
  })

  it('increases kick and throw distance with repeated item levels',()=>{
    const room=new Room('STACK-RANGE',0),player=room.join('p1','Bloo',0)
    player.canKick=true;player.kickLevel=3;player.canThrow=true;player.throwLevel=2
    expect(room.action(player.id,'PLACE',{x:1,z:0},3000)).toBe(true)
    expect(room.action(player.id,'KICK',{x:1,z:0},3000)).toBe(true)
    expect([...room.cores.values()][0]).toMatchObject({x:-13,z:2})
    player.x=-13;player.z=2
    expect(room.action(player.id,'THROW',{x:0,z:-1},3000)).toBe(true)
    expect([...room.cores.values()][0]).toMatchObject({x:-13,z:-3})
  })

  it('emits authoritative chain depth for connected Core explosions',()=>{
    const room=new Room('CHAIN',0),player=room.join('p1','Bloo',0)
    player.bombCapacity=2
    expect(room.action(player.id,'PLACE',{x:1,z:0},3000)).toBe(true)
    player.x=-13;player.z=2
    expect(room.action(player.id,'PLACE',{x:1,z:0},3000)).toBe(true)
    room.step(3,6000);room.step(1/30,6034)
    expect(room.events.some(event=>event.event==='CHAIN_STARTED'&&event.chain===2)).toBe(true)
    expect(room.events.some(event=>event.event==='CORE_EXPLODED'&&event.chain===2)).toBe(true)
  })

  it('plays a best-of-three series, advances rounds automatically and resets after two wins',()=>{
    const room=new Room('AGAIN',0)
    const players=[0,1,2,3].map(index=>room.join(`p${index}`,`Player ${index}`,0))
    players[0].hits=3;players[0].eliminated=true
    room.step(1/30,184_000)
    expect(room.snapshot(184_000)).toMatchObject({phase:'ROUND_ENDED',round:1,scores:{cyan:0,coral:1},roundWinner:'coral',ended:false,winner:null})
    expect(room.rematch(players[2].id,185_000)).toBe(false)

    room.step(1/30,187_000)
    expect(room.snapshot(187_000)).toMatchObject({phase:'COUNTDOWN',round:2,countdown:3,remaining:180,scores:{cyan:0,coral:1},roundWinner:null})
    expect(players.every(player=>player.hits===0&&!player.eliminated)).toBe(true)

    players[0].eliminated=true;players[1].eliminated=true
    room.step(1/30,190_001)
    expect(room.snapshot(190_001)).toMatchObject({phase:'ENDED',round:2,scores:{cyan:0,coral:2},roundWinner:'coral',ended:true,winner:'coral'})
    expect(room.rematch(players[2].id,190_100)).toBe(true)
    expect(room.snapshot(190_100)).toMatchObject({phase:'COUNTDOWN',round:1,countdown:3,remaining:180,scores:{cyan:0,coral:0},roundWinner:null,ended:false,winner:null})
    expect(room.events.at(-1)?.event).toBe('MATCH_RESTARTED')
  })

  it('replays a drawn round without awarding a series win',()=>{
    const room=new Room('DRAW-SERIES',0)
    ;[0,1,2,3].forEach(index=>room.join(`p${index}`,`Player ${index}`,0))
    room.step(1/30,184_000)
    expect(room.snapshot(184_000)).toMatchObject({phase:'ROUND_ENDED',round:1,scores:{cyan:0,coral:0},roundWinner:'draw'})
    room.step(1/30,187_000)
    expect(room.snapshot(187_000)).toMatchObject({phase:'COUNTDOWN',round:1,scores:{cyan:0,coral:0},roundWinner:null})
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
    expect(player.x).toBe(-16)
    expect(room.action(player.id,'PLACE',{x:1,z:0},2500)).toBe(false)
    expect(room.snapshot(2500)).toMatchObject({phase:'COUNTDOWN',countdown:1,remaining:180})
    room.step(1/30,3000)
    expect(player.x).toBeGreaterThan(-16)
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

  it('damages a player anywhere inside the circular blast, including diagonals',()=>{
    const room=new Room('CIRCLE-DAMAGE',0),owner=room.join('owner','Owner',0),target=room.join('target','Target',0)
    owner.x=10;owner.z=0;owner.jumpY=0;target.x=12;target.z=2;target.jumpY=0
    expect(room.action(owner.id,'PLACE',{x:1,z:0},3000)).toBe(true)
    room.step(3,6000)
    expect(target.hits).toBe(1)
    expect(room.events.some(event=>event.event==='PLAYER_HIT'&&event.targetId===target.id)).toBe(true)
  })

  it('destroys hit arena blocks and exposes the opened path in snapshots',()=>{
    const room=new Room('BREAK',0),player=room.join('p1','Bloo',0)
    player.x=-10;player.z=4;player.jumpY=0
    expect(room.action(player.id,'PLACE',{x:0,z:-1},3000)).toBe(true)
    room.step(3,6000)
    expect(room.destroyedWalls.has('-10,3')).toBe(true)
    expect(room.arena.walls.has('-10,3')).toBe(false)
    expect(room.snapshot(6000).destroyedWalls).toContain('-10,3')
    expect(room.events.some(event=>event.event==='OBJECT_DESTROYED'&&event.x===-10&&event.z===3)).toBe(true)
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

  it('pushes a player when a rotating spinner arm makes contact',()=>{
    const room=new Room('SPINNER-PLAYER',0),player=room.join('p1','Bloo',0)
    player.x=2;player.z=0;player.jumpY=0
    const before={x:player.x,z:player.z};room.step(1/30,3100)
    expect(Math.hypot(player.x-before.x,player.z-before.z)).toBeGreaterThan(.5)
    expect(player.z).toBeLessThan(before.z)
    expect(Math.abs(player.z-before.z)).toBeGreaterThan(Math.abs(player.x-before.x))
    expect(room.events.some(event=>event.event==='SPINNER_HIT'&&event.actorId===player.id)).toBe(true)
  })

  it('lets the spinner push an energy ball into a safe adjacent cell',()=>{
    const room=new Room('SPINNER-CORE',0),player=room.join('p1','Bloo',0)
    player.x=2;player.z=0;player.jumpY=0
    expect(room.action(player.id,'PLACE',{x:1,z:0},3000)).toBe(true)
    player.x=10;player.z=8
    const core=[...room.cores.values()][0],before={x:core.x,z:core.z};room.step(1/30,3100)
    expect({x:core.x,z:core.z}).not.toEqual(before)
    expect(room.events.some(event=>event.event==='HAZARD_CORE_PUSH'&&event.coreId===core.id)).toBe(true)
  })

  it('lets a rotating roller move an energy ball along its push direction',()=>{
    const room=new Room('ROLLER-CORE',0),player=room.join('p1','Bloo',0)
    player.x=-9;player.z=5;player.jumpY=0
    expect(room.action(player.id,'PLACE',{x:1,z:0},3000)).toBe(true)
    player.x=10;player.z=8
    const core=[...room.cores.values()][0];room.step(1/30,3100)
    expect(core).toMatchObject({x:-9,z:4})
    expect(room.events.some(event=>event.event==='HAZARD_CORE_PUSH'&&event.coreId===core.id)).toBe(true)
  })

  it('keeps the facing direction when fan wind pushes a player',()=>{
    const room=new Room('FACING',0),player=room.join('p1','Bloo',0)
    room.input(player.id,1,0,1);room.step(.1,3100)
    const facingBeforeWind=player.yaw
    room.input(player.id,2,0,0);room.step(.1,19_000)
    expect(facingBeforeWind).toBe(0)
    expect(player.yaw).toBe(facingBeforeWind)
  })

  it('faces the direction actually travelled when an obstacle blocks one movement axis',()=>{
    const room=new Room('SLIDE-FACING',0),player=room.join('p1','Bloo',0)
    room.arena.walls.add('4,0');player.x=3.4;player.z=-.6
    room.input(player.id,1,1,1);room.step(.1,3100)
    expect(player.x).toBeGreaterThan(3.4)
    expect(player.z).toBeCloseTo(-.6)
    expect(player.yaw).toBeCloseTo(Math.PI/2)
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
    expect(room.arena.walls.has('-15,2')).toBe(true)
    expect(room.action(player.id,'JUMP',{x:1,z:0},3000)).toBe(true)
    room.input(player.id,1,1,0);room.step(.3,3380)
    expect(player.jumpY).toBeGreaterThan(2)
    expect(player.x).toBeGreaterThan(-15.5)
    room.input(player.id,2,0,0);room.step(.1,3900)
    expect(player.jumpY).toBeCloseTo(.92+GAME_BALANCE.OBSTACLE_TOP_Y)
    expect(room.action(player.id,'PLACE',{x:1,z:0},3900)).toBe(true)
    expect([...room.cores.values()][0].y).toBeCloseTo(.92+GAME_BALANCE.OBSTACLE_TOP_Y)
  })

  it('blocks walking up an obstacle until the player actually jumps high enough',()=>{
    const room=new Room('NO-AUTO-CLIMB',0),player=room.join('p1','Bloo',0)
    expect(room.action(player.id,'BUILD',{x:1,z:0},3000)).toBe(true)
    room.input(player.id,1,1,0)
    for(let tick=1;tick<=12;tick++)room.step(1/30,3000+tick*34)
    expect(player.x).toBeLessThan(-15.5)
    expect(player.jumpY).toBeCloseTo(.92)

    expect(room.action(player.id,'JUMP',{x:1,z:0},3500)).toBe(true)
    for(let tick=1;tick<=8;tick++)room.step(1/30,3500+tick*34)
    expect(player.x).toBeGreaterThan(-15.5)
    expect(player.jumpY).toBeGreaterThanOrEqual(.92+GAME_BALANCE.OBSTACLE_TOP_Y)
  })

  it('falls from an obstacle with gravity instead of snapping to the floor',()=>{
    const room=new Room('LEDGE-GRAVITY',0),player=room.join('p1','Bloo',0)
    room.arena.walls.add('5,0');player.x=5.45;player.z=0;player.jumpY=GAME_BALANCE.OBSTACLE_TOP_Y
    room.input(player.id,1,1,0);room.step(.1,3100)
    expect(player.x).toBeGreaterThan(5.5)
    expect(player.jumpY).toBe(GAME_BALANCE.OBSTACLE_TOP_Y)

    room.input(player.id,2,0,0);room.step(.1,3200)
    expect(player.jumpY).toBeGreaterThan(0)
    expect(player.jumpY).toBeLessThan(GAME_BALANCE.OBSTACLE_TOP_Y)
    expect(player.falling).toBe(false)

    for(let tick=1;tick<=5;tick++)room.step(.1,3200+tick*100)
    expect(player.jumpY).toBe(0)
    expect(player.eliminated).toBe(false)
  })

  it('blocks players at authored tube walls and the perimeter bumpers',()=>{
    const room=new Room('PROP-COLLISION',0),player=room.join('p1','Bloo',0)
    player.x=7.25;player.z=-9;player.jumpY=0
    room.input(player.id,1,0,-1);room.step(.1,3100)
    expect(player.z).toBe(-9)

    player.x=17.55;player.z=10;player.jumpY=0
    room.input(player.id,2,1,0);room.step(.2,3300)
    expect(player.x).toBe(17.55)
  })

  it('enforces the obstacle build cooldown',()=>{
    const room=new Room('BUILD-COOLDOWN',0),player=room.join('p1','Bloo',0)
    expect(room.action(player.id,'BUILD',{x:1,z:0},3000)).toBe(true)
    expect(room.action(player.id,'BUILD',{x:0,z:1},4799)).toBe(false)
    expect(room.action(player.id,'BUILD',{x:0,z:1},4800)).toBe(true)
  })

  it('consumes a piercing charge, crosses walls and creates lethal floor holes',()=>{
    const room=new Room('PIERCE',0),player=room.join('p1','Bloo',0)
    player.x=6;player.z=3;player.jumpY=0;player.pierceCharges=1
    expect(room.action(player.id,'PLACE',{x:1,z:0},3000)).toBe(true)
    expect([...room.cores.values()][0].piercing).toBe(true)
    expect(player.pierceCharges).toBe(0)
    room.step(3,6000)
    expect(room.arena.walls.has('4,3')).toBe(false)
    expect(room.holes.has('8,3')).toBe(true)
    player.x=8;player.z=3;room.step(.1,6100)
    expect(player.falling).toBe(true)
    expect(player.eliminated).toBe(false)
    expect(room.events.some(event=>event.event==='PLAYER_FALLING')).toBe(true)
    room.step(.2,6300)
    expect(player.jumpY).toBeLessThan(0)
    expect(player.eliminated).toBe(false)
    room.step(.5,6800)
    expect(player.jumpY).toBeLessThan(-3)
    expect(player.eliminated).toBe(false)
    room.step(.3,7100)
    expect(player.eliminated).toBe(true)
    expect(room.events.some(event=>event.event==='PLAYER_FELL')).toBe(true)
  })

  it('spawns a deterministic item from a destroyed obstacle and applies it on pickup',()=>{
    const room=new Room('ITEM',0,()=>.4),player=room.join('p1','Bloo',0)
    player.x=-10;player.z=4;player.jumpY=0
    expect(room.action(player.id,'PLACE',{x:0,z:-1},3000)).toBe(true)
    room.step(3,6000)
    expect([...room.items.values()][0]).toMatchObject({kind:'CAPACITY',x:-11,z:3})
    player.x=-11;player.z=3;room.step(1/30,6034)
    expect(player.bombCapacity).toBe(2)
    expect(room.items.size).toBe(2)
    expect(room.events.some(event=>event.event==='ITEM_COLLECTED'&&event.kind==='CAPACITY')).toBe(true)
  })
})
