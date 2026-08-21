import { describe, expect, it } from 'vitest'
import { GIANT_PLAYROOM } from './arena'
import { blastHitWalls } from './destruction'
import { getDangerCells, gridToWorld, isCellBlocked, isInsideCircularBlast, traceExplosion, worldToGrid } from './grid'
import { canPlaceCore, fluxPhase, matchWinner, resolveChain } from './rules'
import { itemForRoll, piercingFloorCells, stackItemEffect, throwDistanceForLevel, tracePiercingExplosion } from './powerups'
import { fanStateAt, vehicleStateAt } from './timeline'
import { BALL_PIT, isProtectedFloorAt, jumpPadAt, movementMultiplierAt, movingHazardPushAt, slidePushAt, spinnerPushAt, staticPlaygroundCollisionAt, terrainHeightAt, TUBE } from './playground'

describe('logical grid',()=>{
  it('converts world and grid positions deterministically',()=>{
    expect(worldToGrid({x:3.41,z:-2.72})).toEqual({x:3,z:-3})
    expect(gridToWorld({x:-4,z:2})).toEqual({x:-4,z:2})
  })

  it('blocks arena edges and authored wall cells',()=>{
    expect(isCellBlocked(GIANT_PLAYROOM,{x:19,z:0})).toBe(true)
    expect(isCellBlocked(GIANT_PLAYROOM,{x:-11,z:-4})).toBe(true)
    expect(isCellBlocked(GIANT_PLAYROOM,{x:4,z:0})).toBe(false)
  })

  it('fills a circular explosion area instead of four grid rays',()=>{
    const cells=traceExplosion(GIANT_PLAYROOM,{x:6,z:2},3)
    expect(cells).toContainEqual({x:7,z:2})
    expect(cells).toContainEqual({x:8,z:2})
    expect(cells).toContainEqual({x:8,z:4})
    expect(cells).not.toContainEqual({x:9,z:5})
    expect(cells).toContainEqual({x:3,z:2})
  })

  it('damages actors by exact circular world-space distance',()=>{
    expect(isInsideCircularBlast({x:0,z:0},{x:2.5,z:1.5},3)).toBe(true)
    expect(isInsideCircularBlast({x:0,z:0},{x:2.5,z:2.5},3)).toBe(false)
  })

  it('finds every destructible block inside the circular blast',()=>{
    const arena={halfX:6,halfZ:6,walls:new Set(['1,0','2,1','3,3']),spawnPoints:[]}
    expect(blastHitWalls(arena,{x:0,z:0},3)).toEqual(expect.arrayContaining([{x:1,z:0},{x:2,z:1}]))
    expect(blastHitWalls(arena,{x:0,z:0},3)).not.toContainEqual({x:3,z:3})
  })

  it('deduplicates danger cells from simultaneous cores',()=>{
    const cells=getDangerCells(GIANT_PLAYROOM,[{x:0,z:0},{x:0,z:1}],3)
    expect(new Set(cells.map(cell=>`${cell.x},${cell.z}`)).size).toBe(cells.length)
  })
})

describe('core and match rules',()=>{
  it('enforces capacity',()=>{expect(canPlaceCore(3,4)).toBe(true);expect(canPlaceCore(4,4)).toBe(false)})

  it('resolves a multi-core chain once per core',()=>{
    const order=resolveChain(GIANT_PLAYROOM,'a',[{id:'a',x:-13,z:8},{id:'b',x:-10,z:8},{id:'c',x:-7,z:8},{id:'d',x:-7,z:9}],3)
    expect(order).toEqual(['a','b','c','d'])
  })

  it('advances Flux Lock to elimination after the rescue window',()=>{
    expect(fluxPhase(0,0,100)).toBe('normal')
    expect(fluxPhase(2,0,100)).toBe('slowed')
    expect(fluxPhase(3,700,100)).toBe('downed')
    expect(fluxPhase(3,700,800)).toBe('eliminated')
  })

  it('selects the team with more survivors and fewer hits',()=>{
    expect(matchWinner([{team:'cyan',hits:2,eliminated:false},{team:'cyan',hits:3,eliminated:true},{team:'coral',hits:3,eliminated:true},{team:'coral',hits:3,eliminated:true}])).toBe('cyan')
  })
})

