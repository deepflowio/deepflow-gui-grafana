import _ from 'lodash'
import { BasicDataWithId } from 'QueryEditor'

export function uuid() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1)
  }
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4()
}

const TAG_OPERATORS_MAP = {
  LIKE: {
    display_name: ':',
    description: 'string, * for wildcard',
    sort: 0
  },
  REGEXP: {
    display_name: '~',
    description: 'regular expression',
    sort: 1
  },
  IN: {
    display_name: '=',
    description: 'resource uid, or integer',
    sort: 2
  },
  'NOT LIKE': {
    display_name: '!:',
    description: 'string, * for wildcard',
    sort: 3
  },
  'NOT REGEXP': {
    display_name: '!~',
    description: 'regular expression',
    sort: 4
  },
  'NOT IN': {
    display_name: '!=',
    description: 'resource uid, or integer',
    sort: 5
  },
  '<': {
    display_name: '<',
    description: 'Numerical filtering',
    sort: 6
  },
  '<=': {
    display_name: '<=',
    description: 'Numerical filtering',
    sort: 7
  },
  '>': {
    display_name: '>',
    description: 'Numerical filtering',
    sort: 8
  },
  '>=': {
    display_name: '>=',
    description: 'Numerical filtering',
    sort: 9
  }
} as const

export function formatTagOperators(operators: string[], item: any) {
  let operatorOpts: any[] = []
  operators
    .filter(op => {
      const isStringType = item.type === 'string'
      if (isStringType) {
        return !['=', '!=', 'IN', 'NOT IN'].includes(op)
      }
      return true
    })
    .forEach(op => {
      const mapItem = _.get(TAG_OPERATORS_MAP, op)
      if (mapItem) {
        operatorOpts[mapItem.sort] = {
          label: `${mapItem.display_name}`,
          value: op,
          description: mapItem.description
        }
      }
    })
  return operatorOpts.filter(e => e !== undefined)
}

export function getMetricFieldNameByAlias(alias: string, mapObj: Record<any, any>) {
  const result = alias.replace(/\$\{.*?\}/g, ($1: string) => {
    const keyMatchArr = $1.match(/(?<=\$\{).*?(?=\})/)
    const key = keyMatchArr ? keyMatchArr[0] : $1
    return mapObj[key] || key
  })
  return result
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

export function getAccessRelationshipeQueryConfig(groupBy: any) {
  const result: {
    from: string[]
    to: string[]
    common: string[]
  } = {
    from: [],
    to: [],
    common: []
  }
  groupBy.forEach((e: BasicDataWithId) => {
    if (e.key) {
      const { sideType } = e
      switch (sideType) {
        case 'from':
          result.from.push(e.isResourceType || e.isIpType ? getResourceIdKey(e.key) : e.key)
          break
        case 'to':
          result.to.push(e.isResourceType || e.isIpType ? getResourceIdKey(e.key) : e.key)
          break
        default:
          result.common.push(e.key)
          break
      }
    }
  })
  return result
}

export function getParamByName(name: string) {
  const search = window.location.search.replace('?', '')
  if (typeof name === 'undefined') {
    return undefined
  }
  const searchObj: Record<string, string> = {}
  search.split('&').forEach((e: string) => {
    const _arr = e.split('=')
    const key = _arr[0]
    const name = _arr[1]
    searchObj[key] = name
  })
  return searchObj[name]
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
