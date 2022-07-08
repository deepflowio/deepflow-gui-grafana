import _ from 'lodash'

export function uuid() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1)
  }
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4()
}

const TAG_OPERATORS_MAP = {
  LIKE: {
    display_name: ':',
    description: 'string, * for wildcard',
    sort: 0
  },
  REGEXP: {
    display_name: '~',
    description: 'regular expression',
    sort: 1
  },
  IN: {
    display_name: '=',
    description: 'resource uid, or integer',
    sort: 2
  },
  'NOT LIKE': {
    display_name: '!:',
    description: 'string, * for wildcard',
    sort: 3
  },
  'NOT REGEXP': {
    display_name: '!~',
    description: 'regular expression',
    sort: 4
  },
  'NOT IN': {
    display_name: '!=',
    description: 'resource uid, or integer',
    sort: 5
  },
  '<': {
    display_name: '<',
    description: 'Numerical filtering',
    sort: 6
  },
  '<=': {
    display_name: '<=',
    description: 'Numerical filtering',
    sort: 7
  },
  '>': {
    display_name: '>',
    description: 'Numerical filtering',
    sort: 8
  },
  '>=': {
    display_name: '>=',
    description: 'Numerical filtering',
    sort: 9
  }
} as const
// type keys = keyof typeof TAG_OPERATORS_MAP
export function formatTagOperators(operators: string[]) {
  let operatorOpts: any[] = []
  operators.forEach(op => {
    const mapItem = _.get(TAG_OPERATORS_MAP, op)
    if (mapItem) {
      const desc = mapItem.description ? ` (${mapItem.description})` : ''
      operatorOpts[mapItem.sort] = {
        label: `${mapItem.display_name}${desc}`,
        value: op
      }
    }
  })
  return operatorOpts.filter(e => e !== undefined)
}
