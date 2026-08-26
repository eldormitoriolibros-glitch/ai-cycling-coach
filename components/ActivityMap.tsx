'use client'

import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

type Props = {
  points: Array<{ lat: number; lng: number }>
}

/** Fits the map viewport to the route once, since MapContainer only sets bounds on mount. */
function FitBounds({ points }: Props) {
  const map = useMap()

  useEffect(() => {
    if (points.length < 2) return
    const bounds = points.map((p) => [p.lat, p.lng]) as [number, number][]
    map.fitBounds(bounds, { padding: [24, 24] })
  }, [map, points])

  return null
}

export default function ActivityMap({ points }: Props) {
  const positions = useMemo(() => points.map((p) => [p.lat, p.lng]) as [number, number][], [points])

  if (positions.length < 2) return null

  const start = positions[0]
  const end = positions[positions.length - 1]

  return (
    <MapContainer
      center={start}
      zoom={13}
      scrollWheelZoom={false}
      style={{ height: 320, width: '100%', borderRadius: '0.75rem' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Polyline positions={positions} pathOptions={{ color: '#ef4444', weight: 3 }} />
      <CircleMarker center={start} radius={6} pathOptions={{ color: '#16a34a', fillColor: '#16a34a', fillOpacity: 1 }} />
      <CircleMarker center={end} radius={6} pathOptions={{ color: '#1e293b', fillColor: '#1e293b', fillOpacity: 1 }} />
      <FitBounds points={points} />
    </MapContainer>
  )
}
