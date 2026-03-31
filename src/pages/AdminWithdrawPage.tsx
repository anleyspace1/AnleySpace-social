import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiUrl } from '../lib/apiOrigin';
import { getBearerAuthHeaders } from '../lib/supabaseAuthHeaders';

type WithdrawRequest = {
  id: string;
  user_id: string;
  coins: number;
  status: 'pending' | 'approved' | 'rejected' | string;
  payment_method: string;
  payment_details: string;
  created_at: string;
};

const ADMIN_EMAIL = 'anleyspace@gmail.com';

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'approved'
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
      : status === 'rejected'
        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
        : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300';
  return <span className={`px-2 py-1 rounded-full text-xs font-bold ${cls}`}>{status}</span>;
}

export default function AdminWithdrawPage() {
  const { user, profile, loading: authLoading } = useAuth();
  console.log('ADMIN CHECK:', profile);
  const role = typeof profile?.role === 'string' ? profile.role.trim().toLowerCase() : '';
  const isAdmin = role === 'admin' || user?.email === ADMIN_EMAIL;
  const waitingProfile = !!user && !profile;
  const [requests, setRequests] = useState<WithdrawRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const canRender = useMemo(() => Boolean(user) && isAdmin, [user, isAdmin]);

  const loadRequests = async () => {
    if (!canRender) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError('');
      const headers = await getBearerAuthHeaders();
      if (!headers) {
        setError('Missing auth session.');
        return;
      }
      const res = await fetch(apiUrl('/api/admin/withdraw-requests'), { headers });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Failed to load requests');
      setRequests(Array.isArray(body) ? body : []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRequests();
  }, [canRender]);

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    try {
      setBusyId(id);
      setError('');
      const headers = await getBearerAuthHeaders();
      if (!headers) throw new Error('Missing auth session.');
      const res = await fetch(apiUrl(`/api/admin/withdraw-requests/${id}/${action}`), {
        method: 'POST',
        headers,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `Failed to ${action} request`);
      alert(action === 'approve' ? 'Request approved' : 'Request rejected and refunded');
      await loadRequests();
    } catch (err: any) {
      setError(err?.message || `Failed to ${action} request`);
    } finally {
      setBusyId(null);
    }
  };

  if (authLoading || waitingProfile) return null;
  if (!canRender) return null;

  return (
    <div className="max-w-6xl mx-auto p-4 lg:p-8">
      <h1 className="text-2xl font-black text-white mb-6">Withdraw Requests (Admin)</h1>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-200">Loading...</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/20">
          <table className="min-w-full text-sm text-white">
            <thead className="bg-white/5">
              <tr>
                <th className="text-left p-3 font-bold">User ID</th>
                <th className="text-left p-3 font-bold">Coins</th>
                <th className="text-left p-3 font-bold">Method</th>
                <th className="text-left p-3 font-bold">Details</th>
                <th className="text-left p-3 font-bold">Status</th>
                <th className="text-left p-3 font-bold">Created At</th>
                <th className="text-left p-3 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => {
                const isPending = request.status === 'pending';
                const disabled = !isPending || busyId === request.id;
                return (
                  <tr key={request.id} className="border-t border-white/10">
                    <td className="p-3">{request.user_id}</td>
                    <td className="p-3">{request.coins}</td>
                    <td className="p-3">{request.payment_method}</td>
                    <td className="p-3">{request.payment_details}</td>
                    <td className="p-3"><StatusBadge status={request.status} /></td>
                    <td className="p-3">{new Date(request.created_at).toLocaleString()}</td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => handleAction(request.id, 'approve')}
                          className="px-3 py-1.5 rounded-lg bg-green-600 disabled:bg-gray-600 text-white font-bold"
                        >
                          Approve ✅
                        </button>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => handleAction(request.id, 'reject')}
                          className="px-3 py-1.5 rounded-lg bg-red-600 disabled:bg-gray-600 text-white font-bold"
                        >
                          Reject ❌
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {requests.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-gray-300">
                    No withdraw requests found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

