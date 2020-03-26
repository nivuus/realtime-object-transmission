/*
 * Copyright 2020 Allanic.me ISC License License
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 * Created by Maxime Allanic <maxime@allanic.me> at 25/03/2020
 */

const $realtimeObjectTransmission = require('../');
const $socketClient = require('socket.io-client');
const $assert = require('assert');
const $fs = require('fs');
const $crypto = require('crypto');

describe('RealtimeObjectTransmission', () => {
    var app, server, client;

    beforeEach(() => {
        app = require('http').createServer();
        server = new $realtimeObjectTransmission.Server(app);
        app.listen(80);
        client = new $realtimeObjectTransmission.Client($socketClient('http://localhost'));
    });

    afterEach(() => {
        client.disconnect();
        server.close();
        app.close();
    });

    it('should transfer data', (done) => {
        server.onConnection(function (session) {
            var t = session.newObject();
            t.$watch('t', (value) => {
                $assert.equal(value, 'test');
                done();
            });
        });


        client.connect((session) => {
            session.onNewObject((o) => {
                o.t = 'test';
            });
        });
    });

    it('should call method', (done) => {
        server.onConnection(function (session) {
            var t = session.newObject({
                o: function (value) {
                    $assert.equal(value, 'test');
                    done();
                }
            });
        });

        client.connect((session) => {
            session.onNewObject((o) => {
                o.o('test');
            });
        });

    });

    it('should response method', (done) => {
        server.onConnection(function (session) {
            var t = session.newObject({
                o: function (value) {
                    return 'test2';
                }
            });
        });

        client.connect((session) => {
            session.onNewObject((o) => {
                o.o('test')
                    .then((value) => {
                        $assert.equal(value, 'test2');
                        done();
                    });
            });
        });
    });

    it('should throw response method', (done) => {
        server.onConnection(function (session) {
            var t = session.newObject({
                o: function (value) {
                    throw new Error('test');
                }
            });
        });

        client.connect((session) => {
            session.onNewObject((o) => {
                o.o('test')
                    .catch((value) => {
                        $assert.equal(value, 'Error: test');
                        done();
                    });
            });
        });
    });
});