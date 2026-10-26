export interface DeliveryPin {lat:number;lng:number}
export class DeliveryPinError extends Error {}
const pair=/^(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)$/;
function coordinates(lat:string,lng:string):DeliveryPin|null {
 const point={lat:Number(lat),lng:Number(lng)};
 return Number.isFinite(point.lat)&&Math.abs(point.lat)<=90&&Number.isFinite(point.lng)&&Math.abs(point.lng)<=180?point:null;
}
function allowed(raw:string):URL {
 let url:URL;try{url=new URL(raw);}catch{throw new DeliveryPinError('Pega un enlace de ubicación de Google Maps válido.');}
 const long=['google.com','www.google.com','google.com.mx','www.google.com.mx'];
 if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'
  ||!(url.hostname==='maps.app.goo.gl'||url.hostname==='goo.gl'&&url.pathname.startsWith('/maps')
   ||url.hostname==='maps.google.com'||long.includes(url.hostname)&&url.pathname.startsWith('/maps')))
  throw new DeliveryPinError('Usa un enlace de Google Maps o elige el pin en el mapa.');
 return url;
}
export function preciseMapsPin(raw:string):DeliveryPin|null {
 const url=allowed(raw);let text:string;
 try{text=decodeURI(url.pathname+url.search);}catch{throw new DeliveryPinError('El enlace de Maps no es válido. Vuelve a compartirlo.');}
 // Place coordinates take precedence over the camera's /@lat,lng viewport.
 const place=text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
 if(place)return coordinates(place[1],place[2]);
 for(const name of['query','q','ll']){const match=url.searchParams.get(name)?.match(pair);if(match)return coordinates(match[1],match[2]);}
 return null;
}
export async function resolveDeliveryMapsPin(raw:string,transport:typeof fetch=fetch,deadline?:AbortSignal):Promise<DeliveryPin>{
 if(raw.length>2048)throw new DeliveryPinError('El enlace de Maps es demasiado largo. Comparte sólo la ubicación.');
 let url=allowed(raw.trim());const timeout=AbortSignal.timeout(6000),signal=deadline?AbortSignal.any([timeout,deadline]):timeout;
 for(let step=0;step<=3;step++){
  const point=preciseMapsPin(url.href);if(point)return point;
  if(step===3)break;
  let response:Response;
  try{response=await transport(url,{redirect:'manual',signal,headers:{Accept:'text/html'}});}
  catch{throw new DeliveryPinError('No pudimos abrir el pin. Vuelve a compartirlo o elígelo en el mapa.');}
  await response.body?.cancel();
  if(![301,302,303,307,308].includes(response.status))break;
  const location=response.headers.get('location');if(!location)break;
  url=allowed(new URL(location,url).href);
 }
 throw new DeliveryPinError('Ese enlace no contiene un pin preciso. Comparte la ubicación desde Maps o elígela en el mapa.');
}
