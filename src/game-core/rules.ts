import type { ArenaDefinition, GridCell } from './grid'
import { cellKey, traceExplosion } from './grid'

export type CoreRuleState = GridCell & { id:string }
export type PlayerRuleState = { team:'cyan'|'coral'; hits:number; eliminated:boolean }

export const canPlaceCore = (activeCoreCount:number,capacity:number) => activeCoreCount<capacity

export const resolveChain = (arena:ArenaDefinition,initialId:string,cores:ReadonlyArray<CoreRuleState>,range:number):string[] => {
  const byId=new Map(cores.map(core=>[core.id,core]))
  const triggered:string[]=[],queued=new Set([initialId]),queue=[initialId]
  while(queue.length){
    const id=queue.shift()!,core=byId.get(id)
    if(!core)continue
    triggered.push(id)
    const cells=new Set(traceExplosion(arena,core,range).map(cellKey))
    for(const other of cores){
      if(!queued.has(other.id)&&cells.has(cellKey(other))){queued.add(other.id);queue.push(other.id)}
    }
  }
  return triggered
}

export const fluxPhase = (hits:number,downedUntil:number,now:number):'normal'|'slowed'|'downed'|'eliminated' => {
  if(hits<1)return 'normal'
  if(hits<3)return 'slowed'
  if(downedUntil>now)return 'downed'
  return 'eliminated'
}

export const matchWinner = (players:ReadonlyArray<PlayerRuleState>):'cyan'|'coral'|'draw' => {
  const score=(team:'cyan'|'coral')=>players.filter(player=>player.team===team&&!player.eliminated).length*10-players.filter(player=>player.team===team).reduce((sum,player)=>sum+player.hits,0)
  const cyan=score('cyan'),coral=score('coral')
  return cyan===coral?'draw':cyan>coral?'cyan':'coral'
}
