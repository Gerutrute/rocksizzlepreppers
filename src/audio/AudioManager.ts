export class AudioManager{
  private context?:AudioContext
  constructor(private readonly isMuted:()=>boolean){}

  unlock(){if(this.isMuted())return;this.context??=new AudioContext();if(this.context.state==='suspended')void this.context.resume()}

  place(){this.tone(360,.08,'sine',.04);window.setTimeout(()=>this.tone(520,.09,'sine',.035),65)}
  jump(){this.tone(360,.09,'triangle',.032)}
  cooldown(){this.tone(520,.08,'sine',.028)}
  hurt(){this.tone(180,.16,'sawtooth',.028)}
  fluxLocked(){this.sweep(340,100,.19,'sawtooth',.05)}
  dash(){this.sweep(260,680,.13,'triangle',.035)}
  throwCore(){this.sweep(310,820,.22,'sine',.045)}
  kick(){this.tone(145,.09,'square',.032)}
  rescue(){this.tone(520,.11,'sine',.04);window.setTimeout(()=>this.tone(780,.18,'sine',.045),90)}
  warning(){this.tone(220,.12,'sawtooth',.025);window.setTimeout(()=>this.tone(220,.12,'sawtooth',.025),230)}
  explode(team:'cyan'|'coral',chain=1){this.sweep(team==='cyan'?170:135,team==='cyan'?72:58,.22,'sawtooth',Math.min(.07,.035+chain*.006));this.tone(team==='cyan'?760:610,.11,'sine',.035)}

  close(){void this.context?.close();this.context=undefined}

  private tone(frequency:number,duration:number,type:OscillatorType,gainValue:number){
    if(this.isMuted())return;this.unlock();const context=this.context;if(!context)return
    const oscillator=context.createOscillator(),gain=context.createGain(),now=context.currentTime
    oscillator.type=type;oscillator.frequency.setValueAtTime(frequency,now);gain.gain.setValueAtTime(gainValue,now);gain.gain.exponentialRampToValueAtTime(.0001,now+duration)
    oscillator.connect(gain).connect(context.destination);oscillator.start(now);oscillator.stop(now+duration)
  }

  private sweep(from:number,to:number,duration:number,type:OscillatorType,gainValue:number){
    if(this.isMuted())return;this.unlock();const context=this.context;if(!context)return
    const oscillator=context.createOscillator(),gain=context.createGain(),now=context.currentTime
    oscillator.type=type;oscillator.frequency.setValueAtTime(from,now);oscillator.frequency.exponentialRampToValueAtTime(Math.max(1,to),now+duration);gain.gain.setValueAtTime(gainValue,now);gain.gain.exponentialRampToValueAtTime(.0001,now+duration)
    oscillator.connect(gain).connect(context.destination);oscillator.start(now);oscillator.stop(now+duration)
  }
}
