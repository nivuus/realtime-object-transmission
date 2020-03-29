/*
 * Copyright 2020 Allanic.me ISC License License
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 * Created by Maxime Allanic <maxime@allanic.me> at 26/03/2020
 */

const Proxify = require('@nivuus/proxify');
const $serializer = require('@nivuus/serializer');
const $util = require('./util');



module.exports = class Session {
    constructor (socket) {
        var self = this;
        this._socket = socket;
        this._onNewObject = [];

        this._socket.on('error', console.error);

        this._defaultSerializerConfig = {
            constructors: {
                'Proxify': {
                    check: (value) => {
                        return Proxify.isProxy(value);
                    },
                    unserialize: async (unseralizedValue, response, config) => {
                        var proxifiedValue = new Proxify(unseralizedValue);
                        self._catchEventProxifiedObject(response.id, proxifiedValue);
                        return proxifiedValue;
                    },
                    serialize: async (value, serializeObject) => {
                        var id = $util.uuidv4();
                        return {
                            id: id,
                            type: 'object',
                            constructorName: 'Proxify',
                            value: await serializeObject(value, false)
                        };
                    }
                },
                'Function': {
                    serialize: async function (fn) {
                        var callerId = 'call:' + $util.uuidv4();
                        var result = {
                            type: 'function',
                            constructorName: 'Function',
                            callerId: callerId
                        };
                        self._socket.on(callerId, async (response) => {
                            args = await $serializer.unserialize(args, self._defaultSerializerConfig);

                            if (!typeof fn === 'function') {
                                throw new Error(`${ response.key } is not a function`);
                            }

                            var args = await $serializer.unserialize(response.value, self._defaultSerializerConfig);

                            var promise;
                            try {
                                promise = Promise.resolve(fn(...args));
                            } catch (e) {
                                promise = Promise.reject(e);
                            }

                            return promise
                                .then(async (success) => {
                                    self._socket.emit(response.responseId, {
                                        status: 'success',
                                        date: new Date(),
                                        value: await $serializer.serialize(success, self._defaultSerializerConfig)
                                    });
                                }, async (error) => {
                                    self._socket.emit(response.responseId, {
                                        status: 'error',
                                        date: new Date(),
                                        value: await $serializer.serialize(error, self._defaultSerializerConfig)
                                    });
                                });
                        });
                        return result;
                    },
                    unserialize: async (unseralized, response, config, parentKey) => {
                        return self._onMethodCall(response.callerId, parentKey);
                    }
                }
            }
        }
        this._socket.on('new-object', async (response) => {
            var unserialized = await $serializer.unserialize(response.value, self._defaultSerializerConfig);
            self._onNewObject.forEach((fn) => fn(unserialized));
        });
    }

    emit(name, ...params) {
        var self = this;
        return new Promise(async (resolve, reject) => {
            var responseId = name + ':' + $util.uuidv4();
            self._socket.once(responseId, async (response) => {
                if (response.status === 'success')
                    resolve(await $serializer.unserialize(response.value, self._defaultSerializerConfig));
                else
                    reject(await $serializer.unserialize(response.value, self._defaultSerializerConfig));
            });

            self._socket.emit(name, {
                responseId: responseId,
                value: await $serializer.serialize(params, self._defaultSerializerConfig)
            });
        });
    }

    on(name, callback) {
        var self = this;
        this._socket.on(name, async (response) => {
            var value = await $serializer.unserialize(response.value, self._defaultSerializerConfig);
            var promise;
            try {
                promise = Promise.resolve(callback(...value));
            } catch (e) {
                promise = Promise.reject(e);
            }

            promise
                .then(async (success) => {
                    var id = $util.uuidv4();
                    self._socket.emit(response.responseId, {
                        status: 'success',
                        date: new Date(),
                        id: id,
                        value: await $serializer.serialize(success, self._defaultSerializerConfig)
                    });
                }, async (error) => {
                    self._socket.emit(response.responseId, {
                        status: 'error',
                        date: new Date(),
                        value: await $serializer.serialize(error, self._defaultSerializerConfig)
                    });
                });
        });
    }

    async newObject(data) {
        var self = this;
        var dataProxified = new Proxify(data || {});
        var id = $util.uuidv4();
        var serialized = await $serializer.serialize(dataProxified, self._defaultSerializerConfig);
        var arg = {
            id: id,
            date: new Date(),
            value: serialized
        };

        self._catchEventProxifiedObject(serialized.id, dataProxified);
        this._socket.emit('new-object', arg);
        return dataProxified;
    }

    onNewObject(callback) {
        this._onNewObject.push(callback);
    }

    _onMethodCall(id, parentKey) {
        const self = this;
        var key = parentKey;
        return async (...args) => {

            var responseId = id + ':' + $util.uuidv4();
            var responsePromise = new Promise((resolve, reject) => {
                self._socket.once(responseId, async (response) => {
                    if (response.status === 'success')
                        resolve(await $serializer.unserialize(response.value, null, self._defaultSerializerConfig));
                    else
                        reject(await $serializer.unserialize(response.value, null, self._defaultSerializerConfig));
                });
            })

            self._socket.emit(id, {
                type: 'call',
                key: key,
                responseId: responseId,
                value: await $serializer.serialize(args, self._defaultSerializerConfig),
                date: new Date()
            });
            return responsePromise;
        };
    }

    _catchEventProxifiedObject(id, dataProxified) {
        var self = this;
        self._socket.on(id, async (response) => {
            if (response.type === 'set') {
                dataProxified.$setWithoutDispatch(response.key, await $serializer.unserialize(response.value, self._defaultSerializerConfig));
            }
            else if (response.type === 'call') {
                var m;
                eval(`m = dataProxified.${ response.key }`);
                if (!$lodash.isFunction(m)) {
                    throw new Error(`${ response.key } is not a function`);
                }

                var args = await $serializer.unserialize(response.value, self._defaultSerializerConfig);

                var promise;
                try {
                    promise = Promise.resolve(m(...args));
                } catch (e) {
                    promise = Promise.reject(e);
                }

                return promise
                    .then(async (success) => {
                        self._socket.emit(response.responseId, {
                            status: 'success',
                            date: new Date(),
                            value: await $serializer.serialize(success, self._defaultSerializerConfig)
                        });
                    }, async (error) => {
                        self._socket.emit(response.responseId, {
                            status: 'error',
                            date: new Date(),
                            value: await $serializer.serialize(error, self._defaultSerializerConfig)
                        });
                    });
            }
        });

        dataProxified.$onSet(async (key, value) => {
            self._socket.emit(id, {
                type: 'set',
                key,
                date: new Date(),
                value: await $serializer.serialize(value, self._defaultSerializerConfig)
            });
        });
    }
}