import {restaurantFoodBilling} from '../functions/_shared/restaurant-food-billing.ts';
function equal(actual:unknown,expected:unknown):void { if (JSON.stringify(actual)!==JSON.stringify(expected)) throw new Error('Restaurant billing contract mismatch'); }
const order=(changes:Record<string,unknown>={}):Record<string,unknown>=>({
  items:[{cantidad:2,item:{precio:149.5,opcionesSeleccionadas:[{precio_extra:5}]}}],
  total:339,precio_entrega:40,descuento_plataforma:0,tipo_pedido:'domicilio',metodo_pago:'efectivo',estado_pago:'pendiente',...changes,
});
Deno.test('restaurant food value excludes delivery and never adds configured options twice',()=>{
  equal(restaurantFoodBilling(order()),{amount:'$299.00 MXN',payment:'Efectivo · sólo comida, sin envío'});
});
Deno.test('a subsidized delivery coupon never subtracts the courier fee from food',()=>{
  const result=restaurantFoodBilling(order({total:299,descuento_plataforma:40}));
  equal(result.amount,'$299.00 MXN'); equal(result.payment.includes('$40.00 MXN'),true);
});
Deno.test('pickup collection uses its persisted final food total after a platform discount',()=>{
  equal(restaurantFoodBilling(order({tipo_pedido:'tienda',precio_entrega:0,total:279,descuento_plataforma:20})).amount,'$279.00 MXN');
});
Deno.test('confirmed paid orders are explicitly zero to collect and retain the food reference',()=>{
  for (const method of ['en_linea','efectivo']) {
    const result=restaurantFoodBilling(order({metodo_pago:method,estado_pago:'pagado'}));
    equal(result.amount,'$0.00 MXN'); equal(result.payment.includes('no cobrar otra vez'),true); equal(result.payment.includes('$299.00 MXN'),true);
  }
});
Deno.test('online pending and unknown payment states never fabricate a paid receipt',()=>{
  for (const changes of [{metodo_pago:'en_linea'}, {estado_pago:null}, {estado_pago:'desconocido'}, {metodo_pago:'otro'}]) {
    let failed=false; try {restaurantFoodBilling(order(changes));} catch {failed=true;} equal(failed,true);
  }
});
Deno.test('missing, contradictory or malformed persisted amounts cannot become a zero collection',()=>{
  for (const changes of [{total:null},{total:'339'},{total:NaN},{total:-1},{precio_entrega:null},{total:339.001},
    {descuento_plataforma:null},{total:338},{tipo_pedido:'tienda'},{tipo_pedido:'mandadito'}]) {
    let failed=false;try {restaurantFoodBilling(order(changes));}catch{failed=true;}equal(failed,true);
  }
});
Deno.test('empty, excessive and invalid canonical lines never fall back to free-form descriptions',()=>{
  for (const items of [null,[],Array(101).fill({cantidad:1,item:{precio:1}}),[{cantidad:0,item:{precio:299}}],
    [{cantidad:1.2,item:{precio:299}}],[{cantidad:1,item:{precio:'299'}}],[{cantidad:101,item:{precio:299}}]]) {
    let failed=false;try {restaurantFoodBilling(order({items,descripcion:'Comida $299'}));}catch{failed=true;}equal(failed,true);
  }
});
Deno.test('an explicit free canonical food item is accepted without losing the delivery charge boundary',()=>{
  equal(restaurantFoodBilling(order({items:[{cantidad:1,item:{precio:0}}],total:40})).amount,'$0.00 MXN');
});
Deno.test('percentage discounts preserve the checkout final-rounding rule instead of rounding unit prices first',()=>{
 const value=order({items:[{cantidad:3,item:{precio:99.99}}],total:288.98,precio_entrega:40,descuento_plataforma:50.9949});
 equal(restaurantFoodBilling(value).amount,'$299.97 MXN');
});
