import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createCustomerLoyaltyGateway, LoyaltyAccessError, type LoginChallenge } from './customer-loyalty';

const customerId='26000000-0000-4000-8000-000000000001';
const challenge: LoginChallenge={phone:'0000000090',key:'26000000-0000-4000-8000-000000000002',challengeId:'26000000-0000-4000-8000-000000000003',expiresAt:Date.now()+300000};
const profile={id:customerId,nombre:'QA customer',telefono:challenge.phone,qr_code:'qa',puntos:1,envios_gratis_disponibles:0,
  envios_totales:1,es_vip:false,rango:'bronce',saldo_billetera:0,cupon_activo:null,acepta_terminos:true,created_at:'2026-10-12T12:00:00Z',updated_at:'2026-10-12T12:00:00Z'};
function response(body: unknown,status=200) {return Response.json(body,{status,headers:{'x-supabase-api-version':'2024-01-01'}});}
function setup(transport: typeof fetch) {
  const client=createClient('https://loyalty-qa.invalid','qa-public-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:transport}});
  return {client,gateway:createCustomerLoyaltyGateway(client)};
}
function token() {
  return btoa(JSON.stringify({alg:'HS256',typ:'JWT'}))+'.'+btoa(JSON.stringify({sub:customerId,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'}))+'.qa';
}
function authResponse(kind='loyalty_customer') {
  return {access_token:token(),refresh_token:'qa-refresh',expires_in:3600,token_type:'bearer',user:{id:customerId,email:'qa@loyalty.invalid',app_metadata:{account_kind:kind},user_metadata:{},aud:'authenticated',created_at:'2026-10-12T12:00:00Z'}};
}

describe('Customer access through the real Supabase SDK',() => {
  it('does not query profiles when there is no Auth session',async () => {
    const {gateway}=setup(async () => {throw new Error('Network must not run');});
    expect(await gateway.restore()).toBeNull();
  });
  it('reuses the request key on a lost response and validates accepted challenges',async () => {
    const requests: unknown[]=[];
    const {gateway}=setup(async (_input,init) => {
      requests.push(JSON.parse(String(init?.body)));
      return response({ok:true,challenge_id:challenge.challengeId,expires_in:299});
    });
    const accepted=await gateway.request(challenge);
    expect(accepted.challengeId).toBe(challenge.challengeId);
    expect(requests).toEqual([{action:'request-customer-login',telefono:challenge.phone,idempotency_key:challenge.key}]);
  });
  it('preserves concrete server errors instead of declaring a code sent',async () => {
    const {gateway}=setup(async () => response({error:'Solicita otro código.',code:'login_new_request_required'},409));
    await expect(gateway.request(challenge)).rejects.toMatchObject({code:'login_new_request_required',message:'Solicita otro código.'});
  });
  it('rejects incomplete or malformed success responses',async () => {
    const {gateway}=setup(async () => response({ok:true,challenge_id:challenge.challengeId,expires_in:99999}));
    await expect(gateway.request(challenge)).rejects.toBeInstanceOf(LoyaltyAccessError);
  });
  it('exchanges the server credential with Auth before reading the private profile',async () => {
    const routes: string[]=[];
    const {gateway}=setup(async (input,init) => {
      const route=String(input); routes.push(route);
      if (route.endsWith('/functions/v1/auth-otp')) return response({ok:true,token_hash:'qa-one-use-credential',verification_type:'email'});
      if (route.endsWith('/auth/v1/verify')) {
        expect(JSON.parse(String(init?.body))).toMatchObject({token_hash:'qa-one-use-credential',type:'email'});
        return response(authResponse());
      }
      if (route.endsWith('/rest/v1/rpc/get_my_loyalty_customer')) return response(profile);
      throw new Error('Unexpected route');
    });
    expect(await gateway.verify(challenge,'123456')).toEqual(profile);
    expect(routes.map(route => new URL(route).pathname)).toEqual(['/functions/v1/auth-otp','/auth/v1/verify','/rest/v1/rpc/get_my_loyalty_customer']);
  });
  it('never loads a profile after Auth rejects a credential',async () => {
    const {gateway}=setup(async input => {
      if (String(input).includes('/functions/')) return response({ok:true,token_hash:'qa',verification_type:'email'});
      if (String(input).includes('/auth/v1/verify')) return response({code:'otp_expired',msg:'Expired'},403);
      throw new Error('Profile must not be requested');
    });
    await expect(gateway.verify(challenge,'123456')).rejects.toThrow('No pudimos abrir tu sesión');
  });
  it('does not accept another role or another customer as a verified login',async () => {
    const {gateway}=setup(async input => {
      if (String(input).includes('/functions/')) return response({ok:true,token_hash:'qa',verification_type:'email'});
      if (String(input).includes('/auth/v1/verify')) return response(authResponse('admin'));
      throw new Error('Profile must not be requested');
    });
    await expect(gateway.verify(challenge,'123456')).rejects.toThrow('No pudimos abrir tu sesión');
  });
  it('strips private fields even if a malformed server projection includes them',async () => {
    const {gateway}=setup(async () => response({...profile,pin:'private',notas_crm:'private',auth_email:'private'}));
    expect(await gateway.profile()).toEqual(profile);
  });
  it('rejects unavailable history without replacing it with an empty success',async () => {
    const {gateway}=setup(async () => response({message:'Database unavailable',code:'503'},503));
    await expect(gateway.history()).rejects.toThrow('No pudimos cargar tus movimientos');
  });
  it('maps ownership rejection to an expired session and blocks invalid financial values',async () => {
    const {gateway}=setup(async () => response({message:'Not owner',code:'42501'},403));
    await expect(gateway.profile()).rejects.toMatchObject({code:'session_expired'});
    const invalid=setup(async () => response({...profile,saldo_billetera:'100'}));
    await expect(invalid.gateway.profile()).rejects.toBeInstanceOf(LoyaltyAccessError);
  });
});
