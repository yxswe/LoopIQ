import type { InputHTMLAttributes, ReactNode } from 'react'

type Props = {
  label: string
  error?: string | null
  hint?: ReactNode
} & InputHTMLAttributes<HTMLInputElement>

export const FormField = ({ label, error, hint, id, ...rest }: Props) => {
  const inputId = id ?? `field-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <div className="mb-4">
      <label htmlFor={inputId} className="mb-1 block text-[13px] text-dls-secondary">
        {label}
      </label>
      <input
        id={inputId}
        {...rest}
        className="w-full rounded-[12px] border border-dls-border bg-dls-surface px-3 py-2 text-[14px] text-dls-text outline-none focus:border-dls-accent"
      />
      {error ? (
        <p className="mt-1 text-[12px] text-red-500">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[12px] text-dls-secondary">{hint}</p>
      ) : null}
    </div>
  )
}
