import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, FileText, Building2, BarChart3 } from 'lucide-react'
import { motion } from 'framer-motion'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/bills', icon: FileText, label: 'Bills' },
  { to: '/vendors', icon: Building2, label: 'Vendors' },
  { to: '/history', icon: BarChart3, label: 'Reports' },
]

export function BottomNav() {
  const location = useLocation()

  return (
    <nav className="bottom-nav bg-surface-900/95 backdrop-blur-xl border-t border-surface-700/50">
      <div className="flex items-center justify-around px-2 h-16">
        {navItems.map(({ to, icon: Icon, label }) => {
          const isActive = location.pathname.startsWith(to)
          return (
            <NavLink
              key={to}
              to={to}
              className="relative flex flex-col items-center justify-center gap-0.5 px-3 py-2 min-w-[60px] rounded-xl transition-colors"
            >
              {isActive && (
                <motion.div
                  layoutId="nav-active"
                  className="absolute inset-0 bg-brand-500/10 rounded-xl"
                  transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                />
              )}
              <Icon
                size={20}
                className={`relative z-10 transition-colors ${isActive ? 'text-brand-400' : 'text-surface-500'}`}
                strokeWidth={isActive ? 2 : 1.5}
              />
              <span
                className={`relative z-10 text-[10px] font-medium transition-colors ${
                  isActive ? 'text-brand-400' : 'text-surface-500'
                }`}
              >
                {label}
              </span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
