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
          result.from.push(e.key)
          break
        case 'to':
          result.to.push(e.key)
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
