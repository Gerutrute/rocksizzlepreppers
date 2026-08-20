import type { ArenaDefinition, GridCell } from './grid'
import { GAME_BALANCE } from './config'

export type ItemKind='KICK'|'THROW'|'CAPACITY'|'PIERCE'
export type StackableItemStats={bombCapacity:number;canKick:boolean;canThrow:boolean;kickLevel:number;throwLevel:number;pierceCharges:number}

const DIRECTIONS:GridCell[]=[{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}]

export const itemForRoll=(roll:number):ItemKind|null=>{
  if(roll<.17)return 'KICK'
  if(roll<.34)return 'THROW'
  if(roll<.54)return 'CAPACITY'
  if(roll<.68)return 'PIERCE'
  return null
}

export const stackItemEffect=(stats:StackableItemStats,kind:ItemKind):StackableItemStats=>{
  const next={...stats}
  if(kind==='KICK'){next.kickLevel=Math.min(GAME_BALANCE.MAX_ITEM_LEVEL,next.kickLevel+1);next.canKick=next.kickLevel>0}
  if(kind==='THROW'){next.throwLevel=Math.min(GAME_BALANCE.MAX_ITEM_LEVEL,next.throwLevel+1);next.canThrow=next.throwLevel>0}
  if(kind==='CAPACITY')next.bombCapacity=Math.min(GAME_BALANCE.MAX_CORE_CAPACITY,next.bombCapacity+1)
  if(kind==='PIERCE')next.pierceCharges=Math.min(GAME_BALANCE.MAX_PIERCE_CHARGES,next.pierceCharges+1)
  return next
}

export const kickDistanceForLevel=(level:number)=>Math.max(1,Math.min(GAME_BALANCE.MAX_ITEM_LEVEL,level))
export const throwDistanceForLevel=(level:number)=>GAME_BALANCE.THROW_RANGE+Math.max(0,Math.min(GAME_BALANCE.MAX_ITEM_LEVEL,level)-1)*GAME_BALANCE.THROW_RANGE_PER_LEVEL

export const tracePiercingExplosion=(arena:ArenaDefinition,origin:GridCell,range:number):GridCell[]=>{
  const cells=[origin]
  for(const direction of DIRECTIONS)for(let distance=1;distance<=range;distance++){
    const cell={x:origin.x+direction.x*distance,z:origin.z+direction.z*distance}
    if(Math.abs(cell.x)>arena.halfX||Math.abs(cell.z)>arena.halfZ)break
    cells.push(cell)
  }
  return cells
}

export const piercingFloorCells=(origin:GridCell,cells:ReadonlyArray<GridCell>,spawnPoints:ReadonlyArray<GridCell>)=>{
  const spawns=new Set(spawnPoints.map(cell=>`${cell.x},${cell.z}`))
  return cells.filter(cell=>Math.abs(cell.x-origin.x)+Math.abs(cell.z-origin.z)>=2&&!spawns.has(`${cell.x},${cell.z}`))
}
