import * as THREE from 'three'

export type RippleVariant='bloo'|'lumi'|'coral'|'vio'

const PALETTES:Record<RippleVariant,{body:string;accent:string;glow:string}>={
  bloo:{body:'#1558e8',accent:'#2ee8ea',glow:'#75f7ff'},
  lumi:{body:'#b9d51d',accent:'#20aeb5',glow:'#efff69'},
  coral:{body:'#ef4654',accent:'#652d68',glow:'#ff8a86'},
  vio:{body:'#743de0',accent:'#ef4d79',glow:'#c595ff'},
}

export type RippleRig={body:THREE.Mesh;leftArm:THREE.Group;rightArm:THREE.Group;leftLeg:THREE.Group;rightLeg:THREE.Group}
export type RippleModel={group:THREE.Group;materials:THREE.MeshStandardMaterial[];rig:RippleRig}

export function createRippleModel(variant:RippleVariant):RippleModel{
  const palette=PALETTES[variant],group=new THREE.Group(),materials:THREE.MeshStandardMaterial[]=[]
  const material=(color:string,emissive='#000000',intensity=0,roughness=.42)=>{const value=new THREE.MeshStandardMaterial({color,emissive,emissiveIntensity:intensity,roughness,metalness:.025,transparent:true});materials.push(value);return value}
  const bodyMat=material(palette.body,palette.body,.1,.36),accentMat=material(palette.accent,palette.accent,.18,.34),faceMat=material('#f4f7ff','#b9dfff',.06,.28),eyeMat=material('#080b20','#080b20',.08,.18),glowMat=material(palette.glow,palette.glow,2.5,.2)
  const add=(geometry:THREE.BufferGeometry,mat:THREE.Material,position:[number,number,number],scale:[number,number,number]=[1,1,1])=>{const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(...position);mesh.scale.set(...scale);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh}

  // Squat bean body and oversized mask reproduce the key-art silhouette.
  const body=add(new THREE.SphereGeometry(.62,32,24),bodyMat,[0,.78,0],[1,1.08,.93])
  add(new THREE.SphereGeometry(.53,32,24),faceMat,[0,.96,.515],[1,.72,.22])
  for(const x of [-.19,.19]){
    add(new THREE.SphereGeometry(.078,18,14),eyeMat,[x,.97,.64],[.86,1.48,.66])
    add(new THREE.SphereGeometry(.022,12,8),glowMat,[x-.018,1.025,.683],[.72,.72,.38])
  }
  add(new THREE.TorusGeometry(.205,.045,12,28),accentMat,[0,.49,.525],[1,1,.42])

  // Ear caps, thick sleeves and mitten hands make the character read at distance.
  const arms:THREE.Group[]=[],legs:THREE.Group[]=[]
  for(const side of [-1,1]){
    add(new THREE.CylinderGeometry(.17,.17,.11,20),accentMat,[side*.61,.9,0],[1,1,1]).rotation.z=Math.PI/2
    const arm=new THREE.Group();arm.position.set(side*.55,.78,.02);arm.rotation.z=side*1.02;group.add(arm)
    const sleeve=new THREE.Mesh(new THREE.CapsuleGeometry(.13,.24,6,12),bodyMat);sleeve.position.y=-.19;sleeve.castShadow=true;arm.add(sleeve)
    const hand=new THREE.Mesh(new THREE.SphereGeometry(.17,20,14),accentMat);hand.position.set(0,-.43,.06);hand.scale.set(1.08,.86,.9);hand.castShadow=true;arm.add(hand)
    const finger=new THREE.Mesh(new THREE.SphereGeometry(.075,14,10),accentMat);finger.position.set(side*.09,-.5,.08);finger.scale.set(1,.75,.78);finger.castShadow=true;arm.add(finger);arms.push(arm)
    const leg=new THREE.Group();leg.position.set(side*.25,.2,.03);group.add(leg)
    const foot=new THREE.Mesh(new THREE.CapsuleGeometry(.145,.16,6,12),bodyMat);foot.rotation.x=Math.PI/2;foot.position.z=.07;foot.castShadow=true;leg.add(foot);legs.push(leg)
  }

  const antenna=(x:number,height:number,tilt:number)=>{const pivot=new THREE.Group();pivot.position.set(x,1.34,0);pivot.rotation.z=tilt;const stem=new THREE.Mesh(new THREE.CylinderGeometry(.042,.066,height,12),accentMat);stem.position.y=height*.5;stem.castShadow=true;pivot.add(stem);const orb=new THREE.Mesh(new THREE.SphereGeometry(.125,20,14),glowMat);orb.position.y=height;orb.castShadow=true;pivot.add(orb);group.add(pivot)}
  if(variant==='coral'){antenna(0,.4,-.24)}else if(variant==='vio'){antenna(-.19,.4,-.14);antenna(.19,.4,.14)}else if(variant==='lumi'){antenna(-.18,.43,-.2);antenna(.18,.35,.2)}else{antenna(-.2,.46,-.18);antenna(.2,.57,.18)}

  group.scale.setScalar(1.03)
  return{group,materials,rig:{body,leftArm:arms[0],rightArm:arms[1],leftLeg:legs[0],rightLeg:legs[1]}}
}
