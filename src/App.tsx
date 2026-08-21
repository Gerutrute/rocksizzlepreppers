import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ChevronRight, Copy, Gamepad2, Play, Radio, Sparkles, Users, Volume2, VolumeX, Zap } from 'lucide-react'
import type { RippleVariant } from './game-core/protocol'
import type { NetworkSession } from './network/NetworkClient'
import { ACHIEVEMENTS, ACHIEVEMENT_PROFILE_EVENT, achievementProgress, readAchievementProfile, type AchievementProfile } from './achievements'

const SplashArena = lazy(() => import('./SplashArena'))
const KEY_ART = '/assets/splash/project-splash-key-art-v2-web.jpg'
const BLUE = '/assets/splash/ripple-blue-keyart-v2-web.png'
const RED = '/assets/splash/ripple-red-keyart-v2-web.png'
const YELLOW = '/assets/splash/ripple-yellow-keyart-v2-web.png'
const VIO = '/assets/splash/ripple-vio-keyart-v1-web.webp'
const LOBBY_MUSIC = '/assets/audio/purrfectly-chaotic.mp3'

function Mark() { return <span className="splash-mark" aria-hidden="true"><i/><i/><b/></span> }

const fighters = [
  { id:'01', variant:'bloo' as RippleVariant, name:'BLOO', role:'CORE TACTICIAN', image:BLUE, color:'blue', copy:'긴 안테나로 에너지 흐름을 읽고\n정교한 연쇄 경로를 설계합니다.' },
  { id:'02', variant:'coral' as RippleVariant, name:'CORAL', role:'CHAOS RUNNER', image:RED, color:'red', copy:'짧은 대시와 재빠른 방향 전환으로\n폭발 직전의 틈을 파고듭니다.' },
  { id:'03', variant:'lumi' as RippleVariant, name:'LUMI', role:'WORLD MOVER', image:YELLOW, color:'yellow', copy:'코어와 환경을 밀어 움직이며\n예상 밖의 혼돈을 만들어냅니다.' },
  { id:'04', variant:'vio' as RippleVariant, name:'VIO', role:'RESCUE RUNNER', image:VIO, color:'violet', copy:'Flux Lock 신호를 쫓아 질주하며\n마지막 6초에 팀원을 구출합니다.' },
]

