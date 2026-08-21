import type { ArenaDefinition, GridCell } from './grid'
import { traceExplosion } from './grid'

export const blastHitWalls=(arena:ArenaDefinition,origin:GridCell,range:number):GridCell[]=>{
  return traceExplosion(arena,origin,range).filter(cell=>arena.walls.has(`${cell.x},${cell.z}`))
}
