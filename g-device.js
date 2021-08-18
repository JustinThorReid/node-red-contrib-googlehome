module.exports = function (RED) {
    const DEVICE_TYPES = require('./device-types.json');
    const DEVICE_TRAITS = require('./device-traits.json');

    function gDeviceInNode(config) {
        const thisNode = this;
        RED.nodes.createNode(thisNode, config);

        if (!config.oauthConfig) {
            thisNode.warn("Missing config node");
            return;
        }
        if (!config.deviceTypeKey) {
            thisNode.warn("Missing device type");
            return;
        }
        if (!config.deviceTraitKey) {
            thisNode.warn("Missing device traits");
            return;
        }
        if (!config.deviceNames) {
            thisNode.warn("Missing device name");
            return;
        }

        this.oauthNode = RED.nodes.getNode(config.oauthConfig);
        const deviceType = DEVICE_TYPES[config.deviceTypeKey];
        const deviceTraits = config.deviceTraitKey.map(key => DEVICE_TRAITS[key]);

        // Register devices
        thisNode.deviceNameList = config.deviceNames.split(',').map((name) => name.trim());
        thisNode.deviceNameList.forEach((name, index) => {
            const deviceKey = `${thisNode.id}_${name}`;
            thisNode.oauthNode.allDevices[deviceKey] = {
                node: thisNode,
                sendMsg: (payload) => {
                    thisNode.send(thisNode.deviceNameList.map(nameToSend => {
                        if (nameToSend === name) {
                            return payload;
                        } else {
                            return null;
                        }
                    }));
                },
                sync: {
                    id: deviceKey,
                    type: deviceType.googleKey,
                    traits: deviceTraits.map(trait => trait.googleKey),
                    name: {
                        name: name
                    },
                    willReportState: false
                }
            };
        });
        this.on('close', function () {
            thisNode.deviceNameList.forEach(name => {
                delete thisNode.oauthNode.allDevices[`${thisNode.id}_${name}`];
            });
        });

    }
    RED.nodes.registerType("gDevice", gDeviceInNode);

    RED.httpAdmin.get('/googlehome/deviceTypes', function (req, res) {
        res.send(DEVICE_TYPES);
    });
    RED.httpAdmin.get('/googlehome/deviceTraits', function (req, res) {
        res.send(DEVICE_TRAITS);
    });
}
