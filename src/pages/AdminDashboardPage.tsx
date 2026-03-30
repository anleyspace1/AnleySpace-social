import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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

function statusBadgeClass(status: string): string {
  if (status === 'approved') {
    return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
  }
  if (status === 'rejected') {
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
  }
  return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300';
}

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.email === ADMIN_EMAIL;
  const [requests, setRequests] = useState<WithdrawRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const stats = useMemo(() => {
    if (!requests) return null;
    const total = requests.length;
    const pending = requests.filter((r) => r.status === 'pending').length;
    const approved = requests.filter((r) => r.status === 'approved').length;
    const rejected = requests.filter((r) => r.status === 'rejected').length;
    const totalCoinsRequested = requests.reduce((sum, r) => sum + (Number(r.coins) || 0), 0);
    return { total, pending, approved, rejected, totalCoinsRequested };
  }, [requests]);

  const loadRequests = async () => {
    if (!isAdmin) return;
    try {
      setLoading(true);
      const headers = await getBearerAuthHeaders();
      if (!headers) throw new Error('Missing auth session');
      const res = await fetch(apiUrl('/api/admin/withdraw-requests'), { headers });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Failed to load requests');
      setRequests(Array.isArray(body) ? body : []);
    } catch (err: any) {
      alert(err?.message || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRequests();
  }, [isAdmin]);

  const handleAction = async (request: WithdrawRequest, action: 'approve' | 'reject') => {
    if (request.status !== 'pending') return;
    try {
      setBusyId(request.id);
      const headers = await getBearerAuthHeaders();
      if (!headers) throw new Error('Missing auth session');
      const res = await fetch(apiUrl(`/api/admin/withdraw-requests/${request.id}/${action}`), {
        method: 'POST',
        headers,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `Failed to ${action} request`);
      alert(action === 'approve' ? 'Withdraw approved' : 'Withdraw rejected and refunded');
      await loadRequests();
    } catch (err: any) {
      alert(err?.message || `Failed to ${action} request`);
    } finally {
      setBusyId(null);
    }
  };

  if (!isAdmin) return <div className="p-6 text-red-500">Access denied</div>;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 pb-20">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-black">Admin Dashboard</h1>
        <Link to="/admin/withdraws" className="text-sm font-bold text-indigo-400 hover:text-indigo-300">
          Withdraw-only page
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <div className="rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-700 p-4 shadow-lg">
          <p className="text-xs text-indigo-100">Total Requests</p>
          <p className="text-3xl font-black">{stats?.total ?? 0}</p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-yellow-500 to-yellow-600 p-4 shadow-lg">
          <p className="text-xs text-yellow-100">Pending</p>
          <p className="text-3xl font-black">{stats?.pending ?? 0}</p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-green-600 to-emerald-700 p-4 shadow-lg">
          <p className="text-xs text-green-100">Approved</p>
          <p className="text-3xl font-black">{stats?.approved ?? 0}</p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-rose-600 to-red-700 p-4 shadow-lg">
          <p className="text-xs text-rose-100">Rejected</p>
          <p className="text-3xl font-black">{stats?.rejected ?? 0}</p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-purple-600 to-fuchsia-700 p-4 shadow-lg">
          <p className="text-xs text-purple-100">Total Coins Requested</p>
          <p className="text-3xl font-black">{stats?.totalCoinsRequested ?? 0}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/20">
        <table className="min-w-full text-sm">
          <thead className="bg-white/5">
            <tr>
              <th className="text-left p-3 font-bold">user_id</th>
              <th className="text-left p-3 font-bold">coins</th>
              <th className="text-left p-3 font-bold">payment_method</th>
              <th className="text-left p-3 font-bold">payment_details</th>
              <th className="text-left p-3 font-bold">status</th>
              <th className="text-left p-3 font-bold">created_at</th>
              <th className="text-left p-3 font-bold">actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-gray-300">Loading...</td>
              </tr>
            ) : requests.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-gray-300">No withdraw requests found</td>
              </tr>
            ) : (
              requests.map((request) => {
                const pending = request.status === 'pending';
                const disabled = !pending || busyId === request.id;
                return (
                  <tr key={request.id} className="border-t border-white/10">
                    <td className="p-3">{request.user_id}</td>
                    <td className="p-3">{request.coins}</td>
                    <td className="p-3">{request.payment_method}</td>
                    <td className="p-3">{request.payment_details}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${statusBadgeClass(request.status)}`}>
                        {request.status}
                      </span>
                    </td>
                    <td className="p-3">{new Date(request.created_at).toLocaleString()}</td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => handleAction(request, 'approve')}
                          className="px-3 py-1.5 rounded-lg bg-green-600 disabled:bg-gray-600 text-white font-bold"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => handleAction(request, 'reject')}
                          className="px-3 py-1.5 rounded-lg bg-red-600 disabled:bg-gray-600 text-white font-bold"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

