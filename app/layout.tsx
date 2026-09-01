import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Nav } from '@/components/Nav'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'AI Cycling Coach',
  description: 'Personal AI cycling coach',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.svg" />
      </head>
      <body className={`${inter.variable} dark font-sans antialiased`}>
        <Nav />
        <main className="mx-auto max-w-4xl px-4 py-5 sm:p-6">{children}</main>
      </body>
    </html>
  )
}
