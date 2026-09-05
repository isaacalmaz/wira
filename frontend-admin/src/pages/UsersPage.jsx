import { useState } from 'react';
import { mockUsers } from '../data/mockData';
import { Search, MoreVertical } from 'lucide-react';

const UsersPage = () => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Manajemen Pengguna</h1>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input type="text" placeholder="Cari nama, email, atau no HP..." className="input-field pl-10 py-2 w-full" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-6 py-4 text-sm font-semibold text-slate-900 dark:text-white">Nama / Kontak</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-900 dark:text-white">Peran</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-900 dark:text-white">Saldo WiraPay</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-900 dark:text-white">Bergabung</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-900 dark:text-white">Status</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {mockUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900 dark:text-white">{user.name}</div>
                    <div className="text-xs text-slate-500">{user.phone} | {user.email}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">{user.role}</td>
                  <td className="px-6 py-4 text-sm text-slate-900 dark:text-white">Rp {user.balance.toLocaleString('id-ID')}</td>
                  <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">{user.joinDate}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      user.status === 'Aktif' 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                    }`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                      <MoreVertical size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default UsersPage;
