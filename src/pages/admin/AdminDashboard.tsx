import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Package, CheckCircle2, XCircle, Clock,
  Users, Star, AlertTriangle, Zap, RefreshCw,
  Bike, Bell, BarChart3, Activity, ShieldAlert,
  CloudRain, TrendingUp, Eye, Lock
} from "lucide-react";

interface DashboardMetrics {
  pedidosTotal: number; pedidosEntregados: number; pedidosCancelados: number;
  pedidosEnCurso: number; clientesNuevos: number; puntosTransacciones: number;
  erroresCriticos: number; repartidoresActivos: number;
}
interface PedidoReciente { id: string; estado: string; cliente_tel: string; restaurante: string; created_at: string; }
interface ErrorReciente { id: string; level: string; source: string; message: string; created_at: string; }

const ESTADO_CFG: Record<string,{label:string;color:string}> = {
  pendiente:           { label:"Pendiente",    color:"#f59e0b" },
  buscando_repartidor: { label:"Buscando",     color:"#8b5cf6" },
  asignado:            { label:"Asignado",     color:"#3b82f6" },
  en_camino:           { label:"En Camino",    color:"#06b6d4" },
  entregado:           { label:"Entregado",    color:"#10b981" },
  cancelado:           { label:"Cancelado",    color:"#ef4444" },
};
const fmtTime  = (iso:string) => new Date(iso).toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"});
const fmtRel   = (iso:string) => { const m=Math.floor((Date.now()-new Date(iso).getTime())/60000); return m<1?"ahora":m<60?`hace ${m}m`:`hace ${Math.floor(m/60)}h`; };

function KCard({icon,label,value,sub,color,pulse=false}:{icon:React.ReactNode;label:string;value:number|string;sub?:string;color:string;pulse?:boolean}) {
  return (
    <div style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:16,padding:"20px 22px",position:"relative",overflow:"hidden"}}>
      {pulse && <span style={{position:"absolute",top:12,right:12,width:8,height:8,borderRadius:"50%",background:color,boxShadow:`0 0 8px ${color}`,animation:"pulse 2s infinite"}}/>}
      <div style={{display:"flex",alignItems:"center",gap:7,color,marginBottom:8}}>{icon}<span style={{fontSize:11,fontWeight:600,opacity:.8,textTransform:"uppercase",letterSpacing:".06em"}}>{label}</span></div>
      <div style={{fontSize:34,fontWeight:800,color:"#f1f5f9",lineHeight:1}}>{value}</div>
      {sub && <div style={{fontSize:11,color:"rgba(255,255,255,.38)",marginTop:5}}>{sub}</div>}
    </div>
  );
}

