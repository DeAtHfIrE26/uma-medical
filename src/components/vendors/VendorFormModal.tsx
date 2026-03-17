import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import type { Vendor } from '@/types'

type VendorFormValues = {
  name: string
  address: string
  gstin: string
  pan: string
  phone: string
  dl_no: string
  bank_name: string
  account_no: string
  ifsc_code: string
}

function toFormValues(vendor?: Partial<Vendor> | null): VendorFormValues {
  return {
    name: vendor?.name || '',
    address: vendor?.address || '',
    gstin: vendor?.gstin || '',
    pan: vendor?.pan || '',
    phone: vendor?.phone || '',
    dl_no: vendor?.dl_no || '',
    bank_name: vendor?.bank_name || '',
    account_no: vendor?.account_no || '',
    ifsc_code: vendor?.ifsc_code || '',
  }
}

export function VendorFormModal({
  isOpen,
  onClose,
  onSubmit,
  initialVendor,
  loading = false,
  title,
}: {
  isOpen: boolean
  onClose: () => void
  onSubmit: (values: VendorFormValues) => Promise<void> | void
  initialVendor?: Partial<Vendor> | null
  loading?: boolean
  title: string
}) {
  const [values, setValues] = useState<VendorFormValues>(toFormValues(initialVendor))

  useEffect(() => {
    if (isOpen) {
      setValues(toFormValues(initialVendor))
    }
  }, [isOpen, initialVendor])

  const update = (key: keyof VendorFormValues, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
      <div className="p-5 space-y-4">
        <div>
          <label className="text-surface-300 text-sm font-medium block mb-1.5">Vendor Name</label>
          <input
            value={values.name}
            onChange={(e) => update('name', e.target.value)}
            className="input-base"
            placeholder="e.g. Apollo Pharma"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-surface-300 text-sm font-medium block mb-1.5">Phone</label>
            <input
              value={values.phone}
              onChange={(e) => update('phone', e.target.value)}
              className="input-base"
              placeholder="Phone number"
            />
          </div>
          <div>
            <label className="text-surface-300 text-sm font-medium block mb-1.5">GSTIN</label>
            <input
              value={values.gstin}
              onChange={(e) => update('gstin', e.target.value)}
              className="input-base"
              placeholder="GSTIN"
            />
          </div>
          <div>
            <label className="text-surface-300 text-sm font-medium block mb-1.5">PAN</label>
            <input
              value={values.pan}
              onChange={(e) => update('pan', e.target.value)}
              className="input-base"
              placeholder="PAN"
            />
          </div>
          <div>
            <label className="text-surface-300 text-sm font-medium block mb-1.5">Drug License</label>
            <input
              value={values.dl_no}
              onChange={(e) => update('dl_no', e.target.value)}
              className="input-base"
              placeholder="DL number"
            />
          </div>
        </div>

        <div>
          <label className="text-surface-300 text-sm font-medium block mb-1.5">Address</label>
          <textarea
            value={values.address}
            onChange={(e) => update('address', e.target.value)}
            className="input-base min-h-24 resize-none"
            placeholder="Address"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-1">
            <label className="text-surface-300 text-sm font-medium block mb-1.5">Bank Name</label>
            <input
              value={values.bank_name}
              onChange={(e) => update('bank_name', e.target.value)}
              className="input-base"
              placeholder="Bank name"
            />
          </div>
          <div className="sm:col-span-1">
            <label className="text-surface-300 text-sm font-medium block mb-1.5">Account No</label>
            <input
              value={values.account_no}
              onChange={(e) => update('account_no', e.target.value)}
              className="input-base"
              placeholder="Account number"
            />
          </div>
          <div className="sm:col-span-1">
            <label className="text-surface-300 text-sm font-medium block mb-1.5">IFSC</label>
            <input
              value={values.ifsc_code}
              onChange={(e) => update('ifsc_code', e.target.value)}
              className="input-base"
              placeholder="IFSC code"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary flex-1 py-3">
            Cancel
          </button>
          <button
            onClick={() => onSubmit(values)}
            disabled={loading || !values.name.trim()}
            className="btn-primary flex-1 py-3 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Vendor'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
