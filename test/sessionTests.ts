import 'mocha';
import { assert, should, expect } from 'chai';
import { StompFrame, StompEventEmitter, StompError } from '../src/model';
import { StompFrameLayer } from '../src/frame';
import { StompServerSessionLayer } from '../src/session';
import {
    StompClientCommandListener, StompProtocolHandlerV10, StompProtocolHandlerV11,
    StompProtocolHandlerV12
} from '../src/protocol'
import { check, countdownLatch } from './helpers';

describe('STOMP Server Session Layer', () => {
    let frameLayer: StompFrameLayer;
    let sessionLayer: StompServerSessionLayer;
    let clientListener: StompClientCommandListener;


    beforeEach(() => {
        frameLayer = <StompFrameLayer>{
            emitter: new StompEventEmitter(),
            close: async () => { }
        };
        clientListener = <StompClientCommandListener>{
        };
        sessionLayer = new StompServerSessionLayer(frameLayer, clientListener);
    });

    it(`should handle valid CONNECT frame`, (done) => {
        const testHeaders = { login: 'user', passcode: 'pass' };
        clientListener.connect = async (headers) => {
            check(() => assert.deepEqual(testHeaders, headers), done);
        };
        frameLayer.emitter.emit('frame', new StompFrame('CONNECT', testHeaders));
    });

    it(`should use protocol v.1.0`, (done) => {
        const testHeaders = { login: 'user', passcode: 'pass', 'accept-version': '1.0' };
        clientListener.connect = async (headers) => {
            check(() => assert.equal((<any>sessionLayer).protocol, StompProtocolHandlerV10), done);
        };
        frameLayer.emitter.emit('frame', new StompFrame('CONNECT', testHeaders));
    });

    it(`should switch to protocol v.1.1`, (done) => {
        const testHeaders = { login: 'user', passcode: 'pass', 'accept-version': '1.1' };
        clientListener.connect = async (headers) => {
            check(() => assert.equal((<any>sessionLayer).protocol, StompProtocolHandlerV11), done);
        };
        frameLayer.emitter.emit('frame', new StompFrame('CONNECT', testHeaders));
    });

    it(`should switch to protocol v.1.2`, (done) => {
        const testHeaders = { login: 'user', passcode: 'pass', 'accept-version': '1.2' };
        clientListener.connect = async (headers) => {
            check(() => assert.equal((<any>sessionLayer).protocol, StompProtocolHandlerV12), done);
        };
        frameLayer.emitter.emit('frame', new StompFrame('CONNECT', testHeaders));
    });

    it(`should send ERROR for unhandled protocol version`, (done) => {
        const testHeaders = { login: 'user', passcode: 'pass', 'accept-version': '2.1,2.2' };
        frameLayer.send = async (frame) => {
            check(() => expect(frame)
                .to.deep.include({ command: 'ERROR', headers: { message: 'Supported protocol versions are: 1.0, 1.1, 1.2' } }), done);
        };
        frameLayer.emitter.emit('frame', new StompFrame('CONNECT', testHeaders));
    });

    it(`should send ERROR for invalid command`, (done) => {
        frameLayer.send = async (frame) => {
            check(() => expect(frame)
                .to.deep.include({ command: 'ERROR', headers: { message: 'No such command' } }), done);
        };
        frameLayer.emitter.emit('frame', new StompFrame('INVALID_CMD', {}, 'test'));
    });

    it(`should send ERROR if did not received CONNECT yet`, (done) => {
        const testFrame = new StompFrame('SEND', { destination: '/queue/test' }, 'test message');
        let latch = countdownLatch(2, done);
        frameLayer.close = async () => latch();
        frameLayer.send = async (frame) => {
            check(() => expect(frame)
                .to.deep.include({ command: 'ERROR', headers: { message: 'You must first issue a CONNECT command' } }), latch);
        };
        frameLayer.emitter.emit('frame', testFrame);
    });

    it(`should send ERROR when catching exceptions from listener`, (done) => {
        clientListener.connect = async (headers) => {
            throw new Error('login error');
        };
        frameLayer.send = async (frame) => {
            check(() => expect(frame)
                .to.deep.include({ command: 'ERROR', headers: { message: 'login error' } }), done);
        };
        frameLayer.emitter.emit('frame', new StompFrame('CONNECT', {}));
    });

    it(`should send ERROR for invalid frame`, (done) => {
        sessionLayer.data.authenticated = true;
        frameLayer.send = async (frame) => {
            check(() => expect(frame)
                .to.deep.include({ command: 'ERROR', headers: { 'message': `Header 'destination' is required for SEND` } }), done);
        };
        frameLayer.emitter.emit('frame', new StompFrame('SEND', {}, 'test message'));
    });

    it(`should send ERROR with receipt when catching exceptions from listener`, (done) => {
        sessionLayer.data.authenticated = true;
        clientListener.send = async (headers) => {
            throw new Error('error');
        };
        frameLayer.send = async (frame) => {
            check(() => expect(frame)
                .to.deep.include({ command: 'ERROR', headers: { 'receipt-id': '123', message: 'error' } }), done);
        };
        frameLayer.emitter.emit('frame', new StompFrame('SEND', { destination: '/queue/test', 'receipt': '123' }, 'test message'));
    });

    it(`should send receipt-id when incoming message includes recepit header`, (done) => {
        sessionLayer.data.authenticated = true;
        clientListener.send = async (headers) => {
        };
        frameLayer.send = async (frame) => {
            check(() => expect(frame)
                .to.deep.include({ command: 'RECEIPT', headers: { 'receipt-id': '123' } }), done);
        };
        frameLayer.emitter.emit('frame', new StompFrame('SEND', { destination: '/queue/test', 'receipt': '123' }, 'test message'));
    });



});