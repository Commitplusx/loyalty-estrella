import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { object, phone, text, uuid, type ObjectData } from './cash-checkout.ts';
import { notificationSender, handleGenericNotification } from './notification-messaging.ts';
import { readBoundedJsonBody } from './http-request.ts';

interface Config {apiKey:string;sender:string;url:string;dispatcher?:string}
export async function handleLoyaltyCouponNotice(payload:ObjectData,client:SupabaseClient,config:Config,cors:Record<string,string>,transport:typeof fetch=fetch):Promise<Response> {
  let customerId:string|undefined,key:string|undefined,claimed=false,providerAccepted=false,attempted=false;
  async function finish(status:'accepted'|'failed'|'unknown',providerId:string|null=null) {
    const {data,error}=await client.rpc('finish_loyalty_redemption_notice',{p_customer:customerId,p_key:key,p_status:status,p_provider_id:providerId});
    if (error || data!==true) throw new Error('Receipt storage unavailable');
  }
  try {
    customerId=uuid(payload.cliente_id); key=uuid(payload.redemption_key);
    const {data,error}=await client.rpc('claim_loyalty_redemption_notice',{p_customer:customerId,p_key:key});
    if (error) throw new Error('Notice storage unavailable');
    if (data===null) return Response.json({ok:true,duplicate:true},{headers:cors});
    claimed=true;
    const notice=object(data),to='+52'+phone(notice.telefono),name=text(notice.nombre,200),code=text(notice.codigo,100);
    const expiry=text(notice.expires_at,60);
    if (!/^CANJE-[A-Z0-9-]{1,80}$/.test(code) || !Number.isFinite(Date.parse(expiry))) throw new Error('Invalid persisted coupon');
    const from=notificationSender(config.sender);
    if (!config.apiKey) throw new Error('Provider not configured');
    attempted=true;
    const response=await transport('https://api.ycloud.com/v2/whatsapp/messages/sendDirectly',{
      method:'POST',headers:{'X-API-Key':config.apiKey,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),
      body:JSON.stringify({from,to,type:'template',template:{name:'estrella_cupon_generado',language:{code:'en'},components:[
        {type:'header',parameters:[{type:'image',image:{link:config.url+'/storage/v1/object/public/public-assets/logo.png'}}]},
        {type:'body',parameters:[{type:'text',text:name},{type:'text',text:code},{type:'text',text:new Date(expiry).toLocaleDateString('es-MX',{timeZone:'America/Mexico_City',day:'2-digit',month:'short',year:'numeric'})}]},
      ]}}),
    });
    const raw:unknown=await readBoundedJsonBody(response.body,65536,5000).catch(() => null);
    const provider=typeof raw==='object' && raw!==null && !Array.isArray(raw)?object(raw):{};
    if (!response.ok || provider.error!==undefined) {
      await finish(response.status>=500?'unknown':'failed');
      return Response.json({ok:false,error:'WhatsApp rechazó el aviso del cupón.'},{status:502,headers:cors});
    }
    if (typeof provider.id!=='string' || provider.id.length<1 || provider.id.length>150 || !['accepted','sent','delivered','read'].includes(String(provider.status))) {
      await finish('unknown');
      return Response.json({ok:false,error:'No pudimos confirmar el estado del aviso.'},{status:502,headers:cors});
    }
    providerAccepted=true;
    await finish('accepted',provider.id);
    if (config.dispatcher) {
      const adminNotice=await handleGenericNotification({cliente_tel:config.dispatcher,mensaje:`🎟️ Nuevo canje de beneficio\nCliente: ${name}\nCupón: ${code}`},config,cors,transport);
      if (!adminNotice.ok) console.error(JSON.stringify({event:'coupon_dispatcher_notice_failed',status:adminNotice.status}));
    }
    return Response.json({ok:true,message_id:provider.id,provider_status:provider.status,delivered:provider.status==='delivered'||provider.status==='read'},{headers:cors});
  } catch(error:unknown) {
    if (claimed && !providerAccepted) {
      try {await finish(attempted?'unknown':'failed');} catch {console.error(JSON.stringify({event:'coupon_notice_receipt_unavailable'}));}
    }
    console.error(JSON.stringify({event:'coupon_notice_failed',provider_accepted:providerAccepted}));
    return Response.json({ok:false,error:'No pudimos confirmar el aviso. El cupón permanece guardado.'},{status:503,headers:cors});
  }
}
