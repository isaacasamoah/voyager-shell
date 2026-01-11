import { VoyagerInterface } from '@/components/ui/VoyagerInterface'

// Force dynamic rendering - this page needs auth context
export const dynamic = 'force-dynamic'

export default function HomePage() {
  return <VoyagerInterface />
}
