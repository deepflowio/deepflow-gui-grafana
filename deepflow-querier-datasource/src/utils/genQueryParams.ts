import { ScopedVars } from '@grafana/data'
import { getTemplateSrv } from '@grafana/runtime'
import { BasicData } from 'components/QueryEditorFormRow'
import { SLIMIT_DEFAULT_VALUE, VAR_INTERVAL, VAR_INTERVAL_QUOTATION } from 'consts'
import _ from 'lodash'
import { LabelItem } from 'QueryEditor'
// import { MyQuery } from 'types'
import { getTagMapCache, QUERY_DATA_CACHE } from './cache'
import { getRealKey, isEnumLikelyTag } from './tools'

// Secondary Operators and Concatenated Strings Map:
// {
//   other: 'and',
//   forward: 'or',
//   reverse: 'and'
// }
const OP_TEXT_MAP = [
  {
    name: '<',
    op: '<',
    display_name: '<',
    isSupport: true,
    secondLevelType: 'other'
  },
  {
    name: '<=',
    op: '<=',
    display_name: '<=',
    isSupport: true,
    secondLevelType: 'other'
  },
  {
    name: '>',
    op: '>',
    display_name: '>',
    isSupport: true,
    secondLevelType: 'other'
  },
  {
    name: '>=',
    op: '>=',
    display_name: '>=',
    isSupport: true,
    secondLevelType: 'other'
  },
  {
    name: '=',
    op: '=',
    display_name: '=',
    isSupport: true,
    secondLevelType: 'forward'
  },
  {
    name: '!=',
    op: '!=',
    display_name: '!=',
    isSupport: true,
    secondLevelType: 'reverse'
  },
  {
    name: 'IN',
    op: 'IN',
    display_name: 'in',
    isSupport: false,
    secondLevelType: 'forward'
  },
  {
    name: 'NOT IN',
    op: 'NOT IN',
    display_name: 'not in',
    isSupport: false,
    secondLevelType: 'reverse'
  },
  {
    name: 'REGEXP',
    op: 'REGEXP',
    display_name: '~',
    isSupport: true,
    secondLevelType: 'forward'
  },
  {
    name: 'NOT REGEXP',
    op: 'NOT REGEXP',
    display_name: '!~',
    isSupport: true,
    secondLevelType: 'reverse'
  },
  {
    name: 'LIKE',
    op: 'LIKE',
    display_name: ':',
    isSupport: true,
    secondLevelType: 'forward'
  },
  {
    name: 'NOT LIKE',
    op: 'NOT LIKE',
    display_name: '!:',
    isSupport: true,
    secondLevelType: 'reverse'
  }
]

enum OP {
  AND = 'AND',
  OR = 'OR'
}

const SUPPORT_OP_TEXT_MAP = _.keyBy(
  _.filter(OP_TEXT_MAP, ({ isSupport }) => isSupport),
  ({ op }: { op: string }) => op
)

// conditon merge
function jointOrAnd(conditionList: any) {
  const keyMap = _.groupBy(conditionList, o => o.key)
  const result: any[] = []
  _.forEach(keyMap, (condList, key) => {
    const type = _.get(condList, [0, 'type'], '')
    const opMap = _.groupBy(condList, o => {
      return SUPPORT_OP_TEXT_MAP[o.op]?.secondLevelType
    })
    const tagList: any[] = []
    _.forEach(opMap, (conds, key) => {
      let op = OP.AND
      if (key === 'forward') {
        op = OP.OR
      } else if (key === 'reverse' || key === 'other') {
        op = OP.AND
      }
      tagList.push({
        type,
        op,
        val: [...conds]
      })
    })
    if (tagList.length > 1) {
      result.push({
        type,
        op: OP.OR,
        val: [...tagList]
      })
    } else {
      result.push(...tagList)
    }
  })

  return result
}

function formatWithsubFuncs(target: any) {
  const { subFuncs, func, key, params } = target
  if (!Array.isArray(subFuncs) || !subFuncs.length) {
    return target
  }
  const result = _.cloneDeep(subFuncs).map((e: any) => {
    if (e.func.toLocaleLowerCase() === 'math') {
      e.func = e.op
    }
    return _.pick(e, ['func', 'params'])
  })

  result.forEach((e: any, i: number) => {
    if (i === 0) {
      e.params = [
        {
          func,
          key,
          params
        },
        e.params
      ]
    } else {
      const prev = result[i - 1]
      e.params = [prev, e.params]
    }
    e.params = e.params.filter((e: any) => e !== undefined)
  })

  return target.as
    ? {
        func: 'as',
        params: [result[result.length - 1], target.as]
      }
    : result[result.length - 1]
}

