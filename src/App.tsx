import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { initializeAuth } from '@/stores/auth'
import { useAuth } from '@/hooks/useAuth'

// Layout
import { AppLayout } from '@/components/layout/AppLayout'

// Pages
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { ScanPage } from '@/pages/ScanPage'
import { BillsPage } from '@/pages/BillsPage'
import { BillDetailPage } from '@/pages/BillDetailPage'
import { VendorsPage } from '@/pages/VendorsPage'
import { VendorDetailPage } from '@/pages/VendorDetailPage'
import { HistoryPage } from '@/pages/HistoryPage'
import { InventoryPage } from '@/pages/InventoryPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { FullPageLoader } from '@/components/ui/LoadingSpinner'
import { runtimeConfigError } from '@/lib/supabase'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return <FullPageLoader message="Loading Uma Medical..." />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return <FullPageLoader message="Loading..." />
  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function AppRoutes() {
  useEffect(() => {
    const cleanup = initializeAuth()
    return cleanup
  }, [])

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Protected Routes */}
      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/bills" element={<BillsPage />} />
        <Route path="/bills/:id" element={<BillDetailPage />} />
        <Route path="/vendors" element={<VendorsPage />} />
        <Route path="/vendors/:id" element={<VendorDetailPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      {/* Scan is full-page protected */}
      <Route
        path="/scan"
        element={<ProtectedRoute><ScanPage /></ProtectedRoute>}
      />

      {/* Root redirect */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

function SetupErrorScreen({ message }: { message: string }) {
  return (
    <div className="min-h-dvh bg-surface-900 text-white flex items-center justify-center px-6">
      <div className="glass-card max-w-lg w-full p-6 space-y-3">
        <p className="text-warning-400 text-sm font-semibold uppercase tracking-wider">
          Deployment configuration required
        </p>
        <h1 className="font-display font-bold text-2xl">Uma Medical is not fully configured</h1>
        <p className="text-surface-300 text-sm leading-relaxed">
          The frontend started, but one or more required public environment variables are missing.
          Add them in your deployment provider and redeploy.
        </p>
        <div className="bg-surface-900 rounded-2xl px-4 py-3">
          <p className="text-surface-400 text-xs uppercase tracking-wider mb-1">Missing configuration</p>
          <p className="text-white text-sm break-words">{message}</p>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  if (runtimeConfigError) {
    return <SetupErrorScreen message={runtimeConfigError} />
  }

  return (
    <BrowserRouter>
      <AppRoutes />
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3500,
          style: {
            background: '#1e293b',
            color: '#f1f5f9',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '14px',
            fontSize: '14px',
            fontWeight: '500',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          },
          success: {
            iconTheme: { primary: '#22c55e', secondary: '#1e293b' },
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: '#1e293b' },
          },
        }}
      />
    </BrowserRouter>
  )
}
