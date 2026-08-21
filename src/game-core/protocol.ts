export type Team = 'cyan'|'coral'
export type ItemKind = 'KICK'|'THROW'|'CAPACITY'|'PIERCE'
export type RippleVariant = 'bloo'|'lumi'|'coral'|'vio'

export type NetworkPlayer = {
  id:string
  name:string
  slot:number
  bot:boolean
  team:Team
  variant:RippleVariant
  x:number
  z:number
  yaw:number
  hits:number
  bombCapacity:number
  canKick:boolean
  canThrow:boolean
  kickLevel:number
  throwLevel:number
  pierceCharges:number
  jumpY:number
  jumpReady:number
  buildReady:number
  falling:boolean
  downedUntil:number
  eliminated:boolean
  lastInput:number
}

export type NetworkCore = {
  id:string
  owner:string
  team:Team
  x:number
  z:number
  y:number
  fuse:number
  piercing:boolean
}

export type NetworkItem={id:string;kind:ItemKind;x:number;z:number}

export type RoomSnapshot = {
  roomId:string
  tick:number
  serverTime:number
  phase:'COUNTDOWN'|'PLAYING'|'ROUND_ENDED'|'ENDED'
  round:number
  scores:Record<Team,number>
  roundWinner:Team|'draw'|null
  countdown:number
  remaining:number
  fan:'CALM'|'WARNING'|'ACTIVE'
  vehicle:{active:boolean;x:number;z:number}
  ended:boolean
  winner:Team|'draw'|null
  players:NetworkPlayer[]
  cores:NetworkCore[]
  items:NetworkItem[]
  holes:string[]
  walls:string[]
  destroyedWalls:string[]
}

export type ClientMessage =
  | {type:'JOIN';roomId:string;name:string;variant:RippleVariant}
  | {type:'INPUT';seq:number;dx:number;dz:number}
  | {type:'ACTION';seq:number;action:'PLACE'|'DASH'|'KICK'|'THROW'|'RESCUE'|'JUMP'|'BUILD';direction:{x:number;z:number}}
  | {type:'REMATCH'}

export type ServerMessage =
  | {type:'WELCOME';playerId:string;slot:number;roomId:string}
  | {type:'SNAPSHOT';snapshot:RoomSnapshot}
  | {type:'GAME_EVENT';event:string;actorId?:string;targetId?:string;coreId?:string;itemId?:string;kind?:ItemKind;x?:number;y?:number;z?:number;team?:Team;chain?:number;piercing?:boolean;damage?:number;hits?:number;remainingHits?:number;maxHits?:number}
  | {type:'ERROR';message:string}
