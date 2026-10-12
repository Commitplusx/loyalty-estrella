// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLoyaltyAccess } from './useLoyaltyAccess';
import { LoyaltyAccessError, type CustomerLoyaltyGateway, type LoginChallenge } from '@/lib/customer-loyalty';
import type { Cliente } from '@/types';

const profile: Cliente={id:'26000000-0000-4000-8000-000000000001',telefono:'0000000090',nombre:'QA',qr_code:'qa',puntos:1,envios_gratis_disponibles:0,
  envios_totales:1,es_vip:false,rango:'bronce',saldo_billetera:0,cupon_activo:null,acepta_terminos:true,created_at:'2026-10-12T12:00:00Z',updated_at:'2026-10-12T12:00:00Z'};
function gateway(): CustomerLoyaltyGateway {
  return {restore:vi.fn(async () => null),request:vi.fn(async challenge => ({...challenge,challengeId:'26000000-0000-4000-8000-000000000003',expiresAt:Date.now()+300000})),
    verify:vi.fn(async () => profile),profile:vi.fn(async () => profile),history:vi.fn(async () => []),signOut:vi.fn(async () => {}),subscribe:vi.fn(() => () => {})};
}
beforeEach(() => {localStorage.clear(); sessionStorage.clear();});
describe('Customer access state and recovery',() => {
  it('ignores the old local profile and PIN flag; deep links only prefill',async () => {
    localStorage.setItem('estrella_cliente',JSON.stringify(profile)); sessionStorage.setItem('pin_verified','true');
    const api=gateway(); const {result}=renderHook(() => useLoyaltyAccess(profile.telefono,api));
    await waitFor(() => expect(result.current.viewState).toBe('search'));
    expect(result.current.cliente).toBeNull(); expect(result.current.telefono).toBe(profile.telefono);
    expect(api.request).not.toHaveBeenCalled(); expect(api.history).not.toHaveBeenCalled();
    expect(localStorage.getItem('estrella_cliente')).toBeNull(); expect(sessionStorage.getItem('pin_verified')).toBeNull();
  });
  it('keeps the same send key on network failure and prevents concurrent sends',async () => {
    let rejectSend: (error: Error) => void = () => {throw new Error('Send not started');};
    const requests: LoginChallenge[]=[];
    const api=gateway(); api.request=vi.fn(challenge => {requests.push(challenge); return new Promise((_resolve,reject) => {rejectSend=reject;});});
    const {result}=renderHook(() => useLoyaltyAccess(profile.telefono,api));
    await waitFor(() => expect(result.current.viewState).toBe('search'));
    let send: Promise<void>=Promise.resolve();
    act(() => {send=result.current.requestCode();});
    await act(async () => {await result.current.requestCode(); rejectSend(new Error('Connection lost')); await send;});
    expect(requests).toHaveLength(1); expect(result.current.accessError).toBe('Connection lost');
    api.request=vi.fn(async challenge => ({...challenge,challengeId:'26000000-0000-4000-8000-000000000003',expiresAt:Date.now()+300000}));
    await act(async () => {await result.current.requestCode();});
    expect(api.request).toHaveBeenCalledWith(requests[0]); expect(result.current.viewState).toBe('otp');
  });
  it('preserves the code on a verification failure and shows a profile only after server success',async () => {
    const api=gateway(); const {result}=renderHook(() => useLoyaltyAccess(profile.telefono,api));
    await waitFor(() => expect(result.current.viewState).toBe('search'));
    await act(async () => {await result.current.requestCode();}); act(() => result.current.setCodigo('123456'));
    api.verify=vi.fn(async () => {throw new LoyaltyAccessError('Código incorrecto.','invalid_code');});
    await act(async () => {await result.current.verifyCode();});
    expect(result.current.codigo).toBe('123456'); expect(result.current.cliente).toBeNull(); expect(result.current.viewState).toBe('otp');
    api.verify=vi.fn(async () => profile);
    await act(async () => {await result.current.verifyCode();});
    expect(result.current.viewState).toBe('result'); expect(result.current.codigo).toBe('');
    expect(sessionStorage.getItem('estrella-loyalty-login-request')).toBeNull();
    expect(localStorage.getItem('estrella_cliente')).toBeNull();
  });
  it('keeps history failures visible and allows a bounded manual retry',async () => {
    const api=gateway(); api.restore=vi.fn(async () => profile); api.history=vi.fn(async () => {throw new Error('History unavailable');});
    const {result}=renderHook(() => useLoyaltyAccess('',api));
    await waitFor(() => expect(result.current.historyError).toBe('History unavailable'));
    expect(result.current.viewState).toBe('result');
    api.history=vi.fn(async () => []); await act(async () => {await result.current.retryHistory();});
    expect(result.current.historyError).toBe('');
  });
  it('discards a late profile response after logout',async () => {
    let resolveRefresh: (value: Cliente) => void = () => {throw new Error('Refresh not started');};
    const api=gateway(); api.restore=vi.fn(async () => profile);
    api.profile=vi.fn(() => new Promise(resolve => {resolveRefresh=resolve;}));
    const {result}=renderHook(() => useLoyaltyAccess('',api));
    await waitFor(() => expect(result.current.viewState).toBe('result'));
    let refresh: Promise<void>=Promise.resolve(); act(() => {refresh=result.current.refresh();});
    await act(async () => {await result.current.reset(); resolveRefresh(profile); await refresh;});
    expect(result.current.viewState).toBe('search'); expect(result.current.cliente).toBeNull();
  });
  it('requires new verification after the server invalidates ownership',async () => {
    const api=gateway(); api.restore=vi.fn(async () => profile); api.profile=vi.fn(async () => {throw new LoyaltyAccessError('Session ended','session_expired');});
    const {result}=renderHook(() => useLoyaltyAccess('',api));
    await waitFor(() => expect(result.current.viewState).toBe('result'));
    await act(async () => {await result.current.refresh();});
    expect(result.current.viewState).toBe('search'); expect(result.current.cliente).toBeNull(); expect(result.current.accessError).toBe('Session ended');
  });
});
