export const shuffledTracks=(tracks:string[],previous='',random:()=>number=Math.random)=>{
  const shuffled=[...tracks]
  for(let index=shuffled.length-1;index>0;index--){
    const swap=Math.floor(random()*(index+1));[shuffled[index],shuffled[swap]]=[shuffled[swap],shuffled[index]]
  }
  if(shuffled.length>1&&shuffled[0]===previous)[shuffled[0],shuffled[1]]=[shuffled[1],shuffled[0]]
  return shuffled
}

export class GameMusicPlaylist{
  private readonly audio=new Audio()
  private queue:string[]=[]
  private currentTrack=''
  private closed=false

  constructor(private readonly tracks:string[],private readonly isMuted:()=>boolean){
    this.audio.volume=.28
    this.audio.preload='auto'
    this.audio.addEventListener('ended',this.handleEnded)
    this.audio.addEventListener('error',this.handleError)
    this.selectNext()
  }

  unlock(){
    if(this.closed||this.isMuted())return
    this.audio.muted=false
    void this.audio.play().catch(()=>{})
  }

  setMuted(muted:boolean){
    this.audio.muted=muted
    if(!muted)this.unlock()
  }

  close(){
    this.closed=true
    this.audio.pause()
    this.audio.removeEventListener('ended',this.handleEnded)
    this.audio.removeEventListener('error',this.handleError)
    this.audio.removeAttribute('src')
    this.audio.load()
  }

  private readonly handleEnded=()=>this.playNext()
  private readonly handleError=()=>this.playNext()

  private playNext(){
    if(this.closed)return
    this.selectNext()
    if(!this.isMuted())void this.audio.play().catch(()=>{})
  }

  private selectNext(){
    if(!this.queue.length)this.refillQueue()
    const next=this.queue.shift()
    if(!next)return
    this.currentTrack=next
    this.audio.src=next
    this.audio.load()
  }

  private refillQueue(){
    this.queue=shuffledTracks(this.tracks,this.currentTrack)
  }
}
