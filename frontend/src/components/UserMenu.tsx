import { LogOut, Settings } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { navigate } from '../router/useRoute'

export const UserMenu = () => {
  const { user, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  if (!user) return null
  const label = user.displayName ?? user.email ?? user.id.slice(0, 6)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 items-center gap-2 rounded-full border border-dls-border bg-dls-sidebar px-3 text-[13px] text-dls-text"
      >
        {label}
      </button>
      {open ? (
        <div className="absolute right-0 z-10 mt-1 w-44 rounded-[12px] border border-dls-border bg-dls-surface p-1 shadow-[var(--dls-shell-shadow)]">
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              navigate('/settings')
            }}
            className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[13px] text-dls-text hover:bg-dls-active"
          >
            <Settings size={14} /> Settings
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              void signOut()
            }}
            className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[13px] text-dls-text hover:bg-dls-active"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      ) : null}
    </div>
  )
}
