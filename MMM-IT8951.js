/**
 * This MagicMirror² module communicates with a IT8951 card to display MagicMirror² on a e-ink screen using IT8951 drivers.
 * @module MMM-IT8951
 * @class Module
 * @see `README.md`
 * @author Sébastien Mazzon
 * @license MIT - @see `LICENCE.txt`
 */
"use strict";

Module.register("MMM-IT8951", {

	/**
	 * Default properties of the module
	 * @see `module.defaults`
	 * @see <https://docs.magicmirror.builders/development/core-module-file.html#defaults>
	 */
	defaults: {
		/* Display configuration */
		updateInterval: 60 * 1000,	// Full refresh screen interval - default to 1 minute
		bufferDelay: 1000,			// Delay before accounting updated items that have not an instant refresh rate on screen - default to 1 second
		defaultTo4levels: false,

		/* Driver configuration */
		mock: false,	// Use a true IT8951 card or mock interface
		driverParam: { MAX_BUFFER_SIZE: 4096, ALIGN4BYTES: true, VCOM: 1480 }, // see https://github.com/gaweee/node-it8951#functions-calls
	},

	/**
	 * Called by the MagicMirror² core when a notification arrives.
	 *
	 * @param {string} notification The identifier of the notification.
	 * @param {*} payload The payload of the notification.
	 * @param {Module} sender The module that sent the notification.
	 */
	notificationReceived: function (notification, payload, sender) {
		if (notification === "DOM_OBJECTS_CREATED") {
			// Initializes node helper
			this.sendSocketNotification("CONFIG", this.config);
		} else if (notification === "IT8951_ASK_FULL_REFRESH") {
			// Full refresh of screen (payload is a boolean to have update screen with the 16-levels)
			this.sendSocketNotification(notification, payload);
		}
	},

	/**
	 * Returns the CSS files adding gray levels to root
	 * @see `module.getStyles`
	 * @see <https://docs.magicmirror.builders/development/core-module-file.html#getstyles>
	 * @returns {Array}
	 */
	getStyles: function () {
		return [`${this.name}.css`];
	},
});
