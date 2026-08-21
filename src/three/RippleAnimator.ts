import * as THREE from 'three'
import type { RippleRig, RippleVariant } from './RippleModel'

const HIP_HEIGHT=.46
const UPPER_LEG=.24
const LOWER_LEG=.23
const FOOT_STRIDE=.11
const FOOT_LIFT=.085

type LegPose={hip:number;knee:number;ankle:number;lift:number}
type MotionProfile={stepRate:number;stride:number;lift:number;arm:number;sway:number;bob:number;antenna:number;bodyHeight:number}
export type RippleGestureKind='place'|'build'|'kick'|'throw'|'rescue'|'dash'|'hit'|'taunt'

export const RIPPLE_GESTURE_DURATION:Record<RippleGestureKind,number>={
  place:480,
  build:560,
  kick:420,
  throw:620,
  rescue:680,
  dash:420,
  hit:460,
  taunt:1650,
}

const MOTION_PROFILES:Record<RippleVariant,MotionProfile>={
  bloo:{stepRate:4.75,stride:1,lift:.9,arm:.9,sway:.86,bob:.82,antenna:.9,bodyHeight:.075},
  lumi:{stepRate:5.35,stride:.94,lift:1.12,arm:.96,sway:1.08,bob:1.12,antenna:1.04,bodyHeight:.085},
  coral:{stepRate:5.7,stride:.84,lift:.86,arm:1.08,sway:.94,bob:.8,antenna:1.16,bodyHeight:.065},
  vio:{stepRate:5.05,stride:1.1,lift:1.08,arm:1.16,sway:1,bob:1,antenna:1.12,bodyHeight:.075},
}
const VARIANT_PHASE:Record<RippleVariant,number>={bloo:0,lumi:1.37,coral:2.61,vio:4.08}

export const rippleStepRate=(variant:RippleVariant)=>MOTION_PROFILES[variant].stepRate

export const rippleGestureWeight=(progress:number)=>Math.sin(THREE.MathUtils.clamp(progress,0,1)*Math.PI)

export function solveRippleLeg(phase:number,blend:number,strideScale=1,liftScale=1):LegPose{
  const forward=Math.sin(phase)*FOOT_STRIDE*strideScale*blend
  const swing=Math.max(0,Math.cos(phase))*blend
  const lift=swing*swing*FOOT_LIFT*liftScale
  const down=HIP_HEIGHT-lift
  const distance=THREE.MathUtils.clamp(Math.hypot(forward,down),Math.abs(UPPER_LEG-LOWER_LEG)+.001,UPPER_LEG+LOWER_LEG-.001)
  const targetAngle=Math.atan2(forward,down)
  const upperOffset=Math.acos(THREE.MathUtils.clamp((UPPER_LEG*UPPER_LEG+distance*distance-LOWER_LEG*LOWER_LEG)/(2*UPPER_LEG*distance),-1,1))
  const innerKnee=Math.acos(THREE.MathUtils.clamp((UPPER_LEG*UPPER_LEG+LOWER_LEG*LOWER_LEG-distance*distance)/(2*UPPER_LEG*LOWER_LEG),-1,1))
  const knee=Math.PI-innerKnee
  const upperAngle=targetAngle+upperOffset
  return{hip:-upperAngle,knee,ankle:upperAngle-knee,lift}
}

const damp=(current:number,target:number,dt:number,speed=14)=>THREE.MathUtils.lerp(current,target,1-Math.exp(-dt*speed))

