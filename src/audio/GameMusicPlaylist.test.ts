import { describe,expect,it } from 'vitest'
import { shuffledTracks } from './GameMusicPlaylist'

describe('game music playlist',()=>{
  it('plays every track once and avoids repeating the previous track first',()=>{
    const tracks=['bounce','rush-1','rush-2']
    const shuffled=shuffledTracks(tracks,'bounce',()=>0)
    expect(new Set(shuffled)).toEqual(new Set(tracks))
    expect(shuffled).toHaveLength(tracks.length)
    expect(shuffled[0]).not.toBe('bounce')
    expect(tracks).toEqual(['bounce','rush-1','rush-2'])
  })
})
