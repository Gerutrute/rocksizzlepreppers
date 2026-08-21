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
  const cells:GridCell[]=[]
  const minX=Math.max(-arena.halfX,Math.ceil(origin.x-range)),maxX=Math.min(arena.halfX,Math.floor(origin.x+range))
  const minZ=Math.max(-arena.halfZ,Math.ceil(origin.z-range)),maxZ=Math.min(arena.halfZ,Math.floor(origin.z+range))
  for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++)if(Math.hypot(x-origin.x,z-origin.z)<=range+.001)cells.push({x,z})
  return cells
}

export const isInsideCircularBlast=(origin:{x:number;z:number},target:{x:number;z:number},range:number,targetRadius=0)=>Math.hypot(target.x-origin.x,target.z-origin.z)<=range+targetRadius

export const getDangerCells = (arena:ArenaDefinition,cores:ReadonlyArray<GridCell>,range:number) => {
  const unique=new Map<string,GridCell>()
  cores.flatMap(core=>traceExplosion(arena,core,range)).forEach(cell=>unique.set(cellKey(cell),cell))
  return [...unique.values()]
}
