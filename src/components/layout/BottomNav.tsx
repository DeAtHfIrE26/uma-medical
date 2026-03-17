import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, FileText, Building2, BarChart3, Package } from 'lucide-react'
import { motion } from 'framer-motion'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Home' },
  { to: '/bills',     icon: FileText,        label: 'Bills' },
  { to: '/inventory', icon: Package,         label: 'Stock' },
  { to: '/vendors',   icon: Building2,       label: 'Vendors' },
  { to: '/history',   icon: BarChart3,       label: 'Reports' },
]

const HIDDEN_PATHS = ['/scan', '/login', '/register', '/forgot-password', '/reset-password']

function NavItem({ to, icon: Icon, label }: { to: string; icon: React.ElementType; label: string }) {
  const location = useLocation()
  const isActive = location.pathname.startsWith(to)

  return (
    <NavLink
      to={to}
      className="relative flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors select-none"
    >
      {isActive && (
        <motion.div
          layoutId="bottom-nav-pill"
          className="absolute inset-x-1 inset-y-2 bg-brand-500/10 rounded-xl"
          transition={{ type: 'spring', damping: 22, stiffness: 320 }}
        />
      )}
      <Icon
        size={20}
        className={`relative z-10 transition-colors ${isActive ? 'text-brand-400' : 'text-surface-500'}`}
        strokeWidth={isActive ? 2.2 : 1.6}
      />
      <span className={`relative z-10 text-[10px] font-medium leading-none transition-colors ${
        isActive ? 'text-brand-400' : 'text-surface-500'
      }`}>
        {label}
      </span>
    </NavLink>
  )
}

export function BottomNav() {
  const location = useLocation()

  if (HIDDEN_PATHS.some(p => location.pathname.startsWith(p))) return null

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50">
      <div className="bg-surface-900/96 backdrop-blur-2xl border-t border-surface-700/40">
        <div className="flex items-center h-16">
          {navItems.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </div>
        <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
      </div>
    </nav>
  )
}