export function AdminDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  
  const [m, setM] = useState<DashboardMetrics>({pedidosTotal:0,pedidosEntregados:0,pedidosCancelados:0,pedidosEnCurso:0,clientesNuevos:0,puntosTransacciones:0,erroresCriticos:0,repartidoresActivos:0});
  const [pedidos, setPedidos] = useState<PedidoReciente[]>([]);
  const [errores, setErrores] = useState<ErrorReciente[]>([]);
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState(new Date());
  const [cronLoad, setCronLoad] = useState("");

  const hoy = useCallback(()=>{ const d=new Date(); d.setHours(0,0,0,0); return d.toISOString(); },[]);

  const load = useCallback(async()=>{
    if (!isAuthenticated) return;
    const inicio = hoy();
    const [r1,r2,r3,r4,r5] = await Promise.all([
      supabase.from("pedidos").select("id,estado").gte("created_at",inicio),
      supabase.from("clientes").select("id").gte("created_at",inicio),
      supabase.from("system_logs").select("id,level,source,message,created_at").eq("level","critical").gte("created_at",inicio).order("created_at",{ascending:false}).limit(5),
      supabase.from("restaurante_loyalty_log").select("accion").gte("created_at",inicio),
      supabase.from("repartidores").select("id").eq("activo",true),
    ]);
    const ps=r1.data||[]; const activos=["buscando_repartidor","asignado","en_camino"];
    setM({
      pedidosTotal:ps.length, pedidosEntregados:ps.filter((p:any)=>p.estado==="entregado").length,
      pedidosCancelados:ps.filter((p:any)=>p.estado==="cancelado").length, pedidosEnCurso:ps.filter((p:any)=>activos.includes(p.estado)).length,
      clientesNuevos:(r2.data||[]).length, puntosTransacciones:(r4.data||[]).filter((l:any)=>l.accion==="sumar_puntos").length,
      erroresCriticos:(r3.data||[]).length, repartidoresActivos:(r5.data||[]).length,
    });
    setErrores((r3.data||[]) as ErrorReciente[]);
    setUpdated(new Date()); setLoading(false);
  },[hoy, isAuthenticated]);

  const loadPedidos = useCallback(async()=>{
    if (!isAuthenticated) return;
    const {data}=await supabase.from("pedidos").select("id,estado,cliente_tel,restaurante,created_at").order("created_at",{ascending:false}).limit(10);
    setPedidos((data||[]) as PedidoReciente[]);
  },[isAuthenticated]);

  useEffect(()=>{ 
    if (!isAuthenticated) return;
    load(); loadPedidos();
    const ch=supabase.channel("dash_live")
      .on("postgres_changes",{event:"*",schema:"public",table:"pedidos"},()=>{load();loadPedidos();})
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"clientes"},()=>load())
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"system_logs"},()=>load())
      .subscribe();
    return ()=>{ supabase.removeChannel(ch); };
  },[load,loadPedidos,isAuthenticated]);

  const cron = async(event:string)=>{
    setCronLoad(event);
    try {
      const {error}=await supabase.functions.invoke("whatsapp-bot",{body:{event},headers:{"x-cron-auth":import.meta.env.VITE_CRON_SECRET||""}});
      if(error) alert(`Error: ${error.message}`); else { alert(`✅ ${event} ejecutado`); load(); }
    } catch(e:any){ alert(`Error: ${e.message}`); } finally { setCronLoad(""); }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === (import.meta.env.VITE_ADMIN_PASSWORD || "estrella2026")) {
      setIsAuthenticated(true);
    } else {
      alert("Contraseña incorrecta");
    }
  };

  if (!isAuthenticated) {
    return (
      <div style={{minHeight:"100vh",background:"#0f172a",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif"}}>
        <form onSubmit={handleLogin} style={{background:"rgba(255,255,255,0.05)",padding:"40px",borderRadius:24,border:"1px solid rgba(255,255,255,0.1)",display:"flex",flexDirection:"column",gap:20,width:320,textAlign:"center"}}>
          <div style={{margin:"0 auto",background:"#6366f1",width:50,height:50,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",color:"white"}}><Lock size={24}/></div>
          <h2 style={{color:"white",margin:0,fontSize:20,fontWeight:700}}>Acceso Administrador</h2>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Contraseña..." style={{background:"rgba(0,0,0,0.2)",border:"1px solid rgba(255,255,255,0.1)",color:"white",padding:"12px 16px",borderRadius:12,outline:"none",fontSize:14}} autoFocus/>
          <button type="submit" style={{background:"#6366f1",color:"white",border:"none",padding:"12px",borderRadius:12,fontWeight:600,cursor:"pointer",transition:"opacity 0.2s"}} onMouseOver={e=>e.currentTarget.style.opacity="0.8"} onMouseOut={e=>e.currentTarget.style.opacity="1"}>Ingresar</button>
        </form>
      </div>
    );
  }

  if(loading) return (
    <div style={{minHeight:"100vh",background:"#0f172a",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:"#94a3b8",display:"flex",alignItems:"center",gap:12,fontSize:17}}>
        <RefreshCw size={20} style={{animation:"spin 1s linear infinite"}}/>Cargando métricas en vivo...
      </div>
    </div>
  );

  const pct = m.pedidosTotal>0?Math.round(m.pedidosEntregados/m.pedidosTotal*100):0;

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0f172a 0%,#1e1b4b 50%,#0f172a 100%)",fontFamily:"'Inter',sans-serif",color:"#f1f5f9",padding:"28px 20px"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:28}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:42,height:42,borderRadius:13,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center"}}><BarChart3 size={22}/></div>
          <div>
            <h1 style={{fontSize:22,fontWeight:800,margin:0,background:"linear-gradient(135deg,#e0e7ff,#c7d2fe)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Centro de Control</h1>
            <p style={{margin:0,fontSize:12,color:"rgba(255,255,255,.4)"}}>{new Date().toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long"})}</p>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"rgba(255,255,255,.35)"}}>
          <Activity size={13} style={{color:"#10b981"}}/> Live · {fmtTime(updated.toISOString())}
          <button onClick={()=>{load();loadPedidos();}} style={{background:"rgba(255,255,255,.07)",border:"none",color:"#94a3b8",borderRadius:8,padding:"5px 9px",cursor:"pointer",marginLeft:4}}>
            <RefreshCw size={13}/>
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:14,marginBottom:14}}>
        <KCard icon={<Package size={15}/>} label="Pedidos Hoy" value={m.pedidosTotal} sub={`${m.pedidosEnCurso} activos ahora`} color="#6366f1" pulse={m.pedidosEnCurso>0}/>
        <KCard icon={<CheckCircle2 size={15}/>} label="Entregados" value={m.pedidosEntregados} sub={`${pct}% de completado`} color="#10b981"/>
        <KCard icon={<Bike size={15}/>} label="En Curso" value={m.pedidosEnCurso} color="#06b6d4" pulse={m.pedidosEnCurso>0}/>
        <KCard icon={<XCircle size={15}/>} label="Cancelados" value={m.pedidosCancelados} color="#f43f5e"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:14,marginBottom:28}}>
        <KCard icon={<Users size={15}/>} label="Clientes Nuevos" value={m.clientesNuevos} sub="registrados hoy" color="#f59e0b"/>
        <KCard icon={<Star size={15}/>} label="Lealtad" value={m.puntosTransacciones} sub="transacciones de puntos" color="#a78bfa"/>
        <KCard icon={<Bike size={15}/>} label="Repartidores" value={m.repartidoresActivos} sub="equipo activo" color="#34d399"/>
        <KCard icon={<ShieldAlert size={15}/>} label="Errores Críticos" value={m.erroresCriticos} sub="Últimas 24h" color={m.erroresCriticos>0?"#f43f5e":"#10b981"} pulse={m.erroresCriticos>0}/>
      </div>

      {/* Main grid */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 320px",gap:20}}>
        {/* Pedidos en vivo */}
        <div style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:16,overflow:"hidden"}}>
          <div style={{padding:"18px 22px",borderBottom:"1px solid rgba(255,255,255,.08)",display:"flex",alignItems:"center",gap:8}}>
            <Eye size={15} style={{color:"#6366f1"}}/><span style={{fontWeight:700,fontSize:14}}>Pedidos en Tiempo Real</span>
            <span style={{marginLeft:"auto",fontSize:11,color:"#10b981",display:"flex",alignItems:"center",gap:4}}><Activity size={11}/>LIVE</span>
          </div>
          {pedidos.length===0
            ? <div style={{padding:"40px",textAlign:"center",color:"rgba(255,255,255,.3)",fontSize:13}}>No hay pedidos recientes</div>
            : pedidos.map(p=>{
              const cfg=ESTADO_CFG[p.estado]||{label:p.estado,color:"#94a3b8"};
              return (
                <div key={p.id} style={{padding:"13px 22px",borderBottom:"1px solid rgba(255,255,255,.05)",display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:7,height:7,borderRadius:"50%",background:cfg.color,flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.restaurante||"Sin restaurante"} · {p.cliente_tel}</div>
                    <div style={{fontSize:11,color:"rgba(255,255,255,.35)",marginTop:2}}>{fmtRel(p.created_at)}</div>
                  </div>
                  <span style={{fontSize:11,fontWeight:600,color:cfg.color,background:`${cfg.color}20`,borderRadius:6,padding:"3px 8px",whiteSpace:"nowrap"}}>{cfg.label}</span>
                </div>
              );
            })
          }
        </div>

        {/* Sidebar */}
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          {/* Errores */}
          <div style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:16,overflow:"hidden"}}>
            <div style={{padding:"15px 18px",borderBottom:"1px solid rgba(255,255,255,.08)",display:"flex",alignItems:"center",gap:8}}>
              <AlertTriangle size={14} style={{color:m.erroresCriticos>0?"#f43f5e":"#10b981"}}/><span style={{fontWeight:700,fontSize:13}}>Errores Críticos</span>
            </div>
            {errores.length===0
              ? <div style={{padding:"18px",textAlign:"center",color:"#10b981",fontSize:12}}>✅ Sin errores críticos hoy</div>
              : errores.slice(0,4).map(e=>(
                <div key={e.id} style={{padding:"9px 16px",borderBottom:"1px solid rgba(255,255,255,.05)"}}>
                  <div style={{fontSize:11,fontWeight:600,color:"#fca5a5",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>[{e.source}] {e.message}</div>
                  <div style={{fontSize:10,color:"rgba(255,255,255,.3)",marginTop:2}}>{fmtRel(e.created_at)}</div>
                </div>
              ))
            }
          </div>

          {/* Cron Actions */}
          <div style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:16,overflow:"hidden"}}>
            <div style={{padding:"15px 18px",borderBottom:"1px solid rgba(255,255,255,.08)",display:"flex",alignItems:"center",gap:8}}>
              <Zap size={14} style={{color:"#f59e0b"}}/><span style={{fontWeight:700,fontSize:13}}>Acciones Rápidas</span>
            </div>
            <div style={{padding:"12px 14px",display:"flex",flexDirection:"column",gap:7}}>
              {[
                {event:"CRON_VIGIA_LOGISTICA",label:"Ejecutar Vigía Logística",icon:<Bell size={12}/>,color:"#f59e0b"},
                {event:"CRON_CLIMA",label:"Verificar Clima",icon:<CloudRain size={12}/>,color:"#06b6d4"},
                {event:"CRON_RESUMEN_DISCORD",label:"Reporte a Discord",icon:<TrendingUp size={12}/>,color:"#7c3aed"},
                {event:"CRON_CUMPLEANOS",label:"Enviar Cumpleaños",icon:<Star size={12}/>,color:"#f43f5e"},
              ].map(a=>(
                <button key={a.event} onClick={()=>cron(a.event)} disabled={!!cronLoad}
                  style={{background:cronLoad===a.event?"rgba(255,255,255,.05)":`${a.color}18`,border:`1px solid ${a.color}45`,color:cronLoad===a.event?"#64748b":a.color,borderRadius:9,padding:"8px 13px",cursor:cronLoad?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:7,fontSize:12,fontWeight:600,transition:"all .2s"}}>
                  {cronLoad===a.event?<RefreshCw size={12} style={{animation:"spin 1s linear infinite"}}/>:a.icon}
                  {cronLoad===a.event?"Ejecutando...":a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
