/**
 * Kettle Request for use with WebSockets
 *
 * Copyright 2012-2013 OCAD University
 * Copyright 2015 Raising the Floor (International)
 *
 * Licensed under the New BSD license. You may not use this file except in
 * compliance with this License.
 *
 * You may obtain a copy of the License at
 * https://github.com/fluid-project/kettle/blob/master/LICENSE.txt
 */

"use strict";

var fluid = require("infusion"),
    kettle = fluid.registerNamespace("kettle");

/**
 * WebSockets refinement of request object.
 */
fluid.defaults("kettle.request.ws", {
    gradeNames: ["kettle.request"],
    members: {
//      ws: null // arrives on the onBindWs event after connection
    },
    events: {
        onBindWs: null,
        onReceiveMessage: null,
        onSendMessage: null
    },
    receiveMessageJSON: true, // deserialize all received data as JSON
    sendMessageJSON: true, // serialize all sent data as JSON
    listeners: {
        "onBindWs.ensureResponseDisposes": {
            funcName: "kettle.request.ws.ensureResponseDisposes",
            priority: "before:handleRequest"
        },
        "onBindWs.listen": {
            funcName: "kettle.request.ws.listen",
            priority: "after:ensureResponseDisposes"
        },
        "onSendMessage.encode": {
            funcName: "kettle.request.ws.sendEncode",
            args: ["{that}", "{that}.options.sendMessageJSON", "{arguments}.0"],
            priority: "before:send"
        },
        "onSendMessage.send": {
            funcName: "kettle.request.ws.sendMessageImpl",
            args: ["{that}", "{arguments}.0"]
        }
    },
    invokers: {
        sendMessage: {
            funcName: "kettle.request.ws.sendMessage",
            args: ["{that}", "{arguments}.0"] // message
        },
        sendTypedMessage: {
            funcName: "kettle.request.ws.sendTypedMessage",
            args: ["{that}", "{arguments}.0", "{arguments}.1"] // type, payload
        },
        handleRequest: "{request}.handlerPromise.resolve()", // by default we simply proceed
        handleFullRequest: "kettle.request.ws.handleFullRequest"
    }
});

fluid.defaults("kettle.request.ws.mismatch", {
    gradeNames: ["kettle.request.ws", "kettle.request.mismatch"]
});

// This is handed the verifyClient callback from ws
kettle.request.ws.handleFullRequest = function (request, fullRequestPromise, verifyCallback) {
    fullRequestPromise.then(function () {
        request.events.onRequestSuccess.fire();
        verifyCallback(true);
    }, function (err) {
        // note that these onRequestXxxx events by default have no listeners on a ws request
        request.events.onRequestError.fire(err);
        // note that this message cannot be read by the standard client, but we send it anyway. The status code can be read ok
        verifyCallback(false, err.statusCode, err.message);
    });
};

kettle.request.ws.listen = function (that) {
    that.ws.on("message", function (message) {
        kettle.withRequest(that, function () {
            message = that.options.receiveMessageJSON ? kettle.JSON.parse(message) : message;
            that.events.onReceiveMessage.fire(that, message);
        })();
    });
};

/**
 * Ensure that the request object is cleared on socket diconnect.
 * @param  {Object} that Fluid request object.
 */
kettle.request.ws.ensureResponseDisposes = function (that) {
    that.ws.on("close", kettle.withRequest(that, function () {
        if (!fluid.isDestroyed(that)) {
            that.events.onRequestEnd.fire();
            that.destroy();
        }
    }));
};

kettle.request.ws.sendEncode = function (that, encode, data) {
    return encode ? JSON.stringify(data) : data;
};

kettle.request.ws.sendMessage = function (that, message) {
    var options = {}; // none currently supported
    var promise = fluid.promise.fireTransformEvent(that.events.onSendMessage, message, options);
    return promise;
};

kettle.request.ws.sendMessageImpl = function (that, message) {
    var promise = fluid.promise();
    that.ws.send(message, function (err) {
        promise[err ? "reject" : "resolve"](err);
    });
    return promise;
};

kettle.request.ws.sendTypedMessage = function (that, type, payload) {
    return that.sendMessage({
        type: type,
        payload: payload
    });
};
