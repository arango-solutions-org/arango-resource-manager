import { TriangleAlert } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface Props {
  title: string
  error: unknown
}

export default function ErrorPanel({ title, error }: Props) {
  const message = error instanceof Error ? error.message : String(error)
  return (
    <Alert variant="destructive">
      <TriangleAlert />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="font-mono text-xs break-all">{message}</AlertDescription>
    </Alert>
  )
}
