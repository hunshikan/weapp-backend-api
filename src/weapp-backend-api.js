import extend from 'extend';
import md5 from 'blueimp-md5';
import Logger from 'simple-console-log-level';

import SimpleStorage from 'weapp-simple-storage';

/**
 * 统一封装后端接口的调用
 * 
 * - 集中配置接口
 * - 统一发送请求
 * - 统一处理请求的返回
 * - 统一异常处理
 * - 预留扩展点
 * 
 * 此类是抽象类, 其他平台继承此类来实现具体发送请求的功能
 * 例如:
 * BackendApi -> WeappBackendApi(微信小程序平台的封装)
 *            -> Web$BackendApi(Web平台, 基于jQuery/Zepto的封装)
 */
class BackendApi {
    /**
     * @param {object} apiConfig 后端 HTTP 接口的配置, 将 HTTP 接口的调用视为一次远程调用(RPC)
     *        配置项是接口名称和请求参数的映射
     *        例如
     *        {
     *            'getList': {
     *                method: 'GET',
     *                url: 'https://domain.com/list'
     *            },
     *            'getDetail': {
     *                method: 'GET',
     *                url: 'https://domain.com/detail'
     *            }
     *        }
     * @param {object} defaultRequestOptions 默认的请求参数
     * @param {number} loggerLevel 日志级别, 默认为 Logger.LEVEL_WARN 级别
     *                 TODO: 如果微信小程序支持获取当前运行的版本(开发版/体验版/线上版),
     *                 那么日志级别的默认值可以根据运行的版本来判断, 非线上版本自动为 TRACE 级别
     */
    constructor(apiConfig = {}, defaultRequestOptions = {}, loggerLevel = Logger.LEVEL_WARN) {
        this.apiConfig = apiConfig;
        this.defaultRequestOptions = defaultRequestOptions;
        // 正在发送的请求
        this.sending = {};

        this.logger = new Logger({
            level: loggerLevel,
            prefix: '[backend-api]'
        });
    }

    /**
     * 发送请求前的统一处理
     * 
     * @abstract
     * @param {object} requestOptions
     * @return {undefined|Promise}
     */
    beforeSend(requestOptions) {}
    /**
     * 请求结束后的统一处理
     * 
     * @abstract
     * @param {object} requestOptions
     * @param {object} requestResult
     */
    afterSend(requestOptions, requestResult) {}
    
    /**
     * 统一发送(接口)请求的方法
     * 
     * @param {string} name 接口的名称
     * @param {object} options 请求参数
     * @return {Promise}
     */
    sendRequest(name, options) {
        var requestOptions = this._getRequestOptions(name, options);
        return this.$sendHttpRequest(requestOptions);
    }

    /**
     * 发送 HTTP 请求的具体实现
     * 
     * @abstract
     * @param {object} requestOptions 请求参数
     * @return {Promise}
     */
    $sendHttpRequest(requestOptions) {
        // 子类具体去实现
        return new Promise(function(resolve, reject) {
            reject('需要子类去实现发送 HTTP 请求');
        });
    }

    /**
     * 获取请求的参数
     * 
     * @param {string} name 接口的名称, 既配置在 `apiConfig` 中的 key
     *                      针对接口 URL 中有 path 参数的情况, 需要在 name 中加入斜杠来标识,
     *                      如果不使用这个参数, 也可以发请求, 但不推荐这么使用, 应该将所有接口都配置好
     * @param {object} options 请求参数
     * @return {object}
     */
    _getRequestOptions(name, options = {}) {
        var api;

        if (name) {
            var _name = name;
            var urlAppend = '';

            // 针对接口 URL 中有 path 参数的情况, 例如: //domain.com/user/123
            // 需要在 name 中加入斜杠来标识, 例如: getUser/123
            // 配置映射的 URL 为: //domain.com/user, 会动态的将 name 后面的 path 参数拼接到此 URL 中
            // TODO 考虑支持这种格式: //domain.com/user/:userId/room/:roomId
            var slashIndex = name.indexOf('/');
            if (slashIndex != -1) {
                _name = name.substring(0, slashIndex);
                urlAppend = name.substring(slashIndex);
            }

            var _api = this.apiConfig[_name];
            if (_api) {
                api = extend(true, {}, _api);
                api.url = api.url + urlAppend;
            } else {
                this.logger.warn('没有找到对应的接口配置', _name, this.apiConfig);
            }
        } else {
            this.logger.warn('没有配置接口', options);
        }

        return extend(true, {}, this.defaultRequestOptions, api, options);
    }
}

