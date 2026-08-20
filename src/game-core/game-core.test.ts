import { describe, expect, it } from 'vitest'
import { GIANT_PLAYROOM } from './arena'
import { blastHitWalls } from './destruction'
import { getDangerCells, gridToWorld, isCellBlocked, traceExplosion, worldToGrid } from './grid'
import { canPlaceCore, fluxPhase, matchWinner, resolveChain } from './rules'
import { itemForRoll, kickDistanceForLevel, piercingFloorCells, stackItemEffect, throwDistanceForLevel, tracePiercingExplosion } from './powerups'
import { fanStateAt, vehicleStateAt } from './timeline'

describe('logical grid',()=>{
  it('converts world and grid positions deterministically',()=>{
    expect(worldToGrid({x:3.41,z:-2.72})).toEqual({x:3,z:-3})
    expect(gridToWorld({x:-4,z:2})).toEqual({x:-4,z:2})
  })

  it('blocks arena edges and authored wall cells',()=>{
    expect(isCellBlocked(GIANT_PLAYROOM,{x:16,z:0})).toBe(true)
    expect(isCellBlocked(GIANT_PLAYROOM,{x:0,z:0})).toBe(true)
    expect(isCellBlocked(GIANT_PLAYROOM,{x:4,z:0})).toBe(false)
  })

  it('stops an explosion at a wall without leaking behind it',()=>{
    const cells=traceExplosion(GIANT_PLAYROOM,{x:6,z:2},3)
    expect(cells).not.toContainEqual({x:7,z:2})
    expect(cells).not.toContainEqual({x:8,z:2})
    expect(cells).toContainEqual({x:3,z:2})
  })

  it('finds the first destructible block hit along each blast ray',()=>{
    expect(blastHitWalls(GIANT_PLAYROOM,{x:6,z:2},3)).toContainEqual({x:7,z:2})
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
  it('maps obstacle drop rolls to four item types and an empty result',()=>{
    expect(itemForRoll(.05)).toBe('KICK')
    expect(itemForRoll(.2)).toBe('THROW')
    expect(itemForRoll(.4)).toBe('CAPACITY')
    expect(itemForRoll(.6)).toBe('PIERCE')
    expect(itemForRoll(.9)).toBeNull()
  })

  it('stacks repeated item pickups up to their gameplay caps',()=>{
    let stats={bombCapacity:1,canKick:false,canThrow:false,kickLevel:0,throwLevel:0,pierceCharges:0}
    for(let pickup=0;pickup<9;pickup++)stats=stackItemEffect(stats,'KICK')
    for(let pickup=0;pickup<3;pickup++)stats=stackItemEffect(stats,'THROW')
    for(let pickup=0;pickup<9;pickup++)stats=stackItemEffect(stats,'CAPACITY')
    for(let pickup=0;pickup<9;pickup++)stats=stackItemEffect(stats,'PIERCE')
    expect(stats).toMatchObject({canKick:true,canThrow:true,kickLevel:5,throwLevel:3,bombCapacity:6,pierceCharges:6})
    expect(kickDistanceForLevel(stats.kickLevel)).toBe(5)
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
