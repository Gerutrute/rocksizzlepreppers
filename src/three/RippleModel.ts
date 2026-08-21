import * as THREE from 'three'
import type { RippleVariant as SharedRippleVariant } from '../game-core/protocol'

export type RippleVariant=SharedRippleVariant

const PALETTES:Record<RippleVariant,{body:string;accent:string;limb:string;glow:string}>={
  bloo:{body:'#1558e8',accent:'#2ee8ea',limb:'#2ee8ea',glow:'#75f7ff'},
  lumi:{body:'#f0c91a',accent:'#20aeb5',limb:'#8dca22',glow:'#fff36c'},
  coral:{body:'#ef4654',accent:'#652d68',limb:'#652d68',glow:'#ff8a86'},
  vio:{body:'#743de0',accent:'#ef4d79',limb:'#ef4d79',glow:'#c595ff'},
}

export type RippleRig={
  variant:RippleVariant
  body:THREE.Group
  leftArm:THREE.Group
  rightArm:THREE.Group
  leftForearm:THREE.Group
  rightForearm:THREE.Group
  leftLeg:THREE.Group
  rightLeg:THREE.Group
  leftShin:THREE.Group
  rightShin:THREE.Group
  leftAnkle:THREE.Group
  rightAnkle:THREE.Group
  antennae:THREE.Group[]
  eyes:THREE.Group[]
}
export type RippleModel={group:THREE.Group;materials:THREE.MeshStandardMaterial[];rig:RippleRig}