/**
 * 统一封装微信小程序平台后端接口的调用
 * 
 * @example
 * import BackendApi from 'weapp-backend-api';
 * 
 * var backendApi = new BackendApi({
 *     'getList': {
 *         method: 'GET',
 *         url: 'https://domain.com/list'
 *     }
 * });
 * backendApi.sendRequest('getList').then(function([data]) {
 *     console.log(data);
 * }, function(requestResult) {
 *     console.log(requestResult);
 * });
 */
class WeappBackendApi extends BackendApi {
    constructor(apiConfig, defaultRequestOptions = WeappBackendApi.defaults.requestOptions, loggerLevel) {
        super(apiConfig, defaultRequestOptions, loggerLevel);

        this.simpleStorage = new SimpleStorage({
            name: 'backend-api-cache',
            loggerLevel: loggerLevel
        });
    }

    /**
     * 内置如下功能
     * - 拦截重复请求, 不发送请求
     * - 获取接口缓存数据的机制, 存在缓存数据则直接读取缓存数据, 不发送请求
     * - 显示 loading 提示
     * 
     * @override
     * @return {undefined|Promise} 如果返回 Promise 则不会去发送请求
     */
    beforeSend(requestOptions) {
        var cachedRequestResult = this.simpleStorage.get(this._getRequestInfoHash(requestOptions));

        if (this._isSending(requestOptions) && requestOptions._interceptDuplicateRequest) {
            return this._interceptDuplicateRequest(requestOptions);
        } else if (cachedRequestResult) {
            return Promise.resolve(cachedRequestResult);
        } else { // 前面的请求可能没有开启 loading, 因此不能判断 !this._isAnySending()
            this._showLoading(requestOptions);
        }
    }

    /**
     * 拦截重复请求
     * 
     * @param {object} requestOptions
     * @return {Promise}
     */
    _interceptDuplicateRequest(requestOptions) {
        var requestInfoHash = this._getRequestInfoHash(requestOptions);

        this.logger.warn('拦截到重复请求', requestInfoHash, this.sending[requestInfoHash], this.sending);
        this.logger.warn('----------------------');

        // 返回一个 pending 状态的 Promise, 阻止发送请求且不会触发任何回调
        return new Promise(function() {});
    }

    /**
     * 内置如下功能
     * - 关闭 loading 提示
     * 
     * @override
     */
    afterSend(requestOptions, requestResult) {
        this._removeFromSending(requestOptions);

        if (!this._isAnySending()) {
            this._hideLoading(requestOptions);
        }
    }

    _showLoading(requestOptions) {
        if (requestOptions._showLoading !== false) {
            wx.showLoading({
                icon: 'loading',
                title: WeappBackendApi.defaults.LOADING_MESSAGE,
                mask: requestOptions._showLoadingMask
            });
        }
        // 即使设置为不显示 loading 提示, 但顶部的 loading 提示还是要给出的,
        // 因为发送了请求出去, 总要给予一定的反馈信息(例如移动网络有数据交互时的提示)
        wx.showNavigationBarLoading();
    }

    _hideLoading(requestOptions) {
        wx.hideLoading();
        wx.hideNavigationBarLoading();
    }

