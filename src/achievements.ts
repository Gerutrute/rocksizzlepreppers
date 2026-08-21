export type AchievementId =
  | 'core-initiate'
  | 'sky-hopper'
  | 'block-architect'
  | 'chain-master'
  | 'last-heart'
  | 'series-champion'

export type AchievementMetric = 'coresPlaced'|'jumps'|'wallsBuilt'|'maxChain'|'lastHeart'|'seriesWins'
export type AchievementDefinition = {id:AchievementId;title:string;description:string;badge:string;metric:AchievementMetric;target:number;mode:'count'|'max'}

export const ACHIEVEMENTS:AchievementDefinition[]=[
  {id:'core-initiate',title:'코어 입문자',description:'처음으로 Splash Core를 설치하세요.',badge:'/assets/achievements/core-initiate.webp',metric:'coresPlaced',target:1,mode:'count'},
  {id:'sky-hopper',title:'스카이 호퍼',description:'누적 10번 점프하세요.',badge:'/assets/achievements/sky-hopper.webp',metric:'jumps',target:10,mode:'count'},
  {id:'block-architect',title:'블록 건축가',description:'장애물을 누적 5개 설치하세요.',badge:'/assets/achievements/block-architect.webp',metric:'wallsBuilt',target:5,mode:'count'},
  {id:'chain-master',title:'연쇄의 달인',description:'2단계 이상의 폭발 연쇄를 만드세요.',badge:'/assets/achievements/chain-master.webp',metric:'maxChain',target:2,mode:'max'},
  {id:'last-heart',title:'마지막 심장',description:'체력 1을 남기고 살아남으세요.',badge:'/assets/achievements/last-heart.webp',metric:'lastHeart',target:1,mode:'max'},
  {id:'series-champion',title:'시리즈 챔피언',description:'3판 2선승 매치에서 최종 승리하세요.',badge:'/assets/achievements/series-champion.webp',metric:'seriesWins',target:1,mode:'count'},
]

export type AchievementStats=Record<AchievementMetric,number>
export type AchievementProfile={version:1;stats:AchievementStats;unlocked:Partial<Record<AchievementId,string>>}
export type AchievementEvent={type:'CORE_PLACED'}|{type:'JUMPED'}|{type:'WALL_BUILT'}|{type:'CHAIN_REACHED';value:number}|{type:'LOW_HEALTH'}|{type:'SERIES_WON'}
export const ACHIEVEMENT_UNLOCKED_EVENT='rock-sizzle-achievement-unlocked'
export const ACHIEVEMENT_PROFILE_EVENT='rock-sizzle-achievement-profile'
const STORAGE_KEY='rock-sizzle-preppers-achievements-v1'
export type AchievementUnlockDetail={achievement:AchievementDefinition;profile:AchievementProfile}

const EMPTY_STATS:AchievementStats={coresPlaced:0,jumps:0,wallsBuilt:0,maxChain:0,lastHeart:0,seriesWins:0}
export const initialAchievementProfile=():AchievementProfile=>({version:1,stats:{...EMPTY_STATS},unlocked:{}})
const safeCount=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>0?Math.floor(value):0

export function normalizeAchievementProfile(value:unknown):AchievementProfile{
  const raw=value&&typeof value==='object'?value as Partial<AchievementProfile>:{}
  const stats=raw.stats&&typeof raw.stats==='object'?raw.stats as Partial<AchievementStats>:{}
  const unlocked=raw.unlocked&&typeof raw.unlocked==='object'?raw.unlocked:{}
  const validUnlocked:Partial<Record<AchievementId,string>>={}
  for(const achievement of ACHIEVEMENTS){const date=unlocked[achievement.id];if(typeof date==='string')validUnlocked[achievement.id]=date}
  return {version:1,stats:{coresPlaced:safeCount(stats.coresPlaced),jumps:safeCount(stats.jumps),wallsBuilt:safeCount(stats.wallsBuilt),maxChain:safeCount(stats.maxChain),lastHeart:safeCount(stats.lastHeart),seriesWins:safeCount(stats.seriesWins)},unlocked:validUnlocked}
}

export function applyAchievementEvent(profile:AchievementProfile,event:AchievementEvent,unlockedAt=new Date().toISOString()){
  const next=normalizeAchievementProfile(profile)
  switch(event.type){
    case 'CORE_PLACED':next.stats.coresPlaced+=1;break
    case 'JUMPED':next.stats.jumps+=1;break
    case 'WALL_BUILT':next.stats.wallsBuilt+=1;break
    case 'CHAIN_REACHED':next.stats.maxChain=Math.max(next.stats.maxChain,safeCount(event.value));break
    case 'LOW_HEALTH':next.stats.lastHeart=1;break
    case 'SERIES_WON':next.stats.seriesWins+=1;break
  }
  const unlocked:AchievementDefinition[]=[]
  for(const achievement of ACHIEVEMENTS){if(next.stats[achievement.metric]>=achievement.target&&!next.unlocked[achievement.id]){next.unlocked[achievement.id]=unlockedAt;unlocked.push(achievement)}}
  return {profile:next,unlocked}
}

export function readAchievementProfile():AchievementProfile{
  if(typeof window==='undefined')return initialAchievementProfile()
  try{const saved=window.localStorage.getItem(STORAGE_KEY);return saved?normalizeAchievementProfile(JSON.parse(saved)):initialAchievementProfile()}catch{return initialAchievementProfile()}
}

export function recordAchievementEvent(event:AchievementEvent):AchievementDefinition[]{
  if(typeof window==='undefined')return []
  const result=applyAchievementEvent(readAchievementProfile(),event)
  try{window.localStorage.setItem(STORAGE_KEY,JSON.stringify(result.profile))}catch{/* Keep the current unlock notification even when storage is unavailable. */}
  window.dispatchEvent(new CustomEvent(ACHIEVEMENT_PROFILE_EVENT,{detail:result.profile}))
  for(const achievement of result.unlocked)window.dispatchEvent(new CustomEvent<AchievementUnlockDetail>(ACHIEVEMENT_UNLOCKED_EVENT,{detail:{achievement,profile:result.profile}}))
  return result.unlocked
}

export function achievementProgress(achievement:AchievementDefinition,profile:AchievementProfile){const value=profile.stats[achievement.metric];return {value,displayValue:Math.min(value,achievement.target),ratio:Math.min(1,value/achievement.target)}}
