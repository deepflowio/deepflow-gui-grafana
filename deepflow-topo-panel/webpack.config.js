const getCommonWebpackConfig = require('../webpacak.config.common')

module.exports.getWebpackConfig = (config, options) => {
  return {
    ...config,
    ...getCommonWebpackConfig(config, options)
  }
}
