/*
 * Copyright 2020 Allanic.me ISC License License
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 * Created by Maxime Allanic <maxime@allanic.me> at 26/03/2020
 */

const Session = require('./session');

module.exports = class Client {
    constructor (socket) {
        this._socket = socket;
        socket.on('error', console.error);
    }

    connect(callback) {
        var self = this;
        this._socket.on('connect', () => {
            var session = new Session(self._socket);
            callback(session);
        });
        this._socket.connect();
    }

    disconnect() {
        this._socket.removeAllListeners();
        this._socket.disconnect(true);
    }
};