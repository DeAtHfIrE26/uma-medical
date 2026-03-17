import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Building2, BarChart3,
  Package, Camera, LogOut, Settings
} from 'lucide-react'
import { motion } from 'framer-motion'
import { signOut } from '@/services/auth'
import { useAuthStore } from '@/stores/auth'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/bills',     icon: FileText,        label: 'Bills' },
  { to: '/inventory', icon: Package,         label: 'Stock' },
  { to: '/vendors',   icon: Building2,       label: 'Vendors' },
  { to: '/history',   icon: BarChart3,       label: 'Reports' },
]

export function SideNav() {
  const navigate  = useNavigate()
  const { profile } = useAuthStore()

  const handleLogout = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    /*
      Hidden below lg breakpoint — BottomNav takes over.
      Fixed, full-height sidebar on desktop.
    */
    <aside className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-64 z-40
                      bg-surface-900/95 backdrop-blur-xl border-r border-surface-700/40">

      {/* Brand */}
      <div className="px-6 py-6 border-b border-surface-700/30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center shrink-0">
            <Package size={18} className="text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">Uma Medical</p>
            <p className="text-surface-400 text-xs">Pharmacy Manager</p>
          </div>
        </div>
      </div>

      {/* Scan CTA */}
      <div className="px-4 py-4 border-b border-surface-700/30">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => navigate('/scan')}
          className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl
                     bg-brand-500 hover:bg-brand-600 text-white font-semibold text-sm
                     transition-colors"
          style={{ boxShadow: '0 4px 20px rgba(14,165,233,0.35)' }}
        >
          <Camera size={18} />
          Scan Bill
        </motion.button>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium
               transition-all duration-150 group
               ${isActive
                 ? 'bg-brand-500/15 text-brand-400'
                 : 'text-surface-400 hover:text-white hover:bg-surface-800'
               }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.div
                    layoutId="side-nav-pill"
                    className="absolute inset-0 bg-brand-500/12 rounded-xl"
                    transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                  />
                )}
                <Icon
                  size={18}
                  className="relative z-10 transition-colors"
                  strokeWidth={isActive ? 2.2 : 1.7}
                />
                <span className="relative z-10">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      <div className="px-4 py-4 border-t border-surface-700/30 space-y-1">
        {profile && (
          <div className="flex items-center gap-3 px-2 py-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-cyan-500
                            flex items-center justify-center text-white text-xs font-bold shrink-0">
              {(profile.full_name || 'A').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-white text-xs font-semibold truncate">
                {profile.full_name || 'Admin'}
              </p>
              <p className="text-surface-500 text-xs truncate">{profile.email}</p>
            </div>
          </div>
        )}
        <button
          onClick={() => navigate('/settings')}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm
                     text-surface-400 hover:text-white hover:bg-surface-800 transition-colors font-medium"
        >
          <Settings size={16} />
          Settings
        </button>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm
                     text-surface-400 hover:text-danger-400 hover:bg-danger-500/10 transition-colors font-medium"
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
