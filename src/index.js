const path = require('path')
const globby = require('globby')
const fs = require('fs-extra')
const { validate } = require('schema-utils')
const { RawSource } = require('webpack-sources')
const { parse, stringify } = require('comment-json')
const schema = require('./schema.json')

// https://webpack.docschina.org/api/compiler-hooks/#make
class UniUsingComponentsWebpackPlugin {
  constructor(options = {}) {
    // 验证 options 是否符合规范
    validate(schema, options, {
      name: 'UniUsingComponentsWebpackPlugin',
    })

    this.options = options
  }

  /**
   * 获取库的 nodeModules 路径
   * @param {}} context
   * @param {*} pattern
   * @returns
   */
  getLibPath(context, pattern) {
    let libPath = ''
    const nodeModulesPath = path.resolve(
      context,
      `node_modules/${pattern.module}/package.json`
    )
    if (fs.pathExists(nodeModulesPath)) {
      const nodeModulesJson = parse(fs.readFileSync(nodeModulesPath).toString())

      if (nodeModulesJson.miniprogram) {
        libPath = `node_modules/${pattern.module}/${nodeModulesJson.miniprogram}`
      } else {
        libPath = `node_modules/${pattern.module}/${nodeModulesJson.files[0]}`
      }
    }
    return libPath
  }

  /**
   * 自动引入其下的原生组件
   * @param {*} compiler
   */
  async writeUsingComponents(compiler) {
    try {
      const context = compiler.options.context // process.cwd()
      const appJsonPath = `./dist/${
        process.env.NODE_ENV === 'production' ? 'build' : 'dev'
      }/mp-weixin`
      const pagesJsonPath = path.resolve(appJsonPath, 'app.json')
      const results = await Promise.all(
        this.options.patterns.map(async (pattern) => {
          const usingComponents = {}
          const libPath = this.getLibPath(context, pattern)
          const paths = await globby([libPath], {})
          const dirs = fs.readdirSync(libPath)
          paths.forEach((file) => {
            if (path.extname(file) === '.json') {
              // 是小程序组件
              const fileSplitChunk = file.split('/')
              const comName = fileSplitChunk[fileSplitChunk.length - 2]
              if (dirs.includes(comName)) {
                const useValue = `/wxcomponents/${pattern.module}/${comName}/index`
                const useKey = `${pattern.prefix}-${comName}`
                usingComponents[useKey] = useValue
              }
            }
          })
          return {
            usingComponents,
          }
        })
      )

      if (fs.pathExistsSync(pagesJsonPath)) {
        const pagesJson = parse(fs.readFileSync(pagesJsonPath, 'utf8'))
        this.options.patterns.map((pattern) => {
          const reg = new RegExp(`(${pattern.prefix}-[a-z]+)`)
          Object.keys(pagesJson.usingComponents).forEach((item) => {
            if (reg.test(item)) {
              delete pagesJson.usingComponents[item]
            }
          })
        })
        results.forEach((item) => {
          Object.entries(item.usingComponents).forEach(([useKey, useValue]) => {
            pagesJson.usingComponents[useKey] = useValue
          })
        })
        fs.writeFileSync(pagesJsonPath, stringify(pagesJson, null, '\t'))
      }
    } catch (err) {
      console.log(err)
    }
  }

  /**
   * 将 node modules 下的库拷贝到最终生产的 wxcomponents 目录下面
   * @param {*} compiler
   * @param {*} compilation
   */
  async copyUsingComponents(compiler, compilation) {
    try {
      const context = compiler.options.context // process.cwd()
      const results = await Promise.all(
        this.options.patterns.map(async (pattern) => {
          const libPath = this.getLibPath(context, pattern)
          const paths = await globby([libPath], {})
          const files = await Promise.all(
            paths.map(async (absolutePath) => {
              const data = fs.readFileSync(absolutePath)
              const relativePath = absolutePath.replace(libPath, pattern.module)
              const filename = path.join(`wxcomponents`, relativePath)
              return {
                data,
                filename,
              }
            })
          )
          return {
            files,
          }
        })
      )
      const assets = []
      results.forEach((fileItem) => {
        const res = fileItem.files.map((file) => {
          const source = new RawSource(file.data)
          return {
            source,
            filename: file.filename,
          }
        })
        assets.push(...res)
      })
      // 添加 compilation 中，输出出去
      assets.forEach((asset) => {
        compilation.emitAsset(asset.filename, asset.source)
      })
    } catch (err) {
      console.log(err)
    }
  }