function Lobby({ onPlay,onRoom }:{ onPlay:(variant?:RippleVariant)=>void;onRoom:()=>void }) {
  const [musicMuted,setMusicMuted]=useState(false)
  const [musicStarted,setMusicStarted]=useState(false)
  const [achievementProfile,setAchievementProfile]=useState<AchievementProfile>(readAchievementProfile)
  const musicRef=useRef<HTMLAudioElement|null>(null)
  const startMusic=()=>{
    const music=musicRef.current
    if(!music||music.muted)return
    if(!music.paused){setMusicStarted(true);return}
    void music.play().then(()=>setMusicStarted(true)).catch(()=>setMusicStarted(false))
  }
  useEffect(()=>{
    const music=new Audio(LOBBY_MUSIC);music.loop=true;music.volume=.32;music.preload='auto';musicRef.current=music
    startMusic();window.addEventListener('pointerdown',startMusic);window.addEventListener('keydown',startMusic)
    return()=>{window.removeEventListener('pointerdown',startMusic);window.removeEventListener('keydown',startMusic);music.pause();music.currentTime=0;musicRef.current=null}
  },[])
  useEffect(()=>{const music=musicRef.current;if(!music)return;music.muted=musicMuted;if(!musicMuted)startMusic()},[musicMuted])
  useEffect(()=>{const refresh=()=>setAchievementProfile(readAchievementProfile());window.addEventListener(ACHIEVEMENT_PROFILE_EVENT,refresh);window.addEventListener('storage',refresh);return()=>{window.removeEventListener(ACHIEVEMENT_PROFILE_EVENT,refresh);window.removeEventListener('storage',refresh)}},[])
  const unlockedCount=ACHIEVEMENTS.filter(achievement=>achievementProfile.unlocked[achievement.id]).length
  return <main className="lobby">
    {!musicStarted&&!musicMuted&&<div className="sound-entry" role="dialog" aria-modal="true" aria-label="음악과 함께 사이트 입장">
      <div className="sound-entry-card"><Mark/><span>TURN UP THE CHAOS</span><h2>ROCK SIZZLE<br/><strong>PREPPERS</strong></h2><p>음악과 함께 거대한 놀이방으로 입장하세요.</p><button onClick={startMusic} autoFocus><Volume2/> 사운드 켜고 입장</button><small>CLICK TO START · MUSIC ON</small></div>
    </div>}
    <nav className="nav">
      <a className="brand" href="#top"><Mark/><span>ROCK SIZZLE</span><strong>PREPPERS</strong></a>
      <div className="nav-links"><a href="#ripples">리플</a><a href="#how">게임 소개</a><a href="#achievements">업적</a><a href="#arena">아레나</a></div>
      <span className="online"><i/> ARENA ONLINE</span>
      <button className={`lobby-sound ${musicMuted?'muted':''}`} onClick={()=>setMusicMuted(value=>!value)} aria-label={musicMuted?'홈 음악 켜기':'홈 음악 끄기'} title="Purrfectly Chaotic">{musicMuted?<VolumeX/>:<Volume2/>}</button>
      <button className="nav-play" onClick={()=>onPlay()}><Play fill="currentColor"/> QUICK MATCH</button>
    </nav>

    <section className="hero" id="top">
      <img className="hero-bg" src={KEY_ART} alt="거대한 놀이방에서 펼쳐지는 Rock Sizzle Preppers 코어 배틀"/>
      <div className="hero-vignette"/>
      <div className="hero-copy">
        <span className="season-pill"><Radio/> FIRST PLAYABLE · LIVE</span>
        <p className="eyebrow">3D MULTIPLAYER CHAOS ARENA</p>
        <h1><span>ROCK SIZZLE</span><strong>PREPPERS</strong></h1>
        <p className="tagline">PREDICT THE PLAYER.<br/><b>MANIPULATE THE WORLD.</b><br/>ESCAPE THE CHAOS.</p>
        <div className="hero-actions">
          <button className="primary" onClick={()=>onPlay()}><Play fill="currentColor"/><span><b>PLAY AS GUEST</b><small>설치 없이 바로 입장</small></span><ChevronRight/></button>
          <button className="room" onClick={onRoom}><Users/><span><b>FLUX-7</b><small>ONLINE ROOM</small></span></button>
        </div>
        <div className="match-facts"><span><b>1–4</b> PLAYERS</span><i/><span><b>3</b> MINUTES</span><i/><span><b>ZERO</b> DOWNLOAD</span></div>
      </div>
      <div className="hero-party"><img src={BLUE}/><img src={RED}/><img src={YELLOW}/><img src={VIO}/><span><Users/> 2V2 BOT FILL READY</span></div>
      <div className="scroll-cue">SCROLL TO DISCOVER <i/></div>
    </section>

    <section className="ripples" id="ripples">
      <div className="section-copy"><span>MEET THE RIPPLES</span><h2>작고 둥글고.<br/><em>혼돈에는 진심입니다.</em></h2><p>키 아트의 단순한 얼굴, 발광 안테나, 소프트 토이 재질을 모든 캐릭터의 공통 언어로 사용합니다.</p></div>
      <div className="fighter-cards">{fighters.map(f=><article className={`fighter ${f.color}`} key={f.name}><span className="fighter-no">{f.id}</span><img src={f.image} alt={`${f.name} 리플 캐릭터`}/><div><small>{f.role}</small><h3>{f.name}</h3><p>{f.copy.split('\n').map((line,i)=><span key={line}>{line}{i===0&&<br/>}</span>)}</p><button onClick={()=>onPlay(f.variant)}>SELECT &amp; PLAY <ChevronRight/></button></div></article>)}</div>
    </section>

    <section className="how" id="how">
      <div className="section-copy centered"><span>THE SPLASH LOOP</span><h2>예측하고. 연결하고. <em>탈출하라.</em></h2></div>
      <div className="steps">
        <article><b>01</b><div className="step-icon cyan"><Zap/></div><h3>PLACE</h3><p>상대의 다음 칸을 읽고<br/>Splash Core를 설치하세요.</p><kbd>F</kbd></article>
        <article><b>02</b><div className="step-icon violet"><Sparkles/></div><h3>CHAIN</h3><p>에너지 경로를 겹쳐 더 멀리,<br/>더 강한 연쇄를 설계하세요.</p><kbd>CORE ×4</kbd></article>
        <article><b>03</b><div className="step-icon coral"><Gamepad2/></div><h3>ESCAPE</h3><p>마지막 순간 대시로 빠져나가<br/>내가 만든 혼돈에서 생존하세요.</p><kbd>SHIFT</kbd></article>
      </div>
    </section>

    <section className="achievements" id="achievements">
      <div className="section-copy centered"><span>RIPPLE BADGE ARCHIVE</span><h2>플레이하고. 도전하고. <em>배지를 모으세요.</em></h2><p>행동과 전투 기록은 이 브라우저에 계속 누적됩니다.</p><strong className="achievement-total">{unlockedCount} / {ACHIEVEMENTS.length} UNLOCKED</strong></div>
      <div className="achievement-grid">{ACHIEVEMENTS.map(achievement=>{
        const unlocked=!!achievementProfile.unlocked[achievement.id]
        const progress=achievementProgress(achievement,achievementProfile)
        return <article className={unlocked?'unlocked':'locked'} key={achievement.id}>
          <div className="badge-frame"><img src={achievement.badge} alt={`${achievement.title} 배지`}/>{!unlocked&&<span>?</span>}</div>
          <small>{unlocked?'BADGE ACQUIRED':'CHALLENGE IN PROGRESS'}</small>
          <h3>{achievement.title}</h3>
          <p>{achievement.description}</p>
          <div className="achievement-progress" aria-label={`${progress.displayValue}/${achievement.target}`}><i style={{width:`${progress.ratio*100}%`}}/></div>
          <b>{progress.displayValue} / {achievement.target}</b>
        </article>
      })}</div>
    </section>

    <section className="arena-preview" id="arena">
      <div className="arena-copy"><span>GIANT PLAYROOM · ONLINE ROOM + BOT FILL</span><h2>작은 링크 하나.<br/><em>거대한 놀이방 하나.</em></h2><p>책, 블록, 튜브와 선풍기가 전장의 일부가 됩니다. 링크로 친구가 참가하면 서버 Bot 슬롯을 이어받고, 이동·Core·연쇄 파동·Flux Lock·구조를 같은 권위 Snapshot으로 플레이합니다.</p><button onClick={()=>onPlay()}><Gamepad2/> 로컬 아레나 입장 <ChevronRight/></button></div>
      <div className="arena-cast"><img src={BLUE}/><img src={RED}/><img src={YELLOW}/><img src={VIO}/></div>
    </section>

    <footer><a className="brand" href="#top"><Mark/><span>ROCK SIZZLE</span><strong>PREPPERS</strong></a><p>CLICK A LINK · START CHAOS</p><small>FIRST PLAYABLE · 2026</small></footer>
  </main>
}

