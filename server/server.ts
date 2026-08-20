import { createServer } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import type { ClientMessage, ServerMessage } from '../src/game-core/protocol'
import { Room } from './Room'

const PORT=Number(process.env.PORT??process.env.SPLASH_SERVER_PORT??5175)
const HOST=process.env.HOST??'0.0.0.0'
const rooms=new Map<string,Room>()
const clients=new Map<WebSocket,{id:string;room?:Room}>()
let clientId=0

const send=(socket:WebSocket,message:ServerMessage)=>socket.readyState===socket.OPEN&&socket.send(JSON.stringify(message))
const broadcast=(room:Room,message:ServerMessage)=>{for(const [socket,meta] of clients)if(meta.room===room)send(socket,message)}
const roomId=(value:string)=>value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8)||'FLUX7'

const httpServer=createServer((request,response)=>{
  if(request.url==='/health'){
    response.writeHead(200,{'content-type':'application/json'})
    response.end(JSON.stringify({status:'ok',rooms:rooms.size,clients:clients.size}))
    return
  }
  response.writeHead(200,{'content-type':'text/plain; charset=utf-8'})
  response.end('Rock Sizzle Preppers WebSocket server')
})
const wss=new WebSocketServer({server:httpServer})
wss.on('connection',socket=>{
  const meta={id:`p${++clientId}`,room:undefined as Room|undefined};clients.set(socket,meta)
  socket.on('message',raw=>{
    let message:ClientMessage
    try{message=JSON.parse(raw.toString()) as ClientMessage}catch{send(socket,{type:'ERROR',message:'INVALID_MESSAGE'});return}
    if(message.type==='JOIN'){
      const id=roomId(message.roomId),room=rooms.get(id)??new Room(id);rooms.set(id,room)
      try{const player=room.join(meta.id,message.name,Date.now(),message.variant);meta.room=room;send(socket,{type:'WELCOME',playerId:player.id,slot:player.slot,roomId:id})}catch{send(socket,{type:'ERROR',message:'ROOM_FULL'})}
      return
    }
    if(!meta.room){send(socket,{type:'ERROR',message:'JOIN_REQUIRED'});return}
    if(message.type==='INPUT')meta.room.input(meta.id,message.seq,message.dx,message.dz)
    if(message.type==='ACTION')meta.room.action(meta.id,message.action,message.direction)
    if(message.type==='REMATCH')meta.room.rematch(meta.id)
  })
  socket.on('close',()=>{meta.room?.leave(meta.id);clients.delete(socket)})
})

setInterval(()=>{for(const room of rooms.values())room.step(1/30)},1000/30)
setInterval(()=>{for(const room of rooms.values()){while(room.events.length)broadcast(room,{type:'GAME_EVENT',...room.events.shift()!});broadcast(room,{type:'SNAPSHOT',snapshot:room.snapshot()})}},1000/15)

httpServer.listen(PORT,HOST,()=>console.log(`Rock Sizzle Preppers authoritative server listening on ws://${HOST}:${PORT}`))
