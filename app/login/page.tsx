import { Suspense } from 'react'
import { AuthForm } from '@/components/AuthForm'
import { Spinner } from '@/components/ui'
import { inviteEnv } from '@/lib/env'

export const dynamic = 'force-dynamic'

export default function LoginPage() {
  return (
    <div className="mx-auto mt-12 max-w-md">
      {/* AuthForm reads useSearchParams, which needs a Suspense boundary. */}
      <Suspense fallback={<Spinner />}>
        <AuthForm inviteOnly={inviteEnv() !== null} />
      </Suspense>
    </div>
  )
}
