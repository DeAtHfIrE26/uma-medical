import { Outlet } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { ScanFab } from '../bills/ScanFab'

export function AppLayout() {
  return (
    <div className="relative min-h-dvh bg-surface-900">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-brand-600/5 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-80 h-80 bg-cyan-600/4 rounded-full blur-3xl" />
      </div>

      <main className="relative page-container">
        <Outlet />
      </main>

      <ScanFab />
      <BottomNav />
    </div>
  )
}
