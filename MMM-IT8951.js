/* Magic Mirror
 * Module: MMM-IT8951
 *
 * By Sébastien Mazzon
 * MIT Licensed.
 */

Module.register("MMM-IT8951", {

	defaults: {
		updateInterval: 60 * 1000, // 1 minute // Full refresh screen
		bufferDelay: 1000, // 1 second // Delay before taking updated items

		driverParam: {MAX_BUFFER_SIZE: 4096, ALIGN4BYTES: true, VCOM: 1480}, // see https://github.com/gaweee/node-it8951#functions-calls
		mock: false,
	},

	notificationReceived: function (notification, payload, sender) {
		if (notification === "DOM_OBJECTS_CREATED") {
			this.sendSocketNotification("CONFIG", this.config);
		} else if (notification === "IT8951_ASK_FULL_REFRESH") {
			this.sendSocketNotification("IT8951_ASK_FULL_REFRESH");
		}
	},
});
