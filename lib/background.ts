import { waitUntil } from '@vercel/functions'

import 'server-only'

/**
 * Runs work that must outlive the response. On Vercel the platform keeps the
 * function alive until the promise settles; everywhere else `waitUntil` is a
 * no-op and the promise simply runs detached on the dev server.
 *
 * The point is that the athlete's phone only has to hold the connection long
 * enough to get an answer, not for the whole Garmin pull and review behind it.
 */
export function runAfterResponse(label: string, work: () => Promise<unknown>): void {
  let promise: Promise<unknown>
  try {
    promise = Promise.resolve(work())
  } catch (err) {
    console.error(`${label} failed to start:`, err)
    return
  }

  waitUntil(
    promise.catch((err) => {
      console.error(`${label} failed:`, err)
    })
  )
}