function selectFormat(data: any): {
  TAGS: any[]
  METRICS: any[]
} {
  const { select, appType } = data
  const TAGS: any[] = []
  const METRICS: any[] = []
  select
    .filter((item: BasicData) => {
      return item.key
    })
    .forEach((item: BasicData) => {
      const validKeys = ['key', 'func', 'params', 'as', 'subFuncs'] as const
      const result: any = {}
      validKeys.forEach(key => {
        if (_.isNumber(item[key]) || !_.isEmpty(item[key])) {
          result[key] = item[key]
        }
      })
      const target = item.type === 'tag' ? TAGS : METRICS
      const resultKeys = Object.keys(result)
      if (resultKeys.length === 1 && resultKeys[0] === 'key') {
        target.push(result.key)
      } else {
        target.push(formatWithsubFuncs(result))
      }
    })

  if (appType === 'appTracing') {
    TAGS.push({
      key: '_id',
      func: 'TO_STRING'
    })
  }
  return {
    TAGS,
    METRICS
  }
}

export function getValueByVariablesName(val: LabelItem, variables: any[], op: string, scopedVars: ScopedVars) {
  const isLikeOp = op.toUpperCase().includes('LIKE')
  const specVariables = ['__disabled', '__any']
  try {
    const currentVariable = variables.find((variable: any) => {
      return variable.name === `${val?.value}`.replace('$', '')
    })
    if (!currentVariable) {
      return val.value
    }
    if (scopedVars[val?.value]) {
      currentVariable.current = scopedVars[val?.value]
    }
    const currentValue = _.get(currentVariable, ['current', 'value'], '')
    if (currentVariable?.type === undefined) {
      return val.value
    }
    if (['textbox', 'constant'].includes(currentVariable.type)) {
      return currentValue
    }
    const targetField = isLikeOp ? 'text' : 'value'
    if (currentValue.includes('$__all')) {
      return currentVariable.options
        .filter((e: any) => e.value !== '$__all' && !specVariables.includes(e.value))
        .map((e: any) => _.get(e, [targetField]))
    }
    if (currentValue.includes('__disabled')) {
      return '__disabled'
    }

    if (
      currentValue === '__any' ||
      (Array.isArray(currentValue) && currentValue.filter((e: string) => e !== '__any').length <= 0)
    ) {
      return '__any'
    } else {
      const result = _.get(currentVariable, ['current', targetField])
      return typeof result === 'string'
        ? result
        : result.filter((e: string) => {
            return e !== '__any' && e !== 'Any'
          })
    }
  } catch (error) {
    console.log(error)
  }
  return val.value
}

function whereFormat(data: any, variables: any[], scopedVars: ScopedVars) {
  const { db, from, where, having } = data
  const fullData = where.concat(having)
  const validKeys = ['type', 'key', 'func', 'op', 'val', 'params', 'subFuncs', 'whereOnly'] as const
  const result = fullData
    .filter((item: BasicData) => {
      return item.key
    })
    .map((item: BasicData) => {
      item.key = getRealKey(item)
      const result: any = {}
      validKeys.forEach(key => {
        if (typeof item[key] === 'boolean' || _.isNumber(item[key]) || !_.isEmpty(item[key])) {
          result[key] = item[key]
        }
        if (key === 'val') {
          if (item[key] instanceof Object) {
            result[key] = getValueByVariablesName(item[key] as LabelItem, variables, item.op, scopedVars)
            // result[key] = (item[key] as LabelItem).value
          }
          if (Array.isArray(item[key])) {
            result[key] = (item[key] as LabelItem[])
              .map((e: LabelItem) => {
                return getValueByVariablesName(e, variables, item.op, scopedVars)
                // return e.value
              })
              .flat(Infinity)
          }
        }
      })
      const tagMapItem = getTagMapCache(db, from, result.key)
      const isEnumTag = result.type === 'tag' && isEnumLikelyTag(tagMapItem)
      return {
        isForbidden: false,
        ...(result.type === 'tag' || !result?.subFuncs?.length
          ? result
          : {
              type: result.type,
              op: result.op,
              val: [formatWithsubFuncs(result), result.val]
            }),
        ...(isEnumTag && (result.op.toUpperCase().includes('LIKE') || result.op.toUpperCase().includes('REGEXP'))
          ? {
              func: 'Enum'
            }
          : {})
      }
    })

  const _tags: any[] = []
  const _metrics: any[] = []
  result.forEach((e: any) => {
    if (e.type === 'metric') {
      _metrics.push(e)
      return
    }
    if (e.whereOnly) {
      const tagNames = ['_0', '_1'].map(side => {
        return `${e.key}${side}`
      })
      const obj = {
        type: 'tag',
        op: e.op.toUpperCase().includes('NOT') || e.op.includes('!') ? 'AND' : 'OR',
        val: tagNames
          .map(tagName => {
            if (e.op.toUpperCase().includes('LIKE')) {
              return e.val.map((val: any) => {
                return {
                  ...e,
                  key: tagName,
                  val
                }
              })
            }
            return {
              ...e,
              key: tagName
            }
          })
          .flat(Infinity)
      }
      _tags.push(obj)
    } else if (e.op.toUpperCase().includes('LIKE')) {
      e.val.forEach((val: any) => {
        _tags.push({
          ...e,
          val
        })
      })
    } else {
      _tags.push(e)
    }
  })

  return jointOrAnd(_tags).concat(_metrics)
}

