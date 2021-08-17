let lastAuthToken = undefined;

module.exports = function (RED) {
    const crypto = require('crypto');

    var httpMiddleware = function (req, res, next) { next(); }
    if (RED.settings.httpNodeMiddleware) {
        if (typeof RED.settings.httpNodeMiddleware === "function" || Array.isArray(RED.settings.httpNodeMiddleware)) {
            httpMiddleware = RED.settings.httpNodeMiddleware;
        }
    }

    var corsHandler = function (req, res, next) { next(); }
    if (RED.settings.httpNodeCors) {
        corsHandler = cors(RED.settings.httpNodeCors);
        RED.httpNode.options("*", corsHandler);
    }

    function gConfig(config) {
        const thisNode = this;
        RED.nodes.createNode(thisNode, config);

        if (!config.clientID) {
            thisNode.warn("Missing client id");
            return;
        }
        if (!config.clientSecret) {
            thisNode.warn("Missing client secret");
            return;
        }

        this.errorHandler = function (err, req, res, next) {
            node.warn(err);
            res.sendStatus(500);
        };

        this.callbackAuth = function (req, res) {
            console.log(req);
            console.log(req.query);

            if (req.query.client_id !== config.clientID) {
                res.sendStatus(401);
                return;
            }

            if (req.query.response_type !== 'code') {
                res.sendStatus(500);
                return;
            }

            crypto.randomBytes(48, function (err, buffer) {
                lastAuthToken = buffer.toString('hex');
                res.redirect(req.query.redirect_uri + `?code=${lastAuthToken}&state=${req.query.state}`);
            });
        };

        this.callbackToken = function (req, res) {
            if (!req.headers.authorization) {
                res.sendStatus(401);
                return;
            }

            console.log(req);
        };

        // Should require full html login for user to confirm access
        RED.httpNode.get('/googlehome/authorize', httpMiddleware, corsHandler, this.callbackAuth, this.errorHandler);
        // Requires token returned in authorize step
        RED.httpNode.get('/googlehome/token', httpMiddleware, corsHandler, this.callbackToken, this.errorHandler);
    }
    RED.nodes.registerType("gConfig", gConfig);
}
