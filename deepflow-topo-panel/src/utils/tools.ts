import { FormattedValue, getValueFormat } from '@grafana/data'
import { getDataSourceSrv } from '@grafana/runtime'
import _ from 'lodash'
import { useState, useEffect, useRef } from 'react'
import { SimpleOptions } from 'types'

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

//  ip: 255, internet_ip: 0
const IP_LIKELY_NODE_TYPE_IDS = [255, 0]
export function genUniqueFieldByTag(tagName: string, item: any): string {
  if (/resource_gl|auto_instance|auto_service/.test(tagName)) {
    const nodeTypeId = item[tagName.replace('_id', '_type')]
    if (IP_LIKELY_NODE_TYPE_IDS.includes(Number(nodeTypeId))) {
      return `${item[tagName.replace('_id', '')]},${item[tagName]}`
    }
  }
  return item[tagName]
}

const TIME_METRIC_TYPE_NUM = 3
export function formatMetrics(returnMetrics: any[], e: any, metricsUnits: SimpleOptions['metricsUnits']) {
  return Object.fromEntries(
    returnMetrics.map(metric => {
      const key = metric.name
      const type = metric.type
      const unit = metric.unit
      const val = e[key]
      if (metricsUnits[key]) {
        const formatFn = getValueFormat(metricsUnits[key])
        const { prefix, text, suffix } = formatFn(val) as FormattedValue

        const valAfterFormat = [prefix, text, suffix]
          .filter(e => {
            return !!e
          })
          .join('')
        return [key, valAfterFormat]
      }
      if (type === TIME_METRIC_TYPE_NUM) {
        return [key, formatUsUnit(val)]
      }
      const valAfterFormat = numberToShort(val)
      return [key, `${valAfterFormat}${valAfterFormat !== null && valAfterFormat !== '' ? unit : ''}`]
    })
  )
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
