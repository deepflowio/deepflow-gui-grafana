const getCommonWebpackConfig  = (config, options) => {
  return {
    ...(!options.preserveConsole
      ? {
          devtool: 'none'
        }
      : {})
  }
}

module.exports = getCommonWebpackConfig