  /**
   * 自动剔除没有使用到的原生组件
   */
  async deleteNoUseComponents() {
    try {
      const context = `./dist/${
        process.env.NODE_ENV === 'production' ? 'build' : 'dev'
      }/mp-weixin`
      const files = (await globby(`${context}/**/*.wxml`)).filter(
        (file) => !/mp-weixin\/wxcomponents\/.+/.test(file)
      )
      const appJson = fs.readJsonSync(path.resolve(context, 'app.json'))
      const appUsingComponents = appJson.usingComponents || {}
      const prefixes = this.options.patterns.map((item) => item.prefix) || []
      const patterns = prefixes.map(
        (item) => new RegExp(`<(${item}-[a-z-]+)`, 'g')
      )
      const realUsingComponents = files.reduce((rcc, file) => {
        const fileContent = fs.readFileSync(file, {
          encoding: 'utf-8',
        })
        patterns.forEach((pattern) => {
          ;[...fileContent.matchAll(pattern)].forEach((item) => {
            if (rcc.indexOf(item[1]) < 0) {
              rcc.push(item[1])
            }
          })
        }, [])
        return rcc
      }, [])

      const temp = () => {
        const length = realUsingComponents.length
        realUsingComponents.reduce((rcc, component) => {
          if (appUsingComponents[component]) {
            const componentPath = path.resolve(
              context,
              `.${appUsingComponents[component]}`
            )
            const componentJSONPath = `${componentPath}.json`
            const currentModule = this.options.patterns.find(
              (item) =>
                componentJSONPath.replace(/\\/g, '/').indexOf(item.module) > -1
            )
            const componentJSON = fs.readJsonSync(componentJSONPath)
            // 组件可能还有引用其它组件
            const componentUsingComponents = componentJSON.usingComponents
            if (componentUsingComponents) {
              Object.keys(componentUsingComponents).forEach((item, index) => {
                if (rcc.indexOf(item) < 0) {
                  const reg = new RegExp(`^${currentModule.prefix}-[a-z-]+`)
                  if (reg.test(item)) {
                    rcc.push(item)
                  } else {
                    // 处理公共库没有按照自己的规范写
                    const formatItem = `${currentModule.prefix}-${item}`
                    if (!rcc.includes(formatItem)) {
                      rcc.splice(index, 1)
                      rcc.push(formatItem)
                    }
                  }
                }
              })
            }
          }
          return rcc
        }, realUsingComponents)
        return realUsingComponents.length > length
      }
      // 新进的组件可能还有引用其它组件
      while (true) {
        const hasMore = temp()
        if (!hasMore) {
          break
        }
      }
      const patternsPartial = prefixes.map(
        (item) => new RegExp(`^${item}-[a-z-]+`)
      )
      Object.keys(appUsingComponents).forEach((key) => {
        const componentPath = appUsingComponents[key]
        if (
          realUsingComponents.indexOf(key) < 0 &&
          componentPath &&
          patternsPartial.some((pattern) => pattern.test(key))
        ) {
          fs.removeSync(
            path.dirname(path.resolve(context, `.${componentPath}`))
          )
          delete appUsingComponents[key]
        }
      })
      appJson.usingComponents = appUsingComponents
      fs.writeFileSync(
        path.resolve(path.resolve(context, 'app.json')),
        stringify(appJson, undefined, 2),
        {
          encoding: 'utf-8',
        }
      )
    } catch (err) {
      console.log(err)
    }
  }

  apply(compiler) {
    compiler.hooks.thisCompilation.tap(
      'UniUsingComponentsWebpackPlugin',
      (compilation) => {
        // 添加资源 hooks
        compilation.hooks.additionalAssets.tapAsync(
          'UniUsingComponentsWebpackPlugin',
          async (cb) => {
            await this.copyUsingComponents(compiler, compilation)
            cb()
          }
        )
      }
    )

    compiler.hooks.afterEmit.tap('UniUsingComponentsWebpackPlugin', () => {
      this.writeUsingComponents(compiler)
    })

    if (process.env.NODE_ENV === 'production') {
      compiler.hooks.done.tapAsync(
        'UniUsingComponentsWebpackPlugin',
        (stats, callback) => {
          this.deleteNoUseComponents()
          callback()
        }
      )
    }
  }
}

module.exports = UniUsingComponentsWebpackPlugin
