import type { ReactNode } from 'react'

export const AuthShell = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="flex h-dvh items-center justify-center bg-dls-surface px-4 text-dls-text">
    <div className="w-full max-w-[400px] rounded-[24px] border border-dls-border bg-dls-sidebar px-8 py-10">
      <h1 className="mb-6 text-[20px] font-medium">{title}</h1>
      {children}
    </div>
  </div>
)