describe('items and piercing blasts',()=>{
  it('maps obstacle drop rolls to the three active item types and an empty result',()=>{
    expect(itemForRoll(.05)).toBe('THROW')
    expect(itemForRoll(.3)).toBe('CAPACITY')
    expect(itemForRoll(.6)).toBe('PIERCE')
    expect(itemForRoll(.9)).toBeNull()
  })

  it('stacks repeated item pickups up to their gameplay caps',()=>{
    let stats={bombCapacity:1,canKick:false,canThrow:false,kickLevel:0,throwLevel:0,pierceCharges:0}
    for(let pickup=0;pickup<3;pickup++)stats=stackItemEffect(stats,'THROW')
    for(let pickup=0;pickup<9;pickup++)stats=stackItemEffect(stats,'CAPACITY')
    for(let pickup=0;pickup<9;pickup++)stats=stackItemEffect(stats,'PIERCE')
    expect(stats).toMatchObject({canKick:false,canThrow:true,kickLevel:0,throwLevel:3,bombCapacity:6,pierceCharges:6})
    expect(throwDistanceForLevel(stats.throwLevel)).toBe(7)
  })

  it('lets a piercing blast continue through walls',()=>{
    const cells=tracePiercingExplosion(GIANT_PLAYROOM,{x:6,z:2},3)
    expect(cells).toContainEqual({x:7,z:2})
    expect(cells).toContainEqual({x:9,z:2})
  })

  it('opens floor holes away from the Core while preserving spawn cells',()=>{
    const origin={x:-11,z:6},cells=tracePiercingExplosion(GIANT_PLAYROOM,origin,3)
    const holes=piercingFloorCells(origin,cells,GIANT_PLAYROOM.spawnPoints)
    expect(holes).not.toContainEqual(origin)
    expect(holes).toContainEqual({x:-9,z:6})
  })
})

describe('authoritative map timeline',()=>{
  it('repeats learnable fan warning and active windows through a three-minute match',()=>{
    expect(fanStateAt(11.9)).toBe('CALM')
    expect(fanStateAt(12)).toBe('WARNING')
    expect(fanStateAt(16)).toBe('ACTIVE')
    expect(fanStateAt(92)).toBe('WARNING')
    expect(fanStateAt(170)).toBe('ACTIVE')
  })

  it('moves Toy Express deterministically across its track',()=>{
    expect(vehicleStateAt(29.9).active).toBe(false)
    expect(vehicleStateAt(30)).toMatchObject({active:true,x:-14,z:1})
    expect(vehicleStateAt(34).x).toBe(0)
    expect(vehicleStateAt(150)).toMatchObject({active:true,x:-14,z:1})
  })
})

describe('giant playground terrain',()=>{
  it('shares authored deck and ramp heights with gameplay collision',()=>{
    expect(terrainHeightAt(-16,2)).toBeCloseTo(.92)
    expect(terrainHeightAt(-13.9,0)).toBeGreaterThan(terrainHeightAt(-12.1,0))
    expect(terrainHeightAt(0,0)).toBe(0)
  })

  it('applies ball-pit slowdown, jump pads and deterministic spinner contact',()=>{
    expect(movementMultiplierAt(-8.5,-6.2)).toBeLessThan(1)
    expect(movementMultiplierAt(-9.4,-7.8)).toBe(1)
    expect(jumpPadAt(-7,-4.8)?.id).toBe('jump-cyan')
    expect(slidePushAt(-1.3,-7.25)?.z).toBeGreaterThan(0)
    expect(spinnerPushAt(2,0,0)).not.toBeNull()
    expect(spinnerPushAt(2,0,0)).toEqual({x:0,z:-1})
    expect(spinnerPushAt(-2,0,0)).toEqual({x:0,z:1})
    expect(spinnerPushAt(6,0,0)).toBeNull()
    expect(movingHazardPushAt(-9,5.25,0)?.z).toBeLessThan(0)
    expect(movingHazardPushAt(-1.3,-7.25,0)?.z).toBeGreaterThan(0)
  })

  it('gives solid authored props matching player-height collision volumes',()=>{
    expect(staticPlaygroundCollisionAt(0,0,0)?.id).toBe('spinner-hub')
    expect(staticPlaygroundCollisionAt(0,0,1.4)).toBeNull()
    expect(staticPlaygroundCollisionAt(TUBE.x,TUBE.z-TUBE.radius,0)?.id).toBe('tube-north-wall')
    expect(staticPlaygroundCollisionAt(TUBE.x,TUBE.z,0)).toBeNull()
    expect(staticPlaygroundCollisionAt(-17.2,3.2,.92)?.id).toBe('cyan-arch-south-pillar')
    expect(staticPlaygroundCollisionAt(BALL_PIT.x,BALL_PIT.z-BALL_PIT.depth*.5,0)?.id).toBe('ball-pit-north-rail')
    expect(staticPlaygroundCollisionAt(-1.875,-7.25,0)?.id).toBe('slide-ramp-left-rail-1')
    expect(staticPlaygroundCollisionAt(-14,4,.92)?.id).toBe('cyan-deck-corner-4')
  })

  it('protects authored structures from piercing floor holes',()=>{
    expect(isProtectedFloorAt({x:-16,z:2})).toBe(true)
    expect(isProtectedFloorAt({x:0,z:0})).toBe(true)
    expect(isProtectedFloorAt({x:0,z:5})).toBe(false)
  })
})
