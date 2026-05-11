// cal 시스템 클라이언트 헬퍼 — me / charge / transactions API 호출 + Authorization 헤더 첨부.
import { getAccessToken } from './supabaseService';

const API_BASE = ((import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_API_BASE) ?? '';

export interface MeResponse {
  id: string;
  email: string | null;
  role: 'user' | 'admin';
  cal_balance: number;
  daily_usage_count: number;
  daily_usage_reset_at: string;
  age: number | null;
  gender: 'male' | 'female' | null;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  const base: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) base['Authorization'] = `Bearer ${token}`;
  return base;
}

export async function fetchMe(): Promise<MeResponse | null> {
  const token = await getAccessToken();
  if (!token) return null;
  const res = await fetch(`${API_BASE}/api/me`, { headers: { 'Authorization': `Bearer ${token}` } });
  if (!res.ok) return null;
  return await res.json() as MeResponse;
}

export async function chargeAd(ssvToken: string, adUnitId = 'dummy', adProvider = 'admob'): Promise<{ ok: boolean; cal_balance: number }> {
  const res = await fetch(`${API_BASE}/api/cal/charge/ad`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ ssvToken, adUnitId, adProvider }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `광고 보상 실패 (HTTP ${res.status})`);
  }
  return await res.json() as { ok: boolean; cal_balance: number };
}

export async function initPayment(packageId: string): Promise<{
  orderId: string;
  paymentOrderId: string;
  packageId: string;
  cal: number;
  krw: number;
  pgProvider: string;
}> {
  const res = await fetch(`${API_BASE}/api/cal/charge/payment/init`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ packageId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `결제 시작 실패 (HTTP ${res.status})`);
  }
  return await res.json();
}

export interface CalTransaction {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export async function fetchTransactions(cursor?: string, limit = 30): Promise<{ items: CalTransaction[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  params.set('limit', String(limit));
  const res = await fetch(`${API_BASE}/api/cal/transactions?${params}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`트랜잭션 조회 실패 (HTTP ${res.status})`);
  return await res.json();
}
