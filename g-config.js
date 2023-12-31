const { fail } = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const FILE_PATH = 'google-home-oauth-tokens.json';
const INTENT_SYNC = 'action.devices.SYNC';
const INTENT_QUERY = 'action.devices.QUERY';
const INTENT_EXECUTE = 'action.devices.EXECUTE';

let lastAuthToken = undefined;

function getLastRefreshToken(clientID) {
    if (!fs.existsSync(FILE_PATH)) {
        fs.writeFileSync(FILE_PATH, '{}');
    }

    const data = fs.readFileSync(FILE_PATH, function (err, data) {
        if (err) {
            console.error(err);
            return;
        }
    });

    let tokens = JSON.parse(data) || {};
    return tokens[clientID].refresh_token || undefined;
}

function getLastAccessToken(clientID) {
    if (!fs.existsSync(FILE_PATH)) {
        fs.writeFileSync(FILE_PATH, '{}');
    }

    const data = fs.readFileSync(FILE_PATH, function (err, data) {
        if (err) {
            console.error(err);
            return;
        }
    });

    let tokens = JSON.parse(data) || {};

    if (tokens[clientID].expires_at < Date.now()) {
        return undefined;
    }

    return tokens[clientID].access_token || undefined;
}

function generateAccessToken(clientID, refreshOnly = false) {
    if (!fs.existsSync(FILE_PATH)) {
        fs.writeFileSync(FILE_PATH, '{}');
    }

    const data = fs.readFileSync(FILE_PATH, function (err, data) {
        if (err) {
            console.error(err);
            return;
        }
    });

    let tokens = JSON.parse(data) || {};
    let fullToken = {
        token_type: 'Bearer',
        access_token: crypto.randomBytes(48).toString('hex'),
        expires_in: 60 * 60,
        expires_at: Date.now() + 1000 * 60 * 60
    };

    if (refreshOnly) {
        fullToken.refresh_token = tokens[clientID].refresh_token;
    } else {
        // Generate token
        fullToken.refresh_token = crypto.randomBytes(48).toString('hex');
    }
    tokens[clientID] = fullToken;

    fs.writeFile(FILE_PATH, JSON.stringify(tokens), function (err) {
        if (err) console.error(err);
    });

    return fullToken;
}

module.exports = function (RED) {
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
            thisNode.warn(err);
            res.sendStatus(500);
        };

        this.callbackAuth = function (req, res) {
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

                console.log(req.query.redirect_uri + `?code=${lastAuthToken}&state=${req.query.state}`);
                res.redirect(req.query.redirect_uri + `?code=${lastAuthToken}&state=${req.query.state}`);
            });
        };

        this.callbackToken = function (req, res) {
            if (!req.body || !req.body.grant_type) {
                res.sendStatus(401);
                thisNode.warn("Token request missing grant_type");
                return;
            }
            if (req.body.client_id !== config.clientID || req.body.client_secret !== config.clientSecret) {
                res.sendStatus(401);
                thisNode.warn("Token request missing client id/secret");
                return;
            }

            if (req.body.grant_type === 'authorization_code') {
                if (req.body.code !== lastAuthToken) {
                    res.sendStatus(401);
                    thisNode.warn("Token request not matching last auth token");
                    return;
                }

                res.send(generateAccessToken(config.clientID, false));
            }

            if (req.body.grant_type === 'refresh_token') {
                const lastRefreshToken = getLastRefreshToken(config.clientID);

                if (!lastRefreshToken || req.body.refresh_token !== lastRefreshToken) {
                    res.sendStatus(401);
                    thisNode.warn("Token request not matching last refresh token");
                    return;
                }

                res.send(generateAccessToken(config.clientID, true));
            }
        };

        this.callbackFulfillment = function (req, res) {
            const lastAccessToken = getLastAccessToken(config.clientID);
            if (!lastAccessToken || !req.headers.authorization || req.headers.authorization !== `Bearer ${lastAccessToken}`) {
                thisNode.warn("Fulfillment request not matching last access token");
                res.sendStatus(401);
                return;
            }

            console.log("Fulfillment: ", JSON.stringify(req.body));
            const context = thisNode.context().global.get("allDevices") || {};
            const intent = req.body.inputs[0].intent;
            if (intent === INTENT_SYNC) {
                let response = {
                    requestId: req.body.requestId,
                    payload: {
                        agentUserId: thisNode.id,
                        devices: Object.keys(context).map(key => { return context[key].sync })
                    }
                }

                console.log(JSON.stringify(response));
                res.send(response);
                return;
            } else if (intent === INTENT_QUERY) {
                const payload = req.body.inputs[0].payload;
                const deviceStates = {};

                payload.devices.forEach(device => {
                    deviceStates[device.id] = {
                        online: !!context[device.id],
                        status: !!context[device.id] ? 'SUCCESS' : 'OFFLINE'
                        // More status data can be added
                        // ...
                    }
                })

                let response = {
                    requestID: req.body.requestId,
                    payload: {
                        devices: deviceStates
                    }
                }
                res.send(response);
                return;
            } else if (intent === INTENT_EXECUTE) {
                const payload = req.body.inputs[0].payload;
                const succeedIDs = [];
                const failIDs = [];

                payload.commands.forEach(command => {
                    command.devices.forEach(device => {
                        const storedDevice = context[device.id];
                        if (storedDevice) {
                            succeedIDs.push(device.id);

                            command.execution.forEach(exec => {
                                storedDevice.sendMsg({
                                    payload: exec,
                                    topic: storedDevice.name
                                    // Include a callback method to complete the response and record statuses
                                })
                            })
                        } else {
                            failIDs.push(device.id);
                        }
                    })
                });

                let response = {
                    requestID: req.body.requestId,
                    payload: {
                        commands: [{
                            ids: succeedIDs,
                            status: 'SUCCESS'
                        }, {
                            ids: failIDs,
                            status: 'OFFLINE',
                            states: {
                                online: false
                            }
                        }]
                    }
                };
                res.send(response);
                return;
            }

            res.send();
        }

        // Should require full html login for user to confirm access
        RED.httpNode.get('/googlehome/authorize', this.callbackAuth);
        // Requires token returned in authorize step
        RED.httpNode.post('/googlehome/token', this.callbackToken);
        RED.httpNode.post('/googlehome/fulfillment', this.callbackFulfillment);
    }
    RED.nodes.registerType("gConfig", gConfig);
}
