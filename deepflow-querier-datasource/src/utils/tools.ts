import { BasicData } from 'components/QueryEditorFormRow'
import {
  BasicDataWithId,
  ID_PREFIX,
  MAP_METRIC_TYPE_NUM,
  MAP_TAG_TYPE,
  SELECT_GROUP_BY_DISABLE_TAGS,
  TAG_METRIC_TYPE_NUM,
  defaultItem
} from 'consts'
import _ from 'lodash'
import { getI18NLabelByName } from './i18n'
import * as querierJs from 'deepflow-sdk-js'
import { getTemplateSrv } from '@grafana/runtime'
import { LabelItem } from 'QueryEditor'

export function uuid() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1)
  }
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4()
}

export const TAG_OPERATORS_MAP = {
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

export function isEnumLikelyTag(item: any): boolean {
  if (!item?.type) {
    return false
  }
  return item.type.toLowerCase().includes('enum') && item.type.toLowerCase() !== 'bit_enum'
}

export function formatTagOperators(item: Record<any, any> & { operators: string[] }) {
  let { operators } = item
  const isEnumLikelyType = isEnumLikelyTag(item)
  if (isEnumLikelyType) {
    operators = [...new Set(['LIKE', 'NOT LIKE', ...operators])]
  }
  let operatorOpts: any[] = []
  operators
    .filter(op => {
      const isStringType = item.type === 'string'
      const isNotSpecTag = !['profile_event_type'].includes(item.name)
      if (isStringType && isNotSpecTag) {
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
    const keyMatchArr = $1.match(/\$\{(\S*)\}/)
    const key = Array.isArray(keyMatchArr) && keyMatchArr?.length >= 2 ? keyMatchArr[1] : $1
    return typeof mapObj[key] !== 'undefined' ? mapObj[key] : key
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

export function getAccessRelationshipQueryConfig(groupBy: any, returnTags: any[]) {
  const returnTagsMap = _.keyBy(returnTags, 'name')

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
          if (returnTagsMap[`Enum(${e.key})`]) {
            result.common.push(`Enum(${e.key})`)
          }
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

export function getRealKey(item: BasicData) {
  return item?.fromSelect ? item.fromSelect?.key : item.key
}

export function genGetTagValuesSql(
  {
    tagName,
    tagType,
    from,
    keyword
  }: {
    tagName: string
    tagType: string
    from: string
    keyword: string | Array<number | string>
  },
  useEqual?: boolean
) {
  let cond: string
  if (useEqual) {
    cond = (keyword as Array<number | string>)
      .map(kw => {
        return `${tagType === 'resource' ? `${tagName}_id` : tagName}=${typeof kw === 'number' ? kw : `'${kw}'`}`
      })
      .join(' OR ')
  } else {
    // tag of map type children, can only search by value, but value is same as description
    const ONLY_USE_NAME_LIKELY_TAG_TYPES = ['resource', 'int_enum', 'string_enum', 'resource_array']
    const ENUM_LIKELY_TAG_TYPES = ['enum', 'int_enum', 'string_enum']

    const likeVal = (keyword as string) || '*'
    cond = [
      ENUM_LIKELY_TAG_TYPES.includes(tagType as string) ? `Enum(${tagName})` : tagName,
      ...(ONLY_USE_NAME_LIKELY_TAG_TYPES.includes((tagType as string).toLocaleLowerCase()) ? [] : [tagName])
    ]
      .map(e => {
        // @ts-ignore
        return `${e} LIKE ${querierJs.escape(`*${likeVal}*`)}`
      })
      .join(' OR ')
  }
  return `show tag ${tagName} values FROM ${from} WHERE ${cond}${!useEqual ? ' LIMIT 0,100' : ''}`
}

export const TIME_VARIABLE_FROM = '${__from:date:seconds}'
export const TIME_VARIABLE_TO = '${__to:date:seconds}'
export function addTimeToWhere(queryData: any) {
  const result = _.cloneDeep(queryData)
  const key = 'time'
  result.where.push({
    type: 'tag',
    key,
    op: '>=',
    val: TIME_VARIABLE_FROM
  })
  result.where.push({
    type: 'tag',
    key,
    op: '<=',
    val: TIME_VARIABLE_TO
  })
  return result
}

export function getTracingQuery({ metrics, tags }: any) {
  const result: {
    sql: string
    returnTags: Array<Record<any, any>>
    returnMetrics: Array<Record<any, any>>
  } = {
    sql: '',
    returnTags: [],
    returnMetrics: []
  }
  try {
    const JSON_TAGS: Array<{
      category: string
      groupName: string
    }> = tags
      .filter((e: any) => {
        return e.type === MAP_TAG_TYPE
      })
      .map((e: any) => {
        return {
          category: e.category,
          groupName: e.name
        }
      })

    const _tags = tags
      .filter((e: any) => {
        return !e?.not_supported_operators.includes('select')
      })
      .map((e: any) => {
        const isEnumLikely = isEnumLikelyTag(e)
        const isJSONTag = JSON_TAGS.find(jsonTag => {
          return e.category === jsonTag.category
        })
        const isMainJSONTag = JSON_TAGS.find(jsonTag => {
          return e.name === jsonTag.groupName
        })
        if (SELECT_GROUP_BY_DISABLE_TAGS.includes(e.name) || (isJSONTag && !isMainJSONTag)) {
          return []
        }
        const { name, client_name, server_name, category } = e
        if ((name === client_name && name === server_name) || (!client_name && !server_name)) {
          return {
            category,
            value: e.name,
            isJSONTag,
            isEnumLikely
          }
        }
        return [
          ...(e.client_name
            ? [
                {
                  category: isJSONTag ? `${category} - ${getI18NLabelByName('client')}` : category,
                  value: e.client_name,
                  isJSONTag,
                  isEnumLikely
                }
              ]
            : []),
          ...(e.server_name
            ? [
                {
                  category: isJSONTag ? `${category} - ${getI18NLabelByName('server')}` : category,
                  value: e.server_name,
                  isJSONTag,
                  isEnumLikely
                }
              ]
            : [])
        ]
      })
      .flat(Infinity)
    const JSON_METRICS: Array<{
      category: string
      groupName: string
    }> = metrics
      .filter((e: any) => {
        return e.type === MAP_METRIC_TYPE_NUM
      })
      .map((e: any) => {
        return {
          category: e.category,
          groupName: e.name
        }
      })

    const sqlData = {
      format: 'sql',
      db: 'flow_log',
      tableName: 'l7_flow_log',
      selects: {
        TAGS: _tags.map((e: any) => {
          if (e.isEnumLikely) {
            return {
              func: 'Enum',
              key: e.value
            }
          }
          return e.value
        }),
        METRICS: metrics
          .filter((e: any) => {
            const isJSONMetric = JSON_METRICS.find(jsonTag => {
              return e.category === jsonTag.category
            })
            const isMainJSONMetric = JSON_METRICS.find(jsonTag => {
              return e.name === jsonTag.groupName
            })
            const isSubJSONMetric = isJSONMetric && !isMainJSONMetric
            return e.type !== TAG_METRIC_TYPE_NUM && !isSubJSONMetric && !e.is_agg
          })
          .map((e: any) => {
            return e.name
          })
      },
      conditions: {
        RESOURCE_SETS: [
          {
            id: '0',
            isForbidden: false,
            condition: []
          }
        ]
      }
    }
    // @ts-ignore
    const querierJsResult = querierJs.dfQuery(sqlData)
    const { returnMetrics, sql } = querierJsResult.resource[0]
    result.sql = sql.replace('_id', 'toString(_id)')
    result.returnTags = _tags
    result.returnMetrics = returnMetrics
  } catch (error) {
    console.log(error)
  }
  return result
}

export function getTracingId(tracingId: LabelItem | null | undefined): string {
  let _id: string
  if (tracingId?.isVariable) {
    const templateSrv = getTemplateSrv()
    const variables = templateSrv.getVariables() as any[]
    const currentVariable = variables.find(e => {
      return e.name === (tracingId.value as string).substring(1)
    })
    _id = _.get(currentVariable, ['current', 'value'], '')
  } else {
    _id = tracingId?.value ? (tracingId!.value as string) : ''
  }
  return typeof _id === 'string' ? _id.replace(ID_PREFIX, '') : ''
}

export function isAutoGroupTag(tagName: string) {
  return /resource_gl|auto_instance|auto_service/.test(tagName)
}

export function queryCondsFilter(conds: BasicDataWithId[] | undefined, type: 'tag' | 'metric') {
  const defaultCond = [
    {
      ...defaultItem(),
      type
    }
  ]
  if (conds === undefined) {
    return defaultCond
  }
  const result = conds.filter(e => {
    const hasVal = Array.isArray(e.val) ? e.val.length : e.val
    return e.key && e.op && hasVal
  })
  return result?.length ? result : defaultCond
}
