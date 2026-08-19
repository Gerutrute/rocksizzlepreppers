export type FanState='CALM'|'WARNING'|'ACTIVE'
export type VehicleState={active:boolean;x:number;z:number}

const FAN_CYCLES=[12,48,92,132,162] as const
const VEHICLE_CYCLES=[30,68,110,150] as const

export const fanStateAt=(elapsed:number):FanState=>{
  for(const start of FAN_CYCLES){
    if(elapsed>=start&&elapsed<start+4)return'WARNING'
    if(elapsed>=start+4&&elapsed<start+12)return'ACTIVE'
  }
  return'CALM'
}

export const vehicleStateAt=(elapsed:number):VehicleState=>{
  const start=[...VEHICLE_CYCLES].reverse().find(value=>elapsed>=value&&elapsed<value+8)
  return start===undefined?{active:false,x:-18,z:1}:{active:true,x:-14+(elapsed-start)/8*28,z:1}
}
