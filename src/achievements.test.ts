import { describe,expect,it } from 'vitest'
import { ACHIEVEMENTS,applyAchievementEvent,initialAchievementProfile } from './achievements'

describe('achievement progress',()=>{
  it('unlocks cumulative action achievements only at their targets',()=>{
    let profile=initialAchievementProfile()
    let result=applyAchievementEvent(profile,{type:'CORE_PLACED'},'now')
    expect(result.unlocked.map(item=>item.id)).toEqual(['core-initiate']);profile=result.profile
    for(let count=0;count<9;count++)profile=applyAchievementEvent(profile,{type:'JUMPED'},'now').profile
    expect(profile.unlocked['sky-hopper']).toBeUndefined()
    result=applyAchievementEvent(profile,{type:'JUMPED'},'now');expect(result.unlocked.map(item=>item.id)).toContain('sky-hopper');profile=result.profile
    for(let count=0;count<5;count++)profile=applyAchievementEvent(profile,{type:'WALL_BUILT'},'now').profile
    expect(profile.unlocked['block-architect']).toBe('now')
  })
  it('tracks maximum chain and last-heart state',()=>{
    let profile=applyAchievementEvent(initialAchievementProfile(),{type:'CHAIN_REACHED',value:1},'now').profile
    expect(profile.unlocked['chain-master']).toBeUndefined();profile=applyAchievementEvent(profile,{type:'CHAIN_REACHED',value:3},'now').profile
    expect(profile.stats.maxChain).toBe(3);expect(profile.unlocked['chain-master']).toBe('now');profile=applyAchievementEvent(profile,{type:'LOW_HEALTH'},'now').profile
    expect(profile.unlocked['last-heart']).toBe('now')
  })
  it('does not unlock the same badge twice',()=>{
    let result=applyAchievementEvent(initialAchievementProfile(),{type:'CORE_PLACED'},'first');result=applyAchievementEvent(result.profile,{type:'CORE_PLACED'},'second')
    expect(result.unlocked).toEqual([]);expect(result.profile.unlocked['core-initiate']).toBe('first')
  })
  it('unlocks the series badge after one best-of-three win',()=>{const result=applyAchievementEvent(initialAchievementProfile(),{type:'SERIES_WON'},'now');expect(result.unlocked).toContain(ACHIEVEMENTS.find(item=>item.id==='series-champion'))})
})
