const path = require('path');
const globby = require('globby');
const fs = require('fs-extra');
const { validate } = require('schema-utils');
const { RawSource } = require('webpack-sources');
// const readFile = promisify(fs.readFile);
const schema = require('./schema.json');

// https://webpack.docschina.org/api/compiler-hooks/#make
class UniUsingComponentsWebpackPlugin {
  constructor(options = {}) {
    // 验证 options 是否符合规范
    validate(schema, options, {
      name: 'UniUsingComponentsWebpackPlugin',
    });
    this.options = options;
  }

  async processGenerateVant(compilation, cb) {
    // 将 from 中的资源复制到 to 中，输出出去
    // const absoluteFrom = path.isAbsolute(from) ? from: path.resolve(context, from)
    // const from = 'node_modules/@vant/weapp/lib'
    const from = './node_modules/@vant/weapp/lib'; // this.options.from;
    // 1. 读取 from 中的所有资源
    // 运行指令的目录
    const paths = await globby([from], {});
    // 2. 过滤掉 ignore 的文件
    const files = await Promise.all(
      paths.map(async (absolutePath) => {
        const data = await fs.readFileSync(absolutePath);
        // const dirName = path
        //   .dirname(absolutePath)
        //   .replace('node_modules/@vant/weapp/lib', '@vant/weapp')
        const dirName = path
          .dirname(absolutePath)
          .replace('node_modules/@vant/weapp/lib', this.options.name);
        console.log(dirName);
        const relativePath = `${dirName}/${path.basename(absolutePath)}`;
        const filename = path.join(`wxcomponents`, relativePath);
        return {
          data,
          filename,
        };
      })
    );
    // 3. 生成 webpack 格式的资源
    const assets = files.map((file) => {
      const source = new RawSource(file.data);
      return {
        source,
        filename: file.filename,
      };
    });
    // 4. 添加 compilation 中，输出出去
    assets.forEach((asset) => {
      compilation.emitAsset(asset.filename, asset.source);
    });
    cb();
  }

  apply(compiler) {
    compiler.hooks.environment.tap(
      'UniUsingComponentsWebpackPlugin',
      async () => {
        try {
          const context = compiler.options.context; // process.cwd()
          const pagesJsonPath = path.resolve(context, './src/pages.json');

          // const usingComponents = {};
          const results = await Promise.all(
            this.options.patterns.map(async (pattern) => {
              const usingComponents = {};
              const nodeModulesPath = path.resolve(
                context,
                `node_modules/${pattern.name}/package.json`
              );
              if (fs.pathExists(nodeModulesPath)) {
                const nodeModulesJson = JSON.parse(
                  (await fs.readFileSync(nodeModulesPath)) || {}
                );
                let libPath;
                if (nodeModulesJson.miniprogram) {
                  libPath = `node_modules/${pattern.name}/${nodeModulesJson.miniprogram}`;
                } else {
                  libPath = `node_modules/${pattern.name}/${nodeModulesJson.files[0]}`;
                }
                const paths = await globby([libPath], {});
                paths.forEach((file) => {
                  if (path.extname(file) === '.json') {
                    // 是小程序组件
                    const fileSplistChunk = file.split('/');
                    const comName = fileSplistChunk[fileSplistChunk.length - 2];
                    const useValue = `/wxcomponents/${pattern.name}/${comName}/index`;
                    const useKey = `${pattern.useNamePreFix}-${comName}`;
                    usingComponents[useKey] = useValue;
                  }
                });
              }
              return {
                usingComponents,
              };
            })
          );
          if (fs.pathExistsSync(pagesJsonPath)) {
            const pagesJson = JSON.parse(
              fs.readFileSync(pagesJsonPath, 'utf8')
            );
            results.forEach((item) => {
              Object.entries(item.usingComponents).forEach(
                ([useKey, useValue]) => {
                  pagesJson.globalStyle.usingComponents[useKey] = useValue;
                }
              );
            });
            fs.writeFileSync(
              pagesJsonPath,
              JSON.stringify(pagesJson, null, '\t')
            );
          }
        } catch (err) {
          // todo
        }
      }
    );

    compiler.hooks.thisCompilation.tap(
      'UniUsingComponentsWebpackPlugin',
      (compilation) => {
        // 添加资源 hooks
        compilation.hooks.additionalAssets.tapAsync(
          'UniUsingComponentsWebpackPlugin',
          async (cb) => {
            if (this.options.name === 'vant') {
              this.processGenerateVant(compilation, cb);
            } else {
              cb();
            }
          }
        );
      }
    );
  }
}

module.exports = UniUsingComponentsWebpackPlugin;
