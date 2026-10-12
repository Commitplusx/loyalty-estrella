import { test, expect } from '@playwright/test';

const customerId='26000000-0000-4000-8000-000000000001';
const profile={id:customerId,nombre:'Cliente de prueba',telefono:'0000000090',qr_code:'qa',puntos:5,envios_gratis_disponibles:1,
  envios_totales:5,es_vip:false,rango:'bronce',saldo_billetera:0,cupon_activo:null,acepta_terminos:true,created_at:'2026-10-12T12:00:00Z',updated_at:'2026-10-12T12:00:00Z'};

for (const width of [320,390,1440]) {
  test(`private customer entry and WhatsApp code at ${width}px`,async ({page}) => {
    await page.setViewportSize({width,height:width<500?844:980});
    await page.route('https://jdrrkpvodnqoljycixbg.supabase.co/**',async route => {
      const path=new URL(route.request().url()).pathname;
      let body:unknown=[];
      if (path.endsWith('/functions/v1/auth-otp')) {
        const input:unknown=route.request().postDataJSON();
        if (typeof input==='object' && input!==null && 'action' in input && input.action==='request-customer-login') {
          body={ok:true,challenge_id:'26000000-0000-4000-8000-000000000003',expires_in:300};
        } else {body={error:'Ese código no coincide. Revísalo e intenta de nuevo.',code:'invalid_code'};
          await route.fulfill({status:400,json:body}); return;}
      }
      if (path.endsWith('/rest/v1/app_config')) body={id:'default',contacto:{whatsapp:'520000000090',telefono:'0000000090',precio_normal:50},horarios:[],horas_felices:[]};
      await route.fulfill({status:200,json:body});
    });
    await page.routeWebSocket('wss://jdrrkpvodnqoljycixbg.supabase.co/**',socket => socket.close());
    await page.addInitScript(value => {localStorage.setItem('estrella_cliente',JSON.stringify(value)); sessionStorage.setItem('pin_verified','true');},profile);
    await page.goto('http://127.0.0.1:5212/cliente');
    await expect(page.getByLabel('Número celular')).toBeVisible();
    await expect(page.getByRole('heading',{name:'Hola, Cliente de prueba.'})).toHaveCount(0);
    await expect(page.getByText('Ingresa tu PIN')).toHaveCount(0);
    await expect(page.locator('.loyalty-portal')).toHaveCSS('opacity','1');
    expect(await page.locator('.loyalty-entry-card').evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(width);
    await page.screenshot({path:`.impeccable/review/customer-entry-${width}.png`,fullPage:true});
    await page.getByLabel('Número celular').fill(profile.telefono);
    await page.getByRole('button',{name:'Recibir código por WhatsApp'}).click();
    await expect(page.getByRole('heading',{name:'Revisa tu WhatsApp'})).toBeVisible();
    const code=page.getByLabel('Código de 6 dígitos');
    await expect(code).toBeFocused();
    await code.fill('123456');
    await page.getByRole('button',{name:'Ver mi tarjeta'}).click();
    await expect(page.getByRole('alert')).toContainText('Ese código no coincide');
    await expect(code).toHaveValue('123456');
    await expect(page.getByRole('button',{name:'Ver mi tarjeta'})).toBeEnabled();
    await page.evaluate(() => window.scrollTo({top:0,left:0,behavior:'instant'}));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.locator('.loyalty-portal')).toHaveCSS('transform','none');
    expect(await page.evaluate(() => ({screen:innerWidth,body:document.body.scrollWidth,root:document.documentElement.scrollWidth}))).toEqual({screen:width,body:width,root:width});
    await page.screenshot({path:`.impeccable/review/customer-otp-${width}.png`,fullPage:true});
    await page.getByRole('button',{name:'Cambiar número'}).click();
    await expect(page.getByLabel('Número celular')).toHaveValue('');
  });
}
