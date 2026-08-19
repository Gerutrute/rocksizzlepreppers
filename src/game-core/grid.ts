export type GridCell = { x:number; z:number }

export type ArenaDefinition = {
  halfX:number
  halfZ:number
  walls:ReadonlySet<string>
  spawnPoints:ReadonlyArray<GridCell>
}

export const cellKey = ({x,z}:GridCell) => `${x},${z}`

export const worldToGrid = (position:GridCell):GridCell => ({x:Math.round(position.x),z:Math.round(position.z)})

export const gridToWorld = (cell:GridCell):GridCell => ({x:cell.x,z:cell.z})

export const isCellBlocked = (arena:ArenaDefinition,cell:GridCell) => Math.abs(cell.x)>arena.halfX||Math.abs(cell.z)>arena.halfZ||arena.walls.has(cellKey(cell))

export const getNeighbors = (cell:GridCell):GridCell[] => [
  {x:cell.x+1,z:cell.z},{x:cell.x-1,z:cell.z},{x:cell.x,z:cell.z+1},{x:cell.x,z:cell.z-1},
]

export const traceExplosion = (arena:ArenaDefinition,origin:GridCell,range:number):GridCell[] => {
  const cells=[origin]
  for(const direction of [{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}]){
    for(let distance=1;distance<=range;distance++){
      const cell={x:origin.x+direction.x*distance,z:origin.z+direction.z*distance}
      if(isCellBlocked(arena,cell))break
      cells.push(cell)
    }
  }
  return cells
}

export const getDangerCells = (arena:ArenaDefinition,cores:ReadonlyArray<GridCell>,range:number) => {
  const unique=new Map<string,GridCell>()
  cores.flatMap(core=>traceExplosion(arena,core,range)).forEach(cell=>unique.set(cellKey(cell),cell))
  return [...unique.values()]
}
