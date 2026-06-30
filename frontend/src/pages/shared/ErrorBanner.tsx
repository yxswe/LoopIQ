export const ErrorBanner = ({ message }: { message: string | null }) => {
  if (!message) return null
  return (
    <div className="mb-4 rounded-[12px] border border-red-500/40 bg-red-500/10 px-3 py-2 text-[13px] text-red-500">
      {message}
    </div>
  )
}
