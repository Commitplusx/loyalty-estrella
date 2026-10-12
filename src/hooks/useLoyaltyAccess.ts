import { useCallback, useEffect, useRef, useState } from 'react';
import { customerLoyalty, loginChallengeSchema, LoyaltyAccessError, type CustomerLoyaltyGateway, type LoginChallenge } from '@/lib/customer-loyalty';
import type { Cliente, RegistroMovimiento } from '@/types';

const pendingKey = 'estrella-loyalty-login-request';
type View = 'search' | 'loading' | 'otp' | 'result' | 'error-not-found' | 'error-generic';
function readPending(): LoginChallenge | null {
  try {const raw: unknown = JSON.parse(sessionStorage.getItem(pendingKey) ?? 'null'); return loginChallengeSchema.safeParse(raw).data ?? null;}
  catch {return null;}
}
function remember(challenge: LoginChallenge | null) {
  try {if (challenge) sessionStorage.setItem(pendingKey,JSON.stringify(challenge)); else sessionStorage.removeItem(pendingKey);}
  catch { /* A disabled browser store never grants access. The active request remains in memory. */ }
}
function message(error: unknown): string {return error instanceof Error ? error.message : 'No pudimos completar la solicitud. Intenta de nuevo.';}

export function useLoyaltyAccess(prefill: string, gateway: CustomerLoyaltyGateway = customerLoyalty) {
  const [telefono,setTelefono] = useState(prefill);
  const [cliente,setCliente] = useState<Cliente | null>(null);
  const [historial,setHistorial] = useState<RegistroMovimiento[]>([]);
  const [viewState,setViewState] = useState<View>('loading');
  const [challenge,setChallenge] = useState<LoginChallenge | null>(null);
  const [codigo,setCodigo] = useState('');
  const [busy,setBusy] = useState(false);
  const [accessError,setAccessError] = useState('');
  const [historyError,setHistoryError] = useState('');
  const [refreshError,setRefreshError] = useState('');
  const [newAccumulationId,setNewAccumulationId] = useState<string | null>(null);
  const epoch = useRef(0);
  const inFlight = useRef(false);
  const refreshInFlight = useRef(false);

  const loadHistory = useCallback(async (generation: number) => {
    try {const rows=await gateway.history(); if (epoch.current===generation) {setHistorial(rows); setHistoryError('');}}
    catch(error: unknown) {if (epoch.current===generation) setHistoryError(message(error));}
  },[gateway]);
  const showProfile = useCallback((profile: Cliente,generation: number) => {
    if (epoch.current!==generation) return;
    setCliente(profile); setTelefono(profile.telefono); setViewState('result'); setChallenge(null); setCodigo('');
    remember(null); setAccessError(''); setRefreshError(''); void loadHistory(generation);
  },[loadHistory]);
  const restore = useCallback(async () => {
    const generation=++epoch.current;
    setViewState('loading'); setAccessError('');
    try {
      const profile=await gateway.restore();
      if (epoch.current!==generation) return;
      if (profile) {showProfile(profile,generation); return;}
      const pending=readPending();
      if (pending && (!prefill || pending.phone===prefill)) {
        setChallenge(pending); setTelefono(pending.phone); setViewState(pending.challengeId?'otp':'search');
      } else {setTelefono(prefill); setViewState('search');}
    } catch(error: unknown) {if (epoch.current===generation) {setAccessError(message(error)); setViewState('error-generic');}}
  },[gateway,prefill,showProfile]);
  useEffect(() => {
    // Remove the old profile/PIN cache without ever using it as identity proof.
    try {localStorage.removeItem('estrella_cliente'); sessionStorage.removeItem('pin_verified');} catch { /* No storage is treated as no stored identity. */ }
    void restore();
    return () => {epoch.current++;};
  },[restore]);

  const requestCode = async (newCode = false) => {
    if (inFlight.current || !/^\d{10}$/.test(telefono)) return;
    inFlight.current=true; setBusy(true); setAccessError('');
    const generation=epoch.current;
    const next=!newCode && challenge?.phone===telefono ? challenge : {phone:telefono,key:crypto.randomUUID()};
    setChallenge(next); remember(next);
    try {
      const sent=await gateway.request(next);
      if (epoch.current!==generation) return;
      setChallenge(sent); remember(sent); setCodigo(''); setViewState('otp');
    } catch(error: unknown) {
      if (epoch.current!==generation) return;
      setAccessError(message(error));
      if (error instanceof LoyaltyAccessError && error.code==='customer_not_registered') setViewState('error-not-found');
      if (error instanceof LoyaltyAccessError && error.code==='login_new_request_required') {
        setChallenge(null); remember(null);
      }
    } finally {inFlight.current=false; if (epoch.current===generation) setBusy(false);}
  };
  const verifyCode = async () => {
    if (inFlight.current || !challenge || !/^\d{6}$/.test(codigo)) return;
    inFlight.current=true; setBusy(true); setAccessError('');
    const generation=epoch.current;
    try {showProfile(await gateway.verify(challenge,codigo),generation);}
    catch(error: unknown) {if (epoch.current===generation) setAccessError(message(error));}
    finally {inFlight.current=false; if (epoch.current===generation) setBusy(false);}
  };
  const reset = async () => {
    if (inFlight.current) return;
    inFlight.current=true; setBusy(true);
    try {
      await gateway.signOut(); ++epoch.current; remember(null);
      setCliente(null); setHistorial([]); setChallenge(null); setCodigo(''); setTelefono(''); setNewAccumulationId(null);
      setAccessError(''); setRefreshError(''); setHistoryError(''); setViewState('search');
    } catch(error: unknown) {setAccessError(message(error));}
    finally {inFlight.current=false; setBusy(false);}
  };
  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current=true;
    const generation=epoch.current;
    try {
      const profile=await gateway.profile();
      if (epoch.current===generation) {setCliente(profile); setRefreshError(''); await loadHistory(generation);}
    } catch(error: unknown) {
      if (epoch.current!==generation) return;
      if (error instanceof LoyaltyAccessError && error.code==='session_expired') {
        setCliente(null); setHistorial([]); setViewState('search'); setAccessError(message(error));
      } else setRefreshError(message(error));
    } finally {refreshInFlight.current=false;}
  },[gateway,loadHistory]);
  const customerId=cliente?.id;
  useEffect(() => {
    if (!customerId || viewState!=='result') return;
    const unsubscribe=gateway.subscribe(customerId,pointId => {if (pointId) setNewAccumulationId(pointId); void refresh();},() => {
      ++epoch.current; setCliente(null); setHistorial([]); setViewState('search');
    });
    const onVisible=() => {if (document.visibilityState==='visible') void refresh();};
    window.addEventListener('online',onVisible); document.addEventListener('visibilitychange',onVisible);
    return () => {unsubscribe(); window.removeEventListener('online',onVisible); document.removeEventListener('visibilitychange',onVisible);};
  },[customerId,viewState,gateway,refresh]);
  return {telefono,setTelefono,cliente,setCliente,historial,viewState,challenge,codigo,setCodigo,busy,accessError,
    historyError,refreshError,newAccumulationId,requestCode,verifyCode,reset,restore,refresh,retryHistory:() => loadHistory(epoch.current)};
}
