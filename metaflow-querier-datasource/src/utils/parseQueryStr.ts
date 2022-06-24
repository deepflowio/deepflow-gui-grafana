import { BasicData } from 'components/QueryEditorFormRow'
import _ from 'lodash'
import { LabelItem } from 'QueryEditor'

function formatWithsubFuncs(target: any) {
  const { subFuncs, func, key, params } = target
  if (!Array.isArray(subFuncs) || !subFuncs.length) {
    return target
  }
  const result = _.cloneDeep(subFuncs).map((e: any) => {
    if (e.func.toLocaleLowerCase() === 'percentage') {
      e.params = '100'
    }
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
  return result[result.length - 1]
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

  if (appType === 'appTrace') {
    TAGS.push('_id')
  }
  return {
    TAGS,
    METRICS
  }
}

function whereFormat(data: any) {
  const { where, having, appType } = data
  const fullData = where.concat(having)
  const validKeys = ['type', 'key', 'func', 'op', 'val', 'params', 'subFuncs'] as const
  const result = fullData
    .filter((item: BasicData) => {
      return item.key
    })
    .map((item: BasicData) => {
      const result: any = {}
      validKeys.forEach(key => {
        if (_.isNumber(item[key]) || !_.isEmpty(item[key])) {
          result[key] = item[key]
        }
        if (key === 'val') {
          if (_.isObject(item[key])) {
            result[key] = (item[key] as LabelItem).value
          }
          if (Array.isArray(item[key])) {
            result[key] = (item[key] as LabelItem[]).map((e: LabelItem) => e.value)
          }
        }
      })
      return {
        isForbidden: false,
        ...(result.type === 'tag' || !result?.subFuncs?.length
          ? result
          : {
              type: result.type,
              op: result.op,
              val: [formatWithsubFuncs(result), result.val]
            })
      }
    })
  if (appType === 'appTrace') {
    result.push({
      type: 'tag',
      key: 'tap_port_type',
      op: '=',
      val: '7'
    })
  }
  return result
}

function groupByFormat(data: any) {
  return [
    ...(data.interval
      ? [
          {
            func: 'interval',
            key: 'time',
            params: data.interval,
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
  const validKeys = ['key', 'func', 'params', 'as', 'sort', 'subFuncs'] as const
  return orderBy
    .filter((item: BasicData) => {
      return item.key
    })
    .map((item: BasicData) => {
      const result: any = {}
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

function queryTextFormat(queryData: any) {
  const keys = [
    'db',
    'from',
    'select',
    'where',
    'having',
    'groupBy',
    'orderBy',
    'interval',
    'limit',
    'offset',
    'appType'
  ] as const
  type KeyTypes = typeof keys[number]
  type Data = {
    [K in KeyTypes]?: string | BasicData[]
  }
  const data = queryData as Data
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
          condition: whereFormat(data)
        }
      ]
    },
    groupBy: groupByFormat(data),
    orderBy: orderByFormat(data.orderBy as BasicData[]),
    limit: data.limit,
    offset: data.offset
  }
}

let parse = (str: string) => {
  return queryTextFormat(str)
}

export default parse
