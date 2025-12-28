import type { Metadata, Viewport } from 'next'
import { JetBrains_Mono } from 'next/font/google'
import './globals.css'

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600', '700']
})

export const metadata: Metadata = {
  title: 'Voyager - Your Collaboration Co-Pilot',
  description: 'Voyager is your Jarvis. You are Ironman.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${mono.variable} font-mono antialiased`}>
        {children}
      </body>
    </html>
  )
}
