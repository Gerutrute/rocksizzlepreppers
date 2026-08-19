import type { ArenaDefinition, GridCell } from './grid'

const DIRECTIONS:GridCell[]=[{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}]

export const blastHitWalls=(arena:ArenaDefinition,origin:GridCell,range:number):GridCell[]=>{
  const hits:GridCell[]=[]
  for(const direction of DIRECTIONS){
    for(let step=1;step<=range;step++){
      const cell={x:origin.x+direction.x*step,z:origin.z+direction.z*step}
      if(Math.abs(cell.x)>arena.halfX||Math.abs(cell.z)>arena.halfZ)break
      if(arena.walls.has(`${cell.x},${cell.z}`)){hits.push(cell);break}
    }
  }
  return hits
}
