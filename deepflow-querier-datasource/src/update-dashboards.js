const fs = require('fs')
const path = require('path')

const DASHBOARDS_DIR_NAME = 'dashboards'

const getAllDashboards = async currentDirPath => {
  const result = []
  const walkSync = async currentDirPath => {
    const files = await fs.readdirSync(currentDirPath, { withFileTypes: true })
    files.forEach(function (dirent) {
      const filePath = path.join(currentDirPath, dirent.name)
      if (dirent.isFile()) {
        result.push({
          ...dirent,
          filePath
        })
      } else if (dirent.isDirectory()) {
        walkSync(filePath)
      }
    })
  }
  await walkSync(currentDirPath)
  return result
}

const getTitle = async filePath => {
  const content = await fs.readFileSync(filePath, 'utf8')
  const data = JSON.parse(content)
  delete data.id
  const newData = JSON.stringify(data)
  fs.writeFile(filePath, newData, 'utf8', () => { })
  return data.title
}

const updateDashboards = async () => {
  try {

    const dashboards = await getAllDashboards(`${__dirname}/${DASHBOARDS_DIR_NAME}`)
    const includes = []
    for (let i = 0; i < dashboards.length; i++) {
      const e = dashboards[i]
      const filePath = e.filePath
      const title = await getTitle(filePath)
      const dbIndex = filePath.indexOf(DASHBOARDS_DIR_NAME)
      includes.push({
        type: 'dashboard',
        name: title,
        path: filePath.substr(dbIndex)
      })
    }
    const pluginJSONFilePath = `${__dirname}/plugin.json`
    const pluginJSONFile = await fs.readFileSync(pluginJSONFilePath, 'utf8')
    const pluginJSON = JSON.parse(pluginJSONFile)
    pluginJSON.includes = includes
    const newPluginJSON = JSON.stringify(pluginJSON)
    fs.writeFile(pluginJSONFilePath, newPluginJSON, 'utf8', () => { })
  } catch (error) {
    console.log('[Update Dashboard Failed]', error)
  }
}

updateDashboards()