export function poseRippleRig(rig:RippleRig,phase:number,blend:number,dt:number,now:number,airborne=0,landing=0,turnIntent=0,gesture:RippleGestureKind|null=null,gestureProgress=0,downed=0){
  const profile=MOTION_PROFILES[rig.variant]
  const personalityPhase=VARIANT_PHASE[rig.variant]
  const left=solveRippleLeg(phase,blend,profile.stride,profile.lift),right=solveRippleLeg(phase+Math.PI,blend,profile.stride,profile.lift)
  const weight=Math.cos(phase)*blend*profile.sway,turn=Math.sin(phase*2)*blend
  const leftArm=Math.sin(phase-.22)*blend,rightArm=-leftArm
  const gestureWeight=rippleGestureWeight(gestureProgress)*(1-airborne*.72)
  let leftHip=THREE.MathUtils.lerp(left.hip,-.2+Math.sin(phase)*.06,airborne)
  let rightHip=THREE.MathUtils.lerp(right.hip,.2-Math.sin(phase)*.06,airborne)
  let leftKnee=THREE.MathUtils.lerp(left.knee,1.02,airborne)+landing*.28
  let rightKnee=THREE.MathUtils.lerp(right.knee,1.02,airborne)+landing*.28
  let leftArmX=leftArm*.52*profile.arm,rightArmX=rightArm*.52*profile.arm
  let leftArmZ=THREE.MathUtils.lerp(-1.02+leftArm*.1,-.74,airborne),rightArmZ=THREE.MathUtils.lerp(1.02-rightArm*.1,.74,airborne)
  let leftForearmX=THREE.MathUtils.lerp(-.1-left.lift*2.6,-.34,airborne),rightForearmX=THREE.MathUtils.lerp(-.1-right.lift*2.6,-.34,airborne)
  let actionBodyPitch=0,actionBodyYaw=0,actionBodyRoll=0,actionBodyDrop=0,actionSquash=0

  if(gesture&&gestureWeight>0){
    if(gesture==='place'){
      leftArmX=THREE.MathUtils.lerp(leftArmX,-.72,gestureWeight);rightArmX=THREE.MathUtils.lerp(rightArmX,-.72,gestureWeight)
      leftArmZ=THREE.MathUtils.lerp(leftArmZ,-.58,gestureWeight);rightArmZ=THREE.MathUtils.lerp(rightArmZ,.58,gestureWeight)
      leftForearmX=THREE.MathUtils.lerp(leftForearmX,-.7,gestureWeight);rightForearmX=THREE.MathUtils.lerp(rightForearmX,-.7,gestureWeight)
      leftKnee+=gestureWeight*.42;rightKnee+=gestureWeight*.42;actionBodyPitch=.2*gestureWeight;actionBodyDrop=.065*gestureWeight
    }
    if(gesture==='build'){
      leftArmX=THREE.MathUtils.lerp(leftArmX,-1.02,gestureWeight);rightArmX=THREE.MathUtils.lerp(rightArmX,-1.02,gestureWeight)
      leftArmZ=THREE.MathUtils.lerp(leftArmZ,-.42,gestureWeight);rightArmZ=THREE.MathUtils.lerp(rightArmZ,.42,gestureWeight)
      leftForearmX=THREE.MathUtils.lerp(leftForearmX,-.22,gestureWeight);rightForearmX=THREE.MathUtils.lerp(rightForearmX,-.22,gestureWeight)
      actionBodyPitch=-.12*gestureWeight;actionBodyDrop=.025*gestureWeight
    }
    if(gesture==='kick'){
      rightHip=THREE.MathUtils.lerp(rightHip,-1.08,gestureWeight);rightKnee=THREE.MathUtils.lerp(rightKnee,.22,gestureWeight)
      leftKnee+=gestureWeight*.18;leftArmX=THREE.MathUtils.lerp(leftArmX,-.48,gestureWeight);rightArmX=THREE.MathUtils.lerp(rightArmX,.48,gestureWeight)
      actionBodyPitch=-.14*gestureWeight;actionBodyRoll=-.08*gestureWeight
    }
    if(gesture==='throw'){
      const release=gestureProgress<.42?THREE.MathUtils.smoothstep(gestureProgress,0,.42):1-THREE.MathUtils.smoothstep(gestureProgress,.42,1)
      rightArmX=THREE.MathUtils.lerp(rightArmX,THREE.MathUtils.lerp(.82,-1.22,THREE.MathUtils.smoothstep(gestureProgress,.18,.62)),gestureWeight)
      rightArmZ=THREE.MathUtils.lerp(rightArmZ,.48,gestureWeight);rightForearmX=THREE.MathUtils.lerp(rightForearmX,-.76+release*.45,gestureWeight)
      leftArmX=THREE.MathUtils.lerp(leftArmX,-.35,gestureWeight);actionBodyYaw=-.18*gestureWeight;actionBodyPitch=-.09*gestureWeight
    }
    if(gesture==='rescue'){
      leftArmX=THREE.MathUtils.lerp(leftArmX,-1.08,gestureWeight);rightArmX=THREE.MathUtils.lerp(rightArmX,-1.08,gestureWeight)
      leftArmZ=THREE.MathUtils.lerp(leftArmZ,-.46,gestureWeight);rightArmZ=THREE.MathUtils.lerp(rightArmZ,.46,gestureWeight)
      leftForearmX=THREE.MathUtils.lerp(leftForearmX,-.58,gestureWeight);rightForearmX=THREE.MathUtils.lerp(rightForearmX,-.58,gestureWeight)
      leftKnee+=gestureWeight*.3;rightKnee+=gestureWeight*.3;actionBodyPitch=.28*gestureWeight;actionBodyDrop=.045*gestureWeight
    }
    if(gesture==='dash'){
      leftArmX=THREE.MathUtils.lerp(leftArmX,.62,gestureWeight);rightArmX=THREE.MathUtils.lerp(rightArmX,.62,gestureWeight)
      leftArmZ=THREE.MathUtils.lerp(leftArmZ,-.82,gestureWeight);rightArmZ=THREE.MathUtils.lerp(rightArmZ,.82,gestureWeight)
      leftForearmX=THREE.MathUtils.lerp(leftForearmX,-.12,gestureWeight);rightForearmX=THREE.MathUtils.lerp(rightForearmX,-.12,gestureWeight)
      leftHip-=gestureWeight*.28;rightHip+=gestureWeight*.16;actionBodyPitch=.24*gestureWeight;actionBodyDrop=.018*gestureWeight
    }
    if(gesture==='hit'){
      leftArmX=THREE.MathUtils.lerp(leftArmX,.46,gestureWeight);rightArmX=THREE.MathUtils.lerp(rightArmX,-.38,gestureWeight)
      leftArmZ=THREE.MathUtils.lerp(leftArmZ,-1.28,gestureWeight);rightArmZ=THREE.MathUtils.lerp(rightArmZ,1.28,gestureWeight)
      leftKnee+=gestureWeight*.3;rightKnee+=gestureWeight*.18;actionBodyPitch=-.16*gestureWeight;actionBodyRoll=.2*gestureWeight;actionBodyDrop=.03*gestureWeight
    }
    if(gesture==='taunt'){
      const beats=rig.variant==='coral'?4:rig.variant==='vio'?3:2
      const squat=Math.pow(Math.sin(gestureProgress*Math.PI*beats),2)*gestureWeight
      const sideWave=Math.sin(gestureProgress*Math.PI*beats*2)*gestureWeight
      if(rig.variant==='bloo'){
        leftKnee+=squat*.78;rightKnee+=squat*.78
        leftArmX=THREE.MathUtils.lerp(leftArmX,-.38,squat);rightArmX=THREE.MathUtils.lerp(rightArmX,-.38,squat)
        leftArmZ=THREE.MathUtils.lerp(leftArmZ,-.58,gestureWeight);rightArmZ=THREE.MathUtils.lerp(rightArmZ,.58,gestureWeight)
        actionBodyDrop=.13*squat;actionBodyYaw=.13*sideWave;actionSquash=.035*squat
      }
      if(rig.variant==='coral'){
        leftKnee+=squat*.62;rightKnee+=squat*.62
        leftArmX=THREE.MathUtils.lerp(leftArmX,.22*sideWave,squat);rightArmX=THREE.MathUtils.lerp(rightArmX,-.22*sideWave,squat)
        leftArmZ=THREE.MathUtils.lerp(leftArmZ,-.88+.16*sideWave,gestureWeight);rightArmZ=THREE.MathUtils.lerp(rightArmZ,.88+.16*sideWave,gestureWeight)
        actionBodyDrop=.105*squat;actionBodyRoll=.15*sideWave;actionBodyYaw=-.08*sideWave;actionSquash=.045*squat
      }
      if(rig.variant==='lumi'){
        const heavySquat=Math.pow(squat,.72)
        leftKnee+=heavySquat*1.02;rightKnee+=heavySquat*1.02
        leftArmX=THREE.MathUtils.lerp(leftArmX,-.94,gestureWeight);rightArmX=THREE.MathUtils.lerp(rightArmX,-.94,gestureWeight)
        leftArmZ=THREE.MathUtils.lerp(leftArmZ,-.48,gestureWeight);rightArmZ=THREE.MathUtils.lerp(rightArmZ,.48,gestureWeight)
        actionBodyDrop=.18*heavySquat;actionBodyPitch=-.08*gestureWeight+.13*heavySquat;actionSquash=.11*heavySquat
      }
      if(rig.variant==='vio'){
        const bow=THREE.MathUtils.smoothstep(gestureProgress,0,.3)*(1-THREE.MathUtils.smoothstep(gestureProgress,.72,1))*gestureWeight
        leftKnee+=squat*.68;rightKnee+=squat*.42
        leftArmX=THREE.MathUtils.lerp(leftArmX,-.7,bow);rightArmX=THREE.MathUtils.lerp(rightArmX,-.24,bow)
        leftArmZ=THREE.MathUtils.lerp(leftArmZ,-1.22,bow);rightArmZ=THREE.MathUtils.lerp(rightArmZ,1.02,bow)
        actionBodyDrop=.1*squat;actionBodyPitch=.2*bow;actionBodyYaw=.28*sideWave;actionBodyRoll=-.08*bow;actionSquash=.03*squat
      }
    }
  }

  if(downed>0){
    leftHip=THREE.MathUtils.lerp(leftHip,-.62,downed);rightHip=THREE.MathUtils.lerp(rightHip,.28,downed)
    leftKnee=THREE.MathUtils.lerp(leftKnee,1.38,downed);rightKnee=THREE.MathUtils.lerp(rightKnee,1.04,downed)
    leftArmX=THREE.MathUtils.lerp(leftArmX,.18,downed);rightArmX=THREE.MathUtils.lerp(rightArmX,-.14,downed)
    leftArmZ=THREE.MathUtils.lerp(leftArmZ,-1.24,downed);rightArmZ=THREE.MathUtils.lerp(rightArmZ,.86,downed)
    leftForearmX=THREE.MathUtils.lerp(leftForearmX,-.38,downed);rightForearmX=THREE.MathUtils.lerp(rightForearmX,-.62,downed)
    actionBodyPitch=THREE.MathUtils.lerp(actionBodyPitch,.34,downed);actionBodyRoll=THREE.MathUtils.lerp(actionBodyRoll,.14,downed);actionBodyDrop=THREE.MathUtils.lerp(actionBodyDrop,.13,downed)
  }

  rig.leftLeg.rotation.x=damp(rig.leftLeg.rotation.x,leftHip,dt)
  rig.rightLeg.rotation.x=damp(rig.rightLeg.rotation.x,rightHip,dt)
  rig.leftShin.rotation.x=damp(rig.leftShin.rotation.x,leftKnee,dt)
  rig.rightShin.rotation.x=damp(rig.rightShin.rotation.x,rightKnee,dt)
  rig.leftAnkle.rotation.x=damp(rig.leftAnkle.rotation.x,THREE.MathUtils.lerp(left.ankle,-.16,airborne),dt,18)
  rig.rightAnkle.rotation.x=damp(rig.rightAnkle.rotation.x,THREE.MathUtils.lerp(right.ankle,-.16,airborne),dt,18)
  rig.leftLeg.position.y=damp(rig.leftLeg.position.y,HIP_HEIGHT,dt)
  rig.rightLeg.position.y=damp(rig.rightLeg.position.y,HIP_HEIGHT,dt)

  const idleArm=Math.sin(now*.00125+personalityPhase)*(1-blend)*.018
  rig.leftArm.rotation.x=damp(rig.leftArm.rotation.x,leftArmX+idleArm*(1-gestureWeight),dt,11)
  rig.rightArm.rotation.x=damp(rig.rightArm.rotation.x,rightArmX-idleArm*(1-gestureWeight),dt,11)
  rig.leftArm.rotation.z=damp(rig.leftArm.rotation.z,leftArmZ,dt,11)
  rig.rightArm.rotation.z=damp(rig.rightArm.rotation.z,rightArmZ,dt,11)
  rig.leftForearm.rotation.x=damp(rig.leftForearm.rotation.x,leftForearmX,dt,12)
  rig.rightForearm.rotation.x=damp(rig.rightForearm.rotation.x,rightForearmX,dt,12)

  const breathing=Math.sin(now*.0024)*.004
  rig.body.position.x=damp(rig.body.position.x,weight*.022,dt,9)
  rig.body.position.y=damp(rig.body.position.y,profile.bodyHeight+Math.abs(weight)*.009*profile.bob-landing*.045-actionBodyDrop,dt,12)
  rig.body.rotation.x=damp(rig.body.rotation.x,blend*.025-airborne*.045+actionBodyPitch,dt,10)
  rig.body.rotation.y=damp(rig.body.rotation.y,-turn*.022+turnIntent*.12+actionBodyYaw,dt,9)
  rig.body.rotation.z=damp(rig.body.rotation.z,-weight*.052-turnIntent*.035+actionBodyRoll,dt,9)
  rig.body.scale.x=damp(rig.body.scale.x,1-breathing+landing*.035+actionSquash*.58,dt,8)
  rig.body.scale.y=damp(rig.body.scale.y,1+breathing-landing*.06-actionSquash,dt,8)
  rig.body.scale.z=damp(rig.body.scale.z,1-breathing*.4+landing*.035+actionSquash*.58,dt,8)

  rig.antennae.forEach((antenna,index)=>{
    const delayWave=Math.sin(phase-.48-index*.22)*blend
    const idleWave=Math.sin(now*.0018+index*1.7)*(1-blend)
    const tauntWave=gesture==='taunt'?Math.sin(gestureProgress*Math.PI*(rig.variant==='coral'?8:4)+index*Math.PI)*gestureWeight:0
    const tauntNod=gesture==='taunt'?Math.pow(Math.sin(gestureProgress*Math.PI*(rig.variant==='lumi'?2:3)),2)*gestureWeight:0
    const tauntSwing=rig.variant==='bloo'?.13:rig.variant==='coral'?.19:rig.variant==='vio'?.15:.08
    antenna.rotation.x=damp(antenna.rotation.x,(-delayWave*.1+idleWave*.018)*profile.antenna+airborne*.12+tauntNod*.12,dt,5.5)
    antenna.rotation.z=damp(antenna.rotation.z,(antenna.userData.restTilt as number)+delayWave*(index%2?.055:-.055)*profile.antenna-turnIntent*.045+tauntWave*tauntSwing,dt,5.5)
  })

  const blink=Math.pow(Math.max(0,Math.sin(now*.00155+personalityPhase)),28)
  rig.eyes.forEach(eye=>{
    eye.scale.y=damp(eye.scale.y,(1-blink*.88)*(1-downed*.38),dt,28)
    eye.position.x=damp(eye.position.x,(eye.userData.restX as number)+turnIntent*.012,dt,12)
  })
}
