import {deepStrictEqual as equal,rejects,throws} from 'node:assert/strict';
import {preciseMapsPin,resolveDeliveryMapsPin} from '../functions/_shared/delivery-maps-pin.ts';
Deno.test('a shared coordinate pin is precise; place coordinates override the map camera',()=>{
 equal(preciseMapsPin('https://maps.google.com/?q=16.25,-92.13'),{lat:16.25,lng:-92.13});
 equal(preciseMapsPin('https://www.google.com/maps/place/Example/@16,-92,15z/data=!3d16.25!4d-92.13'),{lat:16.25,lng:-92.13});
 equal(preciseMapsPin('https://www.google.com/maps/@16.25,-92.13,15z'),null);
 equal(preciseMapsPin('https://maps.google.com/?q=0,0'),{lat:0,lng:0});
 equal(preciseMapsPin('https://maps.google.com/?q=91,0'),null);
});
Deno.test('short links follow only bounded Google Maps redirects and never download a page body',async()=>{
 const urls:string[]=[];let cancelled=false;
 const transport:typeof fetch=input=>{urls.push(String(input));return Promise.resolve(new Response(new ReadableStream({cancel(){cancelled=true;}}),{status:302,headers:{Location:'https://www.google.com/maps/?q=16.25,-92.13'}}));};
 equal(await resolveDeliveryMapsPin('https://maps.app.goo.gl/example',transport),{lat:16.25,lng:-92.13});equal(urls.length,1);equal(cancelled,true);
});
Deno.test('foreign hosts, credentials, ports and redirected private networks are denied before another request',async()=>{
 for(const url of['http://maps.google.com/?q=0,0','https://maps.google.com.evil.test/?q=0,0','https://google.com@127.0.0.1/maps','https://maps.google.com:444/?q=0,0','https://example.test/maps'])throws(()=>preciseMapsPin(url));
 let calls=0;const transport:typeof fetch=()=>{calls++;return Promise.resolve(new Response(null,{status:302,headers:{Location:'http://127.0.0.1/private'}}));};
 await rejects(()=>resolveDeliveryMapsPin('https://maps.app.goo.gl/example',transport));equal(calls,1);
});
Deno.test('redirect loops stop after three requests, without a guessed location',async()=>{
 let calls=0;const transport:typeof fetch=()=>{calls++;return Promise.resolve(new Response(null,{status:302,headers:{Location:'https://maps.app.goo.gl/again'}}));};
 await rejects(()=>resolveDeliveryMapsPin('https://maps.app.goo.gl/example',transport));equal(calls,3);
});
Deno.test('a non-redirect page, malformed URI, lost response and oversized link fail visibly',async()=>{
 await rejects(()=>resolveDeliveryMapsPin('https://maps.app.goo.gl/page',()=>Promise.resolve(new Response('<html>no precise point</html>'))));
 throws(()=>preciseMapsPin('https://www.google.com/maps/%E0%A4%A'));
 await rejects(()=>resolveDeliveryMapsPin('https://maps.app.goo.gl/fail',()=>Promise.reject(new Error('network'))));
 await rejects(()=>resolveDeliveryMapsPin('https://maps.app.goo.gl/'+'x'.repeat(2100)));
});
