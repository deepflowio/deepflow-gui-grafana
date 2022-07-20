import React, { useState } from 'react'

export interface MyVariableQuery {
  database: string
  sql: string
}

interface VariableQueryProps {
  query: MyVariableQuery
  onChange: (query: MyVariableQuery, definition: string) => void
}

export const VariableQueryEditor: React.FC<VariableQueryProps> = ({ onChange, query }) => {
  const [state, setState] = useState(query)

  const saveQuery = () => {
    onChange(state, JSON.stringify(state))
  }

  const handleChange = (event: React.FormEvent<HTMLInputElement>) => {
    setState({
      ...state,
      [event.currentTarget.name]: event.currentTarget.value
    })
  }

  return (
    <>
      <div className="gf-form">
        <span className="gf-form-label width-10">DATABASE</span>
        <input
          name="database"
          className="gf-form-input"
          onBlur={saveQuery}
          onChange={handleChange}
          value={state.database}
        />
      </div>
      <div className="gf-form">
        <span className="gf-form-label width-10">SQL</span>
        <input name="sql" className="gf-form-input" onBlur={saveQuery} onChange={handleChange} value={state.sql} />
      </div>
    </>
  )
}
