# CHANGELOG

* v0.0.6 2018-11-24

  * `_isAnySending` 添加 `excludeNoLoading` 参数, 用于排除队列中没有开启 loading 的请求, 即 `_showLoading` 参数为 false 的请求, 这样才能确保没有开启 loading 的请求在发送时, 其他请求能够顺利的关掉他们开启的 loading
    
    > * 例如这样的场景: 前面有三个请求在发送, 他们都开启了 loading, 接下来第四个请求是关闭 loading 发送的.
    > * 因为我们关闭 loading 的方法是**判断当所有请求都发送完毕时才会关闭 loading**, 这么判断的原因是微信小程序提供的 loading 是单例的(只能开启单个), 而非一个请求对应一个 loading 实例, 无法做到请求一对一的开启和关闭 loading
    > * 如果此时还有请求在队列中未发送完毕, 就不会关闭 loading
    > * 因此当我们前三个请求都发送完毕后, loading 还会存在, 因为第四个请求还在队列中
    > * 那么其实我们只需要在判断是否还有请求在队列中的时候排除掉那些没有开启 loading 的请求
    > * 即可让那些开启了 loading 的请求顺利的关掉由他们开启的 loading

* v0.0.5 2018-11-22

  * 实现接口错误码规范
    * **删除了 `WeappBackendApi.defaults.REQUEST_HTTP_FAIL_STATUS` 属性**
    * **调整 `WeappBackendApi.defaults.REQUEST_API_FAIL_STATUS` 的值为 `20000 -> 1`**
  * 标准化接口返回的数据格式, 方便适配各种接口返回数据格式不同的情况
    * `normalizeRequestResult` 适配接口数据的默认方法
    * `options._normalizeRequestResult` 适配单个接口返回的数据以符合[标准的接口数据格式](https://github.com/f2e-journey/treasure/blob/master/api.md#%E6%8E%A5%E5%8F%A3%E8%BF%94%E5%9B%9E%E7%9A%84%E6%95%B0%E6%8D%AE%E7%BB%93%E6%9E%84)

* v0.0.4 2018-9-26

  * 提取 `getFailTipMessage` 用于自定义获取给用户的错误提示

* v0.0.3 2018-9-25

  * 支持日志级别参数, 用于在调试阶段输出每个请求的信息
  * 实现请求的队列
  * **去掉了 loading 提示时的 mask**, 以免造成用户操作不便, 可以通过 `_showLoadingMask` 来控制是否开启
  * 实现自定义请求参数(`_showFailTip`), 用于设置接口调用出错时是否给用户提示错误消息, 可以通过 `_showFailTipDuration` 来控制显示多长时间(ms)
  * 实现自定义请求参数(`_showLoading`), 用于设置调用接口时是否显示正在加载中的提示
  * 实现拦截重复请求的功能, 默认允许发送重复的请求, 可以通过 `_interceptDuplicateRequest` 来控制是否拦截重复请求
  * 实现自定义请求参数(`_cacheTtl`), 用于缓存接口返回的数据

* v0.0.2 2018-6-2

  抽取出 `commonFailTip` 方法用于接口出错时统一弹出错误提示信息

* v0.0.1 2018-2-27

  初始版本, 实现了基本功能