const UNIT_TO_S: Record<any, (n: number) => number> = {
  ms: (n: number) => {
    return n / 1000
  },
  s: (n: number) => {
    return n
  },
  m: (n: number) => {
    return n * 60
  },
  h: (n: number) => {
    return n * 60 * 60
  },
  d: (n: number) => {
    return n * 60 * 60 * 24
  }
}

function intervalTrans(intervalWithUnit: string, variableItem: any) {
  if (intervalWithUnit === '$__auto_interval_intervaltest') {
    if (QUERY_DATA_CACHE.time_start === undefined || QUERY_DATA_CACHE.time_end === undefined) {
      return intervalWithUnit
    }
    const range = QUERY_DATA_CACHE.time_end - QUERY_DATA_CACHE!.time_start
    const { auto_count, auto_min } = variableItem
    const min_num = parseFloat(auto_min)
    const min_unit = auto_min.split(`${min_num}`)[1]
    const min_interval = UNIT_TO_S[min_unit] ? UNIT_TO_S[min_unit](min_num) : 0
    const _interval = range / auto_count
    return (_interval < min_interval ? min_interval : _interval) + ''
  }
  const num = parseFloat(intervalWithUnit)
  const unit = intervalWithUnit.split(`${num}`)[1]
  return UNIT_TO_S[unit] ? UNIT_TO_S[unit](num) + '' : intervalWithUnit
}

function getInterval(intervalStr: string, variables: any[]) {
  const variableItem = variables.find(e => {
    return intervalStr === e.name
  })
  if (!variableItem) {
    return intervalStr
  }
  const interval = _.get(variableItem, ['current', 'value'], '')
  return isNaN(Number(interval)) ? intervalTrans(interval, variableItem) : interval
}

function groupByFormat(data: any, variables: any[]) {
  return [
    ...(data.interval
      ? [
          {
            func: 'interval',
            key: 'time',
            params: getInterval(data.interval, variables),
            as: `time_${data.interval}`
          }
        ]
      : []),
    ...data.groupBy
      .filter((item: BasicData) => {
        return item.key
      })
      .map((item: BasicData) => {
        const { key, as } = item
        if (as) {
          return {
            key,
            as
          }
        }
        return key
      })
  ]
}

function orderByFormat(orderBy: BasicData[]) {
  const validKeys = ['key', 'func', 'params', 'sort', 'subFuncs'] as const
  return orderBy
    .filter((item: BasicData) => {
      return item.key
    })
    .map((item: BasicData) => {
      item.key = getRealKey(item)
      const result: any = {}
      if (item.key.startsWith('interval_')) {
        const intervalTime = item.key.replace('interval_', '')
        return {
          func: 'interval',
          key: 'time',
          params: intervalTime,
          desc: item['sort'] === 'desc'
        }
      }
      validKeys.forEach(key => {
        if (key === 'sort') {
          result.desc = item[key] === 'desc'
        } else {
          if (_.isNumber(item[key]) || !_.isEmpty(item[key])) {
            result[key] = item[key]
          }
        }
      })
      return {
        ...formatWithsubFuncs(result),
        desc: result.desc
      }
    })
}

export function genQueryParams(queryData: Record<any, any>, scopedVars: ScopedVars) {
  const keys = [
    'db',
    'from',
    'select',
    'where',
    'having',
    'groupBy',
    'orderBy',
    'interval',
    'slimit',
    'limit',
    'offset',
    'appType'
  ] as const
  type KeyTypes = typeof keys[number]
  type Data = {
    [K in KeyTypes]?: string | BasicData[]
  }
  const data = queryData as Data
  const templateSrv = getTemplateSrv()
  const variables = _.cloneDeep(templateSrv.getVariables() as any[])
  return {
    format: 'sql',
    db: data.db,
    tableName: data.from,
    selects: selectFormat(data),
    conditions: {
      RESOURCE_SETS: [
        {
          id: '0',
          isForbidden: false,
          condition: whereFormat(data, variables, scopedVars)
        }
      ]
    },
    groupBy: groupByFormat(data, variables),
    orderBy: orderByFormat(data.orderBy as BasicData[]),
    ...((data?.groupBy as BasicData[]).filter(e => e.key).length && data.interval
      ? { slimit: data.slimit === undefined || data.slimit === '' ? SLIMIT_DEFAULT_VALUE : data.slimit }
      : {}),
    limit: data.limit,
    offset: data.offset
  }
}

export const replaceInterval = (queryText: string, scopedVars: ScopedVars) => {
  if (typeof scopedVars?.__interval_ms?.value === 'number') {
    return (
      queryText
        .replace(VAR_INTERVAL_QUOTATION, `${scopedVars.__interval_ms.value / 1000}`)
        // history data hanlder
        .replace(VAR_INTERVAL, `${scopedVars.__interval_ms.value / 1000}`)
    )
  }
  return queryText
}

export default genQueryParams
