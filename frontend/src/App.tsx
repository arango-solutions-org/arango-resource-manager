import { useQuery } from '@tanstack/react-query'
import { Route, Routes } from 'react-router-dom'

import SideMenu from './components/layout/SideMenu'
import TopBar from './components/layout/TopBar'
import { SidebarInset, SidebarProvider } from './components/ui/sidebar'
import { TooltipProvider } from './components/ui/tooltip'
import { fetchClusterInfo } from './lib/api'
import { capabilityChips } from './lib/capability'
import { isEmbedded } from './lib/embedded'
import Overview from './pages/Overview'
import Activity from './pages/Activity'
import Capacity from './pages/Capacity'
import Database from './pages/Database'
import GenAi from './pages/GenAi'
import HowTo from './pages/HowTo'
import Pods from './pages/Pods'
import ServiceDetail from './pages/ServiceDetail'
import SettingsPage from './pages/Settings'
import Services from './pages/Services'

export default function App() {
  const { data, error, isPending } = useQuery({
    queryKey: ['cluster', 'info'],
    queryFn: fetchClusterInfo,
    staleTime: Infinity,
  })

  const healthy = isPending ? null : !error && !!data
  const embedded = isEmbedded()
  const routes = (
    <Routes>
      <Route path="/" element={<Overview />} />
      <Route path="/services" element={<Services />} />
      <Route path="/services/:name" element={<ServiceDetail />} />
      <Route path="/genai" element={<GenAi />} />
      <Route path="/pods" element={<Pods />} />
      <Route path="/capacity" element={<Capacity />} />
      <Route path="/database" element={<Database />} />
      <Route path="/activity" element={<Activity />} />
      <Route path="/howto" element={<HowTo />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
  )

  const header = (
    <TopBar
      namespace={data?.namespace}
      context={data?.context}
      chips={data ? capabilityChips(data) : []}
      embedded={embedded}
    />
  )
  const main = <main className="min-h-0 flex-1 px-6 py-6">{routes}</main>

  // Inside the platform UI the platform draws the sidebar and the logo.
  if (embedded) {
    return (
      <TooltipProvider>
        <div className="flex min-h-full flex-col bg-background">
          {header}
          {main}
        </div>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
      <SidebarProvider>
        <SideMenu healthy={healthy} />
        <SidebarInset className="min-w-0">
          {header}
          {main}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
