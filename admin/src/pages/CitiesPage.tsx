import { useEffect, useState, useRef, useMemo, useCallback, type FormEvent } from 'react'
import { Plus, Pencil, Trash2, X, Check, MapPin, Filter, ArrowLeft } from 'lucide-react'
import { adminApi } from '@/services/api'
import { MapContainer, TileLayer, GeoJSON, Marker, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix default marker icon
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

interface CityRow {
  id: number
  name: string
  country_code: string
  latitude: number
  longitude: number
  population: number | null
}

const emptyForm = { name: '', country_code: '', latitude: '', longitude: '', population: '' }

// Click handler component for Leaflet
function ClickHandler({ onSelect }: { onSelect: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onSelect(
        parseFloat(e.latlng.lat.toFixed(6)),
        parseFloat(e.latlng.lng.toFixed(6))
      )
    },
  })
  return null
}

// Zoom to bounds component
function ZoomToBounds({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
  const map = useMap()
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 10 })
    }
  }, [bounds, map])
  return null
}

type PickerStep = 'world' | 'country'

function CoordPicker({
  onSelect,
  onClose,
  onCountryCodeDetected,
}: {
  onSelect: (lat: number, lng: number) => void
  onClose: () => void
  onCountryCodeDetected?: (code: string) => void
}) {
  const [step, setStep] = useState<PickerStep>('world')
  const [countriesGeo, setCountriesGeo] = useState<any>(null)
  const [selectedCountry, setSelectedCountry] = useState<any>(null)
  const [selectedCountryName, setSelectedCountryName] = useState('')
  const [selectedCountryCode, setSelectedCountryCode] = useState('')
  const [marker, setMarker] = useState<[number, number] | null>(null)
  const [countryBounds, setCountryBounds] = useState<L.LatLngBoundsExpression | null>(null)
  const geoJsonKeyRef = useRef(0)

  // Load world GeoJSON
  useEffect(() => {
    fetch('/countries.geojson')
      .then((r) => r.json())
      .then(setCountriesGeo)
      .catch(() => {})
  }, [])

  const handleCountryClick = useCallback(
    (feature: any) => {
      const props = feature.properties
      const code = props.ISO_A2 || props.ISO_A2_EH || ''
      const name = props.ADMIN || props.name || ''

      setSelectedCountry({ type: 'FeatureCollection', features: [feature] })
      setSelectedCountryName(name)
      setSelectedCountryCode(code)
      if (code && onCountryCodeDetected) onCountryCodeDetected(code)

      // Calculate bounds
      const geoLayer = L.geoJSON(feature)
      setCountryBounds(geoLayer.getBounds())
      setStep('country')
      setMarker(null)
      geoJsonKeyRef.current += 1
    },
    [onCountryCodeDetected]
  )

  const handlePointSelect = useCallback(
    (lat: number, lng: number) => {
      setMarker([lat, lng])
    },
    []
  )

  const handleConfirm = () => {
    if (marker) {
      onSelect(marker[0], marker[1])
      onClose()
    }
  }

  const worldStyle = () => ({
    fillColor: '#1a1a2e',
    fillOpacity: 0.8,
    color: '#333355',
    weight: 1,
  })

  const countryStyle = () => ({
    fillColor: '#ff007f',
    fillOpacity: 0.1,
    color: '#ff007f',
    weight: 2,
  })

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-dark-800 rounded-xl w-full max-w-[1200px] h-[90vh] relative border border-dark-700 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-dark-700">
          <div className="flex items-center gap-3">
            {step === 'country' && (
              <button
                onClick={() => { setStep('world'); setMarker(null); setSelectedCountry(null) }}
                className="p-1.5 rounded bg-dark-700 text-dark-400 hover:bg-dark-600 hover:text-white transition-colors"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <p className="text-sm text-dark-200">
              {step === 'world'
                ? 'Select a country by clicking on it'
                : `${selectedCountryName} (${selectedCountryCode}) — Click on the map to place a marker`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {marker && (
              <>
                <span className="text-xs text-dark-400 font-mono">
                  {marker[0]}, {marker[1]}
                </span>
                <button
                  onClick={handleConfirm}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-neon-500/20 text-neon-400 border border-neon-500/30 rounded-lg text-sm font-medium hover:bg-neon-500/30 transition-colors"
                >
                  <Check size={14} />
                  Confirm
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded bg-dark-700 text-dark-400 hover:bg-dark-600 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 min-h-0">
          {step === 'world' && countriesGeo && (
            <MapContainer
              center={[30, 20]}
              zoom={2}
              className="w-full h-full"
              style={{ background: '#0a0a0f' }}
              maxBounds={[[-90, -180], [90, 180]]}
              minZoom={2}
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution=""
              />
              <GeoJSON
                data={countriesGeo}
                style={worldStyle}
                onEachFeature={(feature, layer) => {
                  layer.on('click', () => handleCountryClick(feature))
                  layer.on('mouseover', () => {
                    (layer as any).setStyle({ fillColor: '#ff007f', fillOpacity: 0.3 })
                  })
                  layer.on('mouseout', () => {
                    (layer as any).setStyle(worldStyle())
                  })
                  const name = feature.properties?.ADMIN || feature.properties?.name || ''
                  layer.bindTooltip(name, { sticky: true, className: 'bg-dark-900 text-white border-dark-600 text-xs px-2 py-1 rounded' })
                }}
              />
            </MapContainer>
          )}
          {step === 'country' && selectedCountry && (
            <MapContainer
              center={[30, 20]}
              zoom={2}
              className="w-full h-full"
              style={{ background: '#0a0a0f' }}
              key={`country-${geoJsonKeyRef.current}`}
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution=""
              />
              <GeoJSON data={selectedCountry} style={countryStyle} />
              <ZoomToBounds bounds={countryBounds} />
              <ClickHandler onSelect={handlePointSelect} />
              {marker && <Marker position={marker} icon={defaultIcon} />}
            </MapContainer>
          )}
          {!countriesGeo && (
            <div className="w-full h-full flex items-center justify-center text-dark-400 text-sm">
              Loading map data...
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CitiesPage() {
  const [cities, setCities] = useState<CityRow[]>([])
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState(emptyForm)
  const [showCoordPicker, setShowCoordPicker] = useState(false)
  const [countryFilter, setCountryFilter] = useState('')

  function fetchCities() {
    adminApi
      .getCities()
      .then(setCities)
      .catch((err: Error) => setError(err.message))
  }

  useEffect(() => {
    fetchCities()
  }, [])

  // Get distinct country codes from cities for the filter dropdown
  const countryCodes = useMemo(() => {
    const codes = [...new Set(cities.map((c) => c.country_code))].sort()
    return codes
  }, [cities])

  // Filter cities by selected country code
  const filteredCities = useMemo(() => {
    if (!countryFilter) return cities
    return cities.filter((c) => c.country_code === countryFilter)
  }, [cities, countryFilter])

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

  function handleCoordSelect(lat: number, lng: number) {
    setForm({ ...form, latitude: String(lat), longitude: String(lng) })
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Cities</h2>

      {/* Add City Form */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider mb-4">
          Add City
        </h3>
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
          </div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <input
                placeholder="Latitude"
                type="number"
                step="any"
                value={form.latitude}
                onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                required
                className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-neon-500 transition-colors"
              />
            </div>
            <div className="flex-1">
              <input
                placeholder="Longitude"
                type="number"
                step="any"
                value={form.longitude}
                onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                required
                className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-neon-500 transition-colors"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowCoordPicker(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-lg font-medium hover:bg-purple-500/30 transition-colors whitespace-nowrap"
            >
              <MapPin size={16} />
              Pick from Map
            </button>
          </div>
        </form>
      </div>

      {error && (
        <div className="text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Country Filter */}
      <div className="flex items-center gap-3 mb-4">
        <Filter size={16} className="text-dark-400" />
        <span className="text-sm text-dark-400">Filter by country:</span>
        <select
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
          className="px-3 py-1.5 bg-dark-800 border border-dark-600 rounded-lg text-white text-sm focus:outline-none focus:border-neon-500 transition-colors appearance-none pr-8"
        >
          <option value="">All</option>
          {countryCodes.map((code) => (
            <option key={code} value={code}>
              {code.toUpperCase()}
            </option>
          ))}
        </select>
        {countryFilter && (
          <span className="text-xs text-dark-500">
            {filteredCities.length} of {cities.length} cities
          </span>
        )}
      </div>

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
            {filteredCities.map((city) => (
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
            {filteredCities.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-dark-500">
                  No cities found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Coordinate Picker Modal */}
      {showCoordPicker && (
        <CoordPicker
          onSelect={handleCoordSelect}
          onClose={() => setShowCoordPicker(false)}
          onCountryCodeDetected={(code) => setForm((f) => ({ ...f, country_code: code }))}
        />
      )}
    </div>
  )
}
