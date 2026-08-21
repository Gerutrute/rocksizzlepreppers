import { describe,expect,it } from 'vitest'
import { createRippleModel } from './RippleModel'
import { poseRippleRig, RIPPLE_GESTURE_DURATION, rippleGestureWeight, rippleStepRate, solveRippleLeg } from './RippleAnimator'

describe('Ripple locomotion rig',()=>{
  it('plants one foot while lifting the opposite foot during a stride',()=>{
    const left=solveRippleLeg(0,1),right=solveRippleLeg(Math.PI,1)
    expect(left.lift).toBeGreaterThan(.08)
    expect(right.lift).toBeCloseTo(0,5)
    expect(Number.isFinite(left.hip+left.knee+left.ankle)).toBe(true)
  })

  it('returns a stable symmetrical idle stance',()=>{
    const left=solveRippleLeg(0,0),right=solveRippleLeg(Math.PI,0)
    expect(left.lift).toBe(0)
    expect(left.hip).toBeCloseTo(right.hip,5)
    expect(left.knee).toBeCloseTo(right.knee,5)
  })

  it('gives the four silhouettes distinct but controlled step cadences',()=>{
    const rates=['bloo','lumi','coral','vio'].map(variant=>rippleStepRate(variant as 'bloo'|'lumi'|'coral'|'vio'))
    expect(new Set(rates).size).toBe(4)
    expect(Math.min(...rates)).toBeGreaterThan(4.5)
    expect(Math.max(...rates)).toBeLessThan(6)
  })

  it('eases action gestures in and out without leaving a frozen pose',()=>{
    expect(rippleGestureWeight(0)).toBeCloseTo(0,5)
    expect(rippleGestureWeight(.5)).toBeCloseTo(1,5)
    expect(rippleGestureWeight(1)).toBeCloseTo(0,5)
    const actionDurations=Object.entries(RIPPLE_GESTURE_DURATION).filter(([gesture])=>gesture!=='taunt').map(([,duration])=>duration)
    expect(Math.min(...actionDurations)).toBeGreaterThanOrEqual(400)
    expect(Math.max(...actionDurations)).toBeLessThanOrEqual(700)
    expect(RIPPLE_GESTURE_DURATION.taunt).toBe(1650)
  })

  it('gives every character a distinct rigged taunt silhouette',()=>{
    const signatures=['bloo','lumi','coral','vio'].map(variant=>{
      const {rig}=createRippleModel(variant as 'bloo'|'lumi'|'coral'|'vio')
      for(let frame=0;frame<24;frame++)poseRippleRig(rig,0,0,1/60,frame*16,0,0,0,'taunt',.42)
      return [rig.leftShin.rotation.x,rig.rightShin.rotation.x,rig.body.rotation.x,rig.body.rotation.y,rig.body.rotation.z,rig.body.scale.y].map(value=>value.toFixed(3)).join(',')
    })
    expect(new Set(signatures).size).toBe(4)
  })

  it('leans into a dash with both arms trailing behind',()=>{
    const {rig}=createRippleModel('bloo')
    for(let frame=0;frame<20;frame++)poseRippleRig(rig,0,0,1/60,frame*16,0,0,0,'dash',.5)
    expect(rig.leftArm.rotation.x).toBeGreaterThan(.45)
    expect(rig.rightArm.rotation.x).toBeGreaterThan(.45)
    expect(rig.body.rotation.x).toBeGreaterThan(.16)
  })

  it('settles into a readable asymmetrical downed pose',()=>{
    const {rig}=createRippleModel('vio')
    for(let frame=0;frame<24;frame++)poseRippleRig(rig,0,0,1/60,frame*16,0,0,0,null,0,1)
    expect(rig.leftShin.rotation.x).toBeGreaterThan(1)
    expect(rig.body.position.y).toBeLessThan(0)
    expect(rig.body.rotation.z).toBeGreaterThan(.1)
    expect(rig.eyes[0].scale.y).toBeLessThan(.75)
  })
})