export function createRippleModel(variant:RippleVariant):RippleModel{
  const palette=PALETTES[variant],group=new THREE.Group(),bodyRoot=new THREE.Group(),materials:THREE.MeshStandardMaterial[]=[]
  group.name=`Ripple_${variant}`;bodyRoot.name='Body_CTRL'
  group.add(bodyRoot)
  const material=(color:string,emissive='#000000',intensity=0,roughness=.42)=>{const value=new THREE.MeshStandardMaterial({color,emissive,emissiveIntensity:intensity,roughness,metalness:.025});materials.push(value);return value}
  const bodyMat=material(palette.body,palette.body,.1,.36),accentMat=material(palette.accent,palette.accent,.18,.34),limbMat=material(palette.limb,palette.limb,.12,.38),faceMat=material('#f4f7ff','#b9dfff',.06,.28),eyeMat=material('#080b20','#080b20',.08,.18),glowMat=material(palette.glow,palette.glow,2.5,.2)
  const add=(geometry:THREE.BufferGeometry,mat:THREE.Material,position:[number,number,number],scale:[number,number,number]=[1,1,1],parent:THREE.Object3D=group)=>{const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(...position);mesh.scale.set(...scale);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh}

  // Squat bean body and oversized mask reproduce the key-art silhouette.
  add(new THREE.SphereGeometry(.62,32,24),bodyMat,[0,.78,0],[1,1.08,.93],bodyRoot)
  add(new THREE.SphereGeometry(.53,32,24),faceMat,[0,.96,.515],[1,.72,.22],bodyRoot)
  const eyes:THREE.Group[]=[]
  for(const x of [-.19,.19]){
    const eye=new THREE.Group();eye.name=x<0?'Eye_L':'Eye_R';eye.position.set(x,.97,.64);eye.userData.restX=x;bodyRoot.add(eye)
    add(new THREE.SphereGeometry(.078,18,14),eyeMat,[0,0,0],[.86,1.48,.66],eye)
    add(new THREE.SphereGeometry(.022,12,8),glowMat,[-.018,.055,.043],[.72,.72,.38],eye)
    eyes.push(eye)
  }
  add(new THREE.TorusGeometry(.205,.045,12,28),accentMat,[0,.49,.525],[1,1,.42],bodyRoot)

  // Hierarchical joints give each limb a real shoulder/elbow and hip/knee/ankle chain.
  const arms:THREE.Group[]=[],forearms:THREE.Group[]=[],legs:THREE.Group[]=[],shins:THREE.Group[]=[],ankles:THREE.Group[]=[],antennae:THREE.Group[]=[]
  for(const side of [-1,1]){
    const ear=add(new THREE.CylinderGeometry(.17,.17,.11,20),accentMat,[side*.61,.9,0],[1,1,1],bodyRoot);ear.rotation.z=Math.PI/2

    const arm=new THREE.Group();arm.name=side<0?'Shoulder_L':'Shoulder_R';arm.position.set(side*.55,.82,.02);arm.rotation.z=side*1.02;bodyRoot.add(arm)
    add(new THREE.CapsuleGeometry(.13,.14,6,12),bodyMat,[0,-.13,0],[1,1,1],arm)
    const forearm=new THREE.Group();forearm.name=side<0?'Elbow_L':'Elbow_R';forearm.position.y=-.25;arm.add(forearm)
    add(new THREE.CapsuleGeometry(.115,.12,6,12),bodyMat,[0,-.1,.025],[1,1,1],forearm)
    add(new THREE.SphereGeometry(.17,20,14),limbMat,[0,-.25,.06],[1.08,.86,.9],forearm)
    arms.push(arm);forearms.push(forearm)

    const leg=new THREE.Group();leg.name=side<0?'Hip_L':'Hip_R';leg.position.set(side*.3,.46,.015);group.add(leg)
    add(new THREE.CapsuleGeometry(.135,.12,6,12),bodyMat,[0,-.12,0],[1,1,1],leg)
    const shin=new THREE.Group();shin.name=side<0?'Knee_L':'Knee_R';shin.position.y=-.24;leg.add(shin)
    add(new THREE.CapsuleGeometry(.115,.1,6,12),accentMat,[0,-.115,.015],[1,1,1],shin)
    const ankle=new THREE.Group();ankle.name=side<0?'Ankle_L':'Ankle_R';ankle.position.y=-.23;shin.add(ankle)
    const foot=add(new THREE.CapsuleGeometry(.16,.2,6,12),variant==='bloo'?bodyMat:limbMat,[0,.16,.105],[1.05,1,1.12],ankle);foot.rotation.x=Math.PI/2
    add(new THREE.SphereGeometry(.13,16,10),accentMat,[0,.035,.19],[.82,.25,1.05],ankle)
    legs.push(leg);shins.push(shin);ankles.push(ankle)
  }

  const antenna=(x:number,height:number,tilt:number,ring=false)=>{const pivot=new THREE.Group();pivot.name=`Antenna_${antennae.length+1}`;pivot.position.set(x,1.34,0);pivot.rotation.z=tilt;pivot.userData.restTilt=tilt;const stem=new THREE.Mesh(new THREE.CylinderGeometry(.042,.066,height,12),variant==='coral'?bodyMat:accentMat);stem.position.y=height*.5;stem.castShadow=true;pivot.add(stem);const tip=new THREE.Mesh(ring?new THREE.TorusGeometry(.105,.035,10,24):new THREE.SphereGeometry(.125,20,14),ring?bodyMat:glowMat);tip.position.y=height;tip.castShadow=true;pivot.add(tip);bodyRoot.add(pivot);antennae.push(pivot)}
  if(variant==='coral'){antenna(-.19,.38,-.23,true);antenna(.19,.38,.23,true)}else if(variant==='vio'){antenna(-.19,.4,-.14);antenna(.19,.4,.14)}else if(variant==='lumi'){antenna(-.18,.43,-.2);antenna(.18,.35,.2)}else{antenna(-.2,.46,-.18);antenna(.2,.57,.18)}

  group.scale.setScalar(1.03)
  return{group,materials,rig:{variant,body:bodyRoot,leftArm:arms[0],rightArm:arms[1],leftForearm:forearms[0],rightForearm:forearms[1],leftLeg:legs[0],rightLeg:legs[1],leftShin:shins[0],rightShin:shins[1],leftAnkle:ankles[0],rightAnkle:ankles[1],antennae,eyes}}
}
