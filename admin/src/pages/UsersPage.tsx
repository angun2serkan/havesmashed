import { useEffect, useState, useMemo } from 'react'
import { Search, ArrowUpDown } from 'lucide-react'
import { adminApi } from '@/services/api'

interface UserRow {
  id: string
  nickname: string | null
  date_count: number
  friend_count: number
  created_at: string
  last_seen_at: string | null
  is_active: boolean
}

type SortKey = 'nickname' | 'date_count' | 'friend_count' | 'created_at' | 'last_seen_at'

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortAsc, setSortAsc] = useState(false)

  useEffect(() => {
    adminApi
      .getUsers()
      .then(setUsers)
      .catch((err: Error) => setError(err.message))
  }, [])

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase()
    const filtered = users.filter(
      (u) =>
        !q ||
        (u.nickname && u.nickname.toLowerCase().includes(q)) ||
        u.id.toLowerCase().includes(q)
    )

    filtered.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'nickname':
          cmp = (a.nickname ?? '').localeCompare(b.nickname ?? '')
          break
        case 'date_count':
          cmp = a.date_count - b.date_count
          break
        case 'friend_count':
          cmp = a.friend_count - b.friend_count
          break
        case 'created_at':
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          break
        case 'last_seen_at':
          cmp =
            new Date(a.last_seen_at ?? 0).getTime() -
            new Date(b.last_seen_at ?? 0).getTime()
          break
      }
      return sortAsc ? cmp : -cmp
    })

    return filtered
  }, [users, search, sortKey, sortAsc])

  function formatDate(dateStr: string | null) {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString()
  }

  if (error) {
    return (
      <div className="text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-4">
        Failed to load users: {error}
      </div>
    )
  }

  const sortableHeader = (label: string, key: SortKey) => (
    <th
      className="text-left px-4 py-3 text-dark-400 font-medium cursor-pointer hover:text-dark-200 transition-colors select-none"
      onClick={() => handleSort(key)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown
          size={12}
          className={sortKey === key ? 'text-neon-400' : 'text-dark-600'}
        />
      </span>
    </th>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Users</h2>
        <span className="text-dark-400 text-sm">{users.length} total</span>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500"
        />
        <input
          placeholder="Search by nickname or ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-dark-800 border border-dark-700 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-neon-500 transition-colors"
        />
      </div>

      {/* Users Table */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-dark-800 border-b border-dark-700">
              {sortableHeader('Nickname', 'nickname')}
              {sortableHeader('Dates', 'date_count')}
              {sortableHeader('Friends', 'friend_count')}
              {sortableHeader('Last Seen', 'last_seen_at')}
              {sortableHeader('Created', 'created_at')}
              <th className="text-left px-4 py-3 text-dark-400 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr
                key={user.id}
                className="border-b border-dark-700/50 hover:bg-dark-900/50"
              >
                <td className="px-4 py-3">
                  <div>
                    <span className="text-white font-medium">
                      {user.nickname ?? 'Anonymous'}
                    </span>
                    <p className="text-dark-500 text-xs font-mono mt-0.5">
                      {user.id.slice(0, 8)}...
                    </p>
                  </div>
                </td>
                <td className="px-4 py-3 text-dark-300">{user.date_count}</td>
                <td className="px-4 py-3 text-dark-300">{user.friend_count}</td>
                <td className="px-4 py-3 text-dark-400">{formatDate(user.last_seen_at)}</td>
                <td className="px-4 py-3 text-dark-400">{formatDate(user.created_at)}</td>
                <td className="px-4 py-3">
                  {user.is_active ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-green bg-accent-green/10 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent-green" />
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-dark-500 bg-dark-700/50 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-dark-500" />
                      Inactive
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-dark-500">
                  {search ? 'No users match your search' : 'No users found'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
