import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Everything except:
     *  - api/*        route handlers (webhooks must never be redirected to /login)
     *  - auth/*       OAuth + email-confirmation callbacks
     *  - _next/*      framework assets
     *  - static files
     */
    '/((?!api/|auth/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
