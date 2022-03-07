# MMM-IT8951

This is a module for the [MagicMirror²](https://github.com/MichMich/MagicMirror/).

This module communicates with a IT8951 card to display MagicMirror² on a e-ink screen.
It opens MagicMirror² page on a Chrome browser (with Puppeteer) and observe each DOM update.
Periodically, the e-ink is fully refreshed and partially refreshed on DOM update.

The IT8951 is typically used by some Waveshare epaper screens.

## Using the module

To use this module, add the following configuration block to the modules array in the `config/config.js` file:
```js
var config = {
    modules: [
        {
            module: 'MMM-IT8951',
            config: {
            updateInterval: 60 * 1000, // 1 minute // Full refresh screen
            bufferDelay: 1000, // 1 second // Delay before taking updated items
            driverParam: {MAX_BUFFER_SIZE: 4096, ALIGN4BYTES: true, VCOM: 1480}, // see https://github.com/gaweee/node-it8951#functions-calls
            mock: false,
        },
    ]
}
```

## Configuration options

| Option           | Description
|----------------- |------------
| `updateInterval` | *Optional* Full refresh screen interval <br><br>**Type:** `int`(milliseconds) <br>Default: 60000 (1 minute)
| `bufferDelay`    | *Optional* Delay before taking updated items in DOM to refresh parts of screen <br><br>**Type:** `int`(milliseconds) <br>Default: 1000 (1 second)
| `driverParam`    | *Optional* Parameter to initialize IT8951 driver. See https://github.com/gaweee/node-it8951#functions-calls <br>Default: `{MAX_BUFFER_SIZE: 4096, ALIGN4BYTES: true, VCOM: 1480}`
| `mock`           | *Optional* `true` to retrieve not initialize IT8951 driver and store png files of changed areas in `/tmp` instead<br><br>**Type:** `boolean` <br>Default: `false`

## Notifications

To force a full refresh of the e-ink screen, the notification `IT8951_ASK_FULL_REFRESH` must be sent.

Exemple to send it from another module:
```js
this.sendNotification("IT8951_ASK_FULL_REFRESH");
```
