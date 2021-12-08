### uni-using-components-webpack-plugin

配合 UniApp，用于集成小程序原生组件，解决两个问题：

-   配置第三方库后可以自动引入其下的原生组件，而无需手动配置
-   生产构建时可以自动剔除没有使用到的原生组件

### 使用

安装

```javascript
npm install uni-using-components-webpack-plugin --save-dev
```

然后将插件添加到 WebPack Config 中。例如：

```javascript
const UniUsingComponentsWebpackPlugin = require('uni-using-components-webpack-plugin')

module.exports = {
    plugins: [
        new UniUsingComponentsWebpackPlugin({
            patterns: [
                {
                    prefix: 'van',
                    module: '@vant/weapp',
                },
                {
                    prefix: 'i',
                    module: 'iview-weapp',
                },
            ],
        }),
    ],
}
```

> **注意：uni-using-components-webpack-plugin 只适用在 UniApp 开发的小程序。**

### 参数

| Name     | Type            | **Description** |
| -------- | --------------- | --------------- |
| patterns | {Array<Object>} | 为插件指定相关  |

#### Patterns

| module | prefix   |
| ------ | -------- |
| 模块名 | 组件前缀 |

**module** 是指 `package.json` 里面的 `name`，如使用是 Vant 对应的 `module` 为`@vant/weapp`，如果使用是 iview，刚对应的 `module` 为 `iview-weapp`，具体可看它们各自的 `package.json`。

**prefix** 是指组件的前缀，如 Vant 使用是 `van` 开头的前缀，iview 使用是 `i` 开头的前缀，具体可看它们各自的官方文档。


### 背景介绍

#### 第一个痛点

用 uniapp开发小程序的小伙伴应该知道，我们在 uniapp 中要使用第三方 UI 库(`vant-weapp`，`iView-weapp`)的时候 ，想要在全局中使用，需要在 `src/pages.json` 中的 `usingComponents` 添加对应的组件声明，如：

```javascript
// src/pages.json
"usingComponents": {
    "van-button": "/wxcomponents/@vant/weapp/button/index",
  }
```

但在开发过程中，我们不太清楚需要哪些组件，所以我们可能会全部声明一遍（PS:这在做公共库的时候更常见)，所以我们得一个个的写，做为程序员，我们绝不允许使用这种笨方法。**这是第一个痛点**。

#### 第二个痛点

使用第三方组件，除了在 `src/pages.json` 还需要在对应的生产目录下建立 `wxcomponents`，并将第三方的库拷贝至该文件下，这个是 uniapp 自定义的，详细就见：https://uniapp.dcloud.io/frame?id=%e7%9b%ae%e5%bd%95%e7%bb%93%e6%9e%84。

**这是第二个痛点**。

#### 第三个痛点

第二痛点，我们将整个UI库拷贝至 `wxcomponents`，但最终发布的时候，我们不太可能全都用到了里面的全局组件，所以就将不必要的组件也发布上去，增加代码的体积。

有的小伙伴就会想到，那你将第三方的库拷贝至 `wxcomponents`时候，可以只拷使用到的就行啦。是这理没错，但组件里面可能还会使用到其它组件，我们还得一个个去看，然后一个个引入，这又回到了**第一个痛点了**。

有了这三个痛点，必须得有个插件来做这些傻事，处理这三个痛点。于是就有  **UniUsingComponentsWebpackPlugin**  插件，这个webpack 插件主要解决下面几个问题：

* 配置第三方库后可以自动引入其下的原生组件，而无需手动配置
* 生产构建时可以自动剔除没有使用到的原生组件 


## License

[MIT](http://opensource.org/licenses/MIT)
