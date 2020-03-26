/*
 * Copyright 2020 Allanic.me ISC License License
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 * Created by Maxime Allanic <maxime@allanic.me> at 26/03/2020
 */

const Proxify = require('proxify');
const $serializer = require('serializer');
const $util = require('./util');
const $lodash = require('lodash');

module.exports = class Session {
    constructor (socket) {
        var self = this;
        this._socket = socket;
        this._onNewObject = [];
        this._socket.on('new-object', (response) => {
            var unserialized = $serializer.unserialize(response.value, self._onMethodCall(response.id));
            var dataProxified = new Proxify(unserialized);

            self._catchEventProxifiedObject(response.id, dataProxified);

            $lodash.over(self._onNewObject)(dataProxified);
        });
    }

    newObject(data) {
        var dataProxified = new Proxify(data || {});
        var id = $util.uuidv4();
        this._catchEventProxifiedObject(id, dataProxified);
        var arg = {
            id: id,
            date: new Date(),
            value: $serializer.serialize(dataProxified)
        };
        this._socket.emit('new-object', arg);
        return dataProxified;
    }

    onNewObject(callback) {
        this._onNewObject.push(callback);
    }

    _onMethodCall(id, parentKey) {
        const self = this;
        return (key, ...args) => {

            if (parentKey)
                key = parentKey + '.' + key;

            var responseId = id + ':' + $util.uuidv4();
            var responsePromise = new Promise((resolve, reject) => {
                self._socket.once(responseId, (response) => {
                    if (response.status === 'success')
                        resolve($serializer.unserialize(response.value));
                    else
                        reject($serializer.unserialize(response.value));
                });
            })
            self._socket.emit(id, {
                type: 'call',
                key: key,
                responseId: responseId,
                value: $serializer.serialize(args),
                date: new Date()
            });
            return responsePromise;
        };
    }

    _catchEventProxifiedObject(id, dataProxified) {
        var self = this;
        self._socket.on(id, (response) => {
            if (response.type === 'set') {
                dataProxified.$setWithoutDispatch(response.key, $serializer.unserialize(response.value, self._onMethodCall(response.id, response.key)));
            }
            else if (response.type === 'call') {
                var m = $lodash.get(dataProxified, response.key);
                if (!$lodash.isFunction(m)) {
                    throw new Error(`${ response.key } is not a function`);
                }

                var args = $serializer.unserialize(response.value, (key) => {
                    //console.log('un', key);
                });

                var promise;
                try {
                    promise = Promise.resolve(m(...args));
                } catch (e) {
                    promise = Promise.reject(e);
                }

                promise
                    .then((success) => {
                        self._socket.emit(response.responseId, {
                            status: 'success',
                            date: new Date(),
                            value: $serializer.serialize(success)
                        });
                    }, (error) => {
                        self._socket.emit(response.responseId, {
                            status: 'error',
                            date: new Date(),
                            value: $serializer.serialize(error)
                        });
                    });
            }
        });

        dataProxified.$onSet((key, value) => {
            self._socket.emit(id, {
                type: 'set',
                key,
                date: new Date(),
                value: $serializer.serialize(value)
            });
        });
    }
}