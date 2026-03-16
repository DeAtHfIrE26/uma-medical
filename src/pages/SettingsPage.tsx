import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  User, KeyRound, LogOut, Shield, ChevronRight,
  Bell, Info, Pill, Copy, CheckCircle2
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/stores/auth'
import { signOut, updatePassword } from '@/services/auth'
import { generateInviteCode } from '@/lib/crypto'
import { supabase } from '@/lib/supabase'
import { TopBar } from '@/components/layout/TopBar'
import { Modal } from '@/components/ui/Modal'

export function SettingsPage() {
  const navigate = useNavigate()
  const { profile } = useAuthStore()
  const [pwModal, setPwModal] = useState(false)
  const [inviteModal, setInviteModal] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [copied, setCopied] = useState(false)

  const handleLogout = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  const handleChangePassword = async () => {
    if (newPassword !== confirmPw) {
      toast.error('Passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setPwLoading(true)
    try {
      await updatePassword(newPassword)
      toast.success('Password updated successfully')
      setPwModal(false)
      setNewPassword('')
      setConfirmPw('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update password')
    } finally {
      setPwLoading(false)
    }
  }

  const handleGenerateInvite = async () => {
    const code = generateInviteCode()
    setInviteCode(code)

    // Store in DB
    try {
      await supabase.from('invite_codes').insert({
        code,
        created_by: profile?.id,
        used: false,
      })
      setInviteModal(true)
    } catch {
      toast.error('Failed to generate invite code')
    }
  }

  const copyInvite = () => {
    navigator.clipboard.writeText(inviteCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Code copied!')
  }

  return (
    <div className="min-h-dvh">
      <TopBar title="Settings" showBack />

      <div className="px-4 space-y-4 pb-6">
        {/* Profile Card */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-5 flex items-center gap-4"
        >
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-cyan-500 flex items-center justify-center text-white text-xl font-bold">
            {profile?.full_name?.charAt(0).toUpperCase() || 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-white text-lg truncate">
              {profile?.full_name || 'Admin'}
            </p>
            <p className="text-surface-400 text-sm truncate">{profile?.email}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <Shield size={11} className="text-brand-400" />
              <span className="text-brand-400 text-xs font-medium capitalize">{profile?.role || 'admin'}</span>
            </div>
          </div>
        </motion.div>

        {/* App info */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="glass-card p-4 flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-cyan-500 flex items-center justify-center">
            <Pill size={18} className="text-white" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm">Uma Medical Store</p>
            <p className="text-surface-400 text-xs">Bill Management System v1.0</p>
          </div>
        </motion.div>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card divide-y divide-surface-700/40"
        >
          <p className="px-4 pt-3 pb-2 text-surface-400 text-xs font-semibold uppercase tracking-wider">Account</p>

          <SettingsRow icon={KeyRound} label="Change Password" onClick={() => setPwModal(true)} />
          <SettingsRow icon={User} label="Generate Invite Code" sublabel="Allow new admin registration" onClick={handleGenerateInvite} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass-card divide-y divide-surface-700/40"
        >
          <p className="px-4 pt-3 pb-2 text-surface-400 text-xs font-semibold uppercase tracking-wider">System</p>
          <SettingsRow icon={Bell} label="Notifications" sublabel="Coming soon" />
          <SettingsRow icon={Info} label="About" sublabel="Powered by Gemini AI · AES-256 Encrypted" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <button
            onClick={handleLogout}
            className="w-full p-4 rounded-2xl bg-danger-500/10 border border-danger-500/20 flex items-center gap-3 text-danger-400 hover:bg-danger-500/20 transition-colors active:scale-[0.99]"
          >
            <LogOut size={18} />
            <span className="font-semibold">Sign Out</span>
          </button>
        </motion.div>

        <p className="text-center text-surface-600 text-xs pb-2">
          Secured with AES-256-GCM · Uma Medical Store
        </p>
      </div>

      {/* Change Password Modal */}
      <Modal isOpen={pwModal} onClose={() => setPwModal(false)} title="Change Password">
        <div className="p-5 space-y-4">
          <div>
            <label className="text-surface-300 text-sm font-medium block mb-1.5">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="input-base"
              placeholder="Min 8 characters"
            />
          </div>
          <div>
            <label className="text-surface-300 text-sm font-medium block mb-1.5">Confirm Password</label>
            <input
              type="password"
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
              className="input-base"
              placeholder="Re-enter password"
            />
          </div>
          <button
            onClick={handleChangePassword}
            disabled={pwLoading}
            className="btn-primary w-full py-3"
          >
            {pwLoading ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      </Modal>

      {/* Invite Code Modal */}
      <Modal isOpen={inviteModal} onClose={() => setInviteModal(false)} title="Invite Code Generated">
        <div className="p-5 space-y-4">
          <p className="text-surface-300 text-sm">Share this code with the new admin. It can only be used once.</p>
          <div className="bg-surface-900 rounded-2xl p-4 flex items-center justify-between gap-3">
            <p className="font-mono font-bold text-2xl text-brand-400 tracking-widest">{inviteCode}</p>
            <button
              onClick={copyInvite}
              className="p-2 rounded-xl bg-brand-500/10 text-brand-400 hover:bg-brand-500/20 transition-colors"
            >
              {copied ? <CheckCircle2 size={18} className="text-success-400" /> : <Copy size={18} />}
            </button>
          </div>
          <p className="text-surface-500 text-xs text-center">
            Valid until used · For Uma Medical Store only
          </p>
          <button onClick={() => setInviteModal(false)} className="btn-secondary w-full py-2.5">Done</button>
        </div>
      </Modal>
    </div>
  )
}

function SettingsRow({
  icon: Icon, label, sublabel, onClick
}: {
  icon: React.ElementType
  label: string
  sublabel?: string
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-surface-700/30 transition-colors disabled:opacity-60"
    >
      <div className="w-9 h-9 rounded-xl bg-surface-700 flex items-center justify-center shrink-0">
        <Icon size={16} className="text-surface-300" />
      </div>
      <div className="flex-1 text-left min-w-0">
        <p className="text-white text-sm font-medium">{label}</p>
        {sublabel && <p className="text-surface-500 text-xs truncate">{sublabel}</p>}
      </div>
      {onClick && <ChevronRight size={16} className="text-surface-600 shrink-0" />}
    </button>
  )
}
