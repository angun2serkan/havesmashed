import { useEffect, useState, type FormEvent } from 'react'
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react'
import { adminApi } from '@/services/api'

interface CityRow {
  id: number
  name: string
  country_code: string
  latitude: number
  longitude: number
  population: number | null
}

const emptyForm = { name: '', country_code: '', latitude: '', longitude: '', population: '' }

export default function CitiesPage() {
  const [cities, setCities] = useState<CityRow[]>([])
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState(emptyForm)

  function fetchCities() {
    adminApi
      .getCities()
      .then(setCities)
      .catch((err: Error) => setError(err.message))
  }

  useEffect(() => {
    fetchCities()
  }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await adminApi.createCity({
        name: form.name,
        country_code: form.country_code,
        latitude: parseFloat(form.latitude),
        longitude: parseFloat(form.longitude),
        ...(form.population ? { population: parseInt(form.population) } : {}),
      })
      setForm(emptyForm)
      fetchCities()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create city')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this city?')) return
    try {
      await adminApi.deleteCity(id)
      fetchCities()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete city')
    }
  }

  function startEdit(city: CityRow) {
    setEditId(city.id)
    setEditForm({
      name: city.name,
      country_code: city.country_code,
      latitude: String(city.latitude),
      longitude: String(city.longitude),
      population: city.population != null ? String(city.population) : '',
    })
  }

  async function handleEditSave(id: number) {
    try {
      await adminApi.updateCity(id, {
        name: editForm.name,
        country_code: editForm.country_code,
        latitude: parseFloat(editForm.latitude),
        longitude: parseFloat(editForm.longitude),
        ...(editForm.population ? { population: parseInt(editForm.population) } : {}),
      })
      setEditId(null)
      fetchCities()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update city')
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Cities</h2>

      {/* Add City Form */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider mb-4">
          Add City
        </h3>
        <form onSubmit={handleCreate} className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <input
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            className="px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-neon-500 transition-colors"
          />
          <input
            placeholder="Country Code"
            value={form.country_code}
            onChange={(e) => setForm({ ...form, country_code: e.target.value })}
            required
            maxLength={2}
            className="px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-neon-500 transition-colors"
          />
          <input
            placeholder="Latitude"
            type="number"
            step="any"
            value={form.latitude}
            onChange={(e) => setForm({ ...form, latitude: e.target.value })}
            required
            className="px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-neon-500 transition-colors"
          />
          <input
            placeholder="Longitude"
            type="number"
            step="any"
            value={form.longitude}
            onChange={(e) => setForm({ ...form, longitude: e.target.value })}
            required
            className="px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-neon-500 transition-colors"
          />
          <input
            placeholder="Population"
            type="number"
            value={form.population}
            onChange={(e) => setForm({ ...form, population: e.target.value })}
            className="px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-neon-500 transition-colors"
          />
          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-2 py-2 bg-neon-500/20 text-neon-400 border border-neon-500/30 rounded-lg font-medium hover:bg-neon-500/30 transition-colors disabled:opacity-50"
          >
            <Plus size={16} />
            Add
          </button>
        </form>
      </div>

      {error && (
        <div className="text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Cities Table */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-dark-800 border-b border-dark-700">
              <th className="text-left px-4 py-3 text-dark-400 font-medium">ID</th>
              <th className="text-left px-4 py-3 text-dark-400 font-medium">Name</th>
              <th className="text-left px-4 py-3 text-dark-400 font-medium">Country</th>
              <th className="text-left px-4 py-3 text-dark-400 font-medium">Lat</th>
              <th className="text-left px-4 py-3 text-dark-400 font-medium">Lng</th>
              <th className="text-left px-4 py-3 text-dark-400 font-medium">Population</th>
              <th className="text-right px-4 py-3 text-dark-400 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {cities.map((city) => (
              <tr key={city.id} className="border-b border-dark-700/50 hover:bg-dark-900/50">
                {editId === city.id ? (
                  <>
                    <td className="px-4 py-2 text-dark-400">{city.id}</td>
                    <td className="px-4 py-2">
                      <input
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="px-2 py-1 bg-dark-900 border border-dark-600 rounded text-white text-sm w-full focus:outline-none focus:border-neon-500"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={editForm.country_code}
                        onChange={(e) => setEditForm({ ...editForm, country_code: e.target.value })}
                        maxLength={2}
                        className="px-2 py-1 bg-dark-900 border border-dark-600 rounded text-white text-sm w-20 focus:outline-none focus:border-neon-500"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={editForm.latitude}
                        onChange={(e) => setEditForm({ ...editForm, latitude: e.target.value })}
                        type="number"
                        step="any"
                        className="px-2 py-1 bg-dark-900 border border-dark-600 rounded text-white text-sm w-24 focus:outline-none focus:border-neon-500"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={editForm.longitude}
                        onChange={(e) => setEditForm({ ...editForm, longitude: e.target.value })}
                        type="number"
                        step="any"
                        className="px-2 py-1 bg-dark-900 border border-dark-600 rounded text-white text-sm w-24 focus:outline-none focus:border-neon-500"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={editForm.population}
                        onChange={(e) => setEditForm({ ...editForm, population: e.target.value })}
                        type="number"
                        className="px-2 py-1 bg-dark-900 border border-dark-600 rounded text-white text-sm w-24 focus:outline-none focus:border-neon-500"
                      />
                    </td>
                    <td className="px-4 py-2 text-right space-x-1">
                      <button
                        onClick={() => handleEditSave(city.id)}
                        className="p-1.5 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => setEditId(null)}
                        className="p-1.5 rounded bg-dark-700 text-dark-400 hover:bg-dark-600 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 text-dark-400">{city.id}</td>
                    <td className="px-4 py-3 text-white">{city.name}</td>
                    <td className="px-4 py-3 text-dark-300 uppercase">{city.country_code}</td>
                    <td className="px-4 py-3 text-dark-300">{city.latitude}</td>
                    <td className="px-4 py-3 text-dark-300">{city.longitude}</td>
                    <td className="px-4 py-3 text-dark-300">
                      {city.population != null ? city.population.toLocaleString() : '-'}
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <button
                        onClick={() => startEdit(city)}
                        className="p-1.5 rounded bg-neon-500/20 text-neon-400 hover:bg-neon-500/30 transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(city.id)}
                        className="p-1.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {cities.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-dark-500">
                  No cities found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
