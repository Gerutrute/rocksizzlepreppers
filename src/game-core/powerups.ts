import type { ArenaDefinition, GridCell } from './grid'

export type ItemKind='KICK'|'THROW'|'CAPACITY'|'PIERCE'

const DIRECTIONS:GridCell[]=[{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}]

export const itemForRoll=(roll:number):ItemKind|null=>{
  if(roll<.17)return 'KICK'
  if(roll<.34)return 'THROW'
  if(roll<.54)return 'CAPACITY'
  if(roll<.68)return 'PIERCE'
  return null
}

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
