export type Team = 'cyan'|'coral'

export type NetworkPlayer = {
  id:string
  name:string
  slot:number
  bot:boolean
  team:Team
  x:number
  z:number
  yaw:number
  hits:number
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
  fuse:number
}

export type RoomSnapshot = {
  roomId:string
  tick:number
  serverTime:number
  phase:'COUNTDOWN'|'PLAYING'|'ENDED'
  countdown:number
  remaining:number
  fan:'CALM'|'WARNING'|'ACTIVE'
  vehicle:{active:boolean;x:number;z:number}
  ended:boolean
  winner:Team|'draw'|null
  players:NetworkPlayer[]
  cores:NetworkCore[]
  destroyedWalls:string[]
}

export type ClientMessage =
  | {type:'JOIN';roomId:string;name:string}
  | {type:'INPUT';seq:number;dx:number;dz:number}
  | {type:'ACTION';seq:number;action:'PLACE'|'DASH'|'KICK'|'THROW'|'RESCUE';direction:{x:number;z:number}}
  | {type:'REMATCH'}

export type ServerMessage =
  | {type:'WELCOME';playerId:string;slot:number;roomId:string}
  | {type:'SNAPSHOT';snapshot:RoomSnapshot}
  | {type:'GAME_EVENT';event:string;actorId?:string;targetId?:string;coreId?:string;x?:number;z?:number;team?:Team;chain?:number}
  | {type:'ERROR';message:string}
