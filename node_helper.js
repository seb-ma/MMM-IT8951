/* Magic Mirror
 * Node Helper: MMM-IT8951
 *
 * By Sébastien Mazzon
 * MIT Licensed.
 */

const NodeHelper = require("node_helper");
const Log = require("logger");
const Puppeteer = require("puppeteer");
const IT8951 = require("node-it8951");
const Sharp = require("sharp");

module.exports = NodeHelper.create({

	url: (config.useHttps ? "https://" : "http://") + config.address + ":" + config.port + config.basePath,
	isInitialized: false,
	config: {},
	stackAreas: [],

	isCurrentUserRoot: function () {
		return process.getuid() == 0; // UID 0 is always root
	},

	start: function () {
		Log.log("Starting node helper for: " + this.name);
		// Start Puppeteer with IT8951 resolution
		(async () => {
			let puppeteerArgs = ["--disable-gpu"]; // Hack: sometimes puppeteer does not start if gpu is enabled
			if (this.isCurrentUserRoot()) {
				puppeteerArgs.push("--no-sandbox");
			}
			this.browser = await Puppeteer.launch({ args: puppeteerArgs });
			this.page = await this.browser.newPage();
			const url = this.url;
			await this.page.goto(url, { waitUntil: "load" });

			Log.log("Puppeteer launched on " + url);
		})();
	},

	initializeEink: function () {
		// Start IT8951
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

		// Adjust Puppeteer viewport
		(async () => {
			await this.page.setViewport({ width: this.display.width, height: this.display.height, deviceScaleFactor: 1 });
		})();

		// Initialisation is finished
		this.isInitialized = true;

		this.fullRefresh();
		if (typeof (this.config.bufferDelay) === "number") {
			(async () => {
				await this.initObservers();
			})();
		}
	},

	// Process DOM mutations. Wait the buffer delay before processing in order to process only 1 time each area that have multiple fast mutations
	processStack: async function () {
		// Wait before processing stack
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

	initObservers: async function () {
		await this.page.exposeFunction("puppeteerMutation", (rect, is4levels) => {
			if (is4levels) {
				// Display immediately
				(async () => {
					const imageDesc = await this.captureScreen(rect);
					await this.displayIT8951(imageDesc, is4levels);
				})();
			} else {
				// Add the area to process
				this.stackAreas.push(rect);
				// If this is not currently processing
				if (this.stackAreas.length == 1) {
					this.processStack();
				}
			}
		});

		await this.page.evaluate(() => {
			// Callback on mutations
			const observer = new MutationObserver((mutations, observer) => {
				const ceil32 = function (x) { return Math.ceil(x / 32) * 32; };
				const floor32 = function (x) { return Math.floor(x / 32) * 32; };

				var rect = { left: Number.MAX_SAFE_INTEGER, top: Number.MAX_SAFE_INTEGER, right: 0, bottom: 0 };
				for (const mutation of mutations) {
					rectMut = mutation.target.getBoundingClientRect();
					is4levels = (mutation.target.closest(".eink-4levels") !== null);
					if (rectMut.width !== 0 && rectMut.height !== 0) {
						// Extends area to nearest pixels (with modulo 32 for left/right - hack needed because of some glitches at display)
						rect = {
							left: floor32(Math.min(rect.left, rectMut.left)), top: Math.floor(Math.min(rect.top, rectMut.top)),
							right: ceil32(Math.max(rect.right, rectMut.right)), bottom: Math.ceil(Math.max(rect.bottom, rectMut.bottom))
						};
					}
				}
				if (rect.left < rect.right && rect.top < rect.bottom) {
					puppeteerMutation(new DOMRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top), is4levels);
				}
			});

			// Observe mutation in target
			const target = document.querySelector("body");
			observer.observe(target, { childList: true, subtree: true });
		});
	},

	stop: function () {
		// Stop Puppeteer
		(async () => {
			await this.browser.close();
		})();

		// Stop IT8951
		if (this.config.mock === false && this.display !== undefined) {
			this.display.clear();
			this.display.close();
		}
	},

	fullRefresh: function () {
		self = this;
		clearTimeout(this.refreshTimeout);

		Log.log("Full refresh eink");
		(async () => {
			const imageDesc = await this.captureScreen();
			await this.displayIT8951(imageDesc);
		})();

		// Schedule next update
		this.refreshTimeout = setTimeout(function (self) {
			self.fullRefresh();
		}, this.config.updateInterval, self);
	},

	// rect may not be defined for a full page screenshot
	captureScreen: async function (rect) {
		if (rect === undefined || rect === "") {
			// Default target if no parameter: full page
			rect = { x: 0, y: 0, width: this.display.width, height: this.display.height };
		}
		// Screenshot of the area in buffer
		const image = await this.page.screenshot({ type: "png", clip: rect });
		return { image: image, rect: rect };
	},

	displayIT8951: async function (imageDesc, is4levels) {
		// Display buffer
		if (!this.config.mock) {
			// Convert png to raw
			const { data, info } = await Sharp(imageDesc.image)
				// greyscale on 1 channel
				.gamma().greyscale().toColourspace("b-w")
				// output the raw pixels
				.raw()
				// data is a Buffer containing uint8 values (0-255)
				// with each byte representing one pixel
				.toBuffer({ resolveWithObject: true });

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
				// 16 colors (shades of grey)
				.png({ colours: is4levels ? 4 : 16 })
				// Save file
				.toFile("/tmp/screenshot-" + this.inc + ".png");
		}
	},

	downscale8bitsTo4bits: function (buffer, is4levels) {
		let buffer4b = Buffer.alloc(buffer.length / 2);
		if (is4levels) {
			for (let i = 0; i < buffer.length / 2; i++) {
				// Iterate by 2 bytes. Get the 4-high bits of each byte
				// see https://www.waveshare.net/w/upload/c/c4/E-paper-mode-declaration.pdf for values to set
				// DU4: This mode supports transitions from any gray tone to gray tones 1,6,11,16 (=> 0, 5, 10, 15)
				buffer4b[i] = ((((buffer[2 * i] >> 4) % 4) * 5) << 4)
					| (((buffer[(2 * i) + 1] >> 4) % 4) * 5);
			}
		} else {
			for (let i = 0; i < buffer.length / 2; i++) {
				// Iterate by 2 bytes. Get the 4-high bits of each byte
				buffer4b[i] = (buffer[2 * i] & 0xF0) | (buffer[(2 * i) + 1] >> 4);
			}
		}
		return buffer4b;
	},

	isBufferOnlyBW: function (buffer) {
		for (let i = 0; i < buffer.length; i++) {
			// Only check the 4-high bits (the 4-low bits will be ignored when pixel will converted to 16 gray-levels)
			const val = buffer[i] >> 4;
			if (val !== 0xF && val !== 0) {
				return false;
			}
		}
		return true;
	},

	// Override socketNotificationReceived method.
	socketNotificationReceived: function (notification, payload) {
		if (!this.isInitialized && notification === "CONFIG") {
			this.config = payload;
			this.initializeEink();
		} else if (this.isInitialized && notification === "IT8951_ASK_FULL_REFRESH") {
			this.fullRefresh();
		}
	},
});
