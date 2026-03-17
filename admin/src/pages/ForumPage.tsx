import { useEffect, useState, useMemo } from 'react'
import { Search, Trash2, ArrowUpDown } from 'lucide-react'
import { adminApi } from '@/services/api'

interface ForumTopic {
  id: string
  title: string
  author_nickname: string | null
  is_anonymous: boolean
  category: string
  like_count: number
  comment_count: number
  is_pinned: boolean
  is_locked: boolean
  is_deleted: boolean
  created_at: string
}

type SortKey = 'title' | 'like_count' | 'comment_count' | 'created_at'

const categoryColors: Record<string, { bg: string; text: string }> = {
  genel: { bg: 'bg-blue-500/15', text: 'text-blue-400' },
  soru: { bg: 'bg-purple-500/15', text: 'text-purple-400' },
  tartisma: { bg: 'bg-orange-500/15', text: 'text-orange-400' },
  oneri: { bg: 'bg-green-500/15', text: 'text-green-400' },
  sikayet: { bg: 'bg-red-500/15', text: 'text-red-400' },
}

const defaultCategoryColor = { bg: 'bg-dark-600/50', text: 'text-dark-300' }

export default function ForumPage() {
  const [topics, setTopics] = useState<ForumTopic[]>([])
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortAsc, setSortAsc] = useState(false)

  function fetchTopics() {
    adminApi
      .getForumTopics()
      .then(setTopics)
      .catch((err: Error) => setError(err.message))
  }

  useEffect(() => {
    fetchTopics()
  }, [])

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this topic? This action cannot be undone.')) return
    try {
      await adminApi.deleteForumTopic(id)
      fetchTopics()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete topic')
    }
  }

  async function handleTogglePin(id: string) {
    try {
      await adminApi.toggleForumPin(id)
      fetchTopics()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle pin')
    }
  }

  async function handleToggleLock(id: string) {
    try {
      await adminApi.toggleForumLock(id)
      fetchTopics()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle lock')
    }
  }

  const filteredTopics = useMemo(() => {
    const q = search.toLowerCase()
    const filtered = topics.filter(
      (t) =>
        !q ||
        t.title.toLowerCase().includes(q) ||
        (t.author_nickname && t.author_nickname.toLowerCase().includes(q)) ||
        t.category.toLowerCase().includes(q)
    )

    filtered.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'title':
          cmp = a.title.localeCompare(b.title)
          break
        case 'like_count':
          cmp = a.like_count - b.like_count
          break
        case 'comment_count':
          cmp = a.comment_count - b.comment_count
          break
        case 'created_at':
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          break
      }
      return sortAsc ? cmp : -cmp
    })

    return filtered
  }, [topics, search, sortKey, sortAsc])

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString()
  }

  if (error) {
    return (
      <div className="text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-4">
        Failed to load forum topics: {error}
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
        <h2 className="text-2xl font-bold">Forum</h2>
        <span className="text-dark-400 text-sm">{topics.length} total</span>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500"
        />
        <input
          placeholder="Search by title, author, or category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-dark-800 border border-dark-700 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-neon-500 transition-colors"
        />
      </div>

      {/* Topics Table */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-dark-800 border-b border-dark-700">
              {sortableHeader('Title', 'title')}
              <th className="text-left px-4 py-3 text-dark-400 font-medium">Author</th>
              <th className="text-left px-4 py-3 text-dark-400 font-medium">Category</th>
              {sortableHeader('Likes', 'like_count')}
              {sortableHeader('Comments', 'comment_count')}
              <th className="text-center px-4 py-3 text-dark-400 font-medium">Pinned</th>
              <th className="text-center px-4 py-3 text-dark-400 font-medium">Locked</th>
              {sortableHeader('Created', 'created_at')}
              <th className="text-right px-4 py-3 text-dark-400 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTopics.map((topic) => {
              const catColor = categoryColors[topic.category] ?? defaultCategoryColor
              return (
                <tr
                  key={topic.id}
                  className="border-b border-dark-700/50 hover:bg-dark-900/50"
                >
                  <td className="px-4 py-3">
                    <span
                      className={`text-white font-medium ${topic.is_deleted ? 'line-through text-dark-500' : ''}`}
                    >
                      {topic.title}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-dark-300">
                    {topic.is_anonymous ? 'Anonim' : (topic.author_nickname ?? 'Anonim')}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${catColor.bg} ${catColor.text}`}
                    >
                      {topic.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-dark-300">{topic.like_count}</td>
                  <td className="px-4 py-3 text-dark-300">{topic.comment_count}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleTogglePin(topic.id)}
                      className={`p-1.5 rounded transition-colors cursor-pointer ${
                        topic.is_pinned
                          ? 'bg-yellow-500/20 hover:bg-yellow-500/30'
                          : 'bg-dark-700/50 hover:bg-dark-600'
                      }`}
                      title={topic.is_pinned ? 'Unpin topic' : 'Pin topic'}
                    >
                      <span className={topic.is_pinned ? '' : 'opacity-30'}>📌</span>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggleLock(topic.id)}
                      className={`p-1.5 rounded transition-colors cursor-pointer ${
                        topic.is_locked
                          ? 'bg-red-500/20 hover:bg-red-500/30'
                          : 'bg-dark-700/50 hover:bg-dark-600'
                      }`}
                      title={topic.is_locked ? 'Unlock topic' : 'Lock topic'}
                    >
                      <span className={topic.is_locked ? '' : 'opacity-30'}>🔒</span>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-dark-400">{formatDate(topic.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(topic.id)}
                      className="p-1.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                      title="Delete topic"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              )
            })}
            {filteredTopics.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-dark-500">
                  {search ? 'No topics match your search' : 'No forum topics found'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