    /**
     * 发送 HTTP 请求
     * 
     * @override
     * @param {object} requestOptions wx.requesst options
     *                 requestOptions._showLoading {boolean} 是否显示 loading 提示
     *                 requestOptions._showLoadingMask {boolean} 是否显示 loading 提示的 mask
     *                 requestOptions._interceptDuplicateRequest {boolean} 是否拦截重复请求
     *                 requestOptions._showFailTip {boolean} 接口调用出错时是否给用户提示错误消息
     *                 requestOptions._showFailTipDuration {number} 接口调用出错时错误信息的显示多长时间(ms)
     *                 requestOptions._cacheTtl {number} 缓存的存活时间(ms)
     */
    $sendHttpRequest(requestOptions) {
        // 因为调用过 wx.request(requestOptions) 之后, 请求的 URL 会被微信小程序的 API 改写,
        // 即 requestOptions.url 参数会被改写,
        // 例如原来的 URL 是: https://domian.com/a  data 是 {a:1}
        // 那么 data 会被追加到 URL 上, 变成: https://domian.com/a?a=1
        // 由于我们计算同一个请求的签名是根据 URL 来的, 如果前后 URL 不一致, 就会造成无法辨别出重复请求
        // 因此这里我们需要保存原始的 URL 参数
        requestOptions._url = requestOptions.url;

        var promise = null;
        var beforeSendResult = this.beforeSend(requestOptions);
        if (beforeSendResult) {
            promise = beforeSendResult;
        } else {
            promise = new Promise((resolve, reject) => {
                // 收到开发者服务器成功返回的回调函数
                // 注意: 收到开发者服务器返回就会回调这个函数, 不管 HTTP 状态是否为 200 也算请求成功
                // requestResult 包含的属性有: statusCode, header, data, errMsg
                requestOptions.success = function(requestResult) {
                    // Determine if HTTP request successful | jQuery
                    var isSuccess = requestResult.statusCode >= 200 && requestResult.statusCode < 300 || requestResult.statusCode === 304;

                    if (isSuccess) {
                        resolve(requestResult);
                    } else { // HTTP 请求失败
                        reject(requestResult);
                    }
                };
                // 接口调用失败的回调函数
                // 这个指 wx.request API 调用失败的情况,
                // 例如没有传 url 参数或者传入的 url 格式错误之类的错误情况
                // 这时不会有 statusCode 字段, 会有 errMsg 字段
                requestOptions.fail = function(requestResult) {
                    reject(requestResult);
                };

                wx.request(requestOptions);
                this._addToSending(requestOptions);
            });
        }

        return promise.then((requestResult) => {
            // 请求结束后的统一处理如果放在 complete 回调中就不方便实现重写请求返回的数据
            // 例如接口返回的数据是加密的, 需要统一在 afterSend 中封装解密的逻辑, 改写请求返回的数据,
            // 做到上层对数据的解密无感知
            this.afterSend(requestOptions, requestResult);
            return this._successHandler(requestOptions, requestResult);
        }, (requestResult) => {
            this.afterSend(requestOptions, requestResult);
            return this._failHandler(requestOptions, requestResult);
        });
    }

    /**
     * 获取一个请求的关键信息
     * 
     * - method
     * - url
     * - data
     * 
     * @param {object} requestOptions 
     * @return {string} 请求关键信息组合的 MD5 值
     */
    _getRequestInfoHash(requestOptions) {
        var data = '';
        if (requestOptions.data) {
            try {
                data = JSON.stringify(requestOptions.data);
            } catch (error) {
                data = requestOptions.data.toString();
                this.logger.warn('获取一个请求数据的 JSON 字符串失败', requestOptions.data, error);
            }
        }

        var requestInfo = requestOptions.method + ' ' + requestOptions._url + ' ' + data;

        var requestInfoHash = requestInfo;
        try {
            requestInfoHash = md5(requestInfo);
        } catch (error) {
            this.logger.warn('获取一个请求的关键信息的 MD5 失败', requestInfo, error);
        }

        return requestInfoHash;
    }

