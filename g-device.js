module.exports = function (RED) {
    const DEVICE_TYPES = require('./device-types.json');
    const DEVICE_TRAITS = require('./device-traits.json');

    function gDeviceInNode(config) {
        var thisNode = this;
        RED.nodes.createNode(thisNode, config);
        console.log('id', thisNode.id, thisNode.z);
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

        const context = thisNode.context().global.get("allDevices") || {};
        const deviceType = DEVICE_TYPES[config.deviceTypeKey];
        const deviceTraits = config.deviceTraitKey.map(key => DEVICE_TRAITS[key]);

        // Register devices
        thisNode.deviceNameList = config.deviceNames.split(',').map((name) => name.trim());
        thisNode.deviceNameList.forEach((name, index) => {
            console.log('id', thisNode.id);
            const deviceKey = `${thisNode.id}_${name}`;
            let attributes = {};

            try {
                attributes = JSON.parse(config.deviceAttributes || "{}");
            } catch (err) {
                thisNode.warn("JSON parse error for device attributes");
            }

            context[deviceKey] = {
                node: thisNode,
                name: name,
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
                    attributes: attributes,
                    name: {
                        name: name
                    },
                    willReportState: false
                }
            };
        });
        thisNode.context().global.set("allDevices", context);

        this.on('close', function () {
            const context = thisNode.context().global.get("allDevices") || {};
            thisNode.deviceNameList.forEach(name => {
                delete context[`${thisNode.id}_${name}`];
            });
            thisNode.context().global.set("allDevices", context);
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
