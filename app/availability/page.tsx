import { AvailabilityForm } from '@/components/AvailabilityForm'

export default function AvailabilityPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Disponibilidad semanal</h1>
      <p className="text-sm text-slate-600">
        Marcá los días que podés entrenar y la ventana horaria disponible.
      </p>
      <AvailabilityForm />
    </div>
  )
}