    /**
     * 将请求放入到发送中的队列中
     * 
     * @param {object} requestOptions 
     */
    _addToSending(requestOptions) {
        this.sending[this._getRequestInfoHash(requestOptions)] = requestOptions;
    }
    /**
     * 将请求从发送中的队列中移除出来
     * 
     * @param {object} requestOptions 
     */
    _removeFromSending(requestOptions) {
        var requestInfoHash = this._getRequestInfoHash(requestOptions);
        var result = delete this.sending[requestInfoHash];
        if (!result) {
            this.logger.warn('将请求从发送中的队列中移除失败', requestInfoHash, requestOptions);
        }
    }
    /**
     * 某个请求是否正在发送中
     * 
     * @param {object} requestOptions
     * @return {boolean}
     */
    _isSending(requestOptions) {
        return this.sending.hasOwnProperty(this._getRequestInfoHash(requestOptions));
    }
    /**
     * 是不是有正在发送中的请求
     * 
     * @return {boolean}
     */
    _isAnySending() {
        return Object.keys(this.sending).length !== 0;
    }

    /**
     * 接口调用成功时的默认处理方法
     * 
     * @param {object} requestOptions wx.request options
     * @param {object} requestResult wx.request success 返回的结果
     * @return {object|Promise}
     */
    _successHandler(requestOptions, requestResult) {
        if (this.ifApiSuccess(requestOptions, requestResult)) {
            this.logger.log(requestOptions.method, requestOptions.url, requestOptions.data, requestOptions, requestResult);
            this.logger.log('----------------------');

            var requestInfoHash = this._getRequestInfoHash(requestOptions);
            if (requestOptions._cacheTtl >= 0) {
                if (!this.simpleStorage.has(requestInfoHash)) {
                    this.simpleStorage.set(requestInfoHash, requestResult, {
                        ttl: requestOptions._cacheTtl
                    });
                }
            }

            return [this.getRequestResult(requestOptions, requestResult), requestResult];;
        } else { // 业务错误
            return this.commonFailStatusHandler(requestOptions, requestResult);
        }
    }

    /**
     * 接口调用失败时的默认处理方法
     * 
     * @param {object} requestOptions wx.request options
     * @param {object} requestResult wx.request success 或者 fail 返回的结果
     * @param {Promise}
     */
    _failHandler(requestOptions, requestResult) {
        var result = {};

        // 如果 wx.requet API 调用是成功的, 则一定会有 statusCode 字段
        if (typeof requestResult.statusCode != 'undefined') {
            result = {
                status: WeappBackendApi.defaults.REQUEST_HTTP_FAIL_STATUS,
                statusInfo: {
                    message: WeappBackendApi.defaults.REQUEST_HTTP_FAIL_MESSAGE,
                    detail: {
                        statusCode: requestResult.statusCode
                    }
                }
            };
        } else {
            result = {
                status: WeappBackendApi.defaults.REQUEST_API_FAIL_STATUS,
                statusInfo: {
                    message: WeappBackendApi.defaults.REQUEST_API_FAIL_MESSAGE,
                    detail: {
                        errMsg: requestResult.errMsg
                    }
                }
            };
        }

        requestResult.data = result;
        return this.commonFailStatusHandler(requestOptions, requestResult);
    }

    /**
     * 判断接口请求调用是否成功
     * 
     * @param {object} requestOptions wx.request options
     * @param {object} requestResult wx.request success 返回的结果
     * @return {boolean}
     */
    ifApiSuccess(requestOptions, requestResult) {
        // 接口返回的数据
        var result = requestResult.data;
        return !result.status || result.status === 0;
    }

