import { ColumnProps } from '@douyinfe/semi-ui/lib/es/table'
import _ from 'lodash'

export function calcTableCellWidth(num: number) {
  const ONE_WORD_WIDTH = 78
  return (num * ONE_WORD_WIDTH) / 10 + 12 + 1
}

export function getStringLen(str: string) {
  let _str = str
  try {
    const res = JSON.parse(str)
    if (typeof res !== 'string') {
      _str = res?.val === ACTICON_ROW_VAL ? ACTICON_ROW_VAL : `${res.val}`
    }
  } catch (error) {}
  return _str.split('').reduce((prev: number, current: string) => {
    const currentLen = /^[\u4e00-\u9fa5]/.test(current) ? 2 : 1
    return prev + currentLen
  }, 0)
}

export const RELATED_DATA_DISPLAY_COLUMNS = [
  'Enum(tap_side)',
  'Enum(l7_protocol)',
  'request_type',
  'request_resource',
  'trace_id',
  'span_id',
  'parent_span_id',
  'x_request_id',
  'syscall_trace_id_request',
  'syscall_trace_id_response',
  'req_tcp_seq',
  'resp_tcp_seq'
]

export const HIGH_LIGHTS_KEY = '__hightLights'
export const SERVICE_UID = 'service_uid'
export const ACTICON_ROW = 'acticon'
export const ACTICON_ROW_VAL = 'acticon_val'

export function tarnsArrayToTableData(data: any[]) {
  if (!Array.isArray(data)) {
    return {
      columns: [],
      dataSource: []
    }
  }

  const dataSource: Array<
    {
      key: string
    } & {
      [P in string]: string
    }
  > = data.map((e: any, index: number) => {
    _.forIn(e, (val, key) => {
      e[key] = typeof val?.toString === 'function' ? val.toString() : val
    })
    return {
      ...e,
      key: index
    }
  })

  const keysTarget = data[0] || {}
  const columns: Array<
    ColumnProps<{
      key: string
    }>
  > = Object.keys(keysTarget)
    .filter((key: string) => {
      return ![SERVICE_UID].includes(key)
    })
    .map((e: string) => {
      const textLens: number[] = [
        e === null ? 0 : getStringLen(e),
        ...dataSource.map(d => {
          return d[e] === null || d[e] === undefined ? 0 : getStringLen(d[e].toString())
        })
      ]
      const maxLen = Math.max(...textLens)
      return {
        title: e,
        dataIndex: e,
        width: calcTableCellWidth(maxLen)
      }
    })
  return {
    columns,
    dataSource
  }
}

export function formatRelatedlData(data: any) {
  const result: any = []

  ;[...RELATED_DATA_DISPLAY_COLUMNS, HIGH_LIGHTS_KEY, ACTICON_ROW].forEach((k, i) => {
    result.push({
      keyName: k,
      ...Object.fromEntries(
        data.map((col: any, index: number) => {
          if (k === ACTICON_ROW) {
            const _ids = _.get(col, ['_ids'], [])
            return [
              `column${index + 1}_value`,
              JSON.stringify({
                _ids: _ids,
                val: ACTICON_ROW_VAL
              })
            ]
          }
          const id = _.get(col, 'id')
          const highLight = _.get(col, [HIGH_LIGHTS_KEY, k])
          const val = _.get(col, [k])
          return [
            `column${index + 1}_value`,
            JSON.stringify({
              highLight,
              val,
              id
            })
          ]
        })
      )
    })
  })
  return result
}

export function tarnsRelatedDataToTableData(data: any[], cellRender: any) {
  if (!Array.isArray(data)) {
    return {
      columns: [],
      dataSource: []
    }
  }

  const dataSource: Array<
    {
      key: string
    } & {
      [P in string]: string
    }
  > = data
    .filter((e: any) => {
      return ![HIGH_LIGHTS_KEY].includes(e?.keyName)
    })
    .map((e: any, index: number) => {
      _.forIn(e, (val, key) => {
        e[key] = typeof val?.toString === 'function' ? val.toString() : val
      })
      return {
        ...e,
        key: index
      }
    })

  const keysTarget = data[0] || {}
  const columns: Array<
    ColumnProps<{
      key: string
    }>
  > = Object.keys(keysTarget)
    .filter((key: string) => {
      return ![HIGH_LIGHTS_KEY, SERVICE_UID].includes(key)
    })
    .map((e: string) => {
      const textLens: number[] = [
        e === null ? 0 : getStringLen(e),
        ...dataSource.map(d => {
          return d[e] === null || d[e] === undefined ? 0 : getStringLen(d[e].toString())
        })
      ]
      const maxLen = Math.max(...textLens)
      return {
        title: e,
        dataIndex: e,
        width: calcTableCellWidth(maxLen),
        render: (text: string, record: any): any => {
          return cellRender(text, record)
        }
      }
    })
  return {
    columns,
    dataSource
  }
}

export function formatDetailData(data: any) {
  const result: any[] = []

  const first = data[0] || {}
  const cates = Object.keys(first)
    .map(k => {
      return new Array(Object.keys(first[k]).length).fill(k)
    })
    .flat(Infinity)
  const keys = Object.keys(first)
    .map(k => {
      return Object.keys(first[k])
    })
    .flat(Infinity)

  cates.forEach((cate, i) => {
    const hasValidVal = data.some((col: any) => {
      const val = _.get(col, [cate, keys[i]])
      return val !== undefined && val !== '' && val !== null
    })
    if (hasValidVal) {
      result.push({
        category: cate,
        keyName: keys[i],
        ...Object.fromEntries(
          data.map((col: any, index: number) => {
            return [`column${index + 1}_value`, _.get(col, [cate, keys[i]])]
          })
        )
      })
    }
  })
  return result
}

export function formatRelatedExtralData(data: any[]) {
  const result: any = []
  if (!data.length) {
    return []
  }
  const keys = Object.keys(data[0])
  keys.forEach((k, i) => {
    result.push({
      keyName: k,
      ...Object.fromEntries(
        data.map((col: any, index: number) => {
          return [`column${index + 1}_value`, _.get(col, [k])]
        })
      )
    })
  })
  return result
}
