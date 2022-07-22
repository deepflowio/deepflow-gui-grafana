import { useState, useEffect, useRef } from 'react'

export function useDebounce(value: any, delay: any) {
  const [debouncedValue, setDebouncedValue] = useState<any>(undefined)
  const firstDebounce = useRef(true)

  useEffect(() => {
    if (value && firstDebounce.current) {
      setDebouncedValue(value)
      firstDebounce.current = false
      return
    }

    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => clearTimeout(handler)
  }, [value, delay])

  return debouncedValue
}
