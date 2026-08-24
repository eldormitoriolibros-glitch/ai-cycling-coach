import { Suspense } from 'react'
import { AuthForm } from '@/components/AuthForm'
import { Spinner } from '@/components/ui'

export default function LoginPage() {
  return (
    <div className="mx-auto mt-12 max-w-md">
      {/* AuthForm reads useSearchParams, which needs a Suspense boundary. */}
      <Suspense fallback={<Spinner />}>
        <AuthForm />
      </Suspense>
    </div>
  )
}
