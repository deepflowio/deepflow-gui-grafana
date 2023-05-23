import React, { useEffect, useMemo, useRef } from 'react'
import { Button, InlineField, UnitPicker } from '@grafana/ui'
import { StandardEditorProps } from '@grafana/data'
import _ from 'lodash'

export const MetricsUnits: React.FC<StandardEditorProps<Record<string, string>>> = ({
  item,
  value,
  onChange,
  context
}) => {
  const returnMetrics = useMemo(() => {
    const customData = context.data[0]?.meta?.custom
    if (!customData) {
      return []
    }
    return context.data[0]?.meta?.custom?.returnMetrics
  }, [context])

  const prevMetricsNames = useRef([])
  useEffect(() => {
    const metricsNames = returnMetrics.map((e: Record<string, string>) => {
      return e.name
    })
    if (!_.isEqual(metricsNames, prevMetricsNames.current)) {
      Object.keys(value).forEach(k => {
        if (!metricsNames.includes(k)) {
          delete value[k]
        }
      })
      onChange(value)
      prevMetricsNames.current = metricsNames
    }
  }, [returnMetrics, value, onChange])

  return (
    <div
      style={{
        width: '100%'
      }}
    >
      {returnMetrics.map((e: any) => {
        return (
          <InlineField key={e.name} label={e.name} tooltip={`Default: ${e.unit}`} className="options-custom-label">
            <div
              style={{
                display: 'flex'
              }}
            >
              <div
                style={{
                  flex: 1
                }}
                className={e.name}
              >
                <UnitPicker
                  onChange={ev => {
                    const newMetricsUnits: Record<string, string> = {
                      ...value,
                      [e.name]: ev
                    }
                    Object.keys(newMetricsUnits).forEach(e => {
                      if (!newMetricsUnits[e]) {
                        delete newMetricsUnits[e]
                      }
                    })
                    onChange(newMetricsUnits)
                  }}
                  value={value[e.name]}
                />
              </div>
              <Button
                style={{
                  marginLeft: '2px'
                }}
                variant="secondary"
                icon="x"
                disabled={!value[e.name]}
                onClick={() => {
                  const newMetricsUnits: Record<string, string> = {
                    ...value
                  }
                  delete newMetricsUnits[e.name]
                  onChange(newMetricsUnits)
                  setTimeout(() => {
                    const _dom = document.querySelector(`.${e.name}`)!.querySelector('input') as HTMLInputElement
                    _dom.value = ''
                  })
                }}
              />
            </div>
          </InlineField>
        )
      })}
    </div>
  )
}
