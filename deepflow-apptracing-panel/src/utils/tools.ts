import _ from 'lodash'
import { useState, useEffect, useRef } from 'react'

export function genServiceId(item: { service_uid: string }) {
  return item.service_uid
}

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

function roundToStrNotWithDecimalZero(num: any) {
  let result = typeof num === 'string' ? parseFloat(num) : num
  if (_.isNaN(result)) {
    return false
  }
  result = Math.round(result * 100) / 100
  return result
}

export function roundToStr(num: any, digits = 2) {
  if (digits < 0) {
    throw new Error('digits must greater than 0')
  }
  if (!_.isNumber(num) || _.isNaN(num)) {
    return num
  }
  const isMinusNum = num.toString().indexOf('-') > -1 // 是否是负数
  num = isMinusNum ? Math.abs(num) : num
  // @ts-ignore
  num *= 1 * (1 + Array(digits + 1).join('0'))
  num = Math.round(num) + ''
  let result = ''
  if (digits === 0) {
    result = num
  } else {
    // round后计算num位数是否小于digits,小于digits需要向前补零,避免slice丢失位数
    const count = digits + 1 - num.length
    num = (count > 0 ? Array(count + 1).join('0') : '') + num
    const integer = num.slice(0, -digits)
    const decimal = num.slice(-digits)
    result = integer + '.' + decimal
  }
  if (isMinusNum) {
    return Number('-' + result.toString())
  } else {
    return result
  }
}

export function numberToCommas(num: any, digits = 2) {
  if (!_.isNumber(num) || _.isNaN(num)) {
    return '--'
  }
  num = roundToStr(num, digits).toString().split('.')
  const newNum = num[0].replace(/(\d{1,3})(?=(?:\d{3})+(?!\d))/g, '$1,') + (num.length > 1 ? '.' + num[1] : '')
  return newNum.toString().replace('.00', '')
}

export function numberToShort(num: any, unit = 1000, digits = 2) {
  const unitK = unit ** 2
  const unitM = unit ** 3
  const unitG = unit ** 4
  const unitT = unit ** 5
  let tmp = num === '' || num === null ? NaN : num
  tmp = _.toNumber(tmp)
  if (!_.isNaN(tmp)) {
    const abs = Math.abs(tmp)
    if (!_.isFinite(tmp)) {
      return tmp
    } else if (abs < unit) {
      return roundToStrNotWithDecimalZero(tmp) + ''
    } else if (abs < unitK) {
      return roundToStrNotWithDecimalZero(tmp / unit) + 'K'
    } else if (abs < unitM) {
      return roundToStrNotWithDecimalZero(tmp / unitK) + 'M'
    } else if (abs < unitG) {
      return roundToStrNotWithDecimalZero(tmp / unitM) + 'G'
    } else if (abs < unitT) {
      return roundToStrNotWithDecimalZero(tmp / unitG) + 'T'
    } else {
      return numberToCommas(tmp / unitT, digits) + 'P'
    }
  }
  return num
}

export function formatUsUnit(num: any, unit = 1000, digits = 2, lang = 'en') {
  const UNIT_DESCRIPTION = {
    us: {
      en: 'us',
      cn: '微秒'
    },
    ms: {
      en: 'ms',
      cn: '毫秒'
    },
    s: {
      en: 's',
      cn: '秒'
    }
  }
  const unitUs = unit ** 1
  const unitMs = unit ** 2
  let tmp = num === '' || num === null ? NaN : num
  tmp = _.toNumber(tmp)
  if (!_.isNaN(tmp)) {
    const abs = Math.abs(tmp)
    if (!_.isFinite(tmp)) {
      return tmp
    } else if (abs < unitUs) {
      return roundToStrNotWithDecimalZero(tmp) + _.get(UNIT_DESCRIPTION, ['us', lang])
    } else if (abs < unitMs) {
      return roundToStrNotWithDecimalZero(tmp / unitUs) + _.get(UNIT_DESCRIPTION, ['ms', lang])
    } else {
      return roundToStrNotWithDecimalZero(tmp / unitMs) + _.get(UNIT_DESCRIPTION, ['s', lang])
    }
  }
  return num
}

export function dealPercentageValue(v: unknown) {
  if (_.isNull(v)) {
    return '--'
  } else if (!_.isNumber(v)) {
    return v
  } else if (v === 0 || v === 100) {
    return v + '%'
  } else {
    return v.toFixed(2) + '%'
  }
}

const RELATED_TYPE_FIELDS_MAP = {
  traceid: ['trace_id'],
  xrequestid: ['x_request_id'],
  app: ['span_id', 'parent_span_id'],
  network: ['req_tcp_seq', 'resp_tcp_seq'],
  syscall: ['syscall_trace_id_request', 'syscall_trace_id_response']
} as const

const RELATED_EQUAL_KEYS = Object.keys(RELATED_TYPE_FIELDS_MAP)
  .map((e: string) => RELATED_TYPE_FIELDS_MAP[e as keyof typeof RELATED_TYPE_FIELDS_MAP])
  .flat(Infinity) as string[]
const RELATED_EQUAL_INVALID_VALUES = ['', 0, '0', null, undefined]

export function getRelatedData(item: any, fullData: any) {
  const fullDataKeyById = _.keyBy(fullData, 'id')

  const relateData: any = []
  item.related_ids.forEach((related_id: string) => {
    const [id, type, _id] = related_id.split('-')
    if (type !== 'base') {
      relateData.push({
        id,
        type,
        _id
      })
    }
  })
  const result = [
    ...relateData.map((e: any) => {
      return {
        ...fullDataKeyById[e.id],
        __related: e
      }
    })
  ]

  item.__hightLights = {}
  result.forEach(e => {
    const relatedFields = RELATED_TYPE_FIELDS_MAP[e.__related.type as keyof typeof RELATED_TYPE_FIELDS_MAP]
    e.__hightLights = {}
    const _relatedFields = [...relatedFields].sort(() => -1)
    relatedFields.forEach((k: string, i: number) => {
      if (RELATED_EQUAL_INVALID_VALUES.includes(e[k])) {
        return
      }
      if (e[k] === item[k]) {
        e.__hightLights[k] = true
        item.__hightLights[k] = true
      }
      if (e[k] === item[_relatedFields[i]]) {
        e.__hightLights[k] = true
        item.__hightLights[_relatedFields[i]] = true
      }
    })
    RELATED_EQUAL_KEYS.forEach(k => {
      if (RELATED_EQUAL_INVALID_VALUES.includes(e[k])) {
        return
      }
      if (e[k] === item[k]) {
        e.__hightLights[k] = true
        item.__hightLights[k] = true
      }
    })
  })
  return [item, ...result]
}
