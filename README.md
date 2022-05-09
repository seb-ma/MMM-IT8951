# MMM-IT8951

This is a module for the [MagicMirror²](https://github.com/MichMich/MagicMirror/).

This module communicates with a IT8951 card to display MagicMirror² on a e-ink screen.
It opens MagicMirror² page on a Chrome browser (with Puppeteer) and observe each DOM update.
Periodically, the e-ink is fully refreshed and partially refreshed on DOM update.

Partial refresh is done in a flashy way by default (that is needed to support the 16 gray levels) but if image if only B/W (without gray), the refresh mode is changed to have a direct update without flash.
Another way to have a fast refresh without flash is by adding the CSS class `eink-4levels` to a module. Thus, the refresh is forced to 4-level gray only.

The IT8951 is typically used by some Waveshare e-paper screens.

## Using the module

To use this module, add the following configuration block to the modules array in the `config/config.js` file:

```js
var config = {
	modules: [
		{
			module: "MMM-IT8951",
			config: {
				updateInterval: 60 * 1000, // 1 minute // Full refresh screen
				bufferDelay: 1000, // 1 second // Delay before taking updated items
				defaultTo4levels: false,
				driverParam: { MAX_BUFFER_SIZE: 4096, VCOM: 1480 }, // see https://github.com/gaweee/node-it8951#functions-calls
				mock: false,
			},
		},
		{
			module: "foo", // One of your module you want to be refreshed in B/W only
			classes: "eink-4levels", // This class forces non flashy (but only on 4-levels gray) update of this module by MMM-IT8951 (only useful if defaultTo4levels == false)
		},
		{
			module: "bar", // One of your module you want to be refreshed in 16-levels of gray
			classes: "no-eink-4levels", // This class forces on 16-levels gray (but flashy) update of this module by MMM-IT8951 (only useful if defaultTo4levels == true)
		},
	]
}
```

To use a specific color within the 4 levels of gray, this colors can be defined in CSS and used:

```css
:root {
	/* Gray levels for IT8951 */
	--gray4levels-1: #fff;
	--gray4levels-2: #aaa;
	--gray4levels-3: #666;
	--gray4levels-4: #000;
}
```

## Installation

```sh
cd ~/MagicMirror/modules # Change path to modules directory of your actual MagiMirror² installation
git clone https://github.com/seb-ma/MMM-IT8951
cd MMM-IT8951
```

If nodejs version is compliant:

```
npm install --only=production
```

Else, a full install + rebuild dependency may be needed:

```
npm install; npm rebuild rpio --update-binary
```

### OS configuration related

To be able to communicate with IT8951 card, SPI must be activated and permissions to communicate with.

**On Raspberry OS:**

⚠️ Currently, this module only works with the `root` user; thus it needs MagicMirror to be launched by `root` user.

This is due to a problem accessing `/dev/mem`.
It currently can't be accessed thru npm call at this stage, neither as `sudo npm` nor with sticky bit or `cap_sys_rawio` capability set.

It works only with user `root` (`sudo su`).

*For future reference, here, what should work:*

```sh
sudo raspi-config
```

Then, enable SPI:
- Interfacing options
- P4 SPI Enable / Disable automatic loading of SPI core module

And add your user in `spi` group:

```sh
sudo adduser $USER spi
sudo adduser $USER kmem

```

## Configuration options

| Option			| Description
|------------------ |-------------
| `updateInterval`	| *Optional* Full refresh screen interval<br><br>**Type:** `int` (milliseconds)<br>Default: 60000 (1 minute)
| `bufferDelay`		| *Optional* Delay before taking updated items in DOM to refresh parts of screen (only applyied to no 4-levels parts. 4-levels parts are always instantly refreshed)<br><br>**Type:** `int` (milliseconds)<br>Default: 1000 (1 second)<br>Set `undefined` to ignore partial refresh, 0 to refresh immediately
| `defaultTo4levels`| *Optional* If `true`,  it consider all modules are on 4-levels gray unless modules having class "no-eink-4levels"<br>If `false`,  it consider all modules are on 16-levels gray unless modules having class "eink-4levels"<br><br>**Type:** `boolean`<br>Default: `false`
| `driverParam`		| *Optional* Parameter to initialize IT8951 driver. See https://github.com/gaweee/node-it8951#functions-calls<br>Default: `{MAX_BUFFER_SIZE: 4096, ALIGN4BYTES: true, VCOM: 1480}`
| `mock`			| *Optional* `true` to retrieve not initialize IT8951 driver and store png files of changed areas in `/tmp` instead<br><br>**Type:** `boolean`<br>Default: `false`

## Notifications

To force a full refresh of the e-ink screen, the notification `IT8951_ASK_FULL_REFRESH` must be sent.
Payload can be set to force a refresh with 4-levels (`false`) or 16-levels (`undefined` or `true`).

Example to send it from another module:

```js
// Refresh with 16-levels
this.sendNotification("IT8951_ASK_FULL_REFRESH");
// […]

// Refresh with 16-levels
this.sendNotification("IT8951_ASK_FULL_REFRESH", true);
// […]

// Refresh with 4-levels
this.sendNotification("IT8951_ASK_FULL_REFRESH", false);
// […]
```
