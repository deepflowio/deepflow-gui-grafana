import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react'
import { Table } from '@douyinfe/semi-ui'
import { ColumnProps } from '@douyinfe/semi-ui/lib/es/table'

interface ComProps {
  loading?: boolean
  columns: Array<
    ColumnProps<{
      key: string
    }>
  >
  dataSource: Array<{
    key: string
  }>
  className: string
  panelWidthHeight: {
    width: number
    height: number
    isMultiRefIds?: boolean
  }
  onRowClick?: (item: any) => void
  highLightRow?: (item: any) => { className?: 'high-light' }
}

const TD_HEIGHT = 24
const TABLE_HEADER_HEIGHT = 40
const TABLE_SCROLL_BAR_WIDTH = 8
const BORDER_WIDTH = 1

export function DYTable({
  loading,
  className,
  columns,
  dataSource,
  panelWidthHeight,
  onRowClick,
  highLightRow
}: ComProps) {
  const [wrapWidthHeight, setWrapWidthHeight] = useState({ width: 0, height: 0 })

  const tableWHSettings = useMemo(() => {
    const width = columns.reduce((prev: number, curr) => {
      const currentWidth = typeof curr.width === 'number' ? curr.width : 0
      return prev + currentWidth
    }, 0)
    const height = dataSource.length * TD_HEIGHT
    return {
      width,
      height
    }
  }, [columns, dataSource])

  const scroll = useMemo(() => {
    const { width, height } = wrapWidthHeight
    if (!width || !height) {
      return {
        x: undefined,
        y: undefined
      }
    }
    const { width: totalWidth, height: totalHeight } = tableWHSettings
    const heightFixNum = width - totalWidth > 0 ? 0 : TABLE_SCROLL_BAR_WIDTH
    return {
      x: width - totalWidth > 0 ? undefined : width - TABLE_SCROLL_BAR_WIDTH - BORDER_WIDTH,
      y: height - totalHeight > 0 ? totalHeight + heightFixNum : height - TABLE_HEADER_HEIGHT - BORDER_WIDTH
    }
  }, [wrapWidthHeight, tableWHSettings])

  const columnsAfterWidthCalc = useMemo(() => {
    const { width, height } = wrapWidthHeight
    if (!width || !height || !columns.length) {
      return []
    }

    const { width: totalWidth } = tableWHSettings
    const widthDiffer = width - totalWidth
    if (widthDiffer > 0) {
      const result = columns.map((e: any, index) => {
        return {
          ...e,
          ...(index === 0
            ? {
                width: e.width + widthDiffer - BORDER_WIDTH - TABLE_SCROLL_BAR_WIDTH
                // width: undefined
              }
            : {})
        }
      })
      return result
    }

    return columns
  }, [columns, wrapWidthHeight, tableWHSettings])

  const wrapDom = useRef<HTMLDivElement>(null)
  const updateWrapWidthHeight = useCallback(() => {
    if (!wrapDom.current) {
      return
    }
    const { clientWidth: width, clientHeight: height } = wrapDom.current as HTMLDivElement
    if (!width || !height) {
      return
    }
    setWrapWidthHeight({
      width,
      height
    })
  }, [])
  useEffect(() => {
    updateWrapWidthHeight()
  }, [panelWidthHeight, updateWrapWidthHeight])

  return (
    <div className={className} ref={wrapDom}>
      <Table
        onRow={record => {
          return {
            onClick: () => {
              if (typeof onRowClick === 'function') {
                onRowClick(record)
              }
            },
            ...(typeof highLightRow === 'function' ? highLightRow(record) : {})
          }
        }}
        columns={columnsAfterWidthCalc}
        dataSource={dataSource}
        pagination={false}
        scroll={scroll}
        bordered
        size="small"
        virtualized={{ itemSize: TD_HEIGHT }}
        loading={loading || false}
        empty="No Data"
        className="generic-font"
      />
    </div>
  )
}
