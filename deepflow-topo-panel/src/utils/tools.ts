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

const isServerSide = (key: string) => key.endsWith('_1')
const isClientSide = (key: string) => key.endsWith('_0')

export const getResourceIdKey = (key: string) => {
  if (key.includes('ip')) {
    return key
  }
  if (isServerSide(key) || isClientSide(key)) {
    let slices = key.split('_')
    slices.splice(slices.length - 1, 0, 'id')
    key = slices.join('_')
  } else {
    key = `${key}_id`
  }
  return key
}
