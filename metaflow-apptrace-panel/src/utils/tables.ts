import { ColumnProps } from '@douyinfe/semi-ui/lib/es/table'
import _ from 'lodash'

export function calcTableCellWidth(num: number) {
  const ONE_WORD_WIDTH = 11
  return num * ONE_WORD_WIDTH + 8
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
  > = Object.keys(keysTarget).map((e: string) => {
    const textLens: number[] = [
      e.length,
      ...dataSource.map(d => {
        return d[e] === null ? 0 : d[e].toString().length
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