function RoomJoin({roomId,variant,onVariant,onBack,onJoin}:{roomId:string;variant:RippleVariant;onVariant:(variant:RippleVariant)=>void;onBack:()=>void;onJoin:(session:NetworkSession)=>void}){
  const [name,setName]=useState(`RIPPLE-${Math.floor(100+Math.random()*900)}`)
  const [copied,setCopied]=useState(false)
  const invite=`${location.origin}${location.pathname}?room=${roomId}`
  const copyInvite=async()=>{await navigator.clipboard?.writeText(invite);setCopied(true);window.setTimeout(()=>setCopied(false),1500)}
  return <main className="room-gate"><img src={KEY_ART}/><div className="room-gate-shade"/><section><Mark/><span>AUTHORITATIVE ROOM</span><h1>{roomId}</h1><p>닉네임과 캐릭터를 정하면 WebSocket 아레나에 즉시 참가합니다.<br/>빈 슬롯은 Rock Sizzle Preppers Bot이 채웁니다.</p><div className="room-fighters" aria-label="캐릭터 선택">{fighters.map(fighter=><button key={fighter.variant} className={variant===fighter.variant?'selected':''} onClick={()=>onVariant(fighter.variant)}><img src={fighter.image}/><span>{fighter.name}</span></button>)}</div><label>GUEST NAME<input value={name} maxLength={16} onChange={event=>setName(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&name.trim())onJoin({roomId,name:name.trim(),variant})}}/></label><div><button className="join" disabled={!name.trim()} onClick={()=>onJoin({roomId,name:name.trim(),variant})}><Radio/> READY &amp; JOIN</button><button onClick={copyInvite}><Copy/> {copied?'LINK COPIED':'COPY INVITE'}</button></div><button className="room-back" onClick={onBack}>← 로비로 돌아가기</button></section></main>
}

export default function App(){
  const [playing,setPlaying]=useState(false)
  const initialRoom=new URLSearchParams(location.search).get('room')?.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8)??''
  const [room,setRoom]=useState(initialRoom)
  const [selectedVariant,setSelectedVariant]=useState<RippleVariant>('bloo')
  const [networkSession,setNetworkSession]=useState<NetworkSession|null>(null)
  useEffect(()=>{const onKey=(event:KeyboardEvent)=>{if(!playing&&event.key==='Enter')setPlaying(true)};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[playing])
  return playing
    ? <Suspense fallback={<div className="boot"><Mark/><b>OPENING THE PLAYROOM</b><span/></div>}><SplashArena onExit={()=>{setPlaying(false);setNetworkSession(null)}} networkSession={networkSession??undefined} selectedVariant={selectedVariant}/></Suspense>
    : room
      ? <RoomJoin roomId={room} variant={selectedVariant} onVariant={setSelectedVariant} onBack={()=>{setRoom('');history.replaceState({},'',location.pathname)}} onJoin={session=>{setSelectedVariant(session.variant);setNetworkSession(session);setPlaying(true)}}/>
      : <Lobby onPlay={variant=>{if(variant)setSelectedVariant(variant);setPlaying(true)}} onRoom={()=>{setRoom('FLUX7');history.replaceState({},'',`${location.pathname}?room=FLUX7`)}}/>
}
