import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"

type Toast = { id: number; message: string; actionLabel?: string; onAction?: () => void }
const ToastContext = createContext<{ show: (toast: Omit<Toast, "id">, duration?: number) => void } | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const show = useCallback((toast: Omit<Toast, "id">, duration = 10000) => {
    const id = Date.now()
    setToasts((current) => [...current, { ...toast, id }])
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), duration)
  }, [])
  const value = useMemo(() => ({ show }), [show])
  return <ToastContext.Provider value={value}>{children}<div className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-4 right-4 z-[100] space-y-2 sm:left-auto" aria-live="polite">{toasts.map((toast) => <div key={toast.id} className="flex items-center gap-4 rounded-md border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100">{toast.message}{toast.actionLabel ? <Button size="sm" variant="outline" onClick={() => { toast.onAction?.(); setToasts((current) => current.filter((item) => item.id !== toast.id)) }}>{toast.actionLabel}</Button> : null}</div>)}</div></ToastContext.Provider>
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error("useToast must be used inside ToastProvider")
  return context
}