    /**
     * 提取出接口返回的数据
     * 
     * @param {object} requestOptions wx.request options
     * @param {object} requestResult wx.request success 返回的结果
     * @return {object}
     */
    getRequestResult(requestOptions, requestResult) {
        // 接口返回的数据
        var result = requestResult.data;
        return result.data;
    }

    /**
     * 接口出错时统一弹出错误提示信息
     * 
     * 例如: 提供给用户看的消息格式参考 QQ 的错误提示消息
     * 提示消息
     * (错误码:result.statusInfo.message)灰色字
     * 
     * @param {object} requestOptions wx.request options
     * @param {object} requestResult wx.request success 或者 fail 返回的结果
     */
    commonFailTip(requestOptions, requestResult) {
        var result = requestResult.data;
        var message = result.statusInfo ? result.statusInfo.message : WeappBackendApi.defaults.FAIL_MESSAGE;
        if (result.status) {
            message = message + '\n' + '(错误码:' + result.status + ')';
        }

        // 在一些场景下需要, 例如提示用户登录的时候, 不希望看见一个错误提示, 或者想自定义错误提示的时候
        if (requestOptions._showFailTip !== false) {
            // XXX 由于 wx.showLoading 底层就是调用的 showToast,
            // toast 实现是单例, 全局只有一个, 因此使用 showToast 会造成 loading 被关掉
            var toastOptions = {
                icon: 'none',
                title: message
            };
            if (typeof requestOptions._showFailTipDuration != 'undefined') {
                toastOptions.duration = requestOptions._showFailTipDuration;
            }
            wx.showToast(toastOptions);
        }
    }

    /**
     * 当接口处理失败时通用的错误状态处理
     * 
     * 例如:
     * - 接口出错时统一弹出错误提示信息
     * - 接口出错时根据 status 做通用的错误处理(例如用户 session 超时, 引到用户重新登录)
     * 
     * @param {object} requestOptions wx.request options
     * @param {object} requestResult wx.request success 或者 fail 返回的结果
     * @return {Promise}
     */
    commonFailStatusHandler(requestOptions, requestResult) {
        // 接口调用失败, 输出失败的日志信息, 需要包含如下重要信息
        // * HTTP method
        // * HTTP URL
        // * 接口的参数
        // * 接口的返回状态
        // * 接口的返回数据
        this.logger.warn('接口调用出错(' + requestResult.statusCode + ')', requestOptions.method, requestOptions.url, requestOptions.data, requestOptions, requestResult);
        this.logger.warn('----------------------');

        this.commonFailTip(requestOptions, requestResult);
        this.failStatusHandler(requestOptions, requestResult);
        return Promise.reject(requestResult);
    }

    /**
     * 对错误状态的处理
     * 
     * @abstract
     * @param {object} requestOptions wx.request options
     * @param {object} requestResult wx.request success 或者 fail 返回的结果
     */
    failStatusHandler(requestOptions, requestResult) {
        // 子类具体去实现
        // 例如
        // var result = requestResult.data;
        // if (result.status === WeappBackendApi.defaults.REQUEST_HTTP_FAIL_STATUS) {
        //     // XXX your code here
        // } else if (result.status == 401) {
        //     // XXX your code here
        // }
    }
}

WeappBackendApi.defaults = {
    LOADING_MESSAGE: '',

    FAIL_MESSAGE: '系统繁忙',

    // 接口请求失败(HTTP协议层面)时的状态码, 用于与业务状态码区分开
    REQUEST_HTTP_FAIL_STATUS: 10000,
    REQUEST_HTTP_FAIL_MESSAGE: '请求超时，请重试',

    // wx.request API 调用失败
    REQUEST_API_FAIL_STATUS: 20000,
    REQUEST_API_FAIL_MESSAGE: '请求失败，请重试',

    // 默认的请求参数
    requestOptions: {
        header: {
            'content-type': 'application/x-www-form-urlencoded'
        },
        dataType: 'json'
    }
};

export default WeappBackendApi;