import { DataFrame } from '@grafana/data'
import _ from 'lodash'
import { useState, useEffect, useRef } from 'react'
import { getDataSourceSrv } from '@grafana/runtime'

export function genServiceId(item: { service_uid: string }) {
  return item.service_uid
}

export function getDataByFieldName(series: DataFrame[], fieldName: string) {
  let result
  try {
    result = series[0].fields
      .find(e => {
        return e.name === fieldName
      })
      ?.values.toArray()[0]
    result = JSON.parse(result)
  } catch (error) {
    result = []
  }
  return result
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
  xrequestid: ['x_request_id_0', 'x_request_id_1'],
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
  const result = relateData
    .map((e: any) => {
      return {
        ...fullDataKeyById[e.id],
        __related: e
      }
    })

  item.__hightLights = {}
  result.forEach((e: any) => {
    const relatedFields = e.__related.type.split(',').map((k: keyof typeof RELATED_TYPE_FIELDS_MAP) => {
      return RELATED_TYPE_FIELDS_MAP[k]
    })
    e.__hightLights = {}
    const _relatedFields = relatedFields ? [...relatedFields].sort(() => -1) : []
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
  return [
    item,
    ..._.uniqBy(result, (e: any) => {
      return e.__related._id
    })
  ]
}

export function formatDetailList(detailList: any[], metaCustom: any) {
  const MAP_METRIC_TYPE_NUM = 7
  const TIME_METRIC_TYPE_NUM = 3
  const tagsGroupbyCategory = _.groupBy(
    metaCustom.tags.map((e: any) => {
      return {
        ...e,
        value: e.isEnumLikely ? `Enum(${e.value})` : e.value
      }
    }),
    'category'
  )
  const tagCategoryKeys = Object.keys(tagsGroupbyCategory)

  const result: any = {}
  const SPEC_TAG_MAP = {
    _id: 'toString(_id)'
  }
  detailList.forEach(e => {
    let JSONMetrics = {}
    const item = tagCategoryKeys
      .map(tagCate => {
        const isJSONTag = tagsGroupbyCategory[tagCate][0].isJSONTag
        let tags = []
        let resData: any
        if (isJSONTag) {
          const tagValue = tagsGroupbyCategory[tagCate][0]['value']
          resData = JSON.parse(e[tagValue] === '' ? '{}' : e[tagValue])
          tags = Object.keys(resData).map(attr => {
            return { category: tagCate, value: attr }
          })
        } else {
          tags = tagsGroupbyCategory[tagCate]
          resData = e
        }
        return [
          tagCate || 'N/A',
          Object.fromEntries(
            tags.map(tagObj => {
              const tag = `${tagObj.value}`
              const val = resData[_.get(SPEC_TAG_MAP, tag, tag)]
              return [tag, val?.toString() ? val.toString() : val]
            })
          )
        ]
      })
      .concat([
        [
          'Metrics',
          {
            ...Object.fromEntries(
              metaCustom.metrics
                .map((metric: any) => {
                  const key = metric.name
                  const type = metric.type
                  const unit = metric.unit
                  const val = e[key]

                  if (type === MAP_METRIC_TYPE_NUM) {
                    const _vals = JSON.parse(val || {})
                    JSONMetrics = {
                      ...JSONMetrics,
                      ..._vals
                    }
                    return []
                  }
                  if (type === TIME_METRIC_TYPE_NUM) {
                    return [key, formatUsUnit(val)]
                  }
                  const valAfterFormat = numberToShort(val)
                  return [
                    key,
                    valAfterFormat !== undefined && valAfterFormat !== null && valAfterFormat !== ''
                      ? `${valAfterFormat}${unit}`
                      : valAfterFormat
                  ]
                })
                .filter((e: any) => !!e)
            ),
            ...JSONMetrics
          }
        ]
      ])
    result[e['toString(_id)']] = Object.fromEntries(item)
  })
  return result
}

export async function getDeepFlowDatasource() {
  const deepFlowName = getDataSourceSrv()
    .getList()
    .find(dataSource => {
      return dataSource.type === 'deepflowio-deepflow-datasource'
    })?.name
  return await getDataSourceSrv().get(deepFlowName)
}

export function findLastVisibleTextNode(doc: any) {
  let lastTextNode = null

  function traverse(node: any) {
    node.childNodes.forEach((child: any) => {
      if (child.nodeType === Node.TEXT_NODE && child.textContent.trim() !== '') {
        lastTextNode = child // 更新最后一个有效的文本节点
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        traverse(child) // 递归遍历元素节点
      }
    })
  }

  traverse(doc)
  return lastTextNode
}
