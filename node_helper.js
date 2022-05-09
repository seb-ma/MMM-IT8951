/**
 * This MagicMirror² module communicates with a IT8951 card to display MagicMirror² on a e-ink screen using IT8951 drivers.
 * @module MMM-IT8951
 * @class NodeHelper
 * @see `README.md`
 * @author Sébastien Mazzon
 * @license MIT - @see `LICENCE.txt`
 */
"use strict";

const NodeHelper = require("node_helper");
const Log = require("logger");
const Puppeteer = require("puppeteer");
const IT8951 = require("node-it8951");
const Sharp = require("sharp");

module.exports = NodeHelper.create({

	/**
	 * URL of MagicMirror server
	 */
	url: (config.useHttps ? "https://" : "http://") + config.address + ":" + config.port + config.basePath,

	/**
	 * Indicates if driver was initialized
	 */
	isInitialized: false,

	/**
	 * Module config
	 * see `MMM-IT8951.default`
	 */
	config: {},

	/**
	 * Areas of screen to refresh
	 */
	stackAreas: [],

	/**
	 * Starts the node helper of the module
	 * @see `node_helper.start`
	 * @see <https://docs.magicmirror.builders/development/node-helper.html#start>
	 */
	start: function () {
		// Returns true if user running process is `root
		const isCurrentUserRoot = process.getuid() == 0; // UID 0 is always root

		Log.log("Starting node helper for: " + this.name);
		// Starts Puppeteer with IT8951 resolution
		(async () => {
			let puppeteerArgs = ["--disable-gpu"]; // Hack: sometimes puppeteer does not start if gpu is enabled
			if (isCurrentUserRoot()) {
				puppeteerArgs.push("--no-sandbox");
			}
			this.browser = await Puppeteer.launch({ args: puppeteerArgs });
			this.page = await this.browser.newPage();
			const url = this.url;
			await this.page.goto(url, { waitUntil: "load" });

			Log.log("Puppeteer launched on " + url);
		})();
	},

	/**
	 * Initializes IT8951 driver and adds observer on Puppeteer
	 */
	initializeEink: async function () {
		// Starts IT8951
		this.display = new IT8951(this.config.driverParam);
		if (!this.config.mock) {
			this.display.init();
			Log.log("IT8951 initialized");
		} else {
			this.display = {
				width: config.electronOptions.width ? config.electronOptions.width : 1872,
				height: config.electronOptions.height ? config.electronOptions.height : 1404,
			}
		}

		// Adjusts Puppeteer viewport
		await this.page.setViewport({ width: this.display.width, height: this.display.height, deviceScaleFactor: 1 });

		// Initialization is finished
		this.isInitialized = true;

		// Refreshes screen and registers DOM observer on Puppeteer browser
		await this.fullRefresh(true);
		if (typeof (this.config.bufferDelay) === "number") {
			await this.initObservers();
		}
	},

	/**
	 * [Browser function] Called by exposed function on Puppeteer browser
	 * Process DOM mutations.
	 * Waits the buffer delay before processing in order to process only 1 time each area that have multiple fast mutations
	 */
	processStack: async function () {
		// Waits before processing stack
		await new Promise(r => setTimeout(r, this.config.bufferDelay));
		let rectDone = [];
		while (this.stackAreas.length > 0) {
			const rect = this.stackAreas.shift();
			const rectStr = JSON.stringify(rect);
			// If this area was not processed in this row
			if (!rectDone.includes(rectStr)) {
				rectDone.push(rectStr);
				Log.debug("Display IT8951:", rectStr);
				const imageDesc = await this.captureScreen(rect);
				await this.displayIT8951(imageDesc);
			}
		}
	},

	/**
	 * [Browser function] Exposes function on Puppeteer browser
	 * Initializes a DOM mutation observer that retrieves modified areas in DOM
	 * And call exposed function that update the screen
	 */
	initObservers: async function () {
		/* puppeteerMutation */
		await this.page.exposeFunction("puppeteerMutation", (rect, hasClass4levels, hasClassNo4levels) => {
			// No full refresh running
			if (this.refreshTimeout) {
				if (hasClass4levels || this.config.defaultTo4levels && !hasClassNo4levels) {
					// Display immediately
					(async () => {
						const imageDesc = await this.captureScreen(rect);
						await this.displayIT8951(imageDesc, true);
					})();
				} else {
					// Adds the area to process
					this.stackAreas.push(rect);
					// If this is not currently processing
					if (this.stackAreas.length == 1) {
						this.processStack();
					}
				}
			}
		});

		/* Add MutationObserver on Puppeteer browser */
		await this.page.evaluate(() => {
			// Callback on mutations
			const observer = new MutationObserver((mutations, observer) => {
				const ceil32 = (x) => Math.ceil(x / 32) * 32;
				const floor32 = (x) => Math.floor(x / 32) * 32;

				var rect = { left: Number.MAX_SAFE_INTEGER, top: Number.MAX_SAFE_INTEGER, right: 0, bottom: 0 };
				for (const mutation of mutations) {
					rectMut = mutation.target.getBoundingClientRect();
					is4levels = (mutation.target.closest(".eink-4levels") !== null);
					isNo4levels = (mutation.target.closest(".no-eink-4levels") !== null);
					if (rectMut.width !== 0 && rectMut.height !== 0) {
						// Extends area to nearest pixels (with modulo 32 for left/right - hack needed because of some glitches at display)
						rect = {
							left: floor32(Math.min(rect.left, rectMut.left)),
							top: Math.floor(Math.min(rect.top, rectMut.top)),
							right: ceil32(Math.max(rect.right, rectMut.right)),
							bottom: Math.ceil(Math.max(rect.bottom, rectMut.bottom))
						};
					}
				}
				if (rect.left < rect.right && rect.top < rect.bottom) {
					const domRect = new DOMRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
					// Call exposed function
					puppeteerMutation(domRect, is4levels, isNo4levels);
				}
			});

			// Observes mutations in target
			const target = document.querySelector("body");
			observer.observe(target, { childList: true, subtree: true });
		});
	},

	/**
	 * Called when the MagicMirror² server receives a `SIGINT`
	 * Closes Puppeteer browser, clears screen and closes driver
	 * @see `node_helper.stop`
	 */
	stop: function () {
		// Stops Puppeteer
		(async () => {
			await this.browser.close();
		})();

		// Stops IT8951
		if (this.config.mock === false && this.display !== undefined) {
			this.display.clear();
			this.display.close();
		}
	},

	/**
	 * Returns counts on number of modules visibles, visibles with class "eink-4levels", visible with class no-eink-4levels.
	 * @returns {"nbModules": integer, "nbModules4levels": integer, "nbModulesNo4levels": integer}
	 */
	getNbVisibleModules: async function () {
		return await this.page.evaluate(() => {
			return {
				nbModules: MM.getModules().filter(m => !m.hidden).length,
				nbModules4levels: MM.getModules().withClass("eink-4levels").filter(m => !m.hidden).length,
				nbModulesNo4levels: MM.getModules().withClass("no-eink-4levels").filter(m => !m.hidden).length
			};
		});
	},

	/**
	 * Does a screenshot of browser then a full refresh of the e-ink screen
	 * @param {boolean} force16levels Force a refresh with 16 levels (useful to remove ghosting)
	 */
	fullRefresh: async function (force16levels = false) {
		const self = this;
		clearTimeout(this.refreshTimeout);
		// Cancels partial refresh
		this.stackAreas.length = 0;

		Log.log("Full refresh eink");
		const imageDesc = await this.captureScreen();

		const nbModules = await this.getNbVisibleModules();
		const is4levels = !force16levels && ((this.config.defaultTo4levels && nbModules.nbModulesNo4levels == 0) || (!this.config.defaultTo4levels && nbModules.nbModules == nbModules.nbModules4levels));
		await this.displayIT8951(imageDesc, is4levels);

		// Schedules next update
		this.refreshTimeout = setTimeout(function (self) {
			self.fullRefresh(false);
		}, this.config.updateInterval, self);
	},

	/**
	 * Returns a screenshot of an area on page browser
	 * @param {DOMRect} rect Area to screenshot or undefined for a full page screenshot
	 * @returns {Image, DOMRect} PNG and area of the screenshot
	 */
	captureScreen: async function (rect) {
		if (rect === undefined || rect === "") {
			// Default target if no parameter: full page
			rect = { x: 0, y: 0, width: this.display.width, height: this.display.height };
		}
		// Screenshot of the area in buffer
		const image = await this.page.screenshot({ type: "png", clip: rect });
		return { image: image, rect: rect };
	},

	/**
	 * Displays provided area from imageDesc onto e-ink screen
	 * @param {Image, DOMRect} imageDesc PNG and area of the screenshot
	 * @param {boolean} is4levels Indicates if area can be displayed with only 4 levels of gray
	 */
	displayIT8951: async function (imageDesc, is4levels) {
		// Display buffer
		if (!this.config.mock) {
			// Convert png to raw
			const data = await Sharp(imageDesc.image)
				// grayscale on 1 channel
				.gamma().greyscale().toColourspace("b-w")
				// output the raw pixels
				.raw()
				// data is a Buffer containing uint8 values (0-255)
				// with each byte representing one pixel
				.toBuffer({ resolveWithObject: false });

			if (is4levels !== true) {
				// Check if buffer may not be a B/W only
				is4levels = this.isBufferOnlyBW(data);
			}
			// A fast non-flashy update mode that can go from any gray scale color to black or white
			const DISPLAY_UPDATE_MODE_DU = 1;
			const DISPLAY_UPDATE_MODE_DU4 = 7;
			const display_mode = is4levels ? DISPLAY_UPDATE_MODE_DU4 : false;

			this.display.draw(this.downscale8bitsTo4bits(data, is4levels),
				imageDesc.rect.x, imageDesc.rect.y,
				imageDesc.rect.width, imageDesc.rect.height,
				display_mode);
		} else {
			this.inc = (this.inc === undefined) ? 0 : (this.inc + 1) % 200;
			await Sharp(imageDesc.image)
				// Apply equivalent transformation as for e-paper
				.gamma().greyscale().toColourspace("b-w")
				// 16 colors (shades of gray)
				.png({ colours: is4levels ? 4 : 16 })
				// Save file
				.toFile("/tmp/screenshot-" + this.inc + ".png");
		}
	},

	/**
	 * Converts a raw image from 8-bits/pixel to 4-bits/pixel keeping only the 4-high bits for each pixel
	 * If is4levels is true => value of each pixel is set to nearest level between the 4 levels
	 * @param {Buffer} buffer Buffer with raw image to process
	 * @param {*} is4levels Indicates if area can be displayed with only 4 levels of gray
	 * @returns {Buffer} Buffer with raw image with 4 bits for each pixel
	 */
	downscale8bitsTo4bits: function (buffer, is4levels) {
		let buffer4b = Buffer.alloc(buffer.length / 2);
		if (is4levels) {
			for (let i = 0; i < buffer.length / 2; i++) {
				// Iterates by 2 bytes. Get the 4-high bits of each byte
				// see https://www.waveshare.net/w/upload/c/c4/E-paper-mode-declaration.pdf for values to set
				// DU4: This mode supports transitions from any gray tone to gray tones 1, 6, 11, 16 (=> 0, 5, 10, 15)
				buffer4b[i] = (parseInt((buffer[2 * i] >> 4) / 5) * 5)
					| ((parseInt((buffer[(2 * i) + 1] >> 4) / 5) * 5) << 4);
			}
		} else {
			for (let i = 0; i < buffer.length / 2; i++) {
				// Iterate by 2 bytes. Get the 4-high bits of each byte
				buffer4b[i] = (buffer[2 * i] >> 4) | (buffer[(2 * i) + 1] & 0xF0);
			}
		}
		return buffer4b;
	},

	/**
	 * Returns true if the buffer has only black and white pixels
	 * @param {Buffer} buffer Buffer with raw image to check
	 * @returns {boolean} true the buffer is has only pixels black and white
	 */
	isBufferOnlyBW: function (buffer) {
		for (let i = 0; i < buffer.length; i++) {
			// Only checks the 4-high bits (the 4-low bits will be ignored when pixel will be converted to 16 gray-levels)
			const val = buffer[i] >> 4;
			if (val !== 0xF && val !== 0) {
				return false;
			}
		}
		return true;
	},

	/**
	 * This method is called when a socket notification arrives.
	 * @see `node_helper.socketNotificationReceived`
	 * @see <https://docs.magicmirror.builders/development/node-helper.html#socketnotificationreceived-function-notification-payload>
	 * @param {string} notification The identifier of the notification.
	 * @param {*} payload The payload of the notification.
	 */
	socketNotificationReceived: function (notification, payload) {
		if (!this.isInitialized && notification === "CONFIG") {
			// Initializes driver - payload contains config module
			this.config = payload;
			this.initializeEink();
		} else if (this.isInitialized && notification === "IT8951_ASK_FULL_REFRESH") {
			// Full refresh of screen
			const force16levels = (typeof payload !== 'boolean' || payload);
			this.fullRefresh(force16levels);
		}
	},

});
