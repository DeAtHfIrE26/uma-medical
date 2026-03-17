import { Outlet, useLocation } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { SideNav } from './SideNav'
import { ScanFab } from '../bills/ScanFab'

const FULLSCREEN_PATHS = ['/scan', '/login', '/register', '/forgot-password', '/reset-password']

export function AppLayout() {
  const location = useLocation()
  const isFullscreen = FULLSCREEN_PATHS.some(p => location.pathname.startsWith(p))

  if (isFullscreen) {
    return (
      <div className="relative min-h-dvh bg-surface-900">
        <Outlet />
      </div>
    )
  }

  return (
    <div className="relative min-h-dvh bg-surface-900 flex">

      {/* Ambient background glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-brand-600/4 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-80 h-80 bg-cyan-600/3 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-brand-500/3 rounded-full blur-3xl" />
      </div>

      {/* Desktop sidebar (lg+) */}
      <SideNav />

      {/*
        Main content:
        - Mobile/tablet: full width, bottom-nav offset via pb
        - Desktop: offset by sidebar width (lg:ml-64)
      */}
      <div className="relative flex-1 flex flex-col min-h-dvh lg:ml-64">
        <main className="flex-1 pb-[104px] lg:pb-6">
          <Outlet />
        </main>

        <BottomNav />
        <ScanFab />
      </div>
    </div>
  )
}
