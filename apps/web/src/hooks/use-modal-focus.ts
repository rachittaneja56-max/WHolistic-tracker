import { useCallback, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react"

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",")

export function useModalFocus(open: boolean, onClose: () => void) {
  const dialogNodeRef = useRef<HTMLElement | null>(null)
  const dialogRef = useCallback((node: HTMLElement | null) => { dialogNodeRef.current = node }, [])
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.requestAnimationFrame(() => {
      const first = dialogNodeRef.current?.querySelector<HTMLElement>(focusableSelector)
      ;(first ?? dialogNodeRef.current)?.focus()
    })
    return () => {
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [open])

  function onDialogKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault()
      closeRef.current()
      return
    }
    if (event.key !== "Tab") return
    const focusable = Array.from(dialogNodeRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])
    if (!focusable.length) {
      event.preventDefault()
      dialogNodeRef.current?.focus()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogNodeRef.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return { dialogRef, onDialogKeyDown }
}
