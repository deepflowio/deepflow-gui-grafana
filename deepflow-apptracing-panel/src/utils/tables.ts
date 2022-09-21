import { ColumnProps } from '@douyinfe/semi-ui/lib/es/table'
import _ from 'lodash'

export function calcTableCellWidth(num: number) {
  const ONE_WORD_WIDTH = 78
  return (num * ONE_WORD_WIDTH) / 10 + 12 + 1
}

export function getStringLen(str: string) {
  return str.split('').reduce((prev: number, current: string) => {
    const currentLen = /^[\u4e00-\u9fa5]/.test(current) ? 2 : 1
    return prev + currentLen
  }, 0)
}

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
      return key !== 'service_uid'
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
    result.push({
      category: cate,
      keyName: keys[i],
      ...Object.fromEntries(
        data.map((col: any, index: number) => {
          return [`column${index + 1}_value`, _.get(col, [cate, keys[i]])]
        })
      )
    })
  })
  return result
}
