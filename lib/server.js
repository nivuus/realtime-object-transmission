/*
 * Copyright 2020 Allanic.me ISC License License
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 * Created by Maxime Allanic <maxime@allanic.me> at 26/03/2020
 */

const $socket = require('socket.io');
const $lodash = require('lodash');
const Session = require('./session');

module.exports = class Server {
    constructor (app) {
        this._io = $socket(app);
        this._sockets = [];
    }

    onConnection(callback) {
        var self = this;
        this._io.on('connection', (socket) => {
            self._sockets.push(socket);
            socket.on('disconnect', () => {
                $lodash.remove(self._sockets, socket);
            });
            var session = new Session(socket);
            callback(session);
        });
    }

    close() {
        $lodash.forEach(this._sockets, (socket) => socket.disconnect(true));
        this._io.close();
    }
};