import type { ClientMessage, ServerMessage } from '../game-core/protocol'

export type NetworkSession={roomId:string;name:string}

export class NetworkClient{
  private socket?:WebSocket
  private listeners=new Set<(message:ServerMessage)=>void>()
  private session?:NetworkSession
  private reconnectTimer?:number
  private closed=false

  connect(session:NetworkSession){
    this.session=session;this.closed=false
    return new Promise<void>((resolve,reject)=>{
      this.open(resolve,reject,true)
    })
  }

  private open(resolve:()=>void,reject:(error:Error)=>void,initial:boolean){
      if(!this.session||this.closed)return
      const protocol=location.protocol==='https:'?'wss':'ws'
      const configuredUrl=import.meta.env.VITE_WS_URL?.trim()
      const socket=new WebSocket(configuredUrl||`${protocol}://${location.hostname}:5175`);this.socket=socket
      socket.addEventListener('open',()=>{if(this.closed)return;this.send({type:'JOIN',roomId:this.session!.roomId,name:this.session!.name});resolve()},{once:true})
      socket.addEventListener('error',()=>{if(initial)reject(new Error('NETWORK_UNAVAILABLE'))},{once:true})
      socket.addEventListener('message',event=>{try{const message=JSON.parse(String(event.data)) as ServerMessage;this.listeners.forEach(listener=>listener(message))}catch{/* Ignore malformed server frames. */}})
      socket.addEventListener('close',()=>{
        if(this.closed||this.socket!==socket)return
        this.listeners.forEach(listener=>listener({type:'ERROR',message:'RECONNECTING'}))
        this.reconnectTimer=window.setTimeout(()=>this.open(()=>{},()=>{},false),700)
      },{once:true})
  }

  onMessage(listener:(message:ServerMessage)=>void){this.listeners.add(listener);return()=>this.listeners.delete(listener)}
  send(message:ClientMessage){if(this.socket?.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify(message))}
  close(){this.closed=true;if(this.reconnectTimer)window.clearTimeout(this.reconnectTimer);this.socket?.close();this.listeners.clear()}
}
