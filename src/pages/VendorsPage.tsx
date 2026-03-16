import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Building2, Search, FileText, Phone, MapPin, ChevronRight } from 'lucide-react'
import { getVendors } from '@/services/bills'
import { TopBar } from '@/components/layout/TopBar'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonList } from '@/components/ui/LoadingSpinner'
import type { Vendor } from '@/types'

const AVATAR_COLORS = [
  'from-brand-600 to-cyan-600',
  'from-purple-600 to-pink-600',
  'from-orange-600 to-red-600',
  'from-green-600 to-teal-600',
  'from-indigo-600 to-blue-600',
]

export function VendorsPage() {
  const navigate = useNavigate()
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [filtered, setFiltered] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    getVendors()
      .then(v => { setVendors(v); setFiltered(v) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!search) { setFiltered(vendors); return }
    const q = search.toLowerCase()
    setFiltered(vendors.filter(v =>
      v.name.toLowerCase().includes(q) ||
      v.gstin?.toLowerCase().includes(q) ||
      v.address?.toLowerCase().includes(q)
    ))
  }, [search, vendors])

  return (
    <div className="min-h-dvh">
      <TopBar title="Vendors" subtitle={`${vendors.length} pharmaceutical companies`} />

      {/* Search */}
      <div className="px-4 pb-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search vendors..."
            className="input-base pl-9"
          />
        </div>
      </div>

      <div className="px-4 space-y-3 pb-4">
        {loading ? (
          <SkeletonList count={5} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No vendors found"
            description="Vendors are automatically added when you scan bills"
          />
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-3"
          >
            {filtered.map((vendor, i) => (
              <motion.button
                key={vendor.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => navigate(`/vendors/${vendor.id}`)}
                className="glass-card w-full text-left p-4 flex items-center gap-4 active:scale-[0.99] transition-transform"
              >
                {/* Avatar */}
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${AVATAR_COLORS[i % AVATAR_COLORS.length]} flex items-center justify-center text-white font-bold text-lg shrink-0`}>
                  {vendor.name.charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="text-white font-semibold text-sm leading-tight truncate">{vendor.name}</p>
                  {vendor.gstin && (
                    <p className="text-brand-400 text-xs font-mono">GSTIN: {vendor.gstin}</p>
                  )}
                  {vendor.address && (
                    <p className="text-surface-400 text-xs truncate flex items-center gap-1">
                      <MapPin size={10} />
                      {vendor.address}
                    </p>
                  )}
                  {vendor.phone && (
                    <p className="text-surface-400 text-xs flex items-center gap-1">
                      <Phone size={10} />
                      {vendor.phone}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <div className="flex items-center gap-1 bg-brand-500/10 px-2 py-1 rounded-lg">
                    <FileText size={12} className="text-brand-400" />
                    <span className="text-brand-400 text-xs font-semibold">{vendor.bill_count || 0}</span>
                  </div>
                  <ChevronRight size={16} className="text-surface-600" />
                </div>
              </motion.button>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  )
}
