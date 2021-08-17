const allDevices = {};

module.exports = function (RED) {
    const DEVICE_TYPES = require('./device-types.json');
    const DEVICE_TRAITS = require('./device-traits.json');

    function gDeviceInNode(config) {
        const thisNode = this;
        RED.nodes.createNode(thisNode, config);

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

        const devicetype = DEVICE_TYPES[config.deviceTypeKey];

        // Register devices
        thisNode.deviceNameList = config.deviceNames.split(',').map((name) => name.trim());
        thisNode.deviceNameList.forEach(name => {
            allDevices[`${thisNode.id}_${name}`] = thisNode;
        });
        this.on('close', function () {
            thisNode.deviceNameList.forEach(name => {
                delete allDevices[`${thisNode.id}_${name}`];
            });
        });

        this.send()
    }
    RED.nodes.registerType("gDevice", gDeviceInNode);

    RED.httpAdmin.get('/googlehome/deviceTypes', function (req, res) {
        res.send(DEVICE_TYPES);
    });
    RED.httpAdmin.get('/googlehome/deviceTraits', function (req, res) {
        res.send(DEVICE_TRAITS);
    });
}
